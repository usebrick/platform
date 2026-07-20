import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import Ajv2020 from 'ajv/dist/2020.js';
import { describe, expect, it } from 'vitest';

import { canonicalAuthorityRowsV2 } from '../../src/calibration/cal-002/authority';
import {
  CAL002_LOCKED_RULE_CATALOG_SHA256,
  canonicalArtifact,
} from '../../src/calibration/cal-002/contracts';
import type { CAL002RuntimeOutcomeV2 } from '../../src/calibration/cal-002/contracts-v2';
import {
  buildCAL002MatrixApprovalV2,
  buildCAL002AppliedPolicyV2,
  projectCAL002PolicyCandidateV2,
  validateCAL002ApplicationReceiptV2,
  validateCAL002MatrixApprovalV2,
  validateSlopbrickRuleEvidencePolicyV2,
} from '../../src/calibration/cal-002/application-v2';
import {
  validateCAL002FinalMatrixV2,
  type CAL002FinalMatrixV2,
  type CAL002FinalRowV2,
} from '../../src/calibration/cal-002/matrix-v2';

const HERE = dirname(fileURLToPath(import.meta.url));
const SCHEMA_DIR = join(HERE, '../../src/calibration/cal-002/schemas');
const COMMIT_SHA = 'd'.repeat(40);

function matrixFixture(): CAL002FinalMatrixV2 {
  const rows = canonicalAuthorityRowsV2().map((authority, index): CAL002FinalRowV2 => {
    const common = {
      ruleId: authority.ruleId,
      destination: authority.destination,
      qualityDomain: authority.qualityDomain,
      claimClass: authority.claimClass,
      readiness: authority.readiness,
      aiAssociation: authority.aiAssociation,
      evidenceSha256: String((index % 9) + 1).repeat(64),
      admitted: false as const,
    };
    if (authority.readiness === 'repair-required' || authority.readiness === 'project-contract-required') {
      return {
        ...common,
        measurementStatus: 'unavailable',
        runtimeOutcome: 'default-off',
        enabledByDefault: false,
        runnableByExplicitOptIn: false,
        scoreEligible: false,
        gateEligible: false,
        repairSafety: 'no-safe-repair',
        provenance: 'blocked-quality-candidate',
      };
    }
    if (authority.destination === 'superseded') {
      return {
        ...common,
        measurementStatus: 'not-applicable',
        runtimeOutcome: 'superseded',
        enabledByDefault: false,
        runnableByExplicitOptIn: false,
        scoreEligible: false,
        gateEligible: false,
        repairSafety: 'not-applicable',
        provenance: 'superseded-policy',
        replacementRuleId: authority.replacementRuleId!,
      };
    }
    if (authority.destination === 'retired') {
      return {
        ...common,
        measurementStatus: 'not-applicable',
        runtimeOutcome: 'retired',
        enabledByDefault: false,
        runnableByExplicitOptIn: false,
        scoreEligible: false,
        gateEligible: false,
        repairSafety: 'not-applicable',
        provenance: 'retired-policy',
      };
    }
    if (authority.destination === 'research-origin') {
      return {
        ...common,
        measurementStatus: 'not-applicable',
        runtimeOutcome: 'default-off',
        enabledByDefault: false,
        runnableByExplicitOptIn: true,
        scoreEligible: false,
        gateEligible: false,
        repairSafety: 'not-applicable',
        provenance: 'internal-origin-association',
      };
    }
    if (authority.evidenceClass === 'deterministic-or-standards') {
      return {
        ...common,
        evidenceClass: authority.evidenceClass,
        measurementStatus: 'oracle-verified',
        runtimeOutcome: 'default-on',
        enabledByDefault: true,
        runnableByExplicitOptIn: true,
        scoreEligible: true,
        gateEligible: true,
        repairSafety: 'finding-bound-only',
        provenance: 'deterministic-finding-evidence',
      };
    }
    const advisory = authority.ruleId === 'layout/gap-monopoly';
    return {
      ...common,
      evidenceClass: authority.evidenceClass!,
      measurementStatus: advisory ? 'measured' : 'not-requested-owner-capacity',
      runtimeOutcome: advisory ? 'quality-advisory' : 'quality-candidate-default-off',
      enabledByDefault: false,
      runnableByExplicitOptIn: true,
      scoreEligible: false,
      gateEligible: false,
      repairSafety: advisory ? 'finding-bound-only' : 'no-safe-repair',
      provenance: advisory ? 'current-quality-advisory' : 'quality-candidate-unmeasured',
    };
  });
  const outcomes: CAL002RuntimeOutcomeV2[] = [
    'default-on',
    'quality-advisory',
    'quality-candidate-default-off',
    'default-off',
    'insufficient-evidence',
    'superseded',
    'retired',
  ];
  const matrix: CAL002FinalMatrixV2 = {
    version: 'cal-002-final-matrix-v2',
    protocolVersion: 'CAL-002-v2',
    catalogSha256: CAL002_LOCKED_RULE_CATALOG_SHA256,
    authorityReceiptSha256: 'a'.repeat(64),
    oracleReceiptSha256: 'b'.repeat(64),
    qualityDispositionSha256: 'c'.repeat(64),
    originReceiptSha256: 'd'.repeat(64),
    supersessionReceiptSha256: 'e'.repeat(64),
    reducerImplementationCommitSha: COMMIT_SHA,
    rows,
    projectionCounts: {
      startingQuality: 47,
      transferred: 26,
      blocked: 4,
      superseded: 3,
      retired: 7,
      researchOrigin: 32,
    },
    outcomeCounts: Object.fromEntries(outcomes.map((outcome) => [
      outcome,
      rows.filter((row) => row.runtimeOutcome === outcome).length,
    ])) as Record<CAL002RuntimeOutcomeV2, number>,
    admitted: false,
    applied: false,
  };
  expect(validateCAL002FinalMatrixV2(matrix)).toEqual({ ok: true, errors: [] });
  return matrix;
}

function schemaValidator(file: string) {
  const schema = JSON.parse(readFileSync(join(SCHEMA_DIR, file), 'utf8'));
  return new Ajv2020({ allErrors: true, strict: true }).compile(schema);
}

describe('CAL-002 policy application v2', () => {
  it.each([
    ['default-on', 'context/import-path-mismatch', true, true, true, true],
    ['quality-advisory', 'layout/gap-monopoly', false, true, false, false],
    ['quality-candidate-default-off', 'ai/any-density', false, true, false, false],
    ['blocked-quality-candidate', 'logic/ghost-defensive', false, false, false, false],
    ['internal-origin-association', 'ai/comment-ratio', false, true, false, false],
    ['superseded', 'logic/math-any-density', false, false, false, false],
    ['retired', 'ai/renyi-profile', false, false, false, false],
  ] as const)('%s has exact runtime effects', (_state, ruleId, enabled, optIn, score, gate) => {
    const candidate = projectCAL002PolicyCandidateV2(matrixFixture()).policy;
    const policyRow = candidate.rows.find((row) => row.ruleId === ruleId)!;
    expect([
      policyRow.enabledByDefault,
      policyRow.runnableByExplicitOptIn,
      policyRow.scoreEligible,
      policyRow.gateEligible,
    ]).toEqual([enabled, optIn, score, gate]);
  });

  it('projects a deterministic unapplied candidate without approval, application, metrics, or reviewer data', () => {
    const matrix = matrixFixture();
    const first = projectCAL002PolicyCandidateV2(matrix);
    const second = projectCAL002PolicyCandidateV2(matrix);
    expect(first.policy).toMatchObject({
      version: 'slopbrick-rule-evidence-policy-v2',
      protocolVersion: 'CAL-002-v2',
      catalogSha256: CAL002_LOCKED_RULE_CATALOG_SHA256,
      finalMatrixSha256: canonicalArtifact(matrix).sha256,
      policyRowsSha256: canonicalArtifact(first.policy.rows).sha256,
      admitted: false,
      applied: false,
    });
    expect(first.policy).not.toHaveProperty('matrixApprovalSha256');
    expect(first.policy).not.toHaveProperty('applicationImplementationCommitSha');
    expect(first.policy.rows).toHaveLength(119);
    expect(first.policyJson).toBe(second.policyJson);
    expect(first.policySha256).toBe(canonicalArtifact(first.policy).sha256);
    expect(first).not.toHaveProperty('applicationReceipt');
    const keys = new Set<string>();
    const collectKeys = (value: unknown): void => {
      if (Array.isArray(value)) return value.forEach(collectKeys);
      if (value === null || typeof value !== 'object') return;
      for (const [key, child] of Object.entries(value)) {
        keys.add(key);
        collectKeys(child);
      }
    };
    collectKeys(first.policy);
    expect([...keys]).not.toEqual(expect.arrayContaining([
      'precision', 'recall', 'fpRate', 'ratio', 'verdict', 'sourceText', 'sourcePath',
      'repositoryId', 'reviewerAuthority', 'reviewerIdentity',
    ]));
    expect(validateSlopbrickRuleEvidencePolicyV2(first.policy)).toEqual({ ok: true, errors: [] });
  });

  it('approves an exact matrix and builds a hash-bound applied policy plus receipt', () => {
    const matrix = matrixFixture();
    const approval = buildCAL002MatrixApprovalV2({ matrix, approvalCommitSha: COMMIT_SHA });
    const candidate = projectCAL002PolicyCandidateV2(matrix);
    const result = buildCAL002AppliedPolicyV2({
      matrix,
      approval: approval.approval,
      applicationImplementationCommitSha: COMMIT_SHA,
    });
    expect(approval.approval).toMatchObject({
      finalMatrixSha256: canonicalArtifact(matrix).sha256,
      approvalCommitSha: COMMIT_SHA,
      reviewerAuthority: 'repository-owner',
      decision: 'approved',
      admitted: false,
      applied: false,
    });
    expect(result.policy).toMatchObject({
      finalMatrixSha256: approval.approval.finalMatrixSha256,
      matrixApprovalSha256: canonicalArtifact(approval.approval).sha256,
      applicationImplementationCommitSha: COMMIT_SHA,
      policyRowsSha256: candidate.policy.policyRowsSha256,
      admitted: false,
      applied: true,
    });
    expect(result.applicationReceipt).toMatchObject({
      finalMatrixSha256: approval.approval.finalMatrixSha256,
      matrixApprovalSha256: canonicalArtifact(approval.approval).sha256,
      policyRowsSha256: candidate.policy.policyRowsSha256,
      policySha256: canonicalArtifact(result.policy).sha256,
      applicationImplementationCommitSha: COMMIT_SHA,
      admitted: false,
      applied: true,
    });
    expect(validateCAL002MatrixApprovalV2(approval.approval)).toEqual({ ok: true, errors: [] });
    expect(validateSlopbrickRuleEvidencePolicyV2(result.policy)).toEqual({ ok: true, errors: [] });
    expect(validateCAL002ApplicationReceiptV2(result.applicationReceipt)).toEqual({ ok: true, errors: [] });
  });

  it('keeps all four schemas closed and aligned with runtime validation', () => {
    const matrix = matrixFixture();
    const approval = buildCAL002MatrixApprovalV2({ matrix, approvalCommitSha: COMMIT_SHA });
    const candidate = projectCAL002PolicyCandidateV2(matrix).policy;
    const applied = buildCAL002AppliedPolicyV2({
      matrix,
      approval: approval.approval,
      applicationImplementationCommitSha: COMMIT_SHA,
    });
    const fixtures = {
      'cal-002-final-matrix-v2.schema.json': matrix,
      'cal-002-matrix-approval-v2.schema.json': approval.approval,
      'slopbrick-rule-evidence-policy-v2.schema.json': candidate,
      'cal-002-application-receipt-v2.schema.json': applied.applicationReceipt,
    };
    for (const [file, fixture] of Object.entries(fixtures)) {
      const validate = schemaValidator(file);
      expect(validate(fixture), `${file}: ${JSON.stringify(validate.errors)}`).toBe(true);
      const schema = JSON.parse(readFileSync(join(SCHEMA_DIR, file), 'utf8'));
      const visit = (value: unknown, path: string): void => {
        if (Array.isArray(value)) return value.forEach((child, index) => visit(child, `${path}[${index}]`));
        if (value === null || typeof value !== 'object') return;
        const record = value as Record<string, unknown>;
        if (record.type === 'object') expect(record.additionalProperties, path).toBe(false);
        Object.entries(record).forEach(([key, child]) => visit(child, `${path}.${key}`));
      };
      visit(schema, file);
    }
  });

  it.each([
    ['wrong matrix hash', (approval: ReturnType<typeof buildCAL002MatrixApprovalV2>['approval']) => ({ ...approval, finalMatrixSha256: '9'.repeat(64) })],
    ['already applied approval', (approval: ReturnType<typeof buildCAL002MatrixApprovalV2>['approval']) => ({ ...approval, applied: true as false })],
    ['admitted approval', (approval: ReturnType<typeof buildCAL002MatrixApprovalV2>['approval']) => ({ ...approval, admitted: true as false })],
  ] as const)('rejects %s', (_label, mutate) => {
    const matrix = matrixFixture();
    const approval = buildCAL002MatrixApprovalV2({ matrix, approvalCommitSha: COMMIT_SHA });
    expect(() => buildCAL002AppliedPolicyV2({
      matrix,
      approval: mutate(approval.approval),
      applicationImplementationCommitSha: COMMIT_SHA,
    })).toThrow();
  });

  it('rejects approval/application fields on an unapplied policy and missing fields on an applied policy', () => {
    const matrix = matrixFixture();
    const candidate = projectCAL002PolicyCandidateV2(matrix).policy;
    expect(validateSlopbrickRuleEvidencePolicyV2({
      ...candidate,
      matrixApprovalSha256: 'a'.repeat(64),
    }).ok).toBe(false);
    expect(validateSlopbrickRuleEvidencePolicyV2({ ...candidate, applied: true }).ok).toBe(false);
  });

  it('rejects a blocked authority row disguised as a runnable quality failure', () => {
    const candidate = projectCAL002PolicyCandidateV2(matrixFixture()).policy;
    const rows = candidate.rows.map((row) => row.ruleId === 'logic/ghost-defensive' ? {
      ...row,
      runtimeOutcome: 'default-off' as const,
      runnableByExplicitOptIn: true,
      provenance: 'current-quality-failed-claim-bar' as const,
    } : row);
    expect(validateSlopbrickRuleEvidencePolicyV2({
      ...candidate,
      rows,
      policyRowsSha256: canonicalArtifact(rows).sha256,
    }).ok).toBe(false);
  });
});
