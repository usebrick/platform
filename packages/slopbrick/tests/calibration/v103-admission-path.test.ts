import { mkdtemp, mkdir, realpath, symlink, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

import { requireContainedAdmissionPath } from '../../src/calibration/v103/admission-path';

const roots: string[] = [];

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

describe('admission input path containment', () => {
  it('resolves an in-root file through a canonical path', async () => {
    const root = await mkdtemp(join(tmpdir(), 'slopbrick-admission-path-'));
    roots.push(root);
    await mkdir(join(root, 'inputs'));
    await writeFile(join(root, 'inputs', 'register.json'), '{}');
    const resolved = await requireContainedAdmissionPath(root, 'inputs/register.json');
    expect(resolved).toBe(join(await realpath(root), 'inputs', 'register.json'));
  });

  it('rejects a symlinked input directory that resolves outside the root', async () => {
    const root = await mkdtemp(join(tmpdir(), 'slopbrick-admission-path-'));
    const outside = await mkdtemp(join(tmpdir(), 'slopbrick-admission-outside-'));
    roots.push(root, outside);
    await writeFile(join(outside, 'register.json'), '{}');
    await symlink(outside, join(root, 'inputs'));
    await expect(requireContainedAdmissionPath(root, 'inputs/register.json')).rejects.toThrow('escapes root');
  });
});
