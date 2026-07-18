import { describe, expect, it } from 'vitest';
import {
  assertCorpusV1SourceUse,
  deriveCorpusV1SourceDisposition,
  type CorpusV1SourcePolicyInput,
} from '../../src/calibration/corpus-v1/source-policy';

const source = (overrides: Partial<CorpusV1SourcePolicyInput> = {}): CorpusV1SourcePolicyInput => ({
  sourceId: 'fixture-source',
  authorityTier: 'publisher_attested',
  integrityStatus: 'verified',
  rightsDisposition: 'internal_analysis',
  ...overrides,
});

describe('Corpus v1 source-use policy', () => {
  it.each([
    ['witnessed', ['calibration_evaluation', 'origin_measurement'], 'witnessed-origin'],
    ['publisher_attested', ['calibration_evaluation', 'origin_measurement'], 'publisher-attested-origin'],
    ['repo_self_attested', ['ecological_validation'], 'repository-self-attested-ecology'],
    ['exposure_proxy', ['sensitivity_analysis'], 'exposure-proxy-sensitivity'],
    ['unknown', ['prevalence_analysis'], 'unlabeled-prevalence'],
  ] as const)('routes %s evidence deterministically', (authorityTier, permittedUses, claimCeiling) => {
    expect(deriveCorpusV1SourceDisposition(source({ authorityTier }))).toEqual({
      ...source({ authorityTier }),
      permittedUses,
      claimCeiling,
    });
  });

  it.each(['pending', 'quarantined'] as const)('denies executable use for %s integrity', (integrityStatus) => {
    expect(deriveCorpusV1SourceDisposition(source({ integrityStatus }))).toMatchObject({
      permittedUses: [],
      claimCeiling: 'no-executable-use',
    });
  });

  it('denies executable use for reference-only rights', () => {
    expect(deriveCorpusV1SourceDisposition(source({ rightsDisposition: 'reference_only' }))).toMatchObject({
      permittedUses: [],
      claimCeiling: 'no-executable-use',
    });
  });

  it('adds redistribution only to verified witnessed or publisher-attested sources with explicit approval', () => {
    expect(deriveCorpusV1SourceDisposition(source({ rightsDisposition: 'redistribution_approved' })).permittedUses)
      .toEqual(['calibration_evaluation', 'origin_measurement', 'redistribution']);
    expect(deriveCorpusV1SourceDisposition(source({
      authorityTier: 'repo_self_attested',
      rightsDisposition: 'redistribution_approved',
    })).permittedUses).toEqual(['ecological_validation']);
  });

  it('fails closed when a requested use is not permitted', () => {
    const disposition = deriveCorpusV1SourceDisposition(source({ authorityTier: 'unknown' }));
    expect(() => assertCorpusV1SourceUse(disposition, 'calibration_evaluation'))
      .toThrow('fixture-source does not permit calibration_evaluation');
  });

  it('rejects an empty source ID', () => {
    expect(() => deriveCorpusV1SourceDisposition(source({ sourceId: '' })))
      .toThrow('Corpus v1 sourceId must be a non-empty string');
  });
});
