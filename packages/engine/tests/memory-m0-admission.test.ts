import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  MEMORY_M0_PROFILE,
  MEMORY_M0_REGISTRY,
  type MemoryM0Request,
} from '../../core/src/memory-m0';
import {
  MEMORY_M0_SLICE_A_LIMITS,
  prepareMemoryM0Request,
} from '../src/memory-m0';

const encoder = new TextEncoder();
const objectBytes = encoder.encode('{}');

function root(bytes: Uint8Array = objectBytes): MemoryM0Request['sources'][number] {
  return { kind: 'root-package-json', path: 'package.json', bytes };
}

function packageManifest(
  path: string,
  bytes: Uint8Array = objectBytes,
): MemoryM0Request['sources'][number] {
  return { kind: 'package-manifest', path, bytes };
}

function request(sources: MemoryM0Request['sources']): MemoryM0Request {
  return { profile: MEMORY_M0_PROFILE, sources };
}

describe('MemoryBrick M0 Slice A admission', () => {
  it('uses accepted registry caps without adding an I/O dependency', () => {
    const moduleNames = [
      'memory-m0.ts',
      'memory-m0-json.ts',
      'memory-m0-json-tokenizer.ts',
    ];
    const sources = moduleNames.map((name) => (
      readFileSync(new URL(`../src/${name}`, import.meta.url), 'utf8')
    ));
    const importSpecifiers = sources.flatMap((source) => Array.from(
      source.matchAll(/\b(?:import|export)\s+(?:[\s\S]*?\s+from\s+)?['"]([^'"]+)['"]/g),
      (match) => match[1] ?? '',
    ));

    expect(MEMORY_M0_SLICE_A_LIMITS).toEqual({
      maxSources: MEMORY_M0_REGISTRY.caps.maxSources,
      maxPackageManifests: MEMORY_M0_REGISTRY.caps.maxPackageManifests,
      maxSourceBytes: MEMORY_M0_REGISTRY.caps.maxSourceBytes,
      maxTotalSourceBytes: MEMORY_M0_REGISTRY.caps.maxTotalSourceBytes,
      maxJsonDepth: MEMORY_M0_REGISTRY.caps.maxJsonDepth,
      maxJsonTokens: MEMORY_M0_REGISTRY.caps.maxJsonTokens,
    });
    expect(importSpecifiers.every((specifier) => specifier.startsWith('.'))).toBe(true);
    expect(sources.join('\n')).not.toMatch(/\b(?:process\.|console\.)/);
  });

  it('rejects a mismatched private profile before source admission', () => {
    const mismatched = { profile: 'memory-m0-v1', sources: [root()] };
    const result = Reflect.apply(prepareMemoryM0Request, undefined, [mismatched]);

    expect(result).toMatchObject({
      ok: false,
      error: 'invalid-profile',
      reason: 'profile',
    });
  });

  it('admits one root registration and defensively copies its exact byte range', () => {
    const callerBytes = encoder.encode('{"name":"root"}');
    const originalBytes = [...callerBytes];
    const result = prepareMemoryM0Request(request([root(callerBytes)]));

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.sources).toHaveLength(1);
    expect([...result.sources[0]!.bytes]).toEqual(originalBytes);
    expect(result.sources[0]!.bytes).not.toBe(callerBytes);

    callerBytes.fill(0);
    expect([...result.sources[0]!.bytes]).toEqual(originalBytes);
  });

  it('requires exactly one root and rejects duplicate registration paths', () => {
    expect(prepareMemoryM0Request(request([packageManifest('apps/a/package.json')]))).toMatchObject({
      ok: false,
      error: 'invalid-registration',
      reason: 'root-count',
    });
    expect(prepareMemoryM0Request(request([
      root(),
      packageManifest('apps/a/package.json'),
      packageManifest('apps/a/package.json'),
    ]))).toMatchObject({
      ok: false,
      error: 'invalid-registration',
      reason: 'duplicate-path',
      sourcePath: 'apps/a/package.json',
    });
  });

  it('accepts 64 package manifests and rejects the 65th before copying', () => {
    const packages = Array.from({ length: 64 }, (_, index) => (
      packageManifest(`packages/p${index}/package.json`)
    ));

    expect(prepareMemoryM0Request(request([root(), ...packages]))).toMatchObject({ ok: true });
    expect(prepareMemoryM0Request(request([
      root(),
      ...packages,
      packageManifest('packages/overflow/package.json'),
    ]))).toMatchObject({
      ok: false,
      error: 'source-limit',
      reason: 'source-count',
    });
  });

  it.each([
    'a/package.json',
    '0/package.json',
    '_/package.json',
    '@/package.json',
    '@scope/pkg/package.json',
    `${'a'.repeat(64)}/package.json`,
    `${'a'.repeat(64)}/${'b'.repeat(64)}/${'c'.repeat(64)}/${'d'.repeat(48)}/package.json`,
  ])('accepts package-manifest path %s', (path) => {
    expect(prepareMemoryM0Request(request([root(), packageManifest(path)]))).toMatchObject({ ok: true });
  });

  it.each([
    'package.json',
    '/a/package.json',
    'A/package.json',
    '.a/package.json',
    '-a/package.json',
    'a//package.json',
    'a/../package.json',
    'a\\package.json',
    `${'a'.repeat(65)}/package.json`,
    `${'a'.repeat(64)}/${'b'.repeat(64)}/${'c'.repeat(64)}/${'d'.repeat(49)}/package.json`,
    'é/package.json',
  ])('rejects package-manifest path %s', (path) => {
    expect(prepareMemoryM0Request(request([root(), packageManifest(path)]))).toMatchObject({
      ok: false,
      error: 'invalid-registration',
      reason: 'package-path',
      sourcePath: path,
    });
  });

  it('checks exact per-source and aggregate byte caps before producing copies', () => {
    expect(prepareMemoryM0Request(request([root(new Uint8Array(262_144))]))).toMatchObject({ ok: true });
    expect(prepareMemoryM0Request(request([root(new Uint8Array(262_145))]))).toMatchObject({
      ok: false,
      error: 'source-limit',
      reason: 'source-bytes',
      sourcePath: 'package.json',
    });

    const exactTotal = [
      root(new Uint8Array(262_144)),
      ...Array.from({ length: 15 }, (_, index) => (
        packageManifest(`packages/p${index}/package.json`, new Uint8Array(262_144))
      )),
    ];
    expect(prepareMemoryM0Request(request(exactTotal))).toMatchObject({ ok: true });
    expect(prepareMemoryM0Request(request([
      ...exactTotal,
      packageManifest('packages/overflow/package.json', new Uint8Array(1)),
    ]))).toMatchObject({
      ok: false,
      error: 'source-limit',
      reason: 'source-bytes-total',
    });
  });
});
