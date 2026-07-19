/** Offline-only CAL-002 owner-review dispatcher. */
import { execFileSync } from 'node:child_process';
import { createInterface } from 'node:readline';

import { detectMonorepoRoot } from '../../src/config/detect/monorepo';
import {
  readCanonicalArtifact,
  readReviewReceipt,
  readReviewState,
  readVerifiedSource,
  readVerifiedSourcesByHash,
  writeImmutableReceipt,
  writeReviewState,
} from '../../src/calibration/cal-002/artifact-io';
import {
  CAL002_LOCKED_RULE_CATALOG_SHA256,
  canonicalArtifact,
  validateCAL002Assignment,
  type CAL002ReviewLabel,
} from '../../src/calibration/cal-002/contracts';
import type {
  CAL002QualityAssignment,
  CAL002QualityBlindedRow,
} from '../../src/calibration/cal-002/quality-sampling';
import {
  assertCAL002ReviewState,
  completeCAL002Review,
  nextCAL002ReviewId,
  recordCAL002Review,
  startCAL002Review,
  verifyCompletedCAL002ReviewReceipt,
  type CAL002ReviewState,
} from '../../src/calibration/cal-002/review-session';

const MENU = [
  '1 actionable-defect',
  '2 useful-no-safe-fix',
  '3 not-useful',
  '4 cannot-determine',
  'q save and quit',
].join('\n');

const LABEL_BY_KEY: Readonly<Record<string, CAL002ReviewLabel>> = {
  '1': 'actionable-defect',
  '2': 'useful-no-safe-fix',
  '3': 'not-useful',
  '4': 'cannot-determine',
};
const DISPLAY_SOURCE_BYTE_LIMIT = 16 * 1024;
const IMPLEMENTATION_SHA_ENV = 'CAL002_REVIEW_IMPLEMENTATION_COMMIT_SHA';

interface Arguments {
  readonly command: 'review-quality';
  readonly root: string;
  readonly corpusRoot?: string;
  readonly assignment: string;
  readonly blindedBatch?: string;
  readonly sourceMap?: string;
  readonly state: string;
  readonly receipt: string;
  readonly implementationCommitSha?: string;
}

interface SourceMap {
  readonly version: 'cal-002-review-source-map-v1';
  readonly rows: readonly { readonly reviewId: string; readonly sourcePath: string }[];
}

function machineOutput(value: unknown): void {
  process.stdout.write(`${canonicalArtifact(value).json}\n`);
}

function parseArguments(argv: readonly string[]): Arguments {
  let first = 0;
  while (argv[first] === '--') first += 1;
  const [command, ...tokens] = argv.slice(first);
  if (command !== 'review-quality') throw new Error('Usage: cal:complete review-quality with the required local artifact options');
  const values = new Map<string, string>();
  const allowed = new Set([
    '--root',
    '--corpus-root',
    '--assignment',
    '--blinded-batch',
    '--source-map',
    '--state',
    '--receipt',
    '--out',
    '--implementation-commit-sha',
  ]);
  for (let index = 0; index < tokens.length; index += 2) {
    const option = tokens[index];
    const value = tokens[index + 1];
    if (!allowed.has(option ?? '')) throw new Error(`Unknown CAL-002 option ${option ?? '<missing>'}`);
    if (value === undefined || value.startsWith('--')) throw new Error(`${option} requires one value`);
    if (values.has(option)) throw new Error(`Duplicate CAL-002 option ${option}`);
    values.set(option, value);
  }
  const required = (option: string): string => {
    const value = values.get(option);
    if (value === undefined || value.length === 0) throw new Error(`review-quality requires ${option}`);
    return value;
  };
  if (values.has('--receipt') && values.has('--out')) throw new Error('Use only one of --out or --receipt');
  const sourceMapPath = values.get('--source-map');
  const corpusRoot = values.get('--corpus-root');
  if (sourceMapPath === undefined && corpusRoot === undefined) {
    throw new Error('review-quality requires --corpus-root unless --source-map is supplied');
  }
  return {
    command,
    root: values.get('--root') ?? detectMonorepoRoot(process.cwd()) ?? process.cwd(),
    corpusRoot,
    assignment: required('--assignment'),
    blindedBatch: values.get('--blinded-batch'),
    sourceMap: sourceMapPath,
    state: required('--state'),
    receipt: values.get('--out') ?? required('--receipt'),
    implementationCommitSha: values.get('--implementation-commit-sha'),
  };
}

function resolveImplementationCommitSha(args: Arguments): string {
  const supplied = args.implementationCommitSha ?? process.env[IMPLEMENTATION_SHA_ENV];
  if (supplied !== undefined && supplied.length > 0) return supplied;
  try {
    return execFileSync('git', ['rev-parse', 'HEAD'], {
      cwd: process.cwd(),
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();
  } catch {
    throw new Error(`review-quality requires --implementation-commit-sha, ${IMPLEMENTATION_SHA_ENV}, or a local git HEAD`);
  }
}

function record(value: unknown, label: string): Record<string, unknown> {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) throw new Error(`${label} must be an object`);
  return value as Record<string, unknown>;
}

function assertExactKeys(value: Record<string, unknown>, expected: readonly string[], label: string): void {
  const actual = Object.keys(value).sort();
  const keys = [...expected].sort();
  if (actual.length !== keys.length || actual.some((key, index) => key !== keys[index])) {
    throw new Error(`${label} has unknown or missing fields`);
  }
}

function qualityAssignment(value: unknown): CAL002QualityAssignment {
  const validation = validateCAL002Assignment(value);
  if (!validation.ok) throw new Error(`CAL-002 assignment is invalid: ${validation.errors.join('; ')}`);
  const assignment = value as CAL002QualityAssignment;
  if (assignment.catalogSha256 !== CAL002_LOCKED_RULE_CATALOG_SHA256) {
    throw new Error('CAL-002 assignment catalog hash does not match the locked catalog');
  }
  const { assignmentSha256: _assignmentSha256, ...withoutSelfHash } = assignment;
  if (canonicalArtifact(withoutSelfHash).sha256 !== assignment.assignmentSha256) {
    throw new Error('CAL-002 assignment SHA-256 does not match its canonical contents');
  }
  return assignment;
}

function blindedBatch(value: unknown, assignment: CAL002QualityAssignment): readonly CAL002QualityBlindedRow[] {
  if (!Array.isArray(value)) throw new Error('CAL-002 blinded batch must be an array');
  if (canonicalArtifact(value).sha256 !== assignment.blindedBatchSha256) {
    throw new Error('CAL-002 blinded batch SHA-256 does not match the assignment');
  }
  if (canonicalArtifact(value).json !== canonicalArtifact(assignment.blindedRows).json) {
    throw new Error('CAL-002 blinded batch does not exactly match the assignment projection');
  }
  return value as readonly CAL002QualityBlindedRow[];
}

function sourceMap(value: unknown, reviewIds: readonly string[]): SourceMap {
  const artifact = record(value, 'CAL-002 source map');
  assertExactKeys(artifact, ['version', 'rows'], 'CAL-002 source map');
  if (artifact.version !== 'cal-002-review-source-map-v1' || !Array.isArray(artifact.rows)) {
    throw new Error('CAL-002 source map has an invalid version or rows');
  }
  const expected = new Set(reviewIds);
  const seen = new Set<string>();
  for (const [index, candidate] of artifact.rows.entries()) {
    const row = record(candidate, `CAL-002 source map rows[${index}]`);
    assertExactKeys(row, ['reviewId', 'sourcePath'], `CAL-002 source map rows[${index}]`);
    if (typeof row.reviewId !== 'string' || !expected.has(row.reviewId)) throw new Error(`CAL-002 source map rows[${index}] has an unknown review ID`);
    if (seen.has(row.reviewId)) throw new Error(`CAL-002 source map duplicates ${row.reviewId}`);
    if (typeof row.sourcePath !== 'string' || row.sourcePath.length === 0) throw new Error(`CAL-002 source map rows[${index}] has no source path`);
    seen.add(row.reviewId);
  }
  if (seen.size !== expected.size) throw new Error('CAL-002 source map does not cover every review ID');
  return value as SourceMap;
}

function sameStrings(left: readonly string[], right: readonly string[]): boolean {
  return left.length === right.length && left.every((value, index) => value === right[index]);
}

async function loadState(args: Arguments, assignment: CAL002QualityAssignment, batch: readonly CAL002QualityBlindedRow[]): Promise<CAL002ReviewState> {
  let state: CAL002ReviewState;
  try {
    state = await readReviewState({ root: args.root, relativePath: args.state });
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
    state = startCAL002Review({
      assignmentSha256: assignment.assignmentSha256,
      blindedBatchSha256: assignment.blindedBatchSha256,
      reviewIds: batch.map((row) => row.reviewId),
    });
  }
  assertCAL002ReviewState(state);
  if (state.assignmentSha256 !== assignment.assignmentSha256 || state.blindedBatchSha256 !== assignment.blindedBatchSha256) {
    throw new Error('CAL-002 review state does not match the assignment and blinded batch');
  }
  if (!sameStrings(state.reviewIds, batch.map((row) => row.reviewId))) {
    throw new Error('CAL-002 review state order does not match the blinded batch');
  }
  return state;
}

function progress(state: CAL002ReviewState): { readonly labeled: number; readonly remaining: number } {
  return { labeled: state.rows.length, remaining: state.reviewIds.length - state.rows.length };
}

function safeDisplayedSource(source: string): string {
  const bytes = Buffer.from(source, 'utf8');
  const bounded = bytes.subarray(0, DISPLAY_SOURCE_BYTE_LIMIT).toString('utf8');
  const neutralized = bounded.replace(/[\x00-\x09\x0b-\x1f\x7f-\x9f]/gu, (value) => `\\x${value.codePointAt(0)!.toString(16).padStart(2, '0')}`);
  return bytes.byteLength > DISPLAY_SOURCE_BYTE_LIMIT
    ? `${neutralized}${neutralized.endsWith('\n') ? '' : '\n'}[source context truncated at ${DISPLAY_SOURCE_BYTE_LIMIT} bytes]\n`
    : `${neutralized}${neutralized.endsWith('\n') ? '' : '\n'}`;
}

function sourceReader(
  args: Arguments,
  assignment: CAL002QualityAssignment,
  batch: readonly CAL002QualityBlindedRow[],
  sources: SourceMap | undefined,
): (observation: CAL002QualityBlindedRow) => Promise<string> {
  if (sources !== undefined) {
    return async (observation) => {
      const source = sources.rows.find((row) => row.reviewId === observation.reviewId)!;
      return readVerifiedSource({
        root: args.root,
        relativePath: source.sourcePath,
        expectedSha256: observation.sourceIdentitySha256,
      });
    };
  }
  const unitIds = new Map(assignment.rows.map((row) => [row.reviewId, row.unitId]));
  const sourceIndex = readVerifiedSourcesByHash({
    root: args.corpusRoot!,
    sources: batch.map((observation) => ({
      expectedSha256: observation.sourceIdentitySha256,
      unitId: unitIds.get(observation.reviewId),
    })),
  });
  return async (observation) => {
    const source = (await sourceIndex).get(observation.sourceIdentitySha256);
    if (source === undefined) throw new Error('CAL-002 selected source was not present in the verified source index');
    return source;
  };
}

async function resumeCompletedReview(args: Arguments, state: CAL002ReviewState): Promise<void> {
  let receipt;
  try {
    receipt = await readReviewReceipt({ root: args.root, relativePath: args.receipt });
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      throw new Error('CAL-002 completed review state requires its matching receipt');
    }
    throw error;
  }
  const verified = verifyCompletedCAL002ReviewReceipt({ state, receipt });
  machineOutput({
    ok: true,
    command: args.command,
    status: 'completed',
    ...progress(state),
    ...verified,
  });
}

async function reviewQuality(args: Arguments): Promise<void> {
  const assignmentValue = await readCanonicalArtifact({ root: args.root, relativePath: args.assignment, label: 'CAL-002 assignment' });
  const assignment = qualityAssignment(assignmentValue);
  const batch = args.blindedBatch === undefined
    ? blindedBatch(assignment.blindedRows, assignment)
    : blindedBatch(
      await readCanonicalArtifact({ root: args.root, relativePath: args.blindedBatch, label: 'CAL-002 blinded batch' }),
      assignment,
    );
  const sources = args.sourceMap === undefined
    ? undefined
    : sourceMap(
      await readCanonicalArtifact({ root: args.root, relativePath: args.sourceMap, label: 'CAL-002 source map' }),
      batch.map((row) => row.reviewId),
    );
  let state = await loadState(args, assignment, batch);
  if (state.status === 'completed') {
    await resumeCompletedReview(args, state);
    return;
  }
  const readSource = sourceReader(args, assignment, batch, sources);
  const input = createInterface({ input: process.stdin, terminal: false, crlfDelay: Infinity });
  const lines = input[Symbol.asyncIterator]();
  try {
    while (true) {
      const reviewId = nextCAL002ReviewId(state);
      if (reviewId === undefined) break;
      const observation = batch.find((row) => row.reviewId === reviewId)!;
      const sourceText = await readSource(observation);
      process.stderr.write([
        `Review ${reviewId}`,
        `ruleId: ${observation.ruleId}`,
        `evidenceClass: ${observation.evidenceClass}`,
        `lineWindowLocator: ${observation.lineWindowLocator}`,
        `Source context (SHA-256 verified; maximum ${DISPLAY_SOURCE_BYTE_LIMIT} bytes):`,
        safeDisplayedSource(sourceText),
      ].join('\n'));

      while (true) {
        process.stderr.write(`${MENU}\n`);
        const next = await lines.next();
        const key = next.done ? undefined : next.value;
        if (key === 'q') {
          await writeReviewState({ root: args.root, relativePath: args.state, state });
          machineOutput({ ok: true, command: args.command, status: 'paused', ...progress(state), nextReviewId: reviewId });
          return;
        }
        const label = key === undefined ? undefined : LABEL_BY_KEY[key];
        if (label === undefined) {
          if (key === undefined) {
            await writeReviewState({ root: args.root, relativePath: args.state, state });
            machineOutput({ ok: true, command: args.command, status: 'paused', ...progress(state), nextReviewId: reviewId });
            return;
          }
          process.stderr.write('Invalid selection; choose one closed menu key.\n');
          continue;
        }
        state = recordCAL002Review(state, reviewId, label);
        await writeReviewState({ root: args.root, relativePath: args.state, state });
        break;
      }
    }

    const completed = completeCAL002Review({
      state,
      reviewerAuthority: 'repository-owner',
      implementationCommitSha: resolveImplementationCommitSha(args),
    });
    await writeImmutableReceipt({ root: args.root, relativePath: args.receipt, receipt: completed.receipt });
    await writeReviewState({ root: args.root, relativePath: args.state, state: completed.state });
    machineOutput({
      ok: true,
      command: args.command,
      status: 'completed',
      ...progress(completed.state),
      stateSha256: completed.stateSha256,
      receiptSha256: completed.receiptSha256,
    });
  } finally {
    input.close();
  }
}

async function main(): Promise<void> {
  let command = process.argv[2] ?? 'unknown';
  try {
    const args = parseArguments(process.argv.slice(2));
    command = args.command;
    await reviewQuality(args);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    process.stderr.write(`CAL-002 ${command}: ${message}\n`);
    machineOutput({ ok: false, command, error: message });
    process.exitCode = 2;
  }
}

await main();
