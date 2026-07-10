import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const source = readFileSync(
  resolve(process.cwd(), 'src/components/TrustStrip.astro'),
  'utf8',
);

describe('TrustStrip language-support claim', () => {
  it('links its scope claim to the canonical language support matrix', () => {
    const match = source.match(
      /<a\s+[^>]*href="(https:\/\/github\.com\/usebrick\/platform\/blob\/main\/packages\/slopbrick\/docs\/language-support-matrix\.md)"[^>]*>([\s\S]*?)<\/a>/,
    );

    expect(match?.[1]).toBe(
      'https://github.com/usebrick/platform/blob/main/packages/slopbrick/docs/language-support-matrix.md',
    );
    expect(match?.[2].replace(/\s+/g, ' ').trim()).toBe('See the support matrix for scope');
  });
});
