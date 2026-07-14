import { mkdtemp, readFile, readdir, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import {
  DEFAULT_ADMISSION_OVERLAP_POLICY,
  externalSortAdmissionJsonRows,
  type AdmissionBoundedShardReceiptV1,
} from '../../src/calibration/v103/admission-external-sort';
import { canonicalJson } from '../../src/calibration/v103/canonical';

async function workDirectory(): Promise<string> {
  return mkdtemp(join(tmpdir(), 'slopbrick-v103-overlap-scale-'));
}

async function shardRows(
  root: string,
  receipts: readonly AdmissionBoundedShardReceiptV1[],
): Promise<readonly Record<string, unknown>[]> {
  const rows: Record<string, unknown>[] = [];
  for (const receipt of receipts) {
    const text = await readFile(join(root, receipt.relativePath), 'utf8');
    for (const line of text.trimEnd().split('\n')) rows.push(JSON.parse(line) as Record<string, unknown>);
  }
  return rows;
}

describe('Task 2A bounded external sort/shard fixtures', () => {
  it('keeps heavy-tailed and duplicate rows while sorting deterministically by key', async () => {
    const root = await workDirectory();
    const rows = [
      { key: 'tail', value: 'x'.repeat(240) },
      { key: 'dup', value: 'second' },
      { key: 'dup', value: 'first' },
      { key: 'tiny', value: '' },
      { key: 'tail', value: 'x'.repeat(16) },
    ];
    const result = await externalSortAdmissionJsonRows(rows, {
      workDirectory: root,
      key: 'key',
      maxShardBytes: 320,
      workerCount: 1,
    });

    expect(result).toMatchObject({ ok: true, complete: true, incomplete: false, withinAllLimits: true });
    expect(result.rowsRead).toBe(rows.length);
    expect(result.rowsWritten).toBe(rows.length);
    expect(result.resourceReceipt.withinAllLimits).toBe(true);
    expect(result.resourceReceipt.observed.maxShardBytes).toBeLessThanOrEqual(320);
    expect(result.shardReceipts.every((receipt) => receipt.pathBase === 'generation_local')).toBe(true);

    const output = await shardRows(root, result.shardReceipts);
    expect(output).toEqual([
      { key: 'dup', value: 'first' },
      { key: 'dup', value: 'second' },
      { key: 'tail', value: 'x'.repeat(16) },
      { key: 'tail', value: 'x'.repeat(240) },
      { key: 'tiny', value: '' },
    ]);
  });

  it('honours shard byte boundaries and records inclusive first/last keys', async () => {
    const root = await workDirectory();
    const rows = [
      { key: 'a', payload: 'a'.repeat(20) },
      { key: 'b', payload: 'b'.repeat(20) },
      { key: 'c', payload: 'c'.repeat(20) },
      { key: 'd', payload: 'd'.repeat(20) },
    ];
    const lineBytes = Buffer.byteLength(`${canonicalJson(rows[0])}\n`, 'utf8');
    const result = await externalSortAdmissionJsonRows(rows, {
      workDirectory: root,
      key: 'key',
      maxShardBytes: lineBytes * 2,
      workerCount: 1,
    });

    expect(result.complete).toBe(true);
    expect(result.shardReceipts).toHaveLength(2);
    expect(result.shardReceipts.map((receipt) => [receipt.firstKey, receipt.lastKey])).toEqual([
      ['a', 'b'],
      ['c', 'd'],
    ]);
    for (const receipt of result.shardReceipts) {
      expect(receipt.bytes).toBeLessThanOrEqual(lineBytes * 2);
      expect(receipt.relativePath.startsWith('/')).toBe(false);
      expect(receipt.relativePath.includes('..')).toBe(false);
    }
  });

  it('stops before exceeding work bytes and reports an incomplete budget receipt', async () => {
    const root = await workDirectory();
    const rows = [
      { key: 'a', payload: 'a'.repeat(80) },
      { key: 'b', payload: 'b'.repeat(80) },
      { key: 'c', payload: 'c'.repeat(80) },
    ];
    const oneLine = Buffer.byteLength(`${canonicalJson(rows[0])}\n`, 'utf8');
    const result = await externalSortAdmissionJsonRows(rows, {
      workDirectory: root,
      key: 'key',
      maxShardBytes: oneLine,
      maxWorkBytes: oneLine,
      workerCount: 1,
    });

    expect(result.incomplete).toBe(true);
    expect(result.complete).toBe(false);
    expect(result.withinAllLimits).toBe(false);
    expect(result.resourceReceipt.incomplete).toBe(true);
    expect(result.errors).toContain('max_work_bytes_exceeded');
    expect(result.rowsWritten).toBe(1);
    expect(result.bytesWritten).toBe(oneLine);
  });

  it('fails closed when the configured open-file budget cannot open its single writer', async () => {
    const root = await workDirectory();
    const result = await externalSortAdmissionJsonRows([{ key: 'a', value: 1 }], {
      workDirectory: root,
      key: 'key',
      maxOpenFiles: 0,
      workerCount: 1,
    });

    expect(result.incomplete).toBe(true);
    expect(result.withinAllLimits).toBe(false);
    expect(result.errors).toContain('max_open_files_exceeded');
    expect(result.observedMaxOpenFiles).toBe(0);
  });

  it('preserves unknown/orphan files and makes one-worker reruns idempotent without clobbering', async () => {
    const root = await workDirectory();
    const orphanPath = join(root, 'orphan-unknown.bin');
    await writeFile(orphanPath, Buffer.from('keep this unknown file\n', 'utf8'), { flag: 'wx' });
    const rows = [
      { key: 'z', source: 'unknown-row', extra: { keep: true } },
      { key: 'a', source: 'known-row' },
    ];
    const options = { workDirectory: root, key: 'key' as const, maxShardBytes: 128, workerCount: 1 as const };
    const first = await externalSortAdmissionJsonRows(rows, options);
    const second = await externalSortAdmissionJsonRows(rows, options);

    expect(first).toEqual(second);
    expect(await readFile(orphanPath, 'utf8')).toBe('keep this unknown file\n');
    expect((await readdir(root)).sort()).toContain('orphan-unknown.bin');
    expect((await shardRows(root, second.shardReceipts))).toEqual([
      { key: 'a', source: 'known-row' },
      { key: 'z', source: 'unknown-row', extra: { keep: true } },
    ]);
    expect(DEFAULT_ADMISSION_OVERLAP_POLICY.maxShardBytes).toBe(67_108_864);
  });

  it('rejects symlinked roots, traversal prefixes, and conflicting worker declarations', async () => {
    const parent = await workDirectory();
    const target = await workDirectory();
    const link = join(parent, 'linked-work');
    await symlink(target, link, 'dir');
    const throughLink = await externalSortAdmissionJsonRows([{ key: 'a', value: 1 }], {
      workDirectory: link,
      key: 'key',
      workerCount: 1,
    });
    expect(throughLink.incomplete).toBe(true);
    expect(throughLink.errors).toContain('work_directory_symlink_component');

    const root = await workDirectory();
    const traversal = await externalSortAdmissionJsonRows([{ key: 'a', value: 1 }], {
      workDirectory: root,
      key: 'key',
      filePrefix: '..',
      workerCount: 1,
    });
    expect(traversal.incomplete).toBe(true);
    expect(traversal.errors).toContain('file_prefix_invalid');

    const conflict = await externalSortAdmissionJsonRows([{ key: 'a', value: 1 }], {
      workDirectory: root,
      key: 'key',
      workerCount: 1,
      workers: 2,
    });
    expect(conflict.incomplete).toBe(true);
    expect(conflict.errors).toContain('worker_count_conflict');
  });
});
