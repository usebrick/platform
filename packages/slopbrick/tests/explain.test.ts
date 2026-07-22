import { beforeEach, describe, expect, it, vi } from 'vitest';

const getCurrentEvidencePolicyAccessorsMock = vi.hoisted(() => vi.fn());

vi.mock('../src/rules/current-evidence-policy-runtime', () => ({
  getCurrentEvidencePolicyAccessors: getCurrentEvidencePolicyAccessorsMock,
}));
import { explainRule, formatExplain } from '../src/cli/explain';
import { buildRuleExplanation } from '../src/rules/explanation';
import { DEFAULT_CONFIG } from '../src/config';
import type { Rule } from '../src/types';
import { approvedCurrentPolicyFixture } from './helpers/current-evidence-policy-v2';

beforeEach(() => {
  getCurrentEvidencePolicyAccessorsMock.mockReset();
  getCurrentEvidencePolicyAccessorsMock.mockReturnValue(undefined);
});

const fakeRule: Rule = {
  id: 'visual/test-rule',
  category: 'visual',
  severity: 'medium',
  aiSpecific: true,
  description: 'test',
  create: () => ({}),
  analyze: () => [],
};

const fakeRules: Rule[] = [fakeRule];
const fakeHints: Record<string, string> = {
  'visual/test-rule': 'Look for the bad pattern.',
};

describe('explainRule (v0.5.2: helpUri)', () => {
  it('returns an error for unknown rule', () => {
    const result = explainRule('does-not-exist', fakeRules, fakeHints);
    expect('error' in result).toBe(true);
  });

  it('returns a result with helpUri for a known rule', () => {
    const result = explainRule('visual/test-rule', fakeRules, fakeHints);
    expect('error' in result).toBe(false);
    if ('error' in result) return;
    expect(result.helpUri).toBe(
      'https://github.com/usebrick/platform/blob/main/packages/slopbrick/src/rules/visual/test-rule.ts',
    );
    expect(result.sourcePath).toBe('src/rules/visual/test-rule.ts');
  });

  it('handles rule id without category prefix', () => {
    const ruleNoPrefix: Rule = { ...fakeRule, id: 'bare-id' };
    const result = explainRule('bare-id', [ruleNoPrefix], { 'bare-id': 'hint' });
    expect('error' in result).toBe(false);
    if ('error' in result) return;
    // Rule id without slash is treated as the filename itself
    expect(result.sourcePath).toBe('src/rules/visual/bare-id.ts');
    expect(result.helpUri).toBe(
      'https://github.com/usebrick/platform/blob/main/packages/slopbrick/src/rules/visual/bare-id.ts',
    );
  });

  it('falls back to generic pattern when hint is missing', () => {
    const result = explainRule('visual/test-rule', fakeRules, {});
    expect('error' in result).toBe(false);
    if ('error' in result) return;
    expect(result.pattern).toContain('visual/test-rule');
  });
});

describe('formatExplain (v0.5.2: Help: line)', () => {
  it('renders the Help: line with helpUri', () => {
    const result = explainRule('visual/test-rule', fakeRules, fakeHints);
    if ('error' in result) throw new Error('expected success');
    const out = formatExplain(result);
    expect(out).toContain('Help:        https://github.com/usebrick/platform/blob/main/packages/slopbrick/src/rules/visual/test-rule.ts');
    expect(out).toContain('Source:      src/rules/visual/test-rule.ts');
    expect(out).toContain('Pattern:');
    expect(out).toContain('Remediation:');
    expect(out).toContain('Suppress / configure in slopbrick.config.mjs:');
  });

  it('renders an error string when given an error result', () => {
    const out = formatExplain({ error: 'Unknown rule: foo' });
    expect(out).toBe('Unknown rule: foo');
  });

  it('renders honest policy/calibration status without inventing a matched snippet', () => {
    const result = buildRuleExplanation(
      { ...fakeRule, id: 'logic/heaps-deviation', category: 'logic', aiSpecific: false },
      { ...DEFAULT_CONFIG, rules: { 'logic/heaps-deviation': 'off' } },
      { 'logic/heaps-deviation': 'Inspect the calibrated source-code statistic.' },
    );
    const out = formatExplain(result);

    expect(out).toContain('Rule status: configured-off');
    expect(out).toContain('AI-specific: no (cross-cutting quality rule)');
    expect(out).toContain('Evidence:    quality');
    expect(out).toContain('Current policy:\n  Status: unavailable\n  Detail: legacy defaults only');
    expect(out).toContain('Historical metrics: historical point estimates only');
    expect(out).toContain('Calibrated: 2026-07-04T00:00:00Z');
    expect(out).toContain('Historical source/cohort: unavailable');
    expect(out).toContain('Precision:');
    expect(out).toContain('Matched fact/snippet: unavailable in a rule-level explanation');
    expect(out).toContain('Historical confidence limits: unavailable');
    expect(out).toContain('This output does not claim runtime suppression or authorship proof.');
  });

  it('renders every current-policy field for a default-off row', () => {
    getCurrentEvidencePolicyAccessorsMock.mockReturnValue(approvedCurrentPolicyFixture());
    const result = buildRuleExplanation({
      ...fakeRule,
      id: 'ai/any-density',
      category: 'ai',
      defaultOff: true,
    }, DEFAULT_CONFIG, {});
    const out = formatExplain(result);

    expect(out).toContain([
      'Current policy:',
      '  Status: applied',
      '  Runtime outcome: quality-candidate-default-off',
      '  Enabled by default: no',
      '  Runnable by explicit opt-in: yes',
      '  Score eligible: no',
      '  Gate eligible: no',
      '  Quality domain: type-safety',
      '  Claim class: contextual-heuristic',
      '  Provenance: quality-candidate-unmeasured',
      '  Admitted: no',
    ].join('\n'));
    expect(out).not.toContain('Replacement rule ID:');
  });

  it('renders the replacement rule for a superseded row', () => {
    getCurrentEvidencePolicyAccessorsMock.mockReturnValue(approvedCurrentPolicyFixture());
    const result = buildRuleExplanation({
      ...fakeRule,
      id: 'logic/math-any-density',
      category: 'logic',
      aiSpecific: false,
    }, DEFAULT_CONFIG, {});
    const out = formatExplain(result);

    expect(out).toContain('  Runtime outcome: superseded');
    expect(out).toContain('  Enabled by default: no');
    expect(out).toContain('  Runnable by explicit opt-in: no');
    expect(out).toContain('  Score eligible: no');
    expect(out).toContain('  Gate eligible: no');
    expect(out).toContain('  Quality domain: type-safety');
    expect(out).toContain('  Claim class: contextual-heuristic');
    expect(out).toContain('  Provenance: superseded-policy');
    expect(out).toContain('  Replacement rule ID: ai/any-density');
    expect(out).toContain('  Admitted: no');
  });
});

describe('buildRuleExplanation', () => {
  it('separates the applied current policy from historical point estimates', () => {
    getCurrentEvidencePolicyAccessorsMock.mockReturnValue(approvedCurrentPolicyFixture());
    const rule = {
      ...fakeRule,
      id: 'ai/any-density',
      category: 'ai' as const,
      aiSpecific: true,
      defaultOff: true,
    };

    const result = buildRuleExplanation(rule, DEFAULT_CONFIG, {
      'ai/any-density': 'Review unsafe any concentration.',
    });

    expect(result.currentPolicy).toMatchObject({
      status: 'applied',
      runtimeOutcome: 'quality-candidate-default-off',
      enabledByDefault: false,
      runnableByExplicitOptIn: true,
      scoreEligible: false,
      provenance: 'quality-candidate-unmeasured',
      admitted: false,
    });
    expect(result.historicalMetrics).toMatchObject({
      status: 'historical-point-estimate-only',
    });
    expect(JSON.stringify(result.currentPolicy)).not.toMatch(
      /precision|recall|falsePositiveRate|fpRate|ratio|verdict/i,
    );
    expect(result.configuration.policyState).toBe('current-default-off');
  });

  it('uses current default and non-runnable states before legacy defaults', () => {
    getCurrentEvidencePolicyAccessorsMock.mockReturnValue(approvedCurrentPolicyFixture());
    const defaultOn = buildRuleExplanation({
      ...fakeRule,
      id: 'context/import-path-mismatch',
      category: 'context',
      aiSpecific: false,
    }, DEFAULT_CONFIG, {});
    const blocked = buildRuleExplanation({
      ...fakeRule,
      id: 'logic/ghost-defensive',
      category: 'logic',
      aiSpecific: false,
    }, {
      ...DEFAULT_CONFIG,
      rules: { 'logic/ghost-defensive': 'high' },
    }, {});

    expect(defaultOn.configuration).toMatchObject({
      defaultOff: false,
      policyState: 'current-default-on',
    });
    expect(blocked.currentPolicy).toMatchObject({
      status: 'applied',
      enabledByDefault: false,
      runnableByExplicitOptIn: false,
      provenance: 'blocked-quality-candidate',
    });
    expect(blocked.configuration).toMatchObject({
      configuredSeverity: 'high',
      defaultOff: true,
      policyState: 'current-non-runnable',
    });
  });

  it('reports an unavailable confidence interval instead of fabricating one', () => {
    const result = buildRuleExplanation(fakeRule, {
      ...DEFAULT_CONFIG,
      rules: { 'visual/test-rule': 'off' },
    }, fakeHints);

    expect(result.evidence.category).toBe('ai-signal');
    expect(result.evidence.calibration.confidenceLimits).toBeNull();
    expect(result.evidence.calibration.confidenceLimitsReason).toContain('No validated confidence interval');
    expect(result.configuration.configuredSeverity).toBe('off');
    expect(result.configuration.policyState).toBe('configured-off');
    expect(result.configuration).not.toHaveProperty('effectiveActivation');
    expect(result.suppressionSnippet).toContain('visual/test-rule');
    expect(result.evidence.calibration.provenance.status).toBe('unavailable');
    expect(result.evidence.calibration.provenance.source).toBeNull();
    expect(result.evidence.calibration.provenance.cohort).toBeNull();
  });

  it('exposes only the validated historical date and explicitly withholds v10.3 provenance', () => {
    const result = buildRuleExplanation(
      { ...fakeRule, id: 'logic/heaps-deviation', category: 'logic', aiSpecific: false },
      DEFAULT_CONFIG,
      { 'logic/heaps-deviation': 'Inspect the calibrated source-code statistic.' },
    );
    expect('error' in result).toBe(false);
    if ('error' in result) return;
    expect(result.evidence.calibration.lastCalibratedAt).toBe('2026-07-04T00:00:00Z');
    expect(result.evidence.calibration.provenance).toMatchObject({
      status: 'historical-only',
      source: null,
      cohort: null,
    });
    expect(result.evidence.calibration.provenance.reason).toMatch(/v10\.3 admission/i);
  });

  it('reports static default-off as configuration policy without claiming runtime suppression', () => {
    const result = buildRuleExplanation(
      { ...fakeRule, defaultOff: true },
      { ...DEFAULT_CONFIG, rules: {} },
      fakeHints,
    );

    expect(result.configuration.defaultOff).toBe(true);
    expect(result.configuration.policyState).toBe('legacy-default-off');
    expect(JSON.stringify(result)).not.toMatch(/effective|runtime|suppressed/i);
  });
});
