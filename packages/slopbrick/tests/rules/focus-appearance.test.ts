import { describe, expect, it } from 'vitest';
import { writeFileSync, mkdtempSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { parseFile } from '@usebrick/engine';
import { extractFacts } from '../../src/engine/visitor';
import { focusAppearanceRule } from '../../src/rules/wcag/focus-appearance';
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
  const dir = mkdtempSync(join(tmpdir(), 'slopbrick-focus-appearance-test-'));
  try {
    const filePath = join(dir, fileName);
    writeFileSync(filePath, source);
    const { ast, source: parsedSource } = await parseFile(filePath);
    const facts = extractFacts(filePath, ast, parsedSource);
    const context: RuleContext = { config, filePath, cwd: dir };
    const ruleContext = focusAppearanceRule.create(context);
    return focusAppearanceRule.analyze(ruleContext, facts);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

describe('wcag/focus-appearance', () => {
  it('flags <button className="outline-none" />', async () => {
    const source = `export function Form() { return <button className="outline-none" />; }`;
    const issues = await runRule(source, makeConfig());
    expect(issues).toHaveLength(1);
    expect(issues[0].ruleId).toBe('wcag/focus-appearance');
    expect(issues[0].severity).toBe('high');
    expect(issues[0].aiSpecific).toBe(false);
    expect(issues[0].message).toBe(
      "Interactive 'button' removes focus outline without adding a focus ring",
    );
  });

  it('flags <button className="focus:outline-none" />', async () => {
    const source = `export function Form() { return <button className="focus:outline-none" />; }`;
    const issues = await runRule(source, makeConfig());
    expect(issues).toHaveLength(1);
    expect(issues[0].ruleId).toBe('wcag/focus-appearance');
  });

  it('flags <button className="outline-none focus:ring-2" /> as insufficient', async () => {
    const source = `export function Form() { return <button className="outline-none focus:ring-2" />; }`;
    const issues = await runRule(source, makeConfig());
    expect(issues).toHaveLength(1);
  });

  it('does not flag <button className="focus:outline-none focus-visible:ring-2" />', async () => {
    const source = `export function Form() { return <button className="focus:outline-none focus-visible:ring-2" />; }`;
    const issues = await runRule(source, makeConfig());
    expect(issues).toHaveLength(0);
  });

  it('does not flag a plain <button />', async () => {
    const source = `export function Form() { return <button />; }`;
    const issues = await runRule(source, makeConfig());
    expect(issues).toHaveLength(0);
  });

  it('flags focus-visible:outline-none without a focus ring', async () => {
    const source = `export function Form() { return <button className="focus-visible:outline-none" />; }`;
    const issues = await runRule(source, makeConfig());
    expect(issues).toHaveLength(1);
  });

  // Boundary: focus:ring-2 (no -visible prefix) does NOT satisfy the rule.
  // The rule requires `focus-visible:ring-*` specifically, because the
  // non-visible variant also paints on mouse click which violates WCAG 2.4.7.
  it('boundary: focus:ring-2 without -visible is treated as insufficient', async () => {
    const source = `export function Form() { return <button className="outline-none focus:ring-2" />; }`;
    const issues = await runRule(source, makeConfig());
    expect(issues).toHaveLength(1);
  });

  // Boundary: only focus-visible:ring-* clears the issue.
  it('boundary: focus-visible:ring-2 is sufficient to clear the issue', async () => {
    const source = `export function Form() { return <button className="outline-none focus-visible:ring-2" />; }`;
    const issues = await runRule(source, makeConfig());
    expect(issues).toHaveLength(0);
  });

  // Custom vs default: a plain <button /> preserves the browser's default
  // outline. We must NOT flag it just because it lacks a focus-visible ring —
  // outline removal is what we're catching.
  it('does not flag a button relying on the browser default focus outline', async () => {
    const source = `export function Form() { return <button className="bg-blue-500 px-4 py-2" />; }`;
    const issues = await runRule(source, makeConfig());
    expect(issues).toHaveLength(0);
  });

  // Custom vs default: outline-* classes other than outline-none (e.g.
  // outline-dashed, outline-red-500) are NOT removal — they keep an
  // outline visible, just stylized. The rule should NOT flag them.
  it('does not flag a button that styles the outline (not outline-none)', async () => {
    const source = `export function Form() { return <button className="outline outline-2 outline-red-500" />; }`;
    const issues = await runRule(source, makeConfig());
    expect(issues).toHaveLength(0);
  });

  // Multi-element count: each interactive element with outline-none + no
  // focus ring is its own issue. Verifies the boundary is per-element.
  it('counts each interactive element separately', async () => {
    const source = `
      export function Form() {
        return (
          <div>
            <button className="outline-none">A</button>
            <a className="outline-none" href="#">B</a>
            <input className="outline-none" />
            <button>B (no removal)</button>
          </div>
        );
      }
    `;
    const issues = await runRule(source, makeConfig());
    // Three interactive elements remove the outline; the fourth does not.
    expect(issues).toHaveLength(3);
    expect(issues.every((i) => i.ruleId === 'wcag/focus-appearance')).toBe(true);
  });
});
