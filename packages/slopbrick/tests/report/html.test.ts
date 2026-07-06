import { describe, expect, it } from 'vitest';
import { formatHtml } from '../../src/report/html.js';
import type { Issue, ProjectReport } from '../../src/types.js';

function makeReport(overrides: Partial<ProjectReport> & { issues?: Issue[] } = {}): ProjectReport {
  return {
    version: '0.6.0',
    generatedAt: '2026-06-15T00:00:00.000Z',
    configPath: 'slopbrick.config.js',
    aiSlopScore: 34.2, engineeringHygiene: 34.2, security: 34.2, repositoryHealth: 34.2,
    assemblyHealth: 65.8,
    totalScore: 34.2,
    categoryScores: {
      visual: 12.5,
      typo: 8.0,
      wcag: 15.2,
      layout: 3.1,
      component: 9.9,
      logic: 21.4,
      arch: 4.2,
      perf: 0,
      security: 0,      test: 0,    docs: 0,    db: 0,    ai: 0,    context: 0,    product: 0,    i18n: 0,},
    boundaryScore: 25.0,
    contextScore: 30.0,
    visualScore: 50.0,
    p90Score: 88.0,
    peakScore: 92.0,
    componentCount: 12,
    fileCount: 2,
    thresholds: { meanSlop: 25, p90Slop: 50, individualSlopThreshold: 50 },
    components: [
      {
        filePath: 'src/pages/Home.tsx',
        rawScore: 12.0,
        componentScore: 8.0,
        adjustedScore: 30.0,
        componentCount: 1,
      },
      {
        filePath: 'src/components/Button.tsx',
        rawScore: 4.0,
        componentScore: 3.0,
        adjustedScore: 12.0,
        componentCount: 1,
      },
    ],
    issues: [],
    ...overrides,
  };
}

function makeIssue(overrides: Partial<Issue> & Pick<Issue, 'ruleId' | 'filePath'>): Issue {
  return {
    category: 'visual',
    severity: 'medium',
    aiSpecific: true,
    message: 'Sample issue message',
    line: 1,
    column: 1,
    ...overrides,
  };
}

describe('formatHtml', () => {
  it('returns a complete HTML document with the required title', () => {
    const output = formatHtml(makeReport());
    expect(output).toMatch(/^<!DOCTYPE html>/i);
    expect(output).toContain('<title>slopbrick report</title>');
    expect(output).toContain('</html>');
  });

  it('renders header summary numbers and severity counts', () => {
    const output = formatHtml(makeReport());
    expect(output).toContain('Version 0.6.0');
    expect(output).toContain('2026-06-15T00:00:00.000Z');
    expect(output).toContain('66'); // rounded assembly health
    expect(output).toContain('high');
    expect(output).toContain('medium');
    expect(output).toContain('low');
  });

  it('renders the 4 named scores (v0.15.0+) replacing the single slopIndex', () => {
    const output = formatHtml(makeReport({
      // v0.15.0+: provide the 4 named scores so they render with
      // numeric values. These fields are added to ProjectReport in U.5;
      // until then the renderer reads them through a temporary cast.
      repositoryHealth: 81,
    } as Partial<ProjectReport>));
    expect(output).toContain('Repository Health');
    expect(output).toContain('AI Slop Score');
    expect(output).toContain('Engineering Hygiene');
    expect(output).toContain('Security');
    expect(output).toContain('81'); // repositoryHealth rounded
    expect(output).not.toContain('Slop Index');
    expect(output).not.toContain('slop-index');
  });

  it('renders threshold rows with pass or fail status', () => {
    const output = formatHtml(makeReport({
      repositoryHealth: 85,
    } as Partial<ProjectReport>));
    expect(output).toContain('Repository Health');
    expect(output).toContain('status-pass');
    expect(output).toContain('status-fail');
  });

  it('v0.42.0: AI Slop Score threshold row uses report.thresholds.meanSlop', () => {
    // The HTML threshold table had hardcoded "limit 70" on the
    // Repository Health row (the v0.15 inverted reading). v0.42.0
    // fixed this by adding an explicit "AI Slop Score (CI gate)" row
    // that reads report.thresholds.meanSlop and the lower-is-better
    // direction.
    const output = formatHtml(makeReport({
      aiSlopScore: 25,
      thresholds: { meanSlop: 15, p90Slop: 30, individualSlopThreshold: 60 },
    } as Partial<ProjectReport>));
    expect(output).toContain('AI Slop Score (CI gate)');
    // The display reads "25.0 / 15" and shows fail (25 > 15).
    expect(output).toContain('25.0 / 15');
    expect(output).toContain('status-fail');
  });

  it('renders the 3-bucket taxonomy (v0.15.0+ U.2)', () => {
    const output = formatHtml(makeReport({
      // v0.15.0+: provide verdict data so the bucket sections render
      // with non-zero counts. These fields land on ProjectReport in U.5.
      verdicts: ['USEFUL', 'USEFUL', 'OK', 'HYGIENE', 'INVERTED', 'NOISY'],
      ruleVerdicts: [
        { ruleId: 'zombie-state', verdict: 'USEFUL', confidence: 'High' },
        { ruleId: 'placeholder-density', verdict: 'USEFUL' },
        { ruleId: 'leaky-meta', verdict: 'OK' },
        { ruleId: 'css-bloat', verdict: 'HYGIENE', message: 'CSS Bloat' },
        { ruleId: 'unused-export', verdict: 'INVERTED' },
        { ruleId: 'false-positive-x', verdict: 'NOISY' },
      ],
    } as Partial<ProjectReport>));
    expect(output).toContain('Findings by bucket');
    expect(output).toContain('AI Findings');
    expect(output).toContain('Engineering Hygiene');
    expect(output).toContain('Suppressed Rules');
    expect(output).toContain('zombie-state');
    expect(output).toContain('css-bloat');
    expect(output).toContain('2 Useful · 1 OK'); // ai bucket summary (per spec)
    expect(output).toContain('1 Hygiene · 1 Inverted'); // engineering hygiene bucket
    expect(output).toContain('1 Noisy'); // suppressed bucket summary
  });

  it('renders category breakdown with labels and bars', () => {
    const output = formatHtml(makeReport());
    expect(output).toContain('Visual');
    expect(output).toContain('Logic');
    expect(output).toContain('Accessibility');
    expect(output).toContain('bar-fill');
  });

  it('renders file rows and expandable issue subrows', () => {
    const issues: Issue[] = [
      makeIssue({
        ruleId: 'magic-spacing',
        category: 'layout',
        severity: 'medium',
        filePath: 'src/components/Button.tsx',
        message: 'Avoid magic spacing values in layout',
        line: 14,
        column: 22,
        advice: 'Replace with a spacing token from the design system.',
      }),
    ];
    const output = formatHtml(makeReport({ issues }));
    expect(output).toContain('src/pages/Home.tsx');
    expect(output).toContain('src/components/Button.tsx');
    expect(output).toContain('magic-spacing');
    expect(output).toContain('Avoid magic spacing values in layout');
    expect(output).toContain('Replace with a spacing token from the design system.');
  });

  it('escapes HTML characters in issue messages and advice', () => {
    const issues: Issue[] = [
      makeIssue({
        ruleId: 'xss-test',
        filePath: 'src/<bad>.tsx',
        message: 'Use <token> & "value"',
        advice: 'Replace <script> & "value"',
      }),
    ];
    const output = formatHtml(makeReport({ issues }));
    expect(output).not.toContain('Use <token>');
    expect(output).toContain('Use &lt;token&gt;');
    expect(output).toContain('&amp;');
    expect(output).toContain('&quot;value&quot;');
    expect(output).not.toContain('Replace <script>');
    expect(output).toContain('Replace &lt;script&gt;');
  });

  it('renders embedded CSS and JS for sorting, filtering, and expansion', () => {
    const output = formatHtml(makeReport());
    expect(output).toContain('<style>');
    expect(output).toContain('<script>');
    expect(output).toContain('sortTable');
    expect(output).toContain('filterIssues');
    expect(output).toContain('expand-toggle');
  });

  it('renders parse errors when present', () => {
    const output = formatHtml(
      makeReport({
        parseErrors: [{ filePath: 'src/bad.tsx', error: 'Unexpected token\n  at line 5' }],
      }),
    );
    expect(output).toContain('Parse errors');
    expect(output).toContain('src/bad.tsx');
    expect(output).toContain('Unexpected token');
    expect(output).not.toContain('at line 5');
  });
});
