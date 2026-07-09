import { describe, expect, it } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { scanFile } from '../../src/engine/worker';
import { DEFAULT_CONFIG } from '../../src/config/defaults';

describe('C# scan routing', () => {
  it('preserves source rules instead of reporting a parser error', async () => {
    const root = mkdtempSync(join(tmpdir(), 'slopbrick-csharp-'));
    const filePath = join(root, 'Program.cs');
    writeFileSync(filePath, 'void Run() { try { Work(); } catch (Exception) { } }');

    try {
      const result = await scanFile(filePath, {
        ...DEFAULT_CONFIG,
        selfScan: { excludePaths: [] },
      }, undefined, root);

      expect(result.parseError).toBeUndefined();
      expect(result.issues.some((issue) => issue.ruleId === 'cs/empty-catch-block')).toBe(true);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});
