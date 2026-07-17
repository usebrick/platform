import { createHash } from 'node:crypto';
import { canonicalJson, canonicalSha256 } from '../v103/canonical';
import type { CorpusV1CandidateManifestResult, CorpusV1CandidateManifestRow } from './manifest';
import type { CorpusV1PlanResult, CorpusV1PlannedRow } from './plan';
import type { CorpusV1SourceBindingResult } from './source-binding';

const SHA256_PATTERN = /^[a-f0-9]{64}$/u;

export const CORPUS_V1_SMOKE_SELECTION_VERSION = 'corpus-v1-smoke-hash-rank-v1' as const;
export const CORPUS_V1_SMOKE_MANIFEST_VERSION = 'corpus-v1-smoke-manifest-v1' as const;
export const CORPUS_V1_SMOKE_RECEIPT_VERSION = 'corpus-v1-smoke-receipt-v1' as const;
export const CORPUS_V1_SMOKE_ROWS_PER_LABEL = 100 as const;

export interface CorpusV1SmokeManifestRow extends CorpusV1PlannedRow {
  readonly selectionRank: number;
  readonly selectionSha256: string;
}

export interface CorpusV1SmokeManifestHeader {
  readonly kind: 'corpus-v1-smoke-manifest';
  readonly version: typeof CORPUS_V1_SMOKE_MANIFEST_VERSION;
  readonly selectionVersion: typeof CORPUS_V1_SMOKE_SELECTION_VERSION;
  readonly sourceId: string;
  readonly sourceArchiveSha256: string;
  readonly sourceBindingReceiptSha256: string;
  readonly candidateManifestSha256: string;
  readonly planSha256: string;
  readonly selected: {
    readonly positive: number;
    readonly negative: number;
    readonly total: number;
  };
}

export interface CorpusV1SmokeManifest {
  readonly header: CorpusV1SmokeManifestHeader;
  readonly rows: readonly CorpusV1SmokeManifestRow[];
}

export interface CorpusV1SmokeReceipt {
  readonly version: typeof CORPUS_V1_SMOKE_RECEIPT_VERSION;
  readonly selectionVersion: typeof CORPUS_V1_SMOKE_SELECTION_VERSION;
  readonly source: {
    readonly sourceId: string;
    readonly sourceArchiveSha256: string;
    readonly csvSha256: string;
    readonly projectionManifestSha256: string;
    readonly sourceBindingReceiptSha256: string;
  };
  readonly sourceBindingReceiptSha256: string;
  readonly candidateManifestSha256: string;
  readonly planSha256: string;
  readonly manifestSha256: string;
  readonly eligible: {
    readonly records: { readonly positive: number; readonly negative: number; readonly total: number };
    readonly uniqueContentUnits: { readonly positive: number; readonly negative: number; readonly total: number };
  };
  readonly selected: { readonly positive: number; readonly negative: number; readonly total: number };
  readonly selectedBySplit: Readonly<Record<'train' | 'validation' | 'test', number>>;
  readonly admitted: false;
  readonly authorityTier: 'publisher_attested';
  readonly rightsDisposition: 'internal_analysis';
}

export interface CorpusV1SmokeInput {
  readonly candidate: CorpusV1CandidateManifestResult;
  readonly plan: CorpusV1PlanResult;
  readonly sourceBinding: CorpusV1SourceBindingResult;
}

export interface CorpusV1SmokeResult {
  readonly manifest: CorpusV1SmokeManifest;
  readonly manifestJsonl: string;
  readonly manifestSha256: string;
  readonly receipt: CorpusV1SmokeReceipt;
  readonly receiptJson: string;
  readonly receiptSha256: string;
}

function sha256(value: Uint8Array | string): string {
  return createHash('sha256').update(value).digest('hex');
}

function assertSha256(value: unknown, name: string): asserts value is string {
  if (typeof value !== 'string' || !SHA256_PATTERN.test(value)) {
    throw new Error(`${name} must be a lowercase SHA-256`);
  }
}

function compare(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function renderRowsJsonl(rows: readonly CorpusV1CandidateManifestRow[] | readonly CorpusV1PlannedRow[]): string {
  const sorted = [...rows].sort((left, right) => compare(left.sourceRecordId, right.sourceRecordId));
  return sorted.length === 0 ? '' : `${sorted.map((row) => canonicalJson(row)).join('\n')}\n`;
}

function smokeIdentity(row: CorpusV1CandidateManifestRow | CorpusV1PlannedRow): unknown {
  const { split: _split, status: _status, quarantineReasons: _quarantineReasons, ...identity } = row;
  return identity;
}

function assertCandidateAndPlanBinding(
  candidate: CorpusV1CandidateManifestResult,
  plan: CorpusV1PlanResult,
): void {
  const candidateJsonl = renderRowsJsonl(candidate.rows);
  if (candidate.manifestSha256 !== sha256(candidateJsonl) || candidate.manifestJsonl !== candidateJsonl) {
    throw new Error('Corpus v1 smoke candidate manifest hash or bytes are not verified');
  }
  const planJsonl = renderRowsJsonl(plan.rows);
  if (plan.planSha256 !== sha256(planJsonl) || plan.planJsonl !== planJsonl) {
    throw new Error('Corpus v1 smoke leakage plan hash or bytes are not verified');
  }
  if (candidate.rows.length !== plan.rows.length) {
    throw new Error('Corpus v1 smoke candidate manifest and leakage plan row counts differ');
  }
  const candidatePositive = candidate.rows.filter((row) => row.label === 'positive').length;
  const candidateQuarantined = candidate.rows.filter((row) => row.status === 'quarantined').length;
  if (
    candidate.counts.raw !== candidate.rows.length
    || candidate.counts.candidate !== candidate.rows.length - candidateQuarantined
    || candidate.counts.quarantined !== candidateQuarantined
    || candidate.counts.positive !== candidatePositive
    || candidate.counts.negative !== candidate.rows.length - candidatePositive
  ) {
    throw new Error('Corpus v1 smoke candidate manifest counts are not reconciled');
  }

  const candidateByUnitId = new Map<string, CorpusV1CandidateManifestRow>();
  const candidateSourceRecordIds = new Set<string>();
  for (const row of candidate.rows) {
    if (candidateByUnitId.has(row.unitId)) throw new Error(`duplicate candidate unitId: ${row.unitId}`);
    if (candidateSourceRecordIds.has(row.sourceRecordId)) throw new Error(`duplicate candidate sourceRecordId: ${row.sourceRecordId}`);
    candidateByUnitId.set(row.unitId, row);
    candidateSourceRecordIds.add(row.sourceRecordId);
  }
  const plannedUnitIds = new Set<string>();
  const plannedSourceRecordIds = new Set<string>();
  for (const planned of plan.rows) {
    if (plannedUnitIds.has(planned.unitId)) throw new Error(`duplicate planned unitId: ${planned.unitId}`);
    if (plannedSourceRecordIds.has(planned.sourceRecordId)) throw new Error(`duplicate planned sourceRecordId: ${planned.sourceRecordId}`);
    plannedUnitIds.add(planned.unitId);
    plannedSourceRecordIds.add(planned.sourceRecordId);
    if (planned.status === 'eligible' && (planned.split === 'quarantine' || planned.quarantineReasons.length > 0)) {
      throw new Error(`eligible planned unit is quarantined: ${planned.unitId}`);
    }
    if (planned.status === 'quarantined' && (planned.split !== 'quarantine' || planned.quarantineReasons.length === 0)) {
      throw new Error(`quarantined planned unit has an invalid state: ${planned.unitId}`);
    }
    const candidateRow = candidateByUnitId.get(planned.unitId);
    if (candidateRow === undefined || canonicalJson(smokeIdentity(candidateRow)) !== canonicalJson(smokeIdentity(planned))) {
      throw new Error(`Corpus v1 smoke leakage plan is not bound to candidate unit ${planned.unitId}`);
    }
  }
  if (plannedUnitIds.size !== candidateByUnitId.size) {
    throw new Error('Corpus v1 smoke candidate manifest contains rows absent from the leakage plan');
  }
}

function assertSourceBinding(
  candidate: CorpusV1CandidateManifestResult,
  sourceBinding: CorpusV1SourceBindingResult,
): { readonly sourceId: string; readonly sourceArchiveSha256: string } {
  const receiptJson = canonicalJson(sourceBinding.receipt);
  if (sourceBinding.receiptJson !== receiptJson || sourceBinding.receiptSha256 !== sha256(receiptJson)) {
    throw new Error('Corpus v1 smoke source-binding receipt is not verified');
  }
  for (const [name, value] of [
    ['CSV', sourceBinding.receipt.csvSha256],
    ['projection manifest', sourceBinding.receipt.projectionManifestSha256],
    ['row binding', sourceBinding.receipt.rowBindingSha256],
  ] as const) assertSha256(value, `source-binding ${name} hash`);
  const positive = candidate.rows.filter((row) => row.label === 'positive').length;
  const negative = candidate.rows.length - positive;
  if (
    sourceBinding.receipt.rows.matched !== candidate.rows.length
    || sourceBinding.receipt.rows.positive !== positive
    || sourceBinding.receipt.rows.negative !== negative
  ) {
    throw new Error('Corpus v1 smoke source-binding receipt does not reconcile with candidate rows');
  }
  const sourceIds = new Set(candidate.rows.map((row) => row.sourceId));
  if (sourceIds.size !== 1 || !sourceIds.has(sourceBinding.receipt.sourceId)) {
    throw new Error('Corpus v1 smoke source identity is not bound');
  }
  for (const row of candidate.rows) assertSha256(row.sourceArchiveSha256, `source archive for ${row.unitId}`);
  const sourceArchiveSha256 = candidate.rows[0]?.sourceArchiveSha256;
  if (sourceArchiveSha256 === undefined || candidate.rows.some((row) => row.sourceArchiveSha256 !== sourceArchiveSha256)) {
    throw new Error('Corpus v1 smoke candidate rows do not share one source archive');
  }
  return { sourceId: sourceBinding.receipt.sourceId, sourceArchiveSha256 };
}

function selectionSha256(row: CorpusV1PlannedRow): string {
  return canonicalSha256({
    selectionVersion: CORPUS_V1_SMOKE_SELECTION_VERSION,
    label: row.label,
    unitId: row.unitId,
    sourceRecordId: row.sourceRecordId,
    contentSha256: row.contentSha256,
  });
}

function selectOwners(rows: readonly CorpusV1PlannedRow[], label: 'positive' | 'negative'): CorpusV1SmokeManifestRow[] {
  const owners = new Map<string, CorpusV1PlannedRow>();
  for (const row of rows) {
    if (row.status !== 'eligible' || row.split === 'quarantine' || row.quarantineReasons.length > 0 || row.label !== label) continue;
    assertSha256(row.contentSha256, `content hash for ${row.unitId}`);
    const key = `${label}\u0000${row.contentSha256}`;
    const current = owners.get(key);
    if (current === undefined || compare(row.sourceRecordId, current.sourceRecordId) < 0) owners.set(key, row);
  }
  const ranked = [...owners.values()]
    .map((row) => ({ row, selectionSha256: selectionSha256(row) }))
    .sort((left, right) => compare(left.selectionSha256, right.selectionSha256)
      || compare(left.row.sourceRecordId, right.row.sourceRecordId)
      || compare(left.row.unitId, right.row.unitId));
  if (ranked.length < CORPUS_V1_SMOKE_ROWS_PER_LABEL) {
    throw new Error(`Corpus v1 smoke lacks ${CORPUS_V1_SMOKE_ROWS_PER_LABEL} unique eligible ${label} code units: found ${ranked.length}`);
  }
  return ranked.slice(0, CORPUS_V1_SMOKE_ROWS_PER_LABEL).map(({ row, selectionSha256: selectedHash }, index) => ({
    ...row,
    selectionRank: index + 1,
    selectionSha256: selectedHash,
  }));
}

function renderSmokeManifestJsonl(header: CorpusV1SmokeManifestHeader, rows: readonly CorpusV1SmokeManifestRow[]): string {
  return `${canonicalJson(header)}\n${rows.map((row) => canonicalJson(row)).join('\n')}\n`;
}

/**
 * Build a deterministic diagnostic smoke cohort from verified candidate and
 * leakage-plan artifacts. This never admits, copies, or executes candidate
 * code; the output contains metadata and hashes only.
 */
export function buildCorpusV1Smoke(input: CorpusV1SmokeInput): CorpusV1SmokeResult {
  assertCandidateAndPlanBinding(input.candidate, input.plan);
  const source = assertSourceBinding(input.candidate, input.sourceBinding);
  const positive = selectOwners(input.plan.rows, 'positive');
  const negative = selectOwners(input.plan.rows, 'negative');
  const rows = [...positive, ...negative];
  const header: CorpusV1SmokeManifestHeader = {
    kind: 'corpus-v1-smoke-manifest',
    version: CORPUS_V1_SMOKE_MANIFEST_VERSION,
    selectionVersion: CORPUS_V1_SMOKE_SELECTION_VERSION,
    sourceId: source.sourceId,
    sourceArchiveSha256: source.sourceArchiveSha256,
    sourceBindingReceiptSha256: input.sourceBinding.receiptSha256,
    candidateManifestSha256: input.candidate.manifestSha256,
    planSha256: input.plan.planSha256,
    selected: { positive: positive.length, negative: negative.length, total: rows.length },
  };
  const manifest: CorpusV1SmokeManifest = { header, rows };
  const manifestJsonl = renderSmokeManifestJsonl(header, rows);
  const manifestSha256 = sha256(manifestJsonl);
  const selectedBySplit = {
    train: rows.filter((row) => row.split === 'train').length,
    validation: rows.filter((row) => row.split === 'validation').length,
    test: rows.filter((row) => row.split === 'test').length,
  } as const;
  const eligibleRows = input.plan.rows.filter((row) => row.status === 'eligible');
  const uniqueEligible = new Map<string, Set<string>>([
    ['positive', new Set<string>()],
    ['negative', new Set<string>()],
  ]);
  for (const row of eligibleRows) uniqueEligible.get(row.label)!.add(row.contentSha256);
  const eligiblePositive = eligibleRows.filter((row) => row.label === 'positive').length;
  const eligibleNegative = eligibleRows.length - eligiblePositive;
  const receipt: CorpusV1SmokeReceipt = {
    version: CORPUS_V1_SMOKE_RECEIPT_VERSION,
    selectionVersion: CORPUS_V1_SMOKE_SELECTION_VERSION,
    source: {
      sourceId: source.sourceId,
      sourceArchiveSha256: source.sourceArchiveSha256,
      csvSha256: input.sourceBinding.receipt.csvSha256,
      projectionManifestSha256: input.sourceBinding.receipt.projectionManifestSha256,
      sourceBindingReceiptSha256: input.sourceBinding.receiptSha256,
    },
    sourceBindingReceiptSha256: input.sourceBinding.receiptSha256,
    candidateManifestSha256: input.candidate.manifestSha256,
    planSha256: input.plan.planSha256,
    manifestSha256,
    eligible: {
      records: { positive: eligiblePositive, negative: eligibleNegative, total: eligibleRows.length },
      uniqueContentUnits: {
        positive: uniqueEligible.get('positive')!.size,
        negative: uniqueEligible.get('negative')!.size,
        total: uniqueEligible.get('positive')!.size + uniqueEligible.get('negative')!.size,
      },
    },
    selected: { positive: positive.length, negative: negative.length, total: rows.length },
    selectedBySplit,
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
