import {
  CAL002_LOCKED_RULE_CATALOG_SHA256,
  CAL002_PROTOCOL_VERSION,
  CAL002_REVIEW_RECEIPT_VERSION,
  assertCommitSha,
  assertSha256,
  canonicalArtifact,
  validateCAL002ReviewReceipt,
  type CAL002ReviewLabel,
} from './contracts';

export const CAL002_REVIEW_STATE_VERSION = 'cal-002-review-state-v1' as const;

const REVIEW_LABELS = new Set<CAL002ReviewLabel>([
  'actionable-defect',
  'useful-no-safe-fix',
  'not-useful',
  'cannot-determine',
]);

export interface CAL002ReviewRow {
  readonly reviewId: string;
  readonly label: CAL002ReviewLabel;
}

export interface CAL002ReviewState {
  readonly version: typeof CAL002_REVIEW_STATE_VERSION;
  readonly protocolVersion: typeof CAL002_PROTOCOL_VERSION;
  readonly catalogSha256: typeof CAL002_LOCKED_RULE_CATALOG_SHA256;
  readonly assignmentSha256: string;
  readonly blindedBatchSha256: string;
  readonly status: 'in-progress' | 'completed';
  readonly reviewIds: readonly string[];
  readonly rows: readonly CAL002ReviewRow[];
}

export interface CAL002ReviewReceipt {
  readonly version: typeof CAL002_REVIEW_RECEIPT_VERSION;
  readonly protocolVersion: typeof CAL002_PROTOCOL_VERSION;
  readonly catalogSha256: typeof CAL002_LOCKED_RULE_CATALOG_SHA256;
  readonly assignmentSha256: string;
  readonly blindedBatchSha256: string;
  readonly stateSha256: string;
  readonly reviewImplementationCommitSha: string;
  readonly reviewerAuthority: 'repository-owner';
  readonly rows: readonly CAL002ReviewRow[];
  readonly admitted: false;
}

export interface CAL002ReviewReceiptResult {
  readonly state: CAL002ReviewState;
  readonly stateJson: string;
  readonly stateSha256: string;
  readonly receipt: CAL002ReviewReceipt;
  readonly receiptJson: string;
  readonly receiptSha256: string;
}

function compareCodePoints(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function exactKeys(value: Record<string, unknown>, keys: readonly string[], label: string): void {
  const actual = Object.keys(value).sort(compareCodePoints);
  const expected = [...keys].sort(compareCodePoints);
  if (actual.length !== expected.length || actual.some((key, index) => key !== expected[index])) {
    throw new TypeError(`${label} must contain exactly ${keys.join(', ')}`);
  }
}

function assertReviewId(value: unknown, label: string): asserts value is string {
  if (typeof value !== 'string' || value.length === 0) throw new TypeError(`${label} must be a non-empty review ID`);
}

function assertReviewLabel(value: unknown): asserts value is CAL002ReviewLabel {
  if (typeof value !== 'string' || !REVIEW_LABELS.has(value as CAL002ReviewLabel)) {
    throw new TypeError(`Unknown label ${String(value)} for CAL-002 review`);
  }
}

export function assertCAL002ReviewState(value: unknown): asserts value is CAL002ReviewState {
  if (!isRecord(value)) throw new TypeError('CAL-002 review state must be an object');
  exactKeys(
    value,
    ['version', 'protocolVersion', 'catalogSha256', 'assignmentSha256', 'blindedBatchSha256', 'status', 'reviewIds', 'rows'],
    'CAL-002 review state',
  );
  if (value.version !== CAL002_REVIEW_STATE_VERSION) throw new TypeError('CAL-002 review state version is invalid');
  if (value.protocolVersion !== CAL002_PROTOCOL_VERSION) throw new TypeError('CAL-002 review state protocol version is invalid');
  if (value.catalogSha256 !== CAL002_LOCKED_RULE_CATALOG_SHA256) throw new TypeError('CAL-002 review state catalog hash is invalid');
  assertSha256(value.assignmentSha256, 'CAL-002 review state assignmentSha256');
  assertSha256(value.blindedBatchSha256, 'CAL-002 review state blindedBatchSha256');
  if (value.status !== 'in-progress' && value.status !== 'completed') throw new TypeError('CAL-002 review state status is invalid');
  if (!Array.isArray(value.reviewIds) || value.reviewIds.length === 0) throw new TypeError('CAL-002 review state requires review IDs');
  const reviewIds = new Set<string>();
  for (const [index, reviewId] of value.reviewIds.entries()) {
    assertReviewId(reviewId, `CAL-002 review state reviewIds[${index}]`);
    if (reviewIds.has(reviewId)) throw new TypeError(`Duplicate CAL-002 review ID ${reviewId}`);
    reviewIds.add(reviewId);
  }
  if (!Array.isArray(value.rows)) throw new TypeError('CAL-002 review state rows must be an array');
  const labeled = new Set<string>();
  let priorIndex = -1;
  for (const [index, candidate] of value.rows.entries()) {
    if (!isRecord(candidate)) throw new TypeError(`CAL-002 review state rows[${index}] must be an object`);
    exactKeys(candidate, ['reviewId', 'label'], `CAL-002 review state rows[${index}]`);
    assertReviewId(candidate.reviewId, `CAL-002 review state rows[${index}].reviewId`);
    assertReviewLabel(candidate.label);
    if (!reviewIds.has(candidate.reviewId)) throw new TypeError(`Unknown review ID ${candidate.reviewId} for CAL-002`);
    if (labeled.has(candidate.reviewId)) throw new TypeError(`Duplicate CAL-002 label for ${candidate.reviewId}`);
    labeled.add(candidate.reviewId);
    const reviewIndex = value.reviewIds.indexOf(candidate.reviewId);
    if (reviewIndex <= priorIndex) throw new TypeError('CAL-002 review state rows are not in review order');
    priorIndex = reviewIndex;
  }
  if (value.status === 'completed' && labeled.size !== reviewIds.size) {
    throw new TypeError('Completed CAL-002 review state has unlabeled rows');
  }
}

export function startCAL002Review(input: {
  assignmentSha256: string;
  blindedBatchSha256: string;
  reviewIds: readonly string[];
}): CAL002ReviewState {
  assertSha256(input.assignmentSha256, 'assignmentSha256');
  assertSha256(input.blindedBatchSha256, 'blindedBatchSha256');
  if (!Array.isArray(input.reviewIds) || input.reviewIds.length === 0) throw new TypeError('CAL-002 review requires review IDs');
  const reviewIds = [...input.reviewIds];
  const seen = new Set<string>();
  for (const [index, reviewId] of reviewIds.entries()) {
    assertReviewId(reviewId, `reviewIds[${index}]`);
    if (seen.has(reviewId)) throw new TypeError(`Duplicate CAL-002 review ID ${reviewId}`);
    seen.add(reviewId);
  }
  return {
    version: CAL002_REVIEW_STATE_VERSION,
    protocolVersion: CAL002_PROTOCOL_VERSION,
    catalogSha256: CAL002_LOCKED_RULE_CATALOG_SHA256,
    assignmentSha256: input.assignmentSha256,
    blindedBatchSha256: input.blindedBatchSha256,
    status: 'in-progress',
    reviewIds,
    rows: [],
  };
}

export function nextCAL002ReviewId(state: CAL002ReviewState): string | undefined {
  assertCAL002ReviewState(state);
  if (state.status === 'completed') return undefined;
  const labeled = new Set(state.rows.map((row) => row.reviewId));
  return state.reviewIds.find((reviewId) => !labeled.has(reviewId));
}

export function recordCAL002Review(
  state: CAL002ReviewState,
  reviewId: string,
  label: CAL002ReviewLabel,
): CAL002ReviewState {
  assertCAL002ReviewState(state);
  if (state.status === 'completed') throw new Error('CAL-002 review is completed and immutable');
  assertReviewId(reviewId, 'reviewId');
  assertReviewLabel(label);
  if (!state.reviewIds.includes(reviewId)) throw new TypeError(`Unknown review ID ${reviewId} for CAL-002`);
  const existing = state.rows.find((row) => row.reviewId === reviewId);
  if (existing?.label === label) return state;
  if (existing) throw new Error(`Conflicting CAL-002 relabel for ${reviewId}`);
  const labels = new Map(state.rows.map((row) => [row.reviewId, row.label]));
  labels.set(reviewId, label);
  return {
    ...state,
    rows: state.reviewIds.flatMap((id) => {
      const recorded = labels.get(id);
      return recorded === undefined ? [] : [{ reviewId: id, label: recorded }];
    }),
  };
}

export function completeCAL002Review(input: {
  state: CAL002ReviewState;
  reviewerAuthority: 'repository-owner';
  implementationCommitSha: string;
}): CAL002ReviewReceiptResult {
  assertCAL002ReviewState(input.state);
  if (input.state.status === 'completed') throw new Error('CAL-002 review is already completed and immutable');
  if (input.reviewerAuthority !== 'repository-owner') throw new TypeError('CAL-002 reviewerAuthority must be repository-owner');
  assertCommitSha(input.implementationCommitSha, 'implementationCommitSha');
  if (input.state.rows.length !== input.state.reviewIds.length) throw new Error('CAL-002 review is incomplete and has unlabeled rows');
  const state: CAL002ReviewState = { ...input.state, status: 'completed' };
  const stateArtifact = canonicalArtifact(state);
  const receipt: CAL002ReviewReceipt = {
    version: CAL002_REVIEW_RECEIPT_VERSION,
    protocolVersion: CAL002_PROTOCOL_VERSION,
    catalogSha256: state.catalogSha256,
    assignmentSha256: state.assignmentSha256,
    blindedBatchSha256: state.blindedBatchSha256,
    stateSha256: stateArtifact.sha256,
    reviewImplementationCommitSha: input.implementationCommitSha,
    reviewerAuthority: input.reviewerAuthority,
    rows: [...state.rows].sort((left, right) => compareCodePoints(left.reviewId, right.reviewId)),
    admitted: false,
  };
  const validation = validateCAL002ReviewReceipt(receipt);
  if (!validation.ok) throw new TypeError(`CAL-002 review receipt is invalid: ${validation.errors.join('; ')}`);
  const receiptArtifact = canonicalArtifact(receipt);
  return {
    state,
    stateJson: stateArtifact.json,
    stateSha256: stateArtifact.sha256,
    receipt,
    receiptJson: receiptArtifact.json,
    receiptSha256: receiptArtifact.sha256,
  };
}
