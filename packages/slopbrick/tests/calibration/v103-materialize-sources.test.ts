import { createHash } from 'node:crypto';
import { chmod, mkdir, mkdtemp, readFile, readdir, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { isCalibrationCheckoutMapV103 } from '@usebrick/core';

import { materializeSources } from '../../src/calibration/v103/materialize-sources';
import { acquireArtifact } from '../../src/calibration/v103/artifact-download';
import { extractReleaseArchive } from '../../src/calibration/v103/safe-zip';
import { buildRawZipFixture } from '../helpers/zip-fixtures';

const tempRoots: string[] = [];

afterEach(async () => {
  while (tempRoots.length > 0) await rm(tempRoots.pop()!, { recursive: true, force: true });
});

function sha256(value: Buffer | string): string {
  return createHash('sha256').update(value).digest('hex');
}

async function fixture(rootPrefix = 'pkg'): Promise<{
  readonly root: string;
  readonly cache: string;
  readonly output: string;
  readonly manifest: Record<string, unknown>;
  readonly source: Buffer;
}> {
  const root = await mkdtemp(join(tmpdir(), 'slopbrick-v103-materialize-'));
  tempRoots.push(root);
  const cache = join(root, 'cache');
  const source = Buffer.from('export const release = true;\n');
  const zip = buildRawZipFixture({ entries: [
    { name: `${rootPrefix}/` },
    { name: `${rootPrefix}/src/` },
    { name: `${rootPrefix}/src/sample.ts`, data: source },
  ] });
  await mkdir(cache, { mode: 0o700 });
  await chmod(cache, 0o700);
  const assetSha256 = sha256(zip.bytes);
  await writeFile(join(cache, `${assetSha256}.zip`), zip.bytes, { mode: 0o600 });
  const generatedAt = '2026-07-12T00:00:00Z';
  const commitSha = 'a'.repeat(40);
  const manifest = {
    version: 'v10.3',
    generatedAt,
    methodVersion: 'v10.3.1',
    leakageReview: { protocolVersion: 'leakage-v1', reviewedAt: generatedAt, reviewerIds: ['fixture-reviewer'], noCrossPolarityFamilyOrCluster: true },
    repositories: [{
      repositoryId: 'release-repo', familyId: 'release-family', originUrl: 'https://example.test/release-repo', commitSha, acquiredAt: generatedAt, license: 'MIT',
      materialization: { kind: 'release_archive', assetUrl: 'https://example.test/releases/release.zip', assetSha256, assetBytes: zip.bytes.byteLength, archiveFormat: 'zip', rootPrefix, extractionPolicy: 'safe-zip-v1' },
    }],
    files: [{
      sourceId: `release-repo@${commitSha}+asset-${assetSha256}:src/sample.ts`, repositoryId: 'release-repo', familyId: 'release-family', normalizedPath: 'src/sample.ts', contentSha256: sha256(source), language: 'typescript', stratum: 'production', clusterId: 'release-cluster', label: 'verified_ai', tier: 'gold', split: 'test', evidence: { kind: 'manual_protocol', reference: 'https://example.test/evidence', protocolId: 'fixture' },
    }],
  };
  return { root, cache, output: join(root, 'checkout-map.json'), manifest, source };
}

describe('v10.3 release source materialization', () => {
  it('materializes a preseeded archive offline and emits a schema-valid checkout map rooted at rootPrefix', async () => {
    const input = await fixture();
    const result = await materializeSources({
      manifest: input.manifest,
      runId: 'materialize-fixture',
      cacheDirectory: input.cache,
      outputPath: input.output,
      network: 'deny',
      allowedHosts: [],
    });
    expect(result).toMatchObject({ runId: 'materialize-fixture', repositories: 1, releaseArchives: 1 });
    const map = JSON.parse(await readFile(input.output, 'utf8')) as Record<string, unknown>;
    expect(isCalibrationCheckoutMapV103(map)).toBe(true);
    const entry = (map.entries as Array<Record<string, unknown>>)[0]!;
    expect(entry.checkoutPath).toMatch(/\/\.v103-tree-[0-9a-f]{32}\/pkg$/);
    expect(entry.materialization).toMatchObject({ kind: 'release_archive', extractionPolicy: 'safe-zip-v1' });
  });

  it('accepts a contained rootPrefix whose segment begins with ..', async () => {
    const input = await fixture('..foo');
    await expect(materializeSources({ manifest: input.manifest, runId: 'dot-name-fixture', cacheDirectory: input.cache, outputPath: input.output })).resolves.toMatchObject({ repositories: 1 });
    const map = JSON.parse(await readFile(input.output, 'utf8')) as { entries: Array<{ checkoutPath: string }> };
    expect(map.entries[0]!.checkoutPath).toMatch(/\/\.v103-tree-[0-9a-f]{32}\/\.\.foo$/);
  });

  it.each([
    ['missing declared file', async (input: Awaited<ReturnType<typeof fixture>>) => {
      const first = await materializeSources({ manifest: input.manifest, runId: 'mutation-fixture', cacheDirectory: input.cache, outputPath: input.output, network: 'deny', allowedHosts: [] });
      const map = JSON.parse(await readFile(input.output, 'utf8')) as { entries: Array<{ checkoutPath: string }> };
      await rm(join(map.entries[0]!.checkoutPath, 'src', 'sample.ts'));
      return first;
    }, 'ERR_SAFE_ZIP_TREE'],
    ['mutated declared file', async (input: Awaited<ReturnType<typeof fixture>>) => {
      await materializeSources({ manifest: input.manifest, runId: 'mutation-fixture', cacheDirectory: input.cache, outputPath: input.output, network: 'deny', allowedHosts: [] });
      const map = JSON.parse(await readFile(input.output, 'utf8')) as { entries: Array<{ checkoutPath: string }> };
      await writeFile(join(map.entries[0]!.checkoutPath, 'src', 'sample.ts'), 'export const release = false;\n');
    }, 'ERR_SAFE_ZIP_RECEIPT'],
    ['symlinked declared file', async (input: Awaited<ReturnType<typeof fixture>>) => {
      await materializeSources({ manifest: input.manifest, runId: 'mutation-fixture', cacheDirectory: input.cache, outputPath: input.output, network: 'deny', allowedHosts: [] });
      const map = JSON.parse(await readFile(input.output, 'utf8')) as { entries: Array<{ checkoutPath: string }> };
      const file = join(map.entries[0]!.checkoutPath, 'src', 'sample.ts');
      await rm(file);
      await symlink('/tmp/outside-materialization-target', file);
    }, 'ERR_SAFE_ZIP_TREE'],
  ])('rejects a %s before writing a second map', async (_label, mutate, expectedCode) => {
    const input = await fixture();
    await mutate(input);
    const secondOutput = join(input.root, 'second-checkout-map.json');
    await expect(materializeSources({ manifest: input.manifest, runId: 'mutation-fixture', cacheDirectory: input.cache, outputPath: secondOutput, network: 'deny', allowedHosts: [] })).rejects.toMatchObject({ code: expectedCode });
    await expect(readFile(secondOutput, 'utf8')).rejects.toMatchObject({ code: 'ENOENT' });
  });

  it.each([
    ['wrong digest', (manifest: Record<string, unknown>) => {
      const file = (manifest.files as Array<Record<string, unknown>>)[0]!;
      file.contentSha256 = '0'.repeat(64);
    }],
    ['wrong root', (manifest: Record<string, unknown>) => {
      const repository = (manifest.repositories as Array<Record<string, unknown>>)[0]!;
      (repository.materialization as Record<string, unknown>).rootPrefix = 'wrong-root';
    }],
    ['traversal path', (manifest: Record<string, unknown>) => {
      const file = (manifest.files as Array<Record<string, unknown>>)[0]!;
      file.normalizedPath = '../sample.ts';
    }],
  ])('rejects a manifest with %s before output creation', async (_label, mutate) => {
    const input = await fixture();
    mutate(input.manifest);
    const output = join(input.root, 'invalid-checkout-map.json');
    const expectedCode = _label === 'traversal path' ? 'ERR_MATERIALIZE_MANIFEST' : 'ERR_MATERIALIZE_FILES';
    await expect(materializeSources({ manifest: input.manifest, runId: 'invalid-fixture', cacheDirectory: input.cache, outputPath: output, network: 'deny', allowedHosts: [] })).rejects.toMatchObject({ code: expectedCode });
    await expect(readFile(output, 'utf8')).rejects.toMatchObject({ code: 'ENOENT' });
  });

  it('requires and exactly merges a Git-only base checkout map for mixed manifests', async () => {
    const input = await fixture();
    const generatedAt = '2026-07-12T00:00:00Z';
    const commitSha = 'b'.repeat(40);
    const mixed = structuredClone(input.manifest) as Record<string, unknown>;
    (mixed.repositories as Array<Record<string, unknown>>).push({ repositoryId: 'git-repo', familyId: 'git-family', originUrl: 'https://example.test/git-repo', commitSha, acquiredAt: generatedAt, license: 'MIT' });
    (mixed.files as Array<Record<string, unknown>>).push({ sourceId: `git-repo@${commitSha}:src/sample.ts`, repositoryId: 'git-repo', familyId: 'git-family', normalizedPath: 'src/sample.ts', contentSha256: '1'.repeat(64), language: 'typescript', stratum: 'production', clusterId: 'git-cluster', label: 'verified_human', tier: 'gold', split: 'test', evidence: { kind: 'manual_protocol', reference: 'https://example.test/git-evidence', protocolId: 'fixture' } });
    const withoutBase = join(input.root, 'without-base.json');
    await expect(materializeSources({ manifest: mixed, runId: 'mixed-fixture', cacheDirectory: input.cache, outputPath: withoutBase, network: 'deny', allowedHosts: [] })).rejects.toMatchObject({ code: 'ERR_MATERIALIZE_BASE_MAP' });
    const base = { version: 'v10.3', runId: 'git-base', entries: [{ repositoryId: 'git-repo', commitSha, checkoutPath: '/private/corpus/git-repo' }] };
    const output = join(input.root, 'mixed-checkout-map.json');
    await expect(materializeSources({ manifest: mixed, runId: 'mixed-fixture', cacheDirectory: input.cache, outputPath: output, baseCheckoutMap: base, network: 'deny', allowedHosts: [] })).resolves.toMatchObject({ repositories: 2 });
    const map = JSON.parse(await readFile(output, 'utf8')) as { entries: Array<Record<string, unknown>> };
    expect(map.entries.map((entry) => entry.repositoryId)).toEqual(['git-repo', 'release-repo']);
    expect(map.entries[0]).toMatchObject({ repositoryId: 'git-repo', checkoutPath: '/private/corpus/git-repo' });
    const extraOutput = join(input.root, 'extra-base.json');
    await expect(materializeSources({ manifest: mixed, runId: 'mixed-fixture', cacheDirectory: input.cache, outputPath: extraOutput, baseCheckoutMap: { ...base, entries: [...base.entries, { repositoryId: 'extra-repo', commitSha: 'c'.repeat(40), checkoutPath: '/private/corpus/extra' }] }, network: 'deny', allowedHosts: [] })).rejects.toMatchObject({ code: 'ERR_MATERIALIZE_BASE_MAP' });
    await expect(readFile(extraOutput, 'utf8')).rejects.toMatchObject({ code: 'ENOENT' });

    const wrongCommitOutput = join(input.root, 'wrong-commit-base.json');
    await expect(materializeSources({ manifest: mixed, runId: 'mixed-fixture', cacheDirectory: input.cache, outputPath: wrongCommitOutput, baseCheckoutMap: { ...base, entries: [{ ...base.entries[0], commitSha: 'c'.repeat(40) }] }, network: 'deny', allowedHosts: [] })).rejects.toMatchObject({ code: 'ERR_MATERIALIZE_BASE_MAP' });
    await expect(readFile(wrongCommitOutput, 'utf8')).rejects.toMatchObject({ code: 'ENOENT' });
    const duplicateOutput = join(input.root, 'duplicate-base.json');
    await expect(materializeSources({ manifest: mixed, runId: 'mixed-fixture', cacheDirectory: input.cache, outputPath: duplicateOutput, baseCheckoutMap: { ...base, entries: [...base.entries, { ...base.entries[0], commitSha: 'd'.repeat(40), checkoutPath: '/private/corpus/git-repo-other' }] }, network: 'deny', allowedHosts: [] })).rejects.toMatchObject({ code: 'ERR_MATERIALIZE_BASE_MAP' });
    await expect(readFile(duplicateOutput, 'utf8')).rejects.toMatchObject({ code: 'ENOENT' });
  });

  it('reuses one acquisition and extraction for two repositories sharing an archive', async () => {
    const input = await fixture();
    const shared = structuredClone(input.manifest) as Record<string, unknown>;
    const repository = (shared.repositories as Array<Record<string, unknown>>)[0]!;
    const materialization = structuredClone(repository.materialization);
    const commitSha = 'b'.repeat(40);
    (shared.repositories as Array<Record<string, unknown>>).push({ repositoryId: 'release-repo-two', familyId: 'release-family-two', originUrl: 'https://example.test/release-repo-two', commitSha, acquiredAt: '2026-07-12T00:00:00Z', license: 'MIT', materialization });
    const source = (shared.files as Array<Record<string, unknown>>)[0]!;
    const assetSha256 = (materialization as Record<string, unknown>).assetSha256 as string;
    (shared.files as Array<Record<string, unknown>>).push({ ...source, sourceId: `release-repo-two@${commitSha}+asset-${assetSha256}:src/sample.ts`, repositoryId: 'release-repo-two', familyId: 'release-family-two', clusterId: 'release-cluster-two' });
    let acquisitions = 0;
    let extractions = 0;
    const result = await materializeSources({ manifest: shared, runId: 'shared-fixture', cacheDirectory: input.cache, outputPath: input.output }, {
      acquireArtifact: (...args: Parameters<typeof acquireArtifact>) => { acquisitions += 1; return acquireArtifact(...args); },
      extractReleaseArchive: (...args: Parameters<typeof extractReleaseArchive>) => { extractions += 1; return extractReleaseArchive(...args); },
    });
    expect(result).toMatchObject({ repositories: 2, releaseArchives: 1 });
    expect(acquisitions).toBe(1);
    expect(extractions).toBe(1);
  });

  it('defaults omitted network policy to deny', async () => {
    const input = await fixture();
    const repository = (input.manifest.repositories as Array<Record<string, unknown>>)[0]!;
    const assetSha256 = ((repository.materialization as Record<string, unknown>).assetSha256 as string);
    await rm(join(input.cache, `${assetSha256}.zip`));
    const output = join(input.root, 'default-deny.json');
    await expect(materializeSources({ manifest: input.manifest, runId: 'default-deny', cacheDirectory: input.cache, outputPath: output })).rejects.toMatchObject({ code: 'ERR_ARTIFACT_NETWORK_DENIED' });
    await expect(readFile(output, 'utf8')).rejects.toMatchObject({ code: 'ENOENT' });
  });

  it('normalizes a deterministic removal race before final publication', async () => {
    const input = await fixture();
    const output = join(input.root, 'race-checkout-map.json');
    await expect(materializeSources({ manifest: input.manifest, runId: 'race-fixture', cacheDirectory: input.cache, outputPath: output }, {
      beforeFinalVerification: async () => {
        const tree = (await readdir(input.cache)).find((entry) => entry.startsWith('.v103-tree-'));
        await rm(join(input.cache, tree!, 'pkg', 'src', 'sample.ts'));
      },
    })).rejects.toMatchObject({ code: 'ERR_MATERIALIZE_FILES' });
    await expect(readFile(output, 'utf8')).rejects.toMatchObject({ code: 'ENOENT' });
  });

  it('refuses to overwrite an existing checkout map', async () => {
    const input = await fixture();
    await materializeSources({ manifest: input.manifest, runId: 'overwrite-fixture', cacheDirectory: input.cache, outputPath: input.output, network: 'deny', allowedHosts: [] });
    const before = await readFile(input.output, 'utf8');
    await expect(materializeSources({ manifest: input.manifest, runId: 'overwrite-fixture', cacheDirectory: input.cache, outputPath: input.output, network: 'deny', allowedHosts: [] })).rejects.toMatchObject({ code: 'ERR_MATERIALIZE_OUTPUT' });
    expect(await readFile(input.output, 'utf8')).toBe(before);
  });
});
