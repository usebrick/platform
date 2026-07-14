import { describe, expect, it } from 'vitest';

import {
  FROZEN_ADMISSION_PROFILE_IDS,
  calibrationAdmissionSha256,
  isCalibrationAdmissionToolAuthoritySnapshotV1,
} from '../src/calibration-admission-evidence';
import { calibrationAdmissionMaterializationId } from '../src/calibration-admission-review';
import {
  CALIBRATION_ACQUISITION_ROUND_MAX_BYTES,
  calibrationAcquisitionReceiptId,
  calibrationAcquisitionReceiptSha256,
  calibrationAcquisitionRoundAuthorizationId,
  calibrationAcquisitionRoundAuthorizationSha256,
  calibrationAcquisitionRoundLockId,
  calibrationAcquisitionRoundLockSha256,
  calibrationAcquisitionRoundReceiptId,
  calibrationAcquisitionRoundReceiptSha256,
  calibrationAcquisitionRoundTransactionId,
  calibrationAcquisitionRoundTransactionSha256,
  calibrationApprovedAcquisitionAuthorizationId,
  calibrationApprovedAcquisitionAuthorizationSha256,
  isCalibrationAcquisitionReceiptV1,
  isCalibrationAcquisitionRoundAuthorizationV1,
  isCalibrationAcquisitionRoundLockV1,
  isCalibrationAcquisitionRoundReceiptV1,
  isCalibrationAcquisitionRoundTransactionV1,
  isCalibrationApprovedAcquisitionV1,
  validateCalibrationAcquisitionRoundGraph,
} from '../src/calibration-admission-acquisition-round';

const sha = (value: unknown): string => calibrationAdmissionSha256(value);
const hex = (character: string): string => character.repeat(64);
const commit = (character: string): string => character.repeat(40);

function snapshot(
  invocationIntentIds: readonly string[] = [hex('2'), hex('3')],
  receiptIds: readonly string[] = [hex('4'), hex('e')],
): Record<string, unknown> {
  const body = {
    version: 'v10.3-admission-tool-authority-snapshot-v1',
    indexGenerationSha256: hex('1'),
    profileIds: [...FROZEN_ADMISSION_PROFILE_IDS].sort(),
    invocationIntentIds: [...invocationIntentIds].sort(),
    receiptIds: [...receiptIds].sort(),
    snapshotSha256: '',
  };
  const { snapshotSha256: _ignored, ...snapshotBody } = body;
  return { ...body, snapshotSha256: sha(snapshotBody) };
}

function sourceAuthorization(sourceId = 'repo-a', commitCharacter = 'a'): Record<string, unknown> {
  const materializationWithoutId = { kind: 'git', repositoryId: sourceId, commitSha: commit(commitCharacter) };
  const body = {
    version: 'v10.3-approved-acquisition-v1',
    authorizationId: '',
    approvedBy: 'owner',
    approvedAt: '2026-07-13T00:00:00.000Z',
    sourceId,
    repositoryId: sourceId,
    materializationId: calibrationAdmissionMaterializationId(sourceId, sourceId, materializationWithoutId),
    originUrl: 'https://example.test/repo.git',
    transport: {
      kind: 'git_https',
      commitSha: commit(commitCharacter),
      transportByteLimit: 'not_enforceable_by_stock_git',
      ownerAcknowledgedUnboundedTransport: true,
    },
    maxMaterializedBytes: 100,
    licenseEvidenceId: 'license-evidence',
    licensePath: 'LICENSE',
    licenseSha256: hex('6'),
    authorizationSha256: '',
  };
  const authorizationId = calibrationApprovedAcquisitionAuthorizationId(body);
  const withId = { ...body, authorizationId };
  return { ...withId, authorizationSha256: calibrationApprovedAcquisitionAuthorizationSha256(withId) };
}

function roundAuthorization(sourceAuthorizationId: string): Record<string, unknown> {
  const body = {
    version: 'v10.3-acquisition-round-authorization-v1',
    roundId: '',
    approvedBy: 'owner',
    approvedAt: '2026-07-13T00:00:00.000Z',
    parentCensusSha256: hex('7'),
    measuredDeficitsSha256: hex('8'),
    sourceAuthorizationIds: [sourceAuthorizationId],
    maxSources: 2,
    maxTotalMaterializedBytes: 100,
    authorizationSha256: '',
  };
  const roundId = calibrationAcquisitionRoundAuthorizationId(body);
  const withId = { ...body, roundId };
  return { ...withId, authorizationSha256: calibrationAcquisitionRoundAuthorizationSha256(withId) };
}

function sourceReceipt(
  authorization: Record<string, unknown>,
  round: Record<string, unknown>,
  transactionId: string,
  toolReceiptCharacter = 'e',
): Record<string, unknown> {
  const authorizationTransport = authorization.transport as Record<string, unknown>;
  const transport = authorizationTransport.kind === 'release_https'
    ? {
        kind: 'release_https',
        materialization: authorizationTransport.materialization,
        extractionReceipt: {
          receiptVersion: 'v1',
          extractionPolicy: 'safe-zip-v1',
          assetSha256: (authorizationTransport.materialization as Record<string, unknown>).assetSha256,
          assetBytes: (authorizationTransport.materialization as Record<string, unknown>).assetBytes,
          inventorySha256: sha([]),
          entries: [],
        },
        observedTransferBytes: (authorizationTransport.materialization as Record<string, unknown>).assetBytes,
        redirectChain: ['https://mirror.example/release.zip'],
      }
    : {
        kind: 'git_https',
        commitSha: authorizationTransport.commitSha,
        treeSha: hex('9'),
        observedPackBytes: 10,
        observedNetworkBytes: 'not_observable_exactly',
      };
  const body = {
    version: 'v10.3-acquisition-receipt-v1',
    receiptId: '',
    authorizationId: authorization.authorizationId,
    roundId: round.roundId,
    authorizationSha256: authorization.authorizationSha256,
    sourceId: authorization.sourceId,
    repositoryId: authorization.repositoryId,
    materializationId: authorization.materializationId,
    originUrl: authorization.originUrl,
    transport,
    materializedBytes: 10,
    inventorySha256: hex('a'),
    licenseSha256: authorization.licenseSha256,
    materializationReceiptId: 'materialization-receipt',
    materializationReceiptSha256: hex('b'),
    networkObservation: {
      requestUrl: authorization.originUrl,
      redirectChain: authorizationTransport.kind === 'release_https' ? ['https://mirror.example/release.zip'] : [],
      resolvedPublicAddresses: ['8.8.8.8'],
      connectedPeerAddress: '8.8.8.8',
    },
    resolvedPublicAddressesSha256: sha(['8.8.8.8']),
    connectedPeerEvidenceSha256: sha('8.8.8.8'),
    transactionId,
    toolReceiptId: sha({ kind: 'child-tool-receipt', toolReceiptCharacter }),
    toolReceiptSha256: hex(toolReceiptCharacter),
    receiptSha256: '',
  };
  const receiptId = calibrationAcquisitionReceiptId(body);
  const withId = { ...body, receiptId };
  return { ...withId, receiptSha256: calibrationAcquisitionReceiptSha256(withId) };
}

function releaseAuthorization(maxTransferBytes = 100): Record<string, unknown> {
  const materializationWithoutId = {
    kind: 'release_archive',
    assetUrl: 'https://example.test/release.zip',
    assetSha256: hex('c'),
    assetBytes: 100,
    archiveFormat: 'zip',
    rootPrefix: 'repo',
    extractionPolicy: 'safe-zip-v1',
  };
  const body = {
    version: 'v10.3-approved-acquisition-v1',
    authorizationId: '',
    approvedBy: 'owner',
    approvedAt: '2026-07-13T00:00:00.000Z',
    sourceId: 'release-a',
    repositoryId: 'release-a',
    materializationId: calibrationAdmissionMaterializationId('release-a', 'release-a', materializationWithoutId),
    originUrl: materializationWithoutId.assetUrl,
    transport: {
      kind: 'release_https',
      materialization: materializationWithoutId,
      maxTransferBytes,
      approvedRedirectUrls: ['https://mirror.example/release.zip'],
    },
    maxMaterializedBytes: 100,
    licenseEvidenceId: 'license-evidence',
    licensePath: 'LICENSE',
    licenseSha256: hex('6'),
    authorizationSha256: '',
  };
  const authorizationId = calibrationApprovedAcquisitionAuthorizationId(body);
  const withId = { ...body, authorizationId };
  return { ...withId, authorizationSha256: calibrationApprovedAcquisitionAuthorizationSha256(withId) };
}

function buildGraph(authorization = sourceAuthorization()) {
  const round = roundAuthorization(String(authorization.authorizationId));
  const transportKind = (authorization.transport as Record<string, unknown>).kind;
  const invocation = {
    authorizationId: authorization.authorizationId,
    invocationIntentId: hex('2'),
    profileId: transportKind === 'release_https' ? 'admission-release-acquire-v1' : 'admission-git-acquire-v1',
    profileSha256: hex('f'),
  };
  const source = {
    authorizationId: authorization.authorizationId,
    temporaryRelativePath: 'sources/.tmp/repo-a',
    finalRelativePath: 'sources/repo-a',
    expectedIdentitySha256: hex('1'),
    maxMaterializedBytes: 100,
    networkObservationRelativePath: 'observations/repo-a.json',
    sourceReceiptTemporaryRelativePath: 'receipts/.tmp/repo-a.json',
    sourceReceiptFinalRelativePath: 'receipts/repo-a.json',
    materializationReceiptTemporaryRelativePath: 'materializations/.tmp/repo-a.json',
    materializationReceiptFinalRelativePath: 'materializations/repo-a.json',
    toolReceiptTemporaryRelativePath: 'receipts/.tmp/tool-repo-a.json',
    state: { phase: 'not_started' },
  };
  const transactionBody = {
    version: 'v10.3-acquisition-round-transaction-v1',
    transactionId: '',
    lockSha256: '',
    roundId: round.roundId,
    orchestratorInvocationIntentId: hex('3'),
    sourceInvocations: [invocation],
    maxTotalMaterializedBytes: 100,
    reservedMaterializedBytes: 100,
    recoveryNonce: hex('0'),
    sources: [source],
    state: { phase: 'intent_fsynced' },
    transactionSha256: '',
  };
  const transactionId = calibrationAcquisitionRoundTransactionId(transactionBody);
  const withTransactionId = { ...transactionBody, transactionId };
  const lockBody = {
    version: 'v10.3-acquisition-round-lock-v1',
    lockId: '',
    intendedTransactionId: transactionId,
    roundId: round.roundId,
    orchestratorInvocationIntentId: hex('3'),
    sourceInvocations: [invocation],
    sourceAuthorizationIds: [authorization.authorizationId],
    maxTotalMaterializedBytes: 100,
    recoveryNonce: hex('0'),
    lockSha256: '',
  };
  const lockId = calibrationAcquisitionRoundLockId(lockBody);
  const lock = { ...lockBody, lockId, lockSha256: calibrationAcquisitionRoundLockSha256({ ...lockBody, lockId }) };
  const transactionWithLock = { ...withTransactionId, lockSha256: lock.lockSha256 };
  const transaction = {
    ...transactionWithLock,
    transactionSha256: calibrationAcquisitionRoundTransactionSha256(transactionWithLock),
  };
  const receipt = sourceReceipt(authorization, round, transaction.transactionId as string);
  const roundReceiptBody = {
    version: 'v10.3-acquisition-round-receipt-v1',
    receiptId: '',
    roundId: round.roundId,
    parentCensusSha256: round.parentCensusSha256,
    sourceReceiptSha256s: [receipt.receiptSha256],
    sourceInvocationIntentIds: [invocation.invocationIntentId],
    sourceProfileSha256s: [invocation.profileSha256],
    sourceToolReceiptSha256s: [receipt.toolReceiptSha256],
    orchestratorInvocationIntentId: hex('3'),
    orchestratorToolReceiptId: hex('4'),
    orchestratorToolReceiptSha256: hex('4'),
    toolAuthoritySnapshot: snapshot([invocation.invocationIntentId, hex('3')], [String(receipt.toolReceiptId), hex('4')]),
    acquiredSourceCount: 1,
    totalMaterializedBytes: 10,
    withinAuthorizedCountAndBytes: true,
    receiptSha256: '',
  };
  const roundReceiptId = calibrationAcquisitionRoundReceiptId(roundReceiptBody);
  const roundReceiptWithId = { ...roundReceiptBody, receiptId: roundReceiptId };
  const roundReceipt = { ...roundReceiptWithId, receiptSha256: calibrationAcquisitionRoundReceiptSha256(roundReceiptWithId) };
  return { authorization, round, receipt, roundReceipt, lock, transaction };
}

/** Deliberately keeps the explicit authorization order instead of sorting it. */
function buildTwoSourceGraph() {
  const firstAuthorization = sourceAuthorization('repo-b', 'b');
  const secondAuthorization = sourceAuthorization('repo-a', 'a');
  const authorizations = [firstAuthorization, secondAuthorization];
  const roundBody = {
    version: 'v10.3-acquisition-round-authorization-v1',
    roundId: '',
    approvedBy: 'owner',
    approvedAt: '2026-07-13T00:00:00.000Z',
    parentCensusSha256: hex('7'),
    measuredDeficitsSha256: hex('8'),
    sourceAuthorizationIds: authorizations.map((entry) => entry.authorizationId),
    maxSources: 2,
    maxTotalMaterializedBytes: 200,
    authorizationSha256: '',
  };
  const roundId = calibrationAcquisitionRoundAuthorizationId(roundBody);
  const round = { ...roundBody, roundId, authorizationSha256: calibrationAcquisitionRoundAuthorizationSha256({ ...roundBody, roundId }) };
  const invocations = authorizations.map((authorization, index) => ({
    authorizationId: authorization.authorizationId,
    invocationIntentId: hex(index === 0 ? '5' : '2'),
    profileId: 'admission-git-acquire-v1',
    profileSha256: hex('f'),
  }));
  const sources = authorizations.map((authorization, index) => {
    const sourceId = String(authorization.sourceId);
    return {
      authorizationId: authorization.authorizationId,
      temporaryRelativePath: `sources/.tmp/${sourceId}`,
      finalRelativePath: `sources/${sourceId}`,
      expectedIdentitySha256: hex(index === 0 ? '1' : 'a'),
      maxMaterializedBytes: 100,
      networkObservationRelativePath: `observations/${sourceId}.json`,
      sourceReceiptTemporaryRelativePath: `receipts/.tmp/${sourceId}.json`,
      sourceReceiptFinalRelativePath: `receipts/${sourceId}.json`,
      materializationReceiptTemporaryRelativePath: `materializations/.tmp/${sourceId}.json`,
      materializationReceiptFinalRelativePath: `materializations/${sourceId}.json`,
      toolReceiptTemporaryRelativePath: `receipts/.tmp/tool-${sourceId}.json`,
      state: { phase: 'not_started' },
    };
  });
  const transactionBody = {
    version: 'v10.3-acquisition-round-transaction-v1',
    transactionId: '',
    lockSha256: '',
    roundId: round.roundId,
    orchestratorInvocationIntentId: hex('3'),
    sourceInvocations: invocations,
    maxTotalMaterializedBytes: 200,
    reservedMaterializedBytes: 200,
    recoveryNonce: hex('0'),
    sources,
    state: { phase: 'intent_fsynced' },
    transactionSha256: '',
  };
  const transactionId = calibrationAcquisitionRoundTransactionId(transactionBody);
  const transactionWithId = { ...transactionBody, transactionId };
  const lockBody = {
    version: 'v10.3-acquisition-round-lock-v1',
    lockId: '',
    intendedTransactionId: transactionId,
    roundId: round.roundId,
    orchestratorInvocationIntentId: hex('3'),
    sourceInvocations: invocations,
    sourceAuthorizationIds: authorizations.map((entry) => entry.authorizationId),
    maxTotalMaterializedBytes: 200,
    recoveryNonce: hex('0'),
    lockSha256: '',
  };
  const lockId = calibrationAcquisitionRoundLockId(lockBody);
  const lock = { ...lockBody, lockId, lockSha256: calibrationAcquisitionRoundLockSha256({ ...lockBody, lockId }) };
  const transactionWithLock = { ...transactionWithId, lockSha256: lock.lockSha256 };
  const transaction = { ...transactionWithLock, transactionSha256: calibrationAcquisitionRoundTransactionSha256(transactionWithLock) };
  const receipts = authorizations.map((authorization, index) => sourceReceipt(authorization, round, transaction.transactionId as string, index === 0 ? 'd' : 'e'));
  const roundReceiptBody = {
    version: 'v10.3-acquisition-round-receipt-v1',
    receiptId: '',
    roundId: round.roundId,
    parentCensusSha256: round.parentCensusSha256,
    sourceReceiptSha256s: receipts.map((entry) => entry.receiptSha256),
    sourceInvocationIntentIds: invocations.map((entry) => entry.invocationIntentId),
    sourceProfileSha256s: invocations.map((entry) => entry.profileSha256),
    sourceToolReceiptSha256s: receipts.map((entry) => entry.toolReceiptSha256),
    orchestratorInvocationIntentId: hex('3'),
    orchestratorToolReceiptId: hex('4'),
    orchestratorToolReceiptSha256: hex('4'),
    toolAuthoritySnapshot: snapshot(
      [...invocations.map((entry) => entry.invocationIntentId), hex('3')],
      [...receipts.map((entry) => String(entry.toolReceiptId)), hex('4')],
    ),
    acquiredSourceCount: 2,
    totalMaterializedBytes: 20,
    withinAuthorizedCountAndBytes: true,
    receiptSha256: '',
  };
  const roundReceiptId = calibrationAcquisitionRoundReceiptId(roundReceiptBody);
  const roundReceiptWithId = { ...roundReceiptBody, receiptId: roundReceiptId };
  const roundReceipt = { ...roundReceiptWithId, receiptSha256: calibrationAcquisitionRoundReceiptSha256(roundReceiptWithId) };
  return { authorizations, round, receipts, roundReceipt, lock, transaction };
}

describe('v10.3 acquisition-round contracts', () => {
  it('accepts a complete offline one-source authority graph', () => {
    const graph = buildGraph();
    expect(isCalibrationApprovedAcquisitionV1(graph.authorization)).toBe(true);
    expect(isCalibrationAcquisitionRoundAuthorizationV1(graph.round)).toBe(true);
    expect(isCalibrationAcquisitionReceiptV1(graph.receipt)).toBe(true);
    expect(isCalibrationAcquisitionRoundReceiptV1(graph.roundReceipt)).toBe(true);
    expect(isCalibrationAcquisitionRoundLockV1(graph.lock)).toBe(true);
    expect(isCalibrationAcquisitionRoundTransactionV1(graph.transaction)).toBe(true);
    expect(isCalibrationAdmissionToolAuthoritySnapshotV1(graph.roundReceipt.toolAuthoritySnapshot)).toBe(true);
    expect(validateCalibrationAcquisitionRoundGraph({
      roundAuthorization: graph.round,
      sourceAuthorizations: [graph.authorization],
      sourceReceipts: [graph.receipt],
      roundReceipt: graph.roundReceipt,
      lock: graph.lock,
      transaction: graph.transaction,
    })).toEqual({ ok: true, errors: [] });
    const stagedState = {
      phase: 'materialization_receipt_staged_fsynced',
      networkObservationSha256: sha(graph.receipt.networkObservation),
      childToolReceiptId: graph.receipt.toolReceiptId,
      childToolReceiptSha256: graph.receipt.toolReceiptSha256,
      toolAuthorityIndexSha256: graph.roundReceipt.toolAuthoritySnapshot.indexGenerationSha256,
      materializationReceiptId: graph.receipt.materializationReceiptId,
      materializationReceiptSha256: graph.receipt.materializationReceiptSha256,
    };
    const stagedTransactionBody = { ...graph.transaction, sources: [{ ...graph.transaction.sources[0], state: stagedState }], transactionSha256: '' };
    const stagedTransaction = { ...stagedTransactionBody, transactionSha256: calibrationAcquisitionRoundTransactionSha256(stagedTransactionBody) };
    expect(validateCalibrationAcquisitionRoundGraph({
      roundAuthorization: graph.round,
      sourceAuthorizations: [graph.authorization],
      sourceReceipts: [graph.receipt],
      roundReceipt: graph.roundReceipt,
      lock: graph.lock,
      transaction: stagedTransaction,
    })).toEqual({ ok: true, errors: [] });
    const brokenStagedState = { ...stagedState, childToolReceiptId: hex('9') };
    const brokenStagedBody = { ...graph.transaction, sources: [{ ...graph.transaction.sources[0], state: brokenStagedState }], transactionSha256: '' };
    const brokenStagedTransaction = { ...brokenStagedBody, transactionSha256: calibrationAcquisitionRoundTransactionSha256(brokenStagedBody) };
    expect(validateCalibrationAcquisitionRoundGraph({
      roundAuthorization: graph.round,
      sourceAuthorizations: [graph.authorization],
      sourceReceipts: [graph.receipt],
      roundReceipt: graph.roundReceipt,
      lock: graph.lock,
      transaction: brokenStagedTransaction,
    }).ok).toBe(false);
    const orchestratorState = {
      phase: 'orchestrator_tool_receipt_indexed',
      orchestratorToolReceiptId: graph.roundReceipt.orchestratorToolReceiptId,
      orchestratorToolReceiptSha256: graph.roundReceipt.orchestratorToolReceiptSha256,
      toolAuthorityIndexSha256: graph.roundReceipt.toolAuthoritySnapshot.indexGenerationSha256,
    };
    const orchestratorStateBody = { ...graph.transaction, state: orchestratorState, transactionSha256: '' };
    const orchestratorStateTransaction = { ...orchestratorStateBody, transactionSha256: calibrationAcquisitionRoundTransactionSha256(orchestratorStateBody) };
    expect(validateCalibrationAcquisitionRoundGraph({
      roundAuthorization: graph.round,
      sourceAuthorizations: [graph.authorization],
      sourceReceipts: [graph.receipt],
      roundReceipt: graph.roundReceipt,
      lock: graph.lock,
      transaction: orchestratorStateTransaction,
    })).toEqual({ ok: true, errors: [] });
    const brokenOrchestratorStateBody = { ...graph.transaction, state: { ...orchestratorState, orchestratorToolReceiptSha256: hex('9') }, transactionSha256: '' };
    const brokenOrchestratorState = { ...brokenOrchestratorStateBody, transactionSha256: calibrationAcquisitionRoundTransactionSha256(brokenOrchestratorStateBody) };
    expect(validateCalibrationAcquisitionRoundGraph({
      roundAuthorization: graph.round,
      sourceAuthorizations: [graph.authorization],
      sourceReceipts: [graph.receipt],
      roundReceipt: graph.roundReceipt,
      lock: graph.lock,
      transaction: brokenOrchestratorState,
    }).ok).toBe(false);
  });

  it('rejects malformed runtime graph input and unsafe network/path values', () => {
    expect(validateCalibrationAcquisitionRoundGraph(null as never)).toEqual({ ok: false, errors: ['acquisition round graph input is invalid'] });
    const graph = buildGraph();
    const observation = graph.receipt.networkObservation as Record<string, unknown>;
    expect(isCalibrationAcquisitionReceiptV1({ ...graph.receipt, networkObservation: { ...observation, connectedPeerAddress: '192.168.1.1' } })).toBe(false);
    expect(isCalibrationAcquisitionReceiptV1({ ...graph.receipt, networkObservation: { ...observation, connectedPeerAddress: '8.8.4.4' } })).toBe(false);
    expect(isCalibrationAcquisitionReceiptV1({ ...graph.receipt, networkObservation: { ...observation, resolvedPublicAddresses: ['2001:db8::1'], connectedPeerAddress: '2001:db8::1', resolvedPublicAddressesSha256: undefined } })).toBe(false);
    expect(isCalibrationAcquisitionReceiptV1({ ...graph.receipt, networkObservation: { ...observation, resolvedPublicAddresses: ['::ffff:8.8.8.8'], connectedPeerAddress: '::ffff:8.8.8.8' } })).toBe(false);
    expect(isCalibrationAcquisitionReceiptV1({ ...graph.receipt, networkObservation: { ...observation, resolvedPublicAddresses: ['1:::2'], connectedPeerAddress: '1:::2' } })).toBe(false);
    expect(isCalibrationAcquisitionReceiptV1({ ...graph.receipt, networkObservation: { ...observation, resolvedPublicAddresses: ['fc00::1'], connectedPeerAddress: 'fc00::1' } })).toBe(false);
    expect(isCalibrationAcquisitionReceiptV1({ ...graph.receipt, networkObservation: { ...observation, requestUrl: 'https://other.example/repo.git' } })).toBe(false);
    expect(isCalibrationAcquisitionRoundTransactionV1({ ...graph.transaction, sources: [{ ...graph.transaction.sources[0], finalRelativePath: '../escape' }] })).toBe(false);
    expect(isCalibrationApprovedAcquisitionV1({ ...graph.authorization, originUrl: `https://${'a'.repeat(4100)}.example` })).toBe(false);
  });

  it('rejects identity, count, and cumulative-byte mutations', () => {
    const graph = buildGraph();
    expect(isCalibrationApprovedAcquisitionV1({ ...graph.authorization, authorizationSha256: hex('0') })).toBe(false);
    expect(isCalibrationAcquisitionRoundLockV1({ ...graph.lock, intendedTransactionId: hex('0') })).toBe(false);
    expect(validateCalibrationAcquisitionRoundGraph({
      roundAuthorization: graph.round,
      sourceAuthorizations: [graph.authorization, graph.authorization],
      sourceReceipts: [graph.receipt],
      roundReceipt: graph.roundReceipt,
      lock: graph.lock,
      transaction: graph.transaction,
    }).ok).toBe(false);
    expect(validateCalibrationAcquisitionRoundGraph({
      roundAuthorization: { ...graph.round, maxTotalMaterializedBytes: CALIBRATION_ACQUISITION_ROUND_MAX_BYTES },
      sourceAuthorizations: [graph.authorization],
      sourceReceipts: [{ ...graph.receipt, materializedBytes: CALIBRATION_ACQUISITION_ROUND_MAX_BYTES }],
      roundReceipt: { ...graph.roundReceipt, totalMaterializedBytes: CALIBRATION_ACQUISITION_ROUND_MAX_BYTES },
      lock: graph.lock,
      transaction: graph.transaction,
    }).ok).toBe(false);
    expect(validateCalibrationAcquisitionRoundGraph({
      roundAuthorization: graph.round,
      sourceAuthorizations: [graph.authorization],
      sourceReceipts: [graph.receipt],
      roundReceipt: graph.roundReceipt,
      lock: graph.lock,
      transaction: { ...graph.transaction, recoveryNonce: hex('9'), transactionSha256: calibrationAcquisitionRoundTransactionSha256({ ...graph.transaction, recoveryNonce: hex('9') }) },
    }).ok).toBe(false);
    const roundTrip = JSON.parse(JSON.stringify(graph));
    expect(validateCalibrationAcquisitionRoundGraph({
      roundAuthorization: roundTrip.round,
      sourceAuthorizations: [roundTrip.authorization],
      sourceReceipts: [roundTrip.receipt],
      roundReceipt: roundTrip.roundReceipt,
      lock: roundTrip.lock,
      transaction: roundTrip.transaction,
    })).toEqual({ ok: true, errors: [] });
  });

  it('accepts a genuine two-source graph in the explicit authorization order', () => {
    const graph = buildTwoSourceGraph();
    expect(isCalibrationAcquisitionRoundAuthorizationV1(graph.round)).toBe(true);
    expect(isCalibrationAcquisitionRoundLockV1(graph.lock)).toBe(true);
    expect(isCalibrationAcquisitionRoundTransactionV1(graph.transaction)).toBe(true);
    expect(isCalibrationAcquisitionRoundReceiptV1(graph.roundReceipt)).toBe(true);
    expect(validateCalibrationAcquisitionRoundGraph({
      roundAuthorization: graph.round,
      sourceAuthorizations: [...graph.authorizations].reverse(),
      sourceReceipts: [...graph.receipts].reverse(),
      roundReceipt: graph.roundReceipt,
      lock: graph.lock,
      transaction: graph.transaction,
    })).toEqual({ ok: true, errors: [] });
  });

  it('enforces release transfer caps and approved redirect semantics', () => {
    const authorization = releaseAuthorization();
    expect(isCalibrationApprovedAcquisitionV1(authorization)).toBe(true);
    const overAsset = releaseAuthorization(99);
    expect(isCalibrationApprovedAcquisitionV1(overAsset)).toBe(false);
    const graph = buildGraph(authorization);
    expect(validateCalibrationAcquisitionRoundGraph({
      roundAuthorization: graph.round,
      sourceAuthorizations: [graph.authorization],
      sourceReceipts: [graph.receipt],
      roundReceipt: graph.roundReceipt,
      lock: graph.lock,
      transaction: graph.transaction,
    })).toEqual({ ok: true, errors: [] });
    const overTransferBody = {
      ...graph.receipt,
      transport: { ...(graph.receipt.transport as Record<string, unknown>), observedTransferBytes: 101 },
      receiptId: '',
      receiptSha256: '',
    };
    const overTransferId = calibrationAcquisitionReceiptId(overTransferBody);
    const overTransferWithId = { ...overTransferBody, receiptId: overTransferId };
    const overTransfer = { ...overTransferWithId, receiptSha256: calibrationAcquisitionReceiptSha256(overTransferWithId) };
    expect(validateCalibrationAcquisitionRoundGraph({
      roundAuthorization: graph.round,
      sourceAuthorizations: [graph.authorization],
      sourceReceipts: [overTransfer],
      roundReceipt: graph.roundReceipt,
      lock: graph.lock,
      transaction: graph.transaction,
    }).ok).toBe(false);
    const unauthorizedRedirectBody = {
      ...graph.receipt,
      transport: { ...(graph.receipt.transport as Record<string, unknown>), redirectChain: ['https://unauthorized.example/release.zip'] },
      networkObservation: { ...(graph.receipt.networkObservation as Record<string, unknown>), redirectChain: ['https://unauthorized.example/release.zip'] },
      receiptId: '',
      receiptSha256: '',
    };
    const unauthorizedRedirectId = calibrationAcquisitionReceiptId(unauthorizedRedirectBody);
    const unauthorizedRedirectWithId = { ...unauthorizedRedirectBody, receiptId: unauthorizedRedirectId };
    const unauthorizedRedirect = { ...unauthorizedRedirectWithId, receiptSha256: calibrationAcquisitionReceiptSha256(unauthorizedRedirectWithId) };
    expect(validateCalibrationAcquisitionRoundGraph({
      roundAuthorization: graph.round,
      sourceAuthorizations: [graph.authorization],
      sourceReceipts: [unauthorizedRedirect],
      roundReceipt: graph.roundReceipt,
      lock: graph.lock,
      transaction: graph.transaction,
    }).ok).toBe(false);
  });
});
