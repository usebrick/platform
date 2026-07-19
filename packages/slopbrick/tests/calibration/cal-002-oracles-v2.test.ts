import { createHash } from 'node:crypto';
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
} from '../../src/calibration/cal-002/contracts-v2';
import {
  CAL002_DETERMINISTIC_RULE_IDS,
  CAL002_LOCKED_RULE_CATALOG_SHA256,
  canonicalArtifact,
} from '../../src/calibration/cal-002/contracts';
import {
  buildCAL002OracleReceipt,
  type CAL002OracleReceipt,
} from '../../src/calibration/cal-002/oracles';
import {
  buildCAL002OracleReceiptV2,
  type BuildCAL002OracleReceiptV2Input,
  type CAL002RealSourceControlInputV2,
  type CAL002TransferOracleObservationV2,
} from '../../src/calibration/cal-002/oracles-v2';
import { reconcileCorpusV1SourceRows } from '../../src/calibration/corpus-v1/source-binding';
import {
  CAL002_ORACLE_DECLARATIONS,
  CAL002_ORACLE_MUTATION_CASES,
  CAL002_ORACLE_SOURCE_CONTROLS,
} from './fixtures/cal-002-oracle-cases';
import { CAL002_TRANSFER_ORACLE_CASES } from './fixtures/cal-002-transfer-oracle-cases';
import {
  CAL002_TRANSFER_CONTROL_FAMILIES,
  type CAL002TransferOracleCase,
} from './fixtures/cal-002-transfer-oracle-types';

const HERE = dirname(fileURLToPath(import.meta.url));
const SCHEMA_DIR = join(HERE, '../../src/calibration/cal-002/schemas');
const IMPLEMENTATION_COMMIT_SHA = 'c'.repeat(40);

function sha256(value: string | Uint8Array): string {
  return createHash('sha256').update(value).digest('hex');
}

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

function passedStartingOracleReceipt(): CAL002OracleReceipt {
  return buildCAL002OracleReceipt({
    catalogSha256: CAL002_LOCKED_RULE_CATALOG_SHA256,
    implementationCommitSha: 'd'.repeat(40),
    declarations: CAL002_ORACLE_DECLARATIONS.map(({
      ruleId,
      authority,
      reference,
      positiveCaseIds,
      negativeCaseIds,
    }) => ({ ruleId, authority, reference, positiveCaseIds, negativeCaseIds })),
    caseResults: CAL002_ORACLE_MUTATION_CASES.map(({
      ruleId,
      caseId,
      expected,
      observed,
      sourceSha256,
    }) => ({ ruleId, caseId, expected, observed, sourceSha256 })),
    sourceControls: CAL002_ORACLE_SOURCE_CONTROLS.map(({
      ruleId,
      unitId,
      familyId,
      contentSha256,
      observed,
    }) => ({ ruleId, unitId, familyId, contentSha256, observed })),
  }).receipt;
}

function sourceBinding() {
  const sourceId = 'cal-002-oracle-controls';
  const code = 'const verifiedControl = true;';
  const header = 'problem_id,Sample_Code,Generated,Language,Source';
  const quote = (value: string): string => `"${value.replaceAll('"', '""')}"`;
  const csvBytes = Buffer.from(`${header}\n${[
    'control-1',
    code,
    'Human',
    'TypeScript',
    'CAL-002',
  ].map(quote).join(',')}\n`);
  const contentSha256 = sha256(code);
  const projectionManifestBytes = Buffer.from(`${JSON.stringify({
    recordId: `${sourceId}:00001`,
    rowOrdinal: 1,
    problemId: 'control-1',
    declaredPolarity: 'Human',
    language: 'TypeScript',
    sourceClaim: 'CAL-002',
    relativePath: 'units/human/1.ts',
    bytes: Buffer.byteLength(code),
    contentSha256,
    materializedSha256: contentSha256,
  })}\n`);
  return reconcileCorpusV1SourceRows({ sourceId, csvBytes, projectionManifestBytes });
}

function allTransferredCases(): readonly {
  readonly ruleId: string;
  readonly testCase: CAL002TransferOracleCase;
  readonly expected: 'finding' | 'no-finding';
}[] {
  return CAL002_TRANSFER_ORACLE_CASES.flatMap((fixture) => [
    ...fixture.positiveCases.map((testCase) => ({
      ruleId: fixture.ruleId,
      testCase,
      expected: 'finding' as const,
    })),
    ...[
      ...fixture.negativeCases,
      ...fixture.adversarialCases,
      ...fixture.controls,
    ].map((testCase) => ({
      ruleId: fixture.ruleId,
      testCase,
      expected: 'no-finding' as const,
    })),
  ]);
}

function passingObservations(): readonly CAL002TransferOracleObservationV2[] {
  return allTransferredCases().map(({ ruleId, testCase, expected }) => ({
    ruleId,
    caseId: testCase.caseId,
    observed: expected,
    sourceSha256: sha256(testCase.source),
  }));
}

function realSourceControls(): readonly CAL002RealSourceControlInputV2[] {
  const binding = sourceBinding();
  const ruleIds = [
    ...CAL002_DETERMINISTIC_RULE_IDS,
    ...CAL002_TRANSFER_ORACLE_CASES.map(({ ruleId }) => ruleId),
  ];
  return ruleIds.flatMap((ruleId) => CAL002_TRANSFER_CONTROL_FAMILIES.map((familyId) => {
    const source = `verified control ${ruleId} ${familyId}`;
    return {
      ruleId,
      familyId,
      source,
      contentSha256: sha256(source),
      sourceBindingReceiptSha256: binding.receiptSha256,
      observed: 'no-finding' as const,
    };
  }));
}

function completeInput(
  overrides: Partial<BuildCAL002OracleReceiptV2Input> = {},
): BuildCAL002OracleReceiptV2Input {
  return {
    authorityReceipt: approvedAuthorityReceipt(),
    startingOracleReceipt: passedStartingOracleReceipt(),
    transferredFixtures: CAL002_TRANSFER_ORACLE_CASES,
    observations: passingObservations(),
    sourceBinding: sourceBinding(),
    realSourceControls: realSourceControls(),
    implementationCommitSha: IMPLEMENTATION_COMMIT_SHA,
    ...overrides,
  };
}

describe('CAL-002 deterministic oracle receipt v2', () => {
  it('combines 32 frozen starting rows with exactly nine transferred rows', () => {
    const result = buildCAL002OracleReceiptV2(completeInput());

    expect(result.receipt.rows).toHaveLength(41);
    expect(result.receipt.counts).toEqual({
      starting: 32,
      transferred: 9,
      passed: 41,
      failed: 0,
    });
    expect(result.receipt.rows.filter((row) => row.transferred)).toHaveLength(9);
    expect(result.receipt.rows.every((row) => row.outcome === 'default-on')).toBe(true);
    const receiptJson = JSON.stringify(result.receipt);
    expect(receiptJson).not.toContain('"source":');
    expect(receiptJson).not.toContain('"virtualPath":');
    expect(result.receipt.admitted).toBe(false);
  });

  it('keeps a failed oracle representable and default-off', () => {
    const observations = passingObservations();
    const target = observations[0]!;
    const result = buildCAL002OracleReceiptV2(completeInput({
      observations: observations.map((observation) => observation === target
        ? {
            ...observation,
            observed: observation.observed === 'finding' ? 'no-finding' : 'finding',
          }
        : observation),
    }));
    const failed = result.receipt.rows.find((row) => row.ruleId === target.ruleId)!;

    expect(failed.status).toBe('failed');
    expect(failed.outcome).toBe('default-off');
    expect(failed.failures).toContain('unexpected-oracle-observation');
    expect(result.receipt.counts).toMatchObject({ passed: 40, failed: 1 });
  });

  it('fails closed on a missing transfer fixture', () => {
    expect(() => buildCAL002OracleReceiptV2(completeInput({
      transferredFixtures: CAL002_TRANSFER_ORACLE_CASES.slice(1),
    }))).toThrow(/exactly nine|missing transfer/i);
  });

  it('rejects an unknown authority row', () => {
    const authority = structuredClone(approvedAuthorityReceipt());
    const rows = [...authority.rows];
    rows[0] = { ...rows[0]!, ruleId: 'unknown/not-locked' };
    const malformed = { ...authority, rows } as CAL002AuthorityReceiptV2;
    expect(() => buildCAL002OracleReceiptV2(completeInput({ authorityReceipt: malformed })))
      .toThrow(/authority|locked|unknown/i);
  });

  it('records a real-source-control shortage without substituting fixtures', () => {
    const controls = realSourceControls();
    const targetRuleId = CAL002_DETERMINISTIC_RULE_IDS[0];
    const shortened = controls.filter((control) =>
      control.ruleId !== targetRuleId || control.familyId !== CAL002_TRANSFER_CONTROL_FAMILIES[0]);
    const result = buildCAL002OracleReceiptV2(completeInput({ realSourceControls: shortened }));
    const row = result.receipt.rows.find((candidate) => candidate.ruleId === targetRuleId)!;

    expect(row.status).toBe('failed');
    expect(row.outcome).toBe('default-off');
    expect(row.failures).toContain('real-source-control-shortage');
    expect(row.realSourceControls).toHaveLength(4);
  });

  it('rejects a transferred fixture or real-source content hash mismatch', () => {
    const observations = passingObservations();
    const controls = realSourceControls();
    expect(() => buildCAL002OracleReceiptV2(completeInput({
      observations: [{ ...observations[0]!, sourceSha256: 'f'.repeat(64) }, ...observations.slice(1)],
    }))).toThrow(/source.*hash|hash.*source/i);
    expect(() => buildCAL002OracleReceiptV2(completeInput({
      realSourceControls: [{ ...controls[0]!, contentSha256: 'f'.repeat(64) }, ...controls.slice(1)],
    }))).toThrow(/content.*hash|hash.*content/i);
  });

  it('rejects a forged source-binding result and closes an observed real-source finding', () => {
    const binding = sourceBinding();
    expect(() => buildCAL002OracleReceiptV2(completeInput({
      sourceBinding: { ...binding, receiptJson: `${binding.receiptJson} ` },
    }))).toThrow(/source-binding.*canonical|source-binding.*hash/i);

    const controls = realSourceControls();
    const target = controls[0]!;
    const result = buildCAL002OracleReceiptV2(completeInput({
      realSourceControls: controls.map((control) => control === target
        ? { ...control, observed: 'finding' }
        : control),
    }));
    const row = result.receipt.rows.find((candidate) => candidate.ruleId === target.ruleId)!;
    expect(row).toMatchObject({ status: 'failed', outcome: 'default-off' });
    expect(row.failures).toEqual(expect.arrayContaining([
      'real-source-control-shortage',
      'unexpected-real-source-control-observation',
    ]));
  });

  it('rejects a v1 receipt with other than exactly 32 starting rows', () => {
    const starting = passedStartingOracleReceipt();
    expect(() => buildCAL002OracleReceiptV2(completeInput({
      startingOracleReceipt: { ...starting, rows: starting.rows.slice(1) },
    }))).toThrow(/exactly 32 starting/i);
  });

  it('rejects a deterministic transfer that is not evidence-ready', () => {
    const authority = structuredClone(approvedAuthorityReceipt());
    const rows = authority.rows.map((row) => row.ruleId === 'security/hardcoded-secret'
      ? { ...row, readiness: 'repair-required' as const, assignmentEligible: false }
      : row);
    const malformed = {
      ...authority,
      rows,
      authorityRowsSha256: authorityRowsSha256V2(rows),
      associationRowsSha256: canonicalArtifact(rows).sha256,
    } as CAL002AuthorityReceiptV2;
    expect(() => buildCAL002OracleReceiptV2(completeInput({ authorityReceipt: malformed })))
      .toThrow(/evidence-ready/i);
  });

  it('is deterministic under all caller-array reorderings', () => {
    const input = completeInput();
    const forward = buildCAL002OracleReceiptV2(input);
    const reversed = buildCAL002OracleReceiptV2({
      ...input,
      transferredFixtures: [...input.transferredFixtures].reverse(),
      observations: [...input.observations].reverse(),
      realSourceControls: [...input.realSourceControls].reverse(),
    });
    expect(reversed).toEqual(forward);
  });

  it('registers and strictly validates the closed v2 receipt schema', () => {
    const file = 'cal-002-oracle-receipt-v2.schema.json';
    const index = JSON.parse(readFileSync(join(SCHEMA_DIR, 'index.json'), 'utf8')) as {
      schemas: Array<{ file: string; version: string }>;
    };
    expect(index.schemas).toContainEqual({ file, version: 'cal-002-oracle-receipt-v2' });
    const schema = JSON.parse(readFileSync(join(SCHEMA_DIR, file), 'utf8'));
    const validate = new Ajv2020({ allErrors: true, strict: true }).compile(schema);
    const receipt = buildCAL002OracleReceiptV2(completeInput()).receipt;
    expect(validate(receipt), JSON.stringify(validate.errors)).toBe(true);
    expect(validate({ ...receipt, source: 'forbidden' })).toBe(false);
  });
});
