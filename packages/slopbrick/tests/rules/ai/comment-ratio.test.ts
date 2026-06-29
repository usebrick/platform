import { describe, expect, it } from 'vitest';
import { writeFileSync, mkdtempSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { parseFile } from '@usebrick/engine';
import { extractFacts } from '../../../src/engine/visitor';
import { aiCommentRatioRule } from '../../../src/rules/ai/comment-ratio';
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
  const dir = mkdtempSync(join(tmpdir(), 'slopbrick-comment-ratio-test-'));
  try {
    const filePath = join(dir, fileName);
    writeFileSync(filePath, source);
    const { ast, source: parsedSource } = await parseFile(filePath);
    const facts = extractFacts(filePath, ast, parsedSource);
    const context: RuleContext = { config: makeConfig(), filePath, cwd: dir };
    const ruleContext = aiCommentRatioRule.create(context);
    return aiCommentRatioRule.analyze(ruleContext, facts);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

describe('ai/comment-ratio', () => {
  it('flags low comment ratio (reductive LLM signature)', async () => {
    // 30 lines of code, 0 comment lines -> ratio 0.0 (below FALLBACK_LOW 0.05)
    const lines: string[] = [];
    for (let i = 0; i < 30; i++) {
      lines.push(`const value${i} = ${i};`);
    }
    const source = lines.join('\n');
    const issues = await runRule(source);
    expect(issues.length).toBeGreaterThanOrEqual(1);
    expect(issues[0].ruleId).toBe('ai/comment-ratio');
    expect(issues[0].message).toMatch(/low/i);
  });

  it('flags high comment ratio (expansive LLM signature)', async () => {
    // 10 lines of code, 20 comment lines -> comment ratio > 0.45 (high direction)
    const codeLines: string[] = [];
    for (let i = 0; i < 10; i++) codeLines.push(`const v${i} = ${i};`);
    const commentLines: string[] = [];
    for (let i = 0; i < 20; i++) commentLines.push(`// helpful explanation ${i}`);
    const source = [...codeLines, ...commentLines].join('\n');
    const issues = await runRule(source);
    expect(issues.length).toBeGreaterThanOrEqual(1);
    expect(issues[0].ruleId).toBe('ai/comment-ratio');
    expect(issues[0].message).toMatch(/high/i);
  });

  it('does not flag balanced comment ratio inside corpus band', async () => {
    // 20 code lines + 3 comment lines = ratio ~0.13 (inside [0.05, 0.45])
    const lines: string[] = [];
    for (let i = 0; i < 20; i++) lines.push(`const v${i} = ${i};`);
    for (let i = 0; i < 3; i++) lines.push(`// note ${i}`);
    const source = lines.join('\n');
    const issues = await runRule(source);
    expect(issues).toHaveLength(0);
  });

  it('does not flag files below 20 lines (MIN_FILE_LINES)', async () => {
    const source = 'const a = 1;\nconst b = 2;\nconst c = 3;\n';
    const issues = await runRule(source);
    expect(issues).toHaveLength(0);
  });
});
