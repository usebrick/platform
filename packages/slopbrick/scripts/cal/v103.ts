/**
 * Isolated v10.3 calibration control plane.
 *
 * This deliberately does not invoke the historical calibrator or scanner.
 * It validates provenance-backed manifests and produces/verifies the first
 * lossless artifact: a complete corpus-selection ledger.
 */
import { createHash } from 'node:crypto';
import { access, constants, mkdir, readFile, readdir, rename, rm, writeFile } from 'node:fs/promises';
import { basename, join } from 'node:path';
import { isCalibrationCorpusManifestV103, type SlopBrickV103CalibrationRunManifest } from '@usebrick/core';
import {
  buildSelection,
  renderSelectionJsonl,
  verifySelectionLedger,
} from '../../src/calibration/v103/selection';
import { canonicalCorpusManifestSha256, canonicalJson, canonicalSha256 } from '../../src/calibration/v103/canonical';
import { createV103RunManifest, verifyV103ExpectedSelection, verifyV103RunInputs, verifyV103SelectionBinding } from '../../src/calibration/v103/run-manifest';
import { planV103Chunks } from '../../src/calibration/v103/bisection';
import { verifyV103Observations } from '../../src/calibration/v103/observations';
import { createV103WorkerInvoker } from '../../src/calibration/v103/worker-invoker';
import { runV103Scan } from '../../src/calibration/v103/run-scan';
import { materializeSources } from '../../src/calibration/v103/materialize-sources';
import {
  buildV103UnavailableArtifactBundle,
  hashV103UpstreamArtifacts,
  isV103UnavailableArtifact,
  renderV103ReportLog,
  type V103UnavailableReason,
} from '../../src/calibration/v103/report-artifacts';
import type { SelectionLedger, SelectionRecord } from '../../src/calibration/v103/selection';

type Command = 'corpus:validate' | 'select' | 'verify' | 'scan' | 'run:init' | 'cal:materialize' | 'cal:report';

type LegacyManifestSource = {
  readonly kind: 'legacy_path';
  readonly manifestPath: string;
  readonly expectedManifestSha256: string;
};

type AdmissionManifestSource = {
  readonly kind: 'admission_ref';
  readonly root: string;
  readonly manifestId: string;
  readonly manifestRefJson: string;
  readonly expectedManifestSha256: string;
};

/** Closed source boundary. Admission is intentionally reserved until Task 9B. */
type ManifestSource = LegacyManifestSource | AdmissionManifestSource;

interface Arguments {
  readonly command: Command;
  readonly manifestSource?: ManifestSource;
  readonly manifest?: string;
  readonly seed?: string;
  readonly out?: string;
  readonly run?: string;
  readonly resume?: boolean;
  readonly draft?: string;
  readonly stage?: string;
  readonly checkoutMap?: string;
  readonly registry?: string;
  readonly signalTable?: string;
  readonly config?: string;
  readonly runId?: string;
  readonly cache?: string;
  readonly baseCheckoutMap?: string;
  readonly network?: 'deny' | 'allow';
  readonly allowHosts?: string;
}

class UsageError extends Error {}

const EXPECTED_SHA256 = /^[a-f0-9]{64}$/;

function parseManifestSource(values: Readonly<Record<string, string>>): ManifestSource {
  const hasManifest = values['--manifest'] !== undefined;
  const expectedManifestSha256 = values['--expected-manifest-sha256'];
  const admissionFields = ['--root', '--manifest-id', '--manifest-ref-json'] as const;
  const hasAdmission = admissionFields.some((flag) => values[flag] !== undefined);
  if (hasAdmission) {
    if (hasManifest) throw new UsageError('Manifest source arguments cannot mix legacy and admission inputs');
    const root = values['--root'];
    const manifestId = values['--manifest-id'];
    const manifestRefJson = values['--manifest-ref-json'];
    if (!root || !manifestId || !manifestRefJson || !expectedManifestSha256 || !EXPECTED_SHA256.test(expectedManifestSha256)) {
      throw new UsageError('Admission manifest source requires --root, --manifest-id, --manifest-ref-json, and a lowercase expected SHA-256');
    }
    return { kind: 'admission_ref', root, manifestId, manifestRefJson, expectedManifestSha256 };
  }
  const manifestPath = values['--manifest'];
  if (!manifestPath || !expectedManifestSha256) throw new UsageError('Legacy manifest source requires --manifest and --expected-manifest-sha256');
  if (!EXPECTED_SHA256.test(expectedManifestSha256)) throw new UsageError('--expected-manifest-sha256 must be 64 lowercase hexadecimal characters');
  return { kind: 'legacy_path', manifestPath, expectedManifestSha256 };
}

function parseArgs(argv: readonly string[]): Arguments {
  const [requestedCommand, ...rest] = argv;
  const command = requestedCommand === 'materialize' ? 'cal:materialize'
    : requestedCommand === 'init' ? 'run:init'
      : requestedCommand;
  if (command !== 'corpus:validate' && command !== 'select' && command !== 'verify' && command !== 'scan' && command !== 'run:init' && command !== 'cal:materialize' && command !== 'cal:report') {
    throw new UsageError('Expected one of: corpus:validate, select, verify, scan, run:init, cal:materialize, cal:report');
  }
  const values: Record<string, string> = {};
  const booleanFlags = new Set(['--resume']);
  // pnpm forwards the conventional separator when a package script is
  // invoked as `cal:report -- --run ...`; it is not a calibration flag.
  const forwarded = rest[0] === '--' ? rest.slice(1) : rest;
  for (let index = 0; index < forwarded.length;) {
    const flag = forwarded[index];
    if (!flag?.startsWith('--') || values[flag] !== undefined) {
      throw new UsageError('Expected unique --flag value pairs');
    }
    if (booleanFlags.has(flag)) {
      values[flag] = 'true';
      index += 1;
      continue;
    }
    const value = forwarded[index + 1];
    if (value === undefined || value.startsWith('--')) {
      throw new UsageError('Expected unique --flag value pairs');
    }
    values[flag] = value;
    index += 2;
  }
  const sourceFlags = ['--manifest', '--expected-manifest-sha256', '--root', '--manifest-id', '--manifest-ref-json'];
  const inputFlags = ['--registry', '--signal-table', '--config'] as const;
  const allowed = command === 'corpus:validate' ? new Set(sourceFlags)
    : command === 'select' ? new Set([...sourceFlags, '--seed', '--out'])
      : command === 'verify' ? new Set(['--run', '--stage', '--checkout-map', ...inputFlags])
        : command === 'scan' ? new Set(['--run', '--checkout-map', '--resume', ...inputFlags])
          : command === 'run:init' ? new Set(['--run', '--draft', '--checkout-map', ...inputFlags])
            : command === 'cal:report' ? new Set(['--run', '--checkout-map', ...inputFlags])
              : new Set([...sourceFlags, '--run-id', '--cache', '--out', '--base-checkout-map', '--network', '--allow-hosts']);
  if (Object.keys(values).some((flag) => !allowed.has(flag))) throw new UsageError('Unexpected option for command');
  const hasManifestSourceFlag = sourceFlags.some((flag) => values[flag] !== undefined);
  if (command === 'select' && !hasManifestSourceFlag && (!values['--seed'] || !values['--out'])) {
    throw new UsageError('select requires --manifest, --seed, and --out');
  }
  const source = command === 'corpus:validate' || command === 'select' || command === 'cal:materialize'
    ? parseManifestSource(values)
    : undefined;
  if (command === 'select' && (!values['--manifest'] || !values['--seed'] || !values['--out'])) {
    if (source?.kind === 'legacy_path') throw new UsageError('select requires --manifest, --seed, and --out');
    if (!values['--seed'] || !values['--out']) throw new UsageError('select requires a manifest source, --seed, and --out');
  }
  // The planned command surface invokes `verify --run` after scan; keep the
  // explicit selection stage for callers verifying only the frozen ledger.
  const stage = values['--stage'] ?? 'scan';
  if (command === 'verify' && (!values['--run'] || (stage !== 'selection' && stage !== 'scan'))) {
    throw new UsageError('verify requires --run and an optional --stage selection or scan');
  }
  if (command === 'verify' && stage === 'scan' && !values['--checkout-map']) {
    throw new UsageError('verify --stage scan requires --checkout-map');
  }
  if (command === 'verify' && stage === 'scan' && inputFlags.some((flag) => !values[flag])) {
    throw new UsageError('verify --stage scan requires --registry, --signal-table, and --config');
  }
  if (command === 'scan' && (!values['--run'] || !values['--checkout-map'] || inputFlags.some((flag) => !values[flag]))) {
    throw new UsageError('scan requires --run, --checkout-map, --registry, --signal-table, and --config');
  }
  if (command === 'run:init' && (!values['--run'] || !values['--draft'] || !values['--checkout-map'] || inputFlags.some((flag) => !values[flag]))) {
    throw new UsageError('run:init requires --run, --draft, --checkout-map, --registry, --signal-table, and --config');
  }
  if (command === 'cal:report' && (!values['--run'] || !values['--checkout-map'] || inputFlags.some((flag) => !values[flag]))) {
    throw new UsageError('cal:report requires --run, --checkout-map, --registry, --signal-table, and --config');
  }
  if (command === 'cal:materialize') {
    if (!source || (source.kind === 'legacy_path' && !values['--manifest']) || !values['--run-id'] || !values['--cache'] || !values['--out']) {
      throw new UsageError('cal:materialize requires --manifest, --run-id, --cache, and --out');
    }
    const network = values['--network'] ?? 'deny';
    if (network !== 'deny' && network !== 'allow') throw new UsageError('cal:materialize --network must be deny or allow');
    if (network === 'allow' && !values['--allow-hosts']) throw new UsageError('cal:materialize --allow-hosts is required when network is allow');
    return {
      command,
      manifestSource: source,
      manifest: values['--manifest'],
      out: values['--out'],
      runId: values['--run-id'],
      cache: values['--cache'],
      baseCheckoutMap: values['--base-checkout-map'],
      network,
      allowHosts: values['--allow-hosts'],
    };
  }
  return {
    command,
    manifestSource: source,
    manifest: values['--manifest'],
    seed: values['--seed'],
    out: values['--out'],
    run: values['--run'],
    resume: values['--resume'] === 'true',
    draft: values['--draft'],
    stage,
    checkoutMap: values['--checkout-map'],
    registry: values['--registry'],
    signalTable: values['--signal-table'],
    config: values['--config'],
  };
}

async function readJson(path: string, label: string): Promise<unknown> {
  try {
    return JSON.parse(await readFile(path, 'utf8'));
  } catch {
    throw new UsageError(`Unable to read ${label}`);
  }
}

type FrozenInputHashes = {
  readonly registrySha256: string;
  readonly signalTableSha256: string;
  readonly configSha256: string;
};

type FrozenInputPathKey = 'registry' | 'signalTable' | 'config';

const FROZEN_INPUTS: readonly (readonly [keyof FrozenInputHashes, FrozenInputPathKey, string])[] = [
  ['registrySha256', 'registry', 'registry'],
  ['signalTableSha256', 'signalTable', 'signal table'],
  ['configSha256', 'config', 'config'],
];

async function readFrozenInputHashes(args: Arguments): Promise<FrozenInputHashes> {
  const entries = await Promise.all(FROZEN_INPUTS.map(async ([key, pathKey, label]) => {
    const path = args[pathKey];
    if (!path) throw new UsageError(`Missing ${label} input`);
    try {
      const bytes = await readFile(path);
      return [key, createHash('sha256').update(bytes).digest('hex')] as const;
    } catch {
      throw new UsageError(`Unable to read ${label} input`);
    }
  }));
  return Object.fromEntries(entries) as FrozenInputHashes;
}

function verifyFrozenInputHashes(declared: unknown, actual: FrozenInputHashes, context: string): void {
  if (!isRecord(declared)) throw new UsageError(`${context} must contain input hashes`);
  for (const [key, , label] of FROZEN_INPUTS) {
    if (declared[key] !== actual[key]) throw new UsageError(`${context} ${label} hash does not match input bytes`);
  }
}

async function readManifestSource(source: ManifestSource): Promise<unknown> {
  if (source.kind === 'admission_ref') throw new UsageError('Admission manifest sources are reserved until Task 9B');
  let bytes: Buffer;
  try {
    bytes = await readFile(source.manifestPath);
  } catch {
    throw new UsageError('Unable to read manifest');
  }
  const actual = createHash('sha256').update(bytes).digest('hex');
  if (actual !== source.expectedManifestSha256) throw new UsageError('Manifest SHA-256 does not match expected value');
  let manifest: unknown;
  try {
    manifest = JSON.parse(bytes.toString('utf8'));
  } catch {
    throw new UsageError('Unable to parse manifest');
  }
  const methodVersion = typeof manifest === 'object' && manifest !== null && 'methodVersion' in manifest
    ? (manifest as { readonly methodVersion?: unknown }).methodVersion
    : undefined;
  if (methodVersion !== 'v10.3.0' && methodVersion !== 'v10.3.1') {
    throw new UsageError('Flat manifest source only supports v10.3.0 and v10.3.1');
  }
  return manifest;
}

async function ensureEmptyDirectory(path: string): Promise<void> {
  try {
    if ((await readdir(path)).length > 0) throw new UsageError('Refusing to write into a nonempty output directory');
  } catch (error) {
    if (error instanceof UsageError) throw error;
    await mkdir(path, { recursive: true });
  }
}

async function writeNew(path: string, contents: string): Promise<void> {
  const temporary = `${path}.tmp`;
  await writeFile(temporary, contents, { encoding: 'utf8', flag: 'wx' });
  await rename(temporary, path);
}

async function ensureAbsent(path: string): Promise<void> {
  try { await access(path, constants.F_OK); throw new UsageError('Refusing to overwrite existing scan artifacts'); } catch (error) { if (error instanceof UsageError) throw error; }
}

async function ensureResumableChunks(directory: string, runId: string, records: readonly SelectionRecord[], chunkSize: number): Promise<void> {
  const selectedIds = records.filter((record) => record.status === 'selected').map((record) => record.fileId);
  const expected = new Set<string>();
  for (const chunk of planV103Chunks(selectedIds, chunkSize)) {
    const chunkId = canonicalSha256(chunk);
    expected.add(`${runId}-${chunkId}-1.completed.json`);
    expected.add(`${runId}-${chunkId}-2.completed.json`);
  }
  let entries: string[];
  try {
    entries = await readdir(directory);
  } catch (error) {
    if ((error as { readonly code?: string }).code === 'ENOENT') throw new UsageError('Resume requested but no completed chunks exist');
    throw new UsageError('Unable to inspect resume chunks');
  }
  if (!entries.some((entry) => expected.has(entry))) throw new UsageError('Resume requested but no completed chunks exist');
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function parseJsonl(jsonl: string, label: string): unknown[] {
  const trimmed = jsonl.trim();
  if (trimmed === '') return [];
  const lines = trimmed.split('\n');
  if (lines.some((line) => line.trim() === '')) throw new UsageError(`${label} is malformed`);
  try {
    return lines.map((line) => JSON.parse(line));
  } catch {
    throw new UsageError(`${label} is malformed`);
  }
}

async function readSelectionArtifacts(directory: string): Promise<{
  readonly manifest: unknown;
  readonly jsonl: string;
  readonly ledger: SelectionLedger;
  readonly records: SelectionRecord[];
}> {
  const manifest = await readJson(join(directory, 'corpus-manifest.json'), 'corpus manifest');
  const jsonl = await readFile(join(directory, 'corpus-selection.jsonl'), 'utf8').catch(() => {
    throw new UsageError('Unable to read selection JSONL');
  });
  const ledgerInput = await readJson(join(directory, 'selection-ledger.json'), 'selection ledger');
  const verification = verifySelectionLedger(manifest, jsonl, ledgerInput);
  if (!verification.ok) throw new UsageError(`Selection verification failed: ${verification.error}`);
  const records = parseJsonl(jsonl, 'Selection JSONL') as SelectionRecord[];
  if (!isRecord(ledgerInput)) throw new UsageError('Selection ledger is malformed');
  return { manifest, jsonl, ledger: ledgerInput as unknown as SelectionLedger, records };
}

function expectedSelection(records: readonly SelectionRecord[], chunkSize: number): {
  readonly fileIdsByPolarity: { readonly verified_ai: string[]; readonly verified_human: string[] };
  readonly chunkIdsByPolarity: { readonly verified_ai: string[]; readonly verified_human: string[] };
} {
  const fileIdsByPolarity = {
    verified_ai: records.filter((record) => record.status === 'selected' && record.label === 'verified_ai').map((record) => record.fileId),
    verified_human: records.filter((record) => record.status === 'selected' && record.label === 'verified_human').map((record) => record.fileId),
  };
  return {
    fileIdsByPolarity,
    chunkIdsByPolarity: {
      verified_ai: planV103Chunks(fileIdsByPolarity.verified_ai, chunkSize).map(canonicalSha256),
      verified_human: planV103Chunks(fileIdsByPolarity.verified_human, chunkSize).map(canonicalSha256),
    },
  };
}

function verifyCheckoutMapCoverage(checkoutMap: unknown, records: readonly SelectionRecord[]): void {
  if (!isRecord(checkoutMap) || !Array.isArray(checkoutMap.entries)) throw new UsageError('Checkout map is malformed');
  for (const record of records) {
    if (record.status !== 'selected') continue;
    const matches = checkoutMap.entries.filter((entry) => isRecord(entry)
      && entry.repositoryId === record.repositoryId
      && entry.commitSha === record.commitSha
      && canonicalJson(entry.materialization ?? null) === canonicalJson(record.materialization ?? null));
    if (matches.length !== 1) throw new UsageError(`Checkout map does not uniquely cover selected repository ${record.repositoryId}`);
  }
}

type VerifiedScanForReport = {
  readonly runManifest: SlopBrickV103CalibrationRunManifest;
  readonly runManifestSha256: string;
  readonly inputArtifacts: ReturnType<typeof hashV103UpstreamArtifacts>;
  readonly diagnosticOnly: boolean;
  readonly gateFailures: readonly string[];
};

/** Re-run every scan-artifact check before producing any derived report file. */
async function verifyScanForReport(
  args: Arguments,
  manifest: unknown,
  ledger: SelectionLedger,
  records: readonly SelectionRecord[],
): Promise<VerifiedScanForReport> {
  const runManifest = await readJson(join(args.run!, 'run-manifest.json'), 'run manifest');
  const checkoutMap = await readJson(args.checkoutMap!, 'checkout map');
  const inputs = verifyV103RunInputs(runManifest, checkoutMap);
  if (!inputs.ok) throw new UsageError(`Run input verification failed: ${inputs.error}`);
  verifyCheckoutMapCoverage(checkoutMap, records);
  const frozen = runManifest as SlopBrickV103CalibrationRunManifest;
  const selectionBinding = verifyV103SelectionBinding(frozen, ledger);
  if (!selectionBinding.ok) throw new UsageError(selectionBinding.error);
  const frozenInputHashes = await readFrozenInputHashes(args);
  verifyFrozenInputHashes(frozen.inputHashes, frozenInputHashes, 'Run manifest');
  const frozenHashes = frozen.inputHashes;
  if (frozenHashes.corpusManifestSha256 !== canonicalCorpusManifestSha256(manifest)) {
    throw new UsageError('Run manifest input hashes do not match the selected corpus artifacts');
  }
  if (frozenHashes.selectionSha256 !== canonicalSha256(records)) {
    throw new UsageError('Run manifest selection hash does not match selection JSONL');
  }
  const expectedSelectionVerification = verifyV103ExpectedSelection(frozen, records);
  if (!expectedSelectionVerification.ok) throw new UsageError(expectedSelectionVerification.error);

  const observationsBytes = await readFile(join(args.run!, 'observations.jsonl')).catch(() => {
    throw new UsageError('Unable to read observations JSONL');
  });
  const failuresBytes = await readFile(join(args.run!, 'failures.jsonl')).catch(() => {
    throw new UsageError('Unable to read failures JSONL');
  });
  const coverageBytes = await readFile(join(args.run!, 'coverage.json')).catch(() => {
    throw new UsageError('Unable to read coverage artifact');
  });
  const observations = parseJsonl(observationsBytes.toString('utf8'), 'Observations JSONL');
  const failures = parseJsonl(failuresBytes.toString('utf8'), 'Failures JSONL');
  let coverage: unknown;
  try {
    coverage = JSON.parse(coverageBytes.toString('utf8')) as unknown;
  } catch {
    throw new UsageError('Coverage artifact is malformed');
  }
  const verification = verifyV103Observations(
    { runId: frozen.runId, expectedFileIdsByPolarity: frozen.expected.fileIdsByPolarity },
    observations,
    failures,
    coverage,
  );
  if (!verification.ok) throw new UsageError(`Scan artifact verification failed: ${verification.error}`);
  return {
    runManifest: frozen,
    runManifestSha256: canonicalSha256(frozen),
    inputArtifacts: hashV103UpstreamArtifacts({ observations: observationsBytes, failures: failuresBytes, coverage: coverageBytes }),
    diagnosticOnly: verification.diagnosticOnly,
    gateFailures: verification.gateFailures,
  };
}

async function writeUnavailableReportArtifacts(
  runDirectory: string,
  bundle: ReturnType<typeof buildV103UnavailableArtifactBundle>,
): Promise<void> {
  const paths = [
    join(runDirectory, 'rule-metrics.json'),
    join(runDirectory, 'language-metrics.json'),
    join(runDirectory, 'report.md'),
    join(runDirectory, 'logs', 'report.jsonl'),
  ];
  // Check every destination before creating the logs directory or publishing
  // a file, so an existing derived artifact cannot be partially overwritten.
  await Promise.all(paths.flatMap((path) => [path, `${path}.tmp`]).map(ensureAbsent));
  if (!isV103UnavailableArtifact(bundle.ruleMetrics)
    || !isV103UnavailableArtifact(bundle.languageMetrics)
    || !isV103UnavailableArtifact(bundle.reportLog)) {
    throw new UsageError('Unavailable report artifact contract is malformed');
  }
  const contents = [
    JSON.stringify(bundle.ruleMetrics, null, 2) + '\n',
    JSON.stringify(bundle.languageMetrics, null, 2) + '\n',
    bundle.reportMarkdown,
    renderV103ReportLog(bundle.reportLog),
  ];
  const created: string[] = [];
  let inProgress: string | undefined;
  try {
    await mkdir(join(runDirectory, 'logs'), { recursive: true });
    // Publish one complete file at a time. If a later write fails, remove all
    // files created by this invocation so callers never observe a partial
    // derived-artifact bundle. The destination and temporary names were
    // checked absent above, and writeNew uses an exclusive temporary create.
    for (let index = 0; index < paths.length; index += 1) {
      inProgress = paths[index]!;
      await writeNew(paths[index]!, contents[index]!);
      created.push(paths[index]!);
      inProgress = undefined;
    }
  } catch (error) {
    const cleanup = created.flatMap((path) => [path, `${path}.tmp`]);
    if (inProgress !== undefined) cleanup.push(`${inProgress}.tmp`);
    await Promise.all(cleanup.map((path) => rm(path, { force: true })));
    throw error;
  }
}

function result(payload: Record<string, unknown>): void {
  process.stdout.write(`${JSON.stringify(payload)}\n`);
}

async function run(args: Arguments): Promise<void> {
  if (args.command === 'corpus:validate') {
    const manifest = await readManifestSource(args.manifestSource!);
    if (!isCalibrationCorpusManifestV103(manifest)) throw new UsageError('Manifest does not satisfy the v10.3 corpus contract');
    result({ ok: true, stage: 'corpus:validate', repositories: manifest.repositories.length, files: manifest.files.length });
    return;
  }

  if (args.command === 'cal:materialize') {
    const manifest = await readManifestSource(args.manifestSource!);
    const baseCheckoutMap = args.baseCheckoutMap === undefined
      ? undefined
      : await readJson(args.baseCheckoutMap, 'base checkout map');
    const allowedHosts = args.allowHosts === undefined ? [] : args.allowHosts.split(',').filter((host) => host.length > 0);
    const materialized = await materializeSources({
      manifest,
      runId: args.runId!,
      cacheDirectory: args.cache!,
      outputPath: args.out!,
      baseCheckoutMap,
      network: args.network,
      allowedHosts,
    });
    result(materialized);
    return;
  }

  if (args.command === 'select') {
    const manifest = await readManifestSource(args.manifestSource!);
    await ensureEmptyDirectory(args.out!);
    const selection = buildSelection(manifest, { seed: args.seed! });
    // The copied manifest is a canonical, path-free input snapshot. It lets
    // verification prove the selection against exactly the reviewed input.
    await writeNew(join(args.out!, 'corpus-manifest.json'), `${canonicalJson(manifest)}\n`);
    await writeNew(join(args.out!, 'corpus-selection.jsonl'), renderSelectionJsonl(selection.records));
    await writeNew(join(args.out!, 'selection-ledger.json'), `${JSON.stringify(selection.ledger, null, 2)}\n`);
    result({
      ok: true,
      stage: 'selection',
      requested: selection.ledger.requested,
      selected: selection.ledger.selected,
      excluded: selection.ledger.excluded,
      manifestSha256: selection.ledger.manifestSha256,
    });
    return;
  }

  const selection = await readSelectionArtifacts(args.run!);
  const { manifest, jsonl, ledger, records } = selection;

  if (args.command === 'cal:report') {
    const verified = await verifyScanForReport(args, manifest, ledger, records);
    // A valid scan is necessary but not sufficient for calibration. The
    // current flat-manifest lane has no admission-backed eligible cohort, and
    // a coverage failure independently blocks promotion. Emit only explicit
    // unavailable receipts; never invent zero-valued metrics.
    const reason: V103UnavailableReason = verified.diagnosticOnly
      ? 'coverage-gate-not-promotable'
      : 'eligible-cohort-unavailable';
    const bundle = buildV103UnavailableArtifactBundle({
      runId: verified.runManifest.runId,
      runManifestSha256: verified.runManifestSha256,
      inputArtifacts: verified.inputArtifacts,
      reason,
    });
    await writeUnavailableReportArtifacts(args.run!, bundle);
    result({
      ok: true,
      stage: 'report',
      status: 'unavailable',
      reason,
      artifacts: [
        'rule-metrics.json',
        'language-metrics.json',
        'report.md',
        'logs/report.jsonl',
      ],
      runManifestSha256: verified.runManifestSha256,
      gateFailures: verified.gateFailures,
    });
    process.exitCode = 1;
    return;
  }

  if (args.command === 'run:init') {
    const draftInput = await readJson(args.draft!, 'run manifest draft');
    if (!isRecord(draftInput) || !isRecord(draftInput.inputHashes)) {
      throw new UsageError('Run manifest draft must contain an inputHashes object');
    }
    const frozenInputHashes = await readFrozenInputHashes(args);
    verifyFrozenInputHashes(draftInput.inputHashes, frozenInputHashes, 'Run manifest draft');
    const settings = draftInput.settings;
    if (!isRecord(settings) || !Number.isSafeInteger(settings.chunkSize) || (settings.chunkSize as number) < 1) {
      throw new UsageError('Run manifest draft must contain a positive settings.chunkSize');
    }
    const expected = expectedSelection(records, settings.chunkSize as number);
    const draft = {
      ...draftInput,
      inputHashes: {
        ...draftInput.inputHashes,
        ...frozenInputHashes,
        corpusManifestSha256: canonicalCorpusManifestSha256(manifest),
        selectionSha256: canonicalSha256(records),
      },
      selection: { seed: ledger.seed, policy: ledger.policy },
      expected,
    } as unknown as Parameters<typeof createV103RunManifest>[0];
    let runManifest: SlopBrickV103CalibrationRunManifest;
    const checkoutMap = await readJson(args.checkoutMap!, 'checkout map');
    try {
      runManifest = createV103RunManifest(draft, checkoutMap);
    } catch (error) {
      throw new UsageError(error instanceof Error ? error.message : 'Unable to create run manifest');
    }
    verifyCheckoutMapCoverage(checkoutMap, records);
    const binding = verifyV103SelectionBinding(runManifest, ledger);
    if (!binding.ok) throw new UsageError(binding.error);
    const expectedVerification = verifyV103ExpectedSelection(runManifest, records);
    if (!expectedVerification.ok) throw new UsageError(expectedVerification.error);
    await Promise.all([
      ensureAbsent(join(args.run!, 'run-manifest.json')),
      ensureAbsent(join(args.run!, 'chunks')),
      ensureAbsent(join(args.run!, 'observations.jsonl')),
      ensureAbsent(join(args.run!, 'failures.jsonl')),
      ensureAbsent(join(args.run!, 'coverage.json')),
    ]);
    await writeNew(join(args.run!, 'run-manifest.json'), `${canonicalJson(runManifest)}\n`);
    result({
      ok: true,
      stage: 'run:init',
      runId: runManifest.runId,
      requested: ledger.requested,
      selected: ledger.selected,
      excluded: ledger.excluded,
      manifestSha256: canonicalSha256(runManifest),
    });
    return;
  }

  if (args.command === 'verify' && args.stage === 'selection') {
    result({ ok: true, stage: 'selection', requested: ledger.requested, selected: ledger.selected, excluded: ledger.excluded });
    return;
  }

  if (args.command === 'scan') {
    const runManifest = await readJson(join(args.run!, 'run-manifest.json'), 'run manifest');
    const checkoutMap = await readJson(args.checkoutMap!, 'checkout map');
    const inputs = verifyV103RunInputs(runManifest, checkoutMap);
    if (!inputs.ok) throw new UsageError(`Run input verification failed: ${inputs.error}`);
    const frozen = runManifest as SlopBrickV103CalibrationRunManifest;
    const frozenInputHashes = await readFrozenInputHashes(args);
    verifyFrozenInputHashes(frozen.inputHashes, frozenInputHashes, 'Run manifest');
    verifyCheckoutMapCoverage(checkoutMap, records);
    const selectionBinding = verifyV103SelectionBinding(frozen, ledger as SelectionLedger);
    if (!selectionBinding.ok) throw new UsageError(selectionBinding.error);
    const frozenHashes = frozen.inputHashes;
    if (frozenHashes.corpusManifestSha256 !== canonicalCorpusManifestSha256(manifest)) {
      throw new UsageError('Run manifest input hashes do not match the selected corpus artifacts');
    }
    await Promise.all(['observations.jsonl', 'failures.jsonl', 'coverage.json'].map((file) => ensureAbsent(join(args.run!, file))));
    if (frozenHashes.selectionSha256 !== canonicalSha256(records)) throw new UsageError('Run manifest selection hash does not match selection JSONL');
    const selectedRecords = records;
    const expectedSelection = verifyV103ExpectedSelection(frozen, selectedRecords);
    if (!expectedSelection.ok) throw new UsageError(expectedSelection.error);
    if (args.resume) await ensureResumableChunks(join(args.run!, 'chunks'), frozen.runId, selectedRecords, frozen.settings.chunkSize);
    const evidence = await runV103Scan({ directory: args.run!, runId: frozen.runId, records: selectedRecords, checkoutMap, inputHash: canonicalSha256(frozen), maxFileBytes: frozen.settings.maxFileBytes, workerCount: frozen.settings.workerCount, chunkSize: frozen.settings.chunkSize, timeoutMs: frozen.settings.chunkTimeoutMs, retryTimeoutMs: frozen.settings.retryTimeoutMs, includeRules: frozen.settings.includeRuleIds, excludeRules: frozen.settings.excludeRuleIds, invoker: createV103WorkerInvoker() });
    result({ ok: true, stage: 'scan', requested: evidence.coverage.requested, successful: evidence.coverage.successful, failed: evidence.coverage.failed, diagnosticOnly: evidence.verification.diagnosticOnly, gateFailures: evidence.verification.gateFailures });
    if (evidence.verification.diagnosticOnly) process.exitCode = 1;
    return;
  }

  if (args.command === 'verify' && args.stage === 'scan') {
    const runManifest = await readJson(join(args.run!, 'run-manifest.json'), 'run manifest');
    const checkoutMap = await readJson(args.checkoutMap!, 'checkout map');
    const inputs = verifyV103RunInputs(runManifest, checkoutMap);
    if (!inputs.ok) throw new UsageError(`Run input verification failed: ${inputs.error}`);
    verifyCheckoutMapCoverage(checkoutMap, records);
    const frozen = runManifest as SlopBrickV103CalibrationRunManifest;
    const selectionBinding = verifyV103SelectionBinding(frozen, ledger);
    if (!selectionBinding.ok) throw new UsageError(selectionBinding.error);
    const frozenInputHashes = await readFrozenInputHashes(args);
    verifyFrozenInputHashes(frozen.inputHashes, frozenInputHashes, 'Run manifest');
    const frozenHashes = frozen.inputHashes;
    if (frozenHashes.corpusManifestSha256 !== canonicalCorpusManifestSha256(manifest)) {
      throw new UsageError('Run manifest input hashes do not match the selected corpus artifacts');
    }
    if (frozenHashes.selectionSha256 !== canonicalSha256(records)) {
      throw new UsageError('Run manifest selection hash does not match selection JSONL');
    }
    const expectedSelectionVerification = verifyV103ExpectedSelection(frozen, records);
    if (!expectedSelectionVerification.ok) throw new UsageError(expectedSelectionVerification.error);
    const observationsJsonl = await readFile(join(args.run!, 'observations.jsonl'), 'utf8').catch(() => {
      throw new UsageError('Unable to read observations JSONL');
    });
    const failuresJsonl = await readFile(join(args.run!, 'failures.jsonl'), 'utf8').catch(() => {
      throw new UsageError('Unable to read failures JSONL');
    });
    const coverage = await readJson(join(args.run!, 'coverage.json'), 'coverage artifact');
    const observations = parseJsonl(observationsJsonl, 'Observations JSONL');
    const failures = parseJsonl(failuresJsonl, 'Failures JSONL');
    const verification = verifyV103Observations({ runId: frozen.runId, expectedFileIdsByPolarity: frozen.expected.fileIdsByPolarity }, observations, failures, coverage);
    if (!verification.ok) throw new UsageError(`Scan artifact verification failed: ${verification.error}`);
    const checkedCoverage = coverage as { requested: number; successful: number; excluded: number; failed: number };
    result({ ok: true, stage: 'scan', requested: checkedCoverage.requested, successful: checkedCoverage.successful, excluded: checkedCoverage.excluded, failed: checkedCoverage.failed, diagnosticOnly: verification.diagnosticOnly, gateFailures: verification.gateFailures });
    if (verification.diagnosticOnly) process.exitCode = 1;
    return;
  }

  result({ ok: true, stage: 'selection' });
}

async function main(): Promise<void> {
  try {
    await run(parseArgs(process.argv.slice(2)));
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Calibration command failed';
    // Keep stdout machine-readable and avoid leaking caller-local paths.
    result({ ok: false, error: message.replaceAll(basename(process.cwd()), 'workspace') });
    process.stderr.write(`v10.3 calibration: ${message}\n`);
    process.exitCode = 2;
  }
}

void main();
