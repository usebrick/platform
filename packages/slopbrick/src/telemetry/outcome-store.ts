import {
  closeSync,
  constants,
  existsSync,
  fchmodSync,
  fstatSync,
  ftruncateSync,
  lstatSync,
  mkdirSync,
  openSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { dirname, resolve } from 'node:path';

import {
  OUTCOME_EVENT_VERSION_V1,
  validateOutcomeEventV1,
  type OutcomeEventV1,
} from './outcome-event';

export const OUTCOME_EVENT_EXPORT_VERSION_V1 = 'slopbrick-outcome-export-v1' as const;

export class OutcomeEventStoreError extends Error {
  readonly lineNumber?: number;

  constructor(message: string, lineNumber?: number) {
    super(message);
    this.name = 'OutcomeEventStoreError';
    this.lineNumber = lineNumber;
  }
}

interface FileIdentity {
  readonly device: number;
  readonly inode: number;
}

function assertRegularPathOrMissing(path: string, label: string): void {
  try {
    const metadata = lstatSync(path);
    if (metadata.isSymbolicLink()) throw new OutcomeEventStoreError(`${label} must not be a symbolic link`);
    if (!metadata.isFile()) throw new OutcomeEventStoreError(`${label} must be a regular file`);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return;
    throw error;
  }
}

function openRegularFile(path: string, flags: number, label: string, mode?: number): number {
  assertRegularPathOrMissing(path, label);
  let descriptor: number;
  try {
    descriptor = openSync(path, flags | constants.O_NOFOLLOW, mode);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ELOOP') {
      throw new OutcomeEventStoreError(`${label} must not be a symbolic link`);
    }
    throw error;
  }
  if (!fstatSync(descriptor).isFile()) {
    closeSync(descriptor);
    throw new OutcomeEventStoreError(`${label} must be a regular file`);
  }
  return descriptor;
}

function fileIdentity(path: string, label: string): FileIdentity | undefined {
  let descriptor: number;
  try {
    descriptor = openRegularFile(path, constants.O_RDONLY, label);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return undefined;
    throw error;
  }
  try {
    const metadata = fstatSync(descriptor);
    return { device: metadata.dev, inode: metadata.ino };
  } finally {
    closeSync(descriptor);
  }
}

function sameFile(left: FileIdentity | undefined, right: FileIdentity): boolean {
  return left !== undefined && left.device === right.device && left.inode === right.inode;
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

  const validation = validateOutcomeEventV1(value);
  if (!validation.ok) {
    throw new OutcomeEventStoreError(
      `Outcome event store line ${lineNumber} is invalid: ${validation.errors.join('; ')}`,
      lineNumber,
    );
  }
  return value as OutcomeEventV1;
}

export function readOutcomeEventsV1(storagePath: string): OutcomeEventV1[] {
  let descriptor: number;
  try {
    descriptor = openRegularFile(storagePath, constants.O_RDONLY, 'Outcome event store');
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return [];
    throw error;
  }
  let contents: string;
  try {
    contents = readFileSync(descriptor, 'utf8');
  } finally {
    closeSync(descriptor);
  }

  const events: OutcomeEventV1[] = [];
  for (const [index, line] of contents.split('\n').entries()) {
    if (line.trim() === '') continue;
    events.push(parseStoredEvent(line, index + 1));
  }
  return events;
}

export function appendOutcomeEventV1(storagePath: string, event: unknown): void {
  const validation = validateOutcomeEventV1(event);
  if (!validation.ok) {
    throw new OutcomeEventStoreError(`Refusing invalid outcome event: ${validation.errors.join('; ')}`);
  }

  // Preserve ledger inspectability: never append behind a corrupt line.
  readOutcomeEventsV1(storagePath);
  mkdirSync(dirname(storagePath), { recursive: true, mode: 0o700 });
  const descriptor = openRegularFile(
    storagePath,
    constants.O_WRONLY | constants.O_APPEND | constants.O_CREAT,
    'Outcome event store',
    0o600,
  );
  try {
    fchmodSync(descriptor, 0o600);
    writeFileSync(descriptor, `${JSON.stringify(event)}\n`, 'utf8');
  } finally {
    closeSync(descriptor);
  }
}

export function exportOutcomeEventsV1(storagePath: string, exportPath: string): number {
  if (resolve(storagePath) === resolve(exportPath)) {
    throw new OutcomeEventStoreError('Outcome export path must differ from the local JSONL store');
  }

  const events = readOutcomeEventsV1(storagePath);
  const storageIdentity = fileIdentity(storagePath, 'Outcome event store');
  const document = {
    version: OUTCOME_EVENT_EXPORT_VERSION_V1,
    eventVersion: OUTCOME_EVENT_VERSION_V1,
    events,
  } as const;

  mkdirSync(dirname(exportPath), { recursive: true, mode: 0o700 });
  const descriptor = openRegularFile(
    exportPath,
    constants.O_WRONLY | constants.O_CREAT,
    'Outcome export',
    0o600,
  );
  try {
    const exportMetadata = fstatSync(descriptor);
    if (sameFile(storageIdentity, { device: exportMetadata.dev, inode: exportMetadata.ino })) {
      throw new OutcomeEventStoreError('Outcome export must not alias the local JSONL store');
    }
    ftruncateSync(descriptor, 0);
    fchmodSync(descriptor, 0o600);
    writeFileSync(descriptor, `${JSON.stringify(document, null, 2)}\n`, 'utf8');
  } finally {
    closeSync(descriptor);
  }
  return events.length;
}

export function deleteOutcomeEventsV1(storagePath: string): boolean {
  const existed = existsSync(storagePath);
  rmSync(storagePath, { force: true });
  return existed;
}
