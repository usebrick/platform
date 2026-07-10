import {
  isCalibrationCorpusManifestV103,
  type CalibrationCorpusFile,
  type SlopbrickCalibrationCorpusManifestV103,
} from '@usebrick/core';
import {
  canonicalCorpusManifestSha256,
  canonicalJson,
  canonicalSha256,
  stableCalibrationFileId,
} from './canonical';

export type SelectionExclusionReason = 'label_not_eligible' | 'tier_not_gold' | 'split_excluded' | 'stratum_not_eligible' | 'stratum_quota_reached';
export type SelectionStatus = 'selected' | 'excluded';

export interface SelectionPolicy {
  readonly eligibleLabels?: readonly ('verified_ai' | 'verified_human')[];
  readonly eligibleTiers?: readonly ('gold' | 'silver')[];
  readonly eligibleStrata?: readonly string[];
  /** A deterministic cap applied independently to label/language/stratum cohorts. */
  readonly maxPerStratum?: number;
}

export interface SelectionOptions {
  readonly seed: string;
  readonly policy?: SelectionPolicy;
}

export interface SelectionRecord {
  readonly fileId: string;
  readonly sourceId: string;
  readonly repositoryId: string;
  readonly familyId: string;
  readonly commitSha: string;
  readonly normalizedPath: string;
  readonly contentSha256: string;
  readonly language: string;
  readonly stratum: string;
  /** Reviewed benchmark pair identity, when supplied by the corpus manifest. */
  readonly pairGroupId?: string;
  readonly label: string;
  readonly tier: string;
  readonly split: string;
  readonly selectionKey: string;
  readonly status: SelectionStatus;
  /** Detailed reason supplied by the reviewed manifest when it was excluded. */
  readonly manifestExclusionReason?: string;
  readonly exclusionReason?: SelectionExclusionReason;
}

export interface SelectionLedger {
  readonly version: 'v10.3';
  readonly stage: 'selection';
  readonly manifestSha256: string;
  readonly seed: string;
  readonly policy: Required<SelectionPolicy>;
  readonly recordsSha256: string;
  readonly requested: number;
  readonly selected: number;
  readonly excluded: number;
  readonly exclusionsByReason: Readonly<Record<SelectionExclusionReason, number>>;
}

export interface SelectionBuild {
  readonly records: readonly SelectionRecord[];
  readonly ledger: SelectionLedger;
}

const DEFAULT_POLICY: Required<SelectionPolicy> = {
  eligibleLabels: ['verified_ai', 'verified_human'],
  eligibleTiers: ['gold'],
  eligibleStrata: ['production', 'test', 'generated', 'vendor', 'minified', 'example', 'other'],
  maxPerStratum: Number.MAX_SAFE_INTEGER,
};

const EXCLUSION_REASONS: readonly SelectionExclusionReason[] = [
  'label_not_eligible', 'tier_not_gold', 'split_excluded', 'stratum_not_eligible', 'stratum_quota_reached',
];

function normalizedPolicy(input: SelectionPolicy | undefined): Required<SelectionPolicy> {
  const policy = { ...DEFAULT_POLICY, ...input };
  if (!Number.isSafeInteger(policy.maxPerStratum) || policy.maxPerStratum < 1) {
    throw new Error('maxPerStratum must be a positive safe integer');
  }
  return {
    eligibleLabels: [...policy.eligibleLabels].sort(),
    eligibleTiers: [...policy.eligibleTiers].sort(),
    eligibleStrata: [...policy.eligibleStrata].sort(),
    maxPerStratum: policy.maxPerStratum,
  };
}

function assertManifest(manifest: unknown): asserts manifest is SlopbrickCalibrationCorpusManifestV103 {
  if (!isCalibrationCorpusManifestV103(manifest)) throw new Error('Manifest does not satisfy the v10.3 corpus contract');
}

function repositoryCommit(manifest: SlopbrickCalibrationCorpusManifestV103, repositoryId: string): string {
  const repository = manifest.repositories.find((candidate) => candidate.repositoryId === repositoryId);
  if (!repository) throw new Error(`Missing repository record for ${repositoryId}`);
  return repository.commitSha;
}

function baseRecord(
  file: CalibrationCorpusFile,
  manifest: SlopbrickCalibrationCorpusManifestV103,
  seed: string,
): Omit<SelectionRecord, 'status' | 'exclusionReason' | 'manifestExclusionReason'> & Pick<SelectionRecord, 'manifestExclusionReason'> {
  const fileId = stableCalibrationFileId(file, manifest.repositories);
  return {
    fileId,
    sourceId: file.sourceId,
    repositoryId: file.repositoryId,
    familyId: file.familyId,
    commitSha: repositoryCommit(manifest, file.repositoryId),
    normalizedPath: file.normalizedPath,
    contentSha256: file.contentSha256,
    language: file.language,
    stratum: file.stratum,
    ...(file.pairGroupId === undefined ? {} : { pairGroupId: file.pairGroupId }),
    label: file.label,
    tier: file.tier,
    split: file.split,
    selectionKey: canonicalSha256({ seed, fileId }),
    ...(file.exclusionReason === undefined ? {} : { manifestExclusionReason: file.exclusionReason }),
  };
}

function exclusionFor(record: Omit<SelectionRecord, 'status' | 'exclusionReason'>, policy: Required<SelectionPolicy>): SelectionExclusionReason | undefined {
  if (!policy.eligibleLabels.includes(record.label as 'verified_ai' | 'verified_human')) return 'label_not_eligible';
  if (!policy.eligibleTiers.includes(record.tier as 'gold' | 'silver')) return 'tier_not_gold';
  if (record.split === 'excluded') return 'split_excluded';
  if (!policy.eligibleStrata.includes(record.stratum)) return 'stratum_not_eligible';
  return undefined;
}

function selectRecords(manifest: SlopbrickCalibrationCorpusManifestV103, seed: string, policy: Required<SelectionPolicy>): SelectionRecord[] {
  if (seed.length === 0) throw new Error('Selection seed must not be empty');
  const preliminaries = manifest.files.map((file) => baseRecord(file, manifest, seed));
  const selectedByCohort = new Map<string, number>();
  const decisionOrder = [...preliminaries].sort((a, b) => a.selectionKey.localeCompare(b.selectionKey) || a.fileId.localeCompare(b.fileId));
  const records = new Map<string, SelectionRecord>();
  for (const record of decisionOrder) {
    let exclusionReason = exclusionFor(record, policy);
    if (!exclusionReason) {
      const cohort = `${record.label}\u0000${record.language}\u0000${record.stratum}`;
      const count = selectedByCohort.get(cohort) ?? 0;
      if (count >= policy.maxPerStratum) exclusionReason = 'stratum_quota_reached';
      else selectedByCohort.set(cohort, count + 1);
    }
    records.set(record.sourceId, exclusionReason
      ? { ...record, status: 'excluded', exclusionReason }
      : { ...record, status: 'selected' });
  }
  return [...records.values()].sort((a, b) => a.sourceId.localeCompare(b.sourceId));
}

export function renderSelectionJsonl(records: readonly SelectionRecord[]): string {
  return records.map((record) => canonicalJson(record)).join('\n') + (records.length > 0 ? '\n' : '');
}

export function buildSelection(manifestInput: unknown, options: SelectionOptions): SelectionBuild {
  assertManifest(manifestInput);
  const policy = normalizedPolicy(options.policy);
  const records = selectRecords(manifestInput, options.seed, policy);
  const exclusionsByReason = Object.fromEntries(EXCLUSION_REASONS.map((reason) => [reason, 0])) as Record<SelectionExclusionReason, number>;
  for (const record of records) if (record.exclusionReason) exclusionsByReason[record.exclusionReason] += 1;
  const selected = records.filter((record) => record.status === 'selected').length;
  return {
    records,
    ledger: {
      version: 'v10.3',
      stage: 'selection',
      manifestSha256: canonicalCorpusManifestSha256(manifestInput),
      seed: options.seed,
      policy,
      recordsSha256: canonicalSha256(records),
      requested: records.length,
      selected,
      excluded: records.length - selected,
      exclusionsByReason,
    },
  };
}

function parseJsonl(jsonl: string): SelectionRecord[] | undefined {
  const lines = jsonl.split('\n');
  if (lines.at(-1) === '') lines.pop();
  if (lines.some((line) => line.length === 0)) return undefined;
  try {
    return lines.map((line) => JSON.parse(line) as SelectionRecord);
  } catch {
    return undefined;
  }
}

/** Rebuild selection from the manifest and require byte-for-byte canonical records and ledger. */
export function verifySelectionLedger(manifestInput: unknown, jsonl: string, ledgerInput: unknown): { ok: true } | { ok: false; error: string } {
  try {
    if (typeof ledgerInput !== 'object' || ledgerInput === null) return { ok: false, error: 'Selection ledger must be an object' };
    const ledger = ledgerInput as SelectionLedger;
    if (ledger.version !== 'v10.3' || ledger.stage !== 'selection' || typeof ledger.seed !== 'string') {
      return { ok: false, error: 'Selection ledger has an invalid version, stage, or seed' };
    }
    const actual = parseJsonl(jsonl);
    if (!actual) return { ok: false, error: 'Selection JSONL is malformed' };
    const expected = buildSelection(manifestInput, { seed: ledger.seed, policy: ledger.policy });
    if (jsonl !== renderSelectionJsonl(expected.records)) return { ok: false, error: 'Selection JSONL does not exactly match the manifest-derived records' };
    if (canonicalJson(ledger) !== canonicalJson(expected.ledger)) return { ok: false, error: 'Selection ledger does not exactly match manifest-derived accounting' };
    return { ok: true };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : 'Selection verification failed' };
  }
}
