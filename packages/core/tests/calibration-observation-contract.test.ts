import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import Ajv from 'ajv/dist/2020.js';
import { isCalibrationObservationV103 } from '../src/calibration-observations';

const root = fileURLToPath(new URL('..', import.meta.url));
const schemaPath = join(root, 'schemas', 'v1', 'calibration-observation.schema.json');

function validator() {
  return new Ajv({ allErrors: true, strict: true }).compile(JSON.parse(readFileSync(schemaPath, 'utf8')) as object);
}

function observation() {
  return {
    version: 'v10.3', runId: 'run', fileId: 'file', repositoryId: 'repo', familyId: 'family', language: 'typescript', polarity: 'verified_ai' as const,
    status: 'success_findings' as const, findingsCount: 2,
    ruleEvidence: [{ ruleId: 'ai/comment-ratio', category: 'ai', aiSpecific: true, severity: 'high', count: 2 }],
  };
}

describe('v10.3 calibration observation rule evidence contract', () => {
  it('accepts sanitized optional evidence through schema and runtime validation', () => {
    const value = observation();
    expect(validator()(value)).toBe(true);
    expect(isCalibrationObservationV103(value)).toBe(true);
  });

  it('rejects malformed evidence and duplicate rule IDs', () => {
    const malformed = { ...observation(), ruleEvidence: [{ ruleId: 'ai/comment-ratio', category: 'ai', aiSpecific: true, severity: 'high' }] };
    expect(validator()(malformed)).toBe(false);
    expect(isCalibrationObservationV103(malformed)).toBe(false);

    const duplicate = { ...observation(), ruleEvidence: [observation().ruleEvidence[0]!, { ...observation().ruleEvidence[0]!, count: 1 }] };
    expect(validator()(duplicate)).toBe(true);
    expect(isCalibrationObservationV103(duplicate)).toBe(false);
  });

  it('accepts zero findings without claiming per-rule evidence', () => {
    const value = { ...observation(), status: 'success_zero' as const, findingsCount: 0 };
    delete (value as { ruleEvidence?: unknown }).ruleEvidence;
    expect(validator()(value)).toBe(true);
    expect(isCalibrationObservationV103(value)).toBe(true);
  });
});
