import { describe, expect, it } from 'vitest';
import { writeFileSync, mkdtempSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { parseFile } from '@usebrick/engine';
import { extractFacts } from '../../../src/engine/visitor';
import { aiDefaultReactStackRule } from '../../../src/rules/ai/default-react-stack';
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
  const dir = mkdtempSync(join(tmpdir(), 'slopbrick-default-react-stack-test-'));
  try {
    const filePath = join(dir, fileName);
    writeFileSync(filePath, source);
    const { ast, source: parsedSource } = await parseFile(filePath);
    const facts = extractFacts(filePath, ast, parsedSource);
    const context: RuleContext = { config: makeConfig(), filePath, cwd: dir };
    const ruleContext = aiDefaultReactStackRule.create(context);
    return aiDefaultReactStackRule.analyze(ruleContext, facts);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

describe('ai/default-react-stack', () => {
  it('flags TSX file importing 3+ default-stack packages (Sascha 2025)', async () => {
    // 3 default-stack imports + 1 React import = fires (hits >= MIN_HITS=3)
    const source = [
      `import { useQuery } from '@tanstack/react-query';`,
      `import { create } from 'zustand';`,
      `import { Button } from '@/components/ui/button';`,
      `import * as React from 'react';`,
      `export const X = () => null;`,
    ].join('\n');
    const issues = await runRule(source);
    expect(issues.some(i => i.ruleId === 'ai/default-react-stack')).toBe(true);
  });

  it('does not flag TSX file with only React/non-stack imports', async () => {
    const source = [
      `import { useState } from 'react';`,
      `import { foo } from './utils';`,
      `export const X = () => null;`,
    ].join('\n');
    const issues = await runRule(source);
    expect(issues.filter(i => i.ruleId === 'ai/default-react-stack')).toEqual([]);
  });

  it('does not flag TSX file below MIN_HITS=3 (only 2 default-stack imports)', async () => {
    const source = [
      `import { useQuery } from '@tanstack/react-query';`,
      `import { create } from 'zustand';`,
      `import { useState } from 'react';`,
      `export const X = () => null;`,
    ].join('\n');
    const issues = await runRule(source);
    expect(issues.filter(i => i.ruleId === 'ai/default-react-stack')).toEqual([]);
  });
});
