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

export interface CurrentEvidencePolicyAccessors {
  readonly policy: AppliedCurrentEvidencePolicy;
  getCurrentRulePolicy(ruleId: string): SlopbrickRuleEvidencePolicyRowV2 | undefined;
  getCurrentDefaultOffRules(): ReadonlySet<string>;
  isRuleRunnable(ruleId: string, configuredRules: Readonly<Record<string, string>>): boolean;
  isRuleScoreEligible(ruleId: string): boolean | undefined;
  getRuleEvidenceProvenance(ruleId: string): CAL002PolicyProvenanceV2 | undefined;
}

function assertAppliedCompleteCurrentPolicyV2(
  raw: unknown,
): asserts raw is AppliedCurrentEvidencePolicy {
  assertSlopbrickRuleEvidencePolicyV2(raw);
  if (!raw.applied) {
    throw new TypeError('Current evidence policy must be the complete applied form');
  }
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
  const rows = new Map(raw.rows.map((row) => [row.ruleId, row]));
  const defaultOffRuleIds = raw.rows
    .filter((row) => !row.enabledByDefault)
    .map((row) => row.ruleId);

  return {
    policy: raw,
    getCurrentRulePolicy: (ruleId) => rows.get(ruleId),
    getCurrentDefaultOffRules: () => new Set(defaultOffRuleIds),
    isRuleRunnable: createRuleRunnableAccessor(rows),
    isRuleScoreEligible: (ruleId) => rows.get(ruleId)?.scoreEligible,
    getRuleEvidenceProvenance: (ruleId) => rows.get(ruleId)?.provenance,
  };
}
