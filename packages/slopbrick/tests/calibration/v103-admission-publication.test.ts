import { describe, expect, it } from 'vitest';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { execFile } from 'node:child_process';
import {
  ACQUISITIONS_RELATIVE_ROOT,
  ACQUISITION_PUBLICATION_LOCK_RELATIVE_PATH,
  acquisitionIndexSha256,
  acquisitionPublicationProposalId,
  acquisitionPublicationProposalSha256,
  publishAdmissionToolInvocationIntent,
  publishAdmissionToolReceipt,
  publishAcquisitionPublication,
  recoverAcquisitionPublication,
  recoverToolAuthorityPublication,
} from '../../src/calibration/v103/admission-publication';
import { calibrationAdmissionCanonicalJson, calibrationAdmissionSha256 } from '@usebrick/core';

const execFileAsync = promisify(execFile);

const sha = (character: string) => character.repeat(64);

function emptyIndex() {
  const withoutHash = {
    version: 'v10.3-admission-acquisition-index-v1' as const,
    generation: 0,
    artifacts: [],
  };
  return { ...withoutHash, indexSha256: acquisitionIndexSha256(withoutHash) };
}

function proposalForCreate() {
  const nextIndex = emptyIndex();
  const withoutHashes = {
    version: 'v10.3-acquisition-publication-proposal-v1' as const,
    proposalId: '',
    operation: 'create' as const,
    expectedCurrentState: { kind: 'absent' as const },
    nextIndex,
    artifacts: [],
  };
  const proposalId = acquisitionPublicationProposalId(withoutHashes);
  const withId = { ...withoutHashes, proposalId };
  return { ...withId, proposalSha256: acquisitionPublicationProposalSha256(withId) };
}

function proposalForReplace(currentIndexSha256: string, sourceRelativePath: string, finalRelativePath: string, bytes: Buffer, generation = 1) {
  const bytesSha256 = createHash('sha256').update(bytes).digest('hex');
  const withoutHash = {
    version: 'v10.3-admission-acquisition-index-v1' as const,
    generation,
    parentIndexSha256: currentIndexSha256,
    artifacts: [{ kind: 'evidence_index' as const, objectId: sha('e'), relativePath: finalRelativePath, sha256: bytesSha256 }],
  };
  const nextIndex = { ...withoutHash, indexSha256: acquisitionIndexSha256(withoutHash) };
  const proposalWithoutHashes = {
    version: 'v10.3-acquisition-publication-proposal-v1' as const,
    proposalId: '',
    operation: 'replace' as const,
    expectedCurrentState: { kind: 'existing' as const, indexSha256: currentIndexSha256 },
    nextIndex,
    artifacts: [{ kind: 'evidence_index' as const, objectId: sha('e'), sourceRelativePath, finalRelativePath, bytes: bytes.byteLength, sha256: bytesSha256 }],
  };
  const proposalId = acquisitionPublicationProposalId(proposalWithoutHashes);
  const withId = { ...proposalWithoutHashes, proposalId };
  return { ...withId, proposalSha256: acquisitionPublicationProposalSha256(withId) };
}

async function setup() {
  const root = await mkdtemp(join(tmpdir(), 'slopbrick-admission-publication-'));
  return { root, cleanup: () => rm(root, { recursive: true, force: true }) };
}

async function writeProposal(root: string, proposal: unknown, name = 'proposal.json') {
  const path = join(root, name);
  await writeFile(path, calibrationAdmissionCanonicalJson(proposal), { flag: 'wx' });
  return path;
}

describe('offline acquisition publication', () => {
  it('publishes a real admission intent before its successful receipt and is idempotent', async () => {
    const fixture = await setup();
    try {
      const authorityRoot = join(fixture.root, 'review', 'admission', 'tool-authority');
      const intentResult = await publishAdmissionToolInvocationIntent({
        toolAuthorityRoot: authorityRoot,
        profileId: 'admission-context-v1',
        action: 'evidence:verify',
        canonicalArgvSha256: sha('a'),
        inputSetSha256: sha('b'),
        executableBehaviorSha256: sha('c'),
      });
      expect(intentResult.intent.intentId).toMatch(/^[a-f0-9]{64}$/);
      expect(intentResult.intent.intentSha256).toMatch(/^[a-f0-9]{64}$/);
      expect(intentResult.toolAuthorityIndexSha256).toMatch(/^[a-f0-9]{64}$/);

      const receiptResult = await publishAdmissionToolReceipt({
        toolAuthorityRoot: authorityRoot,
        invocationIntentId: intentResult.intent.intentId,
        observedResourceUsage: { heapBytes: 2_147_483_648, workers: 1 },
        exitCode: 0,
        outputSetSha256: sha('d'),
      });
      expect(receiptResult.receipt.invocationIntentId).toBe(intentResult.intent.intentId);
      expect(receiptResult.receipt.action).toBe('evidence:verify');
      expect(receiptResult.receipt.receiptId).toMatch(/^[a-f0-9]{64}$/);

      const repeatedIntent = await publishAdmissionToolInvocationIntent({
        toolAuthorityRoot: authorityRoot,
        profileId: 'admission-context-v1',
        action: 'evidence:verify',
        canonicalArgvSha256: sha('a'),
        inputSetSha256: sha('b'),
        executableBehaviorSha256: sha('c'),
      });
      const repeatedReceipt = await publishAdmissionToolReceipt({
        toolAuthorityRoot: authorityRoot,
        invocationIntentId: intentResult.intent.intentId,
        observedResourceUsage: { heapBytes: 2_147_483_648, workers: 1 },
        exitCode: 0,
        outputSetSha256: sha('d'),
      });
      expect(repeatedIntent.intent.intentId).toBe(intentResult.intent.intentId);
      expect(repeatedIntent.toolAuthorityIndexSha256).toBe(receiptResult.toolAuthorityIndexSha256);
      expect(repeatedReceipt.receipt.receiptId).toBe(receiptResult.receipt.receiptId);
      expect(repeatedReceipt.toolAuthorityIndexSha256).toBe(receiptResult.toolAuthorityIndexSha256);
      await expect(readFile(join(authorityRoot, 'tool-authority.lock'))).rejects.toThrow();
      await expect(readFile(join(authorityRoot, 'tool-authority-transaction.json'))).rejects.toThrow();
    } finally { await fixture.cleanup(); }
  });

  it('rejects an admission authority intent with an unknown profile or action', async () => {
    const fixture = await setup();
    try {
      const authorityRoot = join(fixture.root, 'tool-authority');
      await expect(publishAdmissionToolInvocationIntent({
        toolAuthorityRoot: authorityRoot,
        profileId: 'admission-unknown-v1',
        action: 'evidence:verify',
        canonicalArgvSha256: sha('a'),
        inputSetSha256: sha('b'),
        executableBehaviorSha256: sha('c'),
      })).rejects.toThrow(/profile/i);
      await expect(publishAdmissionToolInvocationIntent({
        toolAuthorityRoot: authorityRoot,
        profileId: 'admission-context-v1',
        action: 'evidence:acquire',
        canonicalArgvSha256: sha('a'),
        inputSetSha256: sha('b'),
        executableBehaviorSha256: sha('c'),
      })).rejects.toThrow(/intent|action|invalid/i);
      await expect(readFile(join(authorityRoot, 'index.json'))).rejects.toThrow();
    } finally { await fixture.cleanup(); }
  });

  it('publishes the two-phase authority pair through the admission CLI', async () => {
    const fixture = await setup();
    try {
      const script = join(process.cwd(), 'scripts/cal/v103-admission.ts');
      const tsx = join(process.cwd(), 'node_modules/.bin/tsx');
      const intentRun = await execFileAsync(tsx, [
        script,
        'tool-authority:intent',
        '--root', fixture.root,
        '--tool-profile', 'admission-context-v1',
        '--action', 'evidence:verify',
        '--canonical-argv-sha256', sha('a'),
        '--input-set-sha256', sha('b'),
        '--executable-behavior-sha256', sha('c'),
      ], { cwd: process.cwd(), maxBuffer: 1024 * 1024 });
      const intentOutput = JSON.parse(intentRun.stdout.trim()) as { ok: boolean; intent: { intentId: string } };
      expect(intentOutput.ok).toBe(true);
      const receiptRun = await execFileAsync(tsx, [
        script,
        'tool-authority:receipt',
        '--root', fixture.root,
        '--invocation-intent', intentOutput.intent.intentId,
        '--output-set-sha256', sha('d'),
        '--exit-code', '0',
        '--observed-resource-usage', JSON.stringify({ heapBytes: 1024, workers: 1 }),
      ], { cwd: process.cwd(), maxBuffer: 1024 * 1024 });
      const receiptOutput = JSON.parse(receiptRun.stdout.trim()) as { ok: boolean; receipt: { invocationIntentId: string; exitCode: number } };
      expect(receiptOutput).toMatchObject({ ok: true, receipt: { invocationIntentId: intentOutput.intent.intentId, exitCode: 0 } });
    } finally { await fixture.cleanup(); }
  });

  it('creates and receipts an empty immutable generation 0', async () => {
    const fixture = await setup();
    try {
      const proposal = proposalForCreate();
      const proposalPath = await writeProposal(fixture.root, proposal);
      const result = await publishAcquisitionPublication({ root: fixture.root, proposal, proposalPath });
      expect(result.complete).toBe(true);
      expect(result.currentIndexSha256).toBe(proposal.nextIndex.indexSha256);
      const current = JSON.parse(await readFile(join(fixture.root, ACQUISITIONS_RELATIVE_ROOT, 'index.json'), 'utf8')) as { indexSha256: string };
      expect(current.indexSha256).toBe(proposal.nextIndex.indexSha256);
      expect(await readFile(join(fixture.root, ACQUISITIONS_RELATIVE_ROOT, 'index-generations', `${proposal.nextIndex.indexSha256}.json`), 'utf8')).toContain(proposal.nextIndex.indexSha256);
    } finally { await fixture.cleanup(); }
  });

  it('allows the co-located proposal directory in an empty generation-0 tree', async () => {
    const fixture = await setup();
    try {
      const proposal = proposalForCreate();
      const proposalPath = join(fixture.root, ACQUISITIONS_RELATIVE_ROOT, 'proposals', 'genesis-empty-index.json');
      await mkdir(join(fixture.root, ACQUISITIONS_RELATIVE_ROOT, 'proposals'), { recursive: true });
      await writeFile(proposalPath, calibrationAdmissionCanonicalJson(proposal), { flag: 'wx' });
      const result = await publishAcquisitionPublication({ root: fixture.root, proposal, proposalPath });
      expect(result.complete).toBe(true);
      expect(result.currentIndexSha256).toBe(proposal.nextIndex.indexSha256);
    } finally { await fixture.cleanup(); }
  });

  it('replaces current through a stale-parent CAS and promotes exact artifact bytes', async () => {
    const fixture = await setup();
    try {
      const create = proposalForCreate();
      const createPath = await writeProposal(fixture.root, create, 'create.json');
      await publishAcquisitionPublication({ root: fixture.root, proposal: create, proposalPath: createPath });
      const sourcePath = join(fixture.root, 'evidence.json');
      const bytes = Buffer.from('{"evidence":true}\n', 'utf8');
      await writeFile(sourcePath, bytes, { flag: 'wx' });
      const final = `${ACQUISITIONS_RELATIVE_ROOT}/evidence-generations/evidence.json`;
      const replace = proposalForReplace(create.nextIndex.indexSha256, 'evidence.json', final, bytes);
      const replacePath = await writeProposal(fixture.root, replace, 'replace.json');
      const result = await publishAcquisitionPublication({ root: fixture.root, proposal: replace, proposalPath: replacePath });
      expect(result.complete).toBe(true);
      expect((await readFile(join(fixture.root, final))).equals(bytes)).toBe(true);
      await expect(publishAcquisitionPublication({ root: fixture.root, proposal: replace, proposalPath: replacePath })).rejects.toThrow(/stale|already exists|destination/);
    } finally { await fixture.cleanup(); }
  });

  it('indexes an intent-only authority generation before acquisition output mutation', async () => {
    const fixture = await setup();
    try {
      const create = proposalForCreate();
      const createPath = await writeProposal(fixture.root, create, 'intent-create.json');
      await publishAcquisitionPublication({ root: fixture.root, proposal: create, proposalPath: createPath });
      const authorityRoot = join(fixture.root, 'review', 'admission', 'tool-authority');
      const before = JSON.parse(await readFile(join(authorityRoot, 'index.json'), 'utf8')) as { generation: number; invocationIntents: readonly { intentId: string }[]; receipts: readonly { receiptId: string }[] };
      const sourcePath = join(fixture.root, 'intent-source.json');
      const bytes = Buffer.from('{"intent":"preflight"}\n', 'utf8');
      await writeFile(sourcePath, bytes, { flag: 'wx' });
      const final = `${ACQUISITIONS_RELATIVE_ROOT}/intent-generations/intent.json`;
      const replace = proposalForReplace(create.nextIndex.indexSha256, 'intent-source.json', final, bytes);
      const replacePath = await writeProposal(fixture.root, replace, 'intent-replace.json');
      await expect(publishAcquisitionPublication({
        root: fixture.root,
        proposal: replace,
        proposalPath: replacePath,
        phaseHook: (phase) => {
          if (phase === 'artifact-staged') throw new Error('stop-after-authority-intent');
        },
      })).rejects.toThrow('stop-after-authority-intent');
      const lock = JSON.parse(await readFile(join(fixture.root, ACQUISITION_PUBLICATION_LOCK_RELATIVE_PATH), 'utf8')) as { invocationIntentId: string };
      const after = JSON.parse(await readFile(join(authorityRoot, 'index.json'), 'utf8')) as { generation: number; invocationIntents: readonly { intentId: string }[]; receipts: readonly { receiptId: string }[] };
      expect(after.generation).toBe(before.generation + 1);
      expect(after.invocationIntents.some((intent) => intent.intentId === lock.invocationIntentId)).toBe(true);
      expect(after.receipts).toEqual(before.receipts);
      await expect(readFile(join(fixture.root, final))).rejects.toThrow();
      const current = JSON.parse(await readFile(join(fixture.root, ACQUISITIONS_RELATIVE_ROOT, 'index.json'), 'utf8')) as { indexSha256: string };
      expect(current.indexSha256).toBe(create.nextIndex.indexSha256);
    } finally { await fixture.cleanup(); }
  });

  it('rejects an acquisition transaction whose artifact set is changed before recovery', async () => {
    const fixture = await setup();
    try {
      const create = proposalForCreate();
      const createPath = await writeProposal(fixture.root, create, 'binding-create.json');
      await publishAcquisitionPublication({ root: fixture.root, proposal: create, proposalPath: createPath });
      const sourcePath = join(fixture.root, 'binding-source.json');
      const bytes = Buffer.from('{"binding":true}\n', 'utf8');
      await writeFile(sourcePath, bytes, { flag: 'wx' });
      const final = `${ACQUISITIONS_RELATIVE_ROOT}/binding-generations/binding.json`;
      const proposal = proposalForReplace(create.nextIndex.indexSha256, 'binding-source.json', final, bytes);
      const proposalPath = await writeProposal(fixture.root, proposal, 'binding-replace.json');
      const pending = await publishAcquisitionPublication({
        root: fixture.root,
        proposal,
        proposalPath,
        publishToolReceipt: async () => { throw new Error('authority unavailable'); },
      });
      expect(pending.recoveryRequired).toBe(true);
      const transaction = JSON.parse(await readFile(pending.transactionPath, 'utf8')) as Record<string, unknown>;
      const artifacts = transaction.artifacts as Array<Record<string, unknown>>;
      artifacts[0] = { ...artifacts[0], finalRelativePath: `${ACQUISITIONS_RELATIVE_ROOT}/binding-generations/substituted.json` };
      const { transactionSha256: _oldTransactionSha256, ...transactionWithoutHash } = transaction;
      const withoutHash = { ...transactionWithoutHash, artifacts };
      const mutated = { ...withoutHash, transactionSha256: calibrationAdmissionSha256(withoutHash) };
      await writeFile(pending.transactionPath, calibrationAdmissionCanonicalJson(mutated));
      const lock = JSON.parse(await readFile(pending.lockPath, 'utf8')) as { recoveryNonce: string };
      await expect(recoverAcquisitionPublication({
        root: fixture.root,
        fromLock: true,
        recoveryNonce: lock.recoveryNonce,
        acknowledgeNoLiveWriter: true,
      })).rejects.toThrow(/artifact set|proposal sidecar|transaction is invalid/i);
    } finally { await fixture.cleanup(); }
  });

  it('revalidates the indexed tool receipt during acquisition recovery', async () => {
    const fixture = await setup();
    try {
      const create = proposalForCreate();
      const createPath = await writeProposal(fixture.root, create, 'receipt-create.json');
      await publishAcquisitionPublication({ root: fixture.root, proposal: create, proposalPath: createPath });
      const sourcePath = join(fixture.root, 'receipt-source.json');
      const bytes = Buffer.from('{"receipt":true}\n', 'utf8');
      await writeFile(sourcePath, bytes, { flag: 'wx' });
      const final = `${ACQUISITIONS_RELATIVE_ROOT}/receipt-generations/receipt.json`;
      const proposal = proposalForReplace(create.nextIndex.indexSha256, 'receipt-source.json', final, bytes);
      const proposalPath = await writeProposal(fixture.root, proposal, 'receipt-replace.json');
      const pending = await publishAcquisitionPublication({
        root: fixture.root,
        proposal,
        proposalPath,
        publishToolReceipt: async () => { throw new Error('authority unavailable'); },
      });
      const authorityRoot = join(fixture.root, 'review', 'admission', 'tool-authority');
      const authorityIndex = JSON.parse(await readFile(join(authorityRoot, 'index.json'), 'utf8')) as { invocationIntents: readonly { relativePath: string; sha256: string }[] };
      const intentRef = authorityIndex.invocationIntents.at(-1)!;
      await writeFile(join(authorityRoot, intentRef.relativePath), '{"tampered":true}');
      const lock = JSON.parse(await readFile(pending.lockPath, 'utf8')) as { recoveryNonce: string };
      await expect(recoverAcquisitionPublication({
        root: fixture.root,
        fromLock: true,
        recoveryNonce: lock.recoveryNonce,
        acknowledgeNoLiveWriter: true,
      })).rejects.toThrow(/collision|changed|authority|intent/i);
    } finally { await fixture.cleanup(); }
  });

  it('recovers a real authority phase fault before resuming acquisition output', async () => {
    const fixture = await setup();
    try {
      const create = proposalForCreate();
      const createPath = await writeProposal(fixture.root, create, 'phase-create.json');
      await publishAcquisitionPublication({ root: fixture.root, proposal: create, proposalPath: createPath });
      const sourcePath = join(fixture.root, 'phase-source.json');
      const bytes = Buffer.from('{"phase":true}\n', 'utf8');
      await writeFile(sourcePath, bytes, { flag: 'wx' });
      const final = `${ACQUISITIONS_RELATIVE_ROOT}/phase-generations/phase.json`;
      const proposal = proposalForReplace(create.nextIndex.indexSha256, 'phase-source.json', final, bytes);
      const proposalPath = await writeProposal(fixture.root, proposal, 'phase-replace.json');
      await expect(publishAcquisitionPublication({
        root: fixture.root,
        proposal,
        proposalPath,
        toolAuthorityPhaseHook: (phase) => {
          if (phase === 'artifacts-promoted') throw new Error('authority-phase-fault');
        },
      })).rejects.toThrow('authority-phase-fault');
      const authorityRoot = join(fixture.root, 'review', 'admission', 'tool-authority');
      const authorityLock = JSON.parse(await readFile(join(authorityRoot, 'tool-authority.lock'), 'utf8')) as { recoveryNonce: string };
      const authorityRecovered = await recoverToolAuthorityPublication({
        root: fixture.root,
        fromLock: true,
        recoveryNonce: authorityLock.recoveryNonce,
        acknowledgeNoLiveWriter: true,
      });
      expect(authorityRecovered.complete).toBe(true);
      const acquisitionLock = JSON.parse(await readFile(join(fixture.root, ACQUISITION_PUBLICATION_LOCK_RELATIVE_PATH), 'utf8')) as { recoveryNonce: string };
      const resumed = await recoverAcquisitionPublication({
        root: fixture.root,
        fromLock: true,
        recoveryNonce: acquisitionLock.recoveryNonce,
        acknowledgeNoLiveWriter: true,
      });
      expect(resumed.complete).toBe(true);
      expect((await readFile(join(fixture.root, final))).equals(bytes)).toBe(true);
    } finally { await fixture.cleanup(); }
  });

  it('serializes concurrent writers on the shared tool-authority lock', async () => {
    const fixture = await setup();
    const rootA = await mkdtemp(join(tmpdir(), 'slopbrick-authority-race-a-'));
    const rootB = await mkdtemp(join(tmpdir(), 'slopbrick-authority-race-b-'));
    try {
      const proposalA = proposalForCreate();
      const proposalB = proposalForCreate();
      const proposalPathA = await writeProposal(rootA, proposalA, 'race-a.json');
      const proposalPathB = await writeProposal(rootB, proposalB, 'race-b.json');
      const authorityRoot = join(fixture.root, 'shared-tool-authority');
      const outcomes = await Promise.allSettled([
        publishAcquisitionPublication({ root: rootA, proposal: proposalA, proposalPath: proposalPathA, toolAuthorityRoot: authorityRoot }),
        publishAcquisitionPublication({ root: rootB, proposal: proposalB, proposalPath: proposalPathB, toolAuthorityRoot: authorityRoot }),
      ]);
      const rejected = outcomes.filter((outcome) => outcome.status === 'rejected');
      expect(rejected.length).toBeLessThanOrEqual(1);
      for (const outcome of rejected) expect(String((outcome as PromiseRejectedResult).reason)).toMatch(/lock|collision|authority/i);
      const authorityIndex = JSON.parse(await readFile(join(authorityRoot, 'index.json'), 'utf8')) as { generation: number; invocationIntents: readonly unknown[]; receipts: readonly unknown[] };
      expect(authorityIndex.generation).toBeGreaterThanOrEqual(0);
      expect(authorityIndex.invocationIntents.length).toBeGreaterThanOrEqual(0);
      expect(authorityIndex.receipts.length).toBeGreaterThanOrEqual(0);
      await expect(readFile(join(authorityRoot, 'tool-authority.lock'))).rejects.toThrow();
      await expect(readFile(join(authorityRoot, 'tool-authority-transaction.json'))).rejects.toThrow();
    } finally {
      await Promise.all([fixture.cleanup(), rm(rootA, { recursive: true, force: true }), rm(rootB, { recursive: true, force: true })]);
    }
  });

  it('rejects an authority current pointer that is not anchored to an immutable generation', async () => {
    const fixture = await setup();
    const isolated = await setup();
    try {
      const bootstrap = proposalForCreate();
      await publishAcquisitionPublication({ root: fixture.root, proposal: bootstrap, proposalPath: await writeProposal(fixture.root, bootstrap, 'anchor-bootstrap.json') });
      const authorityRoot = join(fixture.root, 'review', 'admission', 'tool-authority');
      const currentPath = join(authorityRoot, 'index.json');
      const current = JSON.parse(await readFile(currentPath, 'utf8')) as Record<string, unknown>;
      const { indexSha256: _oldIndexSha256, ...withoutHash } = current;
      const forged = { ...withoutHash, generation: Number(current.generation) + 100 };
      const forgedWithHash = { ...forged, indexSha256: calibrationAdmissionSha256(forged) };
      await writeFile(currentPath, calibrationAdmissionCanonicalJson(forgedWithHash));
      const proposal = proposalForCreate();
      await expect(publishAcquisitionPublication({ root: isolated.root, proposal, toolAuthorityRoot: authorityRoot })).rejects.toThrow(/immutable generation|anchored|generation chain|history/i);
    } finally {
      await Promise.all([fixture.cleanup(), isolated.cleanup()]);
    }
  });

  it('rejects a substituted authority staged path during recovery', async () => {
    const fixture = await setup();
    try {
      const create = proposalForCreate();
      await publishAcquisitionPublication({ root: fixture.root, proposal: create, proposalPath: await writeProposal(fixture.root, create, 'stage-create.json') });
      const sourcePath = join(fixture.root, 'stage-source.json');
      const bytes = Buffer.from('{"stage":true}\n', 'utf8');
      await writeFile(sourcePath, bytes, { flag: 'wx' });
      const proposal = proposalForReplace(create.nextIndex.indexSha256, 'stage-source.json', `${ACQUISITIONS_RELATIVE_ROOT}/stage.json`, bytes);
      await expect(publishAcquisitionPublication({
        root: fixture.root,
        proposal,
        proposalPath: await writeProposal(fixture.root, proposal, 'stage-replace.json'),
        toolAuthorityPhaseHook: (phase) => { if (phase === 'artifacts-promoted') throw new Error('stage-path-fault'); },
      })).rejects.toThrow('stage-path-fault');
      const authorityRoot = join(fixture.root, 'review', 'admission', 'tool-authority');
      const transactionPath = join(authorityRoot, 'tool-authority-transaction.json');
      const transaction = JSON.parse(await readFile(transactionPath, 'utf8')) as Record<string, unknown>;
      const artifacts = transaction.artifacts as Array<Record<string, unknown>>;
      artifacts[0] = { ...artifacts[0], stagedRelativePath: `transactions/${sha('q')}/substituted.json` };
      const { transactionSha256: _oldTransactionSha256, ...transactionWithoutHash } = transaction;
      const tampered = { ...transactionWithoutHash, artifacts, transactionSha256: calibrationAdmissionSha256({ ...transactionWithoutHash, artifacts }) };
      await writeFile(transactionPath, calibrationAdmissionCanonicalJson(tampered));
      const lock = JSON.parse(await readFile(join(authorityRoot, 'tool-authority.lock'), 'utf8')) as { recoveryNonce: string };
      await expect(recoverToolAuthorityPublication({ root: fixture.root, fromLock: true, recoveryNonce: lock.recoveryNonce, acknowledgeNoLiveWriter: true })).rejects.toThrow(/transaction-owned|artifact set|lock intent/i);
    } finally { await fixture.cleanup(); }
  });

  it('rolls back an unpromoted acquisition when its current parent becomes stale', async () => {
    const fixture = await setup();
    try {
      const create = proposalForCreate();
      await publishAcquisitionPublication({ root: fixture.root, proposal: create, proposalPath: await writeProposal(fixture.root, create, 'stale-bootstrap.json') });
      const firstSourcePath = join(fixture.root, 'stale-first-source.json');
      const firstBytes = Buffer.from('{"stale":"first"}\n', 'utf8');
      await writeFile(firstSourcePath, firstBytes, { flag: 'wx' });
      const first = proposalForReplace(create.nextIndex.indexSha256, 'stale-first-source.json', `${ACQUISITIONS_RELATIVE_ROOT}/stale-first.json`, firstBytes);
      await publishAcquisitionPublication({ root: fixture.root, proposal: first, proposalPath: await writeProposal(fixture.root, first, 'stale-first-replace.json') });
      const sourcePath = join(fixture.root, 'stale-source.json');
      const bytes = Buffer.from('{"stale":true}\n', 'utf8');
      await writeFile(sourcePath, bytes, { flag: 'wx' });
      const proposal = proposalForReplace(first.nextIndex.indexSha256, 'stale-source.json', `${ACQUISITIONS_RELATIVE_ROOT}/stale.json`, bytes, 2);
      const proposalPath = await writeProposal(fixture.root, proposal, 'stale-replace.json');
      await expect(publishAcquisitionPublication({
        root: fixture.root,
        proposal,
        proposalPath,
        phaseHook: async (phase) => {
          if (phase !== 'intent-fsynced') return;
          const parentPath = join(fixture.root, ACQUISITIONS_RELATIVE_ROOT, 'index-generations', `${create.nextIndex.indexSha256}.json`);
          const parentBytes = await readFile(parentPath);
          await writeFile(join(fixture.root, ACQUISITIONS_RELATIVE_ROOT, 'index.json'), parentBytes);
        },
      })).rejects.toThrow(/stale CAS/);
      const lockPath = join(fixture.root, ACQUISITION_PUBLICATION_LOCK_RELATIVE_PATH);
      const lock = JSON.parse(await readFile(lockPath, 'utf8')) as { recoveryNonce: string };
      const rolledBack = await recoverAcquisitionPublication({ root: fixture.root, fromLock: true, recoveryNonce: lock.recoveryNonce, acknowledgeNoLiveWriter: true });
      expect(rolledBack.complete).toBe(false);
      expect(rolledBack.recoveryRequired).toBe(false);
      await expect(readFile(lockPath)).rejects.toThrow();
      await expect(readFile(join(fixture.root, `${ACQUISITIONS_RELATIVE_ROOT}/stale.json`))).rejects.toThrow();
    } finally { await fixture.cleanup(); }
  });

  it('exposes every durable authority boundary in order on a real publication', async () => {
    const fixture = await setup();
    try {
      const phases: string[] = [];
      const proposal = proposalForCreate();
      const proposalPath = await writeProposal(fixture.root, proposal, 'boundary.json');
      const result = await publishAcquisitionPublication({
        root: fixture.root,
        proposal,
        proposalPath,
        toolAuthorityPhaseHook: (phase) => { phases.push(phase); },
      });
      expect(result.complete).toBe(true);
      const expected = [
        'lock-file-fsynced',
        'transaction-fsynced',
        'artifacts-staged-fsynced',
        'artifacts-promoted',
        'index-generation-fsynced',
        'next-index-temporary-fsynced',
        'index-promoted',
        'output-directories-fsynced',
        'complete',
        'transaction-unlinked',
        'lock-unlinked',
      ];
      let cursor = -1;
      for (const phase of expected) {
        const next = phases.indexOf(phase, cursor + 1);
        expect(next).toBeGreaterThan(cursor);
        cursor = next;
      }
      expect(phases.filter((phase) => phase === 'lock-file-fsynced')).toHaveLength(2);
    } finally { await fixture.cleanup(); }
  });

  it('recovers every authority publication boundary without deleting unknown files', async () => {
    const phases = [
      'lock-file-fsynced',
      'transaction-fsynced',
      'artifacts-staged-fsynced',
      'artifacts-promoted',
      'index-generation-fsynced',
      'next-index-temporary-fsynced',
      'index-promoted',
      'output-directories-fsynced',
      'complete',
      'transaction-unlinked',
      'lock-unlinked',
    ] as const;

    for (const phaseToFail of phases) {
      const fixture = await setup();
      try {
        const create = proposalForCreate();
        await publishAcquisitionPublication({ root: fixture.root, proposal: create, proposalPath: await writeProposal(fixture.root, create, `matrix-create-${phaseToFail}.json`) });
        const authorityRoot = join(fixture.root, 'review', 'admission', 'tool-authority');
        const unknownPath = join(authorityRoot, `unknown-${phaseToFail}.txt`);
        await writeFile(unknownPath, 'preserve-me', { flag: 'wx' });
        const sourcePath = join(fixture.root, `matrix-source-${phaseToFail}.json`);
        const bytes = Buffer.from(`{"phase":"${phaseToFail}"}\n`, 'utf8');
        await writeFile(sourcePath, bytes, { flag: 'wx' });
        const proposal = proposalForReplace(create.nextIndex.indexSha256, sourcePath.slice(fixture.root.length + 1), `${ACQUISITIONS_RELATIVE_ROOT}/matrix-${phaseToFail}.json`, bytes);
        let fired = false;
        await Promise.resolve(publishAcquisitionPublication({
          root: fixture.root,
          proposal,
          proposalPath: await writeProposal(fixture.root, proposal, `matrix-replace-${phaseToFail}.json`),
          toolAuthorityPhaseHook: (phase) => {
            if (!fired && phase === phaseToFail) {
              fired = true;
              throw new Error(`matrix-${phaseToFail}`);
            }
          },
        })).catch(() => undefined);
        expect(fired).toBe(true);

        let authorityLock: { readonly recoveryNonce: string } | undefined;
        try {
          authorityLock = JSON.parse(await readFile(join(authorityRoot, 'tool-authority.lock'), 'utf8')) as { readonly recoveryNonce: string };
        } catch { /* lock-unlinked is already complete */ }
        if (authorityLock) {
          const authorityRecovered = await recoverToolAuthorityPublication({
            root: fixture.root,
            fromLock: true,
            recoveryNonce: authorityLock.recoveryNonce,
            acknowledgeNoLiveWriter: true,
          });
          expect(authorityRecovered.complete).toBe(true);
        }

        const acquisitionLock = JSON.parse(await readFile(join(fixture.root, ACQUISITION_PUBLICATION_LOCK_RELATIVE_PATH), 'utf8')) as { readonly recoveryNonce: string };
        const acquisitionRecovered = await recoverAcquisitionPublication({
          root: fixture.root,
          fromLock: true,
          recoveryNonce: acquisitionLock.recoveryNonce,
          acknowledgeNoLiveWriter: true,
        });
        expect(acquisitionRecovered.complete).toBe(true);
        expect(await readFile(unknownPath, 'utf8')).toBe('preserve-me');
        expect(await readFile(join(fixture.root, proposal.artifacts[0]!.finalRelativePath))).toEqual(bytes);
      } finally {
        await fixture.cleanup();
      }
    }
  });

  it('rejects a tampered authority lock before recovery mutation', async () => {
    const fixture = await setup();
    try {
      const create = proposalForCreate();
      const createPath = await writeProposal(fixture.root, create, 'lock-tamper-create.json');
      await publishAcquisitionPublication({ root: fixture.root, proposal: create, proposalPath: createPath });
      const sourcePath = join(fixture.root, 'lock-tamper-source.json');
      const bytes = Buffer.from('{"lock":"tamper"}\n', 'utf8');
      await writeFile(sourcePath, bytes, { flag: 'wx' });
      const proposal = proposalForReplace(create.nextIndex.indexSha256, 'lock-tamper-source.json', `${ACQUISITIONS_RELATIVE_ROOT}/lock-tamper.json`, bytes);
      const proposalPath = await writeProposal(fixture.root, proposal, 'lock-tamper-replace.json');
      await expect(publishAcquisitionPublication({
        root: fixture.root,
        proposal,
        proposalPath,
        toolAuthorityPhaseHook: (phase) => {
          if (phase === 'artifacts-promoted') throw new Error('lock-tamper-fault');
        },
      })).rejects.toThrow('lock-tamper-fault');
      const authorityRoot = join(fixture.root, 'review', 'admission', 'tool-authority');
      const lock = JSON.parse(await readFile(join(authorityRoot, 'tool-authority.lock'), 'utf8')) as Record<string, unknown>;
      const { lockSha256: _oldLockSha256, ...lockWithoutHash } = lock;
      const tampered = { ...lockWithoutHash, artifactSetSha256: sha('z') };
      const tamperedLock = { ...tampered, lockSha256: calibrationAdmissionSha256(tampered) };
      await writeFile(join(authorityRoot, 'tool-authority.lock'), calibrationAdmissionCanonicalJson(tamperedLock));
      await expect(recoverToolAuthorityPublication({
        root: fixture.root,
        fromLock: true,
        recoveryNonce: String(lock.recoveryNonce),
        acknowledgeNoLiveWriter: true,
      })).rejects.toThrow(/artifact set|transaction|lock/i);
      expect(JSON.parse(await readFile(join(authorityRoot, 'tool-authority.lock'), 'utf8'))).toMatchObject({ artifactSetSha256: sha('z') });
    } finally { await fixture.cleanup(); }
  });

  it('retains lock and transaction when authority receipt is unavailable, then recovers', async () => {
    const fixture = await setup();
    try {
      const proposal = proposalForCreate();
      const proposalPath = await writeProposal(fixture.root, proposal);
      const pending = await publishAcquisitionPublication({ root: fixture.root, proposal, proposalPath, publishToolReceipt: async () => { throw new Error('authority unavailable'); } });
      expect(pending.complete).toBe(false);
      expect(pending.recoveryRequired).toBe(true);
      const recovered = await recoverAcquisitionPublication({
        root: fixture.root,
        fromLock: true,
        recoveryNonce: (JSON.parse(await readFile(pending.lockPath, 'utf8')) as { recoveryNonce: string }).recoveryNonce,
        acknowledgeNoLiveWriter: true,
      });
      expect(recovered.complete).toBe(true);
      await expect(readFile(pending.lockPath)).rejects.toThrow();
      await expect(readFile(pending.transactionPath)).rejects.toThrow();
    } finally { await fixture.cleanup(); }
  });

  it('does not accept an unindexed receipt callback as publication authority', async () => {
    const fixture = await setup();
    try {
      const proposal = proposalForCreate();
      const proposalPath = await writeProposal(fixture.root, proposal);
      const result = await publishAcquisitionPublication({
        root: fixture.root,
        proposal,
        proposalPath,
        publishToolReceipt: async () => ({ receiptId: sha('r'), receiptSha256: sha('b'), toolAuthorityIndexSha256: sha('a') }),
      });
      expect(result.complete).toBe(false);
      expect(result.recoveryRequired).toBe(true);
      expect(result.reason).toMatch(/authority|indexed|invalid/i);
    } finally { await fixture.cleanup(); }
  });

  it('recovers the lock-only crash window without discovering a transaction', async () => {
    const fixture = await setup();
    try {
      const proposal = proposalForCreate();
      const proposalPath = await writeProposal(fixture.root, proposal);
      await expect(publishAcquisitionPublication({
        root: fixture.root,
        proposal,
        proposalPath,
        phaseHook: (phase) => {
          if (phase === 'lock-file-fsynced') throw new Error('simulated lock-only interruption');
        },
      })).rejects.toThrow('simulated lock-only interruption');
      const lockPath = join(fixture.root, ACQUISITION_PUBLICATION_LOCK_RELATIVE_PATH);
      const lock = JSON.parse(await readFile(lockPath, 'utf8')) as { intendedTransactionId: string; invocationIntentId: string; recoveryNonce: string };
      await expect(recoverAcquisitionPublication({
        root: fixture.root,
        fromLock: true,
        recoveryNonce: lock.recoveryNonce,
        invocationIntentId: sha('1'),
        acknowledgeNoLiveWriter: true,
      })).rejects.toThrow(/invocation intent does not match/i);
      const recovered = await recoverAcquisitionPublication({
        root: fixture.root,
        fromLock: true,
        recoveryNonce: lock.recoveryNonce,
        invocationIntentId: lock.invocationIntentId,
        acknowledgeNoLiveWriter: true,
      });
      expect(recovered.complete).toBe(true);
      expect(recovered.transactionId).toBe(lock.intendedTransactionId);
    } finally { await fixture.cleanup(); }
  });

  it('rejects an acquisition lock whose intended transaction id was rehashed after mutation', async () => {
    const fixture = await setup();
    try {
      const proposal = proposalForCreate();
      const proposalPath = await writeProposal(fixture.root, proposal, 'identity-lock-create.json');
      await expect(publishAcquisitionPublication({
        root: fixture.root,
        proposal,
        proposalPath,
        phaseHook: (phase) => { if (phase === 'lock-file-fsynced') throw new Error('identity-lock-stop'); },
      })).rejects.toThrow('identity-lock-stop');
      const lockPath = join(fixture.root, ACQUISITION_PUBLICATION_LOCK_RELATIVE_PATH);
      const lock = JSON.parse(await readFile(lockPath, 'utf8')) as Record<string, unknown>;
      const replacementTransactionId = sha('f');
      const { lockSha256: _oldLockSha256, ...lockWithoutHash } = {
        ...lock,
        intendedTransactionId: replacementTransactionId,
        lockId: calibrationAdmissionSha256({ domain: 'v10.3-acquisition-publication-lock-id-v1', transactionId: replacementTransactionId }),
      };
      const tamperedLock = { ...lockWithoutHash, lockSha256: calibrationAdmissionSha256(lockWithoutHash) };
      await writeFile(lockPath, calibrationAdmissionCanonicalJson(tamperedLock));
      await expect(recoverAcquisitionPublication({
        root: fixture.root,
        fromLock: true,
        recoveryNonce: String(lock.recoveryNonce),
        acknowledgeNoLiveWriter: true,
      })).rejects.toThrow(/immutable intent|transaction id/i);
    } finally { await fixture.cleanup(); }
  });

  it('rejects source/final path escape and destination collision before mutation', async () => {
    const fixture = await setup();
    try {
      const create = proposalForCreate();
      const createPath = await writeProposal(fixture.root, create, 'create.json');
      await publishAcquisitionPublication({ root: fixture.root, proposal: create, proposalPath: createPath });
      const bytes = Buffer.from('x', 'utf8');
      await writeFile(join(fixture.root, 'source'), bytes);
      const escaped = proposalForReplace(create.nextIndex.indexSha256, '../source', `${ACQUISITIONS_RELATIVE_ROOT}/x`, bytes);
      // The typed proposal cannot carry traversal; construct a hash-valid
      // object mutation to prove the runtime remains fail-closed.
      const unsafe = { ...escaped, artifacts: [{ ...escaped.artifacts[0], sourceRelativePath: '../source' }] };
      const unsafeWithHash = { ...unsafe, proposalSha256: acquisitionPublicationProposalSha256(unsafe) };
      await expect(publishAcquisitionPublication({ root: fixture.root, proposal: unsafeWithHash })).rejects.toThrow();
      await mkdir(join(fixture.root, ACQUISITIONS_RELATIVE_ROOT, 'evidence-generations'), { recursive: true });
      await writeFile(join(fixture.root, ACQUISITIONS_RELATIVE_ROOT, 'evidence-generations', 'collision.json'), bytes);
      const collision = proposalForReplace(create.nextIndex.indexSha256, 'source', `${ACQUISITIONS_RELATIVE_ROOT}/evidence-generations/collision.json`, bytes);
      await expect(publishAcquisitionPublication({ root: fixture.root, proposal: collision })).rejects.toThrow(/already exists|collision/);
    } finally { await fixture.cleanup(); }
  });

  it('does not expose network or process-spawn authority', async () => {
    const source = await setup();
    try {
      const proposal = proposalForCreate();
      const path = await writeProposal(source.root, proposal);
      const result = await publishAcquisitionPublication({ root: source.root, proposal, proposalPath: path });
      expect(result.complete).toBe(true);
    } finally { await source.cleanup(); }
  });

  it('runs tool-authority recovery through the canonical-layout CLI', async () => {
    const fixture = await setup();
    try {
      const proposal = proposalForCreate();
      const proposalPath = await writeProposal(fixture.root, proposal);
      await publishAcquisitionPublication({ root: fixture.root, proposal, proposalPath });
      const authorityRoot = join(fixture.root, 'review', 'admission', 'tool-authority');
      const current = JSON.parse(await readFile(join(authorityRoot, 'index.json'), 'utf8')) as { indexSha256: string; parentIndexSha256?: string };
      const expectedCurrentState = { kind: 'existing' as const, indexSha256: current.parentIndexSha256 ?? current.indexSha256 };
      const transactionId = calibrationAdmissionSha256({
        domain: 'v10.3-tool-authority-publication-transaction-v1',
        operation: 'replace',
        expectedCurrentState,
        nextIndexSha256: current.indexSha256,
        artifactSetSha256: calibrationAdmissionSha256([]),
      });
      const recoveryNonce = calibrationAdmissionSha256({
        domain: 'v10.3-tool-authority-recovery-nonce-v1',
        transactionId,
        parentIndexSha256: expectedCurrentState.indexSha256,
      });
      const lockWithoutId = {
        version: 'v10.3-tool-authority-publication-lock-v1',
        intendedTransactionId: transactionId,
        operation: 'replace',
        expectedCurrentState,
        nextIndexSha256: current.indexSha256,
        // This synthetic completion has no object artifacts.  Bind the lock
        // to the same canonical empty artifact set that real recovery uses.
        artifactSetSha256: calibrationAdmissionSha256([]),
        recoveryNonce,
      };
      const lockBase = { ...lockWithoutId, lockId: calibrationAdmissionSha256(lockWithoutId) };
      const lock = { ...lockBase, lockSha256: calibrationAdmissionSha256(lockBase) };
      await writeFile(join(authorityRoot, 'tool-authority.lock'), calibrationAdmissionCanonicalJson(lock), { flag: 'wx' });
      const completionBase = {
        version: 'v10.3-tool-authority-publication-transaction-v1' as const,
        transactionId,
        lockSha256: lock.lockSha256,
        operation: 'replace' as const,
        expectedCurrentState: lock.expectedCurrentState,
        nextIndexSha256: current.indexSha256,
        artifacts: [],
        immutableIndexGenerationRelativePath: `index-generations/${current.indexSha256}.json`,
        nextIndexTemporaryRelativePath: `transactions/${transactionId}/current-index.json`,
        state: { phase: 'complete' as const },
      };
      const completion = { ...completionBase, transactionSha256: calibrationAdmissionSha256(completionBase) };
      await mkdir(join(authorityRoot, 'completions'), { recursive: true });
      await writeFile(join(authorityRoot, 'completions', `${transactionId}.json`), calibrationAdmissionCanonicalJson(completion), { flag: 'wx' });

      const { stdout } = await execFileAsync(join(process.cwd(), 'node_modules/.bin/tsx'), [
        'scripts/cal/v103-admission.ts',
        'tool-authority:recover',
        '--root', fixture.root,
        '--from-lock',
        '--recovery-nonce', recoveryNonce,
        '--acknowledge-no-live-writer',
      ], { cwd: process.cwd(), maxBuffer: 1024 * 1024 });
      const result = JSON.parse(stdout.trim()) as { ok: boolean; command: string; complete: boolean };
      expect(result).toMatchObject({ ok: true, command: 'tool-authority:recover', complete: true });
      await expect(readFile(join(authorityRoot, 'tool-authority.lock'))).rejects.toThrow();
    } finally { await fixture.cleanup(); }
  });
});
