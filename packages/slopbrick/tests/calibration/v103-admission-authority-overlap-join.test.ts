import { createHash } from 'node:crypto';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import {
  ADMISSION_OVERLAP_RESOURCE_LIMITS,
  calibrationAdmissionCanonicalJson,
  calibrationAdmissionOverlapGenerationArtifactSetSha256,
  calibrationAdmissionOverlapGenerationSha256,
  calibrationAdmissionOverlapIndexReceiptSha256,
  calibrationAdmissionOverlapLedgerSha256,
  calibrationAdmissionOverlapResourceReceiptId,
  calibrationAdmissionSha256,
  calibrationAdmissionStaticAuthorityGenerationSha256,
} from '@usebrick/core';

import {
  publishAdmissionToolInvocationIntent as publishIntent,
  publishAdmissionToolReceipt as publishReceipt,
  resolveAdmissionToolAuthorityReceipt as resolveReceipt,
} from '../../src/calibration/v103/admission-publication';
import { validatePrebuiltAdmissionAuthorityOverlapJoin } from '../../src/calibration/v103/admission-authority-overlap-join';
import { makePrebuiltAuthorityFixture } from './v103-admission-authority-rebuild-fixture';

const roots: string[] = [];

function canonical(value: unknown): Buffer {
  return Buffer.from(calibrationAdmissionCanonicalJson(value), 'utf8');
}

function sha(value: string): string {
  return calibrationAdmissionSha256(value);
}

async function indexedOverlapAuthority() {
  const root = await mkdtemp(join(tmpdir(), 'slopbrick-static-overlap-join-'));
  roots.push(root);
  const authorityRoot = join(root, 'review', 'admission', 'tool-authority');
  const intent = await publishIntent({
    toolAuthorityRoot: authorityRoot,
    profileId: 'admission-static-ledgers-v1',
    action: 'authority:overlap',
    canonicalArgvSha256: sha('argv'),
    inputSetSha256: sha('inputs'),
    executableBehaviorSha256: sha('node'),
  });
  const receipt = await publishReceipt({
    toolAuthorityRoot: authorityRoot,
    invocationIntentId: intent.intent.intentId,
    observedResourceUsage: { heapBytes: 123, workers: 1 },
    exitCode: 0,
    outputSetSha256: sha('opaque-output-set'),
  });
  return resolveReceipt({
    authorityRoot,
    authorityIndexSha256: receipt.toolAuthorityIndexSha256,
    receiptId: receipt.receipt.receiptId,
    receiptSha256: receipt.receiptSha256,
    invocationIntentId: intent.intent.intentId,
    profileId: 'admission-static-ledgers-v1',
    action: 'authority:overlap',
  });
}

async function makeInput() {
  const resolved = await indexedOverlapAuthority();
  const universeSha256 = 'a'.repeat(64);
  const normalizerRegistrySha256 = 'b'.repeat(64);
  const overlapPolicySha256 = 'c'.repeat(64);
  const recordsJsonlSha256 = 'd'.repeat(64);
  const resourceDistributionSha256 = 'e'.repeat(64);
  const toolReceiptSha256 = resolved.receiptSha256;

  const indexBase = {
    version: 'v10.3-overlap-index-receipt-v1' as const,
    universeSha256,
    normalizerRegistrySha256,
    overlapPolicySha256,
    method: 'prefix-filter-exact-jaccard-0.80-v1' as const,
    postingShards: [],
    candidatePairShards: [],
    checkpoints: [],
    coveredCandidateUnits: 0,
    complete: true,
    toolReceiptSha256,
  };
  const index = { ...indexBase, receiptSha256: calibrationAdmissionOverlapIndexReceiptSha256(indexBase) };

  const resourceBase = {
    version: 'v10.3-overlap-resource-receipt-v1' as const,
    receiptId: '',
    universeSha256,
    recordsJsonlSha256,
    overlapPolicySha256,
    realContentDistributionSha256: resourceDistributionSha256,
    recordCount: 0,
    tokenCount: 0,
    shingleCount: 0,
    configuredLimits: { ...ADMISSION_OVERLAP_RESOURCE_LIMITS },
    observed: {
      maxUnitBytes: 0,
      maxHeapBytes: 0,
      maxRssBytes: 0,
      maxWorkBytes: 0,
      maxOpenFiles: 0,
      maxShardBytes: 0,
      wallMilliseconds: 0,
    },
    coverageComplete: true,
    withinAllLimits: true,
    toolReceiptSha256,
  };
  const resource = {
    ...resourceBase,
    receiptId: calibrationAdmissionOverlapResourceReceiptId({ ...resourceBase, receiptId: undefined }),
  };

  const ledgerBase = {
    version: 'v10.3-admission-overlap-v1' as const,
    universeSha256,
    method: 'prefix-filter-exact-jaccard-0.80-v1' as const,
    normalizerRegistrySha256,
    overlapPolicySha256,
    indexReceiptSha256: index.receiptSha256,
    coverageComplete: true,
    unresolvedCandidateUnitIds: [],
    edgeShards: [],
    adjacencyShards: [],
    clusterSummaryShards: [],
    clusterMembershipShards: [],
    edgeCount: 0,
    adjacencyRowCount: 0,
    exactClusterCount: 0,
    nearClusterCount: 0,
    crossSideEdgeCount: 0,
  };
  const ledger = { ...ledgerBase, ledgerSha256: calibrationAdmissionOverlapLedgerSha256(ledgerBase) };

  const envelopeBodies = {
    index,
    resource,
    ledger,
  };
  const artifacts = [
    ['index.json', 'index', index],
    ['overlap-ledger.json', 'ledger', ledger],
    ['overlap-resource-receipt.json', 'receipt', resource],
  ].map(([relativePath, kind, value]) => {
    const body = value as object;
    const bytes = canonical(body);
    return { pathBase: 'generation_local' as const, relativePath, kind, bytes: bytes.byteLength, sha256: createHash('sha256').update(bytes).digest('hex') };
  });
  const overlapBody = {
    version: 'v10.3-admission-overlap-generation-v1' as const,
    generation: 0,
    inputGenerationSha256: 'f'.repeat(64),
    universeSha256,
    overlapPolicySha256,
    artifactSetSha256: calibrationAdmissionOverlapGenerationArtifactSetSha256(artifacts),
    artifacts,
    toolAuthoritySnapshot: resolved.snapshot,
  };
  const overlapGeneration = { ...overlapBody, generationSha256: calibrationAdmissionOverlapGenerationSha256(overlapBody) };

  const base = makePrebuiltAuthorityFixture();
  const staticBody = {
    ...base.staticGeneration,
    inputGenerationSha256: overlapGeneration.inputGenerationSha256,
    overlapGenerationSha256: overlapGeneration.generationSha256,
    toolAuthoritySnapshot: resolved.snapshot,
  };
  const staticGeneration = {
    ...staticBody,
    generationSha256: calibrationAdmissionStaticAuthorityGenerationSha256(staticBody),
  };

  return {
    staticGeneration,
    staticGenerationBytes: canonical(staticGeneration),
    overlapGeneration,
    overlapGenerationBytes: canonical(overlapGeneration),
    envelopes: {
      index: { value: envelopeBodies.index, bytes: canonical(envelopeBodies.index) },
      resource: { value: envelopeBodies.resource, bytes: canonical(envelopeBodies.resource) },
      ledger: { value: envelopeBodies.ledger, bytes: canonical(envelopeBodies.ledger) },
    },
    toolAuthority: resolved,
  };
}

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

describe('v10.3 static authority overlap/resource join', () => {
  it('accepts exact generation/envelope bytes and indexed overlap receipt membership', async () => {
    const input = await makeInput();
    expect(validatePrebuiltAdmissionAuthorityOverlapJoin(input)).toEqual({ ok: true, errors: [] });
  });

  it('requires all envelope objects and bytes before relation verification', async () => {
    const input = await makeInput();
    const result = validatePrebuiltAdmissionAuthorityOverlapJoin({
      ...input,
      envelopes: { ...input.envelopes, ledger: undefined as never },
    });
    expect(result.ok).toBe(false);
    expect(result.errors).toContain('overlap_ledger_envelope_missing');
    expect(result.errors).not.toContain('overlap_relation_ledger_invalid');
  });

  it('rejects resource receipt hash drift and failed indexed receipts', async () => {
    const input = await makeInput();
    const resource = { ...input.envelopes.resource.value, toolReceiptSha256: '0'.repeat(64) };
    const changed = { ...input, envelopes: { ...input.envelopes, resource: { value: resource, bytes: canonical(resource) } } };
    expect(validatePrebuiltAdmissionAuthorityOverlapJoin(changed).errors).toContain('overlap_resource_tool_receipt_mismatch');

    const failedReceipt = { ...input.toolAuthority.receipt, exitCode: 1 };
    expect(validatePrebuiltAdmissionAuthorityOverlapJoin({ ...input, toolAuthority: { ...input.toolAuthority, receipt: failedReceipt } as never }).errors).toContain('indexed_tool_receipt_invalid');
  });

  it('does not treat opaque primary output metadata as a resource proof', async () => {
    const input = await makeInput();
    // The indexed receipt's output-set hash is intentionally opaque and does
    // not equal the resource receipt's tool hash. The relation still succeeds
    // because only the canonical indexed receipt hash is authoritative.
    expect(input.toolAuthority.receipt.outputSetSha256).not.toBe((input.envelopes.resource.value as Record<string, unknown>).toolReceiptSha256);
    const result = validatePrebuiltAdmissionAuthorityOverlapJoin(input);
    expect(result).toEqual({ ok: true, errors: [] });
  });

  it('rejects static/overlap snapshot drift and noncanonical envelope bytes', async () => {
    const input = await makeInput();
    const alteredStatic = { ...input.staticGeneration, toolAuthoritySnapshot: { ...input.toolAuthority.snapshot, receiptIds: [] } };
    expect(validatePrebuiltAdmissionAuthorityOverlapJoin({ ...input, staticGeneration: alteredStatic, staticGenerationBytes: canonical(alteredStatic) } as never).ok).toBe(false);
    const { snapshotSha256: _snapshotSha256, ...snapshotBody } = input.toolAuthority.snapshot;
    const alteredSnapshotBody = { ...snapshotBody, receiptIds: [] };
    const alteredSnapshot = { ...alteredSnapshotBody, snapshotSha256: calibrationAdmissionSha256(alteredSnapshotBody) };
    const membership = validatePrebuiltAdmissionAuthorityOverlapJoin({
      ...input,
      toolAuthority: { ...input.toolAuthority, snapshot: alteredSnapshot } as never,
    });
    expect(membership.errors).toContain('indexed_tool_snapshot_membership_mismatch');
    expect(validatePrebuiltAdmissionAuthorityOverlapJoin({
      ...input,
      toolAuthority: { ...input.toolAuthority, authorityIndexSha256: '0'.repeat(64) } as never,
    }).errors).toContain('indexed_tool_authority_index_hash_mismatch');
    expect(validatePrebuiltAdmissionAuthorityOverlapJoin({
      ...input,
      envelopes: { ...input.envelopes, index: { ...input.envelopes.index, bytes: Buffer.concat([input.envelopes.index.bytes, Buffer.from('\n')]) } },
    }).errors).toContain('overlap_index_envelope_bytes_not_canonical');
  });
});
