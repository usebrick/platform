import { resolve } from 'node:path';

import { parseOutcomeEventV1 } from './outcome-event-codec';
import {
  OUTCOME_EVENT_VERSION_V1,
  type OutcomeEventV1,
} from './outcome-event';
import {
  OUTCOME_EVENT_EXPORT_VERSION_V1,
  OUTCOME_EVENT_MAX_BYTES_V1,
  OUTCOME_EVENT_STORE_MAX_BYTES_V1,
  OUTCOME_EVENT_STORE_MAX_EVENTS_V1,
  OutcomeEventStoreError,
} from './outcome-store-contract';
import {
  acquireOutcomeStoreLock,
  appendOutcomeBytes,
  closeOutcomeFile,
  deleteSingleLinkRegularFile,
  openOutcomeFileForAppend,
  openOutcomeFileForRead,
  outcomeFileIdentity,
  readOutcomeFile,
  releaseOutcomeStoreLock,
  secureOutcomePathExists,
  writePrivateAtomic,
} from './outcome-store-filesystem';

export {
  OUTCOME_EVENT_EXPORT_VERSION_V1,
  OUTCOME_EVENT_MAX_BYTES_V1,
  OUTCOME_EVENT_STORE_MAX_BYTES_V1,
  OUTCOME_EVENT_STORE_MAX_EVENTS_V1,
  OutcomeEventStoreError,
} from './outcome-store-contract';

function joinErrors(errors: readonly string[]): string {
  let message = '';
  for (let index = 0; index < errors.length; index += 1) {
    const error = errors[index];
    if (error !== undefined) message += `${index === 0 ? '' : '; '}${error}`;
  }
  return message;
}

function parseStoredEvent(line: string, lineNumber: number): OutcomeEventV1 {
  let value: unknown;
  try {
    value = JSON.parse(line);
  } catch {
    throw new OutcomeEventStoreError(
      `Outcome event store line ${lineNumber} is not valid JSON`,
      lineNumber,
    );
  }

  const parsed = parseOutcomeEventV1(value);
  if (!parsed.ok) {
    throw new OutcomeEventStoreError(
      `Outcome event store line ${lineNumber} is invalid: ${joinErrors(parsed.errors)}`,
      lineNumber,
    );
  }
  return parsed.event;
}

function setArrayEntry<T>(values: T[], index: number, value: T): void {
  Object.defineProperty(values, index, {
    configurable: true,
    enumerable: true,
    value,
    writable: true,
  });
}

function parseLedger(contents: string): OutcomeEventV1[] {
  if (contents === '') return [];
  if (!contents.endsWith('\n')) {
    throw new OutcomeEventStoreError('Outcome event store must end with a JSONL newline');
  }
  const lines = contents.slice(0, -1).split('\n');
  if (lines.length > OUTCOME_EVENT_STORE_MAX_EVENTS_V1) {
    throw new OutcomeEventStoreError('Outcome event store exceeds its event limit');
  }
  const events: OutcomeEventV1[] = [];
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    if (line === undefined) continue;
    if (line.trim() === '') {
      throw new OutcomeEventStoreError(
        `Outcome event store line ${index + 1} is blank`,
        index + 1,
      );
    }
    if (Buffer.byteLength(`${line}\n`) > OUTCOME_EVENT_MAX_BYTES_V1) {
      throw new OutcomeEventStoreError(
        `Outcome event store line ${index + 1} exceeds the event size limit`,
        index + 1,
      );
    }
    setArrayEntry(events, index, parseStoredEvent(line, index + 1));
  }
  return events;
}

function readDescriptorLedger(descriptor: number): {
  readonly bytes: number;
  readonly events: OutcomeEventV1[];
} {
  const contents = readOutcomeFile(descriptor, OUTCOME_EVENT_STORE_MAX_BYTES_V1);
  return { bytes: Buffer.byteLength(contents), events: parseLedger(contents) };
}

function readStorageWithoutLock(storagePath: string): OutcomeEventV1[] {
  const descriptor = openOutcomeFileForRead(storagePath, 'Outcome event store');
  if (descriptor === undefined) return [];
  try {
    return readDescriptorLedger(descriptor).events;
  } finally {
    closeOutcomeFile(descriptor);
  }
}

export function readOutcomeEventsV1(storagePath: string): OutcomeEventV1[] {
  if (!secureOutcomePathExists(storagePath)) return [];
  const lock = acquireOutcomeStoreLock(storagePath);
  try {
    return readStorageWithoutLock(lock.storagePath);
  } finally {
    releaseOutcomeStoreLock(lock);
  }
}

export function appendOutcomeEventV1(storagePath: string, event: unknown): void {
  const parsed = parseOutcomeEventV1(event);
  if (!parsed.ok) {
    throw new OutcomeEventStoreError(`Refusing invalid outcome event: ${joinErrors(parsed.errors)}`);
  }
  const bytes = `${JSON.stringify(parsed.event)}\n`;
  if (Buffer.byteLength(bytes) > OUTCOME_EVENT_MAX_BYTES_V1) {
    throw new OutcomeEventStoreError('Outcome event exceeds its size limit');
  }

  const lock = acquireOutcomeStoreLock(storagePath);
  try {
    const descriptor = openOutcomeFileForAppend(lock.storagePath, 'Outcome event store');
    try {
      const ledger = readDescriptorLedger(descriptor);
      const { events } = ledger;
      if (events.length >= OUTCOME_EVENT_STORE_MAX_EVENTS_V1) {
        throw new OutcomeEventStoreError('Outcome event store exceeds its event limit');
      }
      if (ledger.bytes + Buffer.byteLength(bytes) > OUTCOME_EVENT_STORE_MAX_BYTES_V1) {
        throw new OutcomeEventStoreError('Outcome event store exceeds its size limit');
      }
      appendOutcomeBytes(descriptor, bytes);
    } finally {
      closeOutcomeFile(descriptor);
    }
  } finally {
    releaseOutcomeStoreLock(lock);
  }
}

function canonicalExportDocument(events: readonly OutcomeEventV1[]): Record<string, unknown> {
  const safeEvents: OutcomeEventV1[] = [];
  Object.setPrototypeOf(safeEvents, null);
  for (let index = 0; index < events.length; index += 1) {
    const event = events[index];
    if (event !== undefined) setArrayEntry(safeEvents, index, event);
  }
  const document = Object.create(null) as Record<string, unknown>;
  document.version = OUTCOME_EVENT_EXPORT_VERSION_V1;
  document.eventVersion = OUTCOME_EVENT_VERSION_V1;
  document.events = safeEvents;
  return document;
}

export function exportOutcomeEventsV1(storagePath: string, exportPath: string): number {
  const absoluteStoragePath = resolve(storagePath);
  const absoluteExportPath = resolve(exportPath);
  if (pathComparisonKey(absoluteStoragePath) === pathComparisonKey(absoluteExportPath)) {
    throw new OutcomeEventStoreError('Outcome export path must differ from the local JSONL store');
  }
  if (pathComparisonKey(absoluteExportPath) === pathComparisonKey(`${absoluteStoragePath}.lock`)) {
    throw new OutcomeEventStoreError('Outcome export path must differ from the active store lock');
  }

  const lock = acquireOutcomeStoreLock(storagePath);
  try {
    const storageIdentity = outcomeFileIdentity(lock.storagePath, 'Outcome event store');
    const events = readStorageWithoutLock(lock.storagePath);
    const document = canonicalExportDocument(events);
    const protectedIdentities = storageIdentity === undefined
      ? [lock.identity]
      : [storageIdentity, lock.identity];
    writePrivateAtomic(
      exportPath,
      `${JSON.stringify(document, null, 2)}\n`,
      protectedIdentities,
    );
    return events.length;
  } finally {
    releaseOutcomeStoreLock(lock);
  }
}

function pathComparisonKey(path: string): string {
  return path.normalize('NFC').toLowerCase();
}

export function deleteOutcomeEventsV1(storagePath: string): boolean {
  if (!secureOutcomePathExists(storagePath)) return false;
  const lock = acquireOutcomeStoreLock(storagePath);
  try {
    return deleteSingleLinkRegularFile(lock.storagePath);
  } finally {
    releaseOutcomeStoreLock(lock);
  }
}
