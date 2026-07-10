import { describe, expect, it } from 'vitest';
import { verifyV103Observations } from '../../src/calibration/v103/observations';

const expected = { verified_ai: ['sbf-a'], verified_human: ['sbf-h'] };
const observations = [
  { version: 'v10.3', runId: 'smoke-001', fileId: 'sbf-a', repositoryId:'ai-repo', familyId:'ai-family', language: 'typescript', polarity: 'verified_ai', status: 'success_zero', findingsCount: 0 },
  { version: 'v10.3', runId: 'smoke-001', fileId: 'sbf-h', repositoryId:'human-repo', familyId:'human-family', language: 'typescript', polarity: 'verified_human', status: 'timeout', failureCode: 'deadline' },
];
const failures = [{ version: 'v10.3', runId: 'smoke-001', fileId: 'sbf-h', status: 'timeout', failureCode: 'deadline' }];
const coverage = { version: 'v10.3', runId: 'smoke-001', requested: 2, successful: 1, excluded: 0, failed: 1, strata: [
  { language: 'typescript', polarity: 'verified_ai', requested: 1, successful: 1, excluded: 0, failed: 0 },
  { language: 'typescript', polarity: 'verified_human', requested: 1, successful: 0, excluded: 0, failed: 1 },
], repositories:[{repositoryId:'ai-repo',requested:1,successful:1,excluded:0,failed:0},{repositoryId:'human-repo',requested:1,successful:0,excluded:0,failed:1}], families:[{familyId:'ai-family',requested:1,successful:1,excluded:0,failed:0},{familyId:'human-family',requested:1,successful:0,excluded:0,failed:1}] };

describe('v10.3 observation verifier', () => {
  it('accepts one terminal observation per expected ID and derived failure/coverage artifacts', () => {
    expect(verifyV103Observations({ runId: 'smoke-001', expectedFileIdsByPolarity: expected }, observations, failures, coverage)).toMatchObject({ ok: true, diagnosticOnly: true });
  });
  it('fails closed for duplicate, missing, unexpected, stale, or non-derived failures', () => {
    expect(verifyV103Observations({ runId: 'smoke-001', expectedFileIdsByPolarity: expected }, [...observations, observations[0]!], failures, coverage)).toMatchObject({ ok: false });
    expect(verifyV103Observations({ runId: 'smoke-001', expectedFileIdsByPolarity: expected }, observations.slice(0, 1), [], coverage)).toMatchObject({ ok: false });
    expect(verifyV103Observations({ runId: 'smoke-002', expectedFileIdsByPolarity: expected }, observations, failures, coverage)).toMatchObject({ ok: false });
    expect(verifyV103Observations({ runId: 'smoke-001', expectedFileIdsByPolarity: expected }, observations, [], coverage)).toMatchObject({ ok: false });
    expect(verifyV103Observations({ runId: 'smoke-001', expectedFileIdsByPolarity: expected }, observations, failures, { ...coverage, strata: [coverage.strata[0]!, coverage.strata[0]!] })).toMatchObject({ ok: false });
  });
});
