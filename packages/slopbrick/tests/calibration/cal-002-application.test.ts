import { describe, expect, it } from 'vitest';

import type { Rule } from '../../src/types';
import type { CAL001DecisionRow } from '../../src/calibration/corpus-v1/calibration-decisions';
import { buildCAL002Catalog } from '../../src/calibration/cal-002/catalog';
import {
  CAL002_DETERMINISTIC_RULE_IDS,
  CAL002_LOCKED_RULE_CATALOG_SHA256,
  CAL002_PROTOCOL_VERSION,
  canonicalArtifact,
  validateCAL002FinalMatrix,
  validateCAL002MatrixApproval,
  validateSlopbrickRuleEvidencePolicy,
  type CAL002Catalog,
  type CAL002FinalRow,
} from '../../src/calibration/cal-002/contracts';
import {
  buildCAL002ApplicationReceipt,
  buildCAL002MatrixApproval,
  buildCAL002PolicyArtifact,
} from '../../src/calibration/cal-002/application';
import type { CAL002FinalMatrix } from '../../src/calibration/cal-002/application';
import { RuleRegistry } from '../../src/rules/registry';
import { getDefaultOffRules } from '../../src/rules/signal-strength';

const COMMIT_SHA = '0123456789abcdef0123456789abcdef01234567';

function catalogFixture(): CAL002Catalog {
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
      evidence: { holdoutReceiptSha256: 'a'.repeat(64), metricsSha256: 'b'.repeat(64), report: 'CAL-001-v1-origin-discrimination-diagnostic' },
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
      rationale: 'CAL-002 application fixture',
    };
  });
  return buildCAL002Catalog({
    rules,
    effectiveDefaultOffRuleIds: defaultOff,
    cal001Rows,
    cal001MatrixSha256: 'c'.repeat(64),
  }).catalog;
}

function finalMatrixFixture(): CAL002FinalMatrix {
  const catalog = catalogFixture();
  const rows: CAL002FinalRow[] = catalog.rows.map((catalogRow) => {
    if (catalogRow.lane === 'origin') {
      return {
        ruleId: catalogRow.ruleId,
        lane: 'origin',
        priorAiSpecific: true,
        transferred: false,
        measurementStatus: 'measured',
        claimCeiling: 'internal-origin-association',
        authority: 'publisher-attested-internal',
        sampleCounts: { findings: 0, controls: 0, cannotDetermine: 0 },
        usefulness: 'not-applicable',
        outcome: 'default-off',
        enabledByDefault: false,
        scoreEligibleByDefault: false,
        repairSafety: 'not-applicable',
        evidenceSha256: '1'.repeat(64),
        admitted: false,
      };
    }
    const statistical = catalogRow.evidenceClass === 'statistical-review-utility';
    return {
      ruleId: catalogRow.ruleId,
      lane: 'quality',
      priorAiSpecific: false,
      transferred: false,
      evidenceClass: catalogRow.evidenceClass,
      measurementStatus: catalogRow.evidenceClass === 'deterministic-or-standards' ? 'oracle-verified' : 'measured',
      claimCeiling: statistical ? 'review-target-utility' : catalogRow.evidenceClass === 'deterministic-or-standards' ? 'deterministic-defect' : 'quality-usefulness',
      authority: catalogRow.evidenceClass === 'deterministic-or-standards' ? 'standards-contract' : 'repository-owner',
      sampleCounts: { findings: statistical ? 30 : 1, controls: statistical ? 30 : 1, cannotDetermine: 0 },
      ...(statistical ? { uncertainty: { findingUseful: { lower: 0.5, upper: 0.9 }, controlUseful: { lower: 0.1, upper: 0.4 } } } : {}),
      usefulness: statistical ? 'advisory' : 'passed',
      outcome: statistical ? 'quality-advisory' : 'default-on',
      enabledByDefault: true,
      scoreEligibleByDefault: !statistical,
      repairSafety: statistical ? 'no-safe-repair' : 'finding-bound-only',
      evidenceSha256: '2'.repeat(64),
      admitted: false,
    };
  });
  const counts = {
    total: rows.length,
    defaultOn: rows.filter((row) => row.outcome === 'default-on').length,
    defaultOff: rows.filter((row) => row.outcome === 'default-off').length,
    qualityAdvisory: rows.filter((row) => row.outcome === 'quality-advisory').length,
    insufficientEvidence: rows.filter((row) => row.outcome === 'insufficient-evidence').length,
    retired: rows.filter((row) => row.outcome === 'retired').length,
  };
  const matrix: CAL002FinalMatrix = {
    version: 'cal-002-final-matrix-v1',
    protocolVersion: CAL002_PROTOCOL_VERSION,
    catalogSha256: CAL002_LOCKED_RULE_CATALOG_SHA256,
    oracleReceiptSha256: '3'.repeat(64),
    qualityMetricsSha256: '4'.repeat(64),
    originReceiptSha256: '5'.repeat(64),
    reducerImplementationCommitSha: COMMIT_SHA,
    rows,
    counts,
    admitted: false,
    applied: false,
  };
  expect(validateCAL002FinalMatrix(matrix)).toEqual({ ok: true, errors: [] });
  return matrix;
}

describe('CAL-002 policy application artifact', () => {
  it('creates a static 119-row policy with no historical metrics or admission', () => {
    const matrix = finalMatrixFixture();
    const approval = buildCAL002MatrixApproval({
      matrix,
      approvalCommitSha: COMMIT_SHA,
    });
    const first = buildCAL002PolicyArtifact({
      matrix,
      approval: approval.approval,
      applicationImplementationCommitSha: COMMIT_SHA,
    });
    const second = buildCAL002PolicyArtifact({
      matrix,
      approval: approval.approval,
      applicationImplementationCommitSha: COMMIT_SHA,
    });

    expect(validateCAL002MatrixApproval(approval.approval)).toEqual({ ok: true, errors: [] });
    expect(validateSlopbrickRuleEvidencePolicy(first.policy)).toEqual({ ok: true, errors: [] });
    expect(first.policy.rows).toHaveLength(119);
    expect(first.policy.admitted).toBe(false);
    expect(first.policy.applied).toBe(true);
    expect(JSON.stringify(first.policy)).not.toContain('legacyMetrics');
    for (const row of first.policy.rows) {
      expect(Object.keys(row).sort()).toEqual([
        'claimCeiling', 'enabledByDefault', 'outcome', 'provenance', 'ruleId', 'scoreEligible',
      ]);
    }
    expect(first.policyJson).toBe(canonicalArtifact(first.policy).json);
    expect(first.policySha256).toBe(canonicalArtifact(first.policy).sha256);
    expect(first.policyJson).toBe(second.policyJson);
  });

  it('emits an approval receipt bound to the exact matrix SHA', () => {
    const matrix = finalMatrixFixture();
    const approval = buildCAL002MatrixApproval({ matrix, approvalCommitSha: COMMIT_SHA });
    expect(approval.approval.finalMatrixSha256).toBe(canonicalArtifact(matrix).sha256);
    expect(approval.approval.reviewerAuthority).toBe('repository-owner');
    expect(approval.approval.decision).toBe('approved');
    expect(approval.approval.admitted).toBe(false);
    expect(approval.approval.applied).toBe(false);
  });

  it('keeps a failed deterministic oracle row default-off without losing its claim ceiling', () => {
    const matrix = finalMatrixFixture();
    const failedRuleId = CAL002_DETERMINISTIC_RULE_IDS[0];
    const rows = matrix.rows.map((row) => row.ruleId === failedRuleId
      ? { ...row, usefulness: 'failed' as const, outcome: 'default-off' as const, enabledByDefault: false, scoreEligibleByDefault: false }
      : row);
    const failedMatrix: CAL002FinalMatrix = {
      ...matrix,
      rows,
      counts: {
        ...matrix.counts,
        defaultOn: matrix.counts.defaultOn - 1,
        defaultOff: matrix.counts.defaultOff + 1,
      },
    };
    expect(validateCAL002FinalMatrix(failedMatrix)).toEqual({ ok: true, errors: [] });
    const approval = buildCAL002MatrixApproval({ matrix: failedMatrix, approvalCommitSha: COMMIT_SHA });
    const result = buildCAL002PolicyArtifact({ matrix: failedMatrix, approval: approval.approval, applicationImplementationCommitSha: COMMIT_SHA });
    expect(result.policy.rows.find((row) => row.ruleId === failedRuleId)).toMatchObject({
      outcome: 'default-off',
      claimCeiling: 'deterministic-defect',
      provenance: 'current-quality-failed-claim-bar',
      enabledByDefault: false,
      scoreEligible: false,
    });
  });

  it('rejects a matrix with the wrong locked rule IDs and a policy that overwrites matrix provenance', () => {
    const matrix = finalMatrixFixture();
    const last = matrix.rows.length - 1;
    const wrongRows = matrix.rows.map((row, index) => index === last ? { ...row, ruleId: 'wcag/zzzz' } : row);
    expect(() => buildCAL002MatrixApproval({ matrix: { ...matrix, rows: wrongRows }, approvalCommitSha: COMMIT_SHA })).toThrow(/locked rule IDs/i);

    const approval = buildCAL002MatrixApproval({ matrix, approvalCommitSha: COMMIT_SHA });
    const built = buildCAL002PolicyArtifact({ matrix, approval: approval.approval, applicationImplementationCommitSha: COMMIT_SHA });
    const overwritten = {
      ...built.policy,
      rows: built.policy.rows.map((row) => row.ruleId === 'security/eval'
        ? { ...row, claimCeiling: 'quality-usefulness' as const, provenance: 'current-quality-calibrated' as const }
        : row),
    };
    expect(validateSlopbrickRuleEvidencePolicy(overwritten)).toEqual({ ok: true, errors: [] });
    expect(() => buildCAL002ApplicationReceipt({
      matrix,
      approval: approval.approval,
      policy: overwritten,
      applicationImplementationCommitSha: COMMIT_SHA,
    })).toThrow(/project|matrix/i);
  });

  it.each([
    ['wrong matrix SHA', (approval: ReturnType<typeof buildCAL002MatrixApproval>['approval']) => ({ ...approval, finalMatrixSha256: '9'.repeat(64) })],
    ['rejected decision', (approval: ReturnType<typeof buildCAL002MatrixApproval>['approval']) => ({ ...approval, decision: 'rejected' as never })],
    ['already applied matrix', (matrix: CAL002FinalMatrix) => ({ ...matrix, applied: true as const })],
  ] as const)('fails closed for %s', (label, mutate) => {
    const matrix = finalMatrixFixture();
    const approval = buildCAL002MatrixApproval({ matrix, approvalCommitSha: COMMIT_SHA });
    if (label === 'already applied matrix') {
      expect(() => buildCAL002PolicyArtifact({
        matrix: mutate(matrix) as CAL002FinalMatrix,
        approval: approval.approval,
        applicationImplementationCommitSha: COMMIT_SHA,
      })).toThrow();
      return;
    }
    expect(() => buildCAL002PolicyArtifact({
      matrix,
      approval: mutate(approval.approval) as typeof approval.approval,
      applicationImplementationCommitSha: COMMIT_SHA,
    })).toThrow();
  });
});
