import { describe, expect, it } from 'vitest';
import { writeFileSync, mkdtempSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { expiredCodeExampleRule } from '../../../src/rules/docs/expired-code-example';
import type { Issue, ResolvedConfig, RuleContext, ScanFacts } from '../../../src/types';

function makeConfig(): ResolvedConfig {
  return {
    include: [], exclude: [], rules: {}, frameworkMultipliers: {},
    ruleConfig: {}, arbitraryValueAllowlist: [],
    wcag: { targetSizeExemptSelectors: [] },
    thresholds: { meanSlop: 0, p90Slop: 0, individualSlopThreshold: 0 },
    spacingScale: [], radiusScale: [], clampAllowlist: [], allowedImports: [],
    prScoreThreshold: 0, testIntelligence: { missingEdgeCase: false },
    categoryWeights: {} as ResolvedConfig['categoryWeights'],
    projectMemory: false, telemetry: false,
  };
}

function makeFacts(filePath: string, source: string): ScanFacts {
  return { filePath, v2: { _source: source } as unknown as ScanFacts['v2'] };
}

async function runRule(source: string, pkgJson: object, fileName = 'README.md'): Promise<Issue[]> {
  const dir = mkdtempSync(join(tmpdir(), 'slopbrick-expired-code-test-'));
  try {
    writeFileSync(join(dir, 'package.json'), JSON.stringify(pkgJson));
    const filePath = join(dir, fileName);
    writeFileSync(filePath, source);
    const context: RuleContext = { config: makeConfig(), filePath, cwd: dir };
    const ruleContext = expiredCodeExampleRule.create(context);
    return expiredCodeExampleRule.analyze(ruleContext, makeFacts(filePath, source));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

const basePkg = { name: 'x', version: '1.0.0', dependencies: { react: '^18.0.0' } };

describe('docs/expired-code-example', () => {
  it('flags a ts code block importing an undeclared package', async () => {
    const md = '```ts\nimport { x } from "ghost-pkg";\nexport {};\n```';
    const issues = await runRule(md, basePkg);
    expect(issues.length).toBeGreaterThanOrEqual(1);
    expect(issues[0].ruleId).toBe('docs/expired-code-example');
    expect(issues[0].message).toContain('ghost-pkg');
  });

  it('flags a tsx code block importing an undeclared scoped package', async () => {
    const md = '```tsx\nimport { Btn } from "@scope/missing-ui";\nexport {};\n```';
    const issues = await runRule(md, basePkg);
    expect(issues.length).toBeGreaterThanOrEqual(1);
    expect(issues[0].message).toContain('@scope/missing-ui');
  });

  it('does not flag a code block that imports a declared package', async () => {
    const md = '```ts\nimport { useState } from "react";\nexport {};\n```';
    const issues = await runRule(md, basePkg);
    expect(issues).toHaveLength(0);
  });

  it('does not flag non-code fenced blocks (plain ``` blocks)', async () => {
    const md = '```\nsome plain text\n```';
    const issues = await runRule(md, basePkg);
    expect(issues).toHaveLength(0);
  });

  it('does not flag a single-line code block (requires ≥2 lines)', async () => {
    const md = '```ts\nimport { x } from "ghost-pkg";\n```';
    const issues = await runRule(md, basePkg);
    expect(issues).toHaveLength(0);
  });
});
