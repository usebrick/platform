// v0.25.0 — self-scan exclusion + graded security cap tests.
//
// Two coupled fixes for the systemic FP noise problem:
//
//   1. `selfScan.excludePaths` config option. Defaults cover
//      `src/rules/**`, `tests/fixtures/**`, `tests/rules/**` — the
//      three paths that are always false positives when scanning
//      the slopbrick repo itself.
//
//   2. Graded security score cap in `coherence.ts`. Replaces the
//      categorical "0 if any" cliff with `Math.max(0, 100 / (1 +
//      issueCount / 5))` (hyperbolic decay). A repo with 1 issue
//      scores 83; 5 issues scores 50; 100+ scores ≤5.

import { describe, expect, it } from 'vitest';
import { resolve } from 'node:path';
import { scanFile } from '../../src/engine/worker';
import { computeDomainScores } from '../../src/engine/coherence';
import { DEFAULT_CONFIG } from '../../src/config/defaults';
import type { ResolvedConfig, Issue } from '../../src/types';

// Slopbrick package dir, used as the `cwd` for scanFile calls. We
// pass it explicitly rather than relying on `process.cwd()` because
// vitest's cwd isn't guaranteed to be the slopbrick dir when this
// test runs (depends on how the runner is invoked).
const SLOPBRICK_DIR = resolve(__dirname, '..', '..');

describe('selfScan.excludePaths (v0.25.0; broadened in v0.25.1)', () => {
  describe('defaults', () => {
    it('DEFAULT_CONFIG.selfScan excludes **/src/rules/**, **/snippet/**, **/tests/**', () => {
      expect(DEFAULT_CONFIG.selfScan).toBeDefined();
      expect(DEFAULT_CONFIG.selfScan?.excludePaths).toEqual([
        '**/src/rules/**',
        '**/snippet/**',
        '**/tests/**',
      ]);
    });

    it('isExcludedBySelfScan returns true for files under **/src/rules/**', async () => {
      const filePath = resolve(
        SLOPBRICK_DIR,
        'src',
        'rules',
        'security',
        'sql-construction.ts',
      );
      const result = await scanFile(
        filePath,
        DEFAULT_CONFIG,
        undefined,
        SLOPBRICK_DIR,
      );
      // Should return immediately via the selfScan short-circuit
      // (no parseError, no issues, no components).
      expect(result.issues).toEqual([]);
      expect(result.parseError).toBeUndefined();
      expect(result.componentCount).toBe(0);
    });

    it('isExcludedBySelfScan returns true for files under **/snippet/** (RULE_HINTS example SQL)', async () => {
      const filePath = resolve(
        SLOPBRICK_DIR,
        'src',
        'snippet',
        'data.ts',
      );
      const result = await scanFile(
        filePath,
        DEFAULT_CONFIG,
        undefined,
        SLOPBRICK_DIR,
      );
      expect(result.issues).toEqual([]);
      expect(result.parseError).toBeUndefined();
    });

    it('isExcludedBySelfScan returns true for any file under **/tests/** (unit, integration, engine, cli)', async () => {
      const filePath = resolve(
        SLOPBRICK_DIR,
        'tests',
        'engine',
        'db-health.test.ts',
      );
      const result = await scanFile(
        filePath,
        DEFAULT_CONFIG,
        undefined,
        SLOPBRICK_DIR,
      );
      expect(result.issues).toEqual([]);
      expect(result.parseError).toBeUndefined();
    });

    it('does NOT exclude real production source files (e.g. src/cli/program.ts)', async () => {
      const filePath = resolve(SLOPBRICK_DIR, 'src', 'cli', 'program.ts');
      const result = await scanFile(
        filePath,
        DEFAULT_CONFIG,
        undefined,
        SLOPBRICK_DIR,
      );
      // src/cli/program.ts is NOT in the default excludes; the scan
      // runs normally. The short-circuit path doesn't set the
      // `facts` field; a real scan does. That's the cleanest proof
      // the file wasn't excluded.
      expect(result.filePath).toBe(filePath);
      expect(result.facts).toBeDefined();
    });
  });

  describe('custom excludes', () => {
    it('respects config.selfScan.excludePaths override (string[])', async () => {
      const config: ResolvedConfig = {
        ...DEFAULT_CONFIG,
        selfScan: {
          excludePaths: ['src/cli/**'],
        },
      };
      const filePath = resolve(SLOPBRICK_DIR, 'src', 'cli', 'program.ts');
      const result = await scanFile(
        filePath,
        config,
        undefined,
        SLOPBRICK_DIR,
      );
      expect(result.issues).toEqual([]);
      expect(result.parseError).toBeUndefined();
    });

    it('respects custom excludes for arbitrary paths (docs/**)', async () => {
      const config: ResolvedConfig = {
        ...DEFAULT_CONFIG,
        selfScan: {
          excludePaths: ['docs/**'],
        },
      };
      const filePath = resolve(
        SLOPBRICK_DIR,
        'docs',
        'research',
        'methodology-v0.25.md',
      );
      const result = await scanFile(
        filePath,
        config,
        undefined,
        SLOPBRICK_DIR,
      );
      expect(result.issues).toEqual([]);
    });
  });

  describe('opt-out (empty array)', () => {
    it('excludePaths: [] disables exclusion (legacy behavior)', async () => {
      const config: ResolvedConfig = {
        ...DEFAULT_CONFIG,
        selfScan: {
          excludePaths: [],
        },
      };
      const filePath = resolve(
        SLOPBRICK_DIR,
        'tests',
        'rules',
        'sql-construction.test.ts',
      );
      // With empty excludePaths, the file IS scanned. The short-
      // circuit path (when active) does NOT set the `facts` field;
      // a real scan always sets it.
      const result = await scanFile(
        filePath,
        config,
        undefined,
        SLOPBRICK_DIR,
      );
      expect(result.filePath).toBe(filePath);
      expect(result.facts).toBeDefined();
    });

    it('excludePaths: [] makes isExcludedBySelfScan a no-op (rule file fires its own rule)', async () => {
      // Use a rule file whose own source code will fire the rule
      // (proves the scan ran and parsed, not just that it returned
      // a clean empty result).
      const config: ResolvedConfig = {
        ...DEFAULT_CONFIG,
        selfScan: {
          excludePaths: [],
        },
      };
      const filePath = resolve(
        SLOPBRICK_DIR,
        'src',
        'rules',
        'security',
        'sql-construction.ts',
      );
      const result = await scanFile(
        filePath,
        config,
        undefined,
        SLOPBRICK_DIR,
      );
      // The rule file's own source has SQL-concat example patterns
      // (in the comments and in the regex literals), so a real
      // scan produces ≥1 `security/sql-construction` issue. The
      // short-circuit would produce 0 issues AND no `facts` field.
      expect(result.filePath).toBe(filePath);
      expect(result.facts).toBeDefined();
      const sqlIssues = result.issues.filter(
        (i) => i.ruleId === 'security/sql-construction',
      );
      expect(sqlIssues.length).toBeGreaterThan(0);
    });
  });

  describe('glob matching', () => {
    it('matches tests/rules/sql-construction.test.ts via specific glob', async () => {
      const config: ResolvedConfig = {
        ...DEFAULT_CONFIG,
        selfScan: {
          excludePaths: ['tests/rules/sql-construction.test.ts'],
        },
      };
      const filePath = resolve(
        SLOPBRICK_DIR,
        'tests',
        'rules',
        'sql-construction.test.ts',
      );
      const result = await scanFile(
        filePath,
        config,
        undefined,
        SLOPBRICK_DIR,
      );
      expect(result.issues).toEqual([]);
      expect(result.parseError).toBeUndefined();
    });

    it('does NOT match unrelated rule files when glob is more specific', async () => {
      // Glob `src/rules/security/sql-construction.ts` (a specific
      // file) should match ONLY that file, not other files under
      // src/rules/security/. The selfScan short-circuit would
      // produce 0 issues AND no `facts` field; a real scan sets
      // `facts`. Use that to prove the glob didn't fire.
      const config: ResolvedConfig = {
        ...DEFAULT_CONFIG,
        selfScan: {
          excludePaths: ['src/rules/security/sql-construction.ts'],
        },
      };
      // A different rule file under src/rules/security/. This
      // should NOT match the glob above.
      const filePath = resolve(
        SLOPBRICK_DIR,
        'src',
        'rules',
        'security',
        'eval.ts',
      );
      const result = await scanFile(
        filePath,
        config,
        undefined,
        SLOPBRICK_DIR,
      );
      // Real scan ran (exclusion didn't fire). The distinguishing
      // proof: `facts` is set on a real scan but not on a short-
      // circuit. A short-circuit also returns componentCount=0 +
      // empty issues, but `facts` is the unambiguous signal.
      expect(result.filePath).toBe(filePath);
      expect(result.facts).toBeDefined();
    });

    it('matches a deeply nested glob (src/rules/**/security/*.ts)', async () => {
      const config: ResolvedConfig = {
        ...DEFAULT_CONFIG,
        selfScan: {
          excludePaths: ['src/rules/**/security/*.ts'],
        },
      };
      const filePath = resolve(
        SLOPBRICK_DIR,
        'src',
        'rules',
        'security',
        'eval.ts',
      );
      const result = await scanFile(
        filePath,
        config,
        undefined,
        SLOPBRICK_DIR,
      );
      expect(result.issues).toEqual([]);
      expect(result.parseError).toBeUndefined();
    });
  });

  describe('absent selfScan field', () => {
    it('omitting selfScan entirely behaves like empty excludePaths (no exclusion)', async () => {
      const config: ResolvedConfig = {
        ...DEFAULT_CONFIG,
        selfScan: undefined,
      };
      const filePath = resolve(
        SLOPBRICK_DIR,
        'src',
        'rules',
        'security',
        'sql-construction.ts',
      );
      const result = await scanFile(
        filePath,
        config,
        undefined,
        SLOPBRICK_DIR,
      );
      // Real scan ran → `facts` is set AND the rule fires on the
      // file's own example SQL.
      expect(result.filePath).toBe(filePath);
      expect(result.facts).toBeDefined();
      const sqlIssues = result.issues.filter(
        (i) => i.ruleId === 'security/sql-construction',
      );
      expect(sqlIssues.length).toBeGreaterThan(0);
    });
  });
});

describe('computeDomainScores — graded security cap (v0.25.0)', () => {
  // Helper to make a minimal security issue for tally tests.
  function securityIssue(ruleId = 'security/sql-construction'): Issue {
    return {
      ruleId,
      category: 'security',
      severity: 'high',
      aiSpecific: false,
      message: 'SQL string concat',
      line: 1,
      column: 1,
    };
  }

  it('security.score = 100 when there are 0 issues (no regression)', () => {
    const domains = computeDomainScores([]);
    expect(domains.security.score).toBe(100);
    expect(domains.security.issueCount).toBe(0);
  });

  it('security.score uses hyperbolic decay: 1 issue → ~83', () => {
    const domains = computeDomainScores([securityIssue()]);
    // 100 / (1 + 1/5) = 100 / 1.2 = 83.333...
    expect(domains.security.score).toBeCloseTo(83.33, 1);
    expect(domains.security.issueCount).toBe(1);
  });

  it('security.score: 5 issues → 50', () => {
    const issues = Array.from({ length: 5 }, () => securityIssue());
    const domains = computeDomainScores(issues);
    // 100 / (1 + 5/5) = 100 / 2 = 50
    expect(domains.security.score).toBe(50);
    expect(domains.security.issueCount).toBe(5);
  });

  it('security.score: 20 issues → 20', () => {
    const issues = Array.from({ length: 20 }, () => securityIssue());
    const domains = computeDomainScores(issues);
    // 100 / (1 + 20/5) = 100 / 5 = 20
    expect(domains.security.score).toBe(20);
    expect(domains.security.issueCount).toBe(20);
  });

  it('security.score: 100 issues → ~4.76', () => {
    const issues = Array.from({ length: 100 }, () => securityIssue());
    const domains = computeDomainScores(issues);
    // 100 / (1 + 100/5) = 100 / 21 = 4.7619... Note: the v0.25.0
    // task brief rounds this to 5, but the precise value is 4.76.
    // We assert the actual computed value.
    expect(domains.security.score).toBeCloseTo(4.76, 1);
  });

  it('security.score: 1000 issues → ~0.50 (very small but positive)', () => {
    // Hyperbolic decay approaches 0 asymptotically; `Math.max(0, ...)`
    // is a no-op for the formula (it can only return 0 if the input
    // is negative, which the formula never produces). The floor
    // exists as a safety net for edge cases (NaN input, etc.).
    const issues = Array.from({ length: 1000 }, () => securityIssue());
    const domains = computeDomainScores(issues);
    // 100 / (1 + 1000/5) = 100 / 201 ≈ 0.4975
    expect(domains.security.score).toBeCloseTo(0.4975, 3);
    expect(domains.security.score).toBeGreaterThan(0);
  });

  it('security.score is monotonic non-increasing as issueCount grows', () => {
    const counts = [0, 1, 2, 5, 10, 20, 50, 100, 200];
    let prev = Infinity;
    for (const count of counts) {
      const issues = Array.from({ length: count }, () => securityIssue());
      const domains = computeDomainScores(issues);
      expect(domains.security.score).toBeLessThanOrEqual(prev);
      prev = domains.security.score;
    }
  });

  it('security.score is the only domain with the graded cap (codeHygiene/etc. use issueCountToScore)', () => {
    // Regression guard: only `security` got the graded cap. The
    // other three domains (codeHygiene, accessibility, performance)
    // still use `issueCountToScore` (linear saturation at 25).
    const issues = [
      securityIssue(),
      {
        ruleId: 'logic/boundary-violation',
        category: 'logic',
        severity: 'medium',
        aiSpecific: false,
        message: 'x',
        line: 1,
        column: 1,
      },
    ];
    const domains = computeDomainScores(issues);
    // codeHygiene: 1 issue / 25 saturation → 100 * (1 - 1/25) = 96
    expect(domains.codeHygiene.score).toBe(96);
    // security: 1 issue → 83.33...
    expect(domains.security.score).toBeCloseTo(83.33, 1);
  });

  it('graded cap differs from categorical at issueCount=1 (the v0.24.0 cliff)', () => {
    // v0.24.0: 1 issue → security=0 (categorical).
    // v0.25.0: 1 issue → security=83.33 (graded).
    // This is the regression guard for the public score contract
    // change documented in CHANGELOG.
    const domains = computeDomainScores([securityIssue()]);
    expect(domains.security.score).not.toBe(0);
    expect(domains.security.score).toBeGreaterThan(80);
  });
});

describe('selfScan + graded cap interaction (v0.25.0)', () => {
  it('after selfScan excludes ~70 FPs, ~20 issues remain → security = 20', () => {
    // Realistic self-scan scenario: 90 raw security issues, ~70 of
    // which come from rule definitions / test fixtures (now
    // excluded by default), leaving ~20 real issues.
    //
    // The v0.25.0 task brief expected security ~71 from this
    // scenario ("100 / (1 + 20/5) = 20 — wait, that's 20 not 71").
    // The correct math is 20, not 71. This test pins the actual
    // formula output so a future change has to consciously pick
    // a different number rather than accidentally drifting.
    const realIssues = Array.from({ length: 20 }, () => ({
      ruleId: 'security/sql-construction',
      category: 'security' as const,
      severity: 'high' as const,
      aiSpecific: false,
      message: 'x',
      line: 1,
      column: 1,
    }));
    const domains = computeDomainScores(realIssues);
    // 100 / (1 + 20/5) = 100 / 5 = 20
    expect(domains.security.score).toBe(20);
    expect(domains.security.issueCount).toBe(20);
  });

  it('v9 plan "security ≥ 80" criterion is achievable with <2 real issues', () => {
    // The v9 plan's pass criterion is "security ≥ 80". With the
    // graded cap, this requires issueCount < ~2.5 (since 100/(1+x/5)
    // = 80 means x = 2.5). The selfScan default excludes ~70 FPs,
    // so even a repo with 20-25 real issues can pass.
    //
    // Walk the boundary: with N issues, what's the security score?
    //   N=0   → 100  ✅ ≥80
    //   N=1   →  83  ✅ ≥80
    //   N=2   →  71  ❌ <80
    // So the criterion is achievable only for repos with <2 real
    // issues after excludePaths. That's the right calibration for
    // a "pass" threshold.
    const counts = [0, 1, 2];
    const expected = [100, 83.33, 71.43];
    for (let i = 0; i < counts.length; i++) {
      const count = counts[i]!;
      const issues = Array.from({ length: count }, () => ({
        ruleId: 'security/sql-construction',
        category: 'security' as const,
        severity: 'high' as const,
        aiSpecific: false,
        message: 'x',
        line: 1,
        column: 1,
      }));
      const domains = computeDomainScores(issues);
      expect(domains.security.score).toBeCloseTo(expected[i]!, 1);
    }
  });
});