import { createHash } from 'node:crypto';
import { lstat } from 'node:fs/promises';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  bindMendeleyCorpusV1SourceRows,
  reconcileCorpusV1SourceRows,
} from '../../src/calibration/corpus-v1/source-binding';

const SOURCE_ID = 'humanvsai-code-dataset-mendeley-v1';
const HEADER = ['problem_id', 'Sample_Code', 'Generated', 'Language', 'Source'] as const;

interface FixtureRow {
  readonly problemId: string;
  readonly code: string;
  readonly polarity: 'AI' | 'Human';
  readonly language: string;
  readonly source: string;
}

const sha256 = (value: string): string => createHash('sha256').update(value).digest('hex');

function csvField(value: string): string {
  return `"${value.replaceAll('"', '""')}"`;
}

function csvBytes(rows: readonly FixtureRow[], lineEnding = '\r\n'): Buffer {
  const records = [
    HEADER.join(','),
    ...rows.map((row) => [row.problemId, row.code, row.polarity, row.language, row.source]
      .map(csvField)
      .join(',')),
  ];
  return Buffer.from(`${records.join(lineEnding)}${lineEnding}`);
}

function projectionRow(row: FixtureRow, ordinal: number): Record<string, unknown> {
  const contentSha256 = sha256(row.code);
  return {
    recordId: `${SOURCE_ID}:${String(ordinal).padStart(5, '0')}`,
    rowOrdinal: ordinal,
    problemId: row.problemId,
    declaredPolarity: row.polarity,
    language: row.language,
    sourceClaim: row.source,
    relativePath: row.polarity === 'AI' ? `units/ai/${ordinal}.ts` : `units/human/${ordinal}.ts`,
    bytes: Buffer.byteLength(row.code),
    contentSha256,
    materializedSha256: contentSha256,
  };
}

function projectionBytes(rows: readonly FixtureRow[]): Buffer {
  return Buffer.from(`${rows.map((row, index) => JSON.stringify(projectionRow(row, index + 1))).join('\n')}\n`);
}

const fixtureRows: readonly FixtureRow[] = [
  {
    problemId: 'Prob1',
    code: 'print("hello, world")\r\nprint("quote: \\"ok\\"")',
    polarity: 'Human',
    language: 'Python',
    source: 'CodeNet',
  },
  {
    problemId: 'Prob2',
    code: 'int main() {\n  return 0;\n}',
    polarity: 'AI',
    language: 'C++',
    source: 'ChatGPT-4',
  },
];

describe('Corpus v1 publisher CSV row binding', () => {
  it('binds multiline quoted CSV rows and emits a deterministic receipt', () => {
    const input = {
      sourceId: SOURCE_ID,
      csvBytes: csvBytes(fixtureRows),
      projectionManifestBytes: projectionBytes(fixtureRows),
    };
    const first = reconcileCorpusV1SourceRows(input);
    const second = reconcileCorpusV1SourceRows(input);

    expect(second).toEqual(first);
    expect(first.receipt).toMatchObject({
      version: 'corpus-v1-source-binding-v1',
      sourceId: SOURCE_ID,
      authorityTier: 'publisher_attested',
      rightsDisposition: 'internal_analysis',
      rows: { matched: 2, positive: 1, negative: 1 },
      sourceClaims: { 'ChatGPT-4': 1, CodeNet: 1 },
      languages: { 'C++': 1, Python: 1 },
    });
    expect(first.receipt.csvSha256).toBe(createHash('sha256').update(input.csvBytes).digest('hex'));
    expect(first.receipt.projectionManifestSha256)
      .toBe(createHash('sha256').update(input.projectionManifestBytes).digest('hex'));
    expect(first.receiptSha256).toBe(sha256(first.receiptJson));
  });

  it.each([
    ['declaredPolarity', { declaredPolarity: 'AI' }],
    ['sourceClaim', { sourceClaim: 'ChatGPT-3.5' }],
    ['problemId', { problemId: 'Prob999' }],
    ['language', { language: 'Java' }],
  ])('rejects a projection %s mismatch', (field, change) => {
    const projection = fixtureRows.map((row, index) => projectionRow(row, index + 1));
    projection[0] = { ...projection[0], ...change };
    const bytes = Buffer.from(`${projection.map((row) => JSON.stringify(row)).join('\n')}\n`);
    expect(() => reconcileCorpusV1SourceRows({
      sourceId: SOURCE_ID,
      csvBytes: csvBytes(fixtureRows),
      projectionManifestBytes: bytes,
    })).toThrow(`row 1 ${field}`);
  });

  it.each([
    ['bytes', { bytes: 999 }],
    ['contentSha256', { contentSha256: sha256('other bytes') }],
    ['materializedSha256', { materializedSha256: sha256('other bytes') }],
  ])('rejects a projection %s mismatch', (field, change) => {
    const projection = fixtureRows.map((row, index) => projectionRow(row, index + 1));
    projection[0] = { ...projection[0], ...change };
    const bytes = Buffer.from(`${projection.map((row) => JSON.stringify(row)).join('\n')}\n`);
    expect(() => reconcileCorpusV1SourceRows({
      sourceId: SOURCE_ID,
      csvBytes: csvBytes(fixtureRows),
      projectionManifestBytes: bytes,
    })).toThrow(`row 1 ${field}`);
  });

  it('rejects non-sequential ordinals, record IDs, and row-count drift', () => {
    const wrongOrdinal = fixtureRows.map((row, index) => projectionRow(row, index + 1));
    wrongOrdinal[0] = { ...wrongOrdinal[0], rowOrdinal: 2 };
    const wrongRecord = fixtureRows.map((row, index) => projectionRow(row, index + 1));
    wrongRecord[0] = { ...wrongRecord[0], recordId: `${SOURCE_ID}:99999` };
    const oneProjection = projectionBytes(fixtureRows.slice(0, 1));

    for (const [bytes, message] of [
      [Buffer.from(`${wrongOrdinal.map((row) => JSON.stringify(row)).join('\n')}\n`), 'row 1 rowOrdinal'],
      [Buffer.from(`${wrongRecord.map((row) => JSON.stringify(row)).join('\n')}\n`), 'row 1 recordId'],
      [oneProjection, 'row count'],
    ] as const) {
      expect(() => reconcileCorpusV1SourceRows({
        sourceId: SOURCE_ID,
        csvBytes: csvBytes(fixtureRows),
        projectionManifestBytes: bytes,
      })).toThrow(message);
    }
  });

  it.each([
    ['wrong header', Buffer.from('problem,Sample_Code,Generated,Language,Source\n')],
    ['wrong field count', Buffer.from('problem_id,Sample_Code,Generated,Language,Source\nProb1,code,AI,C\n')],
    ['stray quote', Buffer.from('problem_id,Sample_Code,Generated,Language,Source\nProb1,bad"quote,AI,C,ChatGPT-4\n')],
    ['unterminated quote', Buffer.from('problem_id,Sample_Code,Generated,Language,Source\nProb1,"bad\n')],
    ['bare carriage return', Buffer.from('problem_id,Sample_Code,Generated,Language,Source\rProb1,code,AI,C,ChatGPT-4\n')],
    ['trailing partial record', Buffer.from('problem_id,Sample_Code,Generated,Language,Source\nProb1,code,AI,C,ChatGPT-4')],
    ['invalid UTF-8', Buffer.from([0xff])],
  ])('rejects malformed CSV: %s', (_name, malformedCsv) => {
    expect(() => reconcileCorpusV1SourceRows({
      sourceId: SOURCE_ID,
      csvBytes: malformedCsv,
      projectionManifestBytes: projectionBytes(fixtureRows),
    })).toThrow();
  });

  const realCorpusRoot = process.env.SLOPBRICK_CORPUS_V1_ROOT;
  const realSourceTest = realCorpusRoot ? it : it.skip;
  realSourceTest('binds every pinned real-source row without mutating source artifacts', async () => {
    const csvPath = resolve(
      realCorpusRoot!,
      'sources/benchmarks/humanvsai-code-dataset/extracted/Code_Dataset/HumanVsAI_CodeDataset.csv',
    );
    const manifestPath = resolve(
      realCorpusRoot!,
      'sources/benchmarks/humanvsai-code-dataset/projection-v1/projection-manifest.jsonl',
    );
    const before = await Promise.all([lstat(csvPath), lstat(manifestPath)]);
    const first = await bindMendeleyCorpusV1SourceRows({ corpusRoot: realCorpusRoot! });
    const second = await bindMendeleyCorpusV1SourceRows({ corpusRoot: realCorpusRoot! });
    const after = await Promise.all([lstat(csvPath), lstat(manifestPath)]);

    expect(second).toEqual(first);
    expect(first.receipt.rows).toEqual({ matched: 10_000, positive: 5_000, negative: 5_000 });
    expect(first.receipt.sourceClaims).toEqual({ 'ChatGPT-3.5': 1_492, 'ChatGPT-4': 3_508, CodeNet: 5_000 });
    expect(first.receipt.languages).toEqual({ C: 1_737, 'C++': 2_640, Java: 2_945, Python: 2_678 });
    expect(first.receipt.rowBindingSha256)
      .toBe('86b46373ba0cae5149a722777eeff537b27c7a8d43fd8259fa8c197ea1bd300c');
    expect(first.receiptSha256)
      .toBe('47bd66907ec2efa67da718e0cfb38458151ca84d3cdedc941488fe4b001475ac');
    expect(after.map(({ size, mtimeMs }) => ({ size, mtimeMs })))
      .toEqual(before.map(({ size, mtimeMs }) => ({ size, mtimeMs })));
  });
});
