/**
 * Read-only Task-4 Step-1 genesis composition.
 *
 * This command reads the frozen v10.3 draft register, repository inventory,
 * and selected JSONL inventories, then prints a deterministic diagnostic
 * containing the 329-entry generation-0 register and 329 source-quarantine
 * reviews. It deliberately has no output-file option: persisting external
 * admission artifacts belongs to the authorized Task-4 orchestration step.
 */
import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { createInterface } from 'node:readline';
import { calibrationAdmissionCanonicalJson } from '@usebrick/core';
import {
  buildV103GenesisDiagnostic,
  buildV103GenesisAdmission,
  type GenesisInventoryRow,
} from '../../src/calibration/v103/admission-genesis';

interface Arguments {
  readonly sourceRegister: string;
  readonly repositoryInventory: string;
  readonly positiveInventory: string;
  readonly negativeInventory: string;
  readonly reviewedAt: string;
  readonly json: boolean;
}

function parseArgs(argv: readonly string[]): Arguments {
  // `pnpm run <script> -- ...` forwards the separator on some pnpm/corepack
  // versions. Keep this diagnostic CLI compatible with the admission CLI.
  const forwarded = argv[0] === '--' ? argv.slice(1) : argv;
  const values: Record<string, string | boolean> = {};
  for (let index = 0; index < forwarded.length; index += 1) {
    const flag = forwarded[index];
    if (flag === '--json') {
      if (values.json !== undefined) throw new Error('--json may only be supplied once');
      values.json = true;
      continue;
    }
    const key = flag === '--source-register' ? 'sourceRegister'
      : flag === '--repository-inventory' ? 'repositoryInventory'
        : flag === '--positive-inventory' ? 'positiveInventory'
          : flag === '--negative-inventory' ? 'negativeInventory'
            : flag === '--reviewed-at' ? 'reviewedAt'
              : undefined;
    if (!key || values[key] !== undefined) throw new Error(`unknown or duplicate option: ${flag}`);
    const value = forwarded[index + 1];
    if (!value || value.startsWith('--')) throw new Error(`${flag} requires a value`);
    values[key] = value;
    index += 1;
  }
  for (const key of ['sourceRegister', 'repositoryInventory', 'positiveInventory', 'negativeInventory', 'reviewedAt']) {
    if (typeof values[key] !== 'string') throw new Error(`--${key.replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`)} is required`);
  }
  return {
    sourceRegister: values.sourceRegister as string,
    repositoryInventory: values.repositoryInventory as string,
    positiveInventory: values.positiveInventory as string,
    negativeInventory: values.negativeInventory as string,
    reviewedAt: values.reviewedAt as string,
    json: values.json === true,
  };
}

async function readJson(path: string, label: string): Promise<unknown> {
  try {
    return JSON.parse(await readFile(path, 'utf8')) as unknown;
  } catch (error) {
    throw new Error(`unable to read ${label}: ${error instanceof Error ? error.message : String(error)}`);
  }
}

async function readInventory(path: string, side: 'positive' | 'negative'): Promise<{ readonly rows: readonly GenesisInventoryRow[]; readonly bytesSha256: string }> {
  const stream = createReadStream(path, { encoding: 'utf8' });
  const bytesHash = createHash('sha256');
  stream.on('data', (chunk) => bytesHash.update(chunk));
  const lines = createInterface({ input: stream, crlfDelay: Infinity });
  const rows: GenesisInventoryRow[] = [];
  const expectedRows = side === 'positive' ? 224903 : 227479;
  let lineNumber = 0;
  try {
    for await (const line of lines) {
      lineNumber += 1;
      if (line.length === 0) continue;
      if (line.length > 16 * 1024 * 1024) throw new Error(`${side} inventory line ${lineNumber} exceeds the 16 MiB safety bound`);
      if (rows.length >= expectedRows) throw new Error(`${side} inventory has more than ${expectedRows} selected rows`);
      try {
        rows.push(JSON.parse(line) as GenesisInventoryRow);
      } catch (error) {
        throw new Error(`${side} inventory line ${lineNumber} is invalid JSON: ${error instanceof Error ? error.message : String(error)}`);
      }
    }
  } finally {
    lines.close();
  }
  return { rows, bytesSha256: bytesHash.digest('hex') };
}

async function main(argv = process.argv.slice(2)): Promise<number> {
  try {
    const args = parseArgs(argv);
    const [sourceRegister, repositoryInventory, positiveInventory, negativeInventory] = await Promise.all([
      readJson(args.sourceRegister, 'source register'),
      readJson(args.repositoryInventory, 'repository inventory'),
      readInventory(args.positiveInventory, 'positive'),
      readInventory(args.negativeInventory, 'negative'),
    ]);
    const result = buildV103GenesisAdmission({
      sourceRegister,
      repositoryInventory,
      positiveInventory: positiveInventory.rows,
      negativeInventory: negativeInventory.rows,
      inventoryFileSha256: { positive: positiveInventory.bytesSha256, negative: negativeInventory.bytesSha256 },
      reviewedAt: args.reviewedAt,
    });
    const diagnostic = {
      ...buildV103GenesisDiagnostic(result),
      register: result.register,
      sourceReviews: result.sourceReviews,
      inventorySummary: result.inventorySummary,
      validation: result.validation,
    };
    if (args.json) process.stdout.write(`${calibrationAdmissionCanonicalJson(diagnostic)}\n`);
    else {
      process.stdout.write(`${JSON.stringify({
        version: diagnostic.version,
        authorityEligible: false,
        persisted: false,
        registerEntries: result.register.entries.length,
        reviewedSources: result.sourceReviews.length,
        selectedCoverage: result.validation.additiveMaterialUnits,
        quarantineUnits: result.validation.quarantineUnits,
        candidateSources: result.validation.candidateSourceCount,
        eligibleUnits: 0,
        blockers: diagnostic.blockers,
      })}\n`);
    }
    return 0;
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    return 2;
  }
}

if (process.argv[1]?.endsWith('build-v103-genesis.ts')) process.exitCode = await main();
