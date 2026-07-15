/** Offline-only v10.3 admission commands. */
import { createReadStream } from 'node:fs';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { createInterface } from 'node:readline';
import { join } from 'node:path';
import { calibrationAdmissionCanonicalJson } from '@usebrick/core';
import { buildVerifiedAdmissionEvidenceContext } from '../../src/calibration/v103/admission-evidence-context';
import { buildAdmissionSourceCensus } from '../../src/calibration/v103/admission-source-census';
import { requireContainedAdmissionPath } from '../../src/calibration/v103/admission-path';
import {
  AcquisitionPublicationPendingError,
  publishAdmissionToolInvocationIntent,
  publishAdmissionToolReceipt,
  publishAcquisitionPublication,
  recoverAcquisitionPublication,
  recoverToolAuthorityPublication,
  resolveAdmissionToolAuthorityReceipt,
} from '../../src/calibration/v103/admission-publication';
import {
  RegisterPublicationPendingError,
  publishRegisterGeneration,
  recoverRegisterGeneration,
} from '../../src/calibration/v103/admission-register-publication';
import { buildAdmissionOverlapLedger } from '../../src/calibration/v103/admission-overlap';
import { openAdmissionOverlapUniverseStream } from '../../src/calibration/v103/admission-overlap-stream';
import {
  OverlapPublicationContendedError,
  OverlapPublicationPendingError,
  OverlapPublicationPostCompletionError,
  publishAdmissionOverlap,
  recoverAdmissionOverlap,
  verifyAdmissionOverlap,
} from '../../src/calibration/v103/admission-overlap-publication';

function output(value: unknown): void {
  process.stdout.write(`${JSON.stringify(value)}\n`);
}

function toolAuthorityRootFor(root: string): string {
  return /(?:^|[\\/])review[\\/]admission[\\/]?$/.test(root)
    ? join(root, 'tool-authority')
    : join(root, 'review', 'admission', 'tool-authority');
}

interface ParsedArguments {
  readonly command: string;
  readonly root: string;
  readonly proposalPath?: string;
  readonly operation?: 'create' | 'replace';
  readonly expectedCurrentIndexSha256?: string;
  readonly toolProfile?: string;
  readonly action?: string;
  readonly canonicalArgvSha256?: string;
  readonly inputSetSha256?: string;
  readonly executableBehaviorSha256?: string;
  readonly networkAuthorizationSha256?: string;
  readonly invocationIntentId?: string;
  readonly transactionId?: string;
  readonly fromLock?: boolean;
  readonly recoveryNonce?: string;
  readonly acknowledgeNoLiveWriter?: boolean;
  readonly sourceRegisterPath?: string;
  readonly sourceReviewsPath?: string;
  readonly registerDeltaPath?: string;
  readonly nextRegisterPath?: string;
  readonly sourceGenerationsPath?: string;
  readonly toolReceiptId?: string;
  readonly toolReceiptSha256?: string;
  readonly toolAuthorityIndexSha256?: string;
  readonly toolAuthorityTransactionId?: string;
  readonly overlapUniversePath?: string;
  readonly overlapRecordsPath?: string;
  readonly overlapPolicyPath?: string;
  readonly overlapNormalizersPath?: string;
  readonly overlapBytesRoot?: string;
  readonly overlapToolSnapshotPath?: string;
  readonly generation?: number;
  readonly inputGenerationSha256?: string;
  readonly expectedCurrentGenerationSha256?: string;
  readonly selectedGenerationSha256?: string;
  readonly outputSetSha256?: string;
  readonly exitCode?: number;
  readonly observedResourceUsage?: string;
  readonly joinStaticAuthority?: boolean;
}

function parse(argv: readonly string[]): ParsedArguments {
  const forwarded = argv[0] === '--' ? argv.slice(1) : argv;
  const [command, ...rest] = forwarded;
  if (command !== 'evidence:verify' && command !== 'source:census' && command !== 'acquisition:publish' && command !== 'acquisition:recover-publication' && command !== 'tool-authority:intent' && command !== 'tool-authority:receipt' && command !== 'tool-authority:resolve' && command !== 'tool-authority:recover' && command !== 'register:publish-round' && command !== 'register:recover' && command !== 'authority:overlap' && command !== 'authority:overlap:recover' && command !== 'authority:overlap:verify') throw new Error('Unknown admission command');
  let root: string | undefined;
  let proposalPath: string | undefined;
  let operation: 'create' | 'replace' | undefined;
  let expectedCurrentIndexSha256: string | undefined;
  let toolProfile: string | undefined;
  let action: string | undefined;
  let canonicalArgvSha256: string | undefined;
  let inputSetSha256: string | undefined;
  let executableBehaviorSha256: string | undefined;
  let networkAuthorizationSha256: string | undefined;
  let invocationIntentId: string | undefined;
  let transactionId: string | undefined;
  let fromLock = false;
  let recoveryNonce: string | undefined;
  let acknowledgeNoLiveWriter = false;
  let sourceRegisterPath: string | undefined;
  let sourceReviewsPath: string | undefined;
  let registerDeltaPath: string | undefined;
  let nextRegisterPath: string | undefined;
  let sourceGenerationsPath: string | undefined;
  let toolReceiptId: string | undefined;
  let toolReceiptSha256: string | undefined;
  let toolAuthorityIndexSha256: string | undefined;
  let toolAuthorityTransactionId: string | undefined;
  let overlapUniversePath: string | undefined;
  let overlapRecordsPath: string | undefined;
  let overlapPolicyPath: string | undefined;
  let overlapNormalizersPath: string | undefined;
  let overlapBytesRoot: string | undefined;
  let overlapToolSnapshotPath: string | undefined;
  let generation: number | undefined;
  let inputGenerationSha256: string | undefined;
  let expectedCurrentGenerationSha256: string | undefined;
  let selectedGenerationSha256: string | undefined;
  let outputSetSha256: string | undefined;
  let exitCode: number | undefined;
  let observedResourceUsage: string | undefined;
  let joinStaticAuthority = false;
  for (let index = 0; index < rest.length; index += 1) {
    const flag = rest[index];
    if (flag === '--join-static-authority') {
      if (command !== 'authority:overlap:verify') throw new Error('--join-static-authority is only valid for authority:overlap:verify');
      if (joinStaticAuthority) throw new Error('--join-static-authority may only be supplied once');
      joinStaticAuthority = true;
      continue;
    }
    if (flag === '--from-lock' || flag === '--acknowledge-no-live-writer') {
      if (command !== 'acquisition:recover-publication' && command !== 'tool-authority:recover' && command !== 'register:recover' && command !== 'authority:overlap:recover') throw new Error(`${flag} is only valid for a recovery command`);
      if (flag === '--from-lock') {
        if (fromLock) throw new Error('--from-lock may only be supplied once');
        fromLock = true;
      } else {
        if (acknowledgeNoLiveWriter) throw new Error('--acknowledge-no-live-writer may only be supplied once');
        acknowledgeNoLiveWriter = true;
      }
      continue;
    }
    const takesValue = new Set(['--root', '--publication-proposal', '--operation', '--expected-current-index-sha256', '--tool-profile', '--action', '--canonical-argv-sha256', '--input-set-sha256', '--executable-behavior-sha256', '--network-authorization-sha256', '--invocation-intent', '--transaction-id', '--recovery-nonce', '--source-register', '--source-reviews', '--register-delta', '--next-register', '--source-generations', '--tool-receipt-id', '--tool-receipt-sha256', '--tool-authority-index-sha256', '--tool-authority-transaction-id', '--universe', '--records', '--policy', '--normalizers', '--bytes-root', '--tool-snapshot', '--generation', '--input-generation-sha256', '--expected-current-generation-sha256', '--generation-sha256', '--output-set-sha256', '--exit-code', '--observed-resource-usage']);
    if (!flag || !takesValue.has(flag)) throw new Error(`Unexpected option for ${command}`);
    const value = rest[index + 1];
    if (!value || value.startsWith('--')) throw new Error(`${flag} requires a value`);
    if (flag === '--root') {
      if (root !== undefined) throw new Error('--root may only be supplied once');
      root = value;
    } else if (flag === '--publication-proposal') {
      if (proposalPath !== undefined) throw new Error('--publication-proposal may only be supplied once');
      proposalPath = value;
    } else if (flag === '--operation') {
      if (operation !== undefined || (value !== 'create' && value !== 'replace')) throw new Error('--operation must be create or replace');
      operation = value;
    } else if (flag === '--expected-current-index-sha256') {
      if (expectedCurrentIndexSha256 !== undefined) throw new Error('--expected-current-index-sha256 may only be supplied once');
      expectedCurrentIndexSha256 = value;
    } else if (flag === '--tool-profile') {
      if (toolProfile !== undefined) throw new Error('--tool-profile may only be supplied once');
      toolProfile = value;
    } else if (flag === '--action') {
      if (action !== undefined) throw new Error('--action may only be supplied once');
      action = value;
    } else if (flag === '--canonical-argv-sha256') {
      if (canonicalArgvSha256 !== undefined || !/^[a-f0-9]{64}$/.test(value)) throw new Error('--canonical-argv-sha256 must be a lowercase SHA-256');
      canonicalArgvSha256 = value;
    } else if (flag === '--input-set-sha256') {
      if (inputSetSha256 !== undefined || !/^[a-f0-9]{64}$/.test(value)) throw new Error('--input-set-sha256 must be a lowercase SHA-256');
      inputSetSha256 = value;
    } else if (flag === '--executable-behavior-sha256') {
      if (executableBehaviorSha256 !== undefined || !/^[a-f0-9]{64}$/.test(value)) throw new Error('--executable-behavior-sha256 must be a lowercase SHA-256');
      executableBehaviorSha256 = value;
    } else if (flag === '--network-authorization-sha256') {
      if (networkAuthorizationSha256 !== undefined || !/^[a-f0-9]{64}$/.test(value)) throw new Error('--network-authorization-sha256 must be a lowercase SHA-256');
      networkAuthorizationSha256 = value;
    } else if (flag === '--invocation-intent') {
      if (invocationIntentId !== undefined) throw new Error('--invocation-intent may only be supplied once');
      if (!/^[a-f0-9]{64}$/.test(value)) throw new Error('--invocation-intent must be a lowercase SHA-256');
      invocationIntentId = value;
    } else if (flag === '--transaction-id') {
      if (transactionId !== undefined) throw new Error('--transaction-id may only be supplied once');
      transactionId = value;
    } else if (flag === '--recovery-nonce') {
      if (recoveryNonce !== undefined) throw new Error('--recovery-nonce may only be supplied once');
      recoveryNonce = value;
    } else if (flag === '--source-register') {
      if (sourceRegisterPath !== undefined) throw new Error('--source-register may only be supplied once');
      sourceRegisterPath = value;
    } else if (flag === '--source-reviews') {
      if (sourceReviewsPath !== undefined) throw new Error('--source-reviews may only be supplied once');
      sourceReviewsPath = value;
    } else if (flag === '--register-delta') {
      if (registerDeltaPath !== undefined) throw new Error('--register-delta may only be supplied once');
      registerDeltaPath = value;
    } else if (flag === '--next-register') {
      if (nextRegisterPath !== undefined) throw new Error('--next-register may only be supplied once');
      nextRegisterPath = value;
    } else if (flag === '--source-generations') {
      if (sourceGenerationsPath !== undefined) throw new Error('--source-generations may only be supplied once');
      sourceGenerationsPath = value;
    } else if (flag === '--tool-receipt-id') {
      if (toolReceiptId !== undefined) throw new Error('--tool-receipt-id may only be supplied once');
      toolReceiptId = value;
    } else if (flag === '--tool-receipt-sha256') {
      if (toolReceiptSha256 !== undefined) throw new Error('--tool-receipt-sha256 may only be supplied once');
      toolReceiptSha256 = value;
    } else if (flag === '--tool-authority-index-sha256') {
      if (toolAuthorityIndexSha256 !== undefined) throw new Error('--tool-authority-index-sha256 may only be supplied once');
      toolAuthorityIndexSha256 = value;
    } else if (flag === '--tool-authority-transaction-id') {
      if (toolAuthorityTransactionId !== undefined) throw new Error('--tool-authority-transaction-id may only be supplied once');
      toolAuthorityTransactionId = value;
    } else if (flag === '--universe') {
      if (overlapUniversePath !== undefined) throw new Error('--universe may only be supplied once');
      overlapUniversePath = value;
    } else if (flag === '--records') {
      if (overlapRecordsPath !== undefined) throw new Error('--records may only be supplied once');
      overlapRecordsPath = value;
    } else if (flag === '--policy') {
      if (overlapPolicyPath !== undefined) throw new Error('--policy may only be supplied once');
      overlapPolicyPath = value;
    } else if (flag === '--normalizers') {
      if (overlapNormalizersPath !== undefined) throw new Error('--normalizers may only be supplied once');
      overlapNormalizersPath = value;
    } else if (flag === '--bytes-root') {
      if (overlapBytesRoot !== undefined) throw new Error('--bytes-root may only be supplied once');
      overlapBytesRoot = value;
    } else if (flag === '--tool-snapshot') {
      if (overlapToolSnapshotPath !== undefined) throw new Error('--tool-snapshot may only be supplied once');
      overlapToolSnapshotPath = value;
    } else if (flag === '--generation') {
      if (generation !== undefined || !/^\d+$/.test(value)) throw new Error('--generation must be a non-negative integer');
      generation = Number(value);
      if (!Number.isSafeInteger(generation)) throw new Error('--generation is too large');
    } else if (flag === '--input-generation-sha256') {
      if (inputGenerationSha256 !== undefined || !/^[a-f0-9]{64}$/.test(value)) throw new Error('--input-generation-sha256 must be a lowercase SHA-256');
      inputGenerationSha256 = value;
    } else if (flag === '--expected-current-generation-sha256') {
      if (expectedCurrentGenerationSha256 !== undefined || !/^[a-f0-9]{64}$/.test(value)) throw new Error('--expected-current-generation-sha256 must be a lowercase SHA-256');
      expectedCurrentGenerationSha256 = value;
    } else if (flag === '--generation-sha256') {
      if (selectedGenerationSha256 !== undefined || !/^[a-f0-9]{64}$/.test(value)) throw new Error('--generation-sha256 must be a lowercase SHA-256');
      selectedGenerationSha256 = value;
    } else if (flag === '--output-set-sha256') {
      if (outputSetSha256 !== undefined || !/^[a-f0-9]{64}$/.test(value)) throw new Error('--output-set-sha256 must be a lowercase SHA-256');
      outputSetSha256 = value;
    } else if (flag === '--exit-code') {
      if (exitCode !== undefined || !/^\d+$/.test(value)) throw new Error('--exit-code must be an integer from 0 to 255');
      exitCode = Number(value);
      if (!Number.isSafeInteger(exitCode) || exitCode > 255) throw new Error('--exit-code must be an integer from 0 to 255');
    } else if (flag === '--observed-resource-usage') {
      if (observedResourceUsage !== undefined) throw new Error('--observed-resource-usage may only be supplied once');
      observedResourceUsage = value;
    }
    index += 1;
  }
  if (!root) throw new Error(`${command ?? 'admission command'} requires --root <v10.3-root or review/admission>`);
  if (command === 'tool-authority:intent') {
    if (!toolProfile || !action || !canonicalArgvSha256 || !inputSetSha256 || !executableBehaviorSha256 || invocationIntentId || outputSetSha256 || exitCode !== undefined || observedResourceUsage !== undefined || proposalPath || operation || expectedCurrentIndexSha256 || transactionId || fromLock || recoveryNonce || acknowledgeNoLiveWriter || sourceRegisterPath || sourceReviewsPath || registerDeltaPath || nextRegisterPath || sourceGenerationsPath || toolReceiptId || toolReceiptSha256 || toolAuthorityIndexSha256 || toolAuthorityTransactionId || overlapUniversePath || overlapRecordsPath || overlapPolicyPath || overlapNormalizersPath || overlapBytesRoot || overlapToolSnapshotPath || generation !== undefined || inputGenerationSha256 || expectedCurrentGenerationSha256 || selectedGenerationSha256) throw new Error('tool-authority:intent requires --tool-profile, --action, and the three input hashes only');
  } else if (command === 'tool-authority:receipt') {
    if (!invocationIntentId || !outputSetSha256 || exitCode === undefined || !observedResourceUsage || toolProfile || action || canonicalArgvSha256 || inputSetSha256 || executableBehaviorSha256 || networkAuthorizationSha256 || proposalPath || operation || expectedCurrentIndexSha256 || transactionId || fromLock || recoveryNonce || acknowledgeNoLiveWriter || sourceRegisterPath || sourceReviewsPath || registerDeltaPath || nextRegisterPath || sourceGenerationsPath || toolReceiptId || toolReceiptSha256 || toolAuthorityIndexSha256 || toolAuthorityTransactionId || overlapUniversePath || overlapRecordsPath || overlapPolicyPath || overlapNormalizersPath || overlapBytesRoot || overlapToolSnapshotPath || generation !== undefined || inputGenerationSha256 || expectedCurrentGenerationSha256 || selectedGenerationSha256) throw new Error('tool-authority:receipt requires --invocation-intent, --output-set-sha256, --exit-code, and --observed-resource-usage only');
  } else if (command === 'tool-authority:resolve') {
    if (!toolProfile || !action || !invocationIntentId || !toolReceiptId || !toolReceiptSha256 || !toolAuthorityIndexSha256
      || proposalPath || operation || expectedCurrentIndexSha256 || transactionId || fromLock || recoveryNonce || acknowledgeNoLiveWriter
      || canonicalArgvSha256 || inputSetSha256 || executableBehaviorSha256 || networkAuthorizationSha256
      || sourceRegisterPath || sourceReviewsPath || registerDeltaPath || nextRegisterPath || sourceGenerationsPath
      || toolAuthorityTransactionId || overlapUniversePath || overlapRecordsPath || overlapPolicyPath || overlapNormalizersPath || overlapBytesRoot
      || generation !== undefined || inputGenerationSha256 || expectedCurrentGenerationSha256 || selectedGenerationSha256 || outputSetSha256 || exitCode !== undefined || observedResourceUsage) {
      throw new Error('tool-authority:resolve requires profile, action, invocation intent, receipt ID/hash, and authority-index hash only (plus optional --tool-snapshot)');
    }
    if (!/^[a-f0-9]{64}$/.test(invocationIntentId) || !/^[a-f0-9]{64}$/.test(toolReceiptId) || !/^[a-f0-9]{64}$/.test(toolReceiptSha256) || !/^[a-f0-9]{64}$/.test(toolAuthorityIndexSha256)) {
      throw new Error('tool-authority:resolve selectors must be lowercase SHA-256 values');
    }
  } else if (command === 'evidence:verify' || command === 'source:census') {
    if (proposalPath || operation || expectedCurrentIndexSha256 || transactionId || fromLock || recoveryNonce || acknowledgeNoLiveWriter) throw new Error(`Unexpected acquisition option for ${command}`);
    if (toolProfile !== 'admission-context-v1' || !invocationIntentId) throw new Error('evidence:verify requires --tool-profile admission-context-v1 and --invocation-intent');
    if (command === 'source:census' && (!sourceRegisterPath || !sourceReviewsPath)) throw new Error('source:census requires --source-register and --source-reviews');
    if (command === 'evidence:verify' && (sourceRegisterPath || sourceReviewsPath)) throw new Error('Unexpected source census option for evidence:verify');
  } else if (command === 'authority:overlap') {
    if (!overlapUniversePath || !overlapRecordsPath || !overlapPolicyPath || !overlapNormalizersPath || !overlapBytesRoot || !overlapToolSnapshotPath || generation === undefined || !inputGenerationSha256 || !toolProfile || toolProfile !== 'admission-static-ledgers-v1' || !invocationIntentId || !toolReceiptId || !toolReceiptSha256 || !toolAuthorityIndexSha256) throw new Error('authority:overlap requires --universe, --records, --policy, --normalizers, --bytes-root, --tool-snapshot, --generation, --input-generation-sha256, static-ledgers profile, invocation intent, and tool receipt fields');
    if (!/^[a-f0-9]{64}$/.test(toolReceiptSha256) || !/^[a-f0-9]{64}$/.test(toolAuthorityIndexSha256)) throw new Error('Overlap tool receipt hashes must be lowercase SHA-256');
    if (operation === 'create' && expectedCurrentGenerationSha256 !== undefined) throw new Error('create cannot use --expected-current-generation-sha256');
    if (operation === 'replace' && !expectedCurrentGenerationSha256) throw new Error('replace requires --expected-current-generation-sha256');
    if (proposalPath || expectedCurrentIndexSha256 || sourceRegisterPath || sourceReviewsPath || registerDeltaPath || nextRegisterPath || sourceGenerationsPath || transactionId || fromLock || recoveryNonce || acknowledgeNoLiveWriter || selectedGenerationSha256 || toolAuthorityTransactionId) throw new Error('Unexpected option for authority:overlap');
  } else if (command === 'authority:overlap:recover') {
    if (overlapUniversePath || overlapRecordsPath || overlapPolicyPath || overlapNormalizersPath || overlapBytesRoot || overlapToolSnapshotPath || operation || expectedCurrentIndexSha256 || generation !== undefined || inputGenerationSha256 || expectedCurrentGenerationSha256 || selectedGenerationSha256 || toolAuthorityTransactionId || !toolProfile || toolProfile !== 'admission-static-ledgers-v1' || invocationIntentId || !toolReceiptId || !toolReceiptSha256 || !toolAuthorityIndexSha256 || !recoveryNonce || (!transactionId && !fromLock) || (transactionId && fromLock) || !acknowledgeNoLiveWriter) throw new Error('authority:overlap:recover requires a selector, static-ledgers tool profile, recovery nonce, tool receipt fields, and --acknowledge-no-live-writer');
    if (!/^[a-f0-9]{64}$/.test(recoveryNonce) || !/^[a-f0-9]{64}$/.test(toolReceiptSha256) || !/^[a-f0-9]{64}$/.test(toolAuthorityIndexSha256)) throw new Error('Overlap recovery hashes/nonces must be lowercase SHA-256');
  } else if (command === 'authority:overlap:verify') {
    if (proposalPath || operation || expectedCurrentIndexSha256 || overlapUniversePath || overlapRecordsPath || overlapPolicyPath || overlapNormalizersPath || overlapBytesRoot || overlapToolSnapshotPath || generation !== undefined || inputGenerationSha256 || expectedCurrentGenerationSha256 || transactionId || fromLock || recoveryNonce || acknowledgeNoLiveWriter || sourceRegisterPath || sourceReviewsPath || registerDeltaPath || nextRegisterPath || sourceGenerationsPath || toolAuthorityTransactionId || action || canonicalArgvSha256 || inputSetSha256 || executableBehaviorSha256 || networkAuthorizationSha256 || outputSetSha256 || exitCode !== undefined || observedResourceUsage !== undefined || !toolProfile || toolProfile !== 'admission-static-ledgers-v1') throw new Error('authority:overlap:verify requires --tool-profile admission-static-ledgers-v1 and no publication options');
    if (joinStaticAuthority) {
      if (!invocationIntentId || !toolReceiptId || !toolReceiptSha256 || !toolAuthorityIndexSha256) throw new Error('authority:overlap:verify --join-static-authority requires invocation intent and indexed tool receipt selectors');
      if (!/^[a-f0-9]{64}$/.test(toolReceiptId) || !/^[a-f0-9]{64}$/.test(toolReceiptSha256) || !/^[a-f0-9]{64}$/.test(toolAuthorityIndexSha256)) throw new Error('authority:overlap:verify join selectors must be lowercase SHA-256');
    } else if (invocationIntentId || toolReceiptId || toolReceiptSha256 || toolAuthorityIndexSha256) {
      throw new Error('authority:overlap:verify tool selectors require --join-static-authority');
    }
  } else if (command === 'acquisition:publish') {
    if (!proposalPath || !operation || !toolProfile || !invocationIntentId || transactionId || fromLock || recoveryNonce || acknowledgeNoLiveWriter) throw new Error('acquisition:publish requires --publication-proposal, --operation, --tool-profile, and --invocation-intent');
    if (toolProfile !== 'admission-acquisition-publication-v1') throw new Error('--tool-profile must be admission-acquisition-publication-v1');
    if (operation === 'create' && expectedCurrentIndexSha256 !== undefined) throw new Error('create cannot use --expected-current-index-sha256');
    if (operation === 'replace' && (!expectedCurrentIndexSha256 || !/^[a-f0-9]{64}$/.test(expectedCurrentIndexSha256))) throw new Error('replace requires a lowercase --expected-current-index-sha256');
  } else if (command === 'acquisition:recover-publication') {
    if (proposalPath || operation || expectedCurrentIndexSha256 || !toolProfile || !invocationIntentId || !recoveryNonce || (!transactionId && !fromLock) || (transactionId && fromLock) || !acknowledgeNoLiveWriter) throw new Error('acquisition:recover-publication requires exactly one of --from-lock or --transaction-id, --recovery-nonce, --tool-profile, --invocation-intent, and --acknowledge-no-live-writer');
    if (toolProfile !== 'admission-acquisition-publication-v1') throw new Error('--tool-profile must be admission-acquisition-publication-v1');
    if (!/^[a-f0-9]{64}$/.test(recoveryNonce)) throw new Error('--recovery-nonce must be a lowercase SHA-256');
  } else if (command === 'tool-authority:recover') {
    if (proposalPath || operation || expectedCurrentIndexSha256 || toolProfile || invocationIntentId || !recoveryNonce || (!transactionId && !fromLock) || (transactionId && fromLock) || !acknowledgeNoLiveWriter) throw new Error('tool-authority:recover requires exactly one of --from-lock or --transaction-id, --recovery-nonce, and --acknowledge-no-live-writer');
    if (!/^[a-f0-9]{64}$/.test(recoveryNonce)) throw new Error('--recovery-nonce must be a lowercase SHA-256');
  } else if (command === 'register:publish-round') {
    if (!registerDeltaPath || !nextRegisterPath || !sourceGenerationsPath || !toolProfile || toolProfile !== 'admission-acquisition-publication-v1' || !invocationIntentId || !toolReceiptId || !toolReceiptSha256 || !toolAuthorityIndexSha256 || !toolAuthorityTransactionId || proposalPath || operation || expectedCurrentIndexSha256 || transactionId || fromLock || recoveryNonce || acknowledgeNoLiveWriter) throw new Error('register:publish-round requires register inputs, invocation intent, publication profile, and tool receipt fields');
    if (!/^[a-f0-9]{64}$/.test(toolReceiptSha256) || !/^[a-f0-9]{64}$/.test(toolAuthorityIndexSha256)) throw new Error('Register tool receipt hashes must be lowercase SHA-256');
  } else {
    if (proposalPath || operation || expectedCurrentIndexSha256 || !toolProfile || toolProfile !== 'admission-acquisition-publication-v1' || !recoveryNonce || (!transactionId && !fromLock) || (transactionId && fromLock) || !acknowledgeNoLiveWriter || !toolReceiptId || !toolReceiptSha256 || !toolAuthorityIndexSha256 || !toolAuthorityTransactionId) throw new Error('register:recover requires --from-lock, recovery nonce, profile, tool receipt fields, and --acknowledge-no-live-writer');
    if (!/^[a-f0-9]{64}$/.test(recoveryNonce) || !/^[a-f0-9]{64}$/.test(toolReceiptSha256) || !/^[a-f0-9]{64}$/.test(toolAuthorityIndexSha256)) throw new Error('Register recovery hashes/nonces must be lowercase SHA-256');
  }
  return { command, root, proposalPath, operation, expectedCurrentIndexSha256, toolProfile, action, canonicalArgvSha256, inputSetSha256, executableBehaviorSha256, networkAuthorizationSha256, invocationIntentId, transactionId, fromLock: fromLock || undefined, recoveryNonce, acknowledgeNoLiveWriter: acknowledgeNoLiveWriter || undefined, sourceRegisterPath, sourceReviewsPath, registerDeltaPath, nextRegisterPath, sourceGenerationsPath, toolReceiptId, toolReceiptSha256, toolAuthorityIndexSha256, toolAuthorityTransactionId, overlapUniversePath, overlapRecordsPath, overlapPolicyPath, overlapNormalizersPath, overlapBytesRoot, overlapToolSnapshotPath, generation, inputGenerationSha256, expectedCurrentGenerationSha256, selectedGenerationSha256, outputSetSha256, exitCode, observedResourceUsage, joinStaticAuthority: joinStaticAuthority || undefined };
}

async function main(): Promise<void> {
  let requestedCommand = 'evidence:verify';
  try {
    requestedCommand = process.argv[2] ?? requestedCommand;
    const args = parse(process.argv.slice(2));
    if (args.command === 'tool-authority:intent') {
      const result = await publishAdmissionToolInvocationIntent({
        toolAuthorityRoot: toolAuthorityRootFor(args.root),
        profileId: args.toolProfile!,
        action: args.action!,
        canonicalArgvSha256: args.canonicalArgvSha256!,
        inputSetSha256: args.inputSetSha256!,
        executableBehaviorSha256: args.executableBehaviorSha256!,
        networkAuthorizationSha256: args.networkAuthorizationSha256,
      });
      output({ ok: true, command: args.command, ...result });
      return;
    }
    if (args.command === 'tool-authority:receipt') {
      let observedResourceUsage: unknown;
      try { observedResourceUsage = JSON.parse(args.observedResourceUsage!); } catch { throw new Error('--observed-resource-usage must be a JSON object'); }
      if (!observedResourceUsage || typeof observedResourceUsage !== 'object' || Array.isArray(observedResourceUsage)) throw new Error('--observed-resource-usage must be a JSON object');
      const result = await publishAdmissionToolReceipt({
        toolAuthorityRoot: toolAuthorityRootFor(args.root),
        invocationIntentId: args.invocationIntentId!,
        observedResourceUsage: observedResourceUsage as Readonly<Record<string, number>>,
        exitCode: args.exitCode!,
        outputSetSha256: args.outputSetSha256!,
      });
      output({ ok: true, command: args.command, ...result });
      return;
    }
    if (args.command === 'tool-authority:resolve') {
      let expectedSnapshot: unknown;
      if (args.overlapToolSnapshotPath !== undefined) {
        const snapshotPath = await requireContainedAdmissionPath(args.root, args.overlapToolSnapshotPath);
        const snapshotBytes = await readFile(snapshotPath);
        try { expectedSnapshot = JSON.parse(snapshotBytes.toString('utf8')) as unknown; } catch { throw new Error('--tool-snapshot is not valid JSON'); }
        if (calibrationAdmissionCanonicalJson(expectedSnapshot) !== snapshotBytes.toString('utf8')) throw new Error('--tool-snapshot is not canonical JSON');
      }
      const resolved = await resolveAdmissionToolAuthorityReceipt({
        authorityRoot: args.root,
        authorityIndexSha256: args.toolAuthorityIndexSha256!,
        receiptId: args.toolReceiptId!,
        receiptSha256: args.toolReceiptSha256!,
        invocationIntentId: args.invocationIntentId!,
        profileId: args.toolProfile!,
        action: args.action!,
        expectedSnapshot,
      });
      output({
        ok: true,
        command: args.command,
        authorityIndexSha256: resolved.authorityIndexSha256,
        receiptId: resolved.receipt.receiptId,
        receiptSha256: resolved.receiptSha256,
        invocationIntentId: resolved.invocationIntent.intentId,
        profileId: resolved.profile.profileId,
        action: resolved.receipt.action,
        exitCode: resolved.receipt.exitCode,
        outputSetSha256: resolved.receipt.outputSetSha256,
        snapshot: resolved.snapshot,
      });
      return;
    }
    if (args.command === 'authority:overlap:verify') {
      const result = await verifyAdmissionOverlap(
        args.root,
        args.selectedGenerationSha256,
        args.joinStaticAuthority
          ? {
            staticAuthorityJoin: {
              receiptId: args.toolReceiptId!,
              receiptSha256: args.toolReceiptSha256!,
              authorityIndexSha256: args.toolAuthorityIndexSha256!,
              invocationIntentId: args.invocationIntentId!,
            },
          }
          : undefined,
      );
      output({ ok: result.ok, command: args.command, ...result });
      if (!result.ok) process.exitCode = 2;
      return;
    }
    if (args.command === 'authority:overlap:recover') {
      const result = await recoverAdmissionOverlap({
        root: args.root,
        transactionId: args.transactionId,
        fromLock: args.fromLock,
        recoveryNonce: args.recoveryNonce!,
        toolReceipt: { receiptId: args.toolReceiptId!, receiptSha256: args.toolReceiptSha256!, authorityIndexSha256: args.toolAuthorityIndexSha256! },
        acknowledgeNoLiveWriter: true,
      });
      if (!result.complete) {
        process.stderr.write(`${JSON.stringify({ ok: false, command: args.command, ...result })}\n`);
        process.exitCode = 2;
        return;
      }
      output({ ok: true, command: args.command, ...result });
      return;
    }
    if (args.command === 'authority:overlap') {
      const readJsonInput = async (path: string): Promise<unknown> => {
        const bytes = await readFile(await requireContainedAdmissionPath(args.root, path));
        try { return JSON.parse(bytes.toString('utf8')) as unknown; } catch { throw new Error(`Overlap input is not valid JSON: ${path}`); }
      };
      const universe = await readJsonInput(args.overlapUniversePath!);
      const policy = await readJsonInput(args.overlapPolicyPath!);
      const normalizerRegistry = await readJsonInput(args.overlapNormalizersPath!);
      const toolAuthoritySnapshot = await readJsonInput(args.overlapToolSnapshotPath!);
      const recordsPath = await requireContainedAdmissionPath(args.root, args.overlapRecordsPath!);
      await requireContainedAdmissionPath(args.root, args.overlapBytesRoot!);
      const stream = openAdmissionOverlapUniverseStream(createReadStream(recordsPath), universe as never, normalizerRegistry as never);
      const workDirectory = await mkdtemp(join(args.root, '.overlap-builder-'));
      try {
        const buildResult = await buildAdmissionOverlapLedger(
          universe as never,
          stream.records,
          async (record) => {
            const locator = (record as unknown as { locator?: { normalizedPath?: unknown } }).locator;
            if (typeof locator?.normalizedPath !== 'string') throw new Error('Overlap record locator has no normalized path');
            return readFile(await requireContainedAdmissionPath(args.root, join(args.overlapBytesRoot!, locator.normalizedPath)));
          },
          workDirectory,
          policy as never,
          normalizerRegistry as never,
        );
        const streamStats = await stream.complete;
        if (!streamStats.ok) throw new Error(`Overlap record stream is not authoritative: ${streamStats.errors.join('; ')}`);
        const result = await publishAdmissionOverlap({
          root: args.root,
          generationLocalRoot: workDirectory,
          buildResult,
          universe: universe as never,
          policy: policy as never,
          normalizerRegistry: normalizerRegistry as never,
          generation: args.generation!,
          inputGenerationSha256: args.inputGenerationSha256!,
          invocationIntentId: args.invocationIntentId!,
          toolAuthoritySnapshot: toolAuthoritySnapshot as never,
          toolReceipt: { receiptId: args.toolReceiptId!, receiptSha256: args.toolReceiptSha256!, authorityIndexSha256: args.toolAuthorityIndexSha256! },
          operation: args.operation,
          expectedCurrentGenerationSha256: args.expectedCurrentGenerationSha256,
          recoveryNonce: args.recoveryNonce,
        });
        if (result.complete) await rm(workDirectory, { recursive: true, force: true });
        output({ ok: true, command: args.command, ...result });
        return;
      } catch (error) {
        // Publication journals contain a complete transaction-owned staging
        // tree before any pending boundary; the builder scratch directory is
        // never needed for recovery and must not accumulate as an orphan.
        await rm(workDirectory, { recursive: true, force: true });
        throw error;
      }
    }
    if (args.command === 'acquisition:publish') {
      const proposalPath = args.proposalPath!;
      const proposalBytes = await readFile(await requireContainedAdmissionPath(args.root, proposalPath));
      let proposal: unknown;
      try { proposal = JSON.parse(proposalBytes.toString('utf8')) as unknown; } catch { throw new Error('Publication proposal is not valid JSON'); }
      if (!proposal || typeof proposal !== 'object' || Array.isArray(proposal)) throw new Error('Publication proposal must be a JSON object');
      const record = proposal as Record<string, unknown>;
      if (record.operation !== args.operation) throw new Error('CLI --operation does not match publication proposal');
      const expected = args.expectedCurrentIndexSha256;
      if (args.operation === 'create' && (record.expectedCurrentState as Record<string, unknown> | undefined)?.kind !== 'absent') throw new Error('create requires an absent expected-current state in the proposal');
      if (args.operation === 'replace' && ((record.expectedCurrentState as Record<string, unknown> | undefined)?.indexSha256 !== expected)) throw new Error('CLI expected-current hash does not match proposal');
      const result = await publishAcquisitionPublication({ root: args.root, proposal, proposalPath, invocationIntentId: args.invocationIntentId });
      if (!result.complete) {
        process.stderr.write(`${JSON.stringify({ ok: false, command: args.command, ...result })}\n`);
        process.exitCode = 2;
        return;
      }
      output({ ok: true, command: args.command, ...result });
      return;
    }
    if (args.command === 'acquisition:recover-publication') {
      const result = await recoverAcquisitionPublication({ root: args.root, transactionId: args.transactionId, fromLock: args.fromLock, recoveryNonce: args.recoveryNonce!, invocationIntentId: args.invocationIntentId, acknowledgeNoLiveWriter: true });
      if (!result.complete) {
        process.stderr.write(`${JSON.stringify({ ok: false, command: args.command, ...result })}\n`);
        process.exitCode = 2;
        return;
      }
      output({ ok: true, command: args.command, ...result });
      return;
    }
    if (args.command === 'tool-authority:recover') {
      const result = await recoverToolAuthorityPublication({
        root: args.root,
        transactionId: args.transactionId,
        fromLock: args.fromLock,
        recoveryNonce: args.recoveryNonce!,
        acknowledgeNoLiveWriter: true,
      });
      if (!result.complete) {
        process.stderr.write(`${JSON.stringify({ ok: false, command: args.command, ...result })}\n`);
        process.exitCode = 2;
        return;
      }
      output({ ok: true, command: args.command, ...result });
      return;
    }
    if (args.command === 'register:publish-round') {
      const readJsonInput = async (path: string): Promise<unknown> => {
        const bytes = await readFile(await requireContainedAdmissionPath(args.root, path));
        try { return JSON.parse(bytes.toString('utf8')) as unknown; } catch { throw new Error(`Register input is not valid JSON: ${path}`); }
      };
      const delta = await readJsonInput(args.registerDeltaPath!);
      const nextRegister = await readJsonInput(args.nextRegisterPath!);
      const sourceValue = await readJsonInput(args.sourceGenerationsPath!);
      if (!Array.isArray(sourceValue)) throw new Error('Register source generations must be a JSON array');
      const sourceGenerations = sourceValue.map((entry) => {
        if (!entry || typeof entry !== 'object' || Array.isArray(entry)) throw new Error('Register source generation rows must be objects');
        const row = entry as Record<string, unknown>;
        if (typeof row.sourceId !== 'string' || typeof row.bytesBase64 !== 'string') throw new Error('Register source generation rows require sourceId and bytesBase64');
        return { sourceId: row.sourceId, bytes: Buffer.from(row.bytesBase64, 'base64'), proposalId: typeof row.proposalId === 'string' ? row.proposalId : undefined, artifactSetSha256: typeof row.artifactSetSha256 === 'string' ? row.artifactSetSha256 : undefined };
      });
      const result = await publishRegisterGeneration({
        root: args.root,
        delta,
        nextRegister,
        sourceGenerations,
        invocationIntentId: args.invocationIntentId!,
        toolReceipt: { receiptId: args.toolReceiptId!, receiptSha256: args.toolReceiptSha256!, authorityIndexSha256: args.toolAuthorityIndexSha256!, publicationTransactionId: args.toolAuthorityTransactionId! },
      });
      output({ ok: true, command: args.command, ...result });
      return;
    }
    if (args.command === 'register:recover') {
      const result = await recoverRegisterGeneration({
        root: args.root,
        transactionId: args.transactionId,
        recoveryNonce: args.recoveryNonce!,
        toolReceipt: { receiptId: args.toolReceiptId!, receiptSha256: args.toolReceiptSha256!, authorityIndexSha256: args.toolAuthorityIndexSha256!, publicationTransactionId: args.toolAuthorityTransactionId! },
        acknowledgeNoLiveWriter: true,
      });
      output({ ok: true, command: args.command, ...result });
      return;
    }
    const verified = await buildVerifiedAdmissionEvidenceContext(args.root, { expectedProfileId: args.toolProfile, expectedInvocationIntentId: args.invocationIntentId });
    if (!verified.ok) {
      output({ ok: false, command: args.command, errors: verified.errors });
      process.exitCode = 2;
      return;
    }
    if (args.command === 'source:census') {
      const registerBytes = await readFile(await requireContainedAdmissionPath(args.root, args.sourceRegisterPath!));
      const reviewBytes = await readFile(await requireContainedAdmissionPath(args.root, args.sourceReviewsPath!));
      let sourceRegister: unknown;
      let sourceReviews: unknown;
      try {
        sourceRegister = JSON.parse(registerBytes.toString('utf8')) as unknown;
        sourceReviews = JSON.parse(reviewBytes.toString('utf8')) as unknown;
      } catch {
        throw new Error('source:census register/reviews input is not valid JSON');
      }
      if (!Array.isArray(sourceReviews)) throw new Error('source:census source reviews must be a JSON array');
      const diagnostic = buildAdmissionSourceCensus({ context: verified.context, sourceRegister, sourceReviews });
      output({ ok: true, command: args.command, ...diagnostic });
      return;
    }
    output({
      ok: true,
      command: args.command,
      evidenceContextSha256: verified.context.evidenceContextSha256,
      bundleSha256: verified.context.bundle.bundleSha256,
      verifiedEvidenceIds: verified.context.verifiedEvidenceIds,
      unavailableEvidenceIds: verified.context.unavailableEvidenceIds,
    });
  } catch (error) {
    if (error instanceof OverlapPublicationPostCompletionError) {
      output({ ok: true, command: requestedCommand, ...error.result, warning: error.message });
      return;
    }
    if (error instanceof OverlapPublicationContendedError) {
      process.stderr.write(`${JSON.stringify({ ok: false, command: requestedCommand, ...error.result, error: error.message })}\n`);
      process.exitCode = 2;
      return;
    }
    if (error instanceof AcquisitionPublicationPendingError || error instanceof RegisterPublicationPendingError || error instanceof OverlapPublicationPendingError) {
      process.stderr.write(`${JSON.stringify({ ok: false, command: requestedCommand, ...error.result })}\n`);
      process.exitCode = 2;
      return;
    }
    const failure = JSON.stringify({ ok: false, command: requestedCommand, errors: [error instanceof Error ? error.message : String(error)] });
    if (requestedCommand.startsWith('acquisition:') || requestedCommand.startsWith('register:') || requestedCommand === 'tool-authority:recover') process.stderr.write(`${failure}\n`);
    else output(JSON.parse(failure));
    process.exitCode = 2;
  }
}

void main();
