import { describe, expect, it } from 'vitest';

import { executeSelectedV103 } from '../../src/calibration/v103/execute-selected';
import { computeV103Metrics, type V103MetricObservation } from '../../src/calibration/v103/metrics';
import type { SelectionRecord } from '../../src/calibration/v103/selection';

function smokeRecord(index: number, label: 'verified_ai' | 'verified_human'): SelectionRecord {
  const prefix = label === 'verified_ai' ? 'ai' : 'human';
  return {
    fileId: `${prefix}-${String(index).padStart(3, '0')}`,
    sourceId: `${prefix}-source-${index}`,
    repositoryId: `${prefix}-repo-${index % 10}`,
    familyId: `${prefix}-family-${index % 5}`,
    commitSha: 'a'.repeat(40),
    normalizedPath: `src/${prefix}-${index}.ts`,
    contentSha256: 'b'.repeat(64),
    language: 'typescript',
    stratum: 'production',
    label,
    tier: 'gold',
    split: 'test',
    selectionKey: `${prefix}-${index}`,
    status: 'selected',
  };
}

function smokeRecords(): SelectionRecord[] {
  return [
    ...Array.from({ length: 100 }, (_, index) => smokeRecord(index, 'verified_ai')),
    ...Array.from({ length: 100 }, (_, index) => smokeRecord(index, 'verified_human')),
  ];
}

function metricSmokeObservations(): V103MetricObservation[] {
  const makeArm = (label: 'verified_ai' | 'verified_human'): V103MetricObservation[] => Array.from({ length: 100 }, (_, index) => {
    const fileId = `${label === 'verified_ai' ? 'ai' : 'human'}-metric-${String(index).padStart(3, '0')}`;
    const successfulFindings = index % 2 === 1;
    const fires = label === 'verified_ai' ? index % 3 === 0 : index % 5 === 0;
    return {
      version: 'v10.3',
      runId: 'v103-metric-smoke',
      fileId,
      repositoryId: `${label}-repo-${index % 10}`,
      familyId: `${label}-family-${index % 5}`,
      language: index % 2 === 0 ? 'typescript' : 'javascript',
      polarity: label,
      status: successfulFindings ? 'success_findings' : 'success_zero',
      ...(successfulFindings
        ? {
          findingsCount: 1,
          ruleEvidence: [{
            ruleId: fires ? 'ai/comment-ratio' : 'quality/noise',
            category: fires ? 'ai' as const : 'security' as const,
            aiSpecific: fires,
            severity: 'medium' as const,
            count: 1,
          }],
        }
        : { findingsCount: 0 }),
    };
  });
  return [...makeArm('verified_ai'), ...makeArm('verified_human')];
}

function runMetricSmoke() {
  const observations = metricSmokeObservations();
  return computeV103Metrics({
    observations,
    ruleCatalog: [
      { ruleId: 'ai/comment-ratio', aiSpecific: true },
      { ruleId: 'quality/noise', aiSpecific: false },
      { ruleId: 'ai/zero-fire', aiSpecific: true },
    ],
    eligibleFileIdsByPolarity: {
      verified_ai: observations.filter((observation) => observation.polarity === 'verified_ai').map((observation) => observation.fileId),
      verified_human: observations.filter((observation) => observation.polarity === 'verified_human').map((observation) => observation.fileId),
    },
  });
}

async function runSmoke() {
  return executeSelectedV103('v103-smoke-fixture', smokeRecords(), {
    chunkSize: 25,
    timeoutMs: 10,
    retryTimeoutMs: 20,
    scan: async (record) => {
      // Keep the failure cases deterministic and explicit: the smoke proves
      // that timeout/crash terminal states are accounted for rather than
      // silently dropped. The remaining 98 files in each arm succeed.
      if (record.fileId.endsWith('-098')) return { kind: 'timeout' };
      if (record.fileId.endsWith('-099')) throw new Error('synthetic scanner crash');
      const index = Number(record.fileId.slice(-3));
      return { kind: 'success', findingsCount: index % 3 === 0 ? 0 : 2 };
    },
  });
}

describe('v10.3 deterministic 100+100 smoke contract', () => {
  it('accounts for every selected file and preserves terminal failures', async () => {
    const result = await runSmoke();

    expect(result.coverage).toMatchObject({
      requested: 200,
      successful: 196,
      excluded: 0,
      failed: 4,
    });
    expect(result.observations).toHaveLength(200);
    expect(new Set(result.observations.map((observation) => observation.fileId)).size).toBe(200);
    expect(result.failures).toHaveLength(4);
    expect(result.verification).toMatchObject({ ok: true });
  });

  it('produces byte-equivalent machine evidence across repeated smoke runs', async () => {
    const first = await runSmoke();
    const second = await runSmoke();

    expect(first.observations).toEqual(second.observations);
    expect(first.failures).toEqual(second.failures);
    expect(first.coverage).toEqual(second.coverage);
    expect(first.verification).toEqual(second.verification);
  });

  it('covers unequal polarity arms, zero-fire files, and serial/worker equivalence', async () => {
    const records = [
      ...Array.from({ length: 3 }, (_, index) => smokeRecord(index, 'verified_ai')),
      ...Array.from({ length: 7 }, (_, index) => smokeRecord(index + 20, 'verified_human')),
    ];
    const run = (workerCount: number) => executeSelectedV103('v103-unequal-fixture', records, {
      chunkSize: 4,
      workerCount,
      timeoutMs: 10,
      retryTimeoutMs: 20,
      scan: async (record) => ({
        kind: 'success' as const,
        findingsCount: record.label === 'verified_ai' && record.fileId.endsWith('-000') ? 1 : 0,
      }),
    });

    const serial = await run(1);
    const parallel = await run(3);
    expect(serial.coverage).toMatchObject({ requested: 10, successful: 10, excluded: 0, failed: 0 });
    expect(serial.observations.filter((observation) => observation.status === 'success_findings')).toHaveLength(1);
    expect(serial.observations.filter((observation) => observation.status === 'success_zero')).toHaveLength(9);
    expect(parallel).toEqual(serial);
  });

  it('produces identical denominator-aware metrics for repeated 100/100 runs', () => {
    const first = runMetricSmoke();
    const second = runMetricSmoke();
    expect(first.status).toBe('available');
    expect(second).toEqual(first);
    expect(JSON.stringify(second)).not.toContain('timestamp');
    expect(JSON.stringify(second)).not.toContain('/Users/');
  });
});
