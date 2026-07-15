import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  calibrationAdmissionPrivacyResultSha256,
  calibrationAdmissionRecordId,
  calibrationAdmissionSha256,
  calibrationAdmissionPrivacyLedgerSha256,
  type AdmissionPrivacyResultV1,
  type CalibrationAdmissionRecordV103,
} from '@usebrick/core';

import {
  materializeAdmissionStaticLedgerStream,
  MAX_STATIC_LEDGER_RECORDS,
} from '../../src/calibration/v103/admission-static-ledger-stream';
import { buildAdmissionPrivacyLedger, type AdmissionVerifiedRecordInputV1 } from '../../src/calibration/v103/admission-static-ledgers';
import { canonicalJson } from '../../src/calibration/v103/canonical';

const sha = (seed: string): string => calibrationAdmissionSha256({ seed });

function record(seed: string): AdmissionVerifiedRecordInputV1 {
  const contentSha256 = sha(`content:${seed}`);
  const body = {
    version: 'v10.3-admission-record-v1' as const,
    recordId: '',
    materialSourceId: 'source-a',
    aggregateSourceIds: ['source-a'],
    sourceReviewSha256: sha('review'),
    logicalUnitId: `unit-${seed}`,
    locator: { kind: 'git_file' as const, materializationId: 'materialization-a', normalizedPath: `src/${seed}.ts` },
    contentSha256,
    contentBytes: 20,
    language: 'typescript',
    stratum: 'production' as const,
    proposedLabel: 'quarantine' as const,
    authorship: {
      kind: 'unproven_claim' as const,
      evidenceIds: [sha('origin')],
      declaredClaim: 'unknown' as const,
      missingFields: ['authorship'],
    },
    claimedLineage: {
      familyId: 'family-a',
      originRecordId: '',
      exactClusterId: 'exact-a',
      nearClusterId: 'near-a',
    },
    claimedAudits: {
      syntax: 'unsupported' as const,
      scaffoldByteShare: 0,
      privacy: 'review' as const,
      secrets: 'review' as const,
      exactOverlap: 'pass' as const,
      nearOverlap: 'unsupported' as const,
      familyLeakage: 'pass' as const,
      pairIntegrity: 'not_applicable' as const,
    },
    reviewerDecisionIds: [sha('decision')],
    declaredDisposition: 'quarantine' as const,
    rejectionReasons: ['authorship_unproven' as const],
  } satisfies CalibrationAdmissionRecordV103;
  const recordId = calibrationAdmissionRecordId(body);
  const value = { ...body, recordId, claimedLineage: { ...body.claimedLineage, originRecordId: recordId } } satisfies CalibrationAdmissionRecordV103;
  return { record: value, canonicalSha256: calibrationAdmissionSha256(value) };
}

function privacyResult(input: AdmissionVerifiedRecordInputV1): AdmissionPrivacyResultV1 {
  const body = {
    version: 'v10.3-admission-privacy-result-v1' as const,
    recordId: input.record.recordId,
    contentSha256: input.record.contentSha256,
    privacyStatus: 'pass' as const,
    secretStatus: 'pass' as const,
    findings: [],
    reviewerDecisionIds: [],
    toolReceiptSha256: sha('privacy-tool'),
  };
  return { ...body, resultSha256: calibrationAdmissionPrivacyResultSha256(body) };
}

function jsonl(values: readonly unknown[]): string {
  return values.map((value) => `${canonicalJson(value)}\n`).join('');
}

describe('v10.3 static ledger disk-backed stream adapter', () => {
  it('streams a sorted partition and matches the Core semantic ledger hash', async () => {
    const first = record('first');
    const second = record('second');
    const records = [first, second].sort((left, right) => left.record.recordId.localeCompare(right.record.recordId));
    const resultValues = records.map(privacyResult);
    const expected = buildAdmissionPrivacyLedger({
      records,
      results: resultValues.map(({ resultSha256: _resultSha256, ...value }) => value),
      unresolvedRecordIds: [],
    });
    expect(expected.ok).toBe(true);
    const root = await mkdtemp(join(tmpdir(), 'slopbrick-static-stream-'));
    try {
      const chunks = async function* (): AsyncGenerator<string> {
        for (const value of records.map((entry) => canonicalJson(entry.record))) yield `${value}\n`;
      };
      const result = await materializeAdmissionStaticLedgerStream({
        kind: 'privacy',
        records: chunks(),
        results: jsonl(resultValues),
        unresolvedRecordIds: '',
        outputDirectory: root,
      });
      expect(result.ok).toBe(true);
      expect(result.receipt.complete).toBe(true);
      expect(result.receipt.recordCount).toBe(2);
      expect(result.receipt.coveredCount).toBe(2);
      expect(result.receipt.unresolvedCount).toBe(0);
      if (expected.ok) expect(result.receipt.ledgerSha256).toBe(expected.ledger.ledgerSha256);
      expect(result.receipt.authorityEligible).toBe(false);
      expect(result.receipt.resultRelativePath).toBe('privacy-ledger-v1/privacy-ledger.jsonl');
      const output = await readFile(join(root, 'privacy-ledger-v1', 'privacy-ledger.jsonl'), 'utf8');
      expect(output).toBe(jsonl(resultValues));
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it('accepts unresolved rows without retaining them and rejects a missing partition', async () => {
    const first = record('first');
    const second = record('second');
    const records = [first, second].sort((left, right) => left.record.recordId.localeCompare(right.record.recordId));
    const root = await mkdtemp(join(tmpdir(), 'slopbrick-static-stream-'));
    try {
      const success = await materializeAdmissionStaticLedgerStream({
        kind: 'privacy',
        records: jsonl(records.map((entry) => entry.record)),
        results: jsonl([privacyResult(records[0]!)]),
        unresolvedRecordIds: `${canonicalJson(records[1]!.record.recordId)}\n`,
        outputDirectory: root,
      });
      expect(success.ok).toBe(true);
      expect(success.receipt.coveredCount).toBe(1);
      expect(success.receipt.unresolvedCount).toBe(1);

      const missing = await materializeAdmissionStaticLedgerStream({
        kind: 'privacy',
        records: jsonl([first.record]),
        results: '',
        unresolvedRecordIds: '',
        outputDirectory: join(root, 'missing'),
      });
      expect(missing.ok).toBe(false);
      expect(missing.receipt.errors).toContain('partition:record_not_covered_or_unresolved');
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it('fails closed for unsorted records, invalid result content, and unsafe bounds', async () => {
    const first = record('first');
    const second = record('second');
    const records = [first, second];
    const root = await mkdtemp(join(tmpdir(), 'slopbrick-static-stream-'));
    try {
      const unsorted = await materializeAdmissionStaticLedgerStream({
        kind: 'privacy',
        records: jsonl(records.slice().reverse().map((entry) => entry.record)),
        results: jsonl(records.slice().reverse().map(privacyResult)),
        unresolvedRecordIds: '',
        outputDirectory: join(root, 'unsorted'),
      });
      expect(unsorted.ok).toBe(false);
      expect(unsorted.receipt.errors).toContain('records:not_strictly_sorted');

      const wrongBody = { ...privacyResult(first), contentSha256: sha('other') };
      const wrongResult = { ...wrongBody, resultSha256: calibrationAdmissionPrivacyResultSha256(wrongBody) };
      const wrong = await materializeAdmissionStaticLedgerStream({
        kind: 'privacy',
        records: jsonl([first.record]),
        results: jsonl([wrongResult]),
        unresolvedRecordIds: '',
        outputDirectory: join(root, 'wrong'),
      });
      expect(wrong.ok).toBe(false);
      expect(wrong.receipt.errors).toContain('results:content_hash_mismatch');

      const bounded = await materializeAdmissionStaticLedgerStream({
        kind: 'privacy',
        records: jsonl([first.record]),
        results: jsonl([privacyResult(first)]),
        unresolvedRecordIds: '',
        outputDirectory: join(root, 'bounded'),
        maxRecords: MAX_STATIC_LEDGER_RECORDS + 1,
      });
      expect(bounded.ok).toBe(false);
      expect(bounded.receipt.errors).toContain('max_records_invalid');
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});
