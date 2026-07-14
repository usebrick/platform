import { createHash } from 'node:crypto';

import type { CalibrationAdmissionPolicyV1 } from './generated/calibration-admission-policy';
import type { AdmissionWitnessPolicyV1 } from './generated/calibration-admission-witness-policy';
import type { CalibrationAdmissionToolProfileV1 } from './generated/calibration-admission-tool-profile';
import type { CalibrationAdmissionInvocationIntentV1 } from './generated/calibration-admission-invocation-intent';
import type { CalibrationAdmissionToolReceiptV1 } from './generated/calibration-admission-tool-receipt';
import type { CalibrationAdmissionEvidenceIndexV1 } from './generated/calibration-admission-evidence-index';
import type { CalibrationAdmissionEvidencePayloadV1 } from './generated/calibration-admission-evidence-payload';
import type { CalibrationAdmissionEvidencePayloadSetV1 } from './generated/calibration-admission-evidence-payload-set';
import type { CalibrationAdmissionEvidenceReceiptV1 } from './generated/calibration-admission-evidence-receipt';
import type { CalibrationAdmissionEvidenceBundleV1 } from './generated/calibration-admission-evidence-bundle';
import type { CalibrationAdmissionToolAuthorityIndexV1 } from './generated/calibration-admission-tool-authority-index';
import type { CalibrationAdmissionToolAuthoritySnapshotV1 } from './generated/calibration-admission-tool-authority-snapshot';
import type { CalibrationToolAuthorityPublicationLockV1 } from './generated/calibration-tool-authority-publication-lock';
import type { CalibrationToolAuthorityPublicationTransactionV1 } from './generated/calibration-tool-authority-publication-transaction';
import type { CalibrationNestedPublicationHandoffV1 } from './generated/calibration-nested-publication-handoff';
import type { CalibrationApprovedEvidenceAcquisitionV1 } from './generated/calibration-approved-evidence-acquisition';
import type { CalibrationEvidenceAcquisitionReservationV1 } from './generated/calibration-evidence-acquisition-reservation';
import type { CalibrationEvidenceAcquisitionReceiptV1 } from './generated/calibration-evidence-acquisition-receipt';
import type { CalibrationEvidenceAcquisitionEnvelopeV1 } from './generated/calibration-evidence-acquisition-envelope';
import type { CalibrationAdmissionAcquisitionIndexV1 } from './generated/calibration-admission-acquisition-index';
import type { CalibrationAdmissionAcquisitionSnapshotV1 } from './generated/calibration-admission-acquisition-snapshot';
import type { CalibrationEvidenceCasPrimaryCompletionV1 } from './generated/calibration-evidence-cas-primary-completion';
import type { CalibrationAdmissionEvidenceCasTransactionV1 } from './generated/calibration-admission-evidence-cas-transaction';
import type { CalibrationAdmissionMaterializationReceiptV1 } from './generated/calibration-admission-materialization-receipt';
import {
  exactKeys,
  isJsonRecord as isRecord,
  isSha256,
  sortedUniqueByPredicate,
  withoutJsonKeys as withoutKeys,
} from './calibration-admission-primitives';

export type {
  CalibrationAdmissionPolicyV1,
  AdmissionWitnessPolicyV1,
  CalibrationAdmissionToolProfileV1,
  CalibrationAdmissionInvocationIntentV1,
  CalibrationAdmissionToolReceiptV1,
  CalibrationAdmissionEvidenceIndexV1,
  CalibrationAdmissionEvidencePayloadV1,
  CalibrationAdmissionEvidencePayloadSetV1,
  CalibrationAdmissionEvidenceReceiptV1,
  CalibrationAdmissionEvidenceBundleV1,
  CalibrationAdmissionToolAuthorityIndexV1,
  CalibrationAdmissionToolAuthoritySnapshotV1,
  CalibrationToolAuthorityPublicationLockV1,
  CalibrationToolAuthorityPublicationTransactionV1,
  CalibrationNestedPublicationHandoffV1,
  CalibrationApprovedEvidenceAcquisitionV1,
  CalibrationEvidenceAcquisitionReservationV1,
  CalibrationEvidenceAcquisitionReceiptV1,
  CalibrationEvidenceAcquisitionEnvelopeV1,
  CalibrationAdmissionAcquisitionIndexV1,
  CalibrationAdmissionAcquisitionSnapshotV1,
  CalibrationEvidenceCasPrimaryCompletionV1,
  CalibrationAdmissionEvidenceCasTransactionV1,
  CalibrationAdmissionMaterializationReceiptV1,
};

type AdmissionProfileId =
  | 'admission-core-contract-v1'
  | 'admission-context-v1'
  | 'admission-static-ledgers-v1'
  | 'admission-census-v1'
  | 'admission-manifest-v1'
  | 'admission-acquisition-publication-v1'
  | 'admission-source-node-v1'
  | 'admission-source-parquet-v1'
  | 'admission-acquisition-round-v1'
  | 'admission-git-acquire-v1'
  | 'admission-release-acquire-v1'
  | 'admission-evidence-acquire-v1';

type AdmissionAction = string;
type AdmissionNetworkTransport = 'git' | 'release_asset' | 'evidence';

const SHA256 = /^[a-f0-9]{64}$/;
const PROFILE_ID = /^admission-[a-z0-9-]+-v1$/;
const EXECUTABLE_ID = /^[a-z0-9][a-z0-9._:-]{0,127}$/;
const ACTION = /^[a-z][a-z0-9._:-]{0,127}$/;
const CONSTRAINT_ID = /^[a-z][a-z0-9._:-]{0,127}$/;

/** The profile set is intentionally closed; generation 0 cannot silently grow. */
export const FROZEN_ADMISSION_PROFILE_IDS = Object.freeze([
  'admission-core-contract-v1',
  'admission-context-v1',
  'admission-static-ledgers-v1',
  'admission-census-v1',
  'admission-manifest-v1',
  'admission-acquisition-publication-v1',
  'admission-source-node-v1',
  'admission-source-parquet-v1',
  'admission-acquisition-round-v1',
  'admission-git-acquire-v1',
  'admission-release-acquire-v1',
  'admission-evidence-acquire-v1',
] as const satisfies readonly AdmissionProfileId[]);

/** Exact action ownership from the v10.3 admission plan. */
export const FROZEN_ADMISSION_ACTIONS: Readonly<Record<AdmissionProfileId, readonly AdmissionAction[]>> = Object.freeze({
  'admission-core-contract-v1': ['core:contract'],
  'admission-context-v1': ['census:preview', 'context:verify', 'evidence:verify', 'lint', 'manifest:verify', 'manifest:verify-prerequisites', 'source:census'],
  'admission-static-ledgers-v1': ['authority:overlap', 'authority:overlap:recover', 'authority:overlap:verify', 'authority:remaining', 'rebuild:pre-witness', 'static-authority:recover'],
  'admission-census-v1': ['census', 'census:current-hash', 'census:recover', 'census:stdout', 'require', 'verify', 'witness:constraint-check', 'witness:publish-review', 'witness:publish-search', 'witness:recover-publication', 'witness:regenerate', 'witness:search'],
  'admission-manifest-v1': ['manifest:build', 'manifest:publish-prerequisites', 'manifest:recover', 'manifest:recover-prerequisites'],
  'admission-acquisition-publication-v1': ['acquisition:authorize', 'acquisition:publish', 'acquisition:recover-publication', 'evidence:recover', 'register:publish-round', 'register:recover'],
  'admission-source-node-v1': ['source:audit-node'],
  'admission-source-parquet-v1': ['source:audit-parquet'],
  'admission-acquisition-round-v1': ['acquire:recover', 'acquire:round'],
  'admission-git-acquire-v1': ['acquire:git-child'],
  'admission-release-acquire-v1': ['acquire:release-child'],
  'admission-evidence-acquire-v1': ['evidence:acquire'],
});

const PROFILE_NETWORK: Readonly<Record<AdmissionProfileId, 'deny' | AdmissionNetworkTransport>> = Object.freeze({
  'admission-core-contract-v1': 'deny',
  'admission-context-v1': 'deny',
  'admission-static-ledgers-v1': 'deny',
  'admission-census-v1': 'deny',
  'admission-manifest-v1': 'deny',
  'admission-acquisition-publication-v1': 'deny',
  'admission-source-node-v1': 'deny',
  'admission-source-parquet-v1': 'deny',
  'admission-acquisition-round-v1': 'deny',
  'admission-git-acquire-v1': 'git',
  'admission-release-acquire-v1': 'release_asset',
  'admission-evidence-acquire-v1': 'evidence',
});

const PROFILE_CANDIDATE_ACCESS: Readonly<Record<AdmissionProfileId, 'none' | 'read_only'>> = Object.freeze({
  'admission-core-contract-v1': 'none',
  'admission-context-v1': 'read_only',
  'admission-static-ledgers-v1': 'read_only',
  'admission-census-v1': 'read_only',
  'admission-manifest-v1': 'read_only',
  'admission-acquisition-publication-v1': 'none',
  'admission-source-node-v1': 'read_only',
  'admission-source-parquet-v1': 'read_only',
  'admission-acquisition-round-v1': 'none',
  'admission-git-acquire-v1': 'read_only',
  'admission-release-acquire-v1': 'read_only',
  'admission-evidence-acquire-v1': 'read_only',
});

const POLICY_VERSION = 'v10.3-admission-policy-v1';
const POLICY_ID = 'v10.3-admission-v1';

type JsonValue = null | boolean | number | string | readonly JsonValue[] | { readonly [key: string]: JsonValue };

function snapshotRecord(value: unknown): Record<string, unknown> | undefined {
  try {
    if (!isRecord(value)) return undefined;
    const snapshot: Record<string, unknown> = Object.create(null) as Record<string, unknown>;
    for (const key of Object.keys(value)) snapshot[key] = value[key];
    return snapshot;
  } catch {
    return undefined;
  }
}

function nonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0;
}

function safeInteger(value: unknown, minimum = 0, maximum = Number.MAX_SAFE_INTEGER): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= minimum && value <= maximum;
}

function finiteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0;
}

function sortedUniqueStrings(value: unknown, pattern: RegExp): value is readonly string[] {
  return sortedUniqueByPredicate(value, (entry) => typeof entry === 'string' && pattern.test(entry), false);
}

const sha = isSha256;

function canonicalize(value: unknown): JsonValue {
  if (value === null || typeof value === 'boolean' || typeof value === 'string') return value;
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) throw new TypeError('non-finite canonical value');
    return value;
  }
  if (Array.isArray(value)) return value.map((entry) => canonicalize(entry));
  if (!isRecord(value)) throw new TypeError('non-JSON canonical value');
  const result: Record<string, JsonValue> = {};
  for (const key of Object.keys(value).sort()) {
    const child = value[key];
    if (child === undefined) throw new TypeError(`undefined canonical value: ${key}`);
    result[key] = canonicalize(child);
  }
  return result;
}

export function calibrationAdmissionCanonicalJson(value: unknown): string {
  return JSON.stringify(canonicalize(value));
}

export function calibrationAdmissionSha256(value: unknown): string {
  return createHash('sha256').update(calibrationAdmissionCanonicalJson(value), 'utf8').digest('hex');
}

/** Profile IDs are frozen human-readable capabilities; this hash is its content address. */
export function calibrationAdmissionToolProfileSha256(value: unknown): string {
  return calibrationAdmissionSha256(withoutKeys(value, ['profileSha256']));
}

export function calibrationAdmissionPolicySha256(value: unknown): string {
  return calibrationAdmissionSha256(withoutKeys(value, ['policySha256']));
}

export function calibrationAdmissionInvocationIntentId(value: unknown): string {
  return calibrationAdmissionSha256(withoutKeys(value, ['intentId', 'intentSha256']));
}

export function calibrationAdmissionInvocationIntentSha256(value: unknown): string {
  return calibrationAdmissionSha256(withoutKeys(value, ['intentSha256']));
}

export function calibrationAdmissionToolReceiptId(value: unknown): string {
  return calibrationAdmissionSha256(withoutKeys(value, ['receiptId']));
}

/** Receipts have a content hash in authority indexes rather than a self-hash field. */
export function calibrationAdmissionToolReceiptSha256(value: unknown): string {
  return calibrationAdmissionSha256(value);
}

function profileId(value: unknown): value is AdmissionProfileId {
  return typeof value === 'string' && PROFILE_ID.test(value) && (FROZEN_ADMISSION_PROFILE_IDS as readonly string[]).includes(value);
}

function expectedNetwork(profile: AdmissionProfileId): Record<string, string> {
  const network = PROFILE_NETWORK[profile];
  return network === 'deny' ? { mode: 'deny' } : { mode: 'exact_authorized_https', transport: network };
}

function expectedCandidateAccess(profile: AdmissionProfileId): 'none' | 'read_only' {
  return PROFILE_CANDIDATE_ACCESS[profile];
}

function isResourceLimits(value: unknown): value is Readonly<Record<string, number | string>> {
  const snapshot = snapshotRecord(value);
  if (!snapshot) return false;
  return Object.values(snapshot).every((entry) => (typeof entry === 'string' && entry.length > 0) || finiteNumber(entry));
}

function isNetworkForProfile(value: unknown, profile: AdmissionProfileId): boolean {
  const snapshot = snapshotRecord(value);
  if (!snapshot) return false;
  const expected = expectedNetwork(profile);
  return exactKeys(snapshot, Object.keys(expected)) && Object.entries(expected).every(([key, entry]) => snapshot[key] === entry);
}

function profileShape(value: unknown): value is CalibrationAdmissionToolProfileV1 {
  const snapshot = snapshotRecord(value);
  if (!snapshot || !exactKeys(snapshot, ['version', 'profileId', 'allowedExecutableIds', 'allowedActions', 'candidateByteAccess', 'network', 'resourceLimits', 'profileSha256'])) return false;
  if (snapshot.version !== 'v10.3-admission-tool-profile-v1' || !profileId(snapshot.profileId)) return false;
  const id = snapshot.profileId;
  if (!sortedUniqueStrings(snapshot.allowedExecutableIds, EXECUTABLE_ID)) return false;
  const actions = FROZEN_ADMISSION_ACTIONS[id];
  if (!sortedUniqueStrings(snapshot.allowedActions, ACTION) || JSON.stringify(snapshot.allowedActions) !== JSON.stringify(actions)) return false;
  if (snapshot.candidateByteAccess !== expectedCandidateAccess(id) || !isNetworkForProfile(snapshot.network, id) || !isResourceLimits(snapshot.resourceLimits) || !sha(snapshot.profileSha256)) return false;
  return true;
}

export function isCalibrationAdmissionToolProfileV1(value: unknown): value is CalibrationAdmissionToolProfileV1 {
  if (!profileShape(value)) return false;
  try {
    return calibrationAdmissionToolProfileSha256(value) === value.profileSha256;
  } catch {
    return false;
  }
}

function isPolicyGate(value: unknown, gate: 'smoke' | 'canary'): boolean {
  const expected = gate === 'smoke'
    ? { unitsPerPolarity: 100, maxSourceOrFamilyUnitsPerPolarity: 50, minimumSourcesPerPolarity: 2, minimumFamiliesPerPolarity: 3, minimumLanguages: 2, minimumUnitsPerRepresentedLanguagePerPolarity: 20 }
    : { unitsPerPolarity: 5000, maxSourceUnitsPerPolarity: 500, maxFamilyUnitsPerPolarity: 1000, minimumSourcesPerPolarity: 10, minimumFamiliesPerPolarity: 5, minimumLanguages: 3, minimumUnitsPerLanguagePerPolarity: 250, minimumFamiliesPerLanguagePerPolarity: 3, minimumAiGeneratorFamilies: 3 };
  const snapshot = snapshotRecord(value);
  return snapshot !== undefined && exactKeys(snapshot, Object.keys(expected)) && Object.entries(expected).every(([key, entry]) => snapshot[key] === entry);
}

function policyShape(value: unknown): value is CalibrationAdmissionPolicyV1 {
  const snapshot = snapshotRecord(value);
  if (!snapshot || !exactKeys(snapshot, ['version', 'policyId', 'initialRegisterEntryCount', 'selectedCoverage', 'baselineMaterialUnits', 'repositoryMaterialUnits', 'labels', 'evidenceCasPolicy', 'overlapPolicy', 'reasonVocabularySha256', 'toolProfileSha256s', 'smoke', 'canary', 'policySha256'])) return false;
  const labels = snapshotRecord(snapshot.labels);
  if (snapshot.version !== POLICY_VERSION || snapshot.policyId !== POLICY_ID || snapshot.initialRegisterEntryCount !== 329 || snapshot.selectedCoverage !== 452382 || snapshot.baselineMaterialUnits !== 58089 || snapshot.repositoryMaterialUnits !== 394293 || !labels || !exactKeys(labels, ['positive', 'negative']) || labels.positive !== 'verified_ai' || labels.negative !== 'verified_human' || snapshot.evidenceCasPolicy !== 'sha256-wx-fsync-v1' || snapshot.overlapPolicy !== 'prefix-filter-exact-jaccard-0.80-v1' || !sha(snapshot.reasonVocabularySha256) || !sortedUniqueStrings(snapshot.toolProfileSha256s, SHA256) || !isPolicyGate(snapshot.smoke, 'smoke') || !isPolicyGate(snapshot.canary, 'canary') || !sha(snapshot.policySha256)) return false;
  return true;
}

export function isCalibrationAdmissionPolicyV1(value: unknown, profiles?: readonly unknown[]): value is CalibrationAdmissionPolicyV1 {
  if (!policyShape(value)) return false;
  try {
    if (calibrationAdmissionPolicySha256(value) !== value.policySha256) return false;
  } catch {
    return false;
  }
  if (profiles !== undefined) {
    if (profiles.length !== FROZEN_ADMISSION_PROFILE_IDS.length || !profiles.every(isCalibrationAdmissionToolProfileV1)) return false;
    const hashes = profiles.map((profile) => profile.profileSha256).sort();
    if (JSON.stringify(hashes) !== JSON.stringify(value.toolProfileSha256s)) return false;
  }
  return true;
}

type WitnessConstraint = NonNullable<AdmissionWitnessPolicyV1['constraints']>[number];

function witnessConstraint(constraintId: string, kind: WitnessConstraint['kind'], integerValue: number): WitnessConstraint {
  return { constraintId, kind, integerValue };
}

/** Canonical, lossless policy-to-search expansion. */
export function expandAdmissionWitnessConstraints(
  policy: CalibrationAdmissionPolicyV1,
  gate: 'smoke' | 'canary',
): readonly WitnessConstraint[] {
  const values = gate === 'smoke'
    ? [
        witnessConstraint('smoke.units-per-polarity', 'exact', policy.smoke.unitsPerPolarity),
        witnessConstraint('smoke.max-source-or-family-units-per-polarity', 'maximum', policy.smoke.maxSourceOrFamilyUnitsPerPolarity),
        witnessConstraint('smoke.minimum-sources-per-polarity', 'minimum', policy.smoke.minimumSourcesPerPolarity),
        witnessConstraint('smoke.minimum-families-per-polarity', 'minimum', policy.smoke.minimumFamiliesPerPolarity),
        witnessConstraint('smoke.minimum-languages', 'minimum', policy.smoke.minimumLanguages),
        witnessConstraint('smoke.minimum-units-per-represented-language-per-polarity', 'minimum', policy.smoke.minimumUnitsPerRepresentedLanguagePerPolarity),
      ]
    : [
        witnessConstraint('canary.units-per-polarity', 'exact', policy.canary.unitsPerPolarity),
        witnessConstraint('canary.max-source-units-per-polarity', 'maximum', policy.canary.maxSourceUnitsPerPolarity),
        witnessConstraint('canary.max-family-units-per-polarity', 'maximum', policy.canary.maxFamilyUnitsPerPolarity),
        witnessConstraint('canary.minimum-sources-per-polarity', 'minimum', policy.canary.minimumSourcesPerPolarity),
        witnessConstraint('canary.minimum-families-per-polarity', 'minimum', policy.canary.minimumFamiliesPerPolarity),
        witnessConstraint('canary.minimum-languages', 'minimum', policy.canary.minimumLanguages),
        witnessConstraint('canary.minimum-units-per-language-per-polarity', 'minimum', policy.canary.minimumUnitsPerLanguagePerPolarity),
        witnessConstraint('canary.minimum-families-per-language-per-polarity', 'minimum', policy.canary.minimumFamiliesPerLanguagePerPolarity),
        witnessConstraint('canary.minimum-ai-generator-families', 'minimum', policy.canary.minimumAiGeneratorFamilies),
      ];
  return values.sort((left, right) => left.constraintId.localeCompare(right.constraintId));
}

function isConstraint(value: unknown): value is WitnessConstraint {
  const snapshot = snapshotRecord(value);
  if (!snapshot || (snapshot.kind === 'same_split' ? !exactKeys(snapshot, ['constraintId', 'kind']) : !exactKeys(snapshot, ['constraintId', 'kind', 'integerValue'])) || typeof snapshot.constraintId !== 'string' || !CONSTRAINT_ID.test(snapshot.constraintId) || !['exact', 'minimum', 'maximum', 'same_split'].includes(snapshot.kind as string)) return false;
  return snapshot.kind === 'same_split' ? true : safeInteger(snapshot.integerValue);
}

function witnessShape(value: unknown): value is AdmissionWitnessPolicyV1 {
  const snapshot = snapshotRecord(value);
  if (!snapshot || !exactKeys(snapshot, ['version', 'policyId', 'gate', 'algorithm', 'seed', 'maxSearchNodes', 'constraints', 'constraintsSha256', 'witnessPolicySha256'])) return false;
  if (snapshot.version !== 'v10.3-admission-witness-policy-v1' || snapshot.policyId !== POLICY_ID || (snapshot.gate !== 'smoke' && snapshot.gate !== 'canary') || snapshot.algorithm !== 'lexicographic-bnb-feasibility-v1' || snapshot.seed !== 'slopbrick-v10.3-admission-review-v1' || snapshot.maxSearchNodes !== (snapshot.gate === 'smoke' ? 10000000 : 50000000) || !Array.isArray(snapshot.constraints) || snapshot.constraints.length === 0 || !sha(snapshot.constraintsSha256) || !sha(snapshot.witnessPolicySha256)) return false;
  let previous = '';
  for (const constraint of snapshot.constraints) {
    if (!isConstraint(constraint)) return false;
    if (constraint.constraintId <= previous) return false;
    previous = constraint.constraintId;
  }
  return true;
}

export function isAdmissionWitnessPolicyV1(value: unknown, policy?: CalibrationAdmissionPolicyV1): value is AdmissionWitnessPolicyV1 {
  if (!witnessShape(value)) return false;
  try {
    if (calibrationAdmissionSha256(value.constraints) !== value.constraintsSha256 || calibrationAdmissionSha256(withoutKeys(value, ['witnessPolicySha256'])) !== value.witnessPolicySha256) return false;
  } catch {
    return false;
  }
  if (policy !== undefined) {
    if (!isCalibrationAdmissionPolicyV1(policy)) return false;
    const expected = expandAdmissionWitnessConstraints(policy, value.gate);
    // Compare canonical JSON rather than insertion-order-sensitive JSON.stringify:
    // bundles are persisted in canonical key order and must round-trip through
    // the validator without changing the witness meaning.
    if (calibrationAdmissionCanonicalJson(value.constraints) !== calibrationAdmissionCanonicalJson(expected)) return false;
  }
  return true;
}

function profileActionIsAllowed(profile: AdmissionProfileId, action: unknown): action is string {
  return typeof action === 'string' && FROZEN_ADMISSION_ACTIONS[profile].includes(action);
}

function networkAuthorizationIsRequired(profile: AdmissionProfileId): boolean {
  return PROFILE_NETWORK[profile] !== 'deny';
}

function intentShape(value: unknown): value is CalibrationAdmissionInvocationIntentV1 {
  const snapshot = snapshotRecord(value);
  if (!snapshot || !exactKeys(snapshot, ['version', 'intentId', 'profileId', 'profileSha256', 'action', 'canonicalArgvSha256', 'inputSetSha256', 'executableBehaviorSha256', 'networkAuthorizationSha256', 'intentSha256'].filter((key) => snapshot.networkAuthorizationSha256 !== undefined || key !== 'networkAuthorizationSha256'))) return false;
  if (snapshot.version !== 'v10.3-admission-invocation-intent-v1' || !sha(snapshot.intentId) || !profileId(snapshot.profileId) || !sha(snapshot.profileSha256) || typeof snapshot.action !== 'string' || !ACTION.test(snapshot.action) || !sha(snapshot.canonicalArgvSha256) || !sha(snapshot.inputSetSha256) || !sha(snapshot.executableBehaviorSha256) || !sha(snapshot.intentSha256)) return false;
  if (snapshot.networkAuthorizationSha256 !== undefined && !sha(snapshot.networkAuthorizationSha256)) return false;
  return true;
}

export function isCalibrationAdmissionInvocationIntentV1(value: unknown, profile?: CalibrationAdmissionToolProfileV1): value is CalibrationAdmissionInvocationIntentV1 {
  if (!intentShape(value)) return false;
  const snapshot = snapshotRecord(value)!;
  const id = snapshot.profileId as AdmissionProfileId;
  if (!profileActionIsAllowed(id, snapshot.action) || (networkAuthorizationIsRequired(id) !== (snapshot.networkAuthorizationSha256 !== undefined))) return false;
  if (profile !== undefined && (!isCalibrationAdmissionToolProfileV1(profile) || profile.profileId !== id || profile.profileSha256 !== snapshot.profileSha256 || !profileActionIsAllowed(profile.profileId, snapshot.action))) return false;
  try {
    return calibrationAdmissionInvocationIntentId(value) === value.intentId && calibrationAdmissionInvocationIntentSha256(value) === value.intentSha256;
  } catch {
    return false;
  }
}

function receiptShape(value: unknown): value is CalibrationAdmissionToolReceiptV1 {
  const snapshot = snapshotRecord(value);
  if (!snapshot || !exactKeys(snapshot, ['version', 'receiptId', 'invocationIntentId', 'profileId', 'profileSha256', 'action', 'canonicalArgvSha256', 'inputSetSha256', 'executableBehaviorSha256', 'networkAuthorizationSha256', 'observedResourceUsage', 'exitCode', 'outputSetSha256'].filter((key) => snapshot.networkAuthorizationSha256 !== undefined || key !== 'networkAuthorizationSha256'))) return false;
  if (snapshot.version !== 'v10.3-admission-tool-receipt-v1' || !sha(snapshot.receiptId) || !sha(snapshot.invocationIntentId) || !profileId(snapshot.profileId) || !sha(snapshot.profileSha256) || typeof snapshot.action !== 'string' || !ACTION.test(snapshot.action) || !sha(snapshot.canonicalArgvSha256) || !sha(snapshot.inputSetSha256) || !sha(snapshot.executableBehaviorSha256) || !isResourceUsage(snapshot.observedResourceUsage) || !safeInteger(snapshot.exitCode, 0, 255) || !sha(snapshot.outputSetSha256)) return false;
  if (snapshot.networkAuthorizationSha256 !== undefined && !sha(snapshot.networkAuthorizationSha256)) return false;
  return true;
}

function isResourceUsage(value: unknown): value is Readonly<Record<string, number>> {
  const snapshot = snapshotRecord(value);
  return snapshot !== undefined && Object.values(snapshot).every(finiteNumber);
}

export function isCalibrationAdmissionToolReceiptV1(value: unknown, profile?: CalibrationAdmissionToolProfileV1, intent?: CalibrationAdmissionInvocationIntentV1): value is CalibrationAdmissionToolReceiptV1 {
  if (!receiptShape(value)) return false;
  const snapshot = snapshotRecord(value)!;
  const id = snapshot.profileId as AdmissionProfileId;
  if (!profileActionIsAllowed(id, snapshot.action) || (networkAuthorizationIsRequired(id) !== (snapshot.networkAuthorizationSha256 !== undefined))) return false;
  if (profile !== undefined && (!isCalibrationAdmissionToolProfileV1(profile) || profile.profileId !== id || profile.profileSha256 !== snapshot.profileSha256)) return false;
  if (intent !== undefined && (!isCalibrationAdmissionInvocationIntentV1(intent, profile) || snapshot.invocationIntentId !== intent.intentId || snapshot.action !== intent.action || snapshot.canonicalArgvSha256 !== intent.canonicalArgvSha256 || snapshot.inputSetSha256 !== intent.inputSetSha256 || snapshot.executableBehaviorSha256 !== intent.executableBehaviorSha256 || snapshot.networkAuthorizationSha256 !== intent.networkAuthorizationSha256)) return false;
  try {
    return calibrationAdmissionToolReceiptId(value) === value.receiptId;
  } catch {
    return false;
  }
}

/*
 * Evidence contracts intentionally stay pure.  They check shape, canonical
 * hashes, ordering, and cross-object references; they never open a path or
 * make a network request.  SlopBrick owns the contained-byte verification.
 */

const ADMISSION_ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,255}$/;
const MEDIA_TYPE = /^[^\u0000-\u001f\u007f]{1,255}$/;
const RELATIVE_EVIDENCE_PATH = /^(?!\/)(?!.*\\)(?!.*(?:^|\/)\.\.(?:\/|$))(?!.*(?:^|\/)\.(?:\/|$))[^\u0000-\u001f]+$/;
const EVIDENCE_KINDS = new Set([
  'source_origin',
  'license_terms',
  'rights_chain',
  'authorship_attestation',
  'generation_record',
  'provider_versioning_contract',
  'review_protocol',
]);

function admissionId(value: unknown): value is string {
  return typeof value === 'string' && ADMISSION_ID.test(value);
}

function relativeEvidencePath(value: unknown): value is string {
  return typeof value === 'string' && value.length <= 4096 && RELATIVE_EVIDENCE_PATH.test(value);
}

function mediaType(value: unknown): value is string {
  return typeof value === 'string' && MEDIA_TYPE.test(value);
}

function sortedUniqueById(values: readonly unknown[], field: string): boolean {
  let previous = '';
  const seen = new Set<string>();
  for (const value of values) {
    const record = snapshotRecord(value);
    const id = record?.[field];
    if (!admissionId(id) || seen.has(id) || id <= previous) return false;
    seen.add(id);
    previous = id;
  }
  return true;
}

function isEvidenceLocator(value: unknown): boolean {
  const record = snapshotRecord(value);
  if (!record || typeof record.kind !== 'string') return false;
  if (record.kind === 'immutable_https') {
    return exactKeys(record, ['kind', 'url', 'immutability'])
      && typeof record.url === 'string'
      && /^https:\/\/[^\s]+$/.test(record.url)
      && (record.immutability === 'commit_pinned_git_blob' || record.immutability === 'content_addressed_release_asset');
  }
  if (record.kind === 'materialized_file') {
    return exactKeys(record, ['kind', 'materializationId', 'normalizedPath'])
      && admissionId(record.materializationId)
      && relativeEvidencePath(record.normalizedPath);
  }
  if (record.kind === 'local_unpublished') {
    return exactKeys(record, ['kind', 'localEvidenceId']) && admissionId(record.localEvidenceId);
  }
  return false;
}

function isEvidenceIndexItem(value: unknown): boolean {
  const record = snapshotRecord(value);
  if (!record || !exactKeys(record, ['evidenceId', 'kind', 'locator', 'bytes', 'mediaType', 'sha256', 'claimScopes'])) return false;
  if (!admissionId(record.evidenceId) || typeof record.kind !== 'string' || !EVIDENCE_KINDS.has(record.kind) || !isEvidenceLocator(record.locator)) return false;
  if (!safeInteger(record.bytes, 0) || !mediaType(record.mediaType) || !sha(record.sha256)) return false;
  if (!sortedUniqueStrings(record.claimScopes, /^[A-Za-z0-9][A-Za-z0-9._:-]{0,255}$/)) return false;
  try {
    return calibrationAdmissionEvidenceId(value) === record.evidenceId;
  } catch {
    return false;
  }
}

export function calibrationAdmissionEvidenceId(value: unknown): string {
  return calibrationAdmissionSha256(withoutKeys(value, ['evidenceId']));
}

export function calibrationAdmissionEvidenceIndexSha256(value: unknown): string {
  return calibrationAdmissionSha256(withoutKeys(value, ['indexSha256']));
}

export function isCalibrationAdmissionEvidenceIndexV1(value: unknown): value is CalibrationAdmissionEvidenceIndexV1 {
  const record = snapshotRecord(value);
  if (!record || !exactKeys(record, ['version', 'items', 'indexSha256']) || record.version !== 'v10.3-admission-evidence-index-v1' || !Array.isArray(record.items) || !sha(record.indexSha256)) return false;
  if (!sortedUniqueById(record.items, 'evidenceId') || !record.items.every(isEvidenceIndexItem)) return false;
  try {
    return calibrationAdmissionEvidenceIndexSha256(value) === record.indexSha256;
  } catch {
    return false;
  }
}

function isEvidenceStorage(value: unknown): boolean {
  const record = snapshotRecord(value);
  if (!record || typeof record.kind !== 'string') return false;
  if (record.kind === 'materialization_reference') {
    return exactKeys(record, ['kind', 'materializationReceiptId', 'materializationId', 'normalizedPath'])
      && admissionId(record.materializationReceiptId)
      && admissionId(record.materializationId)
      && relativeEvidencePath(record.normalizedPath);
  }
  if (record.kind === 'evidence_cas') {
    return exactKeys(record, ['kind', 'casAlgorithm', 'casRelativePath', 'authorizationId'])
      && record.casAlgorithm === 'sha256'
      && relativeEvidencePath(record.casRelativePath)
      && admissionId(record.authorizationId);
  }
  if (record.kind === 'local_unpublished_reference') {
    return exactKeys(record, ['kind', 'localEvidenceId']) && admissionId(record.localEvidenceId);
  }
  return false;
}

export function calibrationAdmissionEvidencePayloadId(value: unknown): string {
  return calibrationAdmissionSha256(withoutKeys(value, ['payloadId']));
}

export function calibrationAdmissionEvidenceSourceLocatorSha256(value: unknown): string {
  return calibrationAdmissionSha256(value);
}

export function calibrationAdmissionEvidencePayloadSetSha256(value: unknown): string {
  return calibrationAdmissionSha256(withoutKeys(value, ['payloadSetSha256']));
}

export function isCalibrationAdmissionEvidencePayloadV1(
  value: unknown,
  index?: CalibrationAdmissionEvidenceIndexV1,
): value is CalibrationAdmissionEvidencePayloadV1 {
  const record = snapshotRecord(value);
  if (!record || !exactKeys(record, ['version', 'payloadId', 'evidenceId', 'bytes', 'sha256', 'mediaType', 'sourceLocatorSha256', 'storage']) || record.version !== 'v10.3-admission-evidence-payload-v1') return false;
  if (!admissionId(record.payloadId) || !admissionId(record.evidenceId) || !safeInteger(record.bytes, 0) || !sha(record.sha256) || !mediaType(record.mediaType) || !sha(record.sourceLocatorSha256) || !isEvidenceStorage(record.storage)) return false;
  if (record.storage && snapshotRecord(record.storage)?.kind === 'evidence_cas') {
    const storage = snapshotRecord(record.storage)!;
    const expectedPath = `evidence-cas/sha256/${record.sha256.slice(0, 2)}/${record.sha256}`;
    if (storage.casRelativePath !== expectedPath) return false;
  }
  try {
    if (calibrationAdmissionEvidencePayloadId(value) !== record.payloadId) return false;
    if (calibrationAdmissionEvidenceSourceLocatorSha256(index?.items.find((item) => item.evidenceId === record.evidenceId)?.locator) !== record.sourceLocatorSha256) return false;
  } catch {
    return false;
  }
  if (index !== undefined) {
    const item = index.items.find((candidate) => candidate.evidenceId === record.evidenceId);
    if (!item || item.bytes !== record.bytes || item.sha256 !== record.sha256 || item.mediaType !== record.mediaType) return false;
  }
  return true;
}

export function isCalibrationAdmissionEvidencePayloadSetV1(
  value: unknown,
  index?: CalibrationAdmissionEvidenceIndexV1,
): value is CalibrationAdmissionEvidencePayloadSetV1 {
  const record = snapshotRecord(value);
  if (!record || !exactKeys(record, ['version', 'casPolicy', 'payloads', 'payloadSetSha256']) || record.version !== 'v10.3-admission-evidence-payload-set-v1' || record.casPolicy !== 'sha256-wx-fsync-v1' || !Array.isArray(record.payloads) || !sha(record.payloadSetSha256)) return false;
  if (!sortedUniqueById(record.payloads, 'payloadId') || !record.payloads.every((payload) => isCalibrationAdmissionEvidencePayloadV1(payload, index))) return false;
  try {
    return calibrationAdmissionEvidencePayloadSetSha256(value) === record.payloadSetSha256;
  } catch {
    return false;
  }
}

export function calibrationAdmissionEvidenceReceiptId(value: unknown): string {
  return calibrationAdmissionSha256(withoutKeys(value, ['receiptId']));
}

export function isCalibrationAdmissionEvidenceReceiptV1(
  value: unknown,
  index?: CalibrationAdmissionEvidenceIndexV1,
  payloadSet?: CalibrationAdmissionEvidencePayloadSetV1,
): value is CalibrationAdmissionEvidenceReceiptV1 {
  const record = snapshotRecord(value);
  if (!record || !exactKeys(record, ['version', 'receiptId', 'evidenceId', 'evidenceIndexSha256', 'payloadId', 'payloadSetSha256', 'verificationMethod', 'observedBytes', 'observedSha256', 'toolReceiptSha256', 'status']) || record.version !== 'v10.3-admission-evidence-receipt-v1') return false;
  if (!sha(record.receiptId) || !admissionId(record.evidenceId) || !sha(record.evidenceIndexSha256) || !admissionId(record.payloadId) || !sha(record.payloadSetSha256) || !['offline-materialization-file-v1', 'offline-evidence-cas-v1', 'offline-local-unpublished-reference-v1'].includes(record.verificationMethod as string) || !safeInteger(record.observedBytes, 0) || !sha(record.observedSha256) || !sha(record.toolReceiptSha256) || !['verified', 'mismatch', 'unavailable'].includes(record.status as string)) return false;
  if (index !== undefined && record.evidenceIndexSha256 !== index.indexSha256) return false;
  if (payloadSet !== undefined && record.payloadSetSha256 !== payloadSet.payloadSetSha256) return false;
  const payload = payloadSet?.payloads.find((candidate) => (candidate as unknown as Record<string, unknown>).payloadId === record.payloadId) as unknown as Record<string, unknown> | undefined;
  if (payload && payload.evidenceId !== record.evidenceId) return false;
  if (record.status === 'verified' && payload && (record.observedBytes !== payload.bytes || record.observedSha256 !== payload.sha256)) return false;
  try {
    return calibrationAdmissionEvidenceReceiptId(value) === record.receiptId;
  } catch {
    return false;
  }
}

export function calibrationAdmissionEvidenceBundleSha256(value: unknown): string {
  return calibrationAdmissionSha256(withoutKeys(value, ['bundleSha256']));
}

function isAdmissionMaterializationReceipt(value: unknown): boolean {
  const record = snapshotRecord(value);
  if (!record || !exactKeys(record, ['version', 'receiptId', 'materializationId', 'sourceId', 'repositoryId', 'acquisitionAuthorizationId', 'acquisitionAuthorizationSha256', 'acquisitionTransactionId', 'primaryMaterializedOutputSha256', 'childToolReceiptSha256', 'verifiedUnitSetSha256', 'payload'])) return false;
  if (record.version !== 'v10.3-admission-materialization-receipt-v1' || !sha(record.receiptId) || !admissionId(record.materializationId) || !admissionId(record.sourceId) || !admissionId(record.repositoryId) || !admissionId(record.acquisitionAuthorizationId) || !sha(record.acquisitionAuthorizationSha256) || !admissionId(record.acquisitionTransactionId) || !sha(record.primaryMaterializedOutputSha256) || !sha(record.childToolReceiptSha256) || !sha(record.verifiedUnitSetSha256)) return false;
  const payload = snapshotRecord(record.payload);
  if (!payload || typeof payload.kind !== 'string') return false;
  if (payload.kind === 'git') return exactKeys(payload, ['kind', 'originUrl', 'commitSha', 'treeSha', 'inventorySha256']) && typeof payload.originUrl === 'string' && /^https:\/\/[^\s]+$/.test(payload.originUrl) && typeof payload.commitSha === 'string' && /^[a-f0-9]{40,64}$/.test(payload.commitSha) && typeof payload.treeSha === 'string' && /^[a-f0-9]{40,64}$/.test(payload.treeSha) && sha(payload.inventorySha256);
  if (payload.kind === 'release_archive') return exactKeys(payload, ['kind', 'originUrl', 'assetSha256', 'assetBytes', 'inventorySha256']) && typeof payload.originUrl === 'string' && /^https:\/\/[^\s]+$/.test(payload.originUrl) && sha(payload.assetSha256) && safeInteger(payload.assetBytes, 1) && sha(payload.inventorySha256);
  return false;
}

export function isCalibrationAdmissionEvidenceBundleV1(value: unknown): value is CalibrationAdmissionEvidenceBundleV1 {
  const record = snapshotRecord(value);
  if (!record || !exactKeys(record, ['version', 'policy', 'witnessPolicies', 'toolProfiles', 'invocationIntents', 'toolReceipts', 'toolAuthoritySnapshot', 'evidenceIndex', 'evidencePayloadSet', 'approvedEvidenceAcquisitions', 'evidenceAcquisitionReceipts', 'evidenceAcquisitionEnvelopes', 'acquisitionAuthoritySnapshot', 'evidenceReceipts', 'materializationReceipts', 'bundleSha256']) || record.version !== 'v10.3-admission-evidence-bundle-v1' || !sha(record.bundleSha256)) return false;
  if (!isCalibrationAdmissionPolicyV1(record.policy)) return false;
  const policy = record.policy as CalibrationAdmissionPolicyV1;
  if (!Array.isArray(record.witnessPolicies) || record.witnessPolicies.length !== 2 || !record.witnessPolicies.every((candidate) => isAdmissionWitnessPolicyV1(candidate, policy))) return false;
  if (!Array.isArray(record.toolProfiles) || !Array.isArray(record.invocationIntents) || !Array.isArray(record.toolReceipts) || !Array.isArray(record.approvedEvidenceAcquisitions) || !Array.isArray(record.evidenceAcquisitionReceipts) || !Array.isArray(record.evidenceAcquisitionEnvelopes) || !Array.isArray(record.materializationReceipts)) return false;
  if (!record.toolProfiles.every(isCalibrationAdmissionToolProfileV1)) return false;
  if (!isCalibrationAdmissionToolAuthoritySnapshotV1(record.toolAuthoritySnapshot) || !isCalibrationAdmissionAcquisitionSnapshotV1(record.acquisitionAuthoritySnapshot)) return false;
  if (!isCalibrationAdmissionEvidenceIndexV1(record.evidenceIndex)) return false;
  const evidenceIndex = record.evidenceIndex as CalibrationAdmissionEvidenceIndexV1;
  if (!isCalibrationAdmissionEvidencePayloadSetV1(record.evidencePayloadSet, evidenceIndex)) return false;
  const evidencePayloadSet = record.evidencePayloadSet as CalibrationAdmissionEvidencePayloadSetV1;
  if (!Array.isArray(record.evidenceReceipts) || !record.evidenceReceipts.every((receipt) => isCalibrationAdmissionEvidenceReceiptV1(receipt, evidenceIndex, evidencePayloadSet))) return false;
  if (!isCalibrationAdmissionPolicyV1(record.policy, record.toolProfiles) || !record.toolProfiles.every(isCalibrationAdmissionToolProfileV1)) return false;
  const profilesById = new Map<string, CalibrationAdmissionToolProfileV1>();
  for (const profile of record.toolProfiles) {
    if (profilesById.has(profile.profileId)) return false;
    profilesById.set(profile.profileId, profile);
  }
  const intentsById = new Map<string, CalibrationAdmissionInvocationIntentV1>();
  for (const intent of record.invocationIntents) {
    const profile = profilesById.get(intent.profileId);
    if (!profile || !isCalibrationAdmissionInvocationIntentV1(intent, profile) || intentsById.has(intent.intentId)) return false;
    intentsById.set(intent.intentId, intent);
  }
  for (const receipt of record.toolReceipts) {
    const intent = intentsById.get(receipt.invocationIntentId);
    const profile = intent === undefined ? undefined : profilesById.get(intent.profileId);
    if (!intent || !profile || !isCalibrationAdmissionToolReceiptV1(receipt, profile, intent)) return false;
  }
  const authority = record.toolAuthoritySnapshot as unknown as Record<string, unknown>;
  if (JSON.stringify(authority.profileIds) !== JSON.stringify((record.toolProfiles as CalibrationAdmissionToolProfileV1[]).map((profile) => profile.profileId).sort())
    || JSON.stringify(authority.invocationIntentIds) !== JSON.stringify((record.invocationIntents as CalibrationAdmissionInvocationIntentV1[]).map((intent) => intent.intentId).sort())
    || JSON.stringify(authority.receiptIds) !== JSON.stringify((record.toolReceipts as CalibrationAdmissionToolReceiptV1[]).map((receipt) => receipt.receiptId).sort())) return false;
  if (!record.approvedEvidenceAcquisitions.every(isCalibrationApprovedEvidenceAcquisitionV1)
    || !record.evidenceAcquisitionReceipts.every(isCalibrationEvidenceAcquisitionReceiptV1)
    || !record.evidenceAcquisitionEnvelopes.every(isCalibrationEvidenceAcquisitionEnvelopeV1)
    || !record.materializationReceipts.every(isCalibrationAdmissionMaterializationReceiptV1)) return false;
  const authorizations = new Map((record.approvedEvidenceAcquisitions as CalibrationApprovedEvidenceAcquisitionV1[]).map((authorization) => [authorization.authorizationId, authorization]));
  if (authorizations.size !== record.approvedEvidenceAcquisitions.length) return false;
  const acquisitionReceipts = new Map<string, CalibrationEvidenceAcquisitionReceiptV1>();
  for (const receipt of record.evidenceAcquisitionReceipts as CalibrationEvidenceAcquisitionReceiptV1[]) {
    if (acquisitionReceipts.has(receipt.receiptId)) return false;
    const authorization = authorizations.get(receipt.authorizationId);
    if (!authorization || receipt.authorizationSha256 !== authorization.authorizationSha256 || receipt.evidenceId !== authorization.evidenceId || receipt.observedBytes !== authorization.expectedBytes || receipt.observedSha256 !== authorization.expectedSha256 || receipt.observedMediaType !== authorization.expectedMediaType || receipt.observedBytes > authorization.maxTransferBytes) return false;
    acquisitionReceipts.set(receipt.receiptId, receipt);
  }
  const materializations = new Map((record.materializationReceipts as CalibrationAdmissionMaterializationReceiptV1[]).map((receipt) => [receipt.materializationId, receipt]));
  for (const payload of evidencePayloadSet.payloads) {
    const storage = payload.storage as unknown as Record<string, unknown>;
    if (storage.kind === 'materialization_reference') {
      const materialization = materializations.get(String(storage.materializationId));
      if (!materialization || materialization.receiptId !== storage.materializationReceiptId) return false;
    } else if (storage.kind === 'evidence_cas' && !authorizations.has(String(storage.authorizationId))) return false;
  }
  const evidenceReceiptByPayload = new Map<string, CalibrationAdmissionEvidenceReceiptV1>();
  for (const receipt of record.evidenceReceipts as CalibrationAdmissionEvidenceReceiptV1[]) {
    if (evidenceReceiptByPayload.has(receipt.payloadId)) return false;
    const toolReceipt = (record.toolReceipts as CalibrationAdmissionToolReceiptV1[]).find((candidate) => calibrationAdmissionToolReceiptSha256(candidate) === receipt.toolReceiptSha256);
    if (!toolReceipt) return false;
    evidenceReceiptByPayload.set(receipt.payloadId, receipt);
  }
  if (evidenceReceiptByPayload.size !== evidencePayloadSet.payloads.length || evidencePayloadSet.payloads.some((payload) => !evidenceReceiptByPayload.has(payload.payloadId))) return false;
  for (const envelope of record.evidenceAcquisitionEnvelopes as CalibrationEvidenceAcquisitionEnvelopeV1[]) {
    const receipt = (record.evidenceAcquisitionReceipts as CalibrationEvidenceAcquisitionReceiptV1[]).find((candidate) => candidate.receiptSha256 === envelope.acquisitionReceiptSha256);
    if (!receipt || receipt.authorizationId !== envelope.authorizationId || receipt.casTransactionId !== envelope.casTransactionId || receipt.primaryCompletionSha256 !== envelope.primaryCompletionSha256 || receipt.toolReceiptSha256 !== envelope.toolReceiptSha256) return false;
  }
  const acquisitionSnapshot = record.acquisitionAuthoritySnapshot as unknown as Record<string, unknown>;
  if (!sortedUniqueIds(acquisitionSnapshot.artifactKeys)) return false;
  try {
    return calibrationAdmissionEvidenceBundleSha256(value) === record.bundleSha256;
  } catch {
    return false;
  }
}

/*
 * The remaining admission contracts are deliberately kept in this module so
 * every consumer uses the same canonical hashing and fail-closed semantics.
 * JSON Schema catches wire shape; these validators additionally enforce the
 * content-addressed identity, ordering, and cross-object joins that JSON
 * Schema cannot express.
 */

function hashWithout(value: unknown, keys: readonly string[]): string {
  return calibrationAdmissionSha256(withoutKeys(value, keys));
}

function hashLinked(value: unknown, idKey: string, selfHashKey: string): boolean {
  const record = snapshotRecord(value);
  if (!record || !sha(record[idKey]) || !sha(record[selfHashKey])) return false;
  try {
    return hashWithout(value, [idKey, selfHashKey]) === record[idKey]
      && hashWithout(value, [selfHashKey]) === record[selfHashKey];
  } catch {
    return false;
  }
}

function path(value: unknown): value is string {
  return relativeEvidencePath(value);
}

function sortedUniqueHashes(value: unknown, allowEmpty = true): value is readonly string[] {
  return sortedUniqueByPredicate(value, sha, allowEmpty);
}

function sortedUniqueIds(value: unknown, allowEmpty = true): value is readonly string[] {
  return sortedUniqueByPredicate(value, admissionId, allowEmpty);
}

function expectedCurrentState(value: unknown): boolean {
  const record = snapshotRecord(value);
  if (!record) return false;
  if (record.kind === 'absent') return exactKeys(record, ['kind']);
  return record.kind === 'existing' && exactKeys(record, ['kind', 'indexSha256']) && sha(record.indexSha256);
}

function profileReference(value: unknown): value is { readonly profileId: AdmissionProfileId; readonly relativePath: string; readonly sha256: string } {
  const record = snapshotRecord(value);
  return record !== undefined
    && exactKeys(record, ['profileId', 'relativePath', 'sha256'])
    && profileId(record.profileId)
    && path(record.relativePath)
    && sha(record.sha256);
}

function intentReference(value: unknown): boolean {
  const record = snapshotRecord(value);
  return record !== undefined
    && exactKeys(record, ['intentId', 'relativePath', 'sha256'])
    && sha(record.intentId)
    && path(record.relativePath)
    && sha(record.sha256);
}

function receiptReference(value: unknown): boolean {
  const record = snapshotRecord(value);
  return record !== undefined
    && exactKeys(record, ['receiptId', 'relativePath', 'sha256'])
    && sha(record.receiptId)
    && path(record.relativePath)
    && sha(record.sha256);
}

export function isCalibrationAdmissionToolAuthorityIndexV1(value: unknown): value is CalibrationAdmissionToolAuthorityIndexV1 {
  const record = snapshotRecord(value);
  if (!record || !exactKeys(record, ['version', 'generation', 'profiles', 'invocationIntents', 'receipts', 'indexSha256'].concat(record.parentIndexSha256 === undefined ? [] : ['parentIndexSha256']))) return false;
  if (record.version !== 'v10.3-admission-tool-authority-index-v1' || !safeInteger(record.generation) || !Array.isArray(record.profiles) || !Array.isArray(record.invocationIntents) || !Array.isArray(record.receipts) || !sha(record.indexSha256)) return false;
  if (record.parentIndexSha256 !== undefined && !sha(record.parentIndexSha256)) return false;
  if (!record.profiles.every(profileReference) || !record.invocationIntents.every(intentReference) || !record.receipts.every(receiptReference)) return false;
  const profileIds = record.profiles.map((entry) => entry.profileId);
  const intentIds = record.invocationIntents.map((entry) => entry.intentId);
  const receiptIds = record.receipts.map((entry) => entry.receiptId);
  if (!sortedUniqueIds(profileIds) || !sortedUniqueHashes(intentIds) || !sortedUniqueHashes(receiptIds)) return false;
  // Generation zero is the recursion-breaking bootstrap: exactly the frozen
  // profile set and no execution artifacts. Later generations retain profiles
  // and may append sorted immutable intent/receipt references.
  const frozen = [...FROZEN_ADMISSION_PROFILE_IDS].sort();
  if (JSON.stringify(profileIds) !== JSON.stringify(frozen)) return false;
  if (record.generation === 0) {
    if (record.parentIndexSha256 !== undefined || intentIds.length !== 0 || receiptIds.length !== 0) return false;
  } else if (record.parentIndexSha256 === undefined) return false;
  try { return hashWithout(value, ['indexSha256']) === record.indexSha256; } catch { return false; }
}

export function isCalibrationAdmissionToolAuthoritySnapshotV1(value: unknown): value is CalibrationAdmissionToolAuthoritySnapshotV1 {
  const record = snapshotRecord(value);
  if (!record || !exactKeys(record, ['version', 'indexGenerationSha256', 'profileIds', 'invocationIntentIds', 'receiptIds', 'snapshotSha256'])) return false;
  if (record.version !== 'v10.3-admission-tool-authority-snapshot-v1' || !sha(record.indexGenerationSha256) || !sortedUniqueIds(record.profileIds) || !sortedUniqueHashes(record.invocationIntentIds) || !sortedUniqueHashes(record.receiptIds) || !sha(record.snapshotSha256)) return false;
  if (JSON.stringify(record.profileIds) !== JSON.stringify([...FROZEN_ADMISSION_PROFILE_IDS].sort())) return false;
  try { return hashWithout(value, ['snapshotSha256']) === record.snapshotSha256; } catch { return false; }
}

function publicationLockShape(value: unknown, version: string): boolean {
  const record = snapshotRecord(value);
  if (!record || !exactKeys(record, ['version', 'lockId', 'intendedTransactionId', 'operation', 'expectedCurrentState', 'nextIndexSha256', 'artifactSetSha256', 'recoveryNonce', 'lockSha256'])) return false;
  return record.version === version
    && sha(record.lockId)
    && sha(record.intendedTransactionId)
    && (record.operation === 'create' || record.operation === 'replace')
    && expectedCurrentState(record.expectedCurrentState)
    && sha(record.nextIndexSha256)
    && sha(record.artifactSetSha256)
    && sha(record.recoveryNonce)
    && sha(record.lockSha256);
}

export function isCalibrationToolAuthorityPublicationLockV1(value: unknown): value is CalibrationToolAuthorityPublicationLockV1 {
  if (!publicationLockShape(value, 'v10.3-tool-authority-publication-lock-v1')) return false;
  return hashLinked(value, 'lockId', 'lockSha256');
}

function publicationTransactionShape(value: unknown, version: string): boolean {
  const record = snapshotRecord(value);
  if (!record || !exactKeys(record, ['version', 'transactionId', 'lockSha256', 'operation', 'expectedCurrentState', 'nextIndexSha256', 'artifacts', 'immutableIndexGenerationRelativePath', 'nextIndexTemporaryRelativePath', 'state', 'transactionSha256'])) return false;
  if (record.version !== version || !sha(record.transactionId) || !sha(record.lockSha256) || (record.operation !== 'create' && record.operation !== 'replace') || !expectedCurrentState(record.expectedCurrentState) || !sha(record.nextIndexSha256) || !Array.isArray(record.artifacts) || !path(record.immutableIndexGenerationRelativePath) || !path(record.nextIndexTemporaryRelativePath) || !sha(record.transactionSha256)) return false;
  const state = snapshotRecord(record.state);
  if (!state || !exactKeys(state, ['phase']) || typeof state.phase !== 'string') return false;
  const allowed = new Set(['intent_fsynced', 'artifacts_staged_fsynced', 'artifacts_promoted', 'index_generation_fsynced', 'next_index_temporary_fsynced', 'index_promoted', 'output_directories_fsynced', 'complete']);
  if (!allowed.has(state.phase)) return false;
  return record.artifacts.every((artifact) => {
    const item = snapshotRecord(artifact);
    return item !== undefined && exactKeys(item, ['stagedRelativePath', 'finalRelativePath', 'bytes', 'sha256']) && path(item.stagedRelativePath) && path(item.finalRelativePath) && safeInteger(item.bytes) && sha(item.sha256);
  });
}

export function isCalibrationToolAuthorityPublicationTransactionV1(value: unknown): value is CalibrationToolAuthorityPublicationTransactionV1 {
  return publicationTransactionShape(value, 'v10.3-tool-authority-publication-transaction-v1') && hashWithout(value, ['transactionSha256']) === (value as Record<string, unknown>).transactionSha256;
}

function childReceiptShape(value: unknown): boolean {
  const record = snapshotRecord(value);
  if (!record) return false;
  if (record.kind === 'none_infrastructure') return exactKeys(record, ['kind']);
  return record.kind === 'profiled' && exactKeys(record, ['kind', 'receiptId', 'receiptSha256']) && sha(record.receiptId) && sha(record.receiptSha256);
}

export function isCalibrationNestedPublicationHandoffV1(value: unknown): value is CalibrationNestedPublicationHandoffV1 {
  const record = snapshotRecord(value);
  if (!record || !exactKeys(record, ['version', 'parentTransactionId', 'childSlot', 'expectedCurrentStateSha256', 'childLockId', 'childLockSha256', 'childTransactionId', 'childTransactionIntentSha256', 'childRecoveryNonce', 'state', 'childKind', 'childAction', 'handoffSha256'].concat(record.childKind === 'tool_authority_infrastructure' ? ['toolAuthorityObjectSetSha256'] : ['childProfileId', 'childInvocationIntentId', 'childInvocationIntentRelativePath', 'childInvocationIntentSha256', 'childInvocationIntentAuthorityHandoffSha256', 'childInvocationIntentAuthorityIndexSha256']))) return false;
  if (record.version !== 'v10.3-nested-publication-handoff-v1' || !sha(record.parentTransactionId) || !ACTION.test(String(record.childSlot)) || !sha(record.expectedCurrentStateSha256) || !sha(record.childLockId) || !sha(record.childLockSha256) || !sha(record.childTransactionId) || !sha(record.childTransactionIntentSha256) || !sha(record.childRecoveryNonce) || !ACTION.test(String(record.childAction)) || !sha(record.handoffSha256)) return false;
  const state = snapshotRecord(record.state);
  if (!state) return false;
  if (state.phase === 'started_fsynced') {
    if (!exactKeys(state, ['phase'])) return false;
  } else if (state.phase === 'completed_fsynced') {
    if (!exactKeys(state, ['phase', 'namedPrimaryOutputProjectionSha256', 'nextAuthoritySha256', 'childAuthoritySha256', 'childReceipt']) || !sha(state.namedPrimaryOutputProjectionSha256) || !sha(state.nextAuthoritySha256) || !sha(state.childAuthoritySha256) || !childReceiptShape(state.childReceipt)) return false;
  } else return false;
  if (record.childKind === 'tool_authority_infrastructure') {
    if (record.childAction !== 'tool-authority:publish' || !sha(record.toolAuthorityObjectSetSha256)) return false;
    if (['childProfileId', 'childInvocationIntentId', 'childInvocationIntentRelativePath', 'childInvocationIntentSha256', 'childInvocationIntentAuthorityHandoffSha256', 'childInvocationIntentAuthorityIndexSha256'].some((key) => key in record)) return false;
  } else {
    if (record.childKind !== 'profiled_publication' || !profileId(record.childProfileId) || !sha(record.childInvocationIntentId) || !path(record.childInvocationIntentRelativePath) || !sha(record.childInvocationIntentSha256) || !sha(record.childInvocationIntentAuthorityHandoffSha256) || !sha(record.childInvocationIntentAuthorityIndexSha256)) return false;
    if ('toolAuthorityObjectSetSha256' in record) return false;
  }
  try { return hashWithout(value, ['handoffSha256']) === record.handoffSha256; } catch { return false; }
}

function https(value: unknown): value is string {
  return typeof value === 'string' && /^https:\/\/[^\s]+$/.test(value);
}

function positiveInteger(value: unknown, max = Number.MAX_SAFE_INTEGER): value is number {
  return safeInteger(value, 1, max);
}

export function isCalibrationApprovedEvidenceAcquisitionV1(value: unknown): value is CalibrationApprovedEvidenceAcquisitionV1 {
  const record = snapshotRecord(value);
  if (!record || !exactKeys(record, ['version', 'authorizationId', 'approvedBy', 'approvedAt', 'evidenceId', 'url', 'approvedRedirectUrls', 'expectedBytes', 'expectedSha256', 'expectedMediaType', 'maxTransferBytes', 'authorizationSha256'])) return false;
  if (record.version !== 'v10.3-approved-evidence-acquisition-v1' || !admissionId(record.authorizationId) || !nonEmptyString(record.approvedBy) || !nonEmptyString(record.approvedAt) || !admissionId(record.evidenceId) || !https(record.url) || !Array.isArray(record.approvedRedirectUrls) || !record.approvedRedirectUrls.every(https) || new Set(record.approvedRedirectUrls).size !== record.approvedRedirectUrls.length || !safeInteger(record.expectedBytes) || !sha(record.expectedSha256) || !mediaType(record.expectedMediaType) || !positiveInteger(record.maxTransferBytes, 5 * 1024 * 1024 * 1024) || !sha(record.authorizationSha256)) return false;
  if (record.expectedBytes > record.maxTransferBytes) return false;
  try { return hashWithout(value, ['authorizationId', 'authorizationSha256']) === record.authorizationId && hashWithout(value, ['authorizationSha256']) === record.authorizationSha256; } catch { return false; }
}

export function calibrationEvidenceAcquisitionReservationId(value: unknown): string {
  return hashWithout(value, ['reservationId', 'reservationSha256']);
}

export function isCalibrationEvidenceAcquisitionReservationV1(value: unknown): value is CalibrationEvidenceAcquisitionReservationV1 {
  const record = snapshotRecord(value);
  if (!record || !exactKeys(record, ['version', 'reservationId', 'authorizationId', 'invocationIntentId', 'recoveryNonce', 'reservationSha256'])) return false;
  if (record.version !== 'v10.3-evidence-acquisition-reservation-v1' || !sha(record.reservationId) || !admissionId(record.authorizationId) || !sha(record.invocationIntentId) || !sha(record.recoveryNonce) || !sha(record.reservationSha256)) return false;
  try { return calibrationEvidenceAcquisitionReservationId(value) === record.reservationId && hashWithout(value, ['reservationSha256']) === record.reservationSha256; } catch { return false; }
}

export function calibrationEvidenceAcquisitionReceiptId(value: unknown): string {
  return hashWithout(value, ['receiptId', 'receiptSha256']);
}

export function isCalibrationEvidenceAcquisitionReceiptV1(value: unknown): value is CalibrationEvidenceAcquisitionReceiptV1 {
  const record = snapshotRecord(value);
  if (!record || !exactKeys(record, ['version', 'receiptId', 'authorizationId', 'authorizationSha256', 'evidenceId', 'observedBytes', 'observedSha256', 'observedMediaType', 'redirectChain', 'resolvedPublicAddressesSha256', 'casTransactionId', 'primaryCompletionSha256', 'toolReceiptSha256', 'receiptSha256'])) return false;
  if (record.version !== 'v10.3-evidence-acquisition-receipt-v1' || !sha(record.receiptId) || !admissionId(record.authorizationId) || !sha(record.authorizationSha256) || !admissionId(record.evidenceId) || !safeInteger(record.observedBytes) || !sha(record.observedSha256) || !mediaType(record.observedMediaType) || !Array.isArray(record.redirectChain) || !record.redirectChain.every(https) || !sha(record.resolvedPublicAddressesSha256) || !admissionId(record.casTransactionId) || !sha(record.primaryCompletionSha256) || !sha(record.toolReceiptSha256) || !sha(record.receiptSha256)) return false;
  try { return calibrationEvidenceAcquisitionReceiptId(value) === record.receiptId && hashWithout(value, ['receiptSha256']) === record.receiptSha256; } catch { return false; }
}

export function calibrationEvidenceAcquisitionEnvelopeId(value: unknown): string {
  return hashWithout(value, ['envelopeId', 'envelopeSha256']);
}

export function isCalibrationEvidenceAcquisitionEnvelopeV1(value: unknown): value is CalibrationEvidenceAcquisitionEnvelopeV1 {
  const record = snapshotRecord(value);
  if (!record || !exactKeys(record, ['version', 'envelopeId', 'authorizationId', 'reservation', 'invocationIntentId', 'casTransactionId', 'primaryCompletionRelativePath', 'primaryCompletionSha256', 'acquisitionReceiptSha256', 'payloadId', 'toolReceiptSha256', 'envelopeSha256'])) return false;
  if (record.version !== 'v10.3-evidence-acquisition-envelope-v1' || !sha(record.envelopeId) || !admissionId(record.authorizationId) || !isCalibrationEvidenceAcquisitionReservationV1(record.reservation) || !sha(record.invocationIntentId) || !admissionId(record.casTransactionId) || !path(record.primaryCompletionRelativePath) || !sha(record.primaryCompletionSha256) || !sha(record.acquisitionReceiptSha256) || !admissionId(record.payloadId) || !sha(record.toolReceiptSha256) || !sha(record.envelopeSha256)) return false;
  const reservation = record.reservation as unknown as Record<string, unknown>;
  if (reservation.authorizationId !== record.authorizationId || reservation.invocationIntentId !== record.invocationIntentId) return false;
  try { return calibrationEvidenceAcquisitionEnvelopeId(value) === record.envelopeId && hashWithout(value, ['envelopeSha256']) === record.envelopeSha256; } catch { return false; }
}

function acquisitionArtifact(value: unknown): boolean {
  const record = snapshotRecord(value);
  return record !== undefined && exactKeys(record, ['kind', 'objectId', 'relativePath', 'sha256']) && typeof record.kind === 'string' && admissionId(record.objectId) && path(record.relativePath) && sha(record.sha256);
}

export function isCalibrationAdmissionAcquisitionIndexV1(value: unknown): value is CalibrationAdmissionAcquisitionIndexV1 {
  const record = snapshotRecord(value);
  if (!record || !exactKeys(record, ['version', 'generation', 'artifacts', 'indexSha256'].concat(record.parentIndexSha256 === undefined ? [] : ['parentIndexSha256']))) return false;
  if (record.version !== 'v10.3-admission-acquisition-index-v1' || !safeInteger(record.generation) || !Array.isArray(record.artifacts) || !record.artifacts.every(acquisitionArtifact) || !sha(record.indexSha256)) return false;
  if (record.parentIndexSha256 !== undefined && !sha(record.parentIndexSha256)) return false;
  const keys = record.artifacts.map((artifact) => {
    const item = artifact as Record<string, unknown>;
    return `${item.kind}:${item.objectId}`;
  });
  if (!sortedUniqueIds(keys)) return false;
  if (record.generation === 0 && (record.parentIndexSha256 !== undefined || record.artifacts.length !== 0)) return false;
  if (record.generation > 0 && record.parentIndexSha256 === undefined) return false;
  try { return hashWithout(value, ['indexSha256']) === record.indexSha256; } catch { return false; }
}

export function isCalibrationAdmissionAcquisitionSnapshotV1(value: unknown): value is CalibrationAdmissionAcquisitionSnapshotV1 {
  const record = snapshotRecord(value);
  if (!record || !exactKeys(record, ['version', 'indexGenerationSha256', 'artifactKeys', 'snapshotSha256'])) return false;
  if (record.version !== 'v10.3-admission-acquisition-snapshot-v1' || !sha(record.indexGenerationSha256) || !sortedUniqueIds(record.artifactKeys) || !sha(record.snapshotSha256)) return false;
  try { return hashWithout(value, ['snapshotSha256']) === record.snapshotSha256; } catch { return false; }
}

function networkObservation(value: unknown): boolean {
  const record = snapshotRecord(value);
  return record !== undefined
    && exactKeys(record, ['requestUrl', 'redirectChain', 'resolvedPublicAddresses', 'connectedPeerAddress', 'observedMediaType'])
    && https(record.requestUrl)
    && Array.isArray(record.redirectChain)
    && record.redirectChain.every(https)
    && Array.isArray(record.resolvedPublicAddresses)
    && record.resolvedPublicAddresses.every((entry) => nonEmptyString(entry) && entry.length <= 64)
    && nonEmptyString(record.connectedPeerAddress)
    && record.connectedPeerAddress.length <= 64
    && mediaType(record.observedMediaType);
}

export function isCalibrationEvidenceCasPrimaryCompletionV1(value: unknown): value is CalibrationEvidenceCasPrimaryCompletionV1 {
  const record = snapshotRecord(value);
  if (!record || !exactKeys(record, ['version', 'transactionId', 'authorizationId', 'reservationSha256', 'evidenceId', 'invocationIntentId', 'finalRelativePath', 'observedBytes', 'observedSha256', 'networkObservation', 'networkObservationSha256', 'primaryCompletionSha256'])) return false;
  if (record.version !== 'v10.3-evidence-cas-primary-completion-v1' || !admissionId(record.transactionId) || !admissionId(record.authorizationId) || !sha(record.reservationSha256) || !admissionId(record.evidenceId) || !sha(record.invocationIntentId) || !path(record.finalRelativePath) || !safeInteger(record.observedBytes) || !sha(record.observedSha256) || !networkObservation(record.networkObservation) || !sha(record.networkObservationSha256) || !sha(record.primaryCompletionSha256)) return false;
  try {
    return hashWithout(record.networkObservation, []) === record.networkObservationSha256
      && hashWithout(value, ['primaryCompletionSha256']) === record.primaryCompletionSha256;
  } catch { return false; }
}

function casTransactionState(value: unknown): boolean {
  const record = snapshotRecord(value);
  if (!record || typeof record.phase !== 'string') return false;
  if (record.phase === 'intent_fsynced') return exactKeys(record, ['phase']);
  if (record.phase === 'cas_complete_waiting_metadata') return exactKeys(record, ['phase', 'networkObservationRelativePath', 'networkObservationSha256', 'primaryCompletionRelativePath', 'primaryCompletionSha256']) && path(record.networkObservationRelativePath) && sha(record.networkObservationSha256) && path(record.primaryCompletionRelativePath) && sha(record.primaryCompletionSha256);
  return ['network_observation_fsynced', 'temporary_fsynced', 'object_promoted', 'cas_directories_fsynced', 'temporary_removed'].includes(record.phase)
    && exactKeys(record, ['phase', 'networkObservationRelativePath', 'networkObservationSha256'])
    && path(record.networkObservationRelativePath)
    && sha(record.networkObservationSha256);
}

export function isCalibrationAdmissionEvidenceCasTransactionV1(value: unknown): value is CalibrationAdmissionEvidenceCasTransactionV1 {
  const record = snapshotRecord(value);
  if (!record || !exactKeys(record, ['version', 'transactionId', 'authorizationId', 'reservationSha256', 'evidenceId', 'finalRelativePath', 'temporaryRelativePath', 'expectedBytes', 'expectedSha256', 'invocationIntentId', 'recoveryNonce', 'state', 'transactionSha256'])) return false;
  if (record.version !== 'v10.3-admission-evidence-cas-transaction-v1' || !admissionId(record.transactionId) || !admissionId(record.authorizationId) || !sha(record.reservationSha256) || !admissionId(record.evidenceId) || !path(record.finalRelativePath) || !path(record.temporaryRelativePath) || !safeInteger(record.expectedBytes) || !sha(record.expectedSha256) || !sha(record.invocationIntentId) || !sha(record.recoveryNonce) || !casTransactionState(record.state) || !sha(record.transactionSha256)) return false;
  if (record.finalRelativePath !== `evidence-cas/sha256/${record.expectedSha256.slice(0, 2)}/${record.expectedSha256}`) return false;
  try { return hashWithout(value, ['transactionSha256']) === record.transactionSha256; } catch { return false; }
}

function materializationPayload(value: unknown): boolean {
  const record = snapshotRecord(value);
  if (!record || typeof record.kind !== 'string') return false;
  if (record.kind === 'git') return exactKeys(record, ['kind', 'originUrl', 'commitSha', 'treeSha', 'inventorySha256']) && https(record.originUrl) && typeof record.commitSha === 'string' && /^[a-f0-9]{40,64}$/.test(record.commitSha) && typeof record.treeSha === 'string' && /^[a-f0-9]{40,64}$/.test(record.treeSha) && sha(record.inventorySha256);
  if (record.kind === 'release_archive') return exactKeys(record, ['kind', 'originUrl', 'assetSha256', 'assetBytes', 'inventorySha256']) && https(record.originUrl) && sha(record.assetSha256) && positiveInteger(record.assetBytes, 5 * 1024 * 1024 * 1024) && sha(record.inventorySha256);
  return false;
}

export function calibrationAdmissionMaterializationReceiptId(value: unknown): string {
  return hashWithout(value, ['receiptId']);
}

export function isCalibrationAdmissionMaterializationReceiptV1(value: unknown): value is CalibrationAdmissionMaterializationReceiptV1 {
  const record = snapshotRecord(value);
  if (!record || !exactKeys(record, ['version', 'receiptId', 'materializationId', 'sourceId', 'repositoryId', 'acquisitionAuthorizationId', 'acquisitionAuthorizationSha256', 'acquisitionTransactionId', 'primaryMaterializedOutputSha256', 'childToolReceiptSha256', 'verifiedUnitSetSha256', 'payload'])) return false;
  if (record.version !== 'v10.3-admission-materialization-receipt-v1' || !sha(record.receiptId) || !admissionId(record.materializationId) || !admissionId(record.sourceId) || !admissionId(record.repositoryId) || !admissionId(record.acquisitionAuthorizationId) || !sha(record.acquisitionAuthorizationSha256) || !admissionId(record.acquisitionTransactionId) || !sha(record.primaryMaterializedOutputSha256) || !sha(record.childToolReceiptSha256) || !sha(record.verifiedUnitSetSha256) || !materializationPayload(record.payload)) return false;
  try { return calibrationAdmissionMaterializationReceiptId(value) === record.receiptId; } catch { return false; }
}
