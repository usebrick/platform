import { createHash } from 'node:crypto';
import { spawn, spawnSync } from 'node:child_process';
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, unlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { delimiter, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

import { afterEach, describe, expect, it } from 'vitest';

import type { Rule } from '../../src/types';
import {
  buildCAL001DecisionMatrix,
  type CAL001DecisionMatrix,
} from '../../src/calibration/corpus-v1/calibration-decisions';
import type { CAL001HoldoutMetrics } from '../../src/calibration/corpus-v1/calibration-holdout';
import type { CAL001DecisionRow } from '../../src/calibration/corpus-v1/calibration-decisions';
import { buildCAL002Catalog } from '../../src/calibration/cal-002/catalog';
import {
  CAL002_ASSOCIATION_SNAPSHOT,
  authorityProposalSha256V2,
  authorityRowsSha256V2,
  canonicalAuthorityRowsV2,
} from '../../src/calibration/cal-002/authority';
import {
  CAL002_ASSIGNMENT_VERSION,
  CAL002_LOCKED_RULE_CATALOG_SHA256,
  CAL002_PROTOCOL_VERSION,
  canonicalArtifact,
} from '../../src/calibration/cal-002/contracts';
import {
  CAL002_AUTHORITY_RECEIPT_VERSION,
  CAL002_PROTOCOL_VERSION_V2,
  type CAL002AuthorityReceiptV2,
  type CAL002RuntimeOutcomeV2,
} from '../../src/calibration/cal-002/contracts-v2';
import {
  buildCAL002AppliedPolicyV2,
  buildCAL002MatrixApprovalV2,
} from '../../src/calibration/cal-002/application-v2';
import {
  assertCAL002FinalMatrixV2,
  type CAL002FinalMatrixV2,
  type CAL002FinalRowV2,
} from '../../src/calibration/cal-002/matrix-v2';
import { CAL002_ORIGIN_FROZEN_GOVERNING_HASHES } from '../../src/calibration/cal-002/origin-v2';
import {
  completeCAL002Review,
  recordCAL002Review,
  startCAL002Review,
} from '../../src/calibration/cal-002/review-session';
import { RuleRegistry } from '../../src/rules/registry';
import { getDefaultOffRules } from '../../src/rules/signal-strength';

const packageRoot = fileURLToPath(new URL('../..', import.meta.url));
const repositoryRoot = join(packageRoot, '..', '..');
const script = join(packageRoot, 'scripts', 'cal', 'cal-002.ts');
const tsx = join(packageRoot, 'tests', 'helpers', 'tsx-runner.cjs');
const roots: string[] = [];
const implementationCommitSha = 'd'.repeat(40);
const REVIEW_A = '1'.repeat(64);
const REVIEW_B = '2'.repeat(64);
const AUTHORITY_STATE_RELATIVE_PATH = '.slopbrick/calibration/cal-002/authority-state-v2.json';
const QUALITY_COHORT_RELATIVE_PATH = '.slopbrick/calibration/cal-002/quality-cohort-v2.json';
const PROTECTED_ORIGIN_STATE_RELATIVE_PATH = '.slopbrick/calibration/cal-002/origin-state.json';
const FROZEN_HOLDOUT_COMMIT_SHA = '45d2dd038107d3d1d7731192126bf0d48dd6f84b';
const FROZEN_DECISION_COMMIT_SHA = '215647e22d8b289f944cc44e047efeedb553a04d';
const RECORDED_HOLDOUT_RECEIPT_PATH = '/private/tmp/cal-001-v1-holdout-receipt-2026-07-17.json';
const RECORDED_METRICS_PATH = '/private/tmp/cal-001-v1-holdout-metrics-2026-07-17.json';
const RECORDED_MATRIX_PATH = '/private/tmp/cal-001-v1-decision-matrix-2026-07-17.json';

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

function temporaryPrivateTmpRoot(): string {
  const root = mkdtempSync(join(tmpdir(), 'cal-002-catalog-'));
  roots.push(root);
  return root;
}

function writeCanonical(path: string, value: unknown): void {
  writeFileSync(path, canonicalArtifact(value).json, { mode: 0o600 });
}

function finalMatrixV2Fixture(): CAL002FinalMatrixV2 {
  const rows = canonicalAuthorityRowsV2().map((authority, index): CAL002FinalRowV2 => {
    const common = {
      ruleId: authority.ruleId,
      destination: authority.destination,
      qualityDomain: authority.qualityDomain,
      claimClass: authority.claimClass,
      readiness: authority.readiness,
      aiAssociation: authority.aiAssociation,
      evidenceSha256: String((index % 9) + 1).repeat(64),
      admitted: false as const,
    };
    if (authority.readiness === 'repair-required' || authority.readiness === 'project-contract-required') {
      return {
        ...common,
        measurementStatus: 'unavailable',
        runtimeOutcome: 'default-off',
        enabledByDefault: false,
        runnableByExplicitOptIn: false,
        scoreEligible: false,
        gateEligible: false,
        repairSafety: 'no-safe-repair',
        provenance: 'blocked-quality-candidate',
      };
    }
    if (authority.destination === 'superseded') {
      return {
        ...common,
        measurementStatus: 'not-applicable',
        runtimeOutcome: 'superseded',
        enabledByDefault: false,
        runnableByExplicitOptIn: false,
        scoreEligible: false,
        gateEligible: false,
        repairSafety: 'not-applicable',
        provenance: 'superseded-policy',
        replacementRuleId: authority.replacementRuleId!,
      };
    }
    if (authority.destination === 'retired') {
      return {
        ...common,
        measurementStatus: 'not-applicable',
        runtimeOutcome: 'retired',
        enabledByDefault: false,
        runnableByExplicitOptIn: false,
        scoreEligible: false,
        gateEligible: false,
        repairSafety: 'not-applicable',
        provenance: 'retired-policy',
      };
    }
    if (authority.destination === 'research-origin') {
      return {
        ...common,
        measurementStatus: 'not-applicable',
        runtimeOutcome: 'default-off',
        enabledByDefault: false,
        runnableByExplicitOptIn: true,
        scoreEligible: false,
        gateEligible: false,
        repairSafety: 'not-applicable',
        provenance: 'internal-origin-association',
      };
    }
    if (authority.evidenceClass === 'deterministic-or-standards') {
      return {
        ...common,
        evidenceClass: authority.evidenceClass,
        measurementStatus: 'oracle-verified',
        runtimeOutcome: 'default-on',
        enabledByDefault: true,
        runnableByExplicitOptIn: true,
        scoreEligible: true,
        gateEligible: true,
        repairSafety: 'finding-bound-only',
        provenance: 'deterministic-finding-evidence',
      };
    }
    return {
      ...common,
      evidenceClass: authority.evidenceClass!,
      measurementStatus: 'not-requested-owner-capacity',
      runtimeOutcome: 'quality-candidate-default-off',
      enabledByDefault: false,
      runnableByExplicitOptIn: true,
      scoreEligible: false,
      gateEligible: false,
      repairSafety: 'no-safe-repair',
      provenance: 'quality-candidate-unmeasured',
    };
  });
  const outcomes: readonly CAL002RuntimeOutcomeV2[] = [
    'default-on', 'quality-advisory', 'quality-candidate-default-off', 'default-off',
    'insufficient-evidence', 'superseded', 'retired',
  ];
  const matrix: CAL002FinalMatrixV2 = {
    version: 'cal-002-final-matrix-v2',
    protocolVersion: 'CAL-002-v2',
    catalogSha256: CAL002_LOCKED_RULE_CATALOG_SHA256,
    authorityReceiptSha256: 'a'.repeat(64),
    oracleReceiptSha256: 'b'.repeat(64),
    qualityDispositionSha256: 'c'.repeat(64),
    originReceiptSha256: 'd'.repeat(64),
    supersessionReceiptSha256: 'e'.repeat(64),
    reducerImplementationCommitSha: implementationCommitSha,
    rows,
    projectionCounts: {
      startingQuality: 47,
      transferred: 26,
      blocked: 4,
      superseded: 3,
      retired: 7,
      researchOrigin: 32,
    },
    outcomeCounts: Object.fromEntries(outcomes.map((outcome) => [
      outcome,
      rows.filter((row) => row.runtimeOutcome === outcome).length,
    ])) as Record<CAL002RuntimeOutcomeV2, number>,
    admitted: false,
    applied: false,
  };
  assertCAL002FinalMatrixV2(matrix);
  return matrix;
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

function originCatalogFixture(root: string) {
  const registry = new RuleRegistry();
  registry.loadBuiltins();
  const rules = registry.getRules() as readonly Pick<Rule, 'id' | 'category' | 'aiSpecific' | 'defaultOff'>[];
  const defaultOff = getDefaultOffRules();
  const rows: CAL001DecisionRow[] = rules.map((rule) => {
    const existingDefaultOff = rule.defaultOff === true || defaultOff.has(rule.id);
    const decision = rule.aiSpecific ? 'default-off' as const : 'quality-only' as const;
    return {
      ruleId: rule.id,
      aiSpecific: rule.aiSpecific,
      existingDefaultOff,
      decision,
      policyAction: decision === 'quality-only' || existingDefaultOff ? 'preserve' : 'owner-review-required',
      evidence: {
        holdoutReceiptSha256: 'a'.repeat(64),
        metricsSha256: 'b'.repeat(64),
        report: 'CAL-001-v1-origin-discrimination-diagnostic',
      },
      originResult: {
        status: rule.aiSpecific ? 'diagnostic-only' : 'not-evaluated',
        splitStatus: { train: 'available', validation: 'available', test: 'available' },
        ruleStatus: { train: 'ok', validation: 'ok', test: 'ok' },
      },
      usefulnessResult: 'not-evaluated',
      confounds: {
        leakage: 'clear',
        sourceLabels: 'publisher-attested-polarity-not-authorship',
        frameworkBuckets: 'not-available',
        semanticBuckets: 'not-available',
      },
      owner: 'calibration-maintainers',
      rationale: 'CAL-002 origin CLI fixture',
    };
  });
  const catalog = buildCAL002Catalog({
    rules,
    effectiveDefaultOffRuleIds: defaultOff,
    cal001Rows: rows,
    cal001MatrixSha256: 'c'.repeat(64),
  }).catalog;
  writeCanonical(join(root, 'catalog.json'), catalog);
  return catalog;
}

function priorOriginStateFixture(root: string): { readonly bytes: string; readonly sha256: string } {
  const state = {
    version: 'cal-002-origin-state-v1',
    protocolVersion: CAL002_PROTOCOL_VERSION,
    catalogSha256: CAL002_LOCKED_RULE_CATALOG_SHA256,
    decisions: [{ ruleId: 'ai/any-density', disposition: 'hold-origin-default-off' }],
    status: 'in-progress',
  } as const;
  const bytes = canonicalArtifact(state).json;
  writeFileSync(join(root, 'origin-state.json'), bytes, { mode: 0o600 });
  return { bytes, sha256: sha256(bytes) };
}

function approvedAuthorityReceiptFixture(root: string): CAL002AuthorityReceiptV2 {
  const rows = canonicalAuthorityRowsV2();
  const receipt: CAL002AuthorityReceiptV2 = {
    version: CAL002_AUTHORITY_RECEIPT_VERSION,
    protocolVersion: CAL002_PROTOCOL_VERSION_V2,
    catalogSha256: CAL002_LOCKED_RULE_CATALOG_SHA256,
    proposalSha256: 'a'.repeat(64),
    priorStateSha256: 'b'.repeat(64),
    revision: 2,
    reviewerAuthority: 'repository-owner',
    decision: 'approved',
    associationSnapshot: CAL002_ASSOCIATION_SNAPSHOT,
    rows,
    authorityRowsSha256: authorityRowsSha256V2(rows),
    associationRowsSha256: canonicalArtifact(rows).sha256,
    admitted: false,
    applied: false,
  };
  writeCanonical(join(root, 'authority-receipt.json'), receipt);
  return receipt;
}

function cal001MatrixFixture(root: string): {
  readonly matrix: CAL001DecisionMatrix;
  readonly matrixSha256: string;
  readonly metrics: CAL001HoldoutMetrics;
} {
  const registry = new RuleRegistry();
  registry.loadBuiltins();
  const rules = registry.getRules();
  const defaultOff = getDefaultOffRules();
  const metrics = {
    splits: {
      train: { base: { status: 'available', rules: [] } },
      validation: { base: { status: 'available', rules: [] } },
      test: { base: { status: 'available', rules: [] } },
    },
  } as unknown as CAL001HoldoutMetrics;
  const result = buildCAL001DecisionMatrix({
    protocolVersion: 'CAL-001-v1',
    holdoutImplementationCommitSha: '0'.repeat(40),
    decisionImplementationCommitSha: '1'.repeat(40),
    holdoutReceiptSha256: '2'.repeat(64),
    metricsSha256: '3'.repeat(64),
    leakageStatus: 'clear',
    metricsStatus: 'available',
    ruleCatalog: rules.map((rule) => ({
      ruleId: rule.id,
      aiSpecific: rule.aiSpecific,
      existingDefaultOff: rule.defaultOff === true || defaultOff.has(rule.id),
    })),
    metrics,
  });
  writeCanonical(join(root, 'cal001-matrix.json'), result.matrix);
  return { ...result, metrics };
}

function historicalRerunArtifactsFixture(root: string): {
  readonly holdoutReceiptPath: string;
  readonly metricsPath: string;
  readonly matrixPath: string;
} {
  const { metrics } = cal001MatrixFixture(root);
  const registry = new RuleRegistry();
  registry.loadBuiltins();
  const defaultOff = getDefaultOffRules();
  const metricsSha256 = canonicalArtifact(metrics).sha256;
  const holdoutReceipt = {
    version: 'cal-001-v1-holdout-receipt-v1',
    protocolVersion: 'CAL-001-v1',
    implementationCommitSha: FROZEN_HOLDOUT_COMMIT_SHA,
    configHash: '5'.repeat(64),
    workerCount: 1,
    evaluation: 'diagnostic-only',
    admitted: false,
    inputHashes: {
      protocolSha256: '1'.repeat(64),
      sourceBindingReceiptSha256: '2'.repeat(64),
      planSha256: '3'.repeat(64),
    },
    metrics: { metricsSha256 },
  } as const;
  const holdoutReceiptSha256 = canonicalArtifact(holdoutReceipt).sha256;
  const matrix = buildCAL001DecisionMatrix({
    protocolVersion: 'CAL-001-v1',
    holdoutImplementationCommitSha: FROZEN_HOLDOUT_COMMIT_SHA,
    decisionImplementationCommitSha: FROZEN_DECISION_COMMIT_SHA,
    holdoutReceiptSha256,
    metricsSha256,
    leakageStatus: 'clear',
    metricsStatus: 'available',
    ruleCatalog: registry.getRules().map((rule) => ({
      ruleId: rule.id,
      aiSpecific: rule.aiSpecific,
      existingDefaultOff: rule.defaultOff === true || defaultOff.has(rule.id),
    })),
    metrics,
  }).matrix;
  const holdoutReceiptPath = join(root, 'rerun-fixture-holdout.json');
  const metricsPath = join(root, 'rerun-fixture-metrics.json');
  const matrixPath = join(root, 'rerun-fixture-matrix.json');
  writeCanonical(holdoutReceiptPath, holdoutReceipt);
  writeCanonical(metricsPath, metrics);
  writeCanonical(matrixPath, matrix);
  return { holdoutReceiptPath, metricsPath, matrixPath };
}

function fakeHistoricalRerunTools(root: string): {
  readonly bin: string;
  readonly logPath: string;
  readonly driverPath: string;
} {
  const bin = join(root, 'fake-bin');
  mkdirSync(bin, { recursive: true, mode: 0o700 });
  const logPath = join(root, 'tool-log.jsonl');
  const driverPath = join(root, 'fake-tool.cjs');
  writeFileSync(driverPath, `
const { appendFileSync, copyFileSync, mkdirSync, rmSync, writeFileSync } = require('node:fs');
const { dirname, join } = require('node:path');
const tool = process.argv[2];
const args = process.argv.slice(3);
appendFileSync(process.env.CAL002_TEST_TOOL_LOG, JSON.stringify({
  tool,
  cwd: process.cwd(),
  args,
  corepackNetwork: process.env.COREPACK_ENABLE_NETWORK,
}) + '\\n');
const valueAfter = (flag) => args[args.indexOf(flag) + 1];
if (tool === 'git') {
  if (args[0] === 'rev-parse') process.stdout.write('${'c'.repeat(40)}\\n');
  if (args[0] === 'worktree' && args[1] === 'add') {
    const checkout = args[3];
    const commit = args[4];
    mkdirSync(checkout, { recursive: true });
    if (commit === '${FROZEN_DECISION_COMMIT_SHA}') {
      const reducer = join(checkout, 'packages/slopbrick/src/calibration/corpus-v1/calibration-decisions.ts');
      mkdirSync(dirname(reducer), { recursive: true });
      if (process.env.CAL002_TEST_REDUCER_FIXTURE) {
        copyFileSync(process.env.CAL002_TEST_REDUCER_FIXTURE, reducer);
      } else {
        writeFileSync(reducer, 'fixture decision reducer bytes\\n');
      }
    }
  }
  if (args[0] === 'worktree' && args[1] === 'remove') rmSync(args[3], { recursive: true, force: true });
  process.exit(0);
}
if (tool === 'corepack') {
  if (args.includes('cal:corpus:v1-holdout')) {
    if (process.env.CAL002_TEST_FAIL_HOLDOUT === '1') {
      process.stderr.write('injected historical holdout failure\\n');
      process.exit(2);
    }
    copyFileSync(process.env.CAL002_TEST_HOLDOUT_FIXTURE, valueAfter('--out'));
    copyFileSync(process.env.CAL002_TEST_METRICS_FIXTURE, valueAfter('--metrics-out'));
  }
  if (args.includes('cal:corpus:v1-decisions')) {
    copyFileSync(process.env.CAL002_TEST_MATRIX_FIXTURE, valueAfter('--out'));
  }
  process.exit(0);
}
process.exit(64);
`, { mode: 0o600 });
  for (const tool of ['git', 'corepack']) {
    const path = join(bin, tool);
    writeFileSync(path, '#!/bin/sh\nexec node "$CAL002_TEST_TOOL_DRIVER" "' + tool + '" "$@"\n', { mode: 0o700 });
    chmodSync(path, 0o700);
  }
  return { bin, logPath, driverPath };
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

function runAsync(args: readonly string[], input: string, cwd = packageRoot): Promise<{
  readonly status: number | null;
  readonly stdout: string;
  readonly stderr: string;
}> {
  return new Promise((resolvePromise, rejectPromise) => {
    const child = spawn(tsx, args, { cwd, env: process.env, stdio: ['pipe', 'pipe', 'pipe'] });
    let stdout = '';
    let stderr = '';
    child.stdout.setEncoding('utf8');
    child.stderr.setEncoding('utf8');
    child.stdout.on('data', (chunk: string) => { stdout += chunk; });
    child.stderr.on('data', (chunk: string) => { stderr += chunk; });
    child.once('error', rejectPromise);
    child.once('close', (status) => resolvePromise({ status, stdout, stderr }));
    child.stdin.end(input);
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

describe('CAL-002 matrix approval and application CLI', () => {
  it('recognizes the matrix command surface and fails closed on missing required artifacts', () => {
    const result = run([script, 'matrix', '--root', temporaryRoot(), '--out', 'proposed-matrix.json'], '');

    expect(result.status).toBe(2);
    expect(result.stderr).toMatch(/matrix requires --catalog/i);
    expect(result.stdout).toContain('"ok":false');
  });

  it('recognizes approve-matrix and apply dry-run as closed local commands', () => {
    const root = temporaryRoot();
    const approval = run([script, 'approve-matrix', '--root', root, '--matrix', 'final-matrix.json', '--out', 'matrix-approval.json'], '');
    expect(approval.status).toBe(2);
    expect(approval.stderr).toMatch(/ENOENT|final matrix/i);

    const apply = run([script, 'apply', '--dry-run', '--root', root, '--matrix', 'final-matrix.json', '--approval', 'matrix-approval.json', '--out', 'proposed-policy.json'], '');
    expect(apply.status).toBe(2);
    expect(apply.stderr).toMatch(/apply requires --catalog|final-matrix|matrix/i);
  });
});

describe('CAL-002 v2 progressive evidence CLI', () => {
  it.each([
    ['reduce-parity-v2', ['--rule-id', 'db/sql-concat', '--migration-commit-ref', implementationCommitSha, '--out', 'parity.json'], /authority/i],
    ['reduce-oracles-v2', ['--catalog', 'catalog.json', '--corpus-root', 'corpus', '--source-binding-receipt-sha', 'a'.repeat(64), '--starting-out', 'starting.json', '--out', 'oracles.json'], /authority/i],
    ['verify-supersession', ['--sql-parity', 'sql.json', '--console-parity', 'console.json', '--any-parity', 'any.json', '--out', 'supersession.json'], /authority/i],
    ['matrix-v2', ['--oracles', 'oracles.json', '--quality-disposition', 'quality.json', '--origin', 'origin.json', '--supersession', 'supersession.json', '--out', 'matrix.json'], /authority/i],
  ] as const)('recognizes %s and fails on its first missing required option', (command, options, pattern) => {
    const result = run([script, command, '--root', temporaryRoot(), ...options], '');
    expect(result.status).toBe(2);
    expect(result.stderr).toMatch(pattern);
    expect(result.stderr).not.toMatch(/Usage:.*review-quality/i);
    expect(JSON.parse(result.stdout)).toMatchObject({ ok: false, command });
  });

  it('executes all three closed parity reductions and verifies their supersession receipt', () => {
    const root = temporaryRoot();
    approvedAuthorityReceiptFixture(root);
    const cases = [
      ['db/sql-concat', 'sql.json'],
      ['logic/math-console-log-storm', 'console.json'],
      ['logic/math-any-density', 'any.json'],
    ] as const;
    for (const [ruleId, out] of cases) {
      const parity = run([
        script,
        'reduce-parity-v2',
        '--root', root,
        '--authority', 'authority-receipt.json',
        '--rule-id', ruleId,
        '--migration-commit-ref', implementationCommitSha,
        '--out', out,
      ], '');
      expect(parity.status, parity.stderr).toBe(0);
      expect(JSON.parse(readFileSync(join(root, out), 'utf8'))).toMatchObject({
        ruleId,
        status: 'passed',
        admitted: false,
      });
    }
    const supersession = run([
      script,
      'verify-supersession',
      '--root', root,
      '--authority', 'authority-receipt.json',
      '--sql-parity', 'sql.json',
      '--console-parity', 'console.json',
      '--any-parity', 'any.json',
      '--out', 'supersession.json',
    ], '');
    expect(supersession.status, supersession.stderr).toBe(0);
    expect(JSON.parse(readFileSync(join(root, 'supersession.json'), 'utf8'))).toMatchObject({
      version: 'cal-002-supersession-receipt-v2',
      admitted: false,
    });
  });

  it('lets apply-v2 dry-run omit approval and receipt while requiring them for final apply', () => {
    const root = temporaryRoot();
    const dryRun = run([
      script,
      'apply-v2',
      '--dry-run',
      '--root', root,
      '--matrix', 'missing-matrix.json',
      '--implementation-commit-ref', implementationCommitSha,
      '--out', 'candidate.json',
    ], '');
    expect(dryRun.status).toBe(2);
    expect(dryRun.stderr).toMatch(/matrix|ENOENT/i);
    expect(dryRun.stderr).not.toMatch(/requires --approval|requires --receipt-out/i);

    const finalApply = run([
      script,
      'apply-v2',
      '--root', root,
      '--matrix', 'matrix.json',
      '--implementation-commit-ref', implementationCommitSha,
      '--out', 'policy.json',
    ], '');
    expect(finalApply.status).toBe(2);
    expect(finalApply.stderr).toMatch(/requires --approval|requires --receipt-out/i);
  });

  it('recognizes approve-matrix-v2 and uses the exact closed decision wording', () => {
    const root = temporaryRoot();
    const result = run([
      script,
      'approve-matrix-v2',
      '--root', root,
      '--matrix', 'missing-matrix.json',
      '--out', 'approval.json',
    ], '2 reject and name the failed row\n');
    expect(result.status).toBe(2);
    expect(result.stderr).toMatch(/matrix|ENOENT/i);
    expect(result.stderr).not.toMatch(/Unknown|Usage:/i);
  });

  it('accepts only the exact closed approval or rejection line for a valid matrix', () => {
    const root = temporaryRoot();
    writeCanonical(join(root, 'matrix.json'), finalMatrixV2Fixture());

    const approved = run([
      script,
      'approve-matrix-v2',
      '--root', root,
      '--matrix', 'matrix.json',
      '--out', 'approval.json',
    ], '1 approve this exact 119-row matrix SHA\n');
    expect(approved.status).toBe(0);
    expect(approved.stderr).toContain('1 approve this exact 119-row matrix SHA');
    expect(JSON.parse(readFileSync(join(root, 'approval.json'), 'utf8'))).toMatchObject({
      reviewerAuthority: 'repository-owner',
      decision: 'approved',
      admitted: false,
      applied: false,
    });

    const rejected = run([
      script,
      'approve-matrix-v2',
      '--root', root,
      '--matrix', 'matrix.json',
      '--out', 'rejected.json',
    ], '2 reject and name the failed row\n');
    expect(rejected.status).toBe(0);
    expect(JSON.parse(rejected.stdout)).toMatchObject({ status: 'rejected', receiptWritten: false });
    expect(existsSync(join(root, 'rejected.json'))).toBe(false);
  });

  it('writes only an unapplied dry-run candidate, then atomically writes a valid applied pair', () => {
    const root = temporaryRoot();
    const matrix = finalMatrixV2Fixture();
    const approval = buildCAL002MatrixApprovalV2({
      matrix,
      approvalCommitSha: implementationCommitSha,
    }).approval;
    writeCanonical(join(root, 'matrix.json'), matrix);
    writeCanonical(join(root, 'approval.json'), approval);

    const dryRun = run([
      script,
      'apply-v2',
      '--dry-run',
      '--root', root,
      '--matrix', 'matrix.json',
      '--implementation-commit-ref', implementationCommitSha,
      '--out', 'candidate.json',
    ], '');
    expect(dryRun.status).toBe(0);
    expect(JSON.parse(readFileSync(join(root, 'candidate.json'), 'utf8'))).toMatchObject({ applied: false, admitted: false });
    expect(existsSync(join(root, 'receipt.json'))).toBe(false);

    const finalApply = run([
      script,
      'apply-v2',
      '--root', root,
      '--matrix', 'matrix.json',
      '--approval', 'approval.json',
      '--implementation-commit-ref', implementationCommitSha,
      '--out', 'policy.json',
      '--receipt-out', 'receipt.json',
    ], '');
    expect(finalApply.status).toBe(0);
    expect(JSON.parse(readFileSync(join(root, 'policy.json'), 'utf8'))).toMatchObject({ applied: true, admitted: false });
    expect(JSON.parse(readFileSync(join(root, 'receipt.json'), 'utf8'))).toMatchObject({ applied: true, admitted: false });
  });

  it('leaves both valid final-apply destinations byte-identical on an immutable pair conflict', () => {
    const root = temporaryRoot();
    const matrix = finalMatrixV2Fixture();
    const approval = buildCAL002MatrixApprovalV2({
      matrix,
      approvalCommitSha: implementationCommitSha,
    }).approval;
    const existing = buildCAL002AppliedPolicyV2({
      matrix,
      approval,
      applicationImplementationCommitSha: 'e'.repeat(40),
    });
    writeCanonical(join(root, 'matrix.json'), matrix);
    writeCanonical(join(root, 'approval.json'), approval);
    writeCanonical(join(root, 'policy.json'), existing.policy);
    writeCanonical(join(root, 'receipt.json'), existing.applicationReceipt);
    const policyBefore = readFileSync(join(root, 'policy.json'));
    const receiptBefore = readFileSync(join(root, 'receipt.json'));

    const result = run([
      script,
      'apply-v2',
      '--root', root,
      '--matrix', 'matrix.json',
      '--approval', 'approval.json',
      '--implementation-commit-ref', implementationCommitSha,
      '--out', 'policy.json',
      '--receipt-out', 'receipt.json',
    ], '');

    expect(result.status).toBe(2);
    expect(result.stderr).toMatch(/different CAL-002 applied policy v2 already exists and is immutable/i);
    expect(readFileSync(join(root, 'policy.json'))).toEqual(policyBefore);
    expect(readFileSync(join(root, 'receipt.json'))).toEqual(receiptBefore);
  });

  it('rejects apply-v2 input/output aliases before mutating the matrix', () => {
    const root = temporaryRoot();
    writeCanonical(join(root, 'matrix.json'), finalMatrixV2Fixture());
    const before = readFileSync(join(root, 'matrix.json'));
    const result = run([
      script,
      'apply-v2',
      '--dry-run',
      '--root', root,
      '--matrix', 'matrix.json',
      '--implementation-commit-ref', implementationCommitSha,
      '--out', 'matrix.json',
    ], '');
    expect(result.status).toBe(2);
    expect(result.stderr).toMatch(/same file|alias|distinct/i);
    expect(readFileSync(join(root, 'matrix.json'))).toEqual(before);
  });
});

describe('CAL-002 catalog CLI', () => {
  function catalogArgs(
    root: string,
    cal001Matrix = 'cal001-matrix.json',
    out = 'generated/catalog.json',
  ): readonly string[] {
    return [
      script,
      'catalog',
      '--root', root,
      '--cal001-matrix', cal001Matrix,
      '--out', out,
    ];
  }

  it('builds the locked catalog from a real /private/tmp CAL-001 matrix and replays exact bytes', () => {
    const recordedMatrixPath = '/private/tmp/cal-001-v1-decision-matrix-2026-07-17.json';
    let matrixPath = recordedMatrixPath;
    let matrixSha256: string;
    if (existsSync(recordedMatrixPath)) {
      matrixSha256 = canonicalArtifact(JSON.parse(readFileSync(recordedMatrixPath, 'utf8'))).sha256;
    } else {
      const sourceRoot = temporaryPrivateTmpRoot();
      const matrixResult = cal001MatrixFixture(sourceRoot);
      matrixPath = join(sourceRoot, 'cal001-matrix.json');
      writeFileSync(matrixPath, `${canonicalArtifact(matrixResult.matrix).json}\n`, { mode: 0o600 });
      matrixSha256 = matrixResult.matrixSha256;
    }
    const root = temporaryPrivateTmpRoot();
    const args = catalogArgs(root, matrixPath);

    const first = run(args, '', root);

    expect(first.status).toBe(0);
    expect(first.stdout.trim().split('\n')).toHaveLength(1);
    const output = JSON.parse(first.stdout) as {
      readonly ok: boolean;
      readonly command: string;
      readonly status: string;
      readonly catalogSha256: string;
      readonly counts: Record<string, number>;
      readonly admitted: boolean;
      readonly applied: boolean;
    };
    expect(output).toMatchObject({
      ok: true,
      command: 'catalog',
      status: 'completed',
      counts: {
        total: 119,
        startingQuality: 47,
        startingOrigin: 72,
        ownerReviewRequired: 40,
        deterministic: 32,
        contextual: 11,
        statistical: 4,
      },
      admitted: false,
      applied: false,
    });
    const catalogPath = join(root, 'generated', 'catalog.json');
    const catalogBytes = readFileSync(catalogPath, 'utf8');
    const catalog = JSON.parse(catalogBytes) as {
      readonly cal001MatrixSha256: string;
      readonly ruleCatalogSha256: string;
      readonly rows: readonly unknown[];
      readonly counts: Record<string, number>;
      readonly admitted: false;
      readonly applied: false;
    };
    expect(catalogBytes).toBe(canonicalArtifact(catalog).json);
    expect(catalogBytes).not.toContain(root);
    expect(catalog).toMatchObject({
      cal001MatrixSha256: matrixSha256,
      ruleCatalogSha256: CAL002_LOCKED_RULE_CATALOG_SHA256,
      rows: expect.any(Array),
      counts: output.counts,
      admitted: false,
      applied: false,
    });
    expect(catalog.rows).toHaveLength(119);
    expect(statSync(catalogPath).mode & 0o777).toBe(0o600);
    expect(output.catalogSha256).toBe(canonicalArtifact(catalog).sha256);
    expect(catalog.cal001MatrixSha256).toBe(matrixSha256);

    const firstBytes = catalogBytes;
    const replay = run(args, '', root);

    expect(replay.status).toBe(0);
    expect(JSON.parse(replay.stdout)).toMatchObject({
      ok: true,
      command: 'catalog',
      status: 'completed',
      catalogSha256: output.catalogSha256,
      counts: output.counts,
      admitted: false,
      applied: false,
    });
    expect(readFileSync(catalogPath, 'utf8')).toBe(firstBytes);
  });

  it('rejects missing, non-canonical, admitted, applied, and malformed matrices before output mutation', () => {
    const missingRoot = temporaryPrivateTmpRoot();
    const missing = run(catalogArgs(missingRoot), '', missingRoot);
    expect(missing.status).toBe(2);
    expect(missing.stderr).toMatch(/ENOENT|cal-001|matrix/i);
    expect(() => readFileSync(join(missingRoot, 'generated', 'catalog.json'))).toThrow();

    const nonCanonicalRoot = temporaryPrivateTmpRoot();
    const nonCanonicalMatrix = cal001MatrixFixture(nonCanonicalRoot).matrix;
    writeFileSync(join(nonCanonicalRoot, 'cal001-matrix.json'), `${JSON.stringify(nonCanonicalMatrix)}\n`, { mode: 0o600 });
    const nonCanonical = run(catalogArgs(nonCanonicalRoot), '', nonCanonicalRoot);
    expect(nonCanonical.status).toBe(2);
    expect(nonCanonical.stderr).toMatch(/canonical/i);
    expect(() => readFileSync(join(nonCanonicalRoot, 'generated', 'catalog.json'))).toThrow();

    for (const [label, mutation] of [
      ['admitted', { admitted: true }],
      ['applied', { applied: true }],
      ['malformed', { rows: [] }],
    ] as const) {
      const root = temporaryPrivateTmpRoot();
      const fixture = cal001MatrixFixture(root).matrix;
      writeCanonical(join(root, 'cal001-matrix.json'), { ...fixture, ...mutation });
      const result = run(catalogArgs(root), '', root);
      expect(result.status, label).toBe(2);
      expect(result.stderr, label).toMatch(/CAL-001|matrix|admitted|applied|catalog/i);
      expect(() => readFileSync(join(root, 'generated', 'catalog.json'))).toThrow();
    }

    const mismatchedEvidenceRoot = temporaryPrivateTmpRoot();
    const evidenceFixture = cal001MatrixFixture(mismatchedEvidenceRoot).matrix;
    const mismatchedEvidence = {
      ...evidenceFixture,
      rows: evidenceFixture.rows.map((row, index) => index === 0
        ? { ...row, evidence: { ...row.evidence, metricsSha256: '4'.repeat(64) } }
        : row),
    };
    writeCanonical(join(mismatchedEvidenceRoot, 'cal001-matrix.json'), mismatchedEvidence);
    const mismatch = run(catalogArgs(mismatchedEvidenceRoot), '', mismatchedEvidenceRoot);
    expect(mismatch.status).toBe(2);
    expect(mismatch.stderr).toMatch(/does not match the matrix/i);
    expect(() => readFileSync(join(mismatchedEvidenceRoot, 'generated', 'catalog.json'))).toThrow();
  });
});

describe('CAL-002 authority CLI migration', () => {
  function authorityStatePath(root: string): string {
    return join(root, AUTHORITY_STATE_RELATIVE_PATH);
  }

  function authorityArgs(root: string): readonly string[] {
    return [
      script,
      'classify-authority',
      '--root', root,
      '--catalog', 'catalog.json',
      '--prior-state', 'origin-state.json',
      '--proposal-out', 'authority-proposal.json',
      '--state-out', AUTHORITY_STATE_RELATIVE_PATH,
      '--receipt-out', 'authority-receipt.json',
    ];
  }

  it('refuses the v1 questionnaire before legacy argument parsing and preserves its bytes', () => {
    const root = temporaryRoot();
    const prior = priorOriginStateFixture(root);

    const result = run([
      script,
      'classify-origin',
      '--state', join(root, 'origin-state.json'),
    ], '1\n', root);

    expect(result.status).toBe(2);
    expect(result.stderr).toContain('classify-authority');
    expect(result.stderr).toContain('v1 state remains immutable');
    expect(result.stderr).not.toMatch(/requires --catalog|hold-origin-default-off|transfer-to-quality/i);
    expect(JSON.parse(result.stdout)).toMatchObject({ ok: false, command: 'classify-origin' });
    expect(sha256(readFileSync(join(root, 'origin-state.json'), 'utf8'))).toBe(prior.sha256);
    expect(readFileSync(join(root, 'origin-state.json'), 'utf8')).toBe(prior.bytes);
  });

  it('approves the exact batch with canonical private artifacts and association-free binding', () => {
    const root = temporaryRoot();
    originCatalogFixture(root);
    const prior = priorOriginStateFixture(root);

    const result = run(authorityArgs(root), '1\n', root);

    expect(result.status).toBe(0);
    expect(JSON.parse(result.stdout)).toMatchObject({
      ok: true,
      command: 'classify-authority',
      status: 'approved',
      admitted: false,
      applied: false,
    });
    expect(result.stderr).toContain('26 transfer / 4 blocked / 3 supersede / 7 retire');
    const proposalBytes = readFileSync(join(root, 'authority-proposal.json'), 'utf8');
    const stateBytes = readFileSync(authorityStatePath(root), 'utf8');
    const receiptBytes = readFileSync(join(root, 'authority-receipt.json'), 'utf8');
    const proposal = JSON.parse(proposalBytes) as { rows: readonly { sourceClass: string }[]; admitted: boolean; applied: boolean };
    const state = JSON.parse(stateBytes) as { proposalSha256: string; decision: string; admitted: boolean; applied: boolean };
    const receipt = JSON.parse(receiptBytes) as {
      proposalSha256: string;
      decision: string;
      rows: readonly { sourceClass: string }[];
      admitted: boolean;
      applied: boolean;
    };
    const gateSha256 = authorityProposalSha256V2(proposal as Parameters<typeof authorityProposalSha256V2>[0]);
    expect(gateSha256).not.toBe(canonicalArtifact(proposal).sha256);
    expect(state).toMatchObject({ proposalSha256: gateSha256, decision: 'approved', admitted: false, applied: false });
    expect(receipt).toMatchObject({ proposalSha256: gateSha256, decision: 'approved', admitted: false, applied: false });
    expect(proposal.rows).toHaveLength(119);
    expect(proposal.rows.filter((row) => row.sourceClass === 'owner-batch')).toHaveLength(40);
    expect(receipt.rows).toHaveLength(119);
    expect(receipt.rows.filter((row) => row.sourceClass === 'owner-batch')).toHaveLength(40);
    expect(proposalBytes).toBe(canonicalArtifact(proposal).json);
    expect(stateBytes).toBe(canonicalArtifact(state).json);
    expect(receiptBytes).toBe(canonicalArtifact(receipt).json);
    expect(statSync(join(root, 'authority-proposal.json')).mode & 0o777).toBe(0o600);
    expect(statSync(authorityStatePath(root)).mode & 0o777).toBe(0o600);
    expect(statSync(join(root, 'authority-receipt.json')).mode & 0o777).toBe(0o600);
    expect(sha256(readFileSync(join(root, 'origin-state.json'), 'utf8'))).toBe(prior.sha256);

    const replay = run(authorityArgs(root), '', root);
    expect(replay.status).toBe(0);
    expect(JSON.parse(replay.stdout)).toMatchObject({ status: 'approved', proposalSha256: gateSha256 });
    expect(readFileSync(join(root, 'authority-proposal.json'), 'utf8')).toBe(proposalBytes);
    expect(readFileSync(authorityStatePath(root), 'utf8')).toBe(stateBytes);
    expect(readFileSync(join(root, 'authority-receipt.json'), 'utf8')).toBe(receiptBytes);
  });

  it('writes only rejected v2 state and keeps that decision closed', () => {
    const root = temporaryRoot();
    originCatalogFixture(root);
    const prior = priorOriginStateFixture(root);

    const result = run(authorityArgs(root), '2\n', root);

    expect(result.status).toBe(2);
    expect(JSON.parse(result.stdout)).toMatchObject({
      ok: true,
      command: 'classify-authority',
      status: 'rejected',
      admitted: false,
      applied: false,
    });
    const stateBytes = readFileSync(authorityStatePath(root), 'utf8');
    const state = JSON.parse(stateBytes) as { decision: string; admitted: boolean; applied: boolean };
    expect(state).toMatchObject({ decision: 'rejected', admitted: false, applied: false });
    expect(stateBytes).toBe(canonicalArtifact(state).json);
    expect(statSync(authorityStatePath(root)).mode & 0o777).toBe(0o600);
    expect(existsSync(join(root, 'authority-proposal.json'))).toBe(false);
    expect(existsSync(join(root, 'authority-receipt.json'))).toBe(false);
    expect(sha256(readFileSync(join(root, 'origin-state.json'), 'utf8'))).toBe(prior.sha256);

    const replay = run(authorityArgs(root), '1\n', root);
    expect(replay.status).toBe(2);
    expect(JSON.parse(replay.stdout)).toMatchObject({ ok: true, status: 'rejected' });
    expect(readFileSync(authorityStatePath(root), 'utf8')).toBe(stateBytes);
    expect(existsSync(join(root, 'authority-proposal.json'))).toBe(false);
    expect(existsSync(join(root, 'authority-receipt.json'))).toBe(false);
  });

  it('makes a canonical rejection terminal before a sequential alternate state path can prompt or mutate', () => {
    const root = temporaryRoot();
    originCatalogFixture(root);
    priorOriginStateFixture(root);

    const rejected = run(authorityArgs(root), '2\n', root);
    expect(rejected.status).toBe(2);
    const rejectedStateBytes = readFileSync(authorityStatePath(root), 'utf8');
    const alternateState = 'alternate/authority-state-v2.json';
    const alternateArgs = authorityArgs(root).map((token, index, tokens) => (
      tokens[index - 1] === '--state-out' ? alternateState : token
    ));

    const bypass = run(alternateArgs, '1\n', root);

    expect(bypass.status).toBe(2);
    expect(bypass.stderr).toContain(AUTHORITY_STATE_RELATIVE_PATH);
    expect(bypass.stderr).not.toContain('CAL-002 authority batch:');
    expect(readFileSync(authorityStatePath(root), 'utf8')).toBe(rejectedStateBytes);
    expect(existsSync(join(root, 'alternate'))).toBe(false);
    expect(existsSync(join(root, 'authority-proposal.json'))).toBe(false);
    expect(existsSync(join(root, 'authority-receipt.json'))).toBe(false);
  });

  it('rejects concurrent same-proposal alternate state paths before prompting or output mutation', async () => {
    const root = temporaryRoot();
    originCatalogFixture(root);
    priorOriginStateFixture(root);
    const withState = (relativePath: string): readonly string[] => authorityArgs(root).map((token, index, tokens) => (
      tokens[index - 1] === '--state-out' ? relativePath : token
    ));

    const [first, second] = await Promise.all([
      runAsync(withState('alternate-a/authority-state-v2.json'), '1\n', root),
      runAsync(withState('alternate-b/authority-state-v2.json'), '1\n', root),
    ]);

    expect([first.status, second.status]).toEqual([2, 2]);
    expect(first.stderr).toContain(AUTHORITY_STATE_RELATIVE_PATH);
    expect(second.stderr).toContain(AUTHORITY_STATE_RELATIVE_PATH);
    expect(first.stderr).not.toContain('CAL-002 authority batch:');
    expect(second.stderr).not.toContain('CAL-002 authority batch:');
    expect(existsSync(join(root, '.slopbrick'))).toBe(false);
    expect(existsSync(join(root, 'alternate-a'))).toBe(false);
    expect(existsSync(join(root, 'alternate-b'))).toBe(false);
    expect(existsSync(join(root, 'authority-proposal.json'))).toBe(false);
    expect(existsSync(join(root, 'authority-receipt.json'))).toBe(false);
  });

  it('rejects full-fold authority destination aliases before lock, prompt, or mutation', () => {
    const aliases = [
      ['ASCII case', 'Authority-Proposal.json', 'authority-proposal.json'],
      ['sharp s', 'authority-proposal-\u00df.json', 'authority-proposal-SS.json'],
      ['sigma', 'authority-proposal-\u03a3.json', 'authority-proposal-\u03c2.json'],
    ] as const;

    for (const [label, proposalOut, receiptOut] of aliases) {
      const root = temporaryRoot();
      originCatalogFixture(root);
      const prior = priorOriginStateFixture(root);
      const args = [
        script,
        'classify-authority',
        '--root', root,
        '--catalog', 'catalog.json',
        '--prior-state', 'origin-state.json',
        '--proposal-out', proposalOut,
        '--state-out', AUTHORITY_STATE_RELATIVE_PATH,
        '--receipt-out', receiptOut,
      ];

      const result = run(args, '1\n', root);

      expect(result.status, label).toBe(2);
      expect(result.stderr, label).toMatch(/alias|collision|distinct/i);
      expect(result.stderr, label).not.toContain('CAL-002 authority batch:');
      expect(existsSync(join(root, proposalOut)), label).toBe(false);
      expect(existsSync(join(root, receiptOut)), label).toBe(false);
      expect(existsSync(authorityStatePath(root)), label).toBe(false);
      expect(existsSync(join(root, '.slopbrick')), label).toBe(false);
      expect(sha256(readFileSync(join(root, 'origin-state.json'), 'utf8')), label).toBe(prior.sha256);
    }
  });

  it('rejects ASCII I aliases under a Turkish process locale before lock, prompt, or mutation', () => {
    const root = temporaryRoot();
    originCatalogFixture(root);
    const prior = priorOriginStateFixture(root);
    const proposalOut = 'authority-FILE.json';
    const receiptOut = 'authority-file.json';
    const args = [
      script,
      'classify-authority',
      '--root', root,
      '--catalog', 'catalog.json',
      '--prior-state', 'origin-state.json',
      '--proposal-out', proposalOut,
      '--state-out', AUTHORITY_STATE_RELATIVE_PATH,
      '--receipt-out', receiptOut,
    ];

    const result = run(args, '1\n', root, {
      ...process.env,
      LANG: 'tr_TR.UTF-8',
      LC_ALL: 'tr_TR.UTF-8',
    });

    expect(result.status).toBe(2);
    expect(result.stderr).toMatch(/alias|collision|distinct/i);
    expect(result.stderr).not.toContain('CAL-002 authority batch:');
    expect(existsSync(join(root, proposalOut))).toBe(false);
    expect(existsSync(join(root, receiptOut))).toBe(false);
    expect(existsSync(authorityStatePath(root))).toBe(false);
    expect(existsSync(join(root, '.slopbrick'))).toBe(false);
    expect(sha256(readFileSync(join(root, 'origin-state.json'), 'utf8'))).toBe(prior.sha256);
  });

  it('rejects artifacts aliasing authority state lock destinations before mutation', () => {
    const lockAliases = [
      ['writer lock', '.slopbrick/calibration/cal-002/.authority-state-v2.json.lock'],
      ['full-fold session lock', '.slopbrick/calibration/cal-002/.authority-state-v2.json.se\u00dfion.lock'],
    ] as const;

    for (const [label, proposalOut] of lockAliases) {
      const root = temporaryRoot();
      originCatalogFixture(root);
      const prior = priorOriginStateFixture(root);
      const args = authorityArgs(root).map((token, index, tokens) => (
        tokens[index - 1] === '--proposal-out' ? proposalOut : token
      ));

      const result = run(args, '1\n', root);

      expect(result.status, label).toBe(2);
      expect(result.stderr, label).toMatch(/reserved|alias|collision|distinct/i);
      expect(result.stderr, label).not.toContain('CAL-002 authority batch:');
      expect(existsSync(join(root, proposalOut)), label).toBe(false);
      expect(existsSync(authorityStatePath(root)), label).toBe(false);
      expect(existsSync(join(root, 'authority-receipt.json')), label).toBe(false);
      expect(existsSync(join(root, '.slopbrick')), label).toBe(false);
      expect(sha256(readFileSync(join(root, 'origin-state.json'), 'utf8')), label).toBe(prior.sha256);
    }
  });

  it('rejects invalid UTF-8 prior v1 bytes before prompt or output mutation', () => {
    const root = temporaryRoot();
    originCatalogFixture(root);
    const prior = priorOriginStateFixture(root);
    const priorBytes = Buffer.from(prior.bytes, 'utf8');
    const statusOffset = prior.bytes.indexOf('in-progress');
    priorBytes[statusOffset] = 0xff;
    writeFileSync(join(root, 'origin-state.json'), priorBytes, { mode: 0o600 });

    const result = run(authorityArgs(root), '1\n', root);

    expect(result.status).toBe(2);
    expect(result.stderr).toMatch(/UTF-8/i);
    expect(result.stderr).not.toContain('CAL-002 authority batch:');
    expect(existsSync(join(root, 'authority-proposal.json'))).toBe(false);
    expect(existsSync(authorityStatePath(root))).toBe(false);
    expect(existsSync(join(root, 'authority-receipt.json'))).toBe(false);
    expect(readFileSync(join(root, 'origin-state.json'))).toEqual(priorBytes);
  });

  it('holds an exclusive session lock across the read-decide-write lifecycle', () => {
    const root = temporaryRoot();
    originCatalogFixture(root);
    priorOriginStateFixture(root);
    mkdirSync(join(root, '.slopbrick/calibration/cal-002'), { recursive: true, mode: 0o700 });
    writeFileSync(join(root, '.slopbrick/calibration/cal-002/.authority-state-v2.json.session.lock'), '', { mode: 0o600 });

    const result = run(authorityArgs(root), '1\n', root);

    expect(result.status).toBe(2);
    expect(result.stderr).toMatch(/authority.*session.*locked/i);
    expect(existsSync(join(root, 'authority-proposal.json'))).toBe(false);
    expect(existsSync(authorityStatePath(root))).toBe(false);
    expect(existsSync(join(root, 'authority-receipt.json'))).toBe(false);
  });
});

describe('CAL-002 quality disposition CLI', () => {
  it('writes an immutable 32-row zero-label closeout without admission or application', () => {
    const root = temporaryRoot();
    approvedAuthorityReceiptFixture(root);

    const result = run([
      script,
      'quality-closeout',
      '--root', root,
      '--authority', 'authority-receipt.json',
      '--out', 'quality-disposition.json',
      '--implementation-commit-sha', implementationCommitSha,
    ], '', root);

    expect(result.status).toBe(0);
    expect(JSON.parse(result.stdout)).toMatchObject({
      ok: true,
      command: 'quality-closeout',
      status: 'completed',
      rows: 32,
      selectedRuleIds: [],
      admitted: false,
      applied: false,
    });
    const bytes = readFileSync(join(root, 'quality-disposition.json'), 'utf8');
    const disposition = JSON.parse(bytes) as {
      selectedRuleIds: readonly string[];
      rows: readonly {
        measurementStatus: string;
        sampleCounts: { findings: number; controls: number; cannotDetermine: number };
        runtimeOutcome: string;
      }[];
      admitted: boolean;
      applied: boolean;
    };
    expect(disposition.rows).toHaveLength(32);
    expect(disposition.selectedRuleIds).toEqual([]);
    expect(disposition.rows.every((row) =>
      row.measurementStatus === 'not-requested-owner-capacity'
      && row.sampleCounts.findings === 0
      && row.sampleCounts.controls === 0
      && row.sampleCounts.cannotDetermine === 0
      && row.runtimeOutcome === 'quality-candidate-default-off')).toBe(true);
    expect(disposition).toMatchObject({ admitted: false, applied: false });
    expect(bytes).toBe(canonicalArtifact(disposition).json);
    expect(statSync(join(root, 'quality-disposition.json')).mode & 0o777).toBe(0o600);

    const replay = run([
      script,
      'quality-closeout',
      '--root', root,
      '--authority', 'authority-receipt.json',
      '--out', 'quality-disposition.json',
      '--implementation-commit-sha', implementationCommitSha,
    ], 'unused-label-input\n', root);
    expect(replay.status).toBe(0);
    expect(readFileSync(join(root, 'quality-disposition.json'), 'utf8')).toBe(bytes);
  });

  it('parses repeated selections into a private, deduplicated reach-qualified cohort without mutating closeout', () => {
    const root = temporaryRoot();
    approvedAuthorityReceiptFixture(root);
    const closeout = run([
      script,
      'quality-closeout',
      '--root', root,
      '--authority', 'authority-receipt.json',
      '--out', 'quality-disposition.json',
      '--implementation-commit-sha', implementationCommitSha,
    ], '', root);
    expect(closeout.status).toBe(0);
    const closeoutBytes = readFileSync(join(root, 'quality-disposition.json'), 'utf8');
    writeCanonical(join(root, 'quality-reach.json'), [
      { ruleId: 'layout/gap-monopoly', findings: 30, controls: 30, familyCount: 5 },
      { ruleId: 'ai/any-density', findings: 35, controls: 32, familyCount: 6 },
    ]);

    const result = run([
      script,
      'plan-quality-cohort',
      '--root', root,
      '--authority', 'authority-receipt.json',
      '--reach', 'quality-reach.json',
      '--select', 'layout/gap-monopoly',
      '--select', 'ai/any-density',
      '--out', QUALITY_COHORT_RELATIVE_PATH,
    ], '', root);

    expect(result.status).toBe(0);
    expect(JSON.parse(result.stdout)).toMatchObject({
      ok: true,
      command: 'plan-quality-cohort',
      status: 'planned',
      selectedRuleIds: ['ai/any-density', 'layout/gap-monopoly'],
      initialLabels: 120,
      maximumLabels: 400,
      admitted: false,
      applied: false,
    });
    const cohortPath = join(root, QUALITY_COHORT_RELATIVE_PATH);
    const cohortBytes = readFileSync(cohortPath, 'utf8');
    const cohort = JSON.parse(cohortBytes);
    expect(cohort).toEqual({
      initialLabels: 120,
      maximumLabels: 400,
      selectedRuleIds: ['ai/any-density', 'layout/gap-monopoly'],
    });
    expect(cohortBytes).toBe(canonicalArtifact(cohort).json);
    expect(statSync(cohortPath).mode & 0o777).toBe(0o600);
    expect(readFileSync(join(root, 'quality-disposition.json'), 'utf8')).toBe(closeoutBytes);

    const duplicate = run([
      script,
      'plan-quality-cohort',
      '--root', root,
      '--authority', 'authority-receipt.json',
      '--reach', 'quality-reach.json',
      '--select', 'ai/any-density',
      '--select', 'ai/any-density',
      '--out', QUALITY_COHORT_RELATIVE_PATH,
    ], '', root);
    expect(duplicate.status).toBe(2);
    expect(duplicate.stderr).toMatch(/unique/i);
    expect(readFileSync(cohortPath, 'utf8')).toBe(cohortBytes);
  });

  it.each([
    ['the existing quality disposition', 'quality-disposition.json'],
    ['the protected origin state', PROTECTED_ORIGIN_STATE_RELATIVE_PATH],
  ] as const)('rejects cohort output aliasing %s without changing bytes or mode', (_label, destination) => {
    const root = temporaryRoot();
    approvedAuthorityReceiptFixture(root);
    writeCanonical(join(root, 'quality-reach.json'), []);
    if (destination === 'quality-disposition.json') {
      const closeout = run([
        script,
        'quality-closeout',
        '--root', root,
        '--authority', 'authority-receipt.json',
        '--out', destination,
        '--implementation-commit-sha', implementationCommitSha,
      ], '', root);
      expect(closeout.status).toBe(0);
    } else {
      mkdirSync(join(root, '.slopbrick/calibration/cal-002'), { recursive: true, mode: 0o700 });
      writeCanonical(join(root, destination), {
        version: 'cal-002-origin-state-v1',
        status: 'protected-test-fixture',
      });
    }
    const destinationPath = join(root, destination);
    const bytesBefore = readFileSync(destinationPath, 'utf8');
    const modeBefore = statSync(destinationPath).mode & 0o777;

    const result = run([
      script,
      'plan-quality-cohort',
      '--root', root,
      '--authority', 'authority-receipt.json',
      '--reach', 'quality-reach.json',
      '--out', destination,
    ], '', root);

    expect(result.status).toBe(2);
    expect(result.stderr).toContain(QUALITY_COHORT_RELATIVE_PATH);
    expect(readFileSync(destinationPath, 'utf8')).toBe(bytesBefore);
    expect(statSync(destinationPath).mode & 0o777).toBe(modeBefore);
    expect(existsSync(join(root, QUALITY_COHORT_RELATIVE_PATH))).toBe(false);
  });

  it('rejects a noncanonical cohort output before reading authority or reach artifacts', () => {
    const root = temporaryRoot();
    const result = run([
      script,
      'plan-quality-cohort',
      '--root', root,
      '--authority', 'missing-authority.json',
      '--reach', 'missing-reach.json',
      '--out', 'quality-disposition.json',
    ], '', root);

    expect(result.status).toBe(2);
    expect(result.stderr).toMatch(/--out.*must resolve.*quality-cohort-v2\.json/i);
    expect(result.stderr).not.toMatch(/ENOENT|missing-authority|missing-reach/i);
    expect(existsSync(join(root, QUALITY_COHORT_RELATIVE_PATH))).toBe(false);
  });
});

describe('CAL-002 research-origin v2 CLI', () => {
  it.runIf([
    RECORDED_HOLDOUT_RECEIPT_PATH,
    RECORDED_METRICS_PATH,
    RECORDED_MATRIX_PATH,
  ].every((path) => existsSync(path)))(
    'reuses the exact frozen local identity into a temporary closed receipt',
    () => {
      const root = temporaryRepositoryRoot();
      approvedAuthorityReceiptFixture(root);
      const out = 'origin-receipt-v2.json';
      const result = run([
        script,
        'verify-origin-v2',
        '--root', root,
        '--authority', 'authority-receipt.json',
        '--corpus-root', join(root, 'must-not-run'),
        '--out', out,
        '--implementation-commit-sha', implementationCommitSha,
      ], '', root, {
        ...process.env,
        CAL002_ORIGIN_HOLDOUT_RECEIPT_PATH: RECORDED_HOLDOUT_RECEIPT_PATH,
        CAL002_ORIGIN_METRICS_PATH: RECORDED_METRICS_PATH,
        CAL002_ORIGIN_MATRIX_PATH: RECORDED_MATRIX_PATH,
      });

      expect(result.status).toBe(0);
      expect(result.stderr).toBe('');
      expect(JSON.parse(result.stdout)).toMatchObject({
        ok: true,
        command: 'verify-origin-v2',
        status: 'reused',
        rows: 32,
        admitted: false,
      });
      expect(JSON.parse(readFileSync(join(root, out), 'utf8'))).toMatchObject({
        status: 'reused',
        governingHashes: CAL002_ORIGIN_FROZEN_GOVERNING_HASHES,
        admitted: false,
      });
      expect(existsSync(join(root, 'must-not-run'))).toBe(false);
    },
  );

  it('fails closed without complete hash or one-worker rerun evidence and writes no receipt', () => {
    const root = temporaryRepositoryRoot();
    approvedAuthorityReceiptFixture(root);
    const corpusRoot = join(root, 'empty-corpus');
    mkdirSync(corpusRoot, { recursive: true, mode: 0o700 });
    const out = 'origin-receipt-v2.json';
    const fakeTools = fakeHistoricalRerunTools(root);
    const missingEvidenceEnvironment = {
      ...process.env,
      PATH: `${fakeTools.bin}${delimiter}${process.env.PATH ?? ''}`,
      CAL002_ORIGIN_HOLDOUT_RECEIPT_PATH: join(root, 'missing-holdout.json'),
      CAL002_ORIGIN_METRICS_PATH: join(root, 'missing-metrics.json'),
      CAL002_ORIGIN_MATRIX_PATH: join(root, 'missing-matrix.json'),
      CAL002_TEST_TOOL_DRIVER: fakeTools.driverPath,
      CAL002_TEST_TOOL_LOG: fakeTools.logPath,
      CAL002_TEST_FAIL_HOLDOUT: '1',
    };

    const result = run([
      script,
      'verify-origin-v2',
      '--root', root,
      '--authority', 'authority-receipt.json',
      '--corpus-root', corpusRoot,
      '--out', out,
    ], '', root, missingEvidenceEnvironment);

    expect(result.status).toBe(2);
    expect(result.stderr).toMatch(/CAL-001|governing|hash|rerun|projection/i);
    expect(result.stderr).not.toMatch(/Usage: cal:complete/i);
    expect(existsSync(join(root, out))).toBe(false);
  });

  it('uses exact detached historical evaluators offline and removes both rerun worktrees', () => {
    const root = temporaryRepositoryRoot();
    approvedAuthorityReceiptFixture(root);
    const corpusRoot = join(root, 'safe-empty-corpus');
    mkdirSync(corpusRoot, { recursive: true, mode: 0o700 });
    const fixtures = historicalRerunArtifactsFixture(root);
    const fakeTools = fakeHistoricalRerunTools(root);
    const out = 'origin-receipt-v2.json';
    const result = run([
      script,
      'verify-origin-v2',
      '--root', root,
      '--authority', 'authority-receipt.json',
      '--corpus-root', corpusRoot,
      '--out', out,
      '--implementation-commit-sha', implementationCommitSha,
    ], '', root, {
      ...process.env,
      PATH: `${fakeTools.bin}${delimiter}${process.env.PATH ?? ''}`,
      CAL002_ORIGIN_HOLDOUT_RECEIPT_PATH: join(root, 'missing-holdout.json'),
      CAL002_ORIGIN_METRICS_PATH: join(root, 'missing-metrics.json'),
      CAL002_ORIGIN_MATRIX_PATH: join(root, 'missing-matrix.json'),
      CAL002_TEST_TOOL_DRIVER: fakeTools.driverPath,
      CAL002_TEST_TOOL_LOG: fakeTools.logPath,
      CAL002_TEST_HOLDOUT_FIXTURE: fixtures.holdoutReceiptPath,
      CAL002_TEST_METRICS_FIXTURE: fixtures.metricsPath,
      CAL002_TEST_MATRIX_FIXTURE: fixtures.matrixPath,
    });

    expect(result.status).toBe(2);
    expect(result.stderr).toMatch(/governing|rerun|required/i);
    expect(result.stderr).toMatch(/reducerSha256/i);
    expect(existsSync(join(root, out))).toBe(false);

    const entries = readFileSync(fakeTools.logPath, 'utf8').trim().split('\n').map((line) => (
      JSON.parse(line) as {
        readonly tool: string;
        readonly cwd: string;
        readonly args: readonly string[];
        readonly corepackNetwork?: string;
      }
    ));
    const additions = entries.filter((entry) =>
      entry.tool === 'git' && entry.args[0] === 'worktree' && entry.args[1] === 'add');
    expect(additions.map((entry) => [entry.args[2], entry.args[4]])).toEqual([
      ['--detach', FROZEN_HOLDOUT_COMMIT_SHA],
      ['--detach', FROZEN_DECISION_COMMIT_SHA],
    ]);
    const holdoutCheckout = additions[0]!.args[3]!;
    const decisionCheckout = additions[1]!.args[3]!;

    const corepack = entries.filter((entry) => entry.tool === 'corepack');
    expect(corepack.filter((entry) => entry.args[1] === 'install').map((entry) => [
      entry.cwd,
      entry.args,
      entry.corepackNetwork,
    ])).toEqual([
      [holdoutCheckout, ['pnpm', 'install', '--offline', '--frozen-lockfile'], '0'],
      [decisionCheckout, ['pnpm', 'install', '--offline', '--frozen-lockfile'], '0'],
    ]);
    expect(corepack.filter((entry) => entry.args.at(-1) === 'build').map((entry) => [
      entry.cwd,
      entry.args,
    ])).toEqual([
      [holdoutCheckout, ['pnpm', '--filter', '@usebrick/core', 'build']],
      [holdoutCheckout, ['pnpm', '--filter', '@usebrick/engine', 'build']],
      [holdoutCheckout, ['pnpm', '--filter', 'slopbrick', 'build']],
      [decisionCheckout, ['pnpm', '--filter', '@usebrick/core', 'build']],
      [decisionCheckout, ['pnpm', '--filter', '@usebrick/engine', 'build']],
      [decisionCheckout, ['pnpm', '--filter', 'slopbrick', 'build']],
    ]);
    const holdoutRun = corepack.find((entry) => entry.args.includes('cal:corpus:v1-holdout'))!;
    expect(holdoutRun.cwd).toBe(holdoutCheckout);
    expect(holdoutRun.args[holdoutRun.args.indexOf('--implementation-commit-sha') + 1]).toBe(
      FROZEN_HOLDOUT_COMMIT_SHA,
    );
    const decisionRun = corepack.find((entry) => entry.args.includes('cal:corpus:v1-decisions'))!;
    expect(decisionRun.cwd).toBe(decisionCheckout);
    expect(decisionRun.args[decisionRun.args.indexOf('--holdout-implementation-commit-sha') + 1]).toBe(
      FROZEN_HOLDOUT_COMMIT_SHA,
    );
    expect(decisionRun.args[decisionRun.args.indexOf('--decision-implementation-commit-sha') + 1]).toBe(
      FROZEN_DECISION_COMMIT_SHA,
    );

    const removals = entries.filter((entry) =>
      entry.tool === 'git' && entry.args[0] === 'worktree' && entry.args[1] === 'remove');
    expect(removals.map((entry) => entry.args[3]).sort()).toEqual(
      [holdoutCheckout, decisionCheckout].sort(),
    );
    expect(existsSync(holdoutCheckout)).toBe(false);
    expect(existsSync(decisionCheckout)).toBe(false);
  });

  it.runIf([
    RECORDED_HOLDOUT_RECEIPT_PATH,
    RECORDED_METRICS_PATH,
    RECORDED_MATRIX_PATH,
  ].every((path) => existsSync(path)))(
    'completes an exact-hash injected historical rerun and writes only a temp receipt',
    () => {
      const root = temporaryRepositoryRoot();
      approvedAuthorityReceiptFixture(root);
      const corpusRoot = join(root, 'safe-empty-corpus');
      mkdirSync(corpusRoot, { recursive: true, mode: 0o700 });
      const reducerFixturePath = join(root, 'frozen-decision-reducer.ts');
      const reducer = spawnSync('git', [
        'show',
        `${FROZEN_DECISION_COMMIT_SHA}:packages/slopbrick/src/calibration/corpus-v1/calibration-decisions.ts`,
      ], {
        cwd: repositoryRoot,
        encoding: 'buffer',
        maxBuffer: 1024 * 1024,
      });
      expect(reducer.status).toBe(0);
      expect(createHash('sha256').update(reducer.stdout).digest('hex')).toBe(
        CAL002_ORIGIN_FROZEN_GOVERNING_HASHES.reducerSha256,
      );
      writeFileSync(reducerFixturePath, reducer.stdout, { mode: 0o600 });
      const fakeTools = fakeHistoricalRerunTools(root);
      const out = 'origin-receipt-v2.json';

      const result = run([
        script,
        'verify-origin-v2',
        '--root', root,
        '--authority', 'authority-receipt.json',
        '--corpus-root', corpusRoot,
        '--out', out,
        '--implementation-commit-sha', implementationCommitSha,
      ], '', root, {
        ...process.env,
        PATH: `${fakeTools.bin}${delimiter}${process.env.PATH ?? ''}`,
        CAL002_ORIGIN_HOLDOUT_RECEIPT_PATH: join(root, 'missing-holdout.json'),
        CAL002_ORIGIN_METRICS_PATH: join(root, 'missing-metrics.json'),
        CAL002_ORIGIN_MATRIX_PATH: join(root, 'missing-matrix.json'),
        CAL002_TEST_TOOL_DRIVER: fakeTools.driverPath,
        CAL002_TEST_TOOL_LOG: fakeTools.logPath,
        CAL002_TEST_HOLDOUT_FIXTURE: RECORDED_HOLDOUT_RECEIPT_PATH,
        CAL002_TEST_METRICS_FIXTURE: RECORDED_METRICS_PATH,
        CAL002_TEST_MATRIX_FIXTURE: RECORDED_MATRIX_PATH,
        CAL002_TEST_REDUCER_FIXTURE: reducerFixturePath,
      });

      expect(result.status).toBe(0);
      expect(result.stderr).toBe('');
      expect(JSON.parse(result.stdout)).toMatchObject({
        ok: true,
        command: 'verify-origin-v2',
        status: 'rerun-completed',
        rows: 32,
        admitted: false,
      });
      const receipt = JSON.parse(readFileSync(join(root, out), 'utf8')) as {
        readonly status: string;
        readonly governingHashes: unknown;
        readonly rows: readonly unknown[];
        readonly admitted: boolean;
      };
      expect(receipt).toMatchObject({
        status: 'rerun-completed',
        governingHashes: CAL002_ORIGIN_FROZEN_GOVERNING_HASHES,
        admitted: false,
      });
      expect(receipt.rows).toHaveLength(32);

      const entries = readFileSync(fakeTools.logPath, 'utf8').trim().split('\n').map((line) => (
        JSON.parse(line) as { readonly tool: string; readonly args: readonly string[] }
      ));
      const additions = entries.filter((entry) =>
        entry.tool === 'git' && entry.args[0] === 'worktree' && entry.args[1] === 'add');
      const removals = entries.filter((entry) =>
        entry.tool === 'git' && entry.args[0] === 'worktree' && entry.args[1] === 'remove');
      expect(additions).toHaveLength(2);
      expect(removals.map((entry) => entry.args[3]).sort()).toEqual(
        additions.map((entry) => entry.args[3]).sort(),
      );
      for (const addition of additions) expect(existsSync(addition.args[3]!)).toBe(false);
    },
  );

  it('rejects the protected v1 origin state as output before reading inputs', () => {
    const root = temporaryRoot();
    const protectedPath = join(root, PROTECTED_ORIGIN_STATE_RELATIVE_PATH);
    mkdirSync(join(root, '.slopbrick/calibration/cal-002'), { recursive: true, mode: 0o700 });
    writeCanonical(protectedPath, { version: 'cal-002-origin-state-v1', marker: 'unchanged' });
    const before = readFileSync(protectedPath, 'utf8');

    const result = run([
      script,
      'verify-origin-v2',
      '--root', root,
      '--authority', 'missing-authority.json',
      '--corpus-root', join(root, 'missing-corpus'),
      '--out', PROTECTED_ORIGIN_STATE_RELATIVE_PATH,
    ], '', root);

    expect(result.status).toBe(2);
    expect(result.stderr).toMatch(/protected.*origin state|artifact destinations|same file/i);
    expect(result.stderr).not.toMatch(/ENOENT|missing-authority|missing-corpus/i);
    expect(readFileSync(protectedPath, 'utf8')).toBe(before);
  });

  it.each([
    [
      'case-folded authority',
      '.SLOPBRICK/CALIBRATION/CAL-002/ORIGIN-STATE.JSON',
      'origin-receipt-v2.json',
    ],
    [
      'case-folded output',
      'missing-authority.json',
      '.SLOPBRICK/CALIBRATION/CAL-002/ORIGIN-STATE.JSON',
    ],
    [
      'NFKC-normalized output',
      'missing-authority.json',
      '.slopbrick/calibration/cal-002/origin-state\uff0ejson',
    ],
  ] as const)('rejects a %s alias of protected v1 state before reads or writes', (_label, authority, out) => {
    const root = temporaryRepositoryRoot();
    const protectedPath = join(root, PROTECTED_ORIGIN_STATE_RELATIVE_PATH);
    mkdirSync(join(root, '.slopbrick/calibration/cal-002'), { recursive: true, mode: 0o700 });
    writeCanonical(protectedPath, { version: 'cal-002-origin-state-v1', marker: 'unchanged' });
    const before = readFileSync(protectedPath, 'utf8');

    const result = run([
      script,
      'verify-origin-v2',
      '--root', root,
      '--authority', authority,
      '--corpus-root', join(root, 'must-not-be-read'),
      '--out', out,
      '--implementation-commit-sha', implementationCommitSha,
    ], '', root);

    expect(result.status).toBe(2);
    expect(result.stderr).toMatch(/protected|alias|collision|distinct/i);
    expect(result.stderr).not.toMatch(/ENOENT|missing-authority|must-not-be-read/i);
    expect(readFileSync(protectedPath, 'utf8')).toBe(before);
    if (out === 'origin-receipt-v2.json'
      || out.includes('\uff0e')) {
      expect(existsSync(join(root, out))).toBe(false);
    }
  });

  it.each([
    ['direct writer lock', '.slopbrick/calibration/cal-002/.origin-state.json.lock'],
    ['direct session lock', '.slopbrick/calibration/cal-002/.origin-state.json.session.lock'],
    ['Unicode case-folded writer lock', '.\u017flopbrick/calibration/cal-002/.origin-\u017ftate.json.lock'],
    ['Unicode case-folded session lock', '.\u017flopbrick/calibration/cal-002/.origin-\u017ftate.json.session.lock'],
    ['NFKC-normalized writer lock', '.slopbrick/calibration/cal-002/.origin-state\uff0ejson.lock'],
    ['NFKC-normalized session lock', '.slopbrick/calibration/cal-002/.origin-state\uff0ejson.session.lock'],
  ] as const)('rejects %s aliases of protected v1 private locks before reads or writes', (label, out) => {
    const root = temporaryRepositoryRoot();
    const protectedPath = join(root, PROTECTED_ORIGIN_STATE_RELATIVE_PATH);
    mkdirSync(join(root, '.slopbrick/calibration/cal-002'), { recursive: true, mode: 0o700 });
    writeCanonical(protectedPath, { version: 'cal-002-origin-state-v1', marker: 'unchanged' });
    const before = readFileSync(protectedPath, 'utf8');

    const result = run([
      script,
      'verify-origin-v2',
      '--root', root,
      '--authority', 'missing-authority.json',
      '--corpus-root', join(root, 'must-not-be-read'),
      '--out', out,
      '--implementation-commit-sha', implementationCommitSha,
    ], '', root);

    expect(result.status, label).toBe(2);
    expect(result.stderr, label).toMatch(/reserved|alias|collision|distinct/i);
    expect(result.stderr, label).not.toMatch(/ENOENT|missing-authority|must-not-be-read/i);
    expect(readFileSync(protectedPath, 'utf8'), label).toBe(before);
    expect(existsSync(join(root, out)), label).toBe(false);
  });
});
