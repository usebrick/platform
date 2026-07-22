import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
  appendOutcomeEventV1,
  deleteOutcomeEventsV1,
  exportOutcomeEventsV1,
  OUTCOME_EVENT_EXPORT_VERSION_V1,
  OutcomeEventStoreError,
  readOutcomeEventsV1,
} from '../../src/telemetry/outcome-store';
import {
  OUTCOME_EVENT_VERSION_V1,
  type OutcomeEventV1,
} from '../../src/telemetry/outcome-event';

describe('privacy-safe local outcome event store', () => {
  let root: string;

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'slopbrick-outcomes-'));
  });

  afterEach(() => {
    rmSync(root, { recursive: true, force: true });
  });

  it('round-trips validated events at an explicit path without touching flywheel history', () => {
    const storagePath = join(root, 'owner-selected', 'events-v1.jsonl');
    const event: OutcomeEventV1 = {
      version: OUTCOME_EVENT_VERSION_V1,
      event: 'first-finding-assessed',
      observedOn: '2026-07-22',
      producerVersion: '0.45.0',
      context: { framework: 'mixed', repositorySize: '101-500' },
      detectorId: 'logic/heaps-deviation',
      evidenceTier: 'quality-candidate-unmeasured',
      assessment: 'useful',
    };

    expect(readOutcomeEventsV1(storagePath)).toEqual([]);
    appendOutcomeEventV1(storagePath, event);

    expect(readOutcomeEventsV1(storagePath)).toEqual([event]);
    expect(readFileSync(storagePath, 'utf8')).toBe(`${JSON.stringify(event)}\n`);
    expect(existsSync(join(root, '.slopbrick', 'flywheel'))).toBe(false);
  });

  it('fails closed on corrupt storage without leaking or extending the corrupt line', () => {
    const storagePath = join(root, 'events-v1.jsonl');
    const secret = 'private-customer-source-text';
    const corruptBytes = `{"source":"${secret}"}\n`;
    writeFileSync(storagePath, corruptBytes, 'utf8');

    let readError: unknown;
    try {
      readOutcomeEventsV1(storagePath);
    } catch (error) {
      readError = error;
    }
    expect(readError).toBeInstanceOf(OutcomeEventStoreError);
    expect((readError as Error).message).not.toContain(secret);

    const validEvent: OutcomeEventV1 = {
      version: OUTCOME_EVENT_VERSION_V1,
      event: 'return-observed',
      observedOn: '2026-07-22',
      producerVersion: '0.45.0',
      context: { framework: 'mixed', repositorySize: '101-500' },
      window: 'within-7-days',
    };
    expect(() => appendOutcomeEventV1(storagePath, validEvent))
      .toThrow(OutcomeEventStoreError);
    expect(readFileSync(storagePath, 'utf8')).toBe(corruptBytes);
  });

  it('exports an inspectable versioned document and deletes only the selected ledger', () => {
    const storagePath = join(root, 'local', 'events-v1.jsonl');
    const exportPath = join(root, 'exports', 'outcomes.json');
    const event: OutcomeEventV1 = {
      version: OUTCOME_EVENT_VERSION_V1,
      event: 'action-decided',
      observedOn: '2026-07-22',
      producerVersion: '0.45.0',
      context: { framework: 'mixed', repositorySize: '101-500' },
      detectorId: 'logic/heaps-deviation',
      decision: 'declined',
      reason: 'no-safe-repair',
    };
    appendOutcomeEventV1(storagePath, event);

    expect(exportOutcomeEventsV1(storagePath, exportPath)).toBe(1);
    expect(JSON.parse(readFileSync(exportPath, 'utf8'))).toEqual({
      version: OUTCOME_EVENT_EXPORT_VERSION_V1,
      eventVersion: OUTCOME_EVENT_VERSION_V1,
      events: [event],
    });
    expect(readOutcomeEventsV1(storagePath)).toEqual([event]);

    expect(deleteOutcomeEventsV1(storagePath)).toBe(true);
    expect(deleteOutcomeEventsV1(storagePath)).toBe(false);
    expect(readOutcomeEventsV1(storagePath)).toEqual([]);
    expect(existsSync(exportPath)).toBe(true);
  });
});
