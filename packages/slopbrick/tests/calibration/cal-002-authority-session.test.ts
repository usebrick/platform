import { createHash } from 'node:crypto';
import {
  chmod,
  lstat,
  mkdir,
  mkdtemp,
  readFile,
  rm,
  symlink,
  writeFile,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import type { Rule } from '../../src/types';
import type { CAL001DecisionRow } from '../../src/calibration/corpus-v1/calibration-decisions';
import {
  readPrivateCanonicalArtifact,
  writeImmutableCanonicalReceipt,
  writePrivateCanonicalState,
} from '../../src/calibration/cal-002/artifact-io';
import { authorityProposalSha256V2, buildCAL002AuthorityProposalV2 } from '../../src/calibration/cal-002/authority';
import {
  completeCAL002AuthoritySessionV2,
  decideCAL002AuthoritySessionV2,
  startCAL002AuthoritySessionV2,
} from '../../src/calibration/cal-002/authority-session';
import { buildCAL002Catalog } from '../../src/calibration/cal-002/catalog';
import { CAL002_LOCKED_RULE_CATALOG_SHA256, canonicalArtifact } from '../../src/calibration/cal-002/contracts';
import {
  assertCAL002AuthorityReceiptV2,
  assertCAL002AuthorityStateV2,
  type CAL002AuthorityReceiptV2,
  type CAL002AuthorityStateV2,
} from '../../src/calibration/cal-002/contracts-v2';
import { RuleRegistry } from '../../src/rules/registry';
import { getDefaultOffRules } from '../../src/rules/signal-strength';

const HASH_A = 'a'.repeat(64);
const HASH_B = 'b'.repeat(64);
const HASH_C = 'c'.repeat(64);
const roots: string[] = [];

function sha256(bytes: Uint8Array): string {
  return createHash('sha256').update(bytes).digest('hex');
}

async function temporaryRoot(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), 'cal-002-authority-session-'));
  roots.push(root);
  return root;
}

function buildCatalogFixture() {
  const registry = new RuleRegistry();
  registry.loadBuiltins();
  const rules = registry.getRules() as readonly Pick<Rule, 'id' | 'category' | 'aiSpecific' | 'defaultOff'>[];
  const effectiveDefaultOffRuleIds = getDefaultOffRules();
  const cal001Rows: CAL001DecisionRow[] = rules.map((rule) => {
    const existingDefaultOff = rule.defaultOff === true || effectiveDefaultOffRuleIds.has(rule.id);
    const decision = rule.aiSpecific ? 'default-off' as const : 'quality-only' as const;
    return {
      ruleId: rule.id,
      aiSpecific: rule.aiSpecific,
      existingDefaultOff,
      decision,
      policyAction: decision === 'quality-only' || existingDefaultOff ? 'preserve' : 'owner-review-required',
      evidence: {
        holdoutReceiptSha256: HASH_B,
        metricsSha256: HASH_C,
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
      rationale: 'Frozen CAL-001 authority-session fixture row.',
    };
  });
  return buildCAL002Catalog({
    rules,
    effectiveDefaultOffRuleIds,
    cal001Rows,
    cal001MatrixSha256: HASH_A,
  }).catalog;
}

function priorStateBytes(): Buffer {
  return Buffer.from(canonicalArtifact({
    version: 'cal-002-origin-state-v1',
    protocolVersion: 'CAL-002-v1',
    catalogSha256: CAL002_LOCKED_RULE_CATALOG_SHA256,
    decisions: [{ ruleId: 'ai/any-density', disposition: 'hold-origin-default-off' }],
    status: 'in-progress',
  }).json);
}

function authorityFixture() {
  const priorBytes = priorStateBytes();
  const priorStateSha256 = sha256(priorBytes);
  const proposalResult = buildCAL002AuthorityProposalV2(buildCatalogFixture(), priorStateSha256);
  const pending = startCAL002AuthoritySessionV2({
    proposal: proposalResult.proposal,
    priorStateSha256,
  });
  return { pending, priorBytes, priorStateSha256, proposalResult };
}

afterEach(async () => {
  while (roots.length > 0) await rm(roots.pop()!, { recursive: true, force: true });
});

describe('CAL-002 v2 authority session', () => {
  it('binds approval to the association-free proposal hash and exact prior bytes without rewriting them', async () => {
    const root = await temporaryRoot();
    const priorPath = join(root, 'origin-state.json');
    const fixture = authorityFixture();
    await writeFile(priorPath, fixture.priorBytes, { mode: 0o600 });
    const before = await readFile(priorPath);

    expect(fixture.proposalResult.proposalSha256).toBe(
      authorityProposalSha256V2(fixture.proposalResult.proposal),
    );
    expect(fixture.proposalResult.proposalSha256).not.toBe(
      canonicalArtifact(fixture.proposalResult.proposal).sha256,
    );
    expect(fixture.pending.proposalSha256).toBe(fixture.proposalResult.proposalSha256);

    const approved = decideCAL002AuthoritySessionV2(fixture.pending, 'approved');
    const completed = completeCAL002AuthoritySessionV2({
      proposal: fixture.proposalResult.proposal,
      state: approved,
      priorStateBytes: before,
    });

    expect(completed.receipt).toMatchObject({
      proposalSha256: fixture.proposalResult.proposalSha256,
      priorStateSha256: fixture.priorStateSha256,
      reviewerAuthority: 'repository-owner',
      decision: 'approved',
      admitted: false,
      applied: false,
    });
    expect(completed.receipt.rows).toHaveLength(119);
    expect(completed.receipt.rows.filter((row) => row.sourceClass === 'owner-batch')).toHaveLength(40);
    expect(completed.receipt.authorityRowsSha256).toBe(fixture.proposalResult.proposal.authorityRowsSha256);
    expect(completed.receipt.associationRowsSha256).toBe(fixture.proposalResult.proposal.associationRowsSha256);
    expect(completed.receiptJson).toBe(canonicalArtifact(completed.receipt).json);
    expect(completed.receiptSha256).toBe(canonicalArtifact(completed.receipt).sha256);
    expect(await readFile(priorPath)).toEqual(before);
  });

  it('closes exactly one decision and emits no approval receipt for rejection', () => {
    const fixture = authorityFixture();
    const rejected = decideCAL002AuthoritySessionV2(fixture.pending, 'rejected');

    expect(rejected).toMatchObject({ decision: 'rejected', admitted: false, applied: false });
    expect(() => decideCAL002AuthoritySessionV2(rejected, 'approved')).toThrow(/already closed/i);
    expect(() => completeCAL002AuthoritySessionV2({
      proposal: fixture.proposalResult.proposal,
      state: rejected,
      priorStateBytes: fixture.priorBytes,
    })).toThrow(/approved/i);
  });

  it('rejects a mismatched state binding or supplied prior-state bytes', () => {
    const fixture = authorityFixture();
    const approved = decideCAL002AuthoritySessionV2(fixture.pending, 'approved');
    const otherPriorBytes = Buffer.from(canonicalArtifact({ different: 'canonical prior state' }).json);

    expect(() => startCAL002AuthoritySessionV2({
      proposal: fixture.proposalResult.proposal,
      priorStateSha256: 'f'.repeat(64),
    })).toThrow(/prior.*match|match.*prior/i);
    expect(() => completeCAL002AuthoritySessionV2({
      proposal: fixture.proposalResult.proposal,
      state: approved,
      priorStateBytes: otherPriorBytes,
    })).toThrow(/prior.*SHA-256|SHA-256.*prior/i);
    expect(() => completeCAL002AuthoritySessionV2({
      proposal: fixture.proposalResult.proposal,
      state: { ...approved, proposalSha256: canonicalArtifact(fixture.proposalResult.proposal).sha256 },
      priorStateBytes: fixture.priorBytes,
    })).toThrow(/proposal.*match|match.*proposal/i);
  });
});

describe('CAL-002 validator-injected private artifact I/O', () => {
  it('writes and reads exact canonical 0600 state while rejecting unsafe or widened paths', async () => {
    const root = await temporaryRoot();
    const fixture = authorityFixture();
    const approved = decideCAL002AuthoritySessionV2(fixture.pending, 'approved');
    const relativePath = 'private/authority-state.json';
    const statePath = join(root, relativePath);

    await writePrivateCanonicalState<CAL002AuthorityStateV2>({
      root,
      relativePath,
      label: 'CAL-002 authority state',
      value: approved,
      assertValue: assertCAL002AuthorityStateV2,
    });

    expect((await lstat(statePath)).mode & 0o777).toBe(0o600);
    expect(await readFile(statePath, 'utf8')).toBe(canonicalArtifact(approved).json);
    await expect(readPrivateCanonicalArtifact<CAL002AuthorityStateV2>({
      root,
      relativePath,
      label: 'CAL-002 authority state',
      assertValue: assertCAL002AuthorityStateV2,
    })).resolves.toEqual(approved);
    await expect(writePrivateCanonicalState<CAL002AuthorityStateV2>({
      root,
      relativePath: '../escape.json',
      label: 'CAL-002 authority state',
      value: approved,
      assertValue: assertCAL002AuthorityStateV2,
    })).rejects.toThrow(/safe|relative|contained/i);

    await chmod(statePath, 0o644);
    await expect(readPrivateCanonicalArtifact<CAL002AuthorityStateV2>({
      root,
      relativePath,
      label: 'CAL-002 authority state',
      assertValue: assertCAL002AuthorityStateV2,
    })).rejects.toThrow(/0600|private mode/i);
    await expect(writePrivateCanonicalState<CAL002AuthorityStateV2>({
      root,
      relativePath,
      label: 'CAL-002 authority state',
      value: approved,
      assertValue: assertCAL002AuthorityStateV2,
    })).rejects.toThrow(/0600|private mode/i);
  });

  it('makes exact receipts idempotent, rejects different receipts, and rejects symlink traversal', async () => {
    const root = await temporaryRoot();
    const outside = await temporaryRoot();
    const fixture = authorityFixture();
    const approved = decideCAL002AuthoritySessionV2(fixture.pending, 'approved');
    const { receipt } = completeCAL002AuthoritySessionV2({
      proposal: fixture.proposalResult.proposal,
      state: approved,
      priorStateBytes: fixture.priorBytes,
    });
    const relativePath = 'receipts/authority.json';
    const receiptPath = join(root, relativePath);

    await writeImmutableCanonicalReceipt<CAL002AuthorityReceiptV2>({
      root,
      relativePath,
      label: 'CAL-002 authority receipt',
      value: receipt,
      assertValue: assertCAL002AuthorityReceiptV2,
    });
    const exactBytes = await readFile(receiptPath, 'utf8');
    await expect(writeImmutableCanonicalReceipt<CAL002AuthorityReceiptV2>({
      root,
      relativePath,
      label: 'CAL-002 authority receipt',
      value: receipt,
      assertValue: assertCAL002AuthorityReceiptV2,
    })).resolves.toBeUndefined();
    expect((await lstat(receiptPath)).mode & 0o777).toBe(0o600);
    expect(await readFile(receiptPath, 'utf8')).toBe(exactBytes);
    expect(exactBytes).toBe(canonicalArtifact(receipt).json);

    await expect(writeImmutableCanonicalReceipt<CAL002AuthorityReceiptV2>({
      root,
      relativePath,
      label: 'CAL-002 authority receipt',
      value: { ...receipt, priorStateSha256: 'f'.repeat(64) },
      assertValue: assertCAL002AuthorityReceiptV2,
    })).rejects.toThrow(/different|immutable/i);

    await mkdir(join(root, 'links'));
    await symlink(outside, join(root, 'links', 'outside'));
    await expect(writeImmutableCanonicalReceipt<CAL002AuthorityReceiptV2>({
      root,
      relativePath: 'links/outside/authority.json',
      label: 'CAL-002 authority receipt',
      value: receipt,
      assertValue: assertCAL002AuthorityReceiptV2,
    })).rejects.toThrow(/symbolic link|symlink/i);
  });
});
