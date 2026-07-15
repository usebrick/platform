import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import Ajv from 'ajv/dist/2020.js';
import { describe, expect, it } from 'vitest';

import {
  buildCalibrationNestedPublicationHandoffV1,
  calibrationAdmissionWitnessPublicationCompletionSha256,
  calibrationAdmissionWitnessPublicationLockSha256,
  calibrationAdmissionWitnessPublicationTransactionSha256,
  calibrationAdmissionWitnessRoutingReferenceSha256,
  validateCalibrationAdmissionWitnessPublicationGraph,
  validateCalibrationAdmissionWitnessPublicationTransactionV1,
} from '../src/index';

const schemaDir = fileURLToPath(new URL('../schemas/v1', import.meta.url));
const hash = (character: string): string => character.repeat(64);

function handoff() {
  return buildCalibrationNestedPublicationHandoffV1({
    parentTransactionId: hash('1'),
    parentRecoveryNonce: hash('2'),
    childSlot: 'witness-publication',
    expectedCurrentStateSha256: hash('3'),
    childLockId: hash('4'),
    childLockSha256: hash('5'),
    childTransactionId: hash('6'),
    childTransactionIntentSha256: hash('7'),
    state: { phase: 'started_fsynced' },
    childKind: 'tool_authority_infrastructure',
    childAction: 'tool-authority:publish',
    toolAuthorityObjectSetSha256: hash('8'),
  });
}

function contracts() {
  const routingBody = {
    version: 'v10.3-admission-witness-routing-reference-v1' as const,
    gate: 'smoke' as const,
    kind: 'search_result' as const,
    bundleRelativePath: 'witnesses/smoke/search.json',
    bundleSha256: hash('a'),
    publicationCompletionRelativePath: 'witnesses/smoke/completion.json',
    publicationCompletionSha256: hash('b'),
  };
  const routing = {
    ...routingBody,
    referenceSha256: calibrationAdmissionWitnessRoutingReferenceSha256(routingBody),
  };
  const lockBody = {
    version: 'v10.3-admission-witness-publication-lock-v1' as const,
    lockId: hash('c'),
    intendedTransactionId: hash('d'),
    operation: 'search_result' as const,
    gate: 'smoke' as const,
    invocationIntentId: hash('e'),
    bundleSha256: routing.bundleSha256,
    bundleRelativePath: routing.bundleRelativePath,
    expectedRoutingReferenceState: { kind: 'absent' as const },
    recoveryNonce: hash('f'),
  };
  const lock = {
    ...lockBody,
    lockSha256: calibrationAdmissionWitnessPublicationLockSha256(lockBody),
  };
  const transactionBody = {
    version: 'v10.3-admission-witness-publication-transaction-v1' as const,
    transactionId: lock.intendedTransactionId,
    lockSha256: lock.lockSha256,
    operation: lock.operation,
    gate: lock.gate,
    invocationIntentId: lock.invocationIntentId,
    bundleSha256: lock.bundleSha256,
    bundleBytes: 42,
    expectedRoutingReferenceState: lock.expectedRoutingReferenceState,
    bundleTemporaryRelativePath: 'witnesses/smoke/.tmp/search.json',
    bundleFinalRelativePath: lock.bundleRelativePath,
    completionTemporaryRelativePath: 'witnesses/smoke/.tmp/completion.json',
    routingReferenceTemporaryRelativePath: 'witnesses/smoke/.tmp/reference.json',
    routingReferenceFinalRelativePath: 'witnesses/smoke/search-reference.json',
    recoveryNonce: lock.recoveryNonce,
    state: { phase: 'intent_fsynced' as const },
  };
  const transaction = {
    ...transactionBody,
    transactionSha256: calibrationAdmissionWitnessPublicationTransactionSha256(transactionBody),
  };
  const completionBody = {
    version: 'v10.3-admission-witness-publication-completion-v1' as const,
    gate: 'smoke' as const,
    kind: 'search_result' as const,
    parentTransactionId: transaction.transactionId,
    invocationIntentId: transaction.invocationIntentId,
    bundleRelativePath: transaction.bundleFinalRelativePath,
    bundleSha256: transaction.bundleSha256,
    namedPrimaryOutputProjectionSha256: hash('9'),
    requiredToolReceiptIds: [hash('0')],
    requiredToolReceiptSha256s: [hash('1')],
    publicationToolReceiptId: hash('2'),
    publicationToolReceiptSha256: hash('3'),
    toolAuthorityIndexSha256: hash('4'),
    nestedHandoff: handoff(),
  };
  const completion = {
    ...completionBody,
    completionSha256: calibrationAdmissionWitnessPublicationCompletionSha256(completionBody),
  };
  return { routing, lock, transaction, completion };
}

describe('v10.3 witness publication Core contracts', () => {
  it('validates the lock/transaction graph and rejects a rebinding', () => {
    const value = contracts();
    expect(validateCalibrationAdmissionWitnessPublicationGraph(value)).toEqual({ ok: true, errors: [] });

    const reboundBody = { ...value.transaction, transactionId: hash('0') };
    const rebound = {
      ...reboundBody,
      transactionSha256: calibrationAdmissionWitnessPublicationTransactionSha256(reboundBody),
    };
    const validation = validateCalibrationAdmissionWitnessPublicationGraph({ lock: value.lock, transaction: rebound });
    expect(validation.ok).toBe(false);
    expect(validation.errors.join(' ')).toContain('intendedTransactionId');
  });

  it('rejects a transaction self-hash mutation', () => {
    const value = contracts();
    expect(validateCalibrationAdmissionWitnessPublicationTransactionV1({
      ...value.transaction,
      bundleBytes: value.transaction.bundleBytes + 1,
    }).ok).toBe(false);
  });

  it('compiles all four schemas under strict AJV and accepts the contract fixtures', () => {
    const value = contracts();
    const ajv = new Ajv({ allErrors: true, strict: true });
    const allSchemas = readdirSync(schemaDir)
      .filter((file) => file.endsWith('.schema.json'))
      .map((file) => JSON.parse(readFileSync(join(schemaDir, file), 'utf8')) as { $id: string });
    for (const schema of allSchemas) ajv.addSchema(schema);
    const schemas = allSchemas.filter((schema) => schema.$id.includes('calibration-admission-witness-'));
    const byTitle = new Map(schemas.map((schema) => [schema.$id.split('/').at(-1)!, schema.$id]));
    const fixtures: Record<string, unknown> = {
      'calibration-admission-witness-routing-reference.schema.json': value.routing,
      'calibration-admission-witness-publication-completion.schema.json': value.completion,
      'calibration-admission-witness-publication-lock.schema.json': value.lock,
      'calibration-admission-witness-publication-transaction.schema.json': value.transaction,
    };
    for (const [file, fixture] of Object.entries(fixtures)) {
      const id = byTitle.get(file);
      expect(id).toBeDefined();
      const validate = ajv.getSchema(id!);
      expect(validate).toBeDefined();
      expect(validate!(fixture), JSON.stringify(validate!.errors)).toBe(true);
      expect(validate!({})).toBe(false);
    }
  });
});
