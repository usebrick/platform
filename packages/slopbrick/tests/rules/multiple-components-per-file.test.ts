import { describe, expect, it } from 'vitest';
import { writeFileSync, mkdtempSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { parseFile } from '@usebrick/engine';
import { extractFacts } from '../../src/engine/visitor';
import { multipleComponentsPerFileRule } from '../../src/rules/component/multiple-components-per-file';
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
  fileName = 'Card.tsx',
): Promise<Issue[]> {
  const dir = mkdtempSync(join(tmpdir(), 'slopbrick-multi-comp-test-'));
  try {
    const filePath = join(dir, fileName);
    writeFileSync(filePath, source);
    const { ast, source: parsedSource } = await parseFile(filePath);
    const facts = extractFacts(filePath, ast, parsedSource);
    const context: RuleContext = { config, filePath, cwd: dir };
    const ruleContext = multipleComponentsPerFileRule.create(context);
    return multipleComponentsPerFileRule.analyze(ruleContext, facts);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

describe('component/multiple-components-per-file', () => {
  it('flags a file with 2+ component definitions', async () => {
    const source = `
export function Card() { return <div>card</div>; }
export function CardHeader() { return <div>header</div>; }
export function CardBody() { return <div>body</div>; }
`;
    const issues = await runRule(source, makeConfig());
    expect(issues).toHaveLength(1);
    expect(issues[0].ruleId).toBe('component/multiple-components-per-file');
    expect(issues[0].severity).toBe('medium');
    expect(issues[0].message).toContain('3 components');
    expect(issues[0].message).toContain('2 extra');
  });

  it('does not flag a file with a single component', async () => {
    const source = `
export function Card() { return <div>card</div>; }
function helper(x: number) { return x + 1; }
`;
    const issues = await runRule(source, makeConfig());
    expect(issues).toHaveLength(0);
  });

  it('does not flag a file with helpers but no JSX components', async () => {
    const source = `
export function add(a: number, b: number) { return a + b; }
export function subtract(a: number, b: number) { return a - b; }
`;
    const issues = await runRule(source, makeConfig());
    expect(issues).toHaveLength(0);
  });
});
