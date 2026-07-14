import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { assertDistBuilt, cleanupTempDir, createTmpDir, run } from '../helpers/cli';
import { invalidScanExitCode } from '../../src/cli/commands/_shared';

/**
 * These commands have their own report format, but still bootstrap from the
 * canonical runScan pipeline.  An empty/partial bootstrap must not let a
 * command-specific formatter turn synthetic 100/0 values into evidence.
 */
describe('noncanonical command scan validity boundary', () => {
  const dirs: string[] = [];

  beforeAll(assertDistBuilt);
  afterEach(() => {
    while (dirs.length > 0) cleanupTempDir(dirs.pop()!);
  });

  it('preserves the ordinary-empty versus Git-scoped no-op exit distinction', () => {
    const empty = {
      requested: 0,
      analyzed: 0,
      failed: 0,
      skipped: 0,
      scoreValidity: 'not-applicable' as const,
      completionStatus: 'empty' as const,
    };
    expect(invalidScanExitCode(empty, {})).toBe(1);
    expect(invalidScanExitCode(empty, { changed: true })).toBe(0);

    const partial = {
      requested: 2,
      analyzed: 1,
      failed: 1,
      skipped: 0,
      scoreValidity: 'incomplete' as const,
      completionStatus: 'partial' as const,
    };
    expect(invalidScanExitCode(partial, { changed: true })).toBe(1);

    const valid = {
      requested: 1,
      analyzed: 1,
      failed: 0,
      skipped: 0,
      scoreValidity: 'valid' as const,
      completionStatus: 'complete' as const,
    };
    expect(invalidScanExitCode(valid, {})).toBeUndefined();
  });

  it.each([
    'architecture',
    'business-logic',
    'maintenance-cost',
    'patterns',
    'security',
    'test',
    'drift',
    'db',
    'docs',
  ])('fails closed for an empty workspace: %s', async (command) => {
    const workspace = createTmpDir();
    dirs.push(workspace);

    const result = await run([
      command,
      '--workspace', workspace,
    ]);

    expect(result.exitCode, result.stderr).toBe(1);
    const output = `${result.stdout}\n${result.stderr}`;
    expect(output).toMatch(/NO (?:FILES|DATABASE FILES|DOCUMENTATION FILES) ANALY[ZS]ED|scores are not applicable/i);
    expect(output).not.toMatch(/(?:Architecture consistency|Business Logic Coherence|AI Maintenance Cost|Pattern Fragmentation|AI Security Risk|Test quality|Database Health|Documentation Freshness).*\/100/i);
  });

  it.each([
    'architecture',
    'business-logic',
    'maintenance-cost',
    'patterns',
    'security',
    'test',
    'drift',
    'db',
    'docs',
  ])('keeps empty JSON output typed and score-free: %s', async (command) => {
    const workspace = createTmpDir();
    dirs.push(workspace);

    const result = await run([
      command,
      '--workspace', workspace,
      '--format', 'json',
    ]);

    expect(result.exitCode, result.stderr).toBe(1);
    const envelope = JSON.parse(result.stdout) as Record<string, unknown>;
    expect(envelope).toMatchObject({
      completionStatus: 'empty',
      scoreValidity: 'not-applicable',
      requested: 0,
      analyzed: 0,
    });
    expect(envelope).not.toHaveProperty('aiSlopScore');
    expect(envelope).not.toHaveProperty('repositoryHealth');
  });

  it('fails closed for a partial canonical scan before command-specific scoring', async () => {
    const workspace = createTmpDir();
    dirs.push(workspace);
    mkdirSync(join(workspace, 'src'), { recursive: true });
    writeFileSync(join(workspace, 'src', 'valid.ts'), 'export const value = 1;\n');
    writeFileSync(join(workspace, 'src', 'broken.ts'), 'export const = ;\n');

    const result = await run([
      'security',
      '--workspace', workspace,
    ]);

    expect(result.exitCode, result.stderr).toBe(1);
    const output = `${result.stdout}\n${result.stderr}`;
    expect(output).toMatch(/INCOMPLETE SCAN|scores are not valid for gating/i);
    expect(output).not.toMatch(/AI Security Risk:\s*(LOW|MEDIUM|HIGH|CRITICAL)/i);
  });

  it.each([
    ['db', 'src/main.py', 'print("ok")\n', /Database Health:\s*100\/100/i],
    ['docs', 'src/main.ts', 'export const value = 1;\n', /Documentation Freshness:\s*100\/100/i],
  ] as const)('fails closed when %s has no files in its own domain', async (command, relPath, source, scorePattern) => {
    const workspace = createTmpDir();
    dirs.push(workspace);
    mkdirSync(join(workspace, 'src'), { recursive: true });
    writeFileSync(join(workspace, relPath), source);

    const result = await run([
      command,
      '--workspace', workspace,
    ]);

    expect(result.exitCode, result.stderr).toBe(1);
    const output = `${result.stdout}\n${result.stderr}`;
    expect(output).toMatch(/NO (?:DATABASE|DOCUMENTATION) FILES ANALY[ZS]ED|not applicable/i);
    expect(output).not.toMatch(scorePattern);
  });

  it.each(['db', 'docs'] as const)('fails closed for a partial %s scan before domain scoring', async (command) => {
    const workspace = createTmpDir();
    dirs.push(workspace);
    mkdirSync(join(workspace, 'src'), { recursive: true });
    writeFileSync(join(workspace, 'src', 'valid.ts'), 'export const value = 1;\n');
    writeFileSync(join(workspace, 'src', 'broken.ts'), 'export const = ;\n');

    const result = await run([command, '--workspace', workspace]);

    expect(result.exitCode, result.stderr).toBe(1);
    const output = `${result.stdout}\n${result.stderr}`;
    expect(output).toMatch(/INCOMPLETE SCAN|scores are not valid for gating/i);
    expect(output).not.toMatch(/(?:Database Health|Documentation Freshness):\s*\d+\/100/i);
  });

  it.each(['db', 'docs'] as const)('keeps partial %s JSON score-free for the domain axis', async (command) => {
    const workspace = createTmpDir();
    dirs.push(workspace);
    mkdirSync(join(workspace, 'src'), { recursive: true });
    writeFileSync(join(workspace, 'src', 'valid.ts'), 'export const value = 1;\n');
    writeFileSync(join(workspace, 'src', 'broken.ts'), 'export const = ;\n');

    const result = await run([command, '--workspace', workspace, '--format', 'json']);

    expect(result.exitCode, result.stderr).toBe(1);
    const envelope = JSON.parse(result.stdout) as Record<string, unknown>;
    expect(envelope).toMatchObject({ completionStatus: 'partial', scoreValidity: 'incomplete' });
    if (command === 'db') {
      expect(envelope).not.toHaveProperty('dbHealth');
      expect(envelope).not.toHaveProperty('dbDrift');
    } else {
      expect(envelope).not.toHaveProperty('docFreshness');
      expect(envelope).not.toHaveProperty('docDrift');
    }
  });
});
