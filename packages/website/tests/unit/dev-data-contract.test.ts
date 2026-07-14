import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('website development data contract', () => {
  it('regenerates product facts before starting Astro dev', () => {
    const packageJson = JSON.parse(
      readFileSync(resolve(process.cwd(), 'package.json'), 'utf8'),
    ) as { scripts?: { dev?: string; prebuild?: string } };

    expect(packageJson.scripts?.prebuild).toBe('tsx scripts/prebuild.ts');
    expect(packageJson.scripts?.dev).toMatch(/pnpm prebuild/);
  });
});
