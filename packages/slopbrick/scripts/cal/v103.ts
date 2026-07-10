/**
 * Isolated v10.3 calibration control plane.
 *
 * This deliberately does not invoke the historical calibrator or scanner.
 * It validates provenance-backed manifests and produces/verifies the first
 * lossless artifact: a complete corpus-selection ledger.
 */
import { mkdir, readFile, readdir, rename, writeFile } from 'node:fs/promises';
import { basename, join } from 'node:path';
import { isCalibrationCorpusManifestV103 } from '@usebrick/core';
import {
  buildSelection,
  renderSelectionJsonl,
  verifySelectionLedger,
} from '../../src/calibration/v103/selection';
import { canonicalJson } from '../../src/calibration/v103/canonical';

type Command = 'corpus:validate' | 'select' | 'verify';

interface Arguments {
  readonly command: Command;
  readonly manifest?: string;
  readonly seed?: string;
  readonly out?: string;
  readonly run?: string;
  readonly stage?: string;
}

class UsageError extends Error {}

function parseArgs(argv: readonly string[]): Arguments {
  const [command, ...rest] = argv;
  if (command !== 'corpus:validate' && command !== 'select' && command !== 'verify') {
    throw new UsageError('Expected one of: corpus:validate, select, verify');
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
      : new Set(['--run', '--stage']);
  if (Object.keys(values).some((flag) => !allowed.has(flag))) throw new UsageError('Unexpected option for command');
  if (command === 'corpus:validate' && !values['--manifest']) throw new UsageError('corpus:validate requires --manifest');
  if (command === 'select' && (!values['--manifest'] || !values['--seed'] || !values['--out'])) {
    throw new UsageError('select requires --manifest, --seed, and --out');
  }
  if (command === 'verify' && (!values['--run'] || values['--stage'] !== 'selection')) {
    throw new UsageError('verify requires --run and --stage selection');
  }
  return { command, manifest: values['--manifest'], seed: values['--seed'], out: values['--out'], run: values['--run'], stage: values['--stage'] };
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
