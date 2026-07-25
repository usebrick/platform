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

  it.each([
    {
      name: 'a non-object Mend section',
      input: { allowedImports: ['@/components/ui/'], mend: true },
      error: 'mend: must be an object',
    },
    {
      name: 'an unknown Mend key',
      input: { allowedImports: ['@/components/ui/'], mend: { inferImports: true } },
      error: 'mend: unknown key "inferImports"',
    },
    {
      name: 'a non-object rewrite map',
      input: { allowedImports: ['@/components/ui/'], mend: { importRewrites: [] } },
      error: 'mend.importRewrites: must be an object',
    },
    {
      name: 'an empty rewrite map',
      input: { allowedImports: ['@/components/ui/'], mend: { importRewrites: {} } },
      error: 'mend.importRewrites: must contain exactly one mapping',
    },
    {
      name: 'more than one rewrite',
      input: {
        allowedImports: ['@/components/ui/'],
        mend: {
          importRewrites: {
            '@/legacy/Button': '@/components/ui/Button',
            '@/legacy/Card': '@/components/ui/Card',
          },
        },
      },
      error: 'mend.importRewrites: must contain exactly one mapping',
    },
    {
      name: 'a rewrite without repository import policy',
      input: { mend: { importRewrites: { '@/legacy/Button': '@/components/ui/Button' } } },
      error: 'mend.importRewrites: requires a non-empty repository allowedImports array',
    },
    {
      name: 'a non-project source alias',
      input: {
        allowedImports: ['@/components/ui/'],
        mend: { importRewrites: { react: '@/components/ui/React' } },
      },
      error: 'mend.importRewrites: source must start with "@/" or "~/"',
    },
    {
      name: 'a source that is already allowed',
      input: {
        allowedImports: ['@/components/ui/'],
        mend: { importRewrites: { '@/components/ui/Button': '@/components/ui/CanonicalButton' } },
      },
      error: 'mend.importRewrites: source must violate allowedImports',
    },
    {
      name: 'a target outside repository policy',
      input: {
        allowedImports: ['@/components/ui/'],
        mend: { importRewrites: { '@/legacy/Button': '@/other/Button' } },
      },
      error: 'mend.importRewrites: target must match allowedImports',
    },
    {
      name: 'an identity rewrite',
      input: {
        allowedImports: ['@/components/ui/'],
        mend: { importRewrites: { '@/legacy/Button': '@/legacy/Button' } },
      },
      error: 'mend.importRewrites: source and target must differ',
    },
    {
      name: 'a target with surrounding whitespace',
      input: {
        allowedImports: ['@/components/ui/'],
        mend: { importRewrites: { '@/legacy/Button': '  @/components/ui/Button' } },
      },
      error: 'mend.importRewrites: target must be a canonical non-empty string',
    },
    {
      name: 'a target containing a quote',
      input: {
        allowedImports: ['@/components/ui/'],
        mend: { importRewrites: { '@/legacy/Button': '@/components/ui/But"ton' } },
      },
      error: 'mend.importRewrites: target must be a canonical non-empty string',
    },
    {
      name: 'a target containing a backslash',
      input: {
        allowedImports: ['@/components/ui/'],
        mend: { importRewrites: { '@/legacy/Button': '@/components/ui/Button\\legacy' } },
      },
      error: 'mend.importRewrites: target must be a canonical non-empty string',
    },
  ])('rejects $name', ({ input, error }) => {
    expect(validateConfig(input).errors.some((message) => message.includes(error))).toBe(true);
  });
});
