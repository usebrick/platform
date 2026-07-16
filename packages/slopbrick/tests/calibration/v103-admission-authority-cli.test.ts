import { createHash } from 'node:crypto';
import { execFile } from 'node:child_process';
import { mkdir, mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { promisify } from 'node:util';

import { afterEach, describe, expect, it } from 'vitest';
import {
  calibrationAdmissionAuthorityCurrentSha256,
  calibrationAdmissionCanonicalJson,
  calibrationAdmissionStaticAuthorityGenerationSha256,
} from '@usebrick/core';
import {
  rebuildPrebuiltAdmissionAuthority,
} from '../../src/calibration/v103/admission-authority-rebuild-adapter';
import { planPrebuiltAdmissionAuthorityPublication } from '../../src/calibration/v103/admission-authority-publication-plan';
import {
  publishAdmissionToolInvocationIntent,
  publishAdmissionToolReceipt,
  resolveAdmissionToolAuthorityReceipt,
} from '../../src/calibration/v103/admission-publication';
import {
  makeSemanticIndependentAuthorityFixture,
  type PrebuiltAuthorityGraphFixture,
} from './v103-admission-authority-rebuild-fixture';

const execFileAsync = promisify(execFile);
const tsx = join(process.cwd(), 'tests/helpers/tsx-runner.cjs');
const roots: string[] = [];
const TOOL_PROFILE = 'admission-static-ledgers-v1' as const;
const sha = (value: string): string => createHash('sha256').update(value).digest('hex');
const canonical = (value: unknown): Buffer => Buffer.from(calibrationAdmissionCanonicalJson(value), 'utf8');

async function authorityBackedFixture(root: string): Promise<{
  readonly root: string;
  readonly fixture: PrebuiltAuthorityGraphFixture;
  readonly invocationIntentId: string;
  readonly receiptId: string;
  readonly receiptSha256: string;
  readonly authorityIndexSha256: string;
  readonly outputSetSha256: string;
}> {
  const fixture = makeSemanticIndependentAuthorityFixture();
  const authorityRoot = join(root, 'review', 'admission', 'tool-authority');
  const intent = await publishAdmissionToolInvocationIntent({
    toolAuthorityRoot: authorityRoot,
    profileId: TOOL_PROFILE,
    action: 'authority:overlap',
    canonicalArgvSha256: sha('outer-cli-argv'),
    inputSetSha256: sha('outer-cli-input'),
    executableBehaviorSha256: sha('outer-cli-executable'),
  });
  const receipt = await publishAdmissionToolReceipt({
    toolAuthorityRoot: authorityRoot,
    invocationIntentId: intent.intent.intentId,
    observedResourceUsage: { maxHeapMiB: 64, wallSeconds: 1 },
    exitCode: 0,
    outputSetSha256: sha('outer-cli-output'),
  });
  const resolved = await resolveAdmissionToolAuthorityReceipt({
    authorityRoot,
    authorityIndexSha256: receipt.toolAuthorityIndexSha256,
    receiptId: receipt.receipt.receiptId,
    receiptSha256: receipt.receiptSha256,
    invocationIntentId: intent.intent.intentId,
    profileId: TOOL_PROFILE,
    action: 'authority:overlap',
    outputSetSha256: receipt.receipt.outputSetSha256,
  });
  const staticBody = { ...fixture.staticGeneration, toolAuthoritySnapshot: resolved.snapshot } as Record<string, unknown>;
  delete staticBody.generationSha256;
  const staticGeneration = {
    ...staticBody,
    generationSha256: calibrationAdmissionStaticAuthorityGenerationSha256(staticBody),
  };
  const currentBody = {
    ...fixture.current,
    staticGenerationSha256: staticGeneration.generationSha256,
    staticGenerationRelativePath: `review/admission/authority/static-generations/${staticGeneration.generationSha256}`,
  } as Record<string, unknown>;
  delete currentBody.currentSha256;
  const current = { ...currentBody, currentSha256: calibrationAdmissionAuthorityCurrentSha256(currentBody) };
  return {
    root,
    fixture: {
      ...fixture,
      staticGeneration,
      staticGenerationBytes: canonical(staticGeneration),
      current,
      currentBytes: canonical(current),
    } as PrebuiltAuthorityGraphFixture,
    invocationIntentId: intent.intent.intentId,
    receiptId: receipt.receipt.receiptId,
    receiptSha256: receipt.receiptSha256,
    authorityIndexSha256: receipt.toolAuthorityIndexSha256,
    outputSetSha256: receipt.receipt.outputSetSha256,
  };
}

async function materialize(root: string, backed: Awaited<ReturnType<typeof authorityBackedFixture>>): Promise<{
  readonly proposalPath: string;
  readonly inputGenerationPath: string;
  readonly currentPath: string;
}> {
  const { fixture } = backed;
  const admission = join(root, 'review', 'admission');
  const proposalPath = 'review/admission/authority/proposals/input-proposal-genesis.json';
  const inputGenerationPath = `review/admission/authority/input-generations/${fixture.inputGeneration.generationSha256}/generation.json`;
  const currentPath = 'review/admission/authority/candidates/current.json';
  const proposalFile = join(root, proposalPath);
  const inputFile = join(root, inputGenerationPath);
  const currentFile = join(root, currentPath);
  const staticDirectory = join(root, fixture.current.staticGenerationRelativePath);
  await mkdir(join(proposalFile, '..'), { recursive: true });
  await mkdir(join(inputFile, '..'), { recursive: true });
  await mkdir(join(currentFile, '..'), { recursive: true });
  await mkdir(staticDirectory, { recursive: true });
  await writeFile(proposalFile, fixture.proposalBytes);
  await writeFile(inputFile, fixture.inputGenerationBytes);
  await writeFile(currentFile, fixture.currentBytes);
  await writeFile(join(staticDirectory, 'generation.json'), fixture.staticGenerationBytes);
  for (const [relativePath, bytes] of Object.entries(fixture.inputGenerationArtifactBytes)) {
    const artifactPath = join(inputFile, '..', relativePath);
    await mkdir(dirname(artifactPath), { recursive: true });
    await writeFile(artifactPath, bytes);
  }
  for (const [relativePath, bytes] of Object.entries(fixture.staticGenerationArtifactBytes)) {
    const artifactPath = join(staticDirectory, relativePath);
    await mkdir(dirname(artifactPath), { recursive: true });
    await writeFile(artifactPath, bytes);
  }
  for (const source of fixture.sources) {
    const sourceId = source.sourceGeneration.sourceId;
    const sourceCurrentPath = join(admission, 'sources', sourceId, 'current.json');
    const sourceDirectory = join(admission, source.current.generationRelativePath);
    await mkdir(sourceDirectory, { recursive: true });
    await mkdir(join(sourceCurrentPath, '..'), { recursive: true });
    await writeFile(sourceCurrentPath, source.currentBytes);
    await writeFile(join(sourceDirectory, 'source-generation.json'), source.sourceGenerationBytes);
    await writeFile(join(sourceDirectory, 'source-review.json'), source.sourceReviewBytes);
    if (source.semanticAuthorityBytes !== undefined) await writeFile(join(sourceDirectory, 'source-semantic-authority.json'), source.semanticAuthorityBytes);
    if (source.sourceProposalBytes !== undefined) {
      const sourceProposalPath = join(admission, 'sources', sourceId, 'proposals', `${source.sourceProposal!.proposalId}.json`);
      await mkdir(join(sourceProposalPath, '..'), { recursive: true });
      await writeFile(sourceProposalPath, source.sourceProposalBytes);
    }
    if (source.approvalBytes !== undefined) {
      const approvalPath = join(admission, 'sources', sourceId, 'proposals', `${source.sourceGeneration.proposalId}-approval.json`);
      await mkdir(join(approvalPath, '..'), { recursive: true });
      await writeFile(approvalPath, source.approvalBytes);
    }
    for (const [relativePath, bytes] of Object.entries(source.artifactBytes)) {
      const artifactPath = join(sourceDirectory, relativePath);
      await mkdir(join(artifactPath, '..'), { recursive: true });
      await writeFile(artifactPath, bytes);
    }
  }
  return { proposalPath, inputGenerationPath, currentPath };
}

function planInput(backed: Awaited<ReturnType<typeof authorityBackedFixture>>) {
  const { fixture } = backed;
  const input = {
    operation: 'create',
    invocationIntentId: backed.invocationIntentId,
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
  } as const;
  return { input, planned: planPrebuiltAdmissionAuthorityPublication(input) };
}

function toolArgs(backed: Awaited<ReturnType<typeof authorityBackedFixture>>, paths: Awaited<ReturnType<typeof materialize>>): string[] {
  return [
    '--root', backed.root,
    '--input-generation-proposal', paths.proposalPath,
    '--input-generation', paths.inputGenerationPath,
    '--current', paths.currentPath,
    '--tool-profile', TOOL_PROFILE,
    '--invocation-intent', backed.invocationIntentId,
    '--tool-receipt-id', backed.receiptId,
    '--tool-receipt-sha256', backed.receiptSha256,
    '--tool-authority-index-sha256', backed.authorityIndexSha256,
    '--output-set-sha256', backed.outputSetSha256,
  ];
}

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

describe('v10.3 outer authority CLI boundary', () => {
  it('rejects a partial materializer selection instead of discovering overlap inputs', async () => {
    const root = await mkdtemp(join(tmpdir(), 'slopbrick-outer-authority-cli-materializer-options-'));
    roots.push(root);
    const backed = await authorityBackedFixture(root);
    const paths = await materialize(root, backed);
    const failure = await execFileAsync(tsx, [
      'scripts/cal/v103-admission.ts', 'rebuild:pre-witness', ...toolArgs(backed, paths),
      '--operation', 'create', '--expect-current-absent', '--require-real-scale-receipt',
      '--pre-witness-bundle', 'review/admission/authority/static-generations/bundle.json',
    ], { cwd: process.cwd(), maxBuffer: 1024 * 1024 }).then(() => undefined, (error: unknown) => error as { readonly code?: number; readonly stderr?: string });
    expect(failure?.code).toBe(2);
    expect(failure?.stderr).toContain('requires explicit graph paths');
  });

  it('accepts the complete explicit materializer selector set before opening its paths', async () => {
    const root = await mkdtemp(join(tmpdir(), 'slopbrick-outer-authority-cli-materializer-wiring-'));
    roots.push(root);
    const backed = await authorityBackedFixture(root);
    const paths = await materialize(root, backed);
    const failure = await execFileAsync(tsx, [
      'scripts/cal/v103-admission.ts', 'rebuild:pre-witness', ...toolArgs(backed, paths),
      '--operation', 'create', '--expect-current-absent', '--require-real-scale-receipt',
      '--pre-witness-bundle', 'review/admission/authority/static-generations/missing/pre-witness-bundle.json',
      '--overlap-generation', 'review/admission/global/overlap/generations/missing/generation.json',
      '--overlap-index', 'review/admission/global/overlap/generations/missing/index.json',
      '--overlap-resource-receipt', 'review/admission/global/overlap/generations/missing/overlap-resource-receipt.json',
      '--overlap-ledger', 'review/admission/global/overlap/generations/missing/overlap-ledger.json',
      '--real-scale-record-count', '1',
      '--real-scale-universe-sha256', 'a'.repeat(64),
      '--real-scale-records-jsonl-sha256', 'b'.repeat(64),
    ], { cwd: process.cwd(), maxBuffer: 1024 * 1024 }).then(() => undefined, (error: unknown) => error as { readonly code?: number; readonly stderr?: string });
    expect(failure?.code).toBe(2);
    expect(failure?.stderr).not.toContain('requires explicit graph paths');
    expect(failure?.stderr).toMatch(/ENOENT|pre-witness bundle/i);
  });

  it('rejects the legacy adapter-only outer invocation before mutation', async () => {
    const root = await mkdtemp(join(tmpdir(), 'slopbrick-outer-authority-cli-create-'));
    roots.push(root);
    const backed = await authorityBackedFixture(root);
    const paths = await materialize(root, backed);
    const failure = await execFileAsync(tsx, [
      'scripts/cal/v103-admission.ts', 'rebuild:pre-witness', ...toolArgs(backed, paths),
      '--operation', 'create', '--expect-current-absent', '--require-real-scale-receipt',
    ], { cwd: process.cwd(), maxBuffer: 1024 * 1024 }).then(() => undefined, (error: unknown) => error as { readonly code?: number; readonly stderr?: string });
    expect(failure?.code).toBe(2);
    expect(failure?.stderr).toContain('requires explicit graph paths');
    await expect(stat(join(root, 'review', 'admission', 'authority', 'current.json'))).rejects.toMatchObject({ code: 'ENOENT' });
  });

  it('rejects recovery without the explicit materializer boundary', async () => {
    const root = await mkdtemp(join(tmpdir(), 'slopbrick-outer-authority-cli-recover-'));
    roots.push(root);
    const backed = await authorityBackedFixture(root);
    const paths = await materialize(root, backed);
    const prepared = planInput(backed);
    if (!prepared.planned.ok) throw new Error(prepared.planned.errors.join('; '));
    const toolAuthority = {
      authorityRoot: join(root, 'review', 'admission', 'tool-authority'),
      authorityIndexSha256: backed.authorityIndexSha256,
      receiptId: backed.receiptId,
      receiptSha256: backed.receiptSha256,
      invocationIntentId: backed.invocationIntentId,
      profileId: TOOL_PROFILE,
      action: 'authority:overlap' as const,
      outputSetSha256: backed.outputSetSha256,
    };
    await expect(rebuildPrebuiltAdmissionAuthority({
      publication: { root, graph: backed.fixture, planInput: prepared.input, phaseHook: async (phase) => { if (phase === 'source-generation-directories-staged-fsynced') throw new Error('fixture-pending'); } },
      sourceAuthorityMode: 'candidate-aware',
      toolAuthority,
    })).rejects.toThrow(/fixture-pending|recovery/i);
    const recoveryNonce = prepared.planned.lock.recoveryNonce;
    if (!recoveryNonce) throw new Error('fixture plan did not produce a recovery nonce');
    const failure = await execFileAsync(tsx, [
      'scripts/cal/v103-admission.ts', 'static-authority:recover', ...toolArgs(backed, paths),
      '--transaction-id', prepared.planned.transaction.transactionId, '--recovery-nonce', recoveryNonce, '--acknowledge-no-live-writer',
    ], { cwd: process.cwd(), maxBuffer: 1024 * 1024 }).then(() => undefined, (error: unknown) => error as { readonly code?: number; readonly stderr?: string });
    expect(failure?.code).toBe(2);
    expect(failure?.stderr).toContain('requires explicit graph paths');
  });

  it('rejects lock-only recovery without the explicit materializer boundary', async () => {
    const root = await mkdtemp(join(tmpdir(), 'slopbrick-outer-authority-cli-lock-only-'));
    roots.push(root);
    const backed = await authorityBackedFixture(root);
    const paths = await materialize(root, backed);
    const prepared = planInput(backed);
    if (!prepared.planned.ok) throw new Error(prepared.planned.errors.join('; '));
    const toolAuthority = {
      authorityRoot: join(root, 'review', 'admission', 'tool-authority'),
      authorityIndexSha256: backed.authorityIndexSha256,
      receiptId: backed.receiptId,
      receiptSha256: backed.receiptSha256,
      invocationIntentId: backed.invocationIntentId,
      profileId: TOOL_PROFILE,
      action: 'authority:overlap' as const,
      outputSetSha256: backed.outputSetSha256,
    };
    await expect(rebuildPrebuiltAdmissionAuthority({
      publication: { root, graph: backed.fixture, planInput: prepared.input, phaseHook: async (phase) => { if (phase === 'lock-fsynced') throw new Error('lock-only-fixture'); } },
      sourceAuthorityMode: 'candidate-aware',
      toolAuthority,
    })).rejects.toThrow(/lock-only-fixture|recovery/i);
    const recoveryNonce = prepared.planned.lock.recoveryNonce;
    if (!recoveryNonce) throw new Error('fixture plan did not produce a recovery nonce');
    const failure = await execFileAsync(tsx, [
      'scripts/cal/v103-admission.ts', 'static-authority:recover', ...toolArgs(backed, paths),
      '--from-lock', '--recovery-nonce', recoveryNonce, '--acknowledge-no-live-writer',
    ], { cwd: process.cwd(), maxBuffer: 1024 * 1024 }).then(() => undefined, (error: unknown) => error as { readonly code?: number; readonly stderr?: string });
    expect(failure?.code).toBe(2);
    expect(failure?.stderr).toContain('requires explicit graph paths');
  });

  it('fails closed before mutation when the selected graph or receipt is wrong', async () => {
    const root = await mkdtemp(join(tmpdir(), 'slopbrick-outer-authority-cli-invalid-'));
    roots.push(root);
    const backed = await authorityBackedFixture(root);
    const paths = await materialize(root, backed);
    await rm(join(root, paths.currentPath));
    const missing = await execFileAsync(tsx, [
      'scripts/cal/v103-admission.ts', 'rebuild:pre-witness', ...toolArgs(backed, paths),
      '--operation', 'create', '--expect-current-absent', '--require-real-scale-receipt',
    ], { cwd: process.cwd(), maxBuffer: 1024 * 1024 }).then(() => undefined, (error: unknown) => error as { readonly code?: number; readonly stderr?: string });
    expect(missing?.code).toBe(2);
    expect(JSON.parse(missing?.stderr ?? '')).toMatchObject({ ok: false, command: 'rebuild:pre-witness' });
    await expect(stat(join(root, 'review', 'admission', 'authority', 'rebuild.lock'))).rejects.toMatchObject({ code: 'ENOENT' });

    const secondRoot = await mkdtemp(join(tmpdir(), 'slopbrick-outer-authority-cli-receipt-'));
    roots.push(secondRoot);
    const second = await authorityBackedFixture(secondRoot);
    const secondPaths = await materialize(secondRoot, second);
    const wrongArgs = toolArgs(second, secondPaths);
    wrongArgs[wrongArgs.indexOf('--tool-receipt-sha256') + 1] = '0'.repeat(64);
    const wrong = await execFileAsync(tsx, [
      'scripts/cal/v103-admission.ts', 'rebuild:pre-witness', ...wrongArgs,
      '--operation', 'create', '--expect-current-absent', '--require-real-scale-receipt',
    ], { cwd: process.cwd(), maxBuffer: 1024 * 1024 }).then(() => undefined, (error: unknown) => error as { readonly code?: number; readonly stderr?: string });
    expect(wrong?.code).toBe(2);
    expect(JSON.parse(wrong?.stderr ?? '')).toMatchObject({ ok: false, command: 'rebuild:pre-witness' });
    await expect(stat(join(secondRoot, 'review', 'admission', 'authority', 'rebuild.lock'))).rejects.toMatchObject({ code: 'ENOENT' });
  });

  it('rejects the nested review/admission root for the outer project-root-only boundary', async () => {
    const root = await mkdtemp(join(tmpdir(), 'slopbrick-outer-authority-cli-root-'));
    roots.push(root);
    const failure = await execFileAsync(tsx, [
      'scripts/cal/v103-admission.ts', 'rebuild:pre-witness',
      '--root', join(root, 'review', 'admission'),
    ], { cwd: process.cwd(), maxBuffer: 1024 * 1024 }).then(() => undefined, (error: unknown) => error as { readonly code?: number; readonly stderr?: string });
    expect(failure?.code).toBe(2);
    expect(failure?.stderr).toContain('requires the project root');
  });
});
