import { readFile, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

import {
  calibrationAdmissionAuthorityCurrentSha256,
  calibrationAdmissionCanonicalJson,
  calibrationAdmissionLineageLedgerSha256,
  calibrationAdmissionOverlapResourceReceiptId,
  calibrationAdmissionPrivacyLedgerSha256,
  calibrationAdmissionQualityLedgerSha256,
  calibrationAdmissionSha256,
  calibrationAdmissionSourceCurrentSha256,
  calibrationAdmissionSourceGenerationSha256,
  calibrationAdmissionSourceReviewSha256,
  calibrationAdmissionToolReceiptSha256,
} from '@usebrick/core';

import {
  cleanupRuntimeFixtures,
  rewriteRuntimeBundle,
  rewriteRuntimeRecord,
  rewriteRuntimeSourceGeneration,
  rewriteRuntimeStaticGeneration,
  runtimeCandidateFixture,
  runtimeFixture,
} from './v103-admission-context-fixture';
import {
  buildVerifiedAdmissionContext,
  isVerifiedAdmissionContext,
} from '../../src/calibration/v103/admission-context';

afterEach(cleanupRuntimeFixtures);

const expectRejected = async (root: string, evidence: unknown): Promise<void> => {
  await expect(buildVerifiedAdmissionContext(root, evidence as never)).resolves.toMatchObject({ ok: false });
};

function withOverlapReceipt(
  bundle: Awaited<ReturnType<typeof runtimeFixture>>['bundle'],
  patch: Record<string, unknown>,
) {
  const body = { ...bundle.overlapResourceReceipt, ...patch, receiptId: '' };
  return {
    ...bundle,
    overlapResourceReceipt: {
      ...body,
      receiptId: calibrationAdmissionOverlapResourceReceiptId(body),
    },
  };
}

describe('v10.3 byte-backed verified admission context', () => {
  it('brands a canonical authority graph and freezes the durable context', async () => {
    const fixture = await runtimeFixture();
    const result = await buildVerifiedAdmissionContext(fixture.root, fixture.evidence);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(isVerifiedAdmissionContext(result.context)).toBe(true);
    expect(Object.isFrozen(result.context)).toBe(true);
    expect(Object.isFrozen(result.context.durable)).toBe(true);
    expect(result.context.durable.preWitnessBundleSha256).toBe(fixture.bundle.preWitnessBundleSha256);
    expect(result.context.overlapAuthority.generationSha256).toMatch(/^[a-f0-9]{64}$/);
    expect(result.context.overlapAuthority.authorityIndexSha256).toMatch(/^[a-f0-9]{64}$/);
    expect(result.context.overlapAuthority.proofSha256).toMatch(/^[a-f0-9]{64}$/);
    expect(result.context.contextSha256).toMatch(/^[a-f0-9]{64}$/);
    expect(isVerifiedAdmissionContext(structuredClone(result.context))).toBe(false);
  });

  it('requires the strict overlap generation, envelopes, and indexed tool authority', async () => {
    const missingEnvelope = await runtimeFixture();
    const staticCurrent = JSON.parse(await readFile(join(missingEnvelope.root, 'review', 'admission', 'authority', 'current.json'), 'utf8')) as { readonly staticGenerationRelativePath: string };
    const staticGeneration = JSON.parse(await readFile(join(missingEnvelope.root, staticCurrent.staticGenerationRelativePath, 'generation.json'), 'utf8')) as { readonly overlapGenerationSha256: string };
    const overlapRoot = join(missingEnvelope.root, 'review', 'admission', 'global', 'overlap', 'generations', staticGeneration.overlapGenerationSha256);
    await rm(join(overlapRoot, 'index.json'));
    await expectRejected(missingEnvelope.root, missingEnvelope.evidence);

    const tamperedEnvelope = await runtimeFixture();
    const tamperedCurrent = JSON.parse(await readFile(join(tamperedEnvelope.root, 'review', 'admission', 'authority', 'current.json'), 'utf8')) as { readonly staticGenerationRelativePath: string };
    const tamperedStatic = JSON.parse(await readFile(join(tamperedEnvelope.root, tamperedCurrent.staticGenerationRelativePath, 'generation.json'), 'utf8')) as { readonly overlapGenerationSha256: string };
    const tamperedOverlapRoot = join(tamperedEnvelope.root, 'review', 'admission', 'global', 'overlap', 'generations', tamperedStatic.overlapGenerationSha256);
    const resourcePath = join(tamperedOverlapRoot, 'overlap-resource-receipt.json');
    const resource = JSON.parse(await readFile(resourcePath, 'utf8')) as Record<string, unknown>;
    await writeFile(resourcePath, calibrationAdmissionCanonicalJson({ ...resource, toolReceiptSha256: 'f'.repeat(64) }));
    await expectRejected(tamperedEnvelope.root, tamperedEnvelope.evidence);

    const missingAuthority = await runtimeFixture();
    await rm(join(missingAuthority.root, 'review', 'admission', 'tool-authority', 'index.json'));
    await expectRejected(missingAuthority.root, missingAuthority.evidence);

    const orphanArtifact = await runtimeFixture();
    const orphanCurrent = JSON.parse(await readFile(join(orphanArtifact.root, 'review', 'admission', 'authority', 'current.json'), 'utf8')) as { readonly staticGenerationRelativePath: string };
    const orphanStatic = JSON.parse(await readFile(join(orphanArtifact.root, orphanCurrent.staticGenerationRelativePath, 'generation.json'), 'utf8')) as { readonly overlapGenerationSha256: string };
    await writeFile(join(orphanArtifact.root, 'review', 'admission', 'global', 'overlap', 'generations', orphanStatic.overlapGenerationSha256, 'orphan-shard.json'), '{}');
    await expectRejected(orphanArtifact.root, orphanArtifact.evidence);

    const missingOverlapCurrent = await runtimeFixture();
    await rm(join(missingOverlapCurrent.root, 'review', 'admission', 'global', 'overlap', 'current-generation.json'));
    await expectRejected(missingOverlapCurrent.root, missingOverlapCurrent.evidence);
  });

  it('rejects unbranded evidence, fake filesystem input, proxies, and malformed authority values', async () => {
    const fixture = await runtimeFixture();
    await expectRejected(fixture.root, {});
    await expect(buildVerifiedAdmissionContext(fixture.root, fixture.evidence, { filesystem: { readFile: () => fixture.bundle } })).resolves.toMatchObject({ ok: false });
    const hostile = new Proxy(fixture.evidence as object, { get() { throw new Error('hostile evidence'); } });
    await expectRejected(fixture.root, hostile);

    const currentPath = join(fixture.root, 'review', 'admission', 'authority', 'current.json');
    const current = JSON.parse(await readFile(currentPath, 'utf8')) as Record<string, unknown>;
    await writeFile(currentPath, calibrationAdmissionCanonicalJson({ ...current, currentSha256: 'f'.repeat(64) }));
    await expectRejected(fixture.root, fixture.evidence);
    const traversalBody = {
      ...current,
      staticGenerationRelativePath: 'review/admission/authority/static-generations/../outside',
      currentSha256: '',
    };
    await writeFile(currentPath, calibrationAdmissionCanonicalJson({
      ...traversalBody,
      currentSha256: calibrationAdmissionAuthorityCurrentSha256(traversalBody),
    }));
    await expectRejected(fixture.root, fixture.evidence);
  });

  it('follows only the exact pointer/generation/bundle/stream paths', async () => {
    const fixture = await runtimeFixture();
    const currentPath = join(fixture.root, 'review', 'admission', 'authority', 'current.json');
    const current = JSON.parse(await readFile(currentPath, 'utf8')) as { readonly staticGenerationRelativePath: string };
    const staticPath = join(fixture.root, current.staticGenerationRelativePath);
    await writeFile(join(fixture.root, 'review', 'admission', 'authority', 'current-orphan.json'), '{}');
    await rm(join(staticPath, 'privacy-ledger.json'));
    await expectRejected(fixture.root, fixture.evidence);

    const inputArtifact = await runtimeFixture();
    const inputCurrent = JSON.parse(await readFile(join(inputArtifact.root, 'review', 'admission', 'authority', 'current.json'), 'utf8')) as { readonly staticGenerationRelativePath: string };
    const inputStatic = JSON.parse(await readFile(join(inputArtifact.root, inputCurrent.staticGenerationRelativePath, 'generation.json'), 'utf8')) as { readonly inputGenerationSha256: string };
    const inputRoot = join(inputArtifact.root, 'review', 'admission', 'authority', 'input-generations', inputStatic.inputGenerationSha256);
    await rm(join(inputRoot, 'overlap-universe.json'));
    await expectRejected(inputArtifact.root, inputArtifact.evidence);

    const inputOrphan = await runtimeFixture();
    const orphanCurrent = JSON.parse(await readFile(join(inputOrphan.root, 'review', 'admission', 'authority', 'current.json'), 'utf8')) as { readonly staticGenerationRelativePath: string };
    const orphanStatic = JSON.parse(await readFile(join(inputOrphan.root, orphanCurrent.staticGenerationRelativePath, 'generation.json'), 'utf8')) as { readonly inputGenerationSha256: string };
    await writeFile(join(inputOrphan.root, 'review', 'admission', 'authority', 'input-generations', orphanStatic.inputGenerationSha256, 'orphan.json'), '{}');
    await expectRejected(inputOrphan.root, inputOrphan.evidence);

    const missing = await runtimeFixture();
    const missingCurrent = JSON.parse(await readFile(join(missing.root, 'review', 'admission', 'authority', 'current.json'), 'utf8')) as { readonly staticGenerationRelativePath: string };
    await rm(join(missing.root, missingCurrent.staticGenerationRelativePath, 'generation.json'));
    await expectRejected(missing.root, missing.evidence);

    const receiptMutation = await runtimeFixture();
    await rewriteRuntimeStaticGeneration(receiptMutation.root, (generation) => ({
      ...generation,
      artifacts: generation.artifacts.map((artifact) => artifact.kind === 'bundle' && artifact.relativePath === 'pre-witness-bundle.json'
        ? { ...artifact, bytes: artifact.bytes + 1 }
        : artifact),
    }));
    await expectRejected(receiptMutation.root, receiptMutation.evidence);

    const bundleJoin = await runtimeFixture();
    await rewriteRuntimeStaticGeneration(bundleJoin.root, (generation) => ({
      ...generation,
      preWitnessBundleSha256: 'f'.repeat(64),
    }));
    await expectRejected(bundleJoin.root, bundleJoin.evidence);

    const snapshotJoin = await runtimeFixture();
    await rewriteRuntimeStaticGeneration(snapshotJoin.root, (generation) => ({
      ...generation,
      toolAuthoritySnapshot: (() => {
        const body = { ...generation.toolAuthoritySnapshot, indexGenerationSha256: 'f'.repeat(64), snapshotSha256: '' };
        return { ...body, snapshotSha256: calibrationAdmissionSha256(body) };
      })(),
    }));
    await expectRejected(snapshotJoin.root, snapshotJoin.evidence);
  });

  it('requires each source review current pointer, generation, and artifact receipt', async () => {
    const missingCurrent = await runtimeFixture();
    const sourceId = String(missingCurrent.bundle.sourceReviews[0]!.sourceId);
    await rm(join(missingCurrent.root, 'review', 'admission', 'sources', sourceId, 'current.json'));
    await expectRejected(missingCurrent.root, missingCurrent.evidence);

    const missingGeneration = await runtimeFixture();
    const generationSourceId = String(missingGeneration.bundle.sourceReviews[0]!.sourceId);
    const generationCurrent = JSON.parse(await readFile(join(missingGeneration.root, 'review', 'admission', 'sources', generationSourceId, 'current.json'), 'utf8')) as { readonly generationRelativePath: string };
    await rm(join(missingGeneration.root, 'review', 'admission', generationCurrent.generationRelativePath, 'source-generation.json'));
    await expectRejected(missingGeneration.root, missingGeneration.evidence);

    const wrongGenerationHash = await runtimeFixture();
    const hashSourceId = String(wrongGenerationHash.bundle.sourceReviews[0]!.sourceId);
    const hashCurrentPath = join(wrongGenerationHash.root, 'review', 'admission', 'sources', hashSourceId, 'current.json');
    const hashCurrent = JSON.parse(await readFile(hashCurrentPath, 'utf8')) as Record<string, unknown>;
    const wrongHashBody = {
      ...hashCurrent,
      generationSha256: 'f'.repeat(64),
      generationRelativePath: `sources/${hashSourceId}/generations/${'f'.repeat(64)}`,
      currentSha256: '',
    };
    await writeFile(hashCurrentPath, calibrationAdmissionCanonicalJson({
      ...wrongHashBody,
      currentSha256: calibrationAdmissionSourceCurrentSha256(wrongHashBody),
    }));
    await expectRejected(wrongGenerationHash.root, wrongGenerationHash.evidence);

    const traversal = await runtimeFixture();
    const traversalSourceId = String(traversal.bundle.sourceReviews[0]!.sourceId);
    const traversalCurrentPath = join(traversal.root, 'review', 'admission', 'sources', traversalSourceId, 'current.json');
    const traversalCurrent = JSON.parse(await readFile(traversalCurrentPath, 'utf8')) as Record<string, unknown>;
    const traversalBody = {
      ...traversalCurrent,
      generationRelativePath: `sources/${traversalSourceId}/generations/../outside`,
      currentSha256: '',
    };
    await writeFile(traversalCurrentPath, calibrationAdmissionCanonicalJson({
      ...traversalBody,
      currentSha256: calibrationAdmissionSourceCurrentSha256(traversalBody),
    }));
    await expectRejected(traversal.root, traversal.evidence);

    const receiptBytes = await runtimeFixture();
    const receiptSourceId = String(receiptBytes.bundle.sourceReviews[0]!.sourceId);
    await rewriteRuntimeSourceGeneration(receiptBytes.root, receiptSourceId, (generation) => ({
      ...generation,
      artifacts: generation.artifacts.map((artifact) => artifact.kind === 'source_review'
        ? { ...artifact, bytes: artifact.bytes + 1 }
        : artifact),
    }));
    await expectRejected(receiptBytes.root, receiptBytes.evidence);

    const receiptHash = await runtimeFixture();
    const receiptHashSourceId = String(receiptHash.bundle.sourceReviews[0]!.sourceId);
    await rewriteRuntimeSourceGeneration(receiptHash.root, receiptHashSourceId, (generation) => ({
      ...generation,
      artifacts: generation.artifacts.map((artifact) => artifact.kind === 'source_review'
        ? { ...artifact, sha256: 'f'.repeat(64) }
        : artifact),
    }));
    await expectRejected(receiptHash.root, receiptHash.evidence);
  }, 120_000);

  it('accepts an independent-review source only with its complete semantic authority graph', async () => {
    const fixture = await runtimeCandidateFixture();
    const result = await buildVerifiedAdmissionContext(fixture.root, fixture.evidence);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.context.overlapAuthority.sourceAuthoritySha256).toMatch(/^[a-f0-9]{64}$/);
  }, 120_000);

  it('rejects candidate sources when semantic or approval sidecars are missing or tampered', async () => {
    const missingSemantic = await runtimeCandidateFixture();
    const currentPath = join(missingSemantic.root, 'review', 'admission', 'sources', missingSemantic.candidateSourceId, 'current.json');
    const current = JSON.parse(await readFile(currentPath, 'utf8')) as { readonly generationRelativePath: string };
    const generationPath = join(missingSemantic.root, 'review', 'admission', current.generationRelativePath);
    await rm(join(generationPath, 'source-semantic-authority.json'));
    await expectRejected(missingSemantic.root, missingSemantic.evidence);

    const tamperedSemantic = await runtimeCandidateFixture();
    const tamperedCurrentPath = join(tamperedSemantic.root, 'review', 'admission', 'sources', tamperedSemantic.candidateSourceId, 'current.json');
    const tamperedCurrent = JSON.parse(await readFile(tamperedCurrentPath, 'utf8')) as { readonly generationRelativePath: string };
    const tamperedSemanticPath = join(tamperedSemantic.root, 'review', 'admission', tamperedCurrent.generationRelativePath, 'source-semantic-authority.json');
    const semantic = JSON.parse(await readFile(tamperedSemanticPath, 'utf8')) as Record<string, unknown>;
    await writeFile(tamperedSemanticPath, calibrationAdmissionCanonicalJson({ ...semantic, authoritySha256: 'f'.repeat(64) }));
    await expectRejected(tamperedSemantic.root, tamperedSemantic.evidence);

    const missingApproval = await runtimeCandidateFixture();
    const approvalCurrentPath = join(missingApproval.root, 'review', 'admission', 'sources', missingApproval.candidateSourceId, 'current.json');
    const approvalCurrent = JSON.parse(await readFile(approvalCurrentPath, 'utf8')) as { readonly generationRelativePath: string };
    const approvalGeneration = JSON.parse(await readFile(join(missingApproval.root, 'review', 'admission', approvalCurrent.generationRelativePath, 'source-generation.json'), 'utf8')) as { readonly proposalId: string };
    await rm(join(missingApproval.root, 'review', 'admission', 'sources', missingApproval.candidateSourceId, 'proposals', `${approvalGeneration.proposalId}-approval.json`));
    await expectRejected(missingApproval.root, missingApproval.evidence);
  }, 240_000);

  it('rejects a self-hashed source generation stored under a different current pointer hash', async () => {
    const fixture = await runtimeFixture();
    const sourceId = String(fixture.bundle.sourceReviews[0]!.sourceId);
    const admissionRoot = join(fixture.root, 'review', 'admission');
    const currentPath = join(admissionRoot, 'sources', sourceId, 'current.json');
    const current = JSON.parse(await readFile(currentPath, 'utf8')) as {
      readonly generationSha256: string;
      readonly generationRelativePath: string;
    };
    const generationPath = join(admissionRoot, current.generationRelativePath, 'source-generation.json');
    const generation = JSON.parse(await readFile(generationPath, 'utf8')) as Record<string, unknown>;
    const generationBody = {
      ...generation,
      proposalId: `${String(generation.proposalId)}-alternate`,
      generationSha256: '',
    };
    const mismatchedGeneration = {
      ...generationBody,
      generationSha256: calibrationAdmissionSourceGenerationSha256(generationBody),
    };
    expect(mismatchedGeneration.generationSha256).not.toBe(current.generationSha256);
    await writeFile(generationPath, calibrationAdmissionCanonicalJson(mismatchedGeneration));
    await expectRejected(fixture.root, fixture.evidence);
  });

  it('rejects a ledger artifact receipt hash mutation after generation/current rehashing', async () => {
    const fixture = await runtimeFixture();
    await rewriteRuntimeStaticGeneration(fixture.root, (generation) => ({
      ...generation,
      artifacts: generation.artifacts.map((artifact) => artifact.kind === 'ledger' && artifact.relativePath === 'privacy-ledger.json'
        ? { ...artifact, sha256: 'f'.repeat(64) }
        : artifact),
    }));
    await expectRejected(fixture.root, fixture.evidence);

    const bundle = await runtimeFixture();
    await rewriteRuntimeStaticGeneration(bundle.root, (generation) => ({
      ...generation,
      artifacts: generation.artifacts.map((artifact) => artifact.kind === 'bundle' && artifact.relativePath === 'pre-witness-bundle.json'
        ? { ...artifact, sha256: 'f'.repeat(64) }
        : artifact),
    }));
    await expectRejected(bundle.root, bundle.evidence);
  });

  it('rejects UTF-8 BOM prefixes on every canonical authority read', async () => {
    const current = await runtimeFixture();
    const currentPath = join(current.root, 'review', 'admission', 'authority', 'current.json');
    await writeFile(currentPath, Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), await readFile(currentPath)]));
    await expectRejected(current.root, current.evidence);

    const generation = await runtimeFixture();
    const generationCurrent = JSON.parse(await readFile(join(generation.root, 'review', 'admission', 'authority', 'current.json'), 'utf8')) as { readonly staticGenerationRelativePath: string };
    const generationPath = join(generation.root, generationCurrent.staticGenerationRelativePath, 'generation.json');
    await writeFile(generationPath, Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), await readFile(generationPath)]));
    await expectRejected(generation.root, generation.evidence);

    const bundle = await runtimeFixture();
    const bundleCurrent = JSON.parse(await readFile(join(bundle.root, 'review', 'admission', 'authority', 'current.json'), 'utf8')) as { readonly staticGenerationRelativePath: string };
    const bundlePath = join(bundle.root, bundleCurrent.staticGenerationRelativePath, 'pre-witness-bundle.json');
    await writeFile(bundlePath, Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), await readFile(bundlePath)]));
    await expectRejected(bundle.root, bundle.evidence);

    const stream = await runtimeFixture();
    const streamPath = join(stream.root, 'review', 'admission', 'admission-records.jsonl');
    await writeFile(streamPath, Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), await readFile(streamPath)]));
    await expectRejected(stream.root, stream.evidence);

    const sourceCurrent = await runtimeFixture();
    const sourceCurrentId = String(sourceCurrent.bundle.sourceReviews[0]!.sourceId);
    const sourceCurrentPath = join(sourceCurrent.root, 'review', 'admission', 'sources', sourceCurrentId, 'current.json');
    await writeFile(sourceCurrentPath, Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), await readFile(sourceCurrentPath)]));
    await expectRejected(sourceCurrent.root, sourceCurrent.evidence);

    const sourceGeneration = await runtimeFixture();
    const sourceGenerationId = String(sourceGeneration.bundle.sourceReviews[0]!.sourceId);
    const sourceGenerationCurrent = JSON.parse(await readFile(join(sourceGeneration.root, 'review', 'admission', 'sources', sourceGenerationId, 'current.json'), 'utf8')) as { readonly generationRelativePath: string };
    const sourceGenerationPath = join(sourceGeneration.root, 'review', 'admission', sourceGenerationCurrent.generationRelativePath, 'source-generation.json');
    await writeFile(sourceGenerationPath, Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), await readFile(sourceGenerationPath)]));
    await expectRejected(sourceGeneration.root, sourceGeneration.evidence);

    const sourceReview = await runtimeFixture();
    const sourceReviewId = String(sourceReview.bundle.sourceReviews[0]!.sourceId);
    const sourceReviewCurrent = JSON.parse(await readFile(join(sourceReview.root, 'review', 'admission', 'sources', sourceReviewId, 'current.json'), 'utf8')) as { readonly generationRelativePath: string };
    const sourceReviewPath = join(sourceReview.root, 'review', 'admission', sourceReviewCurrent.generationRelativePath, 'source-review.json');
    await writeFile(sourceReviewPath, Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), await readFile(sourceReviewPath)]));
    await expectRejected(sourceReview.root, sourceReview.evidence);
  });

  it('rejects a same-ID record mutation after stream, bundle, static, and current rehashing', async () => {
    const fixture = await runtimeFixture();
    await rewriteRuntimeRecord(fixture.root, (record) => ({ ...record, sourceReviewSha256: 'f'.repeat(64) }));
    await expectRejected(fixture.root, fixture.evidence);
  });

  it('rejects record-stream byte, count, ID-set, aggregate, and path mutations', async () => {
    const byteMutation = await runtimeFixture();
    await writeFile(join(byteMutation.root, 'review', 'admission', 'admission-records.jsonl'), Buffer.from('not-canonical\\n', 'utf8'));
    await expectRejected(byteMutation.root, byteMutation.evidence);

    const countMutation = await runtimeFixture();
    await rewriteRuntimeBundle(countMutation.root, (bundle) => ({
      ...bundle,
      admissionRecordStream: { ...bundle.admissionRecordStream, recordCount: bundle.admissionRecordStream.recordCount + 1 },
    }));
    await expectRejected(countMutation.root, countMutation.evidence);

    const idSetMutation = await runtimeFixture();
    await rewriteRuntimeBundle(idSetMutation.root, (bundle) => ({
      ...bundle,
      admissionRecordStream: { ...bundle.admissionRecordStream, recordIdSetSha256: 'f'.repeat(64) },
    }));
    await expectRejected(idSetMutation.root, idSetMutation.evidence);

    const aggregateMutation = await runtimeFixture();
    await rewriteRuntimeBundle(aggregateMutation.root, (bundle) => ({
      ...bundle,
      admissionRecordStream: { ...bundle.admissionRecordStream, canonicalRecordHashesSha256: 'f'.repeat(64) },
    }));
    await expectRejected(aggregateMutation.root, aggregateMutation.evidence);

    const pathMutation = await runtimeFixture();
    await rewriteRuntimeBundle(pathMutation.root, (bundle) => ({
      ...bundle,
      admissionRecordStream: { ...bundle.admissionRecordStream, relativePath: '../outside.jsonl' },
    }));
    await expectRejected(pathMutation.root, pathMutation.evidence);
  });

  it('passes exact record IDs to each Core ledger validator and rejects partition drift', async () => {
    const privacy = await runtimeFixture();
    await rewriteRuntimeBundle(privacy.root, (bundle) => {
      const body = { ...bundle.privacyLedger, unresolvedRecordIds: [], ledgerSha256: '' };
      return { ...bundle, privacyLedger: { ...body, ledgerSha256: calibrationAdmissionPrivacyLedgerSha256(body) } };
    });
    await expectRejected(privacy.root, privacy.evidence);

    const quality = await runtimeFixture();
    await rewriteRuntimeBundle(quality.root, (bundle) => {
      const body = { ...bundle.qualityLedger, unresolvedRecordIds: [], ledgerSha256: '' };
      return { ...bundle, qualityLedger: { ...body, ledgerSha256: calibrationAdmissionQualityLedgerSha256(body) } };
    });
    await expectRejected(quality.root, quality.evidence);

    const lineage = await runtimeFixture();
    await rewriteRuntimeBundle(lineage.root, (bundle) => {
      const body = { ...bundle.lineageLedger, unresolvedRecordIds: [], ledgerSha256: '' };
      return { ...bundle, lineageLedger: { ...body, ledgerSha256: calibrationAdmissionLineageLedgerSha256(body) } };
    });
    await expectRejected(lineage.root, lineage.evidence);
  });

  it('rejects source-review drift and incomplete or placeholder overlap receipts', async () => {
    const source = await runtimeFixture();
    await rewriteRuntimeBundle(source.root, (bundle) => ({
      ...bundle,
      sourceReviews: [{ ...bundle.sourceReviews[0]!, sourceId: 'mutated-source-id' }, ...bundle.sourceReviews.slice(1)],
    }));
    await expectRejected(source.root, source.evidence);

    const incomplete = await runtimeFixture();
    await rewriteRuntimeBundle(incomplete.root, (bundle) => withOverlapReceipt(bundle, { coverageComplete: false }));
    await expectRejected(incomplete.root, incomplete.evidence);

    const exceeded = await runtimeFixture();
    await rewriteRuntimeBundle(exceeded.root, (bundle) => withOverlapReceipt(bundle, { withinAllLimits: false }));
    await expectRejected(exceeded.root, exceeded.evidence);

    const placeholder = await runtimeFixture();
    await rewriteRuntimeBundle(placeholder.root, (bundle) => withOverlapReceipt(bundle, { toolReceiptSha256: 'a'.repeat(64) }));
    await expectRejected(placeholder.root, placeholder.evidence);

    const wrongAction = await runtimeFixture();
    await rewriteRuntimeBundle(wrongAction.root, (bundle) => withOverlapReceipt(bundle, {
      toolReceiptSha256: calibrationAdmissionToolReceiptSha256(bundle.toolReceipts.find((receipt) => receipt.action !== 'authority:overlap')!),
    }));
    await expectRejected(wrongAction.root, wrongAction.evidence);
  });

  it('rejects rich-bundle source-review reason drift despite rehashed record and authority graph', async () => {
    const fixture = await runtimeFixture();
    const sourceReview = fixture.bundle.sourceReviews[0]!;
    const driftedReview = { ...sourceReview, reasons: ['review_incomplete'] as const };
    await rewriteRuntimeBundle(fixture.root, (bundle) => ({
      ...bundle,
      sourceReviews: bundle.sourceReviews.map((review) => review.sourceId === sourceReview.sourceId ? driftedReview : review),
    }));
    const driftedSourceReviewSha256 = calibrationAdmissionSourceReviewSha256(driftedReview);
    await rewriteRuntimeRecord(fixture.root, (record) => record.materialSourceId === sourceReview.sourceId
      ? { ...record, sourceReviewSha256: driftedSourceReviewSha256 }
      : record);
    await expectRejected(fixture.root, fixture.evidence);
  });
});
