import { describe, expect, it } from 'vitest';
import { writeFileSync, mkdtempSync, rmSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { parseFile } from '@usebrick/engine';
import { extractFacts } from '../../../src/engine/visitor';
import { fakePlaceholderRule } from '../../../src/rules/test/fake-placeholder';
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

async function runFromFixture(fixturePath: string): Promise<Issue[]> {
  const dir = mkdtempSync(join(tmpdir(), 'slopbrick-fake-'));
  try {
    const filePath = join(dir, 'Component.test.ts');
    const fixtureSource = readFileSync(fixturePath, 'utf-8');
    writeFileSync(filePath, fixtureSource);
    const { ast, source: parsedSource } = await parseFile(filePath);
    const facts = extractFacts(filePath, ast, parsedSource);
    const context: RuleContext = { config: makeConfig(), filePath, cwd: dir };
    const ruleContext = fakePlaceholderRule.create(context);
    return fakePlaceholderRule.analyze(ruleContext, facts);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

async function runInline(source: string, fileName = 'Component.test.ts'): Promise<Issue[]> {
  const dir = mkdtempSync(join(tmpdir(), 'slopbrick-fake-'));
  try {
    const filePath = join(dir, fileName);
    writeFileSync(filePath, source);
    const { ast, source: parsedSource } = await parseFile(filePath);
    const facts = extractFacts(filePath, ast, parsedSource);
    const context: RuleContext = { config: makeConfig(), filePath, cwd: dir };
    const ruleContext = fakePlaceholderRule.create(context);
    return fakePlaceholderRule.analyze(ruleContext, facts);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

const POSITIVE_FIXTURE = 'tests/fixtures/test/fake-placeholder-positive.tsx';
const NEGATIVE_FIXTURE = 'tests/fixtures/test/fake-placeholder-negative.tsx';

describe('test/fake-placeholder', () => {
  it('fires on the positive fixture', async () => {
    const issues = await runFromFixture(POSITIVE_FIXTURE);
    expect(issues.length).toBeGreaterThanOrEqual(3);
    expect(issues.every((i) => i.ruleId === 'test/fake-placeholder')).toBe(true);
  });

  it('does NOT fire on the negative fixture (realistic values)', async () => {
    const issues = await runFromFixture(NEGATIVE_FIXTURE);
    expect(issues).toHaveLength(0);
  });

  it('does NOT fire on non-test files', async () => {
    const issues = await runInline(`const user = { name: 'John Doe' };`, 'Component.tsx');
    expect(issues).toHaveLength(0);
  });

  it("flags name: 'John Doe'", async () => {
    const issues = await runInline(`const u = { name: 'John Doe' };`);
    expect(issues.length).toBeGreaterThanOrEqual(1);
  });

  it("flags email: 'test@test.com'", async () => {
    const issues = await runInline(`const u = { email: 'test@test.com' };`);
    expect(issues.length).toBeGreaterThanOrEqual(1);
  });

  it("flags id: 1 (single-digit numeric placeholder)", async () => {
    const issues = await runInline(`const u = { id: 1 };`);
    expect(issues.length).toBeGreaterThanOrEqual(1);
  });

  it('does NOT flag realistic id: 48231', async () => {
    const issues = await runInline(`const u = { id: 48231 };`);
    expect(issues).toHaveLength(0);
  });

  it("flags password: 'password'", async () => {
    const issues = await runInline(`const u = { password: 'password' };`);
    expect(issues.length).toBeGreaterThanOrEqual(1);
  });

  it("flags createdAt: new Date('2020-01-01')", async () => {
    const issues = await runInline(`const u = { createdAt: new Date('2020-01-01') };`);
    expect(issues.length).toBeGreaterThanOrEqual(1);
  });

  it("does NOT flag a realistic email 'alice@acme-corp.com'", async () => {
    const issues = await runInline(`const u = { email: 'alice@acme-corp.com' };`);
    expect(issues).toHaveLength(0);
  });

  it('severity is high and aiSpecific is true', async () => {
    const issues = await runFromFixture(POSITIVE_FIXTURE);
    expect(issues[0]?.severity).toBe('high');
    expect(issues[0]?.aiSpecific).toBe(true);
  });
});