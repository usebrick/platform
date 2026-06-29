import { describe, expect, it } from 'vitest';
import { writeFileSync, mkdtempSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { parseFile } from '@usebrick/engine';
import { extractFacts } from '../../src/engine/visitor';
import { spacingGridRule } from '../../src/rules/layout/spacing-grid';
import { DEFAULT_SPACING_SCALE } from '../../src/config';
import type { Issue, ResolvedConfig, RuleContext } from '../../src/types';

function makeConfig(overrides?: Partial<ResolvedConfig>): ResolvedConfig {
  return {
    include: [],
    exclude: [],
    rules: {},
    frameworkMultipliers: {},
    ruleConfig: {},
    spacingScale: DEFAULT_SPACING_SCALE,
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
  const dir = mkdtempSync(join(tmpdir(), 'slopbrick-spacing-grid-test-'));
  try {
    const filePath = join(dir, fileName);
    writeFileSync(filePath, source);
    const { ast, source: parsedSource } = await parseFile(filePath);
    const facts = extractFacts(filePath, ast, parsedSource);
    const context: RuleContext = { config, filePath, cwd: dir };
    const ruleContext = spacingGridRule.create(context);
    return spacingGridRule.analyze(ruleContext, facts);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

describe('layout/spacing-grid', () => {
  it('flags 3+ out-of-scale padding utilities (AI repetition pattern)', async () => {
    const issues = await runRule(
      `export function Box() {
        return (
          <div className="p-13 px-13 py-13 mt-13 ml-13" />
        );
      }`,
      makeConfig(),
    );
    expect(issues.length).toBeGreaterThanOrEqual(3);
    expect(issues[0].ruleId).toBe('layout/spacing-grid');
    expect(issues.some((i) => i.message.includes('p-13'))).toBe(true);
  });

  it('ignores a single out-of-scale padding utility (human one-off)', async () => {
    const issues = await runRule(
      `export function Box() { return <div className="p-13" />; }`,
      makeConfig(),
    );
    expect(issues).toHaveLength(0);
  });

  it('allows in-scale padding utilities', async () => {
    const issues = await runRule(
      `export function Box() { return <div className="p-4 px-2 py-0.5" />; }`,
      makeConfig(),
    );
    expect(issues).toHaveLength(0);
  });

  it('allows standard px tokens', async () => {
    const issues = await runRule(
      `export function Box() { return <div className="p-px m-px gap-px" />; }`,
      makeConfig(),
    );
    expect(issues).toHaveLength(0);
  });

  it('flags 3+ out-of-scale arbitrary values', async () => {
    const issues = await runRule(
      `export function Box() { return <div className="p-[13px] m-[21px] gap-[9px]" />; }`,
      makeConfig(),
    );
    expect(issues.length).toBeGreaterThanOrEqual(3);
    expect(issues.some((i) => i.message.includes('p-[13px]'))).toBe(true);
  });

  it('ignores a single out-of-scale arbitrary value', async () => {
    const issues = await runRule(
      `export function Box() { return <div className="p-[13px]" />; }`,
      makeConfig(),
    );
    expect(issues).toHaveLength(0);
  });

  it('allows an in-scale arbitrary rem value', async () => {
    const issues = await runRule(
      `export function Box() { return <div className="p-[0.5rem]" />; }`,
      makeConfig(),
    );
    expect(issues).toHaveLength(0);
  });

  it('flags 3+ out-of-scale inline properties', async () => {
    const issues = await runRule(
      `export function Box() { return <div style={{ padding: '13px', margin: '21px', gap: '9px' }} />; }`,
      makeConfig(),
    );
    expect(issues.length).toBeGreaterThanOrEqual(3);
    expect(issues.some((i) => i.message.includes('padding'))).toBe(true);
    expect(issues.some((i) => i.message.includes('margin'))).toBe(true);
  });

  it('ignores a single out-of-scale inline padding', async () => {
    const issues = await runRule(
      `export function Box() { return <div style={{ padding: '13px' }} />; }`,
      makeConfig(),
    );
    expect(issues).toHaveLength(0);
  });

  it('allows an in-scale inline gap', async () => {
    const issues = await runRule(
      `export function Box() { return <div style={{ gap: '16px' }} />; }`,
      makeConfig(),
    );
    expect(issues).toHaveLength(0);
  });

  it('respects a custom spacing scale', async () => {
    const issues = await runRule(
      `export function Box() { return <div className="p-13 px-13 py-13" />; }`,
      makeConfig({ spacingScale: [0, 13, 26] }),
    );
    expect(issues).toHaveLength(0);
  });

  it('ignores non-spacing utilities', async () => {
    const issues = await runRule(
      `export function Box() { return <div className="text-red-500 w-full" />; }`,
      makeConfig(),
    );
    expect(issues).toHaveLength(0);
  });

  it('ignores zero values', async () => {
    const issues = await runRule(
      `export function Box() { return <div className="p-0 m-0 gap-0" />; }`,
      makeConfig(),
    );
    expect(issues).toHaveLength(0);
  });
});
