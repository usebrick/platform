import { describe, expect, it } from 'vitest';
import { writeFileSync, mkdtempSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { parseFile } from '@usebrick/engine';
import { extractFacts } from '../../src/engine/visitor';
import { calcRawPxRule } from '../../src/rules/typo/calc-raw-px';
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
  const dir = mkdtempSync(join(tmpdir(), 'slopbrick-calc-raw-px-test-'));
  try {
    const filePath = join(dir, fileName);
    writeFileSync(filePath, source);
    const { ast, source: parsedSource } = await parseFile(filePath);
    const facts = extractFacts(filePath, ast, parsedSource);
    const context: RuleContext = { config, filePath, cwd: dir };
    const ruleContext = calcRawPxRule.create(context);
    return calcRawPxRule.analyze(ruleContext, facts);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

describe('typo/calc-raw-px', () => {
  it('flags calc() with raw px in 3+ layout properties (AI repetition pattern)', async () => {
    const source = `export function Box() {
      return (
        <div style={{
          padding: 'calc(100% - 16px)',
          margin: 'calc(8px + 4px)',
          width: 'calc(200px - 20px)',
          height: 'calc(100px + 10px)',
        }} />
      );
    }`;
    const issues = await runRule(source, makeConfig());
    expect(issues.length).toBeGreaterThanOrEqual(3);
    expect(issues[0].ruleId).toBe('typo/calc-raw-px');
  });

  it('ignores single calc() with raw px (human one-off mistake)', async () => {
    const source = `export function Box() { return <div style={{ padding: 'calc(100% - 16px)' }} />; }`;
    const issues = await runRule(source, makeConfig());
    expect(issues).toHaveLength(0);
  });

  it('ignores calc() with raw px in font-size', async () => {
    const source = `export function Box() { return <div style={{ fontSize: 'calc(12px + 2px)' }} />; }`;
    const issues = await runRule(source, makeConfig());
    expect(issues).toHaveLength(0);
  });

  it('flags calc() in 3+ transform properties (AI repetition)', async () => {
    const source = `export function Box() {
      return (
        <div style={{
          transform: 'translateX(calc(16px - 8px))',
          translate: 'calc(10px + 5px)',
          width: 'calc(200px - 20px)',
        }} />
      );
    }`;
    const issues = await runRule(source, makeConfig());
    expect(issues.length).toBeGreaterThanOrEqual(3);
    expect(issues.some((i) => i.message.includes('transform'))).toBe(true);
  });
});
