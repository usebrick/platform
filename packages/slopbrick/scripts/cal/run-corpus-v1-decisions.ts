import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import packageJson from '../../package.json' with { type: 'json' };

import { canonicalJson, canonicalSha256 } from '../../src/calibration/v103/canonical';
import {
  buildCAL001DecisionMatrix,
  type CAL001DecisionMatrixInput,
} from '../../src/calibration/corpus-v1/calibration-decisions';
import type {
  CAL001HoldoutMetrics,
  CAL001HoldoutReceipt,
} from '../../src/calibration/corpus-v1/calibration-holdout';
import { RuleRegistry } from '../../src/rules/registry';
import { getDefaultOffRules } from '../../src/rules/signal-strength';

const COMMIT_SHA = /^[a-f0-9]{40}$/u;

interface Arguments {
  readonly holdoutReceiptPath: string;
  readonly metricsPath: string;
  readonly outPath: string;
  readonly holdoutImplementationCommitSha: string;
  readonly decisionImplementationCommitSha: string;
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
  const holdoutReceiptPath = values['--holdout-receipt'];
  const metricsPath = values['--metrics'];
  const outPath = values['--out'];
  const holdoutImplementationCommitSha = values['--holdout-implementation-commit-sha'];
  const decisionImplementationCommitSha = values['--decision-implementation-commit-sha'];
  if (!holdoutReceiptPath || !metricsPath || !outPath || !holdoutImplementationCommitSha || !decisionImplementationCommitSha) {
    throw new Error('Usage: --holdout-receipt <receipt.json> --metrics <metrics.json> --out <matrix.json> --holdout-implementation-commit-sha <40-hex-sha> --decision-implementation-commit-sha <40-hex-sha>');
  }
  if (!COMMIT_SHA.test(holdoutImplementationCommitSha) || !COMMIT_SHA.test(decisionImplementationCommitSha)) throw new Error('implementation commit SHAs must be 40 lowercase hexadecimal characters');
  return { holdoutReceiptPath, metricsPath, outPath, holdoutImplementationCommitSha, decisionImplementationCommitSha };
}

async function readCanonicalJson<T>(path: string): Promise<T> {
  const text = await readFile(resolve(path), 'utf8');
  const value = JSON.parse(text) as T;
  if (canonicalJson(value) !== text.trimEnd()) throw new Error(`input JSON is not canonical: ${path}`);
  return value;
}

async function writeNew(path: string, contents: string): Promise<void> {
  await mkdir(dirname(resolve(path)), { recursive: true });
  await writeFile(path, contents, { encoding: 'utf8', flag: 'wx' });
}

async function run(args: Arguments): Promise<void> {
  const receipt = await readCanonicalJson<CAL001HoldoutReceipt>(args.holdoutReceiptPath);
  const metrics = await readCanonicalJson<CAL001HoldoutMetrics>(args.metricsPath);
  const holdoutReceiptSha256 = canonicalSha256(receipt);
  const metricsSha256 = canonicalSha256(metrics);
  if (receipt.version !== 'cal-001-v1-holdout-receipt-v1') throw new Error('holdout receipt version is invalid');
  if (receipt.implementationCommitSha !== args.holdoutImplementationCommitSha) throw new Error('holdout receipt implementation commit does not match the requested commit');
  if (receipt.metrics.metricsSha256 !== metricsSha256) throw new Error('holdout receipt does not bind the supplied metrics');
  if (receipt.admitted !== false || receipt.evaluation !== 'diagnostic-only') throw new Error('holdout input is not an admitted=false diagnostic result');
  const registry = new RuleRegistry();
  registry.loadBuiltins();
  const defaultOffRules = getDefaultOffRules();
  const ruleCatalog = registry.all().map((rule) => ({
    ruleId: rule.id,
    aiSpecific: rule.aiSpecific,
    existingDefaultOff: rule.defaultOff === true || defaultOffRules.has(rule.id),
  }));
  const input: CAL001DecisionMatrixInput = {
    protocolVersion: 'CAL-001-v1',
    holdoutImplementationCommitSha: args.holdoutImplementationCommitSha,
    decisionImplementationCommitSha: args.decisionImplementationCommitSha,
    holdoutReceiptSha256,
    metricsSha256,
    leakageStatus: receipt.leakage.status,
    metricsStatus: receipt.metrics.status,
    ruleCatalog,
    metrics,
  };
  const result = buildCAL001DecisionMatrix(input);
  await writeNew(args.outPath, `${result.matrixJson}\n`);
  process.stdout.write(`${JSON.stringify({
    ok: true,
    stage: 'cal-001-v1-decisions',
    packageVersion: packageJson.version,
    matrixSha256: result.matrixSha256,
    counts: result.matrix.counts,
    admitted: result.matrix.admitted,
    applied: result.matrix.applied,
  })}\n`);
}

try {
  await run(parseArgs(process.argv.slice(2)));
} catch (error) {
  const message = error instanceof Error ? error.message : 'CAL-001 decision matrix failed';
  process.stderr.write(`CAL-001 decisions: ${message}\n`);
  process.exitCode = 2;
}
