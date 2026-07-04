import { describe, it, expect } from 'vitest';
import {
  AI_FAVORED_RULE_IDS,
  HUMAN_FAVORED_RULE_IDS,
  MDL_SMOOTHING_FLOOR,
  buildDefaultMdlPriors,
  computeMDLikelihood,
} from '@usebrick/engine';
import { builtinRules } from '../../src/rules/builtins';

// v0.15.0 B.5: the engine no longer exports a default `DEFAULT_MDL_PRIORS`
// because it depends on slopbrick's `builtinRules` (which would create a
// workspace-level circular dep). Tests that need the default priors
// build them locally.
const DEFAULT_MDL_PRIORS = buildDefaultMdlPriors(builtinRules);

describe('AI_FAVORED_RULE_IDS / HUMAN_FAVORED_RULE_IDS', () => {
  it('contains the 17 v4-USEFUL rules from the calibration table', () => {
    // v0.38.0 dropped `typo/calc-raw-px` (v10-DORMANT) from this list.
    expect(AI_FAVORED_RULE_IDS).toHaveLength(17);
    // Spot-check a few high-lift entries from the v4 P/R/FPR table.
    expect(AI_FAVORED_RULE_IDS).toContain('logic/ghost-defensive'); // P=94.7%, lift=22.5
    expect(AI_FAVORED_RULE_IDS).toContain('security/fail-open-auth'); // P=100%
    expect(AI_FAVORED_RULE_IDS).toContain('security/missing-auth-check'); // P=92.5%
    expect(AI_FAVORED_RULE_IDS).toContain('logic/math-console-log-storm'); // P=89.8%
  });

  it('contains the v4-INVERTED rules from the calibration table', () => {
    // v0.38.0 dropped `wcag/dragging-movements` (v10-DORMANT) from this list.
    // 10 rules remaining.
    expect(HUMAN_FAVORED_RULE_IDS).toHaveLength(10);
    expect(HUMAN_FAVORED_RULE_IDS).toContain('component/multiple-components-per-file');
    expect(HUMAN_FAVORED_RULE_IDS).toContain('context/import-path-mismatch');
    expect(HUMAN_FAVORED_RULE_IDS).toContain('visual/inline-style-dominance');
  });

  it('every favored ID is a registered builtin rule', () => {
    const ids = new Set(builtinRules.map((r) => r.id));
    for (const id of AI_FAVORED_RULE_IDS) {
      expect(ids.has(id)).toBe(true);
    }
    for (const id of HUMAN_FAVORED_RULE_IDS) {
      expect(ids.has(id)).toBe(true);
    }
  });

  it('AI and HUMAN favored sets are disjoint', () => {
    const overlap = AI_FAVORED_RULE_IDS.filter((id) =>
      HUMAN_FAVORED_RULE_IDS.includes(id),
    );
    expect(overlap).toEqual([]);
  });
});

describe('buildDefaultMdlPriors', () => {
  it('produces normalized probability distributions over the vocabulary', () => {
    const priors = buildDefaultMdlPriors(builtinRules);
    const sumAi = Array.from(priors.m_ai.values()).reduce((a, b) => a + b, 0);
    const sumHuman = Array.from(priors.m_human.values()).reduce((a, b) => a + b, 0);
    expect(sumAi).toBeCloseTo(1.0, 6);
    expect(sumHuman).toBeCloseTo(1.0, 6);
  });

  it('assigns higher probability to favored rules than to background rules', () => {
    const priors = buildDefaultMdlPriors(builtinRules);
    const usefulAiProb = priors.m_ai.get('logic/ghost-defensive')!; // USEFUL
    const noisyAiProb = priors.m_ai.get('perf/css-bloat')!; // NOISY
    const invertedHumanProb = priors.m_human.get('security/public-admin-route')!; // INVERTED
    const usefulHumanProb = priors.m_human.get('logic/ghost-defensive')!; // USEFUL → background

    expect(usefulAiProb).toBeGreaterThan(noisyAiProb);
    expect(invertedHumanProb).toBeGreaterThan(usefulHumanProb);
    // USEFUL should be at least 50× more likely than background under m_ai.
    expect(usefulAiProb / noisyAiProb).toBeGreaterThan(50);
  });

  it('every builtin rule has a nonzero probability under both models', () => {
    const priors = buildDefaultMdlPriors(builtinRules);
    for (const rule of builtinRules) {
      expect(priors.m_ai.get(rule.id)).toBeGreaterThan(0);
      expect(priors.m_human.get(rule.id)).toBeGreaterThan(0);
    }
  });

  it('DEFAULT_MDL_PRIORS is consistent with the builtin registry', () => {
    const fresh = buildDefaultMdlPriors(builtinRules);
    expect(DEFAULT_MDL_PRIORS.m_ai.size).toBe(fresh.m_ai.size);
    expect(DEFAULT_MDL_PRIORS.m_human.size).toBe(fresh.m_human.size);
    // Spot-check that a USEFUL rule has the same probability.
    expect(DEFAULT_MDL_PRIORS.m_ai.get('logic/ghost-defensive')).toBeCloseTo(
      fresh.m_ai.get('logic/ghost-defensive')!,
      10,
    );
  });
});

describe('computeMDLikelihood', () => {
  it('returns logRatio ≈ 0 when identical rules fire under identical models', () => {
    const priors = buildDefaultMdlPriors(builtinRules);
    // Fire a rule outside the vocabulary; both models fall back to the
    // smoothing floor, so log-likelihoods are equal.
    const result = computeMDLikelihood(['nonexistent/rule'], priors);
    expect(result.logRatio).toBeCloseTo(0, 10);
  });

  it('returns logRatio ≈ 0 for an empty rule list (no evidence)', () => {
    const priors = buildDefaultMdlPriors(builtinRules);
    const result = computeMDLikelihood([], priors);
    expect(result.logLikAi).toBe(0);
    expect(result.logLikHuman).toBe(0);
    expect(result.logRatio).toBe(0);
  });

  it('returns positive logRatio when AI-favored rules fire (m_ai evidence)', () => {
    const priors = buildDefaultMdlPriors(builtinRules);
    // logic/ghost-defensive is USEFUL with P=94.7% and lift=22.5; the
    // strongest AI-vs-human signal in the v4 calibration.
    const result = computeMDLikelihood(['logic/ghost-defensive'], priors);
    expect(result.logRatio).toBeGreaterThan(0);
    // With FAVORED_WEIGHT=1.0 and BACKGROUND_WEIGHT=0.01, USEFUL
    // rules are ~62× more likely under m_ai than m_human, so log(ratio)
    // ≈ 4.1 per rule. The per-rule contribution is large enough to
    // dominate a handful of background firings.
    expect(result.logRatio).toBeGreaterThan(3);
    expect(Number.isFinite(result.logRatio)).toBe(true);
  });

  it('returns negative logRatio when human-favored (INVERTED) rules fire', () => {
    const priors = buildDefaultMdlPriors(builtinRules);
    // security/public-admin-route is INVERTED — fires more on human
    // code than AI. Should push logRatio negative.
    const result = computeMDLikelihood(['security/public-admin-route'], priors);
    expect(result.logRatio).toBeLessThan(0);
    expect(result.logRatio).toBeLessThan(-3);
    expect(Number.isFinite(result.logRatio)).toBe(true);
  });

  it('handles unseen rules via Laplace smoothing without NaN or Infinity', () => {
    const priors = buildDefaultMdlPriors(builtinRules);
    const unseen = ['unseen/rule-1', 'unseen/rule-2', 'totally/fake'];
    const result = computeMDLikelihood(unseen, priors);
    expect(Number.isFinite(result.logLikAi)).toBe(true);
    expect(Number.isFinite(result.logLikHuman)).toBe(true);
    expect(Number.isFinite(result.logRatio)).toBe(true);
    // Both unseen rules hit the smoothing floor — log-ratios cancel.
    expect(result.logRatio).toBeCloseTo(0, 10);
    // The log-likelihood equals N × log(floor) for N unseen rules.
    const expected = unseen.length * Math.log(MDL_SMOOTHING_FLOOR);
    expect(result.logLikAi).toBeCloseTo(expected, 6);
    expect(result.logLikHuman).toBeCloseTo(expected, 6);
  });

  it('logRatio grows linearly with the number of AI-favored firings', () => {
    const priors = buildDefaultMdlPriors(builtinRules);
    const one = computeMDLikelihood(['logic/ghost-defensive'], priors);
    const two = computeMDLikelihood(
      ['logic/ghost-defensive', 'logic/ghost-defensive'],
      priors,
    );
    // Two firings of the same rule double the per-rule log-likelihood
    // contribution (independence assumption).
    expect(two.logRatio).toBeCloseTo(2 * one.logRatio, 6);
  });

  it('accepts a custom modelProbs map (e.g. both models equal → always zero)', () => {
    const equalModel = new Map<string, number>();
    for (const rule of builtinRules) {
      equalModel.set(rule.id, 1 / builtinRules.length);
    }
    const priors = { m_ai: equalModel, m_human: equalModel };
    const result = computeMDLikelihood(
      ['logic/ghost-defensive', 'security/public-admin-route', 'visual/x'],
      priors,
    );
    expect(result.logRatio).toBe(0);
    expect(result.logLikAi).toBeCloseTo(result.logLikHuman, 10);
  });

  it('integrates with buildRepositoryHealthFromReport via mdlLogRatio option', async () => {
    const { buildRepositoryHealthFromReport } = await import(
      '../../src/engine/repository-health'
    );
    const priors = buildDefaultMdlPriors(builtinRules);
    const issues = [
      // A USEFUL rule firing once → positive logRatio expected.
      {
        severity: 'high' as const,
        ruleId: 'logic/ghost-defensive',
        category: 'logic' as const,
        message: '',
        filePath: '',
        aiSpecific: true,
        line: 1,
        column: 1,
      },
    ];
    const withExplicit = buildRepositoryHealthFromReport(
      {
        aiSlopScore: 10, engineeringHygiene: 10, security: 10, repositoryHealth: 10,
        architectureConsistency: 90,
        aiSecurityRisk: 'low',
        issues,
      },
      {
        mdlLogRatio: computeMDLikelihood(
          ['logic/ghost-defensive'],
          priors,
        ).logRatio,
      },
    );
    expect(withExplicit.mdlLogRatio).toBeGreaterThan(0);

    // Auto-compute path: omit mdlLogRatio, derive from issues.
    const auto = buildRepositoryHealthFromReport({
      aiSlopScore: 10, engineeringHygiene: 10, security: 10, repositoryHealth: 10,
      architectureConsistency: 90,
      aiSecurityRisk: 'low',
      issues,
    });
    expect(auto.mdlLogRatio).toBeDefined();
    expect(auto.mdlLogRatio).toBeGreaterThan(0);
    // Explicit and auto paths should match for the same input.
    expect(auto.mdlLogRatio).toBeCloseTo(withExplicit.mdlLogRatio!, 10);
  });
});