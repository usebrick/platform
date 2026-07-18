import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import Ajv2020 from 'ajv/dist/2020.js';
import { describe, expect, it } from 'vitest';
import type { Rule } from '../../src/types';
import type { CAL001DecisionRow } from '../../src/calibration/corpus-v1/calibration-decisions';
import { buildCAL002Catalog } from '../../src/calibration/cal-002/catalog';
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
import { RuleRegistry } from '../../src/rules/registry';
import { getDefaultOffRules } from '../../src/rules/signal-strength';

const HERE = dirname(fileURLToPath(import.meta.url));
const SCHEMA_DIR = join(HERE, '../../src/calibration/cal-002/schemas');
const HASH_A = 'a'.repeat(64);
const HASH_B = 'b'.repeat(64);
const HASH_C = 'c'.repeat(64);
const HASH_D = 'd'.repeat(64);
const COMMIT = '1'.repeat(40);

function fullCatalogFixture() {
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
      evidence: { holdoutReceiptSha256: HASH_B, metricsSha256: HASH_C, report: 'CAL-001-v1-origin-discrimination-diagnostic' },
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
      rationale: 'Frozen CAL-001 fixture row.',
    };
  });
  return buildCAL002Catalog({ rules, effectiveDefaultOffRuleIds, cal001Rows, cal001MatrixSha256: HASH_A }).catalog;
}

const fixtures = {
  'cal-002-catalog.schema.json': fullCatalogFixture(),
  'cal-002-assignment.schema.json': {
    version: CAL002_ASSIGNMENT_VERSION,
    protocolVersion: CAL002_PROTOCOL_VERSION,
    catalogSha256: HASH_A,
    assignmentImplementationCommitSha: COMMIT,
    assignmentId: 'assignment-001',
    assignmentSha256: HASH_B,
    selectionManifestSha256: HASH_C,
    blindedBatchSha256: HASH_D,
    round: 'initial',
    targetPerArm: 30,
    rows: [{
      reviewId: 'review-001',
      ruleId: 'layout/spacing-grid',
      evidenceClass: 'contextual-quality',
      role: 'finding',
      unitId: 'unit-001',
    }],
    blindedRows: [{
      reviewId: 'review-001',
      ruleId: 'layout/spacing-grid',
      evidenceClass: 'contextual-quality',
      sourceIdentitySha256: HASH_A,
      lineWindowLocator: 'line:10:column:2',
    }],
    admitted: false,
  },
  'cal-002-review-receipt.schema.json': {
    version: CAL002_REVIEW_RECEIPT_VERSION,
    protocolVersion: CAL002_PROTOCOL_VERSION,
    catalogSha256: HASH_A,
    assignmentSha256: HASH_B,
    blindedBatchSha256: HASH_C,
    stateSha256: HASH_D,
    reviewImplementationCommitSha: COMMIT,
    reviewerAuthority: 'repository-owner',
    rows: [{
      reviewId: 'review-001',
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
    originImplementationCommitSha: COMMIT,
    status: 'reused',
    governingHashes: {
      protocolSha256: HASH_A,
      sourceBindingReceiptSha256: HASH_B,
      splitPlanSha256: HASH_C,
      scannerCommitSha: COMMIT,
      configSha256: HASH_D,
      catalogSha256: HASH_A,
      holdoutReceiptSha256: HASH_B,
      metricsSha256: HASH_C,
      cal001MatrixSha256: HASH_A,
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
      priorAiSpecific: false,
      transferred: false,
      evidenceClass: 'deterministic-or-standards',
      measurementStatus: 'oracle-verified',
      claimCeiling: 'deterministic-defect',
      authority: 'standards-contract',
      sampleCounts: { findings: 5, controls: 5, cannotDetermine: 0 },
      usefulness: 'passed',
      outcome: 'default-on',
      enabledByDefault: true,
      scoreEligibleByDefault: true,
      repairSafety: 'finding-bound-only',
      evidenceSha256: HASH_A,
      admitted: false,
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
    reviewerAuthority: 'repository-owner',
    decision: 'approved',
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
    applied: true,
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

function schemaValidator(file: keyof typeof fixtures) {
  const schema = JSON.parse(readFileSync(join(SCHEMA_DIR, file), 'utf8'));
  return new Ajv2020({ allErrors: true, strict: true }).compile(schema);
}

function expectRejectedByBoth(file: keyof typeof fixtures, value: unknown, pattern: RegExp): void {
  const custom = validators[file](value);
  expect(custom.errors.join(' ')).toMatch(pattern);
  const schema = schemaValidator(file);
  expect(schema(value), JSON.stringify(schema.errors)).toBe(false);
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
    expect(validateCAL002OriginReceipt(transferWithoutReason).errors.join(' ')).toMatch(/reason/i);

    const rejectedApproval = { ...clone(fixtures['cal-002-matrix-approval.schema.json']), decision: 'rejected' };
    expectRejectedByBoth('cal-002-matrix-approval.schema.json', rejectedApproval, /approved|decision/i);

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
    (catalog.rows[0] as Record<string, unknown>).lane = 'quality';
    expectRejectedByBoth('cal-002-catalog.schema.json', catalog, /lane|identity|locked/i);
  });

  it('binds private assignments to selection and blinded identities without exposing roles', () => {
    const duplicateUnit = clone(fixtures['cal-002-assignment.schema.json']);
    (duplicateUnit.rows as unknown[]).push({
      reviewId: 'review-002',
      ruleId: 'layout/spacing-grid',
      evidenceClass: 'contextual-quality',
      role: 'control',
      unitId: 'unit-001',
    });
    (duplicateUnit.blindedRows as unknown[]).push({
      reviewId: 'review-002',
      ruleId: 'layout/spacing-grid',
      evidenceClass: 'contextual-quality',
      sourceIdentitySha256: HASH_B,
      lineWindowLocator: 'line:20:column:1',
    });
    expect(validateCAL002Assignment(duplicateUnit).errors.join(' ')).toMatch(/ruleId.*unitId|unitId.*duplicate/i);

    const exposedRole = clone(fixtures['cal-002-assignment.schema.json']);
    (exposedRole.blindedRows[0] as Record<string, unknown>).role = 'finding';
    expectRejectedByBoth('cal-002-assignment.schema.json', exposedRole, /role|unknown/i);

    const finalRound = clone(fixtures['cal-002-assignment.schema.json']);
    (finalRound as Record<string, unknown>).round = 'final';
    (finalRound as Record<string, unknown>).targetPerArm = 100;
    expect(validateCAL002Assignment(finalRound)).toEqual({ ok: true, errors: [] });
    expect(schemaValidator('cal-002-assignment.schema.json')(finalRound)).toBe(true);

    const mismatchedRound = { ...finalRound, targetPerArm: 30 };
    expectRejectedByBoth('cal-002-assignment.schema.json', mismatchedRound, /round|targetPerArm/i);
  });

  it('requires authority-bound reviews with the four exact labels and all governing hashes', () => {
    const wrongAuthority = { ...clone(fixtures['cal-002-review-receipt.schema.json']), reviewerAuthority: 'maintainer' };
    expectRejectedByBoth('cal-002-review-receipt.schema.json', wrongAuthority, /reviewerAuthority|repository-owner/i);

    const freeForm = clone(fixtures['cal-002-review-receipt.schema.json']);
    (freeForm.rows[0] as Record<string, unknown>).label = 'looks-good';
    expectRejectedByBoth('cal-002-review-receipt.schema.json', freeForm, /label|one of/i);

    const missingOriginHash = clone(fixtures['cal-002-origin-receipt.schema.json']) as Record<string, unknown>;
    delete (missingOriginHash.governingHashes as Record<string, unknown>).sourceBindingReceiptSha256;
    expectRejectedByBoth('cal-002-origin-receipt.schema.json', missingOriginHash, /sourceBindingReceiptSha256|required/i);

    const retired = clone(fixtures['cal-002-origin-receipt.schema.json']);
    retired.rows[0] = { ruleId: 'ai/any-density', disposition: 'retire', reason: 'duplicate-or-obsolete' } as never;
    expect(validateCAL002OriginReceipt(retired)).toEqual({ ok: true, errors: [] });
    expect(schemaValidator('cal-002-origin-receipt.schema.json')(retired)).toBe(true);

    const retiredWithoutReason = clone(retired) as Record<string, unknown>;
    delete ((retiredWithoutReason.rows as Record<string, unknown>[])[0]!).reason;
    expectRejectedByBoth('cal-002-origin-receipt.schema.json', retiredWithoutReason, /reason|required/i);
  });

  it('accepts the complete final-row interface and rejects cross-field drift in both validators', () => {
    const unavailableDefaultOn = clone(fixtures['cal-002-final-matrix.schema.json']);
    unavailableDefaultOn.rows[0] = {
      ...unavailableDefaultOn.rows[0],
      ruleId: 'layout/spacing-grid',
      evidenceClass: 'contextual-quality',
      measurementStatus: 'unavailable',
      claimCeiling: 'quality-usefulness',
      authority: 'repository-owner',
    } as never;
    expectRejectedByBoth('cal-002-final-matrix.schema.json', unavailableDefaultOn, /measurement|measured/i);

    const measuredOrigin = clone(fixtures['cal-002-final-matrix.schema.json']);
    measuredOrigin.rows[0] = {
      ...measuredOrigin.rows[0],
      ruleId: 'ai/any-density',
      lane: 'origin',
      priorAiSpecific: true,
      transferred: false,
      measurementStatus: 'measured',
      claimCeiling: 'internal-origin-association',
      authority: 'publisher-attested-internal',
      usefulness: 'not-applicable',
      outcome: 'default-off',
      enabledByDefault: false,
      scoreEligibleByDefault: false,
      repairSafety: 'not-applicable',
    } as never;
    delete (measuredOrigin.rows[0] as Record<string, unknown>).evidenceClass;
    measuredOrigin.counts = { total: 1, defaultOn: 0, defaultOff: 1, qualityAdvisory: 0, insufficientEvidence: 0, retired: 0 };
    expect(validateCAL002FinalMatrix(measuredOrigin)).toEqual({ ok: true, errors: [] });
    expect(schemaValidator('cal-002-final-matrix.schema.json')(measuredOrigin)).toBe(true);
    const unavailableOrigin = clone(measuredOrigin);
    (unavailableOrigin.rows[0] as Record<string, unknown>).measurementStatus = 'unavailable';
    expectRejectedByBoth('cal-002-final-matrix.schema.json', unavailableOrigin, /measurement|measured/i);

    const statisticalDefaultOn = clone(fixtures['cal-002-final-matrix.schema.json']);
    statisticalDefaultOn.rows[0] = {
      ...statisticalDefaultOn.rows[0],
      ruleId: 'logic/heaps-deviation',
      evidenceClass: 'statistical-review-utility',
      measurementStatus: 'measured',
      claimCeiling: 'quality-usefulness',
      authority: 'repository-owner',
      usefulness: 'passed',
      repairSafety: 'no-safe-repair',
    } as never;
    expectRejectedByBoth('cal-002-final-matrix.schema.json', statisticalDefaultOn, /statistical|default-on|evidenceClass/i);

    const originDefaultOn = clone(fixtures['cal-002-final-matrix.schema.json']);
    originDefaultOn.rows[0] = {
      ...originDefaultOn.rows[0],
      ruleId: 'ai/any-density',
      lane: 'origin',
      priorAiSpecific: true,
      transferred: false,
      measurementStatus: 'measured',
      claimCeiling: 'internal-origin-association',
      authority: 'publisher-attested-internal',
      usefulness: 'not-applicable',
      repairSafety: 'not-applicable',
    } as never;
    delete (originDefaultOn.rows[0] as Record<string, unknown>).evidenceClass;
    expectRejectedByBoth('cal-002-final-matrix.schema.json', originDefaultOn, /origin|default-on|outcome/i);

    const missingRowAdmission = clone(fixtures['cal-002-final-matrix.schema.json']) as Record<string, unknown>;
    delete ((missingRowAdmission.rows as Record<string, unknown>[])[0]!).admitted;
    expectRejectedByBoth('cal-002-final-matrix.schema.json', missingRowAdmission, /admitted|required/i);
  });

  it('allows initial and post-approval policy states while constraining every policy discriminant', () => {
    const initial = { ...clone(fixtures['slopbrick-rule-evidence-policy.schema.json']), applied: false };
    for (const policy of [initial, fixtures['slopbrick-rule-evidence-policy.schema.json']]) {
      expect(validateSlopbrickRuleEvidencePolicy(policy)).toEqual({ ok: true, errors: [] });
      expect(schemaValidator('slopbrick-rule-evidence-policy.schema.json')(policy)).toBe(true);
    }

    const invalidDefaultOn = clone(fixtures['slopbrick-rule-evidence-policy.schema.json']);
    invalidDefaultOn.rows[0] = {
      ruleId: 'logic/heaps-deviation',
      outcome: 'default-on',
      claimCeiling: 'review-target-utility',
      enabledByDefault: true,
      scoreEligible: true,
      provenance: 'advisory-review-utility',
    } as never;
    expectRejectedByBoth('slopbrick-rule-evidence-policy.schema.json', invalidDefaultOn, /default-on|claim|provenance|incompatible/i);
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
