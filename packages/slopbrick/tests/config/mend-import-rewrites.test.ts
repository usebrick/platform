import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { loadConfig } from '../../src/config/load';
import { validateConfig } from '../../src/config/validation';

describe('mend.importRewrites configuration', () => {
  it('admits and preserves an exact repository-owned import rewrite', async () => {
    const rewrite = {
      '@/legacy/Button': '@/components/ui/Button',
    };
    const input = {
      allowedImports: ['@/components/ui/'],
      mend: { importRewrites: rewrite },
    };

    expect(validateConfig(input)).toEqual({
      valid: true,
      errors: [],
      warnings: [],
    });

    const workspace = mkdtempSync(join(tmpdir(), 'slopbrick-mend-config-'));
    try {
      writeFileSync(
        join(workspace, 'slopbrick.config.mjs'),
        `export default ${JSON.stringify(input)};\n`,
        'utf8',
      );

      const config = await loadConfig(workspace);
      expect(config.mend?.importRewrites).toEqual(rewrite);
    } finally {
      rmSync(workspace, { recursive: true, force: true });
    }
  });
});
