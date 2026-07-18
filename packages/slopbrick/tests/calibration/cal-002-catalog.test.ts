import { describe, expect, it } from 'vitest';
import type { Rule } from '../../src/types';
import type { CAL001DecisionRow } from '../../src/calibration/corpus-v1/calibration-decisions';
import {
  CAL002_CONTEXTUAL_RULE_IDS,
  CAL002_DETERMINISTIC_RULE_IDS,
  CAL002_LOCKED_RULE_CATALOG_SHA256,
  CAL002_STATISTICAL_RULE_IDS,
  buildCAL002Catalog,
} from '../../src/calibration/cal-002/catalog';
import { canonicalArtifact, validateCAL002Catalog } from '../../src/calibration/cal-002/contracts';
import { RuleRegistry } from '../../src/rules/registry';
import { getDefaultOffRules } from '../../src/rules/signal-strength';

const MATRIX_HASH = 'a'.repeat(64);

function compareCodePoints(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function currentRules(): readonly Pick<Rule, 'id' | 'category' | 'aiSpecific' | 'defaultOff'>[] {
  const registry = new RuleRegistry();
  registry.loadBuiltins();
  return registry.getRules();
}

function cal001Rows(
  rules: readonly Pick<Rule, 'id' | 'category' | 'aiSpecific' | 'defaultOff'>[],
  effectiveDefaultOffRuleIds: ReadonlySet<string>,
): CAL001DecisionRow[] {
  return rules.map((rule) => {
    const existingDefaultOff = rule.defaultOff === true || effectiveDefaultOffRuleIds.has(rule.id);
    const decision = rule.aiSpecific ? 'default-off' as const : 'quality-only' as const;
    return {
      ruleId: rule.id,
      aiSpecific: rule.aiSpecific,
      existingDefaultOff,
      decision,
      policyAction: decision === 'quality-only' || existingDefaultOff ? 'preserve' : 'owner-review-required',
      evidence: {
        holdoutReceiptSha256: 'b'.repeat(64),
        metricsSha256: 'c'.repeat(64),
        report: 'CAL-001-v1-origin-discrimination-diagnostic',
      },
      originResult: {
        status: rule.aiSpecific ? 'diagnostic-only' : 'not-evaluated',
        splitStatus: { train: 'available', validation: 'available', test: 'available' },
        ruleStatus: { train: 'ok', validation: 'ok', test: 'ok' },
      },
      usefulnessResult: 'not-evaluated',
      confounds: {
        leakage: 'clear',
        sourceLabels: 'publisher-attested-polarity-not-authorship',
        frameworkBuckets: 'not-available',
        semanticBuckets: 'not-available',
      },
      owner: 'calibration-maintainers',
      rationale: 'Frozen CAL-001 fixture row.',
    };
  });
}

function input() {
  const rules = currentRules();
  const effectiveDefaultOffRuleIds = getDefaultOffRules();
  return {
    rules,
    effectiveDefaultOffRuleIds,
    cal001Rows: cal001Rows(rules, effectiveDefaultOffRuleIds),
    cal001MatrixSha256: MATRIX_HASH,
  };
}

describe('CAL-002 frozen 119-rule catalog', () => {
  it('freezes the exact lane, review, and evidence-class counts', () => {
    const result = buildCAL002Catalog(input());
    expect(result.catalog).toMatchObject({
      version: 'cal-002-catalog-v1',
      protocolVersion: 'CAL-002-v1',
      counts: {
        total: 119,
        startingQuality: 47,
        startingOrigin: 72,
        ownerReviewRequired: 40,
        deterministic: 32,
        contextual: 11,
        statistical: 4,
      },
      admitted: false,
      applied: false,
    });
    expect(new Set(result.catalog.rows.map((row) => row.ruleId)).size).toBe(119);
    expect(result.catalog.rows.map((row) => row.ruleId)).toEqual(
      [...result.catalog.rows.map((row) => row.ruleId)].sort(compareCodePoints),
    );
    expect(result.catalog.ruleCatalogSha256).toBe(CAL002_LOCKED_RULE_CATALOG_SHA256);
    expect(result.catalogSha256).toMatch(/^[a-f0-9]{64}$/u);
    expect(result.catalogJson).toBe(canonicalArtifact(result.catalog).json);
  });

  it('locks the 4 statistical, 11 contextual, and 32 deterministic IDs exactly', () => {
    expect(CAL002_STATISTICAL_RULE_IDS).toEqual([
      'logic/heaps-deviation',
      'logic/math-variable-name-entropy',
      'logic/zipf-slope-anomaly',
      'typo/math-button-label-uniformity',
    ]);
    expect(CAL002_CONTEXTUAL_RULE_IDS).toEqual([
      'component/multiple-components-per-file',
      'java/suspicious-implementation',
      'layout/gap-monopoly',
      'layout/spacing-grid',
      'logic/boundary-violation',
      'perf/css-bloat',
      'product/terminology-drift',
      'rb/n-plus-one-query',
      'visual/inline-style-dominance',
      'visual/radius-scale-violation',
      'visual/spacing-scale-violation',
    ]);
    expect(CAL002_DETERMINISTIC_RULE_IDS).toEqual([
      'context/import-path-mismatch',
      'cs/async-without-await',
      'cs/empty-catch-block',
      'cs/sql-string-interpolation',
      'docs/broken-link',
      'docs/stale-function-reference',
      'docs/stale-package-reference',
      'dup/identical-block',
      'java/lost-stack-trace',
      'java/sql-string-concat',
      'java/thread-sleep-in-loop',
      'kt/coroutine-cancellation-missing',
      'kt/force-unwrap',
      'kt/global-coroutine-scope',
      'kt/string-template-injection',
      'logic/key-prop-missing',
      'perf/cls-image',
      'php/empty-catch',
      'php/sql-injection',
      'rb/exception-swallowing',
      'rb/sql-string-concat',
      'security/eval',
      'security/exposed-env-var',
      'security/localstorage-token',
      'security/missing-auth-check',
      'security/public-admin-route',
      'security/target-blank-no-noopener',
      'security/unsafe-html-render',
      'typo/placeholder-text',
      'wcag/focus-appearance',
      'wcag/focus-obscured',
      'wcag/missing-alt',
    ]);

    const qualityRows = buildCAL002Catalog(input()).catalog.rows.filter((row) => row.lane === 'quality');
    const classified = new Set([
      ...CAL002_STATISTICAL_RULE_IDS,
      ...CAL002_CONTEXTUAL_RULE_IDS,
      ...CAL002_DETERMINISTIC_RULE_IDS,
    ]);
    expect(classified.size).toBe(47);
    expect([...classified].sort()).toEqual(qualityRows.map((row) => row.ruleId));
  });

  it('derives existingDefaultOff from rule source or effective legacy policy', () => {
    const current = input();
    const sourceRule = current.rules.find((rule) => rule.defaultOff === true);
    const effectiveOnlyRule = current.rules.find((rule) => rule.defaultOff !== true && current.effectiveDefaultOffRuleIds.has(rule.id));
    expect(sourceRule, 'expected a source-level defaultOff rule').toBeDefined();
    expect(effectiveOnlyRule, 'expected an effective-policy-only defaultOff rule').toBeDefined();

    const rows = buildCAL002Catalog(current).catalog.rows;
    expect(rows.find((row) => row.ruleId === sourceRule!.id)?.existingDefaultOff).toBe(true);
    expect(rows.find((row) => row.ruleId === effectiveOnlyRule!.id)?.existingDefaultOff).toBe(true);
  });

  it('is stable across input order and binds the supplied CAL-001 matrix hash', () => {
    const current = input();
    const first = buildCAL002Catalog(current);
    const second = buildCAL002Catalog({
      ...current,
      rules: [...current.rules].reverse(),
      cal001Rows: [...current.cal001Rows].reverse(),
    });
    expect(second).toEqual(first);
    expect(first.catalog.cal001MatrixSha256).toBe(MATRIX_HASH);
  });

  it('rejects CAL-001 catalog drift, metadata drift, duplicates, and malformed bindings', () => {
    const current = input();
    expect(() => buildCAL002Catalog({ ...current, cal001Rows: current.cal001Rows.slice(1) })).toThrow(/CAL-001.*catalog/i);
    expect(() => buildCAL002Catalog({
      ...current,
      cal001Rows: current.cal001Rows.map((row, index) => index === 0 ? { ...row, aiSpecific: !row.aiSpecific } : row),
    })).toThrow(/CAL-001.*aiSpecific/i);
    expect(() => buildCAL002Catalog({ ...current, rules: [...current.rules, current.rules[0]!] })).toThrow(/duplicate/i);
    expect(() => buildCAL002Catalog({ ...current, cal001MatrixSha256: 'ABC123' })).toThrow(/SHA-256/i);
  });

  it('rejects self-consistent partial and substituted catalog projections', () => {
    const current = input();
    const full = buildCAL002Catalog(current).catalog;
    const project = (rows: typeof full.rows) => ({
      ...full,
      rows,
      ruleCatalogSha256: canonicalArtifact(rows.map((row) => ({
        ruleId: row.ruleId,
        category: row.category,
        aiSpecific: row.aiSpecific,
        existingDefaultOff: row.existingDefaultOff,
      }))).sha256,
      counts: {
        total: rows.length,
        startingQuality: rows.filter((row) => row.lane === 'quality').length,
        startingOrigin: rows.filter((row) => row.lane === 'origin').length,
        ownerReviewRequired: rows.filter((row) => row.ownerReviewRequired).length,
        deterministic: rows.filter((row) => row.evidenceClass === 'deterministic-or-standards').length,
        contextual: rows.filter((row) => row.evidenceClass === 'contextual-quality').length,
        statistical: rows.filter((row) => row.evidenceClass === 'statistical-review-utility').length,
      },
    });

    expect(validateCAL002Catalog(project(full.rows.slice(0, 1))).ok).toBe(false);
    expect(validateCAL002Catalog(project(full.rows.slice(1))).ok).toBe(false);
    expect(() => buildCAL002Catalog({ ...current, rules: current.rules.slice(1), cal001Rows: current.cal001Rows.slice(1) })).toThrow(/119|locked|catalog/i);

    const replacementRule = { ...current.rules.at(-1)!, id: 'visual/substituted-rule' };
    const replacementCal001 = { ...current.cal001Rows.at(-1)!, ruleId: replacementRule.id };
    expect(() => buildCAL002Catalog({
      ...current,
      rules: [...current.rules.slice(0, -1), replacementRule],
      cal001Rows: [...current.cal001Rows.slice(0, -1), replacementCal001],
    })).toThrow(/locked|catalog|identity/i);
  });
});
