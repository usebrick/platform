import { createHash } from 'node:crypto';
import { mkdtemp, mkdir, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  PINNED_MENDELEY_V1_EXPECTATIONS,
  inventoryMendeleyCorpusV1,
  type MendeleyCorpusV1Expectations,
} from '../../src/calibration/corpus-v1/inventory';

const temporaryRoots: string[] = [];
const sha256 = (value: string | Buffer): string =>
  createHash('sha256').update(value).digest('hex');

async function write(root: string, relativePath: string, value: string | Buffer): Promise<void> {
  const path = resolve(root, relativePath);
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, value);
}

async function makeFixture(): Promise<{
  readonly corpusRoot: string;
  readonly expectations: MendeleyCorpusV1Expectations;
}> {
  const corpusRoot = await mkdtemp(join(tmpdir(), 'slopbrick-corpus-v1-'));
  temporaryRoots.push(corpusRoot);
  const sourceRoot = 'sources/benchmarks/humanvsai-code-dataset';
  const archive = Buffer.from('pinned archive bytes');
  const csv = Buffer.from('problem_id,Sample_Code,Generated,Language,Source\nfixture');
  const rows = [
    {
      recordId: 'humanvsai-code-dataset-mendeley-v1:00001',
      rowOrdinal: 1,
      problemId: 'Prob1',
      declaredPolarity: 'Human',
      authoritativeLabel: 'ignored-conflicting-ai-claim',
      language: 'Java',
      sourceClaim: 'CodeNet',
      relativePath: 'units/human/00001-Prob1.java',
      content: 'class Main {}',
    },
    {
      recordId: 'humanvsai-code-dataset-mendeley-v1:00002',
      rowOrdinal: 2,
      problemId: 'Prob1',
      declaredPolarity: 'AI',
      authoritativeLabel: 'ignored-conflicting-human-claim',
      language: 'Java',
      sourceClaim: 'ChatGPT-4',
      relativePath: 'units/ai/00002-Prob1.java',
      content: 'class Generated {}',
    },
    {
      recordId: 'humanvsai-code-dataset-mendeley-v1:00003',
      rowOrdinal: 3,
      problemId: 'Prob2',
      declaredPolarity: 'AI',
      authoritativeLabel: 'ignored-conflicting-human-claim',
      language: 'Python',
      sourceClaim: 'ChatGPT-3.5',
      relativePath: 'units/ai/00003-Prob2.py',
      content: 'print("fixture")',
    },
    {
      recordId: 'humanvsai-code-dataset-mendeley-v1:00004',
      rowOrdinal: 4,
      problemId: 'Prob3',
      declaredPolarity: 'Human',
      authoritativeLabel: 'ignored-conflicting-ai-claim',
      language: 'C',
      sourceClaim: 'CodeNet',
      relativePath: 'units/human/00004-Prob3.c',
      content: 'int main(void) { return 0; }',
    },
  ];
  const projectionRows = rows.map(({ content, ...row }) => ({
    ...row,
    bytes: Buffer.byteLength(content),
    contentSha256: sha256(content),
    materializedSha256: sha256(content),
  }));
  const manifest = `${projectionRows.map((row) => JSON.stringify(row)).join('\n')}\n`;
  const dataCiteMetadata = JSON.stringify({
    data: {
      id: '10.17632/kjh95n54f8.1',
      attributes: {
        titles: [{ title: 'HumanVSAI_CodeDataset' }],
        publisher: 'Mendeley Data',
        rightsList: [{ rightsIdentifier: 'cc-by-4.0' }],
      },
    },
  });
  const fileMetadata = JSON.stringify([
    {
      filename: 'Code_Dataset.zip',
      status: 'COMPLETED',
      content_details: { sha256_hash: sha256(archive), size: archive.byteLength },
    },
  ]);

  await write(corpusRoot, `${sourceRoot}/Code_Dataset.zip`, archive);
  await write(
    corpusRoot,
    `${sourceRoot}/extracted/Code_Dataset/HumanVsAI_CodeDataset.csv`,
    csv,
  );
  for (const row of rows) {
    await write(corpusRoot, `${sourceRoot}/projection-v1/${row.relativePath}`, row.content);
  }
  await write(corpusRoot, `${sourceRoot}/projection-v1/projection-manifest.jsonl`, manifest);
  await write(
    corpusRoot,
    `${sourceRoot}/projection-v1/projection-receipt.json`,
    JSON.stringify({
      source: {
        sourceId: 'humanvsai-code-dataset-mendeley-v1',
        doi: '10.17632/kjh95n54f8.1',
        archiveSha256: sha256(archive),
        inputCsvBytes: csv.byteLength,
        inputCsvSha256: sha256(csv),
      },
      projection: {
        manifestRelativePath: `${sourceRoot}/projection-v1/projection-manifest.jsonl`,
        manifestBytes: Buffer.byteLength(manifest),
        manifestSha256: sha256(manifest),
        records: 4,
        regularFiles: 4,
        bytes: rows.reduce((sum, row) => sum + Buffer.byteLength(row.content), 0),
        countsByPolarity: { AI: 2, Human: 2 },
      },
    }),
  );
  await write(
    corpusRoot,
    `${sourceRoot}/datacite-metadata.json`,
    dataCiteMetadata,
  );
  await write(
    corpusRoot,
    `${sourceRoot}/mendeley-file-metadata.json`,
    fileMetadata,
  );
  await write(
    corpusRoot,
    'review/mendeley-humanvsai-audit-2026-07-14.json',
    JSON.stringify({
      source: {
        sourceId: 'humanvsai-code-dataset-mendeley-v1',
        originUrl: 'https://data.mendeley.com/datasets/kjh95n54f8/1',
        doi: '10.17632/kjh95n54f8.1',
        license: 'CC BY 4.0',
      },
      acquisition: {
        archiveRelativePath: `${sourceRoot}/Code_Dataset.zip`,
        archiveBytes: archive.byteLength,
        archiveSha256: sha256(archive),
        materialization: {
          primaryCsvRelativePath: `${sourceRoot}/extracted/Code_Dataset/HumanVsAI_CodeDataset.csv`,
          primaryCsvBytes: csv.byteLength,
          primaryCsvSha256: sha256(csv),
        },
      },
      staticDatasetAudit: {
        csvHeaders: ['problem_id', 'Sample_Code', 'Generated', 'Language', 'Source'],
        rows: 4,
        labels: { AI: 2, Human: 2 },
      },
    }),
  );

  return {
    corpusRoot,
    expectations: {
      sourceId: 'humanvsai-code-dataset-mendeley-v1',
      sourceUri: 'https://data.mendeley.com/datasets/kjh95n54f8/1',
      doi: '10.17632/kjh95n54f8.1',
      archiveSha256: sha256(archive),
      csvSha256: sha256(csv),
      manifestSha256: sha256(manifest),
      dataCiteSha256: sha256(dataCiteMetadata),
      fileMetadataSha256: sha256(fileMetadata),
      rawRows: 4,
      positiveRows: 2,
      negativeRows: 2,
    },
  };
}

afterEach(async () => {
  await Promise.all(temporaryRoots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

describe('Corpus v1 Mendeley source inventory', () => {
  it('reconciles publisher labels from a portable read-only projection fixture', async () => {
    const { corpusRoot, expectations } = await makeFixture();
    const inventory = await inventoryMendeleyCorpusV1({ corpusRoot, expectations });

    expect(inventory).toMatchObject({
      version: 'corpus-v1-mendeley-inventory-v1',
      sourceId: 'humanvsai-code-dataset-mendeley-v1',
      sourceVersion: '1',
      sourceUri: 'https://data.mendeley.com/datasets/kjh95n54f8/1',
      doi: '10.17632/kjh95n54f8.1',
      authorityTier: 'publisher_attested',
      licenseId: 'CC-BY-4.0',
      rightsDisposition: 'internal_analysis',
      rows: { raw: 4, positive: 2, negative: 2, malformed: 0 },
      labelMapping: { AI: 'positive', Human: 'negative' },
      sourceClaims: { 'ChatGPT-3.5': 1, 'ChatGPT-4': 1, CodeNet: 2 },
      languages: { C: 1, Java: 2, Python: 1 },
      families: { positive: 2, negative: 2, sharedAcrossLabels: 1 },
      manifestExactContent: { uniqueHashes: 4, duplicateRows: 0, crossLabelCollisions: 0 },
      projection: {
        regularFiles: 4,
        orphanFiles: 0,
        unitContentVerification: 'path_and_size_only',
      },
    });
  });

  it('fails closed when the explicit source expectations drift', async () => {
    const { corpusRoot, expectations } = await makeFixture();

    await expect(inventoryMendeleyCorpusV1({
      corpusRoot,
      expectations: { ...expectations, manifestSha256: '0'.repeat(64) },
    })).rejects.toThrow('source bytes do not match the explicit Corpus v1 expectations');
  });

  it('fails closed when mutable audit metadata changes the pinned source identity', async () => {
    const { corpusRoot, expectations } = await makeFixture();
    const auditPath = resolve(corpusRoot, 'review/mendeley-humanvsai-audit-2026-07-14.json');
    const audit = JSON.parse(await readFile(auditPath, 'utf8')) as { source: { doi: string } };
    audit.source.doi = '10.17632/not-the-pinned-source.1';
    await writeFile(auditPath, JSON.stringify(audit));

    await expect(inventoryMendeleyCorpusV1({ corpusRoot, expectations }))
      .rejects.toThrow('source identity does not match the explicit Corpus v1 expectations');
  });

  it('exposes that equal-length unit changes are deferred to manifest projection', async () => {
    const { corpusRoot, expectations } = await makeFixture();
    const unitPath = resolve(
      corpusRoot,
      'sources/benchmarks/humanvsai-code-dataset/projection-v1/units/human/00001-Prob1.java',
    );
    await writeFile(unitPath, 'class Evil {}');

    const inventory = await inventoryMendeleyCorpusV1({ corpusRoot, expectations });
    expect(inventory.projection.unitContentVerification).toBe('path_and_size_only');
    expect(inventory.manifestExactContent).toEqual({
      uniqueHashes: 4,
      duplicateRows: 0,
      crossLabelCollisions: 0,
    });
  });

  const realCorpusRoot = process.env.SLOPBRICK_CORPUS_V1_ROOT;
  const realSourceTest = realCorpusRoot ? it : it.skip;
  realSourceTest('reconciles the explicit local 5,000/5,000 source without mutation', async () => {
    const corpusRoot = resolve(realCorpusRoot!);
    const archivePath = resolve(
      corpusRoot,
      'sources/benchmarks/humanvsai-code-dataset/Code_Dataset.zip',
    );
    const csvPath = resolve(
      corpusRoot,
      'sources/benchmarks/humanvsai-code-dataset/extracted/Code_Dataset/HumanVsAI_CodeDataset.csv',
    );
    const manifestPath = resolve(
      corpusRoot,
      'sources/benchmarks/humanvsai-code-dataset/projection-v1/projection-manifest.jsonl',
    );
    const before = await Promise.all([stat(archivePath), stat(csvPath), stat(manifestPath)]);

    const inventory = await inventoryMendeleyCorpusV1({
      corpusRoot,
      expectations: PINNED_MENDELEY_V1_EXPECTATIONS,
    });

    const after = await Promise.all([stat(archivePath), stat(csvPath), stat(manifestPath)]);
    expect(after.map(({ size, mtimeMs }) => ({ size, mtimeMs }))).toEqual(
      before.map(({ size, mtimeMs }) => ({ size, mtimeMs })),
    );
    expect(inventory).toMatchObject({
      rows: { raw: 10_000, positive: 5_000, negative: 5_000, malformed: 0 },
      sourceClaims: { 'ChatGPT-3.5': 1_492, 'ChatGPT-4': 3_508, CodeNet: 5_000 },
      languages: { C: 1_737, 'C++': 2_640, Java: 2_945, Python: 2_678 },
      families: { positive: 3_660, negative: 3_192, sharedAcrossLabels: 3 },
      manifestExactContent: { uniqueHashes: 10_000, duplicateRows: 0, crossLabelCollisions: 0 },
      projection: {
        regularFiles: 10_000,
        orphanFiles: 0,
        bytes: 6_195_562,
        unitContentVerification: 'path_and_size_only',
      },
    });
  });
});
