import {
  calibrationAdmissionCanonicalJson,
  calibrationAdmissionInitialSourceIdsSha256,
  calibrationAdmissionMaterializationId,
  calibrationAdmissionSha256,
  calibrationAdmissionSourceRegisterEntrySha256,
  calibrationAdmissionSourceRegisterSha256,
  validateCalibrationAdmissionSourceRegisterReviewSet,
  type CalibrationAdmissionSourceRegisterV1,
  type CalibrationSourceReviewV103,
} from '@usebrick/core';

const SHA256 = /^[a-f0-9]{64}$/u;
const COMMIT_SHA = /^[a-f0-9]{40,64}$/u;
const SOURCE_ID = /^[a-z0-9][a-z0-9._:-]{0,127}$/u;
const REVIEWED_AT = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/u;

export const V103_GENESIS_COUNTS = Object.freeze({
  rawDeclaredAi: 635830,
  rawDeclaredHuman: 842520,
  selectedTotal: 452382,
  baselineTotal: 58089,
  repositoryTotal: 394293,
  initialSourceCount: 329,
});

export interface GenesisSourceDraft {
  readonly sourceId: string;
  readonly originUrl: string;
  readonly commitSha: string;
  readonly localPath: string;
  readonly license?: string;
  readonly inventoryCounts?: Readonly<Record<string, number>>;
  readonly declaredLegacyPolarity?: Readonly<Record<string, string>>;
  readonly status: string;
}

export interface GenesisRepositoryDraft {
  readonly repositoryId: string;
  readonly declaredPolarity: 'declared_ai' | 'declared_human';
  readonly localPath: string;
  readonly originUrl: string;
  readonly commitSha: string;
  readonly licenseFile?: string;
  readonly reviewStatus: string;
}

export interface GenesisInventoryRow {
  readonly sourceId: string;
  readonly declaredPolarity: 'declared_ai' | 'declared_human';
  readonly repositoryId: string | null;
  readonly originUrl: string | null;
  readonly commitSha: string | null;
  readonly normalizedPath: string;
  readonly contentSha256: string;
  readonly language: string;
  readonly stratum: string;
  readonly sizeBytes: number;
  readonly status: string;
}

export interface GenesisInventoryArmSummary {
  readonly declaredPolarity: 'declared_ai' | 'declared_human';
  readonly rows: number;
  readonly bytes: number;
  readonly inventorySha256: string;
  readonly baselineRows: number;
  readonly baselineBytes: number;
  readonly repositoryRows: number;
  readonly repositoryBytes: number;
  readonly repositoryCounts: Readonly<Record<string, number>>;
  readonly repositoryBytesById: Readonly<Record<string, number>>;
  readonly repositoryInventorySha256ById: Readonly<Record<string, string>>;
}

export interface GenesisInventorySummary {
  readonly positive: GenesisInventoryArmSummary;
  readonly negative: GenesisInventoryArmSummary;
}

export interface GenesisBuilderInput {
  readonly sourceRegister: unknown;
  readonly repositoryInventory: unknown;
  readonly positiveInventory: readonly GenesisInventoryRow[];
  readonly negativeInventory: readonly GenesisInventoryRow[];
  /** SHA-256 of the exact source JSONL bytes, when the caller streamed them. */
  readonly inventoryFileSha256?: Readonly<{ readonly positive: string; readonly negative: string }>;
  readonly inventorySummary?: GenesisInventorySummary;
  /** Fixed timestamp supplied by the caller; never generated implicitly. */
  readonly reviewedAt: string;
}

export interface GenesisBuilderResult {
  readonly register: CalibrationAdmissionSourceRegisterV1;
  readonly sourceReviews: readonly CalibrationSourceReviewV103[];
  readonly inventorySummary: GenesisInventorySummary;
  readonly validation: ReturnType<typeof validateCalibrationAdmissionSourceRegisterReviewSet>;
}

/**
 * Read-only reason accounting for the generation-0 quarantine diagnostic.
 *
 * Counts intentionally overlap: one source may carry several blockers. The
 * material-unit count includes only additive material-source entries, never
 * the aggregate inventory view, so it cannot be mistaken for a new eligible
 * denominator.
 */
export interface GenesisBlockerCountV1 {
  readonly reason: string;
  readonly sourceCount: number;
  readonly materialUnits: number;
}

export interface GenesisDiagnosticV1 {
  readonly version: 'v10.3-genesis-quarantine-diagnostic-v1';
  readonly authorityEligible: false;
  readonly persisted: false;
  readonly selectedCoverage: number;
  readonly quarantineUnits: number;
  readonly candidateSources: number;
  readonly candidateUnits: number;
  readonly eligibleUnits: 0;
  readonly blockers: readonly GenesisBlockerCountV1[];
}

export interface GenesisNormalizedInput {
  readonly sourceRegister: unknown;
  readonly repositoryInventory: unknown;
  readonly inventorySummary: GenesisInventorySummary;
  readonly reviewedAt: string;
}

interface SourceRegisterDraft {
  readonly sources: readonly GenesisSourceDraft[];
}

interface RepositoryInventoryDraft {
  readonly repositories: readonly GenesisRepositoryDraft[];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function assertRecord(value: unknown, label: string): Record<string, unknown> {
  if (!isRecord(value)) throw new Error(`${label} must be an object`);
  return value;
}

function assertString(value: unknown, label: string): string {
  if (typeof value !== 'string' || value.length === 0) throw new Error(`${label} must be a non-empty string`);
  return value;
}

function assertNonNegativeInteger(value: unknown, label: string): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0) throw new Error(`${label} must be a non-negative safe integer`);
  return value;
}

function assertSha(value: unknown, label: string): string {
  const text = assertString(value, label);
  if (!SHA256.test(text)) throw new Error(`${label} must be a lowercase SHA-256`);
  return text;
}

function assertReviewedAt(value: string): void {
  if (!REVIEWED_AT.test(value) || new Date(value).toISOString() !== value) {
    throw new Error('reviewedAt must be an ISO timestamp with milliseconds and UTC Z suffix');
  }
}

function assertSourceId(value: string, label: string): void {
  if (!SOURCE_ID.test(value)) throw new Error(`${label} is not a schema-valid admission ID: ${value}`);
}

function sourceRegisterDraft(value: unknown): SourceRegisterDraft {
  const object = assertRecord(value, 'source register');
  if (!Array.isArray(object.sources)) throw new Error('source register sources must be an array');
  const sources = object.sources.map((raw, index): GenesisSourceDraft => {
    const source = assertRecord(raw, `source register entry ${index}`);
    const sourceId = assertString(source.sourceId, `source register entry ${index}.sourceId`);
    assertSourceId(sourceId, `source register entry ${index}.sourceId`);
    const inventoryCounts = source.inventoryCounts;
    if (inventoryCounts !== undefined && !isRecord(inventoryCounts)) throw new Error(`${sourceId}.inventoryCounts must be an object`);
    return {
      sourceId,
      originUrl: assertString(source.originUrl, `${sourceId}.originUrl`),
      commitSha: assertString(source.commitSha, `${sourceId}.commitSha`),
      localPath: assertString(source.localPath, `${sourceId}.localPath`),
      ...(source.license === undefined ? {} : { license: assertString(source.license, `${sourceId}.license`) }),
      ...(inventoryCounts === undefined ? {} : { inventoryCounts: inventoryCounts as Readonly<Record<string, number>> }),
      ...(source.declaredLegacyPolarity === undefined ? {} : { declaredLegacyPolarity: source.declaredLegacyPolarity as Readonly<Record<string, string>> }),
      status: assertString(source.status, `${sourceId}.status`),
    };
  });
  const ids = sources.map((source) => source.sourceId).sort();
  if (new Set(ids).size !== ids.length) throw new Error('source register contains duplicate source IDs');
  return { sources };
}

function repositoryInventoryDraft(value: unknown): RepositoryInventoryDraft {
  const object = assertRecord(value, 'repository inventory');
  if (!Array.isArray(object.repositories)) throw new Error('repository inventory repositories must be an array');
  const repositories = object.repositories.map((raw, index): GenesisRepositoryDraft => {
    const repository = assertRecord(raw, `repository inventory entry ${index}`);
    const repositoryId = assertString(repository.repositoryId, `repository inventory entry ${index}.repositoryId`);
    assertSourceId(repositoryId, `repository inventory entry ${index}.repositoryId`);
    const declaredPolarity = repository.declaredPolarity;
    if (declaredPolarity !== 'declared_ai' && declaredPolarity !== 'declared_human') throw new Error(`${repositoryId}.declaredPolarity is invalid`);
    return {
      repositoryId,
      declaredPolarity,
      localPath: assertString(repository.localPath, `${repositoryId}.localPath`),
      originUrl: assertString(repository.originUrl, `${repositoryId}.originUrl`),
      commitSha: assertString(repository.commitSha, `${repositoryId}.commitSha`),
      ...(repository.licenseFile === undefined || repository.licenseFile === null ? {} : { licenseFile: assertString(repository.licenseFile, `${repositoryId}.licenseFile`) }),
      reviewStatus: assertString(repository.reviewStatus, `${repositoryId}.reviewStatus`),
    };
  });
  const ids = repositories.map((repository) => repository.repositoryId).sort();
  if (new Set(ids).size !== ids.length) throw new Error('repository inventory contains duplicate repository IDs');
  return { repositories };
}

function inventoryRow(value: unknown, label: string): GenesisInventoryRow {
  const row = assertRecord(value, label);
  const declaredPolarity = row.declaredPolarity;
  if (declaredPolarity !== 'declared_ai' && declaredPolarity !== 'declared_human') throw new Error(`${label}.declaredPolarity is invalid`);
  const repositoryId = row.repositoryId;
  if (repositoryId !== null && (typeof repositoryId !== 'string' || repositoryId.length === 0)) throw new Error(`${label}.repositoryId is invalid`);
  return {
    sourceId: assertString(row.sourceId, `${label}.sourceId`),
    declaredPolarity,
    repositoryId,
    originUrl: row.originUrl === null ? null : assertString(row.originUrl, `${label}.originUrl`),
    commitSha: row.commitSha === null ? null : assertString(row.commitSha, `${label}.commitSha`),
    normalizedPath: assertString(row.normalizedPath, `${label}.normalizedPath`),
    contentSha256: assertSha(row.contentSha256, `${label}.contentSha256`),
    language: assertString(row.language, `${label}.language`),
    stratum: assertString(row.stratum, `${label}.stratum`),
    sizeBytes: assertNonNegativeInteger(row.sizeBytes, `${label}.sizeBytes`),
    status: assertString(row.status, `${label}.status`),
  };
}

function summarizeArm(rows: readonly GenesisInventoryRow[], expectedPolarity: GenesisInventoryArmSummary['declaredPolarity'], exactFileSha256?: string): GenesisInventoryArmSummary {
  const fileHashRows = rows.map((row) => calibrationAdmissionCanonicalJson(row)).join('\n') + (rows.length > 0 ? '\n' : '');
  const inventorySha256 = exactFileSha256 ?? calibrationAdmissionSha256({ bytesSha256: calibrationAdmissionSha256(fileHashRows), rowCount: rows.length });
  if (!SHA256.test(inventorySha256)) throw new Error(`${expectedPolarity} inventory file hash must be a lowercase SHA-256`);
  const repositoryCounts: Record<string, number> = {};
  const repositoryBytesById: Record<string, number> = {};
  const repositoryLines = new Map<string, string[]>();
  let bytes = 0;
  let baselineRows = 0;
  let baselineBytes = 0;
  const seenSourceIds = new Set<string>();
  for (const row of rows) {
    if (row.declaredPolarity !== expectedPolarity) throw new Error(`inventory row ${row.sourceId} has the wrong declared polarity`);
    if (seenSourceIds.has(row.sourceId)) throw new Error(`inventory row ${row.sourceId} is duplicated within the ${expectedPolarity} arm`);
    seenSourceIds.add(row.sourceId);
    bytes += row.sizeBytes;
    if (row.repositoryId === null) {
      if (!row.sourceId.startsWith('legacy-ai-slop-baseline:')) throw new Error(`non-repository row ${row.sourceId} is not a baseline row`);
      baselineRows += 1;
      baselineBytes += row.sizeBytes;
      continue;
    }
    if (!row.sourceId.startsWith(`${row.repositoryId}:`)) throw new Error(`repository row ${row.sourceId} is not bound to repository ${row.repositoryId}`);
    repositoryCounts[row.repositoryId] = (repositoryCounts[row.repositoryId] ?? 0) + 1;
    repositoryBytesById[row.repositoryId] = (repositoryBytesById[row.repositoryId] ?? 0) + row.sizeBytes;
    const line = calibrationAdmissionCanonicalJson(row);
    const existing = repositoryLines.get(row.repositoryId);
    if (existing) existing.push(line);
    else repositoryLines.set(row.repositoryId, [line]);
  }
  const repositoryInventorySha256ById: Record<string, string> = {};
  for (const [repositoryId, lines] of repositoryLines) {
    repositoryInventorySha256ById[repositoryId] = calibrationAdmissionSha256(`${lines.join('\n')}\n`);
  }
  return {
    declaredPolarity: expectedPolarity,
    rows: rows.length,
    bytes,
    inventorySha256,
    baselineRows,
    baselineBytes,
    repositoryRows: rows.length - baselineRows,
    repositoryBytes: bytes - baselineBytes,
    repositoryCounts,
    repositoryBytesById,
    repositoryInventorySha256ById,
  };
}

function normalizeSummary(input: GenesisBuilderInput): GenesisInventorySummary {
  const positiveRows = input.positiveInventory.map((row, index) => inventoryRow(row, `positive inventory row ${index}`));
  const negativeRows = input.negativeInventory.map((row, index) => inventoryRow(row, `negative inventory row ${index}`));
  const positive = summarizeArm(positiveRows, 'declared_ai', input.inventoryFileSha256?.positive);
  const negative = summarizeArm(negativeRows, 'declared_human', input.inventoryFileSha256?.negative);
  const allSourceIds = [...positiveRows, ...negativeRows].map((row) => row.sourceId);
  if (new Set(allSourceIds).size !== allSourceIds.length) throw new Error('selected inventory source IDs overlap across polarity arms');
  if (positive.rows !== 224903 || negative.rows !== 227479) throw new Error(`selected inventory rows must be 224903 AI + 227479 human; got ${positive.rows} + ${negative.rows}`);
  if (positive.baselineRows !== 5809 || negative.baselineRows !== 52280) throw new Error(`baseline rows must be 5809 AI + 52280 human; got ${positive.baselineRows} + ${negative.baselineRows}`);
  if (positive.repositoryRows + negative.repositoryRows !== V103_GENESIS_COUNTS.repositoryTotal) throw new Error('repository row conservation failed');
  const summary = { positive, negative };
  if (input.inventorySummary !== undefined && calibrationAdmissionCanonicalJson(input.inventorySummary) !== calibrationAdmissionCanonicalJson(summary)) {
    throw new Error('provided inventory summary does not match inventory rows');
  }
  return summary;
}

function assertInventorySummary(summary: GenesisInventorySummary): void {
  if (!isRecord(summary) || !isRecord(summary.positive) || !isRecord(summary.negative)) throw new Error('inventory summary must contain positive and negative arms');
  if (summary.positive.declaredPolarity !== 'declared_ai' || summary.negative.declaredPolarity !== 'declared_human') throw new Error('inventory summary polarities are invalid');
  if (summary.positive.rows !== 224903 || summary.negative.rows !== 227479) throw new Error('inventory summary row counts are not the frozen selected coverage');
  if (summary.positive.baselineRows !== 5809 || summary.negative.baselineRows !== 52280) throw new Error('inventory summary baseline counts are not the frozen selected coverage');
  if (summary.positive.repositoryRows + summary.negative.repositoryRows !== V103_GENESIS_COUNTS.repositoryTotal) throw new Error('inventory summary repository count does not conserve selected coverage');
  for (const arm of [summary.positive, summary.negative]) {
    const label = arm.declaredPolarity;
    assertNonNegativeInteger(arm.rows, `${label}.rows`);
    assertNonNegativeInteger(arm.bytes, `${label}.bytes`);
    assertNonNegativeInteger(arm.baselineRows, `${label}.baselineRows`);
    assertNonNegativeInteger(arm.baselineBytes, `${label}.baselineBytes`);
    assertNonNegativeInteger(arm.repositoryRows, `${label}.repositoryRows`);
    assertNonNegativeInteger(arm.repositoryBytes, `${label}.repositoryBytes`);
    if (arm.baselineRows + arm.repositoryRows !== arm.rows) throw new Error(`${label} inventory row partitions do not conserve rows`);
    if (arm.baselineBytes + arm.repositoryBytes !== arm.bytes) throw new Error(`${label} inventory byte partitions do not conserve bytes`);
    assertSha(arm.inventorySha256, `${arm.declaredPolarity}.inventorySha256`);
    let repositoryRows = 0;
    let repositoryBytes = 0;
    for (const [repositoryId, count] of Object.entries(arm.repositoryCounts)) {
      assertSourceId(repositoryId, `${arm.declaredPolarity}.repositoryCounts key`);
      assertNonNegativeInteger(count, `${arm.declaredPolarity}.repositoryCounts.${repositoryId}`);
      repositoryRows += count;
    }
    if (repositoryRows !== arm.repositoryRows) throw new Error(`${label} repository row counts do not conserve repositoryRows`);
    for (const [repositoryId, bytes] of Object.entries(arm.repositoryBytesById)) {
      assertSourceId(repositoryId, `${label}.repositoryBytesById key`);
      assertNonNegativeInteger(bytes, `${label}.repositoryBytesById.${repositoryId}`);
      repositoryBytes += bytes;
    }
    if (repositoryBytes !== arm.repositoryBytes) throw new Error(`${label} repository byte counts do not conserve repositoryBytes`);
    const countIds = Object.keys(arm.repositoryCounts).sort();
    const byteIds = Object.keys(arm.repositoryBytesById).sort();
    const hashIds = Object.keys(arm.repositoryInventorySha256ById).sort();
    if (countIds.join('\n') !== byteIds.join('\n') || countIds.join('\n') !== hashIds.join('\n')) {
      throw new Error(`${label} repository count, byte, and hash ID sets differ`);
    }
    for (const [repositoryId, digest] of Object.entries(arm.repositoryInventorySha256ById)) {
      assertSourceId(repositoryId, `${arm.declaredPolarity}.repositoryInventorySha256ById key`);
      assertSha(digest, `${arm.declaredPolarity}.repositoryInventorySha256ById.${repositoryId}`);
    }
  }
}

function evidenceId(kind: string, sourceId: string): string {
  const id = `${kind}:${sourceId}`;
  assertSourceId(id, 'derived evidence ID');
  return id;
}

function sourceDraftById(sources: readonly GenesisSourceDraft[]): Map<string, GenesisSourceDraft> {
  return new Map(sources.map((source) => [source.sourceId, source]));
}

function repositoryDraftById(repositories: readonly GenesisRepositoryDraft[]): Map<string, GenesisRepositoryDraft> {
  return new Map(repositories.map((repository) => [repository.repositoryId, repository]));
}

function repositoryCount(summary: GenesisInventorySummary, repositoryId: string): number {
  return (summary.positive.repositoryCounts[repositoryId] ?? 0) + (summary.negative.repositoryCounts[repositoryId] ?? 0);
}

function repositoryInventorySha256(summary: GenesisInventorySummary, repositoryId: string): string {
  const positive = summary.positive.repositoryInventorySha256ById[repositoryId];
  const negative = summary.negative.repositoryInventorySha256ById[repositoryId];
  return calibrationAdmissionSha256({ positive: positive ?? null, negative: negative ?? null });
}

function registerEntryEvidenceId(sourceId: string): string {
  return evidenceId('source-register', sourceId);
}

function buildRegister(
  sourceDraft: SourceRegisterDraft,
  repositoryDraft: RepositoryInventoryDraft,
  summary: GenesisInventorySummary,
): CalibrationAdmissionSourceRegisterV1 {
  const sourceById = sourceDraftById(sourceDraft.sources);
  const repositoryById = repositoryDraftById(repositoryDraft.repositories);
  if (sourceDraft.sources.length !== 12) throw new Error(`expected 12 original source entries, got ${sourceDraft.sources.length}`);
  if (repositoryDraft.repositories.length !== 317) throw new Error(`expected 317 repository entries, got ${repositoryDraft.repositories.length}`);
  const repositoryIds = repositoryDraft.repositories.map((repository) => repository.repositoryId).sort();
  const originalIds = sourceDraft.sources.map((source) => source.sourceId).sort();
  const allIds = [...originalIds, ...repositoryIds].sort();
  if (new Set(allIds).size !== V103_GENESIS_COUNTS.initialSourceCount) throw new Error('initial source ID set is not 329 unique IDs');
  for (const repository of repositoryDraft.repositories) {
    if (!sourceById.has(repository.repositoryId) && !repositoryIdHasRows(summary, repository.repositoryId)) continue;
    if (!repository.commitSha || !repository.originUrl) throw new Error(`repository ${repository.repositoryId} has incomplete origin binding`);
  }
  const baselineSource = sourceById.get('legacy-ai-slop-baseline');
  const aggregateSource = sourceById.get('legacy-v5-inventory');
  if (!baselineSource || !aggregateSource) throw new Error('legacy baseline and v5 aggregate sources are required');
  for (const repositoryId of [...Object.keys(summary.positive.repositoryCounts), ...Object.keys(summary.negative.repositoryCounts)]) {
    const repository = repositoryById.get(repositoryId);
    if (!repository) throw new Error(`inventory contains a repository that is absent from repository-inventory.json: ${repositoryId}`);
    const positiveRows = summary.positive.repositoryCounts[repositoryId] ?? 0;
    const negativeRows = summary.negative.repositoryCounts[repositoryId] ?? 0;
    if (positiveRows > 0 && repository.declaredPolarity !== 'declared_ai') {
      throw new Error(`AI inventory rows disagree with repository-inventory polarity for ${repositoryId}`);
    }
    if (negativeRows > 0 && repository.declaredPolarity !== 'declared_human') {
      throw new Error(`human inventory rows disagree with repository-inventory polarity for ${repositoryId}`);
    }
  }
  const baselineUnits = summary.positive.baselineRows + summary.negative.baselineRows;
  const repositoryUnits = summary.positive.repositoryRows + summary.negative.repositoryRows;
  if (baselineUnits !== V103_GENESIS_COUNTS.baselineTotal || repositoryUnits !== V103_GENESIS_COUNTS.repositoryTotal) throw new Error('inventory summary does not conserve the frozen selected coverage');

  const repositoryEntries = repositoryDraft.repositories.map((repository) => ({
    sourceId: repository.repositoryId,
    kind: 'material_source' as const,
    materialPartition: 'repository' as const,
    contributesToAdditiveCounts: true,
    childMaterialSourceIds: [],
    registerEvidenceIds: [evidenceId('repository-inventory', repository.repositoryId)],
    inventoryCandidateUnits: repositoryCount(summary, repository.repositoryId),
  }));
  const originalEntries = sourceDraft.sources.map((source) => {
    if (source.sourceId === 'legacy-v5-inventory') {
      return {
        sourceId: source.sourceId,
        kind: 'aggregate_inventory' as const,
        materialPartition: 'aggregate' as const,
        contributesToAdditiveCounts: false,
        childMaterialSourceIds: repositoryIds,
        registerEvidenceIds: [registerEntryEvidenceId(source.sourceId)],
        inventoryCandidateUnits: repositoryUnits,
      };
    }
    if (source.sourceId === 'legacy-ai-slop-baseline') {
      return {
        sourceId: source.sourceId,
        kind: 'material_source' as const,
        materialPartition: 'baseline' as const,
        contributesToAdditiveCounts: true,
        childMaterialSourceIds: [],
        registerEvidenceIds: [registerEntryEvidenceId(source.sourceId)],
        inventoryCandidateUnits: baselineUnits,
      };
    }
    return {
      sourceId: source.sourceId,
      kind: 'material_source' as const,
      materialPartition: 'non_selected' as const,
      contributesToAdditiveCounts: true,
      childMaterialSourceIds: [],
      registerEvidenceIds: [registerEntryEvidenceId(source.sourceId)],
      inventoryCandidateUnits: 0,
    };
  });
  const entries = [...originalEntries, ...repositoryEntries].sort((left, right) => left.sourceId.localeCompare(right.sourceId));
  const withoutHash = {
    version: 'v10.3-admission-source-register-v1' as const,
    generation: 0,
    initialSourceIdsSha256: calibrationAdmissionInitialSourceIdsSha256(entries.map((entry) => entry.sourceId)),
    appliedDeltaIds: [],
    rawDiscoveryPopulation: { declaredAi: 635830 as const, declaredHuman: 842520 as const, closedWorld: false as const },
    selectedCoverage: { total: 452382 as const, baselineMaterialUnits: 58089 as const, repositoryMaterialUnits: 394293 as const },
    entries,
  };
  const register = { ...withoutHash, registerSha256: calibrationAdmissionSourceRegisterSha256(withoutHash) };
  if (register.entries.length !== V103_GENESIS_COUNTS.initialSourceCount) throw new Error('generated register does not contain 329 entries');
  if (repositoryById.size !== repositoryDraft.repositories.length) throw new Error('repository inventory ID set is not unique');
  return register;
}

function repositoryIdHasRows(summary: GenesisInventorySummary, repositoryId: string): boolean {
  return summary.positive.repositoryCounts[repositoryId] !== undefined || summary.negative.repositoryCounts[repositoryId] !== undefined;
}

function rightsFor(sourceId: string, source: GenesisSourceDraft | undefined): CalibrationSourceReviewV103['sourceRights'] {
  const license = source?.license ?? '';
  const status = license === '' || license.includes('not_found') || license.includes('required') ? 'absent' : 'ambiguous';
  return {
    status,
    ...(status === 'ambiguous' ? { spdx: license } : {}),
    scope: sourceId === 'legacy-ai-slop-baseline' || sourceId.includes('collection') || sourceId.includes('codeset') ? 'code_and_dataset' : 'code',
    analysisUse: 'unresolved',
    redistribution: 'unresolved',
    thirdPartyChain: 'incomplete',
    evidenceIds: [],
  };
}

function materializationFor(
  sourceId: string,
  source: GenesisSourceDraft | undefined,
  repository: GenesisRepositoryDraft | undefined,
  summary: GenesisInventorySummary,
  entry: CalibrationAdmissionSourceRegisterV1['entries'][number],
): CalibrationSourceReviewV103['materialization'] {
  if (entry.kind === 'aggregate_inventory') return { kind: 'aggregate_only', childMaterialSourceIds: [...entry.childMaterialSourceIds] };
  if (sourceId === 'legacy-ai-slop-baseline') {
    return { kind: 'unpublished_bundle', bundleId: sourceId, bundleInventorySha256: calibrationAdmissionSha256({ positive: summary.positive.inventorySha256, negative: summary.negative.inventorySha256 }) };
  }
  const origin = repository ?? source;
  if (origin && COMMIT_SHA.test(origin.commitSha) && /^https:\/\//u.test(origin.originUrl)) {
    const withoutId = { kind: 'git' as const, repositoryId: repository?.repositoryId ?? sourceId, commitSha: origin.commitSha };
    return { ...withoutId, materializationId: calibrationAdmissionMaterializationId(sourceId, withoutId.repositoryId, withoutId) };
  }
  return { kind: 'unpublished_bundle', bundleId: sourceId, bundleInventorySha256: calibrationAdmissionSha256({ sourceId, localPath: origin?.localPath ?? sourceId, commitSha: origin?.commitSha ?? 'not_available' }) };
}

function sourceInventory(
  sourceId: string,
  entry: CalibrationAdmissionSourceRegisterV1['entries'][number],
  summary: GenesisInventorySummary,
): CalibrationSourceReviewV103['inventory'] {
  if (sourceId === 'legacy-v5-inventory') {
    return { physicalMemberCount: 1478350, candidateCodeUnitCount: entry.inventoryCandidateUnits, inventorySha256: calibrationAdmissionSha256({ positive: summary.positive.inventorySha256, negative: summary.negative.inventorySha256 }), closedWorld: false };
  }
  if (sourceId === 'legacy-ai-slop-baseline') {
    return { physicalMemberCount: entry.inventoryCandidateUnits, candidateCodeUnitCount: entry.inventoryCandidateUnits, inventorySha256: calibrationAdmissionSha256({ positive: summary.positive.inventorySha256, negative: summary.negative.inventorySha256 }), closedWorld: false };
  }
  const positive = summary.positive.repositoryCounts[sourceId] ?? 0;
  const negative = summary.negative.repositoryCounts[sourceId] ?? 0;
  return {
    physicalMemberCount: positive + negative,
    candidateCodeUnitCount: entry.inventoryCandidateUnits,
    inventorySha256: entry.kind === 'material_source' && entry.materialPartition === 'repository'
      ? repositoryInventorySha256(summary, sourceId)
      : calibrationAdmissionSha256({ sourceId, candidateCodeUnitCount: 0 }),
    closedWorld: false,
  };
}

function reasonsFor(sourceId: string, source: GenesisSourceDraft | undefined, entry: CalibrationAdmissionSourceRegisterV1['entries'][number]): CalibrationSourceReviewV103['reasons'] {
  const reasons = new Set<CalibrationSourceReviewV103['reasons'][number]>(['review_incomplete', 'source_wide_quarantine']);
  if (sourceId === 'legacy-v5-inventory') {
    reasons.add('source_inventory_open');
    reasons.add('family_unknown');
  }
  if (sourceId === 'legacy-ai-slop-baseline') reasons.add('source_bytes_unbound');
  if (entry.kind === 'material_source' && entry.materialPartition === 'repository') {
    reasons.add('authorship_unproven');
    reasons.add('family_unknown');
  }
  if (source?.status.includes('license') || source?.status.includes('rights')) reasons.add('license_scope_ambiguous');
  if (source?.status.includes('generation') || source?.status.includes('authorship') || source?.status.includes('label')) reasons.add('authorship_unproven');
  if (source?.status.includes('materialization') || source?.status.includes('bundle') || source?.status.includes('asset')) reasons.add('materialization_unverified');
  if (sourceId !== 'legacy-v5-inventory' && sourceId !== 'legacy-ai-slop-baseline') reasons.add('evidence_unresolved');
  return [...reasons].sort() as CalibrationSourceReviewV103['reasons'];
}

function buildReviews(
  register: CalibrationAdmissionSourceRegisterV1,
  sourceDraft: SourceRegisterDraft,
  repositoryDraft: RepositoryInventoryDraft,
  summary: GenesisInventorySummary,
  reviewedAt: string,
): readonly CalibrationSourceReviewV103[] {
  const sourceById = sourceDraftById(sourceDraft.sources);
  const repositoryById = repositoryDraftById(repositoryDraft.repositories);
  return register.entries.map((entry): CalibrationSourceReviewV103 => {
    const source = sourceById.get(entry.sourceId);
    const repository = repositoryById.get(entry.sourceId);
    const origin = repository ?? source;
    const originEvidenceId = entry.registerEvidenceIds[0]!;
    return {
      version: 'v10.3-source-review-v1',
      sourceId: entry.sourceId,
      sourceKind: entry.kind,
      contributesToAdditiveCounts: entry.contributesToAdditiveCounts,
      sourceRegisterEntrySha256: calibrationAdmissionSourceRegisterEntrySha256(entry),
      originEvidenceId,
      origin: origin && /^https:\/\//u.test(origin.originUrl)
        ? { kind: 'https', url: origin.originUrl }
        : { kind: 'local_unpublished', localSourceId: entry.sourceId },
      materialization: materializationFor(entry.sourceId, source, repository, summary, entry),
      sourceRights: rightsFor(entry.sourceId, source),
      inventory: sourceInventory(entry.sourceId, entry, summary),
      reviewerDecisionIds: [],
      reviewedAt,
      decision: 'source_quarantine',
      reasons: reasonsFor(entry.sourceId, source, entry),
    };
  });
}

export function buildV103GenesisAdmission(input: GenesisBuilderInput): GenesisBuilderResult {
  assertReviewedAt(input.reviewedAt);
  const sourceDraft = sourceRegisterDraft(input.sourceRegister);
  const repositoryDraft = repositoryInventoryDraft(input.repositoryInventory);
  const summary = normalizeSummary(input);
  return buildV103GenesisFromNormalizedInput({ ...input, inventorySummary: summary });
}

/**
 * Build the same genesis result after a caller has independently streamed and
 * hashed the two selected inventories. This split keeps the corpus reader
 * replaceable while ensuring the register/review composition is deterministic.
 * It performs no filesystem I/O and never upgrades a source to `candidate`.
 */
export function buildV103GenesisFromNormalizedInput(input: GenesisNormalizedInput): GenesisBuilderResult {
  assertReviewedAt(input.reviewedAt);
  assertInventorySummary(input.inventorySummary);
  const sourceDraft = sourceRegisterDraft(input.sourceRegister);
  const repositoryDraft = repositoryInventoryDraft(input.repositoryInventory);
  const summary = input.inventorySummary;
  const register = buildRegister(sourceDraft, repositoryDraft, summary);
  const sourceReviews = buildReviews(register, sourceDraft, repositoryDraft, summary, input.reviewedAt);
  const validation = validateCalibrationAdmissionSourceRegisterReviewSet(register, sourceReviews);
  if (!validation.ok) throw new Error(`generated genesis source review set is invalid: ${validation.errors.join('; ')}`);
  if (validation.additiveMaterialUnits !== V103_GENESIS_COUNTS.selectedTotal || validation.quarantineUnits !== V103_GENESIS_COUNTS.selectedTotal) {
    throw new Error('generated genesis source review set does not preserve 452382 quarantine units');
  }
  return { register, sourceReviews, inventorySummary: summary, validation };
}

/**
 * Build the deterministic, non-authoritative summary consumed by the genesis
 * diagnostic CLI. This function never promotes a source, creates a manifest,
 * or writes an artifact.
 */
export function buildV103GenesisDiagnostic(result: GenesisBuilderResult): GenesisDiagnosticV1 {
  const materialUnitsBySourceId = new Map(
    result.register.entries.map((entry) => [
      entry.sourceId,
      entry.kind === 'material_source' ? entry.inventoryCandidateUnits : 0,
    ]),
  );
  const blockers = new Map<string, { sourceCount: number; materialUnits: number }>();
  for (const review of result.sourceReviews) {
    const materialUnits = materialUnitsBySourceId.get(review.sourceId) ?? 0;
    for (const reason of review.reasons) {
      const current = blockers.get(reason) ?? { sourceCount: 0, materialUnits: 0 };
      current.sourceCount += 1;
      current.materialUnits += materialUnits;
      blockers.set(reason, current);
    }
  }
  return {
    version: 'v10.3-genesis-quarantine-diagnostic-v1',
    authorityEligible: false,
    persisted: false,
    selectedCoverage: result.validation.additiveMaterialUnits,
    quarantineUnits: result.validation.quarantineUnits,
    candidateSources: result.validation.candidateSourceCount,
    candidateUnits: result.validation.candidateClaimedUnits,
    eligibleUnits: 0,
    blockers: [...blockers.entries()]
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([reason, counts]) => ({ reason, ...counts })),
  };
}
