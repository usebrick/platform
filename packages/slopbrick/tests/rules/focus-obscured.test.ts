import { describe, expect, it } from 'vitest';
import { writeFileSync, mkdtempSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { parseFile } from '../../src/engine/parser';
import { extractFacts } from '../../src/engine/visitor';
import { focusObscuredRule } from '../../src/rules/wcag/focus-obscured';
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
  const dir = mkdtempSync(join(tmpdir(), 'slopbrick-focus-obscured-test-'));
  try {
    const filePath = join(dir, fileName);
    writeFileSync(filePath, source);
    const { ast, source: parsedSource } = await parseFile(filePath);
    const facts = extractFacts(filePath, ast, parsedSource);
    const context: RuleContext = { config, filePath, cwd: dir };
    const ruleContext = focusObscuredRule.create(context);
    return focusObscuredRule.analyze(ruleContext, facts);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

describe('wcag/focus-obscured', () => {
  it('flags <header className="fixed" />', async () => {
    const source = `export function Page() { return <header className="fixed" />; }`;
    const issues = await runRule(source, makeConfig());
    expect(issues).toHaveLength(1);
    expect(issues[0].ruleId).toBe('wcag/focus-obscured');
    expect(issues[0].severity).toBe('low');
    expect(issues[0].aiSpecific).toBe(false);
    expect(issues[0].message).toBe(
      'Element uses fixed/sticky positioning which may obscure focused siblings',
    );
    expect(issues[0].advice).toBe(
      'Ensure focused elements are not hidden behind fixed or sticky wrappers.',
    );
  });

  it('flags <nav className="sticky" />', async () => {
    const source = `export function Page() { return <nav className="sticky" />; }`;
    const issues = await runRule(source, makeConfig());
    expect(issues).toHaveLength(1);
    expect(issues[0].ruleId).toBe('wcag/focus-obscured');
  });

  it('does not flag unrelated position classes', async () => {
    const source = `export function Page() { return <div className="relative absolute" />; }`;
    const issues = await runRule(source, makeConfig());
    expect(issues).toHaveLength(0);
  });

  it('does not flag classes that merely contain fixed or sticky', async () => {
    const source = `export function Page() { return <div className="fixed-width sticky-header" />; }`;
    const issues = await runRule(source, makeConfig());
    expect(issues).toHaveLength(0);
  });

  it('flags only once when both fixed and sticky are present', async () => {
    const source = `export function Page() { return <div className="fixed sticky" />; }`;
    const issues = await runRule(source, makeConfig());
    expect(issues).toHaveLength(1);
  });

  it('flags distinct fixed/sticky class signatures separately (not just once per file)', async () => {
    // Regression for wcag/focus-obscured.ts:31 — the dedup key used to be
    // the literal constant 'file' so every element after the first was
    // silently dropped. Different class signatures on different elements
    // each represent a distinct WCAG 2.4.11 finding and must report
    // individually.
    const source = `export function Page() {
      return (
        <>
          <header className="fixed top-0" />
          <nav className="sticky bottom-0" />
          <aside className="fixed right-0" />
        </>
      );
    }`;
    const issues = await runRule(source, makeConfig());
    expect(issues).toHaveLength(3);
  });

  it('dedupes identical class signatures on multiple elements', async () => {
    const source = `export function Page() {
      return (
        <>
          <div className="fixed" />
          <div className="fixed" />
          <div className="fixed" />
        </>
      );
    }`;
    const issues = await runRule(source, makeConfig());
    expect(issues).toHaveLength(1);
  });
});
