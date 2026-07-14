import { describe, expect, it } from 'vitest';
import { invokeV103Scanner } from '../../src/calibration/v103/scanner-adapter';

const options = { filePath: '/private/local.ts', resultPath: '/private/result.json', timeoutMs: 10, includeRules: ['ai/a'], excludeRules: ['ai/b'] };

describe('v10.3 scanner adapter', () => {
  it('forwards frozen rule filters and preserves sanitized, aggregated rule evidence', async () => {
    let input: unknown;
    const result = await invokeV103Scanner(async (value) => { input = value; return { exitCode: 0, json: { ok: true, issues: [
      { ruleId: 'ai/a', category: 'ai', aiSpecific: true, severity: 'high', filePath: '/private/source.ts', message: 'secret', line: 3, column: 2 },
      { ruleId: 'ai/a', category: 'ai', aiSpecific: true, severity: 'high', filePath: '/private/source.ts', message: 'second', line: 8, column: 2 },
      { ruleId: 'security/x', category: 'security', aiSpecific: false, severity: 'medium', evidence: { snippet: 'secret' } },
    ], parseError: undefined } }; }, options);
    expect(input).toMatchObject({ includeRules: ['ai/a'], excludeRules: ['ai/b'] });
    expect(result).toEqual({ kind: 'success', findingsCount: 3, ruleEvidence: [
      { ruleId: 'ai/a', category: 'ai', aiSpecific: true, severity: 'high', count: 2 },
      { ruleId: 'security/x', category: 'security', aiSpecific: false, severity: 'medium', count: 1 },
    ] });
    expect(JSON.stringify(result)).not.toContain('/private');
    expect(JSON.stringify(result)).not.toContain('secret');
  });

  it('fails closed on malformed or conflicting per-rule evidence', async () => {
    await expect(invokeV103Scanner(async () => ({ exitCode: 0, json: { ok: true, issues: [{ ruleId: 'ai/a', category: 'ai', aiSpecific: true, severity: 'urgent' }] } }), options)).resolves.toEqual({ kind: 'crash' });
    await expect(invokeV103Scanner(async () => ({ exitCode: 0, json: { ok: true, issues: [
      { ruleId: 'ai/a', category: 'ai', aiSpecific: true, severity: 'high' },
      { ruleId: 'ai/a', category: 'security', aiSpecific: true, severity: 'high' },
    ] } }), options)).resolves.toEqual({ kind: 'crash' });
  });

  it('keeps zero evidence explicitly unavailable when the worker has no issues', async () => {
    await expect(invokeV103Scanner(async () => ({ exitCode: 0, json: { ok: true, issues: [] } }), options)).resolves.toEqual({ kind: 'success', findingsCount: 0 });
  });

  it('maps parser output, timeouts, and invalid/nonzero worker responses safely', async () => {
    await expect(invokeV103Scanner(async () => ({ exitCode: 0, json: { ok: true, issues: [], parseError: 'bad parse' } }), options)).resolves.toEqual({ kind: 'parse_failure' });
    await expect(invokeV103Scanner(async () => { const error = Object.assign(new Error('slow'), { code: 'ETIMEDOUT' }); throw error; }, options)).resolves.toEqual({ kind: 'timeout' });
    await expect(invokeV103Scanner(async () => { throw new Error('child timeout after 90ms'); }, options)).resolves.toEqual({ kind: 'timeout' });
    await expect(invokeV103Scanner(async () => ({ exitCode: 1, json: { ok: true, issues: [] } }), options)).resolves.toEqual({ kind: 'crash' });
    await expect(invokeV103Scanner(async () => ({ exitCode: 0, json: { ok: false, issues: [] } }), options)).resolves.toEqual({ kind: 'crash' });
  });
});
