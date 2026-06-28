import { describe, expect, it } from 'vitest';
import { writeFileSync, mkdtempSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { parseFile } from '@usebrick/engine';
import { extractFacts } from '../../src/engine/visitor';
import { targetSizeRule } from '../../src/rules/wcag/target-size';
import type { Issue, ResolvedConfig, RuleContext } from '../../src/types';

function makeConfig(overrides?: Partial<ResolvedConfig>): ResolvedConfig {
  return {
    include: [],
    exclude: [],
    rules: {},
    frameworkMultipliers: {},
    ruleConfig: {},
    arbitraryValueAllowlist: [],
    hasTailwind: true,
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
  const dir = mkdtempSync(join(tmpdir(), 'slopbrick-target-size-test-'));
  try {
    const filePath = join(dir, fileName);
    writeFileSync(filePath, source);
    const { ast, source: parsedSource } = await parseFile(filePath);
    const facts = extractFacts(filePath, ast, parsedSource);
    const context: RuleContext = { config, filePath, cwd: dir };
    const ruleContext = targetSizeRule.create(context);
    return targetSizeRule.analyze(ruleContext, facts);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

describe('wcag/target-size', () => {
  it('flags a bare <button />', async () => {
    const source = `export function Form() { return <button />; }`;
    const issues = await runRule(source, makeConfig());
    expect(issues).toHaveLength(1);
    expect(issues[0].ruleId).toBe('wcag/target-size');
    expect(issues[0].severity).toBe('high');
    expect(issues[0].aiSpecific).toBe(false);
    expect(issues[0].message).toBe("Interactive 'button' lacks a sufficient target-size token");
  });

  it('does not flag <button className="h-10 w-10" />', async () => {
    const source = `export function Form() { return <button className="h-10 w-10" />; }`;
    const issues = await runRule(source, makeConfig());
    expect(issues).toHaveLength(0);
  });

  it('does not flag <button width="40" height="40" />', async () => {
    const source = `export function Form() { return <button width="40" height="40" />; }`;
    const issues = await runRule(source, makeConfig());
    expect(issues).toHaveLength(0);
  });

  it('does not flag an element whose class is in targetSizeExemptSelectors', async () => {
    const source = `export function Form() { return <button className="icon-btn" />; }`;
    const issues = await runRule(
      source,
      makeConfig({ wcag: { targetSizeExemptSelectors: ['icon-btn'] } }),
    );
    expect(issues).toHaveLength(0);
  });

  it('flags <a className="text-sm" />', async () => {
    const source = `export function Form() { return <a className="text-sm" />; }`;
    const issues = await runRule(source, makeConfig());
    expect(issues).toHaveLength(1);
    expect(issues[0].ruleId).toBe('wcag/target-size');
    expect(issues[0].message).toBe("Interactive 'a' lacks a sufficient target-size token");
  });

  it('does not flag padding axis tokens', async () => {
    const source = `export function Form() { return <button className="px-4 py-2" />; }`;
    const issues = await runRule(source, makeConfig());
    expect(issues).toHaveLength(0);
  });

  it('flags a zero or auto explicit size', async () => {
    const source = `export function Form() { return <button width="0" height="auto" />; }`;
    const issues = await runRule(source, makeConfig());
    expect(issues).toHaveLength(1);
  });

  it('flags height/width tokens below the minimum threshold', async () => {
    const source = `export function Form() { return <button className="h-4 w-4" />; }`;
    const issues = await runRule(source, makeConfig());
    expect(issues).toHaveLength(1);
  });

  it('accepts height/width tokens at the minimum threshold', async () => {
    const source = `export function Form() { return <button className="h-6 w-6" />; }`;
    const issues = await runRule(source, makeConfig());
    expect(issues).toHaveLength(0);
  });

  it('flags padding tokens below the minimum threshold', async () => {
    const source = `export function Form() { return <button className="p-1" />; }`;
    const issues = await runRule(source, makeConfig());
    expect(issues).toHaveLength(1);
  });

  it('accepts padding tokens at the minimum threshold', async () => {
    const source = `export function Form() { return <button className="p-2" />; }`;
    const issues = await runRule(source, makeConfig());
    expect(issues).toHaveLength(0);
  });

  it('exempts a class selector with a leading dot', async () => {
    const source = `export function Form() { return <button className="icon-btn" />; }`;
    const issues = await runRule(
      source,
      makeConfig({ wcag: { targetSizeExemptSelectors: ['.icon-btn'] } }),
    );
    expect(issues).toHaveLength(0);
  });

  it('exempts a tag-qualified class selector', async () => {
    const source = `export function Form() { return <button className="icon-btn" />; }`;
    const issues = await runRule(
      source,
      makeConfig({ wcag: { targetSizeExemptSelectors: ['button.icon-btn'] } }),
    );
    expect(issues).toHaveLength(0);
  });

  it('does not exempt a mismatched tag-qualified selector', async () => {
    const source = `export function Form() { return <a className="icon-btn" />; }`;
    const issues = await runRule(
      source,
      makeConfig({ wcag: { targetSizeExemptSelectors: ['button.icon-btn'] } }),
    );
    expect(issues).toHaveLength(1);
  });

  it('exempts an id selector', async () => {
    const source = `export function Form() { return <button id="skip" className="icon-btn" />; }`;
    const issues = await runRule(
      source,
      makeConfig({ wcag: { targetSizeExemptSelectors: ['#skip'] } }),
    );
    expect(issues).toHaveLength(0);
  });

  it('exempts an attribute selector', async () => {
    const source = `export function Form() { return <button aria-label="Close" className="icon-btn" />; }`;
    const issues = await runRule(
      source,
      makeConfig({ wcag: { targetSizeExemptSelectors: ['[aria-label]'] } }),
    );
    expect(issues).toHaveLength(0);
  });

  it('exempts a tag with attribute selector', async () => {
    const source = `export function Form() { return <button data-testid="submit" className="icon-btn" />; }`;
    const issues = await runRule(
      source,
      makeConfig({ wcag: { targetSizeExemptSelectors: ['button[data-testid="submit"]'] } }),
    );
    expect(issues).toHaveLength(0);
  });

  it('skips when Tailwind is not detected and targetSizeRequireTailwind is true', async () => {
    const source = `export function Form() { return <button />; }`;
    const issues = await runRule(source, makeConfig({ hasTailwind: false }));
    expect(issues).toHaveLength(0);
  });

  it('runs without Tailwind when targetSizeRequireTailwind is false', async () => {
    const source = `export function Form() { return <button />; }`;
    const issues = await runRule(
      source,
      makeConfig({
        hasTailwind: false,
        wcag: { targetSizeExemptSelectors: [], targetSizeRequireTailwind: false },
      }),
    );
    expect(issues).toHaveLength(1);
  });
});
