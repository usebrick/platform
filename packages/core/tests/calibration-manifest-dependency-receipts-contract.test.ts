import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import Ajv from 'ajv/dist/2020.js';

import {
  calibrationPackedRuntimeReceiptSha256,
  calibrationReleasePrerequisiteApprovalSha256,
  calibrationRunLifecycleReceiptSha256,
  calibrationScoreWireClosureReceiptSha256,
  isCalibrationPackedRuntimeReceiptV1,
  isCalibrationReleasePrerequisiteApprovalV1,
  isCalibrationRunLifecycleReceiptV1,
  isCalibrationScoreWireClosureReceiptV1,
} from '../src/calibration-manifest-dependency-receipts';

const root = fileURLToPath(new URL('..', import.meta.url));
const schemaRoot = join(root, 'schemas', 'v1');
const SHA = 'a'.repeat(64);
const COMMIT = 'b'.repeat(40);
const REVIEWERS = ['reviewer-a', 'reviewer-b'];

type Receipt = Record<string, unknown>;

function schemaValidator(file: string) {
  const schema = JSON.parse(readFileSync(join(schemaRoot, file), 'utf8')) as object;
  return new Ajv({ allErrors: true, strict: true }).compile(schema);
}

function releaseApproval(): Receipt {
  const body: Receipt = {
    version: 'v10.3-release-prerequisite-approval-v1',
    receiptId: 'release-approval-1',
    planSha256: SHA,
    approvedCommitSha: COMMIT,
    taskEvidenceSummarySha256: SHA,
    reviewerIds: REVIEWERS,
    decision: 'approved',
  };
  return { ...body, receiptSha256: calibrationReleasePrerequisiteApprovalSha256(body) };
}

function scoreWireClosure(): Receipt {
  const body: Receipt = {
    version: 'v10.3-score-wire-closure-receipt-v1',
    receiptId: 'score-wire-closure-1',
    approvedCommitSha: COMMIT,
    scoreContractSha256: SHA,
    verificationEvidenceSha256: SHA,
    reviewerIds: REVIEWERS,
    decision: 'approved',
  };
  return { ...body, receiptSha256: calibrationScoreWireClosureReceiptSha256(body) };
}

function runLifecycle(kind: 'run_init' | 'post_scan' = 'run_init'): Receipt {
  const body: Receipt = {
    version: 'v10.3-run-lifecycle-receipt-v1',
    receiptId: `run-lifecycle-${kind}`,
    kind,
    approvedCommitSha: COMMIT,
    behaviorSha256: SHA,
    verificationEvidenceSha256: SHA,
    reviewerIds: REVIEWERS,
    decision: 'approved',
  };
  return { ...body, receiptSha256: calibrationRunLifecycleReceiptSha256(body) };
}

function packedRuntime(nodeMajor: 22 | 24 = 22): Receipt {
  const body: Receipt = {
    version: 'v10.3-packed-runtime-receipt-v1',
    receiptId: `packed-runtime-node-${nodeMajor}`,
    approvedCommitSha: COMMIT,
    nodeMajor,
    packageVersion: '0.45.0',
    tarballSha256: SHA,
    manifestBuilderBehaviorSha256: SHA,
    installCommandSha256: SHA,
    verificationCommandSha256: SHA,
    outputSetSha256: SHA,
    reviewerIds: REVIEWERS,
    decision: 'approved',
    exitCode: 0,
  };
  return { ...body, receiptSha256: calibrationPackedRuntimeReceiptSha256(body) };
}

const cases = [
  ['calibration-release-prerequisite-approval.schema.json', releaseApproval, isCalibrationReleasePrerequisiteApprovalV1],
  ['calibration-score-wire-closure-receipt.schema.json', scoreWireClosure, isCalibrationScoreWireClosureReceiptV1],
  ['calibration-run-lifecycle-receipt.schema.json', runLifecycle, isCalibrationRunLifecycleReceiptV1],
  ['calibration-packed-runtime-receipt.schema.json', packedRuntime, isCalibrationPackedRuntimeReceiptV1],
] as const;

describe('Task 9A calibration manifest dependency receipt contracts', () => {
  it.each(cases)('accepts a schema-valid and self-hashed %s', (schemaFile, build, isValid) => {
    const value = build();
    const validate = schemaValidator(schemaFile);
    expect(validate(value), JSON.stringify(validate.errors)).toBe(true);
    expect(isValid(value)).toBe(true);
  });

  it('accepts both terminal run kinds and both supported packed Node majors', () => {
    expect(isCalibrationRunLifecycleReceiptV1(runLifecycle('run_init'))).toBe(true);
    expect(isCalibrationRunLifecycleReceiptV1(runLifecycle('post_scan'))).toBe(true);
    expect(isCalibrationPackedRuntimeReceiptV1(packedRuntime(22))).toBe(true);
    expect(isCalibrationPackedRuntimeReceiptV1(packedRuntime(24))).toBe(true);
  });

  it.each(cases)('rejects a self-hash mutation in %s', (schemaFile, build, isValid) => {
    const value = build();
    const validate = schemaValidator(schemaFile);
    value.receiptSha256 = SHA;
    expect(validate(value), JSON.stringify(validate.errors)).toBe(true);
    expect(isValid(value)).toBe(false);
  });

  it.each(cases)('rejects unknown fields and semantic field mutations in %s', (schemaFile, build, isValid) => {
    const validate = schemaValidator(schemaFile);
    const unknown = build();
    unknown.unreviewedShortcut = true;
    expect(validate(unknown)).toBe(false);
    expect(isValid(unknown)).toBe(false);

    const wrongCommit = build();
    wrongCommit.approvedCommitSha = 'c'.repeat(39);
    expect(validate(wrongCommit)).toBe(false);
    expect(isValid(wrongCommit)).toBe(false);

    const unsortedReviewers = build();
    unsortedReviewers.reviewerIds = ['reviewer-b', 'reviewer-a'];
    expect(validate(unsortedReviewers)).toBe(true);
    expect(isValid(unsortedReviewers)).toBe(false);
  });

  it('rejects duplicate reviewers, non-approved decisions, and non-terminal packed exit states', () => {
    const duplicate = releaseApproval();
    duplicate.reviewerIds = ['reviewer-a', 'reviewer-a'];
    expect(isCalibrationReleasePrerequisiteApprovalV1(duplicate)).toBe(false);

    const decision = scoreWireClosure();
    decision.decision = 'proposed';
    expect(isCalibrationScoreWireClosureReceiptV1(decision)).toBe(false);

    const exit = packedRuntime();
    exit.exitCode = 1;
    expect(isCalibrationPackedRuntimeReceiptV1(exit)).toBe(false);
  });

  it('does not allow cross-kind schema or validator substitution', () => {
    const release = releaseApproval();
    const scoreValidate = schemaValidator('calibration-score-wire-closure-receipt.schema.json');
    expect(scoreValidate(release)).toBe(false);
    expect(isCalibrationScoreWireClosureReceiptV1(release)).toBe(false);
    expect(isCalibrationReleasePrerequisiteApprovalV1(scoreWireClosure())).toBe(false);
  });

  it('changes the canonical self-hash when any signed field changes', () => {
    const original = releaseApproval();
    const mutated = { ...original, planSha256: 'c'.repeat(64) };
    expect(calibrationReleasePrerequisiteApprovalSha256(original)).not.toBe(
      calibrationReleasePrerequisiteApprovalSha256(mutated),
    );
  });
});
