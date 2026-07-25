import { afterEach, describe, expect, it } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { loadConfig } from '../../src/config/load';
import { getExplicitRuleOverrides } from '../../src/config/rule-override-provenance';

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
      `export default {
  allowedImports: ['@/approved/'],
  rules: { 'component/giant-component': 'high' },
};\n`,
      'utf8',
    );

    const defaultConfig = await loadConfig(defaultProject);
    const repositoryConfig = await loadConfig(repositoryProject);

    expect(defaultConfig).toMatchObject({
      policySources: {
        allowedImports: {
          authority: 'built-in-default',
          source: 'built-in-default#allowedImports',
        },
      },
    });
    expect(repositoryConfig).toMatchObject({
      allowedImports: ['@/approved/'],
      policySources: {
        allowedImports: {
          authority: 'repository',
          source: 'slopbrick.config.mjs#allowedImports',
        },
      },
    });
    expect(getExplicitRuleOverrides(repositoryConfig)).toEqual({
      'component/giant-component': 'high',
    });
  });
});
