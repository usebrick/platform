import type {
  FirstScanEvidenceTier,
  FirstScanStatus,
} from '../types/first-scan';
import { CAL002_LOCKED_RULE_IDS } from '../calibration/cal-002/contracts';

export const OUTCOME_EVENT_VERSION_V1 = 'slopbrick-outcome-event-v1' as const;

// V1 is deliberately bound to the immutable 119-rule public catalog rather
// than accepting arbitrary rule-shaped strings as a repository-identity
// channel. A future catalog must make an explicit compatibility decision.
const outcomeDetectorIdsV1: (typeof CAL002_LOCKED_RULE_IDS[number])[] = [];
for (let index = 0; index < CAL002_LOCKED_RULE_IDS.length; index += 1) {
  const detectorId = CAL002_LOCKED_RULE_IDS[index];
  if (detectorId !== undefined) {
    Object.defineProperty(outcomeDetectorIdsV1, index, {
      configurable: true,
      enumerable: true,
      value: detectorId,
      writable: true,
    });
  }
}
export const OUTCOME_DETECTOR_IDS_V1 = Object.freeze(outcomeDetectorIdsV1);

export const OUTCOME_OBSERVED_ON_PATTERN_V1 = String.raw`^(?:(?:[0-9]{4}-(?:01|03|05|07|08|10|12)-(?:0[1-9]|[12][0-9]|3[01]))|(?:[0-9]{4}-(?:04|06|09|11)-(?:0[1-9]|[12][0-9]|30))|(?:[0-9]{4}-02-(?:0[1-9]|1[0-9]|2[0-8]))|(?:(?:[0-9]{2}(?:0[48]|[2468][048]|[13579][26])|(?:[02468][048]|[13579][26])00)-02-29))$`;

// V1 is bound to a closed producer coordinate instead of accepting arbitrary
// semver-shaped text as a caller-controlled identity channel. Future package
// versions must make an explicit event-contract compatibility decision.
export const OUTCOME_PRODUCER_VERSIONS_V1 = Object.freeze(['0.45.0'] as const);

export const OUTCOME_FRAMEWORK_BUCKETS_V1 = Object.freeze([
  'react',
  'vue',
  'svelte',
  'other-web',
  'non-web',
  'mixed',
  'unknown',
] as const);

export const OUTCOME_REPOSITORY_SIZE_BUCKETS_V1 = Object.freeze([
  '1-20',
  '21-100',
  '101-500',
  '501-2000',
  '2001+',
  'unknown',
] as const);

export const OUTCOME_EVIDENCE_TIERS_V1 = Object.freeze([
  'deterministic',
  'current-quality-calibrated',
  'current-quality-advisory',
  'quality-candidate-unmeasured',
  'current-quality-failed',
  'insufficient-evidence',
  'internal-origin-association',
  'legacy-calibrated',
  'advisory',
] as const satisfies readonly Exclude<FirstScanEvidenceTier, 'calibrated'>[]);

export const OUTCOME_SCAN_KINDS_V1 = Object.freeze(['initial', 'rescan'] as const);
export const OUTCOME_SCAN_STATUSES_V1 = Object.freeze([
  'complete', 'incomplete', 'not-applicable',
] as const satisfies readonly FirstScanStatus[]);
export const OUTCOME_SCAN_COMPARISONS_V1 = Object.freeze([
  'not-evaluated', 'unchanged', 'changed', 'unavailable',
] as const);
export const OUTCOME_COMPLETE_RESCAN_COMPARISONS_V1 = Object.freeze([
  'unchanged', 'changed',
] as const);
export const OUTCOME_INCOMPLETE_RESCAN_STATUSES_V1 = Object.freeze([
  'incomplete', 'not-applicable',
] as const satisfies readonly Exclude<FirstScanStatus, 'complete'>[]);
export const OUTCOME_FINDING_ASSESSMENTS_V1 = Object.freeze([
  'useful', 'not-useful', 'uncertain',
] as const);
export const OUTCOME_ACTION_DECISIONS_V1 = Object.freeze([
  'applied', 'declined', 'deferred',
] as const);
export const OUTCOME_ACTION_REASONS_V1 = Object.freeze([
  'finding-bound-repair', 'no-safe-repair', 'user-choice', 'needs-review',
] as const);
export const OUTCOME_DECLINED_ACTION_REASONS_V1 = Object.freeze([
  'no-safe-repair', 'user-choice',
] as const);
export const OUTCOME_RETURN_WINDOWS_V1 = Object.freeze([
  'within-1-day', 'within-7-days', 'within-30-days', 'within-90-days',
] as const);

export type OutcomeFrameworkBucketV1 = typeof OUTCOME_FRAMEWORK_BUCKETS_V1[number];
export type OutcomeRepositorySizeBucketV1 = typeof OUTCOME_REPOSITORY_SIZE_BUCKETS_V1[number];
export type OutcomeEvidenceTierV1 = typeof OUTCOME_EVIDENCE_TIERS_V1[number];
export type OutcomeDetectorIdV1 = typeof OUTCOME_DETECTOR_IDS_V1[number];
export type OutcomeReturnWindowV1 = typeof OUTCOME_RETURN_WINDOWS_V1[number];

export interface OutcomeEventContextV1 {
  readonly framework: OutcomeFrameworkBucketV1;
  readonly repositorySize: OutcomeRepositorySizeBucketV1;
}

interface OutcomeEventBaseV1 {
  readonly version: typeof OUTCOME_EVENT_VERSION_V1;
  readonly observedOn: string;
  readonly producerVersion: typeof OUTCOME_PRODUCER_VERSIONS_V1[number];
  readonly context: OutcomeEventContextV1;
}

type ScanCompletedOutcomeV1 =
  | {
    readonly scanKind: 'initial';
    readonly status: FirstScanStatus;
    readonly comparison: 'not-evaluated';
  }
  | {
    readonly scanKind: 'rescan';
    readonly status: 'complete';
    readonly comparison: 'unchanged' | 'changed';
  }
  | {
    readonly scanKind: 'rescan';
    readonly status: Exclude<FirstScanStatus, 'complete'>;
    readonly comparison: 'unavailable';
  };

export type ScanCompletedOutcomeEventV1 = OutcomeEventBaseV1 & {
  readonly event: 'scan-completed';
} & ScanCompletedOutcomeV1;

export interface FirstFindingAssessedOutcomeEventV1 extends OutcomeEventBaseV1 {
  readonly event: 'first-finding-assessed';
  readonly detectorId: OutcomeDetectorIdV1;
  readonly evidenceTier: OutcomeEvidenceTierV1;
  readonly assessment: typeof OUTCOME_FINDING_ASSESSMENTS_V1[number];
}

type ActionOutcomeV1 =
  | { readonly decision: 'applied'; readonly reason: 'finding-bound-repair' }
  | { readonly decision: 'declined'; readonly reason: 'no-safe-repair' | 'user-choice' }
  | { readonly decision: 'deferred'; readonly reason: 'needs-review' };

export type ActionDecidedOutcomeEventV1 = OutcomeEventBaseV1 & {
  readonly event: 'action-decided';
  readonly detectorId: OutcomeDetectorIdV1;
} & ActionOutcomeV1;

export interface ReturnObservedOutcomeEventV1 extends OutcomeEventBaseV1 {
  readonly event: 'return-observed';
  readonly window: OutcomeReturnWindowV1;
}

export type OutcomeEventV1 =
  | ScanCompletedOutcomeEventV1
  | FirstFindingAssessedOutcomeEventV1
  | ActionDecidedOutcomeEventV1
  | ReturnObservedOutcomeEventV1;
