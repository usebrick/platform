import type { CalibrationAdmissionPreWitnessBundleV1 } from './generated/calibration-admission-pre-witness-bundle';
import type { CalibrationAdmissionPolicyV1, AdmissionWitnessPolicyV1, CalibrationAdmissionToolProfileV1, CalibrationAdmissionInvocationIntentV1, CalibrationAdmissionToolReceiptV1, CalibrationAdmissionToolAuthoritySnapshotV1, CalibrationAdmissionEvidenceIndexV1, CalibrationAdmissionEvidencePayloadSetV1 } from './calibration-admission-evidence';
import {
  calibrationAdmissionCanonicalJson,
  calibrationAdmissionSha256,
  expandAdmissionWitnessConstraints,
  isAdmissionWitnessPolicyV1,
  isCalibrationAdmissionAcquisitionSnapshotV1,
  isCalibrationAdmissionEvidenceIndexV1,
  isCalibrationAdmissionEvidencePayloadSetV1,
  isCalibrationAdmissionEvidenceReceiptV1,
  isCalibrationAdmissionInvocationIntentV1,
  isCalibrationAdmissionPolicyV1,
  isCalibrationAdmissionToolAuthoritySnapshotV1,
  isCalibrationAdmissionToolProfileV1,
  isCalibrationAdmissionToolReceiptV1,
  isCalibrationApprovedEvidenceAcquisitionV1,
  isCalibrationAdmissionMaterializationReceiptV1,
  isCalibrationEvidenceAcquisitionEnvelopeV1,
  isCalibrationEvidenceAcquisitionReceiptV1,
} from './calibration-admission-evidence';
import {
  isCalibrationAcquisitionRoundAuthorizationV1,
  isCalibrationApprovedAcquisitionV1,
  isCalibrationAcquisitionReceiptV1,
  isCalibrationAcquisitionRoundReceiptV1,
} from './calibration-admission-acquisition-round';
import {
  isCalibrationAdmissionSourceRegisterV1,
  isCalibrationSourceReviewV103,
} from './calibration-admission-review';
import {
  isCalibrationAdmissionRegisterDeltaV1,
  isCalibrationRegisterGenerationReceiptV1,
} from './calibration-admission-register-authority';
import {
  isCalibrationAdmissionReviewSampleV1,
  isCalibrationAdmissionDecisionLedgerV1,
  isCalibrationAdmissionDecisionV103,
  validateCalibrationAdmissionRecordStreamV1,
} from './calibration-admission-record-authority';
import {
  isCalibrationAdmissionBlindAssignmentV1,
  isCalibrationAdmissionBlindReviewReceiptV1,
  validateCalibrationHistoricalTemporalAttestation,
} from './calibration-admission-blind-temporal';
import {
  isCalibrationAdmissionNormalizerRegistryV1,
  isCalibrationAdmissionOverlapPolicyV1,
  isCalibrationAdmissionOverlapUniverseV1,
} from './calibration-admission-overlap';
import {
  isCalibrationAdmissionOverlapIndexReceiptV1,
  isCalibrationAdmissionOverlapResourceReceiptV1,
  isCalibrationAdmissionOverlapLedgerV1,
} from './calibration-admission-overlap-artifacts';
import {
  isCalibrationAdmissionPrivacyLedgerV1,
} from './calibration-admission-privacy';
import {
  isCalibrationAdmissionQualityLedgerV1,
} from './calibration-admission-quality';
import {
  isCalibrationAdmissionLineageLedgerV1,
} from './calibration-admission-lineage';
import {
  exactKeys,
  isJsonRecord,
  isSha256,
  sortedUniqueByPredicate,
  withoutJsonKey,
} from './calibration-admission-primitives';

export type { CalibrationAdmissionPreWitnessBundleV1 } from './generated/calibration-admission-pre-witness-bundle';

export interface CalibrationAdmissionPreWitnessBundleValidationV1 {
  readonly ok: true;
  readonly value: CalibrationAdmissionPreWitnessBundleV1;
}

export interface CalibrationAdmissionPreWitnessBundleValidationFailureV1 {
  readonly ok: false;
  readonly errors: readonly string[];
}

export type CalibrationAdmissionPreWitnessBundleValidationResultV1 =
  | CalibrationAdmissionPreWitnessBundleValidationV1
  | CalibrationAdmissionPreWitnessBundleValidationFailureV1;

const MAX_CORPUS_ITEMS = 452_382;
const MAX_TOOL_PROFILES = 12;
const RECORD_STREAM_PATH = 'review/admission/admission-records.jsonl';
const VERSION = 'v10.3-admission-pre-witness-bundle-v1';
const BUNDLE_KEYS = [
  'version',
  'policy',
  'witnessPolicies',
  'toolProfiles',
  'invocationIntents',
  'toolReceipts',
  'toolAuthoritySnapshot',
  'sourceRegister',
  'registerDeltas',
  'registerGenerationReceipts',
  'sourceReviews',
  'reviewSamples',
  'decisionLedgers',
  'admissionRecordStream',
  'preWitnessDecisions',
  'preWitnessBlindAssignments',
  'preWitnessBlindReviewReceipts',
  'temporalAttestations',
  'evidenceIndex',
  'evidencePayloadSet',
  'approvedEvidenceAcquisitions',
  'evidenceAcquisitionReceipts',
  'evidenceAcquisitionEnvelopes',
  'acquisitionAuthoritySnapshot',
  'evidenceReceipts',
  'approvedSourceAcquisitions',
  'approvedSourceAcquisitionRounds',
  'sourceAcquisitionReceipts',
  'sourceAcquisitionRoundReceipts',
  'materializationReceipts',
  'normalizerRegistry',
  'overlapPolicy',
  'overlapUniverse',
  'overlapIndexReceipt',
  'overlapResourceReceipt',
  'overlapLedger',
  'privacyLedger',
  'qualityLedger',
  'lineageLedger',
  'preWitnessBundleSha256',
] as const;

type RecordValue = Record<string, unknown>;

function result(ok: boolean, errors: readonly string[], value?: CalibrationAdmissionPreWitnessBundleV1): CalibrationAdmissionPreWitnessBundleValidationResultV1 {
  return ok && value !== undefined ? { ok: true, value } : { ok: false, errors };
}

function record(value: unknown): RecordValue | undefined {
  return isJsonRecord(value) ? value : undefined;
}

function array(value: unknown, name: string, errors: string[]): value is readonly unknown[] {
  if (!Array.isArray(value)) {
    errors.push(`${name} must be an array`);
    return false;
  }
  if (value.length > MAX_CORPUS_ITEMS) errors.push(`${name} exceeds the ${MAX_CORPUS_ITEMS} item bound`);
  return true;
}

function stableArray(
  value: unknown,
  name: string,
  idKey: string,
  errors: string[],
  maximum = MAX_CORPUS_ITEMS,
): value is readonly RecordValue[] {
  if (!Array.isArray(value)) {
    errors.push(`${name} must be an array`);
    return false;
  }
  if (value.length > maximum) errors.push(`${name} exceeds its bounded item limit`);
  let previous = '';
  let ok = true;
  for (const entry of value) {
    const child = record(entry);
    const id = child?.[idKey];
    if (typeof id !== 'string' || id.length === 0 || id <= previous) ok = false;
    if (typeof id === 'string') previous = id;
  }
  if (!ok) errors.push(`${name} must be sorted and duplicate-free by ${idKey}`);
  return value.every((entry): entry is RecordValue => record(entry) !== undefined);
}

function sortedStringArray(value: unknown, name: string, errors: string[], maximum = MAX_CORPUS_ITEMS): void {
  if (!Array.isArray(value) || value.length > maximum || !sortedUniqueByPredicate(value, (entry) => typeof entry === 'string')) {
    errors.push(`${name} must be sorted, duplicate-free, and bounded`);
  }
}

function guard(name: string, value: unknown, predicate: (candidate: unknown) => boolean, errors: string[]): boolean {
  try {
    if (predicate(value)) return true;
  } catch {
    // Every component guard is pure and should fail closed even for hostile values.
  }
  errors.push(`${name} is invalid`);
  return false;
}

function witnessContamination(value: unknown): boolean {
  if (Array.isArray(value)) return value.some(witnessContamination);
  const child = record(value);
  if (child === undefined) return false;
  const kind = typeof child.kind === 'string' ? child.kind.toLowerCase() : '';
  const version = typeof child.version === 'string' ? child.version.toLowerCase() : '';
  if (kind === 'witness' || kind === 'witness_target_assignment' || kind === 'witness_decision' || kind === 'witness_receipt' || kind === 'search_receipt' || kind === 'witness_review') return true;
  if (version.includes('search-receipt') || version.includes('search-result') || version.includes('witness-review') || version.includes('witness-target')) return true;
  if (child.target !== undefined && record(child.target)?.kind === 'witness') return true;
  for (const key of ['witnessSha256', 'eligibilitySnapshotSha256', 'verifiedContextSha256', 'searchReceiptSha256', 'witnessReviewSha256']) {
    if (Object.prototype.hasOwnProperty.call(child, key)) return true;
  }
  return Object.values(child).some(witnessContamination);
}

function witnessAction(value: unknown): boolean {
  const child = record(value);
  return typeof child?.action === 'string' && child.action.startsWith('witness:');
}

function validateArrayGuards(value: RecordValue, errors: string[]): void {
  const profiles = Array.isArray(value.toolProfiles) ? value.toolProfiles : [];
  stableArray(profiles, 'toolProfiles', 'profileId', errors, MAX_TOOL_PROFILES);
  if (!Array.isArray(profiles) || profiles.length > MAX_TOOL_PROFILES) errors.push('toolProfiles exceeds the frozen profile set');
  for (const profile of profiles) guard('tool profile', profile, isCalibrationAdmissionToolProfileV1, errors);
  const policyValid = guard('policy', value.policy, (candidate) => isCalibrationAdmissionPolicyV1(candidate, profiles), errors);
  if (!policyValid) errors.push('policy is invalid or does not bind the exact tool profile set');

  if (!Array.isArray(value.witnessPolicies) || value.witnessPolicies.length !== 2) {
    errors.push('witnessPolicies must contain exactly smoke and canary');
  } else {
    const witnessPolicies = value.witnessPolicies;
    if (record(witnessPolicies[0])?.gate !== 'smoke' || record(witnessPolicies[1])?.gate !== 'canary') errors.push('witnessPolicies must be ordered smoke then canary');
    for (const witness of witnessPolicies) guard('witness policy', witness, (candidate) => policyValid && isAdmissionWitnessPolicyV1(candidate, value.policy as CalibrationAdmissionPolicyV1), errors);
    for (const [index, gate] of (['smoke', 'canary'] as const).entries()) {
      const witness = record(witnessPolicies[index]);
      if (policyValid && witness !== undefined && witness.gate === gate) {
        const expected = expandAdmissionWitnessConstraints(value.policy as unknown as CalibrationAdmissionPolicyV1, gate);
        if (calibrationAdmissionCanonicalJson(witness.constraints) !== calibrationAdmissionCanonicalJson(expected)) errors.push(`${gate} witness policy is not the exact policy expansion`);
      }
    }
  }

  const profileById = new Map<string, CalibrationAdmissionToolProfileV1>();
  for (const profile of profiles) if (record(profile)?.profileId && isCalibrationAdmissionToolProfileV1(profile)) profileById.set(String(record(profile)!.profileId), profile as CalibrationAdmissionToolProfileV1);
  const intents = Array.isArray(value.invocationIntents) ? value.invocationIntents : [];
  stableArray(intents, 'invocationIntents', 'intentId', errors);
  for (const intent of intents) {
    const child = record(intent);
    const profile = child === undefined ? undefined : profileById.get(String(child.profileId));
    guard('invocation intent', intent, (candidate) => profile !== undefined && isCalibrationAdmissionInvocationIntentV1(candidate, profile), errors);
    if (witnessAction(intent)) errors.push('witness/search invocation intents are forbidden in the pre-witness bundle');
  }
  const intentById = new Map<string, CalibrationAdmissionInvocationIntentV1>();
  for (const intent of intents) if (record(intent)?.intentId && isCalibrationAdmissionInvocationIntentV1(intent, profileById.get(String(record(intent)!.profileId)))) intentById.set(String(record(intent)!.intentId), intent as CalibrationAdmissionInvocationIntentV1);
  const receipts = Array.isArray(value.toolReceipts) ? value.toolReceipts : [];
  stableArray(receipts, 'toolReceipts', 'receiptId', errors);
  for (const receipt of receipts) {
    const child = record(receipt);
    const intent = child === undefined ? undefined : intentById.get(String(child.invocationIntentId));
    const profile = intent === undefined ? undefined : profileById.get(intent.profileId);
    guard('tool receipt', receipt, (candidate) => profile !== undefined && intent !== undefined && isCalibrationAdmissionToolReceiptV1(candidate, profile, intent), errors);
    if (witnessAction(receipt)) errors.push('witness/search tool receipts are forbidden in the pre-witness bundle');
  }
  guard('tool authority snapshot', value.toolAuthoritySnapshot, isCalibrationAdmissionToolAuthoritySnapshotV1, errors);
  const authority = record(value.toolAuthoritySnapshot);
  if (authority !== undefined) {
    sortedStringArray(authority.profileIds, 'tool authority profileIds', errors, MAX_TOOL_PROFILES);
    sortedStringArray(authority.invocationIntentIds, 'tool authority invocationIntentIds', errors);
    sortedStringArray(authority.receiptIds, 'tool authority receiptIds', errors);
    if (JSON.stringify(authority.profileIds) !== JSON.stringify(profiles.map((candidate) => String(record(candidate)?.profileId)).sort())) errors.push('tool authority profileIds do not match tool profiles');
    if (JSON.stringify(authority.invocationIntentIds) !== JSON.stringify(intents.map((candidate) => String(record(candidate)?.intentId)).sort())) errors.push('tool authority invocationIntentIds do not match invocation intents');
    if (JSON.stringify(authority.receiptIds) !== JSON.stringify(receipts.map((candidate) => String(record(candidate)?.receiptId)).sort())) errors.push('tool authority receiptIds do not match tool receipts');
  }

  guard('source register', value.sourceRegister, isCalibrationAdmissionSourceRegisterV1, errors);
  const sourceRegister = record(value.sourceRegister);
  if (sourceRegister !== undefined) {
    sortedStringArray(sourceRegister.appliedDeltaIds, 'source register appliedDeltaIds', errors);
    stableArray(sourceRegister.entries, 'source register entries', 'sourceId', errors);
  }
  stableArray(value.registerDeltas, 'registerDeltas', 'deltaId', errors);
  for (const entry of array(value.registerDeltas, 'registerDeltas', errors) ? value.registerDeltas : []) guard('register delta', entry, isCalibrationAdmissionRegisterDeltaV1, errors);
  stableArray(value.registerGenerationReceipts, 'registerGenerationReceipts', 'receiptId', errors);
  for (const entry of array(value.registerGenerationReceipts, 'registerGenerationReceipts', errors) ? value.registerGenerationReceipts : []) guard('register generation receipt', entry, isCalibrationRegisterGenerationReceiptV1, errors);
  stableArray(value.sourceReviews, 'sourceReviews', 'sourceId', errors);
  for (const entry of array(value.sourceReviews, 'sourceReviews', errors) ? value.sourceReviews : []) guard('source review', entry, isCalibrationSourceReviewV103, errors);
  stableArray(value.reviewSamples, 'reviewSamples', 'sampleId', errors);
  for (const entry of array(value.reviewSamples, 'reviewSamples', errors) ? value.reviewSamples : []) guard('review sample', entry, isCalibrationAdmissionReviewSampleV1, errors);
  stableArray(value.decisionLedgers, 'decisionLedgers', 'ledgerId', errors);
  for (const entry of array(value.decisionLedgers, 'decisionLedgers', errors) ? value.decisionLedgers : []) guard('decision ledger', entry, isCalibrationAdmissionDecisionLedgerV1, errors);

  const streamValidation = validateCalibrationAdmissionRecordStreamV1(value.admissionRecordStream);
  if (!streamValidation.ok) errors.push(...streamValidation.errors.map((error) => `admission record stream: ${error}`));
  const stream = record(value.admissionRecordStream);
  if (stream !== undefined && (stream.relativePath !== RECORD_STREAM_PATH || typeof stream.recordCount !== 'number' || !Number.isSafeInteger(stream.recordCount) || stream.recordCount < 0 || stream.recordCount > MAX_CORPUS_ITEMS)) errors.push('admission record stream count/path is invalid');

  stableArray(value.preWitnessDecisions, 'preWitnessDecisions', 'decisionId', errors);
  for (const entry of array(value.preWitnessDecisions, 'preWitnessDecisions', errors) ? value.preWitnessDecisions : []) guard('pre-witness decision', entry, isCalibrationAdmissionDecisionV103, errors);
  stableArray(value.preWitnessBlindAssignments, 'preWitnessBlindAssignments', 'assignmentId', errors);
  for (const entry of array(value.preWitnessBlindAssignments, 'preWitnessBlindAssignments', errors) ? value.preWitnessBlindAssignments : []) guard('pre-witness blind assignment', entry, isCalibrationAdmissionBlindAssignmentV1, errors);
  stableArray(value.preWitnessBlindReviewReceipts, 'preWitnessBlindReviewReceipts', 'receiptId', errors);
  for (const entry of array(value.preWitnessBlindReviewReceipts, 'preWitnessBlindReviewReceipts', errors) ? value.preWitnessBlindReviewReceipts : []) guard('pre-witness blind review receipt', entry, isCalibrationAdmissionBlindReviewReceiptV1, errors);
  stableArray(value.temporalAttestations, 'temporalAttestations', 'attestationId', errors);
  for (const entry of array(value.temporalAttestations, 'temporalAttestations', errors) ? value.temporalAttestations : []) guard('temporal attestation', entry, (candidate) => validateCalibrationHistoricalTemporalAttestation(candidate).ok, errors);

  guard('evidence index', value.evidenceIndex, isCalibrationAdmissionEvidenceIndexV1, errors);
  const evidenceIndex = isCalibrationAdmissionEvidenceIndexV1(value.evidenceIndex) ? value.evidenceIndex as CalibrationAdmissionEvidenceIndexV1 : undefined;
  guard('evidence payload set', value.evidencePayloadSet, (candidate) => evidenceIndex !== undefined && isCalibrationAdmissionEvidencePayloadSetV1(candidate, evidenceIndex), errors);
  const payloadSet = evidenceIndex !== undefined && isCalibrationAdmissionEvidencePayloadSetV1(value.evidencePayloadSet, evidenceIndex) ? value.evidencePayloadSet as CalibrationAdmissionEvidencePayloadSetV1 : undefined;
  stableArray(value.approvedEvidenceAcquisitions, 'approvedEvidenceAcquisitions', 'authorizationId', errors);
  for (const entry of array(value.approvedEvidenceAcquisitions, 'approvedEvidenceAcquisitions', errors) ? value.approvedEvidenceAcquisitions : []) guard('approved evidence acquisition', entry, isCalibrationApprovedEvidenceAcquisitionV1, errors);
  stableArray(value.evidenceAcquisitionReceipts, 'evidenceAcquisitionReceipts', 'receiptId', errors);
  for (const entry of array(value.evidenceAcquisitionReceipts, 'evidenceAcquisitionReceipts', errors) ? value.evidenceAcquisitionReceipts : []) guard('evidence acquisition receipt', entry, isCalibrationEvidenceAcquisitionReceiptV1, errors);
  stableArray(value.evidenceAcquisitionEnvelopes, 'evidenceAcquisitionEnvelopes', 'envelopeId', errors);
  for (const entry of array(value.evidenceAcquisitionEnvelopes, 'evidenceAcquisitionEnvelopes', errors) ? value.evidenceAcquisitionEnvelopes : []) guard('evidence acquisition envelope', entry, isCalibrationEvidenceAcquisitionEnvelopeV1, errors);
  guard('acquisition authority snapshot', value.acquisitionAuthoritySnapshot, isCalibrationAdmissionAcquisitionSnapshotV1, errors);
  const acquisitionSnapshot = record(value.acquisitionAuthoritySnapshot);
  if (acquisitionSnapshot !== undefined) sortedStringArray(acquisitionSnapshot.artifactKeys, 'acquisition authority artifactKeys', errors);
  stableArray(value.evidenceReceipts, 'evidenceReceipts', 'receiptId', errors);
  for (const entry of array(value.evidenceReceipts, 'evidenceReceipts', errors) ? value.evidenceReceipts : []) guard('evidence receipt', entry, (candidate) => payloadSet !== undefined && evidenceIndex !== undefined && isCalibrationAdmissionEvidenceReceiptV1(candidate, evidenceIndex, payloadSet), errors);
  stableArray(value.approvedSourceAcquisitions, 'approvedSourceAcquisitions', 'authorizationId', errors);
  for (const entry of array(value.approvedSourceAcquisitions, 'approvedSourceAcquisitions', errors) ? value.approvedSourceAcquisitions : []) guard('approved source acquisition', entry, isCalibrationApprovedAcquisitionV1, errors);
  stableArray(value.approvedSourceAcquisitionRounds, 'approvedSourceAcquisitionRounds', 'roundId', errors);
  for (const entry of array(value.approvedSourceAcquisitionRounds, 'approvedSourceAcquisitionRounds', errors) ? value.approvedSourceAcquisitionRounds : []) guard('approved source acquisition round', entry, isCalibrationAcquisitionRoundAuthorizationV1, errors);
  stableArray(value.sourceAcquisitionReceipts, 'sourceAcquisitionReceipts', 'receiptId', errors);
  for (const entry of array(value.sourceAcquisitionReceipts, 'sourceAcquisitionReceipts', errors) ? value.sourceAcquisitionReceipts : []) guard('source acquisition receipt', entry, isCalibrationAcquisitionReceiptV1, errors);
  stableArray(value.sourceAcquisitionRoundReceipts, 'sourceAcquisitionRoundReceipts', 'receiptId', errors);
  for (const entry of array(value.sourceAcquisitionRoundReceipts, 'sourceAcquisitionRoundReceipts', errors) ? value.sourceAcquisitionRoundReceipts : []) guard('source acquisition round receipt', entry, isCalibrationAcquisitionRoundReceiptV1, errors);
  stableArray(value.materializationReceipts, 'materializationReceipts', 'receiptId', errors);
  for (const entry of array(value.materializationReceipts, 'materializationReceipts', errors) ? value.materializationReceipts : []) guard('materialization receipt', entry, isCalibrationAdmissionMaterializationReceiptV1, errors);

  guard('normalizer registry', value.normalizerRegistry, isCalibrationAdmissionNormalizerRegistryV1, errors);
  guard('overlap policy', value.overlapPolicy, isCalibrationAdmissionOverlapPolicyV1, errors);
  guard('overlap universe', value.overlapUniverse, isCalibrationAdmissionOverlapUniverseV1, errors);
  guard('overlap index receipt', value.overlapIndexReceipt, isCalibrationAdmissionOverlapIndexReceiptV1, errors);
  guard('overlap resource receipt', value.overlapResourceReceipt, isCalibrationAdmissionOverlapResourceReceiptV1, errors);
  guard('overlap ledger', value.overlapLedger, isCalibrationAdmissionOverlapLedgerV1, errors);
  const overlapUniverse = record(value.overlapUniverse);
  if (overlapUniverse !== undefined) sortedStringArray(overlapUniverse.unresolvedCandidateUnitIds, 'overlap universe unresolvedCandidateUnitIds', errors);
  const overlapLedger = record(value.overlapLedger);
  if (overlapLedger !== undefined) {
    sortedStringArray(overlapLedger.unresolvedCandidateUnitIds, 'overlap ledger unresolvedCandidateUnitIds', errors);
    for (const key of ['edgeShards', 'adjacencyShards', 'clusterSummaryShards', 'clusterMembershipShards']) stableArray(overlapLedger[key], `overlap ledger ${key}`, 'relativePath', errors, 65_536);
  }

  const recordIds = [] as string[];
  for (const candidate of [value.privacyLedger, value.qualityLedger, value.lineageLedger]) {
    const child = record(candidate);
    if (Array.isArray(child?.coveredRecordIds)) for (const id of child.coveredRecordIds) if (typeof id === 'string') recordIds.push(id);
    if (Array.isArray(child?.unresolvedRecordIds)) for (const id of child.unresolvedRecordIds) if (typeof id === 'string') recordIds.push(id);
  }
  const admissionRecordIds = [...new Set(recordIds)].sort();
  guard('privacy ledger', value.privacyLedger, (candidate) => isCalibrationAdmissionPrivacyLedgerV1(candidate, admissionRecordIds), errors);
  guard('quality ledger', value.qualityLedger, (candidate) => isCalibrationAdmissionQualityLedgerV1(candidate, admissionRecordIds), errors);
  guard('lineage ledger', value.lineageLedger, (candidate) => isCalibrationAdmissionLineageLedgerV1(candidate, admissionRecordIds), errors);

  if (witnessContamination(value.preWitnessDecisions) || witnessContamination(value.preWitnessBlindAssignments) || witnessContamination(value.preWitnessBlindReviewReceipts)) errors.push('witness target, search receipt, or witness-review object is forbidden in the pre-witness bundle');
}

export function calibrationAdmissionPreWitnessBundleSha256(value: unknown): string {
  return calibrationAdmissionSha256(withoutJsonKey(value, 'preWitnessBundleSha256'));
}

export function validateCalibrationAdmissionPreWitnessBundleV1(input: unknown): CalibrationAdmissionPreWitnessBundleValidationResultV1 {
  const errors: string[] = [];
  const value = record(input);
  if (value === undefined) return { ok: false, errors: ['pre-witness bundle must be an object'] };
  if (!exactKeys(value, BUNDLE_KEYS)) errors.push('pre-witness bundle keys are invalid');
  if (value.version !== VERSION) errors.push('pre-witness bundle version is invalid');
  if (!isSha256(value.preWitnessBundleSha256)) errors.push('preWitnessBundleSha256 must be sha256');
  try {
    if (isSha256(value.preWitnessBundleSha256) && calibrationAdmissionPreWitnessBundleSha256(value) !== value.preWitnessBundleSha256) errors.push('preWitnessBundleSha256 does not match canonical bytes');
  } catch {
    errors.push('pre-witness bundle cannot be canonicalized');
  }
  validateArrayGuards(value, errors);
  if (errors.length > 0) return { ok: false, errors: [...new Set(errors)] };
  return result(true, [], input as CalibrationAdmissionPreWitnessBundleV1);
}

export function isCalibrationAdmissionPreWitnessBundleV1(value: unknown): value is CalibrationAdmissionPreWitnessBundleV1 {
  return validateCalibrationAdmissionPreWitnessBundleV1(value).ok;
}
