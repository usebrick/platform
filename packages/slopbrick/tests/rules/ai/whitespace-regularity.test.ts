import { describe, expect, it } from 'vitest';
import { writeFileSync, mkdtempSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { parseFile } from '@usebrick/engine';
import { extractFacts } from '../../../src/engine/visitor';
import { aiWhitespaceRegularityRule } from '../../../src/rules/ai/whitespace-regularity';
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
  const dir = mkdtempSync(join(tmpdir(), 'slopbrick-whitespace-regularity-test-'));
  try {
    const filePath = join(dir, fileName);
    writeFileSync(filePath, source);
    const { ast, source: parsedSource } = await parseFile(filePath);
    const facts = extractFacts(filePath, ast, parsedSource);
    const context: RuleContext = { config: makeConfig(), filePath, cwd: dir };
    const ruleContext = aiWhitespaceRegularityRule.create(context);
    return aiWhitespaceRegularityRule.analyze(ruleContext, facts);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

describe('ai/whitespace-regularity', () => {
  it('flags file with extremely uniform 1-space inter-token spacing (AI pattern)', async () => {
    // 60 lines × ~5 tokens = 300+ tokens. All inter-token spaces are length 1.
    // cv=0, H=0 → fires both conditions.
    const lines: string[] = [];
    for (let i = 0; i < 60; i++) {
      lines.push(`const v${i} = ${i};`);
    }
    const source = lines.join('\n');
    const issues = await runRule(source);
    expect(issues.length).toBeGreaterThanOrEqual(1);
    expect(issues[0].ruleId).toBe('ai/whitespace-regularity');
    expect(issues[0].aiSpecific).toBe(true);
  });

  it('does not flag file with varied indent widths (human pattern)', async () => {
    // Mix of 1-, 2-, and 4-space indents. cv ≈ 1.48 (≥ 0.5) → early return.
    const lines = [
      'const a = 1;',
      '  const b = 2;',           // 2 spaces
      '    const c = 3;',         // 4 spaces
      '      const d = 4;',       // 6 spaces
      '        const e = 5;',     // 8 spaces
      'const f = 6;',
      '  const g = 7;',
      '    const h = 8;',
      '      const i = 9;',
      '        const j = 10;',
      'const k = 11;',
      '  const l = 12;',
      '    const m = 13;',
      '      const n = 14;',
      '        const o = 15;',
      'const p = 16;',
      '  const q = 17;',
      '    const r = 18;',
      '      const s = 19;',
      '        const t = 20;',
      'const u = 21;',
      '  const v = 22;',
      '    const w = 23;',
      '      const x = 24;',
      '        const y = 25;',
      'const z = 26;',
      '  const aa = 27;',
      '    const bb = 28;',
      '      const cc = 29;',
      '        const dd = 30;',
    ];
    const source = lines.join('\n');
    const issues = await runRule(source);
    expect(issues).toHaveLength(0);
  });

  it('does not flag file with too few token pairs (below MIN_TOKEN_PAIRS=50)', async () => {
    // 9 lines × 4 tokens = 36 tokens < 50 → early return.
    const source = [
      'const a = 1;',
      'const b = 2;',
      'const c = 3;',
      'const d = 4;',
      'const e = 5;',
      'const f = 6;',
      'const g = 7;',
      'const h = 8;',
      'const i = 9;',
    ].join('\n');
    const issues = await runRule(source);
    expect(issues).toHaveLength(0);
  });
});
