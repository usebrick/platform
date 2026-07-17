import { createHash } from 'node:crypto';
import { mkdir, readFile, realpath, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import packageJson from '../../package.json' with { type: 'json' };

import { DEFAULT_CONFIG } from '../../src/config/defaults';
import { hashConfig } from '../../src/engine/cache';
import { scanFile } from '../../src/engine/worker';
import { RuleRegistry } from '../../src/rules/registry';
import {
  bindMendeleyCorpusV1SourceRows,
  type CorpusV1SourceBindingResult,
} from '../../src/calibration/corpus-v1/source-binding';
import {
  projectMendeleyCorpusV1CandidateManifest,
  type CorpusV1CandidateManifestResult,
} from '../../src/calibration/corpus-v1/manifest';
import { planCorpusV1, type CorpusV1PlanResult } from '../../src/calibration/corpus-v1/plan';
import {
  buildCorpusV1Smoke,
  type CorpusV1SmokeResult,
} from '../../src/calibration/corpus-v1/smoke';
import {
  projectCorpusV1EligibleRows,
  type CorpusV1EligibleProjectionResult,
} from '../../src/calibration/corpus-v1/eligible';
import {
  buildCAL001HoldoutReceipt,
  type CAL001HoldoutInput,
} from '../../src/calibration/corpus-v1/calibration-holdout';
import { CAL001_FROZEN_INPUT_HASHES } from '../../src/calibration/corpus-v1/calibration-inputs';
import { buildCorpusV1Observation } from '../../src/calibration/corpus-v1/scan-observation';
import {
  parseProjectionIndex,
  corpusV1ProjectionRoot,
  readCorpusV1Unit,
} from './corpus-v1-source';
import type { V103MetricObservation } from '../../src/calibration/v103/metrics';

const SOURCE_PROJECTION_MANIFEST = 'sources/benchmarks/humanvsai-code-dataset/projection-v1/projection-manifest.jsonl';
const COMMIT_SHA = /^[a-f0-9]{40}$/u;

interface Arguments {
  readonly corpusRoot: string;
  readonly protocolPath: string;
  readonly outPath: string;
  readonly metricsPath: string;
  readonly implementationCommitSha: string;
  readonly runId: string;
}

function sha256(value: Uint8Array | string): string {
  return createHash('sha256').update(value).digest('hex');
}

function parseArgs(argv: readonly string[]): Arguments {
  const values: Record<string, string> = {};
  const forwarded = argv[0] === '--' ? argv.slice(1) : argv;
  for (let index = 0; index < forwarded.length; index += 2) {
    const flag = forwarded[index];
    const value = forwarded[index + 1];
    if (!flag?.startsWith('--') || value === undefined || value.startsWith('--') || values[flag] !== undefined) {
      throw new Error('Expected unique --flag value pairs');
    }
    values[flag] = value;
  }
  const corpusRoot = values['--corpus-root'];
  const outPath = values['--out'];
  const metricsPath = values['--metrics-out'];
  const implementationCommitSha = values['--implementation-commit-sha'];
  if (!corpusRoot || !outPath || !metricsPath || !implementationCommitSha) {
    throw new Error('Usage: --corpus-root <path> --out <receipt.json> --metrics-out <metrics.json> --implementation-commit-sha <40-hex-sha> [--protocol <path>] [--run-id <id>]');
  }
  if (!COMMIT_SHA.test(implementationCommitSha)) throw new Error('implementation commit SHA must be 40 lowercase hexadecimal characters');
  const protocolPath = values['--protocol'] ?? 'docs/execution/evidence/CAL-001-protocol.md';
  const runId = values['--run-id'] ?? 'cal-001-v1-holdout';
  if (!/^[a-z0-9][a-z0-9._-]{0,127}$/u.test(runId)) throw new Error('run ID is invalid');
  if (resolve(outPath) === resolve(metricsPath)) throw new Error('--out and --metrics-out must be different files');
  return { corpusRoot, protocolPath, outPath, metricsPath, implementationCommitSha, runId };
}

async function buildCorpusArtifacts(corpusRoot: string): Promise<{
  readonly candidate: CorpusV1CandidateManifestResult;
  readonly plan: CorpusV1PlanResult;
  readonly sourceBinding: CorpusV1SourceBindingResult;
  readonly smoke: CorpusV1SmokeResult;
  readonly eligible: CorpusV1EligibleProjectionResult;
}> {
  const candidate = await projectMendeleyCorpusV1CandidateManifest({ corpusRoot });
  const plan = planCorpusV1(candidate.rows);
  const sourceBinding = await bindMendeleyCorpusV1SourceRows({ corpusRoot });
  const smoke = buildCorpusV1Smoke({ candidate, plan, sourceBinding });
  const eligible = projectCorpusV1EligibleRows({ candidate, plan, sourceBinding, smoke });
  return { candidate, plan, sourceBinding, smoke, eligible };
}

function assertFrozenInputHashes(actual: typeof CAL001_FROZEN_INPUT_HASHES): void {
  for (const [key, expected] of Object.entries(CAL001_FROZEN_INPUT_HASHES)) {
    if (actual[key as keyof typeof CAL001_FROZEN_INPUT_HASHES] !== expected) throw new Error(`frozen CAL-001 input changed: ${key}`);
  }
}

async function writeNew(path: string, contents: string): Promise<void> {
  await mkdir(dirname(resolve(path)), { recursive: true });
  await writeFile(path, contents, { encoding: 'utf8', flag: 'wx' });
}

async function run(args: Arguments): Promise<void> {
  const corpusRoot = await realpath(resolve(args.corpusRoot));
  const protocolBytes = await readFile(resolve(args.protocolPath));
  const protocolSha256 = sha256(protocolBytes);
  if (protocolSha256 !== CAL001_FROZEN_INPUT_HASHES.protocolSha256) throw new Error('CAL-001 protocol bytes do not match the frozen protocol hash');

  const artifacts = await buildCorpusArtifacts(corpusRoot);
  const actualInputHashes = {
    protocolSha256,
    candidateManifestSha256: artifacts.candidate.manifestSha256,
    planSha256: artifacts.plan.planSha256,
    sourceBindingReceiptSha256: artifacts.sourceBinding.receiptSha256,
    eligibleManifestSha256: artifacts.eligible.manifestSha256,
    eligibleReceiptSha256: artifacts.eligible.receiptSha256,
    smokeManifestSha256: artifacts.smoke.manifestSha256,
    smokeReceiptSha256: artifacts.smoke.receiptSha256,
  } as const;
  assertFrozenInputHashes(actualInputHashes);

  const rows = artifacts.eligible.manifest.rows.map((row) => {
    if (row.status !== 'eligible' || row.split === 'quarantine') throw new Error('eligible projection contains a non-eligible row');
    return {
      unitId: row.unitId,
      sourceRecordId: row.sourceRecordId,
      sourceId: row.sourceId,
      sourceVersion: row.sourceVersion,
      label: row.label,
      contentSha256: row.contentSha256,
      normalizedSha256: row.normalizedSha256,
      familyKey: row.familyKey,
      language: row.language,
      split: row.split,
      byteCount: row.byteCount,
    };
  });
  const projectionBytes = await readFile(resolve(corpusRoot, SOURCE_PROJECTION_MANIFEST));
  const projectionIndex = parseProjectionIndex(projectionBytes);
  const projectionRoot = await corpusV1ProjectionRoot(corpusRoot);
  const config = { ...DEFAULT_CONFIG, telemetry: false, projectMemory: false, rules: { ...DEFAULT_CONFIG.rules } };
  const configHash = hashConfig(config);
  const registry = new RuleRegistry();
  registry.loadBuiltins();
  const observations: V103MetricObservation[] = [];
  const previousCache = process.env.SLOP_AUDIT_CACHE;
  process.env.SLOP_AUDIT_CACHE = '0';
  try {
    for (const row of rows) {
      const projection = projectionIndex.get(row.sourceRecordId);
      if (projection === undefined || projection.contentSha256 !== row.contentSha256) throw new Error('eligible row is not bound to the projection index');
      const unit = await readCorpusV1Unit(projectionRoot, projection);
      if (unit.bytes.byteLength !== row.byteCount) throw new Error(`eligible row byte count changed: ${row.unitId}`);
      const result = await scanFile(unit.path, config, registry, corpusRoot);
      observations.push(buildCorpusV1Observation(row, args.runId, result));
    }
  } finally {
    if (previousCache === undefined) delete process.env.SLOP_AUDIT_CACHE;
    else process.env.SLOP_AUDIT_CACHE = previousCache;
  }

  const holdoutInput: CAL001HoldoutInput = {
    protocolVersion: 'CAL-001-v1',
    runId: args.runId,
    implementationCommitSha: args.implementationCommitSha,
    packageVersion: packageJson.version,
    configHash,
    inputHashes: actualInputHashes,
    workerCount: 1,
    rows,
    observations,
    ruleCatalog: registry.all().map((rule) => ({ ruleId: rule.id, aiSpecific: rule.aiSpecific })),
  };
  const result = buildCAL001HoldoutReceipt(holdoutInput);
  await writeNew(args.metricsPath, `${result.metricsJson}\n`);
  await writeNew(args.outPath, `${result.receiptJson}\n`);
  process.stdout.write(`${JSON.stringify({
    ok: true,
    stage: 'cal-001-v1-holdout',
    receiptSha256: result.receiptSha256,
    metricsSha256: result.metricsSha256,
    population: result.receipt.population,
    coverage: result.receipt.coverage,
    leakage: result.receipt.leakage,
    metrics: result.receipt.metrics,
    evaluation: result.receipt.evaluation,
    admitted: result.receipt.admitted,
  })}\n`);
}

try {
  await run(parseArgs(process.argv.slice(2)));
} catch (error) {
  const message = error instanceof Error ? error.message : 'CAL-001 holdout failed';
  process.stderr.write(`CAL-001 holdout: ${message}\n`);
  process.exitCode = 2;
}
