import { describe, expect, it } from 'vitest';
import { writeFile } from 'node:fs/promises';
import { createV103WorkerInvoker } from '../../src/calibration/v103/worker-invoker';
import { invokeV103Scanner } from '../../src/calibration/v103/scanner-adapter';

describe('v10.3 worker invoker', () => {
  it('forwards filters through the real worker environment and cleans result paths', async () => {
    let env: NodeJS.ProcessEnv | undefined;
    const invoker = createV103WorkerInvoker(async (input) => { env = input.env; await writeFile(input.resultPath, JSON.stringify({ ok: true, issues: [] })); return { exitCode: 0 }; });
    const result = await invokeV103Scanner(invoker, { filePath: '/private/file.ts', resultPath: '/ignored/result.json', timeoutMs: 10, includeRules: ['ai/a'], excludeRules: ['ai/b'] });
    expect(env?.SLOP_INCLUDE_RULES).toBe('["ai/a"]');
    expect(env?.SLOP_EXCLUDE_RULES).toBe('["ai/b"]');
    expect(env?.SLOP_AUDIT_CACHE).toBe('0');
    expect(result).toEqual({ kind: 'success', findingsCount: 0 });
  });

  it('preserves timeout classification and treats missing worker output as crash', async () => {
    const timeoutInvoker = createV103WorkerInvoker(async () => { const error = Object.assign(new Error('slow'), { code: 'ETIMEDOUT' }); throw error; });
    await expect(invokeV103Scanner(timeoutInvoker, { filePath: '/x', resultPath: '/y', timeoutMs: 10 })).resolves.toEqual({ kind: 'timeout' });
    const missingInvoker = createV103WorkerInvoker(async () => ({ exitCode: 0 }));
    await expect(invokeV103Scanner(missingInvoker, { filePath: '/x', resultPath: '/y', timeoutMs: 10 })).resolves.toEqual({ kind: 'crash' });
  });
});
