import { describe, expect, it } from 'vitest';
import { writeFileSync, mkdtempSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { parseFile } from '@usebrick/engine';
import { extractFacts } from '../../../src/engine/visitor';
import { naturalnessAnomalyRule } from '../../../src/rules/visual/naturalness-anomaly';
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
    thresholds: {
      meanSlop: 0,
      p90Slop: 0,
      individualSlopThreshold: 0,
    },
    ...overrides,
  };
}

async function runRule(source: string): Promise<Issue[]> {
  const dir = mkdtempSync(join(tmpdir(), 'slopbrick-naturalness-anomaly-test-'));
  try {
    const filePath = join(dir, 'Component.tsx');
    writeFileSync(filePath, source);
    const { ast, source: parsedSource } = await parseFile(filePath);
    const facts = extractFacts(filePath, ast, parsedSource);
    const context: RuleContext = { config: makeConfig(), filePath, cwd: dir };
    const ruleContext = naturalnessAnomalyRule.create(context);
    return naturalnessAnomalyRule.analyze(ruleContext, facts);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

describe('visual/naturalness-anomaly', () => {
  it('flags a component whose identifier stream repeats the same token', async () => {
    // Build a valid array literal where the *only* identifier inside the
    // component body is `data` repeated 60+ times. Comments + numeric
    // literals are stripped by the tokenizer, so the visible identifier
    // stream is dominated by `data`.
    const dataList = Array.from({ length: 60 }, () => 'data').join(', ');
    const source = `
export function BadComponent() {
  const arr = [${dataList}];
  return <div>{arr.length}</div>;
}
`;
    const issues = await runRule(source);
    expect(issues.length).toBeGreaterThanOrEqual(1);
    expect(issues[0].ruleId).toBe('visual/naturalness-anomaly');
    expect(issues[0].aiSpecific).toBe(true);
    expect(issues[0].severity).toBe('medium');
    expect(issues[0].message).toMatch(/distinct tokens/);
    expect(issues[0].advice).toMatch(/Hindle 2012/);
  });

  it('does not flag a component with diverse identifier vocabulary', async () => {
    // Each line introduces new identifiers — high distinct ratio.
    const source = `
export function OrderDashboard() {
  const orders = useOrderList();
  const filtered = orders.filter(o => o.status === 'pending');
  const sorted = filtered.sort((a, b) => a.createdAt - b.createdAt);
  const total = sorted.reduce((sum, order) => sum + order.amount, 0);
  const average = sorted.length > 0 ? total / sorted.length : 0;
  const formatter = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' });
  const formattedTotal = formatter.format(total);
  return (
    <section className="dashboard">
      <header>
        <h2>Pending Orders</h2>
        <p>Average: {formattedTotal}</p>
      </header>
      <ul className="order-list">
        {sorted.map((order) => (
          <li key={order.id} className="order-item">
            <span className="order-id">{order.id}</span>
            <span className="order-customer">{order.customer}</span>
            <span className="order-amount">{formatter.format(order.amount)}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}
`;
    const issues = await runRule(source);
    expect(issues).toHaveLength(0);
  });

  it('does not flag a trivial file (length ≤ 50 tokens)', async () => {
    // 6 lines × ~4 tokens = 24 tokens. Well below MIN_LENGTH = 50.
    const source = `export function Tiny() {\n  const data = 1;\n  const info = 2;\n  const value = 3;\n  return <div />;\n}\n`;
    const issues = await runRule(source);
    expect(issues).toHaveLength(0);
  });

  it('flags one repetitive component but not a diverse sibling in the same file', async () => {
    // The second component body is essentially one identifier (`value`)
    // repeated 70+ times in a valid array literal.
    const valueList = Array.from({ length: 70 }, () => 'value').join(', ');
    const source = `
// diverse component — should NOT fire
export function DiverseComponent() {
  const orders = useOrderList();
  const filtered = orders.filter(o => o.status === 'pending');
  const sorted = filtered.sort((a, b) => a.createdAt - b.createdAt);
  const total = sorted.reduce((sum, order) => sum + order.amount, 0);
  return <div className="order-summary">{total}</div>;
}

// repetitive component — SHOULD fire
export function RepetitiveComponent() {
  const arr = [${valueList}];
  return <div>{arr.length}</div>;
}
`;
    const issues = await runRule(source);
    expect(issues.length).toBeGreaterThanOrEqual(1);
    // At least one issue should be on the repetitive component (later line).
    const lines = source.split('\n');
    const repetitiveLine = lines.findIndex((l) => l.includes('RepetitiveComponent'));
    expect(repetitiveLine).toBeGreaterThan(0);
    const issueLines = issues.map((i) => i.line);
    expect(issueLines.some((l) => l > repetitiveLine)).toBe(true);
  });

  it('emits a message that cites perplexity vs the baseline model', async () => {
    const tokenList = Array.from({ length: 70 }, () => 'token').join(', ');
    const source = `
export function Repetitive() {
  const arr = [${tokenList}];
  return <div />;
}
`;
    const issues = await runRule(source);
    expect(issues.length).toBeGreaterThanOrEqual(1);
    expect(issues[0].message).toMatch(/Perplexity/);
  });
});
