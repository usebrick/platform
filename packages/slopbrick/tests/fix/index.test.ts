import { describe, expect, it } from 'vitest';
import { existsSync, mkdtempSync, rmSync, writeFileSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { applyFixes } from '../../src/fix';
import { sha256Text } from '../../src/fix/binding';
import type { Issue, ProjectReport, ResolvedConfig } from '../../src/types';

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

function makeReport(overrides?: Partial<ProjectReport>): ProjectReport {
  return {
    version: '0.6.0',
    generatedAt: '2024-01-01T00:00:00.000Z',
    aiSlopScore: 0, engineeringHygiene: 0, security: 0, repositoryHealth: 0,
    assemblyHealth: 100,
    totalScore: 0,
    categoryScores: {
      visual: 0,
      typo: 0,
      wcag: 0,
      layout: 0,
      component: 0,
      logic: 0,
      arch: 0,
      perf: 0,
      security: 0,      test: 0,    docs: 0,    db: 0,    ai: 0,    context: 0,    product: 0,    i18n: 0,},
    p90Score: 0,
    peakScore: 0,
    boundaryScore: 0,
    contextScore: 0,
    visualScore: 0,
    componentCount: 0,
    fileCount: 1,
    thresholds: { meanSlop: 25, p90Slop: 50, individualSlopThreshold: 50 },
    components: [],
    issues: [],
    ...overrides,
  };
}

function baseIssue(overrides: Partial<Issue> & Pick<Issue, 'ruleId' | 'category' | 'severity' | 'aiSpecific'>): Issue {
  const issue: Issue = {
    message: 'test issue',
    line: 1,
    column: 1,
    ...overrides,
  };
  const fixes = [...(issue.fix ? [issue.fix] : []), ...(issue.fixes ?? [])];
  for (const fix of fixes) {
    const sourcePath = issue.filePath ?? fix.targetFile;
    if (!sourcePath || !existsSync(sourcePath)) continue;
    const source = readFileSync(sourcePath, 'utf-8');
    fix.binding = {
      kind: 'slopbrick-fix-binding-v1',
      ruleId: issue.ruleId,
      filePath: sourcePath,
      line: issue.line,
      column: issue.column,
      sourceSha256: sha256Text(source),
      targetSha256: sha256Text(source),
    };
    issue.filePath ??= sourcePath;
  }
  return issue;
}

describe('applyFixes', () => {
  it('groups and applies multiple fix kinds across files', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'slopbrick-fix-index-test-'));
    try {
      const clientFile = join(dir, 'Client.tsx');
      const layoutFile = join(dir, 'Layout.tsx');
      const cssFile = join(dir, 'globals.css');

      writeFileSync(clientFile, 'export function Page() { return <div />; }\n');
      writeFileSync(layoutFile, 'export function Box() { return <div className="p-[13px]" />; }\n');
      writeFileSync(cssFile, 'body { margin: 0; }\n');

      const report = makeReport({
        issues: [
          baseIssue({
            ruleId: 'logic/boundary-violation',
            category: 'logic',
            severity: 'high',
            aiSpecific: true,
            fix: {
              kind: 'insert',
              description: 'Insert "use client" directive',
              targetFile: clientFile,
            },
          }),
          baseIssue({
            ruleId: 'visual/arbitrary-escape',
            category: 'visual',
            severity: 'medium',
            aiSpecific: true,
            fixes: [
              {
                kind: 'replace',
                description: "Replace 'p-[13px]' with 'p-3'",
                targetFile: layoutFile,
                oldValue: 'p-[13px]',
                newValue: 'p-3',
              },
            ],
          }),
          baseIssue({
            ruleId: 'wcag/focus-appearance',
            category: 'wcag',
            severity: 'high',
            aiSpecific: false,
            fix: {
              kind: 'css-anchor',
              description: 'Inject global focus-ring CSS block',
              targetFile: cssFile,
              anchor: '@slopbrick:v1.0.0:fix:focus-ring',
            },
          }),
        ],
      });

      const results = await applyFixes(report, makeConfig({ globalCssTarget: cssFile }));
      const byFile = new Map(results.map((r) => [r.filePath, r]));

      expect(byFile.get(clientFile)?.applied.length).toBe(1);
      expect(byFile.get(layoutFile)?.applied.length).toBe(1);
      expect(byFile.get(cssFile)?.applied.length).toBe(1);

      expect(readFileSync(clientFile, 'utf-8').startsWith('"use client";')).toBe(true);
      expect(readFileSync(layoutFile, 'utf-8')).toContain('className="p-3"');
      expect(readFileSync(cssFile, 'utf-8')).toContain('@slopbrick:v1.0.0:fix:focus-ring');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('deduplicates insert fixes for the same file', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'slopbrick-fix-index-test-'));
    try {
      const clientFile = join(dir, 'Client.tsx');
      writeFileSync(clientFile, 'export function Page() { return <div />; }\n');

      const report = makeReport({
        issues: [
          baseIssue({
            ruleId: 'logic/boundary-violation',
            category: 'logic',
            severity: 'high',
            aiSpecific: true,
            fix: {
              kind: 'insert',
              description: 'Insert "use client" directive',
              targetFile: clientFile,
            },
          }),
          baseIssue({
            ruleId: 'logic/boundary-violation',
            category: 'logic',
            severity: 'high',
            aiSpecific: true,
            fix: {
              kind: 'insert',
              description: 'Insert "use client" directive',
              targetFile: clientFile,
            },
          }),
        ],
      });

      const results = await applyFixes(report, makeConfig());
      expect(results).toHaveLength(1);
      expect(results[0].applied).toHaveLength(2);
      expect(readFileSync(clientFile, 'utf-8').match(/"use client";/g)).toHaveLength(1);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('reports skipped insert fixes when the directive is already present', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'slopbrick-fix-index-test-'));
    try {
      const clientFile = join(dir, 'Client.tsx');
      writeFileSync(clientFile, '"use client";\nexport function Page() { return <div />; }\n');

      const report = makeReport({
        issues: [
          baseIssue({
            ruleId: 'logic/boundary-violation',
            category: 'logic',
            severity: 'high',
            aiSpecific: true,
            fix: {
              kind: 'insert',
              description: 'Insert "use client" directive',
              targetFile: clientFile,
            },
          }),
        ],
      });

      const results = await applyFixes(report, makeConfig());
      expect(results[0].applied).toHaveLength(0);
      expect(results[0].skipped).toHaveLength(1);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('reports errors for missing global CSS targets without failing the whole run', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'slopbrick-fix-index-test-'));
    try {
      const cssFile = join(dir, 'globals.css');

      const report = makeReport({
        issues: [
          baseIssue({
            ruleId: 'wcag/focus-appearance',
            category: 'wcag',
            severity: 'high',
            aiSpecific: false,
            fix: {
              kind: 'css-anchor',
              description: 'Inject global focus-ring CSS block',
              targetFile: cssFile,
              anchor: '@slopbrick:v1.0.0:fix:focus-ring',
            },
          }),
        ],
      });

      const results = await applyFixes(report, makeConfig());
      expect(results[0].skipped).toHaveLength(1);
      expect(results[0].applied).toHaveLength(0);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
