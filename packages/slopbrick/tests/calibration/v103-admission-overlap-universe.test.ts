import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  calibrationAdmissionCanonicalJson,
  type AdmissionNormalizerRegistryV1,
  type AdmissionOverlapUniverseRecordV1,
  type AdmissionOverlapUniverseV1,
} from '@usebrick/core';

import {
  asAdmissionOverlapRecordStream,
  readAdmissionOverlapUniverseJsonl,
} from '../../src/calibration/v103/admission-overlap-universe';

const root = fileURLToPath(new URL('../../../core/tests/fixtures/schema/valid', import.meta.url));

function fixture<T>(name: string): T {
  return JSON.parse(readFileSync(join(root, `${name}.valid.json`), 'utf8')) as T;
}

function validInputs() {
  const registry = fixture<AdmissionNormalizerRegistryV1>('calibration-admission-normalizer-registry');
  const record = fixture<AdmissionOverlapUniverseRecordV1>('calibration-admission-overlap-universe-record');
  const universe = fixture<AdmissionOverlapUniverseV1>('calibration-admission-overlap-universe');
  const bytes = Buffer.from(`${calibrationAdmissionCanonicalJson(record)}\n`, 'utf8');
  return { registry, record, universe, bytes };
}

describe('Task 2A canonical overlap-universe reader', () => {
  it('accepts canonical final-newline JSONL and preserves exact bytes', async () => {
    const { registry, universe, bytes, record } = validInputs();
    const result = await readAdmissionOverlapUniverseJsonl(bytes, universe, registry);
    expect(result.ok).toBe(true);
    expect(Buffer.from(result.bytes)).toEqual(bytes);
    expect(result.records).toEqual([record]);
    expect(result.recordsJsonlSha256).toBe(universe.recordsJsonlSha256);
    expect(result.validation.ok).toBe(true);
  });

  it('accepts chunked async input without changing the stream hash', async () => {
    const { registry, universe, bytes } = validInputs();
    async function* chunks(): AsyncIterable<Uint8Array> {
      yield bytes.subarray(0, 17);
      yield bytes.subarray(17);
    }
    const result = await readAdmissionOverlapUniverseJsonl(chunks(), universe, registry);
    expect(result.ok).toBe(true);
    expect(result.recordsJsonlSha256).toBe(universe.recordsJsonlSha256);
    const streamed = [];
    for await (const record of asAdmissionOverlapRecordStream(result.records)) streamed.push(record);
    expect(streamed).toHaveLength(1);
  });

  it('rejects empty, truncated, blank, noncanonical, and malformed JSONL', async () => {
    const { registry, universe, bytes } = validInputs();
    expect((await readAdmissionOverlapUniverseJsonl(new Uint8Array(), universe, registry)).ok).toBe(false);
    expect((await readAdmissionOverlapUniverseJsonl(bytes.subarray(0, -1), universe, registry)).errors).toContain('universe_jsonl_final_newline_required');
    expect((await readAdmissionOverlapUniverseJsonl(Buffer.concat([bytes, Buffer.from('\n')]), universe, registry)).ok).toBe(false);
    const noncanonical = Buffer.from(` {${calibrationAdmissionCanonicalJson(fixture<Record<string, unknown>>('calibration-admission-overlap-universe-record')).slice(1)}\n`, 'utf8');
    expect((await readAdmissionOverlapUniverseJsonl(noncanonical, universe, registry)).ok).toBe(false);
    expect((await readAdmissionOverlapUniverseJsonl(Buffer.from('{not-json}\n'), universe, registry)).ok).toBe(false);
  });

  it('rejects registry substitution, row substitution, and reordered/summary mismatches', async () => {
    const { registry, universe, bytes, record } = validInputs();
    const substitutedRegistry = { ...registry, registrySha256: 'f'.repeat(64) };
    expect((await readAdmissionOverlapUniverseJsonl(bytes, universe, substitutedRegistry)).ok).toBe(false);
    const substituted = { ...record, candidateUnitId: 'unit-b' };
    const substitutedBytes = Buffer.from(`${calibrationAdmissionCanonicalJson(substituted)}\n`, 'utf8');
    expect((await readAdmissionOverlapUniverseJsonl(substitutedBytes, universe, registry)).ok).toBe(false);
    const mismatchedUniverse = { ...universe, normalizerRegistrySha256: 'f'.repeat(64) };
    expect((await readAdmissionOverlapUniverseJsonl(bytes, mismatchedUniverse, registry)).ok).toBe(false);
  });

  it('rejects invalid UTF-8 and retains a deterministic failure envelope', async () => {
    const { registry, universe } = validInputs();
    const result = await readAdmissionOverlapUniverseJsonl(new Uint8Array([0xff, 0x0a]), universe, registry);
    expect(result.ok).toBe(false);
    expect(result.errors).toContain('universe_jsonl_utf8_invalid');
    expect(result.recordsJsonlSha256).toMatch(/^[a-f0-9]{64}$/);
  });
});
