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
      `Outcome event store line ${lineNumber} is invalid: ${parsed.errors.join('; ')}`,
      lineNumber,
    );
  }
  return parsed.event;
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
  return lines.map((line, index) => {
    if (line.trim() === '') {
      throw new OutcomeEventStoreError(
        `Outcome event store line ${index + 1} is blank`,
        index + 1,
      );
    }
    return parseStoredEvent(line, index + 1);
  });
}

function readDescriptorLedger(descriptor: number): {
  readonly bytes: number;
  readonly events: OutcomeEventV1[];
} {
  const contents = readOutcomeFile(descriptor, OUTCOME_EVENT_STORE_MAX_BYTES_V1);
  return { bytes: Buffer.byteLength(contents), events: parseLedger(contents) };
}

function readLockedStorage(storagePath: string): OutcomeEventV1[] {
  const descriptor = openOutcomeFileForRead(storagePath, 'Outcome event store');
  if (descriptor === undefined) return [];
  try {
    return readDescriptorLedger(descriptor).events;
  } finally {
    closeOutcomeFile(descriptor);
  }
}

export function readOutcomeEventsV1(storagePath: string): OutcomeEventV1[] {
  return readLockedStorage(storagePath);
}

export function appendOutcomeEventV1(storagePath: string, event: unknown): void {
  const parsed = parseOutcomeEventV1(event);
  if (!parsed.ok) {
    throw new OutcomeEventStoreError(`Refusing invalid outcome event: ${parsed.errors.join('; ')}`);
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
  const document = Object.create(null) as Record<string, unknown>;
  document.version = OUTCOME_EVENT_EXPORT_VERSION_V1;
  document.eventVersion = OUTCOME_EVENT_VERSION_V1;
  document.events = events;
  return document;
}

export function exportOutcomeEventsV1(storagePath: string, exportPath: string): number {
  if (resolve(storagePath) === resolve(exportPath)) {
    throw new OutcomeEventStoreError('Outcome export path must differ from the local JSONL store');
  }

  const lock = acquireOutcomeStoreLock(storagePath);
  try {
    const events = readLockedStorage(lock.storagePath);
    const document = canonicalExportDocument(events);
    writePrivateAtomic(exportPath, `${JSON.stringify(document, null, 2)}\n`);
    return events.length;
  } finally {
    releaseOutcomeStoreLock(lock);
  }
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
