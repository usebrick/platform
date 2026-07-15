import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import {
  calibrationAdmissionCanonicalJson,
  calibrationAdmissionInitialSourceIdsSha256,
  calibrationAdmissionMaterializationId,
  calibrationAdmissionSourceRegisterEntrySha256,
  calibrationAdmissionSourceRegisterSha256,
  calibrationAdmissionSourceReviewSha256,
  type CalibrationAdmissionSourceRegisterV1,
  type CalibrationSourceReviewV103,
} from '@usebrick/core';
import {
  openAdmissionAllocationPreviewStream,
  type AdmissionAllocationInventoryRowV1,
  type AdmissionAllocationRowV1,
  type AdmissionAllocationPreviewSummaryV1,
} from '../../src/calibration/v103/admission-allocation-preview';

const SHA = (value: string): string => createHash('sha256').update(value, 'utf8').digest('hex');
const COMMIT_AI = 'a'.repeat(40);
const COMMIT_HUMAN = 'b'.repeat(40);
const LONG_REPOSITORY_SOURCE_ID = 'positive-vibe-coded--fufan-vibecodingcourse:Stage2_Cursor_Deep_Dive/Lesson03_OpenClaw_Architecture_Digital_Employee/openclaw/src/auto-reply/reply/agent-runner.heartbeat-typing.runreplyagent-typing-heartbeat.retries-after-compaction-failure-by-resetting-session.test.ts';
const LONG_REPOSITORY_PATH = LONG_REPOSITORY_SOURCE_ID.slice(LONG_REPOSITORY_SOURCE_ID.indexOf(':') + 1);

interface Fixture {
  readonly register: CalibrationAdmissionSourceRegisterV1;
  readonly reviews: readonly CalibrationSourceReviewV103[];
  readonly positive: AsyncIterable<Uint8Array>;
  readonly negative: AsyncIterable<Uint8Array>;
  readonly firstPositive: AdmissionAllocationInventoryRowV1;
  readonly firstNegative: AdmissionAllocationInventoryRowV1;
}

function makeRegister(): CalibrationAdmissionSourceRegisterV1 {
  const entries = [
    {
      sourceId: 'legacy-ai-slop-baseline',
      kind: 'material_source' as const,
      materialPartition: 'baseline' as const,
      contributesToAdditiveCounts: true,
      childMaterialSourceIds: [],
      registerEvidenceIds: ['evidence-baseline'],
      inventoryCandidateUnits: 58089,
    },
    {
      sourceId: 'legacy-v5-inventory',
      kind: 'aggregate_inventory' as const,
      materialPartition: 'aggregate' as const,
      contributesToAdditiveCounts: false,
      childMaterialSourceIds: ['repo-a'],
      registerEvidenceIds: ['evidence-aggregate'],
      inventoryCandidateUnits: 394293,
    },
    {
      sourceId: 'repo-a',
      kind: 'material_source' as const,
      materialPartition: 'repository' as const,
      contributesToAdditiveCounts: true,
      childMaterialSourceIds: [],
      registerEvidenceIds: ['evidence-repo-a'],
      inventoryCandidateUnits: 394293,
    },
  ].sort((left, right) => left.sourceId.localeCompare(right.sourceId));
  const body = {
    version: 'v10.3-admission-source-register-v1' as const,
    generation: 1,
    parentRegisterSha256: SHA('parent-register'),
    initialSourceIdsSha256: calibrationAdmissionInitialSourceIdsSha256(entries.map((entry) => entry.sourceId)),
    appliedDeltaIds: ['delta-a'],
    rawDiscoveryPopulation: { declaredAi: 635830 as const, declaredHuman: 842520 as const, closedWorld: false as const },
    selectedCoverage: { total: 452382 as const, baselineMaterialUnits: 58089 as const, repositoryMaterialUnits: 394293 as const },
    entries,
  };
  return { ...body, registerSha256: calibrationAdmissionSourceRegisterSha256(body) };
}

function makeReview(
  register: CalibrationAdmissionSourceRegisterV1,
  sourceId: string,
  decision: 'candidate' | 'source_quarantine',
): CalibrationSourceReviewV103 {
  const entry = register.entries.find((value) => value.sourceId === sourceId)!;
  if (entry.kind === 'aggregate_inventory') {
    return {
      version: 'v10.3-source-review-v1',
      sourceId,
      sourceKind: entry.kind,
      contributesToAdditiveCounts: false,
      sourceRegisterEntrySha256: calibrationAdmissionSourceRegisterEntrySha256(entry),
      originEvidenceId: entry.registerEvidenceIds[0]!,
      origin: { kind: 'local_unpublished', localSourceId: sourceId },
      materialization: { kind: 'aggregate_only', childMaterialSourceIds: entry.childMaterialSourceIds },
      sourceRights: {
        status: 'absent', scope: 'dataset', analysisUse: 'unresolved', redistribution: 'unresolved',
        thirdPartyChain: 'incomplete', evidenceIds: [],
      },
      inventory: { physicalMemberCount: entry.inventoryCandidateUnits, candidateCodeUnitCount: entry.inventoryCandidateUnits, inventorySha256: SHA(`${sourceId}:inventory`), closedWorld: false },
      reviewerDecisionIds: [],
      reviewedAt: '2026-07-15T00:00:00.000Z',
      decision: 'source_quarantine',
      reasons: ['source_inventory_open', 'source_wide_quarantine'],
    };
  }
  const withoutId = {
    kind: 'git' as const,
    repositoryId: sourceId,
    commitSha: sourceId === 'repo-a' ? COMMIT_AI : COMMIT_HUMAN,
  };
  return {
    version: 'v10.3-source-review-v1',
    sourceId,
    sourceKind: entry.kind,
    contributesToAdditiveCounts: true,
    sourceRegisterEntrySha256: calibrationAdmissionSourceRegisterEntrySha256(entry),
    originEvidenceId: entry.registerEvidenceIds[0]!,
    origin: { kind: 'https', url: `https://example.test/${sourceId}.git` },
    materialization: { ...withoutId, materializationId: calibrationAdmissionMaterializationId(sourceId, sourceId, withoutId) },
    sourceRights: {
      status: 'reviewed', scope: 'code', analysisUse: 'approved', redistribution: 'approved',
      thirdPartyChain: 'complete', evidenceIds: [entry.registerEvidenceIds[0]!],
    },
    inventory: { physicalMemberCount: entry.inventoryCandidateUnits, candidateCodeUnitCount: entry.inventoryCandidateUnits, inventorySha256: SHA(`${sourceId}:inventory`), closedWorld: true },
    reviewerDecisionIds: decision === 'candidate' ? [SHA(`${sourceId}:review-a`), SHA(`${sourceId}:review-b`)].sort() : [],
    reviewedAt: '2026-07-15T00:00:00.000Z',
    decision,
    reasons: decision === 'candidate' ? [] : ['review_incomplete'],
  };
}

function makeRow(
  declaredPolarity: 'declared_ai' | 'declared_human',
  sourceId: string,
  index: number,
  repositoryId: string | null,
  commitSha: string | null,
  overrides: Partial<AdmissionAllocationInventoryRowV1> = {},
): AdmissionAllocationInventoryRowV1 {
  return {
    sourceId: `${sourceId}:${declaredPolarity}:${index}`,
    declaredPolarity,
    repositoryId,
    originUrl: repositoryId === null ? 'https://example.test/legacy-ai-slop-baseline.git' : `https://example.test/${repositoryId}.git`,
    commitSha,
    normalizedPath: `src/${declaredPolarity}/${index}.ts`,
    contentSha256: SHA(`${declaredPolarity}:${sourceId}:${index}`),
    language: 'typescript',
    stratum: 'production',
    sizeBytes: 32,
    status: 'selected',
    ...overrides,
  };
}

function line(row: unknown): Uint8Array {
  // The real v10.3 inventory is sourceId-first and therefore not canonical by
  // key order. The preview accepts that input and canonicalizes emitted rows.
  return Buffer.from(`${JSON.stringify(row)}\n`, 'utf8');
}

function stream(rows: Iterable<unknown>, onRead?: () => void): AsyncIterable<Uint8Array> {
  return (async function* (): AsyncGenerator<Uint8Array> {
    for (const row of rows) {
      onRead?.();
      yield line(row);
    }
  }());
}

function canonicalStream(rows: Iterable<unknown>): AsyncIterable<Uint8Array> {
  return (async function* (): AsyncGenerator<Uint8Array> {
    for (const row of rows) yield Buffer.from(`${calibrationAdmissionCanonicalJson(row)}\n`, 'utf8');
  }());
}

function makeFixture(options: {
  readonly positiveFirst?: Partial<AdmissionAllocationInventoryRowV1>;
  readonly negativeFirst?: Partial<AdmissionAllocationInventoryRowV1>;
  readonly includeAllRows?: boolean;
} = {}): Fixture {
  const register = makeRegister();
  const reviews = [
    makeReview(register, 'legacy-ai-slop-baseline', 'candidate'),
    makeReview(register, 'legacy-v5-inventory', 'source_quarantine'),
    makeReview(register, 'repo-a', 'candidate'),
  ];
  const firstPositive = makeRow('declared_ai', 'legacy-ai-slop-baseline', 0, null, COMMIT_HUMAN, options.positiveFirst);
  const firstNegative = makeRow('declared_human', 'legacy-ai-slop-baseline', 0, null, COMMIT_HUMAN, options.negativeFirst);
  const positiveRows = function* (): Iterable<AdmissionAllocationInventoryRowV1> {
    yield firstPositive;
    if (options.includeAllRows === false) return;
    for (let index = 1; index < 5809; index += 1) yield makeRow('declared_ai', 'legacy-ai-slop-baseline', index, null, COMMIT_HUMAN);
    for (let index = 0; index < 219094; index += 1) yield makeRow('declared_ai', 'repo-a', index, 'repo-a', COMMIT_AI);
  }();
  const negativeRows = function* (): Iterable<AdmissionAllocationInventoryRowV1> {
    yield firstNegative;
    if (options.includeAllRows === false) return;
    for (let index = 1; index < 52280; index += 1) yield makeRow('declared_human', 'legacy-ai-slop-baseline', index, null, COMMIT_HUMAN);
    for (let index = 0; index < 175199; index += 1) yield makeRow('declared_human', 'repo-a', index, 'repo-a', COMMIT_AI);
  }();
  return {
    register,
    reviews,
    positive: stream(positiveRows),
    negative: stream(negativeRows),
    firstPositive,
    firstNegative,
  };
}

async function consume(streamValue: ReturnType<typeof openAdmissionAllocationPreviewStream>): Promise<AdmissionAllocationPreviewSummaryV1> {
  for await (const _row of streamValue.records) { /* bounded: do not retain rows */ }
  return streamValue.complete;
}

describe('v10.3 bounded allocation/provenance preview', () => {
  it('allocates a valid mixed baseline/repository fixture and conserves selected rows', async () => {
    const fixture = makeFixture();
    const preview = openAdmissionAllocationPreviewStream({
      sourceRegister: fixture.register,
      sourceReviews: fixture.reviews,
      positiveInventory: fixture.positive,
      negativeInventory: fixture.negative,
    });
    const summary = await consume(preview);
    expect(summary).toMatchObject({
      ok: true,
      rowCount: 452382,
      allocated: 452382,
      quarantine: 0,
      unrepresented: 0,
      duplicate: 0,
      positiveRowCount: 224903,
      negativeRowCount: 227479,
      baselineRowCount: 58089,
      repositoryRowCount: 394293,
      rawDiscoveryDenominatorExcluded: true,
      authorityEligible: false,
      ready: false,
    });
    expect(summary.reasonCodeCounts).toEqual({});
    expect(summary.streamSha256).toMatch(/^[a-f0-9]{64}$/);
  }, 30000);

  it('validates the exact Core register/review set before consuming either inventory stream', () => {
    let consumed = 0;
    const fixture = makeFixture({ includeAllRows: false });
    const invalidReviews = [...fixture.reviews, fixture.reviews[0]!];
    expect(() => openAdmissionAllocationPreviewStream({
      sourceRegister: fixture.register,
      sourceReviews: invalidReviews,
      positiveInventory: stream([], () => { consumed += 1; }),
      negativeInventory: stream([], () => { consumed += 1; }),
    })).toThrow(/duplicate source review IDs/);
    expect(consumed).toBe(0);
  });

  it('keeps declared polarity as declared and never treats the aggregate as an owner', async () => {
    const fixture = makeFixture({
      includeAllRows: false,
      positiveFirst: { repositoryId: 'legacy-v5-inventory', sourceId: 'legacy-v5-inventory:declared_ai:0' },
    });
    const preview = openAdmissionAllocationPreviewStream({
      sourceRegister: fixture.register,
      sourceReviews: fixture.reviews,
      positiveInventory: fixture.positive,
      negativeInventory: fixture.negative,
    });
    const rows: unknown[] = [];
    for await (const row of preview.records) rows.push(row);
    const summary = await preview.complete;
    expect(rows[0]).toMatchObject({ declaredPolarity: 'declared_ai', disposition: 'unrepresented', reasonCodes: ['aggregate_owner_forbidden'] });
    expect(summary.unrepresented).toBeGreaterThan(0);
    expect(summary.repositoryRowCount).toBe(0);
    expect(summary.reasonCodeCounts.aggregate_owner_forbidden).toBe(1);
  });

  it('accepts slash-containing repository identities up to the real 268-character shape', async () => {
    expect(LONG_REPOSITORY_SOURCE_ID).toHaveLength(268);
    const fixture = makeFixture({
      includeAllRows: false,
      positiveFirst: {
        sourceId: LONG_REPOSITORY_SOURCE_ID,
        repositoryId: 'repo-a',
        originUrl: 'https://example.test/repo-a.git',
        commitSha: COMMIT_AI,
        normalizedPath: LONG_REPOSITORY_PATH,
      },
    });
    const preview = openAdmissionAllocationPreviewStream({
      sourceRegister: fixture.register,
      sourceReviews: fixture.reviews,
      positiveInventory: fixture.positive,
      negativeInventory: fixture.negative,
    });
    const rows: AdmissionAllocationRowV1[] = [];
    for await (const row of preview.records) rows.push(row);
    const summary = await preview.complete;
    expect(rows[0]).toMatchObject({
      sourceId: LONG_REPOSITORY_SOURCE_ID,
      normalizedPath: LONG_REPOSITORY_PATH,
      owningMaterialSourceId: 'repo-a',
      materialPartition: 'repository',
      disposition: 'unrepresented',
      reasonCodes: ['inventory_source_owner_mismatch'],
    });
    expect(rows[0]).not.toHaveProperty('label');
    expect(JSON.parse(calibrationAdmissionCanonicalJson(rows[0]!))).toEqual(rows[0]);
    expect(summary.errors.some((error) => error.includes('malformed_source_id'))).toBe(false);
  });

  it('retains local and unpinned baseline provenance as quarantine evidence', async () => {
    const fixture = makeFixture({
      includeAllRows: false,
      positiveFirst: {
        originUrl: 'local:/Users/cheng/corpus-expansion/v10.3/legacy-baseline',
        commitSha: 'not_available_local_extract',
      },
    });
    const preview = openAdmissionAllocationPreviewStream({
      sourceRegister: fixture.register,
      sourceReviews: fixture.reviews,
      positiveInventory: fixture.positive,
      negativeInventory: fixture.negative,
    });
    const rows: AdmissionAllocationRowV1[] = [];
    for await (const row of preview.records) rows.push(row);
    const summary = await preview.complete;
    expect(rows[0]).toMatchObject({ originUrl: 'local:/Users/cheng/corpus-expansion/v10.3/legacy-baseline', pinnedCommitSha: null, disposition: 'quarantine' });
    expect(rows[0]?.reasonCodes).toEqual(expect.arrayContaining(['commit_binding_mismatch', 'origin_binding_mismatch']));
    expect(summary.errors.some((error) => error.includes('malformed_origin_url') || error.includes('malformed_commit_sha'))).toBe(false);
  });

  it.each([
    ['unknown repository', { repositoryId: 'repo-missing', sourceId: 'repo-missing:declared_ai:0' }, 'unknown_repository_id'],
    ['polarity mismatch', { declaredPolarity: 'declared_human' }, 'declared_polarity_mismatch'],
    ['malformed path', { normalizedPath: '../escape.ts' }, 'malformed_path'],
    ['malformed hash', { contentSha256: 'not-a-sha' }, 'malformed_content_sha256'],
  ] as const)('fails closed for %s', async (_name, overrides, reason) => {
    const fixture = makeFixture({ includeAllRows: false, positiveFirst: overrides });
    const preview = openAdmissionAllocationPreviewStream({
      sourceRegister: fixture.register,
      sourceReviews: fixture.reviews,
      positiveInventory: fixture.positive,
      negativeInventory: fixture.negative,
    });
    for await (const _row of preview.records) { /* consume */ }
    const summary = await preview.complete;
    expect(summary.ok).toBe(false);
    expect(summary.errors.some((error) => error.includes(reason))).toBe(true);
  });

  it('counts a declared-polarity mismatch exactly once', async () => {
    const fixture = makeFixture({ includeAllRows: false, positiveFirst: { declaredPolarity: 'declared_human' } });
    const preview = openAdmissionAllocationPreviewStream({
      sourceRegister: fixture.register,
      sourceReviews: fixture.reviews,
      positiveInventory: fixture.positive,
      negativeInventory: fixture.negative,
    });
    for await (const _row of preview.records) { /* consume */ }
    const summary = await preview.complete;
    expect(summary.reasonCodeCounts.declared_polarity_mismatch).toBe(1);
    expect(summary.errors.filter((error) => error.includes('declared_polarity_mismatch'))).toHaveLength(1);
  });

  it.each([
    ['unknown repository', 'repo-missing', 'unknown_repository_id'],
    ['aggregate owner', 'legacy-v5-inventory', 'aggregate_owner_forbidden'],
  ] as const)('validates duplicate ownership before returning for a duplicate + %s row', async (_name, repositoryId, ownershipReason) => {
    const fixture = makeFixture({ includeAllRows: false });
    const duplicate = stream([
      fixture.firstPositive,
      { ...fixture.firstPositive, repositoryId, sourceId: fixture.firstPositive.sourceId },
    ]);
    const preview = openAdmissionAllocationPreviewStream({
      sourceRegister: fixture.register,
      sourceReviews: fixture.reviews,
      positiveInventory: duplicate,
      negativeInventory: fixture.negative,
    });
    const rows: AdmissionAllocationRowV1[] = [];
    for await (const row of preview.records) rows.push(row);
    const summary = await preview.complete;
    expect(rows[1]?.reasonCodes).toEqual(['duplicate_inventory_row_id', ownershipReason].sort());
    expect(summary.reasonCodeCounts.duplicate_inventory_row_id).toBe(1);
    expect(summary.reasonCodeCounts[ownershipReason]).toBe(1);
  });

  it('fails closed with a stable 32 MiB pending-unit reason for a no-newline stream', async () => {
    const fixture = makeFixture({ includeAllRows: false });
    const oversized = new Uint8Array(32 * 1024 * 1024 + 1).fill(0x61);
    const preview = openAdmissionAllocationPreviewStream({
      sourceRegister: fixture.register,
      sourceReviews: fixture.reviews,
      positiveInventory: oversized,
      negativeInventory: fixture.negative,
    });
    for await (const _row of preview.records) { /* consume */ }
    const summary = await preview.complete;
    expect(summary.ok).toBe(false);
    expect(summary.errors).toContain('declared_ai:inventory_jsonl_unit_limit');
  });

  it('rejects an oversized newline-terminated unit before JSON parsing', async () => {
    const fixture = makeFixture({ includeAllRows: false });
    const oversized = Buffer.concat([
      Buffer.from('"', 'utf8'),
      Buffer.alloc(32 * 1024 * 1024, 0x61),
      Buffer.from('"\n', 'utf8'),
    ]);
    const preview = openAdmissionAllocationPreviewStream({
      sourceRegister: fixture.register,
      sourceReviews: fixture.reviews,
      positiveInventory: oversized,
      negativeInventory: fixture.negative,
    });
    for await (const _row of preview.records) { /* consume */ }
    const summary = await preview.complete;
    expect(summary.errors).toContain('declared_ai:1:inventory_jsonl_unit_limit');
  });

  it('reports an explicit empty-inventory reason', async () => {
    const fixture = makeFixture({ includeAllRows: false });
    const preview = openAdmissionAllocationPreviewStream({
      sourceRegister: fixture.register,
      sourceReviews: fixture.reviews,
      positiveInventory: stream([]),
      negativeInventory: fixture.negative,
    });
    for await (const _row of preview.records) { /* consume */ }
    const summary = await preview.complete;
    expect(summary.errors).toContain('declared_ai:inventory_jsonl_empty');
  });

  it('accepts noncanonical inventory JSONL bytes and canonicalizes emitted rows', async () => {
    const fixture = makeFixture({ includeAllRows: false });
    const noncanonical = openAdmissionAllocationPreviewStream({
      sourceRegister: fixture.register,
      sourceReviews: fixture.reviews,
      positiveInventory: (async function* (): AsyncGenerator<Uint8Array> {
        yield Buffer.from(`${JSON.stringify(fixture.firstPositive)}\n`, 'utf8');
      }()),
      negativeInventory: fixture.negative,
    });
    const rows: AdmissionAllocationRowV1[] = [];
    for await (const row of noncanonical.records) rows.push(row);
    const noncanonicalSummary = await noncanonical.complete;
    expect(rows[0]).toBeDefined();
    expect(JSON.parse(calibrationAdmissionCanonicalJson(rows[0]!))).toEqual(rows[0]);
    expect(noncanonicalSummary.errors.some((error) => error.includes('noncanonical_json'))).toBe(false);

    const canonicalFixture = makeFixture({ includeAllRows: false });
    const canonical = openAdmissionAllocationPreviewStream({
      sourceRegister: canonicalFixture.register,
      sourceReviews: canonicalFixture.reviews,
      positiveInventory: canonicalStream([fixture.firstPositive]),
      negativeInventory: canonicalFixture.negative,
    });
    const canonicalRows: AdmissionAllocationRowV1[] = [];
    for await (const row of canonical.records) canonicalRows.push(row);
    const canonicalSummary = await canonical.complete;
    expect(canonicalRows[0]).toEqual(rows[0]);
    expect(canonicalSummary.streamSha256).toBe(noncanonicalSummary.streamSha256);
  });

  it('reports source-specific conservation failures for missing material rows', async () => {
    const fixture = makeFixture({ includeAllRows: false });
    const preview = openAdmissionAllocationPreviewStream({
      sourceRegister: fixture.register,
      sourceReviews: fixture.reviews,
      positiveInventory: fixture.positive,
      negativeInventory: fixture.negative,
    });
    for await (const _row of preview.records) { /* consume */ }
    const summary = await preview.complete;
    expect(summary.errors).toContain('source_inventory_conservation_failed:legacy-ai-slop-baseline');
    expect(summary.errors).toContain('source_inventory_conservation_failed:repo-a');
    expect(summary.reasonCodeCounts['source_inventory_conservation_failed:legacy-ai-slop-baseline']).toBe(1);
    expect(summary.reasonCodeCounts['source_inventory_conservation_failed:repo-a']).toBe(1);
  });

  it('allows only one consumer for the allocation records stream', async () => {
    const fixture = makeFixture({ includeAllRows: false });
    const preview = openAdmissionAllocationPreviewStream({
      sourceRegister: fixture.register,
      sourceReviews: fixture.reviews,
      positiveInventory: fixture.positive,
      negativeInventory: fixture.negative,
    });
    for await (const _row of preview.records) { /* consume */ }
    await preview.complete;
    await expect((async () => {
      for await (const _row of preview.records) { /* second consumer */ }
    })()).rejects.toThrow('allocation_preview_stream_already_consumed');
  });

  it('counts duplicate inventory row IDs without allocating the duplicate', async () => {
    const fixture = makeFixture({ includeAllRows: false });
    const duplicate = stream([fixture.firstPositive, fixture.firstPositive]);
    const preview = openAdmissionAllocationPreviewStream({
      sourceRegister: fixture.register,
      sourceReviews: fixture.reviews,
      positiveInventory: duplicate,
      negativeInventory: fixture.negative,
    });
    const rows: unknown[] = [];
    for await (const row of preview.records) rows.push(row);
    const summary = await preview.complete;
    expect(rows[1]).toMatchObject({ disposition: 'quarantine', reasonCodes: ['duplicate_inventory_row_id'] });
    expect(summary.ok).toBe(false);
    expect(summary.duplicate).toBe(1);
    expect(summary.reasonCodeCounts.duplicate_inventory_row_id).toBe(1);
  });

  it('fails closed when a malformed row arrives late, without returning partial success', async () => {
    const fixture = makeFixture({ includeAllRows: false });
    const lateMalformed = stream([fixture.firstPositive, { ...fixture.firstPositive, normalizedPath: '../late.ts' }]);
    const preview = openAdmissionAllocationPreviewStream({
      sourceRegister: fixture.register,
      sourceReviews: fixture.reviews,
      positiveInventory: lateMalformed,
      negativeInventory: fixture.negative,
    });
    let emitted = 0;
    for await (const _row of preview.records) emitted += 1;
    const summary = await preview.complete;
    expect(emitted).toBe(1);
    expect(summary.ok).toBe(false);
    expect(summary.errors.some((error) => error.includes('malformed_path'))).toBe(true);
  });

  it('produces deterministic canonical rows and stream hashes for the same inputs', async () => {
    const first = makeFixture();
    const second = makeFixture();
    const one = await consume(openAdmissionAllocationPreviewStream({ sourceRegister: first.register, sourceReviews: first.reviews, positiveInventory: first.positive, negativeInventory: first.negative }));
    const two = await consume(openAdmissionAllocationPreviewStream({ sourceRegister: second.register, sourceReviews: second.reviews, positiveInventory: second.positive, negativeInventory: second.negative }));
    expect(two).toEqual(one);
    expect(calibrationAdmissionSourceReviewSha256(first.reviews[0]!)).toBe(calibrationAdmissionSourceReviewSha256(second.reviews[0]!));
  }, 60000);
});
