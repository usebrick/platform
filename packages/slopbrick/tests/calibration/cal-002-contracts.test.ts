import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import Ajv2020 from 'ajv/dist/2020.js';
import { describe, expect, it } from 'vitest';
import {
  CAL002_ASSIGNMENT_VERSION,
  CAL002_CATALOG_VERSION,
  CAL002_FINAL_MATRIX_VERSION,
  CAL002_MATRIX_APPROVAL_VERSION,
  CAL002_ORIGIN_RECEIPT_VERSION,
  CAL002_PROTOCOL_VERSION,
  CAL002_QUALITY_METRICS_VERSION,
  CAL002_REVIEW_RECEIPT_VERSION,
  SLOPBRICK_RULE_EVIDENCE_POLICY_VERSION,
  canonicalArtifact,
  validateCAL002Assignment,
  validateCAL002Catalog,
  validateCAL002FinalMatrix,
  validateCAL002MatrixApproval,
  validateCAL002OriginReceipt,
  validateCAL002QualityMetrics,
  validateCAL002ReviewReceipt,
  validateSlopbrickRuleEvidencePolicy,
} from '../../src/calibration/cal-002/contracts';

const HERE = dirname(fileURLToPath(import.meta.url));
const SCHEMA_DIR = join(HERE, '../../src/calibration/cal-002/schemas');
const HASH_A = 'a'.repeat(64);
const HASH_B = 'b'.repeat(64);
const HASH_C = 'c'.repeat(64);
const HASH_D = 'd'.repeat(64);
const COMMIT = '1'.repeat(40);

const fixtures = {
  'cal-002-catalog.schema.json': {
    version: CAL002_CATALOG_VERSION,
    protocolVersion: CAL002_PROTOCOL_VERSION,
    cal001MatrixSha256: HASH_A,
    ruleCatalogSha256: HASH_B,
    rows: [{
      ruleId: 'security/eval',
      category: 'security',
      aiSpecific: false,
      existingDefaultOff: false,
      cal001Decision: 'quality-only',
      ownerReviewRequired: false,
      lane: 'quality',
      evidenceClass: 'deterministic-or-standards',
    }],
    counts: {
      total: 1,
      startingQuality: 1,
      startingOrigin: 0,
      ownerReviewRequired: 0,
      deterministic: 1,
      contextual: 0,
      statistical: 0,
    },
    admitted: false,
    applied: false,
  },
  'cal-002-assignment.schema.json': {
    version: CAL002_ASSIGNMENT_VERSION,
    protocolVersion: CAL002_PROTOCOL_VERSION,
    catalogSha256: HASH_A,
    assignmentImplementationCommitSha: COMMIT,
    assignmentId: 'assignment-001',
    round: 1,
    rows: [{
      assignmentRowId: 'assignment-row-001',
      ruleId: 'layout/spacing-grid',
      evidenceClass: 'contextual-quality',
      arm: 'finding',
      unitId: 'unit-001',
      blindedUnitId: 'blind-001',
    }],
    admitted: false,
  },
  'cal-002-review-receipt.schema.json': {
    version: CAL002_REVIEW_RECEIPT_VERSION,
    protocolVersion: CAL002_PROTOCOL_VERSION,
    catalogSha256: HASH_A,
    assignmentSha256: HASH_B,
    reviewImplementationCommitSha: COMMIT,
    reviewerId: 'reviewer-001',
    rows: [{
      assignmentRowId: 'assignment-row-001',
      ruleId: 'layout/spacing-grid',
      label: 'actionable-defect',
    }],
    admitted: false,
  },
  'cal-002-quality-metrics.schema.json': {
    version: CAL002_QUALITY_METRICS_VERSION,
    protocolVersion: CAL002_PROTOCOL_VERSION,
    catalogSha256: HASH_A,
    assignmentSha256: HASH_B,
    reviewReceiptSha256: HASH_C,
    reducerImplementationCommitSha: COMMIT,
    rows: [{
      ruleId: 'layout/spacing-grid',
      evidenceClass: 'contextual-quality',
      requestedPerArm: 30,
      finding: { actionableDefect: 18, usefulNoSafeFix: 8, notUseful: 2, cannotDetermine: 2 },
      control: { actionableDefect: 1, usefulNoSafeFix: 2, notUseful: 25, cannotDetermine: 2 },
      outcome: 'default-on',
      claimCeiling: 'quality-usefulness',
    }],
    admitted: false,
  },
  'cal-002-origin-receipt.schema.json': {
    version: CAL002_ORIGIN_RECEIPT_VERSION,
    protocolVersion: CAL002_PROTOCOL_VERSION,
    catalogSha256: HASH_A,
    cal001MatrixSha256: HASH_B,
    originImplementationCommitSha: COMMIT,
    evidence: {
      mode: 'reuse',
      sourceProtocolVersion: 'CAL-001-v1',
      sourceSha256: HASH_A,
      splitSha256: HASH_B,
      scannerSha256: HASH_C,
      configSha256: HASH_D,
      sourceCatalogSha256: HASH_A,
      receiptSha256: HASH_B,
      metricsSha256: HASH_C,
      reducerSha256: HASH_D,
    },
    rows: [{
      ruleId: 'ai/any-density',
      disposition: 'hold-origin-default-off',
    }],
    admitted: false,
  },
  'cal-002-final-matrix.schema.json': {
    version: CAL002_FINAL_MATRIX_VERSION,
    protocolVersion: CAL002_PROTOCOL_VERSION,
    catalogSha256: HASH_A,
    oracleReceiptSha256: HASH_B,
    qualityMetricsSha256: HASH_C,
    originReceiptSha256: HASH_D,
    reducerImplementationCommitSha: COMMIT,
    rows: [{
      ruleId: 'security/eval',
      lane: 'quality',
      evidenceClass: 'deterministic-or-standards',
      outcome: 'default-on',
      claimCeiling: 'deterministic-defect',
    }],
    counts: {
      total: 1,
      defaultOn: 1,
      defaultOff: 0,
      qualityAdvisory: 0,
      insufficientEvidence: 0,
      retired: 0,
    },
    admitted: false,
    applied: false,
  },
  'cal-002-matrix-approval.schema.json': {
    version: CAL002_MATRIX_APPROVAL_VERSION,
    protocolVersion: CAL002_PROTOCOL_VERSION,
    catalogSha256: HASH_A,
    finalMatrixSha256: HASH_B,
    approvalCommitSha: COMMIT,
    reviewerId: 'owner-001',
    decision: 'approved',
    concerns: [],
    admitted: false,
    applied: false,
  },
  'slopbrick-rule-evidence-policy.schema.json': {
    version: SLOPBRICK_RULE_EVIDENCE_POLICY_VERSION,
    protocolVersion: CAL002_PROTOCOL_VERSION,
    catalogSha256: HASH_A,
    finalMatrixSha256: HASH_B,
    matrixApprovalSha256: HASH_C,
    applicationImplementationCommitSha: COMMIT,
    rows: [{
      ruleId: 'security/eval',
      outcome: 'default-on',
      claimCeiling: 'deterministic-defect',
      enabledByDefault: true,
      scoreEligible: true,
      provenance: 'deterministic-finding-evidence',
    }],
    admitted: false,
    applied: false,
  },
} as const;

const validators = {
  'cal-002-catalog.schema.json': validateCAL002Catalog,
  'cal-002-assignment.schema.json': validateCAL002Assignment,
  'cal-002-review-receipt.schema.json': validateCAL002ReviewReceipt,
  'cal-002-quality-metrics.schema.json': validateCAL002QualityMetrics,
  'cal-002-origin-receipt.schema.json': validateCAL002OriginReceipt,
  'cal-002-final-matrix.schema.json': validateCAL002FinalMatrix,
  'cal-002-matrix-approval.schema.json': validateCAL002MatrixApproval,
  'slopbrick-rule-evidence-policy.schema.json': validateSlopbrickRuleEvidencePolicy,
} as const;

function clone<T>(value: T): T {
  return structuredClone(value);
}

describe('CAL-002 local artifact contracts', () => {
  it('enumerates exactly the eight local schemas and compiles each with Ajv 2020', () => {
    const index = JSON.parse(readFileSync(join(SCHEMA_DIR, 'index.json'), 'utf8')) as {
      schemas: { file: string; version: string }[];
    };
    expect(index.schemas).toEqual([
      { file: 'cal-002-catalog.schema.json', version: CAL002_CATALOG_VERSION },
      { file: 'cal-002-assignment.schema.json', version: CAL002_ASSIGNMENT_VERSION },
      { file: 'cal-002-review-receipt.schema.json', version: CAL002_REVIEW_RECEIPT_VERSION },
      { file: 'cal-002-quality-metrics.schema.json', version: CAL002_QUALITY_METRICS_VERSION },
      { file: 'cal-002-origin-receipt.schema.json', version: CAL002_ORIGIN_RECEIPT_VERSION },
      { file: 'cal-002-final-matrix.schema.json', version: CAL002_FINAL_MATRIX_VERSION },
      { file: 'cal-002-matrix-approval.schema.json', version: CAL002_MATRIX_APPROVAL_VERSION },
      { file: 'slopbrick-rule-evidence-policy.schema.json', version: SLOPBRICK_RULE_EVIDENCE_POLICY_VERSION },
    ]);

    const ajv = new Ajv2020({ allErrors: true, strict: true });
    for (const { file } of index.schemas) {
      const schema = JSON.parse(readFileSync(join(SCHEMA_DIR, file), 'utf8'));
      const validate = ajv.compile(schema);
      expect(validate(fixtures[file as keyof typeof fixtures]), `${file}: ${JSON.stringify(validate.errors)}`).toBe(true);
      const extra = { ...clone(fixtures[file as keyof typeof fixtures]), unexpected: true };
      expect(validate(extra), `${file} accepted an additional property`).toBe(false);
    }
  });

  it('keeps every object definition closed', () => {
    const index = JSON.parse(readFileSync(join(SCHEMA_DIR, 'index.json'), 'utf8')) as { schemas: { file: string }[] };
    const visit = (value: unknown, path: string): void => {
      if (Array.isArray(value)) {
        value.forEach((child, index) => visit(child, `${path}[${index}]`));
        return;
      }
      if (value === null || typeof value !== 'object') return;
      const record = value as Record<string, unknown>;
      if (record.type === 'object') expect(record.additionalProperties, path).toBe(false);
      Object.entries(record).forEach(([key, child]) => visit(child, `${path}.${key}`));
    };
    for (const { file } of index.schemas) {
      visit(JSON.parse(readFileSync(join(SCHEMA_DIR, file), 'utf8')), file);
    }
  });

  it('accepts complete artifacts with pure non-coercing validators', () => {
    for (const [file, validate] of Object.entries(validators)) {
      const fixture = clone(fixtures[file as keyof typeof fixtures]);
      expect(validate(fixture), file).toEqual({ ok: true, errors: [] });
      expect(fixture).toEqual(fixtures[file as keyof typeof fixtures]);
    }
  });

  it('rejects unknown keys, malformed bindings, duplicate rows, and invalid discriminants', () => {
    const unknown = { ...clone(fixtures['cal-002-assignment.schema.json']), unexpected: true };
    expect(validateCAL002Assignment(unknown).ok).toBe(false);

    const malformedHash = { ...clone(fixtures['cal-002-review-receipt.schema.json']), catalogSha256: HASH_A.toUpperCase() };
    expect(validateCAL002ReviewReceipt(malformedHash).errors.join(' ')).toMatch(/catalogSha256.*SHA-256/i);

    const malformedCommit = { ...clone(fixtures['cal-002-origin-receipt.schema.json']), originImplementationCommitSha: 'abc123' };
    expect(validateCAL002OriginReceipt(malformedCommit).errors.join(' ')).toMatch(/commit/i);

    const duplicate = clone(fixtures['cal-002-final-matrix.schema.json']);
    (duplicate.rows as unknown[]).push(clone(duplicate.rows[0]));
    expect(validateCAL002FinalMatrix(duplicate).errors.join(' ')).toMatch(/duplicate/i);

    const statisticalDefaultOn = clone(fixtures['cal-002-quality-metrics.schema.json']);
    statisticalDefaultOn.rows[0].evidenceClass = 'statistical-review-utility';
    expect(validateCAL002QualityMetrics(statisticalDefaultOn).errors.join(' ')).toMatch(/statistical.*default-on/i);

    const transferWithoutReason = clone(fixtures['cal-002-origin-receipt.schema.json']);
    transferWithoutReason.rows[0].disposition = 'transfer-to-quality';
    expect(validateCAL002OriginReceipt(transferWithoutReason).errors.join(' ')).toMatch(/transferReason/i);

    const rejectedWithoutConcern = { ...clone(fixtures['cal-002-matrix-approval.schema.json']), decision: 'rejected' };
    expect(validateCAL002MatrixApproval(rejectedWithoutConcern).errors.join(' ')).toMatch(/concern/i);

    const advisoryScored = clone(fixtures['slopbrick-rule-evidence-policy.schema.json']);
    advisoryScored.rows[0] = {
      ruleId: 'layout/spacing-grid',
      outcome: 'quality-advisory',
      claimCeiling: 'review-target-utility',
      enabledByDefault: true,
      scoreEligible: true,
      provenance: 'advisory-review-utility',
    };
    expect(validateSlopbrickRuleEvidencePolicy(advisoryScored).errors.join(' ')).toMatch(/quality-advisory.*score/i);
  });

  it('canonicalizes and hashes artifacts stably without mutating them', () => {
    const value = { z: 1, a: { y: 2, b: 3 } };
    const first = canonicalArtifact(value);
    const second = canonicalArtifact({ a: { b: 3, y: 2 }, z: 1 });
    expect(first).toEqual(second);
    expect(first.json).toBe('{"a":{"b":3,"y":2},"z":1}');
    expect(first.sha256).toMatch(/^[a-f0-9]{64}$/u);
    expect(value).toEqual({ z: 1, a: { y: 2, b: 3 } });
  });

  it('rejects catalog lane/evidence discriminant drift', () => {
    const catalog = clone(fixtures['cal-002-catalog.schema.json']);
    catalog.rows[0].lane = 'origin';
    expect(validateCAL002Catalog(catalog).ok).toBe(false);
  });

  it('keeps outcomes requiring local opt-in score-ineligible in policy contracts', () => {
    const defaultOff = clone(fixtures['slopbrick-rule-evidence-policy.schema.json']);
    defaultOff.rows[0] = {
      ruleId: 'layout/spacing-grid',
      outcome: 'default-off',
      claimCeiling: 'quality-usefulness',
      enabledByDefault: false,
      scoreEligible: true,
      provenance: 'current-quality-failed-claim-bar',
    };

    const insufficient = clone(fixtures['slopbrick-rule-evidence-policy.schema.json']);
    insufficient.rows[0] = {
      ruleId: 'layout/spacing-grid',
      outcome: 'insufficient-evidence',
      claimCeiling: 'insufficient-evidence',
      enabledByDefault: false,
      scoreEligible: true,
      provenance: 'insufficient-evidence',
    };

    const schema = JSON.parse(readFileSync(join(SCHEMA_DIR, 'slopbrick-rule-evidence-policy.schema.json'), 'utf8'));
    const validateSchema = new Ajv2020({ allErrors: true, strict: true }).compile(schema);
    for (const policy of [defaultOff, insufficient]) {
      expect(validateSlopbrickRuleEvidencePolicy(policy).errors.join(' ')).toMatch(/score/i);
      expect(validateSchema(policy), JSON.stringify(validateSchema.errors)).toBe(false);
    }
  });
});
