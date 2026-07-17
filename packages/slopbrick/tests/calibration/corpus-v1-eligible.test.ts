import { createHash } from 'node:crypto';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { canonicalJson } from '../../src/calibration/v103/canonical';
import type {
  CorpusV1CandidateManifestResult,
  CorpusV1CandidateManifestRow,
} from '../../src/calibration/corpus-v1/manifest';
import { planCorpusV1, type CorpusV1PlanResult } from '../../src/calibration/corpus-v1/plan';
import {
  buildCorpusV1Smoke,
  type CorpusV1SmokeInput,
} from '../../src/calibration/corpus-v1/smoke';
import type {
  CorpusV1SourceBindingReceipt,
  CorpusV1SourceBindingResult,
} from '../../src/calibration/corpus-v1/source-binding';
import { bindMendeleyCorpusV1SourceRows } from '../../src/calibration/corpus-v1/source-binding';
import { projectMendeleyCorpusV1CandidateManifest } from '../../src/calibration/corpus-v1/manifest';
import { projectCorpusV1EligibleRows } from '../../src/calibration/corpus-v1/eligible';

const SOURCE_ID = 'humanvsai-code-dataset-mendeley-v1';
const sha256 = (value: string): string => createHash('sha256').update(value).digest('hex');

function row(ordinal: number, label: 'positive' | 'negative'): CorpusV1CandidateManifestRow {
  const sourceRecordId = `${SOURCE_ID}:${String(ordinal).padStart(5, '0')}`;
  const contentSha256 = sha256(`${label}:${ordinal}`);
  return {
    corpusVersion: 'v1',
    unitId: `sbv1_${sha256(sourceRecordId)}`,
    sourceId: SOURCE_ID,
    sourceVersion: '1',
    sourceUri: 'https://data.mendeley.com/datasets/kjh95n54f8/1',
    sourceArchiveSha256: sha256('archive'),
    sourceRecordId,
    contentSha256,
    sourceDeclaredContentSha256: contentSha256,
    sourceMaterializedContentSha256: contentSha256,
    normalizedSha256: sha256(`normalized:${label}:${ordinal}`),
    normalizerId: 'corpus-v1-lexical-tokens-v1',
    label,
    authorityTier: 'publisher_attested',
    authorityEvidenceRef: 'review/mendeley-humanvsai-audit-2026-07-14.json',
    language: 'TypeScript',
    familyKey: `${SOURCE_ID}:problem-${ordinal}`,
    split: 'unassigned',
    licenseId: 'CC-BY-4.0',
    licenseEvidenceRef: 'sources/benchmarks/humanvsai-code-dataset/datacite-metadata.json',
    rightsDisposition: 'internal_analysis',
    byteCount: ordinal,
    status: 'candidate',
    quarantineReasons: [],
  };
}

function input(): CorpusV1SmokeInput {
  const rows = [
    ...Array.from({ length: 101 }, (_, index) => row(index + 1, 'positive')),
    ...Array.from({ length: 101 }, (_, index) => row(index + 102, 'negative')),
  ];
  const manifestJsonl = `${rows.map((candidate) => canonicalJson(candidate)).join('\n')}\n`;
  const candidate: CorpusV1CandidateManifestResult = {
    version: 'corpus-v1-candidate-manifest-v1',
    builderVersion: 'corpus-v1-manifest-builder-v1',
    normalizerId: 'corpus-v1-lexical-tokens-v1',
    rows,
    manifestJsonl,
    manifestSha256: sha256(manifestJsonl),
    counts: { raw: rows.length, candidate: rows.length, quarantined: 0, positive: 101, negative: 101 },
  };
  const plan: CorpusV1PlanResult = planCorpusV1(rows);
  const receipt: CorpusV1SourceBindingReceipt = {
    version: 'corpus-v1-source-binding-v1',
    sourceId: SOURCE_ID,
    authorityTier: 'publisher_attested',
    rightsDisposition: 'internal_analysis',
    csvSha256: sha256('csv'),
    projectionManifestSha256: sha256('projection'),
    rowBindingSha256: sha256('binding'),
    rows: { matched: rows.length, positive: 101, negative: 101 },
    sourceClaims: { CodeNet: 101, 'ChatGPT-4': 101 },
    languages: { TypeScript: rows.length },
  };
  const receiptJson = canonicalJson(receipt);
  const sourceBinding: CorpusV1SourceBindingResult = {
    receipt,
    receiptJson,
    receiptSha256: sha256(receiptJson),
  };
  return { candidate, plan, sourceBinding };
}

describe('Corpus v1 eligible projection', () => {
  it('projects only eligible rows and records deterministic bounded accounting', () => {
    const smokeInput = input();
    const smoke = buildCorpusV1Smoke(smokeInput);
    const first = projectCorpusV1EligibleRows({ ...smokeInput, smoke });
    const second = projectCorpusV1EligibleRows({ ...smokeInput, smoke });

    expect(second).toEqual(first);
    expect(first.manifest.rows).toHaveLength(202);
    expect(first.manifest.rows.every((candidate) => candidate.status === 'eligible')).toBe(true);
    expect(first.receipt).toMatchObject({
      version: 'corpus-v1-eligible-projection-receipt-v1',
      sourceBindingReceiptSha256: smokeInput.sourceBinding.receiptSha256,
      candidateManifestSha256: smokeInput.candidate.manifestSha256,
      planSha256: smokeInput.plan.planSha256,
      smokeManifestSha256: smoke.manifestSha256,
      smokeReceiptSha256: smoke.receiptSha256,
      eligible: { positive: 101, negative: 101, total: 202 },
      quarantined: { positive: 0, negative: 0, total: 0 },
      unresolvedCrossLabelCollisions: { exact: 0, normalized: 0 },
      admitted: false,
      rightsDisposition: 'internal_analysis',
    });
    expect(first.receipt.resource).toMatchObject({ workers: 1, candidateRowsRead: 202, eligibleRowsProjected: 202 });
    expect(first.manifestSha256).toBe(sha256(first.manifestJsonl));
    expect(first.receiptSha256).toBe(sha256(first.receiptJson));
    expect(() => projectCorpusV1EligibleRows({
      ...smokeInput,
      smoke: { ...smoke, manifestSha256: sha256('wrong smoke') },
    })).toThrow('smoke artifact is not verified');
  });

  const realCorpusRoot = process.env.SLOPBRICK_CORPUS_V1_ROOT;
  const realSourceTest = realCorpusRoot ? it : it.skip;
  realSourceTest('projects every pinned eligible row with zero unresolved leaks', async () => {
    const root = resolve(realCorpusRoot!);
    const candidate = await projectMendeleyCorpusV1CandidateManifest({ corpusRoot: root });
    const plan = planCorpusV1(candidate.rows);
    const sourceBinding = await bindMendeleyCorpusV1SourceRows({ corpusRoot: root });
    const smoke = buildCorpusV1Smoke({ candidate, plan, sourceBinding });
    const result = projectCorpusV1EligibleRows({ candidate, plan, sourceBinding, smoke });

    expect(result.receipt.eligible).toEqual({ positive: 5_000, negative: 5_000, total: 10_000 });
    expect(result.receipt.quarantined).toEqual({ positive: 0, negative: 0, total: 0 });
    expect(result.receipt.splits).toEqual({ train: 7_970, validation: 991, test: 1_039 });
    expect(result.receipt.unresolvedCrossLabelCollisions).toEqual({ exact: 0, normalized: 0 });
    expect(result.receipt.resource.candidateBytesAccounted).toBe(6_195_562);
    expect(result.receipt.resource.eligibleBytesAccounted).toBe(6_195_562);
    expect(result.receipt.resource.candidateRowsRead).toBe(10_000);
    expect(result.receipt.resource.eligibleRowsProjected).toBe(10_000);
    expect(result.receipt.resource.maxUnitBytes).toBe(11_406);
    expect(result.manifestSha256).toBe('286134799c7f75837a7c292f0d18721d8da9263c25c041eef0ac4734801b52d8');
    expect(result.receiptSha256).toBe('9f5274f57ed4adf9d1c1ef55205493e9a833abc86cb8e1ca2b332cd8c72d28ba');
  });
});
