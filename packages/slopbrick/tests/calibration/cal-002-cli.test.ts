import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { chmodSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { afterEach, describe, expect, it } from 'vitest';

import {
  CAL002_ASSIGNMENT_VERSION,
  CAL002_LOCKED_RULE_CATALOG_SHA256,
  CAL002_PROTOCOL_VERSION,
  canonicalArtifact,
} from '../../src/calibration/cal-002/contracts';

const packageRoot = fileURLToPath(new URL('../..', import.meta.url));
const script = join(packageRoot, 'scripts', 'cal', 'cal-002.ts');
const tsx = join(packageRoot, 'tests', 'helpers', 'tsx-runner.cjs');
const roots: string[] = [];
const implementationCommitSha = 'd'.repeat(40);

function sha256(value: string): string {
  return createHash('sha256').update(value, 'utf8').digest('hex');
}

function temporaryRoot(): string {
  const root = mkdtempSync(join(tmpdir(), 'cal-002-cli-'));
  roots.push(root);
  return root;
}

function writeCanonical(path: string, value: unknown): void {
  writeFileSync(path, canonicalArtifact(value).json, { mode: 0o600 });
}

function fixture(root: string): readonly string[] {
  mkdirSync(join(root, 'sources'), { recursive: true, mode: 0o700 });
  const sourceA = 'export const alpha = 1;\n';
  const sourceB = 'export const beta = 2;\n';
  writeFileSync(join(root, 'sources', 'a.ts'), sourceA, { mode: 0o600 });
  writeFileSync(join(root, 'sources', 'b.ts'), sourceB, { mode: 0o600 });
  const rows = [
    { reviewId: 'review-b', ruleId: 'layout/gap-monopoly', evidenceClass: 'contextual-quality', role: 'finding', unitId: 'unit-b' },
    { reviewId: 'review-a', ruleId: 'layout/gap-monopoly', evidenceClass: 'contextual-quality', role: 'control', unitId: 'unit-a' },
  ] as const;
  const blindedRows = [
    { reviewId: 'review-b', ruleId: 'layout/gap-monopoly', evidenceClass: 'contextual-quality', sourceIdentitySha256: sha256(sourceB), lineWindowLocator: `window:${'b'.repeat(64)}` },
    { reviewId: 'review-a', ruleId: 'layout/gap-monopoly', evidenceClass: 'contextual-quality', sourceIdentitySha256: sha256(sourceA), lineWindowLocator: `window:${'a'.repeat(64)}` },
  ] as const;
  const blindedBatchSha256 = canonicalArtifact(blindedRows).sha256;
  const withoutSelfHash = {
    version: CAL002_ASSIGNMENT_VERSION,
    protocolVersion: CAL002_PROTOCOL_VERSION,
    catalogSha256: CAL002_LOCKED_RULE_CATALOG_SHA256,
    assignmentImplementationCommitSha: 'e'.repeat(40),
    assignmentId: 'fixture-assignment',
    selectionManifestSha256: 'f'.repeat(64),
    blindedBatchSha256,
    round: 'initial',
    targetPerArm: 30,
    rows,
    blindedRows,
    admitted: false,
  } as const;
  const assignment = { ...withoutSelfHash, assignmentSha256: canonicalArtifact(withoutSelfHash).sha256 };
  writeCanonical(join(root, 'assignment.json'), assignment);
  writeCanonical(join(root, 'blinded.json'), blindedRows);
  writeCanonical(join(root, 'source-map.json'), {
    version: 'cal-002-review-source-map-v1',
    rows: [
      { reviewId: 'review-a', sourcePath: 'sources/a.ts' },
      { reviewId: 'review-b', sourcePath: 'sources/b.ts' },
    ],
  });
  return [
    script,
    'review-quality',
    '--root', root,
    '--assignment', 'assignment.json',
    '--blinded-batch', 'blinded.json',
    '--source-map', 'source-map.json',
    '--state', 'review-state.json',
    '--receipt', 'review-receipt.json',
    '--implementation-commit-sha', implementationCommitSha,
  ];
}

function run(args: readonly string[], input: string) {
  return spawnSync(tsx, args, {
    cwd: packageRoot,
    encoding: 'utf8',
    input,
    maxBuffer: 1024 * 1024,
  });
}

afterEach(() => {
  while (roots.length > 0) rmSync(roots.pop()!, { recursive: true, force: true });
});

describe('CAL-002 review-quality CLI', () => {
  it('exposes the package dispatcher script', () => {
    const packageJson = JSON.parse(readFileSync(join(packageRoot, 'package.json'), 'utf8')) as { scripts?: Record<string, string> };
    expect(packageJson.scripts?.['cal:complete']).toBe('node --import tsx scripts/cal/cal-002.ts');
  });

  it('accepts only the closed menu, saves once, and resumes at the first unlabeled row', () => {
    const invalidRoot = temporaryRoot();
    const invalid = run(fixture(invalidRoot), 'not-useful\nq\n');
    expect(invalid.status).toBe(0);
    expect(JSON.parse(invalid.stdout)).toMatchObject({ status: 'paused', labeled: 0, remaining: 2 });
    expect(invalid.stderr.match(/1 actionable-defect/g)).toHaveLength(2);
    expect((JSON.parse(readFileSync(join(invalidRoot, 'review-state.json'), 'utf8')) as { rows: unknown[] }).rows).toEqual([]);

    const root = temporaryRoot();
    const args = fixture(root);
    const first = run(args, '3\nq\n');
    expect(first.status).toBe(0);
    expect(first.stdout.trim().split('\n')).toHaveLength(1);
    expect(JSON.parse(first.stdout)).toMatchObject({
      ok: true,
      command: 'review-quality',
      status: 'paused',
      labeled: 1,
      remaining: 1,
      nextReviewId: 'review-a',
    });
    expect(first.stderr).toContain('1 actionable-defect');
    expect(first.stderr).toContain('2 useful-no-safe-fix');
    expect(first.stderr).toContain('3 not-useful');
    expect(first.stderr).toContain('4 cannot-determine');
    expect(first.stderr).toContain('q save and quit');
    expect(first.stderr.match(/1 actionable-defect/g)).toHaveLength(2);
    expect(first.stderr).toContain('export const beta = 2;');
    const pausedBytes = readFileSync(join(root, 'review-state.json'), 'utf8');
    const paused = JSON.parse(pausedBytes) as { rows: unknown[] };
    expect(paused.rows).toEqual([{ reviewId: 'review-b', label: 'not-useful' }]);
    expect(pausedBytes).toBe(canonicalArtifact(paused).json);
    expect(pausedBytes).not.toContain('export const beta');

    const second = run(args, '2\n');
    expect(second.status).toBe(0);
    expect(JSON.parse(second.stdout)).toMatchObject({
      ok: true,
      command: 'review-quality',
      status: 'completed',
      labeled: 2,
      remaining: 0,
    });
    expect(second.stderr).toContain('export const alpha = 1;');
    expect(second.stderr).not.toContain('export const beta = 2;');
    const completedState = JSON.parse(readFileSync(join(root, 'review-state.json'), 'utf8')) as { status: string; rows: unknown[] };
    expect(completedState.status).toBe('completed');
    expect(completedState.rows).toHaveLength(2);
    const receiptBytes = readFileSync(join(root, 'review-receipt.json'), 'utf8');
    const receipt = JSON.parse(receiptBytes) as Record<string, unknown>;
    expect(receiptBytes).toBe(canonicalArtifact(receipt).json);
    expect(receipt).toMatchObject({ reviewerAuthority: 'repository-owner', admitted: false });
    expect(receiptBytes).not.toMatch(/(?:source|path|export const)/i);

    const overwrite = run(args, '1\n');
    expect(overwrite.status).toBe(2);
    expect(overwrite.stdout.trim().split('\n')).toHaveLength(1);
    expect(JSON.parse(overwrite.stdout)).toMatchObject({ ok: false, command: 'review-quality' });
    expect(overwrite.stderr).toMatch(/completed|immutable/i);
    expect(readFileSync(join(root, 'review-receipt.json'), 'utf8')).toBe(receiptBytes);
  });

  it('fails closed with JSON stdout, actionable stderr, exit 2, and no state mutation', () => {
    const root = temporaryRoot();
    const args = fixture(root);
    chmodSync(join(root, 'assignment.json'), 0o600);
    writeFileSync(join(root, 'assignment.json'), `${readFileSync(join(root, 'assignment.json'), 'utf8')}\n`, { mode: 0o600 });
    const result = run(args, '3\n');
    expect(result.status).toBe(2);
    expect(result.stdout.trim().split('\n')).toHaveLength(1);
    expect(JSON.parse(result.stdout)).toMatchObject({ ok: false, command: 'review-quality' });
    expect(result.stderr).toMatch(/assignment.*canonical/i);
    expect(() => readFileSync(join(root, 'review-state.json'))).toThrow();
    expect(() => readFileSync(join(root, 'review-receipt.json'))).toThrow();
  });
});
