import { describe, expect, it } from 'vitest';
import { writeFileSync, mkdtempSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { parseFile } from '@usebrick/engine';
import { extractFacts } from '../../../src/engine/visitor';
import { aiStateDefaultOveruseRule } from '../../../src/rules/ai/state-default-overuse';
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
  const dir = mkdtempSync(join(tmpdir(), 'slopbrick-state-default-test-'));
  try {
    const filePath = join(dir, fileName);
    writeFileSync(filePath, source);
    const { ast, source: parsedSource } = await parseFile(filePath);
    const facts = extractFacts(filePath, ast, parsedSource);
    const context: RuleContext = { config: makeConfig(), filePath, cwd: dir };
    const ruleContext = aiStateDefaultOveruseRule.create(context);
    return aiStateDefaultOveruseRule.analyze(ruleContext, facts);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

describe('ai/state-default-overuse', () => {
  it('flags TSX file with ≥5 useState and no useReducer / state lib', async () => {
    const source = [
      "import React, { useState } from 'react';",
      'export function Component() {',
      '  const [a, setA] = useState(0);',
      '  const [b, setB] = useState(0);',
      '  const [c, setC] = useState(0);',
      '  const [d, setD] = useState(0);',
      '  const [e, setE] = useState(0);',
      '  const [f, setF] = useState(0);',
      '  return null;',
      '}',
    ].join('\n');
    const issues = await runRule(source);
    expect(issues.length).toBeGreaterThanOrEqual(1);
    expect(issues[0].ruleId).toBe('ai/state-default-overuse');
    expect(issues[0].aiSpecific).toBe(true);
    expect(`${issues[0].message}\n${issues[0].advice}`).not.toMatch(/LLM|human code|verify authorship/i);
  });

  it('does not flag when useReducer is present alongside useState', async () => {
    const source = [
      "import React, { useState, useReducer } from 'react';",
      'export function Component() {',
      '  const [a, setA] = useState(0);',
      '  const [b, setB] = useState(0);',
      '  const [c, setC] = useState(0);',
      '  const [d, setD] = useState(0);',
      '  const [e, setE] = useState(0);',
      '  const [f, setF] = useState(0);',
      '  const [s, dispatch] = useReducer(reducer, init);',
      '  return null;',
      '}',
    ].join('\n');
    const issues = await runRule(source);
    expect(issues).toHaveLength(0);
  });

  it('does not flag when a state library (Zustand) is imported', async () => {
    const source = [
      "import React, { useState } from 'react';",
      "import { create } from 'zustand';",
      'export function Component() {',
      '  const [a, setA] = useState(0);',
      '  const [b, setB] = useState(0);',
      '  const [c, setC] = useState(0);',
      '  const [d, setD] = useState(0);',
      '  const [e, setE] = useState(0);',
      '  const [f, setF] = useState(0);',
      '  return null;',
      '}',
    ].join('\n');
    const issues = await runRule(source);
    expect(issues).toHaveLength(0);
  });

  it('does not flag when fewer than 5 useState calls', async () => {
    const source = [
      "import React, { useState } from 'react';",
      'export function Component() {',
      '  const [a, setA] = useState(0);',
      '  const [b, setB] = useState(0);',
      '  return null;',
      '}',
    ].join('\n');
    const issues = await runRule(source);
    expect(issues).toHaveLength(0);
  });
});
