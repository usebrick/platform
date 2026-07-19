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
  CAL002_LOCKED_RULE_CATALOG_SHA256,
  canonicalArtifact,
} from '../../src/calibration/cal-002/contracts';
import {
  CAL002_AUTHORITY_RECEIPT_VERSION,
  CAL002_PROTOCOL_VERSION_V2,
  type CAL002AuthorityReceiptV2,
} from '../../src/calibration/cal-002/contracts-v2';
import {
  CAL002_PARITY_RECEIPT_VERSION,
  CAL002_SUPERSESSION_RECEIPT_VERSION,
  assertCAL002ParityReceiptV2,
  assertCAL002SupersessionReceiptV2,
  buildCAL002ParityReceiptV2,
  buildCAL002SupersessionReceiptV2,
  validateCAL002ParityReceiptV2,
  validateCAL002SupersessionReceiptV2,
  type CAL002ParityCaseResultV2,
  type CAL002ParityReceiptV2,
} from '../../src/calibration/cal-002/supersession';

const HERE = dirname(fileURLToPath(import.meta.url));
const SCHEMA_DIR = join(HERE, '../../src/calibration/cal-002/schemas');
const MIGRATION_COMMIT_SHA = 'd'.repeat(40);

type SupersededRuleId = CAL002ParityReceiptV2['ruleId'];

const PARITY_AUTHORITY = {
  'db/sql-concat': {
    replacementRuleId: 'security/sql-construction',
    reasonCode: 'with-query-coverage-ported',
    uniqueCoverageDisposition: 'ported',
    caseIds: ['guarded-non-query-concatenation', 'positive-with-query-concatenation'],
  },
  'logic/math-any-density': {
    replacementRuleId: 'ai/any-density',
    reasonCode: 'line-denominator-not-type-bearing',
    uniqueCoverageDisposition: 'rejected-as-false-positive',
    caseIds: ['guarded-non-type-bearing-any', 'positive-type-bearing-any'],
  },
  'logic/math-console-log-storm': {
    replacementRuleId: 'ai/console-debug-storm',
    reasonCode: 'window-clustering-ported-with-guards',
    uniqueCoverageDisposition: 'ported',
    caseIds: ['guarded-isolated-console-call', 'positive-clustered-console-window'],
  },
} as const;

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

function caseResults(ruleId: SupersededRuleId): readonly CAL002ParityCaseResultV2[] {
  const [negativeCaseId, positiveCaseId] = PARITY_AUTHORITY[ruleId].caseIds;
  return [
    {
      caseId: negativeCaseId,
      sourceSha256: '1'.repeat(64),
      expectedReplacementObservation: 'no-finding',
      observedReplacementObservation: 'no-finding',
    },
    {
      caseId: positiveCaseId,
      sourceSha256: '2'.repeat(64),
      expectedReplacementObservation: 'finding',
      observedReplacementObservation: 'finding',
    },
  ];
}

function parity(
  ruleId: SupersededRuleId,
  overrides: Partial<{
    authorityReceipt: CAL002AuthorityReceiptV2;
    replacementRuleId: CAL002ParityReceiptV2['replacementRuleId'];
    migrationCommitSha: string;
    uniqueCoverageDisposition: CAL002ParityReceiptV2['uniqueCoverageDisposition'];
    splitRuleId: string;
    reasonCode: CAL002ParityReceiptV2['reasonCode'];
    caseResults: readonly CAL002ParityCaseResultV2[];
  }> = {},
): CAL002ParityReceiptV2 {
  const fixed = PARITY_AUTHORITY[ruleId];
  return buildCAL002ParityReceiptV2({
    authorityReceipt: overrides.authorityReceipt ?? approvedAuthorityReceipt(),
    ruleId,
    replacementRuleId: overrides.replacementRuleId ?? fixed.replacementRuleId,
    migrationCommitSha: overrides.migrationCommitSha ?? MIGRATION_COMMIT_SHA,
    uniqueCoverageDisposition: overrides.uniqueCoverageDisposition ?? fixed.uniqueCoverageDisposition,
    ...(overrides.splitRuleId === undefined ? {} : { splitRuleId: overrides.splitRuleId }),
    reasonCode: overrides.reasonCode ?? fixed.reasonCode,
    caseResults: overrides.caseResults ?? caseResults(ruleId),
  }).receipt;
}

const sqlParity = (): CAL002ParityReceiptV2 => parity('db/sql-concat');
const anyParity = (): CAL002ParityReceiptV2 => parity('logic/math-any-density');
const consoleParity = (): CAL002ParityReceiptV2 => parity('logic/math-console-log-storm');

function schemaValidator(file: string) {
  const schema = JSON.parse(readFileSync(join(SCHEMA_DIR, file), 'utf8'));
  return new Ajv2020({ allErrors: true, strict: true }).compile(schema);
}

describe('CAL-002 v2 supersession parity', () => {
  it('requires all three approved replacement dispositions', () => {
    const authorityReceipt = approvedAuthorityReceipt();
    const parities = [sqlParity(), consoleParity(), anyParity()];
    const result = buildCAL002SupersessionReceiptV2(authorityReceipt, parities);

    expect(result.receipt).toMatchObject({
      version: CAL002_SUPERSESSION_RECEIPT_VERSION,
      protocolVersion: CAL002_PROTOCOL_VERSION_V2,
      authorityReceiptSha256: canonicalArtifact(authorityReceipt).sha256,
      admitted: false,
    });
    expect(result.receipt.rows).toEqual([
      expect.objectContaining({
        ruleId: 'db/sql-concat',
        replacementRuleId: 'security/sql-construction',
        uniqueCoverageDisposition: 'ported',
      }),
      expect.objectContaining({
        ruleId: 'logic/math-any-density',
        replacementRuleId: 'ai/any-density',
        uniqueCoverageDisposition: 'rejected-as-false-positive',
      }),
      expect.objectContaining({
        ruleId: 'logic/math-console-log-storm',
        replacementRuleId: 'ai/console-debug-storm',
        uniqueCoverageDisposition: 'ported',
      }),
    ]);
    expect(result.receipt.rows.every((row) => /^[a-f0-9]{64}$/.test(row.parityReceiptSha256))).toBe(true);
    expect(result.receipt.rows.every((row) => /^[a-f0-9]{40}$/.test(row.migrationCommitSha))).toBe(true);
    expect(result.receipt.rows.map((row) => row.parityReceiptSha256)).toEqual([
      canonicalArtifact(parities[0]).sha256,
      canonicalArtifact(parities[2]).sha256,
      canonicalArtifact(parities[1]).sha256,
    ]);
    expect(result.receiptJson).toBe(canonicalArtifact(result.receipt).json);
    expect(result.receiptSha256).toBe(canonicalArtifact(result.receipt).sha256);
  });

  it('builds canonical, hash-bound parity receipts with positive and guarded-negative cases', () => {
    for (const ruleId of Object.keys(PARITY_AUTHORITY) as SupersededRuleId[]) {
      const receipt = parity(ruleId);
      expect(receipt).toMatchObject({
        version: CAL002_PARITY_RECEIPT_VERSION,
        protocolVersion: CAL002_PROTOCOL_VERSION_V2,
        authorityReceiptSha256: canonicalArtifact(approvedAuthorityReceipt()).sha256,
        ruleId,
        replacementRuleId: PARITY_AUTHORITY[ruleId].replacementRuleId,
        reasonCode: PARITY_AUTHORITY[ruleId].reasonCode,
        uniqueCoverageDisposition: PARITY_AUTHORITY[ruleId].uniqueCoverageDisposition,
        migrationCommitSha: MIGRATION_COMMIT_SHA,
        status: 'passed',
        admitted: false,
      });
      expect(receipt.caseResults.map((caseResult) => caseResult.caseId)).toEqual(PARITY_AUTHORITY[ruleId].caseIds);
      expect(receipt.caseResults.some((caseResult) => caseResult.expectedReplacementObservation === 'finding')).toBe(true);
      expect(receipt.caseResults.some((caseResult) => caseResult.expectedReplacementObservation === 'no-finding')).toBe(true);
      expect(() => assertCAL002ParityReceiptV2(receipt)).not.toThrow();
    }
  });

  it('rejects missing and duplicate parity receipts', () => {
    const authorityReceipt = approvedAuthorityReceipt();
    expect(() => buildCAL002SupersessionReceiptV2(
      authorityReceipt,
      [sqlParity(), anyParity()],
    )).toThrow(/exactly three|missing/i);
    expect(() => buildCAL002SupersessionReceiptV2(
      authorityReceipt,
      [sqlParity(), sqlParity(), consoleParity()],
    )).toThrow(/duplicate|missing|canonical/i);
  });

  it('rejects swapped replacements and non-approved dispositions', () => {
    expect(() => parity('db/sql-concat', {
      replacementRuleId: 'ai/any-density',
    })).toThrow(/replacement|mapping/i);
    expect(() => parity('db/sql-concat', {
      uniqueCoverageDisposition: 'rejected-as-false-positive',
    })).toThrow(/disposition|ported/i);
  });

  it('rejects failed, incomplete, unknown, and non-canonical parity cases', () => {
    const cases = caseResults('db/sql-concat');
    expect(() => parity('db/sql-concat', {
      caseResults: [
        cases[0]!,
        { ...cases[1]!, observedReplacementObservation: 'no-finding' },
      ],
    })).toThrow(/observed|expected|parity/i);
    expect(() => parity('db/sql-concat', { caseResults: [cases[0]!] })).toThrow(/positive|finding/i);
    expect(() => parity('db/sql-concat', { caseResults: [cases[1]!] })).toThrow(/guarded|no-finding/i);
    expect(() => parity('db/sql-concat', {
      caseResults: [{ ...cases[0]!, caseId: 'unknown-case' }, cases[1]!],
    })).toThrow(/unknown|case ID/i);
    expect(() => parity('db/sql-concat', { caseResults: [...cases].reverse() })).toThrow(/canonical|order/i);
  });

  it('rejects mismatched migration commits and authority receipt hashes', () => {
    expect(() => buildCAL002SupersessionReceiptV2(approvedAuthorityReceipt(), [
      sqlParity(),
      anyParity(),
      parity('logic/math-console-log-storm', { migrationCommitSha: 'e'.repeat(40) }),
    ])).toThrow(/migration.*commit|same commit/i);

    const wrongAuthority = structuredClone(sqlParity());
    wrongAuthority.authorityReceiptSha256 = 'f'.repeat(64);
    expect(() => buildCAL002SupersessionReceiptV2(
      approvedAuthorityReceipt(),
      [wrongAuthority, anyParity(), consoleParity()],
    )).toThrow(/authority.*hash|authorityReceiptSha256/i);
  });

  it('requires splitRuleId only for split-to-new-rule parity receipts', () => {
    expect(() => parity('db/sql-concat', {
      uniqueCoverageDisposition: 'split-to-new-rule',
    })).toThrow(/splitRuleId|required/i);
    expect(() => parity('db/sql-concat', {
      uniqueCoverageDisposition: 'ported',
      splitRuleId: 'security/sql-construction-split',
    })).toThrow(/splitRuleId|must not/i);
  });

  it('registers strict schemas that agree with handwritten validators', () => {
    const index = JSON.parse(readFileSync(join(SCHEMA_DIR, 'index.json'), 'utf8')) as {
      schemas: { file: string; version: string }[];
    };
    expect(index.schemas.slice(12, 14)).toEqual([
      { file: 'cal-002-parity-receipt-v2.schema.json', version: CAL002_PARITY_RECEIPT_VERSION },
      { file: 'cal-002-supersession-receipt-v2.schema.json', version: CAL002_SUPERSESSION_RECEIPT_VERSION },
    ]);

    const parityReceipt = sqlParity();
    const supersessionReceipt = buildCAL002SupersessionReceiptV2(
      approvedAuthorityReceipt(),
      [sqlParity(), anyParity(), consoleParity()],
    ).receipt;
    const paritySchema = schemaValidator('cal-002-parity-receipt-v2.schema.json');
    const supersessionSchema = schemaValidator('cal-002-supersession-receipt-v2.schema.json');
    expect(paritySchema(parityReceipt), JSON.stringify(paritySchema.errors)).toBe(true);
    expect(supersessionSchema(supersessionReceipt), JSON.stringify(supersessionSchema.errors)).toBe(true);
    expect(validateCAL002ParityReceiptV2(parityReceipt)).toEqual({ ok: true, errors: [] });
    expect(validateCAL002SupersessionReceiptV2(supersessionReceipt)).toEqual({ ok: true, errors: [] });
    expect(() => assertCAL002SupersessionReceiptV2(supersessionReceipt)).not.toThrow();

    const failedCase = structuredClone(parityReceipt);
    failedCase.caseResults[1]!.observedReplacementObservation = 'no-finding';
    expect(validateCAL002ParityReceiptV2(failedCase).ok).toBe(false);
    expect(paritySchema(failedCase), JSON.stringify(paritySchema.errors)).toBe(false);

    const missingRow = structuredClone(supersessionReceipt);
    missingRow.rows.pop();
    expect(validateCAL002SupersessionReceiptV2(missingRow).ok).toBe(false);
    expect(supersessionSchema(missingRow), JSON.stringify(supersessionSchema.errors)).toBe(false);

    const duplicateRow = structuredClone(supersessionReceipt);
    duplicateRow.rows[1] = structuredClone(duplicateRow.rows[0]!);
    expect(validateCAL002SupersessionReceiptV2(duplicateRow).ok).toBe(false);
    expect(supersessionSchema(duplicateRow), JSON.stringify(supersessionSchema.errors)).toBe(false);
  });
});
