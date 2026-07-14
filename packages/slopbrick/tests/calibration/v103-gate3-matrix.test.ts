import Ajv from 'ajv/dist/2020.js';
import { createHash } from 'node:crypto';
import { mkdtempSync, readFileSync, readdirSync, rmSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  isCalibrationCoverageV103,
  isCalibrationFailureV103,
  isCalibrationObservationV103,
} from '@usebrick/core';

import { computeV103Metrics, type V103MetricObservation } from '../../src/calibration/v103/metrics';
import { materializeV103Scan } from '../../src/calibration/v103/scan-run';
import { persistV103ScanArtifacts } from '../../src/calibration/v103/persist-scan';
import { runV103Scan } from '../../src/calibration/v103/run-scan';
import { scanSelectedV103 } from '../../src/calibration/v103/selected-scanner';
import { createV103WorkerInvoker } from '../../src/calibration/v103/worker-invoker';

const CORE_ROOT = fileURLToPath(new URL('../../../core/', import.meta.url));
const SCHEMA_ROOT = join(CORE_ROOT, 'schemas', 'v1');
const TEMP_DIRS: string[] = [];

afterEach(() => {
  while (TEMP_DIRS.length > 0) rmSync(TEMP_DIRS.pop()!, { recursive: true, force: true });
});

function sha256(value: string): string {
  return createHash('sha256').update(value, 'utf8').digest('hex');
}

function selectedRecord(
  fileId: string,
  label: 'verified_ai' | 'verified_human',
  contentSha256: string,
) {
  return {
    fileId,
    sourceId: fileId,
    repositoryId: `${fileId}-repo`,
    familyId: `${fileId}-family`,
    commitSha: 'a'.repeat(40),
    normalizedPath: 'src/sample.ts',
    contentSha256,
    language: 'typescript',
    stratum: 'production',
    label,
    tier: 'gold',
    split: 'test',
    selectionKey: fileId,
    status: 'selected' as const,
  };
}

function schemaValidator(name: string) {
  const ajv = new Ajv({ allErrors: true, strict: true });
  return ajv.compile(JSON.parse(readFileSync(join(SCHEMA_ROOT, name), 'utf8')) as object);
}

describe('v10.3 Gate 3 edge matrix', () => {
  it('passes a filesystem path containing spaces only to the execution invoker', async () => {
    const executionPath = '/tmp/v10.3 fixture/checkout/src/file with spaces.ts';
    let seenPath: string | undefined;
    const result = await scanSelectedV103({
      repositoryId: 'fixture-repo',
      commitSha: 'a'.repeat(40),
      normalizedPath: 'src/file with spaces.ts',
      contentSha256: 'b'.repeat(64),
    }, {}, {
      timeoutMs: 10,
      includeRules: ['ai/comment-ratio'],
      excludeRules: [],
      resolver: async () => ({
        normalizedPath: 'src/file with spaces.ts',
        localPath: executionPath,
        bytes: Buffer.from('fixture'),
      }),
      invoker: async (input) => {
        seenPath = input.filePath;
        return { exitCode: 0, json: { ok: true, issues: [] } };
      },
    });

    expect(result).toEqual({ kind: 'success', findingsCount: 0 });
    expect(seenPath).toBe(executionPath);
    expect(JSON.stringify(result)).not.toContain(executionPath);
  });

  it('keeps zero-cell rates finite and distinguishes a smoothed zero FPR', () => {
    const observations: readonly V103MetricObservation[] = [
      {
        version: 'v10.3', runId: 'zero-cell-fixture', fileId: 'ai-1', repositoryId: 'ai-repo',
        familyId: 'ai-family', language: 'typescript', polarity: 'verified_ai',
        status: 'success_findings', findingsCount: 1,
        ruleEvidence: [{ ruleId: 'ai/signal', category: 'ai', aiSpecific: true, severity: 'high', count: 1 }],
      },
      {
        version: 'v10.3', runId: 'zero-cell-fixture', fileId: 'human-1', repositoryId: 'human-repo',
        familyId: 'human-family', language: 'typescript', polarity: 'verified_human',
        status: 'success_zero', findingsCount: 0,
      },
    ];
    const result = computeV103Metrics({
      observations,
      ruleCatalog: [{ ruleId: 'ai/signal', aiSpecific: true }],
      eligibleFileIdsByPolarity: { verified_ai: ['ai-1'], verified_human: ['human-1'] },
    });

    expect(result.status).toBe('available');
    if (result.status !== 'available') return;
    const metric = result.rules[0]!;
    expect(metric).toMatchObject({ tp: 1, fp: 0, p: 1, n: 1, recall: 1, fpr: 0 });
    expect(Number.isFinite(metric.lrPlus)).toBe(true);
    expect(metric.lrPlus).toBeGreaterThan(1);
    expect(metric.balancedPpv).toBe(1);
    expect(metric.priorPpv).toBe(1);
  });

  it('keeps the asymmetric zero-TP/high-FP cell finite and directional', () => {
    const observations: readonly V103MetricObservation[] = [
      {
        version: 'v10.3', runId: 'inverse-cell-fixture', fileId: 'ai-1', repositoryId: 'ai-repo',
        familyId: 'ai-family', language: 'typescript', polarity: 'verified_ai',
        status: 'success_zero', findingsCount: 0,
      },
      {
        version: 'v10.3', runId: 'inverse-cell-fixture', fileId: 'human-1', repositoryId: 'human-repo',
        familyId: 'human-family', language: 'typescript', polarity: 'verified_human',
        status: 'success_findings', findingsCount: 1,
        ruleEvidence: [{ ruleId: 'ai/signal', category: 'ai', aiSpecific: true, severity: 'high', count: 1 }],
      },
    ];
    const result = computeV103Metrics({
      observations,
      ruleCatalog: [{ ruleId: 'ai/signal', aiSpecific: true }],
      eligibleFileIdsByPolarity: { verified_ai: ['ai-1'], verified_human: ['human-1'] },
    });

    expect(result.status).toBe('available');
    if (result.status !== 'available') return;
    const metric = result.rules[0]!;
    expect(metric).toMatchObject({ tp: 0, fp: 1, p: 1, n: 1, recall: 0, fpr: 1, balancedPpv: 0, priorPpv: 0 });
    expect(Number.isFinite(metric.lrPlus)).toBe(true);
    expect(metric.lrPlus).toBeLessThan(1);
  });

  it('validates the persisted observation, failure, and coverage bytes with Core schemas', async () => {
    const directory = mkdtempSync(join(tmpdir(), 'v103-schema-matrix-'));
    TEMP_DIRS.push(directory);
    const records = [
      selectedRecord('ai-file', 'verified_ai', 'a'.repeat(64)),
      selectedRecord('human-file', 'verified_human', 'b'.repeat(64)),
    ];
    const evidence = materializeV103Scan('schema-fixture', records, [
      {
        fileId: 'ai-file',
        status: 'success_findings',
        findingsCount: 1,
        ruleEvidence: [{ ruleId: 'ai/signal', category: 'ai', aiSpecific: true, severity: 'high', count: 1 }],
      },
      { fileId: 'human-file', status: 'timeout' },
    ]);

    await persistV103ScanArtifacts(directory, evidence);
    const observationValidator = schemaValidator('calibration-observation.schema.json');
    const failureValidator = schemaValidator('calibration-failure.schema.json');
    const coverageValidator = schemaValidator('calibration-coverage.schema.json');
    const observations = readFileSync(join(directory, 'observations.jsonl'), 'utf8')
      .trimEnd().split('\n').map((line) => JSON.parse(line) as unknown);
    const failures = readFileSync(join(directory, 'failures.jsonl'), 'utf8')
      .trimEnd().split('\n').map((line) => JSON.parse(line) as unknown);
    const coverage = JSON.parse(readFileSync(join(directory, 'coverage.json'), 'utf8')) as unknown;

    expect(observations).toHaveLength(2);
    expect(failures).toHaveLength(1);
    for (const observation of observations) {
      expect(observationValidator(observation), JSON.stringify(observationValidator.errors)).toBe(true);
      expect(isCalibrationObservationV103(observation)).toBe(true);
    }
    for (const failure of failures) {
      expect(failureValidator(failure), JSON.stringify(failureValidator.errors)).toBe(true);
      expect(isCalibrationFailureV103(failure)).toBe(true);
    }
    expect(coverageValidator(coverage), JSON.stringify(coverageValidator.errors)).toBe(true);
    expect(isCalibrationCoverageV103(coverage)).toBe(true);
  });

  it('keeps telemetry, flywheel, baseline, and AGENTS sidecars untouched during calibration execution', async () => {
    const checkout = mkdtempSync(join(tmpdir(), 'v103-sidecar-matrix-'));
    const runDirectory = join(checkout, 'run');
    TEMP_DIRS.push(checkout);
    mkdirSync(runDirectory, { recursive: true });
    mkdirSync(join(checkout, 'src'), { recursive: true });
    const source = 'export const answer = 42;\n';
    writeFileSync(join(checkout, 'src', 'sample.ts'), source);
    const sidecars: Record<string, string> = {
      'AGENTS.md': '# fixture\n<!-- slopbrick:begin:v3 -->\nold\n<!-- slopbrick:end:v3 -->\n',
      '.slopbrick/cache/baseline.json': '{"version":"fixture-baseline"}\n',
      '.slopbrick/structure.json': '{"runs":[]}\n',
      '.slopbrick/flywheel/scans.jsonl': '{"fixture":true}\n',
      '.slopbrick/flywheel/state.json': '{"autoTuned":[],"autoRelaxed":[]}\n',
    };
    for (const [relativePath, contents] of Object.entries(sidecars)) {
      const path = join(checkout, relativePath);
      mkdirSync(join(path, '..'), { recursive: true });
      writeFileSync(path, contents);
    }
    const before = new Map(Object.keys(sidecars).map((relativePath) => [
      relativePath,
      readFileSync(join(checkout, relativePath), 'utf8'),
    ]));
    const ai = selectedRecord('ai-file', 'verified_ai', sha256(source));
    const human = selectedRecord('human-file', 'verified_human', sha256(source));
    const checkoutMap = {
      version: 'v10.3' as const,
      runId: 'sidecar-fixture',
      entries: [
        { repositoryId: ai.repositoryId, commitSha: ai.commitSha, checkoutPath: checkout },
        { repositoryId: human.repositoryId, commitSha: human.commitSha, checkoutPath: checkout },
      ],
    };

    await runV103Scan({
      directory: runDirectory,
      runId: 'sidecar-fixture',
      records: [ai, human],
      checkoutMap,
      chunkSize: 2,
      timeoutMs: 100,
      retryTimeoutMs: 200,
      includeRules: [],
      excludeRules: [],
      invoker: async () => ({ exitCode: 0, json: { ok: true, issues: [] } }),
    });

    expect(new Map(Object.keys(sidecars).map((relativePath) => [
      relativePath,
      readFileSync(join(checkout, relativePath), 'utf8'),
    ]))).toEqual(before);
    expect(readdirSync(runDirectory).sort()).toEqual([
      'coverage.json',
      'failures.jsonl',
      'observations.jsonl',
    ]);
    expect(readFileSync(join(checkout, 'AGENTS.md'), 'utf8')).toContain('old');
  });

  it('runs the bundled worker through the verified checkout boundary without leaking paths', async () => {
    const checkout = mkdtempSync(join(tmpdir(), 'v103-real-worker-'));
    const runDirectory = join(checkout, 'run');
    TEMP_DIRS.push(checkout);
    mkdirSync(join(checkout, 'src'), { recursive: true });
    mkdirSync(runDirectory, { recursive: true });
    const source = 'export const answer = 42;\n';
    writeFileSync(join(checkout, 'src', 'sample.ts'), source);
    const ai = selectedRecord('real-ai-file', 'verified_ai', sha256(source));
    const human = selectedRecord('real-human-file', 'verified_human', sha256(source));
    const checkoutMap = {
      version: 'v10.3' as const,
      runId: 'real-worker-fixture',
      entries: [
        { repositoryId: ai.repositoryId, commitSha: ai.commitSha, checkoutPath: checkout },
        { repositoryId: human.repositoryId, commitSha: human.commitSha, checkoutPath: checkout },
      ],
    };

    const evidence = await runV103Scan({
      directory: runDirectory,
      runId: 'real-worker-fixture',
      records: [ai, human],
      checkoutMap,
      chunkSize: 1,
      timeoutMs: 10_000,
      retryTimeoutMs: 20_000,
      includeRules: [],
      excludeRules: [],
      invoker: createV103WorkerInvoker(),
    });

    expect(evidence.observations).toHaveLength(2);
    expect(evidence.observations.every((observation) =>
      observation.status === 'success_zero' || observation.status === 'success_findings')).toBe(true);
    expect(JSON.stringify(evidence)).not.toContain(checkout);
    expect(readdirSync(runDirectory).sort()).toEqual(['coverage.json', 'failures.jsonl', 'observations.jsonl']);
  });
});
