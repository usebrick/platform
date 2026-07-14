import { afterEach, describe, expect, it } from 'vitest';
import { execFile } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';
import type { ReleaseArchiveMaterialization } from '@usebrick/core';

import {
  canonicalJson,
  canonicalSha256,
  stableCalibrationFileId,
} from '../../src/calibration/v103/canonical';
import {
  buildSelection,
  renderSelectionJsonl,
  verifySelectionLedger,
} from '../../src/calibration/v103/selection';

const execFileAsync = promisify(execFile);
const tempDirs: string[] = [];

afterEach(() => {
  while (tempDirs.length > 0) rmSync(tempDirs.pop()!, { recursive: true, force: true });
});

function tempDir(): string {
  const dir = mkdtempSync(join(tmpdir(), 'slopbrick-v103-'));
  tempDirs.push(dir);
  return dir;
}

function fileSha256(path: string): string {
  return createHash('sha256').update(readFileSync(path)).digest('hex');
}

function manifest() {
  return {
    version: 'v10.3',
    generatedAt: '2026-07-10T00:00:00Z',
    methodVersion: 'v10.3.0',
    leakageReview: {
      protocolVersion: 'leakage-v1',
      reviewedAt: '2026-07-10T00:00:00Z',
      reviewerIds: ['reviewer-a'],
      noCrossPolarityFamilyOrCluster: true,
    },
    repositories: [
      {
        repositoryId: 'ai-repo',
        familyId: 'ai-family',
        originUrl: 'https://example.test/ai-repo',
        commitSha: 'a'.repeat(40),
        acquiredAt: '2026-07-10T00:00:00Z',
        license: 'MIT',
      },
      {
        repositoryId: 'human-repo',
        familyId: 'human-family',
        originUrl: 'https://example.test/human-repo',
        commitSha: 'b'.repeat(40),
        acquiredAt: '2026-07-10T00:00:00Z',
        license: 'Apache-2.0',
      },
      {
        repositoryId: 'mixed-repo',
        familyId: 'mixed-family',
        originUrl: 'https://example.test/mixed-repo',
        commitSha: 'c'.repeat(40),
        acquiredAt: '2026-07-10T00:00:00Z',
        license: 'MIT',
      },
      {
        repositoryId: 'quarantine-repo',
        familyId: 'quarantine-family',
        originUrl: 'https://example.test/quarantine-repo',
        commitSha: 'd'.repeat(40),
        acquiredAt: '2026-07-10T00:00:00Z',
        license: 'MIT',
      },
    ],
    files: [
      {
        sourceId: `ai-repo@${'a'.repeat(40)}:src/main.ts`, repositoryId: 'ai-repo', familyId: 'ai-family', normalizedPath: 'src/main.ts',
        contentSha256: '1'.repeat(64), language: 'typescript', stratum: 'production', clusterId: 'ai-cluster',
        label: 'verified_ai', tier: 'gold', split: 'train',
        evidence: { kind: 'generator_record', reference: 'https://example.test/ai-evidence', model: 'test-model', promptTaskId: 'task-1', generatedAt: '2026-07-10T00:00:00Z', humanEditStatus: 'none' },
      },
      {
        sourceId: `human-repo@${'b'.repeat(40)}:lib/main.ts`, repositoryId: 'human-repo', familyId: 'human-family', normalizedPath: 'lib/main.ts',
        contentSha256: '2'.repeat(64), language: 'typescript', stratum: 'production', clusterId: 'human-cluster',
        label: 'verified_human', tier: 'gold', split: 'train',
        evidence: { kind: 'manual_protocol', reference: 'https://example.test/human-evidence', protocolId: 'protocol-1' },
      },
      {
        sourceId: `mixed-repo@${'c'.repeat(40)}:test/mixed.ts`, repositoryId: 'mixed-repo', familyId: 'mixed-family', normalizedPath: 'test/mixed.ts',
        contentSha256: '3'.repeat(64), language: 'typescript', stratum: 'test', clusterId: 'mixed-cluster',
        label: 'mixed', tier: 'gold', split: 'mixed_evaluation',
        evidence: { kind: 'manual_protocol', reference: 'https://example.test/mixed-evidence', protocolId: 'protocol-1' },
      },
      {
        sourceId: `quarantine-repo@${'d'.repeat(40)}:src/unproven.ts`, repositoryId: 'quarantine-repo', familyId: 'quarantine-family', normalizedPath: 'src/unproven.ts',
        contentSha256: '4'.repeat(64), language: 'typescript', stratum: 'production', clusterId: 'quarantine-cluster',
        label: 'quarantine', tier: 'quarantine', split: 'excluded', exclusionReason: 'unproven provenance',
        evidence: { kind: 'manual_protocol', reference: 'https://example.test/quarantine-evidence', protocolId: 'protocol-1' },
      },
    ],
  };
}

function gitCompatibilityManifest() {
  const input = manifest();
  return {
    ...input,
    repositories: [input.repositories[0]!],
    files: [input.files[0]!],
  };
}

function releaseMaterialization(
  overrides: Partial<ReleaseArchiveMaterialization> = {},
): ReleaseArchiveMaterialization {
  return {
    kind: 'release_archive',
    assetUrl: 'https://example.test/releases/ai-repo.zip',
    assetSha256: 'c'.repeat(64),
    assetBytes: 4096,
    archiveFormat: 'zip',
    rootPrefix: 'ai-repo-root',
    extractionPolicy: 'safe-zip-v1',
    ...overrides,
  };
}

function releaseArchiveManifest() {
  const input = manifest();
  const commitSha = input.repositories[0]!.commitSha;
  const materialization = releaseMaterialization();
  return {
    ...input,
    methodVersion: 'v10.3.1',
    repositories: input.repositories.map((repository, index) => index === 0
      ? { ...repository, materialization }
      : repository),
    files: input.files.map((file, index) => index === 0
      ? { ...file, sourceId: `ai-repo@${commitSha}+asset-${materialization.assetSha256}:src/main.ts` }
      : file),
  };
}

function rawSha256(value: string): string {
  return createHash('sha256').update(value, 'utf8').digest('hex');
}

describe('v10.3 canonical selection', () => {
  it('canonicalizes JSON and derives a path-portable stable file ID', () => {
    expect(canonicalJson({ z: [true, { b: 2, a: 1 }], a: 'x' })).toBe('{"a":"x","z":[true,{"a":1,"b":2}]}');
    const id = stableCalibrationFileId(manifest().files[0]!, manifest().repositories);
    expect(id).toMatch(/^sbf_[a-f0-9]{64}$/);
    expect(id).not.toContain('/');
    expect(canonicalSha256({ b: 1, a: 2 })).toBe(canonicalSha256({ a: 2, b: 1 }));
  });

  it('emits byte-identical, manifest-complete selection records with explicit exclusions', () => {
    const input = manifest();
    input.files[0]!.pairGroupId = 'task-42';
    input.files[1]!.pairGroupId = 'task-42';
    const reversed = { ...input, repositories: [...input.repositories].reverse(), files: [...input.files].reverse() };
    const first = buildSelection(input, { seed: 'smoke-1' });
    const second = buildSelection(reversed, { seed: 'smoke-1' });

    expect(renderSelectionJsonl(first.records)).toBe(renderSelectionJsonl(second.records));
    expect(first.ledger).toEqual(second.ledger);
    expect(first.records).toHaveLength(4);
    expect(first.records.map((record) => record.status)).toEqual(['selected', 'selected', 'excluded', 'excluded']);
    expect(first.records.find((record) => record.sourceId.startsWith('mixed-repo@'))).toMatchObject({
      status: 'excluded', exclusionReason: 'label_not_eligible',
    });
    expect(first.records.find((record) => record.sourceId.startsWith('quarantine-repo@'))).toMatchObject({
      status: 'excluded',
      exclusionReason: 'label_not_eligible',
      manifestExclusionReason: 'unproven provenance',
    });
    expect(first.records.filter((record) => record.pairGroupId === 'task-42')).toHaveLength(2);
    expect(renderSelectionJsonl(first.records)).not.toMatch(/\/Users\/|\\\\Users\\\\|\/tmp\//);
  });

  it('fails closed when a selection ledger is missing, duplicated, or stale', () => {
    const input = manifest();
    const selection = buildSelection(input, { seed: 'smoke-1' });
    const jsonl = renderSelectionJsonl(selection.records);

    expect(verifySelectionLedger(input, jsonl, selection.ledger)).toEqual({ ok: true });
    expect(verifySelectionLedger(input, `${jsonl}${jsonl.split('\n')[0]}\n`, selection.ledger)).toMatchObject({ ok: false });
    expect(verifySelectionLedger(input, jsonl.split('\n').slice(0, -2).join('\n') + '\n', selection.ledger)).toMatchObject({ ok: false });
    expect(verifySelectionLedger(input, jsonl.replace('unproven provenance', 'rewritten provenance'), selection.ledger)).toMatchObject({ ok: false });
    expect(verifySelectionLedger({ ...input, generatedAt: '2026-07-11T00:00:00Z' }, jsonl, selection.ledger)).toMatchObject({ ok: false });
  });
});

describe('Task 2 release selection binding', () => {
  it('keeps the frozen Git-only selection IDs and serialized bytes unchanged', () => {
    const selection = buildSelection(gitCompatibilityManifest(), { seed: 'smoke-1' });
    const jsonl = renderSelectionJsonl(selection.records);
    const canonicalLedger = canonicalJson(selection.ledger);
    const prettyLedger = `${JSON.stringify(selection.ledger, null, 2)}\n`;

    expect(selection.records[0]!.fileId).toBe('sbf_16358504671821d0e9643d831764052abd7cfadf3d1cc989074612cd94d64b58');
    expect(Buffer.byteLength(jsonl)).toBe(574);
    expect(rawSha256(jsonl)).toBe('caefdfa7467d74e09193875d6f29ed213ac2958069a1f3dc22ada7c4b12ee52f');
    expect(Buffer.byteLength(canonicalLedger)).toBe(605);
    expect(rawSha256(canonicalLedger)).toBe('b01883c955f357fb04b6a87ed104bd4ed36c86d297d48a6d4d34a81451f97a18');
    expect(Buffer.byteLength(prettyLedger)).toBe(792);
    expect(rawSha256(prettyLedger)).toBe('92c2407b9b2d61f844661b80b5e86c0765d95a4f78f53ea549daaf9edb18e430');
    expect(selection.ledger.recordsSha256).toBe('882952583c589d2a3fd16409e7f0181141abcbb670ccd0a013447f2cda4db7ee');
    expect(selection.ledger.manifestSha256).toBe('49a90a533eb77b299748543ecf4b6df5fa260b71303dd91f61539db3b2709882');
  });

  it('copies only the local release checkout binding into a selection record', () => {
    const input = releaseArchiveManifest();
    const selection = buildSelection(input, { seed: 'release-smoke-1' });
    const releaseRecord = selection.records.find((record) => record.repositoryId === 'ai-repo')!;

    expect(releaseRecord.materialization).toEqual({
      kind: 'release_archive',
      assetSha256: 'c'.repeat(64),
      extractionPolicy: 'safe-zip-v1',
    });
    expect(Object.keys(releaseRecord.materialization!).sort()).toEqual([
      'assetSha256',
      'extractionPolicy',
      'kind',
    ]);
    expect(canonicalJson(releaseRecord)).not.toMatch(/assetUrl|assetBytes|archiveFormat|rootPrefix|checkoutPath|cachePath|acquiredAt|\/Users\/|\/tmp\//);
  });

  it('is deterministic for reordered mixed Git and release manifests', () => {
    const input = releaseArchiveManifest();
    const reversed = {
      ...input,
      repositories: [...input.repositories].reverse(),
      files: [...input.files].reverse(),
    };
    const first = buildSelection(input, { seed: 'release-smoke-1' });
    const second = buildSelection(reversed, { seed: 'release-smoke-1' });

    expect(first.records.some((record) => record.materialization === undefined)).toBe(true);
    expect(first.records.some((record) => record.materialization?.kind === 'release_archive')).toBe(true);
    expect(renderSelectionJsonl(first.records)).toBe(renderSelectionJsonl(second.records));
    expect(first.ledger).toEqual(second.ledger);
  });

  it.each([
    ['removed', undefined],
    ['changed digest', { kind: 'release_archive', assetSha256: 'd'.repeat(64), extractionPolicy: 'safe-zip-v1' }],
    ['changed policy', { kind: 'release_archive', assetSha256: 'c'.repeat(64), extractionPolicy: 'safe-zip-v2' }],
  ])('rejects a selection ledger whose release binding was %s', (_name, materialization) => {
    const input = releaseArchiveManifest();
    const selection = buildSelection(input, { seed: 'release-smoke-1' });
    const records = selection.records.map((record) => record.repositoryId !== 'ai-repo'
      ? record
      : materialization === undefined
        ? Object.fromEntries(Object.entries(record).filter(([key]) => key !== 'materialization'))
        : { ...record, materialization });
    const jsonl = records.map((record) => canonicalJson(record)).join('\n') + '\n';

    expect(verifySelectionLedger(input, jsonl, selection.ledger)).toMatchObject({ ok: false });
  });

  it('rejects release archive selections under method v10.3.0', () => {
    const input = { ...releaseArchiveManifest(), methodVersion: 'v10.3.0' };

    expect(() => buildSelection(input, { seed: 'release-smoke-1' })).toThrow(
      'Manifest does not satisfy the v10.3 corpus contract',
    );
  });
});

describe('v10.3 selection entrypoint', () => {
  it('uses exit 2 for a bad manifest and refuses nonempty output directories', async () => {
    const dir = tempDir();
    const badManifest = join(dir, 'bad-manifest.json');
    writeFileSync(badManifest, JSON.stringify({ version: 'v10.3' }));
    const script = join(process.cwd(), 'scripts', 'cal', 'v103.ts');
    const tsx = join(process.cwd(), 'node_modules', '.bin', 'tsx');

    await expect(execFileAsync(tsx, [script, 'corpus:validate', '--manifest', badManifest, '--expected-manifest-sha256', fileSha256(badManifest)])).rejects.toMatchObject({ code: 2 });

    const validManifest = join(dir, 'manifest.json');
    writeFileSync(validManifest, JSON.stringify(manifest()));
    const out = join(dir, 'run');
    mkdirSync(out);
    writeFileSync(join(out, 'keep.txt'), 'do not overwrite');
    await expect(execFileAsync(tsx, [script, 'select', '--manifest', validManifest, '--expected-manifest-sha256', fileSha256(validManifest), '--seed', 'smoke-1', '--out', out])).rejects.toMatchObject({ code: 2 });
    expect(readFileSync(join(out, 'keep.txt'), 'utf8')).toBe('do not overwrite');

    const freshRun = join(dir, 'fresh-run');
    await expect(execFileAsync(tsx, [script, 'select', '--manifest', validManifest, '--expected-manifest-sha256', fileSha256(validManifest), '--seed', 'smoke-1', '--out', freshRun])).resolves.toMatchObject({});
    expect(readFileSync(join(freshRun, 'corpus-selection.jsonl'), 'utf8')).not.toContain(dir);
    await expect(execFileAsync(tsx, [script, 'verify', '--run', freshRun, '--stage', 'selection'])).resolves.toMatchObject({});
  });
});
