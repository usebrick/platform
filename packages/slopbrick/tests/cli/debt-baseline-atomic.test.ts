import { afterEach, describe, expect, it, vi } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const { renameSyncSpy, unlinkSyncSpy, writeFileSyncSpy } = vi.hoisted(() => ({
  renameSyncSpy: vi.fn(),
  unlinkSyncSpy: vi.fn(),
  writeFileSyncSpy: vi.fn(),
}));

vi.mock('node:fs', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:fs')>();
  return {
    ...actual,
    renameSync: renameSyncSpy,
    unlinkSync: unlinkSyncSpy,
    writeFileSync: writeFileSyncSpy,
  };
});

import {
  buildDebtBaseline,
  debtBaselinePath,
  saveDebtBaseline,
} from '../../src/cli/report/debt-baseline';
import type { ProjectReport } from '../../src/types';

const temporaryProjects: string[] = [];

afterEach(() => {
  vi.clearAllMocks();
  for (const projectPath of temporaryProjects.splice(0)) {
    rmSync(projectPath, { force: true, recursive: true });
  }
});

describe('atomic debt-baseline persistence', () => {
  it('removes the private staged file when atomic replacement fails', () => {
    const projectPath = mkdtempSync(join(tmpdir(), 'slopbrick-debt-baseline-'));
    temporaryProjects.push(projectPath);
    const baseline = buildDebtBaseline(
      { issues: [] } as ProjectReport,
      projectPath,
      'config-a',
      'commit-a',
    );
    const replacementFailure = new Error('rename failed');
    renameSyncSpy.mockImplementationOnce(() => {
      throw replacementFailure;
    });

    expect(() => saveDebtBaseline(projectPath, baseline)).toThrow(replacementFailure);

    const finalPath = debtBaselinePath(projectPath);
    const [temporaryPath, , writeOptions] = writeFileSyncSpy.mock.calls[0] ?? [];
    expect(temporaryPath).toEqual(expect.stringMatching(
      new RegExp(`^${finalPath.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\..+\\.tmp$`),
    ));
    expect(temporaryPath).not.toBe(finalPath);
    expect(writeOptions).toMatchObject({ encoding: 'utf8', flag: 'wx', mode: 0o600 });
    expect(renameSyncSpy).toHaveBeenCalledWith(temporaryPath, finalPath);
    expect(unlinkSyncSpy).toHaveBeenCalledWith(temporaryPath);
    expect(writeFileSyncSpy.mock.invocationCallOrder[0]).toBeLessThan(
      renameSyncSpy.mock.invocationCallOrder[0] ?? Number.POSITIVE_INFINITY,
    );
    expect(renameSyncSpy.mock.invocationCallOrder[0]).toBeLessThan(
      unlinkSyncSpy.mock.invocationCallOrder[0] ?? Number.POSITIVE_INFINITY,
    );
  });
});
