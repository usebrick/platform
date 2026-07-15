import { createHash } from 'node:crypto';

import {
  isCalibrationAdmissionOverlapResourceReceiptV1,
  type AdmissionOverlapResourceReceiptV1,
} from '@usebrick/core';

/** Exact stream identity required before an overlap receipt can authorize the live corpus. */
export interface RealScaleOverlapResourceExpectation {
  readonly recordCount: number;
  readonly universeSha256: string;
  readonly recordsJsonlSha256: string;
}

export interface RealScaleOverlapResourceValidation {
  readonly ok: boolean;
  readonly errors: readonly string[];
}

const NO_COVERED_CONTENT_SHA256 = createHash('sha256').update('no-covered-content').digest('hex');

/**
 * Apply the real-corpus scale binding on top of the Core overlap receipt.
 *
 * Core validates the receipt's shape and frozen limits. This boundary adds the
 * caller-owned identity of the selected stream, so a complete fixture receipt
 * or a complete receipt for a different universe cannot be reused as outer
 * authority. No filesystem or directory discovery is performed here.
 */
export function validateRealScaleOverlapResourceReceipt(
  value: unknown,
  expected: RealScaleOverlapResourceExpectation,
): RealScaleOverlapResourceValidation {
  const errors: string[] = [];
  if (!isCalibrationAdmissionOverlapResourceReceiptV1(value)) {
    errors.push('resource receipt failed Core validation');
    return { ok: false, errors };
  }
  if (!Number.isSafeInteger(expected.recordCount) || expected.recordCount <= 0) {
    errors.push('real-scale expected record count is invalid');
  }
  if (value.recordCount !== expected.recordCount) errors.push('resource receipt record count does not match the selected stream');
  if (value.universeSha256 !== expected.universeSha256) errors.push('resource receipt universe hash does not match the selected universe');
  if (value.recordsJsonlSha256 !== expected.recordsJsonlSha256) errors.push('resource receipt records hash does not match the selected stream');
  if (value.coverageComplete !== true) errors.push('resource receipt coverage is incomplete');
  if (value.withinAllLimits !== true) errors.push('resource receipt exceeds a configured resource limit');
  if (value.realContentDistributionSha256 === NO_COVERED_CONTENT_SHA256) errors.push('resource receipt uses the no-covered-content sentinel');
  return { ok: errors.length === 0, errors: [...new Set(errors)] };
}

export function isRealScaleOverlapResourceReceipt(
  value: unknown,
  expected: RealScaleOverlapResourceExpectation,
): value is AdmissionOverlapResourceReceiptV1 {
  return validateRealScaleOverlapResourceReceipt(value, expected).ok;
}
