import { createHash } from 'node:crypto';
import { canonicalJson } from '../v103/canonical';
import type { CorpusV1CandidateManifestRow } from './manifest';
import type { CorpusV1PlannedRow } from './plan';
import {
  buildCorpusV1Smoke,
  type CorpusV1SmokeInput,
  type CorpusV1SmokeResult,
} from './smoke';

const SHA256_PATTERN = /^[a-f0-9]{64}$/u;

export const CORPUS_V1_ELIGIBLE_MANIFEST_VERSION = 'corpus-v1-eligible-manifest-v1' as const;
export const CORPUS_V1_ELIGIBLE_RECEIPT_VERSION = 'corpus-v1-eligible-projection-receipt-v1' as const;

export interface CorpusV1EligibleManifestHeader {
  readonly kind: 'corpus-v1-eligible-manifest';
  readonly version: typeof CORPUS_V1_ELIGIBLE_MANIFEST_VERSION;
  readonly sourceId: string;
  readonly sourceArchiveSha256: string;
  readonly sourceBindingReceiptSha256: string;
  readonly candidateManifestSha256: string;
  readonly planSha256: string;
  readonly smokeManifestSha256: string;
  readonly smokeReceiptSha256: string;
  readonly rows: number;
}

export interface CorpusV1EligibleManifest {
  readonly header: CorpusV1EligibleManifestHeader;
  readonly rows: readonly CorpusV1PlannedRow[];
}

export interface CorpusV1EligibleReceipt {
  readonly version: typeof CORPUS_V1_ELIGIBLE_RECEIPT_VERSION;
  readonly sourceId: string;
  readonly sourceArchiveSha256: string;
  readonly sourceBindingReceiptSha256: string;
  readonly candidateManifestSha256: string;
  readonly planSha256: string;
  readonly smokeManifestSha256: string;
  readonly smokeReceiptSha256: string;
  readonly manifestSha256: string;
  readonly eligible: { readonly positive: number; readonly negative: number; readonly total: number };
  readonly quarantined: { readonly positive: number; readonly negative: number; readonly total: number };
  readonly splits: Readonly<Record<'train' | 'validation' | 'test', number>>;
  readonly unresolvedCrossLabelCollisions: { readonly exact: number; readonly normalized: number };
  readonly resource: {
    readonly workers: 1;
    readonly candidateRowsRead: number;
    readonly eligibleRowsProjected: number;
    readonly candidateBytesAccounted: number;
    readonly eligibleBytesAccounted: number;
    readonly maxUnitBytes: number;
  };
  readonly candidateCodeExecuted: false;
  readonly admitted: false;
  readonly authorityTier: 'publisher_attested';
  readonly rightsDisposition: 'internal_analysis';
}

export interface ProjectCorpusV1EligibleRowsInput extends CorpusV1SmokeInput {
  readonly smoke: CorpusV1SmokeResult;
}

export interface CorpusV1EligibleProjectionResult {
  readonly manifest: CorpusV1EligibleManifest;
  readonly manifestJsonl: string;
  readonly manifestSha256: string;
  readonly receipt: CorpusV1EligibleReceipt;
  readonly receiptJson: string;
  readonly receiptSha256: string;
}

function sha256(value: Uint8Array | string): string {
  return createHash('sha256').update(value).digest('hex');
}

function compare(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function assertSha256(value: unknown, name: string): asserts value is string {
  if (typeof value !== 'string' || !SHA256_PATTERN.test(value)) throw new Error(`${name} must be a lowercase SHA-256`);
}

function renderRowsJsonl(rows: readonly CorpusV1PlannedRow[]): string {
  const sorted = [...rows].sort((left, right) => compare(left.sourceRecordId, right.sourceRecordId));
  return sorted.length === 0 ? '' : `${sorted.map((row) => canonicalJson(row)).join('\n')}\n`;
}

function collisionUnits(
  rows: readonly CorpusV1PlannedRow[],
  key: (row: CorpusV1PlannedRow) => string | null,
): ReadonlySet<string> {
  const groups = new Map<string, CorpusV1PlannedRow[]>();
  for (const row of rows) {
    const value = key(row);
    if (value === null) continue;
    const group = groups.get(value) ?? [];
    group.push(row);
    groups.set(value, group);
  }
  const result = new Set<string>();
  for (const group of groups.values()) {
    if (new Set(group.map((row) => row.label)).size < 2) continue;
    for (const row of group) result.add(row.unitId);
  }
  return result;
}

function countLabel(rows: readonly CorpusV1PlannedRow[], label: 'positive' | 'negative'): number {
  return rows.filter((row) => row.label === label).length;
}

function countBytes(rows: readonly CorpusV1CandidateManifestRow[] | readonly CorpusV1PlannedRow[]): number {
  return rows.reduce((total, row) => total + row.byteCount, 0);
}

function verifySmoke(input: ProjectCorpusV1EligibleRowsInput): void {
  const rebuilt = buildCorpusV1Smoke(input);
  if (
    rebuilt.manifestJsonl !== input.smoke.manifestJsonl
    || rebuilt.manifestSha256 !== input.smoke.manifestSha256
    || rebuilt.receiptJson !== input.smoke.receiptJson
    || rebuilt.receiptSha256 !== input.smoke.receiptSha256
  ) {
    throw new Error('Corpus v1 eligible projection smoke artifact is not verified');
  }
}

/**
 * Project the full eligible local plan after the 100/100 smoke gate. This is
 * still a read-only internal-analysis projection: it contains metadata only,
 * records deterministic byte accounting, and never admits or executes code.
 */
export function projectCorpusV1EligibleRows(
  input: ProjectCorpusV1EligibleRowsInput,
): CorpusV1EligibleProjectionResult {
  verifySmoke(input);
  const eligibleRows = input.plan.rows.filter((row) => row.status === 'eligible');
  const quarantinedRows = input.plan.rows.filter((row) => row.status === 'quarantined');
  const exactUnresolved = collisionUnits(eligibleRows, (row) => row.contentSha256);
  const normalizedUnresolved = collisionUnits(eligibleRows, (row) => row.normalizedSha256);
  if (exactUnresolved.size > 0 || normalizedUnresolved.size > 0) {
    throw new Error('Corpus v1 eligible projection has unresolved cross-label collisions');
  }
  const sourceId = input.smoke.manifest.header.sourceId;
  const sourceArchiveSha256 = input.smoke.manifest.header.sourceArchiveSha256;
  assertSha256(sourceArchiveSha256, 'eligible source archive');
  const header: CorpusV1EligibleManifestHeader = {
    kind: 'corpus-v1-eligible-manifest',
    version: CORPUS_V1_ELIGIBLE_MANIFEST_VERSION,
    sourceId,
    sourceArchiveSha256,
    sourceBindingReceiptSha256: input.sourceBinding.receiptSha256,
    candidateManifestSha256: input.candidate.manifestSha256,
    planSha256: input.plan.planSha256,
    smokeManifestSha256: input.smoke.manifestSha256,
    smokeReceiptSha256: input.smoke.receiptSha256,
    rows: eligibleRows.length,
  };
  const manifest: CorpusV1EligibleManifest = { header, rows: eligibleRows };
  const manifestJsonl = `${canonicalJson(header)}\n${renderRowsJsonl(eligibleRows)}`;
  const manifestSha256 = sha256(manifestJsonl);
  const eligiblePositive = countLabel(eligibleRows, 'positive');
  const quarantinedPositive = countLabel(quarantinedRows, 'positive');
  const receipt: CorpusV1EligibleReceipt = {
    version: CORPUS_V1_ELIGIBLE_RECEIPT_VERSION,
    sourceId,
    sourceArchiveSha256,
    sourceBindingReceiptSha256: input.sourceBinding.receiptSha256,
    candidateManifestSha256: input.candidate.manifestSha256,
    planSha256: input.plan.planSha256,
    smokeManifestSha256: input.smoke.manifestSha256,
    smokeReceiptSha256: input.smoke.receiptSha256,
    manifestSha256,
    eligible: { positive: eligiblePositive, negative: eligibleRows.length - eligiblePositive, total: eligibleRows.length },
    quarantined: { positive: quarantinedPositive, negative: quarantinedRows.length - quarantinedPositive, total: quarantinedRows.length },
    splits: {
      train: eligibleRows.filter((row) => row.split === 'train').length,
      validation: eligibleRows.filter((row) => row.split === 'validation').length,
      test: eligibleRows.filter((row) => row.split === 'test').length,
    },
    unresolvedCrossLabelCollisions: { exact: exactUnresolved.size, normalized: normalizedUnresolved.size },
    resource: {
      workers: 1,
      candidateRowsRead: input.candidate.rows.length,
      eligibleRowsProjected: eligibleRows.length,
      candidateBytesAccounted: countBytes(input.candidate.rows),
      eligibleBytesAccounted: countBytes(eligibleRows),
      maxUnitBytes: Math.max(...input.candidate.rows.map((row) => row.byteCount)),
    },
    candidateCodeExecuted: false,
    admitted: false,
    authorityTier: 'publisher_attested',
    rightsDisposition: 'internal_analysis',
  };
  const receiptJson = canonicalJson(receipt);
  return {
    manifest,
    manifestJsonl,
    manifestSha256,
    receipt,
    receiptJson,
    receiptSha256: sha256(receiptJson),
  };
}
