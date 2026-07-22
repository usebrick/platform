import {
  OUTCOME_EVENT_VERSION_V1,
  OUTCOME_EVIDENCE_TIERS_V1,
  OUTCOME_FRAMEWORK_BUCKETS_V1,
  OUTCOME_REPOSITORY_SIZE_BUCKETS_V1,
} from './outcome-event-types';

export * from './outcome-event-types';
export { OUTCOME_EVENT_SCHEMA_V1 } from './outcome-event-schema';

export type OutcomeEventValidationV1 =
  | { readonly ok: true; readonly errors: readonly [] }
  | { readonly ok: false; readonly errors: readonly string[] };

const DATE = /^\d{4}-\d{2}-\d{2}$/u;
const PRODUCER_VERSION = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/u;
const DETECTOR_ID = /^[a-z0-9][a-z0-9-]*\/[a-z0-9][a-z0-9-]*$/u;
const COMMON_KEYS = ['version', 'event', 'observedOn', 'producerVersion', 'context'] as const;

function isRecord(value: unknown): value is Record<string, unknown> {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) return false;
  return Reflect.ownKeys(value).every((key) => {
    if (typeof key !== 'string') return false;
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    return descriptor?.enumerable === true && Object.hasOwn(descriptor, 'value');
  });
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
    if (!allowed.includes(key)) errors.push('unknown field');
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
  if (!isRecord(value)) return { ok: false, errors: ['event must be a plain data object'] };

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
