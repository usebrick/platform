import {
  OUTCOME_ACTION_DECISIONS_V1,
  OUTCOME_ACTION_REASONS_V1,
  OUTCOME_COMPLETE_RESCAN_COMPARISONS_V1,
  OUTCOME_DETECTOR_IDS_V1,
  OUTCOME_DECLINED_ACTION_REASONS_V1,
  OUTCOME_EVENT_VERSION_V1,
  OUTCOME_EVIDENCE_TIERS_V1,
  OUTCOME_FINDING_ASSESSMENTS_V1,
  OUTCOME_FRAMEWORK_BUCKETS_V1,
  OUTCOME_INCOMPLETE_RESCAN_STATUSES_V1,
  OUTCOME_OBSERVED_ON_PATTERN_V1,
  OUTCOME_PRODUCER_VERSION_PATTERN_V1,
  OUTCOME_REPOSITORY_SIZE_BUCKETS_V1,
  OUTCOME_RETURN_WINDOWS_V1,
  OUTCOME_SCAN_COMPARISONS_V1,
  OUTCOME_SCAN_KINDS_V1,
  OUTCOME_SCAN_STATUSES_V1,
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
    pattern: OUTCOME_OBSERVED_ON_PATTERN_V1,
  },
  producerVersion: {
    type: 'string',
    description: 'Low-entropy public SlopBrick release version; prerelease and build text are excluded.',
    pattern: OUTCOME_PRODUCER_VERSION_PATTERN_V1,
    maxLength: 11,
  },
  context: {
    description: 'Coarse framework and selected-file-count buckets for this observation.',
    $ref: '#/$defs/context',
  },
} as const;

const detectorIdSchema = {
  type: 'string',
  description: 'Detector ID from the immutable public SlopBrick v1 allowlist.',
  enum: OUTCOME_DETECTOR_IDS_V1,
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
        scanKind: { enum: OUTCOME_SCAN_KINDS_V1, description: 'Whether this was the first observed scan or a rescan.' },
        status: { enum: OUTCOME_SCAN_STATUSES_V1, description: 'The existing first-scan completion state.' },
        comparison: {
          enum: OUTCOME_SCAN_COMPARISONS_V1,
          description: 'Coarse rescan comparison; it carries no finding details.',
        },
      },
      allOf: [
        {
          if: { properties: { scanKind: { const: 'initial' } }, required: ['scanKind'] },
          then: { properties: { comparison: { const: 'not-evaluated' } } },
        },
        {
          if: {
            properties: { scanKind: { const: 'rescan' }, status: { const: 'complete' } },
            required: ['scanKind', 'status'],
          },
          then: { properties: { comparison: { enum: OUTCOME_COMPLETE_RESCAN_COMPARISONS_V1 } } },
        },
        {
          if: {
            properties: {
              scanKind: { const: 'rescan' },
              status: { enum: OUTCOME_INCOMPLETE_RESCAN_STATUSES_V1 },
            },
            required: ['scanKind', 'status'],
          },
          then: { properties: { comparison: { const: 'unavailable' } } },
        },
      ],
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
          enum: OUTCOME_FINDING_ASSESSMENTS_V1,
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
        decision: { enum: OUTCOME_ACTION_DECISIONS_V1, description: 'Coarse action disposition.' },
        reason: {
          enum: OUTCOME_ACTION_REASONS_V1,
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
          then: { properties: { reason: { enum: OUTCOME_DECLINED_ACTION_REASONS_V1 } } },
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
          enum: OUTCOME_RETURN_WINDOWS_V1,
          description: 'Coarse elapsed-time bucket; exact timestamps and persistent identifiers are absent.',
        },
      },
    },
  ],
} as const;
