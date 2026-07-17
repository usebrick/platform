import { createHash } from 'node:crypto';
import { lstat, mkdir, readFile, realpath, stat, writeFile } from 'node:fs/promises';
import { dirname, isAbsolute, relative, resolve, sep } from 'node:path';
import packageJson from '../../package.json' with { type: 'json' };

import { DEFAULT_CONFIG } from '../../src/config/defaults';
import { hashConfig } from '../../src/engine/cache';
import { scanFile } from '../../src/engine/worker';
import { RuleRegistry } from '../../src/rules/registry';
import type { FileScanResult, Issue } from '../../src/types';
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
  buildCAL001SmokeReceipt,
  CAL001_PROTOCOL_VERSION,
  type CAL001SmokeInput,
} from '../../src/calibration/corpus-v1/calibration-smoke';
import type { V103MetricObservation, V103RuleEvidence } from '../../src/calibration/v103/metrics';

const SOURCE_PROJECTION_MANIFEST = 'sources/benchmarks/humanvsai-code-dataset/projection-v1/projection-manifest.jsonl';
const SOURCE_PROJECTION_ROOT = 'sources/benchmarks/humanvsai-code-dataset/projection-v1';
const FROZEN_INPUTS = {
  protocolSha256: 'd78ceb22bd2d3a2bc91676d93facd7003af6c1b8351fdf773139a138bd1f1528',
  candidateManifestSha256: 'c15d3cbc95f251b5a0514da14b3f8a90e26124fbfb7db5ce342a873635b383ac',
  planSha256: '9c4638526e9a4161d3e74f70197f0b25717439e6bd477bef98664a03c9a9219c',
  sourceBindingReceiptSha256: '47bd66907ec2efa67da718e0cfb38458151ca84d3cdedc941488fe4b001475ac',
  eligibleManifestSha256: '286134799c7f75837a7c292f0d18721d8da9263c25c041eef0ac4734801b52d8',
  eligibleReceiptSha256: '9f5274f57ed4adf9d1c1ef55205493e9a833abc86cb8e1ca2b332cd8c72d28ba',
  smokeManifestSha256: 'bdbcd43279077fa760ae3c99da05b953c38134022fa34626b69a6b6400be00de',
  smokeReceiptSha256: 'ccd74f7b9db49adc802c042df0d7b732d8284d2bbfc4e6ec39e6a1c001c60830',
} as const;

interface ProjectionIndexRow {
  readonly recordId: string;
  readonly relativePath: string;
  readonly contentSha256: string;
}

interface Arguments {
  readonly corpusRoot: string;
  readonly protocolPath: string;
  readonly outPath: string;
  readonly metricsPath: string;
  readonly implementationCommitSha: string;
  readonly runId: string;
}

const SHA256 = /^[a-f0-9]{64}$/u;
const COMMIT_SHA = /^[a-f0-9]{40}$/u;

function sha256(value: Uint8Array | string): string {
  return createHash('sha256').update(value).digest('hex');
}

function contained(root: string, child: string): boolean {
  const childRelative = relative(root, child);
  return childRelative !== ''
    && !isAbsolute(childRelative)
    && childRelative !== '..'
    && !childRelative.startsWith(`..${sep}`);
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
  const runId = values['--run-id'] ?? 'cal-001-v1-smoke';
  if (!/^[a-z0-9][a-z0-9._-]{0,127}$/u.test(runId)) throw new Error('run ID is invalid');
  if (resolve(outPath) === resolve(metricsPath)) throw new Error('--out and --metrics-out must be different files');
  return { corpusRoot, protocolPath, outPath, metricsPath, implementationCommitSha, runId };
}

function parseProjectionIndex(bytes: Buffer): Map<string, ProjectionIndexRow> {
  const rows = new Map<string, ProjectionIndexRow>();
  for (const [index, line] of bytes.toString('utf8').trimEnd().split('\n').entries()) {
    const value: unknown = JSON.parse(line);
    if (typeof value !== 'object' || value === null || Array.isArray(value)) throw new Error(`projection row ${index + 1} is not an object`);
    const row = value as Record<string, unknown>;
    if (typeof row.recordId !== 'string' || typeof row.relativePath !== 'string' || typeof row.contentSha256 !== 'string' || !SHA256.test(row.contentSha256)) {
      throw new Error(`projection row ${index + 1} has an invalid identity`);
    }
    if (isAbsolute(row.relativePath) || row.relativePath.split(/[\\/]/u).includes('..') || rows.has(row.recordId)) {
      throw new Error(`projection row ${index + 1} has an unsafe or duplicate path`);
    }
    rows.set(row.recordId, { recordId: row.recordId, relativePath: row.relativePath, contentSha256: row.contentSha256 });
  }
  return rows;
}

async function readUnit(corpusRoot: string, projection: ProjectionIndexRow): Promise<{ readonly path: string; readonly bytes: Buffer }> {
  const projectionRoot = await realpath(resolve(corpusRoot, SOURCE_PROJECTION_ROOT));
  const lexicalPath = resolve(projectionRoot, projection.relativePath);
  if (!contained(projectionRoot, lexicalPath)) throw new Error('selected source path escaped the projection root');
  const lexical = await lstat(lexicalPath);
  if (lexical.isSymbolicLink() || !lexical.isFile()) throw new Error('selected source unit is not a regular file');
  const path = await realpath(lexicalPath);
  if (!contained(projectionRoot, path)) throw new Error('selected source unit resolved outside the projection root');
  const metadata = await stat(path);
  if (!metadata.isFile()) throw new Error('selected source unit is not a file');
  const bytes = await readFile(path);
  if (sha256(bytes) !== projection.contentSha256) throw new Error('selected source unit hash changed');
  return { path, bytes };
}

function ruleEvidence(issues: readonly Issue[]): readonly V103RuleEvidence[] | undefined {
  const byRule = new Map<string, V103RuleEvidence>();
  for (const issue of issues) {
    const existing = byRule.get(issue.ruleId);
    if (existing === undefined) {
      byRule.set(issue.ruleId, {
        ruleId: issue.ruleId,
        category: issue.category,
        aiSpecific: issue.aiSpecific,
        severity: issue.severity,
        count: 1,
      });
    } else {
      if (existing.category !== issue.category || existing.aiSpecific !== issue.aiSpecific || existing.severity !== issue.severity) {
        throw new Error(`scanner emitted inconsistent evidence for ${issue.ruleId}`);
      }
      byRule.set(issue.ruleId, { ...existing, count: existing.count + 1 });
    }
  }
  if (byRule.size === 0) return undefined;
  return [...byRule.values()].sort((left, right) => left.ruleId.localeCompare(right.ruleId));
}

function observation(
  row: CorpusV1CandidateManifestResult['rows'][number],
  runId: string,
  result: FileScanResult,
): V103MetricObservation {
  const identity = {
    version: 'v10.3' as const,
    runId,
    fileId: row.unitId,
    repositoryId: row.sourceId,
    familyId: row.familyKey,
    language: row.language,
    polarity: row.label === 'positive' ? 'verified_ai' as const : 'verified_human' as const,
  };
  if (result.failureKind === 'parse' || (result.parseError !== undefined && result.failureKind === undefined)) {
    return { ...identity, status: 'parse_failure', failureCode: 'parse_failure' };
  }
  if (result.failureKind !== undefined) return { ...identity, status: 'scanner_failure', failureCode: result.failureKind };
  const evidence = ruleEvidence(result.issues);
  if (result.issues.length === 0) return { ...identity, status: 'success_zero', findingsCount: 0 };
  return { ...identity, status: 'success_findings', findingsCount: result.issues.length, ...(evidence === undefined ? {} : { ruleEvidence: evidence }) };
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

function assertFrozenInputHashes(actual: typeof FROZEN_INPUTS): void {
  for (const [key, expected] of Object.entries(FROZEN_INPUTS)) {
    if (actual[key as keyof typeof FROZEN_INPUTS] !== expected) throw new Error(`frozen CAL-001 input changed: ${key}`);
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
  if (protocolSha256 !== FROZEN_INPUTS.protocolSha256) throw new Error('CAL-001 protocol bytes do not match the frozen protocol hash');

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

  const projectionBytes = await readFile(resolve(corpusRoot, SOURCE_PROJECTION_MANIFEST));
  const projectionIndex = parseProjectionIndex(projectionBytes);
  const config = { ...DEFAULT_CONFIG, telemetry: false, projectMemory: false, rules: { ...DEFAULT_CONFIG.rules } };
  const configHash = hashConfig(config);
  const registry = new RuleRegistry();
  registry.loadBuiltins();
  const observations: V103MetricObservation[] = [];
  const previousCache = process.env.SLOP_AUDIT_CACHE;
  process.env.SLOP_AUDIT_CACHE = '0';
  try {
    for (const row of artifacts.smoke.manifest.rows) {
      const projection = projectionIndex.get(row.sourceRecordId);
      if (projection === undefined || projection.contentSha256 !== row.contentSha256) throw new Error('smoke row is not bound to the projection index');
      const unit = await readUnit(corpusRoot, projection);
      if (unit.bytes.byteLength !== row.byteCount) throw new Error('smoke row byte count changed');
      const result = await scanFile(unit.path, config, registry, corpusRoot);
      observations.push(observation(row, args.runId, result));
    }
  } finally {
    if (previousCache === undefined) delete process.env.SLOP_AUDIT_CACHE;
    else process.env.SLOP_AUDIT_CACHE = previousCache;
  }

  const smokeInput: CAL001SmokeInput = {
    protocolVersion: CAL001_PROTOCOL_VERSION,
    runId: args.runId,
    implementationCommitSha: args.implementationCommitSha,
    packageVersion: packageJson.version,
    configHash,
    inputHashes: actualInputHashes,
    workerCount: 1,
    observations,
    ruleCatalog: registry.all().map((rule) => ({ ruleId: rule.id, aiSpecific: rule.aiSpecific })),
    eligibleFileIdsByPolarity: {
      verified_ai: artifacts.smoke.manifest.rows.filter((row) => row.label === 'positive').map((row) => row.unitId),
      verified_human: artifacts.smoke.manifest.rows.filter((row) => row.label === 'negative').map((row) => row.unitId),
    },
  };
  const result = buildCAL001SmokeReceipt(smokeInput);
  await writeNew(args.metricsPath, `${result.metricsJson}\n`);
  await writeNew(args.outPath, `${result.receiptJson}\n`);
  process.stdout.write(`${JSON.stringify({
    ok: true,
    stage: 'cal-001-v1-smoke',
    receiptSha256: result.receiptSha256,
    metricsSha256: result.receipt.metrics.metricsSha256,
    selected: result.receipt.selected,
    coverage: result.receipt.coverage,
    metrics: result.receipt.metrics,
    admitted: result.receipt.admitted,
  })}\n`);
}

try {
  await run(parseArgs(process.argv.slice(2)));
} catch (error) {
  const message = error instanceof Error ? error.message : 'CAL-001 smoke failed';
  process.stderr.write(`CAL-001 smoke: ${message}\n`);
  process.exitCode = 2;
}
