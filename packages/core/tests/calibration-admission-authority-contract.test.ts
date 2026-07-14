import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import Ajv from 'ajv/dist/2020.js';

const sha = 'a'.repeat(64);
const root = fileURLToPath(new URL('..', import.meta.url));

const schemaNames = [
  'calibration-admission-tool-authority-index',
  'calibration-admission-tool-authority-snapshot',
  'calibration-tool-authority-publication-lock',
  'calibration-tool-authority-publication-transaction',
  'calibration-nested-publication-handoff',
] as const;

const index = {
  version: 'v10.3-admission-tool-authority-index-v1',
  generation: 0,
  profiles: [{ profileId: 'admission-core-contract-v1', relativePath: 'profiles/admission-core-contract-v1.json', sha256: sha }],
  invocationIntents: [],
  receipts: [],
  indexSha256: sha,
};

const snapshot = {
  version: 'v10.3-admission-tool-authority-snapshot-v1',
  indexGenerationSha256: sha,
  profileIds: ['admission-core-contract-v1'],
  invocationIntentIds: [],
  receiptIds: [],
  snapshotSha256: sha,
};

const lock = {
  version: 'v10.3-tool-authority-publication-lock-v1',
  lockId: sha,
  intendedTransactionId: sha,
  operation: 'create',
  expectedCurrentState: { kind: 'absent' },
  nextIndexSha256: sha,
  artifactSetSha256: sha,
  recoveryNonce: sha,
  lockSha256: sha,
};

const transaction = {
  version: 'v10.3-tool-authority-publication-transaction-v1',
  transactionId: sha,
  lockSha256: sha,
  operation: 'create',
  expectedCurrentState: { kind: 'absent' },
  nextIndexSha256: sha,
  artifacts: [{ stagedRelativePath: 'transactions/staged/profile.json', finalRelativePath: 'profiles/profile.json', bytes: 1, sha256: sha }],
  immutableIndexGenerationRelativePath: 'index-generations/00000000.json',
  nextIndexTemporaryRelativePath: 'index.json.tmp',
  state: { phase: 'intent_fsynced' },
  transactionSha256: sha,
};

const infrastructureHandoff = {
  version: 'v10.3-nested-publication-handoff-v1',
  parentTransactionId: sha,
  childSlot: 'intent-authority',
  expectedCurrentStateSha256: sha,
  childLockId: sha,
  childLockSha256: sha,
  childTransactionId: sha,
  childTransactionIntentSha256: sha,
  childRecoveryNonce: sha,
  state: { phase: 'started_fsynced' },
  childKind: 'tool_authority_infrastructure',
  childAction: 'tool-authority:publish',
  toolAuthorityObjectSetSha256: sha,
  handoffSha256: sha,
};

const profiledHandoff = {
  ...infrastructureHandoff,
  childSlot: 'output',
  childKind: 'profiled_publication',
  childAction: 'acquisition:publish',
  childProfileId: 'admission-acquisition-publication-v1',
  childInvocationIntentId: sha,
  childInvocationIntentRelativePath: 'invocation-intents/output.json',
  childInvocationIntentSha256: sha,
  childInvocationIntentAuthorityHandoffSha256: sha,
  childInvocationIntentAuthorityIndexSha256: sha,
};
delete (profiledHandoff as { toolAuthorityObjectSetSha256?: string }).toolAuthorityObjectSetSha256;

describe('v10.3 tool-authority and nested-publication Core schemas', () => {
  function validators() {
    const ajv = new Ajv({ allErrors: true, strict: true });
    return new Map(schemaNames.map((name) => [
      name,
      ajv.compile(JSON.parse(readFileSync(join(root, 'schemas', 'v1', `${name}.schema.json`), 'utf8')) as object),
    ]));
  }

  it('compiles all five strict schemas and accepts the contract examples', () => {
    const compiled = validators();
    expect(compiled.get(schemaNames[0])!(index)).toBe(true);
    expect(compiled.get(schemaNames[1])!(snapshot)).toBe(true);
    expect(compiled.get(schemaNames[2])!(lock)).toBe(true);
    expect(compiled.get(schemaNames[3])!(transaction)).toBe(true);
    expect(compiled.get(schemaNames[4])!(infrastructureHandoff)).toBe(true);
    expect(compiled.get(schemaNames[4])!(profiledHandoff)).toBe(true);
  });

  it('rejects unknown properties, malformed hashes, unsafe paths, and incomplete child branches', () => {
    const compiled = validators();

    expect(compiled.get(schemaNames[0])!({ ...index, extra: true })).toBe(false);
    expect(compiled.get(schemaNames[1])!({ ...snapshot, snapshotSha256: 'A'.repeat(64) })).toBe(false);
    expect(compiled.get(schemaNames[2])!({ ...lock, expectedCurrentState: { kind: 'absent', extra: true } })).toBe(false);
    expect(compiled.get(schemaNames[3])!({ ...transaction, artifacts: [{ ...transaction.artifacts[0], finalRelativePath: '../escape' }] })).toBe(false);
    expect(compiled.get(schemaNames[4])!({ ...profiledHandoff, childInvocationIntentSha256: undefined })).toBe(false);
    expect(compiled.get(schemaNames[4])!({ ...infrastructureHandoff, childProfileId: 'admission-context-v1' })).toBe(false);
  });
});
