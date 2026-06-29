import { describe, expect, it } from 'vitest';
import { writeFileSync, mkdtempSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { parseFile } from '@usebrick/engine';
import { extractFacts } from '../../../src/engine/visitor';
import { aiConsoleDebugStormRule } from '../../../src/rules/ai/console-debug-storm';
import type { Issue, ResolvedConfig, RuleContext } from '../../../src/types';

function makeConfig(overrides?: Partial<ResolvedConfig>): ResolvedConfig {
  return {
    include: [],
    exclude: [],
    rules: {},
    frameworkMultipliers: {},
    ruleConfig: {},
    arbitraryValueAllowlist: [],
    wcag: { targetSizeExemptSelectors: [] },
    thresholds: { meanSlop: 0, p90Slop: 0, individualSlopThreshold: 0 },
    ...overrides,
  };
}

async function runRule(source: string, fileName = 'service.ts'): Promise<Issue[]> {
  const dir = mkdtempSync(join(tmpdir(), 'slopbrick-console-debug-storm-test-'));
  try {
    const filePath = join(dir, fileName);
    writeFileSync(filePath, source);
    const { ast, source: parsedSource } = await parseFile(filePath);
    const facts = extractFacts(filePath, ast, parsedSource);
    const context: RuleContext = { config: makeConfig(), filePath, cwd: dir };
    const ruleContext = aiConsoleDebugStormRule.create(context);
    return aiConsoleDebugStormRule.analyze(ruleContext, facts);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

// Each console.log line is ~38 chars; ~30 such lines + outer boilerplate puts us
// safely above the 1000-byte MIN_FILE_SIZE gate.
function buildStormSource(prefix = ''): string {
  const lines: string[] = [`${prefix}export function doWork(input: number): number {`];
  for (let i = 0; i < 30; i++) {
    lines.push(`  console.log('debug step ${i} value=' + String(input));`);
  }
  lines.push(`  return input * 2;`, `}`);
  return lines.join('\n');
}

describe('ai/console-debug-storm', () => {
  it('flags >=10 console.* calls with no structured logger', async () => {
    const source = buildStormSource();
    expect(source.length).toBeGreaterThan(1000);
    const issues = await runRule(source);
    expect(issues.length).toBeGreaterThanOrEqual(1);
    expect(issues[0].ruleId).toBe('ai/console-debug-storm');
    expect(issues[0].aiSpecific).toBe(true);
  });

  it('does not flag when a structured logger is imported', async () => {
    const head = [`import pino from 'pino';`, `const logger = pino();`].join('\n');
    const source = head + '\n' + buildStormSource();
    expect(source.length).toBeGreaterThan(1000);
    const issues = await runRule(source);
    expect(issues).toHaveLength(0);
  });

  it('does not flag files with fewer than 10 console calls', async () => {
    const lines: string[] = ['export function doWork(input: number): number {'];
    for (let i = 0; i < 9; i++) {
      lines.push(`  console.log('step ${i}', input);`);
    }
    lines.push(`  return input * 2;`, `}`);
    const source = lines.join('\n');
    const issues = await runRule(source);
    expect(issues).toHaveLength(0);
  });

  it('does not flag .test.ts files (test files legitimately use console)', async () => {
    const source = buildStormSource();
    const issues = await runRule(source, 'service.test.ts');
    expect(issues).toHaveLength(0);
  });
});
