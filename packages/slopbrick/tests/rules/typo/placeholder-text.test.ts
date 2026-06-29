import { describe, expect, it } from 'vitest';
import { writeFileSync, mkdtempSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { parseFile } from '@usebrick/engine';
import { extractFacts } from '../../../src/engine/visitor';
import { placeholderTextRule } from '../../../src/rules/typo/placeholder-text';
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
  const dir = mkdtempSync(join(tmpdir(), 'slopbrick-placeholder-text-test-'));
  try {
    const filePath = join(dir, fileName);
    writeFileSync(filePath, source);
    const { ast, source: parsedSource } = await parseFile(filePath);
    const facts = extractFacts(filePath, ast, parsedSource);
    const context: RuleContext = { config: makeConfig(), filePath, cwd: dir };
    const ruleContext = placeholderTextRule.create(context);
    return placeholderTextRule.analyze(ruleContext, facts);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

describe('typo/placeholder-text', () => {
  it('flags "Lorem ipsum" placeholder', async () => {
    const source = '<input placeholder="Lorem ipsum dolor" />';
    const issues = await runRule(source);
    expect(issues.some((i) => i.ruleId === 'typo/placeholder-text')).toBe(true);
  });

  it('flags "Enter text here" placeholder', async () => {
    const source = '<input placeholder="Enter text here" />';
    const issues = await runRule(source);
    expect(issues.some((i) => i.ruleId === 'typo/placeholder-text')).toBe(true);
  });

  it('flags "TODO" placeholder', async () => {
    const source = '<input placeholder="TODO" />';
    const issues = await runRule(source);
    expect(issues.some((i) => i.ruleId === 'typo/placeholder-text')).toBe(true);
  });

  it('does not flag real-looking placeholder copy', async () => {
    const source = '<input placeholder="Search products" />';
    const issues = await runRule(source);
    expect(issues.filter((i) => i.ruleId === 'typo/placeholder-text')).toEqual([]);
  });

  it('does not flag empty source', async () => {
    const issues = await runRule('');
    expect(issues.filter((i) => i.ruleId === 'typo/placeholder-text')).toEqual([]);
  });
});
