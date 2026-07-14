import { describe, expect, it } from 'vitest';
import {
  calibrationAdmissionPreWitnessBundleSha256,
  validateCalibrationAdmissionPreWitnessBundleV1,
} from '../src/index';

const A = 'a'.repeat(64);
const B = 'b'.repeat(64);

function bundle(overrides: Record<string, unknown> = {}) {
  const value = {
    version: 'v10.3-admission-pre-witness-bundle-v1' as const,
    admissionRecordSetSha256: A,
    recordStreamSha256: A,
    privacyLedgerSha256: A,
    qualityLedgerSha256: A,
    lineageLedgerSha256: A,
    overlapGenerationSha256: B,
    toolReceiptSha256: A,
    artifacts: [
      { kind: 'lineage_ledger' as const, relativePath: 'static/lineage.json', sha256: A },
      { kind: 'overlap_generation' as const, relativePath: 'static/overlap.json', sha256: B },
      { kind: 'privacy_ledger' as const, relativePath: 'static/privacy.json', sha256: A },
      { kind: 'quality_ledger' as const, relativePath: 'static/quality.json', sha256: A },
      { kind: 'record_stream' as const, relativePath: 'static/records.jsonl', sha256: A },
    ],
    ...overrides,
  };
  return { ...value, preWitnessSha256: calibrationAdmissionPreWitnessBundleSha256(value) };
}

describe('Task 2B pre-witness bundle contract', () => {
  it('accepts a sorted static bundle that contains no witness-target artifact', () => {
    expect(validateCalibrationAdmissionPreWitnessBundleV1(bundle()).ok).toBe(true);
  });

  it('rejects witness-target assignments, decisions, receipts, and witness paths', () => {
    const base = bundle();
    for (const kind of ['witness_target_assignment', 'witness_decision', 'witness_receipt']) {
      const artifacts = [...base.artifacts, { kind, relativePath: `static/${kind}.json`, sha256: A }];
      const value = { ...base, artifacts, preWitnessSha256: calibrationAdmissionPreWitnessBundleSha256({ ...base, artifacts }) };
      expect(validateCalibrationAdmissionPreWitnessBundleV1(value).ok, kind).toBe(false);
    }
    const artifacts = base.artifacts.map((artifact) => ({ ...artifact, relativePath: artifact.kind === 'privacy_ledger' ? 'witness/privacy.json' : artifact.relativePath }));
    const value = { ...base, artifacts, preWitnessSha256: calibrationAdmissionPreWitnessBundleSha256({ ...base, artifacts }) };
    expect(validateCalibrationAdmissionPreWitnessBundleV1(value).ok).toBe(false);
  });

  it('rejects unsorted artifacts and self-hash mutations', () => {
    const base = bundle();
    const artifacts = [...base.artifacts].reverse();
    const reversed = { ...base, artifacts, preWitnessSha256: calibrationAdmissionPreWitnessBundleSha256({ ...base, artifacts }) };
    expect(validateCalibrationAdmissionPreWitnessBundleV1(reversed).ok).toBe(false);
    expect(validateCalibrationAdmissionPreWitnessBundleV1({ ...base, preWitnessSha256: A }).ok).toBe(false);
  });
});
