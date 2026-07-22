import type {
  FirstScanEvidenceTier,
  FirstScanStatus,
} from '../types/first-scan';

export const OUTCOME_EVENT_VERSION_V1 = 'slopbrick-outcome-event-v1' as const;

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

export type OutcomeFrameworkBucketV1 = typeof OUTCOME_FRAMEWORK_BUCKETS_V1[number];
export type OutcomeRepositorySizeBucketV1 = typeof OUTCOME_REPOSITORY_SIZE_BUCKETS_V1[number];
export type OutcomeEvidenceTierV1 = typeof OUTCOME_EVIDENCE_TIERS_V1[number];
export type OutcomeReturnWindowV1 =
  | 'within-1-day'
  | 'within-7-days'
  | 'within-30-days'
  | 'within-90-days';

export interface OutcomeEventContextV1 {
  readonly framework: OutcomeFrameworkBucketV1;
  readonly repositorySize: OutcomeRepositorySizeBucketV1;
}

interface OutcomeEventBaseV1 {
  readonly version: typeof OUTCOME_EVENT_VERSION_V1;
  readonly observedOn: string;
  readonly producerVersion: string;
  readonly context: OutcomeEventContextV1;
}

export interface ScanCompletedOutcomeEventV1 extends OutcomeEventBaseV1 {
  readonly event: 'scan-completed';
  readonly scanKind: 'initial' | 'rescan';
  readonly status: FirstScanStatus;
  readonly comparison: 'not-evaluated' | 'unchanged' | 'changed' | 'unavailable';
}

export interface FirstFindingAssessedOutcomeEventV1 extends OutcomeEventBaseV1 {
  readonly event: 'first-finding-assessed';
  readonly detectorId: string;
  readonly evidenceTier: OutcomeEvidenceTierV1;
  readonly assessment: 'useful' | 'not-useful' | 'uncertain';
}

type ActionOutcomeV1 =
  | { readonly decision: 'applied'; readonly reason: 'finding-bound-repair' }
  | { readonly decision: 'declined'; readonly reason: 'no-safe-repair' | 'user-choice' }
  | { readonly decision: 'deferred'; readonly reason: 'needs-review' };

export type ActionDecidedOutcomeEventV1 = OutcomeEventBaseV1 & {
  readonly event: 'action-decided';
  readonly detectorId: string;
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
