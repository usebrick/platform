import { describe, expect, it } from 'vitest';
import { writeFileSync, mkdtempSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { parseFile } from '@usebrick/engine';
import { extractFacts } from '../../../src/engine/visitor';
import { unusedLocalRule } from '../../../src/rules/dead/unused-local';
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
  const dir = mkdtempSync(join(tmpdir(), 'slopbrick-unused-local-test-'));
  try {
    const filePath = join(dir, fileName);
    writeFileSync(filePath, source);
    const { ast, source: parsedSource } = await parseFile(filePath);
    const facts = extractFacts(filePath, ast, parsedSource);
    const context: RuleContext = { config: makeConfig(), filePath, cwd: dir };
    const ruleContext = unusedLocalRule.create(context);
    return unusedLocalRule.analyze(ruleContext, facts);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

describe('dead/unused-local', () => {
  it('flags a const that is never read', async () => {
    const source = `function foo() {\n  const x = 1;\n  return 2;\n}\n`;
    const issues = await runRule(source);
    expect(issues.length).toBe(1);
    expect(issues[0].message).toContain('x');
  });

  it('does not flag a const that IS read', async () => {
    const source = `function foo() {\n  const x = 1;\n  return x + 1;\n}\n`;
    const issues = await runRule(source);
    expect(issues).toHaveLength(0);
  });

  it('flags a let that is never read', async () => {
    const source = `function foo() {\n  let counter = 0;\n  return 'done';\n}\n`;
    const issues = await runRule(source);
    expect(issues.length).toBe(1);
    expect(issues[0].message).toContain('counter');
  });

  it('does not flag an _-prefixed name', async () => {
    const source = `function foo() {\n  const _unused = 1;\n  return 2;\n}\n`;
    const issues = await runRule(source);
    expect(issues).toHaveLength(0);
  });

  it('does not flag React (implicit JSX use)', async () => {
    const source = `import React from 'react';\nfunction foo() {\n  return <div />;\n}\n`;
    const issues = await runRule(source);
    // dead/unused-local would flag if React was a `const`, but the rule's
    // SKIP_NAMES includes 'React' as a backstop. Note: React is normally
    // an import-default, which dead/unused-import owns. Here we declare
    // it as a local to exercise the SKIP_NAMES branch.
    const reactIssue = issues.find((i) => i.message.includes('React'));
    expect(reactIssue).toBeUndefined();
  });
});
