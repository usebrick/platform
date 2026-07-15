import { createHash } from 'node:crypto';
import { mkdtemp, mkdir, readFile, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { preflightAdmissionArtifacts } from '../../src/calibration/v103/admission-artifact-preflight';

const roots: string[] = [];

function sha256(value: Uint8Array): string {
  return createHash('sha256').update(value).digest('hex');
}

async function rootFixture(): Promise<{ readonly root: string; readonly sentinel: string }> {
  const root = await mkdtemp(join(tmpdir(), 'slopbrick-admission-artifact-preflight-'));
  roots.push(root);
  await mkdir(join(root, 'review', 'admission', 'authority', 'proposals'), { recursive: true });
  const sentinel = join(root, 'sentinel.txt');
  await writeFile(sentinel, 'unchanged\n', 'utf8');
  return { root, sentinel };
}

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

describe('explicit admission artifact preflight', () => {
  it('accepts exact contained files and reports their observed commitments without mutation', async () => {
    const fixture = await rootFixture();
    const bytes = Buffer.from('{"proposal":true}\n', 'utf8');
    const relativePath = 'review/admission/authority/proposals/input.json';
    await writeFile(join(fixture.root, relativePath), bytes);

    const result = await preflightAdmissionArtifacts({
      projectRoot: fixture.root,
      artifacts: [{ relativePath, kind: 'input-generation-proposal', sha256: sha256(bytes), bytes: bytes.byteLength }],
    });

    expect(result).toMatchObject({ ok: true, status: 'ready', checked: 1, errors: [] });
    expect(result.artifacts[0]).toMatchObject({ relativePath, kind: 'input-generation-proposal', status: 'present', sha256: sha256(bytes), bytes: bytes.byteLength });
    expect(await readFile(fixture.sentinel, 'utf8')).toBe('unchanged\n');
  });

  it('reports missing and commitment-mismatched inputs separately while checking every explicit item', async () => {
    const fixture = await rootFixture();
    const bytes = Buffer.from('known bytes\n', 'utf8');
    const presentPath = 'review/admission/authority/present.json';
    await writeFile(join(fixture.root, presentPath), bytes);

    const result = await preflightAdmissionArtifacts({
      projectRoot: fixture.root,
      artifacts: [
        { relativePath: presentPath, kind: 'input-generation', sha256: '0'.repeat(64) },
        { relativePath: 'review/admission/authority/missing.json', kind: 'static-generation', bytes: 1 },
      ],
    });

    expect(result.ok).toBe(false);
    expect(result.status).toBe('blocked');
    expect(result.checked).toBe(2);
    expect(result.errors.map((error) => error.code)).toEqual(['invalid_input', 'missing_input']);
    expect(result.artifacts.map((artifact) => artifact.status)).toEqual(['invalid', 'missing']);
    expect(await readFile(fixture.sentinel, 'utf8')).toBe('unchanged\n');
  });

  it('fails closed for traversal, duplicate paths, and malformed commitments before filesystem access', async () => {
    const fixture = await rootFixture();
    const result = await preflightAdmissionArtifacts({
      projectRoot: fixture.root,
      artifacts: [
        { relativePath: 'review/admission/authority/../escape.json', kind: 'input' },
        { relativePath: 'review/admission/authority/duplicate.json', kind: 'input' },
        { relativePath: 'review/admission/authority/duplicate.json', kind: 'input' },
        { relativePath: 'review/admission/authority/bad.json', kind: 'input', sha256: 'not-a-sha' },
      ],
    });

    expect(result.ok).toBe(false);
    expect(result.checked).toBe(0);
    expect(result.errors.filter((error) => error.code === 'request_invalid').length).toBeGreaterThanOrEqual(3);
    expect(await readFile(fixture.sentinel, 'utf8')).toBe('unchanged\n');
  });

  it('rejects symlinked artifact paths without following them', async () => {
    const fixture = await rootFixture();
    const outside = join(fixture.root, 'outside.json');
    await writeFile(outside, 'outside\n', 'utf8');
    const linkedPath = join(fixture.root, 'review', 'admission', 'authority', 'linked.json');
    const canSymlink = await symlink(outside, linkedPath).then(() => true).catch(() => false);
    if (!canSymlink) return;

    const result = await preflightAdmissionArtifacts({
      projectRoot: fixture.root,
      artifacts: [{ relativePath: 'review/admission/authority/linked.json', kind: 'source-generation' }],
    });

    expect(result.ok).toBe(false);
    expect(result.errors[0]).toMatchObject({ code: 'invalid_input', relativePath: 'review/admission/authority/linked.json' });
    expect(result.artifacts[0]?.status).toBe('invalid');
    expect(await readFile(outside, 'utf8')).toBe('outside\n');
  });
});

