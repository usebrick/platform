import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import Ajv from 'ajv/dist/2020.js';
import { describe, expect, it } from 'vitest';
import {
  calibrationAdmissionAuthorityRebuildLockSha256,
  calibrationAdmissionAuthorityRebuildTransactionSha256,
  isCalibrationAdmissionAuthorityRebuildLockV1,
  isCalibrationAdmissionAuthorityRebuildTransactionV1,
  validateCalibrationAdmissionAuthorityRebuildGraphV1,
} from '../src/index';

const root = fileURLToPath(new URL('..', import.meta.url));
const schemaDir = join(root, 'schemas', 'v1');
const fixtureDir = join(root, 'tests', 'fixtures', 'schema');
const A = 'a'.repeat(64);
const B = 'b'.repeat(64);
const C = 'c'.repeat(64);

function source(sourceId: string, generationSha256: string, artifactSetSha256: string) {
  return {
    sourceId,
    generationSha256,
    artifactSetSha256,
    generationStagingRelativePath: `review/admission/sources/${sourceId}/staging/tx-1`,
    generationFinalRelativePath: `review/admission/sources/${sourceId}/generations/${generationSha256}`,
    generationsParentRelativePath: `review/admission/sources/${sourceId}/generations`,
    currentPointerTemporaryRelativePath: `review/admission/sources/${sourceId}/current.tx-1.tmp.json`,
    currentPointerFinalRelativePath: `review/admission/sources/${sourceId}/current.json`,
  };
}

function lockBody(overrides: Record<string, unknown> = {}) {
  return {
    version: 'v10.3-admission-authority-rebuild-lock-v1',
    lockId: 'lock-1',
    intendedTransactionId: 'transaction-1',
    invocationIntentId: A,
    inputGenerationProposalId: 'proposal-1',
    inputGenerationProposalSha256: B,
    operation: 'create',
    expectedCurrentState: { kind: 'absent' },
    recoveryNonce: C,
    ...overrides,
  };
}

function transactionBody(lock: Record<string, unknown>, overrides: Record<string, unknown> = {}) {
  return {
    version: 'v10.3-admission-authority-rebuild-transaction-v1',
    transactionId: lock.intendedTransactionId,
    lockSha256: lock.lockSha256,
    invocationIntentId: lock.invocationIntentId,
    inputGenerationProposalId: lock.inputGenerationProposalId,
    inputGenerationProposalSha256: lock.inputGenerationProposalSha256,
    operation: lock.operation,
    expectedCurrentState: lock.expectedCurrentState,
    recoveryNonce: lock.recoveryNonce,
    inputGenerationRelativePath: 'review/admission/input/generations/input-1.json',
    staticGenerationStagingRelativePath: 'review/admission/authority/staging/transaction-1',
    authorityCurrentTemporaryRelativePath: 'review/admission/authority/current.transaction-1.tmp.json',
    authorityCurrentFinalRelativePath: 'review/admission/authority/current.json',
    sourceGenerationDirectories: [source('source-a', A, B), source('source-b', B, C)],
    state: { phase: 'intent_fsynced' },
    ...overrides,
  };
}

function graph() {
  const lockWithoutHash = lockBody();
  const lock = { ...lockWithoutHash, lockSha256: calibrationAdmissionAuthorityRebuildLockSha256(lockWithoutHash) };
  const transactionWithoutHash = transactionBody(lock);
  const transaction = {
    ...transactionWithoutHash,
    transactionSha256: calibrationAdmissionAuthorityRebuildTransactionSha256(transactionWithoutHash),
  };
  return { lock, transaction };
}

describe('v10.3 authority rebuild Core contracts', () => {
  it('accepts self-hashed lock and transaction and binds their handoff', () => {
    const { lock, transaction } = graph();
    expect(isCalibrationAdmissionAuthorityRebuildLockV1(lock)).toBe(true);
    expect(isCalibrationAdmissionAuthorityRebuildTransactionV1(transaction)).toBe(true);
    expect(validateCalibrationAdmissionAuthorityRebuildGraphV1(lock, transaction)).toEqual({ ok: true, errors: [] });
  });

  it('rejects malformed tags, extra keys, unsafe paths, ordering errors, and hash mutations', () => {
    const { lock, transaction } = graph();
    expect(isCalibrationAdmissionAuthorityRebuildLockV1({ ...lock, operation: 'merge' })).toBe(false);
    expect(isCalibrationAdmissionAuthorityRebuildLockV1({ ...lock, extra: true })).toBe(false);
    expect(isCalibrationAdmissionAuthorityRebuildTransactionV1({ ...transaction, authorityCurrentFinalRelativePath: 'wrong.json' })).toBe(false);
    expect(isCalibrationAdmissionAuthorityRebuildTransactionV1({
      ...transaction,
      inputGenerationRelativePath: '../escape',
      transactionSha256: calibrationAdmissionAuthorityRebuildTransactionSha256({ ...transaction, inputGenerationRelativePath: '../escape' }),
    })).toBe(false);
    expect(isCalibrationAdmissionAuthorityRebuildTransactionV1({
      ...transaction,
      sourceGenerationDirectories: [...transaction.sourceGenerationDirectories].reverse(),
      transactionSha256: calibrationAdmissionAuthorityRebuildTransactionSha256({
        ...transaction,
        sourceGenerationDirectories: [...transaction.sourceGenerationDirectories].reverse(),
      }),
    })).toBe(false);
    expect(isCalibrationAdmissionAuthorityRebuildTransactionV1({ ...transaction, transactionSha256: A })).toBe(false);
    expect(isCalibrationAdmissionAuthorityRebuildLockV1({ ...lock, lockSha256: A })).toBe(false);
  });

  it('rejects duplicate source IDs and every tagged state with missing or extra fields', () => {
    const { lock, transaction } = graph();
    const duplicateSources = [transaction.sourceGenerationDirectories[0], transaction.sourceGenerationDirectories[0]];
    const duplicateBody = { ...transaction, sourceGenerationDirectories: duplicateSources };
    expect(isCalibrationAdmissionAuthorityRebuildTransactionV1({
      ...duplicateBody,
      transactionSha256: calibrationAdmissionAuthorityRebuildTransactionSha256(duplicateBody),
    })).toBe(false);
    expect(isCalibrationAdmissionAuthorityRebuildTransactionV1({
      ...transaction,
      state: { phase: 'primary_static_outputs_fsynced', inputGenerationSha256: A },
      transactionSha256: calibrationAdmissionAuthorityRebuildTransactionSha256({
        ...transaction,
        state: { phase: 'primary_static_outputs_fsynced', inputGenerationSha256: A },
      }),
    })).toBe(false);
    expect(isCalibrationAdmissionAuthorityRebuildTransactionV1({
      ...transaction,
      state: { phase: 'intent_fsynced', extra: true },
      transactionSha256: calibrationAdmissionAuthorityRebuildTransactionSha256({
        ...transaction,
        state: { phase: 'intent_fsynced', extra: true },
      }),
    })).toBe(false);
    expect(isCalibrationAdmissionAuthorityRebuildTransactionV1({
      ...transaction,
      state: { phase: 'unknown_phase' },
      transactionSha256: calibrationAdmissionAuthorityRebuildTransactionSha256({
        ...transaction,
        state: { phase: 'unknown_phase' },
      }),
    })).toBe(false);
    expect(validateCalibrationAdmissionAuthorityRebuildGraphV1(lock, { ...transaction, recoveryNonce: A })).toEqual(expect.objectContaining({ ok: false }));
    const mismatchedIdBody = { ...transaction, transactionId: 'transaction-other' };
    expect(validateCalibrationAdmissionAuthorityRebuildGraphV1(lock, {
      ...mismatchedIdBody,
      transactionSha256: calibrationAdmissionAuthorityRebuildTransactionSha256(mismatchedIdBody),
    })).toEqual(expect.objectContaining({ ok: false }));
  });

  it('rejects self-hashed path aliases and transaction-wide collisions', () => {
    const { transaction } = graph();
    const rehashed = (overrides: Record<string, unknown>) => {
      const body = { ...transaction, ...overrides };
      return { ...body, transactionSha256: calibrationAdmissionAuthorityRebuildTransactionSha256(body) };
    };
    const first = transaction.sourceGenerationDirectories[0]!;
    const second = transaction.sourceGenerationDirectories[1]!;

    expect(isCalibrationAdmissionAuthorityRebuildTransactionV1(rehashed({
      sourceGenerationDirectories: [
        { ...first, generationStagingRelativePath: first.generationFinalRelativePath },
        second,
      ],
    }))).toBe(false);
    expect(isCalibrationAdmissionAuthorityRebuildTransactionV1(rehashed({
      sourceGenerationDirectories: [
        { ...first, currentPointerTemporaryRelativePath: first.currentPointerFinalRelativePath },
        second,
      ],
    }))).toBe(false);
    expect(isCalibrationAdmissionAuthorityRebuildTransactionV1(rehashed({
      sourceGenerationDirectories: [
        { ...first, priorGenerationRelativePath: first.generationFinalRelativePath },
        second,
      ],
    }))).toBe(false);
    expect(isCalibrationAdmissionAuthorityRebuildTransactionV1(rehashed({
      sourceGenerationDirectories: [
        first,
        { ...second, generationStagingRelativePath: first.generationFinalRelativePath },
      ],
    }))).toBe(false);
    expect(isCalibrationAdmissionAuthorityRebuildTransactionV1(rehashed({
      inputGenerationRelativePath: first.currentPointerFinalRelativePath,
    }))).toBe(false);
    const completeState = {
      phase: 'complete',
      inputGenerationSha256: A,
      overlapGenerationSha256: B,
      primaryOutputSetSha256: C,
      toolReceiptId: 'receipt-1',
      toolReceiptSha256: A,
      toolAuthorityIndexSha256: B,
      staticGenerationSha256: C,
      staticGenerationRelativePath: 'review/admission/authority/static-generations/c',
    };
    expect(isCalibrationAdmissionAuthorityRebuildTransactionV1(rehashed({
      state: { ...completeState, staticGenerationRelativePath: first.currentPointerFinalRelativePath },
    }))).toBe(false);
  });

  it('fails closed when the graph wrapper is a hostile proxy', () => {
    const hostile = new Proxy({}, {
      has() { throw new Error('hostile has trap'); },
      get() { throw new Error('hostile get trap'); },
    });
    expect(() => validateCalibrationAdmissionAuthorityRebuildGraphV1(hostile)).not.toThrow();
    expect(validateCalibrationAdmissionAuthorityRebuildGraphV1(hostile)).toEqual({
      ok: false,
      errors: ['authority rebuild graph validation failed closed'],
    });
  });

  it('compiles strict schemas and validates the fixture pair', () => {
    const ajv = new Ajv({ allErrors: true, strict: true });
    const names = ['calibration-admission-authority-rebuild-lock', 'calibration-admission-authority-rebuild-transaction'] as const;
    for (const name of names) ajv.addSchema(JSON.parse(readFileSync(join(schemaDir, `${name}.schema.json`), 'utf8')) as object);
    for (const name of names) {
      const validate = ajv.getSchema(`https://usebrick.dev/schemas/v1/${name}.schema.json`);
      expect(validate).toBeDefined();
      expect(validate!(JSON.parse(readFileSync(join(fixtureDir, 'valid', `${name}.valid.json`), 'utf8')))).toBe(true);
      expect(validate!(JSON.parse(readFileSync(join(fixtureDir, 'invalid', `${name}.invalid.json`), 'utf8')))).toBe(false);
    }
  });
});
