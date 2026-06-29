import { describe, expect, it } from 'vitest';
import { writeFileSync, mkdtempSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { parseFile } from '@usebrick/engine';
import { extractFacts } from '../../../src/engine/visitor';
import { localstorageTokenRule } from '../../../src/rules/security/localstorage-token';
import type { Issue, ResolvedConfig, RuleContext } from '../../../src/types';

function makeConfig(): ResolvedConfig {
  return {
    include: [], exclude: [], rules: {}, frameworkMultipliers: {},
    ruleConfig: {}, arbitraryValueAllowlist: [],
    wcag: { targetSizeExemptSelectors: [] },
    thresholds: { meanSlop: 0, p90Slop: 0, individualSlopThreshold: 0 },
    spacingScale: [], radiusScale: [], clampAllowlist: [], allowedImports: [],
    prScoreThreshold: 0, testIntelligence: { missingEdgeCase: false },
    categoryWeights: {} as ResolvedConfig['categoryWeights'],
    projectMemory: false, telemetry: false,
  };
}

async function runRule(source: string, fileName = 'auth.ts'): Promise<Issue[]> {
  const dir = mkdtempSync(join(tmpdir(), 'slopbrick-localstorage-token-test-'));
  try {
    const filePath = join(dir, fileName);
    writeFileSync(filePath, source);
    const { ast, source: parsedSource } = await parseFile(filePath);
    const facts = extractFacts(filePath, ast, parsedSource);
    const context: RuleContext = { config: makeConfig(), filePath, cwd: dir };
    const ruleContext = localstorageTokenRule.create(context);
    return localstorageTokenRule.analyze(ruleContext, facts);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

describe('security/localstorage-token', () => {
  it("flags localStorage.setItem('token', jwt)", async () => {
    const issues = await runRule(
      `localStorage.setItem('token', jwt);`,
    );
    expect(issues.length).toBeGreaterThanOrEqual(1);
    expect(issues[0].ruleId).toBe('security/localstorage-token');
  });

  it("flags localStorage.setItem('auth_token', x)", async () => {
    const issues = await runRule(
      `localStorage.setItem('auth_token', x);`,
    );
    expect(issues.length).toBeGreaterThanOrEqual(1);
  });

  it("flags localStorage.setItem('accessToken', y)", async () => {
    const issues = await runRule(
      `localStorage.setItem('accessToken', y);`,
    );
    expect(issues.length).toBeGreaterThanOrEqual(1);
  });

  it("flags sessionStorage.setItem('jwt', token)", async () => {
    const issues = await runRule(
      `sessionStorage.setItem('jwt', token);`,
    );
    expect(issues.length).toBeGreaterThanOrEqual(1);
  });

  it("does not flag localStorage.setItem('theme', 'dark')", async () => {
    const issues = await runRule(
      `localStorage.setItem('theme', 'dark');`,
    );
    expect(issues).toHaveLength(0);
  });

  it("does not flag localStorage.setItem('lang', 'en')", async () => {
    const issues = await runRule(
      `localStorage.setItem('lang', 'en');`,
    );
    expect(issues).toHaveLength(0);
  });

  it('does not flag non-storage code', async () => {
    const issues = await runRule(
      `const x = 1; console.log(x);`,
    );
    expect(issues).toHaveLength(0);
  });

  it('does not flag empty file', async () => {
    const issues = await runRule(``);
    expect(issues).toHaveLength(0);
  });
});
