import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import Ajv2020 from 'ajv/dist/2020.js';
import { describe, expect, it } from 'vitest';

import {
  CAL002_ASSOCIATION_SNAPSHOT,
  authorityRowsSha256V2,
  canonicalAuthorityRowsV2,
} from '../../src/calibration/cal-002/authority';
import {
  CAL002_AUTHORITY_RECEIPT_VERSION,
  CAL002_PROTOCOL_VERSION_V2,
  type CAL002AuthorityReceiptV2,
  type CAL002AuthorityRowV2,
} from '../../src/calibration/cal-002/contracts-v2';
import {
  CAL002_LOCKED_RULE_CATALOG_SHA256,
  canonicalArtifact,
} from '../../src/calibration/cal-002/contracts';
import type { CAL002OriginGoverningHashes } from '../../src/calibration/cal-002/origin';
import {
  CAL002_ORIGIN_FROZEN_GOVERNING_HASHES,
  buildCAL002OriginReceiptV2,
  validateCAL002OriginReceiptV2,
} from '../../src/calibration/cal-002/origin-v2';

const HERE = dirname(fileURLToPath(import.meta.url));
const SCHEMA_DIR = join(HERE, '../../src/calibration/cal-002/schemas');
const COMMIT_SHA = 'd'.repeat(40);

function approvedAuthorityReceipt(): CAL002AuthorityReceiptV2 {
  const rows = canonicalAuthorityRowsV2();
  return {
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
}

function authorityWithRows(rows: readonly CAL002AuthorityRowV2[]): CAL002AuthorityReceiptV2 {
  return {
    ...approvedAuthorityReceipt(),
    rows,
    authorityRowsSha256: authorityRowsSha256V2(rows),
    associationRowsSha256: canonicalArtifact(rows).sha256,
  };
}

function matchingGoverningHashes(): CAL002OriginGoverningHashes {
  return { ...CAL002_ORIGIN_FROZEN_GOVERNING_HASHES };
}

function completeInput() {
  return {
    authorityReceipt: approvedAuthorityReceipt(),
    governingHashes: matchingGoverningHashes(),
    originImplementationCommitSha: COMMIT_SHA,
  };
}

function compileSchema() {
  const schema = JSON.parse(readFileSync(
    join(SCHEMA_DIR, 'cal-002-origin-receipt-v2.schema.json'),
    'utf8',
  ));
  return new Ajv2020({ allErrors: true, strict: true }).compile(schema);
}

function clone<T>(value: T): T {
  return structuredClone(value);
}

describe('CAL-002 research-origin v2 projection', () => {
  it('accounts for only the 32 canonical research-origin holds', () => {
    const authority = approvedAuthorityReceipt();
    const result = buildCAL002OriginReceiptV2({
      ...completeInput(),
      authorityReceipt: authority,
    });
    const expectedRows = authority.rows.filter((row) =>
      row.destination === 'research-origin' && row.readiness === 'research-only');

    expect(result.receipt.rows).toHaveLength(32);
    expect(result.receipt.rows.map((row) => row.ruleId)).toEqual(
      expectedRows.map((row) => row.ruleId),
    );
    expect(result.receipt.rows.every((row) =>
      row.destination === 'research-origin'
      && row.evidenceStatus === 'reused'
      && row.claimCeiling === 'internal-origin-association'
      && row.runtimeOutcome === 'default-off'
      && row.enabledByDefault === false
      && row.scoreEligible === false
      && row.gateEligible === false
      && row.runnableByExplicitOptIn === true
      && row.admitted === false
    )).toBe(true);
    expect(result.receipt.rows.some((row) => row.ruleId === 'ai/any-density')).toBe(false);
    expect(result.receipt).toMatchObject({
      version: 'cal-002-origin-receipt-v2',
      protocolVersion: 'CAL-002-v2',
      authorityReceiptSha256: canonicalArtifact(authority).sha256,
      originImplementationCommitSha: COMMIT_SHA,
      status: 'reused',
      governingHashes: matchingGoverningHashes(),
      admitted: false,
    });
    expect(result.receiptJson).toBe(canonicalArtifact(result.receipt).json);
    expect(result.receiptSha256).toBe(canonicalArtifact(result.receipt).sha256);
  });

  it('binds only the historical association evidence hash without copying claim metadata', () => {
    const authority = approvedAuthorityReceipt();
    const result = buildCAL002OriginReceiptV2({ ...completeInput(), authorityReceipt: authority });
    const associations = new Map(authority.rows.map((row) => [row.ruleId, row.aiAssociation]));

    for (const row of result.receipt.rows) {
      expect(row.evidenceSha256).toBe(associations.get(row.ruleId)?.evidenceSha256);
      expect(Object.keys(row).sort()).toEqual([
        'admitted',
        'claimCeiling',
        'destination',
        'enabledByDefault',
        'evidenceSha256',
        'evidenceStatus',
        'gateEligible',
        'ruleId',
        'runnableByExplicitOptIn',
        'runtimeOutcome',
        'scoreEligible',
      ]);
    }
    expect(result.receiptJson).not.toMatch(/authorship|generatedBy|lift|measuredAt|publisher/i);
  });

  it.each([
    ['quality', { destination: 'quality', action: 'transfer', readiness: 'evidence-ready' }],
    ['blocked', { destination: 'quality', action: 'block', readiness: 'repair-required' }],
    ['superseded', { destination: 'superseded', action: 'supersede', readiness: 'parity-required' }],
    ['retired', { destination: 'retired', action: 'retire', readiness: 'obsolete' }],
  ] as const)('rejects a %s row substituted into the research authority scope', (_label, mutation) => {
    const authority = approvedAuthorityReceipt();
    const index = authority.rows.findIndex((row) => row.destination === 'research-origin');
    const rows = authority.rows.map((row, rowIndex) => rowIndex === index
      ? { ...row, ...mutation } as CAL002AuthorityRowV2
      : row);

    expect(() => buildCAL002OriginReceiptV2({
      ...completeInput(),
      authorityReceipt: authorityWithRows(rows),
    })).toThrow(/authority|research|canonical|metadata/i);
  });

  it('rejects an authority receipt missing one research row', () => {
    const authority = approvedAuthorityReceipt();
    const index = authority.rows.findIndex((row) => row.destination === 'research-origin');
    const rows = authority.rows.filter((_row, rowIndex) => rowIndex !== index);

    expect(() => buildCAL002OriginReceiptV2({
      ...completeInput(),
      authorityReceipt: authorityWithRows(rows),
    })).toThrow(/authority|119|32|complete|research/i);
  });

  it('does not accept the v1 owner-decision rows as an input surface', () => {
    expect(() => buildCAL002OriginReceiptV2({
      ...completeInput(),
      decisions: [{ ruleId: 'ai/any-density', disposition: 'hold-origin-default-off' }],
    } as never)).toThrow(/unknown|missing|input/i);
  });

  it('does not let a caller replace the frozen governing identity', () => {
    const callerControlled = {
      ...matchingGoverningHashes(),
      configSha256: 'f'.repeat(64),
    };

    expect(() => buildCAL002OriginReceiptV2({
      ...completeInput(),
      governingHashes: callerControlled,
      expectedGoverningHashes: callerControlled,
    } as never)).toThrow(/unknown|input|expectedGoverningHashes/i);
  });

  it('requires completed one-worker evidence before accepting governing-hash drift', () => {
    const expected = matchingGoverningHashes();
    const drifted = { ...expected, configSha256: 'a'.repeat(64) };

    expect(() => buildCAL002OriginReceiptV2({
      ...completeInput(),
      governingHashes: drifted,
    })).toThrow(/rerun|required|governing hash/i);
    expect(() => buildCAL002OriginReceiptV2({
      ...completeInput(),
      governingHashes: drifted,
      rerunEvidence: { workerCount: 2, governingHashes: expected },
    } as never)).toThrow(/one worker|exactly one worker/i);
    expect(() => buildCAL002OriginReceiptV2({
      ...completeInput(),
      governingHashes: drifted,
      rerunEvidence: {
        workerCount: 1,
        governingHashes: { ...expected, metricsSha256: 'b'.repeat(64) },
      },
    })).toThrow(/rerun|required|governing hash/i);

    const completed = buildCAL002OriginReceiptV2({
      ...completeInput(),
      governingHashes: drifted,
      rerunEvidence: { workerCount: 1, governingHashes: expected },
    });
    expect(completed.receipt.status).toBe('rerun-completed');
    expect(completed.receipt.governingHashes).toEqual(expected);
    expect(completed.receipt.rows.every((row) => row.evidenceStatus === 'rerun-completed')).toBe(true);
  });

  it('keeps the runtime validator and closed schema aligned against elevation', () => {
    const valid = buildCAL002OriginReceiptV2(completeInput()).receipt;
    const validateSchema = compileSchema();
    expect(validateCAL002OriginReceiptV2(valid)).toEqual({ ok: true, errors: [] });
    expect(validateSchema(valid)).toBe(true);

    const mutations: readonly [string, (receipt: Record<string, unknown>) => void][] = [
      ['missing research row', (receipt) => { (receipt.rows as unknown[]).pop(); }],
      ['quality rule ID', (receipt) => { ((receipt.rows as Record<string, unknown>[])[0]!).ruleId = 'ai/any-density'; }],
      ['default-on', (receipt) => { ((receipt.rows as Record<string, unknown>[])[0]!).runtimeOutcome = 'default-on'; }],
      ['enabled by default', (receipt) => { ((receipt.rows as Record<string, unknown>[])[0]!).enabledByDefault = true; }],
      ['score eligibility', (receipt) => { ((receipt.rows as Record<string, unknown>[])[0]!).scoreEligible = true; }],
      ['gate eligibility', (receipt) => { ((receipt.rows as Record<string, unknown>[])[0]!).gateEligible = true; }],
      ['row admission', (receipt) => { ((receipt.rows as Record<string, unknown>[])[0]!).admitted = true; }],
      ['receipt admission', (receipt) => { receipt.admitted = true; }],
      ['authorship claim', (receipt) => { ((receipt.rows as Record<string, unknown>[])[0]!).authorshipClaim = 'generated-by-ai'; }],
    ];

    for (const [label, mutate] of mutations) {
      const candidate: Record<string, unknown> = { ...clone(valid) };
      mutate(candidate);
      expect(validateCAL002OriginReceiptV2(candidate).ok, label).toBe(false);
      expect(validateSchema(candidate), label).toBe(false);
    }
  });

  it('pins every governing hash in the runtime validator and schema', () => {
    const valid = buildCAL002OriginReceiptV2(completeInput()).receipt;
    const validateSchema = compileSchema();

    for (const key of Object.keys(CAL002_ORIGIN_FROZEN_GOVERNING_HASHES)) {
      const candidate: Record<string, unknown> = { ...clone(valid) };
      const governingHashes = {
        ...(candidate.governingHashes as Record<string, string>),
      };
      governingHashes[key] = key === 'scannerCommitSha' ? 'f'.repeat(40) : 'f'.repeat(64);
      candidate.governingHashes = governingHashes;

      expect(validateCAL002OriginReceiptV2(candidate).ok, key).toBe(false);
      expect(validateSchema(candidate), key).toBe(false);
    }
  });

  it('pins every row to its canonical research authority association hash', () => {
    const valid = buildCAL002OriginReceiptV2(completeInput()).receipt;
    const validateSchema = compileSchema();

    for (const index of valid.rows.keys()) {
      const candidate: Record<string, unknown> = { ...clone(valid) };
      const rows = candidate.rows as Record<string, unknown>[];
      rows[index]!.evidenceSha256 = 'f'.repeat(64);

      expect(validateCAL002OriginReceiptV2(candidate).ok, valid.rows[index]!.ruleId).toBe(false);
      expect(validateSchema(candidate), valid.rows[index]!.ruleId).toBe(false);
    }
  });

  it('registers the strict v2 receipt schema exactly once', () => {
    const index = JSON.parse(readFileSync(join(SCHEMA_DIR, 'index.json'), 'utf8')) as {
      readonly schemas: readonly { readonly file: string; readonly version: string }[];
    };
    expect(index.schemas.filter((entry) =>
      entry.file === 'cal-002-origin-receipt-v2.schema.json'
      && entry.version === 'cal-002-origin-receipt-v2')).toHaveLength(1);
  });
});
