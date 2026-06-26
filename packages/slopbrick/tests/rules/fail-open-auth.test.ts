import { describe, expect, it } from 'vitest';
import { writeFileSync, mkdtempSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { parseFile } from '../../src/engine/parser';
import { extractFacts } from '../../src/engine/visitor';
import { failOpenAuthRule } from '../../src/rules/security/fail-open-auth';
import type { Issue, ResolvedConfig, RuleContext } from '../../src/types';

function makeConfig(overrides?: Partial<ResolvedConfig>): ResolvedConfig {
  return {
    include: [],
    exclude: [],
    rules: {},
    frameworkMultipliers: {},
    ruleConfig: {},
    arbitraryValueAllowlist: [],
    wcag: { targetSizeExemptSelectors: [] },
    thresholds: {
      meanSlop: 0,
      p90Slop: 0,
      individualSlopThreshold: 0,
    },
    ...overrides,
  };
}

async function runRule(source: string, fileName = 'middleware.ts'): Promise<Issue[]> {
  const dir = mkdtempSync(join(tmpdir(), 'slopbrick-fail-open-auth-test-'));
  try {
    const filePath = join(dir, fileName);
    writeFileSync(filePath, source);
    const { ast, source: parsedSource } = await parseFile(filePath);
    const facts = extractFacts(filePath, ast, parsedSource);
    const context: RuleContext = { config: makeConfig(), filePath, cwd: dir };
    const ruleContext = failOpenAuthRule.create(context);
    return failOpenAuthRule.analyze(ruleContext, facts);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

describe('security/fail-open-auth', () => {
  it('flags NODE_ENV === development return true', async () => {
    const issues = await runRule(
      `function check() { if (process.env.NODE_ENV === 'development') return true; }`,
    );
    expect(issues.length).toBeGreaterThanOrEqual(1);
    expect(issues[0].ruleId).toBe('security/fail-open-auth');
    expect(issues[0].severity).toBe('high');
    expect(issues[0].aiSpecific).toBe(true);
  });

  it('flags NODE_ENV !== production return next()', async () => {
    const issues = await runRule(
      `function check(req, res, next) { if (process.env.NODE_ENV !== 'production') return next(); }`,
    );
    expect(issues.length).toBeGreaterThanOrEqual(1);
  });

  it('flags process.env.DEV return true', async () => {
    const issues = await runRule(
      `function check() { if (process.env.DEV) return true; }`,
    );
    expect(issues.length).toBeGreaterThanOrEqual(1);
  });

  it('flags VERCEL_ENV !== production return true', async () => {
    const issues = await runRule(
      `function check() { if (process.env.VERCEL_ENV !== 'production') return true; }`,
    );
    expect(issues.length).toBeGreaterThanOrEqual(1);
  });

  it('does not flag proper production-only auth', async () => {
    const issues = await runRule(
      `function check(req, res, next) { if (!req.user) return res.status(401).send('Unauthorized'); next(); }`,
    );
    expect(issues).toHaveLength(0);
  });

  it('does not flag env var used as feature flag (not return true)', async () => {
    const issues = await runRule(
      `const debug = process.env.NODE_ENV === 'development'; console.log(debug);`,
    );
    expect(issues).toHaveLength(0);
  });
});
