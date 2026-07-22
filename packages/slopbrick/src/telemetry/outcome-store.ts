import {
  appendFileSync,
  chmodSync,
  existsSync,
  mkdirSync,
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
  let contents: string;
  try {
    contents = readFileSync(storagePath, 'utf8');
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return [];
    throw error;
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
  appendFileSync(storagePath, `${JSON.stringify(event)}\n`, {
    encoding: 'utf8',
    mode: 0o600,
  });
  chmodSync(storagePath, 0o600);
}

export function exportOutcomeEventsV1(storagePath: string, exportPath: string): number {
  if (resolve(storagePath) === resolve(exportPath)) {
    throw new OutcomeEventStoreError('Outcome export path must differ from the local JSONL store');
  }

  const events = readOutcomeEventsV1(storagePath);
  const document = {
    version: OUTCOME_EVENT_EXPORT_VERSION_V1,
    eventVersion: OUTCOME_EVENT_VERSION_V1,
    events,
  } as const;

  mkdirSync(dirname(exportPath), { recursive: true, mode: 0o700 });
  writeFileSync(exportPath, `${JSON.stringify(document, null, 2)}\n`, {
    encoding: 'utf8',
    mode: 0o600,
  });
  chmodSync(exportPath, 0o600);
  return events.length;
}

export function deleteOutcomeEventsV1(storagePath: string): boolean {
  const existed = existsSync(storagePath);
  rmSync(storagePath, { force: true });
  return existed;
}
