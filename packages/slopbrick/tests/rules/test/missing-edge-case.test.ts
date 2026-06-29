import { describe, expect, it } from 'vitest';
import { writeFileSync, mkdtempSync, rmSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { missingEdgeCaseRule } from '../../../src/rules/test/missing-edge-case';
import type { Issue, ResolvedConfig, RuleContext } from '../../../src/types';

function makeConfig(opts?: { missingEdgeCase?: boolean }): ResolvedConfig {
  return {
    include: [],
    exclude: [],
    rules: {},
    frameworkMultipliers: {},
    ruleConfig: {},
    arbitraryValueAllowlist: [],
    wcag: { targetSizeExemptSelectors: [] },
    thresholds: { meanSlop: 0, p90Slop: 0, individualSlopThreshold: 0 },
    spacingScale: [],
    radiusScale: [],
    testIntelligence: { missingEdgeCase: opts?.missingEdgeCase ?? false },
  };
}

async function runInline(
  source: string,
  cwd: string,
  opts?: { missingEdgeCase?: boolean; fileName?: string },
): Promise<Issue[]> {
  const filePath = join(cwd, opts?.fileName ?? 'lib.ts');
  writeFileSync(filePath, source);
  // Dynamic import so test file mirrors the production rule's SWC usage.
  const { parseFile } = await import('@usebrick/engine');
  const { extractFacts } = await import('../../../src/engine/visitor');
  const { ast, source: parsedSource } = await parseFile(filePath);
  const facts = extractFacts(filePath, ast, parsedSource);
  const config = makeConfig(opts);
  const context: RuleContext = { config, filePath, cwd };
  const ruleContext = missingEdgeCaseRule.create(context);
  return missingEdgeCaseRule.analyze(ruleContext, facts);
}

function makeDir(): string {
  const dir = mkdtempSync(join(tmpdir(), 'slopbrick-mec-'));
  mkdirSync(join(dir, 'src'), { recursive: true });
  return dir;
}

describe('test/missing-edge-case', () => {
  it('does nothing when the opt-in flag is false (default)', async () => {
    const dir = makeDir();
    try {
      const issues = await runInline(
        `export function foo(x) { if (x > 0) return 'pos'; else return 'neg'; }`,
        dir,
        { missingEdgeCase: false },
      );
      expect(issues).toHaveLength(0);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('fires on an uncovered function with branches when opt-in is enabled', async () => {
    const dir = makeDir();
    try {
      const issues = await runInline(
        `export function calc(price, user) {
          if (user && user.tier === 'gold') {
            return price * 0.2;
          } else {
            return 0;
          }
        }`,
        dir,
        { missingEdgeCase: true },
      );
      expect(issues.length).toBeGreaterThanOrEqual(2);
      expect(issues.every((i) => i.ruleId === 'test/missing-edge-case')).toBe(true);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('does NOT fire on test files themselves', async () => {
    const dir = makeDir();
    try {
      const issues = await runInline(
        `it('a', () => { if (true) return 1; else return 2; });`,
        dir,
        { missingEdgeCase: true, fileName: 'foo.test.ts' },
      );
      expect(issues).toHaveLength(0);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('fires for ternary, ??, and try/catch branches', async () => {
    const dir = makeDir();
    try {
      const issues = await runInline(
        `export function doWork(input) {
          const label = input > 0 ? 'pos' : 'neg';
          const value = input ?? 0;
          try {
            return label + value;
          } catch (err) {
            return null;
          }
        }`,
        dir,
        { missingEdgeCase: true },
      );
      const messages = issues.map((i) => i.message).join(' ');
      expect(messages).toContain('ternary');
      expect(messages).toContain('nullish-coalesce');
      expect(messages).toContain('catch');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('suppresses branches for functions mentioned in test files (cross-file correlation)', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'slopbrick-mec-cross-'));
    // Use a discoverable layout: src/lib.ts (production) + src/lib.test.ts (test).
    mkdirSync(join(dir, 'src'), { recursive: true });
    try {
      // Production file with branches inside `doStuff`.
      writeFileSync(
        join(dir, 'src', 'lib.ts'),
        `export function doStuff(x) {
          if (x > 0) return 'pos';
          else return 'neg';
        }`,
      );
      // Test file that mentions `doStuff` — covers it.
      writeFileSync(
        join(dir, 'src', 'lib.test.ts'),
        `import { doStuff } from './lib';
        it('returns pos', () => { expect(doStuff(1)).toBe('pos'); });`,
      );
      const { parseFile } = await import('@usebrick/engine');
      const { extractFacts } = await import('../../../src/engine/visitor');
      const filePath = join(dir, 'src', 'lib.ts');
      const { ast, source: parsedSource } = await parseFile(filePath);
      const facts = extractFacts(filePath, ast, parsedSource);
      const context: RuleContext = {
        config: makeConfig({ missingEdgeCase: true }),
        filePath,
        cwd: dir,
      };
      const ruleContext = missingEdgeCaseRule.create(context);
      const issues = missingEdgeCaseRule.analyze(ruleContext, facts);
      // doStuff is covered — no issues for it.
      expect(issues.every((i) => !i.message.includes('doStuff'))).toBe(true);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('caps per-file issues at 20 (MAX_PER_FILE)', async () => {
    const dir = makeDir();
    try {
      // Generate a function with 25 branches.
      const branches = Array.from(
        { length: 25 },
        (_, i) => `if (x === ${i}) return ${i};`,
      ).join('\n');
      const issues = await runInline(
        `export function manyBranches(x) { ${branches} return -1; }`,
        dir,
        { missingEdgeCase: true },
      );
      expect(issues.length).toBeLessThanOrEqual(20);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('severity is high and aiSpecific is true', async () => {
    const dir = makeDir();
    try {
      const issues = await runInline(
        `export function f(x) { if (x) return 1; else return 0; }`,
        dir,
        { missingEdgeCase: true },
      );
      expect(issues[0]?.severity).toBe('high');
      expect(issues[0]?.aiSpecific).toBe(true);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});