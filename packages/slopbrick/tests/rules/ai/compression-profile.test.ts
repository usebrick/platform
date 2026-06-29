import { describe, expect, it } from 'vitest';
import { writeFileSync, mkdtempSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { parseFile } from '@usebrick/engine';
import { extractFacts } from '../../../src/engine/visitor';
import { aiCompressionProfileRule } from '../../../src/rules/ai/compression-profile';
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
  const dir = mkdtempSync(join(tmpdir(), 'slopbrick-compression-profile-test-'));
  try {
    const filePath = join(dir, fileName);
    writeFileSync(filePath, source);
    const { ast, source: parsedSource } = await parseFile(filePath);
    const facts = extractFacts(filePath, ast, parsedSource);
    const context: RuleContext = { config: makeConfig(), filePath, cwd: dir };
    const ruleContext = aiCompressionProfileRule.create(context);
    return aiCompressionProfileRule.analyze(ruleContext, facts);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

// Deterministic LCG so the test is reproducible across runs.
function makeRandomStringLines(count: number): string {
  let seed = 0x9e3779b9 >>> 0;
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  const out: string[] = [];
  for (let i = 0; i < count; i++) {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    const len = 40 + (seed % 60);
    let s = '// ';
    for (let j = 0; j < len; j++) {
      seed = (seed * 1664525 + 1013904223) >>> 0;
      s += chars[seed % chars.length];
    }
    out.push(s);
  }
  return out.join('\n');
}

describe('ai/compression-profile', () => {
  it('flags highly repetitive content (AI boilerplate signature)', async () => {
    // ~2600 bytes of nearly-identical lines -> gzip compresses very well,
    // line-to-line NCD similarity is high, CV is low -> >=2 conditions fire
    const line = 'const repeatedValue = 1;\n';
    const source = line.repeat(200);
    expect(source.length).toBeGreaterThan(2000);
    const issues = await runRule(source);
    expect(issues.length).toBeGreaterThanOrEqual(1);
    expect(issues[0].ruleId).toBe('ai/compression-profile');
    expect(issues[0].severity).toBe('low');
  });

  it('does not flag files below the 2KB minimum', async () => {
    // Plenty of repetition, but file is well under MIN_BYTES (2000)
    const source = 'const x = 1;\n'.repeat(50); // ~650 bytes
    expect(source.length).toBeLessThan(2000);
    const issues = await runRule(source);
    expect(issues).toHaveLength(0);
  });

  it('does not flag high-entropy, human-flavored source', async () => {
    // 80 lines of random base62 text. gzip ratio stays low (incompressible),
    // so only 0 of the 3 conditions can fire -> rule stays silent.
    const source = makeRandomStringLines(80);
    expect(source.length).toBeGreaterThan(2000);
    const issues = await runRule(source);
    expect(issues).toHaveLength(0);
  });
});
