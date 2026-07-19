/** Offline-only CAL-002 owner-review dispatcher. */
import { execFileSync } from 'node:child_process';
import { createHash, randomBytes } from 'node:crypto';
import { createInterface } from 'node:readline';
import { constants } from 'node:fs';
import { lstat, mkdir, mkdtemp, open, readFile, realpath, rename, rm, unlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { basename, dirname, isAbsolute, join, relative, resolve, sep, win32 } from 'node:path';

import { detectMonorepoRoot } from '../../src/config/detect/monorepo';
import {
  assertDistinctArtifactDestinations,
  readCanonicalArtifact,
  readPrivateCanonicalArtifact,
  readPrivateCanonicalArtifactWithBytes,
  readReviewReceipt,
  readReviewState,
  readVerifiedSource,
  readVerifiedSourcesByHash,
  withPrivateArtifactSessionLock,
  writeImmutableCanonicalReceipt,
  writeImmutableReceipt,
  writePrivateCanonicalState,
  writeReviewState,
} from '../../src/calibration/cal-002/artifact-io';
import { buildCAL002AuthorityProposalV2 } from '../../src/calibration/cal-002/authority';
import {
  completeCAL002AuthoritySessionV2,
  decideCAL002AuthoritySessionV2,
  startCAL002AuthoritySessionV2,
} from '../../src/calibration/cal-002/authority-session';
import {
  CAL002_LOCKED_RULE_CATALOG_SHA256,
  CAL002_PROTOCOL_VERSION,
  canonicalArtifact,
  assertCommitSha,
  assertSha256,
  validateCAL002Assignment,
  validateCAL002Catalog,
  type CAL002Catalog,
  type CAL002ReviewLabel,
} from '../../src/calibration/cal-002/contracts';
import {
  buildCAL002Catalog,
} from '../../src/calibration/cal-002/catalog';
import {
  CAL001_DECISION_MATRIX_VERSION,
  type CAL001DecisionMatrix,
  type CAL001DecisionRow,
} from '../../src/calibration/corpus-v1/calibration-decisions';
import { RuleRegistry } from '../../src/rules/registry';
import { getDefaultOffRules } from '../../src/rules/signal-strength';
import {
  buildCAL002ApplicationReceipt,
  buildCAL002MatrixApproval,
  buildCAL002PolicyArtifact,
  type CAL002MatrixApproval,
  type CAL002FinalMatrix,
  type SlopbrickRuleEvidencePolicy,
} from '../../src/calibration/cal-002/application';
import { buildCAL002FinalMatrix } from '../../src/calibration/cal-002/matrix';
import {
  assessCAL002CAL001Reuse,
  resolveCAL002OriginDecisions,
  type CAL002OriginDecisionRow,
  type CAL002OriginGoverningHashes,
  type CAL002OriginReceipt,
} from '../../src/calibration/cal-002/origin';
import {
  CAL002_ORIGIN_FROZEN_GOVERNING_HASHES,
  assertCAL002OriginReceiptV2,
  buildCAL002OriginReceiptV2,
  type CAL002OriginReceiptV2,
} from '../../src/calibration/cal-002/origin-v2';
import type { CAL002OracleReceipt } from '../../src/calibration/cal-002/oracles';
import type { CAL002QualityMetrics } from '../../src/calibration/cal-002/quality-metrics';
import type {
  CAL002QualityAssignment,
  CAL002QualityBlindedRow,
} from '../../src/calibration/cal-002/quality-sampling';
import {
  assertCAL002QualityCohortPlanV2,
  assertCAL002QualityDispositionV2,
  buildCAL002QualityDispositionV2,
  planCAL002QualityCohortV2,
  type CAL002QualityCohortPlanV2,
  type CAL002QualityDispositionV2,
  type CAL002QualityReachRowV2,
} from '../../src/calibration/cal-002/quality-disposition';
import {
  assertCAL002AuthorityProposalV2,
  assertCAL002AuthorityReceiptV2,
  assertCAL002AuthorityStateV2,
  type CAL002AuthorityProposalV2,
  type CAL002AuthorityReceiptV2,
  type CAL002AuthorityStateV2,
} from '../../src/calibration/cal-002/contracts-v2';
import {
  assertCAL002ReviewState,
  completeCAL002Review,
  nextCAL002ReviewId,
  recordCAL002Review,
  startCAL002Review,
  verifyCompletedCAL002ReviewReceipt,
  type CAL002ReviewState,
} from '../../src/calibration/cal-002/review-session';

const MENU = [
  '1 actionable-defect',
  '2 useful-no-safe-fix',
  '3 not-useful',
  '4 cannot-determine',
  'q save and quit',
].join('\n');

const LABEL_BY_KEY: Readonly<Record<string, CAL002ReviewLabel>> = {
  '1': 'actionable-defect',
  '2': 'useful-no-safe-fix',
  '3': 'not-useful',
  '4': 'cannot-determine',
};
const DISPLAY_SOURCE_BYTE_LIMIT = 16 * 1024;
const IMPLEMENTATION_SHA_ENV = 'CAL002_REVIEW_IMPLEMENTATION_COMMIT_SHA';
const LINE_WINDOW_LOCATOR = /^window:[a-f0-9]{64}$/u;

interface ReviewArguments {
  readonly command: 'review-quality';
  readonly root: string;
  readonly corpusRoot?: string;
  readonly assignment: string;
  readonly blindedBatch?: string;
  readonly sourceMap?: string;
  readonly state: string;
  readonly receipt: string;
  readonly implementationCommitSha?: string;
}

interface OriginArguments {
  readonly command: 'classify-origin';
  readonly root: string;
  readonly catalog: string;
  readonly state: string;
  readonly out: string;
}

interface AuthorityArguments {
  readonly command: 'classify-authority';
  readonly root: string;
  readonly catalog: string;
  readonly priorState: string;
  readonly proposalOut: string;
  readonly stateOut: string;
  readonly receiptOut: string;
}

interface QualityCloseoutArguments {
  readonly command: 'quality-closeout';
  readonly root: string;
  readonly authority: string;
  readonly out: string;
  readonly implementationCommitSha?: string;
}

interface PlanQualityCohortArguments {
  readonly command: 'plan-quality-cohort';
  readonly root: string;
  readonly authority: string;
  readonly reach: string;
  readonly selectedRuleIds: readonly string[];
  readonly out: string;
}

interface VerifyOriginV2Arguments {
  readonly command: 'verify-origin-v2';
  readonly root: string;
  readonly authority: string;
  readonly corpusRoot: string;
  readonly out: string;
  readonly implementationCommitSha?: string;
}

interface CatalogArguments {
  readonly command: 'catalog';
  readonly root: string;
  readonly cal001Matrix: string;
  readonly out: string;
}

interface MatrixArguments {
  readonly command: 'matrix';
  readonly root: string;
  readonly catalog: string;
  readonly laneDecisions: string;
  readonly originReceipt: string;
  readonly qualityMetrics: string;
  readonly oracleReceipt: string;
  readonly out: string;
  readonly implementationCommitSha?: string;
}

interface ApproveMatrixArguments {
  readonly command: 'approve-matrix';
  readonly root: string;
  readonly matrix: string;
  readonly out: string;
  readonly approvalCommitSha?: string;
}

interface ApplyArguments {
  readonly command: 'apply';
  readonly root: string;
  readonly matrix: string;
  readonly approval: string;
  readonly out: string;
  readonly destination?: string;
  readonly receipt?: string;
  readonly catalog?: string;
  readonly implementationCommitSha?: string;
  readonly dryRun: boolean;
}

type Arguments =
  | ReviewArguments
  | OriginArguments
  | AuthorityArguments
  | QualityCloseoutArguments
  | PlanQualityCohortArguments
  | VerifyOriginV2Arguments
  | CatalogArguments
  | MatrixArguments
  | ApproveMatrixArguments
  | ApplyArguments;

interface SourceMap {
  readonly version: 'cal-002-review-source-map-v1';
  readonly rows: readonly { readonly reviewId: string; readonly sourcePath: string }[];
}

const ORIGIN_STATE_VERSION = 'cal-002-origin-state-v1' as const;
const ORIGIN_DECISIONS_VERSION = 'cal-002-origin-decisions-v1' as const;
const ORIGIN_MENU = [
  '1 hold-origin-default-off',
  '2 transfer-to-quality',
  '3 retire',
  'q save and quit',
].join('\n');
const ORIGIN_TRANSFER_MENU = [
  '1 standards-or-contract-quality-claim',
  '2 contextual-defect-quality-claim',
  '3 statistical-review-utility-claim',
  'q save and quit',
].join('\n');
const ORIGIN_TRANSFER_REASON_BY_KEY: Readonly<Record<string, 'standards-or-contract-quality-claim' | 'contextual-defect-quality-claim' | 'statistical-review-utility-claim'>> = {
  '1': 'standards-or-contract-quality-claim',
  '2': 'contextual-defect-quality-claim',
  '3': 'statistical-review-utility-claim',
};
const AUTHORITY_MENU = [
  '1 approve the exact 26 transfer / 4 blocked / 3 supersede / 7 retire batch',
  '2 reject the exact batch and leave runtime policy unchanged',
].join('\n');
const AUTHORITY_STATE_RELATIVE_PATH = '.slopbrick/calibration/cal-002/authority-state-v2.json';
const QUALITY_COHORT_RELATIVE_PATH = '.slopbrick/calibration/cal-002/quality-cohort-v2.json';
const PROTECTED_ORIGIN_STATE_RELATIVE_PATH = '.slopbrick/calibration/cal-002/origin-state.json';
const CAL001_RECORDED_HOLDOUT_RECEIPT_PATH = '/private/tmp/cal-001-v1-holdout-receipt-2026-07-17.json';
const CAL001_RECORDED_METRICS_PATH = '/private/tmp/cal-001-v1-holdout-metrics-2026-07-17.json';
const CAL001_RECORDED_MATRIX_PATH = '/private/tmp/cal-001-v1-decision-matrix-2026-07-17.json';
const CAL001_FROZEN_DECISION_COMMIT_SHA = '215647e22d8b289f944cc44e047efeedb553a04d';
const PRIVATE_FILE_MODE = 0o600;

interface OriginState {
  readonly version: typeof ORIGIN_STATE_VERSION;
  readonly protocolVersion: typeof CAL002_PROTOCOL_VERSION;
  readonly catalogSha256: typeof CAL002_LOCKED_RULE_CATALOG_SHA256;
  readonly decisions: readonly CAL002OriginDecisionRow[];
  readonly status: 'in-progress' | 'completed';
}

interface OriginDecisionArtifact {
  readonly version: typeof ORIGIN_DECISIONS_VERSION;
  readonly protocolVersion: typeof CAL002_PROTOCOL_VERSION;
  readonly catalogSha256: typeof CAL002_LOCKED_RULE_CATALOG_SHA256;
  readonly rows: readonly CAL002OriginDecisionRow[];
  readonly admitted: false;
}

function machineOutput(value: unknown): void {
  process.stdout.write(`${canonicalArtifact(value).json}\n`);
}

function parseReviewArguments(tokens: readonly string[]): ReviewArguments {
  const values = new Map<string, string>();
  const allowed = new Set([
    '--root',
    '--corpus-root',
    '--assignment',
    '--blinded-batch',
    '--source-map',
    '--state',
    '--receipt',
    '--out',
    '--implementation-commit-sha',
  ]);
  for (let index = 0; index < tokens.length; index += 2) {
    const option = tokens[index];
    const value = tokens[index + 1];
    if (!allowed.has(option ?? '')) throw new Error(`Unknown CAL-002 option ${option ?? '<missing>'}`);
    if (value === undefined || value.startsWith('--')) throw new Error(`${option} requires one value`);
    if (values.has(option)) throw new Error(`Duplicate CAL-002 option ${option}`);
    values.set(option, value);
  }
  const required = (option: string): string => {
    const value = values.get(option);
    if (value === undefined || value.length === 0) throw new Error(`review-quality requires ${option}`);
    return value;
  };
  if (values.has('--receipt') && values.has('--out')) throw new Error('Use only one of --out or --receipt');
  const sourceMapPath = values.get('--source-map');
  const corpusRoot = values.get('--corpus-root');
  if (sourceMapPath === undefined && corpusRoot === undefined) {
    throw new Error('review-quality requires --corpus-root unless --source-map is supplied');
  }
  return {
    command: 'review-quality',
    root: values.get('--root') ?? detectMonorepoRoot(process.cwd()) ?? process.cwd(),
    corpusRoot,
    assignment: required('--assignment'),
    blindedBatch: values.get('--blinded-batch'),
    sourceMap: sourceMapPath,
    state: required('--state'),
    receipt: values.get('--out') ?? required('--receipt'),
    implementationCommitSha: values.get('--implementation-commit-sha'),
  };
}

function parseOriginArguments(tokens: readonly string[]): OriginArguments {
  const values = new Map<string, string>();
  const allowed = new Set(['--root', '--catalog', '--state', '--out']);
  for (let index = 0; index < tokens.length; index += 2) {
    const option = tokens[index];
    const value = tokens[index + 1];
    if (!allowed.has(option ?? '')) throw new Error('Unknown CAL-002 option ' + (option ?? '<missing>'));
    if (value === undefined || value.startsWith('--')) throw new Error(option + ' requires one value');
    if (values.has(option)) throw new Error('Duplicate CAL-002 option ' + option);
    values.set(option, value);
  }
  const required = (option: string): string => {
    const value = values.get(option);
    if (value === undefined || value.length === 0) throw new Error('classify-origin requires ' + option);
    return value;
  };
  return {
    command: 'classify-origin',
    root: values.get('--root') ?? detectMonorepoRoot(process.cwd()) ?? process.cwd(),
    catalog: required('--catalog'),
    state: required('--state'),
    out: required('--out'),
  };
}

function parseAuthorityArguments(tokens: readonly string[]): AuthorityArguments {
  const { values } = parseValuesAndFlags(tokens, 'classify-authority', new Set([
    '--root', '--catalog', '--prior-state', '--proposal-out', '--state-out', '--receipt-out',
  ]), new Set());
  const catalog = requiredValue(values, '--catalog', 'classify-authority');
  const priorState = requiredValue(values, '--prior-state', 'classify-authority');
  const proposalOut = requiredValue(values, '--proposal-out', 'classify-authority');
  const stateOut = requiredValue(values, '--state-out', 'classify-authority');
  const receiptOut = requiredValue(values, '--receipt-out', 'classify-authority');
  if (stateOut !== AUTHORITY_STATE_RELATIVE_PATH) {
    throw new Error(`classify-authority --state-out must resolve to ${AUTHORITY_STATE_RELATIVE_PATH}`);
  }
  return {
    command: 'classify-authority',
    root: values.get('--root') ?? detectMonorepoRoot(process.cwd()) ?? process.cwd(),
    catalog,
    priorState,
    proposalOut,
    stateOut: AUTHORITY_STATE_RELATIVE_PATH,
    receiptOut,
  };
}

function parseCatalogArguments(tokens: readonly string[]): CatalogArguments {
  const { values } = parseValuesAndFlags(tokens, 'catalog', new Set(['--root', '--cal001-matrix', '--out']), new Set());
  return {
    command: 'catalog',
    root: values.get('--root') ?? detectMonorepoRoot(process.cwd()) ?? process.cwd(),
    cal001Matrix: requiredValue(values, '--cal001-matrix', 'catalog'),
    out: requiredValue(values, '--out', 'catalog'),
  };
}

function parseQualityCloseoutArguments(tokens: readonly string[]): QualityCloseoutArguments {
  const { values } = parseValuesAndFlags(tokens, 'quality-closeout', new Set([
    '--root', '--authority', '--out', '--implementation-commit-sha',
  ]), new Set());
  return {
    command: 'quality-closeout',
    root: values.get('--root') ?? detectMonorepoRoot(process.cwd()) ?? process.cwd(),
    authority: requiredValue(values, '--authority', 'quality-closeout'),
    out: requiredValue(values, '--out', 'quality-closeout'),
    implementationCommitSha: values.get('--implementation-commit-sha'),
  };
}

function parsePlanQualityCohortArguments(tokens: readonly string[]): PlanQualityCohortArguments {
  const values = new Map<string, string>();
  const selectedRuleIds: string[] = [];
  const allowed = new Set(['--root', '--authority', '--reach', '--select', '--out']);
  for (let index = 0; index < tokens.length; index += 2) {
    const option = tokens[index];
    const value = tokens[index + 1];
    if (!allowed.has(option ?? '')) throw new Error(`Unknown CAL-002 option ${option ?? '<missing>'}`);
    if (value === undefined || value.startsWith('--')) throw new Error(`${option} requires one value`);
    if (option === '--select') {
      selectedRuleIds.push(value);
      continue;
    }
    if (values.has(option!)) throw new Error(`Duplicate CAL-002 option ${option}`);
    values.set(option!, value);
  }
  const out = requiredValue(values, '--out', 'plan-quality-cohort');
  if (out !== QUALITY_COHORT_RELATIVE_PATH) {
    throw new Error(`plan-quality-cohort --out must resolve to ${QUALITY_COHORT_RELATIVE_PATH}`);
  }
  return {
    command: 'plan-quality-cohort',
    root: values.get('--root') ?? detectMonorepoRoot(process.cwd()) ?? process.cwd(),
    authority: requiredValue(values, '--authority', 'plan-quality-cohort'),
    reach: requiredValue(values, '--reach', 'plan-quality-cohort'),
    selectedRuleIds,
    out: QUALITY_COHORT_RELATIVE_PATH,
  };
}

function parseVerifyOriginV2Arguments(tokens: readonly string[]): VerifyOriginV2Arguments {
  const { values } = parseValuesAndFlags(tokens, 'verify-origin-v2', new Set([
    '--root', '--authority', '--corpus-root', '--out', '--implementation-commit-sha',
  ]), new Set());
  return {
    command: 'verify-origin-v2',
    root: values.get('--root') ?? detectMonorepoRoot(process.cwd()) ?? process.cwd(),
    authority: requiredValue(values, '--authority', 'verify-origin-v2'),
    corpusRoot: requiredValue(values, '--corpus-root', 'verify-origin-v2'),
    out: requiredValue(values, '--out', 'verify-origin-v2'),
    implementationCommitSha: values.get('--implementation-commit-sha'),
  };
}

function parseValuesAndFlags(
  tokens: readonly string[],
  command: string,
  allowedValues: ReadonlySet<string>,
  allowedFlags: ReadonlySet<string>,
): { readonly values: ReadonlyMap<string, string>; readonly flags: ReadonlySet<string> } {
  const values = new Map<string, string>();
  const flags = new Set<string>();
  for (let index = 0; index < tokens.length; index += 1) {
    const option = tokens[index];
    if (allowedFlags.has(option ?? '')) {
      if (flags.has(option!)) throw new Error(`Duplicate CAL-002 option ${option}`);
      flags.add(option!);
      continue;
    }
    const value = tokens[index + 1];
    if (!allowedValues.has(option ?? '')) throw new Error(`Unknown CAL-002 option ${option ?? '<missing>'}`);
    if (value === undefined || value.startsWith('--')) throw new Error(`${option} requires one value`);
    if (values.has(option!)) throw new Error(`Duplicate CAL-002 option ${option}`);
    values.set(option!, value);
    index += 1;
  }
  if (values.has('--dry-run') || flags.has('--dry-run') && !allowedFlags.has('--dry-run')) {
    throw new Error(`${command} has an invalid dry-run option`);
  }
  return { values, flags };
}

function requiredValue(values: ReadonlyMap<string, string>, option: string, command: string): string {
  const value = values.get(option);
  if (value === undefined || value.length === 0) throw new Error(`${command} requires ${option}`);
  return value;
}

function parseMatrixArguments(tokens: readonly string[]): MatrixArguments {
  const { values } = parseValuesAndFlags(tokens, 'matrix', new Set([
    '--root', '--catalog', '--lane-decisions', '--origin-receipt', '--quality-metrics', '--oracle-receipt',
    '--out', '--implementation-commit-sha',
  ]), new Set());
  return {
    command: 'matrix',
    root: values.get('--root') ?? detectMonorepoRoot(process.cwd()) ?? process.cwd(),
    catalog: requiredValue(values, '--catalog', 'matrix'),
    laneDecisions: requiredValue(values, '--lane-decisions', 'matrix'),
    originReceipt: requiredValue(values, '--origin-receipt', 'matrix'),
    qualityMetrics: requiredValue(values, '--quality-metrics', 'matrix'),
    oracleReceipt: requiredValue(values, '--oracle-receipt', 'matrix'),
    out: requiredValue(values, '--out', 'matrix'),
    implementationCommitSha: values.get('--implementation-commit-sha'),
  };
}

function parseApproveMatrixArguments(tokens: readonly string[]): ApproveMatrixArguments {
  const { values } = parseValuesAndFlags(tokens, 'approve-matrix', new Set([
    '--root', '--matrix', '--out', '--approval-commit-sha',
  ]), new Set());
  return {
    command: 'approve-matrix',
    root: values.get('--root') ?? detectMonorepoRoot(process.cwd()) ?? process.cwd(),
    matrix: requiredValue(values, '--matrix', 'approve-matrix'),
    out: requiredValue(values, '--out', 'approve-matrix'),
    approvalCommitSha: values.get('--approval-commit-sha'),
  };
}

function parseApplyArguments(tokens: readonly string[]): ApplyArguments {
  const { values, flags } = parseValuesAndFlags(tokens, 'apply', new Set([
    '--root', '--catalog', '--matrix', '--approval', '--out', '--destination', '--receipt', '--receipt-out', '--implementation-commit-sha',
  ]), new Set(['--dry-run']));
  if (values.has('--receipt') && values.has('--receipt-out')) {
    throw new Error('Use only one of --receipt or --receipt-out');
  }
  return {
    command: 'apply',
    root: values.get('--root') ?? detectMonorepoRoot(process.cwd()) ?? process.cwd(),
    catalog: values.get('--catalog'),
    matrix: requiredValue(values, '--matrix', 'apply'),
    approval: requiredValue(values, '--approval', 'apply'),
    out: requiredValue(values, '--out', 'apply'),
    destination: values.get('--destination'),
    receipt: values.get('--receipt-out') ?? values.get('--receipt'),
    implementationCommitSha: values.get('--implementation-commit-sha'),
    dryRun: flags.has('--dry-run'),
  };
}

function parseArguments(argv: readonly string[]): Arguments {
  let first = 0;
  while (argv[first] === '--') first += 1;
  const [command, ...tokens] = argv.slice(first);
  if (command === 'review-quality') return parseReviewArguments(tokens);
  if (command === 'classify-origin') return parseOriginArguments(tokens);
  if (command === 'classify-authority') return parseAuthorityArguments(tokens);
  if (command === 'quality-closeout') return parseQualityCloseoutArguments(tokens);
  if (command === 'plan-quality-cohort') return parsePlanQualityCohortArguments(tokens);
  if (command === 'verify-origin-v2') return parseVerifyOriginV2Arguments(tokens);
  if (command === 'catalog') return parseCatalogArguments(tokens);
  if (command === 'matrix') return parseMatrixArguments(tokens);
  if (command === 'approve-matrix') return parseApproveMatrixArguments(tokens);
  if (command === 'apply') return parseApplyArguments(tokens);
  throw new Error('Usage: cal:complete review-quality, classify-origin, classify-authority, quality-closeout, plan-quality-cohort, verify-origin-v2, catalog, matrix, approve-matrix, or apply with local artifact options');
}

function resolveImplementationCommitSha(args: ReviewArguments): string {
  const supplied = args.implementationCommitSha ?? process.env[IMPLEMENTATION_SHA_ENV];
  return resolveCommitSha(supplied, 'review-quality');
}

function resolveCommitSha(supplied: string | undefined, command: string): string {
  if (supplied !== undefined && supplied.length > 0) return supplied;
  try {
    return execFileSync('git', ['rev-parse', 'HEAD'], {
      cwd: process.cwd(),
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();
  } catch {
    throw new Error(`${command} requires --implementation-commit-sha, ${IMPLEMENTATION_SHA_ENV}, or a local git HEAD`);
  }
}

function record(value: unknown, label: string): Record<string, unknown> {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) throw new Error(`${label} must be an object`);
  return value as Record<string, unknown>;
}

function assertExactKeys(value: Record<string, unknown>, expected: readonly string[], label: string): void {
  const actual = Object.keys(value).sort();
  const keys = [...expected].sort();
  if (actual.length !== keys.length || actual.some((key, index) => key !== keys[index])) {
    throw new Error(`${label} has unknown or missing fields`);
  }
}

function assertNonEmptyString(value: unknown, label: string): asserts value is string {
  if (typeof value !== 'string' || value.length === 0) throw new Error(`${label} must be a non-empty string`);
}

function assertBoolean(value: unknown, label: string): asserts value is boolean {
  if (typeof value !== 'boolean') throw new Error(`${label} must be a boolean`);
}

function assertOneOf<T extends string>(value: unknown, values: readonly T[], label: string): asserts value is T {
  if (typeof value !== 'string' || !values.includes(value as T)) {
    throw new Error(`${label} must be one of ${values.join(', ')}`);
  }
}

const CAL001_SPLITS = ['train', 'validation', 'test'] as const;
const CAL001_DECISIONS = ['default-off', 'quality-only', 'recalibrate'] as const;
const CAL001_POLICY_ACTIONS = ['preserve', 'owner-review-required'] as const;
const CAL001_METRIC_STATUSES = ['available', 'unavailable'] as const;
const CAL001_RULE_STATUSES = ['measured', 'zero-fire', 'ineligible', 'unavailable'] as const;

function validateCAL001DecisionRow(value: unknown, index: number): CAL001DecisionRow {
  const row = record(value, `CAL-001 decision matrix rows[${index}]`);
  assertExactKeys(row, [
    'ruleId', 'aiSpecific', 'existingDefaultOff', 'decision', 'policyAction', 'evidence',
    'originResult', 'usefulnessResult', 'confounds', 'owner', 'rationale',
  ], `CAL-001 decision matrix rows[${index}]`);
  assertNonEmptyString(row.ruleId, `CAL-001 decision matrix rows[${index}].ruleId`);
  assertBoolean(row.aiSpecific, `CAL-001 decision matrix rows[${index}].aiSpecific`);
  assertBoolean(row.existingDefaultOff, `CAL-001 decision matrix rows[${index}].existingDefaultOff`);
  assertOneOf(row.decision, CAL001_DECISIONS, `CAL-001 decision matrix rows[${index}].decision`);
  assertOneOf(row.policyAction, CAL001_POLICY_ACTIONS, `CAL-001 decision matrix rows[${index}].policyAction`);

  const evidence = record(row.evidence, `CAL-001 decision matrix rows[${index}].evidence`);
  assertExactKeys(evidence, ['holdoutReceiptSha256', 'metricsSha256', 'report'], `CAL-001 decision matrix rows[${index}].evidence`);
  assertSha256(evidence.holdoutReceiptSha256, `CAL-001 decision matrix rows[${index}].evidence.holdoutReceiptSha256`);
  assertSha256(evidence.metricsSha256, `CAL-001 decision matrix rows[${index}].evidence.metricsSha256`);
  if (evidence.report !== 'CAL-001-v1-origin-discrimination-diagnostic') {
    throw new Error(`CAL-001 decision matrix rows[${index}].evidence.report is invalid`);
  }

  const originResult = record(row.originResult, `CAL-001 decision matrix rows[${index}].originResult`);
  assertExactKeys(originResult, ['status', 'splitStatus', 'ruleStatus'], `CAL-001 decision matrix rows[${index}].originResult`);
  assertOneOf(originResult.status, ['diagnostic-only', 'not-evaluated'] as const, `CAL-001 decision matrix rows[${index}].originResult.status`);
  const splitStatus = record(originResult.splitStatus, `CAL-001 decision matrix rows[${index}].originResult.splitStatus`);
  assertExactKeys(splitStatus, CAL001_SPLITS, `CAL-001 decision matrix rows[${index}].originResult.splitStatus`);
  for (const split of CAL001_SPLITS) {
    assertOneOf(splitStatus[split], CAL001_METRIC_STATUSES, `CAL-001 decision matrix rows[${index}].originResult.splitStatus.${split}`);
  }
  const ruleStatus = record(originResult.ruleStatus, `CAL-001 decision matrix rows[${index}].originResult.ruleStatus`);
  assertExactKeys(ruleStatus, CAL001_SPLITS, `CAL-001 decision matrix rows[${index}].originResult.ruleStatus`);
  for (const split of CAL001_SPLITS) {
    assertOneOf(ruleStatus[split], CAL001_RULE_STATUSES, `CAL-001 decision matrix rows[${index}].originResult.ruleStatus.${split}`);
  }

  if (row.usefulnessResult !== 'not-evaluated') {
    throw new Error(`CAL-001 decision matrix rows[${index}].usefulnessResult must be not-evaluated`);
  }
  const confounds = record(row.confounds, `CAL-001 decision matrix rows[${index}].confounds`);
  assertExactKeys(confounds, ['leakage', 'sourceLabels', 'frameworkBuckets', 'semanticBuckets'], `CAL-001 decision matrix rows[${index}].confounds`);
  assertOneOf(confounds.leakage, ['clear', 'failed'] as const, `CAL-001 decision matrix rows[${index}].confounds.leakage`);
  if (confounds.sourceLabels !== 'publisher-attested-polarity-not-authorship') {
    throw new Error(`CAL-001 decision matrix rows[${index}].confounds.sourceLabels is invalid`);
  }
  if (confounds.frameworkBuckets !== 'not-available' || confounds.semanticBuckets !== 'not-available') {
    throw new Error(`CAL-001 decision matrix rows[${index}].confounds buckets are invalid`);
  }
  if (row.owner !== 'calibration-maintainers') throw new Error(`CAL-001 decision matrix rows[${index}].owner is invalid`);
  assertNonEmptyString(row.rationale, `CAL-001 decision matrix rows[${index}].rationale`);
  return row as unknown as CAL001DecisionRow;
}

function validateCAL001DecisionMatrix(value: unknown): CAL001DecisionMatrix {
  const matrix = record(value, 'CAL-001 decision matrix');
  assertExactKeys(matrix, [
    'version', 'protocolVersion', 'holdoutImplementationCommitSha', 'decisionImplementationCommitSha',
    'holdoutReceiptSha256', 'metricsSha256', 'ruleCatalogSha256', 'leakageStatus', 'metricsStatus',
    'rows', 'counts', 'usefulness', 'admission', 'applied', 'admitted',
  ], 'CAL-001 decision matrix');
  if (matrix.version !== CAL001_DECISION_MATRIX_VERSION || matrix.protocolVersion !== 'CAL-001-v1') {
    throw new Error('CAL-001 decision matrix version or protocol is invalid');
  }
  assertCommitSha(matrix.holdoutImplementationCommitSha, 'CAL-001 holdout implementation commit SHA');
  assertCommitSha(matrix.decisionImplementationCommitSha, 'CAL-001 decision implementation commit SHA');
  assertSha256(matrix.holdoutReceiptSha256, 'CAL-001 holdout receipt SHA-256');
  assertSha256(matrix.metricsSha256, 'CAL-001 metrics SHA-256');
  assertSha256(matrix.ruleCatalogSha256, 'CAL-001 rule catalog SHA-256');
  assertOneOf(matrix.leakageStatus, ['clear', 'failed'] as const, 'CAL-001 leakageStatus');
  assertOneOf(matrix.metricsStatus, CAL001_METRIC_STATUSES, 'CAL-001 metricsStatus');
  if (matrix.usefulness !== 'not-evaluated' || matrix.admission !== 'not-evaluated') {
    throw new Error('CAL-001 decision matrix usefulness or admission status is invalid');
  }
  if (matrix.applied !== false || matrix.admitted !== false) {
    throw new Error('CAL-001 decision matrix must remain non-admitting and unapplied');
  }
  if (!Array.isArray(matrix.rows) || matrix.rows.length === 0) {
    throw new Error('CAL-001 decision matrix rows must be a non-empty array');
  }
  const rows = matrix.rows.map((row, index) => validateCAL001DecisionRow(row, index));
  for (const [index, row] of rows.entries()) {
    if (row.evidence.holdoutReceiptSha256 !== matrix.holdoutReceiptSha256) {
      throw new Error(`CAL-001 decision matrix rows[${index}].evidence.holdoutReceiptSha256 does not match the matrix`);
    }
    if (row.evidence.metricsSha256 !== matrix.metricsSha256) {
      throw new Error(`CAL-001 decision matrix rows[${index}].evidence.metricsSha256 does not match the matrix`);
    }
  }
  const sortedRows = [...rows].sort((left, right) => left.ruleId.localeCompare(right.ruleId));
  if (canonicalArtifact(rows).json !== canonicalArtifact(sortedRows).json) {
    throw new Error('CAL-001 decision matrix rows are not in canonical rule order');
  }

  const counts = record(matrix.counts, 'CAL-001 decision matrix counts');
  assertExactKeys(counts, ['total', 'aiSpecific', 'defaultOff', 'recalibrate', 'qualityOnly', 'existingDefaultOff', 'ownerReviewRequired'], 'CAL-001 decision matrix counts');
  const calculatedCounts = {
    total: rows.length,
    aiSpecific: rows.filter((row) => row.aiSpecific).length,
    defaultOff: rows.filter((row) => row.decision === 'default-off').length,
    recalibrate: rows.filter((row) => row.decision === 'recalibrate').length,
    qualityOnly: rows.filter((row) => row.decision === 'quality-only').length,
    existingDefaultOff: rows.filter((row) => row.existingDefaultOff).length,
    ownerReviewRequired: rows.filter((row) => row.policyAction === 'owner-review-required').length,
  } as const;
  for (const [key, expected] of Object.entries(calculatedCounts)) {
    if (counts[key] !== expected || !Number.isSafeInteger(counts[key])) {
      throw new Error(`CAL-001 decision matrix counts.${key} does not match its rows`);
    }
  }
  const ruleCatalog = rows
    .map((row) => ({ ruleId: row.ruleId, aiSpecific: row.aiSpecific, existingDefaultOff: row.existingDefaultOff }))
    .sort((left, right) => left.ruleId.localeCompare(right.ruleId));
  if (canonicalArtifact(ruleCatalog).sha256 !== matrix.ruleCatalogSha256) {
    throw new Error('CAL-001 decision matrix rule catalog hash does not match its rows');
  }
  return matrix as unknown as CAL001DecisionMatrix;
}

function assertSafeRelativePath(path: string, label: string): void {
  if (
    path.length === 0
    || path.includes('\0')
    || isAbsolute(path)
    || win32.isAbsolute(path)
  ) {
    throw new Error(label + ' must be a safe relative path');
  }
  const segments = path.split(/[\\/]/u);
  if (segments.some((segment) => segment.length === 0 || segment === '.' || segment === '..')) {
    throw new Error(label + ' must be a safe relative path');
  }
}

async function privatePath(root: string, relativePath: string, allowMissingLeaf: boolean): Promise<string> {
  assertSafeRelativePath(relativePath, 'CAL-002 private artifact path');
  const canonicalRoot = resolve(root);
  const rootMetadata = await lstat(canonicalRoot);
  if (rootMetadata.isSymbolicLink() || !rootMetadata.isDirectory()) {
    throw new Error('CAL-002 private artifact root must be a regular directory');
  }
  const candidate = resolve(canonicalRoot, relativePath);
  const fromRoot = relative(canonicalRoot, candidate);
  if (
    fromRoot.length === 0
    || fromRoot === '..'
    || fromRoot.startsWith('..' + sep)
    || isAbsolute(fromRoot)
  ) {
    throw new Error('CAL-002 private artifact path must be contained by its root');
  }
  let current = canonicalRoot;
  const segments = fromRoot.split(sep);
  for (const [index, segment] of segments.entries()) {
    current = join(current, segment);
    try {
      const metadata = await lstat(current);
      if (metadata.isSymbolicLink()) throw new Error('CAL-002 private artifact path contains a symbolic link');
      if (index < segments.length - 1 && !metadata.isDirectory()) {
        throw new Error('CAL-002 private artifact path ancestor is not a directory');
      }
      if (index === segments.length - 1 && !metadata.isFile() && !allowMissingLeaf) {
        throw new Error('CAL-002 private artifact must be a regular file');
      }
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT' && allowMissingLeaf && index === segments.length - 1) {
        return candidate;
      }
      throw error;
    }
  }
  return candidate;
}

async function externalCAL001SourcePath(path: string): Promise<string> {
  if (path.length === 0 || path.includes('\0') || !isAbsolute(path)) {
    throw new Error('CAL-001 external matrix path must be an absolute host path');
  }
  const candidate = resolve(path);
  let current = candidate;
  while (true) {
    const metadata = await lstat(current);
    if (metadata.isSymbolicLink()) {
      throw new Error('CAL-001 external matrix path contains a symbolic link');
    }
    if (current === dirname(current)) break;
    current = dirname(current);
  }
  const metadata = await lstat(candidate);
  if (!metadata.isFile()) throw new Error('CAL-001 external matrix path must be a regular file');
  return candidate;
}

async function readCAL001DecisionMatrix(root: string, path: string): Promise<CAL001DecisionMatrix> {
  const sourcePath = isAbsolute(path)
    ? await externalCAL001SourcePath(path)
    : await privatePath(root, path, false);
  const bytes = await readFile(sourcePath, 'utf8');
  let value: unknown;
  try {
    value = JSON.parse(bytes) as unknown;
  } catch {
    throw new Error('CAL-001 decision matrix is not valid JSON');
  }
  const canonical = canonicalArtifact(value).json;
  if (bytes !== canonical && bytes !== `${canonical}\n`) {
    throw new Error('CAL-001 decision matrix is not exact canonical JSON');
  }
  return validateCAL001DecisionMatrix(value);
}

async function readExternalCanonicalArtifact(path: string, label: string): Promise<unknown> {
  const sourcePath = await externalCAL001SourcePath(path);
  const bytes = await readFile(sourcePath, 'utf8');
  let value: unknown;
  try {
    value = JSON.parse(bytes) as unknown;
  } catch {
    throw new Error(`${label} is not valid JSON`);
  }
  const canonical = canonicalArtifact(value).json;
  if (bytes !== canonical && bytes !== `${canonical}\n`) {
    throw new Error(`${label} is not exact canonical JSON`);
  }
  return value;
}

async function deriveCAL001OriginGoverningHashes(input: {
  readonly monorepoRoot: string;
  readonly reducerRoot: string;
  readonly holdoutReceiptPath: string;
  readonly metricsPath: string;
  readonly matrixPath: string;
}): Promise<CAL002OriginGoverningHashes> {
  const [holdoutValue, metrics, matrix] = await Promise.all([
    readExternalCanonicalArtifact(input.holdoutReceiptPath, 'CAL-001 holdout receipt'),
    readExternalCanonicalArtifact(input.metricsPath, 'CAL-001 holdout metrics'),
    readCAL001DecisionMatrix(input.monorepoRoot, input.matrixPath),
  ]);
  const holdout = record(holdoutValue, 'CAL-001 holdout receipt');
  if (holdout.version !== 'cal-001-v1-holdout-receipt-v1'
    || holdout.protocolVersion !== 'CAL-001-v1'
    || holdout.workerCount !== 1
    || holdout.evaluation !== 'diagnostic-only'
    || holdout.admitted !== false) {
    throw new Error('CAL-001 holdout receipt is not the frozen one-worker non-admitting evidence');
  }
  assertCommitSha(holdout.implementationCommitSha, 'CAL-001 holdout implementation commit SHA');
  assertSha256(holdout.configHash, 'CAL-001 holdout config SHA-256');
  const inputHashes = record(holdout.inputHashes, 'CAL-001 holdout input hashes');
  assertSha256(inputHashes.protocolSha256, 'CAL-001 protocol SHA-256');
  assertSha256(inputHashes.sourceBindingReceiptSha256, 'CAL-001 source-binding receipt SHA-256');
  assertSha256(inputHashes.planSha256, 'CAL-001 split plan SHA-256');
  const metricsBinding = record(holdout.metrics, 'CAL-001 holdout metrics binding');
  assertSha256(metricsBinding.metricsSha256, 'CAL-001 holdout metrics binding SHA-256');

  const holdoutReceiptSha256 = canonicalArtifact(holdoutValue).sha256;
  const metricsSha256 = canonicalArtifact(metrics).sha256;
  const cal001MatrixSha256 = canonicalArtifact(matrix).sha256;
  if (metricsBinding.metricsSha256 !== metricsSha256
    || matrix.holdoutReceiptSha256 !== holdoutReceiptSha256
    || matrix.metricsSha256 !== metricsSha256
    || matrix.holdoutImplementationCommitSha !== holdout.implementationCommitSha) {
    throw new Error('CAL-001 local artifacts do not preserve their canonical evidence bindings');
  }
  const reducerBytes = await readFile(join(
    input.reducerRoot,
    'packages/slopbrick/src/calibration/corpus-v1/calibration-decisions.ts',
  ));
  return {
    protocolSha256: inputHashes.protocolSha256 as string,
    sourceBindingReceiptSha256: inputHashes.sourceBindingReceiptSha256 as string,
    splitPlanSha256: inputHashes.planSha256 as string,
    scannerCommitSha: holdout.implementationCommitSha as string,
    configSha256: holdout.configHash as string,
    catalogSha256: CAL002_LOCKED_RULE_CATALOG_SHA256,
    holdoutReceiptSha256,
    metricsSha256,
    cal001MatrixSha256,
    reducerSha256: createHash('sha256').update(reducerBytes).digest('hex'),
  };
}

async function recordedCAL001OriginGoverningHashes(
  monorepoRoot: string,
): Promise<CAL002OriginGoverningHashes | undefined> {
  try {
    return await deriveCAL001OriginGoverningHashes({
      monorepoRoot,
      reducerRoot: monorepoRoot,
      holdoutReceiptPath: process.env.CAL002_ORIGIN_HOLDOUT_RECEIPT_PATH
        ?? CAL001_RECORDED_HOLDOUT_RECEIPT_PATH,
      metricsPath: process.env.CAL002_ORIGIN_METRICS_PATH
        ?? CAL001_RECORDED_METRICS_PATH,
      matrixPath: process.env.CAL002_ORIGIN_MATRIX_PATH
        ?? CAL001_RECORDED_MATRIX_PATH,
    });
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return undefined;
    throw error;
  }
}

function childFailureMessage(error: unknown): string {
  if (error === null || typeof error !== 'object') return String(error);
  const childError = error as { readonly stderr?: unknown; readonly message?: unknown };
  const stderr = childError.stderr;
  if (typeof stderr === 'string' && stderr.trim().length > 0) return stderr.trim();
  if (Buffer.isBuffer(stderr) && stderr.length > 0) return stderr.toString('utf8').trim();
  return typeof childError.message === 'string'
    ? childError.message
    : 'unknown child-process failure';
}

function runHistoricalChild(input: {
  readonly executable: 'git' | 'corepack';
  readonly args: readonly string[];
  readonly cwd: string;
  readonly label: string;
  readonly env?: NodeJS.ProcessEnv;
}): void {
  try {
    execFileSync(input.executable, [...input.args], {
      cwd: input.cwd,
      env: input.env ?? process.env,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
      maxBuffer: 64 * 1024 * 1024,
    });
  } catch (error) {
    throw new Error(`${input.label}: ${childFailureMessage(error)}`);
  }
}

async function rerunCAL001OriginEvidence(
  monorepoRoot: string,
  corpusRoot: string,
): Promise<CAL002OriginGoverningHashes> {
  const temporaryRoot = await realpath(await mkdtemp(join(tmpdir(), 'cal-002-origin-v2-')));
  const holdoutCheckout = join(temporaryRoot, 'holdout-evaluator');
  const decisionCheckout = join(temporaryRoot, 'decision-reducer');
  const holdoutReceiptPath = join(temporaryRoot, 'holdout-receipt.json');
  const metricsPath = join(temporaryRoot, 'holdout-metrics.json');
  const matrixPath = join(temporaryRoot, 'decision-matrix.json');
  const childEnvironment = {
    ...process.env,
    CI: '1',
    COREPACK_ENABLE_NETWORK: '0',
  };
  const addedCheckouts: string[] = [];
  let result: CAL002OriginGoverningHashes | undefined;
  let primaryError: unknown;
  try {
    runHistoricalChild({
      executable: 'git',
      args: ['worktree', 'add', '--detach', holdoutCheckout, CAL002_ORIGIN_FROZEN_GOVERNING_HASHES.scannerCommitSha],
      cwd: monorepoRoot,
      label: 'CAL-001 frozen holdout worktree creation failed',
    });
    addedCheckouts.push(holdoutCheckout);
    runHistoricalChild({
      executable: 'git',
      args: ['worktree', 'add', '--detach', decisionCheckout, CAL001_FROZEN_DECISION_COMMIT_SHA],
      cwd: monorepoRoot,
      label: 'CAL-001 frozen decision worktree creation failed',
    });
    addedCheckouts.push(decisionCheckout);

    for (const checkout of addedCheckouts) {
      runHistoricalChild({
        executable: 'corepack',
        args: ['pnpm', 'install', '--offline', '--frozen-lockfile'],
        cwd: checkout,
        env: childEnvironment,
        label: 'CAL-001 historical offline install failed',
      });
      for (const packageName of ['@usebrick/core', '@usebrick/engine', 'slopbrick']) {
        runHistoricalChild({
          executable: 'corepack',
          args: ['pnpm', '--filter', packageName, 'build'],
          cwd: checkout,
          env: childEnvironment,
          label: `CAL-001 historical ${packageName} build failed`,
        });
      }
    }

    runHistoricalChild({
      executable: 'corepack',
      args: [
        'pnpm', '--filter', 'slopbrick', 'cal:corpus:v1-holdout', '--',
        '--corpus-root', corpusRoot,
        '--protocol', join(holdoutCheckout, 'docs/execution/evidence/CAL-001-protocol.md'),
        '--out', holdoutReceiptPath,
        '--metrics-out', metricsPath,
        '--implementation-commit-sha', CAL002_ORIGIN_FROZEN_GOVERNING_HASHES.scannerCommitSha,
      ],
      cwd: holdoutCheckout,
      env: childEnvironment,
      label: 'CAL-001 frozen one-worker holdout rerun failed',
    });
    runHistoricalChild({
      executable: 'corepack',
      args: [
        'pnpm', '--filter', 'slopbrick', 'cal:corpus:v1-decisions', '--',
        '--holdout-receipt', holdoutReceiptPath,
        '--metrics', metricsPath,
        '--out', matrixPath,
        '--holdout-implementation-commit-sha', CAL002_ORIGIN_FROZEN_GOVERNING_HASHES.scannerCommitSha,
        '--decision-implementation-commit-sha', CAL001_FROZEN_DECISION_COMMIT_SHA,
      ],
      cwd: decisionCheckout,
      env: childEnvironment,
      label: 'CAL-001 frozen decision rerun failed',
    });

    const governingHashes = await deriveCAL001OriginGoverningHashes({
      monorepoRoot: decisionCheckout,
      reducerRoot: decisionCheckout,
      holdoutReceiptPath,
      metricsPath,
      matrixPath,
    });
    const verification = assessCAL002CAL001Reuse({
      governingHashes,
      expectedGoverningHashes: CAL002_ORIGIN_FROZEN_GOVERNING_HASHES,
    });
    if (verification.status !== 'reused') {
      throw new Error(
        `CAL-001 historical rerun did not reproduce frozen governing hashes: ${verification.mismatches.join(', ')}`,
      );
    }
    result = governingHashes;
  } catch (error) {
    primaryError = error;
  }

  const cleanupErrors: string[] = [];
  for (const checkout of [...addedCheckouts].reverse()) {
    try {
      runHistoricalChild({
        executable: 'git',
        args: ['worktree', 'remove', '--force', checkout],
        cwd: monorepoRoot,
        label: 'CAL-001 historical worktree cleanup failed',
      });
    } catch (error) {
      cleanupErrors.push(error instanceof Error ? error.message : String(error));
      await rm(checkout, { recursive: true, force: true });
    }
  }
  try {
    await rm(temporaryRoot, { recursive: true, force: true });
  } catch (error) {
    cleanupErrors.push(`CAL-001 historical temporary cleanup failed: ${childFailureMessage(error)}`);
  }
  if (cleanupErrors.length > 0) {
    const primary = primaryError === undefined
      ? ''
      : `${primaryError instanceof Error ? primaryError.message : String(primaryError)}; `;
    throw new Error(`${primary}CAL-001 historical cleanup was incomplete: ${cleanupErrors.join('; ')}`);
  }
  if (primaryError !== undefined) throw primaryError;
  if (result === undefined) throw new Error('CAL-001 historical rerun completed without governing hashes');
  return result;
}

async function privateWritePath(root: string, relativePath: string): Promise<string> {
  assertSafeRelativePath(relativePath, 'CAL-002 private artifact path');
  const canonicalRoot = resolve(root);
  const rootMetadata = await lstat(canonicalRoot);
  if (rootMetadata.isSymbolicLink() || !rootMetadata.isDirectory()) {
    throw new Error('CAL-002 private artifact root must be a regular directory');
  }
  const candidate = resolve(canonicalRoot, relativePath);
  const fromRoot = relative(canonicalRoot, candidate);
  if (
    fromRoot.length === 0
    || fromRoot === '..'
    || fromRoot.startsWith('..' + sep)
    || isAbsolute(fromRoot)
  ) {
    throw new Error('CAL-002 private artifact path must be contained by its root');
  }
  const parent = dirname(candidate);
  const parentRelative = relative(canonicalRoot, parent);
  let current = canonicalRoot;
  for (const segment of parentRelative.length === 0 ? [] : parentRelative.split(sep)) {
    current = join(current, segment);
    try {
      const metadata = await lstat(current);
      if (metadata.isSymbolicLink()) throw new Error('CAL-002 private artifact path contains a symbolic link');
      if (!metadata.isDirectory()) throw new Error('CAL-002 private artifact path ancestor is not a directory');
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
      try {
        await mkdir(current, { mode: 0o700 });
      } catch (createError) {
        if ((createError as NodeJS.ErrnoException).code !== 'EEXIST') throw createError;
      }
      const created = await lstat(current);
      if (created.isSymbolicLink() || !created.isDirectory()) {
        throw new Error('CAL-002 private artifact directory creation was unsafe');
      }
    }
  }
  return privatePath(canonicalRoot, relativePath, true);
}

async function readPrivateCanonical(root: string, relativePath: string, label: string): Promise<unknown> {
  const path = await privatePath(root, relativePath, false);
  const metadata = await lstat(path);
  if ((metadata.mode & 0o777) !== PRIVATE_FILE_MODE) {
    throw new Error(label + ' must have private mode 0600');
  }
  const bytes = await readFile(path, 'utf8');
  let value: unknown;
  try {
    value = JSON.parse(bytes) as unknown;
  } catch {
    throw new Error(label + ' is not valid JSON');
  }
  if (bytes !== canonicalArtifact(value).json) {
    throw new Error(label + ' is not exact canonical JSON');
  }
  return value;
}

async function syncPrivateDirectory(path: string): Promise<void> {
  const directory = await open(path, constants.O_RDONLY);
  try {
    await directory.sync();
  } finally {
    await directory.close();
  }
}

async function writePrivateCanonical(root: string, relativePath: string, value: unknown): Promise<void> {
  const path = await privateWritePath(root, relativePath);
  const name = path.split(sep).at(-1) ?? 'origin-state.json';
  const lockPath = join(dirname(path), '.' + name + '.lock');
  let lock;
  try {
    lock = await open(lockPath, 'wx', PRIVATE_FILE_MODE);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'EEXIST') {
      throw new Error('CAL-002 origin state is locked by another writer');
    }
    throw error;
  }
  try {
    try {
      const existing = await lstat(path);
      if (existing.isSymbolicLink() || !existing.isFile()) {
        throw new Error('CAL-002 private state path must be a regular file');
      }
      if ((existing.mode & 0o777) !== PRIVATE_FILE_MODE) {
        throw new Error('CAL-002 private state must retain private mode 0600');
      }
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
    }
    const temporary = join(dirname(path), '.' + name + '.' + process.pid + '.tmp');
    const handle = await open(temporary, 'wx', PRIVATE_FILE_MODE);
    try {
      await handle.writeFile(canonicalArtifact(value).json, 'utf8');
      await handle.sync();
    } catch (error) {
      await handle.close().catch(() => undefined);
      await unlink(temporary).catch(() => undefined);
      throw error;
    }
    await handle.close();
    try {
      await rename(temporary, path);
      await syncPrivateDirectory(dirname(path));
    } catch (error) {
      await unlink(temporary).catch(() => undefined);
      throw error;
    }
  } catch (error) {
    throw error;
  } finally {
    await lock.close().catch(() => undefined);
    await unlink(lockPath).catch(() => undefined);
    await syncPrivateDirectory(dirname(path));
  }
}

async function writeImmutablePrivateCanonical(
  root: string,
  relativePath: string,
  value: unknown,
  label = 'CAL-002 immutable artifact',
): Promise<void> {
  const path = await privateWritePath(root, relativePath);
  const name = basename(path);
  const directory = dirname(path);
  const lockPath = join(directory, '.' + name + '.lock');
  const bytes = canonicalArtifact(value).json;
  let lock;
  try {
    lock = await open(lockPath, 'wx', PRIVATE_FILE_MODE);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'EEXIST') {
      throw new Error(`${label} is locked by another writer`);
    }
    throw error;
  }
  try {
    try {
      const existing = await lstat(path);
      if (existing.isSymbolicLink() || !existing.isFile()) {
        throw new Error(`${label} path must be a regular file`);
      }
      if ((existing.mode & 0o777) !== PRIVATE_FILE_MODE) {
        throw new Error(`${label} must have private mode 0600`);
      }
      const existingValue = await readPrivateCanonical(root, relativePath, label);
      if (canonicalArtifact(existingValue).json === bytes) return;
      throw new Error(`A different ${label} already exists and is immutable`);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
    }
    const temporary = join(directory, '.' + name + '.' + process.pid + '.' + randomBytes(12).toString('hex') + '.tmp');
    const handle = await open(temporary, 'wx', PRIVATE_FILE_MODE);
    try {
      await handle.writeFile(bytes, 'utf8');
      await handle.sync();
    } catch (error) {
      await handle.close().catch(() => undefined);
      await unlink(temporary).catch(() => undefined);
      throw error;
    }
    await handle.close();
    try {
      await rename(temporary, path);
      await syncPrivateDirectory(directory);
    } catch (error) {
      await unlink(temporary).catch(() => undefined);
      throw error;
    }
  } finally {
    await lock.close().catch(() => undefined);
    await unlink(lockPath).catch(() => undefined);
    await syncPrivateDirectory(directory);
  }
}

function originState(value: unknown, catalog: CAL002Catalog): OriginState {
  const state = record(value, 'CAL-002 origin state');
  assertExactKeys(state, ['version', 'protocolVersion', 'catalogSha256', 'decisions', 'status'], 'CAL-002 origin state');
  if (state.version !== ORIGIN_STATE_VERSION || state.protocolVersion !== CAL002_PROTOCOL_VERSION) {
    throw new Error('CAL-002 origin state version or protocol is invalid');
  }
  if (state.catalogSha256 !== CAL002_LOCKED_RULE_CATALOG_SHA256) {
    throw new Error('CAL-002 origin state catalog hash is invalid');
  }
  if (state.status !== 'in-progress' && state.status !== 'completed') {
    throw new Error('CAL-002 origin state status is invalid');
  }
  if (!Array.isArray(state.decisions)) throw new Error('CAL-002 origin state decisions must be an array');
  const decisions = state.decisions as readonly CAL002OriginDecisionRow[];
  const sorted = [...decisions].sort((left, right) => left.ruleId.localeCompare(right.ruleId));
  if (canonicalArtifact(decisions).json !== canonicalArtifact(sorted).json) {
    throw new Error('CAL-002 origin state decisions are not in canonical order');
  }
  const resolution = resolveCAL002OriginDecisions({
    catalog,
    decisions,
    allowIncomplete: true,
  });
  if (state.status === 'completed' && resolution.unresolvedRuleIds.length > 0) {
    throw new Error('Completed CAL-002 origin state has unresolved owner rows');
  }
  return {
    version: ORIGIN_STATE_VERSION,
    protocolVersion: CAL002_PROTOCOL_VERSION,
    catalogSha256: CAL002_LOCKED_RULE_CATALOG_SHA256,
    decisions,
    status: state.status,
  };
}

function buildOriginState(
  catalog: CAL002Catalog,
  decisions: readonly CAL002OriginDecisionRow[],
  status: OriginState['status'],
): OriginState {
  const resolution = resolveCAL002OriginDecisions({
    catalog,
    decisions,
    allowIncomplete: true,
  });
  if (status === 'completed' && resolution.unresolvedRuleIds.length > 0) {
    throw new Error('Cannot complete CAL-002 origin state with unresolved owner rows');
  }
  return {
    version: ORIGIN_STATE_VERSION,
    protocolVersion: CAL002_PROTOCOL_VERSION,
    catalogSha256: CAL002_LOCKED_RULE_CATALOG_SHA256,
    decisions: [...decisions].sort((left, right) => left.ruleId.localeCompare(right.ruleId)),
    status,
  };
}

function originDecisionArtifact(value: unknown, catalog: CAL002Catalog): OriginDecisionArtifact {
  const artifact = record(value, 'CAL-002 origin decisions');
  assertExactKeys(artifact, ['version', 'protocolVersion', 'catalogSha256', 'rows', 'admitted'], 'CAL-002 origin decisions');
  if (artifact.version !== ORIGIN_DECISIONS_VERSION || artifact.protocolVersion !== CAL002_PROTOCOL_VERSION) {
    throw new Error('CAL-002 origin decisions version or protocol is invalid');
  }
  if (artifact.catalogSha256 !== CAL002_LOCKED_RULE_CATALOG_SHA256 || artifact.admitted !== false) {
    throw new Error('CAL-002 origin decisions identity or admission flag is invalid');
  }
  if (!Array.isArray(artifact.rows)) throw new Error('CAL-002 origin decisions rows must be an array');
  const ownerIds = new Set(catalog.rows.filter((row) => row.lane === 'origin' && row.ownerReviewRequired).map((row) => row.ruleId));
  const ownerRows = (artifact.rows as readonly CAL002OriginDecisionRow[]).filter((row) => ownerIds.has(row.ruleId));
  const resolution = resolveCAL002OriginDecisions({
    catalog,
    decisions: ownerRows,
  });
  if (canonicalArtifact(resolution.rows).json !== canonicalArtifact(artifact.rows).json) {
    throw new Error('CAL-002 origin decisions do not exactly cover the catalog');
  }
  return {
    version: ORIGIN_DECISIONS_VERSION,
    protocolVersion: CAL002_PROTOCOL_VERSION,
    catalogSha256: CAL002_LOCKED_RULE_CATALOG_SHA256,
    rows: artifact.rows as readonly CAL002OriginDecisionRow[],
    admitted: false,
  };
}

function qualityAssignment(value: unknown): CAL002QualityAssignment {
  const validation = validateCAL002Assignment(value);
  if (!validation.ok) throw new Error(`CAL-002 assignment is invalid: ${validation.errors.join('; ')}`);
  const assignment = value as CAL002QualityAssignment;
  if (assignment.catalogSha256 !== CAL002_LOCKED_RULE_CATALOG_SHA256) {
    throw new Error('CAL-002 assignment catalog hash does not match the locked catalog');
  }
  const { assignmentSha256: _assignmentSha256, ...withoutSelfHash } = assignment;
  if (canonicalArtifact(withoutSelfHash).sha256 !== assignment.assignmentSha256) {
    throw new Error('CAL-002 assignment SHA-256 does not match its canonical contents');
  }
  return assignment;
}

function blindedBatch(value: unknown, assignment: CAL002QualityAssignment): readonly CAL002QualityBlindedRow[] {
  if (!Array.isArray(value)) throw new Error('CAL-002 blinded batch must be an array');
  if (canonicalArtifact(value).sha256 !== assignment.blindedBatchSha256) {
    throw new Error('CAL-002 blinded batch SHA-256 does not match the assignment');
  }
  if (canonicalArtifact(value).json !== canonicalArtifact(assignment.blindedRows).json) {
    throw new Error('CAL-002 blinded batch does not exactly match the assignment projection');
  }
  return value as readonly CAL002QualityBlindedRow[];
}

function sourceMap(value: unknown, reviewIds: readonly string[]): SourceMap {
  const artifact = record(value, 'CAL-002 source map');
  assertExactKeys(artifact, ['version', 'rows'], 'CAL-002 source map');
  if (artifact.version !== 'cal-002-review-source-map-v1' || !Array.isArray(artifact.rows)) {
    throw new Error('CAL-002 source map has an invalid version or rows');
  }
  const expected = new Set(reviewIds);
  const seen = new Set<string>();
  for (const [index, candidate] of artifact.rows.entries()) {
    const row = record(candidate, `CAL-002 source map rows[${index}]`);
    assertExactKeys(row, ['reviewId', 'sourcePath'], `CAL-002 source map rows[${index}]`);
    if (typeof row.reviewId !== 'string' || !expected.has(row.reviewId)) throw new Error(`CAL-002 source map rows[${index}] has an unknown review ID`);
    if (seen.has(row.reviewId)) throw new Error(`CAL-002 source map duplicates ${row.reviewId}`);
    if (typeof row.sourcePath !== 'string' || row.sourcePath.length === 0) throw new Error(`CAL-002 source map rows[${index}] has no source path`);
    seen.add(row.reviewId);
  }
  if (seen.size !== expected.size) throw new Error('CAL-002 source map does not cover every review ID');
  return value as SourceMap;
}

function sameStrings(left: readonly string[], right: readonly string[]): boolean {
  return left.length === right.length && left.every((value, index) => value === right[index]);
}

async function loadState(args: ReviewArguments, assignment: CAL002QualityAssignment, batch: readonly CAL002QualityBlindedRow[]): Promise<CAL002ReviewState> {
  let state: CAL002ReviewState;
  try {
    state = await readReviewState({ root: args.root, relativePath: args.state });
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
    state = startCAL002Review({
      assignmentSha256: assignment.assignmentSha256,
      blindedBatchSha256: assignment.blindedBatchSha256,
      reviewIds: batch.map((row) => row.reviewId),
    });
  }
  assertCAL002ReviewState(state);
  if (state.assignmentSha256 !== assignment.assignmentSha256 || state.blindedBatchSha256 !== assignment.blindedBatchSha256) {
    throw new Error('CAL-002 review state does not match the assignment and blinded batch');
  }
  if (!sameStrings(state.reviewIds, batch.map((row) => row.reviewId))) {
    throw new Error('CAL-002 review state order does not match the blinded batch');
  }
  return state;
}

function progress(state: CAL002ReviewState): { readonly labeled: number; readonly remaining: number } {
  return { labeled: state.rows.length, remaining: state.reviewIds.length - state.rows.length };
}

function safeDisplayedSource(source: string): string {
  const bytes = Buffer.from(source, 'utf8');
  const bounded = bytes.subarray(0, DISPLAY_SOURCE_BYTE_LIMIT).toString('utf8');
  const neutralized = bounded.replace(/[\x00-\x09\x0b-\x1f\x7f-\x9f]/gu, (value) => `\\x${value.codePointAt(0)!.toString(16).padStart(2, '0')}`);
  return bytes.byteLength > DISPLAY_SOURCE_BYTE_LIMIT
    ? `${neutralized}${neutralized.endsWith('\n') ? '' : '\n'}[source context truncated at ${DISPLAY_SOURCE_BYTE_LIMIT} bytes]\n`
    : `${neutralized}${neutralized.endsWith('\n') ? '' : '\n'}`;
}

function safeLineWindowLocator(value: unknown): string {
  if (typeof value !== 'string' || !LINE_WINDOW_LOCATOR.test(value)) {
    throw new Error('CAL-002 lineWindowLocator must be window: followed by 64 lowercase hexadecimal characters');
  }
  return value;
}

function sourceReader(
  args: ReviewArguments,
  assignment: CAL002QualityAssignment,
  batch: readonly CAL002QualityBlindedRow[],
  sources: SourceMap | undefined,
): (observation: CAL002QualityBlindedRow) => Promise<string> {
  if (sources !== undefined) {
    return async (observation) => {
      const source = sources.rows.find((row) => row.reviewId === observation.reviewId)!;
      return readVerifiedSource({
        root: args.root,
        relativePath: source.sourcePath,
        expectedSha256: observation.sourceIdentitySha256,
      });
    };
  }
  const unitIds = new Map(assignment.rows.map((row) => [row.reviewId, row.unitId]));
  const sourceIndex = readVerifiedSourcesByHash({
    root: args.corpusRoot!,
    sources: batch.map((observation) => ({
      expectedSha256: observation.sourceIdentitySha256,
      unitId: unitIds.get(observation.reviewId),
    })),
  });
  return async (observation) => {
    const source = (await sourceIndex).get(observation.sourceIdentitySha256);
    if (source === undefined) throw new Error('CAL-002 selected source was not present in the verified source index');
    return source;
  };
}

async function resumeCompletedReview(args: ReviewArguments, state: CAL002ReviewState): Promise<void> {
  let receipt;
  try {
    receipt = await readReviewReceipt({ root: args.root, relativePath: args.receipt });
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      throw new Error('CAL-002 completed review state requires its matching receipt');
    }
    throw error;
  }
  const verified = verifyCompletedCAL002ReviewReceipt({ state, receipt });
  machineOutput({
    ok: true,
    command: args.command,
    status: 'completed',
    ...progress(state),
    ...verified,
  });
}

async function recoverInterruptedCompletion(args: ReviewArguments, state: CAL002ReviewState): Promise<boolean> {
  let receipt;
  try {
    receipt = await readReviewReceipt({ root: args.root, relativePath: args.receipt });
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return false;
    throw error;
  }
  const completedState: CAL002ReviewState = { ...state, status: 'completed' };
  const verified = verifyCompletedCAL002ReviewReceipt({ state: completedState, receipt });
  await writeReviewState({ root: args.root, relativePath: args.state, state: completedState });
  machineOutput({
    ok: true,
    command: args.command,
    status: 'completed',
    ...progress(completedState),
    ...verified,
  });
  return true;
}

async function reviewQuality(args: ReviewArguments): Promise<void> {
  const assignmentValue = await readCanonicalArtifact({ root: args.root, relativePath: args.assignment, label: 'CAL-002 assignment' });
  const assignment = qualityAssignment(assignmentValue);
  const batch = args.blindedBatch === undefined
    ? blindedBatch(assignment.blindedRows, assignment)
    : blindedBatch(
      await readCanonicalArtifact({ root: args.root, relativePath: args.blindedBatch, label: 'CAL-002 blinded batch' }),
      assignment,
    );
  const sources = args.sourceMap === undefined
    ? undefined
    : sourceMap(
      await readCanonicalArtifact({ root: args.root, relativePath: args.sourceMap, label: 'CAL-002 source map' }),
      batch.map((row) => row.reviewId),
    );
  let state = await loadState(args, assignment, batch);
  if (state.status === 'completed') {
    await resumeCompletedReview(args, state);
    return;
  }
  if (await recoverInterruptedCompletion(args, state)) return;
  const readSource = sourceReader(args, assignment, batch, sources);
  const input = createInterface({ input: process.stdin, terminal: false, crlfDelay: Infinity });
  const lines = input[Symbol.asyncIterator]();
  try {
    while (true) {
      const reviewId = nextCAL002ReviewId(state);
      if (reviewId === undefined) break;
      const observation = batch.find((row) => row.reviewId === reviewId)!;
      const lineWindowLocator = safeLineWindowLocator(observation.lineWindowLocator);
      const sourceText = await readSource(observation);
      process.stderr.write([
        `Review ${reviewId}`,
        `ruleId: ${observation.ruleId}`,
        `evidenceClass: ${observation.evidenceClass}`,
        `lineWindowLocator: ${lineWindowLocator}`,
        `Source context (SHA-256 verified; maximum ${DISPLAY_SOURCE_BYTE_LIMIT} bytes):`,
        safeDisplayedSource(sourceText),
      ].join('\n'));

      while (true) {
        process.stderr.write(`${MENU}\n`);
        const next = await lines.next();
        const key = next.done ? undefined : next.value;
        if (key === 'q') {
          await writeReviewState({ root: args.root, relativePath: args.state, state });
          machineOutput({ ok: true, command: args.command, status: 'paused', ...progress(state), nextReviewId: reviewId });
          return;
        }
        const label = key === undefined ? undefined : LABEL_BY_KEY[key];
        if (label === undefined) {
          if (key === undefined) {
            await writeReviewState({ root: args.root, relativePath: args.state, state });
            machineOutput({ ok: true, command: args.command, status: 'paused', ...progress(state), nextReviewId: reviewId });
            return;
          }
          process.stderr.write('Invalid selection; choose one closed menu key.\n');
          continue;
        }
        state = recordCAL002Review(state, reviewId, label);
        await writeReviewState({ root: args.root, relativePath: args.state, state });
        break;
      }
    }

    const completed = completeCAL002Review({
      state,
      reviewerAuthority: 'repository-owner',
      implementationCommitSha: resolveImplementationCommitSha(args),
    });
    await writeImmutableReceipt({ root: args.root, relativePath: args.receipt, receipt: completed.receipt });
    await writeReviewState({ root: args.root, relativePath: args.state, state: completed.state });
    machineOutput({
      ok: true,
      command: args.command,
      status: 'completed',
      ...progress(completed.state),
      stateSha256: completed.stateSha256,
      receiptSha256: completed.receiptSha256,
    });
  } finally {
    input.close();
  }
}

async function loadOriginState(args: OriginArguments, catalog: CAL002Catalog): Promise<OriginState> {
  try {
    return originState(
      await readPrivateCanonical(args.root, args.state, 'CAL-002 origin state'),
      catalog,
    );
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
    return buildOriginState(catalog, [], 'in-progress');
  }
}

async function withOriginSessionLock<T>(args: OriginArguments, action: () => Promise<T>): Promise<T> {
  const statePath = await privateWritePath(args.root, args.state);
  const lockPath = join(dirname(statePath), '.' + basename(statePath) + '.session.lock');
  let lock;
  try {
    lock = await open(lockPath, 'wx', PRIVATE_FILE_MODE);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'EEXIST') {
      throw new Error('CAL-002 origin review session is locked by another process');
    }
    throw error;
  }
  try {
    return await action();
  } finally {
    await lock.close().catch(() => undefined);
    await unlink(lockPath).catch(() => undefined);
    await syncPrivateDirectory(dirname(statePath));
  }
}

async function classifyOrigin(args: OriginArguments): Promise<void> {
  const catalog = await readCanonicalArtifact({
    root: args.root,
    relativePath: args.catalog,
    label: 'CAL-002 catalog',
  }) as CAL002Catalog;
  const ownerRuleIds = catalog.rows
    .filter((row) => row.lane === 'origin' && row.ownerReviewRequired)
    .map((row) => row.ruleId)
    .sort();
  await withOriginSessionLock(args, () => classifyOriginLocked(args, catalog, ownerRuleIds));
}

async function classifyOriginLocked(
  args: OriginArguments,
  catalog: CAL002Catalog,
  ownerRuleIds: readonly string[],
): Promise<void> {
  let state = await loadOriginState(args, catalog);
  if (state.status === 'completed') {
    const artifact = originDecisionArtifact(
      await readPrivateCanonical(args.root, args.out, 'CAL-002 origin decisions'),
      catalog,
    );
    machineOutput({
      ok: true,
      command: args.command,
      status: 'completed',
      labeled: ownerRuleIds.length,
      remaining: 0,
      decisionsSha256: canonicalArtifact(artifact).sha256,
    });
    return;
  }

  const input = createInterface({ input: process.stdin, terminal: false, crlfDelay: Infinity });
  const lines = input[Symbol.asyncIterator]();
  const pause = async (nextRuleId: string | undefined): Promise<void> => {
    state = buildOriginState(catalog, state.decisions, 'in-progress');
    await writePrivateCanonical(args.root, args.state, state);
    machineOutput({
      ok: true,
      command: args.command,
      status: 'paused',
      labeled: state.decisions.length,
      remaining: ownerRuleIds.length - state.decisions.length,
      ...(nextRuleId === undefined ? {} : { nextRuleId }),
    });
  };
  try {
    const decisions = new Map(state.decisions.map((row) => [row.ruleId, row]));
    for (const ruleId of ownerRuleIds) {
      if (decisions.has(ruleId)) continue;
      process.stderr.write('Origin rule: ' + ruleId + '\n' + ORIGIN_MENU + '\n');
      let decision: CAL002OriginDecisionRow | undefined;
      while (decision === undefined) {
        const next = await lines.next();
        const key = next.done ? undefined : next.value;
        if (key === undefined || key === 'q') {
          await pause(ruleId);
          return;
        }
        if (key === '1') {
          decision = { ruleId, disposition: 'hold-origin-default-off' };
        } else if (key === '3') {
          decision = { ruleId, disposition: 'retire', reason: 'duplicate-or-obsolete' };
        } else if (key === '2') {
          while (decision === undefined) {
            process.stderr.write(ORIGIN_TRANSFER_MENU + '\n');
            const reasonInput = await lines.next();
            const reasonKey = reasonInput.done ? undefined : reasonInput.value;
            if (reasonKey === undefined || reasonKey === 'q') {
              await pause(ruleId);
              return;
            }
            const reason = ORIGIN_TRANSFER_REASON_BY_KEY[reasonKey];
            if (reason === undefined) {
              process.stderr.write('Invalid transfer reason; choose one closed menu key.\n');
              continue;
            }
            decision = { ruleId, disposition: 'transfer-to-quality', reason };
          }
        } else {
          process.stderr.write('Invalid selection; choose one closed menu key.\n');
        }
      }
      decisions.set(ruleId, decision);
      state = buildOriginState(catalog, [...decisions.values()], 'in-progress');
      await writePrivateCanonical(args.root, args.state, state);
    }

    const resolution = resolveCAL002OriginDecisions({
      catalog,
      decisions: [...decisions.values()],
    });
    const artifact: OriginDecisionArtifact = {
      version: ORIGIN_DECISIONS_VERSION,
      protocolVersion: CAL002_PROTOCOL_VERSION,
      catalogSha256: CAL002_LOCKED_RULE_CATALOG_SHA256,
      rows: resolution.rows,
      admitted: false,
    };
    await writeImmutablePrivateCanonical(args.root, args.out, artifact);
    state = buildOriginState(catalog, [...decisions.values()], 'completed');
    await writePrivateCanonical(args.root, args.state, state);
    machineOutput({
      ok: true,
      command: args.command,
      status: 'completed',
      labeled: ownerRuleIds.length,
      remaining: 0,
      decisionsSha256: canonicalArtifact(artifact).sha256,
    });
  } finally {
    input.close();
  }
}

async function readAuthorityPriorState(
  args: AuthorityArguments,
  catalog: CAL002Catalog,
): Promise<{ readonly value: OriginState; readonly bytes: Buffer }> {
  const assertValue: (value: unknown) => asserts value is OriginState = (value) => {
    originState(value, catalog);
  };
  return readPrivateCanonicalArtifactWithBytes({
    root: args.root,
    relativePath: args.priorState,
    label: 'CAL-002 prior v1 origin state',
    assertValue,
  });
}

async function loadAuthorityState(
  args: AuthorityArguments,
  pending: CAL002AuthorityStateV2,
): Promise<CAL002AuthorityStateV2> {
  let state: CAL002AuthorityStateV2;
  try {
    state = await readPrivateCanonicalArtifact({
      root: args.root,
      relativePath: args.stateOut,
      label: 'CAL-002 authority state',
      assertValue: assertCAL002AuthorityStateV2,
    });
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
    return pending;
  }
  const expected = { ...pending, decision: state.decision };
  if (canonicalArtifact(state).json !== canonicalArtifact(expected).json) {
    throw new Error('CAL-002 authority state does not match the exact proposal and prior v1 state');
  }
  return state;
}

async function persistApprovedAuthority(
  args: AuthorityArguments,
  proposal: CAL002AuthorityProposalV2,
  state: CAL002AuthorityStateV2,
  priorStateBytes: Uint8Array,
): Promise<void> {
  const completed = completeCAL002AuthoritySessionV2({ proposal, state, priorStateBytes });
  await writePrivateCanonicalState<CAL002AuthorityStateV2>({
    root: args.root,
    relativePath: args.stateOut,
    label: 'CAL-002 authority state',
    value: completed.state,
    assertValue: assertCAL002AuthorityStateV2,
  });
  await writeImmutableCanonicalReceipt<CAL002AuthorityProposalV2>({
    root: args.root,
    relativePath: args.proposalOut,
    label: 'CAL-002 authority proposal',
    value: proposal,
    assertValue: assertCAL002AuthorityProposalV2,
  });
  await writeImmutableCanonicalReceipt<CAL002AuthorityReceiptV2>({
    root: args.root,
    relativePath: args.receiptOut,
    label: 'CAL-002 authority receipt',
    value: completed.receipt,
    assertValue: assertCAL002AuthorityReceiptV2,
  });
  machineOutput({
    ok: true,
    command: args.command,
    status: 'approved',
    proposalSha256: completed.state.proposalSha256,
    proposalArtifactSha256: canonicalArtifact(proposal).sha256,
    stateSha256: completed.stateSha256,
    receiptSha256: completed.receiptSha256,
    admitted: false,
    applied: false,
  });
}

function reportRejectedAuthority(args: AuthorityArguments, state: CAL002AuthorityStateV2): void {
  machineOutput({
    ok: true,
    command: args.command,
    status: 'rejected',
    proposalSha256: state.proposalSha256,
    priorStateSha256: state.priorStateSha256,
    admitted: false,
    applied: false,
  });
  process.exitCode = 2;
}

async function classifyAuthorityLocked(args: AuthorityArguments): Promise<void> {
  const catalog = await readCanonicalArtifact({
    root: args.root,
    relativePath: args.catalog,
    label: 'CAL-002 catalog',
  }) as CAL002Catalog;
  const priorState = await readAuthorityPriorState(args, catalog);
  const priorStateSha256 = createHash('sha256').update(priorState.bytes).digest('hex');
  const proposalResult = buildCAL002AuthorityProposalV2(catalog, priorStateSha256);
  const pending = startCAL002AuthoritySessionV2({
    proposal: proposalResult.proposal,
    priorStateSha256,
  });
  const state = await loadAuthorityState(args, pending);
  if (state.decision === 'approved') {
    await persistApprovedAuthority(args, proposalResult.proposal, state, priorState.bytes);
    return;
  }
  if (state.decision === 'rejected') {
    reportRejectedAuthority(args, state);
    return;
  }

  const input = createInterface({ input: process.stdin, terminal: false, crlfDelay: Infinity });
  const lines = input[Symbol.asyncIterator]();
  try {
    process.stderr.write(`CAL-002 authority batch:\n${AUTHORITY_MENU}\n`);
    while (true) {
      const next = await lines.next();
      if (next.done) throw new Error('classify-authority requires owner choice 1 or 2');
      if (next.value === '1') {
        const approved = decideCAL002AuthoritySessionV2(state, 'approved');
        await persistApprovedAuthority(args, proposalResult.proposal, approved, priorState.bytes);
        return;
      }
      if (next.value === '2') {
        const rejected = decideCAL002AuthoritySessionV2(state, 'rejected');
        await writePrivateCanonicalState<CAL002AuthorityStateV2>({
          root: args.root,
          relativePath: args.stateOut,
          label: 'CAL-002 authority state',
          value: rejected,
          assertValue: assertCAL002AuthorityStateV2,
        });
        reportRejectedAuthority(args, rejected);
        return;
      }
      process.stderr.write('Invalid selection; choose owner authority key 1 or 2.\n');
    }
  } finally {
    input.close();
  }
}

async function classifyAuthority(args: AuthorityArguments): Promise<void> {
  await assertDistinctArtifactDestinations({
    root: args.root,
    artifacts: [
      { relativePath: args.catalog, label: 'CAL-002 catalog' },
      { relativePath: args.priorState, label: 'CAL-002 prior v1 origin state' },
      { relativePath: args.proposalOut, label: 'CAL-002 authority proposal' },
      { relativePath: args.stateOut, label: 'CAL-002 authority state' },
      { relativePath: args.receiptOut, label: 'CAL-002 authority receipt' },
    ],
    reservePrivateLocksFor: [
      { relativePath: AUTHORITY_STATE_RELATIVE_PATH, label: 'CAL-002 authority state' },
    ],
  });
  await withPrivateArtifactSessionLock({
    root: args.root,
    relativePath: AUTHORITY_STATE_RELATIVE_PATH,
    label: 'CAL-002 authority',
  }, () => classifyAuthorityLocked(args));
}

async function qualityCloseout(args: QualityCloseoutArguments): Promise<void> {
  await assertDistinctArtifactDestinations({
    root: args.root,
    artifacts: [
      { relativePath: args.authority, label: 'CAL-002 authority receipt' },
      { relativePath: args.out, label: 'CAL-002 quality disposition' },
    ],
  });
  const authorityReceipt = await readCanonicalArtifact({
    root: args.root,
    relativePath: args.authority,
    label: 'CAL-002 authority receipt',
  }) as CAL002AuthorityReceiptV2;
  const result = buildCAL002QualityDispositionV2({
    authorityReceipt,
    selectedRuleIds: [],
    selectedMetrics: [],
    implementationCommitSha: resolveCommitSha(args.implementationCommitSha, 'quality-closeout'),
  });
  await writeImmutableCanonicalReceipt<CAL002QualityDispositionV2>({
    root: args.root,
    relativePath: args.out,
    label: 'CAL-002 quality disposition',
    value: result.disposition,
    assertValue: assertCAL002QualityDispositionV2,
  });
  machineOutput({
    ok: true,
    command: args.command,
    status: 'completed',
    dispositionSha256: result.dispositionSha256,
    authorityReceiptSha256: result.disposition.authorityReceiptSha256,
    rows: result.disposition.rows.length,
    selectedRuleIds: result.disposition.selectedRuleIds,
    admitted: false,
    applied: false,
  });
}

async function planQualityCohort(args: PlanQualityCohortArguments): Promise<void> {
  await assertDistinctArtifactDestinations({
    root: args.root,
    artifacts: [
      { relativePath: args.authority, label: 'CAL-002 authority receipt' },
      { relativePath: args.reach, label: 'CAL-002 quality reach' },
      { relativePath: args.out, label: 'CAL-002 private quality cohort' },
    ],
  });
  const authorityReceipt = await readCanonicalArtifact({
    root: args.root,
    relativePath: args.authority,
    label: 'CAL-002 authority receipt',
  }) as CAL002AuthorityReceiptV2;
  const reach = await readCanonicalArtifact({
    root: args.root,
    relativePath: args.reach,
    label: 'CAL-002 quality reach',
  }) as readonly CAL002QualityReachRowV2[];
  const plan = planCAL002QualityCohortV2({
    authorityReceipt,
    reach,
    selectedRuleIds: args.selectedRuleIds,
  });
  await writePrivateCanonicalState<CAL002QualityCohortPlanV2>({
    root: args.root,
    relativePath: args.out,
    label: 'CAL-002 private quality cohort',
    value: plan,
    assertValue: assertCAL002QualityCohortPlanV2,
  });
  machineOutput({
    ok: true,
    command: args.command,
    status: 'planned',
    selectedRuleIds: plan.selectedRuleIds,
    initialLabels: plan.initialLabels,
    maximumLabels: plan.maximumLabels,
    admitted: false,
    applied: false,
  });
}

async function verifyOriginV2(args: VerifyOriginV2Arguments): Promise<void> {
  await assertDistinctArtifactDestinations({
    root: args.root,
    artifacts: [
      { relativePath: args.authority, label: 'CAL-002 authority receipt' },
      { relativePath: args.out, label: 'CAL-002 v2 origin receipt' },
      { relativePath: PROTECTED_ORIGIN_STATE_RELATIVE_PATH, label: 'CAL-002 protected v1 origin state' },
    ],
  });
  const monorepoRoot = detectMonorepoRoot(process.cwd())
    ?? detectMonorepoRoot(args.root);
  if (monorepoRoot === undefined) {
    throw new Error('verify-origin-v2 requires a CAL-002 monorepo root for frozen hash verification');
  }
  const authorityReceipt = await readCanonicalArtifact({
    root: args.root,
    relativePath: args.authority,
    label: 'CAL-002 authority receipt',
  }) as CAL002AuthorityReceiptV2;
  assertCAL002AuthorityReceiptV2(authorityReceipt);
  const originImplementationCommitSha = resolveCommitSha(
    args.implementationCommitSha,
    'verify-origin-v2',
  );
  assertCommitSha(originImplementationCommitSha, 'originImplementationCommitSha');

  const governingHashes = await recordedCAL001OriginGoverningHashes(monorepoRoot);
  const assessment = assessCAL002CAL001Reuse({
    governingHashes: governingHashes ?? {},
    expectedGoverningHashes: CAL002_ORIGIN_FROZEN_GOVERNING_HASHES,
  });
  let rerunEvidence;
  if (assessment.status === 'rerun-required') {
    rerunEvidence = {
      workerCount: 1 as const,
      governingHashes: await rerunCAL001OriginEvidence(monorepoRoot, args.corpusRoot),
    };
  }
  const result = buildCAL002OriginReceiptV2({
    authorityReceipt,
    governingHashes: governingHashes ?? {},
    originImplementationCommitSha,
    ...(rerunEvidence === undefined ? {} : { rerunEvidence }),
  });
  await writeImmutableCanonicalReceipt<CAL002OriginReceiptV2>({
    root: args.root,
    relativePath: args.out,
    label: 'CAL-002 v2 origin receipt',
    value: result.receipt,
    assertValue: assertCAL002OriginReceiptV2,
  });
  machineOutput({
    ok: true,
    command: args.command,
    status: result.receipt.status,
    receiptSha256: result.receiptSha256,
    authorityReceiptSha256: result.receipt.authorityReceiptSha256,
    rows: result.receipt.rows.length,
    admitted: false,
  });
}

async function buildCatalogCommand(args: CatalogArguments): Promise<void> {
  const matrix = await readCAL001DecisionMatrix(args.root, args.cal001Matrix);
  const registry = new RuleRegistry();
  registry.loadBuiltins();
  const result = buildCAL002Catalog({
    rules: registry.getRules(),
    effectiveDefaultOffRuleIds: getDefaultOffRules(),
    cal001Rows: matrix.rows,
    cal001MatrixSha256: canonicalArtifact(matrix).sha256,
  });
  const catalogValidation = validateCAL002Catalog(result.catalog);
  if (!catalogValidation.ok) {
    throw new Error(`CAL-002 catalog projection is invalid: ${catalogValidation.errors.join('; ')}`);
  }
  await writeImmutablePrivateCanonical(args.root, args.out, result.catalog, 'CAL-002 catalog');
  machineOutput({
    ok: true,
    command: args.command,
    status: 'completed',
    catalogSha256: result.catalogSha256,
    counts: result.catalog.counts,
    admitted: false,
    applied: false,
  });
}

async function buildMatrixCommand(args: MatrixArguments): Promise<void> {
  const catalog = await readCanonicalArtifact({ root: args.root, relativePath: args.catalog, label: 'CAL-002 catalog' }) as CAL002Catalog;
  const laneArtifact = originDecisionArtifact(
    await readCanonicalArtifact({ root: args.root, relativePath: args.laneDecisions, label: 'CAL-002 lane decisions' }),
    catalog,
  );
  const originReceipt = await readCanonicalArtifact({ root: args.root, relativePath: args.originReceipt, label: 'CAL-002 origin receipt' }) as CAL002OriginReceipt;
  const qualityMetrics = await readCanonicalArtifact({ root: args.root, relativePath: args.qualityMetrics, label: 'CAL-002 quality metrics' }) as CAL002QualityMetrics;
  const oracleReceipt = await readCanonicalArtifact({ root: args.root, relativePath: args.oracleReceipt, label: 'CAL-002 oracle receipt' }) as CAL002OracleReceipt;
  const result = buildCAL002FinalMatrix({
    catalog,
    laneDecisions: laneArtifact.rows,
    originReceipt,
    qualityMetrics,
    oracleReceipt,
    reducerImplementationCommitSha: resolveCommitSha(args.implementationCommitSha, 'matrix'),
  });
  await writeImmutablePrivateCanonical(args.root, args.out, result.matrix, 'CAL-002 final matrix');
  machineOutput({
    ok: true,
    command: args.command,
    status: 'completed',
    matrixSha256: result.matrixSha256,
    counts: result.matrix.counts,
    admitted: false,
    applied: false,
  });
}

async function approveMatrix(args: ApproveMatrixArguments): Promise<void> {
  const matrix = await readCanonicalArtifact({ root: args.root, relativePath: args.matrix, label: 'CAL-002 final matrix' }) as CAL002FinalMatrix;
  const matrixSha256 = canonicalArtifact(matrix).sha256;
  process.stderr.write([
    `Final matrix SHA-256: ${matrixSha256}`,
    `Rows: ${matrix.rows.length}`,
    `Outcomes: ${canonicalArtifact(matrix.counts).json}`,
    '1 approve this exact matrix SHA for application',
    '2 reject this matrix SHA and return to the named evidence row',
  ].join('\n') + '\n');
  const input = createInterface({ input: process.stdin, terminal: false, crlfDelay: Infinity });
  try {
    for await (const line of input) {
      if (line === '1') {
        const approval = buildCAL002MatrixApproval({
          matrix,
          approvalCommitSha: resolveCommitSha(args.approvalCommitSha, 'approve-matrix'),
        });
        await writeImmutablePrivateCanonical(args.root, args.out, approval.approval, 'CAL-002 matrix approval');
        machineOutput({
          ok: true,
          command: args.command,
          status: 'approved',
          finalMatrixSha256: approval.approval.finalMatrixSha256,
          approvalSha256: approval.approvalSha256,
        });
        return;
      }
      if (line === '2' || line === 'q') {
        machineOutput({ ok: true, command: args.command, status: 'rejected', finalMatrixSha256: matrixSha256, receiptWritten: false });
        return;
      }
      process.stderr.write('Invalid selection; choose one closed matrix approval key.\n');
    }
    machineOutput({ ok: true, command: args.command, status: 'rejected', finalMatrixSha256: matrixSha256, receiptWritten: false });
  } finally {
    input.close();
  }
}

async function applyPolicy(args: ApplyArguments): Promise<void> {
  const matrix = await readCanonicalArtifact({ root: args.root, relativePath: args.matrix, label: 'CAL-002 final matrix' }) as CAL002FinalMatrix;
  const approval = await readCanonicalArtifact({ root: args.root, relativePath: args.approval, label: 'CAL-002 matrix approval' }) as CAL002MatrixApproval;
  const result = buildCAL002PolicyArtifact({
    matrix,
    approval,
    applicationImplementationCommitSha: resolveCommitSha(args.implementationCommitSha, 'apply'),
  });
  if (args.dryRun) {
    await writeImmutablePrivateCanonical(args.root, args.out, result.policy, 'CAL-002 proposed policy');
    machineOutput({
      ok: true,
      command: args.command,
      status: 'dry-run',
      policySha256: result.policySha256,
      finalMatrixSha256: result.policy.finalMatrixSha256,
      admitted: false,
      applied: true,
    });
    return;
  }

  const destination = args.destination ?? args.out;
  await writeImmutablePrivateCanonical(args.root, destination, result.policy, 'CAL-002 applied policy');
  const persisted = await readPrivateCanonical(args.root, destination, 'CAL-002 applied policy');
  if (canonicalArtifact(persisted).json !== result.policyJson) {
    throw new Error('CAL-002 applied policy did not reproduce the proposed canonical bytes');
  }
  if (args.receipt !== undefined) {
    await writeImmutablePrivateCanonical(args.root, args.receipt, result.applicationReceipt, 'CAL-002 application receipt');
  }
  machineOutput({
    ok: true,
    command: args.command,
    status: 'applied',
    policySha256: result.policySha256,
    applicationReceiptSha256: result.applicationReceiptSha256,
    admitted: false,
    applied: true,
  });
}

async function main(): Promise<void> {
  const argv = process.argv.slice(2);
  let first = 0;
  while (argv[first] === '--') first += 1;
  let command = argv[first] ?? 'unknown';
  try {
    if (command === 'classify-origin') {
      throw new Error('Use classify-authority; the v1 state remains immutable and will not be read or rewritten');
    }
    const args = parseArguments(argv);
    command = args.command;
    if (args.command === 'review-quality') await reviewQuality(args);
    else if (args.command === 'classify-origin') await classifyOrigin(args);
    else if (args.command === 'classify-authority') await classifyAuthority(args);
    else if (args.command === 'quality-closeout') await qualityCloseout(args);
    else if (args.command === 'plan-quality-cohort') await planQualityCohort(args);
    else if (args.command === 'verify-origin-v2') await verifyOriginV2(args);
    else if (args.command === 'catalog') await buildCatalogCommand(args);
    else if (args.command === 'matrix') await buildMatrixCommand(args);
    else if (args.command === 'approve-matrix') await approveMatrix(args);
    else await applyPolicy(args);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    process.stderr.write(`CAL-002 ${command}: ${message}\n`);
    machineOutput({ ok: false, command, error: message });
    process.exitCode = 2;
  }
}

await main();
