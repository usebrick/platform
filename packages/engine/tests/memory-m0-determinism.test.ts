import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  MEMORY_M0_PROFILE,
  MEMORY_M0_REGISTRY,
  type MemoryM0Request,
} from '../../core/src/memory-m0';
import {
  canonicalizeMemoryM0Json,
  compileMemoryM0Request,
  type MemoryM0Projection,
} from '../src/memory-m0-compiler';

const encoder = new TextEncoder();

function asciiCompare(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function independentJcs(value: unknown): string {
  if (value === null || typeof value === 'boolean' || typeof value === 'string') {
    return JSON.stringify(value);
  }
  if (typeof value === 'number' && Number.isFinite(value)) return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(independentJcs).join(',')}]`;
  if (typeof value === 'object') {
    const record = value as Record<string, unknown>;
    return `{${Object.keys(record).sort(asciiCompare).map(
      (key) => `${JSON.stringify(key)}:${independentJcs(record[key])}`,
    ).join(',')}}`;
  }
  throw new Error('non-JSON test value');
}

function domainSha256(domain: string, canonicalJson: string): string {
  return createHash('sha256')
    .update(domain, 'utf8')
    .update(new Uint8Array([0]))
    .update(canonicalJson, 'utf8')
    .digest('hex');
}

function expectRecursivelyFrozen(value: unknown): void {
  if (value === null || typeof value !== 'object') return;
  expect(Object.isFrozen(value)).toBe(true);
  for (const child of Object.values(value)) expectRecursivelyFrozen(child);
}

function collectDigestFields(value: unknown, fields: Set<string>): void {
  if (value === null || typeof value !== 'object') return;
  if (Array.isArray(value)) {
    for (const child of value) collectDigestFields(child, fields);
    return;
  }
  for (const [key, child] of Object.entries(value)) {
    if (/sha256|digest/i.test(key)) fields.add(key);
    collectDigestFields(child, fields);
  }
}

function compile(sources: MemoryM0Request['sources']): MemoryM0Projection {
  const result = compileMemoryM0Request({ profile: MEMORY_M0_PROFILE, sources });
  expect(result).toMatchObject({ ok: true });
  if (!result.ok) throw new Error(result.error);
  return result.projection;
}

describe('MemoryBrick M0 Slice B determinism and hashes', () => {
  it('uses RFC 8785 object-key order without locale or insertion-order dependence', () => {
    const left = { z: 1, a: { y: true, b: false }, list: [{ d: 4, c: 3 }] };
    const right = { list: [{ c: 3, d: 4 }], a: { b: false, y: true }, z: 1 };

    expect(canonicalizeMemoryM0Json(left)).toBe(canonicalizeMemoryM0Json(right));
    expect(canonicalizeMemoryM0Json(left)).toBe(independentJcs(left));
  });

  it('is source-order independent, does not mutate caller bytes, and freezes outputs', () => {
    const rootBytes = encoder.encode('{"name":"root","engines":{"node":">=22 <25"}}');
    const packageBytes = encoder.encode('{"name":"@acme/a","engines":{"node":">=22 <25"}}');
    const beforeRoot = [...rootBytes];
    const beforePackage = [...packageBytes];
    const root = { kind: 'root-package-json', path: 'package.json', bytes: rootBytes } as const;
    const pkg = {
      kind: 'package-manifest',
      path: 'packages/a/package.json',
      bytes: packageBytes,
    } as const;
    const firstSources = Object.freeze([root, pkg]);
    const secondSources = Object.freeze([pkg, root]);

    const first = compile(firstSources);
    const repeated = compile(firstSources);
    const shuffled = compile(secondSources);

    expect(first).toEqual(repeated);
    expect(first).toEqual(shuffled);
    expect(canonicalizeMemoryM0Json(first)).toBe(canonicalizeMemoryM0Json(repeated));
    expect([...rootBytes]).toEqual(beforeRoot);
    expect([...packageBytes]).toEqual(beforePackage);
    expect(first.sources.map((item) => item.sourceId)).toEqual([
      'package-manifest/packages/a/package.json',
      'root-package-json',
    ]);
    expectRecursivelyFrozen(first);
  });

  it('reconstructs each Slice B SHA-256 from its documented preimage', () => {
    const exactBytes = encoder.encode('{"name":"single-app","packageManager":"pnpm@10.13.1"}');
    const projection = compile([
      { kind: 'root-package-json', path: 'package.json', bytes: exactBytes },
    ]);

    expect(projection.sources[0]?.contentSha256).toBe(
      createHash('sha256').update(exactBytes).digest('hex'),
    );
    expect(projection.registrySha256).toBe(
      domainSha256('memory-m0-registry-v2', independentJcs(MEMORY_M0_REGISTRY)),
    );
    const { projectionSha256, ...withoutProjectionSha256 } = projection;
    expect(projectionSha256).toBe(
      domainSha256('memory-m0-projection-v2', independentJcs(withoutProjectionSha256)),
    );

    const digestFields = new Set<string>();
    collectDigestFields(projection, digestFields);
    expect([...digestFields].sort(asciiCompare)).toEqual([
      'contentSha256',
      'projectionSha256',
      'registrySha256',
    ]);
  });

  it('uses named semantic comparators and retains only permitted dependencies', () => {
    const compilerSource = [
      'memory-m0-canonical.ts',
      'memory-m0-projection.ts',
      'memory-m0-compiler.ts',
    ].map((name) => readFileSync(new URL(`../src/${name}`, import.meta.url), 'utf8')).join('\n');

    expect(compilerSource).not.toMatch(/\.localeCompare\s*\(/);
    expect(compilerSource).not.toMatch(/\.sort\s*\(\s*\)/);
    expect(compilerSource).not.toMatch(/\b(?:process\.|console\.|fetch\s*\(|Date\s*\(|Math\.random)/);
    expect(compilerSource).not.toMatch(/['"]node:(?:fs|net|http|https|child_process|worker_threads)['"]/);
  });
});
