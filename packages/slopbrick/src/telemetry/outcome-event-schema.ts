import {
  OUTCOME_EVENT_VERSION_V1,
  OUTCOME_EVIDENCE_TIERS_V1,
  OUTCOME_FRAMEWORK_BUCKETS_V1,
  OUTCOME_REPOSITORY_SIZE_BUCKETS_V1,
} from './outcome-event-types';

const contextSchema = {
  type: 'object',
  description: 'Coarse, non-identifying repository context used for local comparison.',
  additionalProperties: false,
  required: ['framework', 'repositorySize'],
  properties: {
    framework: {
      type: 'string',
      description: 'Coarse framework family; never a package list or repository fingerprint.',
      enum: OUTCOME_FRAMEWORK_BUCKETS_V1,
    },
    repositorySize: {
      type: 'string',
      description: 'Bucket for the number of selected files; never the exact count.',
      enum: OUTCOME_REPOSITORY_SIZE_BUCKETS_V1,
    },
  },
} as const;

const commonProperties = {
  version: {
    type: 'string',
    description: 'Closed wire-contract version for this local outcome event.',
    const: OUTCOME_EVENT_VERSION_V1,
  },
  observedOn: {
    type: 'string',
    description: 'UTC calendar day of observation; exact time is deliberately omitted.',
    pattern: '^\\d{4}-\\d{2}-\\d{2}$',
  },
  producerVersion: {
    type: 'string',
    description: 'SlopBrick version that produced or accepted the observation.',
    pattern: '^\\d+\\.\\d+\\.\\d+(?:-[0-9A-Za-z.-]+)?$',
    maxLength: 64,
  },
  context: {
    description: 'Coarse framework and selected-file-count buckets for this observation.',
    $ref: '#/$defs/context',
  },
} as const;

const detectorIdSchema = {
  type: 'string',
  description: 'Public SlopBrick detector ID; never a finding, file, or repository identifier.',
  pattern: '^[a-z0-9][a-z0-9-]*/[a-z0-9][a-z0-9-]*$',
  maxLength: 128,
} as const;

export const OUTCOME_EVENT_SCHEMA_V1 = {
  $schema: 'https://json-schema.org/draft/2020-12/schema',
  $id: 'https://usebrick.dev/schemas/slopbrick-outcome-event-v1.schema.json',
  title: 'SlopBrick privacy-safe local outcome event v1',
  description: 'A closed, local-only observation contract with no raw source or repository identity.',
  $defs: { context: contextSchema },
  oneOf: [
    {
      type: 'object',
      additionalProperties: false,
      required: ['version', 'event', 'observedOn', 'producerVersion', 'context', 'scanKind', 'status', 'comparison'],
      properties: {
        ...commonProperties,
        event: { const: 'scan-completed', description: 'Records completion of an initial scan or rescan.' },
        scanKind: { enum: ['initial', 'rescan'], description: 'Whether this was the first observed scan or a rescan.' },
        status: { enum: ['complete', 'incomplete', 'not-applicable'], description: 'The existing first-scan completion state.' },
        comparison: {
          enum: ['not-evaluated', 'unchanged', 'changed', 'unavailable'],
          description: 'Coarse rescan comparison; it carries no finding details.',
        },
      },
    },
    {
      type: 'object',
      additionalProperties: false,
      required: ['version', 'event', 'observedOn', 'producerVersion', 'context', 'detectorId', 'evidenceTier', 'assessment'],
      properties: {
        ...commonProperties,
        event: { const: 'first-finding-assessed', description: 'Records the first prioritized finding the user assessed.' },
        detectorId: detectorIdSchema,
        evidenceTier: {
          enum: OUTCOME_EVIDENCE_TIERS_V1,
          description: 'Evidence tier projected by the first-scan contract; not an authorship label.',
        },
        assessment: {
          enum: ['useful', 'not-useful', 'uncertain'],
          description: 'User assessment of review utility; it is not a calibration label.',
        },
      },
    },
    {
      type: 'object',
      additionalProperties: false,
      required: ['version', 'event', 'observedOn', 'producerVersion', 'context', 'detectorId', 'decision', 'reason'],
      properties: {
        ...commonProperties,
        event: { const: 'action-decided', description: 'Records whether a bounded action was applied, declined, or deferred.' },
        detectorId: detectorIdSchema,
        decision: { enum: ['applied', 'declined', 'deferred'], description: 'Coarse action disposition.' },
        reason: {
          enum: ['finding-bound-repair', 'no-safe-repair', 'user-choice', 'needs-review'],
          description: 'Broad reason that excludes source, path, and free-form user text.',
        },
      },
      allOf: [
        {
          if: { properties: { decision: { const: 'applied' } }, required: ['decision'] },
          then: { properties: { reason: { const: 'finding-bound-repair' } } },
        },
        {
          if: { properties: { decision: { const: 'declined' } }, required: ['decision'] },
          then: { properties: { reason: { enum: ['no-safe-repair', 'user-choice'] } } },
        },
        {
          if: { properties: { decision: { const: 'deferred' } }, required: ['decision'] },
          then: { properties: { reason: { const: 'needs-review' } } },
        },
      ],
    },
    {
      type: 'object',
      additionalProperties: false,
      required: ['version', 'event', 'observedOn', 'producerVersion', 'context', 'window'],
      properties: {
        ...commonProperties,
        event: { const: 'return-observed', description: 'Records a local return inside a bounded observation window.' },
        window: {
          enum: ['within-1-day', 'within-7-days', 'within-30-days', 'within-90-days'],
          description: 'Coarse elapsed-time bucket; exact timestamps and persistent identifiers are absent.',
        },
      },
    },
  ],
} as const;
