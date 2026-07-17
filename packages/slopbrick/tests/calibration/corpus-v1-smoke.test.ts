import { createHash } from 'node:crypto';
import { lstat } from 'node:fs/promises';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { canonicalJson } from '../../src/calibration/v103/canonical';
import type {
  CorpusV1CandidateManifestResult,
  CorpusV1CandidateManifestRow,
} from '../../src/calibration/corpus-v1/manifest';
import {
  projectMendeleyCorpusV1CandidateManifest,
} from '../../src/calibration/corpus-v1/manifest';
import { planCorpusV1, type CorpusV1PlanResult } from '../../src/calibration/corpus-v1/plan';
import type {
  CorpusV1SourceBindingReceipt,
  CorpusV1SourceBindingResult,
} from '../../src/calibration/corpus-v1/source-binding';
import {
  buildCorpusV1Smoke,
  type CorpusV1SmokeInput,
} from '../../src/calibration/corpus-v1/smoke';
import { bindMendeleyCorpusV1SourceRows } from '../../src/calibration/corpus-v1/source-binding';

const SOURCE_ID = 'humanvsai-code-dataset-mendeley-v1';
const sha256 = (value: string): string => createHash('sha256').update(value).digest('hex');

function candidateRow(
  ordinal: number,
  label: 'positive' | 'negative',
  content = `${label} sample ${ordinal}`,
): CorpusV1CandidateManifestRow {
  const sourceRecordId = `${SOURCE_ID}:${String(ordinal).padStart(5, '0')}`;
  const contentSha256 = sha256(content);
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
    normalizedSha256: sha256(`normalized:${content}`),
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
    byteCount: Buffer.byteLength(content),
    status: 'candidate',
    quarantineReasons: [],
  };
}

function fixture(): CorpusV1SmokeInput {
  const rows = [
    ...Array.from({ length: 120 }, (_, index) => candidateRow(index + 1, 'positive')),
    ...Array.from({ length: 120 }, (_, index) => candidateRow(index + 121, 'negative')),
  ];
  const manifestJsonl = `${rows
    .slice()
    .sort((left, right) => left.sourceRecordId.localeCompare(right.sourceRecordId))
    .map((row) => canonicalJson(row))
    .join('\n')}\n`;
  const candidate: CorpusV1CandidateManifestResult = {
    version: 'corpus-v1-candidate-manifest-v1',
    builderVersion: 'corpus-v1-manifest-builder-v1',
    normalizerId: 'corpus-v1-lexical-tokens-v1',
    rows,
    manifestJsonl,
    manifestSha256: sha256(manifestJsonl),
    counts: { raw: rows.length, candidate: rows.length, quarantined: 0, positive: 120, negative: 120 },
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
    rows: { matched: rows.length, positive: 120, negative: 120 },
    sourceClaims: { CodeNet: 120, 'ChatGPT-4': 120 },
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

function rebuildInput(input: CorpusV1SmokeInput, rows: readonly CorpusV1CandidateManifestRow[]): CorpusV1SmokeInput {
  const manifestJsonl = `${rows
    .slice()
    .sort((left, right) => left.sourceRecordId.localeCompare(right.sourceRecordId))
    .map((row) => canonicalJson(row))
    .join('\n')}\n`;
  const positive = rows.filter((row) => row.label === 'positive').length;
  const sourceReceipt = {
    ...input.sourceBinding.receipt,
    rows: { matched: rows.length, positive, negative: rows.length - positive },
  } satisfies CorpusV1SourceBindingReceipt;
  const sourceReceiptJson = canonicalJson(sourceReceipt);
  return {
    candidate: {
      ...input.candidate,
      rows,
      manifestJsonl,
      manifestSha256: sha256(manifestJsonl),
      counts: {
        raw: rows.length,
        candidate: rows.filter((row) => row.status === 'candidate').length,
        quarantined: rows.filter((row) => row.status === 'quarantined').length,
        positive,
        negative: rows.length - positive,
      },
    },
    plan: planCorpusV1(rows),
    sourceBinding: {
      receipt: sourceReceipt,
      receiptJson: sourceReceiptJson,
      receiptSha256: sha256(sourceReceiptJson),
    },
  };
}

describe('Corpus v1 deterministic smoke selection', () => {
  it('selects 100 unique eligible units per polarity and binds both artifacts', () => {
    const input = fixture();
    const first = buildCorpusV1Smoke(input);
    const second = buildCorpusV1Smoke({
      ...input,
      candidate: { ...input.candidate, rows: [...input.candidate.rows].reverse() },
    });

    expect(second).toEqual(first);
    expect(first.manifest.rows).toHaveLength(200);
    expect(first.manifest.rows.filter((row) => row.label === 'positive')).toHaveLength(100);
    expect(first.manifest.rows.filter((row) => row.label === 'negative')).toHaveLength(100);
    expect(new Set(first.manifest.rows.map((row) => row.contentSha256)).size).toBe(200);
    expect(first.receipt).toMatchObject({
      version: 'corpus-v1-smoke-receipt-v1',
      sourceBindingReceiptSha256: input.sourceBinding.receiptSha256,
      candidateManifestSha256: input.candidate.manifestSha256,
      planSha256: input.plan.planSha256,
      selected: { positive: 100, negative: 100, total: 200 },
      admitted: false,
      rightsDisposition: 'internal_analysis',
    });
    expect(first.manifestJsonl).toBe(`${canonicalJson(first.manifest.header)}\n${first.manifest.rows.map((row) => canonicalJson(row)).join('\n')}\n`);
    expect(first.receiptSha256).toBe(sha256(first.receiptJson));
    expect(first.manifestSha256).toBe(sha256(first.manifestJsonl));
  });

  it('counts unique content units and fails closed when a polarity has a deficit', () => {
    const input = fixture();
    const positive = input.candidate.rows.filter((row) => row.label === 'positive');
    const negative = input.candidate.rows.filter((row) => row.label === 'negative');
    const duplicate = {
      ...positive[99]!,
      contentSha256: positive[0]!.contentSha256,
      sourceDeclaredContentSha256: positive[0]!.contentSha256,
      sourceMaterializedContentSha256: positive[0]!.contentSha256,
      normalizedSha256: positive[0]!.normalizedSha256,
    };
    const rebuilt = rebuildInput(input, [...positive.slice(0, 99), duplicate, ...negative]);

    expect(() => buildCorpusV1Smoke(rebuilt))
      .toThrow('lacks 100 unique eligible positive code units: found 99');
  });

  it('rejects a plan whose verified bytes no longer match its hash', () => {
    const input = fixture();
    expect(() => buildCorpusV1Smoke({
      ...input,
      plan: { ...input.plan, planSha256: sha256('wrong plan') },
    })).toThrow('leakage plan hash or bytes are not verified');
  });

  const realCorpusRoot = process.env.SLOPBRICK_CORPUS_V1_ROOT;
  const realSourceTest = realCorpusRoot ? it : it.skip;
  realSourceTest('builds the pinned 100/100 smoke without mutating source artifacts', async () => {
    const root = resolve(realCorpusRoot!);
    const csvPath = resolve(root, 'sources/benchmarks/humanvsai-code-dataset/extracted/Code_Dataset/HumanVsAI_CodeDataset.csv');
    const projectionPath = resolve(root, 'sources/benchmarks/humanvsai-code-dataset/projection-v1/projection-manifest.jsonl');
    const before = await Promise.all([lstat(csvPath), lstat(projectionPath)]);
    const candidate = await projectMendeleyCorpusV1CandidateManifest({ corpusRoot: root });
    const plan = planCorpusV1(candidate.rows);
    const sourceBinding = await bindMendeleyCorpusV1SourceRows({ corpusRoot: root });
    const first = buildCorpusV1Smoke({ candidate, plan, sourceBinding });
    const second = buildCorpusV1Smoke({ candidate, plan, sourceBinding });
    const after = await Promise.all([lstat(csvPath), lstat(projectionPath)]);

    expect(second).toEqual(first);
    expect(first.receipt.selected).toEqual({ positive: 100, negative: 100, total: 200 });
    expect(first.receipt.eligible).toEqual({
      records: { positive: 5_000, negative: 5_000, total: 10_000 },
      uniqueContentUnits: { positive: 5_000, negative: 5_000, total: 10_000 },
    });
    expect(candidate.manifestSha256).toBe('c15d3cbc95f251b5a0514da14b3f8a90e26124fbfb7db5ce342a873635b383ac');
    expect(plan.planSha256).toBe('9c4638526e9a4161d3e74f70197f0b25717439e6bd477bef98664a03c9a9219c');
    expect(sourceBinding.receiptSha256).toBe('47bd66907ec2efa67da718e0cfb38458151ca84d3cdedc941488fe4b001475ac');
    expect(first.manifestSha256).toBe('bdbcd43279077fa760ae3c99da05b953c38134022fa34626b69a6b6400be00de');
    expect(first.receiptSha256).toBe('ccd74f7b9db49adc802c042df0d7b732d8284d2bbfc4e6ec39e6a1c001c60830');
    expect(after.map(({ size, mtimeMs }) => ({ size, mtimeMs })))
      .toEqual(before.map(({ size, mtimeMs }) => ({ size, mtimeMs })));
  });
});
