import { describe, expect, it } from 'vitest';
import {
  assertCorpusV1SourceUse,
  deriveCorpusV1SourceDisposition,
  type CorpusV1AuthorityTier,
  type CorpusV1IntegrityStatus,
  type CorpusV1PermittedUse,
  type CorpusV1RightsDisposition,
  type CorpusV1SourceDisposition,
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

const authorityTiers: readonly CorpusV1AuthorityTier[] = [
  'witnessed',
  'publisher_attested',
  'repo_self_attested',
  'exposure_proxy',
  'unknown',
];
const integrityStatuses: readonly CorpusV1IntegrityStatus[] = ['verified', 'pending', 'quarantined'];
const rightsDispositions: readonly CorpusV1RightsDisposition[] = [
  'internal_analysis',
  'reference_only',
  'redistribution_approved',
];
const permittedUses: readonly CorpusV1PermittedUse[] = [
  'calibration_evaluation',
  'ecological_validation',
  'origin_measurement',
  'prevalence_analysis',
  'redistribution',
  'sensitivity_analysis',
];

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

  it('checks every authority, integrity, rights, and requested-use combination', () => {
    for (const authorityTier of authorityTiers) {
      for (const integrityStatus of integrityStatuses) {
        for (const rightsDisposition of rightsDispositions) {
          const disposition = deriveCorpusV1SourceDisposition(source({
            authorityTier,
            integrityStatus,
            rightsDisposition,
          }));
          for (const requestedUse of permittedUses) {
            const assertion = (): void => assertCorpusV1SourceUse(disposition, requestedUse);
            if (disposition.permittedUses.includes(requestedUse)) expect(assertion).not.toThrow();
            else expect(assertion).toThrow(`${disposition.sourceId} does not permit ${requestedUse}`);
          }
        }
      }
    }
  });

  it.each([
    ['authorityTier', 'unsupported-authority', 'authorityTier'],
    ['integrityStatus', 'unsupported-integrity', 'integrityStatus'],
    ['rightsDisposition', 'unsupported-rights', 'rightsDisposition'],
  ] as const)('rejects an unknown runtime %s', (field, value, expectedMessage) => {
    const malformed = { ...source(), [field]: value } as unknown as CorpusV1SourcePolicyInput;
    expect(() => deriveCorpusV1SourceDisposition(malformed)).toThrow(expectedMessage);
  });

  it('rejects an unknown runtime requested use', () => {
    const requestedUse = 'unsupported-use' as CorpusV1PermittedUse;
    expect(() => assertCorpusV1SourceUse(deriveCorpusV1SourceDisposition(source()), requestedUse))
      .toThrow('requestedUse');
  });

  it('rejects duplicate, reordered, narrowed, or manually widened dispositions', () => {
    const canonical = deriveCorpusV1SourceDisposition(source());
    const invalidPermittedUses: readonly (readonly CorpusV1PermittedUse[])[] = [
      [...canonical.permittedUses, 'origin_measurement'],
      [...canonical.permittedUses].reverse(),
      canonical.permittedUses.slice(1),
      [...canonical.permittedUses, 'redistribution'],
    ];
    for (const uses of invalidPermittedUses) {
      const malformed = { ...canonical, permittedUses: uses } as CorpusV1SourceDisposition;
      expect(() => assertCorpusV1SourceUse(malformed, 'origin_measurement'))
        .toThrow('fixture-source disposition does not match derived policy');
    }
  });

  it('rejects a manually widened claim ceiling', () => {
    const canonical = deriveCorpusV1SourceDisposition(source({ authorityTier: 'unknown' }));
    const malformed = { ...canonical, claimCeiling: 'witnessed-origin' } as CorpusV1SourceDisposition;
    expect(() => assertCorpusV1SourceUse(malformed, 'prevalence_analysis'))
      .toThrow('fixture-source disposition does not match derived policy');
  });

  it('returns byte-identical canonical output for identical inputs', () => {
    const input = source({ rightsDisposition: 'redistribution_approved' });
    expect(JSON.stringify(deriveCorpusV1SourceDisposition(input)))
      .toBe(JSON.stringify(deriveCorpusV1SourceDisposition({ ...input })));
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
