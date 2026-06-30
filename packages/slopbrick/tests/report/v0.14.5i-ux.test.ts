import { describe, it, expect } from 'vitest';
import { formatPretty, formatWhyFailingReport, formatBriefReport } from '../../src/report/pretty';
import type { ProjectReport, Issue } from '../../src/types';

function makeReport(overrides: Partial<ProjectReport> = {}): ProjectReport {
  return {
    version: '0.14.5i',
    generatedAt: '2026-06-28T00:00:00.000Z',
    aiQuality: 25, engineeringHygiene: 25, security: 25, repositoryHealth: 25,
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
  // P4: aiQuality (v3 replacement for slopIndex) is the SINGLE
  // headline, matches health.json
  describe('P4: unified headline number', () => {
    it('renders AI Quality as the primary headline', () => {
      const out = formatPretty(makeReport({ aiQuality: 25 }));
      // v0.15.0 U.4: the v3 headline is "AI Quality" (the v0.14
      // "Slop Index" wording is replaced).
      expect(out).toContain('AI Quality:');
      expect(out).toContain('25');
      expect(out).toMatch(/AI Quality: \s*25 \/ 100/);
    });

    it('shows Coherence as secondary view when present', () => {
      const out = formatPretty(
        makeReport({ aiQuality: 25, coherence: 60, coherenceBreakdown: { architectureConsistency: 0, patternFragmentation: 0, constitutionMapped: 100, aiDebtMapped: 50 } }),
      );
      expect(out).toContain('AI Quality:');
      expect(out).toContain('Repository Coherence:');
      expect(out).toContain('60');
    });

    it('uses plain-language band labels (v0.14.5j) instead of [PASS] / [FAIL]', () => {
      const excellent = formatPretty(makeReport({ aiQuality: 95 }));
      const passing = formatPretty(makeReport({ aiQuality: 75 }));
      const needsWork = formatPretty(makeReport({ aiQuality: 50 }));
      const concerning = formatPretty(makeReport({ aiQuality: 25 }));
      expect(excellent).toContain('[EXCELLENT]');
      expect(passing).toContain('[PASSING]');
      expect(needsWork).toContain('[NEEDS WORK]');
      expect(concerning).toContain('[CONCERNING]');
    });

    it('uses [PASS] / [FAIL] in the Threshold section (CI gate)', () => {
      // v0.14.5j kept the [PASS]/[FAIL] in the Threshold (CI gate)
      // section because that's the bit CI scripts grep for.
      const pass = formatPretty(makeReport({ aiQuality: 75 }));
      const fail = formatPretty(makeReport({ aiQuality: 25 }));
      expect(pass).toContain('pass');
      expect(fail).toContain('fail');
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
      // v0.18.1: the explainer legitimately mentions "INVERTED/NOISY" as a
      // category label, so we test the actual suppression-line pattern
      // (the check-mark + count) rather than the substring.
      expect(out).not.toMatch(/0 INVERTED\/NOISY issue\(s\) suppressed/);
      expect(out).not.toMatch(/✓ 0/);
    });

    it('handles missing defaultOffSuppressedCount gracefully (legacy reports)', () => {
      const out = formatPretty(makeReport());
      // v0.18.1: same as above — test the line, not the substring.
      expect(out).not.toMatch(/INVERTED\/NOISY issue\(s\) suppressed/);
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
      const out = formatPretty(makeReport({ aiQuality: 25 }));
      expect(out).toContain('--why-failing');
    });

    it('does NOT mention --why-failing when score is at/above 70', () => {
      const out = formatPretty(makeReport({ aiQuality: 75 }));
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
      const out = formatWhyFailingReport(makeReport({ issues, aiQuality: 15 }));
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
      const out = formatWhyFailingReport(makeReport({ issues: [], aiQuality: 100 }));
      expect(out).toContain('Nothing is failing');
    });

    it('shows the headline score in the output', () => {
      const out = formatWhyFailingReport(
        makeReport({ aiQuality: 15, issues: [makeIssue({ ruleId: 'rule/test', severity: 'high' })] }),
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
      // v0.15.0 U.4: the headline is "AI Quality" (the v0.14
      // "Slop Index" label is replaced).
      // P4 first (headline)
      expect(out.indexOf('AI Quality:')).toBeGreaterThan(0);
      // P5 second (trust signal)
      expect(out.indexOf('99 INVERTED')).toBeGreaterThan(out.indexOf('AI Quality:'));
      // P1 third (category breakdown)
      expect(out.indexOf('Category breakdown')).toBeGreaterThan(out.indexOf('99 INVERTED'));
      // Thresholds (v0.14.5j renamed to "Threshold (CI gate)")
      expect(out.indexOf('Threshold (CI gate)')).toBeGreaterThan(out.indexOf('Category breakdown'));
      // P0 last (next step)
      expect(out.indexOf('Next step')).toBeGreaterThan(out.indexOf('Threshold (CI gate)'));
    });
  });

  // v0.14.5j UX improvements: P6 (verdict), P7 (glossary),
  // P8 (band labels), P9 (delta), P10 (--brief).
  describe('v0.14.5j: at-a-glance + with-help', () => {
    // P6: plain-language verdict at the top
    it('P6: opens with a one-sentence verdict answering "is my code OK?"', () => {
      const out = formatPretty(makeReport({ issues: [makeIssue()], aiQuality: 25 }));
      // First non-empty line should answer the user's actual question
      const firstLine = out.split('\n').find((l) => l.trim().length > 0) ?? '';
      expect(firstLine).toMatch(/Repo is/i);
      expect(firstLine).toMatch(/concerning|passing|excellent|needs work/);
    });

    it('P6: clean report gets a "all clean" verdict', () => {
      const out = formatPretty(makeReport({ issues: [], aiQuality: 0 }));
      expect(out).toContain('Clean');
    });

    it('P6: failing report names the dominant category + file', () => {
      const out = formatPretty(
        makeReport({
          issues: [makeIssue({ ruleId: 'ai/x', category: 'ai', severity: 'high', filePath: 'src/bad.ts' })],
          aiQuality: 50, engineeringHygiene: 50, security: 50, repositoryHealth: 50,
          topOffenders: [{ filePath: 'src/bad.ts', adjustedScore: 100, issueCount: 1 }],
        }),
      );
      const verdict = out.split('\n').find((l) => l.includes('needs work') || l.includes('concerning')) ?? '';
      expect(verdict).toContain('src/bad.ts');
      // Should not have the "AI patterns patterns" double word
      expect(verdict).not.toContain('patterns patterns');
    });

    // P7: inline glossary for category labels
    it('P7: category breakdown uses plain-language labels (not jargon)', () => {
      const out = formatPretty(makeReport());
      // 'ai' → "AI patterns" (with description)
      expect(out).toContain('AI patterns');
      expect(out).toContain('signatures of LLM-generated code');
      // 'visual' → "visual style"
      expect(out).toContain('visual style');
      // 'logic' → "logic patterns"
      expect(out).toContain('logic patterns');
    });

    it('P7: shows explanation for each active category', () => {
      const out = formatPretty(makeReport());
      // 3 active categories: ai, visual, logic — each gets a description
      expect(out).toContain('— signatures of LLM-generated code');
      expect(out).toContain('— colors, spacing, font sizes, layout');
      expect(out).toContain('— state, hooks, prop usage');
    });

    // P8: explicit lower=better / higher=better labels.
    // v0.15.0 U.4: AI Quality uses "higher = better" (inverted
    // from the v0.14 Slop Index convention). The test is
    // updated to assert the new "higher = better" label, which
    // now applies to the primary headline.
    it('P8: AI Quality shows "higher = better"', () => {
      const out = formatPretty(makeReport());
      expect(out).toContain('higher = better');
    });

    it('P8: Repository Coherence shows "higher = better"', () => {
      const out = formatPretty(makeReport({ coherence: 60 }));
      expect(out).toContain('higher = better');
    });

    it('P8: subscore breakdown uses plain-language labels', () => {
      const out = formatPretty(makeReport());
      expect(out).toContain('— structural integrity');
      expect(out).toContain('— props / state / imports');
      expect(out).toContain('— CSS / a11y / layout');
    });

    // P9: trajectory delta.
    // v0.15.0 U.4: aiQuality is higher = better, so the arrow
    // direction is INVERTED vs the v0.14 Slop Index convention:
    //   - aiQuality went UP (improved) → ↑5 (cleaner)
    //   - aiQuality went DOWN (regressed) → ↓5 (worse)
    // The v0.14 "↓N cleaner when score improved" wording is
    // replaced with "↑N cleaner when aiQuality improved".
    it('P9: shows ↑N (cleaner) when aiQuality improved from last run', () => {
      const out = formatPretty(
        makeReport({ aiQuality: 30, previousSlopIndex: 25 }),
      );
      expect(out).toMatch(/↑5/);
      expect(out).toMatch(/cleaner/);
    });

    it('P9: shows ↓N (worse) when aiQuality regressed from last run', () => {
      const out = formatPretty(
        makeReport({ aiQuality: 20, previousSlopIndex: 25 }),
      );
      expect(out).toMatch(/↓5/);
      expect(out).toMatch(/worse/);
    });

    it('P9: no delta line when no previous run', () => {
      const out = formatPretty(makeReport({ aiQuality: 25, previousSlopIndex: undefined }));
      expect(out).not.toMatch(/↓|↑/);
    });

    it('P9: no delta line for tiny change (noise floor ±0.5)', () => {
      const out = formatPretty(
        makeReport({ aiQuality: 25.3, previousSlopIndex: 25.0 }),
      );
      expect(out).not.toMatch(/↓|↑/);
    });

    // P10: --brief flag
    it('P10: formatBriefReport is a 4-5 line terse summary', () => {
      const out = formatBriefReport(makeReport({ aiQuality: 25, coherence: 60 }));
      const lines = out.split('\n').filter((l) => l.trim().length > 0);
      // v0.17.0: 4-score model is naturally longer (verdict + 4 scores + gate + footer = 6-9 lines).
      // Still terse vs the full formatPretty output (50+ lines).
      expect(lines.length).toBeLessThanOrEqual(10);
      expect(lines.length).toBeGreaterThanOrEqual(5);
    });

    it('P10: formatBriefReport includes the verdict, 4 scores, threshold, and delta', () => {
      // v0.17.0: 4-score model (aiQuality, engineeringHygiene, security, repositoryHealth).
      // The previous v0.15.0 "AI Quality + Coherence" dual-scoring was confusing;
      // the 4-score model shows all 4 orthogonal axes up front.
      const out = formatBriefReport(
        makeReport({
          aiQuality: 30,
          engineeringHygiene: 70,
          security: 95,
          repositoryHealth: 40,
          previousSlopIndex: 25,
        }),
      );
      expect(out).toMatch(/Repo is/i);
      expect(out).toContain('aiQuality');
      expect(out).toContain('engineeringHygiene');
      expect(out).toContain('security');
      expect(out).toContain('repositoryHealth');
      expect(out).toContain('↑5');
      expect(out).toMatch(/pass|fail/);
    });

    it('P10: formatBriefReport omits the category breakdown and issues dump', () => {
      const out = formatBriefReport(makeReport({ issues: [makeIssue(), makeIssue(), makeIssue()] }));
      expect(out).not.toContain('Category breakdown');
      expect(out).not.toContain('Issues (');
    });

    // v0.18.1: explainer rewritten for the 4-score model. The legacy
    // "Why two scores?" / docs/scoring-explained.md footer is gone (the
    // docs file never existed and the v0.15.0 split produced 4 scores, not 2).
    it('explains the 4-score model in a footnote at the bottom (v0.18.1)', () => {
      const out = formatPretty(makeReport({ coherence: 60 }));
      // Old text must be gone
      expect(out).not.toContain('Why two scores?');
      expect(out).not.toContain('docs/scoring-explained.md');
      expect(out).not.toContain('Slop Index measures');
      // 4 named scores referenced
      expect(out).toContain('AI Quality');
      expect(out).toContain('Engineering Hygiene');
      expect(out).toContain('Security');
      expect(out).toContain('Repository Health');
      // CI gate is aiQuality >= 70, higher = better (legacy footer said lower = better)
      expect(out).toMatch(/AI Quality\s*>=\s*70/);
      expect(out).toMatch(/higher\s*=\s*better/i);
      // repositoryHealth weights per metrics.ts:302-306
      expect(out).toMatch(/0\.4.*AI Quality/);
      expect(out).toMatch(/0\.3.*Hygiene/i);
      expect(out).toMatch(/0\.2.*Security/i);
      expect(out).toMatch(/0\.1.*Test/i);
    });
  });
});
