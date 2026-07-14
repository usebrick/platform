import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import Ajv from 'ajv/dist/2020.js';
import {
  calibrationAdmissionPreWitnessBoundarySha256,
  validateCalibrationAdmissionPreWitnessBoundaryV1,
} from '../src/index';

const A = 'a'.repeat(64);
const B = 'b'.repeat(64);

function bundle(overrides: Record<string, unknown> = {}) {
  const value = {
    version: 'v10.3-admission-pre-witness-boundary-v1' as const,
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
  return { ...value, preWitnessSha256: calibrationAdmissionPreWitnessBoundarySha256(value) };
}

describe('Task 2B pre-witness boundary contract', () => {
  it('accepts a sorted static bundle that contains no witness-target artifact', () => {
    expect(validateCalibrationAdmissionPreWitnessBoundaryV1(bundle()).ok).toBe(true);
  });

  it('rejects witness-target assignments, decisions, receipts, and witness paths', () => {
    const base = bundle();
    for (const kind of ['witness_target_assignment', 'witness_decision', 'witness_receipt']) {
      const artifacts = [...base.artifacts, { kind, relativePath: `static/${kind}.json`, sha256: A }];
      const value = { ...base, artifacts, preWitnessSha256: calibrationAdmissionPreWitnessBoundarySha256({ ...base, artifacts }) };
      expect(validateCalibrationAdmissionPreWitnessBoundaryV1(value).ok, kind).toBe(false);
    }
    const artifacts = base.artifacts.map((artifact) => ({ ...artifact, relativePath: artifact.kind === 'privacy_ledger' ? 'witness/privacy.json' : artifact.relativePath }));
    const value = { ...base, artifacts, preWitnessSha256: calibrationAdmissionPreWitnessBoundarySha256({ ...base, artifacts }) };
    expect(validateCalibrationAdmissionPreWitnessBoundaryV1(value).ok).toBe(false);
  });

  it('rejects unsorted artifacts and self-hash mutations', () => {
    const base = bundle();
    const artifacts = [...base.artifacts].reverse();
    const reversed = { ...base, artifacts, preWitnessSha256: calibrationAdmissionPreWitnessBoundarySha256({ ...base, artifacts }) };
    expect(validateCalibrationAdmissionPreWitnessBoundaryV1(reversed).ok).toBe(false);
    expect(validateCalibrationAdmissionPreWitnessBoundaryV1({ ...base, preWitnessSha256: A }).ok).toBe(false);
  });

  it('rejects forbidden paths at the JSON Schema boundary, not only at runtime', () => {
    const schemaPath = fileURLToPath(new URL('../schemas/v1/calibration-admission-pre-witness-boundary.schema.json', import.meta.url));
    const schema = JSON.parse(readFileSync(schemaPath, 'utf8')) as object;
    const validate = new Ajv({ allErrors: true, strict: true }).compile(schema);
    const invalid = bundle() as { artifacts: Array<Record<string, unknown>> };
    invalid.artifacts[0] = { ...invalid.artifacts[0], relativePath: 'witness/privacy.json' };
    expect(validate(invalid), JSON.stringify(validate.errors)).toBe(false);
    const duplicateKinds = bundle() as { artifacts: Array<Record<string, unknown>> };
    duplicateKinds.artifacts = duplicateKinds.artifacts.map(() => ({ ...duplicateKinds.artifacts[0] }));
    expect(validate(duplicateKinds), JSON.stringify(validate.errors)).toBe(false);
  });
});
