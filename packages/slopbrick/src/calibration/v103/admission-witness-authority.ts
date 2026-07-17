/**
 * Authority join for one reopened witness publication.
 *
 * `admission-witness-reopen.ts` proves that a routing reference names stable
 * canonical bundle/completion bytes. This module proves the second half of
 * that boundary: the completion's publication and required tool receipts are
 * present in the exact indexed tool-authority generation, and the persisted
 * search/review graph agrees with the domain-level cross validators.
 */
import {
  calibrationAdmissionCanonicalJson,
  calibrationAdmissionToolReceiptSha256,
  type CalibrationAdmissionSearchResultBundleV1,
  type CalibrationAdmissionToolReceiptV1,
  type CalibrationAdmissionWitnessReviewBundleV1,
} from '@usebrick/core';

import {
  resolveAdmissionToolAuthorityReceipt,
  type AdmissionToolAuthorityReceiptResolution,
} from './admission-publication';
import {
  isVerifiedAdmissionWitnessPublication,
  type VerifiedAdmissionWitnessPublicationV1,
} from './admission-witness-reopen';
import {
  type AdmissionWitnessReviewBuildInputV1,
  buildAdmissionWitnessReviewBundle,
  validateAdmissionWitnessSearchResultBundle,
} from './admission-witness-review';

const SHA256 = /^[a-f0-9]{64}$/u;
const PROFILE_ID = 'admission-census-v1' as const;

export interface OpenAdmissionWitnessPublicationAuthorityInputV1 {
  readonly authorityRoot: string;
  readonly publication: VerifiedAdmissionWitnessPublicationV1;
}

declare const verifiedWitnessPublicationAuthorityBrand: unique symbol;

export type VerifiedAdmissionWitnessPublicationAuthorityV1 = Readonly<{
  readonly publication: VerifiedAdmissionWitnessPublicationV1;
  readonly publicationReceipt: AdmissionToolAuthorityReceiptResolution;
  readonly requiredReceipts: readonly AdmissionToolAuthorityReceiptResolution[];
  readonly [verifiedWitnessPublicationAuthorityBrand]: true;
}>;

const verifiedWitnessPublicationAuthorities = new WeakSet<object>();

export class AdmissionWitnessAuthorityError extends Error {
  public constructor(message: string) {
    super(message);
    this.name = 'AdmissionWitnessAuthorityError';
  }
}

function validSha(value: unknown): value is string {
  return typeof value === 'string' && SHA256.test(value);
}

function deepFreeze<T>(value: T, seen = new WeakSet<object>()): T {
  if (typeof value !== 'object' || value === null || seen.has(value)) return value;
  seen.add(value);
  for (const key of Reflect.ownKeys(value)) deepFreeze((value as Record<PropertyKey, unknown>)[key], seen);
  return Object.freeze(value);
}

function expectedPublicationAction(kind: VerifiedAdmissionWitnessPublicationV1['kind']): string {
  return kind === 'search_result' ? 'witness:publish-search' : 'witness:publish-review';
}

function searchBundleFor(publication: VerifiedAdmissionWitnessPublicationV1): CalibrationAdmissionSearchResultBundleV1 {
  return publication.kind === 'search_result'
    ? publication.bundle as CalibrationAdmissionSearchResultBundleV1
    : (publication.bundle as CalibrationAdmissionWitnessReviewBundleV1).searchResultBundle;
}

function receiptMap(value: readonly CalibrationAdmissionToolReceiptV1[]): Map<string, CalibrationAdmissionToolReceiptV1> {
  return new Map(value.map((receipt) => [receipt.receiptId, receipt]));
}

function assertDomainBundle(publication: VerifiedAdmissionWitnessPublicationV1): void {
  const search = searchBundleFor(publication);
  const searchValidation = validateAdmissionWitnessSearchResultBundle(search, {
    gate: publication.gate,
    verifiedContextSha256: search.verifiedContextSha256,
    eligibilitySnapshotSha256: search.eligibilitySnapshotSha256,
  });
  if (!searchValidation.ok) throw new AdmissionWitnessAuthorityError(`witness search graph is not authoritative: ${searchValidation.errors.join('; ')}`);
  if (publication.kind === 'witness_review') {
    const review = publication.bundle as CalibrationAdmissionWitnessReviewBundleV1;
    const reviewInput = {
      searchResultBundle: review.searchResultBundle,
      regenerations: review.regenerations,
      constraintCheck: review.constraintCheck,
      blindAssignment: review.blindAssignment,
      reviewerDecisions: review.reviewerDecisions,
      blindReviewReceipt: review.blindReviewReceipt,
    } as unknown as AdmissionWitnessReviewBuildInputV1;
    const rebuilt = buildAdmissionWitnessReviewBundle(reviewInput);
    if (!rebuilt.ok || calibrationAdmissionCanonicalJson(rebuilt.bundle) !== calibrationAdmissionCanonicalJson(review)) {
      throw new AdmissionWitnessAuthorityError(`witness review graph is not authoritative: ${rebuilt.ok ? 'rebuild bytes differ' : rebuilt.errors.join('; ')}`);
    }
  }
}

function assertRequiredReceiptBinding(
  publication: VerifiedAdmissionWitnessPublicationV1,
  resolutions: readonly AdmissionToolAuthorityReceiptResolution[],
): void {
  const search = searchBundleFor(publication);
  const bundled = receiptMap(search.toolReceipts);
  const requiredHashes = new Set(resolutions.map((entry) => entry.receiptSha256));
  if (!requiredHashes.has(search.searchReceipt.toolReceiptSha256)) {
    throw new AdmissionWitnessAuthorityError('witness search receipt is not included in the authority-required receipt set');
  }
  for (const resolution of resolutions) {
    const receipt = resolution.receipt;
    if (receipt.profileId !== PROFILE_ID || !receipt.action.startsWith('witness:')) {
      throw new AdmissionWitnessAuthorityError('required witness receipt is not from the census witness profile');
    }
    const bundledReceipt = bundled.get(receipt.receiptId);
    if (bundledReceipt === undefined
      || calibrationAdmissionToolReceiptSha256(bundledReceipt) !== resolution.receiptSha256
      || calibrationAdmissionToolReceiptSha256(receipt) !== resolution.receiptSha256) {
      throw new AdmissionWitnessAuthorityError(`required witness receipt ${receipt.receiptId} is not the exact bundled receipt`);
    }
  }
}

/** Return true only for the exact private authority join minted here. */
export function isVerifiedAdmissionWitnessPublicationAuthority(
  value: unknown,
): value is VerifiedAdmissionWitnessPublicationAuthorityV1 {
  return typeof value === 'object' && value !== null && verifiedWitnessPublicationAuthorities.has(value);
}

/** Reopen the indexed authority chain for one already reopened publication. */
export async function openAdmissionWitnessPublicationAuthority(
  input: OpenAdmissionWitnessPublicationAuthorityInputV1,
): Promise<VerifiedAdmissionWitnessPublicationAuthorityV1> {
  if (!isVerifiedAdmissionWitnessPublication(input?.publication)) {
    throw new AdmissionWitnessAuthorityError('a verified witness publication is required');
  }
  const publication = input.publication;
  const completion = publication.completion;
  if (!validSha(completion.toolAuthorityIndexSha256)
    || !validSha(completion.publicationToolReceiptId)
    || !validSha(completion.publicationToolReceiptSha256)
    || !validSha(completion.invocationIntentId)
    || !validSha(completion.namedPrimaryOutputProjectionSha256)) {
    throw new AdmissionWitnessAuthorityError('witness completion authority selectors are invalid');
  }
  assertDomainBundle(publication);
  let publicationReceipt: AdmissionToolAuthorityReceiptResolution;
  try {
    publicationReceipt = await resolveAdmissionToolAuthorityReceipt({
      authorityRoot: input.authorityRoot,
      authorityIndexSha256: completion.toolAuthorityIndexSha256,
      receiptId: completion.publicationToolReceiptId,
      receiptSha256: completion.publicationToolReceiptSha256,
      invocationIntentId: completion.invocationIntentId,
      profileId: PROFILE_ID,
      action: expectedPublicationAction(publication.kind),
      outputSetSha256: completion.namedPrimaryOutputProjectionSha256,
    });
  } catch (error) {
    throw new AdmissionWitnessAuthorityError(`witness publication tool authority is invalid: ${error instanceof Error ? error.message : String(error)}`);
  }
  if (publicationReceipt.snapshot.indexGenerationSha256 !== completion.toolAuthorityIndexSha256) {
    throw new AdmissionWitnessAuthorityError('witness publication authority snapshot does not match completion');
  }
  const indexReceipts = new Map(publicationReceipt.authorityIndex.receipts.map((entry) => [entry.receiptId, entry]));
  const requiredIds = completion.requiredToolReceiptIds;
  const requiredHashes = completion.requiredToolReceiptSha256s;
  if (requiredIds.length === 0 || requiredIds.length !== requiredHashes.length || new Set(requiredIds).size !== requiredIds.length || new Set(requiredHashes).size !== requiredHashes.length) {
    throw new AdmissionWitnessAuthorityError('witness completion required receipt set is not closed');
  }
  const requiredHashSet = new Set(requiredHashes);
  const requiredReceipts: AdmissionToolAuthorityReceiptResolution[] = [];
  for (const receiptId of requiredIds) {
    const indexed = indexReceipts.get(receiptId);
    if (indexed === undefined || !requiredHashSet.has(indexed.sha256)) {
      throw new AdmissionWitnessAuthorityError(`witness required receipt ${receiptId} is not indexed at the completion authority generation`);
    }
    try {
      requiredReceipts.push(await resolveAdmissionToolAuthorityReceipt({
        authorityRoot: input.authorityRoot,
        authorityIndexSha256: completion.toolAuthorityIndexSha256,
        receiptId,
        receiptSha256: indexed.sha256,
        profileId: PROFILE_ID,
      }));
    } catch (error) {
      throw new AdmissionWitnessAuthorityError(`witness required receipt ${receiptId} is invalid: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
  assertRequiredReceiptBinding(publication, requiredReceipts);
  const result = deepFreeze({
    publication,
    publicationReceipt,
    requiredReceipts: [...requiredReceipts].sort((left, right) => left.receipt.receiptId.localeCompare(right.receipt.receiptId)),
  }) as unknown as VerifiedAdmissionWitnessPublicationAuthorityV1;
  verifiedWitnessPublicationAuthorities.add(result as object);
  return result;
}
