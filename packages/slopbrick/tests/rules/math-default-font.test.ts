import { describe, expect, it } from 'vitest';
import { writeFileSync, mkdtempSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { parseFile } from '../../src/engine/parser';
import { extractFacts } from '../../src/engine/visitor';
import { mathDefaultFontRule } from '../../src/rules/visual/math-default-font';
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

async function runRule(source: string, fileName = 'page.tsx'): Promise<Issue[]> {
  const dir = mkdtempSync(join(tmpdir(), 'slopbrick-math-default-font-test-'));
  try {
    const filePath = join(dir, fileName);
    writeFileSync(filePath, source);
    const { ast, source: parsedSource } = await parseFile(filePath);
    const facts = extractFacts(filePath, ast, parsedSource);
    const context: RuleContext = { config: makeConfig(), filePath, cwd: dir };
    const ruleContext = mathDefaultFontRule.create(context);
    return mathDefaultFontRule.analyze(ruleContext, facts);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

describe('visual/math-default-font', () => {
  it('flags \u22653 font-sans usages with no custom font import', async () => {
    const source = `
function Page() {
  return (
    <>
      <div className="font-sans">a</div>
      <div className="font-sans">b</div>
      <div className="font-sans">c</div>
      <div className="font-sans">d</div>
    </>
  );
}`;
    const issues = await runRule(source);
    expect(issues.length).toBeGreaterThanOrEqual(1);
    expect(issues[0].ruleId).toBe('visual/math-default-font');
  });

  it('does not flag when next/font/google import is present', async () => {
    const source = `
import { Inter } from 'next/font/google';
const inter = Inter({ subsets: ['latin'] });
function Page() {
  return (
    <>
      <div className={\`\${inter.className} font-sans\`}>a</div>
      <div className="font-sans">b</div>
      <div className="font-sans">c</div>
      <div className="font-sans">d</div>
    </>
  );
}`;
    const issues = await runRule(source);
    expect(issues).toHaveLength(0);
  });

  it('does not flag when \u2264 2 font-sans usages (below threshold)', async () => {
    const source = `
function Page() {
  return (
    <>
      <div className="font-sans">a</div>
      <div className="font-sans">b</div>
    </>
  );
}`;
    const issues = await runRule(source);
    expect(issues).toHaveLength(0);
  });
});
