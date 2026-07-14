import { describe, expect, it } from 'vitest';
import { writeFileSync, mkdtempSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { parseFile } from '@usebrick/engine';
import { extractFacts } from '../../../src/engine/visitor';
import { aiCommentRatioRule } from '../../../src/rules/ai/comment-ratio';
import type { Issue, ResolvedConfig, RuleContext } from '../../../src/types';
import signalStrengthData from '../../../src/rules/signal-strength.json';

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
    return aiCommentRatioRule.analyze(aiCommentRatioRule.create(context), facts);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

describe('ai/comment-ratio', () => {
  it('flags low comment ratio from supported TypeScript facts', async () => {
    const source = Array.from({ length: 30 }, (_, index) => `const value${index} = ${index};`).join('\n');
    const issues = await runRule(source);
    expect(issues).toHaveLength(1);
    expect(issues[0].message).toMatch(/low/i);
  });

  it('flags high comment ratio from supported TypeScript facts', async () => {
    const code = Array.from({ length: 10 }, (_, index) => `const value${index} = ${index};`);
    const comments = Array.from({ length: 20 }, (_, index) => `// explanation ${index}`);
    const issues = await runRule([...code, ...comments].join('\n'));
    expect(issues).toHaveLength(1);
    expect(issues[0].message).toMatch(/high/i);
    expect(issues[0].message).toMatch(/provisional parser-backed thresholds/i);
    expect(issues[0].message).not.toMatch(/corpus mean/i);
  });

  it('does not flag a supported TypeScript file inside the corpus band', async () => {
    const code = Array.from({ length: 20 }, (_, index) => `const value${index} = ${index};`);
    const comments = Array.from({ length: 3 }, (_, index) => `// explanation ${index}`);
    expect(await runRule([...code, ...comments].join('\n'))).toHaveLength(0);
  });

  it.each([
    'fixture.py',
    'fixture.go',
    'fixture.rs',
    'fixture.java',
    'fixture.kt',
    'fixture.swift',
    'fixture.dart',
    'fixture.vue',
    'fixture.svelte',
    'fixture.astro',
  ])('abstains for parser-untrusted input %s', async (fileName) => {
    const apparentComments = Array.from({ length: 30 }, (_, index) => `// apparent comment ${index}`);
    expect(await runRule(apparentComments.join('\n'), fileName)).toHaveLength(0);
  });

  it('does not flag files below 20 lines', async () => {
    expect(await runRule('const a = 1;\nconst b = 2;\nconst c = 3;\n')).toHaveLength(0);
  });

  it('gates on 20 non-empty lines rather than blank padding', async () => {
    const source = ['const value = 1;', ...Array.from({ length: 19 }, () => '')].join('\n');
    expect(await runRule(source)).toHaveLength(0);
  });

  it('is explicitly default-off until v10.3 recalibrates the parser-backed metric', () => {
    const entry = (signalStrengthData as Record<string, { defaultOff?: boolean; _calibrationNote?: string }>)[
      'ai/comment-ratio'
    ];
    expect(entry?.defaultOff).toBe(true);
    expect(entry?._calibrationNote).toMatch(/parser-backed metric.*v10\.3/i);
  });
});
