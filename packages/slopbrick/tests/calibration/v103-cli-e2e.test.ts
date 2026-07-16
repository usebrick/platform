import { createHash } from 'node:crypto';
import { execFile } from 'node:child_process';
import { afterEach, describe, expect, it } from 'vitest';
import { chmodSync, mkdtempSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { isCalibrationCheckoutMapV103 } from '@usebrick/core';

import { createV103RunManifest } from '../../src/calibration/v103/run-manifest';
import { canonicalCorpusManifestSha256, canonicalSha256 } from '../../src/calibration/v103/canonical';
import { isV103UnavailableArtifact } from '../../src/calibration/v103/report-artifacts';
import { buildRawZipFixture } from '../helpers/zip-fixtures';

const execFileAsync = promisify(execFile);
const tempDirs: string[] = [];
const packageRoot = fileURLToPath(new URL('../..', import.meta.url));
const script = join(packageRoot, 'scripts', 'cal', 'v103.ts');
const tsx = join(packageRoot, 'tests', 'helpers', 'tsx-runner.cjs');

afterEach(() => {
  while (tempDirs.length > 0) rmSync(tempDirs.pop()!, { recursive: true, force: true });
});

function tempDir(): string {
  const directory = mkdtempSync(join(tmpdir(), 'slopbrick-v103-cli-'));
  tempDirs.push(directory);
  return directory;
}

function sha256(contents: string): string {
  return createHash('sha256').update(contents, 'utf8').digest('hex');
}

function fileSha256(path: string): string {
  return createHash('sha256').update(readFileSync(path)).digest('hex');
}

function chunkId(fileId: string): string {
  return sha256(JSON.stringify([fileId]));
}

async function committedCheckout(root: string, name: string, contents: string): Promise<{ checkoutPath: string; commitSha: string }> {
  const checkoutPath = join(root, name);
  mkdirSync(join(checkoutPath, 'src'), { recursive: true });
  writeFileSync(join(checkoutPath, 'src', 'sample.ts'), contents);
  await execFileAsync('git', ['init', '--quiet', checkoutPath]);
  await execFileAsync('git', ['config', 'user.email', 'v103@example.test'], { cwd: checkoutPath });
  await execFileAsync('git', ['config', 'user.name', 'v10.3 fixture'], { cwd: checkoutPath });
  await execFileAsync('git', ['add', 'src/sample.ts'], { cwd: checkoutPath });
  await execFileAsync('git', ['commit', '--quiet', '-m', 'fixture'], { cwd: checkoutPath });
  const { stdout } = await execFileAsync('git', ['rev-parse', 'HEAD'], { cwd: checkoutPath });
  return { checkoutPath, commitSha: stdout.trim() };
}

describe('v10.3 calibration CLI', () => {
  it('requires the frozen scan inputs before report production', async () => {
    const root = tempDir();
    const packageJson = JSON.parse(readFileSync(join(packageRoot, 'package.json'), 'utf8')) as { scripts?: Record<string, string> };
    expect(packageJson.scripts?.['cal:report']).toBe('node dist/calibration/v103/cli.cjs cal:report');
    const failure = await execFileAsync(tsx, [script, 'cal:report', '--run', root], { cwd: packageRoot })
      .catch((error: unknown) => error as { readonly code: number; readonly stdout: string });
    expect(failure.code).toBe(2);
    expect(failure.stdout).toContain('cal:report requires --run, --checkout-map, --registry, --signal-table, and --config');
    expect(readdirSync(root)).toEqual([]);
  });

  it('reports materialization usage failures as one JSON object with exit 2', async () => {
    const root = tempDir();
    const failure = await execFileAsync(tsx, [script, 'cal:materialize', '--manifest', join(root, 'missing.json'), '--cache', join(root, 'cache'), '--out', join(root, 'checkout-map.json'), '--network', 'allow']).catch((error: unknown) => error as { readonly code: number; readonly stdout: string });
    expect(failure.code).toBe(2);
    expect(failure.stdout.trim().split('\n')).toHaveLength(1);
    expect(JSON.parse(failure.stdout)).toMatchObject({ ok: false });
    expect(failure.stdout).not.toContain(root);
  });

  it('verifies the requested manifest bytes before selection output mutation', async () => {
    const root = tempDir();
    const manifestPath = join(root, 'manifest.json');
    writeFileSync(manifestPath, JSON.stringify({ version: 'v10.3' }));
    const output = join(root, 'run');
    const failure = await execFileAsync(tsx, [script, 'select', '--manifest', manifestPath, '--expected-manifest-sha256', '0'.repeat(64), '--seed', 'fixture-seed', '--out', output], { cwd: packageRoot }).catch((error: unknown) => error as { readonly code: number; readonly stdout: string });
    expect(failure.code).toBe(2);
    expect(failure.stdout).toContain('Manifest SHA-256 does not match expected value');
    expect(() => readFileSync(join(output, 'corpus-manifest.json'))).toThrow();
  });

  it('rejects missing, mixed, partial, and reserved admission manifest sources', async () => {
    const root = tempDir();
    const manifestPath = join(root, 'manifest.json');
    writeFileSync(manifestPath, JSON.stringify({ version: 'v10.3' }));
    const expected = fileSha256(manifestPath);
    const cases = [
      [script, 'corpus:validate', '--manifest', manifestPath],
      [script, 'corpus:validate', '--manifest', manifestPath, '--expected-manifest-sha256', expected, '--root', root],
      [script, 'corpus:validate', '--root', root, '--manifest-id', 'fixture', '--manifest-ref-json', '{}'],
    ] as const;
    for (const args of cases) await expect(execFileAsync(tsx, args, { cwd: packageRoot })).rejects.toMatchObject({ code: 2 });
    const reserved = await execFileAsync(tsx, [script, 'corpus:validate', '--root', root, '--manifest-id', 'fixture', '--manifest-ref-json', '{}', '--expected-manifest-sha256', expected], { cwd: packageRoot }).catch((error: unknown) => error as { readonly code: number; readonly stdout: string });
    expect(reserved.code).toBe(2);
    expect(reserved.stdout).toContain('Admission manifest sources are reserved until Task 9B');
  });

  it('rejects a future flat-manifest method before any materialization output', async () => {
    const root = tempDir();
    const manifestPath = join(root, 'manifest.json');
    writeFileSync(manifestPath, JSON.stringify({ version: 'v10.3', methodVersion: 'v10.3.2' }));
    const output = join(root, 'checkout-map.json');
    const failure = await execFileAsync(tsx, [script, 'cal:materialize', '--manifest', manifestPath, '--expected-manifest-sha256', fileSha256(manifestPath), '--run-id', 'fixture', '--cache', join(root, 'cache'), '--out', output], { cwd: packageRoot }).catch((error: unknown) => error as { readonly code: number; readonly stdout: string });
    expect(failure.code).toBe(2);
    expect(failure.stdout).toContain('Flat manifest source only supports v10.3.0 and v10.3.1');
    expect(() => readFileSync(output)).toThrow();
  });

  it('materializes a pinned release archive offline and emits one machine-readable result', async () => {
    const root = tempDir();
    const cache = join(root, 'cache');
    mkdirSync(cache, { mode: 0o700 });
    chmodSync(cache, 0o700);
    const source = 'export const release = true;\n';
    const zip = buildRawZipFixture({ entries: [
      { name: 'pkg/' },
      { name: 'pkg/src/' },
      { name: 'pkg/src/sample.ts', data: Buffer.from(source) },
    ] });
    const binaryAssetSha256 = createHash('sha256').update(zip.bytes).digest('hex');
    const archiveSha256 = binaryAssetSha256;
    writeFileSync(join(cache, `${archiveSha256}.zip`), zip.bytes, { mode: 0o600 });
    const generatedAt = '2026-07-12T00:00:00Z';
    const commitSha = 'a'.repeat(40);
    const manifest = {
      version: 'v10.3' as const,
      generatedAt,
      methodVersion: 'v10.3.1',
      leakageReview: { protocolVersion: 'leakage-v1', reviewedAt: generatedAt, reviewerIds: ['fixture-reviewer'], noCrossPolarityFamilyOrCluster: true },
      repositories: [{ repositoryId: 'release-repo', familyId: 'release-family', originUrl: 'https://example.test/release-repo', commitSha, acquiredAt: generatedAt, license: 'MIT', materialization: { kind: 'release_archive', assetUrl: 'https://example.test/releases/release.zip', assetSha256: archiveSha256, assetBytes: zip.bytes.byteLength, archiveFormat: 'zip', rootPrefix: 'pkg', extractionPolicy: 'safe-zip-v1' } }],
      files: [{ sourceId: `release-repo@${commitSha}+asset-${archiveSha256}:src/sample.ts`, repositoryId: 'release-repo', familyId: 'release-family', normalizedPath: 'src/sample.ts', contentSha256: sha256(source), language: 'typescript', stratum: 'production', clusterId: 'release-cluster', label: 'verified_ai', tier: 'gold', split: 'test', evidence: { kind: 'manual_protocol', reference: 'https://example.test/evidence', protocolId: 'fixture' } }],
    };
    const manifestPath = join(root, 'release-manifest.json');
    const outputPath = join(root, 'release-checkout-map.json');
    writeFileSync(manifestPath, JSON.stringify(manifest));
    const { stdout } = await execFileAsync(tsx, [script, 'cal:materialize', '--manifest', manifestPath, '--expected-manifest-sha256', fileSha256(manifestPath), '--run-id', 'release-fixture', '--cache', cache, '--out', outputPath], { cwd: packageRoot });
    expect(stdout.trim().split('\n')).toHaveLength(1);
    expect(stdout).not.toContain(root);
    expect(JSON.parse(stdout)).toMatchObject({ ok: true, stage: 'materialize', runId: 'release-fixture', repositories: 1, releaseArchives: 1, files: 1 });
    expect(isCalibrationCheckoutMapV103(JSON.parse(readFileSync(outputPath, 'utf8')))).toBe(true);
  });

  it('selects and scans a reviewed, path-free two-polarity corpus from local Git checkouts', async () => {
    const root = tempDir();
    const aiSource = 'export const generatedAnswer = 42;\n';
    const humanSource = 'export function humanAnswer(): number { return 42; }\n';
    const ai = await committedCheckout(root, 'ai-checkout', aiSource);
    const human = await committedCheckout(root, 'human-checkout', humanSource);
    const generatedAt = '2026-07-10T00:00:00Z';
    const manifest = {
      version: 'v10.3' as const,
      generatedAt,
      methodVersion: 'v10.3.0',
      leakageReview: { protocolVersion: 'leakage-v1', reviewedAt: generatedAt, reviewerIds: ['fixture-reviewer'], noCrossPolarityFamilyOrCluster: true },
      repositories: [
        { repositoryId: 'ai-repo', familyId: 'ai-family', originUrl: 'https://example.test/ai-repo', commitSha: ai.commitSha, acquiredAt: generatedAt, license: 'MIT' },
        { repositoryId: 'human-repo', familyId: 'human-family', originUrl: 'https://example.test/human-repo', commitSha: human.commitSha, acquiredAt: generatedAt, license: 'MIT' },
      ],
      files: [
        { sourceId: `ai-repo@${ai.commitSha}:src/sample.ts`, repositoryId: 'ai-repo', familyId: 'ai-family', normalizedPath: 'src/sample.ts', contentSha256: sha256(aiSource), language: 'typescript', stratum: 'production', clusterId: 'ai-cluster', label: 'verified_ai', tier: 'gold', split: 'test', evidence: { kind: 'generator_record', reference: 'https://example.test/ai-evidence', model: 'fixture-model', promptTaskId: 'fixture-ai', generatedAt, humanEditStatus: 'none' } },
        { sourceId: `human-repo@${human.commitSha}:src/sample.ts`, repositoryId: 'human-repo', familyId: 'human-family', normalizedPath: 'src/sample.ts', contentSha256: sha256(humanSource), language: 'typescript', stratum: 'production', clusterId: 'human-cluster', label: 'verified_human', tier: 'gold', split: 'test', evidence: { kind: 'manual_protocol', reference: 'https://example.test/human-evidence', protocolId: 'fixture-human' } },
      ],
    };
    const manifestPath = join(root, 'corpus-manifest.json');
    const runDirectory = join(root, 'run');
    const registryPath = join(root, 'registry.json');
    const signalTablePath = join(root, 'signal-table.json');
    const configPath = join(root, 'calibration-config.json');
    const registryBytes = '{"rules":["fixture-rule"]}\n';
    const signalTableBytes = '{"signals":["fixture-signal"]}\n';
    const configBytes = '{"threshold":0.5}\n';
    writeFileSync(manifestPath, JSON.stringify(manifest));
    writeFileSync(registryPath, registryBytes);
    writeFileSync(signalTablePath, signalTableBytes);
    writeFileSync(configPath, configBytes);
    const inputFlags = ['--registry', registryPath, '--signal-table', signalTablePath, '--config', configPath];

    await expect(execFileAsync(tsx, [script, 'select', '--manifest', manifestPath, '--expected-manifest-sha256', fileSha256(manifestPath), '--seed', 'fixture-seed', '--out', runDirectory], { cwd: packageRoot })).resolves.toMatchObject({});

    const records = readFileSync(join(runDirectory, 'corpus-selection.jsonl'), 'utf8').trimEnd().split('\n').map((line) => JSON.parse(line) as Record<string, string>);
    const aiRecord = records.find((record) => record.label === 'verified_ai')!;
    const humanRecord = records.find((record) => record.label === 'verified_human')!;
    expect(records).toHaveLength(2);
    expect(records.every((record) => record.status === 'selected')).toBe(true);

    const checkoutMap = {
      version: 'v10.3' as const,
      runId: 'fixture-v103',
      entries: [
        { repositoryId: 'ai-repo', commitSha: ai.commitSha, checkoutPath: ai.checkoutPath },
        { repositoryId: 'human-repo', commitSha: human.commitSha, checkoutPath: human.checkoutPath },
      ],
    };
    const runManifest = createV103RunManifest({
      runId: 'fixture-v103', createdAt: generatedAt, git: { sha: 'a'.repeat(40), dirty: false }, package: { name: 'slopbrick', version: '0.44.0' }, runtime: { node: process.version, pnpm: 'fixture', platform: process.platform, arch: process.arch }, schemaVersion: 'v10.3', methodVersion: 'v10.3.0',
      inputHashes: { registrySha256: fileSha256(registryPath), signalTableSha256: fileSha256(signalTablePath), configSha256: fileSha256(configPath), corpusManifestSha256: canonicalCorpusManifestSha256(manifest), selectionSha256: canonicalSha256(records) },
      selection: { seed: 'fixture-seed', policy: { eligibleLabels: ['verified_ai', 'verified_human'], eligibleTiers: ['gold'], eligibleStrata: ['example', 'generated', 'minified', 'other', 'production', 'test', 'vendor'], maxPerStratum: Number.MAX_SAFE_INTEGER } },
      expected: { fileIdsByPolarity: { verified_ai: [aiRecord.fileId!], verified_human: [humanRecord.fileId!] }, chunkIdsByPolarity: { verified_ai: [chunkId(aiRecord.fileId!)], verified_human: [chunkId(humanRecord.fileId!)] } },
      settings: { includeRuleIds: [], excludeRuleIds: [], maxFileBytes: 1_000_000, chunkSize: 1, chunkTimeoutMs: 30_000, retryTimeoutMs: 60_000, workerCount: 1 }, commandArgs: ['cal:scan', '--run=fixture-v103'],
    }, checkoutMap);
    writeFileSync(join(runDirectory, 'run-manifest.json'), JSON.stringify(runManifest));
    const checkoutMapPath = join(root, 'checkout-map.json');
    writeFileSync(checkoutMapPath, JSON.stringify(checkoutMap));

    writeFileSync(registryPath, `${registryBytes}tampered`);
    await expect(execFileAsync(tsx, [script, 'scan', '--run', runDirectory, '--checkout-map', checkoutMapPath, ...inputFlags], { cwd: packageRoot })).rejects.toMatchObject({ code: 2 });
    for (const artifact of ['observations.jsonl', 'failures.jsonl', 'coverage.json']) {
      expect(() => readFileSync(join(runDirectory, artifact), 'utf8')).toThrow();
    }
    expect(() => readdirSync(join(runDirectory, 'chunks'))).toThrow();
    writeFileSync(registryPath, registryBytes);

    rmSync(signalTablePath);
    await expect(execFileAsync(tsx, [script, 'scan', '--run', runDirectory, '--checkout-map', checkoutMapPath, ...inputFlags], { cwd: packageRoot })).rejects.toMatchObject({ code: 2 });
    for (const artifact of ['observations.jsonl', 'failures.jsonl', 'coverage.json']) {
      expect(() => readFileSync(join(runDirectory, artifact), 'utf8')).toThrow();
    }
    expect(() => readdirSync(join(runDirectory, 'chunks'))).toThrow();
    writeFileSync(signalTablePath, signalTableBytes);

    writeFileSync(join(runDirectory, 'run-manifest.json'), JSON.stringify({
      ...runManifest,
      selection: { ...runManifest.selection, seed: 'forged-seed' },
    }));
    await expect(execFileAsync(tsx, [script, 'scan', '--run', runDirectory, '--checkout-map', checkoutMapPath, ...inputFlags], { cwd: packageRoot })).rejects.toMatchObject({ code: 2 });
    expect(() => readFileSync(join(runDirectory, 'observations.jsonl'), 'utf8')).toThrow();

    writeFileSync(join(runDirectory, 'run-manifest.json'), JSON.stringify({
      ...runManifest,
      selection: { ...runManifest.selection, policy: { ...runManifest.selection.policy, maxPerStratum: 1 } },
    }));
    await expect(execFileAsync(tsx, [script, 'scan', '--run', runDirectory, '--checkout-map', checkoutMapPath, ...inputFlags], { cwd: packageRoot })).rejects.toMatchObject({ code: 2 });
    expect(() => readFileSync(join(runDirectory, 'observations.jsonl'), 'utf8')).toThrow();

    writeFileSync(join(runDirectory, 'run-manifest.json'), JSON.stringify({
      ...runManifest,
      expected: { ...runManifest.expected, fileIdsByPolarity: { ...runManifest.expected.fileIdsByPolarity, verified_ai: ['sbf_wrong'] } },
    }));
    await expect(execFileAsync(tsx, [script, 'scan', '--run', runDirectory, '--checkout-map', checkoutMapPath, ...inputFlags], { cwd: packageRoot })).rejects.toMatchObject({ code: 2 });
    expect(() => readFileSync(join(runDirectory, 'observations.jsonl'), 'utf8')).toThrow();
    writeFileSync(join(runDirectory, 'run-manifest.json'), JSON.stringify({
      ...runManifest,
      expected: { ...runManifest.expected, chunkIdsByPolarity: { ...runManifest.expected.chunkIdsByPolarity, verified_ai: ['0'.repeat(64)] } },
    }));
    await expect(execFileAsync(tsx, [script, 'scan', '--run', runDirectory, '--checkout-map', checkoutMapPath, ...inputFlags], { cwd: packageRoot })).rejects.toMatchObject({ code: 2 });
    expect(() => readFileSync(join(runDirectory, 'observations.jsonl'), 'utf8')).toThrow();
    writeFileSync(join(runDirectory, 'run-manifest.json'), JSON.stringify(runManifest));

    const { stdout } = await execFileAsync(tsx, [script, 'scan', '--run', runDirectory, '--checkout-map', checkoutMapPath, ...inputFlags], { cwd: packageRoot });
    expect(JSON.parse(stdout)).toMatchObject({ ok: true, stage: 'scan', requested: 2, successful: 2, failed: 0, diagnosticOnly: false, gateFailures: [] });
    expect(JSON.parse(readFileSync(join(runDirectory, 'coverage.json'), 'utf8'))).toMatchObject({ requested: 2, successful: 2, failed: 0 });

    for (const artifact of ['corpus-manifest.json', 'corpus-selection.jsonl', 'selection-ledger.json', 'run-manifest.json', 'observations.jsonl', 'failures.jsonl', 'coverage.json']) {
      expect(readFileSync(join(runDirectory, artifact), 'utf8')).not.toContain(root);
    }
    expect(JSON.stringify(runManifest)).not.toContain(root);
    expect(readFileSync(join(root, 'checkout-map.json'), 'utf8')).toContain(root);

    const coverageBeforeReport = readFileSync(join(runDirectory, 'coverage.json'), 'utf8');
    writeFileSync(join(runDirectory, 'coverage.json'), `${JSON.stringify({ version: 'v10.3', runId: 'fixture-v103', requested: 3 })}\n`);
    const invalidReport = await execFileAsync(tsx, [script, 'cal:report', '--run', runDirectory, '--checkout-map', checkoutMapPath, ...inputFlags], { cwd: packageRoot })
      .catch((error: unknown) => error as { readonly code: number; readonly stdout: string });
    expect(invalidReport.code).toBe(2);
    expect(invalidReport.stdout).toContain('Scan artifact verification failed');
    for (const artifact of ['rule-metrics.json', 'language-metrics.json', 'report.md', 'logs/report.jsonl']) {
      expect(() => readFileSync(join(runDirectory, artifact))).toThrow();
    }
    writeFileSync(join(runDirectory, 'coverage.json'), coverageBeforeReport);

    const report = await execFileAsync(tsx, [script, 'cal:report', '--run', runDirectory, '--checkout-map', checkoutMapPath, ...inputFlags], { cwd: packageRoot })
      .catch((error: unknown) => error as { readonly code: number; readonly stdout: string });
    expect(report.code).toBe(1);
    expect(JSON.parse(report.stdout)).toMatchObject({ ok: true, stage: 'report', status: 'unavailable', reason: 'eligible-cohort-unavailable' });
    for (const artifact of ['rule-metrics.json', 'language-metrics.json', 'report.md', 'logs/report.jsonl']) {
      expect(readFileSync(join(runDirectory, artifact), 'utf8')).not.toContain(root);
    }
    expect(isV103UnavailableArtifact(JSON.parse(readFileSync(join(runDirectory, 'rule-metrics.json'), 'utf8')))).toBe(true);
    expect(isV103UnavailableArtifact(JSON.parse(readFileSync(join(runDirectory, 'language-metrics.json'), 'utf8')))).toBe(true);
    expect(isV103UnavailableArtifact(JSON.parse(readFileSync(join(runDirectory, 'logs/report.jsonl'), 'utf8')))).toBe(true);
    expect(readFileSync(join(runDirectory, 'report.md'), 'utf8')).toContain('Status: `unavailable`');

    const reportBeforeRefusal = readFileSync(join(runDirectory, 'report.md'), 'utf8');
    const reportRerun = await execFileAsync(tsx, [script, 'cal:report', '--run', runDirectory, '--checkout-map', checkoutMapPath, ...inputFlags], { cwd: packageRoot })
      .catch((error: unknown) => error as { readonly code: number; readonly stdout: string });
    expect(reportRerun.code).toBe(2);
    expect(reportRerun.stdout).toContain('Refusing to overwrite existing scan artifacts');
    expect(readFileSync(join(runDirectory, 'report.md'), 'utf8')).toBe(reportBeforeRefusal);

    const coverageBeforeResumeRefusal = readFileSync(join(runDirectory, 'coverage.json'), 'utf8');
    const finalArtifactsResume = await execFileAsync(tsx, [script, 'scan', '--resume', '--run', runDirectory, '--checkout-map', checkoutMapPath, ...inputFlags], { cwd: packageRoot }).catch((error: unknown) => error as { readonly code: number; readonly stdout: string });
    expect(finalArtifactsResume.code).toBe(2);
    expect(finalArtifactsResume.stdout).toContain('Refusing to overwrite existing scan artifacts');
    expect(readFileSync(join(runDirectory, 'coverage.json'), 'utf8')).toBe(coverageBeforeResumeRefusal);

    for (const artifact of ['observations.jsonl', 'failures.jsonl', 'coverage.json']) rmSync(join(runDirectory, artifact));
    writeFileSync(join(runDirectory, 'run-manifest.json'), JSON.stringify({ ...runManifest, git: { ...runManifest.git, sha: 'b'.repeat(40) } }));
    const staleHashResume = await execFileAsync(tsx, [script, 'scan', '--resume', '--run', runDirectory, '--checkout-map', checkoutMapPath, ...inputFlags], { cwd: packageRoot }).catch((error: unknown) => error as { readonly code: number; readonly stdout: string });
    expect(staleHashResume.code).toBe(2);
    expect(staleHashResume.stdout).toContain('Completed attempt mismatch');
    for (const artifact of ['observations.jsonl', 'failures.jsonl', 'coverage.json']) expect(() => readFileSync(join(runDirectory, artifact))).toThrow();
    writeFileSync(join(runDirectory, 'run-manifest.json'), JSON.stringify(runManifest));
    rmSync(join(runDirectory, 'chunks'), { recursive: true, force: true });
    const missingChunksResume = await execFileAsync(tsx, [script, 'scan', '--resume', '--run', runDirectory, '--checkout-map', checkoutMapPath, ...inputFlags], { cwd: packageRoot }).catch((error: unknown) => error as { readonly code: number; readonly stdout: string });
    expect(missingChunksResume.code).toBe(2);
    expect(missingChunksResume.stdout).toContain('Resume requested but no completed chunks exist');
    for (const artifact of ['observations.jsonl', 'failures.jsonl', 'coverage.json']) expect(() => readFileSync(join(runDirectory, artifact))).toThrow();
  });
});
