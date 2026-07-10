import { createHash } from 'node:crypto';
import { execFile } from 'node:child_process';
import { afterEach, describe, expect, it } from 'vitest';
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

import { createV103RunManifest } from '../../src/calibration/v103/run-manifest';
import { canonicalCorpusManifestSha256, canonicalSha256 } from '../../src/calibration/v103/canonical';

const execFileAsync = promisify(execFile);
const tempDirs: string[] = [];
const packageRoot = fileURLToPath(new URL('../..', import.meta.url));
const script = join(packageRoot, 'scripts', 'cal', 'v103.ts');
const tsx = join(packageRoot, 'node_modules', '.bin', 'tsx');

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
    writeFileSync(manifestPath, JSON.stringify(manifest));

    await expect(execFileAsync(tsx, [script, 'select', '--manifest', manifestPath, '--seed', 'fixture-seed', '--out', runDirectory], { cwd: packageRoot })).resolves.toMatchObject({});

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
      inputHashes: { registrySha256: '1'.repeat(64), signalTableSha256: '2'.repeat(64), configSha256: '3'.repeat(64), corpusManifestSha256: canonicalCorpusManifestSha256(manifest), selectionSha256: canonicalSha256(records) },
      selection: { seed: 'fixture-seed', policy: { eligibleLabels: ['verified_ai', 'verified_human'], eligibleTiers: ['gold'], eligibleStrata: ['example', 'generated', 'minified', 'other', 'production', 'test', 'vendor'], maxPerStratum: Number.MAX_SAFE_INTEGER } },
      expected: { fileIdsByPolarity: { verified_ai: [aiRecord.fileId!], verified_human: [humanRecord.fileId!] }, chunkIdsByPolarity: { verified_ai: [chunkId(aiRecord.fileId!)], verified_human: [chunkId(humanRecord.fileId!)] } },
      settings: { includeRuleIds: [], excludeRuleIds: [], maxFileBytes: 1_000_000, chunkSize: 1, chunkTimeoutMs: 30_000, retryTimeoutMs: 60_000, workerCount: 1 }, commandArgs: ['cal:scan', '--run=fixture-v103'],
    }, checkoutMap);
    writeFileSync(join(runDirectory, 'run-manifest.json'), JSON.stringify(runManifest));
    const checkoutMapPath = join(root, 'checkout-map.json');
    writeFileSync(checkoutMapPath, JSON.stringify(checkoutMap));

    writeFileSync(join(runDirectory, 'run-manifest.json'), JSON.stringify({
      ...runManifest,
      selection: { ...runManifest.selection, seed: 'forged-seed' },
    }));
    await expect(execFileAsync(tsx, [script, 'scan', '--run', runDirectory, '--checkout-map', checkoutMapPath], { cwd: packageRoot })).rejects.toMatchObject({ code: 2 });
    expect(() => readFileSync(join(runDirectory, 'observations.jsonl'), 'utf8')).toThrow();

    writeFileSync(join(runDirectory, 'run-manifest.json'), JSON.stringify({
      ...runManifest,
      selection: { ...runManifest.selection, policy: { ...runManifest.selection.policy, maxPerStratum: 1 } },
    }));
    await expect(execFileAsync(tsx, [script, 'scan', '--run', runDirectory, '--checkout-map', checkoutMapPath], { cwd: packageRoot })).rejects.toMatchObject({ code: 2 });
    expect(() => readFileSync(join(runDirectory, 'observations.jsonl'), 'utf8')).toThrow();

    writeFileSync(join(runDirectory, 'run-manifest.json'), JSON.stringify({
      ...runManifest,
      expected: { ...runManifest.expected, fileIdsByPolarity: { ...runManifest.expected.fileIdsByPolarity, verified_ai: ['sbf_wrong'] } },
    }));
    await expect(execFileAsync(tsx, [script, 'scan', '--run', runDirectory, '--checkout-map', checkoutMapPath], { cwd: packageRoot })).rejects.toMatchObject({ code: 2 });
    expect(() => readFileSync(join(runDirectory, 'observations.jsonl'), 'utf8')).toThrow();
    writeFileSync(join(runDirectory, 'run-manifest.json'), JSON.stringify({
      ...runManifest,
      expected: { ...runManifest.expected, chunkIdsByPolarity: { ...runManifest.expected.chunkIdsByPolarity, verified_ai: ['0'.repeat(64)] } },
    }));
    await expect(execFileAsync(tsx, [script, 'scan', '--run', runDirectory, '--checkout-map', checkoutMapPath], { cwd: packageRoot })).rejects.toMatchObject({ code: 2 });
    expect(() => readFileSync(join(runDirectory, 'observations.jsonl'), 'utf8')).toThrow();
    writeFileSync(join(runDirectory, 'run-manifest.json'), JSON.stringify(runManifest));

    const { stdout } = await execFileAsync(tsx, [script, 'scan', '--run', runDirectory, '--checkout-map', checkoutMapPath], { cwd: packageRoot });
    expect(JSON.parse(stdout)).toMatchObject({ ok: true, stage: 'scan', requested: 2, successful: 2, failed: 0, diagnosticOnly: false, gateFailures: [] });
    expect(JSON.parse(readFileSync(join(runDirectory, 'coverage.json'), 'utf8'))).toMatchObject({ requested: 2, successful: 2, failed: 0 });

    for (const artifact of ['corpus-manifest.json', 'corpus-selection.jsonl', 'selection-ledger.json', 'run-manifest.json', 'observations.jsonl', 'failures.jsonl', 'coverage.json']) {
      expect(readFileSync(join(runDirectory, artifact), 'utf8')).not.toContain(root);
    }
    expect(JSON.stringify(runManifest)).not.toContain(root);
    expect(readFileSync(join(root, 'checkout-map.json'), 'utf8')).toContain(root);
  });
});
