import { describe, expect, it } from 'vitest';
import { writeFileSync, mkdtempSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { parseFile } from '@usebrick/engine';
import { extractFacts } from '../../../src/engine/visitor';
import { aiMarkdownLeakageRule } from '../../../src/rules/ai/markdown-leakage';
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
  const dir = mkdtempSync(join(tmpdir(), 'slopbrick-markdown-leakage-test-'));
  try {
    const filePath = join(dir, fileName);
    writeFileSync(filePath, source);
    const { ast, source: parsedSource } = await parseFile(filePath);
    const facts = extractFacts(filePath, ast, parsedSource);
    const context: RuleContext = { config: makeConfig(), filePath, cwd: dir };
    const ruleContext = aiMarkdownLeakageRule.create(context);
    return aiMarkdownLeakageRule.analyze(ruleContext, facts);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

describe('ai/markdown-leakage', () => {
  it('flags bare language name on the first line of a TSX file', async () => {
    // "python" as a bare first line is a leaked Markdown language tag
    // — AI chat outputs often emit the language name before the code.
    const source = 'python\nfunction foo() { return 1; }\n';
    const issues = await runRule(source);
    expect(issues.some((i) => i.ruleId === 'ai/markdown-leakage')).toBe(true);
  });

  it('flags stray Markdown fence in a Markdown file', async () => {
    // An opening ```python fence at the top of a .md file — the rule's
    // FENCE_ONLY_RE matches and the next non-blank line is code-like.
    const source = '# Title\n```python\ndef foo():\n    pass\n```\n';
    const issues = await runRule(source, 'README.md');
    expect(issues.some((i) => i.ruleId === 'ai/markdown-leakage')).toBe(true);
  });

  it('does not flag normal TypeScript source', async () => {
    const source = [
      'const x = 1;',
      'const y = 2;',
      'function add(a: number, b: number): number { return a + b; }',
      'export { add };',
    ].join('\n');
    const issues = await runRule(source);
    expect(issues.filter((i) => i.ruleId === 'ai/markdown-leakage')).toEqual([]);
  });

  it('does not flag empty source', async () => {
    const issues = await runRule('');
    expect(issues.filter((i) => i.ruleId === 'ai/markdown-leakage')).toEqual([]);
  });
});
