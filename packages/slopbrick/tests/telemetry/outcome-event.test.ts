import Ajv2020 from 'ajv/dist/2020.js';
import { describe, expect, it } from 'vitest';

import {
  OUTCOME_EVENT_SCHEMA_V1,
  OUTCOME_EVENT_VERSION_V1,
  validateOutcomeEventV1,
  type OutcomeEventV1,
} from '../../src/telemetry/outcome-event';

describe('privacy-safe local outcome event contract', () => {
  it('represents RUN-001 outcomes and a bounded return without repository identity', () => {
    const common = {
      version: OUTCOME_EVENT_VERSION_V1,
      observedOn: '2026-07-22',
      producerVersion: '0.45.0',
      context: {
        framework: 'mixed',
        repositorySize: '101-500',
      },
    } as const;
    const events: OutcomeEventV1[] = [
      {
        ...common,
        event: 'scan-completed',
        scanKind: 'initial',
        status: 'complete',
        comparison: 'not-evaluated',
      },
      {
        ...common,
        event: 'first-finding-assessed',
        detectorId: 'logic/heaps-deviation',
        evidenceTier: 'quality-candidate-unmeasured',
        assessment: 'useful',
      },
      {
        ...common,
        event: 'action-decided',
        detectorId: 'logic/heaps-deviation',
        decision: 'declined',
        reason: 'no-safe-repair',
      },
      {
        ...common,
        event: 'scan-completed',
        scanKind: 'rescan',
        status: 'complete',
        comparison: 'unchanged',
      },
      {
        ...common,
        event: 'return-observed',
        window: 'within-1-day',
      },
    ];

    const validateSchema = new Ajv2020({ allErrors: true, strict: true })
      .compile(OUTCOME_EVENT_SCHEMA_V1);
    for (const event of events) {
      expect(validateOutcomeEventV1(event)).toEqual({ ok: true, errors: [] });
      expect(validateSchema(event), JSON.stringify(validateSchema.errors)).toBe(true);
    }

    expect(events.map(({ event }) => event)).toEqual([
      'scan-completed',
      'first-finding-assessed',
      'action-decided',
      'scan-completed',
      'return-observed',
    ]);
    expect(JSON.stringify(events)).not.toMatch(
      /\/Users\/|github\.com|admission-authority-rebuild-publication|repositoryName|repositoryId|sessionId|userId/u,
    );
  });
});
