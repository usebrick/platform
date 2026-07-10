import { describe, expect, it } from 'vitest';
import { scanSelectedV103 } from '../../src/calibration/v103/selected-scanner';

describe('v10.3 selected scanner', () => {
  it('passes an internal resolved path only to the invoker and returns path-free classification', async () => {
    let path: string | undefined;
    const result = await scanSelectedV103({ repositoryId: 'repo', commitSha: 'a'.repeat(40), normalizedPath: 'src/a.ts', contentSha256: 'b'.repeat(64) }, {}, {
      timeoutMs: 10, includeRules: ['ai/a'], excludeRules: ['ai/b'],
      resolver: async () => ({ normalizedPath: 'src/a.ts', localPath: '/private/checkout/src/a.ts', bytes: Buffer.from('x') }),
      invoker: async (input) => { path = input.filePath; expect(input.includeRules).toEqual(['ai/a']); return { exitCode: 0, json: { ok: true, issues: [] } }; },
    });
    expect(path).toBe('/private/checkout/src/a.ts');
    expect(result).toEqual({ kind: 'success', findingsCount: 0 });
    expect(JSON.stringify(result)).not.toContain('/private');
  });
});
