import { describe, expect, it } from 'vitest';
import { writeFileSync, mkdtempSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { parseFile } from '@usebrick/engine';
import { extractFacts } from '../../../src/engine/visitor';
import { unusedImportRule } from '../../../src/rules/dead/unused-import';
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
  const dir = mkdtempSync(join(tmpdir(), 'slopbrick-unused-import-test-'));
  try {
    const filePath = join(dir, fileName);
    writeFileSync(filePath, source);
    const { ast, source: parsedSource } = await parseFile(filePath);
    const facts = extractFacts(filePath, ast, parsedSource);
    const context: RuleContext = { config: makeConfig(), filePath, cwd: dir };
    const ruleContext = unusedImportRule.create(context);
    return unusedImportRule.analyze(ruleContext, facts);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

describe('dead/unused-import', () => {
  it('flags a default import that is never used', async () => {
    const source = `import Button from './Button';\nimport './styles.css';\nconst x = 1;\nexport const Component = () => <div>{x}</div>;\n`;
    const issues = await runRule(source);
    expect(issues.length).toBeGreaterThanOrEqual(1);
    const buttonIssue = issues.find((i) => i.message.includes('Button'));
    expect(buttonIssue).toBeDefined();
    expect(buttonIssue!.ruleId).toBe('dead/unused-import');
  });

  it('flags a named import that is never used', async () => {
    const source = `import { useState, useEffect } from 'react';\nconst x = 1;\nexport const Component = () => <div>{x}</div>;\n`;
    const issues = await runRule(source);
    // useState is unused AND useEffect is unused
    const unusedNames = issues
      .filter((i) => i.message.includes("'"))
      .map((i) => {
        const m = i.message.match(/'([^']+)'/);
        return m ? m[1] : null;
      })
      .filter(Boolean);
    expect(unusedNames).toContain('useState');
    expect(unusedNames).toContain('useEffect');
  });

  it('does not flag a named import that IS used', async () => {
    const source = `import { useState } from 'react';\nexport const Component = () => {\n  const [v, setV] = useState(0);\n  return <div onClick={() => setV(v + 1)}>{v}</div>;\n};\n`;
    const issues = await runRule(source);
    const useStateIssue = issues.find((i) => i.message.includes('useState'));
    expect(useStateIssue).toBeUndefined();
  });

  it('does not flag a default import that IS used as JSX', async () => {
    const source = `import Button from './Button';\nexport const Component = () => <Button>Click</Button>;\n`;
    const issues = await runRule(source);
    const buttonIssue = issues.find((i) => i.message.includes('Button'));
    expect(buttonIssue).toBeUndefined();
  });

  it('does not flag a side-effect import (no specifiers)', async () => {
    const source = `import './polyfills';\nconst x = 1;\nexport const Component = () => <div>{x}</div>;\n`;
    const issues = await runRule(source);
    // Side-effect imports have no specifiers to flag.
    expect(issues).toHaveLength(0);
  });

  it('flags aliased imports when the alias is unused', async () => {
    const source = `import { useState as myState } from 'react';\nconst x = 1;\nexport const Component = () => <div>{x}</div>;\n`;
    const issues = await runRule(source);
    // v0.39.0: the visitor now records the post-`as` local binding
    // name (`myState` here, not the original `useState`). The dead-code
    // reference tracker scans for the binding's local name, so
    // aliased-but-unused imports are correctly reported under the
    // local name. Pre-v0.39.0 the visitor stored `useState` and the
    // reference tracker never found `useState` in the source, which
    // caused false negatives on aliased imports — but the old test
    // asserted the buggy "flagged as useState" behavior.
    const issue = issues.find((i) => i.message.includes('myState'));
    expect(issue).toBeDefined();
  });

  it('does not flag a namespace import that IS used', async () => {
    const source = `import * as React from 'react';\nexport const Component = () => <div>{React.useState ? 'x' : 'y'}</div>;\n`;
    const issues = await runRule(source);
    const reactIssue = issues.find((i) => i.message.includes('React'));
    expect(reactIssue).toBeUndefined();
  });
});
