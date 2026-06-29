import { describe, expect, it } from 'vitest';
import { writeFileSync, mkdirSync, mkdtempSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { brokenLinkRule } from '../../../src/rules/docs/broken-link';
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

async function runRule(source: string, fileName = 'README.md'): Promise<Issue[]> {
  const dir = mkdtempSync(join(tmpdir(), 'slopbrick-broken-link-test-'));
  try {
    const filePath = join(dir, fileName);
    writeFileSync(filePath, source);
    const context: RuleContext = { config: makeConfig(), filePath, cwd: dir };
    const ruleContext = brokenLinkRule.create(context);
    return brokenLinkRule.analyze(ruleContext, makeFacts(filePath, source));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

describe('docs/broken-link', () => {
  it('flags a relative link to a missing file', async () => {
    const issues = await runRule('See [guide](./missing-guide.md).');
    expect(issues.length).toBe(1);
    expect(issues[0].ruleId).toBe('docs/broken-link');
    expect(issues[0].message).toContain('./missing-guide.md');
  });

  it('does not flag a relative link to an existing file', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'slopbrick-broken-link-ok-'));
    try {
      mkdirSync(dir, { recursive: true });
      writeFileSync(join(dir, 'other.md'), '# Other');
      const filePath = join(dir, 'README.md');
      writeFileSync(filePath, 'See [other](./other.md).');
      const context: RuleContext = { config: makeConfig(), filePath, cwd: dir };
      const ruleContext = brokenLinkRule.create(context);
      const issues = brokenLinkRule.analyze(ruleContext, makeFacts(filePath, 'See [other](./other.md).'));
      expect(issues).toHaveLength(0);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('does not flag an https link (remote, opt-in)', async () => {
    const issues = await runRule('See [site](https://example.com/docs).');
    expect(issues).toHaveLength(0);
  });

  it('does not flag a #anchor link', async () => {
    const issues = await runRule('Jump to [section](#installation).');
    expect(issues).toHaveLength(0);
  });

  it('does not flag a mailto: link', async () => {
    const issues = await runRule('Email [us](mailto:hi@example.com).');
    expect(issues).toHaveLength(0);
  });

  it('flags multiple broken links independently', async () => {
    const issues = await runRule(
      'See [a](./missing-a.md) and [b](./missing-b.md).',
    );
    expect(issues.length).toBe(2);
  });
});
