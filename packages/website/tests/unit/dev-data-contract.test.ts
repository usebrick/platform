import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('website development data contract', () => {
  it('regenerates product facts before starting Astro dev', () => {
    const packageJson = JSON.parse(
      readFileSync(resolve(process.cwd(), 'package.json'), 'utf8'),
    ) as { scripts?: { dev?: string; prebuild?: string } };

    expect(packageJson.scripts?.prebuild).toBe('node --import tsx scripts/prebuild.ts');
    expect(packageJson.scripts?.dev).toMatch(/pnpm prebuild/);
  });

  it('describes the UseBrick coherence site without changing its package version', () => {
    const packageJson = JSON.parse(
      readFileSync(resolve(process.cwd(), 'package.json'), 'utf8'),
    ) as { version?: string; description?: string };

    expect(packageJson.version).toBe('0.14.5');
    expect(packageJson.description).toContain('UseBrick coherence product site');
    expect(packageJson.description).toContain('SlopBrick-first onboarding');
    expect(packageJson.description).toContain('verified facts');
  });
});
