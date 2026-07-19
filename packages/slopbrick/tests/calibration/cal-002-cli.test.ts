import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { chmodSync, mkdirSync, mkdtempSync, readFileSync, rmSync, unlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

import { afterEach, describe, expect, it } from 'vitest';

import {
  CAL002_ASSIGNMENT_VERSION,
  CAL002_LOCKED_RULE_CATALOG_SHA256,
  CAL002_PROTOCOL_VERSION,
  canonicalArtifact,
} from '../../src/calibration/cal-002/contracts';
import {
  completeCAL002Review,
  recordCAL002Review,
  startCAL002Review,
} from '../../src/calibration/cal-002/review-session';

const packageRoot = fileURLToPath(new URL('../..', import.meta.url));
const repositoryRoot = join(packageRoot, '..', '..');
const script = join(packageRoot, 'scripts', 'cal', 'cal-002.ts');
const tsx = join(packageRoot, 'tests', 'helpers', 'tsx-runner.cjs');
const roots: string[] = [];
const implementationCommitSha = 'd'.repeat(40);
const REVIEW_A = '1'.repeat(64);
const REVIEW_B = '2'.repeat(64);

function sha256(value: string): string {
  return createHash('sha256').update(value, 'utf8').digest('hex');
}

function temporaryRoot(): string {
  const root = mkdtempSync(join(tmpdir(), 'cal-002-cli-'));
  roots.push(root);
  return root;
}

function temporaryRepositoryRoot(): string {
  const root = mkdtempSync(join(repositoryRoot, '.cal-002-cli-'));
  roots.push(root);
  return root;
}

function writeCanonical(path: string, value: unknown): void {
  writeFileSync(path, canonicalArtifact(value).json, { mode: 0o600 });
}

function fixture(
  root: string,
  options: { readonly lineWindowLocatorB?: string } = {},
): { readonly args: readonly string[]; readonly assignment: Record<string, unknown> } {
  mkdirSync(join(root, 'sources'), { recursive: true, mode: 0o700 });
  const sourceA = 'export const alpha = 1;\n';
  const sourceB = 'export const beta = 2;\n';
  writeFileSync(join(root, 'sources', 'a.ts'), sourceA, { mode: 0o600 });
  writeFileSync(join(root, 'sources', 'b.ts'), sourceB, { mode: 0o600 });
  const rows = [
    { reviewId: REVIEW_B, ruleId: 'layout/gap-monopoly', evidenceClass: 'contextual-quality', role: 'finding', unitId: 'sources/b.ts' },
    { reviewId: REVIEW_A, ruleId: 'layout/gap-monopoly', evidenceClass: 'contextual-quality', role: 'control', unitId: 'sources/a.ts' },
  ] as const;
  const blindedRows = [
    { reviewId: REVIEW_B, ruleId: 'layout/gap-monopoly', evidenceClass: 'contextual-quality', sourceIdentitySha256: sha256(sourceB), lineWindowLocator: options.lineWindowLocatorB ?? `window:${'b'.repeat(64)}` },
    { reviewId: REVIEW_A, ruleId: 'layout/gap-monopoly', evidenceClass: 'contextual-quality', sourceIdentitySha256: sha256(sourceA), lineWindowLocator: `window:${'a'.repeat(64)}` },
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
      { reviewId: REVIEW_A, sourcePath: 'sources/a.ts' },
      { reviewId: REVIEW_B, sourcePath: 'sources/b.ts' },
    ],
  });
  return { assignment, args: [
    script,
    'review-quality',
    '--root', root,
    '--assignment', 'assignment.json',
    '--blinded-batch', 'blinded.json',
    '--source-map', 'source-map.json',
    '--state', 'review-state.json',
    '--receipt', 'review-receipt.json',
    '--implementation-commit-sha', implementationCommitSha,
  ] };
}

function run(args: readonly string[], input: string, cwd = packageRoot, env: NodeJS.ProcessEnv = process.env) {
  return spawnSync(tsx, args, {
    cwd,
    encoding: 'utf8',
    env,
    input,
    maxBuffer: 1024 * 1024,
  });
}

function runPackage(args: readonly string[], input: string) {
  return spawnSync('corepack', ['pnpm', '--filter', 'slopbrick', 'cal:complete', '--', ...args], {
    cwd: repositoryRoot,
    encoding: 'utf8',
    input,
    maxBuffer: 1024 * 1024,
  });
}

function packageMachineOutput(stdout: string): unknown {
  const lines = stdout.trim().split('\n');
  return JSON.parse(lines.at(-1)!);
}

function fullyLabeledState(assignment: Record<string, unknown>) {
  const started = startCAL002Review({
    assignmentSha256: assignment.assignmentSha256 as string,
    blindedBatchSha256: assignment.blindedBatchSha256 as string,
    reviewIds: [REVIEW_B, REVIEW_A],
  });
  return recordCAL002Review(
    recordCAL002Review(started, REVIEW_B, 'not-useful'),
    REVIEW_A,
    'useful-no-safe-fix',
  );
}

afterEach(() => {
  while (roots.length > 0) rmSync(roots.pop()!, { recursive: true, force: true });
});

describe('CAL-002 review-quality CLI', () => {
  it('exposes the package dispatcher script', () => {
    const packageJson = JSON.parse(readFileSync(join(packageRoot, 'package.json'), 'utf8')) as { scripts?: Record<string, string> };
    expect(packageJson.scripts?.['cal:complete']).toBe('node --import tsx scripts/cal/cal-002.ts');
  });

  it('strips the package wrapper leading separator and invokes the actual package script', () => {
    const root = temporaryRoot();
    const { args } = fixture(root);
    const result = runPackage(args.slice(1), 'q\n');
    expect(result.status).toBe(0);
    expect(packageMachineOutput(result.stdout)).toMatchObject({ ok: true, command: 'review-quality', status: 'paused' });
    expect(result.stderr).not.toMatch(/Unknown CAL-002 option --|Usage:/i);
  });

  it('resolves package-wrapper plan artifacts from the repository workspace root without --root', () => {
    const root = temporaryRepositoryRoot();
    fixture(root);
    const fixturePath = relative(repositoryRoot, root);
    const result = runPackage([
      'review-quality',
      '--corpus-root', root,
      '--assignment', join(fixturePath, 'assignment.json'),
      '--state', join(fixturePath, 'review-state.json'),
      '--out', join(fixturePath, 'review-receipt.json'),
      '--implementation-commit-sha', implementationCommitSha,
    ], '3\n2\n');

    expect(result.status).toBe(0);
    expect(packageMachineOutput(result.stdout)).toMatchObject({ ok: true, command: 'review-quality', status: 'completed' });
    expect(JSON.parse(readFileSync(join(root, 'review-state.json'), 'utf8'))).toMatchObject({ status: 'completed' });
    expect(JSON.parse(readFileSync(join(root, 'review-receipt.json'), 'utf8'))).toMatchObject({ admitted: false });
  });

  it('accepts only the closed menu, saves once, and resumes at the first unlabeled row', () => {
    const invalidRoot = temporaryRoot();
    const invalid = run(fixture(invalidRoot).args, 'not-useful\nq\n');
    expect(invalid.status).toBe(0);
    expect(JSON.parse(invalid.stdout)).toMatchObject({ status: 'paused', labeled: 0, remaining: 2 });
    expect(invalid.stderr.match(/1 actionable-defect/g)).toHaveLength(2);
    expect((JSON.parse(readFileSync(join(invalidRoot, 'review-state.json'), 'utf8')) as { rows: unknown[] }).rows).toEqual([]);

    const root = temporaryRoot();
    const { args } = fixture(root);
    const first = run(args, '3\nq\n');
    expect(first.status).toBe(0);
    expect(first.stdout.trim().split('\n')).toHaveLength(1);
    expect(JSON.parse(first.stdout)).toMatchObject({
      ok: true,
      command: 'review-quality',
      status: 'paused',
      labeled: 1,
      remaining: 1,
      nextReviewId: REVIEW_A,
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
    expect(paused.rows).toEqual([{ reviewId: REVIEW_B, label: 'not-useful' }]);
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
    expect(overwrite.status).toBe(0);
    expect(JSON.parse(overwrite.stdout)).toMatchObject({ ok: true, command: 'review-quality', status: 'completed' });
    expect(readFileSync(join(root, 'review-receipt.json'), 'utf8')).toBe(receiptBytes);
  });

  it('rejects an unsafe line-window locator before any raw control reaches stderr', () => {
    const root = temporaryRoot();
    const maliciousLocator = `window:${'b'.repeat(64)}\u001b[31m\t\u0085`;
    const result = run(fixture(root, { lineWindowLocatorB: maliciousLocator }).args, 'q\n');

    expect(result.status).toBe(2);
    expect(result.stderr).toMatch(/lineWindowLocator.*window.*lowercase.*hex/i);
    expect(result.stderr).not.toContain(maliciousLocator);
    expect(result.stderr).not.toContain('\u001b');
    expect(result.stderr).not.toContain('\t');
    expect(result.stderr.replaceAll('\n', '')).not.toMatch(/[\x00-\x1f\x7f-\x9f]/u);
    expect(() => readFileSync(join(root, 'review-state.json'))).toThrow();
  });

  it('accepts the plan interface, resolves source transiently by hash, and emits bounded claim-matched safe context', () => {
    const workspace = temporaryRoot();
    const corpusRoot = join(workspace, 'corpus');
    mkdirSync(join(corpusRoot, 'nested'), { recursive: true, mode: 0o700 });
    mkdirSync(join(corpusRoot, '.git'), { recursive: true, mode: 0o700 });
    const source = `export const visible = "\u001b[31mred";\t// tab\u0085\n${'x'.repeat(20_000)}\nNEVER-DISPLAYED-TAIL\n`;
    writeFileSync(join(corpusRoot, 'nested', 'sample.ts'), source, { mode: 0o600 });
    writeFileSync(join(corpusRoot, '.git', 'ignored-copy.ts'), source, { mode: 0o600 });
    const rows = [{ reviewId: REVIEW_A, ruleId: 'layout/gap-monopoly', evidenceClass: 'contextual-quality', role: 'finding', unitId: 'nested/sample.ts' }] as const;
    const blindedRows = [{ reviewId: REVIEW_A, ruleId: 'layout/gap-monopoly', evidenceClass: 'contextual-quality', sourceIdentitySha256: sha256(source), lineWindowLocator: `window:${'a'.repeat(64)}` }] as const;
    const withoutSelfHash = {
      version: CAL002_ASSIGNMENT_VERSION,
      protocolVersion: CAL002_PROTOCOL_VERSION,
      catalogSha256: CAL002_LOCKED_RULE_CATALOG_SHA256,
      assignmentImplementationCommitSha: 'e'.repeat(40),
      assignmentId: 'plan-fixture',
      selectionManifestSha256: 'f'.repeat(64),
      blindedBatchSha256: canonicalArtifact(blindedRows).sha256,
      round: 'initial',
      targetPerArm: 30,
      rows,
      blindedRows,
      admitted: false,
    } as const;
    const assignment = { ...withoutSelfHash, assignmentSha256: canonicalArtifact(withoutSelfHash).sha256 };
    writeCanonical(join(workspace, 'assignment.json'), assignment);

    const result = run([
      script,
      'review-quality',
      '--corpus-root', corpusRoot,
      '--assignment', 'assignment.json',
      '--state', 'review-state.json',
      '--out', 'review-receipt.json',
    ], '3\n', workspace, { ...process.env, CAL002_REVIEW_IMPLEMENTATION_COMMIT_SHA: implementationCommitSha });

    expect(result.status).toBe(0);
    expect(JSON.parse(result.stdout)).toMatchObject({ ok: true, status: 'completed' });
    expect(result.stdout).not.toContain(corpusRoot);
    expect(result.stderr).toContain('ruleId: layout/gap-monopoly');
    expect(result.stderr).toContain('evidenceClass: contextual-quality');
    expect(result.stderr).toContain(`lineWindowLocator: window:${'a'.repeat(64)}`);
    expect(result.stderr).toContain('export const visible');
    expect(result.stderr).toContain('\\x1b[31mred');
    expect(result.stderr).toContain('\\x09// tab\\x85');
    expect(result.stderr).not.toContain('\u001b');
    expect(result.stderr).not.toContain('\t');
    expect(result.stderr.replaceAll('\n', '')).not.toMatch(/[\x00-\x1f\x7f-\x9f]/u);
    expect(result.stderr).not.toContain('NEVER-DISPLAYED-TAIL');
    expect(result.stderr.length).toBeLessThan(18_000);
    expect(result.stderr).not.toContain('nested/sample.ts');
    const persisted = `${readFileSync(join(workspace, 'review-state.json'), 'utf8')}\n${readFileSync(join(workspace, 'review-receipt.json'), 'utf8')}`;
    expect(persisted).not.toMatch(/(?:source|path|visible|NEVER-DISPLAYED-TAIL)/i);
  });

  it('recovers an interrupted completion from a receipt created by a different implementation SHA', () => {
    const recoveredRoot = temporaryRoot();
    const recoveredFixture = fixture(recoveredRoot);
    const state = fullyLabeledState(recoveredFixture.assignment);
    const receiptImplementationCommitSha = 'a'.repeat(40);
    const completed = completeCAL002Review({
      state,
      reviewerAuthority: 'repository-owner',
      implementationCommitSha: receiptImplementationCommitSha,
    });
    writeCanonical(join(recoveredRoot, 'review-state.json'), state);
    writeCanonical(join(recoveredRoot, 'review-receipt.json'), completed.receipt);
    const receiptBytes = readFileSync(join(recoveredRoot, 'review-receipt.json'), 'utf8');
    const recovered = run(recoveredFixture.args, '');
    expect(recovered.status).toBe(0);
    expect(JSON.parse(recovered.stdout)).toMatchObject({
      ok: true,
      status: 'completed',
      stateSha256: completed.stateSha256,
      receiptSha256: completed.receiptSha256,
    });
    expect(JSON.parse(readFileSync(join(recoveredRoot, 'review-state.json'), 'utf8'))).toEqual(completed.state);
    expect(readFileSync(join(recoveredRoot, 'review-receipt.json'), 'utf8')).toBe(receiptBytes);
    expect(completed.receipt.reviewImplementationCommitSha).toBe(receiptImplementationCommitSha);
  });

  it('rejects an immutable receipt whose state binding differs from the in-progress state', () => {
    const collisionRoot = temporaryRoot();
    const collisionFixture = fixture(collisionRoot);
    const collisionState = fullyLabeledState(collisionFixture.assignment);
    const collisionCompleted = completeCAL002Review({ state: collisionState, reviewerAuthority: 'repository-owner', implementationCommitSha });
    writeCanonical(join(collisionRoot, 'review-state.json'), collisionState);
    writeCanonical(join(collisionRoot, 'review-receipt.json'), { ...collisionCompleted.receipt, stateSha256: '0'.repeat(64) });
    const collision = run(collisionFixture.args, '');
    expect(collision.status).toBe(2);
    expect(collision.stderr).toMatch(/receipt.*match|match.*receipt/i);
    expect(JSON.parse(readFileSync(join(collisionRoot, 'review-state.json'), 'utf8'))).toEqual(collisionState);
  });

  it('rejects a malformed immutable receipt without mutating in-progress state', () => {
    const root = temporaryRoot();
    const built = fixture(root);
    const state = fullyLabeledState(built.assignment);
    writeCanonical(join(root, 'review-state.json'), state);
    writeFileSync(join(root, 'review-receipt.json'), '{malformed', { mode: 0o600 });

    const result = run(built.args, '');

    expect(result.status).toBe(2);
    expect(result.stderr).toMatch(/receipt.*valid JSON/i);
    expect(JSON.parse(readFileSync(join(root, 'review-state.json'), 'utf8'))).toEqual(state);
    expect(readFileSync(join(root, 'review-receipt.json'), 'utf8')).toBe('{malformed');
  });

  it('resumes a completed state only when its matching receipt is present and valid', () => {
    const root = temporaryRoot();
    const built = fixture(root);
    const completed = completeCAL002Review({
      state: fullyLabeledState(built.assignment),
      reviewerAuthority: 'repository-owner',
      implementationCommitSha,
    });
    writeCanonical(join(root, 'review-state.json'), completed.state);
    writeCanonical(join(root, 'review-receipt.json'), completed.receipt);
    const matching = run(built.args, '');
    expect(matching.status).toBe(0);
    expect(JSON.parse(matching.stdout)).toMatchObject({ ok: true, status: 'completed', receiptSha256: completed.receiptSha256 });

    unlinkSync(join(root, 'review-receipt.json'));
    const missing = run(built.args, '');
    expect(missing.status).toBe(2);
    expect(missing.stderr).toMatch(/completed.*receipt|receipt.*completed/i);

    writeCanonical(join(root, 'review-receipt.json'), { ...completed.receipt, stateSha256: '0'.repeat(64) });
    const mismatched = run(built.args, '');
    expect(mismatched.status).toBe(2);
    expect(mismatched.stderr).toMatch(/receipt.*match|match.*receipt/i);
  });

  it('fails closed with JSON stdout, actionable stderr, exit 2, and no state mutation', () => {
    const root = temporaryRoot();
    const { args } = fixture(root);
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
