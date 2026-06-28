import { describe, expect, it } from 'vitest';
import { writeFileSync, mkdtempSync, rmSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { parseFile } from '@usebrick/engine';
import { extractFacts } from '../../../src/engine/visitor';
import { weakAssertionRule } from '../../../src/rules/test/weak-assertion';
import type { Issue, ResolvedConfig, RuleContext } from '../../../src/types';

function makeConfig(): ResolvedConfig {
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
  };
}

async function runRuleFromFixture(
  fixturePath: string,
): Promise<Issue[]> {
  const dir = mkdtempSync(join(tmpdir(), 'slopbrick-weak-assert-'));
  try {
    const filePath = join(dir, 'Component.test.ts');
    const fixtureSource = readFileSync(fixturePath, 'utf-8');
    writeFileSync(filePath, fixtureSource);
    const { ast, source: parsedSource } = await parseFile(filePath);
    const facts = extractFacts(filePath, ast, parsedSource);
    const context: RuleContext = { config: makeConfig(), filePath, cwd: dir };
    const ruleContext = weakAssertionRule.create(context);
    return weakAssertionRule.analyze(ruleContext, facts);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

async function runInline(
  source: string,
  fileName = 'Component.test.ts',
): Promise<Issue[]> {
  const dir = mkdtempSync(join(tmpdir(), 'slopbrick-weak-assert-'));
  try {
    const filePath = join(dir, fileName);
    writeFileSync(filePath, source);
    const { ast, source: parsedSource } = await parseFile(filePath);
    const facts = extractFacts(filePath, ast, parsedSource);
    const context: RuleContext = { config: makeConfig(), filePath, cwd: dir };
    const ruleContext = weakAssertionRule.create(context);
    return weakAssertionRule.analyze(ruleContext, facts);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

const POSITIVE_FIXTURE = 'tests/fixtures/test/weak-assertion-positive.tsx';
const NEGATIVE_FIXTURE = 'tests/fixtures/test/weak-assertion-negative.tsx';

describe('test/weak-assertion', () => {
  it('fires on the positive fixture', async () => {
    const issues = await runRuleFromFixture(POSITIVE_FIXTURE);
    expect(issues.length).toBeGreaterThanOrEqual(3);
    expect(issues.every((i) => i.ruleId === 'test/weak-assertion')).toBe(true);
  });

  it('does NOT fire on the negative fixture', async () => {
    const issues = await runRuleFromFixture(NEGATIVE_FIXTURE);
    expect(issues).toHaveLength(0);
  });

  it('does NOT fire on non-test files (isTestFile guard)', async () => {
    const issues = await runInline(`expect(x).toBeDefined();`, 'Component.tsx');
    expect(issues).toHaveLength(0);
  });

  it('flags a tautological expect(x).toBe(x)', async () => {
    const issues = await runInline(`it('a', () => { const x = 1; expect(x).toBe(x); });`);
    expect(issues.length).toBeGreaterThanOrEqual(1);
    expect(issues[0]?.ruleId).toBe('test/weak-assertion');
  });

  it('flags expect().toBeDefined() without a stronger followup', async () => {
    const issues = await runInline(`it('a', () => { const x = lookup(); expect(x).toBeDefined(); });`);
    expect(issues.length).toBeGreaterThanOrEqual(1);
  });

  it('suppresses expect().toBeDefined() when followed by a stronger assertion', async () => {
    const issues = await runInline(`
      it('a', () => {
        const x = lookup();
        expect(x).toBeDefined();
        expect(x).toEqual({ id: '1' });
      });
    `);
    expect(issues).toHaveLength(0);
  });

  it('flags expect(x).toBe(null)', async () => {
    const issues = await runInline(`it('a', () => { expect(lookup('x')).toBe(null); });`);
    expect(issues.length).toBeGreaterThanOrEqual(1);
  });

  it('suppresses assertions inside .skip / .todo', async () => {
    const issues = await runInline(`
      it.skip('a', () => { expect(x).toBeDefined(); });
      it.todo('b');
    `);
    expect(issues).toHaveLength(0);
  });

  it('severity is medium and aiSpecific is true', async () => {
    const issues = await runRuleFromFixture(POSITIVE_FIXTURE);
    expect(issues[0]?.severity).toBe('medium');
    expect(issues[0]?.aiSpecific).toBe(true);
  });

  // Boundary: lookahead distance is 3 lines. A stronger assertion at
  // line+3 still suppresses the weak one; at line+4 it does not.
  it('boundary: stronger assertion at exactly line+3 still suppresses', async () => {
    const issues = await runInline(`
      it('a', () => {
        const x = lookup();
        expect(x).toBeDefined();

        expect(x).toEqual({ id: '1' });
      });
    `);
    expect(issues).toHaveLength(0);
  });

  it('boundary: stronger assertion at line+4 does NOT suppress', async () => {
    const issues = await runInline(`
      it('a', () => {
        const x = lookup();
        expect(x).toBeDefined();



        expect(x).toEqual({ id: '1' });
      });
    `);
    expect(issues.length).toBeGreaterThanOrEqual(1);
    expect(issues.some((i) => i.message.includes('Weak assertion'))).toBe(true);
  });
});