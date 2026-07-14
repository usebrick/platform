import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import Ajv from 'ajv/dist/2020.js';
import addFormats from 'ajv-formats';
import { describe, expect, it } from 'vitest';
import {
  calibrationAdmissionOverlapCurrentSha256,
  calibrationAdmissionOverlapGenerationArtifactSetSha256,
  calibrationAdmissionOverlapGenerationSha256,
  calibrationAdmissionOverlapPublicationLockSha256,
  calibrationAdmissionOverlapPublicationTransactionSha256,
  isCalibrationAdmissionOverlapCurrentV1,
  isCalibrationAdmissionOverlapGenerationV1,
  isCalibrationAdmissionOverlapPublicationLockV1,
  isCalibrationAdmissionOverlapPublicationTransactionV1,
} from '../src/calibration-admission-overlap-authority';

const root = fileURLToPath(new URL('..', import.meta.url));
const schemaDir = join(root, 'schemas', 'v1');
const fixtureDir = join(root, 'tests', 'fixtures', 'schema');
const A = 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
const B = 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb';

function jsonFixture(name: string): unknown {
  return JSON.parse(readFileSync(join(fixtureDir, name), 'utf8')) as unknown;
}

describe('v10.3 overlap authority schemas', () => {
  it('accepts valid fixtures and rejects empty invalid fixtures under strict AJV', () => {
    const names = [
      'calibration-admission-overlap-generation',
      'calibration-admission-overlap-current',
      'calibration-admission-overlap-publication-lock',
      'calibration-admission-overlap-publication-transaction',
    ] as const;
    const ajv = new Ajv({ allErrors: true, strict: true });
    addFormats(ajv);
    for (const name of [
      ...names,
      'calibration-admission-artifact-receipt',
      'calibration-admission-tool-authority-snapshot',
    ]) ajv.addSchema(JSON.parse(readFileSync(join(schemaDir, `${name}.schema.json`), 'utf8')) as object);
    for (const name of names) {
      const validate = ajv.getSchema(`https://usebrick.dev/schemas/v1/${name}.schema.json`);
      expect(validate, `${name} schema should be registered`).toBeDefined();
      expect(validate!(jsonFixture(`valid/${name}.valid.json`)), `${name} valid fixture`).toBe(true);
      expect(validate!(jsonFixture(`invalid/${name}.invalid.json`)), `${name} invalid fixture`).toBe(false);
    }
  });
});
describe('v10.3 overlap authority semantic contracts', () => {
  it('binds generation, current, lock, and transaction hashes', () => {
    const snapshot = jsonFixture('valid/calibration-admission-tool-authority-snapshot.valid.json') as Record<string, unknown>;
    const artifacts = [{
      pathBase: 'generation_local' as const,
      relativePath: 'postings/0001.jsonl',
      kind: 'shard' as const,
      bytes: 12,
      sha256: A,
    }];
    const generationBase = {
      version: 'v10.3-admission-overlap-generation-v1' as const,
      generation: 0,
      inputGenerationSha256: A,
      universeSha256: B,
      overlapPolicySha256: A,
      artifactSetSha256: calibrationAdmissionOverlapGenerationArtifactSetSha256(artifacts),
      artifacts,
      toolAuthoritySnapshot: snapshot,
    };
    const generation = { ...generationBase, generationSha256: calibrationAdmissionOverlapGenerationSha256(generationBase) };
    const currentBase = {
      version: 'v10.3-admission-overlap-current-v1' as const,
      generation: 0,
      generationSha256: generation.generationSha256,
      generationRelativePath: `review/admission/global/overlap/generations/${generation.generationSha256}`,
    };
    const current = { ...currentBase, currentSha256: calibrationAdmissionOverlapCurrentSha256(currentBase) };
    const lockBase = {
      version: 'v10.3-admission-overlap-publication-lock-v1' as const,
      lockId: A,
      intendedTransactionId: B,
      invocationIntentId: A,
      inputGenerationSha256: B,
      universeSha256: A,
      normalizerRegistrySha256: B,
      overlapPolicySha256: A,
      operation: 'create' as const,
      expectedCurrentState: { kind: 'absent' as const },
      recoveryNonce: B,
    };
    const lock = { ...lockBase, lockSha256: calibrationAdmissionOverlapPublicationLockSha256(lockBase) };
    const transactionBase = {
      version: 'v10.3-admission-overlap-publication-transaction-v1' as const,
      transactionId: B,
      lockSha256: lock.lockSha256,
      invocationIntentId: lock.invocationIntentId,
      inputGenerationSha256: lock.inputGenerationSha256,
      universeSha256: lock.universeSha256,
      normalizerRegistrySha256: lock.normalizerRegistrySha256,
      overlapPolicySha256: lock.overlapPolicySha256,
      operation: lock.operation,
      expectedCurrentState: lock.expectedCurrentState,
      recoveryNonce: lock.recoveryNonce,
      generationStagingRelativePath: 'review/admission/global/overlap/staging/tx-b',
      currentGenerationTemporaryRelativePath: 'review/admission/global/overlap/current-generation.tx-b.tmp.json',
      currentGenerationFinalRelativePath: 'review/admission/global/overlap/current-generation.json' as const,
      state: { phase: 'intent_fsynced' as const },
    };
    const transaction = { ...transactionBase, transactionSha256: calibrationAdmissionOverlapPublicationTransactionSha256(transactionBase) };

    expect(isCalibrationAdmissionOverlapGenerationV1(generation)).toBe(true);
    expect(isCalibrationAdmissionOverlapCurrentV1(current)).toBe(true);
    expect(isCalibrationAdmissionOverlapPublicationLockV1(lock)).toBe(true);
    expect(isCalibrationAdmissionOverlapPublicationTransactionV1(transaction)).toBe(true);

    expect(isCalibrationAdmissionOverlapGenerationV1({ ...generation, generationSha256: B })).toBe(false);
    expect(isCalibrationAdmissionOverlapCurrentV1({ ...current, generationRelativePath: 'generations/other' })).toBe(false);
    expect(isCalibrationAdmissionOverlapPublicationLockV1({ ...lock, lockSha256: B })).toBe(false);
    expect(isCalibrationAdmissionOverlapPublicationTransactionV1({ ...transaction, currentGenerationFinalRelativePath: 'wrong.json' })).toBe(false);
    expect(isCalibrationAdmissionOverlapGenerationV1({
      ...generation,
      artifacts: [{ ...artifacts[0], relativePath: 'shards/0001.jsonl' }],
    })).toBe(false);
  });
});
