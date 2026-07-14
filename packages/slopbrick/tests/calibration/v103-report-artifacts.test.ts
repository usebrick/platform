import { describe, expect, it } from 'vitest';
import {
  buildV103UnavailableArtifactBundle,
  hashV103UpstreamArtifacts,
  isV103UnavailableArtifact,
  renderV103ReportLog,
} from '../../src/calibration/v103/report-artifacts';

const input = {
  runId: 'fixture-run',
  runManifestSha256: 'a'.repeat(64),
  inputArtifacts: {
    observationsSha256: 'b'.repeat(64),
    failuresSha256: 'c'.repeat(64),
    coverageSha256: 'd'.repeat(64),
  },
  reason: 'eligible-cohort-unavailable' as const,
};

describe('v10.3 unavailable report artifacts', () => {
  it('emits deterministic, path-free receipts without metric values', () => {
    const first = buildV103UnavailableArtifactBundle(input);
    const second = buildV103UnavailableArtifactBundle(input);

    expect(first).toEqual(second);
    expect(isV103UnavailableArtifact(first.ruleMetrics)).toBe(true);
    expect(isV103UnavailableArtifact(first.languageMetrics)).toBe(true);
    expect(isV103UnavailableArtifact(first.reportLog)).toBe(true);
    expect(first.reportMarkdown).toContain('Status: `unavailable`');
    expect(first.reportMarkdown).toContain('eligible-cohort-unavailable');
    expect(first.reportMarkdown).not.toContain('/Users/');
    expect(JSON.stringify(first)).not.toMatch(/"(precision|recall|f1|TP|FP|TPR|FPR)"/i);
    expect(renderV103ReportLog(first.reportLog)).toBe(`${JSON.stringify(first.reportLog)}\n`);

    const coverageBlocked = buildV103UnavailableArtifactBundle({
      ...input,
      reason: 'coverage-gate-not-promotable',
    });
    expect(coverageBlocked.reportMarkdown).toContain('coverage-gate-not-promotable');
    expect(coverageBlocked.ruleMetrics.reason).toBe('coverage-gate-not-promotable');
  });

  it('binds receipts to exact upstream bytes and keeps hash output stable', () => {
    const bytes = hashV103UpstreamArtifacts({
      observations: Buffer.from('{"status":"success_zero"}\n'),
      failures: Buffer.from(''),
      coverage: Buffer.from('{"requested":1}\n'),
    });
    expect(bytes).toEqual({
      observationsSha256: expect.stringMatching(/^[a-f0-9]{64}$/),
      failuresSha256: expect.stringMatching(/^[a-f0-9]{64}$/),
      coverageSha256: expect.stringMatching(/^[a-f0-9]{64}$/),
    });
    expect(hashV103UpstreamArtifacts({
      observations: Buffer.from('{"status":"success_zero"}\n'),
      failures: Buffer.from(''),
      coverage: Buffer.from('{"requested":1}\n'),
    })).toEqual(bytes);
  });

  it('rejects forged, incomplete, or path-bearing receipts', () => {
    const receipt = buildV103UnavailableArtifactBundle(input).ruleMetrics;
    expect(isV103UnavailableArtifact({ ...receipt, status: 'valid' })).toBe(false);
    expect(isV103UnavailableArtifact({ ...receipt, reason: 'metrics-ready' })).toBe(false);
    expect(isV103UnavailableArtifact({ ...receipt, runId: '/tmp/fixture-run' })).toBe(false);
    expect(isV103UnavailableArtifact({ ...receipt, unexpected: true })).toBe(false);
    expect(() => buildV103UnavailableArtifactBundle({ ...input, runId: '/tmp/run' })).toThrow('Invalid unavailable-artifact inputs');
  });
});
