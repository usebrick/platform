import { describe, expect, it } from 'vitest';
import { writeFileSync, mkdtempSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { parseFile } from '@usebrick/engine';
import { extractFacts } from '../../src/engine/visitor';
import { qwikHookLeakRule } from '../../src/rules/logic/qwik-hook-leak';
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
  const dir = mkdtempSync(join(tmpdir(), 'slopbrick-qwik-hook-leak-test-'));
  try {
    const filePath = join(dir, fileName);
    writeFileSync(filePath, source);
    const { ast, source: parsedSource } = await parseFile(filePath);
    const facts = extractFacts(filePath, ast, parsedSource);
    const context: RuleContext = { config, filePath, cwd: dir };
    const ruleContext = qwikHookLeakRule.create(context);
    return qwikHookLeakRule.analyze(ruleContext, facts);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

describe('logic/qwik-hook-leak', () => {
  it('flags React hooks when the file imports from @builder.io/qwik', async () => {
    const source = `
import { component$ } from '@builder.io/qwik';

export const Counter = component$(() => {
  const [count, setCount] = useState(0);
  useEffect(() => {}, []);
  return <div>{count}</div>;
});
`;
    const issues = await runRule(source, makeConfig());
    expect(issues).toHaveLength(2);
    expect(issues.map((i) => i.message).sort()).toEqual([
      'React hook used inside a Qwik component',
      'React hook used inside a Qwik component',
    ]);
    expect(issues[0].ruleId).toBe('logic/qwik-hook-leak');
    expect(issues[0].severity).toBe('high');
    expect(issues[0].aiSpecific).toBe(true);
    expect(issues[0].advice).toBe(
      'Use Qwik primitives ($state, $effect, useSignal) instead of React hooks.',
    );
  });

  it('flags React hooks when config.framework is qwik', async () => {
    const source = `
export function Counter() {
  const [count, setCount] = useState(0);
  return <div>{count}</div>;
}
`;
    const issues = await runRule(source, makeConfig({ framework: 'qwik' }));
    expect(issues).toHaveLength(1);
    expect(issues[0].message).toBe('React hook used inside a Qwik component');
  });

  it('flags useContext inside a Qwik component', async () => {
    const source = `
import { component$ } from '@builder.io/qwik';

export const App = component$(() => {
  const ctx = useContext(MyContext);
  return <div />;
});
`;
    const issues = await runRule(source, makeConfig());
    expect(issues).toHaveLength(1);
    expect(issues[0].message).toBe('React hook used inside a Qwik component');
  });

  it('does not flag non-React hooks inside a Qwik component', async () => {
    const source = `
import { component$, useSignal } from '@builder.io/qwik';

export const Counter = component$(() => {
  const count = useSignal(0);
  return <div>{count.value}</div>;
});
`;
    const issues = await runRule(source, makeConfig());
    expect(issues).toHaveLength(0);
  });

  it('does not flag React hooks in a non-Qwik file', async () => {
    const source = `
import { useState } from 'react';

export function Counter() {
  const [count, setCount] = useState(0);
  return <div>{count}</div>;
}
`;
    const issues = await runRule(source, makeConfig());
    expect(issues).toHaveLength(0);
  });
});
