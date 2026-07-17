import { createHash } from 'node:crypto';
import { canonicalJson, canonicalSha256 } from '../v103/canonical';
import type {
  CorpusV1CandidateManifestRow,
  CorpusV1QuarantineReason,
} from './manifest';

export const CORPUS_V1_PLAN_VERSION = 'corpus-v1-plan-v1' as const;
export const CORPUS_V1_SPLIT_POLICY_VERSION = 'corpus-v1-family-split-v1' as const;

export type CorpusV1PlannedSplit = 'train' | 'validation' | 'test' | 'quarantine';

export type CorpusV1PlannedRow = Omit<
  CorpusV1CandidateManifestRow,
  'split' | 'status' | 'quarantineReasons'
> & {
  readonly split: CorpusV1PlannedSplit;
  readonly status: 'eligible' | 'quarantined';
  readonly quarantineReasons: readonly CorpusV1QuarantineReason[];
};

export interface CorpusV1PlanResult {
  readonly version: typeof CORPUS_V1_PLAN_VERSION;
  readonly splitPolicyVersion: typeof CORPUS_V1_SPLIT_POLICY_VERSION;
  readonly rows: readonly CorpusV1PlannedRow[];
  readonly planJsonl: string;
  readonly planSha256: string;
  readonly counts: {
    readonly raw: number;
    readonly eligible: number;
    readonly quarantined: number;
    readonly positive: number;
    readonly negative: number;
    readonly splits: {
      readonly train: number;
      readonly validation: number;
      readonly test: number;
      readonly quarantine: number;
    };
    readonly collisions: {
      readonly exactRows: number;
      readonly normalizedRows: number;
    };
  };
}

function compare(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function assertUniqueRows(rows: readonly CorpusV1CandidateManifestRow[]): void {
  const unitIds = new Set<string>();
  const sourceRecordIds = new Set<string>();
  for (const row of rows) {
    if (unitIds.has(row.unitId)) throw new Error(`duplicate unitId: ${row.unitId}`);
    if (sourceRecordIds.has(row.sourceRecordId)) {
      throw new Error(`duplicate sourceRecordId: ${row.sourceRecordId}`);
    }
    unitIds.add(row.unitId);
    sourceRecordIds.add(row.sourceRecordId);
    if (row.status === 'quarantined' && row.quarantineReasons.length === 0) {
      throw new Error(`quarantined row requires a reason: ${row.unitId}`);
    }
    if (row.status === 'candidate' && row.quarantineReasons.length > 0) {
      throw new Error(`candidate row cannot carry quarantine reasons: ${row.unitId}`);
    }
  }
}

function crossLabelMembers(
  rows: readonly CorpusV1CandidateManifestRow[],
  key: (row: CorpusV1CandidateManifestRow) => string | null,
): ReadonlySet<string> {
  const groups = new Map<string, CorpusV1CandidateManifestRow[]>();
  for (const row of rows) {
    if (row.status !== 'candidate') continue;
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

class FamilyUnion {
  readonly #parent = new Map<string, string>();

  add(value: string): void {
    if (!this.#parent.has(value)) this.#parent.set(value, value);
  }

  find(value: string): string {
    const parent = this.#parent.get(value);
    if (parent === undefined) throw new Error(`unknown family key: ${value}`);
    if (parent === value) return value;
    const root = this.find(parent);
    this.#parent.set(value, root);
    return root;
  }

  union(left: string, right: string): void {
    const leftRoot = this.find(left);
    const rightRoot = this.find(right);
    if (leftRoot === rightRoot) return;
    if (compare(leftRoot, rightRoot) <= 0) this.#parent.set(rightRoot, leftRoot);
    else this.#parent.set(leftRoot, rightRoot);
  }
}

function unionDuplicateFamilies(
  union: FamilyUnion,
  rows: readonly CorpusV1CandidateManifestRow[],
  key: (row: CorpusV1CandidateManifestRow) => string | null,
): void {
  const firstFamily = new Map<string, string>();
  for (const row of rows) {
    const value = key(row);
    if (value === null) continue;
    const groupKey = `${row.label}\u0000${value}`;
    const first = firstFamily.get(groupKey);
    if (first === undefined) firstFamily.set(groupKey, row.familyKey);
    else union.union(first, row.familyKey);
  }
}

function splitForFamilyKeys(familyKeys: readonly string[]): Exclude<CorpusV1PlannedSplit, 'quarantine'> {
  const digest = canonicalSha256({
    version: CORPUS_V1_SPLIT_POLICY_VERSION,
    familyKeys: [...familyKeys].sort(compare),
  });
  const bucket = Number.parseInt(digest.slice(0, 8), 16) % 100;
  if (bucket < 80) return 'train';
  if (bucket < 90) return 'validation';
  return 'test';
}

function stableReasons(reasons: readonly CorpusV1QuarantineReason[]): readonly CorpusV1QuarantineReason[] {
  const unique = new Set(reasons);
  if (unique.has('cross_label_exact_collision')) {
    unique.delete('cross_label_normalized_collision');
  }
  return [...unique].sort(compare);
}

/**
 * Quarantine cross-label collisions and assign deterministic leakage-group
 * splits. This stage remains a plan: it does not write, admit, or execute
 * candidate code.
 */
export function planCorpusV1(
  inputRows: readonly CorpusV1CandidateManifestRow[],
): CorpusV1PlanResult {
  assertUniqueRows(inputRows);
  const rows = [...inputRows].sort((left, right) => compare(left.sourceRecordId, right.sourceRecordId));
  const exact = crossLabelMembers(rows, (row) => row.contentSha256);
  const normalized = crossLabelMembers(rows, (row) => row.normalizedSha256);
  const reasonsByUnit = new Map<string, readonly CorpusV1QuarantineReason[]>();

  for (const row of rows) {
    const reasons: CorpusV1QuarantineReason[] = [...row.quarantineReasons];
    if (exact.has(row.unitId)) reasons.push('cross_label_exact_collision');
    else if (normalized.has(row.unitId)) reasons.push('cross_label_normalized_collision');
    reasonsByUnit.set(row.unitId, stableReasons(reasons));
  }

  const quarantinedFamilies = new Set(
    rows
      .filter((row) => (reasonsByUnit.get(row.unitId)?.length ?? 0) > 0)
      .map((row) => row.familyKey),
  );
  for (const row of rows) {
    const reasons = reasonsByUnit.get(row.unitId) ?? [];
    if (reasons.length === 0 && quarantinedFamilies.has(row.familyKey)) {
      reasonsByUnit.set(row.unitId, ['family_member_quarantined']);
    }
  }

  const eligibleRows = rows.filter((row) => (reasonsByUnit.get(row.unitId)?.length ?? 0) === 0);
  const union = new FamilyUnion();
  for (const row of eligibleRows) union.add(row.familyKey);
  unionDuplicateFamilies(union, eligibleRows, (row) => row.contentSha256);
  unionDuplicateFamilies(union, eligibleRows, (row) => row.normalizedSha256);

  const familiesByRoot = new Map<string, Set<string>>();
  for (const row of eligibleRows) {
    const root = union.find(row.familyKey);
    const families = familiesByRoot.get(root) ?? new Set<string>();
    families.add(row.familyKey);
    familiesByRoot.set(root, families);
  }
  const splitByRoot = new Map(
    [...familiesByRoot.entries()].map(([root, families]) => [
      root,
      splitForFamilyKeys([...families]),
    ] as const),
  );

  const plannedRows: CorpusV1PlannedRow[] = rows.map((row) => {
    const reasons = reasonsByUnit.get(row.unitId) ?? [];
    if (reasons.length > 0) {
      return { ...row, split: 'quarantine', status: 'quarantined', quarantineReasons: reasons };
    }
    const split = splitByRoot.get(union.find(row.familyKey));
    if (split === undefined) throw new Error(`missing split for family: ${row.familyKey}`);
    return { ...row, split, status: 'eligible', quarantineReasons: [] };
  });

  const planJsonl = plannedRows.length === 0
    ? ''
    : `${plannedRows.map((row) => canonicalJson(row)).join('\n')}\n`;
  const quarantined = plannedRows.filter((row) => row.status === 'quarantined').length;
  const positive = plannedRows.filter((row) => row.label === 'positive').length;
  const splitCount = (split: CorpusV1PlannedSplit): number =>
    plannedRows.filter((row) => row.split === split).length;
  return {
    version: CORPUS_V1_PLAN_VERSION,
    splitPolicyVersion: CORPUS_V1_SPLIT_POLICY_VERSION,
    rows: plannedRows,
    planJsonl,
    planSha256: createHash('sha256').update(planJsonl).digest('hex'),
    counts: {
      raw: plannedRows.length,
      eligible: plannedRows.length - quarantined,
      quarantined,
      positive,
      negative: plannedRows.length - positive,
      splits: {
        train: splitCount('train'),
        validation: splitCount('validation'),
        test: splitCount('test'),
        quarantine: splitCount('quarantine'),
      },
      collisions: {
        exactRows: plannedRows.filter((row) => row.quarantineReasons.includes('cross_label_exact_collision')).length,
        normalizedRows: plannedRows.filter((row) => row.quarantineReasons.includes('cross_label_normalized_collision')).length,
      },
    },
  };
}
