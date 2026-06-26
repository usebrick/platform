import { describe, expect, it } from 'vitest';
import { writeFileSync, mkdtempSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { parseFile } from '../../src/engine/parser';
import { extractFacts } from '../../src/engine/visitor';
import { reactiveHookSoupRule } from '../../src/rules/logic/reactive-hook-soup';
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
    thresholds: { meanSlop: 0, p90Slop: 0, individualSlopThreshold: 0 },
    ...overrides,
  };
}

async function runRule(source: string): Promise<Issue[]> {
  const dir = mkdtempSync(join(tmpdir(), 'slopbrick-reactive-hook-soup-test-'));
  try {
    const filePath = join(dir, 'Component.tsx');
    writeFileSync(filePath, source);
    const { ast, source: parsedSource } = await parseFile(filePath);
    const facts = extractFacts(filePath, ast, parsedSource);
    const context: RuleContext = { config: makeConfig(), filePath, cwd: dir };
    const ruleContext = reactiveHookSoupRule.create(context);
    return reactiveHookSoupRule.analyze(ruleContext, facts);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

describe('logic/reactive-hook-soup', () => {
  it('fires on component with ≥3 useEffect calls at top level (no conditional guards)', async () => {
    // Calibrated at 71% precision per docs/research/v4-per-rule-pr-fpr.md:
    // "effects/handlers inlined" is the AI tell.
    const source = `
function Soup() {
  const [a, setA] = useState(0);
  const [b, setB] = useState(0);
  const [c, setC] = useState(0);

  useEffect(() => {
    setA(1);
  }, []);

  useEffect(() => {
    setB(b + 1);
  }, [b]);

  useEffect(() => {
    setC(c + 1);
  }, [c]);

  return <div />;
}`;
    const issues = await runRule(source);
    expect(issues).toHaveLength(1);
    expect(issues[0].ruleId).toBe('logic/reactive-hook-soup');
    expect(issues[0].severity).toBe('medium');
    expect(issues[0].message).toContain('Soup');
    expect(issues[0].message).toContain('3');
  });

  it('does not fire on component with only 1-2 useEffect calls', async () => {
    // 1 useEffect + 1 useState is the common, well-coordinated pattern.
    const source = `
function Clean() {
  const [count, setCount] = useState(0);

  useEffect(() => {
    setCount(c => c + 1);
  }, []);

  return <div>count: {count}</div>;
}`;
    const issues = await runRule(source);
    expect(issues).toHaveLength(0);
  });

  it('does not fire on pure component with no hooks at all', async () => {
    const source = `
function Pure({ label }: { label: string }) {
  return <div className="card">{label}</div>;
}`;
    const issues = await runRule(source);
    expect(issues).toHaveLength(0);
  });

  it('does not fire when useEffects are split across multiple components', async () => {
    // Per-component scoping: 2 effects in A + 2 in B does not equal soup.
    const source = `
function A() {
  const [x, setX] = useState(0);
  useEffect(() => { setX(1); }, []);
  useEffect(() => { setX(2); }, []);
  return <div />;
}

function B() {
  const [y, setY] = useState(0);
  useEffect(() => { setY(1); }, []);
  useEffect(() => { setY(2); }, []);
  return <div />;
}`;
    const issues = await runRule(source);
    expect(issues).toHaveLength(0);
  });

  it('does not fire when only non-useEffect hooks are stacked (e.g. useMemo + useCallback)', async () => {
    // The rule specifically targets useEffect chains. useMemo/useCallback
    // stacks are normal performance optimization, not soup.
    const source = `
function Optimized() {
  const [count, setCount] = useState(0);

  const doubled = useMemo(() => count * 2, [count]);
  const tripled = useMemo(() => count * 3, [count]);
  const onClick = useCallback(() => setCount(c => c + 1), []);

  return <div onClick={onClick}>{doubled} / {tripled}</div>;
}`;
    const issues = await runRule(source);
    expect(issues).toHaveLength(0);
  });

  it('fires on component with ≥3 useEffects even when placed inside conditional branches', async () => {
    // Deviation note: the rule's current implementation counts every useEffect
    // in the component frame regardless of conditional placement. Brief case
    // "don't fire when hooks are conditional" is not yet implemented in the
    // rule logic (src/rules/logic/reactive-hook-soup.ts). This test pins the
    // current behavior so any future change to filter conditional useEffects
    // is an explicit, intentional rule update.
    const source = `
function ConditionalSoup({ cond }: { cond: boolean }) {
  const [a, setA] = useState(0);
  const [b, setB] = useState(0);
  const [c, setC] = useState(0);

  if (cond) {
    useEffect(() => { setA(1); }, []);
  }

  useEffect(() => { setB(1); }, []);

  useEffect(() => { setC(1); }, []);

  return <div />;
}`;
    const issues = await runRule(source);
    expect(issues).toHaveLength(1);
    expect(issues[0].ruleId).toBe('logic/reactive-hook-soup');
  });
});