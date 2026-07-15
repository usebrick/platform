import { createHash } from 'node:crypto';
import { mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import {
  calibrationAdmissionAuthorityCurrentSha256,
  calibrationAdmissionCanonicalJson,
  calibrationAdmissionStaticAuthorityGenerationSha256,
} from '@usebrick/core';

import {
  PrebuiltAuthorityPublicationPendingError,
} from '../../src/calibration/v103/admission-authority-rebuild-publication';
import {
  rebuildPrebuiltAdmissionAuthority,
  recoverPrebuiltAdmissionAuthorityWithVerification,
} from '../../src/calibration/v103/admission-authority-rebuild-adapter';
import {
  publishAdmissionToolInvocationIntent,
  publishAdmissionToolReceipt,
  resolveAdmissionToolAuthorityReceipt,
} from '../../src/calibration/v103/admission-publication';
import {
  makePrebuiltAuthorityFixture,
  makeSemanticIndependentAuthorityFixture,
} from './v103-admission-authority-rebuild-fixture';

const roots: string[] = [];
const sha = (value: string): string => createHash('sha256').update(value).digest('hex');

async function authorityBackedFixture(
  fixture: ReturnType<typeof makePrebuiltAuthorityFixture>,
  root: string,
): Promise<{
  readonly fixture: ReturnType<typeof makePrebuiltAuthorityFixture>;
  readonly toolAuthority: {
    readonly authorityRoot: string;
    readonly authorityIndexSha256: string;
    readonly receiptId: string;
    readonly receiptSha256: string;
    readonly invocationIntentId: string;
    readonly profileId: 'admission-static-ledgers-v1';
    readonly action: 'authority:overlap';
    readonly outputSetSha256: string;
  };
}> {
  const authorityRoot = join(root, 'review', 'admission', 'tool-authority');
  const intent = await publishAdmissionToolInvocationIntent({
    toolAuthorityRoot: authorityRoot,
    profileId: 'admission-static-ledgers-v1',
    action: 'authority:overlap',
    canonicalArgvSha256: sha('adapter-argv'),
    inputSetSha256: sha('adapter-input'),
    executableBehaviorSha256: sha('adapter-executable'),
  });
  const receipt = await publishAdmissionToolReceipt({
    toolAuthorityRoot: authorityRoot,
    invocationIntentId: intent.intent.intentId,
    observedResourceUsage: { maxHeapMiB: 32, wallSeconds: 1 },
    exitCode: 0,
    outputSetSha256: sha('adapter-output'),
  });
  const resolved = await resolveAdmissionToolAuthorityReceipt({
    authorityRoot,
    authorityIndexSha256: receipt.toolAuthorityIndexSha256,
    receiptId: receipt.receipt.receiptId,
    receiptSha256: receipt.receiptSha256,
    invocationIntentId: intent.intent.intentId,
    profileId: 'admission-static-ledgers-v1',
    action: 'authority:overlap',
    outputSetSha256: receipt.receipt.outputSetSha256,
  });
  const staticBody = {
    ...fixture.staticGeneration,
    toolAuthoritySnapshot: resolved.snapshot,
  };
  delete (staticBody as { generationSha256?: string }).generationSha256;
  const staticGeneration = {
    ...staticBody,
    generationSha256: calibrationAdmissionStaticAuthorityGenerationSha256(staticBody),
  };
  const currentBody = {
    ...fixture.current,
    staticGenerationSha256: staticGeneration.generationSha256,
    staticGenerationRelativePath: `review/admission/authority/static-generations/${staticGeneration.generationSha256}`,
  };
  delete (currentBody as { currentSha256?: string }).currentSha256;
  const current = {
    ...currentBody,
    currentSha256: calibrationAdmissionAuthorityCurrentSha256(currentBody),
  };
  return {
    fixture: {
      ...fixture,
      staticGeneration,
      staticGenerationBytes: Buffer.from(calibrationAdmissionCanonicalJson(staticGeneration), 'utf8'),
      current,
      currentBytes: Buffer.from(calibrationAdmissionCanonicalJson(current), 'utf8'),
    } as ReturnType<typeof makePrebuiltAuthorityFixture>,
    toolAuthority: {
      authorityRoot,
      authorityIndexSha256: resolved.authorityIndexSha256,
      receiptId: resolved.receipt.receiptId,
      receiptSha256: resolved.receiptSha256,
      invocationIntentId: resolved.invocationIntent.intentId,
      profileId: 'admission-static-ledgers-v1' as const,
      action: 'authority:overlap' as const,
      outputSetSha256: resolved.receipt.outputSetSha256,
    },
  };
}

function request(
  fixture: ReturnType<typeof makePrebuiltAuthorityFixture>,
  root: string,
  phaseHook?: (phase: string) => void | Promise<void>,
) {
  return {
    root,
    graph: fixture,
    planInput: {
      operation: 'create' as const,
      invocationIntentId: sha('adapter-invocation'),
      inputGenerationProposalId: fixture.proposal.proposalId,
      inputGenerationProposalSha256: fixture.proposal.proposalSha256,
      expectedCurrentState: { kind: 'absent' as const },
      inputGeneration: { generation: fixture.inputGeneration.generation, generationSha256: fixture.inputGeneration.generationSha256 },
      staticGeneration: { generation: fixture.staticGeneration.generation, generationSha256: fixture.staticGeneration.generationSha256 },
      sources: fixture.sources.map((source) => ({
        sourceId: source.sourceGeneration.sourceId,
        generationSha256: source.sourceGeneration.generationSha256,
        artifactSetSha256: source.sourceGeneration.artifactSetSha256,
      })),
      recoveryNonce: sha('adapter-recovery'),
    },
    phaseHook: phaseHook as never,
  };
}

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

describe('v10.3 mutating authority rebuild adapter', () => {
  it('publishes and reopens the complete genesis graph before returning success', async () => {
    const root = await mkdtemp(join(tmpdir(), 'slopbrick-authority-adapter-'));
    roots.push(root);
    const backed = await authorityBackedFixture(makePrebuiltAuthorityFixture(), root);
    const result = await rebuildPrebuiltAdmissionAuthority({ publication: request(backed.fixture, root), sourceAuthorityMode: 'candidate-aware', toolAuthority: backed.toolAuthority });

    expect(result.publication.complete).toBe(true);
    expect(result.verificationSha256).toMatch(/^[a-f0-9]{64}$/);
    expect(result.graph.current.currentSha256).toBe(backed.fixture.current.currentSha256);
    expect(result.graph.sources[0]?.semanticAuthority).toBeUndefined();
    await expect(stat(join(root, 'review', 'admission', 'authority', 'current.json'))).resolves.toBeTruthy();
  });

  it('requires and reopens candidate semantic-authority bytes as part of the same adapter result', async () => {
    const root = await mkdtemp(join(tmpdir(), 'slopbrick-authority-adapter-candidate-'));
    roots.push(root);
    const backed = await authorityBackedFixture(makeSemanticIndependentAuthorityFixture(), root);
    const result = await rebuildPrebuiltAdmissionAuthority({ publication: request(backed.fixture, root), sourceAuthorityMode: 'candidate-aware', toolAuthority: backed.toolAuthority });

    expect(result.graph.sources[0]?.semanticAuthority?.authoritySha256).toBe(backed.fixture.sources[0]?.semanticAuthority?.authoritySha256);
    expect(result.graph.sources[0]?.semanticAuthorityBytes).toEqual(backed.fixture.sources[0]?.semanticAuthorityBytes);
    expect(calibrationAdmissionCanonicalJson(result.graph.current)).toBe(calibrationAdmissionCanonicalJson(backed.fixture.current));
  });

  it('reopens the committed graph after a recoverable publication fault', async () => {
    const root = await mkdtemp(join(tmpdir(), 'slopbrick-authority-adapter-recovery-'));
    roots.push(root);
    const backed = await authorityBackedFixture(makePrebuiltAuthorityFixture(), root);
    const initial = request(backed.fixture, root, (phase) => {
      if (phase === 'source-generation-directories-staged-fsynced') throw new Error('adapter fault');
    });
    await expect(rebuildPrebuiltAdmissionAuthority({ publication: initial, sourceAuthorityMode: 'candidate-aware', toolAuthority: backed.toolAuthority })).rejects.toBeInstanceOf(PrebuiltAuthorityPublicationPendingError);

    const recovered = await recoverPrebuiltAdmissionAuthorityWithVerification({
      publication: {
        ...initial,
        acknowledgeNoLiveWriter: true,
        recoveryNonce: initial.planInput.recoveryNonce,
      },
      sourceAuthorityMode: 'candidate-aware',
      toolAuthority: backed.toolAuthority,
    });
    expect(recovered.publication.complete).toBe(true);
    expect(recovered.verificationSha256).toMatch(/^[a-f0-9]{64}$/);
  });

  it('verifies the complete boundary before cleanup and recovers after repair', async () => {
    const root = await mkdtemp(join(tmpdir(), 'slopbrick-authority-adapter-complete-'));
    roots.push(root);
    const backed = await authorityBackedFixture(makePrebuiltAuthorityFixture(), root);
    const staticGenerationPath = join(root, backed.fixture.current.staticGenerationRelativePath, 'generation.json');
    const initial = request(backed.fixture, root, async (phase) => {
      if (phase === 'complete') await writeFile(staticGenerationPath, Buffer.from('{}\n', 'utf8'));
    });
    await expect(rebuildPrebuiltAdmissionAuthority({ publication: initial, sourceAuthorityMode: 'candidate-aware', toolAuthority: backed.toolAuthority }))
      .rejects.toBeInstanceOf(PrebuiltAuthorityPublicationPendingError);
    await expect(stat(join(root, 'review', 'admission', 'authority', 'rebuild.lock'))).resolves.toBeTruthy();
    await expect(stat(join(root, 'review', 'admission', 'authority', 'rebuild-transaction.json'))).resolves.toBeTruthy();

    await writeFile(staticGenerationPath, backed.fixture.staticGenerationBytes);
    const recovered = await recoverPrebuiltAdmissionAuthorityWithVerification({
      publication: { ...initial, phaseHook: undefined, acknowledgeNoLiveWriter: true, recoveryNonce: initial.planInput.recoveryNonce },
      sourceAuthorityMode: 'candidate-aware',
      toolAuthority: backed.toolAuthority,
    });
    expect(recovered.publication.complete).toBe(true);
    await expect(readFile(join(root, 'review', 'admission', 'authority', 'current.json'))).resolves.toEqual(backed.fixture.currentBytes);
    await expect(stat(join(root, 'review', 'admission', 'authority', 'rebuild.lock'))).rejects.toMatchObject({ code: 'ENOENT' });
    await expect(stat(join(root, 'review', 'admission', 'authority', 'rebuild-transaction.json'))).rejects.toMatchObject({ code: 'ENOENT' });
  });

  it('rejects an invalid candidate graph before creating a publication lock', async () => {
    const root = await mkdtemp(join(tmpdir(), 'slopbrick-authority-adapter-graph-preflight-'));
    roots.push(root);
    const backed = await authorityBackedFixture(makeSemanticIndependentAuthorityFixture(), root);
    const invalidGraph = {
      ...backed.fixture,
      sources: [{ ...backed.fixture.sources[0], semanticAuthority: undefined, semanticAuthorityBytes: undefined }],
    } as typeof backed.fixture;
    await expect(rebuildPrebuiltAdmissionAuthority({
      publication: request(invalidGraph, root),
      sourceAuthorityMode: 'candidate-aware',
      toolAuthority: backed.toolAuthority,
    })).rejects.toThrow(/semantic authority|source .* keys/i);
    await expect(stat(join(root, 'review', 'admission', 'authority', 'rebuild.lock'))).rejects.toMatchObject({ code: 'ENOENT' });
  });

  it('fails before authority publication when indexed tool selectors do not match', async () => {
    const root = await mkdtemp(join(tmpdir(), 'slopbrick-authority-adapter-preflight-'));
    roots.push(root);
    const backed = await authorityBackedFixture(makePrebuiltAuthorityFixture(), root);
    await expect(rebuildPrebuiltAdmissionAuthority({
      publication: request(backed.fixture, root),
      sourceAuthorityMode: 'candidate-aware',
      toolAuthority: { ...backed.toolAuthority, receiptSha256: sha('wrong-receipt') },
    })).rejects.toThrow(/receipt|index|hash/i);
    await expect(stat(join(root, 'review', 'admission', 'authority', 'current.json'))).rejects.toMatchObject({ code: 'ENOENT' });

    const missingAction = { ...backed.toolAuthority } as Record<string, unknown>;
    delete missingAction.action;
    await expect(rebuildPrebuiltAdmissionAuthority({
      publication: request(backed.fixture, root),
      sourceAuthorityMode: 'candidate-aware',
      toolAuthority: missingAction as never,
    })).rejects.toThrow(/selector/i);
    await expect(stat(join(root, 'review', 'admission', 'authority', 'rebuild.lock'))).rejects.toMatchObject({ code: 'ENOENT' });
  });

  it('rejects a safe path outside the admission root before mutation', async () => {
    const root = await mkdtemp(join(tmpdir(), 'slopbrick-authority-adapter-path-'));
    roots.push(root);
    const backed = await authorityBackedFixture(makePrebuiltAuthorityFixture(), root);
    await expect(rebuildPrebuiltAdmissionAuthority({
      publication: request(backed.fixture, root),
      sourceAuthorityMode: 'candidate-aware',
      toolAuthority: backed.toolAuthority,
      graphRead: { priorCurrentPath: 'outside/prior-current.json' },
    })).rejects.toThrow(/admission root/i);
    await expect(stat(join(root, 'review', 'admission', 'authority', 'rebuild.lock'))).rejects.toMatchObject({ code: 'ENOENT' });

    await expect(rebuildPrebuiltAdmissionAuthority({
      publication: request(backed.fixture, root),
      sourceAuthorityMode: 'candidate-aware',
      toolAuthority: backed.toolAuthority,
      graphRead: { priorCurrentPath: 'authority/missing-prior-current.json' },
    })).rejects.toThrow(/admission root|replace evidence/i);
    await expect(stat(join(root, 'review', 'admission', 'authority', 'rebuild.lock'))).rejects.toMatchObject({ code: 'ENOENT' });
  });
});
