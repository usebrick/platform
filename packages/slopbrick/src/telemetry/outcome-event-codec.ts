import {
  OUTCOME_DETECTOR_IDS_V1,
  OUTCOME_EVENT_VERSION_V1,
  OUTCOME_EVIDENCE_TIERS_V1,
  OUTCOME_FRAMEWORK_BUCKETS_V1,
  OUTCOME_OBSERVED_ON_PATTERN_V1,
  OUTCOME_PRODUCER_VERSION_PATTERN_V1,
  OUTCOME_REPOSITORY_SIZE_BUCKETS_V1,
  type OutcomeEventV1,
} from './outcome-event-types';

export type OutcomeEventParseResultV1 =
  | { readonly ok: true; readonly event: OutcomeEventV1; readonly errors: readonly [] }
  | { readonly ok: false; readonly errors: readonly string[] };

type DataRecord = Record<string, unknown>;

const OBSERVED_ON = new RegExp(OUTCOME_OBSERVED_ON_PATTERN_V1, 'u');
const PRODUCER_VERSION = new RegExp(OUTCOME_PRODUCER_VERSION_PATTERN_V1, 'u');
const DETECTOR_IDS = new Set<string>(OUTCOME_DETECTOR_IDS_V1);
const COMMON_KEYS = ['version', 'event', 'observedOn', 'producerVersion', 'context'] as const;

function captureDataRecord(value: unknown): DataRecord | undefined {
  try {
    if (value === null || typeof value !== 'object' || Array.isArray(value)) return undefined;
    const prototype = Object.getPrototypeOf(value);
    if (prototype !== Object.prototype && prototype !== null) return undefined;

    const descriptors = Object.getOwnPropertyDescriptors(value);
    const captured = Object.create(null) as DataRecord;
    for (const key of Reflect.ownKeys(descriptors)) {
      if (typeof key !== 'string') return undefined;
      const descriptor = Object.getOwnPropertyDescriptor(descriptors, key)?.value as PropertyDescriptor | undefined;
      if (descriptor?.enumerable !== true || !Object.hasOwn(descriptor, 'value')) return undefined;
      captured[key] = descriptor.value;
    }
    return captured;
  } catch {
    return undefined;
  }
}

function includes<T extends string>(values: readonly T[], value: unknown): value is T {
  return typeof value === 'string' && values.includes(value as T);
}

function exactKeys(value: DataRecord, allowed: readonly string[], errors: string[]): void {
  for (const key of allowed) {
    if (!Object.hasOwn(value, key)) errors.push(`missing field: ${key}`);
  }
  for (const key of Object.keys(value)) {
    if (!allowed.includes(key)) errors.push('unknown field');
  }
}

function validateContext(value: unknown, errors: string[]): DataRecord | undefined {
  const context = captureDataRecord(value);
  if (context === undefined) {
    errors.push('context must be a plain data object');
    return undefined;
  }
  exactKeys(context, ['framework', 'repositorySize'], errors);
  if (!includes(OUTCOME_FRAMEWORK_BUCKETS_V1, context.framework)) errors.push('context.framework is invalid');
  if (!includes(OUTCOME_REPOSITORY_SIZE_BUCKETS_V1, context.repositorySize)) {
    errors.push('context.repositorySize is invalid');
  }
  return context;
}

function validateCommon(value: DataRecord, errors: string[]): DataRecord | undefined {
  if (value.version !== OUTCOME_EVENT_VERSION_V1) errors.push('version is invalid');
  if (typeof value.observedOn !== 'string' || !OBSERVED_ON.test(value.observedOn)) {
    errors.push('observedOn must be a valid coarse UTC calendar date');
  }
  if (typeof value.producerVersion !== 'string'
    || value.producerVersion.length > 11
    || !PRODUCER_VERSION.test(value.producerVersion)) errors.push('producerVersion is invalid');
  return validateContext(value.context, errors);
}

function validateDetectorId(value: unknown, errors: string[]): void {
  if (typeof value !== 'string' || !DETECTOR_IDS.has(value)) errors.push('detectorId is invalid');
}

function validateScanCompleted(value: DataRecord, errors: string[]): void {
  exactKeys(value, [...COMMON_KEYS, 'scanKind', 'status', 'comparison'], errors);
  if (!includes(['initial', 'rescan'] as const, value.scanKind)) errors.push('scanKind is invalid');
  if (!includes(['complete', 'incomplete', 'not-applicable'] as const, value.status)) errors.push('status is invalid');
  if (!includes(['not-evaluated', 'unchanged', 'changed', 'unavailable'] as const, value.comparison)) {
    errors.push('comparison is invalid');
  }
  if (value.scanKind === 'initial' && value.comparison !== 'not-evaluated') {
    errors.push('initial scan comparison is invalid');
  } else if (value.scanKind === 'rescan' && value.status === 'complete'
    && !includes(['unchanged', 'changed'] as const, value.comparison)) {
    errors.push('complete rescan comparison is invalid');
  } else if (value.scanKind === 'rescan'
    && includes(['incomplete', 'not-applicable'] as const, value.status)
    && value.comparison !== 'unavailable') {
    errors.push('incomplete rescan comparison is invalid');
  }
}

function validateFirstFinding(value: DataRecord, errors: string[]): void {
  exactKeys(value, [...COMMON_KEYS, 'detectorId', 'evidenceTier', 'assessment'], errors);
  validateDetectorId(value.detectorId, errors);
  if (!includes(OUTCOME_EVIDENCE_TIERS_V1, value.evidenceTier)) errors.push('evidenceTier is invalid');
  if (!includes(['useful', 'not-useful', 'uncertain'] as const, value.assessment)) errors.push('assessment is invalid');
}

function validateAction(value: DataRecord, errors: string[]): void {
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
}

function validateReturn(value: DataRecord, errors: string[]): void {
  exactKeys(value, [...COMMON_KEYS, 'window'], errors);
  if (!includes(['within-1-day', 'within-7-days', 'within-30-days', 'within-90-days'] as const, value.window)) {
    errors.push('window is invalid');
  }
}

function validateSpecificEvent(value: DataRecord, errors: string[]): void {
  if (value.event === 'scan-completed') validateScanCompleted(value, errors);
  else if (value.event === 'first-finding-assessed') validateFirstFinding(value, errors);
  else if (value.event === 'action-decided') validateAction(value, errors);
  else if (value.event === 'return-observed') validateReturn(value, errors);
  else errors.push('event is invalid');
}

function record(entries: readonly (readonly [string, unknown])[]): DataRecord {
  const result = Object.create(null) as DataRecord;
  for (const [key, value] of entries) result[key] = value;
  return result;
}

function canonicalEvent(value: DataRecord, context: DataRecord): OutcomeEventV1 {
  const common = [
    ['version', value.version],
    ['event', value.event],
    ['observedOn', value.observedOn],
    ['producerVersion', value.producerVersion],
    ['context', record([
      ['framework', context.framework],
      ['repositorySize', context.repositorySize],
    ])],
  ] as const;

  if (value.event === 'scan-completed') {
    return record([...common,
      ['scanKind', value.scanKind],
      ['status', value.status],
      ['comparison', value.comparison],
    ]) as unknown as OutcomeEventV1;
  }
  if (value.event === 'first-finding-assessed') {
    return record([...common,
      ['detectorId', value.detectorId],
      ['evidenceTier', value.evidenceTier],
      ['assessment', value.assessment],
    ]) as unknown as OutcomeEventV1;
  }
  if (value.event === 'action-decided') {
    return record([...common,
      ['detectorId', value.detectorId],
      ['decision', value.decision],
      ['reason', value.reason],
    ]) as unknown as OutcomeEventV1;
  }
  return record([...common, ['window', value.window]]) as unknown as OutcomeEventV1;
}

export function parseOutcomeEventV1(value: unknown): OutcomeEventParseResultV1 {
  const captured = captureDataRecord(value);
  if (captured === undefined) return { ok: false, errors: ['event must be a plain data object'] };

  const errors: string[] = [];
  const context = validateCommon(captured, errors);
  validateSpecificEvent(captured, errors);
  if (errors.length > 0 || context === undefined) return { ok: false, errors };
  return { ok: true, event: canonicalEvent(captured, context), errors: [] };
}
