import {
  assertSlopbrickRuleEvidencePolicyV2,
  type SlopbrickRuleEvidencePolicyRowV2,
  type SlopbrickRuleEvidencePolicyV2,
} from '../calibration/cal-002/application-v2.js';
import type { CAL002PolicyProvenanceV2 } from '../calibration/cal-002/matrix-v2.js';

type AppliedCurrentEvidencePolicy = Extract<
  SlopbrickRuleEvidencePolicyV2,
  { readonly applied: true }
>;

const CURRENT_APPROVED_POLICY_BINDING = {
  finalMatrixSha256: 'ad485bcf192fc093b2cddf0f449a27c4bec5842488ca7a9e6ea27acf87b3e91d',
  matrixApprovalSha256: 'f80c86e89d21af7927ab394975fc311461026e340ea1c1db620cca54630507ee',
  policyRowsSha256: '058067fbb644d3ec9fd08ad5c976b166687445a467c4b619116d0dd422c85717',
} as const;

export interface CurrentEvidencePolicyAccessors {
  readonly policy: AppliedCurrentEvidencePolicy;
  getCurrentRulePolicy(ruleId: string): SlopbrickRuleEvidencePolicyRowV2 | undefined;
  getCurrentDefaultOffRules(): ReadonlySet<string>;
  isRuleRunnable(ruleId: string, configuredRules: Readonly<Record<string, string>>): boolean;
  isRuleScoreEligible(ruleId: string): boolean | undefined;
  getRuleEvidenceProvenance(ruleId: string): CAL002PolicyProvenanceV2 | undefined;
}

function assertCurrentApprovedPolicyBinding(policy: AppliedCurrentEvidencePolicy): void {
  if (policy.finalMatrixSha256 === CURRENT_APPROVED_POLICY_BINDING.finalMatrixSha256
    && policy.matrixApprovalSha256 === CURRENT_APPROVED_POLICY_BINDING.matrixApprovalSha256
    && policy.policyRowsSha256 === CURRENT_APPROVED_POLICY_BINDING.policyRowsSha256) return;
  throw new TypeError('Current evidence policy does not match the owner-approved projection');
}

function assertAppliedCompleteCurrentPolicyV2(
  raw: unknown,
): asserts raw is AppliedCurrentEvidencePolicy {
  assertSlopbrickRuleEvidencePolicyV2(raw);
  if (!raw.applied) {
    throw new TypeError('Current evidence policy must be the complete applied form');
  }
  assertCurrentApprovedPolicyBinding(raw);
}

function freezeCurrentPolicyRow(
  row: SlopbrickRuleEvidencePolicyRowV2,
): SlopbrickRuleEvidencePolicyRowV2 {
  return Object.freeze({
    ...row,
    aiAssociation: Object.freeze({ ...row.aiAssociation }),
  });
}

function createImmutableCurrentPolicySnapshot(
  policy: AppliedCurrentEvidencePolicy,
): AppliedCurrentEvidencePolicy {
  return Object.freeze({
    ...policy,
    rows: Object.freeze(policy.rows.map(freezeCurrentPolicyRow)),
  });
}

function createRuleRunnableAccessor(
  rows: ReadonlyMap<string, SlopbrickRuleEvidencePolicyRowV2>,
): CurrentEvidencePolicyAccessors['isRuleRunnable'] {
  return (ruleId, configuredRules) => {
    const row = rows.get(ruleId);
    if (row === undefined) return true;
    if (configuredRules[ruleId] === 'off') return false;
    return row.enabledByDefault
      || (row.runnableByExplicitOptIn && Object.hasOwn(configuredRules, ruleId));
  };
}

export function createCurrentEvidencePolicyAccessors(
  raw: unknown,
): CurrentEvidencePolicyAccessors {
  assertAppliedCompleteCurrentPolicyV2(raw);
  const policy = createImmutableCurrentPolicySnapshot(raw);
  const rows = new Map(policy.rows.map((row) => [row.ruleId, row]));
  const defaultOffRuleIds = policy.rows
    .filter((row) => !row.enabledByDefault)
    .map((row) => row.ruleId);

  return {
    policy,
    getCurrentRulePolicy: (ruleId) => rows.get(ruleId),
    getCurrentDefaultOffRules: () => new Set(defaultOffRuleIds),
    isRuleRunnable: createRuleRunnableAccessor(rows),
    isRuleScoreEligible: (ruleId) => rows.get(ruleId)?.scoreEligible,
    getRuleEvidenceProvenance: (ruleId) => rows.get(ruleId)?.provenance,
  };
}
