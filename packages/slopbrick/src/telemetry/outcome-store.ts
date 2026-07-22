import {
  appendFileSync,
  mkdirSync,
  readFileSync,
} from 'node:fs';
import { dirname } from 'node:path';

import {
  validateOutcomeEventV1,
  type OutcomeEventV1,
} from './outcome-event';

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

  mkdirSync(dirname(storagePath), { recursive: true, mode: 0o700 });
  appendFileSync(storagePath, `${JSON.stringify(event)}\n`, {
    encoding: 'utf8',
    mode: 0o600,
  });
}
