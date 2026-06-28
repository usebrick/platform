import { describe, expect, it } from 'vitest';
import { writeFileSync, mkdtempSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { parseFile } from '@usebrick/engine';
import { extractFacts } from '../../src/engine/visitor';
import { importPathMismatchRule } from '../../src/rules/context/import-path-mismatch';
import type { Issue, ResolvedConfig, RuleContext } from '../../src/types';

function makeConfig(allowedImports?: string[]): ResolvedConfig {
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
    allowedImports,
  };
}

async function runRule(
  source: string,
  config: ResolvedConfig,
  fileName = 'Component.tsx',
): Promise<Issue[]> {
  const dir = mkdtempSync(join(tmpdir(), 'slopbrick-import-path-test-'));
  try {
    const filePath = join(dir, fileName);
    writeFileSync(filePath, source);
    const { ast, source: parsedSource } = await parseFile(filePath);
    const facts = extractFacts(filePath, ast, parsedSource);
    const context: RuleContext = { config, filePath, cwd: dir };
    const ruleContext = importPathMismatchRule.create(context);
    return importPathMismatchRule.analyze(ruleContext, facts);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

describe('context/import-path-mismatch', () => {
  it('flags imports that do not match any allowed prefix', async () => {
    const source = `import { Button } from '@/components/Button';\nexport const X = () => <Button>x</Button>;\n`;
    const issues = await runRule(
      source,
      makeConfig(['@/components/ui/']),
    );
    expect(issues).toHaveLength(1);
    expect(issues[0].ruleId).toBe('context/import-path-mismatch');
    expect(issues[0].message).toContain('@/components/Button');
  });

  it('does not flag imports that match an allowed prefix', async () => {
    const source = `import { Button } from '@/components/ui/button';\nexport const X = () => <Button>x</Button>;\n`;
    const issues = await runRule(
      source,
      makeConfig(['@/components/ui/']),
    );
    expect(issues).toHaveLength(0);
  });

  it('does not flag third-party imports', async () => {
    const source = `import React from 'react';\nexport const X = () => <div>x</div>;\n`;
    const issues = await runRule(
      source,
      makeConfig(['@/components/ui/']),
    );
    expect(issues).toHaveLength(0);
  });

  it('no-ops when allowedImports is empty', async () => {
    const source = `import { Button } from '@/components/Button';\nexport const X = () => <Button>x</Button>;\n`;
    const issues = await runRule(source, makeConfig([]));
    expect(issues).toHaveLength(0);
  });
});
