import { describe, expect, it } from 'vitest';
import { writeFileSync, mkdtempSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { parseFile } from '@usebrick/engine';
import { extractFacts } from '../../src/engine/visitor';
import { keyPropMissingRule } from '../../src/rules/logic/key-prop-missing';
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

async function runRule(source: string, config: ResolvedConfig): Promise<Issue[]> {
  const dir = mkdtempSync(join(tmpdir(), 'slopbrick-key-prop-missing-test-'));
  try {
    const filePath = join(dir, 'Component.tsx');
    writeFileSync(filePath, source);
    const { ast, source: parsedSource } = await parseFile(filePath);
    const facts = extractFacts(filePath, ast, parsedSource);
    const context: RuleContext = { config, filePath, cwd: dir };
    const ruleContext = keyPropMissingRule.create(context);
    return keyPropMissingRule.analyze(ruleContext, facts);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

describe('logic/key-prop-missing', () => {
  it('flags elements without a key inside map', async () => {
    const source = `
export function List({ items }) {
  return <ul>{items.map((item) => <li>{item}</li>)}</ul>;
}
`;
    const issues = await runRule(source, makeConfig());
    expect(issues).toHaveLength(1);
    expect(issues[0].ruleId).toBe('logic/key-prop-missing');
  });

  it('does not flag elements with a key', async () => {
    const source = `
export function List({ items }) {
  return <ul>{items.map((item) => <li key={item.id}>{item}</li>)}</ul>;
}
`;
    const issues = await runRule(source, makeConfig());
    expect(issues).toHaveLength(0);
  });

  // Round 25: we reverted the strict "direct child only" behavior of round 23
  // because it dropped recall to 0.00/file on the calibration corpus. The
  // current behavior is depth-based: any JSX inside a .map() is checked.
  // This regains signal at the cost of slightly more inner-element fires.
  // We still document the FP pattern below for future refinement.
  it('does NOT flag inner elements when the outer map child has a key (round 28 fix)', async () => {
    // Round 28: tracking keyDepth in the walker means descendants of a
    // keyed JSX element are silently skipped. The outer <div> has a key,
    // so the inner <span> and <Icon> should not fire key-prop-missing.
    // Only React's reconciliation rule cares about the keyed list child,
    // not its descendants.
    const source = `
export function List({ items }) {
  return (
    <ul>
      {items.map((item) => (
        <div key={item.id}>
          <span>{item.label}</span>
          <Icon name={item.icon} />
        </div>
      ))}
    </ul>
  );
}
`;
    const issues = await runRule(source, makeConfig());
    const keyPropIssues = issues.filter((i) => i.ruleId === 'logic/key-prop-missing');
    expect(keyPropIssues).toHaveLength(0);
  });

  it('flags a map call whose direct JSX child is missing a key', async () => {
    const source = `
export function List({ items }) {
  return (
    <ul>
      {items.map((item) => (
        <div>
          <span>{item.label}</span>
        </div>
      ))}
    </ul>
  );
}
`;
    const issues = await runRule(source, makeConfig());
    expect(issues.length).toBeGreaterThanOrEqual(1);
  });
});
