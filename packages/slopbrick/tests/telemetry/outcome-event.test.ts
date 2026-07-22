import Ajv2020 from 'ajv/dist/2020.js';
import { describe, expect, it } from 'vitest';

import * as slopbrick from '../../src/index';
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

  it('documents every accepted field and rejects sensitive extensions without echoing values', () => {
    for (const variant of OUTCOME_EVENT_SCHEMA_V1.oneOf) {
      for (const [field, definition] of Object.entries(variant.properties)) {
        expect(definition, field).toHaveProperty('description');
      }
    }
    for (const [field, definition] of Object.entries(
      OUTCOME_EVENT_SCHEMA_V1.$defs.context.properties,
    )) {
      expect(definition, `context.${field}`).toHaveProperty('description');
    }

    const safeEvent = {
      version: OUTCOME_EVENT_VERSION_V1,
      event: 'first-finding-assessed',
      observedOn: '2026-07-22',
      producerVersion: '0.45.0',
      context: { framework: 'mixed', repositorySize: '101-500' },
      detectorId: 'logic/heaps-deviation',
      evidenceTier: 'quality-candidate-unmeasured',
      assessment: 'useful',
    } as const;
    const secret = 'super-secret-customer-code';
    const sensitiveEvents: unknown[] = [
      { ...safeEvent, source: secret },
      { ...safeEvent, snippet: secret },
      { ...safeEvent, content: secret },
      { ...safeEvent, filePath: `/Users/customer/${secret}.ts` },
      { ...safeEvent, repositoryName: secret },
      { ...safeEvent, remote: `git@example.invalid/${secret}.git` },
      { ...safeEvent, userId: secret },
      { ...safeEvent, sessionId: secret },
      { ...safeEvent, context: { ...safeEvent.context, repositoryId: secret } },
    ];

    const validateSchema = new Ajv2020({ allErrors: true, strict: true })
      .compile(OUTCOME_EVENT_SCHEMA_V1);
    for (const event of sensitiveEvents) {
      const result = validateOutcomeEventV1(event);
      expect(result.ok).toBe(false);
      expect(JSON.stringify(result.errors)).not.toContain(secret);
      expect(validateSchema(event)).toBe(false);
    }
  });

  it('publishes the local outcome contract and lifecycle operations through SlopBrick', () => {
    expect(slopbrick.OUTCOME_EVENT_VERSION_V1).toBe(OUTCOME_EVENT_VERSION_V1);
    expect(slopbrick.OUTCOME_EVENT_SCHEMA_V1).toBe(OUTCOME_EVENT_SCHEMA_V1);
    expect(slopbrick.validateOutcomeEventV1).toBe(validateOutcomeEventV1);
    expect(slopbrick.appendOutcomeEventV1).toEqual(expect.any(Function));
    expect(slopbrick.readOutcomeEventsV1).toEqual(expect.any(Function));
    expect(slopbrick.exportOutcomeEventsV1).toEqual(expect.any(Function));
    expect(slopbrick.deleteOutcomeEventsV1).toEqual(expect.any(Function));
  });
});
