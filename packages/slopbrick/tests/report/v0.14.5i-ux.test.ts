import { describe, it, expect } from 'vitest';
import { formatPretty, formatWhyFailingReport } from '../../src/report/pretty';
import type { ProjectReport, Issue } from '../../src/types';

function makeReport(overrides: Partial<ProjectReport> = {}): ProjectReport {
  return {
    version: '0.14.5i',
    generatedAt: '2026-06-28T00:00:00.000Z',
    slopIndex: 25,
    assemblyHealth: 75,
    totalScore: 0,
    categoryScores: {
      visual: 70, typo: 0, wcag: 0, layout: 0, component: 0, logic: 68, arch: 0,
      perf: 0, security: 0, test: 0, docs: 0, db: 0, ai: 167, context: 0,
      product: 0, i18n: 0,
    },
    boundaryScore: 10,
    contextScore: 50,
    visualScore: 5,
    subscores: {},
    p90Score: 12,
    peakScore: 18,
    componentCount: 0,
    fileCount: 95,
    components: [],
    issues: [],
    thresholds: { meanSlop: 15, p90Slop: 30, individualSlopThreshold: 60 },
    topOffenders: [
      { filePath: 'src/cli/scan.ts', adjustedScore: 87.5, issueCount: 12 },
      { filePath: 'src/engine/parser.ts', adjustedScore: 62.3, issueCount: 8 },
    ],
    ...overrides,
  };
}

function makeIssue(overrides: Partial<Issue> = {}): Issue {
  return {
    ruleId: 'test/rule',
    category: 'ai',
    severity: 'high',
    aiSpecific: true,
    message: 'test',
    line: 1,
    column: 1,
    filePath: 'src/test.ts',
    ...overrides,
  };
}

describe('v0.14.5i UX improvements', () => {
  // P4: slopIndex is the SINGLE headline, matches health.json
  describe('P4: unified headline number', () => {
    it('renders Slop Index as the primary headline', () => {
      const out = formatPretty(makeReport({ slopIndex: 25 }));
      expect(out).toContain('Slop Index:');
      expect(out).toContain('25');
      expect(out).toMatch(/Slop Index: \s*25 \/ 100/);
    });

    it('shows Coherence as secondary view when present', () => {
      const out = formatPretty(
        makeReport({ slopIndex: 25, coherence: 60, coherenceBreakdown: { architectureConsistency: 0, patternFragmentation: 0, constitutionMapped: 100, aiDebtMapped: 50 } }),
      );
      expect(out).toContain('Slop Index:');
      expect(out).toContain('Repository Coherence:');
      expect(out).toContain('60');
    });

    it('uses [PASS] / [FAIL] status based on slopIndex >= 70', () => {
      const pass = formatPretty(makeReport({ slopIndex: 75 }));
      const fail = formatPretty(makeReport({ slopIndex: 25 }));
      expect(pass).toContain('[PASS]');
      expect(fail).toContain('[FAIL]');
    });

    it('shows subscore breakdown (boundary/context/visual)', () => {
      const out = formatPretty(
        makeReport({ boundaryScore: 10, contextScore: 50, visualScore: 5 }),
      );
      expect(out).toContain('boundary:');
      expect(out).toContain('context:');
      expect(out).toContain('visual:');
      expect(out).toContain('(40%)');
      expect(out).toContain('(35%)');
      expect(out).toContain('(25%)');
    });
  });

  // P5: defaultOff suppression is in the main output, not stderr
  describe('P5: defaultOff trust signal', () => {
    it('renders the suppression line in main output when count > 0', () => {
      const out = formatPretty(
        makeReport({ defaultOffSuppressedCount: 99, defaultOffRuleCount: 24 }),
      );
      expect(out).toContain('99 INVERTED/NOISY');
      expect(out).toContain('24 default-off rule');
      expect(out).toContain('suppressed');
    });

    it('does NOT render the suppression line when count is 0', () => {
      const out = formatPretty(
        makeReport({ defaultOffSuppressedCount: 0, defaultOffRuleCount: 0 }),
      );
      expect(out).not.toContain('INVERTED/NOISY');
    });

    it('handles missing defaultOffSuppressedCount gracefully (legacy reports)', () => {
      const out = formatPretty(makeReport());
      expect(out).not.toContain('INVERTED/NOISY');
      // Should not crash
    });
  });

  // P1: per-category breakdown table
  describe('P1: per-category breakdown', () => {
    it('renders the category breakdown section', () => {
      const out = formatPretty(makeReport());
      expect(out).toContain('Category breakdown');
      expect(out).toContain('ai');
      expect(out).toContain('visual');
      expect(out).toContain('logic');
    });

    it('shows bar characters for visual ranking', () => {
      const out = formatPretty(makeReport());
      // Should contain the bar chars (█ or ░)
      expect(out).toMatch(/[█▓▒░]/);
    });

    it('handles empty categoryScores', () => {
      const allZero = Object.fromEntries(
        Object.keys({
          visual: 0, typo: 0, wcag: 0, layout: 0, component: 0, logic: 0, arch: 0,
          perf: 0, security: 0, test: 0, docs: 0, db: 0, ai: 0, context: 0,
          product: 0, i18n: 0,
        }).map((k) => [k, 0]),
      );
      const out = formatPretty(makeReport({ categoryScores: allZero as ProjectReport['categoryScores'] }));
      expect(out).toContain('no active categories');
    });
  });

  // P0: Next step footer with highest-impact action
  describe('P0: next-step footer', () => {
    it('renders the Next step section', () => {
      const out = formatPretty(makeReport());
      expect(out).toContain('Next step');
    });

    it('suggests the top offending file for --rule', () => {
      const out = formatPretty(
        makeReport({
          topOffenders: [{ filePath: 'src/Card.tsx', adjustedScore: 87.5, issueCount: 12 }],
        }),
      );
      expect(out).toContain('src/Card.tsx');
      expect(out).toContain('--rule');
    });

    it('always offers --suggest as a fallback', () => {
      const out = formatPretty(makeReport());
      expect(out).toContain('--suggest');
    });

    it('mentions --why-failing when score is below 70', () => {
      const out = formatPretty(makeReport({ slopIndex: 25 }));
      expect(out).toContain('--why-failing');
    });

    it('does NOT mention --why-failing when score is at/above 70', () => {
      const out = formatPretty(makeReport({ slopIndex: 75 }));
      expect(out).not.toContain('--why-failing');
    });
  });

  // P3: --why-failing output
  describe('P3: --why-failing report', () => {
    it('ranks rules by weighted impact (severity × count)', () => {
      const issues: Issue[] = [
        // rule A: 3 high = 15 points
        makeIssue({ ruleId: 'rule/a', severity: 'high' }),
        makeIssue({ ruleId: 'rule/a', severity: 'high' }),
        makeIssue({ ruleId: 'rule/a', severity: 'high' }),
        // rule B: 1 high = 5 points
        makeIssue({ ruleId: 'rule/b', severity: 'high' }),
        // rule C: 5 low = 5 points
        ...Array.from({ length: 5 }, () => makeIssue({ ruleId: 'rule/c', severity: 'low' })),
      ];
      const out = formatWhyFailingReport(makeReport({ issues, slopIndex: 15 }));
      const aPos = out.indexOf('rule/a');
      const bPos = out.indexOf('rule/b');
      const cPos = out.indexOf('rule/c');
      expect(aPos).toBeGreaterThan(0);
      expect(bPos).toBeGreaterThan(aPos);
      expect(cPos).toBeGreaterThan(bPos);
    });

    it('excludes off-severity issues (defaultOff suppressed)', () => {
      const issues: Issue[] = [
        makeIssue({ ruleId: 'rule/active', severity: 'high' }),
        makeIssue({ ruleId: 'rule/suppressed', severity: 'off' as Issue['severity'] }),
        makeIssue({ ruleId: 'rule/suppressed', severity: 'off' as Issue['severity'] }),
        makeIssue({ ruleId: 'rule/suppressed', severity: 'off' as Issue['severity'] }),
      ];
      const out = formatWhyFailingReport(makeReport({ issues }));
      expect(out).toContain('rule/active');
      expect(out).not.toContain('rule/suppressed');
    });

    it('returns clean message when no active issues', () => {
      const out = formatWhyFailingReport(makeReport({ issues: [], slopIndex: 100 }));
      expect(out).toContain('Nothing is failing');
    });

    it('shows the headline score in the output', () => {
      const out = formatWhyFailingReport(
        makeReport({ slopIndex: 15, issues: [makeIssue({ ruleId: 'rule/test', severity: 'high' })] }),
      );
      expect(out).toContain('15/100');
    });
  });

  // Integration: full report renders all sections in order
  describe('integration: full report', () => {
    it('renders all 5 UX sections in correct order', () => {
      const out = formatPretty(
        makeReport({
          defaultOffSuppressedCount: 99,
          defaultOffRuleCount: 24,
          issues: [makeIssue({ ruleId: 'rule/test', severity: 'high' })],
        }),
      );
      // P4 first (headline)
      expect(out.indexOf('Slop Index:')).toBeGreaterThan(0);
      // P5 second (trust signal)
      expect(out.indexOf('99 INVERTED')).toBeGreaterThan(out.indexOf('Slop Index:'));
      // P1 third (category breakdown)
      expect(out.indexOf('Category breakdown')).toBeGreaterThan(out.indexOf('99 INVERTED'));
      // Thresholds
      expect(out.indexOf('Thresholds')).toBeGreaterThan(out.indexOf('Category breakdown'));
      // P0 last (next step)
      expect(out.indexOf('Next step')).toBeGreaterThan(out.indexOf('Thresholds'));
    });
  });
});
