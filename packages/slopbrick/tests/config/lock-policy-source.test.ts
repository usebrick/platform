import { afterEach, describe, expect, it } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { loadConfig } from '../../src/config/load';

const temporaryProjects: string[] = [];

afterEach(() => {
  for (const projectPath of temporaryProjects.splice(0)) {
    rmSync(projectPath, { force: true, recursive: true });
  }
});

describe('Lock policy provenance', () => {
  it('distinguishes built-in import defaults from a repository declaration', async () => {
    const defaultProject = mkdtempSync(join(tmpdir(), 'slopbrick-lock-default-'));
    const repositoryProject = mkdtempSync(join(tmpdir(), 'slopbrick-lock-policy-'));
    temporaryProjects.push(defaultProject, repositoryProject);
    writeFileSync(
      join(repositoryProject, 'slopbrick.config.mjs'),
      `export default { allowedImports: ['@/approved/'] };\n`,
      'utf8',
    );

    await expect(loadConfig(defaultProject)).resolves.toMatchObject({
      policySources: {
        allowedImports: {
          authority: 'built-in-default',
          source: 'built-in-default#allowedImports',
        },
      },
    });
    await expect(loadConfig(repositoryProject)).resolves.toMatchObject({
      allowedImports: ['@/approved/'],
      policySources: {
        allowedImports: {
          authority: 'repository',
          source: 'slopbrick.config.mjs#allowedImports',
        },
      },
    });
  });
});
