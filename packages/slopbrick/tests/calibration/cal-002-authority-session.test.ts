import { createHash } from 'node:crypto';
import {
  chmod,
  link,
  lstat,
  mkdir,
  mkdtemp,
  readFile,
  readdir,
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
  assertDistinctArtifactDestinations,
  readPrivateCanonicalArtifact,
  readPrivateCanonicalArtifactWithBytes,
  withPrivateArtifactSessionLock,
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
    expect(() => completeCAL002AuthoritySessionV2({
      proposal: fixture.proposalResult.proposal,
      state: approved,
      priorStateBytes: Buffer.from([0x7b, 0x22, 0x78, 0x22, 0x3a, 0x22, 0xff, 0x22, 0x7d]),
    })).toThrow(/UTF-8/i);
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
    const readWithBytes = await readPrivateCanonicalArtifactWithBytes<CAL002AuthorityStateV2>({
      root,
      relativePath,
      label: 'CAL-002 authority state',
      assertValue: assertCAL002AuthorityStateV2,
    });
    expect(readWithBytes.value).toEqual(approved);
    expect(readWithBytes.bytes).toEqual(Buffer.from(canonicalArtifact(approved).json, 'utf8'));
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

  it('rejects invalid UTF-8 before validator normalization', async () => {
    const root = await temporaryRoot();
    const relativePath = 'invalid-utf8.json';
    await writeFile(
      join(root, relativePath),
      Buffer.from([0x7b, 0x22, 0x78, 0x22, 0x3a, 0x22, 0xff, 0x22, 0x7d]),
      { mode: 0o600 },
    );
    let validatorCalled = false;
    const assertValue: (value: unknown) => asserts value is { readonly x: string } = (value) => {
      validatorCalled = true;
      if (typeof value !== 'object' || value === null || typeof (value as { x?: unknown }).x !== 'string') {
        throw new TypeError('invalid fixture');
      }
    };

    await expect(readPrivateCanonicalArtifactWithBytes({
      root,
      relativePath,
      label: 'invalid UTF-8 fixture',
      assertValue,
    })).rejects.toThrow(/UTF-8/i);
    expect(validatorCalled).toBe(false);
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

    await expect(writeImmutableCanonicalReceipt<CAL002AuthorityReceiptV2>({
      root,
      relativePath,
      label: 'CAL-002 authority receipt',
      value: receipt,
      assertValue: assertCAL002AuthorityReceiptV2,
    })).resolves.toBe('created');
    const exactBytes = await readFile(receiptPath, 'utf8');
    await expect(writeImmutableCanonicalReceipt<CAL002AuthorityReceiptV2>({
      root,
      relativePath,
      label: 'CAL-002 authority receipt',
      value: receipt,
      assertValue: assertCAL002AuthorityReceiptV2,
    })).resolves.toBe('replayed');
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
    expect(await readdir(join(root, 'receipts'))).toEqual(['authority.json']);

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

  it('never exposes a final immutable destination when same-directory staging cannot be created', async () => {
    const root = await temporaryRoot();
    const fixture = authorityFixture();
    const approved = decideCAL002AuthoritySessionV2(fixture.pending, 'approved');
    const { receipt } = completeCAL002AuthoritySessionV2({
      proposal: fixture.proposalResult.proposal,
      state: approved,
      priorStateBytes: fixture.priorBytes,
    });
    const relativePath = join('receipts', `${'x'.repeat(230)}.json`);

    await expect(writeImmutableCanonicalReceipt({
      root,
      relativePath,
      label: 'CAL-002 overlong staging receipt',
      value: receipt,
      assertValue: assertCAL002AuthorityReceiptV2,
    })).rejects.toMatchObject({ code: 'ENAMETOOLONG' });
    await expect(lstat(join(root, relativePath))).rejects.toMatchObject({ code: 'ENOENT' });
    expect(await readdir(join(root, 'receipts'))).toEqual([]);
  });

  it('makes every immutable receipt writer honor the destination session lock', async () => {
    const root = await temporaryRoot();
    const fixture = authorityFixture();
    const approved = decideCAL002AuthoritySessionV2(fixture.pending, 'approved');
    const { receipt } = completeCAL002AuthoritySessionV2({
      proposal: fixture.proposalResult.proposal,
      state: approved,
      priorStateBytes: fixture.priorBytes,
    });
    const input = {
      root,
      relativePath: 'receipts/authority.json',
      label: 'CAL-002 authority receipt',
      value: receipt,
      assertValue: assertCAL002AuthorityReceiptV2,
    };

    await withPrivateArtifactSessionLock(input, async () => {
      await expect(writeImmutableCanonicalReceipt(input)).rejects.toThrow(/session.*locked/i);
    });
    await expect(lstat(join(root, input.relativePath))).rejects.toMatchObject({ code: 'ENOENT' });
  });

  it('rejects case-folded and Unicode-normalized prospective aliases without creating parents', async () => {
    const root = await temporaryRoot();
    const aliases = [
      ['case', 'Authority-Receipt.json', 'authority-receipt.json'],
      ['unicode', 'caf\u00e9.json', 'cafe\u0301.json'],
      ['sharp-s', 'proposal-\u00df.json', 'proposal-SS.json'],
      ['sigma', 'proposal-\u03a3.json', 'proposal-\u03c2.json'],
    ] as const;

    for (const [directory, first, second] of aliases) {
      await expect(assertDistinctArtifactDestinations({
        root,
        artifacts: [
          { relativePath: join(directory, first), label: 'first receipt' },
          { relativePath: join(directory, second), label: 'second receipt' },
        ],
      })).rejects.toThrow(/alias|collision|distinct/i);
      await expect(lstat(join(root, directory))).rejects.toMatchObject({ code: 'ENOENT' });
    }
  });

  it('rejects existing leaves with the same physical identity', async () => {
    const root = await temporaryRoot();
    const firstPath = join(root, 'catalog.json');
    await writeFile(firstPath, '{}', { mode: 0o600 });
    await link(firstPath, join(root, 'catalog-alias.json'));

    await expect(assertDistinctArtifactDestinations({
      root,
      artifacts: [
        { relativePath: 'catalog.json', label: 'catalog' },
        { relativePath: 'catalog-alias.json', label: 'prior state' },
      ],
    })).rejects.toThrow(/identity|alias|collision|distinct/i);
  });

  it('reserves private state writer and session lock destinations without creating their parent', async () => {
    const root = await temporaryRoot();
    const state = '.slopbrick/calibration/cal-002/authority-state-v2.json';
    const lockArtifacts = [
      '.slopbrick/calibration/cal-002/.authority-state-v2.json.lock',
      '.slopbrick/calibration/cal-002/.authority-state-v2.json.session.lock',
      '.slopbrick/calibration/cal-002/.authority-state-v2.json.se\u00dfion.lock',
    ];

    for (const proposal of lockArtifacts) {
      await expect(assertDistinctArtifactDestinations({
        root,
        artifacts: [
          { relativePath: 'catalog.json', label: 'catalog' },
          { relativePath: 'origin-state.json', label: 'prior state' },
          { relativePath: proposal, label: 'proposal' },
          { relativePath: state, label: 'state' },
          { relativePath: 'authority-receipt.json', label: 'receipt' },
        ],
        reservePrivateLocksFor: [{ relativePath: state, label: 'authority state' }],
      })).rejects.toThrow(/reserved|alias|collision|distinct/i);
    }

    await expect(lstat(join(root, '.slopbrick'))).rejects.toMatchObject({ code: 'ENOENT' });
  });
});
