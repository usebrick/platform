import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { assertDistBuilt, cleanupTempDir, createTmpDir, run } from '../helpers/cli';

describe('heatmap output contract', () => {
  const dirs: string[] = [];

  beforeAll(assertDistBuilt);
  afterEach(() => {
    while (dirs.length > 0) cleanupTempDir(dirs.pop()!);
  });

  it('writes a valid heatmap JSON file instead of dropping --json output', async () => {
    const workspace = createTmpDir();
    dirs.push(workspace);
    mkdirSync(join(workspace, 'src'));
    writeFileSync(join(workspace, 'src', 'value.ts'), 'export const value = 1;\n');
    const output = join(workspace, 'heatmap.json');

    const result = await run([
      '--workspace', workspace,
      '--heatmap',
      '--json', output,
      '--quiet',
      '--no-telemetry',
    ]);

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toBe('');
    expect(result.stderr).toBe('');
    expect(existsSync(output)).toBe(true);
    const heatmap = JSON.parse(readFileSync(output, 'utf8')) as unknown;
    expect(Array.isArray(heatmap)).toBe(true);
    expect(heatmap).not.toEqual([]);
  });

  it('writes a score-free not-applicable envelope for an empty heatmap scan', async () => {
    const workspace = createTmpDir();
    dirs.push(workspace);
    const output = join(workspace, 'heatmap-empty.json');

    const result = await run([
      '--workspace', workspace,
      '--heatmap',
      '--json', output,
      '--quiet',
      '--no-telemetry',
    ]);

    expect(result.exitCode).toBe(1);
    expect(result.stdout).toBe('');
    expect(result.stderr).toBe('');
    const envelope = JSON.parse(readFileSync(output, 'utf8')) as Record<string, unknown>;
    expect(envelope).toMatchObject({
      completionStatus: 'empty',
      scoreValidity: 'not-applicable',
      requested: 0,
      analyzed: 0,
    });
    expect(envelope).not.toHaveProperty('aiSlopScore');
    expect(envelope).not.toHaveProperty('repositoryHealth');
  });

  it('writes a score-free incomplete envelope for a partial heatmap scan', async () => {
    const workspace = createTmpDir();
    dirs.push(workspace);
    mkdirSync(join(workspace, 'src'));
    writeFileSync(join(workspace, 'src', 'valid.ts'), 'export const value = 1;\n');
    writeFileSync(join(workspace, 'src', 'broken.ts'), 'export const = ;\n');
    const output = join(workspace, 'heatmap-partial.json');

    const result = await run([
      '--workspace', workspace,
      '--heatmap',
      '--json', output,
      '--quiet',
      '--no-telemetry',
    ]);

    expect(result.exitCode).toBe(1);
    expect(result.stdout).toBe('');
    expect(result.stderr).toBe('');
    const envelope = JSON.parse(readFileSync(output, 'utf8')) as Record<string, unknown>;
    expect(envelope).toMatchObject({
      completionStatus: 'partial',
      scoreValidity: 'incomplete',
      requested: 2,
      analyzed: 1,
      failed: 1,
    });
    expect(envelope).not.toHaveProperty('aiSlopScore');
    expect(envelope).not.toHaveProperty('repositoryHealth');
  });
});
