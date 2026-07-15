import { describe, expect, it } from 'vitest';
import {
  calibrationAdmissionLineageLedgerSha256,
  calibrationAdmissionRecordId,
  calibrationAdmissionPrivacyLedgerSha256,
  calibrationAdmissionQualityLedgerSha256,
  calibrationAdmissionSha256,
  validateCalibrationAdmissionRecordV103,
  validateCalibrationAdmissionLineageLedgerV1,
  validateCalibrationAdmissionPrivacyLedgerV1,
  validateCalibrationAdmissionQualityLedgerV1,
  type CalibrationAdmissionRecordV103,
} from '@usebrick/core';

import {
  buildAdmissionLineageLedger,
  buildAdmissionPrivacyLedger,
  buildAdmissionQualityLedger,
  buildAdmissionStaticLedgers,
  type AdmissionLineageResultInputV1,
  type AdmissionPrivacyResultInputV1,
  type AdmissionQualityResultInputV1,
  type AdmissionVerifiedRecordInputV1,
} from '../../src/calibration/v103/admission-static-ledgers';

const sha = (seed: string): string => calibrationAdmissionSha256({ seed });

function verifiedRecord(recordId: string, contentSeed: string): AdmissionVerifiedRecordInputV1 {
  const contentSha256 = sha(contentSeed);
  const recordBody = {
    version: 'v10.3-admission-record-v1' as const,
    recordId: '',
    materialSourceId: 'source-a',
    aggregateSourceIds: ['source-a'],
    sourceReviewSha256: sha('review'),
    logicalUnitId: `unit-${recordId}`,
    locator: { kind: 'git_file' as const, materializationId: 'materialization-a', normalizedPath: `src/${recordId}.ts` },
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
  const immutableRecordId = calibrationAdmissionRecordId(recordBody);
  const record = {
    ...recordBody,
    recordId: immutableRecordId,
    claimedLineage: { ...recordBody.claimedLineage, originRecordId: immutableRecordId },
  } satisfies CalibrationAdmissionRecordV103;
  expect(validateCalibrationAdmissionRecordV103(record).ok).toBe(true);
  return { record, canonicalSha256: calibrationAdmissionSha256(record) };
}

function privacyResult(record: AdmissionVerifiedRecordInputV1, status: 'pass' | 'review' | 'fail' = 'pass'): AdmissionPrivacyResultInputV1 {
  return {
    version: 'v10.3-admission-privacy-result-v1',
    recordId: record.record.recordId,
    contentSha256: record.record.contentSha256,
    privacyStatus: status,
    secretStatus: status,
    findings: [],
    reviewerDecisionIds: [],
    toolReceiptSha256: sha('privacy-tool'),
  };
}

function qualityResult(record: AdmissionVerifiedRecordInputV1): AdmissionQualityResultInputV1 {
  return {
    version: 'v10.3-admission-quality-result-v1',
    recordId: record.record.recordId,
    contentSha256: record.record.contentSha256,
    syntaxStatus: 'unsupported',
    scaffoldStatus: 'pass',
    scaffoldByteShare: 0,
    trivialStatus: 'pass',
    toolReceiptSha256: sha('quality-tool'),
  };
}

function lineageResult(record: AdmissionVerifiedRecordInputV1): AdmissionLineageResultInputV1 {
  return {
    version: 'v10.3-admission-lineage-result-v1',
    recordId: record.record.recordId,
    contentSha256: record.record.contentSha256,
    polarity: 'unassigned',
    familyId: 'family-a',
    pairGroupId: null,
    split: 'unassigned',
    exactClusterId: 'exact-a',
    nearClusterId: 'near-a',
    toolReceiptSha256: sha('lineage-tool'),
  };
}

describe('v10.3 static privacy/quality/lineage ledger builders', () => {
  it('builds deterministic, Core-valid ledgers from explicit verified records', () => {
    const first = verifiedRecord('first', 'first-content');
    const second = verifiedRecord('second', 'second-content');
    const records = [second, first];
    const privacy = buildAdmissionPrivacyLedger({ records, results: [privacyResult(first)], unresolvedRecordIds: [second.record.recordId] });
    const quality = buildAdmissionQualityLedger({ records, results: [qualityResult(first)], unresolvedRecordIds: [second.record.recordId] });
    const lineage = buildAdmissionLineageLedger({ records, results: [lineageResult(first)], unresolvedRecordIds: [second.record.recordId] });

    expect(privacy.ok).toBe(true);
    expect(quality.ok).toBe(true);
    expect(lineage.ok).toBe(true);
    if (!privacy.ok || !quality.ok || !lineage.ok) return;
    const recordIds = [first.record.recordId, second.record.recordId].sort();
    expect(validateCalibrationAdmissionPrivacyLedgerV1(privacy.ledger, recordIds).ok).toBe(true);
    expect(validateCalibrationAdmissionQualityLedgerV1(quality.ledger, recordIds).ok).toBe(true);
    expect(validateCalibrationAdmissionLineageLedgerV1(lineage.ledger, recordIds).ok).toBe(true);
    expect(privacy.ledger.coveredRecordIds).toEqual([first.record.recordId]);
    expect(privacy.ledger.unresolvedRecordIds).toEqual([second.record.recordId]);
    expect(privacy.ledger.ledgerSha256).toBe(calibrationAdmissionPrivacyLedgerSha256(privacy.ledger));
    expect(quality.ledger.ledgerSha256).toBe(calibrationAdmissionQualityLedgerSha256(quality.ledger));
    expect(lineage.ledger.ledgerSha256).toBe(calibrationAdmissionLineageLedgerSha256(lineage.ledger));
  });

  it('normalizes result order and computes the same hashes independent of input order', () => {
    const first = verifiedRecord('first', 'first-content');
    const second = verifiedRecord('second', 'second-content');
    const ordered = buildAdmissionStaticLedgers({
      records: [first, second],
      privacy: { results: [privacyResult(first), privacyResult(second)], unresolvedRecordIds: [] },
      quality: { results: [qualityResult(first), qualityResult(second)], unresolvedRecordIds: [] },
      lineage: { results: [lineageResult(first), lineageResult(second)], unresolvedRecordIds: [] },
    });
    const reversed = buildAdmissionStaticLedgers({
      records: [second, first],
      privacy: { results: [privacyResult(second), privacyResult(first)], unresolvedRecordIds: [] },
      quality: { results: [qualityResult(second), qualityResult(first)], unresolvedRecordIds: [] },
      lineage: { results: [lineageResult(second), lineageResult(first)], unresolvedRecordIds: [] },
    });
    expect(ordered.ok).toBe(true);
    expect(reversed.ok).toBe(true);
    if (!ordered.ok || !reversed.ok) return;
    expect(reversed.privacyLedger).toEqual(ordered.privacyLedger);
    expect(reversed.qualityLedger).toEqual(ordered.qualityLedger);
    expect(reversed.lineageLedger).toEqual(ordered.lineageLedger);
  });

  it('fails closed when a result is not bound to an explicit record', () => {
    const record = verifiedRecord('first', 'first-content');
    const unknown = verifiedRecord('unknown', 'unknown-content');
    const result = buildAdmissionPrivacyLedger({ records: [record], results: [privacyResult(unknown)], unresolvedRecordIds: [] });
    expect(result.ok).toBe(false);
    expect(result.errors).toContain('privacy result record ID is not in the verified record set');
  });

  it('fails closed when covered and unresolved IDs do not partition the records', () => {
    const record = verifiedRecord('first', 'first-content');
    const result = buildAdmissionQualityLedger({ records: [record], results: [], unresolvedRecordIds: [] });
    expect(result.ok).toBe(false);
    expect(result.errors).toContain('quality record partition does not equal the verified record set');
  });

  it('fails closed when result content differs from the verified record', () => {
    const record = verifiedRecord('first', 'first-content');
    const result = buildAdmissionLineageLedger({
      records: [record],
      results: [{ ...lineageResult(record), contentSha256: sha('different-content') }],
      unresolvedRecordIds: [],
    });
    expect(result.ok).toBe(false);
    expect(result.errors).toContain('lineage result content hash does not match the verified record');
  });

  it('rejects an invalid canonical hash on the explicit record input', () => {
    const record = verifiedRecord('first', 'first-content');
    const result = buildAdmissionPrivacyLedger({
      records: [{ ...record, canonicalSha256: sha('wrong-record-bytes') }],
      results: [],
      unresolvedRecordIds: [record.record.recordId],
    });
    expect(result.ok).toBe(false);
    expect(result.errors).toContain('verified record canonical hash does not match the record');
  });
});
