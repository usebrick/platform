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

  it('preserves the release binding at the resolver boundary while scanner artifacts remain path-free', async () => {
    const binding = { kind: 'release_archive' as const, assetSha256: 'b'.repeat(64), extractionPolicy: 'safe-zip-v1' as const };
    let seen: unknown;
    const result = await scanSelectedV103({ repositoryId: 'repo', commitSha: 'a'.repeat(40), materialization: binding, normalizedPath: 'src/a.ts', contentSha256: 'b'.repeat(64) }, {}, {
      timeoutMs: 10, includeRules: [], excludeRules: [],
      resolver: async (record) => { seen = record.materialization; return { normalizedPath: record.normalizedPath, localPath: '/private/checkout/src/a.ts', bytes: Buffer.from('x') }; },
      invoker: async () => ({ exitCode: 0, json: { ok: true, issues: [] } }),
    });
    expect(seen).toEqual(binding);
    expect(result).toEqual({ kind: 'success', findingsCount: 0 });
    expect(JSON.stringify(result)).not.toContain('/private');
  });

  it('fails closed if an injected resolver returns a different normalized path', async () => {
    await expect(scanSelectedV103({ repositoryId: 'repo', commitSha: 'a'.repeat(40), normalizedPath: 'src/a.ts', contentSha256: 'b'.repeat(64) }, {}, {
      timeoutMs: 10, includeRules: [], excludeRules: [],
      resolver: async () => ({ normalizedPath: 'src/other.ts', localPath: '/private/checkout/src/other.ts', bytes: Buffer.from('x') }),
      invoker: async () => ({ exitCode: 0, json: { ok: true, issues: [] } }),
    })).rejects.toThrow('does not match the selection path');
  });

  it('turns an oversized resolved file into a counted exclusion without invoking the scanner', async () => {
    let invoked = false;
    await expect(scanSelectedV103({ repositoryId: 'repo', commitSha: 'a'.repeat(40), normalizedPath: 'src/a.ts', contentSha256: 'b'.repeat(64) }, {}, {
      timeoutMs: 10, maxFileBytes: 3, includeRules: [], excludeRules: [],
      resolver: async () => ({ normalizedPath: 'src/a.ts', localPath: '/private/checkout/src/a.ts', bytes: Buffer.from('1234') }),
      invoker: async () => { invoked = true; return { exitCode: 0, json: { ok: true, issues: [] } }; },
    })).resolves.toEqual({ kind: 'excluded', exclusionReason: 'max_file_bytes' });
    expect(invoked).toBe(false);
  });
});
