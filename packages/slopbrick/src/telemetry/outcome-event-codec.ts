import {
  OUTCOME_ACTION_DECISIONS_V1,
  OUTCOME_COMPLETE_RESCAN_COMPARISONS_V1,
  OUTCOME_DETECTOR_IDS_V1,
  OUTCOME_DECLINED_ACTION_REASONS_V1,
  OUTCOME_EVENT_VERSION_V1,
  OUTCOME_EVIDENCE_TIERS_V1,
  OUTCOME_FINDING_ASSESSMENTS_V1,
  OUTCOME_FRAMEWORK_BUCKETS_V1,
  OUTCOME_INCOMPLETE_RESCAN_STATUSES_V1,
  OUTCOME_OBSERVED_ON_PATTERN_V1,
  OUTCOME_PRODUCER_VERSION_PATTERN_V1,
  OUTCOME_REPOSITORY_SIZE_BUCKETS_V1,
  OUTCOME_RETURN_WINDOWS_V1,
  OUTCOME_SCAN_COMPARISONS_V1,
  OUTCOME_SCAN_KINDS_V1,
  OUTCOME_SCAN_STATUSES_V1,
  type OutcomeEventV1,
} from './outcome-event-types';

export type OutcomeEventParseResultV1 =
  | { readonly ok: true; readonly event: OutcomeEventV1; readonly errors: readonly [] }
  | { readonly ok: false; readonly errors: readonly string[] };

type DataRecord = Record<string, unknown>;

const OBSERVED_ON = new RegExp(OUTCOME_OBSERVED_ON_PATTERN_V1, 'u');
const PRODUCER_VERSION = new RegExp(OUTCOME_PRODUCER_VERSION_PATTERN_V1, 'u');
const DETECTOR_IDS = Object.create(null) as Record<string, true>;
for (let index = 0; index < OUTCOME_DETECTOR_IDS_V1.length; index += 1) {
  const detectorId = OUTCOME_DETECTOR_IDS_V1[index];
  if (detectorId !== undefined) DETECTOR_IDS[detectorId] = true;
}

const CONTEXT_KEYS = ['framework', 'repositorySize'] as const;
const SCAN_KEYS = [
  'version', 'event', 'observedOn', 'producerVersion', 'context',
  'scanKind', 'status', 'comparison',
] as const;
const FINDING_KEYS = [
  'version', 'event', 'observedOn', 'producerVersion', 'context',
  'detectorId', 'evidenceTier', 'assessment',
] as const;
const ACTION_KEYS = [
  'version', 'event', 'observedOn', 'producerVersion', 'context',
  'detectorId', 'decision', 'reason',
] as const;
const RETURN_KEYS = [
  'version', 'event', 'observedOn', 'producerVersion', 'context', 'window',
] as const;

function addError(errors: string[], message: string): void {
  errors[errors.length] = message;
}

function captureDataRecord(value: unknown): DataRecord | undefined {
  try {
    if (value === null || typeof value !== 'object' || Array.isArray(value)) return undefined;
    const prototype = Object.getPrototypeOf(value);
    if (prototype !== Object.prototype && prototype !== null) return undefined;

    const descriptors = Object.getOwnPropertyDescriptors(value);
    const keys = Reflect.ownKeys(descriptors);
    const captured = Object.create(null) as DataRecord;
    for (let index = 0; index < keys.length; index += 1) {
      const key = keys[index];
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
  if (typeof value !== 'string') return false;
  for (let index = 0; index < values.length; index += 1) {
    if (values[index] === value) return true;
  }
  return false;
}

function exactKeys(value: DataRecord, allowed: readonly string[], errors: string[]): void {
  for (let index = 0; index < allowed.length; index += 1) {
    const key = allowed[index];
    if (key !== undefined && !Object.hasOwn(value, key)) addError(errors, `missing field: ${key}`);
  }
  const keys = Object.keys(value);
  for (let index = 0; index < keys.length; index += 1) {
    if (!includes(allowed, keys[index])) addError(errors, 'unknown field');
  }
}

function validateContext(value: unknown, errors: string[]): DataRecord | undefined {
  const context = captureDataRecord(value);
  if (context === undefined) {
    addError(errors, 'context must be a plain data object');
    return undefined;
  }
  exactKeys(context, CONTEXT_KEYS, errors);
  if (!includes(OUTCOME_FRAMEWORK_BUCKETS_V1, context.framework)) {
    addError(errors, 'context.framework is invalid');
  }
  if (!includes(OUTCOME_REPOSITORY_SIZE_BUCKETS_V1, context.repositorySize)) {
    addError(errors, 'context.repositorySize is invalid');
  }
  return context;
}

function validateCommon(value: DataRecord, errors: string[]): DataRecord | undefined {
  if (value.version !== OUTCOME_EVENT_VERSION_V1) addError(errors, 'version is invalid');
  if (typeof value.observedOn !== 'string' || !OBSERVED_ON.test(value.observedOn)) {
    addError(errors, 'observedOn must be a valid coarse UTC calendar date');
  }
  if (typeof value.producerVersion !== 'string'
    || value.producerVersion.length > 11
    || !PRODUCER_VERSION.test(value.producerVersion)) addError(errors, 'producerVersion is invalid');
  return validateContext(value.context, errors);
}

function validateDetectorId(value: unknown, errors: string[]): void {
  if (typeof value !== 'string' || !Object.hasOwn(DETECTOR_IDS, value)) {
    addError(errors, 'detectorId is invalid');
  }
}

function validateScanCompleted(value: DataRecord, errors: string[]): void {
  exactKeys(value, SCAN_KEYS, errors);
  if (!includes(OUTCOME_SCAN_KINDS_V1, value.scanKind)) addError(errors, 'scanKind is invalid');
  if (!includes(OUTCOME_SCAN_STATUSES_V1, value.status)) {
    addError(errors, 'status is invalid');
  }
  if (!includes(OUTCOME_SCAN_COMPARISONS_V1, value.comparison)) {
    addError(errors, 'comparison is invalid');
  }
  if (value.scanKind === 'initial' && value.comparison !== 'not-evaluated') {
    addError(errors, 'initial scan comparison is invalid');
  } else if (value.scanKind === 'rescan' && value.status === 'complete'
    && !includes(OUTCOME_COMPLETE_RESCAN_COMPARISONS_V1, value.comparison)) {
    addError(errors, 'complete rescan comparison is invalid');
  } else if (value.scanKind === 'rescan'
    && includes(OUTCOME_INCOMPLETE_RESCAN_STATUSES_V1, value.status)
    && value.comparison !== 'unavailable') {
    addError(errors, 'incomplete rescan comparison is invalid');
  }
}

function validateFirstFinding(value: DataRecord, errors: string[]): void {
  exactKeys(value, FINDING_KEYS, errors);
  validateDetectorId(value.detectorId, errors);
  if (!includes(OUTCOME_EVIDENCE_TIERS_V1, value.evidenceTier)) addError(errors, 'evidenceTier is invalid');
  if (!includes(OUTCOME_FINDING_ASSESSMENTS_V1, value.assessment)) {
    addError(errors, 'assessment is invalid');
  }
}

function validateAction(value: DataRecord, errors: string[]): void {
  exactKeys(value, ACTION_KEYS, errors);
  validateDetectorId(value.detectorId, errors);
  if (value.decision === 'applied' && value.reason !== 'finding-bound-repair') {
    addError(errors, 'applied action reason is invalid');
  } else if (value.decision === 'declined' && !includes(OUTCOME_DECLINED_ACTION_REASONS_V1, value.reason)) {
    addError(errors, 'declined action reason is invalid');
  } else if (value.decision === 'deferred' && value.reason !== 'needs-review') {
    addError(errors, 'deferred action reason is invalid');
  } else if (!includes(OUTCOME_ACTION_DECISIONS_V1, value.decision)) {
    addError(errors, 'decision is invalid');
  }
}

function validateReturn(value: DataRecord, errors: string[]): void {
  exactKeys(value, RETURN_KEYS, errors);
  if (!includes(OUTCOME_RETURN_WINDOWS_V1, value.window)) {
    addError(errors, 'window is invalid');
  }
}

function validateSpecificEvent(value: DataRecord, errors: string[]): void {
  if (value.event === 'scan-completed') validateScanCompleted(value, errors);
  else if (value.event === 'first-finding-assessed') validateFirstFinding(value, errors);
  else if (value.event === 'action-decided') validateAction(value, errors);
  else if (value.event === 'return-observed') validateReturn(value, errors);
  else addError(errors, 'event is invalid');
}

function record(entries: readonly (readonly [string, unknown])[]): DataRecord {
  const result = Object.create(null) as DataRecord;
  for (let index = 0; index < entries.length; index += 1) {
    const entry = entries[index];
    if (entry !== undefined) result[entry[0]] = entry[1];
  }
  return result;
}

function canonicalContext(context: DataRecord): DataRecord {
  return record([
    ['framework', context.framework],
    ['repositorySize', context.repositorySize],
  ]);
}

function canonicalEvent(value: DataRecord, context: DataRecord): OutcomeEventV1 {
  const commonContext = canonicalContext(context);
  if (value.event === 'scan-completed') {
    return record([
      ['version', value.version], ['event', value.event],
      ['observedOn', value.observedOn], ['producerVersion', value.producerVersion],
      ['context', commonContext], ['scanKind', value.scanKind],
      ['status', value.status], ['comparison', value.comparison],
    ]) as unknown as OutcomeEventV1;
  }
  if (value.event === 'first-finding-assessed') {
    return record([
      ['version', value.version], ['event', value.event],
      ['observedOn', value.observedOn], ['producerVersion', value.producerVersion],
      ['context', commonContext], ['detectorId', value.detectorId],
      ['evidenceTier', value.evidenceTier], ['assessment', value.assessment],
    ]) as unknown as OutcomeEventV1;
  }
  if (value.event === 'action-decided') {
    return record([
      ['version', value.version], ['event', value.event],
      ['observedOn', value.observedOn], ['producerVersion', value.producerVersion],
      ['context', commonContext], ['detectorId', value.detectorId],
      ['decision', value.decision], ['reason', value.reason],
    ]) as unknown as OutcomeEventV1;
  }
  return record([
    ['version', value.version], ['event', value.event],
    ['observedOn', value.observedOn], ['producerVersion', value.producerVersion],
    ['context', commonContext], ['window', value.window],
  ]) as unknown as OutcomeEventV1;
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
