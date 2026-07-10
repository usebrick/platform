/**
 * Isolated v10.3 calibration control plane.
 *
 * This deliberately does not invoke the historical calibrator or scanner.
 * It validates provenance-backed manifests and produces/verifies the first
 * lossless artifact: a complete corpus-selection ledger.
 */
import { access, constants, mkdir, readFile, readdir, rename, writeFile } from 'node:fs/promises';
import { basename, join } from 'node:path';
import { isCalibrationCorpusManifestV103, type SlopBrickV103CalibrationRunManifest } from '@usebrick/core';
import {
  buildSelection,
  renderSelectionJsonl,
  verifySelectionLedger,
} from '../../src/calibration/v103/selection';
import { canonicalCorpusManifestSha256, canonicalJson, canonicalSha256 } from '../../src/calibration/v103/canonical';
import { verifyV103ExpectedSelection, verifyV103RunInputs } from '../../src/calibration/v103/run-manifest';
import { createV103WorkerInvoker } from '../../src/calibration/v103/worker-invoker';
import { runV103Scan } from '../../src/calibration/v103/run-scan';
import type { SelectionRecord } from '../../src/calibration/v103/selection';

type Command = 'corpus:validate' | 'select' | 'verify' | 'scan';

interface Arguments {
  readonly command: Command;
  readonly manifest?: string;
  readonly seed?: string;
  readonly out?: string;
  readonly run?: string;
  readonly stage?: string;
  readonly checkoutMap?: string;
}

class UsageError extends Error {}

function parseArgs(argv: readonly string[]): Arguments {
  const [command, ...rest] = argv;
  if (command !== 'corpus:validate' && command !== 'select' && command !== 'verify' && command !== 'scan') {
    throw new UsageError('Expected one of: corpus:validate, select, verify, scan');
  }
  const values: Record<string, string> = {};
  for (let index = 0; index < rest.length; index += 2) {
    const flag = rest[index];
    const value = rest[index + 1];
    if (!flag?.startsWith('--') || value === undefined || value.startsWith('--') || values[flag] !== undefined) {
      throw new UsageError('Expected unique --flag value pairs');
    }
    values[flag] = value;
  }
  const allowed = command === 'corpus:validate' ? new Set(['--manifest'])
    : command === 'select' ? new Set(['--manifest', '--seed', '--out'])
      : command === 'verify' ? new Set(['--run', '--stage']) : new Set(['--run', '--checkout-map']);
  if (Object.keys(values).some((flag) => !allowed.has(flag))) throw new UsageError('Unexpected option for command');
  if (command === 'corpus:validate' && !values['--manifest']) throw new UsageError('corpus:validate requires --manifest');
  if (command === 'select' && (!values['--manifest'] || !values['--seed'] || !values['--out'])) {
    throw new UsageError('select requires --manifest, --seed, and --out');
  }
  if (command === 'verify' && (!values['--run'] || values['--stage'] !== 'selection')) {
    throw new UsageError('verify requires --run and --stage selection');
  }
  if (command === 'scan' && (!values['--run'] || !values['--checkout-map'])) throw new UsageError('scan requires --run and --checkout-map');
  return { command, manifest: values['--manifest'], seed: values['--seed'], out: values['--out'], run: values['--run'], stage: values['--stage'], checkoutMap: values['--checkout-map'] };
}

async function readJson(path: string, label: string): Promise<unknown> {
  try {
    return JSON.parse(await readFile(path, 'utf8'));
  } catch {
    throw new UsageError(`Unable to read ${label}`);
  }
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

function result(payload: Record<string, unknown>): void {
  process.stdout.write(`${JSON.stringify(payload)}\n`);
}

async function run(args: Arguments): Promise<void> {
  if (args.command === 'corpus:validate') {
    const manifest = await readJson(args.manifest!, 'manifest');
    if (!isCalibrationCorpusManifestV103(manifest)) throw new UsageError('Manifest does not satisfy the v10.3 corpus contract');
    result({ ok: true, stage: 'corpus:validate', repositories: manifest.repositories.length, files: manifest.files.length });
    return;
  }

  if (args.command === 'select') {
    const manifest = await readJson(args.manifest!, 'manifest');
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

  const manifest = await readJson(join(args.run!, 'corpus-manifest.json'), 'run manifest');
  const jsonl = await readFile(join(args.run!, 'corpus-selection.jsonl'), 'utf8').catch(() => { throw new UsageError('Unable to read selection JSONL'); });
  const ledger = await readJson(join(args.run!, 'selection-ledger.json'), 'selection ledger');
  const verification = verifySelectionLedger(manifest, jsonl, ledger);
  if (!verification.ok) throw new UsageError(`Selection verification failed: ${verification.error}`);
  if (args.command === 'scan') {
    const runManifest = await readJson(join(args.run!, 'run-manifest.json'), 'run manifest');
    const checkoutMap = await readJson(args.checkoutMap!, 'checkout map');
    const inputs = verifyV103RunInputs(runManifest, checkoutMap);
    if (!inputs.ok) throw new UsageError(`Run input verification failed: ${inputs.error}`);
    const frozenHashes = (runManifest as { inputHashes: { corpusManifestSha256: string; selectionSha256: string } }).inputHashes;
    if (frozenHashes.corpusManifestSha256 !== canonicalCorpusManifestSha256(manifest)) {
      throw new UsageError('Run manifest input hashes do not match the selected corpus artifacts');
    }
    await Promise.all(['observations.jsonl', 'failures.jsonl', 'coverage.json'].map((file) => ensureAbsent(join(args.run!, file))));
    let records: unknown[];
    try { records = jsonl.trim() === '' ? [] : jsonl.trimEnd().split('\n').map((line) => JSON.parse(line)); } catch { throw new UsageError('Selection JSONL is malformed'); }
    if (frozenHashes.selectionSha256 !== canonicalSha256(records)) throw new UsageError('Run manifest selection hash does not match selection JSONL');
    const frozen = runManifest as SlopBrickV103CalibrationRunManifest;
    const selectedRecords = records as SelectionRecord[];
    const expectedSelection = verifyV103ExpectedSelection(frozen, selectedRecords);
    if (!expectedSelection.ok) throw new UsageError(expectedSelection.error);
    const evidence = await runV103Scan({ directory: args.run!, runId: frozen.runId, records: selectedRecords, checkoutMap, chunkSize: frozen.settings.chunkSize, timeoutMs: frozen.settings.chunkTimeoutMs, retryTimeoutMs: frozen.settings.retryTimeoutMs, includeRules: frozen.settings.includeRuleIds, excludeRules: frozen.settings.excludeRuleIds, invoker: createV103WorkerInvoker() });
    result({ ok: true, stage: 'scan', requested: evidence.coverage.requested, successful: evidence.coverage.successful, failed: evidence.coverage.failed, diagnosticOnly: evidence.verification.diagnosticOnly, gateFailures: evidence.verification.gateFailures });
    if (evidence.verification.diagnosticOnly) process.exitCode = 1;
    return;
  }
  result({ ok: true, stage: 'selection' });
}

try {
  await run(parseArgs(process.argv.slice(2)));
} catch (error) {
  const message = error instanceof Error ? error.message : 'Calibration command failed';
  // Keep stdout machine-readable and avoid leaking caller-local paths.
  result({ ok: false, error: message.replaceAll(basename(process.cwd()), 'workspace') });
  process.stderr.write(`v10.3 calibration: ${message}\n`);
  process.exitCode = 2;
}
