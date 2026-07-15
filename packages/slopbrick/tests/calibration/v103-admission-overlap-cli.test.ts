import { createHash } from 'node:crypto';
import { execFile } from 'node:child_process';
import { createReadStream, readFileSync } from 'node:fs';
import { mkdir, mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { describe, expect, it } from 'vitest';
import {
  FROZEN_ADMISSION_PROFILE_IDS,
  calibrationAdmissionAuthorityCurrentSha256,
  calibrationAdmissionCanonicalJson,
  calibrationAdmissionNormalizerRegistrySha256,
  calibrationAdmissionOverlapPolarityBindingSha256,
  calibrationAdmissionOverlapIndexReceiptSha256,
  calibrationAdmissionOverlapLedgerSha256,
  calibrationAdmissionOverlapResourceReceiptId,
  calibrationAdmissionOverlapPolicySha256,
  calibrationAdmissionOverlapUniverseRecordSha256,
  calibrationAdmissionOverlapUniverseSha256,
  calibrationAdmissionSha256,
  calibrationAdmissionStaticAuthorityGenerationSha256,
  type AdmissionNormalizerRegistryV1,
  type AdmissionOverlapPolicyV1,
  type AdmissionOverlapUniverseRecordV1,
  type AdmissionOverlapUniverseV1,
} from '@usebrick/core';
import { ADMISSION_LEXICAL_RUNTIME_BINDINGS, normalizeAdmissionBytes } from '../../src/calibration/v103/admission-normalizers';
import { buildAdmissionOverlapLedger } from '../../src/calibration/v103/admission-overlap';
import { openAdmissionOverlapUniverseStream } from '../../src/calibration/v103/admission-overlap-stream';
import {
  publishAdmissionToolInvocationIntent as publishIntent,
  publishAdmissionToolReceipt as publishReceipt,
  resolveAdmissionToolAuthorityReceipt as resolveReceipt,
} from '../../src/calibration/v103/admission-publication';
import {
  OverlapPublicationPendingError,
  publishAdmissionOverlap,
} from '../../src/calibration/v103/admission-overlap-publication';

const execFileAsync = promisify(execFile);
const fixtureRoot = fileURLToPath(new URL('../../../core/tests/fixtures/schema/valid', import.meta.url));
const tsx = join(process.cwd(), 'node_modules/.bin/tsx');
const TOOL_PROFILE = 'admission-static-ledgers-v1';

function fixture<T>(name: string): T {
  return JSON.parse(readFileSync(join(fixtureRoot, `${name}.valid.json`), 'utf8')) as T;
}

function sha256(value: Uint8Array | string): string {
  return createHash('sha256').update(value).digest('hex');
}

function registry(): AdmissionNormalizerRegistryV1 {
  const source = fixture<Record<string, unknown>>('calibration-admission-normalizer-registry');
  const entry = (source.entries as Array<Record<string, unknown>>)[0]!;
  const runtime = ADMISSION_LEXICAL_RUNTIME_BINDINGS[0]!;
  const base = {
    ...source,
    entries: [{ ...entry, implementationSha256: runtime.implementationSha256, fixturesSha256: runtime.fixturesSha256 }],
  };
  return { ...base, registrySha256: calibrationAdmissionNormalizerRegistrySha256(base) } as AdmissionNormalizerRegistryV1;
}

const policyBase: Omit<AdmissionOverlapPolicyV1, 'policySha256'> = {
  version: 'v10.3-admission-overlap-policy-v1', method: 'prefix-filter-exact-jaccard-0.80-v1',
  maxUnitBytes: 33_554_432, maxShardBytes: 67_108_864, maxOpenFiles: 64,
  maxHeapBytes: 4_294_967_296, maxRssBytes: 6_442_450_944,
  maxWorkBytes: 214_748_364_800, maxWallMilliseconds: 86_400_000,
};
const policy: AdmissionOverlapPolicyV1 = { ...policyBase, policySha256: calibrationAdmissionOverlapPolicySha256(policyBase) };

function makeRecord(
  id: string,
  bytes: Uint8Array,
  side: 'ai_side' | 'human_side',
  normalizers: AdmissionNormalizerRegistryV1,
): AdmissionOverlapUniverseRecordV1 {
  const normalized = normalizeAdmissionBytes('TypeScript', bytes, normalizers);
  if (!normalized.ok) throw new Error('fixture normalization failed');
  const polarity = {
    intake: side === 'ai_side' ? 'declared_ai' as const : 'declared_human' as const,
    overlapSide: side,
    bindingAuthority: 'legacy-selected-inventory' as const,
    bindingSha256: '',
  };
  polarity.bindingSha256 = calibrationAdmissionOverlapPolarityBindingSha256(polarity);
  const base = {
    version: 'v10.3-overlap-universe-record-v1' as const,
    candidateUnitId: id,
    materialSourceId: `source-${id}`,
    aggregateSourceIds: [`source-${id}`],
    locator: { kind: 'local_inventory_file' as const, localSourceId: `source-${id}`, normalizedPath: `${id}.ts` },
    polarity,
    contentSha256: sha256(bytes), contentBytes: bytes.byteLength,
    language: 'TypeScript' as const, normalizerId: normalized.normalizerId,
    normalizationStatus: 'covered' as const,
    shingleSetSha256: normalized.shingleSetSha256, shingleCount: normalized.shingleCount,
  };
  return { ...base, recordSha256: calibrationAdmissionOverlapUniverseRecordSha256(base) };
}

function makeUniverse(
  records: readonly AdmissionOverlapUniverseRecordV1[],
  normalizers: AdmissionNormalizerRegistryV1,
): AdmissionOverlapUniverseV1 {
  const stream = Buffer.from(records.map((record) => `${calibrationAdmissionCanonicalJson(record)}\n`).join(''), 'utf8');
  const base = {
    version: 'v10.3-admission-overlap-universe-v1' as const,
    registerSha256: 'a'.repeat(64), recordsJsonlSha256: sha256(stream),
    selectedAggregateCoverage: records.length, baselineMaterialUnits: records.length,
    repositoryMaterialUnits: 0, newCandidateUnits: 0, covered: records.length,
    unsupported: 0, unreadable: 0, unresolvedCandidateUnitIds: [],
    normalizerRegistrySha256: normalizers.registrySha256,
  };
  return { ...base, universeSha256: calibrationAdmissionOverlapUniverseSha256(base) };
}

function toolAuthority(intent: string, receiptId: string, authorityIndexSha256: string) {
  const base = {
    version: 'v10.3-admission-tool-authority-snapshot-v1' as const,
    indexGenerationSha256: authorityIndexSha256,
    profileIds: [...FROZEN_ADMISSION_PROFILE_IDS].sort(),
    invocationIntentIds: [intent], receiptIds: [receiptId],
  };
  return { ...base, snapshotSha256: calibrationAdmissionSha256(base) };
}

interface OverlapFixture {
  readonly root: string;
  readonly bytesRoot: string;
  readonly recordsPath: string;
  readonly universe: AdmissionOverlapUniverseV1;
  readonly records: readonly AdmissionOverlapUniverseRecordV1[];
  readonly normalizers: AdmissionNormalizerRegistryV1;
  readonly intent: string;
  readonly receiptId: string;
  readonly receiptSha256: string;
  readonly authorityIndexSha256: string;
  readonly recoveryNonce: string;
  readonly inputGenerationSha256: string;
}

interface JoinedOverlapFixture extends OverlapFixture {
  readonly joinIntentId: string;
  readonly joinReceiptId: string;
  readonly joinReceiptSha256: string;
  readonly joinAuthorityIndexSha256: string;
}

async function createFixture(root: string): Promise<OverlapFixture> {
  const normalizers = registry();
  const bytes = Buffer.from('a b c d e f g h i j', 'utf8');
  const records = [
    makeRecord('unit-a', bytes, 'ai_side', normalizers),
    makeRecord('unit-b', bytes, 'human_side', normalizers),
  ];
  const universe = makeUniverse(records, normalizers);
  const bytesRoot = join(root, 'bytes');
  const recordsPath = join(root, 'records.jsonl');
  await mkdir(bytesRoot, { recursive: true });
  for (const record of records) await writeFile(join(bytesRoot, record.locator.normalizedPath), bytes);
  await writeFile(recordsPath, records.map((record) => `${calibrationAdmissionCanonicalJson(record)}\n`).join(''));
  await writeFile(join(root, 'universe.json'), calibrationAdmissionCanonicalJson(universe));
  await writeFile(join(root, 'policy.json'), calibrationAdmissionCanonicalJson(policy));
  await writeFile(join(root, 'normalizers.json'), calibrationAdmissionCanonicalJson(normalizers));

  const intent = '1'.repeat(64);
  const receiptId = '2'.repeat(64);
  const receiptSha256 = '3'.repeat(64);
  const authorityIndexSha256 = '4'.repeat(64);
  const recoveryNonce = '5'.repeat(64);
  const inputGenerationSha256 = '6'.repeat(64);
  await writeFile(
    join(root, 'tool-snapshot.json'),
    calibrationAdmissionCanonicalJson(toolAuthority(intent, receiptId, authorityIndexSha256)),
  );
  return {
    root,
    bytesRoot,
    recordsPath,
    universe,
    records,
    normalizers,
    intent,
    receiptId,
    receiptSha256,
    authorityIndexSha256,
    recoveryNonce,
    inputGenerationSha256,
  };
}

function publishArgs(fixtureValue: OverlapFixture): string[] {
  return [
    'scripts/cal/v103-admission.ts', 'authority:overlap',
    '--root', fixtureValue.root,
    '--universe', 'universe.json', '--records', 'records.jsonl', '--policy', 'policy.json',
    '--normalizers', 'normalizers.json', '--bytes-root', 'bytes', '--tool-snapshot', 'tool-snapshot.json',
    '--generation', '0', '--input-generation-sha256', fixtureValue.inputGenerationSha256,
    '--tool-profile', TOOL_PROFILE, '--invocation-intent', fixtureValue.intent,
    '--tool-receipt-id', fixtureValue.receiptId, '--tool-receipt-sha256', fixtureValue.receiptSha256,
    '--tool-authority-index-sha256', fixtureValue.authorityIndexSha256,
  ];
}

async function buildFixture(fixtureValue: OverlapFixture, workDirectory: string) {
  const input = openAdmissionOverlapUniverseStream(
    createReadStream(fixtureValue.recordsPath),
    fixtureValue.universe,
    fixtureValue.normalizers,
  );
  const result = await buildAdmissionOverlapLedger(
    fixtureValue.universe,
    input.records,
    async (record) => readFile(join(fixtureValue.bytesRoot, record.locator.normalizedPath)),
    workDirectory,
    policy,
    fixtureValue.normalizers,
  );
  await expect(input.complete).resolves.toMatchObject({ ok: true });
  return result;
}

async function createJoinedFixture(root: string): Promise<JoinedOverlapFixture> {
  const base = await createFixture(root);
  const authorityRoot = join(root, 'review', 'admission', 'tool-authority');
  const intent = await publishIntent({
    toolAuthorityRoot: authorityRoot,
    profileId: TOOL_PROFILE,
    action: 'authority:overlap',
    canonicalArgvSha256: sha256('join-argv'),
    inputSetSha256: sha256('join-input'),
    executableBehaviorSha256: sha256('join-executable'),
  });
  const receipt = await publishReceipt({
    toolAuthorityRoot: authorityRoot,
    invocationIntentId: intent.intent.intentId,
    observedResourceUsage: { heapBytes: 123, workers: 1 },
    exitCode: 0,
    outputSetSha256: sha256('join-output'),
  });
  const resolved = await resolveReceipt({
    authorityRoot,
    authorityIndexSha256: receipt.toolAuthorityIndexSha256,
    receiptId: receipt.receipt.receiptId,
    receiptSha256: receipt.receiptSha256,
    invocationIntentId: intent.intent.intentId,
    profileId: TOOL_PROFILE,
    action: 'authority:overlap',
  });
  const workDirectory = await mkdtemp(join(root, '.join-builder-'));
  const built = await buildFixture(base, workDirectory);
  const { receiptSha256: _indexReceiptSha256, ...indexBody } = {
    ...built.indexReceipt,
    toolReceiptSha256: receipt.receiptSha256,
  };
  const indexReceipt = {
    ...indexBody,
    receiptSha256: calibrationAdmissionOverlapIndexReceiptSha256(indexBody),
  };
  const { receiptId: _resourceReceiptId, ...resourceBody } = {
    ...built.resourceReceipt,
    toolReceiptSha256: receipt.receiptSha256,
  };
  const resourceReceipt = {
    ...resourceBody,
    receiptId: calibrationAdmissionOverlapResourceReceiptId(resourceBody),
  };
  const { ledgerSha256: _ledgerSha256, ...ledgerBody } = {
    ...built.ledger,
    indexReceiptSha256: indexReceipt.receiptSha256,
  };
  const ledger = {
    ...ledgerBody,
    ledgerSha256: calibrationAdmissionOverlapLedgerSha256(ledgerBody),
  };
  const buildResult = { ...built, indexReceipt, resourceReceipt, ledger };
  await publishAdmissionOverlap({
    root,
    generationLocalRoot: workDirectory,
    buildResult,
    universe: base.universe,
    policy,
    normalizerRegistry: base.normalizers,
    generation: 0,
    inputGenerationSha256: base.inputGenerationSha256,
    invocationIntentId: intent.intent.intentId,
    toolAuthoritySnapshot: resolved.snapshot,
    toolReceipt: {
      receiptId: receipt.receipt.receiptId,
      receiptSha256: receipt.receiptSha256,
      authorityIndexSha256: receipt.toolAuthorityIndexSha256,
    },
  });

  const overlapCurrentPath = join(root, 'review', 'admission', 'global', 'overlap', 'current-generation.json');
  const overlapCurrent = JSON.parse(await readFile(overlapCurrentPath, 'utf8')) as { readonly generationSha256: string };
  const overlapGenerationPath = join(root, 'review', 'admission', 'global', 'overlap', 'generations', overlapCurrent.generationSha256, 'generation.json');
  const overlapGeneration = JSON.parse(await readFile(overlapGenerationPath, 'utf8')) as {
    readonly inputGenerationSha256: string;
    readonly generationSha256: string;
  };
  const staticArtifacts = [
    ['lineage-ledger.json', 'ledger'],
    ['pre-witness-bundle.json', 'bundle'],
    ['privacy-ledger.json', 'ledger'],
    ['quality-ledger.json', 'ledger'],
  ].map(([relativePath, kind]) => ({
    pathBase: 'generation_local' as const,
    relativePath,
    kind: kind as 'ledger' | 'bundle',
    bytes: 0,
    sha256: '0'.repeat(64),
  }));
  const staticBody = {
    version: 'v10.3-admission-static-authority-generation-v1' as const,
    generation: 0,
    inputGenerationSha256: overlapGeneration.inputGenerationSha256,
    overlapGenerationSha256: overlapGeneration.generationSha256,
    privacyLedgerSha256: '1'.repeat(64),
    qualityLedgerSha256: '2'.repeat(64),
    lineageLedgerSha256: '3'.repeat(64),
    preWitnessBundleSha256: '4'.repeat(64),
    toolAuthoritySnapshot: resolved.snapshot,
    artifacts: staticArtifacts,
  };
  const staticGeneration = {
    ...staticBody,
    generationSha256: calibrationAdmissionStaticAuthorityGenerationSha256(staticBody),
  };
  const staticRoot = join(root, 'review', 'admission', 'authority', 'static-generations', staticGeneration.generationSha256);
  await mkdir(staticRoot, { recursive: true });
  await writeFile(join(staticRoot, 'generation.json'), calibrationAdmissionCanonicalJson(staticGeneration));
  const currentBody = {
    version: 'v10.3-admission-authority-current-v1' as const,
    generation: 0,
    staticGenerationSha256: staticGeneration.generationSha256,
    staticGenerationRelativePath: `review/admission/authority/static-generations/${staticGeneration.generationSha256}`,
  };
  const current = { ...currentBody, currentSha256: calibrationAdmissionAuthorityCurrentSha256(currentBody) };
  const authorityRootOnDisk = join(root, 'review', 'admission', 'authority');
  await mkdir(authorityRootOnDisk, { recursive: true });
  await writeFile(join(authorityRootOnDisk, 'current.json'), calibrationAdmissionCanonicalJson(current));
  return {
    ...base,
    joinIntentId: intent.intent.intentId,
    joinReceiptId: receipt.receipt.receiptId,
    joinReceiptSha256: receipt.receiptSha256,
    joinAuthorityIndexSha256: receipt.toolAuthorityIndexSha256,
  };
}

describe('v10.3 overlap authority CLI boundary', () => {
  it('runs read-only verification without creating the control-plane layout', async () => {
    const root = await mkdtemp(join(tmpdir(), 'slopbrick-overlap-cli-'));
    try {
      await expect(execFileAsync(join(process.cwd(), 'node_modules/.bin/tsx'), [
        'scripts/cal/v103-admission.ts', 'authority:overlap:verify', '--root', root,
        '--tool-profile', 'admission-static-ledgers-v1',
      ], { cwd: process.cwd(), maxBuffer: 1024 * 1024 })).rejects.toMatchObject({ code: 2 });
      await expect(stat(join(root, 'review'))).rejects.toMatchObject({ code: 'ENOENT' });
    } finally { await rm(root, { recursive: true, force: true }); }
  });

  it('rejects tool-receipt options on the verify command before touching outputs', async () => {
    const root = await mkdtemp(join(tmpdir(), 'slopbrick-overlap-cli-options-'));
    try {
      const hash = 'a'.repeat(64);
      await expect(execFileAsync(join(process.cwd(), 'node_modules/.bin/tsx'), [
        'scripts/cal/v103-admission.ts', 'authority:overlap:verify', '--root', root,
        '--tool-profile', 'admission-static-ledgers-v1', '--tool-receipt-id', hash,
        '--tool-receipt-sha256', hash, '--tool-authority-index-sha256', hash,
      ], { cwd: process.cwd(), maxBuffer: 1024 * 1024 })).rejects.toMatchObject({ code: 2 });
      await expect(execFileAsync(join(process.cwd(), 'node_modules/.bin/tsx'), [
        'scripts/cal/v103-admission.ts', 'authority:overlap:verify', '--root', root,
        '--tool-profile', 'admission-static-ledgers-v1', '--action', 'authority:overlap',
      ], { cwd: process.cwd(), maxBuffer: 1024 * 1024 })).rejects.toMatchObject({ code: 2 });
      await expect(readFile(join(root, 'review'))).rejects.toMatchObject({ code: 'ENOENT' });
    } finally { await rm(root, { recursive: true, force: true }); }
  });

  it('requires explicit indexed tool selectors for the opt-in static-authority join', async () => {
    const root = await mkdtemp(join(tmpdir(), 'slopbrick-overlap-cli-join-options-'));
    try {
      await expect(execFileAsync(join(process.cwd(), 'node_modules/.bin/tsx'), [
        'scripts/cal/v103-admission.ts', 'authority:overlap:verify', '--root', root,
        '--tool-profile', TOOL_PROFILE, '--join-static-authority',
      ], { cwd: process.cwd(), maxBuffer: 1024 * 1024 })).rejects.toMatchObject({ code: 2 });
      await expect(stat(join(root, 'review'))).rejects.toMatchObject({ code: 'ENOENT' });
    } finally { await rm(root, { recursive: true, force: true }); }
  });

  it('reports lock contention without claiming a recoverable transaction', async () => {
    const root = await mkdtemp(join(tmpdir(), 'slopbrick-overlap-cli-contention-'));
    try {
      const fixtureValue = await createFixture(root);
      const overlapRoot = join(root, 'review/admission/global/overlap');
      await mkdir(overlapRoot, { recursive: true });
      await writeFile(join(overlapRoot, 'publication.lock'), 'another writer owns this lock\n', { flag: 'wx' });
      const failure = await execFileAsync(tsx, publishArgs(fixtureValue), { cwd: process.cwd(), maxBuffer: 1024 * 1024 })
        .then(() => undefined, (error: unknown) => error as { code?: number; stderr?: string });
      expect(failure?.code).toBe(2);
      expect(JSON.parse(failure?.stderr ?? '')).toMatchObject({
        ok: false,
        command: 'authority:overlap',
        complete: false,
        recoveryRequired: false,
        status: 'contended',
      });
      await expect(stat(join(overlapRoot, 'publication-transaction.json'))).rejects.toMatchObject({ code: 'ENOENT' });
    } finally { await rm(root, { recursive: true, force: true }); }
  });

  it('publishes a fixture-local generation and verifies it through the CLI', async () => {
    const root = await mkdtemp(join(tmpdir(), 'slopbrick-overlap-cli-publish-'));
    try {
      const fixtureValue = await createFixture(root);
      const { stdout: publishStdout } = await execFileAsync(tsx, publishArgs(fixtureValue), {
        cwd: process.cwd(),
        maxBuffer: 1024 * 1024,
      });
      expect(JSON.parse(publishStdout)).toMatchObject({
        ok: true,
        command: 'authority:overlap',
        complete: true,
        recoveryRequired: false,
      });

      const { stdout: verifyStdout } = await execFileAsync(tsx, [
        'scripts/cal/v103-admission.ts', 'authority:overlap:verify', '--root', root,
        '--tool-profile', TOOL_PROFILE,
      ], { cwd: process.cwd(), maxBuffer: 1024 * 1024 });
      const verifyPayload = JSON.parse(verifyStdout) as { artifactCount?: unknown; generationSha256?: unknown };
      expect(verifyPayload).toMatchObject({
        ok: true,
        command: 'authority:overlap:verify',
        artifactCount: expect.any(Number),
      });
      expect(verifyPayload.artifactCount).toBeGreaterThan(0);
      expect(typeof verifyPayload.generationSha256).toBe('string');

      const nestedRootVerification = await execFileAsync(tsx, [
        'scripts/cal/v103-admission.ts', 'authority:overlap:verify', '--root', join(root, 'review', 'admission'),
        '--tool-profile', TOOL_PROFILE,
      ], { cwd: process.cwd(), maxBuffer: 1024 * 1024 });
      expect(JSON.parse(nestedRootVerification.stdout)).toMatchObject({ ok: true, command: 'authority:overlap:verify' });
    } finally { await rm(root, { recursive: true, force: true }); }
  });

  it('opt-in verifies the static-authority overlap join and rejects static-overlap tampering', async () => {
    const root = await mkdtemp(join(tmpdir(), 'slopbrick-overlap-cli-join-'));
    try {
      const fixtureValue = await createJoinedFixture(root);
      const verifyArgs = [
        'scripts/cal/v103-admission.ts', 'authority:overlap:verify', '--root', root,
        '--tool-profile', TOOL_PROFILE, '--join-static-authority',
        '--invocation-intent', fixtureValue.joinIntentId,
        '--tool-receipt-id', fixtureValue.joinReceiptId,
        '--tool-receipt-sha256', fixtureValue.joinReceiptSha256,
        '--tool-authority-index-sha256', fixtureValue.joinAuthorityIndexSha256,
      ];
      const defaultVerification = await execFileAsync(tsx, [
        'scripts/cal/v103-admission.ts', 'authority:overlap:verify', '--root', root,
        '--tool-profile', TOOL_PROFILE,
      ], { cwd: process.cwd(), maxBuffer: 1024 * 1024 });
      expect(JSON.parse(defaultVerification.stdout)).toMatchObject({ ok: true });
      const joined = await execFileAsync(tsx, verifyArgs, { cwd: process.cwd(), maxBuffer: 1024 * 1024 });
      expect(JSON.parse(joined.stdout)).toMatchObject({ ok: true, command: 'authority:overlap:verify' });
      const unrelated = [...verifyArgs, '--action', 'authority:overlap'];
      await expect(execFileAsync(tsx, unrelated, { cwd: process.cwd(), maxBuffer: 1024 * 1024 })).rejects.toMatchObject({ code: 2 });

      const staleReceiptSelector = [...verifyArgs];
      const receiptHashIndex = staleReceiptSelector.indexOf('--tool-receipt-sha256') + 1;
      staleReceiptSelector[receiptHashIndex] = '0'.repeat(64);
      const staleReceipt = await execFileAsync(tsx, staleReceiptSelector, { cwd: process.cwd(), maxBuffer: 1024 * 1024 })
        .then(() => undefined, (error: unknown) => error as { readonly code?: number; readonly stdout?: string; readonly stderr?: string });
      expect(staleReceipt?.code).toBe(2);
      expect(`${staleReceipt?.stdout ?? ''}${staleReceipt?.stderr ?? ''}`).toContain('overlap_static_authority_join:Tool-authority receipt is not indexed at the requested hash');

      const currentPath = join(root, 'review', 'admission', 'authority', 'current.json');
      const current = JSON.parse(await readFile(currentPath, 'utf8')) as { readonly staticGenerationRelativePath: string };
      const staticPath = join(root, current.staticGenerationRelativePath);
      const staticGeneration = JSON.parse(await readFile(join(staticPath, 'generation.json'), 'utf8')) as Record<string, unknown>;
      const changedBody = {
        ...staticGeneration,
        generation: 1,
        parentStaticGenerationSha256: staticGeneration.generationSha256,
        overlapGenerationSha256: 'f'.repeat(64),
      };
      delete (changedBody as { generationSha256?: string }).generationSha256;
      const changed = {
        ...changedBody,
        generationSha256: calibrationAdmissionStaticAuthorityGenerationSha256(changedBody),
      };
      const changedPath = join(root, 'review', 'admission', 'authority', 'static-generations', changed.generationSha256);
      await mkdir(changedPath, { recursive: true });
      await writeFile(join(changedPath, 'generation.json'), calibrationAdmissionCanonicalJson(changed));
      const currentBody = {
        ...current,
        staticGenerationSha256: changed.generationSha256,
        staticGenerationRelativePath: `review/admission/authority/static-generations/${changed.generationSha256}`,
      };
      delete (currentBody as { currentSha256?: string }).currentSha256;
      const changedCurrent = {
        ...currentBody,
        currentSha256: calibrationAdmissionAuthorityCurrentSha256(currentBody),
      };
      await writeFile(currentPath, calibrationAdmissionCanonicalJson(changedCurrent));
      const tampered = await execFileAsync(tsx, verifyArgs, { cwd: process.cwd(), maxBuffer: 1024 * 1024 })
        .then(() => undefined, (error: unknown) => error as { readonly code?: number; readonly stdout?: string; readonly stderr?: string });
      expect(tampered?.code).toBe(2);
      expect(`${tampered?.stdout ?? ''}${tampered?.stderr ?? ''}`).toContain('static_overlap_generation_hash_mismatch');
      expect(`${tampered?.stdout ?? ''}${tampered?.stderr ?? ''}`).toContain('static_generation_current_number_mismatch');
    } finally { await rm(root, { recursive: true, force: true }); }
  });

  it('rejects a valid static generation whose bytes do not match the current pointer hash', async () => {
    const root = await mkdtemp(join(tmpdir(), 'slopbrick-overlap-cli-current-bind-'));
    try {
      const fixtureValue = await createJoinedFixture(root);
      const currentPath = join(root, 'review', 'admission', 'authority', 'current.json');
      const current = JSON.parse(await readFile(currentPath, 'utf8')) as { readonly staticGenerationRelativePath: string };
      const generationPath = join(root, current.staticGenerationRelativePath, 'generation.json');
      const generation = JSON.parse(await readFile(generationPath, 'utf8')) as Record<string, unknown>;
      const changedBody = { ...generation, privacyLedgerSha256: '9'.repeat(64) };
      delete (changedBody as { generationSha256?: string }).generationSha256;
      const changed = {
        ...changedBody,
        generationSha256: calibrationAdmissionStaticAuthorityGenerationSha256(changedBody),
      };
      await writeFile(generationPath, calibrationAdmissionCanonicalJson(changed));
      const result = await execFileAsync(tsx, [
        'scripts/cal/v103-admission.ts', 'authority:overlap:verify', '--root', root,
        '--tool-profile', TOOL_PROFILE, '--join-static-authority',
        '--invocation-intent', fixtureValue.joinIntentId,
        '--tool-receipt-id', fixtureValue.joinReceiptId,
        '--tool-receipt-sha256', fixtureValue.joinReceiptSha256,
        '--tool-authority-index-sha256', fixtureValue.joinAuthorityIndexSha256,
      ]).then(() => undefined, (error: unknown) => error as { readonly code?: number; readonly stdout?: string; readonly stderr?: string });
      expect(result?.code).toBe(2);
      expect(`${result?.stdout ?? ''}${result?.stderr ?? ''}`).toContain('overlap_static_authority_join:static_generation_current_hash_mismatch');
    } finally { await rm(root, { recursive: true, force: true }); }
  });

  it('recovers a library-created pending transaction through the CLI', async () => {
    const root = await mkdtemp(join(tmpdir(), 'slopbrick-overlap-cli-recover-'));
    try {
      const fixtureValue = await createFixture(root);
      const workDirectory = await mkdtemp(join(root, '.builder-'));
      const buildResult = await buildFixture(fixtureValue, workDirectory);
      await expect(publishAdmissionOverlap({
        root,
        generationLocalRoot: workDirectory,
        buildResult,
        universe: fixtureValue.universe,
        policy,
        normalizerRegistry: fixtureValue.normalizers,
        generation: 0,
        inputGenerationSha256: fixtureValue.inputGenerationSha256,
        invocationIntentId: fixtureValue.intent,
        toolAuthoritySnapshot: toolAuthority(fixtureValue.intent, fixtureValue.receiptId, fixtureValue.authorityIndexSha256),
        toolReceipt: {
          receiptId: fixtureValue.receiptId,
          receiptSha256: fixtureValue.receiptSha256,
          authorityIndexSha256: fixtureValue.authorityIndexSha256,
        },
        recoveryNonce: fixtureValue.recoveryNonce,
        phaseHook: async (phase) => {
          if (phase === 'tool-receipt-indexed') throw new Error('fixture-fault');
        },
      })).rejects.toBeInstanceOf(OverlapPublicationPendingError);

      const { stdout: recoverStdout } = await execFileAsync(tsx, [
        'scripts/cal/v103-admission.ts', 'authority:overlap:recover', '--root', root,
        '--from-lock', '--recovery-nonce', fixtureValue.recoveryNonce,
        '--acknowledge-no-live-writer', '--tool-profile', TOOL_PROFILE,
        '--tool-receipt-id', fixtureValue.receiptId,
        '--tool-receipt-sha256', fixtureValue.receiptSha256,
        '--tool-authority-index-sha256', fixtureValue.authorityIndexSha256,
      ], { cwd: process.cwd(), maxBuffer: 1024 * 1024 });
      expect(JSON.parse(recoverStdout)).toMatchObject({
        ok: true,
        command: 'authority:overlap:recover',
        complete: true,
        recoveryRequired: false,
      });
      await expect(stat(join(root, 'review/admission/global/overlap/publication.lock'))).rejects.toMatchObject({ code: 'ENOENT' });
      await expect(stat(join(root, 'review/admission/global/overlap/publication-transaction.json'))).rejects.toMatchObject({ code: 'ENOENT' });

      const { stdout: verifyStdout } = await execFileAsync(tsx, [
        'scripts/cal/v103-admission.ts', 'authority:overlap:verify', '--root', root,
        '--tool-profile', TOOL_PROFILE,
      ], { cwd: process.cwd(), maxBuffer: 1024 * 1024 });
      expect(JSON.parse(verifyStdout)).toMatchObject({ ok: true, command: 'authority:overlap:verify' });
    } finally { await rm(root, { recursive: true, force: true }); }
  });

});
