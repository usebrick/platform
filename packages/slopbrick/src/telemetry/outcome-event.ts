import type {
  FirstScanEvidenceTier,
  FirstScanStatus,
} from '../types/first-scan';

export const OUTCOME_EVENT_VERSION_V1 = 'slopbrick-outcome-event-v1' as const;

export const OUTCOME_FRAMEWORK_BUCKETS_V1 = [
  'react',
  'vue',
  'svelte',
  'other-web',
  'non-web',
  'mixed',
  'unknown',
] as const;

export const OUTCOME_REPOSITORY_SIZE_BUCKETS_V1 = [
  '1-20',
  '21-100',
  '101-500',
  '501-2000',
  '2001+',
  'unknown',
] as const;

export const OUTCOME_EVIDENCE_TIERS_V1 = [
  'deterministic',
  'current-quality-calibrated',
  'current-quality-advisory',
  'quality-candidate-unmeasured',
  'current-quality-failed',
  'insufficient-evidence',
  'internal-origin-association',
  'legacy-calibrated',
  'advisory',
] as const satisfies readonly Exclude<FirstScanEvidenceTier, 'calibrated'>[];

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

const contextSchema = {
  type: 'object',
  description: 'Coarse, non-identifying repository context used for local comparison.',
  additionalProperties: false,
  required: ['framework', 'repositorySize'],
  properties: {
    framework: {
      type: 'string',
      description: 'Coarse framework family; never a package list or repository fingerprint.',
      enum: OUTCOME_FRAMEWORK_BUCKETS_V1,
    },
    repositorySize: {
      type: 'string',
      description: 'Bucket for the number of selected files; never the exact count.',
      enum: OUTCOME_REPOSITORY_SIZE_BUCKETS_V1,
    },
  },
} as const;

const commonProperties = {
  version: {
    type: 'string',
    description: 'Closed wire-contract version for this local outcome event.',
    const: OUTCOME_EVENT_VERSION_V1,
  },
  observedOn: {
    type: 'string',
    description: 'UTC calendar day of observation; exact time is deliberately omitted.',
    pattern: '^\\d{4}-\\d{2}-\\d{2}$',
  },
  producerVersion: {
    type: 'string',
    description: 'SlopBrick version that produced or accepted the observation.',
    pattern: '^\\d+\\.\\d+\\.\\d+(?:-[0-9A-Za-z.-]+)?$',
    maxLength: 64,
  },
  context: {
    description: 'Coarse framework and selected-file-count buckets for this observation.',
    $ref: '#/$defs/context',
  },
} as const;

const detectorIdSchema = {
  type: 'string',
  description: 'Public SlopBrick detector ID; never a finding, file, or repository identifier.',
  pattern: '^[a-z0-9][a-z0-9-]*/[a-z0-9][a-z0-9-]*$',
  maxLength: 128,
} as const;

export const OUTCOME_EVENT_SCHEMA_V1 = {
  $schema: 'https://json-schema.org/draft/2020-12/schema',
  $id: 'https://usebrick.dev/schemas/slopbrick-outcome-event-v1.schema.json',
  title: 'SlopBrick privacy-safe local outcome event v1',
  description: 'A closed, local-only observation contract with no raw source or repository identity.',
  $defs: { context: contextSchema },
  oneOf: [
    {
      type: 'object',
      additionalProperties: false,
      required: ['version', 'event', 'observedOn', 'producerVersion', 'context', 'scanKind', 'status', 'comparison'],
      properties: {
        ...commonProperties,
        event: { const: 'scan-completed', description: 'Records completion of an initial scan or rescan.' },
        scanKind: { enum: ['initial', 'rescan'], description: 'Whether this was the first observed scan or a rescan.' },
        status: { enum: ['complete', 'incomplete', 'not-applicable'], description: 'The existing first-scan completion state.' },
        comparison: {
          enum: ['not-evaluated', 'unchanged', 'changed', 'unavailable'],
          description: 'Coarse rescan comparison; it carries no finding details.',
        },
      },
    },
    {
      type: 'object',
      additionalProperties: false,
      required: ['version', 'event', 'observedOn', 'producerVersion', 'context', 'detectorId', 'evidenceTier', 'assessment'],
      properties: {
        ...commonProperties,
        event: { const: 'first-finding-assessed', description: 'Records the first prioritized finding the user assessed.' },
        detectorId: detectorIdSchema,
        evidenceTier: {
          enum: OUTCOME_EVIDENCE_TIERS_V1,
          description: 'Evidence tier projected by the first-scan contract; not an authorship label.',
        },
        assessment: {
          enum: ['useful', 'not-useful', 'uncertain'],
          description: 'User assessment of review utility; it is not a calibration label.',
        },
      },
    },
    {
      type: 'object',
      additionalProperties: false,
      required: ['version', 'event', 'observedOn', 'producerVersion', 'context', 'detectorId', 'decision', 'reason'],
      properties: {
        ...commonProperties,
        event: { const: 'action-decided', description: 'Records whether a bounded action was applied, declined, or deferred.' },
        detectorId: detectorIdSchema,
        decision: { enum: ['applied', 'declined', 'deferred'], description: 'Coarse action disposition.' },
        reason: {
          enum: ['finding-bound-repair', 'no-safe-repair', 'user-choice', 'needs-review'],
          description: 'Broad reason that excludes source, path, and free-form user text.',
        },
      },
      allOf: [
        {
          if: { properties: { decision: { const: 'applied' } }, required: ['decision'] },
          then: { properties: { reason: { const: 'finding-bound-repair' } } },
        },
        {
          if: { properties: { decision: { const: 'declined' } }, required: ['decision'] },
          then: { properties: { reason: { enum: ['no-safe-repair', 'user-choice'] } } },
        },
        {
          if: { properties: { decision: { const: 'deferred' } }, required: ['decision'] },
          then: { properties: { reason: { const: 'needs-review' } } },
        },
      ],
    },
    {
      type: 'object',
      additionalProperties: false,
      required: ['version', 'event', 'observedOn', 'producerVersion', 'context', 'window'],
      properties: {
        ...commonProperties,
        event: { const: 'return-observed', description: 'Records a local return inside a bounded observation window.' },
        window: {
          enum: ['within-1-day', 'within-7-days', 'within-30-days', 'within-90-days'],
          description: 'Coarse elapsed-time bucket; exact timestamps and persistent identifiers are absent.',
        },
      },
    },
  ],
} as const;

export type OutcomeEventValidationV1 =
  | { readonly ok: true; readonly errors: readonly [] }
  | { readonly ok: false; readonly errors: readonly string[] };

const DATE = /^\d{4}-\d{2}-\d{2}$/u;
const PRODUCER_VERSION = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/u;
const DETECTOR_ID = /^[a-z0-9][a-z0-9-]*\/[a-z0-9][a-z0-9-]*$/u;
const COMMON_KEYS = ['version', 'event', 'observedOn', 'producerVersion', 'context'] as const;

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function includes<T extends string>(values: readonly T[], value: unknown): value is T {
  return typeof value === 'string' && values.includes(value as T);
}

function exactKeys(
  value: Record<string, unknown>,
  allowed: readonly string[],
  errors: string[],
): void {
  for (const key of allowed) {
    if (!Object.hasOwn(value, key)) errors.push(`missing field: ${key}`);
  }
  for (const key of Object.keys(value)) {
    if (!allowed.includes(key)) errors.push(`unknown field: ${key}`);
  }
}

function validateCommon(value: Record<string, unknown>, errors: string[]): void {
  if (value.version !== OUTCOME_EVENT_VERSION_V1) errors.push('version is invalid');
  if (typeof value.observedOn !== 'string' || !DATE.test(value.observedOn)) {
    errors.push('observedOn must be a coarse YYYY-MM-DD date');
  }
  if (
    typeof value.producerVersion !== 'string'
    || value.producerVersion.length > 64
    || !PRODUCER_VERSION.test(value.producerVersion)
  ) {
    errors.push('producerVersion is invalid');
  }
  if (!isRecord(value.context)) {
    errors.push('context must be an object');
    return;
  }
  exactKeys(value.context, ['framework', 'repositorySize'], errors);
  if (!includes(OUTCOME_FRAMEWORK_BUCKETS_V1, value.context.framework)) {
    errors.push('context.framework is invalid');
  }
  if (!includes(OUTCOME_REPOSITORY_SIZE_BUCKETS_V1, value.context.repositorySize)) {
    errors.push('context.repositorySize is invalid');
  }
}

function validateDetectorId(value: unknown, errors: string[]): void {
  if (typeof value !== 'string' || value.length > 128 || !DETECTOR_ID.test(value)) {
    errors.push('detectorId is invalid');
  }
}

export function validateOutcomeEventV1(value: unknown): OutcomeEventValidationV1 {
  if (!isRecord(value)) return { ok: false, errors: ['event must be an object'] };

  const errors: string[] = [];
  validateCommon(value, errors);

  switch (value.event) {
    case 'scan-completed':
      exactKeys(value, [...COMMON_KEYS, 'scanKind', 'status', 'comparison'], errors);
      if (!includes(['initial', 'rescan'] as const, value.scanKind)) errors.push('scanKind is invalid');
      if (!includes(['complete', 'incomplete', 'not-applicable'] as const, value.status)) errors.push('status is invalid');
      if (!includes(['not-evaluated', 'unchanged', 'changed', 'unavailable'] as const, value.comparison)) {
        errors.push('comparison is invalid');
      }
      break;
    case 'first-finding-assessed':
      exactKeys(value, [...COMMON_KEYS, 'detectorId', 'evidenceTier', 'assessment'], errors);
      validateDetectorId(value.detectorId, errors);
      if (!includes(OUTCOME_EVIDENCE_TIERS_V1, value.evidenceTier)) errors.push('evidenceTier is invalid');
      if (!includes(['useful', 'not-useful', 'uncertain'] as const, value.assessment)) errors.push('assessment is invalid');
      break;
    case 'action-decided':
      exactKeys(value, [...COMMON_KEYS, 'detectorId', 'decision', 'reason'], errors);
      validateDetectorId(value.detectorId, errors);
      if (value.decision === 'applied' && value.reason !== 'finding-bound-repair') {
        errors.push('applied action reason is invalid');
      } else if (value.decision === 'declined' && !includes(['no-safe-repair', 'user-choice'] as const, value.reason)) {
        errors.push('declined action reason is invalid');
      } else if (value.decision === 'deferred' && value.reason !== 'needs-review') {
        errors.push('deferred action reason is invalid');
      } else if (!includes(['applied', 'declined', 'deferred'] as const, value.decision)) {
        errors.push('decision is invalid');
      }
      break;
    case 'return-observed':
      exactKeys(value, [...COMMON_KEYS, 'window'], errors);
      if (!includes(['within-1-day', 'within-7-days', 'within-30-days', 'within-90-days'] as const, value.window)) {
        errors.push('window is invalid');
      }
      break;
    default:
      errors.push('event is invalid');
  }

  return errors.length === 0 ? { ok: true, errors: [] } : { ok: false, errors };
}
