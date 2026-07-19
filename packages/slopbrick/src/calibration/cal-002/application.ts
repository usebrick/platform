import {
  CAL002_LOCKED_COUNTS,
  CAL002_LOCKED_RULE_IDS,
  CAL002_LOCKED_RULE_CATALOG_SHA256,
  CAL002_MATRIX_APPROVAL_VERSION,
  CAL002_PROTOCOL_VERSION,
  SLOPBRICK_RULE_EVIDENCE_POLICY_VERSION,
  assertCommitSha,
  canonicalArtifact,
  validateCAL002FinalMatrix,
  validateCAL002MatrixApproval,
  validateSlopbrickRuleEvidencePolicy,
  type CAL002ClaimCeiling,
  type CAL002FinalRow,
  type CAL002PolicyOutcome,
} from './contracts';
import {
  type CAL002FinalMatrix,
} from './matrix';

export type { CAL002FinalMatrix } from './matrix';

export interface CAL002MatrixApproval {
  readonly version: typeof CAL002_MATRIX_APPROVAL_VERSION;
  readonly protocolVersion: typeof CAL002_PROTOCOL_VERSION;
  readonly catalogSha256: typeof CAL002_LOCKED_RULE_CATALOG_SHA256;
  readonly finalMatrixSha256: string;
  readonly approvalCommitSha: string;
  readonly reviewerAuthority: 'repository-owner';
  readonly decision: 'approved';
  readonly admitted: false;
  readonly applied: false;
}

export interface CAL002MatrixApprovalResult {
  readonly approval: CAL002MatrixApproval;
  readonly approvalJson: string;
  readonly approvalSha256: string;
}

export interface SlopbrickRuleEvidencePolicyRow {
  readonly ruleId: string;
  readonly outcome: CAL002PolicyOutcome;
  readonly claimCeiling: CAL002ClaimCeiling;
  readonly enabledByDefault: boolean;
  readonly scoreEligible: boolean;
  readonly provenance:
    | 'deterministic-finding-evidence'
    | 'current-quality-calibrated'
    | 'advisory-review-utility'
    | 'internal-origin-calibrated'
    | 'current-quality-failed-claim-bar'
    | 'insufficient-evidence'
    | 'retired-policy';
}

export interface SlopbrickRuleEvidencePolicy {
  readonly version: typeof SLOPBRICK_RULE_EVIDENCE_POLICY_VERSION;
  readonly protocolVersion: typeof CAL002_PROTOCOL_VERSION;
  readonly catalogSha256: typeof CAL002_LOCKED_RULE_CATALOG_SHA256;
  readonly finalMatrixSha256: string;
  readonly matrixApprovalSha256: string;
  readonly applicationImplementationCommitSha: string;
  readonly rows: readonly SlopbrickRuleEvidencePolicyRow[];
  readonly admitted: false;
  readonly applied: true;
}

export interface CAL002PolicyArtifactResult {
  readonly policy: SlopbrickRuleEvidencePolicy;
  readonly policyJson: string;
  readonly policySha256: string;
  readonly applicationReceipt: CAL002ApplicationReceipt;
  readonly applicationReceiptJson: string;
  readonly applicationReceiptSha256: string;
}

export interface BuildCAL002MatrixApprovalInput {
  readonly matrix: CAL002FinalMatrix;
  readonly approvalCommitSha: string;
}

export interface BuildCAL002PolicyArtifactInput {
  readonly matrix: CAL002FinalMatrix;
  readonly approval: CAL002MatrixApproval;
  readonly applicationImplementationCommitSha: string;
}

export const CAL002_APPLICATION_RECEIPT_VERSION = 'cal-002-application-receipt-v1' as const;

export interface CAL002ApplicationReceipt {
  readonly version: typeof CAL002_APPLICATION_RECEIPT_VERSION;
  readonly protocolVersion: typeof CAL002_PROTOCOL_VERSION;
  readonly catalogSha256: typeof CAL002_LOCKED_RULE_CATALOG_SHA256;
  readonly finalMatrixSha256: string;
  readonly matrixApprovalSha256: string;
  readonly policySha256: string;
  readonly applicationImplementationCommitSha: string;
  readonly admitted: false;
  readonly applied: true;
}

function compareCodePoints(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function requireRecord(value: unknown, label: string): asserts value is Record<string, unknown> {
  if (!isRecord(value)) throw new TypeError(`${label} must be an object`);
}

function exactKeys(value: Record<string, unknown>, expected: readonly string[], label: string): void {
  const actual = Object.keys(value).sort(compareCodePoints);
  const required = [...expected].sort(compareCodePoints);
  if (actual.length !== required.length || actual.some((key, index) => key !== required[index])) {
    throw new TypeError(`${label} has unknown or missing fields`);
  }
}

function assertMatrix(matrix: CAL002FinalMatrix): string {
  const validation = validateCAL002FinalMatrix(matrix);
  if (!validation.ok) throw new TypeError(`CAL-002 final matrix is invalid: ${validation.errors.join('; ')}`);
  requireRecord(matrix, 'CAL-002 final matrix');
  exactKeys(matrix, [
    'version', 'protocolVersion', 'catalogSha256', 'oracleReceiptSha256', 'qualityMetricsSha256',
    'originReceiptSha256', 'reducerImplementationCommitSha', 'rows', 'counts', 'admitted', 'applied',
  ], 'CAL-002 final matrix');
  if (
    matrix.catalogSha256 !== CAL002_LOCKED_RULE_CATALOG_SHA256
    || matrix.admitted !== false
    || matrix.applied !== false
    || matrix.rows.length !== CAL002_LOCKED_COUNTS.total
    || matrix.counts.total !== CAL002_LOCKED_COUNTS.total
  ) {
    throw new TypeError('CAL-002 final matrix is not the exact unapplied 119-row matrix');
  }
  const sorted = [...matrix.rows].sort((left, right) => compareCodePoints(left.ruleId, right.ruleId));
  if (canonicalArtifact(matrix.rows).json !== canonicalArtifact(sorted).json) {
    throw new TypeError('CAL-002 final matrix rows are not in canonical rule-ID order');
  }
  const expectedRuleIds = [...CAL002_LOCKED_RULE_IDS].sort(compareCodePoints);
  if (sorted.length !== expectedRuleIds.length || sorted.some((row, index) => row.ruleId !== expectedRuleIds[index])) {
    throw new TypeError('CAL-002 final matrix rows do not exactly cover the locked rule IDs');
  }
  return canonicalArtifact(matrix).sha256;
}

function assertApproval(
  approval: CAL002MatrixApproval,
  matrixSha256: string,
): string {
  const validation = validateCAL002MatrixApproval(approval);
  if (!validation.ok) throw new TypeError(`CAL-002 matrix approval is invalid: ${validation.errors.join('; ')}`);
  requireRecord(approval, 'CAL-002 matrix approval');
  exactKeys(approval, [
    'version', 'protocolVersion', 'catalogSha256', 'finalMatrixSha256', 'approvalCommitSha',
    'reviewerAuthority', 'decision', 'admitted', 'applied',
  ], 'CAL-002 matrix approval');
  assertCommitSha(approval.approvalCommitSha, 'CAL-002 matrix approval approvalCommitSha');
  if (
    approval.catalogSha256 !== CAL002_LOCKED_RULE_CATALOG_SHA256
    || approval.finalMatrixSha256 !== matrixSha256
    || approval.reviewerAuthority !== 'repository-owner'
    || approval.decision !== 'approved'
    || approval.admitted !== false
    || approval.applied !== false
  ) {
    throw new TypeError('CAL-002 matrix approval does not approve the exact unapplied matrix');
  }
  return canonicalArtifact(approval).sha256;
}

export function buildCAL002MatrixApproval(input: BuildCAL002MatrixApprovalInput): CAL002MatrixApprovalResult {
  requireRecord(input, 'CAL-002 matrix approval input');
  exactKeys(input, ['matrix', 'approvalCommitSha'], 'CAL-002 matrix approval input');
  assertCommitSha(input.approvalCommitSha, 'approvalCommitSha');
  const matrixSha256 = assertMatrix(input.matrix);
  const approval: CAL002MatrixApproval = {
    version: CAL002_MATRIX_APPROVAL_VERSION,
    protocolVersion: CAL002_PROTOCOL_VERSION,
    catalogSha256: CAL002_LOCKED_RULE_CATALOG_SHA256,
    finalMatrixSha256: matrixSha256,
    approvalCommitSha: input.approvalCommitSha,
    reviewerAuthority: 'repository-owner',
    decision: 'approved',
    admitted: false,
    applied: false,
  };
  const validation = validateCAL002MatrixApproval(approval);
  if (!validation.ok) throw new TypeError(`CAL-002 matrix approval is invalid: ${validation.errors.join('; ')}`);
  const artifact = canonicalArtifact(approval);
  return { approval, approvalJson: artifact.json, approvalSha256: artifact.sha256 };
}

function provenanceForRow(row: CAL002FinalRow): SlopbrickRuleEvidencePolicyRow['provenance'] {
  if (row.outcome === 'retired') return 'retired-policy';
  if (row.outcome === 'insufficient-evidence') return 'insufficient-evidence';
  if (row.lane === 'origin') return 'internal-origin-calibrated';
  if (row.outcome === 'quality-advisory') return 'advisory-review-utility';
  if (row.evidenceClass === 'deterministic-or-standards' && row.outcome === 'default-on') {
    return 'deterministic-finding-evidence';
  }
  if (row.outcome === 'default-on') return 'current-quality-calibrated';
  if (row.outcome === 'default-off') {
    return 'current-quality-failed-claim-bar';
  }
  throw new TypeError(`CAL-002 policy cannot represent deterministic failed provenance for ${row.ruleId}`);
}

function policyRow(row: CAL002FinalRow): SlopbrickRuleEvidencePolicyRow {
  const projected: SlopbrickRuleEvidencePolicyRow = {
    ruleId: row.ruleId,
    outcome: row.outcome,
    claimCeiling: row.claimCeiling,
    enabledByDefault: row.enabledByDefault,
    scoreEligible: row.scoreEligibleByDefault,
    provenance: provenanceForRow(row),
  };
  return projected;
}

function assertPolicyProjection(
  policy: SlopbrickRuleEvidencePolicy,
  matrix: CAL002FinalMatrix,
  matrixSha256: string,
  approvalSha256: string,
  applicationImplementationCommitSha: string,
): string {
  const validation = validateSlopbrickRuleEvidencePolicy(policy);
  if (!validation.ok) throw new TypeError(`CAL-002 policy is invalid: ${validation.errors.join('; ')}`);
  requireRecord(policy, 'CAL-002 policy');
  exactKeys(policy, [
    'version', 'protocolVersion', 'catalogSha256', 'finalMatrixSha256', 'matrixApprovalSha256',
    'applicationImplementationCommitSha', 'rows', 'admitted', 'applied',
  ], 'CAL-002 policy');
  if (
    policy.catalogSha256 !== CAL002_LOCKED_RULE_CATALOG_SHA256
    || policy.finalMatrixSha256 !== matrixSha256
    || policy.matrixApprovalSha256 !== approvalSha256
    || policy.applicationImplementationCommitSha !== applicationImplementationCommitSha
    || policy.admitted !== false
    || policy.applied !== true
  ) {
    throw new TypeError('CAL-002 policy identity or application state is invalid');
  }
  const expectedRows = matrix.rows.map(policyRow).sort((left, right) => compareCodePoints(left.ruleId, right.ruleId));
  if (canonicalArtifact(policy.rows).json !== canonicalArtifact(expectedRows).json) {
    throw new TypeError('CAL-002 policy rows do not exactly project the approved final matrix');
  }
  return canonicalArtifact(policy).sha256;
}

export function buildCAL002ApplicationReceipt(input: {
  readonly matrix: CAL002FinalMatrix;
  readonly approval: CAL002MatrixApproval;
  readonly policy: SlopbrickRuleEvidencePolicy;
  readonly applicationImplementationCommitSha: string;
}): {
  readonly receipt: CAL002ApplicationReceipt;
  readonly receiptJson: string;
  readonly receiptSha256: string;
} {
  requireRecord(input, 'CAL-002 application receipt input');
  exactKeys(input, ['matrix', 'approval', 'policy', 'applicationImplementationCommitSha'], 'CAL-002 application receipt input');
  assertCommitSha(input.applicationImplementationCommitSha, 'applicationImplementationCommitSha');
  const matrixSha256 = assertMatrix(input.matrix);
  const approvalSha256 = assertApproval(input.approval, matrixSha256);
  const policySha256 = assertPolicyProjection(
    input.policy,
    input.matrix,
    matrixSha256,
    approvalSha256,
    input.applicationImplementationCommitSha,
  );
  const receipt: CAL002ApplicationReceipt = {
    version: CAL002_APPLICATION_RECEIPT_VERSION,
    protocolVersion: CAL002_PROTOCOL_VERSION,
    catalogSha256: CAL002_LOCKED_RULE_CATALOG_SHA256,
    finalMatrixSha256: matrixSha256,
    matrixApprovalSha256: approvalSha256,
    policySha256,
    applicationImplementationCommitSha: input.applicationImplementationCommitSha,
    admitted: false,
    applied: true,
  };
  const artifact = canonicalArtifact(receipt);
  return { receipt, receiptJson: artifact.json, receiptSha256: artifact.sha256 };
}

export function buildCAL002PolicyArtifact(input: BuildCAL002PolicyArtifactInput): CAL002PolicyArtifactResult {
  requireRecord(input, 'CAL-002 policy artifact input');
  exactKeys(input, ['matrix', 'approval', 'applicationImplementationCommitSha'], 'CAL-002 policy artifact input');
  assertCommitSha(input.applicationImplementationCommitSha, 'applicationImplementationCommitSha');
  const matrixSha256 = assertMatrix(input.matrix);
  const approvalSha256 = assertApproval(input.approval, matrixSha256);
  const rows = input.matrix.rows.map(policyRow).sort((left, right) => compareCodePoints(left.ruleId, right.ruleId));
  if (rows.length !== CAL002_LOCKED_COUNTS.total) throw new TypeError('CAL-002 policy must contain exactly 119 rows');
  const policy: SlopbrickRuleEvidencePolicy = {
    version: SLOPBRICK_RULE_EVIDENCE_POLICY_VERSION,
    protocolVersion: CAL002_PROTOCOL_VERSION,
    catalogSha256: CAL002_LOCKED_RULE_CATALOG_SHA256,
    finalMatrixSha256: matrixSha256,
    matrixApprovalSha256: approvalSha256,
    applicationImplementationCommitSha: input.applicationImplementationCommitSha,
    rows,
    admitted: false,
    applied: true,
  };
  const validation = validateSlopbrickRuleEvidencePolicy(policy);
  if (!validation.ok) throw new TypeError(`CAL-002 policy is invalid: ${validation.errors.join('; ')}`);
  const policyArtifact = canonicalArtifact(policy);
  const application = buildCAL002ApplicationReceipt({
    matrix: input.matrix,
    approval: input.approval,
    policy,
    applicationImplementationCommitSha: input.applicationImplementationCommitSha,
  });
  return {
    policy,
    policyJson: policyArtifact.json,
    policySha256: policyArtifact.sha256,
    applicationReceipt: application.receipt,
    applicationReceiptJson: application.receiptJson,
    applicationReceiptSha256: application.receiptSha256,
  };
}
