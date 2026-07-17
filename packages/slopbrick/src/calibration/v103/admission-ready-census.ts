/**
 * Private readiness boundary for the v10.3 admission census.
 *
 * A Core-valid census is only a durable shape.  This module adds the runtime
 * proof that the census was rebuilt from one verified admission context and
 * the exact search/review inputs it names.  The returned identity is kept in
 * a module-private WeakSet so a cast, clone, or deserialized JSON object can
 * never satisfy a manifest-builder boundary.
 *
 * This slice is deliberately pure. Filesystem reopening and indexed
 * tool-authority resolution belong to the publication verifiers; callers must
 * pass the exact reopened publications plus their private authority joins.
 */
import {
  calibrationAdmissionCanonicalJson,
  calibrationAdmissionSearchReceiptSha256,
  calibrationAdmissionToolReceiptSha256,
  isCalibrationAdmissionCensusV103,
  isCalibrationAdmissionSearchResultBundleV1,
  isCalibrationAdmissionWitnessReviewBundleV1,
  type CalibrationAdmissionCensusV103,
  type CalibrationAdmissionSearchResultBundleV1,
  type CalibrationAdmissionWitnessReviewBundleV1,
} from '@usebrick/core';

import {
  buildAdmissionCensus,
  type AdmissionCensusBuildInputV1,
} from './admission-census';
import {
  isVerifiedAdmissionContext,
  type VerifiedAdmissionContextV1,
} from './admission-context';
import {
  isVerifiedAdmissionWitnessPublication,
  type VerifiedAdmissionWitnessPublicationV1,
} from './admission-witness-reopen';
import {
  isVerifiedAdmissionWitnessPublicationAuthority,
  type VerifiedAdmissionWitnessPublicationAuthorityV1,
} from './admission-witness-authority';

export type AdmissionReadyCensusGateV1 = 'smoke' | 'canary';

export interface VerifyReadyAdmissionCensusInputV1 {
  readonly context: VerifiedAdmissionContextV1;
  readonly census: unknown;
  readonly gate: AdmissionReadyCensusGateV1;
  readonly buildInput: AdmissionCensusBuildInputV1;
  readonly witnessReviewBundle: unknown;
  readonly searchPublication: VerifiedAdmissionWitnessPublicationV1;
  readonly witnessReviewPublication: VerifiedAdmissionWitnessPublicationV1;
  readonly searchPublicationAuthority: VerifiedAdmissionWitnessPublicationAuthorityV1;
  readonly witnessReviewPublicationAuthority: VerifiedAdmissionWitnessPublicationAuthorityV1;
}

declare const verifiedReadyAdmissionCensusBrand: unique symbol;

export type VerifiedReadyAdmissionCensusV1 = Readonly<{
  readonly context: VerifiedAdmissionContextV1;
  readonly census: CalibrationAdmissionCensusV103;
  readonly gate: AdmissionReadyCensusGateV1;
  readonly witnessReviewBundle: CalibrationAdmissionWitnessReviewBundleV1;
  readonly searchPublicationAuthority: VerifiedAdmissionWitnessPublicationAuthorityV1;
  readonly witnessReviewPublicationAuthority: VerifiedAdmissionWitnessPublicationAuthorityV1;
  readonly [verifiedReadyAdmissionCensusBrand]: true;
}>;

const verifiedReadyAdmissionCensus = new WeakSet<object>();

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function sameBytes(left: unknown, right: unknown): boolean {
  try {
    return calibrationAdmissionCanonicalJson(left) === calibrationAdmissionCanonicalJson(right);
  } catch {
    return false;
  }
}

function compareString(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function validSha(value: unknown): value is string {
  return typeof value === 'string' && /^[a-f0-9]{64}$/u.test(value);
}

function isHashAddressedPublicationPath(value: unknown, gate: AdmissionReadyCensusGateV1): value is string {
  return typeof value === 'string'
    && value.startsWith(`review/admission/witnesses/${gate}/publication-completions/`)
    && value.endsWith('.json')
    && validSha(value.slice(`review/admission/witnesses/${gate}/publication-completions/`.length, -'.json'.length));
}

function verifySearchBundle(
  gate: AdmissionReadyCensusGateV1,
  context: VerifiedAdmissionContextV1,
  snapshotSha256: string,
  summary: Record<string, unknown>,
  publication: AdmissionCensusBuildInputV1['search'][AdmissionReadyCensusGateV1],
  reopenedPublication: VerifiedAdmissionWitnessPublicationV1,
): { readonly bundle?: CalibrationAdmissionSearchResultBundleV1; readonly errors: readonly string[] } {
  const errors: string[] = [];
  const bundle = publication.bundle;
  if (!isCalibrationAdmissionSearchResultBundleV1(bundle)) {
    errors.push(`${gate} search result bundle is invalid`);
    return { errors };
  }
  if (!isVerifiedAdmissionWitnessPublication(reopenedPublication)
    || reopenedPublication.gate !== gate
    || reopenedPublication.kind !== 'search_result'
    || !sameBytes(reopenedPublication.bundle, bundle)
    || reopenedPublication.reference.bundleRelativePath !== summary.searchResultBundleRelativePath
    || reopenedPublication.reference.publicationCompletionRelativePath !== publication.publicationCompletionRelativePath
    || reopenedPublication.reference.publicationCompletionSha256 !== publication.publicationCompletionSha256) {
    errors.push(`${gate} search publication was not reopened from its exact reference`);
  }
  if (bundle.gate !== gate) errors.push(`${gate} search result gate does not match`);
  if (bundle.verifiedContextSha256 !== context.contextSha256) errors.push(`${gate} search result context does not match`);
  if (bundle.eligibilitySnapshotSha256 !== snapshotSha256) errors.push(`${gate} search result snapshot does not match`);
  if (summary.searchResultBundleSha256 !== bundle.bundleSha256) errors.push(`${gate} census does not bind the search result bundle`);
  if (summary.searchResultBundleRelativePath !== `review/admission/witnesses/${gate}/search-results/${bundle.bundleSha256}.json`) {
    errors.push(`${gate} census search-result path is not hash-addressed`);
  }
  if (summary.searchResultPublicationCompletionSha256 !== publication.publicationCompletionSha256
    || summary.searchResultPublicationCompletionRelativePath !== publication.publicationCompletionRelativePath) {
    errors.push(`${gate} census does not bind the search publication completion`);
  }
  if (!validSha(publication.publicationCompletionSha256) || /^0{64}$/u.test(publication.publicationCompletionSha256)
    || !isHashAddressedPublicationPath(publication.publicationCompletionRelativePath, gate)
    || publication.publicationCompletionRelativePath !== `review/admission/witnesses/${gate}/publication-completions/${publication.publicationCompletionSha256}.json`) {
    errors.push(`${gate} search publication completion is not hash-addressed`);
  }
  if (bundle.result.kind !== 'witness') errors.push(`${gate} search result is not a witness`);
  if (bundle.searchReceipt.eligibilitySnapshotSha256 !== snapshotSha256
    || calibrationAdmissionSearchReceiptSha256(bundle.searchReceipt) !== bundle.searchReceipt.receiptId) {
    errors.push(`${gate} search receipt is not bound to the snapshot`);
  }
  const toolReceiptHashes = new Set(bundle.toolReceipts.map((receipt) => calibrationAdmissionToolReceiptSha256(receipt)));
  if (!validSha(bundle.searchReceipt.toolReceiptSha256) || !toolReceiptHashes.has(bundle.searchReceipt.toolReceiptSha256)) {
    errors.push(`${gate} search receipt is not bound to an indexed tool receipt`);
  }
  const intentIds = new Set(bundle.invocationIntents.map((intent) => intent.intentId));
  for (const receipt of bundle.toolReceipts) {
    if (!intentIds.has(receipt.invocationIntentId)) errors.push(`${gate} tool receipt is not bound to an invocation intent`);
  }
  return { bundle, errors };
}

function verifyReviewBundle(
  gate: AdmissionReadyCensusGateV1,
  context: VerifiedAdmissionContextV1,
  snapshotSha256: string,
  summary: Record<string, unknown>,
  searchBundle: CalibrationAdmissionSearchResultBundleV1,
  input: VerifyReadyAdmissionCensusInputV1,
): { readonly bundle?: CalibrationAdmissionWitnessReviewBundleV1; readonly errors: readonly string[] } {
  const errors: string[] = [];
  const value = input.witnessReviewBundle;
  if (!isCalibrationAdmissionWitnessReviewBundleV1(value)) {
    errors.push(`${gate} witness review bundle is invalid`);
    return { errors };
  }
  const bundle = value as CalibrationAdmissionWitnessReviewBundleV1;
  if (!isVerifiedAdmissionWitnessPublication(input.witnessReviewPublication)
    || input.witnessReviewPublication.gate !== gate
    || input.witnessReviewPublication.kind !== 'witness_review'
    || !sameBytes(input.witnessReviewPublication.bundle, bundle)
    || input.witnessReviewPublication.reference.bundleRelativePath !== summary.witnessReviewBundleRelativePath
    || input.witnessReviewPublication.reference.publicationCompletionRelativePath !== input.buildInput.witnessReviewPublications?.[gate]?.publicationCompletionRelativePath
    || input.witnessReviewPublication.reference.publicationCompletionSha256 !== input.buildInput.witnessReviewPublications?.[gate]?.publicationCompletionSha256) {
    errors.push(`${gate} witness review publication was not reopened from its exact reference`);
  }
  if (bundle.gate !== gate) errors.push(`${gate} witness review gate does not match`);
  if (bundle.verifiedContextSha256 !== context.contextSha256) errors.push(`${gate} witness review context does not match`);
  if (bundle.eligibilitySnapshotSha256 !== snapshotSha256) errors.push(`${gate} witness review snapshot does not match`);
  if (!sameBytes(bundle.searchResultBundle, searchBundle)) errors.push(`${gate} witness review does not embed the exact search bundle`);
  if (bundle.witnessReviewReceipt.decision !== 'approved') errors.push(`${gate} witness review is not approved`);
  if (bundle.searchResultBundle.result.kind !== 'witness'
    || bundle.witnessReviewReceipt.witnessSha256 !== bundle.searchResultBundle.result.witness.witnessSha256
    || summary.witnessSha256 !== bundle.searchResultBundle.result.witness.witnessSha256) {
    errors.push(`${gate} census does not bind the reviewed witness`);
  }
  const reviewPublication = input.buildInput.witnessReviewPublications?.[gate];
  if (summary.witnessReviewBundleSha256 !== bundle.bundleSha256
    || reviewPublication === undefined
    || summary.witnessReviewPublicationCompletionSha256 !== reviewPublication.publicationCompletionSha256
    || summary.witnessReviewPublicationCompletionRelativePath !== reviewPublication.publicationCompletionRelativePath) {
    errors.push(`${gate} census does not bind the complete witness review publication`);
  }
  if (summary.witnessReviewBundleRelativePath !== `review/admission/witnesses/${gate}/witness-reviews/${bundle.bundleSha256}.json`) {
    errors.push(`${gate} census witness-review path is not hash-addressed`);
  }
  if (reviewPublication === undefined
    || !validSha(reviewPublication.publicationCompletionSha256)
    || /^0{64}$/u.test(reviewPublication.publicationCompletionSha256)
    || !isHashAddressedPublicationPath(reviewPublication.publicationCompletionRelativePath, gate)
    || reviewPublication.publicationCompletionRelativePath !== `review/admission/witnesses/${gate}/publication-completions/${reviewPublication.publicationCompletionSha256}.json`) {
    errors.push(`${gate} witness review publication completion is not hash-addressed`);
  }
  const declaredReview = input.buildInput.witnessReviews?.[gate];
  if (declaredReview === undefined || !sameBytes(declaredReview, bundle)) errors.push(`${gate} build inputs do not contain the exact witness review bundle`);
  return { bundle, errors };
}

function deepFreeze<T>(value: T, seen = new WeakSet<object>()): T {
  if (typeof value !== 'object' || value === null || seen.has(value)) return value;
  seen.add(value);
  for (const key of Reflect.ownKeys(value)) deepFreeze((value as Record<PropertyKey, unknown>)[key], seen);
  return Object.freeze(value);
}

/** Return true only for the exact object minted by this module. */
export function isVerifiedReadyAdmissionCensus(value: unknown): value is VerifiedReadyAdmissionCensusV1 {
  return typeof value === 'object' && value !== null && verifiedReadyAdmissionCensus.has(value);
}

/**
 * Rebuild and verify one ready gate.  The caller must supply both gates in
 * `buildInput.search`; the selected gate additionally needs an approved,
 * published witness-review bundle and both private publication-authority
 * joins. No persisted JSON is trusted merely for being schema-valid, and no
 * files are discovered by this function.
 */
export async function verifyReadyAdmissionCensus(
  input: VerifyReadyAdmissionCensusInputV1,
): Promise<{ readonly ok: true; readonly ready: VerifiedReadyAdmissionCensusV1 } | { readonly ok: false; readonly errors: readonly string[] }> {
  const errors: string[] = [];
  if (!isVerifiedAdmissionContext(input?.context)) {
    return { ok: false, errors: ['verified admission context is required'] };
  }
  if (!isVerifiedAdmissionWitnessPublication(input?.searchPublication)) errors.push('verified search publication is required');
  if (!isVerifiedAdmissionWitnessPublication(input?.witnessReviewPublication)) errors.push('verified witness review publication is required');
  if (!isVerifiedAdmissionWitnessPublicationAuthority(input?.searchPublicationAuthority)) errors.push('verified search publication authority is required');
  if (!isVerifiedAdmissionWitnessPublicationAuthority(input?.witnessReviewPublicationAuthority)) errors.push('verified witness review publication authority is required');
  if (isVerifiedAdmissionWitnessPublicationAuthority(input?.searchPublicationAuthority)
    && input.searchPublicationAuthority.publication !== input.searchPublication) {
    errors.push('search publication authority is not bound to the reopened publication');
  }
  if (isVerifiedAdmissionWitnessPublicationAuthority(input?.witnessReviewPublicationAuthority)
    && input.witnessReviewPublicationAuthority.publication !== input.witnessReviewPublication) {
    errors.push('witness review publication authority is not bound to the reopened publication');
  }
  if (!isObject(input.buildInput)) errors.push('ready census build inputs are required');
  if (input.buildInput?.context !== input.context) errors.push('ready census build inputs use a different admission context');
  if (input.gate !== 'smoke' && input.gate !== 'canary') errors.push('ready census gate is invalid');
  if (!isCalibrationAdmissionCensusV103(input.census)) errors.push('ready census is not Core-valid');
  if (!isObject(input.census)) errors.push('ready census is not an object');
  const census = input.census as CalibrationAdmissionCensusV103;
  const summary = isObject(census[input.gate]) ? census[input.gate] : undefined;
  const summaryRecord = summary as Record<string, unknown> | undefined;
  if (summaryRecord === undefined) errors.push('ready census gate summary is missing');

  let rebuilt: CalibrationAdmissionCensusV103 | undefined;
  if (errors.length === 0) {
    try {
      const result = buildAdmissionCensus(input.buildInput);
      if (!result.ok) errors.push(...result.errors.map((error) => `census rebuild: ${error}`));
      else {
        rebuilt = result.census;
        if (!sameBytes(result.census, input.census)) errors.push('ready census bytes do not match a rebuild from verified inputs');
      }
    } catch (error) {
      errors.push(`census rebuild: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  const snapshotSha256 = rebuilt?.eligibilitySnapshotSha256 ?? census.eligibilitySnapshotSha256;
  if (summaryRecord !== undefined) {
    if (summaryRecord.ready !== true || summaryRecord.countReady !== true || summaryRecord.deficitVerifiedAi !== 0 || summaryRecord.deficitVerifiedHuman !== 0) {
      errors.push(`${input.gate} census is not ready`);
    }
    if (summaryRecord.gateFailures !== undefined && Array.isArray(summaryRecord.gateFailures) && summaryRecord.gateFailures.length > 0) {
      errors.push(`${input.gate} census has gate failures`);
    }
    if (Object.prototype.hasOwnProperty.call(summaryRecord, 'infeasibilityCertificateSha256')) errors.push(`${input.gate} census contains an infeasibility certificate`);
  }

  const publication = input.buildInput?.search?.[input.gate];
  let searchBundle: CalibrationAdmissionSearchResultBundleV1 | undefined;
  if (publication === undefined) errors.push(`${input.gate} search publication input is missing`);
  else {
    const search = verifySearchBundle(input.gate, input.context, snapshotSha256, summaryRecord ?? {}, publication, input.searchPublication);
    errors.push(...search.errors);
    searchBundle = search.bundle;
  }

  let reviewBundle: CalibrationAdmissionWitnessReviewBundleV1 | undefined;
  if (searchBundle !== undefined) {
    const review = verifyReviewBundle(input.gate, input.context, snapshotSha256, summaryRecord ?? {}, searchBundle, input);
    errors.push(...review.errors);
    reviewBundle = review.bundle;
  }

  if (errors.length > 0 || rebuilt === undefined || reviewBundle === undefined) {
    return { ok: false, errors: [...new Set(errors)].sort(compareString) };
  }

  const ready = deepFreeze({
    context: input.context,
    census: structuredClone(rebuilt),
    gate: input.gate,
    witnessReviewBundle: structuredClone(reviewBundle),
    searchPublicationAuthority: input.searchPublicationAuthority,
    witnessReviewPublicationAuthority: input.witnessReviewPublicationAuthority,
  }) as VerifiedReadyAdmissionCensusV1;
  verifiedReadyAdmissionCensus.add(ready as object);
  return { ok: true, ready };
}

export function assertVerifiedReadyAdmissionCensus(value: unknown): asserts value is VerifiedReadyAdmissionCensusV1 {
  if (!isVerifiedReadyAdmissionCensus(value)) throw new Error('ready census is not a verified SlopBrick census');
}
