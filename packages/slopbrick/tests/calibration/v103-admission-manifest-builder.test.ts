import { describe, expect, it, vi } from 'vitest';

import {
  calibrationAdmissionBindingSha256,
  calibrationAdmissionCanonicalJson,
  calibrationAdmissionSha256,
  calibrationCorpusSourceId,
} from '@usebrick/core';

const H = 'a'.repeat(64);
const SHA = (value: string): string => calibrationAdmissionSha256(value);

const context = {
  contextSha256: H,
  durable: {
    sourceReviews: [{
      sourceId: 'source-git',
      decision: 'candidate',
      reviewedAt: '2026-07-17T00:00:00.000Z',
      origin: { kind: 'https', url: 'https://example.test/source-git' },
      materialization: {
        kind: 'git',
        materializationId: 'materialization-git',
        repositoryId: 'repo-git',
        commitSha: 'c'.repeat(40),
      },
      sourceRights: {
        status: 'reviewed',
        spdx: 'MIT',
        scope: 'code',
        analysisUse: 'approved',
        redistribution: 'approved',
        thirdPartyChain: 'complete',
        evidenceIds: ['rights-git'],
      },
    }],
    evidenceIndex: {
      items: [{ evidenceId: 'auth-git', kind: 'authorship_attestation', locator: { kind: 'immutable_https', url: 'https://example.test/evidence/auth-git', immutability: 'commit_pinned_git_blob' } }],
    },
    materializationReceipts: [{
      materializationId: 'materialization-git',
      sourceId: 'source-git',
      repositoryId: 'repo-git',
      payload: { kind: 'git', originUrl: 'https://example.test/source-git', commitSha: 'c'.repeat(40), treeSha: SHA('tree'), inventorySha256: SHA('inventory') },
    }],
    lineageLedger: {
      results: [{ recordId: '1'.repeat(64), contentSha256: SHA('app'), familyId: 'family-git', pairGroupId: null, split: 'train', exactClusterId: 'cluster-git', nearClusterId: 'near-git' }],
    },
  },
} as never;

const record = {
  version: 'v10.3-admission-record-v1',
  recordId: '1'.repeat(64),
  materialSourceId: 'source-git',
  aggregateSourceIds: [],
  sourceReviewSha256: SHA('source-review'),
  logicalUnitId: 'unit-git',
  locator: { kind: 'git_file', materializationId: 'materialization-git', normalizedPath: 'src/App.tsx' },
  contentSha256: SHA('app'),
  contentBytes: 42,
  language: 'typescript',
  stratum: 'production',
  proposedLabel: 'verified_ai',
  authorship: {
    kind: 'repository_attestation',
    evidenceIds: ['auth-git'],
    scope: 'file',
    generatorFamily: 'fixture',
    humanEditStatus: 'unknown',
  },
  claimedLineage: {
    familyId: 'family-git',
    originRecordId: '1'.repeat(64),
    exactClusterId: 'cluster-git',
    nearClusterId: 'near-git',
  },
  claimedAudits: {
    syntax: 'pass',
    scaffoldByteShare: 0,
    privacy: 'pass',
    secrets: 'pass',
    exactOverlap: 'pass',
    nearOverlap: 'pass',
    familyLeakage: 'pass',
    pairIntegrity: 'not_applicable',
  },
  reviewerDecisionIds: ['decision-git'],
  declaredDisposition: 'eligible_gold',
  rejectionReasons: [],
} as never;

const witness = {
  version: 'v10.3-admission-cohort-witness-v1',
  gate: 'smoke',
  units: [{
    recordId: record.recordId,
    contentClusterId: 'cluster-git',
    label: 'verified_ai',
    language: 'typescript',
    materialSourceId: 'source-git',
    repositoryId: 'repo-git',
    familyId: 'family-git',
    split: 'train',
    selectionKey: 'verified_ai|000000',
  }],
  witnessSha256: SHA('witness'),
};

const reviewBundle = {
  gate: 'smoke',
  bundleSha256: SHA('witness-review'),
  searchResultBundle: {
    bundleSha256: SHA('search-result'),
    result: { kind: 'witness', witness },
    searchReceipt: { receiptId: SHA('search-receipt') },
    toolReceipts: [{ receiptId: SHA('search-tool') }],
  },
  reviewerDecisions: [{ reviewerId: 'reviewer-a', decidedAt: '2026-07-17T00:00:00.000Z' }, { reviewerId: 'reviewer-b', decidedAt: '2026-07-17T00:00:00.000Z' }],
  regenerations: [{ toolReceipt: { receiptId: SHA('regen-a') } }, { toolReceipt: { receiptId: SHA('regen-b') } }],
  constraintCheck: { toolReceipt: { receiptId: SHA('constraint') } },
  blindReviewReceipt: { receiptId: SHA('blind') },
  witnessReviewReceipt: {
    receiptId: SHA('review-receipt'),
    decision: 'approved',
    witnessSha256: SHA('witness'),
  },
};

const ready = {
  __ready: true,
  gate: 'smoke',
  context,
  census: {
    censusSha256: SHA('census'),
    eligibilitySnapshotSha256: SHA('eligibility'),
    verifiedContextSha256: H,
    admissionRecordsSha256: SHA('records'),
    sourceReviewSetSha256: SHA('source-review-set'),
    evidenceIndexSha256: SHA('evidence-index'),
    evidencePayloadSetSha256: SHA('evidence-payload'),
    evidenceReceiptSetSha256: SHA('evidence-receipts'),
    toolProfileSetSha256: SHA('tool-profiles'),
    toolReceiptSetSha256: SHA('tool-receipts'),
    blindReviewReceiptSetSha256: SHA('blind-receipts'),
    temporalAttestationSetSha256: SHA('temporal'),
    materializationReceiptSetSha256: SHA('materialization'),
  },
  witnessReviewBundle: reviewBundle,
  searchPublicationAuthority: { publication: { completion: { completionSha256: SHA('search-completion') } } },
  witnessReviewPublicationAuthority: { publication: { completion: { completionSha256: SHA('review-completion') } } },
} as never;

const prerequisites = {
  __prerequisites: true,
  bundle: {
    bundleSha256: SHA('prerequisites'),
    manifestBuilder: { behaviorSha256: SHA('builder'), artifactId: 'builder' },
    packedRuntimes: [{ nodeMajor: 22, receiptArtifactId: 'runtime-22' }, { nodeMajor: 24, receiptArtifactId: 'runtime-24' }],
    referencedArtifacts: [
      { artifactId: 'runtime-22', kind: 'packed_runtime_receipt', sha256: SHA('runtime-22') },
      { artifactId: 'runtime-24', kind: 'packed_runtime_receipt', sha256: SHA('runtime-24') },
    ],
  },
} as never;

vi.mock('../../src/calibration/v103/admission-ready-census', () => ({
  isVerifiedReadyAdmissionCensus: (value: unknown): boolean => typeof value === 'object' && value !== null && (value as { readonly __ready?: boolean }).__ready === true,
}));
vi.mock('../../src/calibration/v103/admission-manifest-prerequisites', () => ({
  isVerifiedAdmissionManifestPrerequisites: (value: unknown): boolean => typeof value === 'object' && value !== null && (value as { readonly __prerequisites?: boolean }).__prerequisites === true,
}));
vi.mock('../../src/calibration/v103/admission-context', () => ({
  isVerifiedAdmissionContext: (value: unknown): boolean => value === context,
  listVerifiedAdmissionRecords: () => [{ record, canonicalJson: calibrationAdmissionCanonicalJson(record), canonicalSha256: SHA('record') }],
  deriveAdmissionDisposition: () => ({ disposition: 'eligible_gold', reasons: [] }),
}));

import { buildCorpusManifestFromAdmission } from '../../src/calibration/v103/admission-manifest-builder';

describe('v10.3 pure admission manifest builder', () => {
  it('derives one deterministic v10.3.2 manifest from branded ready inputs', () => {
    const first = buildCorpusManifestFromAdmission({ ready, prerequisites });
    const second = buildCorpusManifestFromAdmission({ ready, prerequisites });
    expect(first).toEqual(second);
    expect(first.methodVersion).toBe('v10.3.2');
    expect(first.repositories).toHaveLength(1);
    expect(first.files).toHaveLength(1);
    expect(first.files[0]).toMatchObject({
      sourceId: calibrationCorpusSourceId('repo-git', 'c'.repeat(40), 'src/App.tsx'),
      repositoryId: 'repo-git',
      familyId: 'family-git',
      label: 'verified_ai',
      tier: 'gold',
      split: 'train',
      admissionRecordId: record.recordId,
      materializationId: 'materialization-git',
    });
    expect(first.admissionBinding?.manifestBuilderBehaviorSha256).toBe(SHA('builder'));
    expect(first.admissionBinding?.bindingSha256).toBe(calibrationAdmissionBindingSha256({ ...first.admissionBinding, bindingSha256: undefined }));
  });

  it('rejects a forged ready or prerequisite object before output', () => {
    expect(() => buildCorpusManifestFromAdmission({ ready: JSON.parse(JSON.stringify(ready)), prerequisites })).toThrow(/verified ready/i);
    expect(() => buildCorpusManifestFromAdmission({ ready, prerequisites: { ...JSON.parse(JSON.stringify(prerequisites)), __prerequisites: false } })).toThrow(/verified prerequisite/i);
  });

  it('rejects a witness unit whose repository projection is mutated', () => {
    const mutatedReady = {
      ...ready,
      witnessReviewBundle: {
        ...reviewBundle,
        searchResultBundle: {
          ...reviewBundle.searchResultBundle,
          result: {
            kind: 'witness',
            witness: { ...witness, units: [{ ...witness.units[0], repositoryId: 'other-repository' }] },
          },
        },
      },
    } as never;
    expect(() => buildCorpusManifestFromAdmission({ ready: mutatedReady, prerequisites })).toThrow(/repository/i);
  });
});
