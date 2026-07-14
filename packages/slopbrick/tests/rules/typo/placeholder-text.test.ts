import { describe, expect, it } from 'vitest';
import { writeFileSync, mkdtempSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { parseFile } from '@usebrick/engine';
import { extractFacts } from '../../../src/engine/visitor';
import { formatJson } from '../../../src/report/json';
import { placeholderTextRule } from '../../../src/rules/typo/placeholder-text';
import type { Issue, ProjectReport, ResolvedConfig, RuleContext } from '../../../src/types';

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
  const dir = mkdtempSync(join(tmpdir(), 'slopbrick-placeholder-text-test-'));
  try {
    const filePath = join(dir, fileName);
    writeFileSync(filePath, source);
    const { ast, source: parsedSource } = await parseFile(filePath);
    const facts = extractFacts(filePath, ast, parsedSource);
    const context: RuleContext = { config: makeConfig(), filePath, cwd: dir };
    const ruleContext = placeholderTextRule.create(context);
    return placeholderTextRule.analyze(ruleContext, facts);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

describe('typo/placeholder-text', () => {
  it('flags "Lorem ipsum" placeholder', async () => {
    const source = '<input placeholder="Lorem ipsum dolor" />';
    const issues = await runRule(source);
    expect(issues.some((i) => i.ruleId === 'typo/placeholder-text')).toBe(true);
  });

  it('flags "Enter text here" placeholder', async () => {
    const source = '<input placeholder="Enter text here" />';
    const issues = await runRule(source);
    expect(issues.some((i) => i.ruleId === 'typo/placeholder-text')).toBe(true);
  });

  it('flags "TODO" placeholder', async () => {
    const source = '<input placeholder="TODO" />';
    const issues = await runRule(source);
    expect(issues.some((i) => i.ruleId === 'typo/placeholder-text')).toBe(true);
  });

  it('emits an exact matched span and preserves evidence through JSON reports', async () => {
    const source = '<input placeholder="TODO" />';
    const [issue] = await runRule(source);

    expect(issue?.evidence).toEqual({
      kind: 'matched-source-span',
      status: 'exact',
      snippet: 'placeholder="TODO"',
      location: {
        start: { line: 1, column: 8 },
        end: { line: 1, column: 25 },
      },
      matched: {
        field: 'placeholder',
        key: 'placeholder',
        value: 'TODO',
      },
    });

    const report = {
      version: 'test',
      generatedAt: '2026-07-13T00:00:00.000Z',
      issues: [issue],
    } as unknown as ProjectReport;
    const parsed = JSON.parse(formatJson(report)) as { issues: Issue[] };
    expect(parsed.issues[0]?.evidence).toEqual(issue?.evidence);
  });

  it('keeps multiline, CRLF, single-quote, and JSX spans exact with inclusive coordinates', async () => {
    const source = [
      '<section>\r\n',
      "  <input placeholder='TODO' />\r\n",
      '  <input placeholder={"TODO"} />\n',
      '</section>',
    ].join('');
    const issues = await runRule(source);

    expect(issues).toHaveLength(2);
    expect(issues.map((issue) => issue.evidence)).toEqual([
      {
        kind: 'matched-source-span',
        status: 'exact',
        snippet: "placeholder='TODO'",
        location: {
          start: { line: 2, column: 10 },
          end: { line: 2, column: 27 },
        },
        matched: { field: 'placeholder', key: 'placeholder', value: 'TODO' },
      },
      {
        kind: 'matched-source-span',
        status: 'exact',
        snippet: 'placeholder={"TODO"}',
        location: {
          start: { line: 3, column: 10 },
          end: { line: 3, column: 29 },
        },
        matched: { field: 'placeholder', key: 'placeholder', value: 'TODO' },
      },
    ]);
  });

  it('omits an oversized producer span with deterministic metadata in JSON', async () => {
    const value = 'TODO ' + 'x'.repeat(300);
    const source = `<input placeholder="${value}" />`;
    const [issue] = await runRule(source);

    expect(issue?.evidence).toMatchObject({
      kind: 'matched-source-span',
      status: 'omitted',
      location: {
        start: { line: 1, column: 8 },
        end: { line: 1, column: 326 },
      },
      matched: { field: 'placeholder', key: 'placeholder' },
      omission: {
        reason: 'oversized',
        valueChars: value.length,
        snippetChars: `placeholder="${value}"`.length,
      },
    });
    expect(issue?.evidence).not.toHaveProperty('snippet');

    const report = {
      version: 'test',
      generatedAt: '2026-07-13T00:00:00.000Z',
      issues: [issue],
    } as unknown as ProjectReport;
    const serialized = formatJson(report);
    expect(serialized).not.toContain(value);
    expect(JSON.parse(serialized)).toMatchObject({
      issues: [{ evidence: { status: 'omitted', omission: { reason: 'oversized' } } }],
    });
  });

  it('does not flag real-looking placeholder copy', async () => {
    const source = '<input placeholder="Search products" />';
    const issues = await runRule(source);
    expect(issues.filter((i) => i.ruleId === 'typo/placeholder-text')).toEqual([]);
  });

  it('does not flag empty source', async () => {
    const issues = await runRule('');
    expect(issues.filter((i) => i.ruleId === 'typo/placeholder-text')).toEqual([]);
  });
});
