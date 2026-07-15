import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

import {
  admissionShingleSetSha256,
  ADMISSION_LEXICAL_RUNTIME_BINDINGS,
  computeAdmissionShingles,
  normalizeAdmissionBytes,
  tokenizeAdmissionSource,
} from '../../src/calibration/v103/admission-normalizers';
import { calibrationAdmissionNormalizerRegistrySha256 } from '@usebrick/core';

const root = fileURLToPath(new URL('../../../core/tests/fixtures/schema/valid', import.meta.url));

function fixture<T>(name: string): T {
  return JSON.parse(readFileSync(join(root, `${name}.valid.json`), 'utf8')) as T;
}

function boundRegistry(): Record<string, unknown> {
  const registry = fixture<Record<string, unknown>>('calibration-admission-normalizer-registry');
  const entry = (registry.entries as Array<Record<string, unknown>>)[0]!;
  const runtime = ADMISSION_LEXICAL_RUNTIME_BINDINGS[0];
  const bound = {
    ...registry,
    entries: [{ ...entry, implementationSha256: runtime.implementationSha256, fixturesSha256: runtime.fixturesSha256 }],
  };
  return { ...bound, registrySha256: calibrationAdmissionNormalizerRegistrySha256(bound) };
}

describe('Task 2A admission normalizers', () => {
  it('tokenizes deterministically while removing comments and literal bodies', () => {
    const source = 'const x = 1; // comment\nconst y = "different"; /* block */';
    expect(tokenizeAdmissionSource(source)).toEqual([
      'const', 'x', '=', '<number>', ';', 'const', 'y', '=', '<string>', ';',
    ]);
    expect(tokenizeAdmissionSource(source)).toEqual(tokenizeAdmissionSource(source));
  });

  it('computes sorted unique full SHA-256 five-token shingles', () => {
    const shingles = computeAdmissionShingles(['a', 'b', 'c', 'd', 'e', 'a']);
    expect(shingles).toHaveLength(2);
    expect(shingles).toEqual([...shingles].sort());
    expect(shingles.every((value) => /^[a-f0-9]{64}$/.test(value))).toBe(true);
    expect(admissionShingleSetSha256(shingles)).toBe(admissionShingleSetSha256([...shingles].reverse()));
    expect(computeAdmissionShingles(['a', 'b', 'c', 'd'])).toEqual([]);
  });

  it('covers valid UTF-8 source and binds the registry normalizer', () => {
    const registry = boundRegistry();
    const result = normalizeAdmissionBytes('TypeScript', Buffer.from('const x = 1; const y = 2;', 'utf8'), registry);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.status).toBe('covered');
    expect(result.normalizerId).toBe('normalizer-typescript-v1');
    expect(result.contentBytes).toBe(25);
    expect(result.shingleCount).toBe(result.shingles.length);
    expect(result.shingleSetSha256).toMatch(/^[a-f0-9]{64}$/);
  });

  it('allows an explicitly reviewed language to bind the shared lexical runtime', () => {
    const source = fixture<Record<string, unknown>>('calibration-admission-normalizer-registry');
    const entry = (source.entries as Array<Record<string, unknown>>)[0]!;
    const runtime = ADMISSION_LEXICAL_RUNTIME_BINDINGS.find((candidate) => candidate.normalizerId === 'normalizer-lexical-code-v1')!;
    const base = {
      ...source,
      entries: [{
        ...entry,
        language: 'Python',
        normalizerId: runtime.normalizerId,
        implementationSha256: runtime.implementationSha256,
        fixturesSha256: runtime.fixturesSha256,
      }],
    };
    const registry = { ...base, registrySha256: calibrationAdmissionNormalizerRegistrySha256(base) };
    const result = normalizeAdmissionBytes('Python', Buffer.from('def answer():\n    return 42\n', 'utf8'), registry);
    expect(result).toMatchObject({ ok: true, status: 'covered', normalizerId: 'normalizer-lexical-code-v1' });
  });

  it('reports unsupported languages and invalid registries without treating them as no overlap', () => {
    const registry = boundRegistry();
    const unsupported = normalizeAdmissionBytes('Python', Buffer.from('print(1)', 'utf8'), registry);
    expect(unsupported).toMatchObject({ ok: false, status: 'unsupported', normalizerId: 'normalizer-unsupported-v1' });
    const substitutedEntry = { ...(registry.entries as Array<Record<string, unknown>>)[0], normalizerId: 'normalizer-substituted-v9' };
    const substitutedRegistry = { ...registry, entries: [substitutedEntry] };
    const substituted = { ...substitutedRegistry, registrySha256: calibrationAdmissionNormalizerRegistrySha256(substitutedRegistry) };
    const invalidRegistry = normalizeAdmissionBytes('TypeScript', Buffer.from('const x = 1;', 'utf8'), substituted);
    expect(invalidRegistry).toMatchObject({ ok: false, status: 'unreadable' });
  });

  it('rejects invalid UTF-8 as unreadable and handles short bodies without inventing shingles', () => {
    const registry = boundRegistry();
    const invalid = normalizeAdmissionBytes('TypeScript', new Uint8Array([0xff, 0xfe]), registry);
    expect(invalid).toMatchObject({ ok: false, status: 'unreadable', errors: ['utf8_invalid'] });
    const short = normalizeAdmissionBytes('TypeScript', Buffer.from('let x;', 'utf8'), registry);
    expect(short.ok).toBe(true);
    if (short.ok) expect(short.shingles).toEqual([]);
  });
});
