import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  calibrationAdmissionCanonicalJson,
  calibrationAdmissionOverlapUniverseRecordSha256,
  calibrationAdmissionOverlapUniverseSha256,
  type AdmissionNormalizerRegistryV1,
  type AdmissionOverlapUniverseRecordV1,
  type AdmissionOverlapUniverseV1,
} from '@usebrick/core';
import { openAdmissionOverlapUniverseStream } from '../../src/calibration/v103/admission-overlap-stream';

const root = fileURLToPath(new URL('../../../core/tests/fixtures/schema/valid', import.meta.url));
function fixture<T>(name: string): T { return JSON.parse(readFileSync(join(root, `${name}.valid.json`), 'utf8')) as T; }
function sha256(bytes: Uint8Array): string { return createHash('sha256').update(bytes).digest('hex'); }

function inputs() {
  const record = fixture<AdmissionOverlapUniverseRecordV1>('calibration-admission-overlap-universe-record');
  const universe = fixture<AdmissionOverlapUniverseV1>('calibration-admission-overlap-universe');
  const registry = fixture<AdmissionNormalizerRegistryV1>('calibration-admission-normalizer-registry');
  const bytes = Buffer.from(`${calibrationAdmissionCanonicalJson(record)}\n`, 'utf8');
  return { record, universe, registry, bytes };
}

describe('bounded incremental overlap-universe stream', () => {
  it('hashes exact chunked bytes and releases one record at a time', async () => {
    const { bytes, record, universe, registry } = inputs();
    async function* chunks(): AsyncIterable<Uint8Array> {
      yield bytes.subarray(0, 3);
      yield bytes.subarray(3, 19);
      yield bytes.subarray(19);
    }
    const stream = openAdmissionOverlapUniverseStream(chunks(), universe, registry);
    const records: AdmissionOverlapUniverseRecordV1[] = [];
    for await (const value of stream.records) records.push(value);
    const stats = await stream.complete;
    expect(records).toEqual([record]);
    expect(stats.ok).toBe(true);
    expect(stats.recordsJsonlSha256).toBe(universe.recordsJsonlSha256);
    expect(stats.bytesRead).toBe(bytes.byteLength);
    expect(stats.recordCount).toBe(1);
  });

  it('fails closed for invalid UTF-8, truncation, and a lowered unit bound', async () => {
    const { universe, registry, bytes } = inputs();
    const invalid = openAdmissionOverlapUniverseStream(new Uint8Array([0xff, 0x0a]), universe, registry);
    for await (const _value of invalid.records) { /* consume */ }
    expect((await invalid.complete).errors).toContain('universe_jsonl_utf8_invalid');

    const truncated = openAdmissionOverlapUniverseStream(bytes.subarray(0, -1), universe, registry);
    for await (const _value of truncated.records) { /* consume */ }
    expect((await truncated.complete).errors).toContain('universe_jsonl_final_newline_required');

    const limited = openAdmissionOverlapUniverseStream(bytes, universe, registry, { maxUnitBytes: 8 });
    for await (const _value of limited.records) { /* consume */ }
    expect((await limited.complete).ok).toBe(false);
    expect((await limited.complete).errors.some((error) => error.includes('unit'))).toBe(true);
  });

  it('does not treat an early consumer return as complete coverage', async () => {
    const { bytes, universe, registry } = inputs();
    const stream = openAdmissionOverlapUniverseStream(bytes, universe, registry);
    for await (const _value of stream.records) break;
    const stats = await stream.complete;
    expect(stats.ok).toBe(false);
    expect(stats.errors).toContain('stream_not_fully_consumed');
  });

  it('accepts an unreadable row that retains its registered language normalizer', async () => {
    const { record, universe, registry } = inputs();
    const unreadableBase: Record<string, unknown> = {
      ...record,
      normalizationStatus: 'unreadable',
    };
    delete unreadableBase.recordSha256;
    delete unreadableBase.shingleSetSha256;
    delete unreadableBase.shingleCount;
    const unreadableRecord = {
      ...unreadableBase,
      recordSha256: calibrationAdmissionOverlapUniverseRecordSha256(unreadableBase),
    } as AdmissionOverlapUniverseRecordV1;
    const bytes = Buffer.from(`${calibrationAdmissionCanonicalJson(unreadableRecord)}\n`, 'utf8');
    const universeBase = {
      ...universe,
      recordsJsonlSha256: sha256(bytes),
      covered: 0,
      unreadable: 1,
      unresolvedCandidateUnitIds: [unreadableRecord.candidateUnitId],
    };
    const unreadableUniverse = {
      ...universeBase,
      universeSha256: calibrationAdmissionOverlapUniverseSha256(universeBase),
    } as AdmissionOverlapUniverseV1;
    const stream = openAdmissionOverlapUniverseStream(bytes, unreadableUniverse, registry);
    const records: AdmissionOverlapUniverseRecordV1[] = [];
    for await (const value of stream.records) records.push(value);
    const stats = await stream.complete;
    expect(records).toEqual([unreadableRecord]);
    expect(stats.ok).toBe(true);
    expect(stats.unreadable).toBe(1);
    expect(stats.unresolvedCandidateUnitIds).toEqual([unreadableRecord.candidateUnitId]);
  });

  it('rejects an unsupported row that reuses a normalizer registered for another language', async () => {
    const { record, universe, registry } = inputs();
    const unsupportedBase: Record<string, unknown> = {
      ...record,
      language: 'Unknown',
      normalizationStatus: 'unsupported',
    };
    delete unsupportedBase.shingleSetSha256;
    delete unsupportedBase.shingleCount;
    const unsupportedRecord = {
      ...unsupportedBase,
      recordSha256: calibrationAdmissionOverlapUniverseRecordSha256(unsupportedBase),
    } as AdmissionOverlapUniverseRecordV1;
    const bytes = Buffer.from(`${calibrationAdmissionCanonicalJson(unsupportedRecord)}\n`, 'utf8');
    const universeBase = {
      ...universe,
      recordsJsonlSha256: sha256(bytes),
      covered: 0,
      unsupported: 1,
      unresolvedCandidateUnitIds: [unsupportedRecord.candidateUnitId],
    };
    const unsupportedUniverse = {
      ...universeBase,
      universeSha256: calibrationAdmissionOverlapUniverseSha256(universeBase),
    } as AdmissionOverlapUniverseV1;
    const stream = openAdmissionOverlapUniverseStream(bytes, unsupportedUniverse, registry);
    for await (const _value of stream.records) { /* consume */ }
    const stats = await stream.complete;
    expect(stats.ok).toBe(false);
    expect(stats.errors).toContain('line 1: unresolved_normalizer_binding');
  });
});
