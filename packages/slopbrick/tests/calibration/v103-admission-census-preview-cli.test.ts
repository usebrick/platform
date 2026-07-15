import { createHash } from 'node:crypto';
import { execFile } from 'node:child_process';
import { lstat, mkdir, mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, relative } from 'node:path';
import { promisify } from 'node:util';
import { describe, expect, it } from 'vitest';
import {
  FROZEN_ADMISSION_PROFILE_IDS,
  calibrationAdmissionCanonicalJson,
  calibrationAdmissionEvidenceBundleSha256,
  calibrationAdmissionEvidenceIndexSha256,
  calibrationAdmissionEvidencePayloadSetSha256,
  calibrationAdmissionInitialSourceIdsSha256,
  calibrationAdmissionMaterializationId,
  calibrationAdmissionPolicySha256,
  calibrationAdmissionSha256,
  calibrationAdmissionSourceRegisterEntrySha256,
  calibrationAdmissionSourceRegisterSha256,
  expandAdmissionWitnessConstraints,
  type CalibrationAdmissionPolicyV1,
  type CalibrationAdmissionSourceRegisterV1,
  type CalibrationSourceReviewV103,
} from '@usebrick/core';
import {
  publishAdmissionToolInvocationIntent,
  publishAdmissionToolReceipt,
} from '../../src/calibration/v103/admission-publication';

const execFileAsync = promisify(execFile);
const tsx = join(process.cwd(), 'node_modules/.bin/tsx');
const script = join(process.cwd(), 'scripts/cal/v103-admission.ts');
const coreFixture = join(process.cwd(), '..', 'core', 'tests', 'fixtures', 'schema', 'valid');
const sha = (value: string): string => createHash('sha256').update(value).digest('hex');
const repeatSha = (character: string): string => character.repeat(64);

function makeRegister(): CalibrationAdmissionSourceRegisterV1 {
  const repositories = Array.from({ length: 317 }, (_, index) => ({
    sourceId: `preview-repo-${String(index).padStart(3, '0')}`,
    kind: 'material_source' as const,
    materialPartition: 'repository' as const,
    contributesToAdditiveCounts: true,
    childMaterialSourceIds: [],
    registerEvidenceIds: [`preview-evidence-repo-${String(index).padStart(3, '0')}`],
    inventoryCandidateUnits: 1243 + (index < 262 ? 1 : 0),
  }));
  const materials = [
    {
      sourceId: 'preview-ai-slop-baseline',
      kind: 'material_source' as const,
      materialPartition: 'baseline' as const,
      contributesToAdditiveCounts: true,
      childMaterialSourceIds: [],
      registerEvidenceIds: ['preview-evidence-baseline'],
      inventoryCandidateUnits: 58089,
    },
    ...repositories,
    ...Array.from({ length: 10 }, (_, index) => ({
      sourceId: `preview-benchmark-${String(index).padStart(2, '0')}`,
      kind: 'material_source' as const,
      materialPartition: 'non_selected' as const,
      contributesToAdditiveCounts: true,
      childMaterialSourceIds: [],
      registerEvidenceIds: [`preview-evidence-benchmark-${String(index).padStart(2, '0')}`],
      inventoryCandidateUnits: 0,
    })),
  ].sort((left, right) => left.sourceId.localeCompare(right.sourceId));
  const aggregate = {
    sourceId: 'preview-v5-inventory',
    kind: 'aggregate_inventory' as const,
    materialPartition: 'aggregate' as const,
    contributesToAdditiveCounts: false,
    childMaterialSourceIds: materials.filter((entry) => entry.inventoryCandidateUnits > 0).map((entry) => entry.sourceId).sort(),
    registerEvidenceIds: ['preview-evidence-inventory'],
    inventoryCandidateUnits: 452382,
  };
  const entries = [...materials, aggregate].sort((left, right) => left.sourceId.localeCompare(right.sourceId));
  const withoutHash = {
    version: 'v10.3-admission-source-register-v1' as const,
    generation: 0,
    initialSourceIdsSha256: calibrationAdmissionInitialSourceIdsSha256(entries.map((entry) => entry.sourceId)),
    appliedDeltaIds: [],
    rawDiscoveryPopulation: { declaredAi: 635830 as const, declaredHuman: 842520 as const, closedWorld: false as const },
    selectedCoverage: { total: 452382 as const, baselineMaterialUnits: 58089 as const, repositoryMaterialUnits: 394293 as const },
    entries,
  };
  return { ...withoutHash, registerSha256: calibrationAdmissionSourceRegisterSha256(withoutHash) };
}

function makeReviews(register: CalibrationAdmissionSourceRegisterV1): readonly CalibrationSourceReviewV103[] {
  return register.entries.map((entry) => {
    const aggregate = entry.kind === 'aggregate_inventory';
    const materializationWithoutId = {
      kind: 'git' as const,
      repositoryId: entry.sourceId,
      commitSha: sha(`preview-commit-${entry.sourceId}`).slice(0, 40),
    };
    return {
      version: 'v10.3-source-review-v1' as const,
      sourceId: entry.sourceId,
      sourceKind: entry.kind,
      contributesToAdditiveCounts: entry.contributesToAdditiveCounts,
      sourceRegisterEntrySha256: calibrationAdmissionSourceRegisterEntrySha256(entry),
      originEvidenceId: entry.registerEvidenceIds[0]!,
      origin: { kind: 'local_unpublished' as const, localSourceId: entry.sourceId },
      materialization: aggregate
        ? { kind: 'aggregate_only' as const, childMaterialSourceIds: entry.childMaterialSourceIds }
        : { ...materializationWithoutId, materializationId: calibrationAdmissionMaterializationId(entry.sourceId, entry.sourceId, materializationWithoutId) },
      sourceRights: {
        status: 'absent' as const,
        scope: aggregate ? 'dataset' as const : 'code' as const,
        analysisUse: 'unresolved' as const,
        redistribution: 'unresolved' as const,
        thirdPartyChain: 'incomplete' as const,
        evidenceIds: [entry.registerEvidenceIds[0]!],
      },
      inventory: {
        physicalMemberCount: entry.inventoryCandidateUnits,
        candidateCodeUnitCount: entry.inventoryCandidateUnits,
        inventorySha256: sha(`preview-inventory-${entry.sourceId}`),
        closedWorld: false,
      },
      reviewerDecisionIds: [],
      reviewedAt: '2026-07-13T00:00:00.000Z',
      decision: 'source_quarantine' as const,
      reasons: ['review_incomplete', 'source_wide_quarantine'] as const,
    };
  });
}

async function snapshot(root: string): Promise<ReadonlyMap<string, string>> {
  const result = new Map<string, string>();
  const visit = async (directory: string): Promise<void> => {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      const absolute = join(directory, entry.name);
      const relativePath = relative(root, absolute);
      if (entry.isDirectory()) await visit(absolute);
      else if (entry.isFile()) result.set(relativePath, createHash('sha256').update(await readFile(absolute)).digest('hex'));
      else result.set(relativePath, (await lstat(absolute)).mode.toString(8));
    }
  };
  await visit(root);
  return result;
}

async function fixture(): Promise<{
  readonly root: string;
  readonly intentId: string;
  readonly registerPath: string;
  readonly reviewsPath: string;
  readonly cleanup: () => Promise<void>;
}> {
  const root = await mkdtemp(join(tmpdir(), 'slopbrick-census-preview-'));
  const admissionRoot = join(root, 'review', 'admission');
  const toolAuthorityRoot = join(admissionRoot, 'tool-authority');
  await mkdir(admissionRoot, { recursive: true });

  const intentResult = await publishAdmissionToolInvocationIntent({
    toolAuthorityRoot,
    profileId: 'admission-context-v1',
    action: 'evidence:verify',
    canonicalArgvSha256: repeatSha('a'),
    inputSetSha256: repeatSha('b'),
    executableBehaviorSha256: repeatSha('c'),
  });
  const receiptResult = await publishAdmissionToolReceipt({
    toolAuthorityRoot,
    invocationIntentId: intentResult.intent.intentId,
    observedResourceUsage: { heapBytes: 1024, workers: 1 },
    exitCode: 0,
    outputSetSha256: repeatSha('d'),
  });

  const originalBundle = JSON.parse(await readFile(join(coreFixture, 'calibration-admission-evidence-bundle.valid.json'), 'utf8')) as Record<string, unknown>;
  const profiles = await Promise.all(FROZEN_ADMISSION_PROFILE_IDS.map(async (profileId) => JSON.parse(await readFile(join(toolAuthorityRoot, 'profiles', `${profileId}.json`), 'utf8')) as { readonly profileId: string; readonly profileSha256: string }));
  const originalPolicy = originalBundle.policy as Record<string, unknown>;
  const policyBody = {
    ...originalPolicy,
    toolProfileSha256s: profiles.map((profile) => profile.profileSha256).sort(),
  };
  const policy = { ...policyBody, policySha256: calibrationAdmissionPolicySha256(policyBody) };
  const witnessPolicies = (originalBundle.witnessPolicies as readonly Record<string, unknown>[]).map((witness) => {
    const { witnessPolicySha256: _oldWitnessPolicySha256, ...witnessWithoutHash } = witness;
    const witnessBody = {
      ...witnessWithoutHash,
      constraints: expandAdmissionWitnessConstraints(policy as unknown as CalibrationAdmissionPolicyV1, witness.gate as 'smoke' | 'canary'),
      constraintsSha256: '',
    };
    const withConstraintsHash = {
      ...witnessBody,
      constraintsSha256: calibrationAdmissionSha256(witnessBody.constraints),
    };
    return {
      ...withConstraintsHash,
      witnessPolicySha256: calibrationAdmissionSha256(withConstraintsHash),
    };
  });
  const toolAuthoritySnapshotBody = {
    version: 'v10.3-admission-tool-authority-snapshot-v1' as const,
    indexGenerationSha256: receiptResult.toolAuthorityIndexSha256,
    profileIds: profiles.map((profile) => profile.profileId).sort(),
    invocationIntentIds: [intentResult.intent.intentId],
    receiptIds: [receiptResult.receipt.receiptId],
  };
  const evidenceIndexBody = {
    ...(originalBundle.evidenceIndex as Record<string, unknown>),
    items: [],
    indexSha256: '',
  };
  const evidenceIndex = { ...evidenceIndexBody, indexSha256: calibrationAdmissionEvidenceIndexSha256(evidenceIndexBody) };
  const payloadSetBody = {
    ...(originalBundle.evidencePayloadSet as Record<string, unknown>),
    payloads: [],
    payloadSetSha256: '',
  };
  const evidencePayloadSet = { ...payloadSetBody, payloadSetSha256: calibrationAdmissionEvidencePayloadSetSha256(payloadSetBody) };
  const { snapshotSha256: _oldSnapshotSha256, ...acquisitionSnapshotWithoutHash } = originalBundle.acquisitionAuthoritySnapshot as Record<string, unknown>;
  const acquisitionSnapshotBody = {
    ...acquisitionSnapshotWithoutHash,
    artifactKeys: [],
  };
  const bundleBody = {
    ...originalBundle,
    policy,
    witnessPolicies,
    toolProfiles: profiles,
    evidenceIndex,
    evidencePayloadSet,
    approvedEvidenceAcquisitions: [],
    evidenceAcquisitionReceipts: [],
    evidenceAcquisitionEnvelopes: [],
    evidenceReceipts: [],
    materializationReceipts: [],
    acquisitionAuthoritySnapshot: {
      ...acquisitionSnapshotBody,
      snapshotSha256: calibrationAdmissionSha256(acquisitionSnapshotBody),
    },
    invocationIntents: [intentResult.intent],
    toolReceipts: [receiptResult.receipt],
    toolAuthoritySnapshot: {
      ...toolAuthoritySnapshotBody,
      snapshotSha256: calibrationAdmissionSha256(toolAuthoritySnapshotBody),
    },
  };
  const bundle = { ...bundleBody, bundleSha256: calibrationAdmissionEvidenceBundleSha256(bundleBody) };
  await writeFile(join(admissionRoot, 'evidence-bundle.json'), calibrationAdmissionCanonicalJson(bundle));

  const register = makeRegister();
  const reviews = makeReviews(register);
  const registerPath = join(admissionRoot, 'preview-register.json');
  const reviewsPath = join(admissionRoot, 'preview-reviews.json');
  await writeFile(registerPath, calibrationAdmissionCanonicalJson(register));
  await writeFile(reviewsPath, calibrationAdmissionCanonicalJson(reviews));
  return {
    root,
    intentId: intentResult.intent.intentId,
    registerPath: 'review/admission/preview-register.json',
    reviewsPath: 'review/admission/preview-reviews.json',
    cleanup: () => rm(root, { recursive: true, force: true }),
  };
}

function commandArgs(value: Awaited<ReturnType<typeof fixture>>, command = 'census:preview'): string[] {
  return [
    script,
    command,
    '--root', value.root,
    '--tool-profile', 'admission-context-v1',
    '--invocation-intent', value.intentId,
    '--source-register', value.registerPath,
    '--source-reviews', value.reviewsPath,
  ];
}

describe('census:preview CLI boundary', () => {
  it('emits a canonical non-authority preview without persisting output', async () => {
    const value = await fixture();
    try {
      const before = await snapshot(value.root);
      const run = await execFileAsync(tsx, commandArgs(value), { cwd: process.cwd(), maxBuffer: 4 * 1024 * 1024 });
      const parsed = JSON.parse(run.stdout.trim()) as { readonly ok: boolean; readonly command: string; readonly counts: { readonly eligibleUnits: number }; readonly sources: readonly unknown[] };
      expect(parsed).toMatchObject({ ok: true, command: 'census:preview', counts: { eligibleUnits: 0 } });
      expect(parsed.sources).toHaveLength(329);
      expect(run.stdout).toBe(`${calibrationAdmissionCanonicalJson(parsed)}\n`);
      expect(await snapshot(value.root)).toEqual(before);
    } finally {
      await value.cleanup();
    }
  });

  it('fails closed when the evidence selector is missing from the verified bundle', async () => {
    const value = await fixture();
    try {
      const before = await snapshot(value.root);
      const missingIntent = repeatSha('e');
      const failure = await execFileAsync(tsx, [...commandArgs(value), '--invocation-intent', missingIntent], { cwd: process.cwd(), maxBuffer: 4 * 1024 * 1024 }).catch((error: unknown) => error as { readonly code: number; readonly stdout: string });
      expect(failure.code).toBe(2);
      expect(JSON.parse(failure.stdout)).toMatchObject({ ok: false, command: 'census:preview' });
      expect(await snapshot(value.root)).toEqual(before);
    } finally {
      await value.cleanup();
    }
  });

  it('rejects unknown options before touching the root', async () => {
    const value = await fixture();
    try {
      const before = await snapshot(value.root);
      const failure = await execFileAsync(tsx, [...commandArgs(value), '--not-a-census-option'], { cwd: process.cwd(), maxBuffer: 4 * 1024 * 1024 }).catch((error: unknown) => error as { readonly code: number; readonly stdout: string });
      expect(failure.code).toBe(2);
      expect(JSON.parse(failure.stdout)).toMatchObject({ ok: false, command: 'census:preview' });
      expect(await snapshot(value.root)).toEqual(before);
    } finally {
      await value.cleanup();
    }
  });
});
