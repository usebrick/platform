import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import type { IssueEvidenceLocation, IssueEvidencePosition } from '../types';

export type ExactImportRewriteRejectReason =
  | 'no-candidates'
  | 'invalid-evidence'
  | 'stale-finding'
  | 'unsupported-source'
  | 'ambiguous-finding'
  | 'already-fixed'
  | 'stale-repair'
  | 'receipt-mismatch'
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

function sha256Bytes(value: Uint8Array): string {
  return createHash('sha256').update(value).digest('hex');
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
  let originalBytes: Buffer;
  try {
    originalBytes = readFileSync(filePath);
  } catch {
    return { status: 'rejected', reason: 'stale-finding' };
  }

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

  try {
    writeFileSync(filePath, afterBytes);
  } catch {
    return { status: 'rejected', reason: 'write-failed' };
  }

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

  let currentBytes: Buffer;
  try {
    currentBytes = readFileSync(filePath);
  } catch {
    return { status: 'rejected', reason: 'stale-repair' };
  }
  if (sha256Bytes(currentBytes) !== receipt.afterSha256) {
    return { status: 'rejected', reason: 'stale-repair' };
  }

  try {
    writeFileSync(filePath, receipt.originalBytes);
    if (sha256Bytes(readFileSync(filePath)) !== receipt.beforeSha256) {
      return { status: 'rejected', reason: 'rollback-failed' };
    }
  } catch {
    return { status: 'rejected', reason: 'rollback-failed' };
  }

  return { status: 'rolled-back' };
}
