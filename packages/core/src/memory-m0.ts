/**
 * Private MemoryBrick M0 profile and request contracts.
 *
 * This module is deliberately absent from the package facade and export map.
 * It is an implementation boundary for the accepted local M0 slices, not a
 * public Repository Structure or npm API.
 */

export const MEMORY_M0_PROFILE = 'memory-m0-v2' as const;

export type MemoryM0SourceKind = 'root-package-json' | 'package-manifest';

export type MemoryM0RegisteredSource = Readonly<{
  kind: MemoryM0SourceKind;
  path: string;
  bytes: Uint8Array;
}>;

export type MemoryM0Request = Readonly<{
  profile: typeof MEMORY_M0_PROFILE;
  sources: readonly MemoryM0RegisteredSource[];
}>;

type DeepReadonly<T> =
  T extends (...args: never[]) => unknown
    ? T
    : T extends readonly (infer Item)[]
      ? readonly DeepReadonly<Item>[]
      : T extends object
        ? { readonly [Key in keyof T]: DeepReadonly<T[Key]> }
        : T;

function freezeRegistry<T extends object>(value: T): DeepReadonly<T> {
  for (const child of Object.values(value)) {
    if (child !== null && typeof child === 'object') {
      freezeRegistry(child);
    }
  }
  return Object.freeze(value) as DeepReadonly<T>;
}

export const MEMORY_M0_REGISTRY = freezeRegistry({
  profile: 'memory-m0-registry-v2',
  stringProfile: 'ascii-bytewise-v1',
  caps: {
    maxSources: 65,
    maxPackageManifests: 64,
    maxSourceBytes: 262_144,
    maxTotalSourceBytes: 4_194_304,
    maxJsonDepth: 32,
    maxJsonTokens: 16_384,
    maxAssertions: 256,
    maxValueBytes: 256,
    maxProjectionBytes: 262_144,
    maxRenderPayloadBytes: 2_048,
    maxRenderedBytes: 4_096,
    maxFixtures: 3,
    maxTasks: 9,
    maxCells: 27,
    maxClaimKeySubjectBytes: 256,
    maxClaimKeySlotBytes: 16,
    maxClaimKeyBytes: 512,
    maxKeysPerTask: 8,
    maxNativeKeysPerContext: 8,
    maxNativeContextBytes: 4_096,
    maxSuiteKeyReferences: 256,
    maxSuiteKeyBytes: 65_536,
    maxSuiteSourceBytes: 8_388_608,
    maxSuiteNativeBytes: 36_864,
    maxBenchmarkVectorBytes: 131_072,
    maxBenchmarkResultBytes: 131_072,
  },
  extractors: [
    {
      id: 'package-json-root-v2',
      version: '2.1.0',
      sourceKinds: ['root-package-json'],
      parserProfile: 'bounded-json-v2',
    },
    {
      id: 'package-manifest-v2',
      version: '2.1.0',
      sourceKinds: ['package-manifest'],
      parserProfile: 'bounded-json-v2',
    },
  ],
  predicates: [
    {
      id: 'repo.command',
      authority: 'declared',
      sourceKinds: ['root-package-json'],
      subjectGrammar: 'repository-literal',
      scope: 'repository',
      slotGrammar: 'build|test|lint|typecheck',
      valueGrammar: 'true',
      priority: 800,
    },
    {
      id: 'repo.package-manager',
      authority: 'declared',
      sourceKinds: ['root-package-json'],
      subjectGrammar: 'repository-literal',
      scope: 'repository',
      slotGrammar: 'singleton',
      valueGrammar: 'package-manager-literal',
      priority: 1_000,
    },
    {
      id: 'repo.package-manifest',
      authority: 'declared',
      sourceKinds: ['root-package-json', 'package-manifest'],
      subjectGrammar: 'registered-manifest-path',
      scope: 'repository',
      slotGrammar: 'singleton',
      valueGrammar: 'package-name',
      priority: 600,
    },
    {
      id: 'repo.runtime-node',
      authority: 'declared',
      sourceKinds: ['root-package-json', 'package-manifest'],
      subjectGrammar: 'repository-literal',
      scope: 'repository',
      slotGrammar: 'singleton',
      valueGrammar: 'node-range-literal',
      priority: 900,
    },
  ],
} as const);
