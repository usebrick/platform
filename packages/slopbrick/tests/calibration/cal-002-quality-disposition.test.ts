import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import Ajv2020 from 'ajv/dist/2020.js';
import { describe, expect, it } from 'vitest';

import {
  CAL002_ASSOCIATION_SNAPSHOT,
  authorityRowsSha256V2,
  canonicalAuthorityRowsV2,
} from '../../src/calibration/cal-002/authority';
import {
  CAL002_AUTHORITY_RECEIPT_VERSION,
  CAL002_PROTOCOL_VERSION_V2,
  type CAL002AuthorityReceiptV2,
} from '../../src/calibration/cal-002/contracts-v2';
import {
  CAL002_LOCKED_RULE_CATALOG_SHA256,
  canonicalArtifact,
} from '../../src/calibration/cal-002/contracts';
import type { CAL002QualityMetricsRow } from '../../src/calibration/cal-002/quality-metrics';
import {
  CAL002_QUALITY_DISPOSITION_VERSION,
  assertCAL002QualityDispositionV2,
  buildCAL002QualityDispositionV2,
  planCAL002QualityCohortV2,
} from '../../src/calibration/cal-002/quality-disposition';

const HERE = dirname(fileURLToPath(import.meta.url));
const SCHEMA_DIR = join(HERE, '../../src/calibration/cal-002/schemas');
const COMMIT_SHA = 'b'.repeat(40);

function approvedAuthorityReceipt(): CAL002AuthorityReceiptV2 {
  const rows = canonicalAuthorityRowsV2();
  return {
    version: CAL002_AUTHORITY_RECEIPT_VERSION,
    protocolVersion: CAL002_PROTOCOL_VERSION_V2,
    catalogSha256: CAL002_LOCKED_RULE_CATALOG_SHA256,
    proposalSha256: 'a'.repeat(64),
    priorStateSha256: 'b'.repeat(64),
    revision: 2,
    reviewerAuthority: 'repository-owner',
    decision: 'approved',
    associationSnapshot: CAL002_ASSOCIATION_SNAPSHOT,
    rows,
    authorityRowsSha256: authorityRowsSha256V2(rows),
    associationRowsSha256: canonicalArtifact(rows).sha256,
    admitted: false,
    applied: false,
  };
}

function metricRow(
  ruleId: string,
  evidenceClass: CAL002QualityMetricsRow['evidenceClass'],
  outcome: CAL002QualityMetricsRow['outcome'] = 'default-on',
): CAL002QualityMetricsRow {
  const evidence = outcome === 'default-on'
    ? {
        requestedPerArm: 30 as const,
        finding: { actionableDefect: 22, usefulNoSafeFix: 4, notUseful: 2, cannotDetermine: 2 },
        control: { actionableDefect: 1, usefulNoSafeFix: 1, notUseful: 27, cannotDetermine: 1 },
      }
    : outcome === 'default-off'
      ? {
          requestedPerArm: 30 as const,
          finding: { actionableDefect: 0, usefulNoSafeFix: 0, notUseful: 30, cannotDetermine: 0 },
          control: { actionableDefect: 0, usefulNoSafeFix: 0, notUseful: 30, cannotDetermine: 0 },
        }
      : outcome === 'quality-advisory'
        ? {
            requestedPerArm: 100 as const,
            finding: { actionableDefect: 60, usefulNoSafeFix: 0, notUseful: 40, cannotDetermine: 0 },
            control: { actionableDefect: 40, usefulNoSafeFix: 0, notUseful: 60, cannotDetermine: 0 },
          }
        : {
            requestedPerArm: 30 as const,
            finding: { actionableDefect: 18, usefulNoSafeFix: 0, notUseful: 12, cannotDetermine: 0 },
            control: { actionableDefect: 8, usefulNoSafeFix: 0, notUseful: 22, cannotDetermine: 0 },
          };
  const claimCeiling = outcome === 'insufficient-evidence'
    ? 'insufficient-evidence'
    : outcome === 'quality-advisory' || evidenceClass === 'statistical-review-utility'
      ? 'review-target-utility'
      : 'quality-usefulness';
  return {
    ruleId,
    evidenceClass,
    ...evidence,
    outcome,
    claimCeiling,
  };
}

function reach(ruleId: string, overrides: Partial<{ findings: number; controls: number; familyCount: number }> = {}) {
  return { ruleId, findings: 30, controls: 30, familyCount: 5, ...overrides };
}

describe('CAL-002 v2 quality disposition', () => {
  it('closes exactly 11 v1 contextual, 4 v1 statistical, and 17 transferred contextual rows without inventing labels', () => {
    const authorityReceipt = approvedAuthorityReceipt();
    const expectedRows = authorityReceipt.rows.filter((row) =>
      row.evidenceClass === 'contextual-quality' || row.evidenceClass === 'statistical-review-utility');

    const result = buildCAL002QualityDispositionV2({
      authorityReceipt,
      selectedMetrics: [],
      implementationCommitSha: COMMIT_SHA,
    });

    expect(expectedRows).toHaveLength(32);
    expect(expectedRows.filter((row) => row.sourceClass === 'starting-quality' && row.evidenceClass === 'contextual-quality')).toHaveLength(11);
    expect(expectedRows.filter((row) => row.sourceClass === 'starting-quality' && row.evidenceClass === 'statistical-review-utility')).toHaveLength(4);
    expect(expectedRows.filter((row) => row.sourceClass === 'owner-batch' && row.evidenceClass === 'contextual-quality')).toHaveLength(17);
    expect(result.disposition).toMatchObject({
      version: CAL002_QUALITY_DISPOSITION_VERSION,
      protocolVersion: CAL002_PROTOCOL_VERSION_V2,
      catalogSha256: CAL002_LOCKED_RULE_CATALOG_SHA256,
      authorityReceiptSha256: canonicalArtifact(authorityReceipt).sha256,
      implementationCommitSha: COMMIT_SHA,
      selectedRuleIds: [],
      admitted: false,
      applied: false,
    });
    expect(result.disposition.rows.map((row) => row.ruleId)).toEqual(expectedRows.map((row) => row.ruleId));
    expect(result.disposition.rows.every((row) =>
      row.measurementStatus === 'not-requested-owner-capacity'
      && row.runtimeOutcome === 'quality-candidate-default-off'
      && row.sampleCounts.findings === 0
      && row.sampleCounts.controls === 0
      && row.sampleCounts.cannotDetermine === 0
      && row.uncertainty === undefined
      && row.metricsRowSha256 === undefined
      && row.enabledByDefault === false
      && row.scoreEligible === false
      && row.gateEligible === false
      && row.repairSafety === 'no-safe-repair'
    )).toBe(true);
    expect(result.dispositionJson).toBe(canonicalArtifact(result.disposition).json);
    expect(result.dispositionSha256).toBe(canonicalArtifact(result.disposition).sha256);
  });

  it('plans a sorted, unique, reach-qualified cohort of at most four rules', () => {
    const selectedRuleIds = [
      'layout/gap-monopoly',
      'ai/any-density',
      'test/duplicate-setup',
      'logic/heaps-deviation',
    ];
    const result = planCAL002QualityCohortV2({
      authorityReceipt: approvedAuthorityReceipt(),
      reach: selectedRuleIds.map((ruleId) => reach(ruleId)),
      selectedRuleIds,
    });

    expect(result).toEqual({
      selectedRuleIds: [...selectedRuleIds].sort(),
      initialLabels: 240,
      maximumLabels: 800,
    });
    expect(planCAL002QualityCohortV2({
      authorityReceipt: approvedAuthorityReceipt(),
      reach: [],
      selectedRuleIds: [],
    })).toEqual({ selectedRuleIds: [], initialLabels: 0, maximumLabels: 0 });
  });

  it.each(['logic/ghost-defensive', 'product/ux-pattern-fragmentation', 'test/weak-assertion'])(
    'rejects assignment for non-ready %s',
    (ruleId) => expect(() => planCAL002QualityCohortV2({
      authorityReceipt: approvedAuthorityReceipt(),
      reach: [reach(ruleId, { findings: 100, controls: 100 })],
      selectedRuleIds: [ruleId],
    })).toThrow(/not evidence-ready/i),
  );

  it('rejects oversized, duplicate, duplicate-reach, under-reached, and under-family cohorts', () => {
    const authorityReceipt = approvedAuthorityReceipt();
    const five = [
      'ai/any-density',
      'ai/console-debug-storm',
      'ai/fetch-default-overuse',
      'ai/state-default-overuse',
      'ai/tailwind-color-overuse',
    ];
    expect(() => planCAL002QualityCohortV2({
      authorityReceipt,
      reach: five.map((ruleId) => reach(ruleId)),
      selectedRuleIds: five,
    })).toThrow(/limited to four/i);
    expect(() => planCAL002QualityCohortV2({
      authorityReceipt,
      reach: [reach('ai/any-density')],
      selectedRuleIds: ['ai/any-density', 'ai/any-density'],
    })).toThrow(/unique/i);
    expect(() => planCAL002QualityCohortV2({
      authorityReceipt,
      reach: [reach('ai/any-density'), reach('ai/any-density')],
      selectedRuleIds: ['ai/any-density'],
    })).toThrow(/reach.*unique|duplicate.*reach/i);
    expect(() => planCAL002QualityCohortV2({
      authorityReceipt,
      reach: [reach('ai/any-density', { findings: 29 })],
      selectedRuleIds: ['ai/any-density'],
    })).toThrow(/30\/30 reach/i);
    expect(() => planCAL002QualityCohortV2({
      authorityReceipt,
      reach: [reach('ai/any-density', { familyCount: 4 })],
      selectedRuleIds: ['ai/any-density'],
    })).toThrow(/five control families/i);
  });

  it('projects measured rows from canonical v1 metrics without elevating advisory rows', () => {
    const measured = metricRow('layout/gap-monopoly', 'contextual-quality');
    const advisory = metricRow('ai/any-density', 'contextual-quality', 'quality-advisory');
    const result = buildCAL002QualityDispositionV2({
      authorityReceipt: approvedAuthorityReceipt(),
      selectedRuleIds: ['layout/gap-monopoly', 'ai/any-density'],
      selectedMetrics: [measured, advisory],
      implementationCommitSha: COMMIT_SHA,
    });

    expect(result.disposition.selectedRuleIds).toEqual(['ai/any-density', 'layout/gap-monopoly']);
    expect(result.disposition.rows.find((row) => row.ruleId === measured.ruleId)).toMatchObject({
      measurementStatus: 'measured',
      sampleCounts: { findings: 30, controls: 30, cannotDetermine: 3 },
      runtimeOutcome: 'default-on',
      enabledByDefault: true,
      scoreEligible: true,
      gateEligible: true,
      repairSafety: 'finding-bound-only',
      metricsRowSha256: canonicalArtifact(measured).sha256,
    });
    expect(result.disposition.rows.find((row) => row.ruleId === measured.ruleId)?.uncertainty).toBeDefined();
    expect(result.disposition.rows.find((row) => row.ruleId === advisory.ruleId)).toMatchObject({
      measurementStatus: 'measured',
      runtimeOutcome: 'quality-advisory',
      enabledByDefault: false,
      scoreEligible: false,
      gateEligible: false,
      metricsRowSha256: canonicalArtifact(advisory).sha256,
    });
  });

  it.each([
    ['default-on', 'default-off'],
    ['quality-advisory', 'default-off'],
    ['default-off', 'default-on'],
  ] as const)(
    'rejects forged %s when the v1 reducer requires %s',
    (forgedOutcome, reducerOutcome) => {
      const reducerConsistent = metricRow('layout/gap-monopoly', 'contextual-quality', reducerOutcome);
      const forged: CAL002QualityMetricsRow = {
        ...reducerConsistent,
        outcome: forgedOutcome,
        claimCeiling: forgedOutcome === 'quality-advisory'
          ? 'review-target-utility'
          : 'quality-usefulness',
      };

      expect(() => buildCAL002QualityDispositionV2({
        authorityReceipt: approvedAuthorityReceipt(),
        selectedRuleIds: [forged.ruleId],
        selectedMetrics: [forged],
        implementationCommitSha: COMMIT_SHA,
      })).toThrow(/outcome.*reducer|reducer.*outcome/i);
    },
  );

  it('preserves reducer-consistent insufficient rows and conservative v1 shortage outcomes', () => {
    const insufficient = metricRow('test/duplicate-setup', 'contextual-quality', 'insufficient-evidence');
    const shortage: CAL002QualityMetricsRow = {
      ...metricRow('layout/gap-monopoly', 'contextual-quality', 'default-on'),
      outcome: 'insufficient-evidence',
      claimCeiling: 'insufficient-evidence',
    };

    for (const metric of [insufficient, shortage]) {
      const row = buildCAL002QualityDispositionV2({
        authorityReceipt: approvedAuthorityReceipt(),
        selectedRuleIds: [metric.ruleId],
        selectedMetrics: [metric],
        implementationCommitSha: COMMIT_SHA,
      }).disposition.rows.find(({ ruleId }) => ruleId === metric.ruleId);

      expect(row).toMatchObject({
        runtimeOutcome: 'insufficient-evidence',
        enabledByDefault: false,
        scoreEligible: false,
        gateEligible: false,
        metricsRowSha256: canonicalArtifact(metric).sha256,
      });
    }
  });

  it('rejects statistical default-on, metrics outside the selection, duplicate metrics, and incomplete selections', () => {
    const authorityReceipt = approvedAuthorityReceipt();
    const statistical = metricRow('logic/heaps-deviation', 'statistical-review-utility');
    expect(() => buildCAL002QualityDispositionV2({
      authorityReceipt,
      selectedRuleIds: [statistical.ruleId],
      selectedMetrics: [statistical],
      implementationCommitSha: COMMIT_SHA,
    })).toThrow(/statistical.*default-on/i);

    const contextual = metricRow('layout/gap-monopoly', 'contextual-quality');
    expect(() => buildCAL002QualityDispositionV2({
      authorityReceipt,
      selectedRuleIds: [],
      selectedMetrics: [contextual],
      implementationCommitSha: COMMIT_SHA,
    })).toThrow(/unselected/i);
    expect(() => buildCAL002QualityDispositionV2({
      authorityReceipt,
      selectedRuleIds: [contextual.ruleId],
      selectedMetrics: [contextual, contextual],
      implementationCommitSha: COMMIT_SHA,
    })).toThrow(/duplicate/i);
    expect(() => buildCAL002QualityDispositionV2({
      authorityReceipt,
      selectedRuleIds: [contextual.ruleId],
      selectedMetrics: [],
      implementationCommitSha: COMMIT_SHA,
    })).toThrow(/missing.*metrics|metrics.*selection/i);
  });

  it('registers and strictly compiles the disposition schema, rejecting labels or Wilson fields on zero-label rows', () => {
    const index = JSON.parse(readFileSync(join(SCHEMA_DIR, 'index.json'), 'utf8')) as {
      schemas: { file: string; version: string }[];
    };
    expect(index.schemas[11]).toEqual({
      file: 'cal-002-quality-disposition-v2.schema.json',
      version: CAL002_QUALITY_DISPOSITION_VERSION,
    });
    const schema = JSON.parse(readFileSync(join(SCHEMA_DIR, 'cal-002-quality-disposition-v2.schema.json'), 'utf8'));
    const validate = new Ajv2020({ allErrors: true, strict: true }).compile(schema);
    const disposition = buildCAL002QualityDispositionV2({
      authorityReceipt: approvedAuthorityReceipt(),
      selectedMetrics: [],
      implementationCommitSha: COMMIT_SHA,
    }).disposition;
    expect(validate(disposition), JSON.stringify(validate.errors)).toBe(true);
    expect(() => assertCAL002QualityDispositionV2(disposition)).not.toThrow();

    const withLabels = structuredClone(disposition);
    withLabels.rows[0] = { ...withLabels.rows[0]!, sampleCounts: { findings: 1, controls: 0, cannotDetermine: 0 } };
    expect(validate(withLabels), JSON.stringify(validate.errors)).toBe(false);
    expect(() => assertCAL002QualityDispositionV2(withLabels)).toThrow(/not-requested|zero/i);

    const withWilson = structuredClone(disposition);
    withWilson.rows[0] = {
      ...withWilson.rows[0]!,
      uncertainty: {
        findingUseful: { lower: 0, upper: 1 },
        controlUseful: { lower: 0, upper: 1 },
      },
    };
    expect(validate(withWilson), JSON.stringify(validate.errors)).toBe(false);
    expect(() => assertCAL002QualityDispositionV2(withWilson)).toThrow(/uncertainty|Wilson|zero/i);

    const measuredDisposition = buildCAL002QualityDispositionV2({
      authorityReceipt: approvedAuthorityReceipt(),
      selectedRuleIds: ['layout/gap-monopoly'],
      selectedMetrics: [metricRow('layout/gap-monopoly', 'contextual-quality')],
      implementationCommitSha: COMMIT_SHA,
    }).disposition;
    expect(validate(measuredDisposition), JSON.stringify(validate.errors)).toBe(true);
    const wrongRepair = structuredClone(measuredDisposition);
    const measuredIndex = wrongRepair.rows.findIndex((row) => row.ruleId === 'layout/gap-monopoly');
    wrongRepair.rows[measuredIndex] = { ...wrongRepair.rows[measuredIndex]!, repairSafety: 'no-safe-repair' };
    expect(validate(wrongRepair), JSON.stringify(validate.errors)).toBe(false);
    expect(() => assertCAL002QualityDispositionV2(wrongRepair)).toThrow(/repairSafety/i);
  });
});
