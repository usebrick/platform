import { createHash } from 'node:crypto';
import { TextDecoder } from 'node:util';

import {
  authorityDecisionRowsV2,
  authorityProposalSha256V2,
  canonicalAuthorityRowsV2,
} from './authority';
import {
  CAL002_LOCKED_RULE_CATALOG_SHA256,
  assertSha256,
  canonicalArtifact,
} from './contracts';
import {
  CAL002_AUTHORITY_RECEIPT_VERSION,
  CAL002_AUTHORITY_STATE_VERSION,
  CAL002_PROTOCOL_VERSION_V2,
  assertCAL002AuthorityProposalV2,
  assertCAL002AuthorityReceiptV2,
  assertCAL002AuthorityStateV2,
  type CAL002AuthorityProposalV2,
  type CAL002AuthorityReceiptV2,
  type CAL002AuthorityStateV2,
} from './contracts-v2';

export interface CAL002AuthoritySessionResultV2 {
  readonly state: CAL002AuthorityStateV2;
  readonly stateJson: string;
  readonly stateSha256: string;
  readonly receipt: CAL002AuthorityReceiptV2;
  readonly receiptJson: string;
  readonly receiptSha256: string;
}

function assertExactOwnerBatch(proposal: CAL002AuthorityProposalV2): void {
  const actual = proposal.rows.filter((row) => row.sourceClass === 'owner-batch');
  const expected = canonicalAuthorityRowsV2().filter((row) => row.sourceClass === 'owner-batch');
  if (actual.length !== 40
    || canonicalArtifact(authorityDecisionRowsV2(actual)).json
      !== canonicalArtifact(authorityDecisionRowsV2(expected)).json) {
    throw new TypeError('CAL-002 authority proposal must contain the exact canonical 40-row owner batch');
  }
}

function assertStateBinding(
  proposal: CAL002AuthorityProposalV2,
  state: CAL002AuthorityStateV2,
): void {
  assertCAL002AuthorityProposalV2(proposal);
  assertCAL002AuthorityStateV2(state);
  assertExactOwnerBatch(proposal);
  if (state.proposalSha256 !== authorityProposalSha256V2(proposal)) {
    throw new TypeError('CAL-002 authority state proposal SHA-256 does not match the authority gate proposal');
  }
  if (state.priorStateSha256 !== proposal.priorStateSha256) {
    throw new TypeError('CAL-002 authority state prior SHA-256 does not match the proposal');
  }
}

function priorStateBytesSha256(bytes: Uint8Array | string): string {
  const buffer = typeof bytes === 'string' ? Buffer.from(bytes, 'utf8') : Buffer.from(bytes);
  let text: string;
  try {
    text = new TextDecoder('utf-8', { fatal: true }).decode(buffer);
  } catch {
    throw new TypeError('CAL-002 prior v1 state bytes are not valid UTF-8');
  }
  if (!Buffer.from(text, 'utf8').equals(buffer)) {
    throw new TypeError('CAL-002 prior v1 state bytes do not round-trip as exact UTF-8');
  }
  let value: unknown;
  try {
    value = JSON.parse(text) as unknown;
  } catch {
    throw new TypeError('CAL-002 prior v1 state bytes are not valid JSON');
  }
  if (!Buffer.from(canonicalArtifact(value).json, 'utf8').equals(buffer)) {
    throw new TypeError('CAL-002 prior v1 state bytes are not exact canonical JSON');
  }
  return createHash('sha256').update(buffer).digest('hex');
}

export function startCAL002AuthoritySessionV2(input: {
  readonly proposal: CAL002AuthorityProposalV2;
  readonly priorStateSha256: string;
}): CAL002AuthorityStateV2 {
  assertCAL002AuthorityProposalV2(input.proposal);
  assertSha256(input.priorStateSha256, 'CAL-002 authority priorStateSha256');
  assertExactOwnerBatch(input.proposal);
  if (input.proposal.priorStateSha256 !== input.priorStateSha256) {
    throw new TypeError('CAL-002 authority proposal prior SHA-256 does not match the supplied prior state');
  }
  const state: CAL002AuthorityStateV2 = {
    version: CAL002_AUTHORITY_STATE_VERSION,
    protocolVersion: CAL002_PROTOCOL_VERSION_V2,
    catalogSha256: CAL002_LOCKED_RULE_CATALOG_SHA256,
    proposalSha256: authorityProposalSha256V2(input.proposal),
    priorStateSha256: input.priorStateSha256,
    revision: 2,
    reviewerAuthority: 'repository-owner',
    decision: 'pending',
    admitted: false,
    applied: false,
  };
  assertCAL002AuthorityStateV2(state);
  return state;
}

export function decideCAL002AuthoritySessionV2(
  state: CAL002AuthorityStateV2,
  decision: 'approved' | 'rejected',
): CAL002AuthorityStateV2 {
  assertCAL002AuthorityStateV2(state);
  if (state.decision !== 'pending') throw new TypeError('CAL-002 authority decision is already closed');
  if (decision !== 'approved' && decision !== 'rejected') {
    throw new TypeError('CAL-002 authority decision must be approved or rejected');
  }
  return { ...state, decision };
}

export function completeCAL002AuthoritySessionV2(input: {
  readonly proposal: CAL002AuthorityProposalV2;
  readonly state: CAL002AuthorityStateV2;
  readonly priorStateBytes: Uint8Array | string;
}): CAL002AuthoritySessionResultV2 {
  assertStateBinding(input.proposal, input.state);
  if (input.state.decision !== 'approved') {
    throw new TypeError('CAL-002 authority session must be approved before completion');
  }
  const observedPriorStateSha256 = priorStateBytesSha256(input.priorStateBytes);
  if (observedPriorStateSha256 !== input.state.priorStateSha256) {
    throw new TypeError('CAL-002 prior v1 state SHA-256 does not match the supplied canonical bytes');
  }
  const receipt: CAL002AuthorityReceiptV2 = {
    version: CAL002_AUTHORITY_RECEIPT_VERSION,
    protocolVersion: CAL002_PROTOCOL_VERSION_V2,
    catalogSha256: CAL002_LOCKED_RULE_CATALOG_SHA256,
    proposalSha256: authorityProposalSha256V2(input.proposal),
    priorStateSha256: input.state.priorStateSha256,
    revision: 2,
    reviewerAuthority: 'repository-owner',
    decision: 'approved',
    associationSnapshot: input.proposal.associationSnapshot,
    rows: input.proposal.rows,
    authorityRowsSha256: input.proposal.authorityRowsSha256,
    associationRowsSha256: input.proposal.associationRowsSha256,
    admitted: false,
    applied: false,
  };
  assertCAL002AuthorityReceiptV2(receipt);
  const stateArtifact = canonicalArtifact(input.state);
  const receiptArtifact = canonicalArtifact(receipt);
  return {
    state: input.state,
    stateJson: stateArtifact.json,
    stateSha256: stateArtifact.sha256,
    receipt,
    receiptJson: receiptArtifact.json,
    receiptSha256: receiptArtifact.sha256,
  };
}
