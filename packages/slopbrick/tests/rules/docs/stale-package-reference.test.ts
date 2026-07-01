import { describe, expect, it } from 'vitest';
import { writeFileSync, mkdtempSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { stalePackageReferenceRule } from '../../../src/rules/docs/stale-package-reference';
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
  // Markdown isn't parsed by parseFile; build the facts envelope
  // manually since the rule only reads `facts.v2?._source`.
  return { filePath, v2: { _source: source } as unknown as ScanFacts['v2'] };
}

async function runRule(source: string, pkgJson: object, fileName = 'README.md'): Promise<Issue[]> {
  const dir = mkdtempSync(join(tmpdir(), 'slopbrick-stale-pkg-test-'));
  try {
    writeFileSync(join(dir, 'package.json'), JSON.stringify(pkgJson));
    const filePath = join(dir, fileName);
    writeFileSync(filePath, source);
    const context: RuleContext = { config: makeConfig(), filePath, cwd: dir };
    const ruleContext = stalePackageReferenceRule.create(context);
    return stalePackageReferenceRule.analyze(ruleContext, makeFacts(filePath, source));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

const basePkg = { name: 'x', version: '1.0.0', dependencies: { react: '^18.0.0' } };

describe('docs/stale-package-reference', () => {
  it('flags npm install of an undeclared package', async () => {
    const issues = await runRule('Run `npm install leftpad` first.', basePkg);
    expect(issues.length).toBeGreaterThanOrEqual(1);
    expect(issues[0].ruleId).toBe('docs/stale-package-reference');
    expect(issues[0].message).toContain('leftpad');
  });

  it('flags pnpm add of an undeclared scoped package', async () => {
    const issues = await runRule('Use `pnpm add @scope/missing-pkg` to install.', basePkg);
    expect(issues.length).toBeGreaterThanOrEqual(1);
    expect(issues[0].message).toContain('@scope/missing-pkg');
  });

  it('flags inline import from an undeclared package', async () => {
    // The rule matches the install/import keyword + path on the SAME line
    // as an inline code span — fenced blocks are handled by the sibling
    // dup/identical-block rule.
    const md = "Use `import { x } from 'ghost-pkg'` in your code.";
    const issues = await runRule(md, basePkg);
    expect(issues.length).toBeGreaterThanOrEqual(1);
    expect(issues[0].message).toContain('ghost-pkg');
  });

  it('does not flag a package that is declared', async () => {
    const issues = await runRule('Run `npm install react` first.', basePkg);
    expect(issues).toHaveLength(0);
  });

  it('does not flag bare code spans without install/import context', async () => {
    const issues = await runRule('Use the `useState` hook here.', basePkg);
    expect(issues).toHaveLength(0);
  });

  it('does not flag denylist words like npm / npx', async () => {
    const issues = await runRule('Run `npm install` (no args).', basePkg);
    expect(issues).toHaveLength(0);
  });
});
