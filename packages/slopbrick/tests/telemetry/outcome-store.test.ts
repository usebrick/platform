import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
  appendOutcomeEventV1,
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
});
