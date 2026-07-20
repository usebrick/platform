import { canonicalAuthorityRowsV2 } from './authority';
import {
  CAL002_LOCKED_RULE_CATALOG_SHA256,
  CAL002_LOCKED_RULE_IDS,
  assertCommitSha,
  canonicalArtifact,
  type CAL002ValidationResult,
} from './contracts';
import {
  CAL002_PROTOCOL_VERSION_V2,
  type CAL002AIAssociationV2,
  type CAL002AuthorityRowV2,
  type CAL002ClaimClass,
  type CAL002QualityDomain,
  type CAL002Readiness,
  type CAL002RuntimeOutcomeV2,
} from './contracts-v2';
import {
  assertCAL002FinalMatrixV2,
  type CAL002FinalMatrixV2,
  type CAL002FinalRowV2,
  type CAL002PolicyProvenanceV2,
} from './matrix-v2';

export const CAL002_MATRIX_APPROVAL_VERSION_V2 = 'cal-002-matrix-approval-v2' as const;
export const SLOPBRICK_RULE_EVIDENCE_POLICY_VERSION_V2 = 'slopbrick-rule-evidence-policy-v2' as const;
export const CAL002_APPLICATION_RECEIPT_VERSION_V2 = 'cal-002-application-receipt-v2' as const;

export interface SlopbrickRuleEvidencePolicyRowV2 {
  readonly ruleId: string;
  readonly qualityDomain: CAL002QualityDomain;
  readonly claimClass: CAL002ClaimClass;
  readonly readiness: CAL002Readiness;
  readonly runtimeOutcome: CAL002RuntimeOutcomeV2;
  readonly enabledByDefault: boolean;
  readonly runnableByExplicitOptIn: boolean;
  readonly scoreEligible: boolean;
  readonly gateEligible: boolean;
  readonly repairSafety: CAL002FinalRowV2['repairSafety'];
  readonly provenance: CAL002PolicyProvenanceV2;
  readonly replacementRuleId?: string;
  readonly aiAssociation: CAL002AIAssociationV2;
}

export interface SlopbrickRuleEvidencePolicyBaseV2 {
  readonly version: typeof SLOPBRICK_RULE_EVIDENCE_POLICY_VERSION_V2;
  readonly protocolVersion: typeof CAL002_PROTOCOL_VERSION_V2;
  readonly catalogSha256: typeof CAL002_LOCKED_RULE_CATALOG_SHA256;
  readonly finalMatrixSha256: string;
  readonly policyRowsSha256: string;
  readonly rows: readonly SlopbrickRuleEvidencePolicyRowV2[];
  readonly admitted: false;
}

export type SlopbrickRuleEvidencePolicyV2 =
  | (SlopbrickRuleEvidencePolicyBaseV2 & {
      readonly applied: false;
      readonly matrixApprovalSha256?: never;
      readonly applicationImplementationCommitSha?: never;
    })
  | (SlopbrickRuleEvidencePolicyBaseV2 & {
      readonly applied: true;
      readonly matrixApprovalSha256: string;
      readonly applicationImplementationCommitSha: string;
    });

export interface CAL002MatrixApprovalV2 {
  readonly version: typeof CAL002_MATRIX_APPROVAL_VERSION_V2;
  readonly protocolVersion: typeof CAL002_PROTOCOL_VERSION_V2;
  readonly catalogSha256: typeof CAL002_LOCKED_RULE_CATALOG_SHA256;
  readonly finalMatrixSha256: string;
  readonly approvalCommitSha: string;
  readonly reviewerAuthority: 'repository-owner';
  readonly decision: 'approved';
  readonly admitted: false;
  readonly applied: false;
}

export interface CAL002ApplicationReceiptV2 {
  readonly version: typeof CAL002_APPLICATION_RECEIPT_VERSION_V2;
  readonly protocolVersion: typeof CAL002_PROTOCOL_VERSION_V2;
  readonly catalogSha256: typeof CAL002_LOCKED_RULE_CATALOG_SHA256;
  readonly finalMatrixSha256: string;
  readonly matrixApprovalSha256: string;
  readonly policyRowsSha256: string;
  readonly policySha256: string;
  readonly applicationImplementationCommitSha: string;
  readonly admitted: false;
  readonly applied: true;
}

export interface CAL002MatrixApprovalResultV2 {
  readonly approval: CAL002MatrixApprovalV2;
  readonly approvalJson: string;
  readonly approvalSha256: string;
}

export interface CAL002PolicyCandidateResultV2 {
  readonly policy: Extract<SlopbrickRuleEvidencePolicyV2, { readonly applied: false }>;
  readonly policyJson: string;
  readonly policySha256: string;
}

export interface CAL002AppliedPolicyResultV2 {
  readonly policy: Extract<SlopbrickRuleEvidencePolicyV2, { readonly applied: true }>;
  readonly policyJson: string;
  readonly policySha256: string;
  readonly applicationReceipt: CAL002ApplicationReceiptV2;
  readonly applicationReceiptJson: string;
  readonly applicationReceiptSha256: string;
}

const SHA256 = /^[a-f0-9]{64}$/u;
const COMMIT_SHA = /^[a-f0-9]{40}$/u;
const PROVENANCE = [
  'deterministic-finding-evidence',
  'current-quality-calibrated',
  'current-quality-advisory',
  'quality-candidate-unmeasured',
  'blocked-quality-candidate',
  'internal-origin-association',
  'current-quality-failed-claim-bar',
  'insufficient-evidence',
  'superseded-policy',
  'retired-policy',
] as const satisfies readonly CAL002PolicyProvenanceV2[];

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function exactKeys(value: Record<string, unknown>, allowed: readonly string[], required = allowed): boolean {
  return Object.keys(value).every((key) => allowed.includes(key))
    && required.every((key) => Object.hasOwn(value, key));
}

function requireExactInput(value: unknown, keys: readonly string[], label: string): asserts value is Record<string, unknown> {
  if (!isRecord(value) || !exactKeys(value, keys)) throw new TypeError(`${label} has unknown or missing fields`);
}

function policyRow(row: CAL002FinalRowV2): SlopbrickRuleEvidencePolicyRowV2 {
  return {
    ruleId: row.ruleId,
    qualityDomain: row.qualityDomain,
    claimClass: row.claimClass,
    readiness: row.readiness,
    runtimeOutcome: row.runtimeOutcome,
    enabledByDefault: row.enabledByDefault,
    runnableByExplicitOptIn: row.runnableByExplicitOptIn,
    scoreEligible: row.scoreEligible,
    gateEligible: row.gateEligible,
    repairSafety: row.repairSafety,
    provenance: row.provenance,
    ...(row.replacementRuleId === undefined ? {} : { replacementRuleId: row.replacementRuleId }),
    aiAssociation: row.aiAssociation,
  };
}

export function buildCAL002MatrixApprovalV2(input: {
  readonly matrix: CAL002FinalMatrixV2;
  readonly approvalCommitSha: string;
}): CAL002MatrixApprovalResultV2 {
  requireExactInput(input, ['matrix', 'approvalCommitSha'], 'CAL-002 v2 matrix approval input');
  assertCAL002FinalMatrixV2(input.matrix);
  assertCommitSha(input.approvalCommitSha, 'CAL-002 v2 approvalCommitSha');
  const approval: CAL002MatrixApprovalV2 = {
    version: CAL002_MATRIX_APPROVAL_VERSION_V2,
    protocolVersion: CAL002_PROTOCOL_VERSION_V2,
    catalogSha256: CAL002_LOCKED_RULE_CATALOG_SHA256,
    finalMatrixSha256: canonicalArtifact(input.matrix).sha256,
    approvalCommitSha: input.approvalCommitSha,
    reviewerAuthority: 'repository-owner',
    decision: 'approved',
    admitted: false,
    applied: false,
  };
  assertCAL002MatrixApprovalV2(approval);
  const artifact = canonicalArtifact(approval);
  return { approval, approvalJson: artifact.json, approvalSha256: artifact.sha256 };
}

export function projectCAL002PolicyCandidateV2(matrix: CAL002FinalMatrixV2): CAL002PolicyCandidateResultV2 {
  assertCAL002FinalMatrixV2(matrix);
  const rows = matrix.rows.map(policyRow);
  const policy: Extract<SlopbrickRuleEvidencePolicyV2, { readonly applied: false }> = {
    version: SLOPBRICK_RULE_EVIDENCE_POLICY_VERSION_V2,
    protocolVersion: CAL002_PROTOCOL_VERSION_V2,
    catalogSha256: CAL002_LOCKED_RULE_CATALOG_SHA256,
    finalMatrixSha256: canonicalArtifact(matrix).sha256,
    policyRowsSha256: canonicalArtifact(rows).sha256,
    rows,
    admitted: false,
    applied: false,
  };
  assertSlopbrickRuleEvidencePolicyV2(policy);
  const artifact = canonicalArtifact(policy);
  return { policy, policyJson: artifact.json, policySha256: artifact.sha256 };
}

function assertApprovalForMatrix(approval: CAL002MatrixApprovalV2, matrixSha256: string): string {
  assertCAL002MatrixApprovalV2(approval);
  if (approval.finalMatrixSha256 !== matrixSha256) {
    throw new TypeError('CAL-002 v2 approval does not bind the exact final matrix');
  }
  return canonicalArtifact(approval).sha256;
}

export function buildCAL002AppliedPolicyV2(input: {
  readonly matrix: CAL002FinalMatrixV2;
  readonly approval: CAL002MatrixApprovalV2;
  readonly applicationImplementationCommitSha: string;
}): CAL002AppliedPolicyResultV2 {
  requireExactInput(input, [
    'matrix', 'approval', 'applicationImplementationCommitSha',
  ], 'CAL-002 v2 applied policy input');
  assertCAL002FinalMatrixV2(input.matrix);
  assertCommitSha(input.applicationImplementationCommitSha, 'CAL-002 v2 applicationImplementationCommitSha');
  const matrixSha256 = canonicalArtifact(input.matrix).sha256;
  const approvalSha256 = assertApprovalForMatrix(input.approval, matrixSha256);
  const candidate = projectCAL002PolicyCandidateV2(input.matrix).policy;
  const policy: Extract<SlopbrickRuleEvidencePolicyV2, { readonly applied: true }> = {
    version: candidate.version,
    protocolVersion: candidate.protocolVersion,
    catalogSha256: candidate.catalogSha256,
    finalMatrixSha256: candidate.finalMatrixSha256,
    policyRowsSha256: candidate.policyRowsSha256,
    matrixApprovalSha256: approvalSha256,
    applicationImplementationCommitSha: input.applicationImplementationCommitSha,
    rows: candidate.rows,
    admitted: false,
    applied: true,
  };
  assertSlopbrickRuleEvidencePolicyV2(policy);
  const policyArtifact = canonicalArtifact(policy);
  const applicationReceipt: CAL002ApplicationReceiptV2 = {
    version: CAL002_APPLICATION_RECEIPT_VERSION_V2,
    protocolVersion: CAL002_PROTOCOL_VERSION_V2,
    catalogSha256: CAL002_LOCKED_RULE_CATALOG_SHA256,
    finalMatrixSha256: matrixSha256,
    matrixApprovalSha256: approvalSha256,
    policyRowsSha256: candidate.policyRowsSha256,
    policySha256: policyArtifact.sha256,
    applicationImplementationCommitSha: input.applicationImplementationCommitSha,
    admitted: false,
    applied: true,
  };
  assertCAL002ApplicationReceiptV2(applicationReceipt);
  const receiptArtifact = canonicalArtifact(applicationReceipt);
  return {
    policy,
    policyJson: policyArtifact.json,
    policySha256: policyArtifact.sha256,
    applicationReceipt,
    applicationReceiptJson: receiptArtifact.json,
    applicationReceiptSha256: receiptArtifact.sha256,
  };
}

export function validateCAL002MatrixApprovalV2(value: unknown): CAL002ValidationResult {
  const errors: string[] = [];
  if (!isRecord(value)) return { ok: false, errors: ['artifact must be an object'] };
  const keys = [
    'version', 'protocolVersion', 'catalogSha256', 'finalMatrixSha256', 'approvalCommitSha',
    'reviewerAuthority', 'decision', 'admitted', 'applied',
  ];
  if (!exactKeys(value, keys)) errors.push('artifact has unknown or missing fields');
  if (value.version !== CAL002_MATRIX_APPROVAL_VERSION_V2) errors.push('artifact.version is invalid');
  if (value.protocolVersion !== CAL002_PROTOCOL_VERSION_V2) errors.push('artifact.protocolVersion is invalid');
  if (value.catalogSha256 !== CAL002_LOCKED_RULE_CATALOG_SHA256) errors.push('artifact.catalogSha256 is invalid');
  if (typeof value.finalMatrixSha256 !== 'string' || !SHA256.test(value.finalMatrixSha256)) errors.push('artifact.finalMatrixSha256 is invalid');
  if (typeof value.approvalCommitSha !== 'string' || !COMMIT_SHA.test(value.approvalCommitSha)) errors.push('artifact.approvalCommitSha is invalid');
  if (value.reviewerAuthority !== 'repository-owner') errors.push('artifact.reviewerAuthority is invalid');
  if (value.decision !== 'approved') errors.push('artifact.decision is invalid');
  if (value.admitted !== false) errors.push('artifact.admitted must be false');
  if (value.applied !== false) errors.push('artifact.applied must be false');
  return { ok: errors.length === 0, errors };
}

export function assertCAL002MatrixApprovalV2(value: unknown): asserts value is CAL002MatrixApprovalV2 {
  const result = validateCAL002MatrixApprovalV2(value);
  if (!result.ok) throw new TypeError(`CAL-002 matrix approval v2 validation failed: ${result.errors.join('; ')}`);
}

function expectedEffects(provenance: CAL002PolicyProvenanceV2): readonly [boolean, boolean, boolean, boolean] {
  if (provenance === 'deterministic-finding-evidence' || provenance === 'current-quality-calibrated') {
    return [true, true, true, true];
  }
  if (provenance === 'blocked-quality-candidate'
    || provenance === 'superseded-policy'
    || provenance === 'retired-policy') return [false, false, false, false];
  return [false, true, false, false];
}

function policyAuthorityErrors(
  value: Record<string, unknown>,
  authority: CAL002AuthorityRowV2,
  path: string,
): string[] {
  const blocked = authority.readiness === 'repair-required' || authority.readiness === 'project-contract-required';
  if (blocked) return value.provenance === 'blocked-quality-candidate' && value.repairSafety === 'no-safe-repair'
    ? [] : [`${path} does not preserve blocked authority policy`];
  if (authority.destination === 'superseded') return value.provenance === 'superseded-policy' && value.repairSafety === 'not-applicable'
    ? [] : [`${path} does not preserve superseded authority policy`];
  if (authority.destination === 'retired') return value.provenance === 'retired-policy' && value.repairSafety === 'not-applicable'
    ? [] : [`${path} does not preserve retired authority policy`];
  if (authority.destination === 'research-origin') return value.provenance === 'internal-origin-association' && value.repairSafety === 'not-applicable'
    ? [] : [`${path} elevates research-origin authority policy`];
  if (authority.evidenceClass === 'deterministic-or-standards') {
    const valid = value.provenance === 'deterministic-finding-evidence'
      ? value.repairSafety === 'finding-bound-only'
      : value.provenance === 'current-quality-failed-claim-bar' && value.repairSafety === 'no-safe-repair';
    return valid ? [] : [`${path} does not preserve deterministic oracle policy`];
  }
  const qualityProvenance = [
    'current-quality-calibrated', 'current-quality-advisory', 'quality-candidate-unmeasured',
    'current-quality-failed-claim-bar', 'insufficient-evidence',
  ];
  if (!qualityProvenance.includes(value.provenance as string)) return [`${path} does not preserve quality authority policy`];
  if (authority.evidenceClass === 'statistical-review-utility') {
    return value.provenance !== 'current-quality-calibrated' && value.repairSafety === 'no-safe-repair'
      ? [] : [`${path} statistical policy cannot be default-on or finding-bound repair`];
  }
  const expectedRepair = value.provenance === 'quality-candidate-unmeasured' ? 'no-safe-repair' : 'finding-bound-only';
  return value.repairSafety === expectedRepair ? [] : [`${path}.repairSafety disagrees with contextual policy`];
}

function policyRowErrors(value: unknown, index: number): string[] {
  const errors: string[] = [];
  const path = `artifact.rows[${index}]`;
  if (!isRecord(value)) return [`${path} must be an object`];
  const allowed = [
    'ruleId', 'qualityDomain', 'claimClass', 'readiness', 'runtimeOutcome', 'enabledByDefault',
    'runnableByExplicitOptIn', 'scoreEligible', 'gateEligible', 'repairSafety', 'provenance',
    'replacementRuleId', 'aiAssociation',
  ];
  const required = allowed.filter((key) => key !== 'replacementRuleId');
  if (!exactKeys(value, allowed, required)) errors.push(`${path} has unknown or missing fields`);
  const authority = canonicalAuthorityRowsV2()[index];
  if (authority === undefined || value.ruleId !== authority.ruleId) errors.push(`${path}.ruleId is not canonical`);
  if (authority !== undefined) {
    for (const key of ['qualityDomain', 'claimClass', 'readiness', 'aiAssociation'] as const) {
      if (canonicalArtifact(value[key]).json !== canonicalArtifact(authority[key]).json) {
        errors.push(`${path}.${key} disagrees with authority`);
      }
    }
    if (authority.destination === 'superseded') {
      if (value.replacementRuleId !== authority.replacementRuleId) errors.push(`${path}.replacementRuleId is invalid`);
    } else if (Object.hasOwn(value, 'replacementRuleId')) errors.push(`${path}.replacementRuleId is forbidden`);
    errors.push(...policyAuthorityErrors(value, authority, path));
  }
  if (!PROVENANCE.includes(value.provenance as CAL002PolicyProvenanceV2)) errors.push(`${path}.provenance is invalid`);
  const effects = expectedEffects(value.provenance as CAL002PolicyProvenanceV2);
  if (canonicalArtifact([
    value.enabledByDefault, value.runnableByExplicitOptIn, value.scoreEligible, value.gateEligible,
  ]).json !== canonicalArtifact(effects).json) errors.push(`${path} runtime effects are invalid`);
  const expectedOutcome = value.provenance === 'deterministic-finding-evidence' || value.provenance === 'current-quality-calibrated'
    ? 'default-on'
    : value.provenance === 'current-quality-advisory' ? 'quality-advisory'
      : value.provenance === 'quality-candidate-unmeasured' ? 'quality-candidate-default-off'
        : value.provenance === 'superseded-policy' ? 'superseded'
          : value.provenance === 'retired-policy' ? 'retired'
            : value.provenance === 'insufficient-evidence' ? 'insufficient-evidence' : 'default-off';
  if (value.runtimeOutcome !== expectedOutcome) errors.push(`${path}.runtimeOutcome disagrees with provenance`);
  return errors;
}

export function validateSlopbrickRuleEvidencePolicyV2(value: unknown): CAL002ValidationResult {
  const errors: string[] = [];
  if (!isRecord(value)) return { ok: false, errors: ['artifact must be an object'] };
  const base = [
    'version', 'protocolVersion', 'catalogSha256', 'finalMatrixSha256', 'policyRowsSha256',
    'rows', 'admitted', 'applied',
  ];
  const appliedKeys = [...base, 'matrixApprovalSha256', 'applicationImplementationCommitSha'];
  if (value.applied === false) {
    if (!exactKeys(value, base)) errors.push('artifact unapplied form has unknown or missing fields');
  } else if (value.applied === true) {
    if (!exactKeys(value, appliedKeys)) errors.push('artifact applied form has unknown or missing fields');
    if (typeof value.matrixApprovalSha256 !== 'string' || !SHA256.test(value.matrixApprovalSha256)) errors.push('artifact.matrixApprovalSha256 is invalid');
    if (typeof value.applicationImplementationCommitSha !== 'string' || !COMMIT_SHA.test(value.applicationImplementationCommitSha)) {
      errors.push('artifact.applicationImplementationCommitSha is invalid');
    }
  } else errors.push('artifact.applied must be a boolean discriminator');
  if (value.version !== SLOPBRICK_RULE_EVIDENCE_POLICY_VERSION_V2) errors.push('artifact.version is invalid');
  if (value.protocolVersion !== CAL002_PROTOCOL_VERSION_V2) errors.push('artifact.protocolVersion is invalid');
  if (value.catalogSha256 !== CAL002_LOCKED_RULE_CATALOG_SHA256) errors.push('artifact.catalogSha256 is invalid');
  if (typeof value.finalMatrixSha256 !== 'string' || !SHA256.test(value.finalMatrixSha256)) errors.push('artifact.finalMatrixSha256 is invalid');
  if (typeof value.policyRowsSha256 !== 'string' || !SHA256.test(value.policyRowsSha256)) errors.push('artifact.policyRowsSha256 is invalid');
  if (value.admitted !== false) errors.push('artifact.admitted must be false');
  const rows = Array.isArray(value.rows) ? value.rows : [];
  if (!Array.isArray(value.rows) || rows.length !== CAL002_LOCKED_RULE_IDS.length) errors.push('artifact.rows must contain exactly 119 rows');
  for (let index = 0; index < CAL002_LOCKED_RULE_IDS.length; index += 1) errors.push(...policyRowErrors(rows[index], index));
  if (Array.isArray(value.rows) && typeof value.policyRowsSha256 === 'string'
    && value.policyRowsSha256 !== canonicalArtifact(value.rows).sha256) {
    errors.push('artifact.policyRowsSha256 does not bind rows');
  }
  return { ok: errors.length === 0, errors };
}

export function assertSlopbrickRuleEvidencePolicyV2(value: unknown): asserts value is SlopbrickRuleEvidencePolicyV2 {
  const result = validateSlopbrickRuleEvidencePolicyV2(value);
  if (!result.ok) throw new TypeError(`SlopBrick rule evidence policy v2 validation failed: ${result.errors.join('; ')}`);
}

export function validateCAL002ApplicationReceiptV2(value: unknown): CAL002ValidationResult {
  const errors: string[] = [];
  if (!isRecord(value)) return { ok: false, errors: ['artifact must be an object'] };
  const keys = [
    'version', 'protocolVersion', 'catalogSha256', 'finalMatrixSha256', 'matrixApprovalSha256',
    'policyRowsSha256', 'policySha256', 'applicationImplementationCommitSha', 'admitted', 'applied',
  ];
  if (!exactKeys(value, keys)) errors.push('artifact has unknown or missing fields');
  if (value.version !== CAL002_APPLICATION_RECEIPT_VERSION_V2) errors.push('artifact.version is invalid');
  if (value.protocolVersion !== CAL002_PROTOCOL_VERSION_V2) errors.push('artifact.protocolVersion is invalid');
  if (value.catalogSha256 !== CAL002_LOCKED_RULE_CATALOG_SHA256) errors.push('artifact.catalogSha256 is invalid');
  for (const key of ['finalMatrixSha256', 'matrixApprovalSha256', 'policyRowsSha256', 'policySha256']) {
    if (typeof value[key] !== 'string' || !SHA256.test(value[key] as string)) errors.push(`artifact.${key} is invalid`);
  }
  if (typeof value.applicationImplementationCommitSha !== 'string' || !COMMIT_SHA.test(value.applicationImplementationCommitSha)) {
    errors.push('artifact.applicationImplementationCommitSha is invalid');
  }
  if (value.admitted !== false) errors.push('artifact.admitted must be false');
  if (value.applied !== true) errors.push('artifact.applied must be true');
  return { ok: errors.length === 0, errors };
}

export function assertCAL002ApplicationReceiptV2(value: unknown): asserts value is CAL002ApplicationReceiptV2 {
  const result = validateCAL002ApplicationReceiptV2(value);
  if (!result.ok) throw new TypeError(`CAL-002 application receipt v2 validation failed: ${result.errors.join('; ')}`);
}
