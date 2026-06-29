import { describe, it, expect } from 'vitest';
import { writeFileSync, mkdtempSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { parseFile } from '@usebrick/engine';
import { extractFacts } from '../../../src/engine/visitor';
import { halsteadAnomalyRule } from '../../../src/rules/perf/halstead-anomaly';
import type { Issue, ResolvedConfig, RuleContext } from '../../../src/types';

/**
 * Halstead 1977, *Elements of Software Science*, §3 — Volume
 * anomaly per component. Threshold 0.4 is the v0.10 starting point
 * calibrated against the balanced 1:1 v4 corpus (95k negative / 77k
 * positive files). It will be retuned once per-rule P/R/FPR data
 * lands.
 *
 * Test strategy: V/LOC for normal component code is typically 5–30
 * (each line has 5–10 tokens; vocabulary 10–30; log2(vocab) 3–5).
 * To produce a value below 0.4 we need either very sparse code
 * (many blank lines per real token) or extremely low vocabulary.
 * Both patterns are AI signatures: AI boilerplate often pads the
 * component with whitespace and reuses the same handful of names.
 */

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
  const dir = mkdtempSync(join(tmpdir(), 'slopbrick-halstead-anomaly-test-'));
  try {
    const filePath = join(dir, 'Component.tsx');
    writeFileSync(filePath, source);
    const { ast, source: parsedSource } = await parseFile(filePath);
    const facts = extractFacts(filePath, ast, parsedSource);
    const context: RuleContext = { config, filePath, cwd: dir };
    const ruleContext = halsteadAnomalyRule.create(context);
    return halsteadAnomalyRule.analyze(ruleContext, facts);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

describe('perf/halstead-anomaly', () => {
  it('flags a sparse component with very few unique identifiers per line', async () => {
    // AI boilerplate often pads components with whitespace. V/LOC
    // for normal code is 5–30+; this fixture has ~200 blank lines
    // + a tiny JSX return, producing V/LOC ≈ 0.27 (below 0.4).
    // Vocabulary = 12 (function, Sparse, return, div, x, <, >, /, {, }, 1, ;).
    const blanks = Array(200).fill('').join('\n');
    const source = `function Sparse() {
${blanks}
  return <div>{x}</div>;
}
`;
    const issues = await runRule(source, makeConfig());
    const matches = issues.filter((i) => i.ruleId === 'perf/halstead-anomaly');
    expect(matches.length).toBeGreaterThanOrEqual(1);
    expect(matches[0].severity).toBe('medium');
    expect(matches[0].aiSpecific).toBe(true);
    expect(matches[0].message).toMatch(/volume\/LOC/i);
    expect(matches[0].advice).toBeDefined();
  });

  it('does not flag a component with diverse vocabulary', async () => {
    // A realistic component with varied identifier names, operators,
    // and JSX. V/LOC will be 15–30 — well above the 0.4 threshold.
    const source = `function UserCard({ user, onSelect, theme }) {
  const [expanded, setExpanded] = useState(false);
  const handleClick = (event) => {
    event.preventDefault();
    setExpanded(!expanded);
    if (user && user.id) {
      onSelect(user.id);
    }
  };
  return (
    <div className="card" onClick={handleClick}>
      <span>{user.name}</span>
      <button>{expanded ? 'Hide' : 'Show'}</button>
    </div>
  );
}
`;
    const issues = await runRule(source, makeConfig());
    const matches = issues.filter((i) => i.ruleId === 'perf/halstead-anomaly');
    expect(matches).toHaveLength(0);
  });

  it('does not raise false alarms on a full file of realistic code', async () => {
    // A realistic multi-component file. Each component has rich
    // vocabulary — V/LOC will be well above 0.4 for all of them.
    const source = `import { useState } from 'react';

function Header({ title, subtitle }) {
  return (
    <header className="site-header">
      <h1>{title}</h1>
      {subtitle && <p className="subtitle">{subtitle}</p>}
    </header>
  );
}

function SearchBox({ onSearch }) {
  const [query, setQuery] = useState('');
  const handleSubmit = (event) => {
    event.preventDefault();
    onSearch(query.trim());
  };
  return (
    <form onSubmit={handleSubmit}>
      <input
        type="text"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Search..."
      />
      <button type="submit">Go</button>
    </form>
  );
}

function App() {
  return (
    <div className="app">
      <Header title="Welcome" subtitle="to the demo" />
      <SearchBox onSearch={(q) => console.log(q)} />
    </div>
  );
}

export default App;
`;
    const issues = await runRule(source, makeConfig());
    const matches = issues.filter((i) => i.ruleId === 'perf/halstead-anomaly');
    expect(matches).toHaveLength(0);
  });

  it('short-circuits gracefully when the source is empty', async () => {
    // The rule must not crash when facts.v2._source is missing —
    // it should just return no issues. We approximate this by
    // pointing at an empty file (parse will still produce facts,
    // but _source is empty).
    const source = '';
    const issues = await runRule(source, makeConfig());
    // No components means no per-component issues.
    const matches = issues.filter((i) => i.ruleId === 'perf/halstead-anomaly');
    expect(matches).toHaveLength(0);
  });

  it('skips components smaller than the minimum LOC threshold', async () => {
    // A tiny component (< 5 LOC) is too short for a stable V/LOC
    // ratio and is skipped entirely.
    const source = `function Tiny() {
  return 1;
}
`;
    const issues = await runRule(source, makeConfig());
    const matches = issues.filter((i) => i.ruleId === 'perf/halstead-anomaly');
    expect(matches).toHaveLength(0);
  });
});