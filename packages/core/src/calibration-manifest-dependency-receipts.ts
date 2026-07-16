import { calibrationAdmissionSha256 } from './calibration-admission-evidence';
import type { CalibrationPackedRuntimeReceiptV1 } from './generated/calibration-packed-runtime-receipt';
import type { CalibrationReleasePrerequisiteApprovalV1 } from './generated/calibration-release-prerequisite-approval';
import type { CalibrationRunLifecycleReceiptV1 } from './generated/calibration-run-lifecycle-receipt';
import type { CalibrationScoreWireClosureReceiptV1 } from './generated/calibration-score-wire-closure-receipt';
import {
  exactKeys,
  isAdmissionId,
  isJsonRecord,
  isSha256,
  sortedUniqueByPredicate,
  withoutJsonKey,
} from './calibration-admission-primitives';

const COMMIT_SHA = /^[a-f0-9]{40}$/;

export type {
  CalibrationPackedRuntimeReceiptV1,
  CalibrationReleasePrerequisiteApprovalV1,
  CalibrationRunLifecycleReceiptV1,
  CalibrationScoreWireClosureReceiptV1,
};

export type CalibrationManifestDependencyReceiptV1 =
  | CalibrationReleasePrerequisiteApprovalV1
  | CalibrationScoreWireClosureReceiptV1
  | CalibrationRunLifecycleReceiptV1
  | CalibrationPackedRuntimeReceiptV1;

function selfHash(value: unknown): string {
  return calibrationAdmissionSha256(withoutJsonKey(value, 'receiptSha256'));
}

function approvedCommit(value: unknown): value is string {
  return typeof value === 'string' && COMMIT_SHA.test(value);
}

function reviewers(value: unknown): value is readonly [string, string] {
  return Array.isArray(value)
    && value.length === 2
    && sortedUniqueByPredicate(value, isAdmissionId, false);
}

export function calibrationReleasePrerequisiteApprovalSha256(value: unknown): string {
  return selfHash(value);
}

export function calibrationScoreWireClosureReceiptSha256(value: unknown): string {
  return selfHash(value);
}

export function calibrationRunLifecycleReceiptSha256(value: unknown): string {
  return selfHash(value);
}

export function calibrationPackedRuntimeReceiptSha256(value: unknown): string {
  return selfHash(value);
}

export function isCalibrationReleasePrerequisiteApprovalV1(
  value: unknown,
): value is CalibrationReleasePrerequisiteApprovalV1 {
  if (!isJsonRecord(value) || !exactKeys(value, [
    'version',
    'receiptId',
    'planSha256',
    'approvedCommitSha',
    'taskEvidenceSummarySha256',
    'reviewerIds',
    'decision',
    'receiptSha256',
  ])) return false;
  if (value.version !== 'v10.3-release-prerequisite-approval-v1'
    || !isAdmissionId(value.receiptId)
    || !isSha256(value.planSha256)
    || !approvedCommit(value.approvedCommitSha)
    || !isSha256(value.taskEvidenceSummarySha256)
    || !reviewers(value.reviewerIds)
    || value.decision !== 'approved'
    || !isSha256(value.receiptSha256)) return false;
  try {
    return calibrationReleasePrerequisiteApprovalSha256(value) === value.receiptSha256;
  } catch {
    return false;
  }
}

export function isCalibrationScoreWireClosureReceiptV1(
  value: unknown,
): value is CalibrationScoreWireClosureReceiptV1 {
  if (!isJsonRecord(value) || !exactKeys(value, [
    'version',
    'receiptId',
    'approvedCommitSha',
    'scoreContractSha256',
    'verificationEvidenceSha256',
    'reviewerIds',
    'decision',
    'receiptSha256',
  ])) return false;
  if (value.version !== 'v10.3-score-wire-closure-receipt-v1'
    || !isAdmissionId(value.receiptId)
    || !approvedCommit(value.approvedCommitSha)
    || !isSha256(value.scoreContractSha256)
    || !isSha256(value.verificationEvidenceSha256)
    || !reviewers(value.reviewerIds)
    || value.decision !== 'approved'
    || !isSha256(value.receiptSha256)) return false;
  try {
    return calibrationScoreWireClosureReceiptSha256(value) === value.receiptSha256;
  } catch {
    return false;
  }
}

export function isCalibrationRunLifecycleReceiptV1(
  value: unknown,
): value is CalibrationRunLifecycleReceiptV1 {
  if (!isJsonRecord(value) || !exactKeys(value, [
    'version',
    'receiptId',
    'kind',
    'approvedCommitSha',
    'behaviorSha256',
    'verificationEvidenceSha256',
    'reviewerIds',
    'decision',
    'receiptSha256',
  ])) return false;
  if (value.version !== 'v10.3-run-lifecycle-receipt-v1'
    || !isAdmissionId(value.receiptId)
    || (value.kind !== 'run_init' && value.kind !== 'post_scan')
    || !approvedCommit(value.approvedCommitSha)
    || !isSha256(value.behaviorSha256)
    || !isSha256(value.verificationEvidenceSha256)
    || !reviewers(value.reviewerIds)
    || value.decision !== 'approved'
    || !isSha256(value.receiptSha256)) return false;
  try {
    return calibrationRunLifecycleReceiptSha256(value) === value.receiptSha256;
  } catch {
    return false;
  }
}

export function isCalibrationPackedRuntimeReceiptV1(
  value: unknown,
): value is CalibrationPackedRuntimeReceiptV1 {
  if (!isJsonRecord(value) || !exactKeys(value, [
    'version',
    'receiptId',
    'approvedCommitSha',
    'nodeMajor',
    'packageVersion',
    'tarballSha256',
    'manifestBuilderBehaviorSha256',
    'installCommandSha256',
    'verificationCommandSha256',
    'outputSetSha256',
    'reviewerIds',
    'decision',
    'exitCode',
    'receiptSha256',
  ])) return false;
  if (value.version !== 'v10.3-packed-runtime-receipt-v1'
    || !isAdmissionId(value.receiptId)
    || !approvedCommit(value.approvedCommitSha)
    || (value.nodeMajor !== 22 && value.nodeMajor !== 24)
    || value.packageVersion !== '0.45.0'
    || !isSha256(value.tarballSha256)
    || !isSha256(value.manifestBuilderBehaviorSha256)
    || !isSha256(value.installCommandSha256)
    || !isSha256(value.verificationCommandSha256)
    || !isSha256(value.outputSetSha256)
    || !reviewers(value.reviewerIds)
    || value.decision !== 'approved'
    || value.exitCode !== 0
    || !isSha256(value.receiptSha256)) return false;
  try {
    return calibrationPackedRuntimeReceiptSha256(value) === value.receiptSha256;
  } catch {
    return false;
  }
}

export function isCalibrationManifestDependencyReceiptV1(
  value: unknown,
): value is CalibrationManifestDependencyReceiptV1 {
  if (!isJsonRecord(value)) return false;
  switch (value.version) {
    case 'v10.3-release-prerequisite-approval-v1':
      return isCalibrationReleasePrerequisiteApprovalV1(value);
    case 'v10.3-score-wire-closure-receipt-v1':
      return isCalibrationScoreWireClosureReceiptV1(value);
    case 'v10.3-run-lifecycle-receipt-v1':
      return isCalibrationRunLifecycleReceiptV1(value);
    case 'v10.3-packed-runtime-receipt-v1':
      return isCalibrationPackedRuntimeReceiptV1(value);
    default:
      return false;
  }
}
