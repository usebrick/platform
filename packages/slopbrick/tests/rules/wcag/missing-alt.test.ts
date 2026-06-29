import { describe, expect, it } from 'vitest';
import { writeFileSync, mkdtempSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { parseFile } from '@usebrick/engine';
import { extractFacts } from '../../../src/engine/visitor';
import { missingAltRule } from '../../../src/rules/wcag/missing-alt';
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

async function runRule(source: string, fileName = 'Component.tsx'): Promise<Issue[]> {
  const dir = mkdtempSync(join(tmpdir(), 'slopbrick-missing-alt-test-'));
  try {
    const filePath = join(dir, fileName);
    writeFileSync(filePath, source);
    const { ast, source: parsedSource } = await parseFile(filePath);
    const facts = extractFacts(filePath, ast, parsedSource);
    const context: RuleContext = { config: makeConfig(), filePath, cwd: dir };
    const ruleContext = missingAltRule.create(context);
    return missingAltRule.analyze(ruleContext, facts);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

describe('wcag/missing-alt', () => {
  it('flags <img> without alt attribute (self-closing)', async () => {
    const source = '<img src="x.png" />';
    const issues = await runRule(source);
    expect(issues.some((i) => i.ruleId === 'wcag/missing-alt')).toBe(true);
  });

  it('flags <img> without alt attribute (explicit close)', async () => {
    const source = '<img src="x.png"></img>';
    const issues = await runRule(source);
    expect(issues.some((i) => i.ruleId === 'wcag/missing-alt')).toBe(true);
  });

  it('does not flag <img alt="description">', async () => {
    const source = '<img src="x.png" alt="A description of the image" />';
    const issues = await runRule(source);
    expect(issues.filter((i) => i.ruleId === 'wcag/missing-alt')).toEqual([]);
  });

  it('does not flag <img alt=""> (decorative)', async () => {
    const source = '<img src="x.png" alt="" />';
    const issues = await runRule(source);
    expect(issues.filter((i) => i.ruleId === 'wcag/missing-alt')).toEqual([]);
  });

  it('does not flag <img role="presentation"> (decorative)', async () => {
    const source = '<img src="x.png" role="presentation" />';
    const issues = await runRule(source);
    expect(issues.filter((i) => i.ruleId === 'wcag/missing-alt')).toEqual([]);
  });

  it('does not flag empty source', async () => {
    const issues = await runRule('');
    expect(issues.filter((i) => i.ruleId === 'wcag/missing-alt')).toEqual([]);
  });
});
