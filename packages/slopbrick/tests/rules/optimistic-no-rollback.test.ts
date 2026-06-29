import { describe, expect, it } from 'vitest';
import { writeFileSync, mkdtempSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { parseFile } from '@usebrick/engine';
import { extractFacts } from '../../src/engine/visitor';
import { optimisticNoRollbackRule } from '../../src/rules/logic/optimistic-no-rollback';
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
  const dir = mkdtempSync(join(tmpdir(), 'slopbrick-optimistic-no-rollback-test-'));
  try {
    const filePath = join(dir, 'Component.tsx');
    writeFileSync(filePath, source);
    const { ast, source: parsedSource } = await parseFile(filePath);
    const facts = extractFacts(filePath, ast, parsedSource);
    const context: RuleContext = { config, filePath, cwd: dir };
    const ruleContext = optimisticNoRollbackRule.create(context);
    return optimisticNoRollbackRule.analyze(ruleContext, facts);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

describe('logic/optimistic-no-rollback', () => {
  it('flags optimistic setter before await without catch rollback', async () => {
    const source = `
function Component() {
  const [items, setItems] = useState([]);
  const addItem = async (item) => {
    try {
      setItems([...items, item]);
      await fetch('/api/items', { method: 'POST', body: JSON.stringify(item) });
    } catch (e) {
      console.error(e);
    }
  };
  return <div />;
}
`;
    const issues = await runRule(source, makeConfig());
    expect(issues).toHaveLength(1);
    expect(issues[0].ruleId).toBe('logic/optimistic-no-rollback');
  });

  it('does not flag when catch rolls back', async () => {
    const source = `
function Component() {
  const [items, setItems] = useState([]);
  const addItem = async (item) => {
    try {
      setItems([...items, item]);
      await fetch('/api/items', { method: 'POST', body: JSON.stringify(item) });
    } catch (e) {
      setItems(items);
    }
  };
  return <div />;
}
`;
    const issues = await runRule(source, makeConfig());
    expect(issues).toHaveLength(0);
  });

  it('does not flag setter after await', async () => {
    const source = `
function Component() {
  const [items, setItems] = useState([]);
  const addItem = async (item) => {
    const res = await fetch('/api/items');
    setItems([...items, await res.json()]);
  };
  return <div />;
}
`;
    const issues = await runRule(source, makeConfig());
    expect(issues).toHaveLength(0);
  });
});
