import { createHash } from 'node:crypto';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import type { MendeleyCorpusV1Expectations } from '../../src/calibration/corpus-v1/inventory';
import { projectMendeleyCorpusV1CandidateManifest } from '../../src/calibration/corpus-v1/manifest';

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
  readonly humanUnitPath: string;
}> {
  const corpusRoot = await mkdtemp(join(tmpdir(), 'slopbrick-corpus-v1-manifest-'));
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
      attributes: { rightsList: [{ rightsIdentifier: 'cc-by-4.0' }] },
    },
  });
  const fileMetadata = JSON.stringify([{
    filename: 'Code_Dataset.zip',
    status: 'COMPLETED',
    content_details: { sha256_hash: sha256(archive), size: archive.byteLength },
  }]);

  await write(corpusRoot, `${sourceRoot}/Code_Dataset.zip`, archive);
  await write(corpusRoot, `${sourceRoot}/extracted/Code_Dataset/HumanVsAI_CodeDataset.csv`, csv);
  for (const row of rows) {
    await write(corpusRoot, `${sourceRoot}/projection-v1/${row.relativePath}`, row.content);
  }
  await write(corpusRoot, `${sourceRoot}/projection-v1/projection-manifest.jsonl`, manifest);
  await write(corpusRoot, `${sourceRoot}/projection-v1/projection-receipt.json`, JSON.stringify({
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
      records: rows.length,
      regularFiles: rows.length,
      bytes: rows.reduce((sum, row) => sum + Buffer.byteLength(row.content), 0),
      countsByPolarity: { AI: 1, Human: 1 },
    },
  }));
  await write(corpusRoot, `${sourceRoot}/datacite-metadata.json`, dataCiteMetadata);
  await write(corpusRoot, `${sourceRoot}/mendeley-file-metadata.json`, fileMetadata);
  await write(corpusRoot, 'review/mendeley-humanvsai-audit-2026-07-14.json', JSON.stringify({
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
      rows: rows.length,
      labels: { AI: 1, Human: 1 },
    },
  }));

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
      rawRows: rows.length,
      positiveRows: 1,
      negativeRows: 1,
    },
    humanUnitPath: resolve(
      corpusRoot,
      `${sourceRoot}/projection-v1/units/human/00001-Prob1.java`,
    ),
  };
}

afterEach(async () => {
  await Promise.all(temporaryRoots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

describe('Corpus v1 deterministic candidate manifest', () => {
  it('projects portable source rows with explicit authority, rights, and family bindings', async () => {
    const { corpusRoot, expectations } = await makeFixture();
    const result = await projectMendeleyCorpusV1CandidateManifest({ corpusRoot, expectations });

    expect(result).toMatchObject({
      version: 'corpus-v1-candidate-manifest-v1',
      builderVersion: 'corpus-v1-manifest-builder-v1',
      normalizerId: 'corpus-v1-lexical-tokens-v1',
      counts: { raw: 2, candidate: 2, quarantined: 0, positive: 1, negative: 1 },
    });
    expect(result.manifestSha256).toMatch(/^[a-f0-9]{64}$/u);
    expect(result.rows).toHaveLength(2);
    expect(result.rows[0]).toMatchObject({
      corpusVersion: 'v1',
      sourceId: 'humanvsai-code-dataset-mendeley-v1',
      sourceVersion: '1',
      sourceUri: 'https://data.mendeley.com/datasets/kjh95n54f8/1',
      sourceArchiveSha256: expectations.archiveSha256,
      sourceRecordId: 'humanvsai-code-dataset-mendeley-v1:00001',
      label: 'negative',
      authorityTier: 'publisher_attested',
      authorityEvidenceRef: 'review/mendeley-humanvsai-audit-2026-07-14.json',
      language: 'Java',
      familyKey: 'humanvsai-code-dataset-mendeley-v1:Prob1',
      split: 'unassigned',
      licenseId: 'CC-BY-4.0',
      licenseEvidenceRef: 'sources/benchmarks/humanvsai-code-dataset/datacite-metadata.json',
      rightsDisposition: 'internal_analysis',
      byteCount: 13,
      normalizerId: 'corpus-v1-lexical-tokens-v1',
      status: 'candidate',
      quarantineReasons: [],
    });
    expect(result.rows[0]?.unitId).toMatch(/^sbv1_[a-f0-9]{64}$/u);
    expect(result.rows[0]?.contentSha256).toBe(sha256('class Main {}'));
    expect(result.rows[0]?.sourceDeclaredContentSha256).toBe(sha256('class Main {}'));
    expect(result.rows[0]?.sourceMaterializedContentSha256).toBe(sha256('class Main {}'));
    expect(result.rows[0]?.normalizedSha256).toBe(
      '62836e5d9c344d42469970c9b8d49f95ddadfae10770bc004203b53df0e034a6',
    );
    expect(result.rows[1]?.label).toBe('positive');
  });

  it('quarantines equal-length unit tampering that the inventory deliberately defers', async () => {
    const { corpusRoot, expectations, humanUnitPath } = await makeFixture();
    await writeFile(humanUnitPath, 'class Evil {}');

    const result = await projectMendeleyCorpusV1CandidateManifest({ corpusRoot, expectations });
    expect(result.counts).toMatchObject({ raw: 2, candidate: 1, quarantined: 1 });
    expect(result.rows[0]).toMatchObject({
      contentSha256: sha256('class Evil {}'),
      sourceDeclaredContentSha256: sha256('class Main {}'),
      sourceMaterializedContentSha256: sha256('class Main {}'),
      status: 'quarantined',
      quarantineReasons: ['source_content_hash_mismatch'],
    });
  });

  it('quarantines unit bytes that cannot be normalized as strict UTF-8', async () => {
    const { corpusRoot, expectations, humanUnitPath } = await makeFixture();
    await writeFile(humanUnitPath, Buffer.from([0xff, ...Array.from({ length: 12 }, () => 0x20)]));

    const result = await projectMendeleyCorpusV1CandidateManifest({ corpusRoot, expectations });
    expect(result.rows[0]).toMatchObject({
      normalizedSha256: null,
      status: 'quarantined',
      quarantineReasons: ['invalid_utf8', 'source_content_hash_mismatch'],
    });
  });

  it('emits identical canonical JSONL and hashes for identical bytes', async () => {
    const { corpusRoot, expectations } = await makeFixture();
    const first = await projectMendeleyCorpusV1CandidateManifest({ corpusRoot, expectations });
    const second = await projectMendeleyCorpusV1CandidateManifest({ corpusRoot, expectations });

    expect(second.manifestJsonl).toBe(first.manifestJsonl);
    expect(second.manifestSha256).toBe(first.manifestSha256);
    expect(second.rows).toEqual(first.rows);
  });

  const realCorpusRoot = process.env.SLOPBRICK_CORPUS_V1_ROOT;
  const realSourceTest = realCorpusRoot ? it : it.skip;
  realSourceTest('rehashes the explicit local 5,000/5,000 source without admission claims', async () => {
    const result = await projectMendeleyCorpusV1CandidateManifest({
      corpusRoot: resolve(realCorpusRoot!),
    });

    expect(result.counts).toEqual({
      raw: 10_000,
      candidate: 10_000,
      quarantined: 0,
      positive: 5_000,
      negative: 5_000,
    });
    expect(result.rows).toHaveLength(10_000);
    expect(result.manifestSha256).toMatch(/^[a-f0-9]{64}$/u);
  });
});
