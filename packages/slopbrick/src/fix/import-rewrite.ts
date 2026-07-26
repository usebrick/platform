import { createHash, randomBytes } from 'node:crypto';
import {
  closeSync,
  constants,
  existsSync,
  fchmodSync,
  fsyncSync,
  lstatSync,
  openSync,
  readFileSync,
  renameSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs';
import { basename, dirname, join } from 'node:path';
import type {
  FixSuggestion,
  Issue,
  IssueEvidenceLocation,
  IssueEvidencePosition,
  ResolvedConfig,
} from '../types';

export type ExactImportRewriteRejectReason =
  | 'no-candidates'
  | 'invalid-evidence'
  | 'stale-finding'
  | 'unsupported-source'
  | 'ambiguous-finding'
  | 'already-fixed'
  | 'stale-repair'
  | 'receipt-mismatch'
  | 'unauthorized-repair'
  | 'write-failed'
  | 'rollback-failed';

export interface ExactImportRewriteInput {
  oldValue: string;
  newValue: string;
  location: IssueEvidenceLocation;
}

export interface ExactImportRewriteEdit extends ExactImportRewriteInput {
  startOffset: number;
  endOffsetExclusive: number;
}

export interface ExactImportRewritePlan {
  kind: 'slopbrick-exact-import-rewrite-plan-v1';
  before: string;
  after: string;
  beforeSha256: string;
  afterSha256: string;
  edits: ExactImportRewriteEdit[];
}

export type ExactImportRewritePlanResult =
  | { status: 'planned'; plan: ExactImportRewritePlan }
  | { status: 'rejected'; reason: ExactImportRewriteRejectReason };

export interface ExactImportRewriteReceipt {
  kind: 'slopbrick-exact-import-rewrite-receipt-v1';
  filePath: string;
  beforeSha256: string;
  afterSha256: string;
  originalBytes: Uint8Array;
}

export type ExactImportRewriteApplyResult =
  | { status: 'applied'; receipt: ExactImportRewriteReceipt }
  | { status: 'rejected'; reason: ExactImportRewriteRejectReason };

export type ExactImportRewriteRollbackResult =
  | { status: 'rolled-back' }
  | { status: 'rejected'; reason: ExactImportRewriteRejectReason };

export type ExactImportRewriteInputResult =
  | { status: 'accepted'; input: ExactImportRewriteInput }
  | { status: 'rejected'; reason: ExactImportRewriteRejectReason };

function sha256Bytes(value: Uint8Array): string {
  return createHash('sha256').update(value).digest('hex');
}

interface ExactFileSnapshot {
  bytes: Buffer;
  device: number;
  inode: number;
  mode: number;
}

type AtomicPublicationResult = 'published' | 'stale-target' | 'failed' | 'verification-failed';

function readRegularFileSnapshot(filePath: string): ExactFileSnapshot | undefined {
  try {
    const before = lstatSync(filePath);
    if (!before.isFile() || before.isSymbolicLink()) return undefined;
    const bytes = readFileSync(filePath);
    const after = lstatSync(filePath);
    if (
      !after.isFile()
      || after.isSymbolicLink()
      || before.dev !== after.dev
      || before.ino !== after.ino
    ) return undefined;
    return {
      bytes,
      device: after.dev,
      inode: after.ino,
      mode: after.mode & 0o777,
    };
  } catch {
    return undefined;
  }
}

/**
 * Stage replacement bytes beside the target and publish with one rename. Any
 * failure before rename leaves the source inode untouched. The target identity
 * and exact bytes are rechecked after staging so stale state observed before
 * publication is rejected; rename then prevents a partially written target.
 */
function publishBytesAtomically(
  filePath: string,
  expected: ExactFileSnapshot,
  replacement: Uint8Array,
): AtomicPublicationResult {
  const temporaryPath = join(
    dirname(filePath),
    `.${basename(filePath)}.${process.pid}.${randomBytes(12).toString('hex')}.tmp`,
  );
  let descriptor: number | undefined;

  try {
    descriptor = openSync(
      temporaryPath,
      constants.O_WRONLY
        | constants.O_CREAT
        | constants.O_EXCL
        | (constants.O_NOFOLLOW ?? 0),
      expected.mode,
    );
    fchmodSync(descriptor, expected.mode);
    writeFileSync(descriptor, replacement);
    fsyncSync(descriptor);
    closeSync(descriptor);
    descriptor = undefined;

    const current = readRegularFileSnapshot(filePath);
    if (
      !current
      || current.device !== expected.device
      || current.inode !== expected.inode
      || current.mode !== expected.mode
      || !current.bytes.equals(expected.bytes)
    ) return 'stale-target';

    renameSync(temporaryPath, filePath);
    const published = readRegularFileSnapshot(filePath);
    if (
      !published
      || published.mode !== expected.mode
      || !published.bytes.equals(Buffer.from(replacement))
    ) return 'verification-failed';
    return 'published';
  } catch {
    return 'failed';
  } finally {
    if (descriptor !== undefined) {
      try { closeSync(descriptor); } catch { /* preserve publication result */ }
    }
    if (existsSync(temporaryPath)) {
      try { unlinkSync(temporaryPath); } catch { /* best-effort unique temp cleanup */ }
    }
  }
}

function offsetAtPosition(
  source: string,
  position: IssueEvidencePosition,
): number | undefined {
  if (
    !Number.isInteger(position.line)
    || !Number.isInteger(position.column)
    || position.line < 1
    || position.column < 1
  ) {
    return undefined;
  }

  let lineStart = 0;
  for (let line = 1; line < position.line; line += 1) {
    const newline = source.indexOf('\n', lineStart);
    if (newline === -1) return undefined;
    lineStart = newline + 1;
  }

  const lineEnd = source.indexOf('\n', lineStart);
  const boundedLineEnd = lineEnd === -1 ? source.length : lineEnd;
  const offset = lineStart + position.column - 1;
  return offset >= lineStart && offset < boundedLineEnd ? offset : undefined;
}

function isLiteralSpecifier(value: string): boolean {
  return value.length > 0
    && value === value.trim()
    && !/['"\\\0\r\n]/.test(value);
}

export function exactImportRewriteInputFromFinding(
  issue: Issue,
  fix: FixSuggestion,
  config: ResolvedConfig,
): ExactImportRewriteInputResult {
  if (
    fix.kind !== 'module-specifier'
    || issue.ruleId !== 'context/import-path-mismatch'
    || !issue.filePath
    || fix.targetFile !== issue.filePath
    || typeof fix.oldValue !== 'string'
    || typeof fix.newValue !== 'string'
  ) {
    return { status: 'rejected', reason: 'unauthorized-repair' };
  }

  const oldValue = fix.oldValue;
  const newValue = fix.newValue;
  const rewrites = config.mend?.importRewrites;
  if (
    !rewrites
    || !Object.prototype.hasOwnProperty.call(rewrites, oldValue)
    || rewrites[oldValue] !== newValue
    || !Array.isArray(config.allowedImports)
    || !config.allowedImports.some((prefix) => newValue.startsWith(prefix))
  ) {
    return { status: 'rejected', reason: 'unauthorized-repair' };
  }

  const evidence = issue.evidence;
  if (
    evidence?.status !== 'exact'
    || evidence.kind !== 'matched-source-span'
    || evidence.snippet !== oldValue
    || evidence.matched.field !== 'import-source'
    || evidence.matched.key !== 'module-specifier'
    || evidence.matched.value !== oldValue
    || evidence.details?.policyField !== 'allowedImports'
  ) {
    return { status: 'rejected', reason: 'invalid-evidence' };
  }

  return {
    status: 'accepted',
    input: {
      oldValue,
      newValue,
      location: evidence.location,
    },
  };
}

function resolveEdit(
  source: string,
  input: ExactImportRewriteInput,
): ExactImportRewriteEdit | ExactImportRewriteRejectReason {
  if (
    input.location.start.line !== input.location.end.line
    || !isLiteralSpecifier(input.oldValue)
    || !isLiteralSpecifier(input.newValue)
  ) {
    return 'unsupported-source';
  }
  if (input.oldValue === input.newValue) return 'already-fixed';

  const startOffset = offsetAtPosition(source, input.location.start);
  const inclusiveEndOffset = offsetAtPosition(source, input.location.end);
  if (startOffset === undefined || inclusiveEndOffset === undefined) {
    return 'invalid-evidence';
  }
  const endOffsetExclusive = inclusiveEndOffset + 1;
  if (startOffset >= endOffsetExclusive) return 'invalid-evidence';
  if (source.slice(startOffset, endOffsetExclusive) !== input.oldValue) {
    return 'stale-finding';
  }

  const openingQuote = source[startOffset - 1];
  const closingQuote = source[endOffsetExclusive];
  if (
    (openingQuote !== "'" && openingQuote !== '"')
    || closingQuote !== openingQuote
  ) {
    return 'unsupported-source';
  }

  return {
    ...input,
    startOffset,
    endOffsetExclusive,
  };
}

/**
 * Deep boundary for MEND-001: both preview and mutation consume this one pure
 * exact-span plan, so neither path can fall back to global string replacement.
 */
export function planExactImportRewrites(
  source: string,
  inputs: readonly ExactImportRewriteInput[],
): ExactImportRewritePlanResult {
  if (inputs.length === 0) return { status: 'rejected', reason: 'no-candidates' };

  const edits: ExactImportRewriteEdit[] = [];
  for (const input of inputs) {
    const resolved = resolveEdit(source, input);
    if (typeof resolved === 'string') {
      return { status: 'rejected', reason: resolved };
    }
    edits.push(resolved);
  }

  edits.sort((left, right) => left.startOffset - right.startOffset);
  for (let index = 1; index < edits.length; index += 1) {
    if (edits[index]!.startOffset < edits[index - 1]!.endOffsetExclusive) {
      return { status: 'rejected', reason: 'ambiguous-finding' };
    }
  }

  let after = source;
  for (const edit of [...edits].reverse()) {
    after = after.slice(0, edit.startOffset)
      + edit.newValue
      + after.slice(edit.endOffsetExclusive);
  }
  if (after === source) return { status: 'rejected', reason: 'already-fixed' };

  return {
    status: 'planned',
    plan: {
      kind: 'slopbrick-exact-import-rewrite-plan-v1',
      before: source,
      after,
      beforeSha256: sha256Bytes(Buffer.from(source, 'utf8')),
      afterSha256: sha256Bytes(Buffer.from(after, 'utf8')),
      edits,
    },
  };
}

export function applyExactImportRewritePlan(
  filePath: string,
  plan: ExactImportRewritePlan,
): ExactImportRewriteApplyResult {
  const snapshot = readRegularFileSnapshot(filePath);
  if (!snapshot) return { status: 'rejected', reason: 'stale-finding' };
  const originalBytes = snapshot.bytes;

  const decoded = originalBytes.toString('utf8');
  if (
    !Buffer.from(decoded, 'utf8').equals(originalBytes)
    || decoded !== plan.before
    || sha256Bytes(originalBytes) !== plan.beforeSha256
  ) {
    return { status: 'rejected', reason: 'stale-finding' };
  }

  const afterBytes = Buffer.from(plan.after, 'utf8');
  if (sha256Bytes(afterBytes) !== plan.afterSha256) {
    return { status: 'rejected', reason: 'stale-repair' };
  }

  const publication = publishBytesAtomically(filePath, snapshot, afterBytes);
  if (publication === 'stale-target') {
    return { status: 'rejected', reason: 'stale-finding' };
  }
  if (publication === 'verification-failed') {
    return { status: 'rejected', reason: 'stale-repair' };
  }
  if (publication === 'failed') return { status: 'rejected', reason: 'write-failed' };

  return {
    status: 'applied',
    receipt: {
      kind: 'slopbrick-exact-import-rewrite-receipt-v1',
      filePath,
      beforeSha256: plan.beforeSha256,
      afterSha256: plan.afterSha256,
      originalBytes: Uint8Array.from(originalBytes),
    },
  };
}

export function rollbackExactImportRewrite(
  filePath: string,
  receipt: ExactImportRewriteReceipt,
): ExactImportRewriteRollbackResult {
  if (receipt.filePath !== filePath) {
    return { status: 'rejected', reason: 'receipt-mismatch' };
  }
  if (sha256Bytes(receipt.originalBytes) !== receipt.beforeSha256) {
    return { status: 'rejected', reason: 'receipt-mismatch' };
  }

  const snapshot = readRegularFileSnapshot(filePath);
  if (!snapshot || sha256Bytes(snapshot.bytes) !== receipt.afterSha256) {
    return { status: 'rejected', reason: 'stale-repair' };
  }

  const publication = publishBytesAtomically(filePath, snapshot, receipt.originalBytes);
  if (publication === 'stale-target') {
    return { status: 'rejected', reason: 'stale-repair' };
  }
  if (publication !== 'published') return { status: 'rejected', reason: 'rollback-failed' };

  return { status: 'rolled-back' };
}
