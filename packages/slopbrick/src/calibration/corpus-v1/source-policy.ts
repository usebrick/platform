export type CorpusV1AuthorityTier =
  | 'witnessed'
  | 'publisher_attested'
  | 'repo_self_attested'
  | 'exposure_proxy'
  | 'unknown';

export type CorpusV1IntegrityStatus = 'verified' | 'pending' | 'quarantined';
export type CorpusV1RightsDisposition = 'internal_analysis' | 'reference_only' | 'redistribution_approved';
export type CorpusV1PermittedUse =
  | 'calibration_evaluation'
  | 'ecological_validation'
  | 'origin_measurement'
  | 'prevalence_analysis'
  | 'redistribution'
  | 'sensitivity_analysis';
export type CorpusV1ClaimCeiling =
  | 'witnessed-origin'
  | 'publisher-attested-origin'
  | 'repository-self-attested-ecology'
  | 'exposure-proxy-sensitivity'
  | 'unlabeled-prevalence'
  | 'no-executable-use';

export interface CorpusV1SourcePolicyInput {
  readonly sourceId: string;
  readonly authorityTier: CorpusV1AuthorityTier;
  readonly integrityStatus: CorpusV1IntegrityStatus;
  readonly rightsDisposition: CorpusV1RightsDisposition;
}

export interface CorpusV1SourceDisposition extends CorpusV1SourcePolicyInput {
  readonly permittedUses: readonly CorpusV1PermittedUse[];
  readonly claimCeiling: CorpusV1ClaimCeiling;
}

function executableUses(authorityTier: CorpusV1AuthorityTier): readonly CorpusV1PermittedUse[] {
  switch (authorityTier) {
    case 'witnessed':
    case 'publisher_attested':
      return ['calibration_evaluation', 'origin_measurement'];
    case 'repo_self_attested':
      return ['ecological_validation'];
    case 'exposure_proxy':
      return ['sensitivity_analysis'];
    case 'unknown':
      return ['prevalence_analysis'];
  }
}

function claimCeiling(authorityTier: CorpusV1AuthorityTier): Exclude<CorpusV1ClaimCeiling, 'no-executable-use'> {
  switch (authorityTier) {
    case 'witnessed': return 'witnessed-origin';
    case 'publisher_attested': return 'publisher-attested-origin';
    case 'repo_self_attested': return 'repository-self-attested-ecology';
    case 'exposure_proxy': return 'exposure-proxy-sensitivity';
    case 'unknown': return 'unlabeled-prevalence';
  }
}

export function deriveCorpusV1SourceDisposition(input: CorpusV1SourcePolicyInput): CorpusV1SourceDisposition {
  if (input.sourceId.length === 0) throw new TypeError('Corpus v1 sourceId must be a non-empty string');
  if (input.integrityStatus !== 'verified' || input.rightsDisposition === 'reference_only') {
    return { ...input, permittedUses: [], claimCeiling: 'no-executable-use' };
  }
  const permittedUses = [...executableUses(input.authorityTier)];
  if (
    input.rightsDisposition === 'redistribution_approved'
    && (input.authorityTier === 'witnessed' || input.authorityTier === 'publisher_attested')
  ) permittedUses.push('redistribution');
  permittedUses.sort();
  return { ...input, permittedUses, claimCeiling: claimCeiling(input.authorityTier) };
}

export function assertCorpusV1SourceUse(
  disposition: CorpusV1SourceDisposition,
  requestedUse: CorpusV1PermittedUse,
): void {
  if (!disposition.permittedUses.includes(requestedUse)) {
    throw new Error(`${disposition.sourceId} does not permit ${requestedUse}`);
  }
}
