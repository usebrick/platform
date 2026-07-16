import { createHash } from 'node:crypto';
import { execFile } from 'node:child_process';
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { afterEach, describe, expect, it } from 'vitest';
import { isCalibrationRunManifestV103 } from '@usebrick/core';

const execFileAsync = promisify(execFile);
const packageRoot = fileURLToPath(new URL('../..', import.meta.url));
const script = join(packageRoot, 'scripts', 'cal', 'v103.ts');
const tsx = join(packageRoot, 'tests', 'helpers', 'tsx-runner.cjs');
const tempDirs: string[] = [];

afterEach(() => {
  while (tempDirs.length > 0) rmSync(tempDirs.pop()!, { recursive: true, force: true });
});

function tempDir(): string {
  const directory = mkdtempSync(join(tmpdir(), 'slopbrick-v103-cross-command-'));
  tempDirs.push(directory);
  return directory;
}

function sha256(contents: string): string {
  return createHash('sha256').update(contents, 'utf8').digest('hex');
}

function fileSha256(path: string): string {
  return createHash('sha256').update(readFileSync(path)).digest('hex');
}

async function committedCheckout(
  root: string,
  name: string,
  contents: string,
): Promise<{ readonly checkoutPath: string; readonly commitSha: string }> {
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

type CommandResult = {
  readonly code: number;
  readonly stdout: string;
  readonly stderr: string;
};

async function command(...args: string[]): Promise<CommandResult> {
  try {
    const result = await execFileAsync(tsx, [script, ...args], { cwd: packageRoot });
    return { code: 0, stdout: result.stdout, stderr: result.stderr };
  } catch (error) {
    const failure = error as { readonly code?: number; readonly stdout?: string; readonly stderr?: string };
    return {
      code: typeof failure.code === 'number' ? failure.code : 2,
      stdout: failure.stdout ?? '',
      stderr: failure.stderr ?? '',
    };
  }
}

describe('v10.3 full calibration command boundary', () => {
  it('runs select → run:init → scan → verify → cal:report with deterministic path-free artifacts', async () => {
    const root = tempDir();
    const aiSource = 'export const generatedAnswer = 42;\n';
    const humanSource = 'export function humanAnswer(): number { return 42; }\n';
    const ai = await committedCheckout(root, 'ai-checkout', aiSource);
    const human = await committedCheckout(root, 'human-checkout', humanSource);
    const generatedAt = '2026-07-13T00:00:00Z';
    const manifest = {
      version: 'v10.3' as const,
      generatedAt,
      methodVersion: 'v10.3.0',
      leakageReview: {
        protocolVersion: 'leakage-v1',
        reviewedAt: generatedAt,
        reviewerIds: ['fixture-reviewer'],
        noCrossPolarityFamilyOrCluster: true,
      },
      repositories: [
        {
          repositoryId: 'ai-repo',
          familyId: 'ai-family',
          originUrl: 'https://example.test/ai-repo',
          commitSha: ai.commitSha,
          acquiredAt: generatedAt,
          license: 'MIT',
        },
        {
          repositoryId: 'human-repo',
          familyId: 'human-family',
          originUrl: 'https://example.test/human-repo',
          commitSha: human.commitSha,
          acquiredAt: generatedAt,
          license: 'MIT',
        },
      ],
      files: [
        {
          sourceId: `ai-repo@${ai.commitSha}:src/sample.ts`,
          repositoryId: 'ai-repo',
          familyId: 'ai-family',
          normalizedPath: 'src/sample.ts',
          contentSha256: sha256(aiSource),
          language: 'typescript',
          stratum: 'production',
          clusterId: 'ai-cluster',
          label: 'verified_ai',
          tier: 'gold',
          split: 'test',
          evidence: {
            kind: 'generator_record',
            reference: 'https://example.test/ai-evidence',
            model: 'fixture-model',
            promptTaskId: 'fixture-ai',
            generatedAt,
            humanEditStatus: 'none',
          },
        },
        {
          sourceId: `human-repo@${human.commitSha}:src/sample.ts`,
          repositoryId: 'human-repo',
          familyId: 'human-family',
          normalizedPath: 'src/sample.ts',
          contentSha256: sha256(humanSource),
          language: 'typescript',
          stratum: 'production',
          clusterId: 'human-cluster',
          label: 'verified_human',
          tier: 'gold',
          split: 'test',
          evidence: {
            kind: 'manual_protocol',
            reference: 'https://example.test/human-evidence',
            protocolId: 'fixture-human',
          },
        },
      ],
    };
    const manifestPath = join(root, 'corpus-manifest.json');
    const checkoutMapPath = join(root, 'checkout-map.json');
    const registryPath = join(root, 'registry.json');
    const signalTablePath = join(root, 'signal-table.json');
    const configPath = join(root, 'calibration-config.json');
    const draftPath = join(root, 'run-manifest-draft.json');
    writeFileSync(manifestPath, JSON.stringify(manifest));
    writeFileSync(registryPath, '{"rules":["fixture-rule"]}\n');
    writeFileSync(signalTablePath, '{"signals":["fixture-signal"]}\n');
    writeFileSync(configPath, '{"threshold":0.5}\n');
    const checkoutMap = {
      version: 'v10.3' as const,
      runId: 'cross-command-fixture',
      entries: [
        { repositoryId: 'ai-repo', commitSha: ai.commitSha, checkoutPath: ai.checkoutPath },
        { repositoryId: 'human-repo', commitSha: human.commitSha, checkoutPath: human.checkoutPath },
      ],
    };
    writeFileSync(checkoutMapPath, JSON.stringify(checkoutMap));
    writeFileSync(draftPath, JSON.stringify({
      version: 'v10.3',
      runId: 'cross-command-fixture',
      createdAt: generatedAt,
      git: { sha: 'c'.repeat(40), dirty: false },
      package: { name: 'slopbrick', version: '0.44.0' },
      runtime: { node: process.version, pnpm: 'fixture', platform: process.platform, arch: process.arch },
      schemaVersion: 'v10.3',
      methodVersion: 'v10.3.0',
      inputHashes: {
        registrySha256: fileSha256(registryPath),
        signalTableSha256: fileSha256(signalTablePath),
        configSha256: fileSha256(configPath),
        corpusManifestSha256: '0'.repeat(64),
        selectionSha256: '1'.repeat(64),
        checkoutMapSha256: '2'.repeat(64),
      },
      settings: {
        includeRuleIds: [],
        excludeRuleIds: [],
        maxFileBytes: 1_000_000,
        chunkSize: 1,
        chunkTimeoutMs: 30_000,
        retryTimeoutMs: 60_000,
        workerCount: 1,
      },
      commandArgs: ['cal:scan', '--run=cross-command-fixture'],
    }));
    const inputFlags = ['--registry', registryPath, '--signal-table', signalTablePath, '--config', configPath];
    const runDirectories = [join(root, 'run-a'), join(root, 'run-b')];

    for (const runDirectory of runDirectories) {
      const selected = await command(
        'select',
        '--manifest', manifestPath,
        '--expected-manifest-sha256', fileSha256(manifestPath),
        '--seed', 'cross-command-seed',
        '--out', runDirectory,
      );
      expect(selected.code, selected.stderr).toBe(0);
      expect(JSON.parse(selected.stdout)).toMatchObject({ ok: true, stage: 'selection', requested: 2, selected: 2, excluded: 0 });

      const initialized = await command(
        'run:init', '--run', runDirectory, '--draft', draftPath, '--checkout-map', checkoutMapPath, ...inputFlags,
      );
      expect(initialized.code, initialized.stderr).toBe(0);
      const runManifest = JSON.parse(readFileSync(join(runDirectory, 'run-manifest.json'), 'utf8')) as unknown;
      expect(isCalibrationRunManifestV103(runManifest)).toBe(true);
      expect(JSON.stringify(runManifest)).not.toContain(root);

      const selectionVerified = await command('verify', '--run', runDirectory, '--stage', 'selection');
      expect(selectionVerified.code, selectionVerified.stderr).toBe(0);
      expect(JSON.parse(selectionVerified.stdout)).toMatchObject({ ok: true, stage: 'selection', requested: 2, selected: 2, excluded: 0 });

      const scanned = await command('scan', '--run', runDirectory, '--checkout-map', checkoutMapPath, ...inputFlags);
      expect(scanned.code, `${scanned.stderr}\n${scanned.stdout}`).toBe(0);
      expect(JSON.parse(scanned.stdout)).toMatchObject({ ok: true, stage: 'scan', requested: 2, successful: 2, failed: 0 });

      const scanArtifacts = ['observations.jsonl', 'failures.jsonl', 'coverage.json'];
      for (const artifact of scanArtifacts) {
        expect(readFileSync(join(runDirectory, artifact), 'utf8')).not.toContain(root);
      }

      // A forged coverage artifact must stop report production before any
      // derived file is created. Restore the exact bytes before continuing.
      const coveragePath = join(runDirectory, 'coverage.json');
      const coverageBeforeForgery = readFileSync(coveragePath, 'utf8');
      writeFileSync(coveragePath, `${JSON.stringify({ version: 'v10.3', runId: 'cross-command-fixture', requested: 3 })}\n`);
      const forgedReport = await command('cal:report', '--run', runDirectory, '--checkout-map', checkoutMapPath, ...inputFlags);
      expect(forgedReport.code, forgedReport.stderr).toBe(2);
      expect(forgedReport.stdout).toContain('Scan artifact verification failed');
      expect(() => readFileSync(join(runDirectory, 'rule-metrics.json'))).toThrow();
      expect(() => readFileSync(join(runDirectory, 'language-metrics.json'))).toThrow();
      expect(() => readFileSync(join(runDirectory, 'report.md'))).toThrow();
      writeFileSync(coveragePath, coverageBeforeForgery);

      const scanVerified = await command('verify', '--run', runDirectory, '--stage', 'scan', '--checkout-map', checkoutMapPath, ...inputFlags);
      expect(scanVerified.code, `${scanVerified.stderr}\n${scanVerified.stdout}`).toBe(0);
      expect(JSON.parse(scanVerified.stdout)).toMatchObject({ ok: true, stage: 'scan', requested: 2, successful: 2, failed: 0, diagnosticOnly: false, gateFailures: [] });

      const report = await command('cal:report', '--run', runDirectory, '--checkout-map', checkoutMapPath, ...inputFlags);
      expect(report.code, report.stderr).toBe(1);
      expect(JSON.parse(report.stdout)).toMatchObject({ ok: true, stage: 'report', status: 'unavailable', reason: 'eligible-cohort-unavailable' });
      expect(readFileSync(join(runDirectory, 'report.md'), 'utf8')).toContain('Status: `unavailable`');
      expect(readdirSync(join(runDirectory, 'logs'))).toEqual(['report.jsonl']);
    }

    const artifacts = [
      'corpus-manifest.json',
      'corpus-selection.jsonl',
      'selection-ledger.json',
      'run-manifest.json',
      'observations.jsonl',
      'failures.jsonl',
      'coverage.json',
      'rule-metrics.json',
      'language-metrics.json',
      'report.md',
      'logs/report.jsonl',
    ];
    for (const artifact of artifacts) {
      const first = readFileSync(join(runDirectories[0]!, artifact), 'utf8');
      const second = readFileSync(join(runDirectories[1]!, artifact), 'utf8');
      expect(first).not.toContain(root);
      expect(first).toBe(second);
    }
    expect(readFileSync(checkoutMapPath, 'utf8')).toContain(root);
  });
});
