import { afterEach, describe, expect, it } from 'vitest';
import { execFile } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { isCalibrationRunManifestV103 } from '@usebrick/core';
import { canonicalJson } from '../../src/calibration/v103/canonical';
import { materializeV103Scan } from '../../src/calibration/v103/scan-run';
import { buildSelection } from '../../src/calibration/v103/selection';

const execFileAsync = promisify(execFile);
const tempDirs: string[] = [];

afterEach(() => {
  while (tempDirs.length > 0) rmSync(tempDirs.pop()!, { recursive: true, force: true });
});

function tempDir(): string {
  const dir = mkdtempSync(join(tmpdir(), 'slopbrick-v103-init-'));
  tempDirs.push(dir);
  return dir;
}

function sha256(path: string): string {
  return createHash('sha256').update(readFileSync(path)).digest('hex');
}

function fixtureManifest() {
  const repositories = [
    ['ai-repo', 'ai-family', 'a'],
    ['human-repo', 'human-family', 'b'],
    ['mixed-repo', 'mixed-family', 'c'],
    ['quarantine-repo', 'quarantine-family', 'd'],
  ].map(([repositoryId, familyId, character]) => ({
    repositoryId,
    familyId,
    originUrl: `https://example.test/${repositoryId}`,
    commitSha: character!.repeat(40),
    acquiredAt: '2026-07-10T00:00:00Z',
    license: 'MIT',
  }));
  return {
    version: 'v10.3',
    generatedAt: '2026-07-10T00:00:00Z',
    methodVersion: 'v10.3.0',
    leakageReview: { protocolVersion: 'leakage-v1', reviewedAt: '2026-07-10T00:00:00Z', reviewerIds: ['reviewer-a'], noCrossPolarityFamilyOrCluster: true },
    repositories,
    files: [
      { sourceId: `ai-repo@${'a'.repeat(40)}:src/main.ts`, repositoryId: 'ai-repo', familyId: 'ai-family', normalizedPath: 'src/main.ts', contentSha256: '1'.repeat(64), language: 'typescript', stratum: 'production', clusterId: 'ai-cluster', label: 'verified_ai', tier: 'gold', split: 'train', evidence: { kind: 'generator_record', reference: 'https://example.test/ai-evidence', model: 'test-model', promptTaskId: 'task-1', generatedAt: '2026-07-10T00:00:00Z', humanEditStatus: 'none' } },
      { sourceId: `human-repo@${'b'.repeat(40)}:lib/main.ts`, repositoryId: 'human-repo', familyId: 'human-family', normalizedPath: 'lib/main.ts', contentSha256: '2'.repeat(64), language: 'typescript', stratum: 'production', clusterId: 'human-cluster', label: 'verified_human', tier: 'gold', split: 'train', evidence: { kind: 'manual_protocol', reference: 'https://example.test/human-evidence', protocolId: 'protocol-1' } },
      { sourceId: `mixed-repo@${'c'.repeat(40)}:test/mixed.ts`, repositoryId: 'mixed-repo', familyId: 'mixed-family', normalizedPath: 'test/mixed.ts', contentSha256: '3'.repeat(64), language: 'typescript', stratum: 'test', clusterId: 'mixed-cluster', label: 'mixed', tier: 'gold', split: 'mixed_evaluation', evidence: { kind: 'manual_protocol', reference: 'https://example.test/mixed-evidence', protocolId: 'protocol-1' } },
      { sourceId: `quarantine-repo@${'d'.repeat(40)}:src/unproven.ts`, repositoryId: 'quarantine-repo', familyId: 'quarantine-family', normalizedPath: 'src/unproven.ts', contentSha256: '4'.repeat(64), language: 'typescript', stratum: 'production', clusterId: 'quarantine-cluster', label: 'quarantine', tier: 'quarantine', split: 'excluded', exclusionReason: 'unproven provenance', evidence: { kind: 'manual_protocol', reference: 'https://example.test/quarantine-evidence', protocolId: 'protocol-1' } },
    ],
  };
}

describe('v10.3 run initialization and artifact verification', () => {
  it('materializes a path-free run manifest once and verifies scan artifacts fail closed', async () => {
    const root = tempDir();
    const manifestPath = join(root, 'manifest.json');
    const runDirectory = join(root, 'run');
    const checkoutRoot = join(root, 'checkouts');
    const checkoutMapPath = join(root, 'checkout-map.json');
    const draftPath = join(root, 'run-draft.json');
    const registryPath = join(root, 'registry.json');
    const signalTablePath = join(root, 'signal-table.json');
    const configPath = join(root, 'calibration-config.json');
    const registryBytes = '{"rules":["rule-a"]}\n';
    const signalTableBytes = '{"signals":["signal-a"]}\n';
    const configBytes = '{"threshold":0.5}\n';
    writeFileSync(manifestPath, JSON.stringify(fixtureManifest()));
    writeFileSync(registryPath, registryBytes);
    writeFileSync(signalTablePath, signalTableBytes);
    writeFileSync(configPath, configBytes);
    const manifest = fixtureManifest();
    const checkoutMap = {
      version: 'v10.3',
      runId: 'init-run',
      entries: manifest.repositories.map((repository, index) => ({
        repositoryId: repository.repositoryId,
        commitSha: repository.commitSha,
        checkoutPath: join(checkoutRoot, `${index}-${repository.repositoryId}`),
      })),
    };
    writeFileSync(checkoutMapPath, JSON.stringify(checkoutMap));
    writeFileSync(draftPath, JSON.stringify({
      runId: 'init-run',
      createdAt: '2026-07-10T00:00:00Z',
      git: { sha: 'e'.repeat(40), dirty: false },
      package: { name: 'slopbrick', version: '0.44.0' },
      runtime: { node: process.version, pnpm: '10.12.1', platform: process.platform, arch: process.arch },
      schemaVersion: 'v10.3',
      methodVersion: 'v10.3.0',
      inputHashes: { registrySha256: sha256(registryPath), signalTableSha256: sha256(signalTablePath), configSha256: sha256(configPath), corpusManifestSha256: '4'.repeat(64), selectionSha256: '5'.repeat(64) },
      settings: { includeRuleIds: [], excludeRuleIds: [], maxFileBytes: 1_000_000, chunkSize: 1, chunkTimeoutMs: 1_000, retryTimeoutMs: 2_000, workerCount: 1 },
      commandArgs: ['cal:scan', '--run', 'init-run'],
    }));
    const script = join(process.cwd(), 'scripts', 'cal', 'v103.ts');
    const tsx = join(process.cwd(), 'tests', 'helpers', 'tsx-runner.cjs');
    await execFileAsync(tsx, [script, 'select', '--manifest', manifestPath, '--expected-manifest-sha256', sha256(manifestPath), '--seed', 'init-seed', '--out', runDirectory]);
    const inputFlags = ['--registry', registryPath, '--signal-table', signalTablePath, '--config', configPath];
    const init = await execFileAsync(tsx, [script, 'run:init', '--run', runDirectory, '--draft', draftPath, '--checkout-map', checkoutMapPath, ...inputFlags]);
    const initResult = JSON.parse(init.stdout) as { ok: boolean; stage: string; manifestSha256: string };
    expect(initResult).toMatchObject({ ok: true, stage: 'run:init' });
    const runManifestText = readFileSync(join(runDirectory, 'run-manifest.json'), 'utf8');
    const runManifest = JSON.parse(runManifestText) as Record<string, unknown>;
    expect(isCalibrationRunManifestV103(runManifest)).toBe(true);
    expect(runManifestText).not.toContain(root);
    expect(runManifest).toMatchObject({ runId: 'init-run', selection: { seed: 'init-seed' } });
    expect((runManifest.expected as Record<string, unknown>).fileIdsByPolarity).toMatchObject({ verified_ai: expect.any(Array), verified_human: expect.any(Array) });
    expect(runManifest.inputHashes).toMatchObject({ registrySha256: sha256(registryPath), signalTableSha256: sha256(signalTablePath), configSha256: sha256(configPath) });

    await expect(execFileAsync(tsx, [script, 'verify', '--run', runDirectory, '--stage', 'selection'])).resolves.toMatchObject({});
    const records = buildSelection(manifest, { seed: 'init-seed' }).records;
    const selected = records.filter((record) => record.status === 'selected');
    const artifacts = materializeV103Scan('init-run', records, selected.map((record) => ({ fileId: record.fileId, status: 'success_zero' as const })));
    writeFileSync(join(runDirectory, 'observations.jsonl'), artifacts.observations.map((observation) => `${canonicalJson(observation)}\n`).join(''));
    writeFileSync(join(runDirectory, 'failures.jsonl'), artifacts.failures.map((failure) => `${canonicalJson(failure)}\n`).join(''));
    writeFileSync(join(runDirectory, 'coverage.json'), `${canonicalJson(artifacts.coverage)}\n`);
    const verified = await execFileAsync(tsx, [script, 'verify', '--run', runDirectory, '--stage', 'scan', '--checkout-map', checkoutMapPath, ...inputFlags]);
    expect(JSON.parse(verified.stdout)).toMatchObject({ ok: true, stage: 'scan', requested: selected.length, successful: selected.length, failed: 0, excluded: 0 });

    const coverageBeforeInputTamper = readFileSync(join(runDirectory, 'coverage.json'), 'utf8');
    for (const [flag, path, original] of [
      ['--registry', registryPath, registryBytes],
      ['--signal-table', signalTablePath, signalTableBytes],
      ['--config', configPath, configBytes],
    ] as const) {
      writeFileSync(path, `${original}tampered`);
      await expect(execFileAsync(tsx, [script, 'verify', '--run', runDirectory, '--stage', 'scan', '--checkout-map', checkoutMapPath, ...inputFlags])).rejects.toMatchObject({ code: 2 });
      expect(readFileSync(join(runDirectory, 'coverage.json'), 'utf8')).toBe(coverageBeforeInputTamper);
      writeFileSync(path, original);
      expect(flag).toMatch(/^--(registry|signal-table|config)$/);
    }

    writeFileSync(join(runDirectory, 'coverage.json'), `${canonicalJson({ ...artifacts.coverage, requested: selected.length + 1 })}\n`);
    await expect(execFileAsync(tsx, [script, 'verify', '--run', runDirectory, '--stage', 'scan', '--checkout-map', checkoutMapPath, ...inputFlags])).rejects.toMatchObject({ code: 2 });
    const beforeRetry = readFileSync(join(runDirectory, 'run-manifest.json'), 'utf8');
    await expect(execFileAsync(tsx, [script, 'run:init', '--run', runDirectory, '--draft', draftPath, '--checkout-map', checkoutMapPath, ...inputFlags])).rejects.toMatchObject({ code: 2 });
    expect(readFileSync(join(runDirectory, 'run-manifest.json'), 'utf8')).toBe(beforeRetry);

    const tamperedDraftPath = join(root, 'tampered-run-draft.json');
    const tamperedDraft = JSON.parse(readFileSync(draftPath, 'utf8')) as Record<string, unknown>;
    tamperedDraft.inputHashes = { ...(tamperedDraft.inputHashes as Record<string, unknown>), registrySha256: 'f'.repeat(64) };
    writeFileSync(tamperedDraftPath, JSON.stringify(tamperedDraft));
    const tamperedRunDirectory = join(root, 'tampered-run');
    await execFileAsync(tsx, [script, 'select', '--manifest', manifestPath, '--expected-manifest-sha256', sha256(manifestPath), '--seed', 'tampered-seed', '--out', tamperedRunDirectory]);
    await expect(execFileAsync(tsx, [script, 'run:init', '--run', tamperedRunDirectory, '--draft', tamperedDraftPath, '--checkout-map', checkoutMapPath, ...inputFlags])).rejects.toMatchObject({ code: 2 });
    expect(() => readFileSync(join(tamperedRunDirectory, 'run-manifest.json'))).toThrow();

    const missingRunDirectory = join(root, 'missing-run');
    await execFileAsync(tsx, [script, 'select', '--manifest', manifestPath, '--expected-manifest-sha256', sha256(manifestPath), '--seed', 'missing-seed', '--out', missingRunDirectory]);
    rmSync(signalTablePath);
    await expect(execFileAsync(tsx, [script, 'run:init', '--run', missingRunDirectory, '--draft', draftPath, '--checkout-map', checkoutMapPath, ...inputFlags])).rejects.toMatchObject({ code: 2 });
    expect(() => readFileSync(join(missingRunDirectory, 'run-manifest.json'))).toThrow();
    writeFileSync(signalTablePath, signalTableBytes);
  });
});
