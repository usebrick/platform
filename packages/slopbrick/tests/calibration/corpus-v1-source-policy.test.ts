import { describe, expect, it } from 'vitest';
import {
  assertCorpusV1SourceUse,
  deriveCorpusV1SourceDisposition,
  type CorpusV1SourcePolicyInput,
} from '../../src/calibration/corpus-v1/source-policy';
import { corpusV1SourceDisposition } from '../../src/calibration/corpus-v1/source-registry';

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

  it('registers the reviewed Mendeley source for internal calibration evaluation', () => {
    expect(corpusV1SourceDisposition('humanvsai-code-dataset-mendeley-v1')).toEqual({
      sourceId: 'humanvsai-code-dataset-mendeley-v1',
      authorityTier: 'publisher_attested',
      integrityStatus: 'verified',
      rightsDisposition: 'internal_analysis',
      permittedUses: ['calibration_evaluation', 'origin_measurement'],
      claimCeiling: 'publisher-attested-origin',
    });
  });

  it('keeps reviewed but incomplete sources non-executable', () => {
    expect(corpusV1SourceDisposition('formai-v1-gpt35-smoke-v1').permittedUses).toEqual([]);
    expect(corpusV1SourceDisposition('ossforge-humanvsaicode-hf-v1').permittedUses).toEqual([]);
    expect(corpusV1SourceDisposition('humaneval-gpt5-smoke-v1').permittedUses).toEqual([]);
  });

  it('rejects an unregistered source', () => {
    expect(() => corpusV1SourceDisposition('unregistered-source'))
      .toThrow('Corpus v1 source is not registered: unregistered-source');
  });
});
