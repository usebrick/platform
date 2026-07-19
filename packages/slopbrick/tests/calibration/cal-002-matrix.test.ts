import { describe, expect, it } from 'vitest';

import type { Rule } from '../../src/types';
import type { CAL001DecisionRow } from '../../src/calibration/corpus-v1/calibration-decisions';
import { buildCAL002Catalog } from '../../src/calibration/cal-002/catalog';
import {
  CAL002_CONTEXTUAL_RULE_IDS,
  CAL002_DETERMINISTIC_RULE_IDS,
  CAL002_LOCKED_RULE_CATALOG_SHA256,
  CAL002_PROTOCOL_VERSION,
  CAL002_STATISTICAL_RULE_IDS,
  canonicalArtifact,
  validateCAL002FinalMatrix,
  type CAL002Catalog,
  type CAL002QualityMetrics,
} from '../../src/calibration/cal-002/contracts';
import {
  buildCAL002OracleReceipt,
  type CAL002OracleReceipt,
} from '../../src/calibration/cal-002/oracles';
import {
  buildCAL002OriginReceipt,
  type CAL002OriginGoverningHashes,
  type CAL002OriginReceipt,
} from '../../src/calibration/cal-002/origin';
import {
  buildCAL002FinalMatrix,
  type CAL002FinalMatrixResult,
} from '../../src/calibration/cal-002/matrix';
import { RuleRegistry } from '../../src/rules/registry';
import { getDefaultOffRules } from '../../src/rules/signal-strength';
import {
  CAL002_ORACLE_DECLARATIONS,
  CAL002_ORACLE_MUTATION_CASES,
  CAL002_ORACLE_SOURCE_CONTROLS,
} from './fixtures/cal-002-oracle-cases';

const COMMIT_SHA = '0123456789abcdef0123456789abcdef01234567';
const HASH_A = 'a'.repeat(64);

function fullCatalogFixture(): CAL002Catalog {
  const registry = new RuleRegistry();
  registry.loadBuiltins();
  const rules = registry.getRules() as readonly Pick<Rule, 'id' | 'category' | 'aiSpecific' | 'defaultOff'>[];
  const defaultOff = getDefaultOffRules();
  const cal001Rows: CAL001DecisionRow[] = rules.map((rule) => {
    const existingDefaultOff = rule.defaultOff === true || defaultOff.has(rule.id);
    const decision = rule.aiSpecific ? 'default-off' as const : 'quality-only' as const;
    return {
      ruleId: rule.id,
      aiSpecific: rule.aiSpecific,
      existingDefaultOff,
      decision,
      policyAction: decision === 'quality-only' || existingDefaultOff ? 'preserve' : 'owner-review-required',
      evidence: { holdoutReceiptSha256: HASH_A, metricsSha256: 'b'.repeat(64), report: 'CAL-001-v1-origin-discrimination-diagnostic' },
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
      rationale: 'CAL-002 matrix fixture',
    };
  });
  return buildCAL002Catalog({
    rules,
    effectiveDefaultOffRuleIds: defaultOff,
    cal001Rows,
    cal001MatrixSha256: HASH_A,
  }).catalog;
}

function originHashes(): CAL002OriginGoverningHashes {
  return {
    protocolSha256: 'c'.repeat(64),
    sourceBindingReceiptSha256: 'd'.repeat(64),
    splitPlanSha256: 'e'.repeat(64),
    scannerCommitSha: COMMIT_SHA,
    configSha256: 'f'.repeat(64),
    catalogSha256: CAL002_LOCKED_RULE_CATALOG_SHA256,
    holdoutReceiptSha256: '1'.repeat(64),
    metricsSha256: '2'.repeat(64),
    cal001MatrixSha256: HASH_A,
    reducerSha256: '3'.repeat(64),
  };
}

function originReceiptFixture(catalog: CAL002Catalog, transfer?: {
  readonly ruleId: string;
  readonly reason: 'standards-or-contract-quality-claim' | 'contextual-defect-quality-claim' | 'statistical-review-utility-claim';
}): CAL002OriginReceipt {
  const decisions = catalog.rows
    .filter((row) => row.lane === 'origin' && row.ownerReviewRequired)
    .map((row) => row.ruleId === transfer?.ruleId
      ? { ruleId: row.ruleId, disposition: 'transfer-to-quality' as const, reason: transfer.reason }
      : { ruleId: row.ruleId, disposition: 'hold-origin-default-off' as const });
  return buildCAL002OriginReceipt({
    catalog,
    decisions,
    status: 'reused',
    governingHashes: originHashes(),
    originImplementationCommitSha: COMMIT_SHA,
  }).receipt;
}

function oracleReceiptFixture(transfers: readonly { ruleId: string; reason: 'standards-or-contract-quality-claim' }[] = []): CAL002OracleReceipt {
  return buildCAL002OracleReceipt({
    catalogSha256: CAL002_LOCKED_RULE_CATALOG_SHA256,
    implementationCommitSha: COMMIT_SHA,
    transfers,
    declarations: CAL002_ORACLE_DECLARATIONS,
    caseResults: CAL002_ORACLE_MUTATION_CASES,
    sourceControls: CAL002_ORACLE_SOURCE_CONTROLS,
  }).receipt;
}

function counts(useful: number, notUseful: number, cannotDetermine = 0) {
  return {
    actionableDefect: useful,
    usefulNoSafeFix: 0,
    notUseful,
    cannotDetermine,
  };
}

function qualityMetricsFixture(catalog: CAL002Catalog, transfer?: {
  readonly ruleId: string;
  readonly evidenceClass: 'contextual-quality' | 'statistical-review-utility';
}): CAL002QualityMetrics {
  const rows = catalog.rows
    .filter((row) => row.lane === 'quality' && row.evidenceClass !== 'deterministic-or-standards')
    .map((row) => {
      const statistical = row.evidenceClass === 'statistical-review-utility';
      return {
        ruleId: row.ruleId,
        evidenceClass: row.evidenceClass,
        requestedPerArm: 30,
        finding: statistical ? counts(24, 6) : counts(30, 0),
        control: statistical ? counts(6, 24) : counts(0, 30),
        outcome: statistical ? 'quality-advisory' as const : 'default-on' as const,
        claimCeiling: statistical ? 'review-target-utility' as const : 'quality-usefulness' as const,
      };
    });
  if (transfer !== undefined) {
    rows.push({
      ruleId: transfer.ruleId,
      evidenceClass: transfer.evidenceClass,
      requestedPerArm: 30,
      finding: counts(30, 0),
      control: counts(0, 30),
      outcome: transfer.evidenceClass === 'statistical-review-utility' ? 'quality-advisory' as const : 'default-on' as const,
      claimCeiling: transfer.evidenceClass === 'statistical-review-utility' ? 'review-target-utility' as const : 'quality-usefulness' as const,
    });
  }
  rows.sort((left, right) => left.ruleId < right.ruleId ? -1 : left.ruleId > right.ruleId ? 1 : 0);
  return {
    version: 'cal-002-quality-metrics-v1',
    protocolVersion: CAL002_PROTOCOL_VERSION,
    catalogSha256: CAL002_LOCKED_RULE_CATALOG_SHA256,
    assignmentSha256: '4'.repeat(64),
    reviewReceiptSha256: '5'.repeat(64),
    reducerImplementationCommitSha: COMMIT_SHA,
    rows,
    admitted: false,
  };
}

function buildFixture(overrides: {
  readonly transfer?: { readonly ruleId: string; readonly reason: 'standards-or-contract-quality-claim' | 'contextual-defect-quality-claim' | 'statistical-review-utility-claim' };
  readonly metricsTransfer?: { readonly ruleId: string; readonly evidenceClass: 'contextual-quality' | 'statistical-review-utility' };
} = {}): { readonly catalog: CAL002Catalog; readonly originReceipt: CAL002OriginReceipt; readonly oracleReceipt: CAL002OracleReceipt; readonly qualityMetrics: CAL002QualityMetrics } {
  const catalog = fullCatalogFixture();
  const originReceipt = originReceiptFixture(catalog, overrides.transfer);
  const oracleTransfers = overrides.transfer?.reason === 'standards-or-contract-quality-claim'
    ? [{ ruleId: overrides.transfer.ruleId, reason: overrides.transfer.reason }]
    : [];
  return {
    catalog,
    originReceipt,
    oracleReceipt: oracleReceiptFixture(oracleTransfers),
    qualityMetrics: qualityMetricsFixture(catalog, overrides.metricsTransfer),
  };
}

describe('CAL-002 final matrix', () => {
  it('builds a deterministic, validated, non-admitting 119-row matrix', () => {
    const input = buildFixture();
    const first = buildCAL002FinalMatrix({ ...input, reducerImplementationCommitSha: COMMIT_SHA });
    const second = buildCAL002FinalMatrix({ ...input, reducerImplementationCommitSha: COMMIT_SHA });

    expect(first.matrix.counts.total).toBe(119);
    expect(first.matrix.rows).toHaveLength(119);
    expect(first.matrix.rows.every((row) => row.admitted === false)).toBe(true);
    expect(first.matrix.rows.filter((row) => row.lane === 'origin' && row.outcome === 'default-on')).toHaveLength(0);
    expect(first.matrix.applied).toBe(false);
    expect(validateCAL002FinalMatrix(first.matrix)).toEqual({ ok: true, errors: [] });
    expect(first.matrixJson).toBe(canonicalArtifact(first.matrix).json);
    expect(first.matrixSha256).toBe(canonicalArtifact(first.matrix).sha256);
    expect(first.matrixJson).toBe(second.matrixJson);
    expect(first.matrixSha256).toBe(second.matrixSha256);
  });

  it('projects transfers into exactly one quality lane and binds matching evidence', () => {
    const transferred = 'ai/any-density';
    const input = buildFixture({
      transfer: { ruleId: transferred, reason: 'contextual-defect-quality-claim' },
      metricsTransfer: { ruleId: transferred, evidenceClass: 'contextual-quality' },
    });
    const result = buildCAL002FinalMatrix({ ...input, reducerImplementationCommitSha: COMMIT_SHA });
    const row = result.matrix.rows.find((candidate) => candidate.ruleId === transferred)!;

    expect(row).toMatchObject({
      lane: 'quality',
      priorAiSpecific: true,
      transferred: true,
      evidenceClass: 'contextual-quality',
      admitted: false,
    });
    expect(result.matrix.rows.filter((candidate) => candidate.ruleId === transferred)).toHaveLength(1);
  });

  it.each([
    ['missing quality evidence', (input: ReturnType<typeof buildFixture>) => ({ ...input, qualityMetrics: { ...input.qualityMetrics, rows: input.qualityMetrics.rows.slice(1) } })],
    ['admitted origin receipt', (input: ReturnType<typeof buildFixture>) => ({ ...input, originReceipt: { ...input.originReceipt, admitted: true as const } })],
    ['catalog drift', (input: ReturnType<typeof buildFixture>) => ({ ...input, catalog: { ...input.catalog, ruleCatalogSha256: '9'.repeat(64) } })],
  ] as const)('fails closed for %s before producing a matrix', (_label, mutate) => {
    expect(() => buildCAL002FinalMatrix({ ...mutate(buildFixture()), reducerImplementationCommitSha: COMMIT_SHA })).toThrow();
  });

  it('fails closed when a transfer has no matching quality or oracle evidence', () => {
    const input = buildFixture({ transfer: { ruleId: 'ai/any-density', reason: 'contextual-defect-quality-claim' } });
    expect(() => buildCAL002FinalMatrix({ ...input, reducerImplementationCommitSha: COMMIT_SHA })).toThrow(/transfer|evidence|quality/i);
  });
});
