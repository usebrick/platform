import { mkdtemp, readFile, stat, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHash } from 'node:crypto';

import { afterEach, describe, expect, it } from 'vitest';

import {
  calibrationAdmissionAuthorityCurrentSha256,
  calibrationAdmissionCanonicalJson,
  calibrationAdmissionInputGenerationSha256,
  calibrationAdmissionSha256,
  calibrationAdmissionStaticAuthorityGenerationSha256,
} from '@usebrick/core';

import {
  PrebuiltAuthorityPublicationPendingError,
  publishPrebuiltAdmissionAuthority,
  recoverPrebuiltAdmissionAuthority,
} from '../../src/calibration/v103/admission-authority-rebuild-publication';
import { planPrebuiltAdmissionAuthorityPublication } from '../../src/calibration/v103/admission-authority-publication-plan';
import { makePrebuiltAuthorityFixture } from './v103-admission-authority-rebuild-fixture';

const roots: string[] = [];
const hex = (value: string) => createHash('sha256').update(value).digest('hex');
const bytes = (value: unknown) => Buffer.from(calibrationAdmissionCanonicalJson(value), 'utf8');

function request(fixture: ReturnType<typeof makePrebuiltAuthorityFixture>, root: string, phaseHook?: (phase: string) => void): {
  readonly root: string;
  readonly graph: ReturnType<typeof makePrebuiltAuthorityFixture>;
  readonly planInput: {
    readonly operation: 'create';
    readonly invocationIntentId: string;
    readonly inputGenerationProposalId: string;
    readonly inputGenerationProposalSha256: string;
    readonly expectedCurrentState: { readonly kind: 'absent' };
    readonly inputGeneration: { readonly generation: number; readonly generationSha256: string };
    readonly staticGeneration: { readonly generation: number; readonly generationSha256: string };
    readonly sources: readonly { readonly sourceId: string; readonly generationSha256: string; readonly artifactSetSha256: string }[];
    readonly recoveryNonce: string;
  };
  readonly toolReceipt: {
    readonly receiptId: string;
    readonly receiptSha256: string;
    readonly authorityIndexSha256: string;
    readonly primaryOutputSetSha256: string;
  };
  readonly phaseHook?: (phase: import('../../src/calibration/v103/admission-authority-rebuild-publication').PrebuiltAuthorityPublicationPhase) => void;
} {
  return {
    root,
    graph: fixture,
    planInput: {
      operation: 'create',
      invocationIntentId: hex('invocation'),
      inputGenerationProposalId: fixture.proposal.proposalId,
      inputGenerationProposalSha256: fixture.proposal.proposalSha256,
      expectedCurrentState: { kind: 'absent' },
      inputGeneration: { generation: fixture.inputGeneration.generation, generationSha256: fixture.inputGeneration.generationSha256 },
      staticGeneration: { generation: fixture.staticGeneration.generation, generationSha256: fixture.staticGeneration.generationSha256 },
      sources: fixture.sources.map((source) => ({
        sourceId: source.sourceGeneration.sourceId,
        generationSha256: source.sourceGeneration.generationSha256,
        artifactSetSha256: source.sourceGeneration.artifactSetSha256,
      })),
      recoveryNonce: hex('recovery'),
    },
    toolReceipt: {
      receiptId: 'fixture-tool-receipt',
      receiptSha256: hex('tool-receipt'),
      authorityIndexSha256: hex('tool-index'),
      primaryOutputSetSha256: hex('primary-output-set'),
    },
    phaseHook: phaseHook as never,
  };
}

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

describe('v10.3 prebuilt authority publication/recovery', () => {
  it('publishes explicit fixture bytes and removes only its journals', async () => {
    const root = await mkdtemp(join(tmpdir(), 'slopbrick-authority-publication-'));
    roots.push(root);
    const fixture = makePrebuiltAuthorityFixture();
    const result = await publishPrebuiltAdmissionAuthority(request(fixture, root));
    expect(result.complete).toBe(true);
    expect(await stat(join(root, 'review', 'admission', 'authority', 'current.json'))).toBeTruthy();
    expect(await stat(join(root, 'review', 'admission', 'authority', 'proposals', `${fixture.proposal.proposalId}.json`))).toBeTruthy();
    expect(await readFile(join(root, 'review', 'admission', 'authority', 'current.json'))).toEqual(fixture.currentBytes);
    await expect(stat(join(root, 'review', 'admission', 'authority', 'rebuild.lock'))).rejects.toMatchObject({ code: 'ENOENT' });
    await expect(stat(join(root, 'review', 'admission', 'authority', 'rebuild-transaction.json'))).rejects.toMatchObject({ code: 'ENOENT' });
  });

  it('faults after a durable phase and resumes from the transaction journal', async () => {
    const root = await mkdtemp(join(tmpdir(), 'slopbrick-authority-publication-recovery-'));
    roots.push(root);
    const fixture = makePrebuiltAuthorityFixture();
    const initial = request(fixture, root, (phase) => {
      if (phase === 'static-generation-staged-fsynced') throw new Error('injected publication fault');
    });
    await expect(publishPrebuiltAdmissionAuthority(initial)).rejects.toBeInstanceOf(PrebuiltAuthorityPublicationPendingError);
    const recovery = await recoverPrebuiltAdmissionAuthority({
      ...initial,
      recoveryNonce: initial.planInput.recoveryNonce,
      acknowledgeNoLiveWriter: true,
    });
    expect(recovery.complete).toBe(true);
    expect(await readFile(join(root, 'review', 'admission', 'authority', 'current.json'))).toEqual(fixture.currentBytes);
  });

  it('preserves an unknown file inside a transaction-promoted generation', async () => {
    const root = await mkdtemp(join(tmpdir(), 'slopbrick-authority-publication-unknown-'));
    roots.push(root);
    const fixture = makePrebuiltAuthorityFixture();
    const initial = request(fixture, root);
    await expect(publishPrebuiltAdmissionAuthority({
      ...initial,
      phaseHook: async (phase) => {
        if (phase === 'static-generation-promoted') {
          await writeFile(join(root, fixture.current.staticGenerationRelativePath, 'unknown.txt'), 'keep\n');
          throw new Error('stop after static promotion');
        }
      },
    })).rejects.toBeInstanceOf(PrebuiltAuthorityPublicationPendingError);
    const result = await recoverPrebuiltAdmissionAuthority({ ...initial, acknowledgeNoLiveWriter: true, recoveryNonce: initial.planInput.recoveryNonce });
    expect(result.complete).toBe(true);
    expect(await readFile(join(root, fixture.current.staticGenerationRelativePath, 'unknown.txt'), 'utf8')).toBe('keep\n');
  });

  it('rejects a staged generation-byte mutation during recovery', async () => {
    const root = await mkdtemp(join(tmpdir(), 'slopbrick-authority-publication-tamper-'));
    roots.push(root);
    const fixture = makePrebuiltAuthorityFixture();
    const initial = request(fixture, root);
    const planned = planPrebuiltAdmissionAuthorityPublication(initial.planInput);
    if (!planned.ok) throw new Error(planned.errors.join('; '));
    await expect(publishPrebuiltAdmissionAuthority({
      ...initial,
      phaseHook: async (phase) => {
        if (phase === 'static-generation-staged-fsynced') {
          await writeFile(
            join(root, planned.paths.staticGenerationStagingRelativePath, 'generation.json'),
            'tampered',
          ).catch(() => undefined);
          throw new Error('stop before promotion');
        }
      },
    })).rejects.toBeInstanceOf(PrebuiltAuthorityPublicationPendingError);
    await expect(recoverPrebuiltAdmissionAuthority({
      ...initial,
      acknowledgeNoLiveWriter: true,
      recoveryNonce: initial.planInput.recoveryNonce,
    })).rejects.toThrow(/bytes changed|static generation/i);
  });

  it('rejects a promoted source-generation mutation during recovery', async () => {
    const root = await mkdtemp(join(tmpdir(), 'slopbrick-authority-publication-source-tamper-'));
    roots.push(root);
    const fixture = makePrebuiltAuthorityFixture();
    const initial = request(fixture, root);
    const planned = planPrebuiltAdmissionAuthorityPublication(initial.planInput);
    if (!planned.ok) throw new Error(planned.errors.join('; '));
    await expect(publishPrebuiltAdmissionAuthority({
      ...initial,
      phaseHook: async (phase) => {
        if (phase === 'source-generation-directories-promoted') {
          const descriptor = planned.paths.sourceGenerationDirectories[0]!;
          await writeFile(join(root, descriptor.generationFinalRelativePath, 'source-generation.json'), 'tampered');
          throw new Error('stop after source promotion');
        }
      },
    })).rejects.toBeInstanceOf(PrebuiltAuthorityPublicationPendingError);
    await expect(recoverPrebuiltAdmissionAuthority({
      ...initial,
      acknowledgeNoLiveWriter: true,
      recoveryNonce: initial.planInput.recoveryNonce,
    })).rejects.toThrow(/bytes changed|source/i);
  });

  it('rejects a current-pointer mutation after the complete journal phase', async () => {
    const root = await mkdtemp(join(tmpdir(), 'slopbrick-authority-publication-complete-tamper-'));
    roots.push(root);
    const fixture = makePrebuiltAuthorityFixture();
    const initial = request(fixture, root);
    await expect(publishPrebuiltAdmissionAuthority({
      ...initial,
      phaseHook: async (phase) => {
        if (phase === 'complete') {
          await writeFile(join(root, 'review', 'admission', 'authority', 'current.json'), 'tampered');
          throw new Error('stop after complete journal');
        }
      },
    })).rejects.toBeInstanceOf(PrebuiltAuthorityPublicationPendingError);
    await expect(recoverPrebuiltAdmissionAuthority({
      ...initial,
      acknowledgeNoLiveWriter: true,
      recoveryNonce: initial.planInput.recoveryNonce,
    })).rejects.toThrow(/bytes changed|current/i);
  });

  it('fails closed when a caller-supplied plan leaves the fixed authority topology', async () => {
    const root = await mkdtemp(join(tmpdir(), 'slopbrick-authority-publication-plan-path-'));
    roots.push(root);
    const fixture = makePrebuiltAuthorityFixture();
    const initial = request(fixture, root);
    const planned = planPrebuiltAdmissionAuthorityPublication(initial.planInput);
    if (!planned.ok) throw new Error(planned.errors.join('; '));
    const tamperedPlan = {
      ...planned,
      paths: {
        ...planned.paths,
        staticGenerationStagingRelativePath: `tmp/${planned.transaction.transactionId}`,
      },
    };
    await expect(publishPrebuiltAdmissionAuthority({
      ...initial,
      plan: tamperedPlan,
      planInput: undefined,
    })).rejects.toThrow(/topology|paths|transaction/i);
    await expect(stat(join(root, 'review', 'admission', 'authority'))).rejects.toMatchObject({ code: 'ENOENT' });
  });

  it('rejects a stale create current before creating a lock or mutating authority', async () => {
    const root = await mkdtemp(join(tmpdir(), 'slopbrick-authority-publication-stale-'));
    roots.push(root);
    const fixture = makePrebuiltAuthorityFixture();
    const currentPath = join(root, 'review', 'admission', 'authority', 'current.json');
    await writeFile(currentPath, bytes({ version: 'wrong' }), { flag: 'w' }).catch(async () => {
      await import('node:fs/promises').then(({ mkdir }) => mkdir(join(root, 'review', 'admission', 'authority'), { recursive: true }));
      await writeFile(currentPath, bytes({ version: 'wrong' }));
    });
    await expect(publishPrebuiltAdmissionAuthority(request(fixture, root))).rejects.toThrow(/current/i);
    await expect(stat(join(root, 'review', 'admission', 'authority', 'rebuild.lock'))).rejects.toMatchObject({ code: 'ENOENT' });
  });

  it('fails closed on graph-byte tampering without creating the authority root', async () => {
    const root = await mkdtemp(join(tmpdir(), 'slopbrick-authority-publication-invalid-'));
    roots.push(root);
    const fixture = makePrebuiltAuthorityFixture();
    const tampered = { ...fixture, inputGenerationBytes: Buffer.from('tampered', 'utf8') };
    await expect(publishPrebuiltAdmissionAuthority(request(tampered, root))).rejects.toThrow(/canonical|hash|graph/i);
    await expect(stat(join(root, 'review', 'admission', 'authority'))).rejects.toMatchObject({ code: 'ENOENT' });
  });

  it('validates and cleans a lock-only recovery explicitly', async () => {
    const root = await mkdtemp(join(tmpdir(), 'slopbrick-authority-publication-lock-'));
    roots.push(root);
    const fixture = makePrebuiltAuthorityFixture();
    const initial = request(fixture, root, (phase) => { if (phase === 'lock-fsynced') throw new Error('stop after lock'); });
    await expect(publishPrebuiltAdmissionAuthority(initial)).rejects.toThrow(/stop after lock/);
    const result = await recoverPrebuiltAdmissionAuthority({ ...initial, fromLock: true, acknowledgeNoLiveWriter: true, recoveryNonce: initial.planInput.recoveryNonce });
    expect(result.status).toBe('lock-only');
    expect(result.complete).toBe(true);
    await expect(stat(join(root, 'review', 'admission', 'authority', 'rebuild.lock'))).rejects.toMatchObject({ code: 'ENOENT' });
  });

  it('rejects lock-only recovery with a wrong nonce before cleanup', async () => {
    const root = await mkdtemp(join(tmpdir(), 'slopbrick-authority-publication-lock-binding-'));
    roots.push(root);
    const fixture = makePrebuiltAuthorityFixture();
    const initial = request(fixture, root, (phase) => { if (phase === 'lock-fsynced') throw new Error('stop after lock'); });
    await expect(publishPrebuiltAdmissionAuthority(initial)).rejects.toThrow(/stop after lock/);
    await expect(recoverPrebuiltAdmissionAuthority({
      ...initial,
      fromLock: true,
      acknowledgeNoLiveWriter: true,
      recoveryNonce: hex('wrong-recovery'),
    })).rejects.toThrow(/binding|nonce/i);
    await expect(recoverPrebuiltAdmissionAuthority({
      ...initial,
      fromLock: true,
      transactionId: 'wrong-transaction-selector',
      acknowledgeNoLiveWriter: true,
      recoveryNonce: initial.planInput.recoveryNonce,
    })).rejects.toThrow(/only explicit|selector/i);
    expect(await stat(join(root, 'review', 'admission', 'authority', 'rebuild.lock'))).toBeTruthy();
  });
});
