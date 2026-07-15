/**
 * Pure Task 3B witness-review graph construction.
 *
 * This module does not read or write files.  It accepts already verified
 * search/review artifacts, checks the cross-object joins that Core's shape
 * validators intentionally cannot know, then emits one canonical acyclic
 * witness-review bundle.  Filesystem publication is a separate boundary.
 */
import {
  calibrationAdmissionBlindReviewReceiptId,
  calibrationAdmissionCanonicalJson,
  calibrationAdmissionDecisionId,
  calibrationAdmissionSearchResultBundleSha256,
  calibrationAdmissionSha256,
  calibrationAdmissionToolReceiptSha256,
  calibrationAdmissionWitnessReviewBundleId,
  calibrationAdmissionWitnessReviewBundleSha256,
  calibrationAdmissionWitnessReviewReceiptSha256,
  isCalibrationAdmissionBlindAssignmentV1,
  isCalibrationAdmissionBlindReviewReceiptV1,
  isCalibrationAdmissionDecisionV103,
  isCalibrationAdmissionInvocationIntentV1,
  isCalibrationAdmissionSearchResultBundleV1,
  isCalibrationAdmissionToolReceiptV1,
  validateCalibrationAdmissionBlindAssignmentV1,
  validateCalibrationAdmissionBlindReviewReceiptV1,
  validateCalibrationAdmissionDecisionV103,
  validateCalibrationAdmissionWitnessReviewBundleV1,
  validateCalibrationAdmissionWitnessReviewReceiptV1,
  type CalibrationAdmissionBlindAssignmentV1,
  type CalibrationAdmissionBlindReviewReceiptV1,
  type CalibrationAdmissionDecisionV103,
  type CalibrationAdmissionInvocationIntentV1,
  type CalibrationAdmissionSearchResultBundleV1,
  type CalibrationAdmissionToolReceiptV1,
  type CalibrationAdmissionWitnessReviewBundleV1,
} from '@usebrick/core';

const SHA256 = /^[a-f0-9]{64}$/u;
const H = '0'.repeat(64);

type WitnessRegenerationV1 = CalibrationAdmissionWitnessReviewBundleV1['regenerations'][number];
type WitnessConstraintCheckV1 = CalibrationAdmissionWitnessReviewBundleV1['constraintCheck'];

export interface AdmissionWitnessReviewBuildInputV1 {
  readonly searchResultBundle: CalibrationAdmissionSearchResultBundleV1;
  readonly regenerations: readonly [WitnessRegenerationV1, WitnessRegenerationV1];
  readonly constraintCheck: WitnessConstraintCheckV1;
  readonly blindAssignment: CalibrationAdmissionBlindAssignmentV1;
  readonly reviewerDecisions: readonly [CalibrationAdmissionDecisionV103, CalibrationAdmissionDecisionV103];
  readonly blindReviewReceipt: CalibrationAdmissionBlindReviewReceiptV1;
}

export type AdmissionWitnessReviewBuildResultV1 =
  | { readonly ok: true; readonly bundle: CalibrationAdmissionWitnessReviewBundleV1 }
  | { readonly ok: false; readonly errors: readonly string[] };

function same(left: unknown, right: unknown): boolean {
  return calibrationAdmissionCanonicalJson(left) === calibrationAdmissionCanonicalJson(right);
}

function add(errors: string[], condition: boolean, message: string): void {
  if (!condition) errors.push(message);
}

function sha(value: unknown): value is string {
  return typeof value === 'string' && SHA256.test(value);
}

function record(value: unknown): Record<string, unknown> | undefined {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? value as Record<string, unknown>
    : undefined;
}

function crossValidateIntentAndReceipt(
  intent: CalibrationAdmissionInvocationIntentV1,
  receipt: CalibrationAdmissionToolReceiptV1,
  action: string,
  expectedOutputSetSha256: string | undefined,
  name: string,
  errors: string[],
): void {
  add(errors, isCalibrationAdmissionInvocationIntentV1(intent), `${name} invocation intent is invalid`);
  add(errors, intent.action === action, `${name} action must be ${action}`);
  add(errors, isCalibrationAdmissionToolReceiptV1(receipt, undefined, intent), `${name} tool receipt is not bound to its invocation intent`);
  add(errors, receipt.invocationIntentId === intent.intentId, `${name} tool receipt invocationIntentId does not match its intent`);
  if (expectedOutputSetSha256 !== undefined) add(errors, receipt.outputSetSha256 === expectedOutputSetSha256, `${name} tool receipt output does not match its artifact`);
}

function validateSearchAuthority(
  value: CalibrationAdmissionSearchResultBundleV1,
  gate: 'smoke' | 'canary',
  verifiedContextSha256: string,
  eligibilitySnapshotSha256: string,
  errors: string[],
): string | undefined {
  const validation = isCalibrationAdmissionSearchResultBundleV1(value);
  add(errors, validation, 'search result bundle is invalid');
  add(errors, value.gate === gate, 'search result bundle gate does not match witness review');
  add(errors, value.verifiedContextSha256 === verifiedContextSha256, 'search result bundle context does not match witness review');
  add(errors, value.eligibilitySnapshotSha256 === eligibilitySnapshotSha256, 'search result bundle eligibility snapshot does not match witness review');
  const result = record(value.result);
  const witness = record(result?.witness);
  const witnessSha256 = typeof witness?.witnessSha256 === 'string' ? witness.witnessSha256 : undefined;
  add(errors, result?.kind === 'witness' && witnessSha256 !== undefined && sha(witnessSha256), 'witness review requires a witness search result');
  if (witness !== undefined) {
    add(errors, witness.gate === gate, 'search witness gate does not match witness review');
    add(errors, witness.verifiedContextSha256 === verifiedContextSha256, 'search witness context does not match witness review');
    add(errors, witness.eligibilitySnapshotSha256 === eligibilitySnapshotSha256, 'search witness eligibility snapshot does not match witness review');
  }
  add(errors, value.invocationIntents.length === 1, 'search result bundle must contain exactly one search invocation intent');
  add(errors, value.toolReceipts.length === 1, 'search result bundle must contain exactly one search tool receipt');
  const searchIntent = value.invocationIntents[0];
  const searchReceipt = value.toolReceipts[0];
  if (searchIntent !== undefined && searchReceipt !== undefined && witnessSha256 !== undefined) {
    crossValidateIntentAndReceipt(searchIntent, searchReceipt, 'witness:search', witnessSha256, 'search', errors);
    add(errors, value.searchReceipt.toolReceiptSha256 === calibrationAdmissionToolReceiptSha256(searchReceipt), 'search receipt does not bind the search tool receipt');
    add(errors, value.searchReceipt.terminal === 'witness', 'search receipt must prove a witness result before review');
    add(errors, value.searchReceipt.terminalArtifactSha256 === witnessSha256, 'search receipt terminal artifact does not match witness');
  }
  return witnessSha256;
}

function validateRegenerations(
  regenerations: readonly [WitnessRegenerationV1, WitnessRegenerationV1],
  witnessSha256: string | undefined,
  errors: string[],
): WitnessRegenerationV1[] {
  const ordered = [...regenerations].sort((left, right) => left.invocationIntent.intentId.localeCompare(right.invocationIntent.intentId));
  add(errors, ordered.length === 2, 'witness regenerations must contain exactly two entries');
  const intentIds = new Set<string>();
  const receiptHashes = new Set<string>();
  for (const [index, entry] of ordered.entries()) {
    const name = `regeneration ${index + 1}`;
    add(errors, sha(entry.witnessSha256), `${name} witness hash is invalid`);
    if (witnessSha256 !== undefined) add(errors, entry.witnessSha256 === witnessSha256, `${name} does not match search witness`);
    crossValidateIntentAndReceipt(entry.invocationIntent, entry.toolReceipt, 'witness:regenerate', witnessSha256, name, errors);
    add(errors, !intentIds.has(entry.invocationIntent.intentId), `${name} invocation intent is duplicated`);
    intentIds.add(entry.invocationIntent.intentId);
    const receiptHash = calibrationAdmissionToolReceiptSha256(entry.toolReceipt);
    add(errors, !receiptHashes.has(receiptHash), `${name} tool receipt is duplicated`);
    receiptHashes.add(receiptHash);
  }
  return ordered;
}

function validateConstraintCheck(
  constraintCheck: WitnessConstraintCheckV1,
  errors: string[],
): void {
  add(errors, sha(constraintCheck.constraintChecksSha256) && constraintCheck.constraintChecksSha256 !== H, 'constraint check hash must be a non-placeholder SHA-256');
  crossValidateIntentAndReceipt(
    constraintCheck.invocationIntent,
    constraintCheck.toolReceipt,
    'witness:constraint-check',
    constraintCheck.constraintChecksSha256,
    'constraint check',
    errors,
  );
  add(errors, constraintCheck.invocationIntent.inputSetSha256 !== H, 'constraint check intent must bind a concrete witness input');
}

function validateReviewDecisions(
  assignment: CalibrationAdmissionBlindAssignmentV1,
  decisions: readonly [CalibrationAdmissionDecisionV103, CalibrationAdmissionDecisionV103],
  witnessSha256: string | undefined,
  eligibilitySnapshotSha256: string,
  verifiedContextSha256: string,
  errors: string[],
): CalibrationAdmissionDecisionV103[] {
  const ordered = [...decisions].sort((left, right) => left.reviewerId.localeCompare(right.reviewerId));
  add(errors, ordered.length === 2, 'witness reviewer decisions must contain exactly two entries');
  const reviewerIds = new Set<string>();
  const decisionIds = new Set<string>();
  const decisionsResult: string[] = [];
  for (const [index, decision] of ordered.entries()) {
    const name = `reviewer decision ${index + 1}`;
    const validation = validateCalibrationAdmissionDecisionV103(decision, assignment);
    add(errors, validation.ok && isCalibrationAdmissionDecisionV103(decision), `${name} is invalid`);
    const target = record(decision.target);
    add(errors, target?.kind === 'witness', `${name} must target a witness`);
    if (witnessSha256 !== undefined) {
      add(errors, target?.witnessSha256 === witnessSha256, `${name} witness target does not match search witness`);
      add(errors, target?.eligibilitySnapshotSha256 === eligibilitySnapshotSha256, `${name} snapshot target does not match witness review`);
      add(errors, target?.verifiedContextSha256 === verifiedContextSha256, `${name} context target does not match witness review`);
    }
    add(errors, same(decision.reviewerRoles, ['calibration']), `${name} must use only the calibration role`);
    add(errors, decision.adjudicatesDecisionIds === undefined, `${name} cannot adjudicate another witness decision`);
    add(errors, !reviewerIds.has(decision.reviewerId), `${name} reviewer is duplicated`);
    add(errors, !decisionIds.has(decision.decisionId), `${name} decision ID is duplicated`);
    reviewerIds.add(decision.reviewerId);
    decisionIds.add(decision.decisionId);
    if (decision.result.kind === 'witness') decisionsResult.push(decision.result.decision);
  }
  add(errors, decisionsResult.length === 2 && decisionsResult[0] === decisionsResult[1], 'witness reviewer decisions disagree');
  return ordered;
}

/** Build and cross-validate the complete, post-decision witness-review graph. */
export function buildAdmissionWitnessReviewBundle(input: AdmissionWitnessReviewBuildInputV1): AdmissionWitnessReviewBuildResultV1 {
  const errors: string[] = [];
  const search = input.searchResultBundle;
  const gate = search.gate;
  const verifiedContextSha256 = search.verifiedContextSha256;
  const eligibilitySnapshotSha256 = search.eligibilitySnapshotSha256;
  const witnessSha256 = validateSearchAuthority(search, gate, verifiedContextSha256, eligibilitySnapshotSha256, errors);
  const regenerations = validateRegenerations(input.regenerations, witnessSha256, errors);
  validateConstraintCheck(input.constraintCheck, errors);

  const assignmentValidation = validateCalibrationAdmissionBlindAssignmentV1(input.blindAssignment);
  add(errors, assignmentValidation.ok && isCalibrationAdmissionBlindAssignmentV1(input.blindAssignment), 'witness blind assignment is invalid');
  const target = record(input.blindAssignment.target);
  add(errors, target?.kind === 'witness', 'witness blind assignment must target a witness');
  if (witnessSha256 !== undefined) {
    add(errors, target?.witnessSha256 === witnessSha256, 'witness blind assignment does not target the search witness');
    add(errors, target?.eligibilitySnapshotSha256 === eligibilitySnapshotSha256, 'witness blind assignment snapshot does not match');
    add(errors, target?.verifiedContextSha256 === verifiedContextSha256, 'witness blind assignment context does not match');
  }

  const decisions = validateReviewDecisions(input.blindAssignment, input.reviewerDecisions, witnessSha256, eligibilitySnapshotSha256, verifiedContextSha256, errors);
  const blindReceiptValidation = validateCalibrationAdmissionBlindReviewReceiptV1(input.blindReviewReceipt, decisions, input.blindAssignment);
  add(errors, blindReceiptValidation.ok && isCalibrationAdmissionBlindReviewReceiptV1(input.blindReviewReceipt), 'witness blind review receipt is invalid');
  add(errors, input.blindReviewReceipt.assignmentId === input.blindAssignment.assignmentId, 'witness blind review receipt does not bind assignment');
  add(errors, same(input.blindReviewReceipt.sealedDecisions.map((entry) => entry.decisionId), decisions.map((entry) => entry.decisionId)), 'blind receipt decision order does not match reviewer decisions');

  if (errors.length > 0 || witnessSha256 === undefined) {
    return { ok: false, errors: [...new Set(errors)] };
  }

  const regenerationReceiptHashes = regenerations.map((entry) => calibrationAdmissionToolReceiptSha256(entry.toolReceipt)) as [string, string];
  const reviewerDecisionIds = decisions.map((entry) => entry.decisionId) as [string, string];
  const reviewDecision = decisions[0]?.result.kind === 'witness' && decisions[0].result.decision === 'approved' ? 'approved' : 'rejected';
  const reviewReceiptBody = {
    version: 'v10.3-admission-witness-review-receipt-v1' as const,
    witnessSha256,
    eligibilitySnapshotSha256,
    verifiedContextSha256,
    blindReviewReceiptId: input.blindReviewReceipt.receiptId,
    independentlyRegeneratedWitnessSha256s: [witnessSha256, witnessSha256] as [string, string],
    regenerationToolReceiptSha256s: regenerationReceiptHashes,
    constraintChecksSha256: input.constraintCheck.constraintChecksSha256,
    constraintCheckToolReceiptSha256: calibrationAdmissionToolReceiptSha256(input.constraintCheck.toolReceipt),
    reviewerDecisionIds,
    decision: reviewDecision,
  };
  const witnessReviewReceipt = {
    ...reviewReceiptBody,
    receiptId: calibrationAdmissionWitnessReviewReceiptSha256(reviewReceiptBody),
  };
  const reviewReceiptValidation = validateCalibrationAdmissionWitnessReviewReceiptV1(witnessReviewReceipt);
  add(errors, reviewReceiptValidation.ok, 'witness review receipt is invalid');

  if (errors.length > 0) return { ok: false, errors: [...new Set(errors)] };

  const body = {
    version: 'v10.3-admission-witness-review-bundle-v1' as const,
    gate,
    verifiedContextSha256,
    eligibilitySnapshotSha256,
    searchResultBundle: search,
    regenerations: regenerations as [WitnessRegenerationV1, WitnessRegenerationV1],
    constraintCheck: input.constraintCheck,
    blindAssignment: input.blindAssignment,
    reviewerDecisions: decisions as [CalibrationAdmissionDecisionV103, CalibrationAdmissionDecisionV103],
    blindReviewReceipt: input.blindReviewReceipt,
    witnessReviewReceipt,
  };
  const withId = { ...body, bundleId: calibrationAdmissionWitnessReviewBundleId(body) };
  const bundle = { ...withId, bundleSha256: calibrationAdmissionWitnessReviewBundleSha256(withId) } as CalibrationAdmissionWitnessReviewBundleV1;
  const bundleValidation = validateCalibrationAdmissionWitnessReviewBundleV1(bundle);
  if (!bundleValidation.ok) return { ok: false, errors: bundleValidation.errors };
  return { ok: true, bundle };
}

export function assertAdmissionWitnessReviewBundle(input: AdmissionWitnessReviewBuildInputV1): CalibrationAdmissionWitnessReviewBundleV1 {
  const result = buildAdmissionWitnessReviewBundle(input);
  if (!result.ok) throw new Error(result.errors.join('; '));
  return result.bundle;
}

/** Recompute the canonical bundle hash without changing any graph edges. */
export function admissionWitnessReviewBundleSha256(value: CalibrationAdmissionWitnessReviewBundleV1): string {
  return calibrationAdmissionWitnessReviewBundleSha256(value);
}

/** Recompute a receipt hash for callers persisting a review receipt separately. */
export function admissionWitnessReviewReceiptSha256(value: CalibrationAdmissionWitnessReviewBundleV1['witnessReviewReceipt']): string {
  return calibrationAdmissionWitnessReviewReceiptSha256(value as unknown as Record<string, unknown>);
}

/** Recompute an individual decision ID for adapters that seal decisions outside this builder. */
export function admissionWitnessDecisionId(value: Omit<CalibrationAdmissionDecisionV103, 'decisionId'>): string {
  return calibrationAdmissionDecisionId(value);
}

/** Recompute a blind-review receipt ID for adapters that persist it separately. */
export function admissionBlindReviewReceiptId(value: Omit<CalibrationAdmissionBlindReviewReceiptV1, 'receiptId'>): string {
  return calibrationAdmissionBlindReviewReceiptId(value);
}

/** Recompute a search result hash for publication selectors. */
export function admissionSearchResultBundleSha256(value: CalibrationAdmissionSearchResultBundleV1): string {
  return calibrationAdmissionSearchResultBundleSha256(value);
}
