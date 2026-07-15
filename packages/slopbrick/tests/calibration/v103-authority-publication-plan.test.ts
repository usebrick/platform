import { describe, expect, it } from 'vitest';
import { createHash } from 'node:crypto';

import {
  calibrationAdmissionAuthorityRebuildLockSha256,
  calibrationAdmissionAuthorityRebuildTransactionSha256,
  isCalibrationAdmissionAuthorityRebuildLockV1,
  isCalibrationAdmissionAuthorityRebuildTransactionV1,
  validateCalibrationAdmissionAuthorityRebuildGraphV1,
} from '@usebrick/core';

import {
  planPrebuiltAdmissionAuthorityPublication,
  type PrebuiltAdmissionAuthorityPublicationPlanInput,
} from '../../src/calibration/v103/admission-authority-publication-plan';

const sha = (letter: string) => createHash('sha256').update(letter).digest('hex');

function source(sourceId: string, generationSha256 = sha('a'), artifactSetSha256 = sha('b')) {
  return { sourceId, generationSha256, artifactSetSha256 };
}

function input(overrides: Partial<PrebuiltAdmissionAuthorityPublicationPlanInput> = {}) {
  return {
    operation: 'create' as const,
    invocationIntentId: sha('i'),
    inputGenerationProposalId: 'input-proposal-genesis',
    inputGenerationProposalSha256: sha('p'),
    expectedCurrentState: { kind: 'absent' as const },
    inputGeneration: {
      generation: 0,
      generationSha256: sha('g'),
    },
    staticGeneration: {
      generation: 0,
      generationSha256: sha('s'),
    },
    sources: [source('source-a')],
    ...overrides,
  } satisfies PrebuiltAdmissionAuthorityPublicationPlanInput;
}

describe('v10.3 prebuilt admission authority publication plan', () => {
  it('plans a deterministic create transaction under the fixed admission topology', () => {
    const first = planPrebuiltAdmissionAuthorityPublication(input());
    const second = planPrebuiltAdmissionAuthorityPublication(input());

    expect(first.ok).toBe(true);
    expect(second).toEqual(first);
    if (!first.ok) return;
    expect(first.lock.operation).toBe('create');
    expect(first.lock.expectedCurrentState).toEqual({ kind: 'absent' });
    expect(first.transaction.inputGenerationRelativePath).toBe(
      `review/admission/authority/input-generations/${sha('g')}/generation.json`,
    );
    expect(first.transaction.staticGenerationStagingRelativePath).toBe(
      `review/admission/authority/staging/${first.transaction.transactionId}`,
    );
    expect(first.transaction.authorityCurrentFinalRelativePath).toBe('review/admission/authority/current.json');
    expect(first.transaction.sourceGenerationDirectories[0]).toMatchObject({
      sourceId: 'source-a',
      generationFinalRelativePath: `review/admission/sources/source-a/generations/${sha('a')}`,
      generationsParentRelativePath: 'review/admission/sources/source-a/generations',
    });
    expect(first.paths.lockRelativePath).toBe('review/admission/authority/rebuild.lock');
    expect(first.paths.transactionRelativePath).toBe('review/admission/authority/rebuild-transaction.json');
  });

  it('requires an explicit prior input-generation descriptor and exact parent SHA for replace', () => {
    const replace = input({
      operation: 'replace',
      expectedCurrentState: { kind: 'existing', staticGenerationSha256: sha('c') },
      inputGeneration: {
        generation: 1,
        generationSha256: sha('g'),
        parentInputGenerationSha256: sha('p'),
      },
      staticGeneration: {
        generation: 1,
        generationSha256: sha('s'),
        parentStaticGenerationSha256: sha('c'),
      },
      priorInputGeneration: { generation: 0, generationSha256: sha('p') },
    });
    const result = planPrebuiltAdmissionAuthorityPublication(replace);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.transaction.expectedCurrentState).toEqual({ kind: 'existing', staticGenerationSha256: sha('c') });
      expect(result.transaction.sourceGenerationDirectories[0]?.priorGenerationRelativePath).toBeUndefined();
    }

    expect(planPrebuiltAdmissionAuthorityPublication({ ...replace, priorInputGeneration: undefined }).ok).toBe(false);
    expect(planPrebuiltAdmissionAuthorityPublication({
      ...replace,
      priorInputGeneration: { generation: 0, generationSha256: sha('x') },
    }).ok).toBe(false);
    expect(planPrebuiltAdmissionAuthorityPublication({
      ...replace,
      inputGeneration: { ...replace.inputGeneration, parentInputGenerationSha256: sha('x') },
    }).ok).toBe(false);
    expect(planPrebuiltAdmissionAuthorityPublication({
      ...replace,
      staticGeneration: { generation: 1, generationSha256: sha('s') },
    }).ok).toBe(false);
  });

  it('rejects duplicate or unsafe source IDs and duplicate materialized paths', () => {
    expect(planPrebuiltAdmissionAuthorityPublication(input({ sources: [source('source-a'), source('source-a')] })).ok).toBe(false);
    expect(planPrebuiltAdmissionAuthorityPublication(input({ sources: [source('../escape')] })).ok).toBe(false);
    expect(planPrebuiltAdmissionAuthorityPublication(input({ sources: [source('Source-A')] })).ok).toBe(false);
    expect(planPrebuiltAdmissionAuthorityPublication(input({ sources: [source('source-a', sha('a'), sha('b')), source('source-b', sha('a'), sha('b'))] })).ok).toBe(true);
    expect(planPrebuiltAdmissionAuthorityPublication(input({
      operation: 'replace',
      expectedCurrentState: { kind: 'existing', staticGenerationSha256: sha('c') },
      inputGeneration: { generation: 1, generationSha256: sha('g'), parentInputGenerationSha256: sha('p') },
      staticGeneration: { generation: 1, generationSha256: sha('s'), parentStaticGenerationSha256: sha('c') },
      priorInputGeneration: { generation: 0, generationSha256: sha('p') },
      sources: [{ ...source('source-a'), priorGenerationSha256: sha('a') }],
    })).ok).toBe(false);
  });

  it('rejects invalid hashes and operation/current-state mismatches', () => {
    expect(planPrebuiltAdmissionAuthorityPublication(input({ invocationIntentId: 'not-a-sha' })).ok).toBe(false);
    expect(planPrebuiltAdmissionAuthorityPublication(input({ inputGeneration: { generation: 0, generationSha256: 'A'.repeat(64) } })).ok).toBe(false);
    expect(planPrebuiltAdmissionAuthorityPublication(input({ operation: 'replace', expectedCurrentState: { kind: 'absent' } })).ok).toBe(false);
    expect(planPrebuiltAdmissionAuthorityPublication(input({ operation: 'create', expectedCurrentState: { kind: 'existing', staticGenerationSha256: sha('c') } })).ok).toBe(false);
  });

  it('emits Core-valid self-hashed lock and transaction joined by their identities', () => {
    const result = planPrebuiltAdmissionAuthorityPublication(input());
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(isCalibrationAdmissionAuthorityRebuildLockV1(result.lock)).toBe(true);
    expect(isCalibrationAdmissionAuthorityRebuildTransactionV1(result.transaction)).toBe(true);
    expect(result.lock.lockSha256).toBe(calibrationAdmissionAuthorityRebuildLockSha256(result.lock));
    expect(result.transaction.transactionSha256).toBe(calibrationAdmissionAuthorityRebuildTransactionSha256(result.transaction));
    expect(validateCalibrationAdmissionAuthorityRebuildGraphV1(result.lock, result.transaction)).toEqual({ ok: true, errors: [] });
  });
});
