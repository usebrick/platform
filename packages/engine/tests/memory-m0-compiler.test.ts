import { describe, expect, it } from 'vitest';
import {
  MEMORY_M0_PROFILE,
  type MemoryM0Request,
} from '../../core/src/memory-m0';
import {
  compileMemoryM0Request,
  type MemoryM0Projection,
} from '../src/memory-m0-compiler';

const encoder = new TextEncoder();

function source(
  kind: MemoryM0Request['sources'][number]['kind'],
  path: string,
  json: string,
): MemoryM0Request['sources'][number] {
  return { kind, path, bytes: encoder.encode(json) };
}

function root(json: string): MemoryM0Request['sources'][number] {
  return source('root-package-json', 'package.json', json);
}

function packageManifest(path: string, json: string): MemoryM0Request['sources'][number] {
  return source('package-manifest', path, json);
}

function request(sources: MemoryM0Request['sources']): MemoryM0Request {
  return { profile: MEMORY_M0_PROFILE, sources };
}

function projectionFor(sources: MemoryM0Request['sources']): MemoryM0Projection {
  const result = compileMemoryM0Request(request(sources));
  expect(result).toMatchObject({ ok: true });
  if (!result.ok) throw new Error(`unexpected compile failure: ${result.error}`);
  return result.projection;
}

describe('MemoryBrick M0 Slice B fact compiler', () => {
  it('emits only the four declared predicate families with exact evidence', () => {
    const projection = projectionFor([
      packageManifest('packages/ui/package.json', JSON.stringify({
        name: '@acme/ui',
        engines: { node: '>=22 <25' },
        packageManager: { deliberately: 'ignored' },
        scripts: 42,
        privateNote: 'never emitted',
      })),
      root(JSON.stringify({
        name: 'root-app',
        packageManager: 'pnpm@10.13.1',
        engines: { node: '>=22 <25', bun: '1' },
        scripts: {
          build: 'vite build --secret-body',
          test: 'vitest run',
          lint: 'eslint .',
          typecheck: 'tsc --noEmit',
          deploy: 'ignored command',
        },
        unknown: 'never emitted',
      })),
    ]);

    const predicates = new Set(projection.assertions.map((assertion) => assertion.key[0]));
    expect(predicates).toEqual(new Set([
      'repo.command',
      'repo.package-manager',
      'repo.package-manifest',
      'repo.runtime-node',
    ]));
    expect(projection.conflicts).toEqual([]);
    expect(projection.assertions).toHaveLength(8);
    expect(projection.assertions.every((assertion) => assertion.authority === 'declared')).toBe(true);

    const build = projection.assertions.find((assertion) => assertion.key[3] === 'build');
    expect(build).toEqual({
      key: ['repo.command', 'repository', 'repository', 'build'],
      authority: 'declared',
      value: true,
      evidence: [{
        sourceId: 'root-package-json',
        sourcePath: 'package.json',
        pointer: '/scripts/build',
      }],
    });

    const runtime = projection.assertions.find(
      (assertion) => assertion.key[0] === 'repo.runtime-node',
    );
    expect(runtime?.evidence).toEqual([
      {
        sourceId: 'package-manifest/packages/ui/package.json',
        sourcePath: 'packages/ui/package.json',
        pointer: '/engines/node',
      },
      {
        sourceId: 'root-package-json',
        sourcePath: 'package.json',
        pointer: '/engines/node',
      },
    ]);

    const serialized = JSON.stringify(projection);
    expect(serialized).not.toContain('secret-body');
    expect(serialized).not.toContain('ignored command');
    expect(serialized).not.toContain('privateNote');
    expect(serialized).not.toContain('unknown');
  });

  it.each([
    ['package-manager grammar', { packageManager: 'PNPM@1' }, 'package-manager'],
    ['engines parent', { engines: [] }, 'runtime-node'],
    ['node-range type', { engines: { node: 22 } }, 'runtime-node'],
    ['node-range grammar', { engines: { node: '>=22\t<25' } }, 'runtime-node'],
    ['scripts parent', { scripts: null }, 'scripts'],
    ['recognized script type', { scripts: { build: true } }, 'script'],
    ['package-name grammar', { name: 'café' }, 'package-name'],
  ])('rejects invalid recognized %s fields', (_label, value, reason) => {
    expect(compileMemoryM0Request(request([root(JSON.stringify(value))]))).toMatchObject({
      ok: false,
      error: 'predicate-violation',
      reason,
      sourcePath: 'package.json',
    });
  });

  it.each([
    '22',
    'v22.1.0',
    '>=22 <25',
    '^22.0.0',
    '22 - 24.9.0',
    '22.x || >=24 <25',
  ])('accepts exact node range grammar %s', (node) => {
    expect(compileMemoryM0Request(request([
      root(JSON.stringify({ engines: { node } })),
    ]))).toMatchObject({ ok: true });
  });

  it.each([
    '',
    ' >=22',
    '>=22 ',
    '>= 22',
    '22.0.0.1',
    '22/24',
    '22 ||',
    '２２',
  ])('rejects adjacent-invalid node range %j', (node) => {
    expect(compileMemoryM0Request(request([
      root(JSON.stringify({ engines: { node } })),
    ]))).toMatchObject({
      ok: false,
      error: 'predicate-violation',
      reason: 'runtime-node',
    });
  });

  it('preserves equal package names as separate path-scoped declared facts', () => {
    const projection = projectionFor([
      root('{"name":"duplicate"}'),
      packageManifest('packages/a/package.json', '{"name":"duplicate"}'),
    ]);

    expect(projection.assertions.filter(
      (assertion) => assertion.key[0] === 'repo.package-manifest',
    )).toEqual([
      expect.objectContaining({
        key: ['repo.package-manifest', 'package.json', 'repository', 'singleton'],
        value: 'duplicate',
      }),
      expect.objectContaining({
        key: [
          'repo.package-manifest',
          'packages/a/package.json',
          'repository',
          'singleton',
        ],
        value: 'duplicate',
      }),
    ]);
  });

  it('merges equal values and makes differing values conflict-only', () => {
    const equal = projectionFor([
      root('{"engines":{"node":">=22 <25"}}'),
      packageManifest('packages/a/package.json', '{"engines":{"node":">=22 <25"}}'),
    ]);
    const equalRuntime = equal.assertions.find(
      (assertion) => assertion.key[0] === 'repo.runtime-node',
    );
    expect(equalRuntime?.evidence).toHaveLength(2);
    expect(equal.conflicts).toEqual([]);

    const conflicted = projectionFor([
      root('{"engines":{"node":">=22 <25"}}'),
      packageManifest('packages/a/package.json', '{"engines":{"node":"<22"}}'),
    ]);
    expect(conflicted.assertions.some(
      (assertion) => assertion.key[0] === 'repo.runtime-node',
    )).toBe(false);
    expect(conflicted.conflicts).toEqual([{
      key: ['repo.runtime-node', 'repository', 'repository', 'singleton'],
      authority: 'declared',
      variants: [
        {
          value: '<22',
          evidence: [{
            sourceId: 'package-manifest/packages/a/package.json',
            sourcePath: 'packages/a/package.json',
            pointer: '/engines/node',
          }],
        },
        {
          value: '>=22 <25',
          evidence: [{
            sourceId: 'root-package-json',
            sourcePath: 'package.json',
            pointer: '/engines/node',
          }],
        },
      ],
    }]);
  });

  it('matches the accepted single-app projection digest without running the Slice C harness', () => {
    const exactBytes = '{"name":"single-app","packageManager":"pnpm@10.13.1","engines":{"node":">=22 <25"},"scripts":{"build":"vite build","test":"vitest run"}}';
    const projection = projectionFor([root(exactBytes)]);

    expect(projection.sources[0]?.contentSha256).toBe(
      'fde3489e27fcf1733458f277fff21fabeca8f0bb1d499f8a282f1792b16dbd31',
    );
    expect(projection.projectionSha256).toBe(
      '3be975347cc80fc430bcf55aa932807ce5c037199529193fa248c31115c502dd',
    );
  });
});
