import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import {
  calibrationAdmissionCanonicalJson,
  calibrationAdmissionInputGenerationProposalSha256,
  calibrationAdmissionToolReceiptSha256,
  type CalibrationAdmissionAuthorityCurrentV1,
  type CalibrationAdmissionInputGenerationV1,
  type CalibrationAdmissionStaticAuthorityGenerationV1,
} from '@usebrick/core';

import { resolveAdmissionToolAuthorityReceipt } from '../../src/calibration/v103/admission-publication';
import { materializePrebuiltAdmissionAuthority } from '../../src/calibration/v103/admission-authority-materializer';
import type { PrebuiltAdmissionAuthorityGraphInput } from '../../src/calibration/v103/admission-authority-rebuild';
import { cleanupRuntimeFixtures, runtimeFixture } from './v103-admission-context-fixture';

afterEach(cleanupRuntimeFixtures);

function jsonBytes(value: unknown): Buffer {
  return Buffer.from(calibrationAdmissionCanonicalJson(value), 'utf8');
}

async function readJson(path: string): Promise<unknown> {
  return JSON.parse(await readFile(path, 'utf8')) as unknown;
}

async function materializerFixture() {
  const fixture = await runtimeFixture();
  const admissionRoot = join(fixture.root, 'review', 'admission');
  const current = await readJson(join(admissionRoot, 'authority', 'current.json')) as CalibrationAdmissionAuthorityCurrentV1;
  const staticPath = join(fixture.root, current.staticGenerationRelativePath);
  const staticGeneration = await readJson(join(staticPath, 'generation.json')) as CalibrationAdmissionStaticAuthorityGenerationV1;
  const inputGenerationRoot = join(admissionRoot, 'authority', 'input-generations');
  const inputGenerationIds = await readdir(inputGenerationRoot);
  expect(inputGenerationIds).toHaveLength(1);
  const inputPath = join(inputGenerationRoot, inputGenerationIds[0]!);
  const inputGeneration = await readJson(join(inputPath, 'generation.json')) as CalibrationAdmissionInputGenerationV1;

  const sourceAuthorities = await Promise.all(inputGeneration.sourceGenerations.map(async (reference) => {
    const sourceRoot = join(admissionRoot, 'sources', reference.sourceId);
    const sourceCurrent = await readJson(join(sourceRoot, 'current.json')) as Record<string, unknown>;
    const sourceGenerationRoot = join(admissionRoot, String(sourceCurrent.generationRelativePath));
    const sourceGeneration = await readJson(join(sourceGenerationRoot, 'source-generation.json')) as Record<string, unknown>;
    const sourceReviewBytes = await readFile(join(sourceGenerationRoot, 'source-review.json'));
    const artifactBytes: Record<string, Buffer> = {};
    for (const artifact of (sourceGeneration.artifacts as readonly { relativePath: string }[])) {
      artifactBytes[artifact.relativePath] = await readFile(join(sourceGenerationRoot, artifact.relativePath));
    }
    return {
      sourceGeneration,
      sourceGenerationBytes: jsonBytes(sourceGeneration),
      current: sourceCurrent,
      currentBytes: jsonBytes(sourceCurrent),
      sourceReviewBytes,
      artifactBytes,
    };
  }));

  const graph: PrebuiltAdmissionAuthorityGraphInput = {
    proposal: {},
    proposalBytes: Buffer.from('{}', 'utf8'),
    inputGeneration,
    inputGenerationBytes: await readFile(join(inputPath, 'generation.json')),
    inputGenerationArtifactBytes: Object.fromEntries(await Promise.all(inputGeneration.artifacts.map(async (artifact) => [
      artifact.relativePath,
      await readFile(join(inputPath, artifact.relativePath)),
    ] as const))),
    staticGeneration,
    staticGenerationBytes: await readFile(join(staticPath, 'generation.json')),
    staticGenerationArtifactBytes: Object.fromEntries(await Promise.all(staticGeneration.artifacts.map(async (artifact) => [
      artifact.relativePath,
      await readFile(join(staticPath, artifact.relativePath)),
    ] as const))),
    current,
    currentBytes: await readFile(join(admissionRoot, 'authority', 'current.json')),
    sources: sourceAuthorities,
  };

  // The fixture intentionally does not persist input-generation proposals;
  // the proposal is supplied explicitly here from the exact source refs and
  // input-generation artifact declarations used by its graph.  This keeps
  // the materializer test about the explicit byte boundary, not path lookup.
  const proposalBody = {
    version: 'v10.3-admission-input-generation-proposal-v1' as const,
    proposalId: `proposal-${inputGeneration.generationSha256}`,
    operation: 'create' as const,
    expectedCurrentState: { kind: 'absent' as const },
    evidenceBundleSha256: inputGeneration.evidenceBundleSha256,
    sourceGenerationProposals: inputGeneration.sourceGenerations.map((source) => ({
      sourceId: source.sourceId,
      proposalId: String((graph.sources.find((candidate) => (candidate.sourceGeneration as Record<string, unknown>).sourceId === source.sourceId)!.sourceGeneration as Record<string, unknown>).proposalId),
      proposalRelativePath: `review/admission/sources/${source.sourceId}/proposals/${String((graph.sources.find((candidate) => (candidate.sourceGeneration as Record<string, unknown>).sourceId === source.sourceId)!.sourceGeneration as Record<string, unknown>).proposalId)}.json`,
      proposalSha256: String((graph.sources.find((candidate) => (candidate.sourceGeneration as Record<string, unknown>).sourceId === source.sourceId)!.sourceGeneration as Record<string, unknown>).proposalSha256),
    })),
    admissionRecordStream: inputGeneration.artifacts.find((artifact) => artifact.kind === 'record_stream')!,
    overlapUniverse: inputGeneration.artifacts.find((artifact) => artifact.kind === 'overlap_universe')!,
    overlapUniverseRecords: inputGeneration.artifacts.find((artifact) => artifact.kind === 'overlap_universe_stream')!,
  };
  // Replace the intentionally synthetic proposal with the canonical proposal
  // that the fixture's source refs imply.  This object is only test setup; the
  // production assembler never creates or discovers it.
  const proposal = { ...proposalBody, proposalSha256: calibrationAdmissionInputGenerationProposalSha256(proposalBody) };
  const proposalBytes = jsonBytes(proposal);

  const overlapRoot = join(admissionRoot, 'global', 'overlap', 'generations', staticGeneration.overlapGenerationSha256);
  const overlapGeneration = await readJson(join(overlapRoot, 'generation.json'));
  const toolReceipt = fixture.bundle.toolReceipts.find((receipt) => receipt.action === 'authority:overlap');
  if (!toolReceipt) throw new Error('fixture missing overlap tool receipt');
  const toolAuthority = await resolveAdmissionToolAuthorityReceipt({
    authorityRoot: join(admissionRoot, 'tool-authority'),
    authorityIndexSha256: fixture.bundle.toolAuthoritySnapshot.indexGenerationSha256,
    receiptId: toolReceipt.receiptId,
    receiptSha256: calibrationAdmissionToolReceiptSha256(toolReceipt),
    invocationIntentId: toolReceipt.invocationIntentId,
    profileId: toolReceipt.profileId,
    action: 'authority:overlap',
    outputSetSha256: toolReceipt.outputSetSha256,
  });
  return {
    fixture,
    graph: { ...graph, proposal, proposalBytes },
    preWitnessBundle: fixture.bundle,
    preWitnessBundleBytes: jsonBytes(fixture.bundle),
    overlap: {
      generation: overlapGeneration,
      generationBytes: jsonBytes(overlapGeneration),
      index: { value: await readJson(join(overlapRoot, 'index.json')), bytes: await readFile(join(overlapRoot, 'index.json')) },
      resourceReceipt: { value: await readJson(join(overlapRoot, 'overlap-resource-receipt.json')), bytes: await readFile(join(overlapRoot, 'overlap-resource-receipt.json')) },
      ledger: { value: await readJson(join(overlapRoot, 'overlap-ledger.json')), bytes: await readFile(join(overlapRoot, 'overlap-ledger.json')) },
      toolAuthority,
    },
    realScaleExpectation: {
      recordCount: fixture.bundle.admissionRecordStream.recordCount,
      universeSha256: fixture.bundle.overlapUniverse.universeSha256,
      recordsJsonlSha256: fixture.bundle.admissionRecordStream.recordsJsonlSha256,
    },
  };
}

describe('v10.3 pure outer admission authority materializer', () => {
  it('assembles only an explicit byte-backed, real-scale pre-witness graph', async () => {
    const input = await materializerFixture();
    const result = materializePrebuiltAdmissionAuthority(input);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.ready).toBe(false);
    expect(result.value.authorityEligible).toBe(false);
    expect(result.value.diagnosticOnly).toBe(true);
    expect(result.value.verificationSha256).toMatch(/^[a-f0-9]{64}$/u);
  });

  it('rejects resource receipt substitution before returning a graph', async () => {
    const input = await materializerFixture();
    const result = materializePrebuiltAdmissionAuthority({
      ...input,
      overlap: {
        ...input.overlap,
        resourceReceipt: {
          value: { ...input.overlap.resourceReceipt.value as Record<string, unknown>, recordCount: 99 },
          bytes: input.overlap.resourceReceipt.bytes,
        },
      },
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errors.some((error) => error.includes('real-scale') || error.includes('overlap'))).toBe(true);
  });

  it('rejects static bundle bytes that differ from the declared artifact', async () => {
    const input = await materializerFixture();
    const bad = Buffer.from(`${calibrationAdmissionCanonicalJson(input.preWitnessBundle)}\n`, 'utf8');
    const result = materializePrebuiltAdmissionAuthority({ ...input, preWitnessBundleBytes: bad });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errors).toContain('pre-witness bundle bytes are not usable');
  });

  it('rejects a stream mutation even when the graph object is unchanged', async () => {
    const input = await materializerFixture();
    const stream = input.graph.inputGenerationArtifactBytes;
    const current = stream instanceof Object && !Array.isArray(stream)
      ? stream['admission-records.jsonl']
      : undefined;
    if (!(current instanceof Uint8Array)) throw new Error('fixture stream bytes missing');
    const mutated = { ...(stream as Record<string, Uint8Array>), 'admission-records.jsonl': Buffer.from(`${Buffer.from(current).toString('utf8')}\n`, 'utf8') };
    const result = materializePrebuiltAdmissionAuthority({
      ...input,
      graph: { ...input.graph, inputGenerationArtifactBytes: mutated },
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errors.some((error) => error.includes('record-stream') || error.includes('admission record stream'))).toBe(true);
  });
});
