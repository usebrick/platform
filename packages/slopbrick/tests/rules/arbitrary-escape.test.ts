import { describe, expect, it } from 'vitest';
import { writeFileSync, mkdtempSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { parseFile } from '@usebrick/engine';
import { extractFacts } from '../../src/engine/visitor';
import { arbitraryEscapeRule } from '../../src/rules/visual/arbitrary-escape';
import type { ResolvedConfig, RuleContext } from '../../src/types';

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
): Promise<ReturnType<typeof arbitraryEscapeRule.analyze>> {
  const dir = mkdtempSync(join(tmpdir(), 'slopbrick-arbitrary-escape-test-'));
  try {
    const filePath = join(dir, fileName);
    writeFileSync(filePath, source);
    const { ast, source: parsedSource } = await parseFile(filePath);
    const facts = extractFacts(filePath, ast, parsedSource);
    const context: RuleContext = { config, filePath, cwd: dir };
    const ruleContext = arbitraryEscapeRule.create(context);
    return arbitraryEscapeRule.analyze(ruleContext, facts);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

describe('arbitrary-escape', () => {
  it('flags 3+ layout arbitrary values (AI repetition pattern)', async () => {
    const source = `
export function Box() {
  return (
    <div className="w-[100px] p-[13px] m-[21px] gap-[9px]" />
  );
}
`;
    const issues = await runRule(source, makeConfig());
    expect(issues).toHaveLength(1);
    expect(issues[0].ruleId).toBe('visual/arbitrary-escape');
    expect(issues[0].severity).toBe('medium');
  });

  it('ignores 1-2 layout arbitrary values (shadcn-ui one-offs)', async () => {
    const source = `
export function Box() {
  return <div className="w-[100px] p-[13px] bg-[red] text-[14px]" />;
}
`;
    const issues = await runRule(source, makeConfig());
    expect(issues).toHaveLength(0);
  });

  it('exempts non-layout arbitrary values', async () => {
    const source = `
export function Box() {
  return <div className="bg-[red] text-[14px]" />;
}
`;
    const issues = await runRule(source, makeConfig());
    expect(issues).toHaveLength(0);
  });

  it('respects the arbitrary value allowlist', async () => {
    const source = `
export function Box() {
  return (
    <div className="w-[100px] h-[200px] top-[var(--header-height)] p-[13px] m-[21px]" />
  );
}
`;
    const issues = await runRule(
      source,
      makeConfig({
        arbitraryValueAllowlist: ['h-[200px]', /^w-\[calc\(.*\)\]$/],
      }),
    );
    expect(issues.length).toBeGreaterThanOrEqual(1);
    expect(issues[0].message).toMatch(/escaped the design system/);
  });

  it('does not flag standard design tokens', async () => {
    const source = `
export function Box() {
  return <div className="w-10 h-full p-4 m-auto" />;
}
`;
    const issues = await runRule(source, makeConfig());
    expect(issues).toHaveLength(0);
  });

  it('exempts calc() arbitrary values as responsive logic', async () => {
    const source = `
export function Box() {
  return <div className="w-[calc(100%-2rem)]" />;
}
`;
    const issues = await runRule(source, makeConfig());
    expect(issues).toHaveLength(0);
  });
});
