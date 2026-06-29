import { describe, expect, it } from 'vitest';
import { writeFileSync, mkdtempSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { parseFile } from '@usebrick/engine';
import { extractFacts } from '../../src/engine/visitor';
import { draggingMovementsRule } from '../../src/rules/wcag/dragging-movements';
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
  const dir = mkdtempSync(join(tmpdir(), 'slopbrick-dragging-movements-test-'));
  try {
    const filePath = join(dir, fileName);
    writeFileSync(filePath, source);
    const { ast, source: parsedSource } = await parseFile(filePath);
    const facts = extractFacts(filePath, ast, parsedSource);
    const context: RuleContext = { config, filePath, cwd: dir };
    const ruleContext = draggingMovementsRule.create(context);
    return draggingMovementsRule.analyze(ruleContext, facts);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

describe('wcag/dragging-movements', () => {
  it('flags a bare draggable element', async () => {
    const source = `export function List() { return <div draggable="true" />; }`;
    const issues = await runRule(source, makeConfig());
    expect(issues).toHaveLength(1);
    expect(issues[0].ruleId).toBe('wcag/dragging-movements');
    expect(issues[0].severity).toBe('medium');
    expect(issues[0].aiSpecific).toBe(false);
    expect(issues[0].message).toBe(
      'draggable element lacks a pointer or keyboard alternative',
    );
    expect(issues[0].advice).toBe(
      'Provide an onClick, onKeyDown, or button role as an alternative to dragging.',
    );
  });

  it('does not flag draggable="false"', async () => {
    const source = `export function List() { return <div draggable="false" />; }`;
    const issues = await runRule(source, makeConfig());
    expect(issues).toHaveLength(0);
  });

  it('does not flag a draggable element with onClick', async () => {
    const source = `export function List() { return <div draggable="true" onClick={() => {}} />; }`;
    const issues = await runRule(source, makeConfig());
    expect(issues).toHaveLength(0);
  });

  it('does not flag a draggable element with onKeyDown', async () => {
    const source = `export function List() { return <div draggable="true" onKeyDown={() => {}} />; }`;
    const issues = await runRule(source, makeConfig());
    expect(issues).toHaveLength(0);
  });

  it('does not flag a draggable element with onPointerDown', async () => {
    const source = `export function List() { return <div draggable="true" onPointerDown={() => {}} />; }`;
    const issues = await runRule(source, makeConfig());
    expect(issues).toHaveLength(0);
  });

  it('does not flag a draggable element with role="button"', async () => {
    const source = `export function List() { return <div draggable="true" role="button" />; }`;
    const issues = await runRule(source, makeConfig());
    expect(issues).toHaveLength(0);
  });

  it('flags a draggable element with unrelated handlers', async () => {
    const source = `export function List() { return <div draggable="true" onMouseEnter={() => {}} />; }`;
    const issues = await runRule(source, makeConfig());
    expect(issues).toHaveLength(1);
  });
});
