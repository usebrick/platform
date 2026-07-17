import { createHash } from 'node:crypto';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  projectMendeleyCorpusV1CandidateManifest,
  type CorpusV1CandidateManifestRow,
} from '../../src/calibration/corpus-v1/manifest';
import { planCorpusV1 } from '../../src/calibration/corpus-v1/plan';

const sha256 = (value: string): string => createHash('sha256').update(value).digest('hex');

function row(input: {
  readonly id: string;
  readonly label: 'positive' | 'negative';
  readonly family: string;
  readonly content?: string;
  readonly normalized?: string | null;
  readonly status?: 'candidate' | 'quarantined';
  readonly reasons?: CorpusV1CandidateManifestRow['quarantineReasons'];
}): CorpusV1CandidateManifestRow {
  const contentSha256 = sha256(input.content ?? `content:${input.id}`);
  return {
    corpusVersion: 'v1',
    unitId: `sbv1_${sha256(`unit:${input.id}`)}`,
    sourceId: 'humanvsai-code-dataset-mendeley-v1',
    sourceVersion: '1',
    sourceUri: 'https://data.mendeley.com/datasets/kjh95n54f8/1',
    sourceArchiveSha256: sha256('archive'),
    sourceRecordId: input.id,
    contentSha256,
    sourceDeclaredContentSha256: contentSha256,
    sourceMaterializedContentSha256: contentSha256,
    normalizedSha256: input.normalized === undefined ? sha256(`normalized:${input.id}`) : input.normalized,
    normalizerId: 'corpus-v1-lexical-tokens-v1',
    label: input.label,
    authorityTier: 'publisher_attested',
    authorityEvidenceRef: 'review/mendeley-humanvsai-audit-2026-07-14.json',
    language: 'Java',
    familyKey: input.family,
    split: 'unassigned',
    licenseId: 'CC-BY-4.0',
    licenseEvidenceRef: 'sources/benchmarks/humanvsai-code-dataset/datacite-metadata.json',
    rightsDisposition: 'internal_analysis',
    byteCount: 10,
    status: input.status ?? 'candidate',
    quarantineReasons: input.reasons ?? [],
  };
}

describe('Corpus v1 collision quarantine and family-safe planning', () => {
  it('quarantines both labels on an exact collision with exact precedence', () => {
    const sharedContent = 'identical source bytes';
    const sharedNormalized = sha256('identical normalized bytes');
    const result = planCorpusV1([
      row({ id: 'a', label: 'positive', family: 'family-a', content: sharedContent, normalized: sharedNormalized }),
      row({ id: 'b', label: 'negative', family: 'family-b', content: sharedContent, normalized: sharedNormalized }),
    ]);

    expect(result.rows.map(({ split, status, quarantineReasons }) => ({ split, status, quarantineReasons })))
      .toEqual([
        { split: 'quarantine', status: 'quarantined', quarantineReasons: ['cross_label_exact_collision'] },
        { split: 'quarantine', status: 'quarantined', quarantineReasons: ['cross_label_exact_collision'] },
      ]);
    expect(result.counts.collisions).toEqual({ exactRows: 2, normalizedRows: 0 });
  });

  it('quarantines a normalized-only collision across labels', () => {
    const normalized = sha256('same normalized representation');
    const result = planCorpusV1([
      row({ id: 'a', label: 'positive', family: 'family-a', content: 'positive bytes', normalized }),
      row({ id: 'b', label: 'negative', family: 'family-b', content: 'negative bytes', normalized }),
    ]);

    expect(result.rows.map((candidate) => candidate.quarantineReasons)).toEqual([
      ['cross_label_normalized_collision'],
      ['cross_label_normalized_collision'],
    ]);
    expect(result.counts.collisions).toEqual({ exactRows: 0, normalizedRows: 2 });
  });

  it('keeps mixed-label problem siblings and same-label duplicate families in one split', () => {
    const duplicate = 'same-label duplicate bytes';
    const result = planCorpusV1([
      row({ id: 'a', label: 'positive', family: 'shared-problem' }),
      row({ id: 'b', label: 'negative', family: 'shared-problem' }),
      row({ id: 'c', label: 'positive', family: 'duplicate-family-a', content: duplicate }),
      row({ id: 'd', label: 'positive', family: 'duplicate-family-b', content: duplicate }),
    ]);

    const byId = new Map(result.rows.map((candidate) => [candidate.sourceRecordId, candidate]));
    expect(byId.get('a')?.split).toBe(byId.get('b')?.split);
    expect(byId.get('c')?.split).toBe(byId.get('d')?.split);
    expect(new Set(result.rows.map((candidate) => candidate.split).filter((split) => split !== 'quarantine')))
      .not.toContain('unassigned');
  });

  it('preserves local quarantine and emits identical output for shuffled input', () => {
    const rows = [
      row({ id: 'c', label: 'positive', family: 'family-c' }),
      row({
        id: 'a',
        label: 'negative',
        family: 'family-a',
        normalized: null,
        status: 'quarantined',
        reasons: ['invalid_utf8'],
      }),
      row({ id: 'b', label: 'negative', family: 'family-b' }),
    ];

    const ordered = planCorpusV1(rows);
    const shuffled = planCorpusV1([rows[2]!, rows[0]!, rows[1]!]);
    expect(shuffled.rows).toEqual(ordered.rows);
    expect(shuffled.planJsonl).toBe(ordered.planJsonl);
    expect(shuffled.planSha256).toBe(ordered.planSha256);
    expect(ordered.planSha256).toBe(sha256(ordered.planJsonl));
    expect(ordered.rows[0]).toMatchObject({
      sourceRecordId: 'a',
      split: 'quarantine',
      status: 'quarantined',
      quarantineReasons: ['invalid_utf8'],
    });
  });

  it('freezes the versioned 80/10/10 family-hash buckets', () => {
    const result = planCorpusV1([
      row({ id: 'train', label: 'positive', family: 'fixture-family-0' }),
      row({ id: 'validation', label: 'positive', family: 'fixture-family-4' }),
      row({ id: 'test', label: 'positive', family: 'fixture-family-9' }),
    ]);
    expect(Object.fromEntries(result.rows.map((candidate) => [candidate.sourceRecordId, candidate.split])))
      .toEqual({ test: 'test', train: 'train', validation: 'validation' });
  });

  it('fails closed on duplicate unit or source record identities', () => {
    const first = row({ id: 'a', label: 'positive', family: 'family-a' });
    expect(() => planCorpusV1([first, { ...first, sourceRecordId: 'b' }]))
      .toThrow('duplicate unitId');
    expect(() => planCorpusV1([first, { ...first, unitId: `sbv1_${sha256('other-unit')}` }]))
      .toThrow('duplicate sourceRecordId');
  });

  it('fails closed on contradictory candidate quarantine state', () => {
    const candidate = row({ id: 'a', label: 'positive', family: 'family-a' });
    expect(() => planCorpusV1([{ ...candidate, status: 'quarantined' }]))
      .toThrow('quarantined row requires a reason');
    expect(() => planCorpusV1([{
      ...candidate,
      quarantineReasons: ['source_content_hash_mismatch'],
    }]))
      .toThrow('candidate row cannot carry quarantine reasons');
  });

  const realCorpusRoot = process.env.SLOPBRICK_CORPUS_V1_ROOT;
  const realSourceTest = realCorpusRoot ? it : it.skip;
  realSourceTest('plans all real candidate rows without family leakage', async () => {
    const candidate = await projectMendeleyCorpusV1CandidateManifest({
      corpusRoot: resolve(realCorpusRoot!),
    });
    const result = planCorpusV1(candidate.rows);
    const familySplits = new Map<string, Set<string>>();
    for (const planned of result.rows) {
      const splits = familySplits.get(planned.familyKey) ?? new Set<string>();
      splits.add(planned.split);
      familySplits.set(planned.familyKey, splits);
    }

    expect(result.counts.raw).toBe(10_000);
    expect(result.counts.eligible + result.counts.quarantined).toBe(10_000);
    expect([...familySplits.values()].every((splits) => splits.size === 1)).toBe(true);
    expect(result.counts.positive).toBe(5_000);
    expect(result.counts.negative).toBe(5_000);
  });
});
