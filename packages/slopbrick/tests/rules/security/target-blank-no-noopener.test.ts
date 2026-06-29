import { describe, expect, it } from 'vitest';
import { writeFileSync, mkdtempSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { parseFile } from '@usebrick/engine';
import { extractFacts } from '../../../src/engine/visitor';
import { targetBlankNoNoopenerRule } from '../../../src/rules/security/target-blank-no-noopener';
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

async function runRule(source: string, fileName = 'Component.tsx'): Promise<Issue[]> {
  const dir = mkdtempSync(join(tmpdir(), 'slopbrick-target-blank-no-noopener-test-'));
  try {
    const filePath = join(dir, fileName);
    writeFileSync(filePath, source);
    const { ast, source: parsedSource } = await parseFile(filePath);
    const facts = extractFacts(filePath, ast, parsedSource);
    const context: RuleContext = { config: makeConfig(), filePath, cwd: dir };
    const ruleContext = targetBlankNoNoopenerRule.create(context);
    return targetBlankNoNoopenerRule.analyze(ruleContext, facts);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

describe('security/target-blank-no-noopener', () => {
  it('flags <a target="_blank"> without rel', async () => {
    const issues = await runRule(
      `export function C(){return <a href="https://x.com" target="_blank">x</a>;}`,
    );
    expect(issues.length).toBeGreaterThanOrEqual(1);
    expect(issues[0].ruleId).toBe('security/target-blank-no-noopener');
  });

  it("flags <a target='_blank'> (single quotes)", async () => {
    const issues = await runRule(
      `export function C(){return <a href='https://x.com' target='_blank'>x</a>;}`,
    );
    expect(issues.length).toBeGreaterThanOrEqual(1);
  });

  it('does NOT flag <a target="_blank" rel="noopener">', async () => {
    const issues = await runRule(
      `export function C(){return <a href="https://x.com" target="_blank" rel="noopener">x</a>;}`,
    );
    expect(issues).toHaveLength(0);
  });

  it('does NOT flag <a target="_blank" rel="noreferrer">', async () => {
    const issues = await runRule(
      `export function C(){return <a href="https://x.com" target="_blank" rel="noreferrer">x</a>;}`,
    );
    expect(issues).toHaveLength(0);
  });

  it('does NOT flag <a target="_self">', async () => {
    const issues = await runRule(
      `export function C(){return <a href="https://x.com" target="_self">x</a>;}`,
    );
    expect(issues).toHaveLength(0);
  });

  it('flags multi-line <a target="_blank"> with mixed attribute order', async () => {
    const issues = await runRule(
      `export function C(){return <a
        href="https://x.com"
        target="_blank"
        className="link"
      >x</a>;}`,
    );
    expect(issues.length).toBeGreaterThanOrEqual(1);
  });

  it('does NOT flag empty file', async () => {
    const issues = await runRule('');
    expect(issues).toHaveLength(0);
  });
});
