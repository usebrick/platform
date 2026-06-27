import { describe, expect, it } from 'vitest';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { formatUnifiedDiff } from '../../src/report/unified-diff.js';
import type { FixSuggestion, Issue, ProjectReport } from '../../src/types.js';

function makeFix(overrides: Omit<FixSuggestion, 'description'> & Partial<Pick<FixSuggestion, 'description'>>): FixSuggestion {
  return {
    description: 'suggested fix',
    ...overrides,
  };
}

function makeIssue(fix: FixSuggestion): Issue {
  return {
    ruleId: 'layout-token',
    category: 'layout',
    severity: 'medium',
    aiSpecific: false,
    message: 'replace one-off class',
    filePath: 'src/page.tsx',
    line: 5,
    column: 10,
    fix,
    fixes: [],
  };
}

function makeReport(issues: Issue[]): ProjectReport {
  return {
    version: '0.6.0',
    generatedAt: new Date().toISOString(),
    slopIndex: 10,
    assemblyHealth: 90,
    totalScore: 10,
    categoryScores: {
      visual: 0,
      typo: 0,
      wcag: 0,
      layout: 10,
      component: 0,
      logic: 0,
      arch: 0,
      perf: 0,
      security: 0,      test: 0,    docs: 0,    db: 0,    ai: 0,    context: 0,    product: 0,    i18n: 0,},
    boundaryScore: 0,
    contextScore: 0,
    visualScore: 50.0,
    p90Score: 100,
    peakScore: 100,
    componentCount: 1,
    fileCount: 1,
    thresholds: { meanSlop: 25, p90Slop: 50, individualSlopThreshold: 50 },
    components: [],
    issues,
  };
}

describe('formatUnifiedDiff', () => {
  it('returns empty string when there are no fixes', () => {
    const cwd = mkdtempSync(join(tmpdir(), 'slop-diff-'));
    try {
      const report = makeReport([]);
      expect(formatUnifiedDiff(report, cwd)).toBe('');
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  });

  it('emits a unified diff for a replace fix', () => {
    const cwd = mkdtempSync(join(tmpdir(), 'slop-diff-'));
    const file = join(cwd, 'Button.tsx');
    writeFileSync(file, 'line1\nline2\nm-4\nline4\n', 'utf-8');

    try {
      const report = makeReport([
        makeIssue(makeFix({
          kind: 'replace',
          targetFile: file,
          oldValue: 'm-4',
          newValue: 'm-spacing-4',
        })),
      ]);

      const output = formatUnifiedDiff(report, cwd);
      expect(output).toContain('--- a/Button.tsx');
      expect(output).toContain('+++ b/Button.tsx');
      expect(output).toContain('-m-4');
      expect(output).toContain('+m-spacing-4');
      expect(output).toMatch(/@@ -\d+,\d+ \+\d+,\d+ @@/);
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  });

  it('emits a unified diff for an insert fix', () => {
    const cwd = mkdtempSync(join(tmpdir(), 'slop-diff-'));
    const file = join(cwd, 'globals.css');
    writeFileSync(file, ':root {\n  --color-primary: red;\n}\n', 'utf-8');

    try {
      const issue: Issue = {
        ruleId: 'color-hardcoded',
        category: 'visual',
        severity: 'medium',
        aiSpecific: false,
        message: 'missing token',
        filePath: 'src/page.tsx',
        line: 1,
        column: 1,
        fix: makeFix({
          kind: 'insert',
          targetFile: file,
          newValue: '.token-red { color: var(--color-primary); }',
        }),
        fixes: [],
      };

      const output = formatUnifiedDiff(makeReport([issue]), cwd);
      expect(output).toContain('--- a/globals.css');
      expect(output).toContain('+++ b/globals.css');
      expect(output).toContain('+');
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  });

  it('omits files that do not exist', () => {
    const cwd = mkdtempSync(join(tmpdir(), 'slop-diff-'));
    try {
      const report = makeReport([
        makeIssue(makeFix({
          kind: 'replace',
          targetFile: join(cwd, 'missing.tsx'),
          oldValue: 'x',
          newValue: 'y',
        })),
      ]);
      expect(formatUnifiedDiff(report, cwd)).toBe('');
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  });

  it('omits fixes that would not change the file', () => {
    const cwd = mkdtempSync(join(tmpdir(), 'slop-diff-'));
    const file = join(cwd, 'A.tsx');
    writeFileSync(file, 'already-token\n', 'utf-8');

    try {
      const report = makeReport([
        makeIssue(makeFix({
          kind: 'replace',
          targetFile: file,
          oldValue: 'missing',
          newValue: 'token',
        })),
      ]);
      expect(formatUnifiedDiff(report, cwd)).toBe('');
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  });

  it('collects multiple fixes on the same file', () => {
    const cwd = mkdtempSync(join(tmpdir(), 'slop-diff-'));
    const file = join(cwd, 'Page.tsx');
    writeFileSync(file, 'm-4 p-8\n', 'utf-8');

    try {
      const issue: Issue = {
        ruleId: 'layout-token',
        category: 'layout',
        severity: 'medium',
        aiSpecific: false,
        message: 'two tokens',
        filePath: 'Page.tsx',
        line: 1,
        column: 1,
        fix: makeFix({
          kind: 'replace',
          targetFile: file,
          oldValue: 'm-4',
          newValue: 'm-spacing-4',
        }),
        fixes: [
          makeFix({
            kind: 'replace',
            targetFile: file,
            oldValue: 'p-8',
            newValue: 'p-spacing-8',
          }),
        ],
      };

      const output = formatUnifiedDiff(makeReport([issue]), cwd);
      expect(output).toContain('-m-4 p-8');
      expect(output).toContain('+m-spacing-4 p-spacing-8');
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  });
});
