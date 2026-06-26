import { describe, expect, it } from 'vitest';
import { writeFileSync, mkdtempSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { parseFile } from '../../src/engine/parser';
import { extractFacts } from '../../src/engine/visitor';
import { inlineStyleDominanceRule } from '../../src/rules/visual/inline-style-dominance';
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

async function runRule(
  source: string,
  config: ResolvedConfig,
  fileName = 'Component.tsx',
): Promise<Issue[]> {
  const dir = mkdtempSync(join(tmpdir(), 'slopbrick-inline-style-test-'));
  try {
    const filePath = join(dir, fileName);
    writeFileSync(filePath, source);
    const { ast, source: parsedSource } = await parseFile(filePath);
    const facts = extractFacts(filePath, ast, parsedSource);
    const context: RuleContext = { config, filePath, cwd: dir };
    const ruleContext = inlineStyleDominanceRule.create(context);
    return inlineStyleDominanceRule.analyze(ruleContext, facts);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

describe('visual/inline-style-dominance', () => {
  it('flags a file with 3+ distinct inline style properties', async () => {
    const source = `export const X = () => (
  <div style={{ padding: '4px', margin: '8px', gap: '12px' }} />
);\n`;
    const issues = await runRule(source, makeConfig());
    expect(issues).toHaveLength(1);
    expect(issues[0].ruleId).toBe('visual/inline-style-dominance');
    expect(issues[0].severity).toBe('medium');
  });

  it('flags a file with 3 distinct padding values (same prop, different values)', async () => {
    const source = `export const A = () => <div style={{ padding: '4px' }} />;
export const B = () => <div style={{ padding: '8px' }} />;
export const C = () => <div style={{ padding: '12px' }} />;\n`;
    const issues = await runRule(source, makeConfig());
    expect(issues).toHaveLength(1);
    expect(issues[0].message).toContain('3 distinct');
  });

  it('does not flag a file with 1-2 styleProps', async () => {
    const source = `export const X = () => (
  <div style={{ padding: '4px', margin: '8px' }} />
);\n`;
    const issues = await runRule(source, makeConfig());
    expect(issues).toHaveLength(0);
  });

  it('does not flag a file with no styleProps', async () => {
    const source = `export const X = () => <div className="p-4 m-2">x</div>;\n`;
    const issues = await runRule(source, makeConfig());
    expect(issues).toHaveLength(0);
  });
});
