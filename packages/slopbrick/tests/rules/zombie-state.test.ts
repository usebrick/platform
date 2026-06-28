import { describe, expect, it } from 'vitest';
import { writeFileSync, mkdtempSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { parseFile } from '@usebrick/engine';
import { extractFacts } from '../../src/engine/visitor';
import { zombieStateRule } from '../../src/rules/logic/zombie-state';
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

async function runRule(source: string): Promise<Issue[]> {
  const dir = mkdtempSync(join(tmpdir(), 'slopbrick-zombie-state-test-'));
  try {
    const filePath = join(dir, 'Component.tsx');
    writeFileSync(filePath, source);
    const { ast, source: parsedSource } = await parseFile(filePath);
    const facts = extractFacts(filePath, ast, parsedSource);
    const context: RuleContext = { config: makeConfig(), filePath, cwd: dir };
    const ruleContext = zombieStateRule.create(context);
    return zombieStateRule.analyze(ruleContext, facts);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

describe('logic/zombie-state', () => {
  it('flags useState that is never read', async () => {
    const source = `
function Component() {
  const [count, setCount] = useState(0);
  return <div>hello</div>;
}`;
    const issues = await runRule(source);
    expect(issues.length).toBeGreaterThanOrEqual(1);
    expect(issues[0].ruleId).toBe('logic/zombie-state');
  });

  it('does not flag useState that is read in JSX', async () => {
    const source = `
function Component() {
  const [count, setCount] = useState(0);
  return <div>{count}</div>;
}`;
    const issues = await runRule(source);
    expect(issues).toHaveLength(0);
  });

  it('does not flag useState that is read via the setter', async () => {
    const source = `
function Component() {
  const [count, setCount] = useState(0);
  useEffect(() => { setCount(c => c + 1); }, []);
  return <div>count: {count}</div>;
}`;
    const issues = await runRule(source);
    expect(issues).toHaveLength(0);
  });

  it('does not flag non-useState bindings', async () => {
    const source = `
function Component() {
  const count = 0;
  const unused = 'dead';
  return <div>{count}</div>;
}`;
    const issues = await runRule(source);
    expect(issues).toHaveLength(0);
  });
});
