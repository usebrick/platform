import { describe, expect, it } from 'vitest';
import { invokeV103Scanner } from '../../src/calibration/v103/scanner-adapter';

const options = { filePath: '/private/local.ts', resultPath: '/private/result.json', timeoutMs: 10, includeRules: ['ai/a'], excludeRules: ['ai/b'] };

describe('v10.3 scanner adapter', () => {
  it('forwards frozen rule filters and returns only a findings count', async () => {
    let input: unknown;
    const result = await invokeV103Scanner(async (value) => { input = value; return { exitCode: 0, json: { ok: true, issues: [{ id: 'a' }, { id: 'b' }], parseError: undefined } }; }, options);
    expect(input).toMatchObject({ includeRules: ['ai/a'], excludeRules: ['ai/b'] });
    expect(result).toEqual({ kind: 'success', findingsCount: 2 });
    expect(JSON.stringify(result)).not.toContain('/private');
  });

  it('maps parser output, timeouts, and invalid/nonzero worker responses safely', async () => {
    await expect(invokeV103Scanner(async () => ({ exitCode: 0, json: { ok: true, issues: [], parseError: 'bad parse' } }), options)).resolves.toEqual({ kind: 'parse_failure' });
    await expect(invokeV103Scanner(async () => { const error = Object.assign(new Error('slow'), { code: 'ETIMEDOUT' }); throw error; }, options)).resolves.toEqual({ kind: 'timeout' });
    await expect(invokeV103Scanner(async () => { throw new Error('child timeout after 90ms'); }, options)).resolves.toEqual({ kind: 'timeout' });
    await expect(invokeV103Scanner(async () => ({ exitCode: 1, json: { ok: true, issues: [] } }), options)).resolves.toEqual({ kind: 'crash' });
    await expect(invokeV103Scanner(async () => ({ exitCode: 0, json: { ok: false, issues: [] } }), options)).resolves.toEqual({ kind: 'crash' });
  });
});
