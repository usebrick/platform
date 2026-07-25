/** Package-private immutable MemoryBrick M0 projection materialization. */

import {
  type ParsedMemoryM0Source,
} from './memory-m0';
import {
  canonicalizeMemoryM0Json,
  memoryM0AsciiCompare,
  memoryM0DomainSha256,
  memoryM0Sha256,
  memoryM0Utf8Compare,
} from './memory-m0-canonical';

const MEMORY_M0_PROFILE = 'memory-m0-v2' as const;
const MEMORY_M0_REGISTRY_PROFILE = 'memory-m0-registry-v2' as const;

/**
 * Pinned digest of Core's module-owned registry. Tests reconstruct it from
 * JCS(Core.MEMORY_M0_REGISTRY), so Core remains the sole registry owner.
 */
const MEMORY_M0_REGISTRY_SHA256 =
  'ebc0204fc3298ede39e74d847d674f203d9754b1c9f1d862d52f9a03a3bbca99';

export const MEMORY_M0_SLICE_B_BOUNDS = Object.freeze({
  maxRootCandidates: 7,
  maxPackageCandidates: 2,
  maxPackageManifests: 64,
  maxCandidates: 135,
  emptyProjectionEnvelopeBytes: 282,
  emptyArrayBytes: 6,
  maxSourceRowsBytes: 44_201,
  maxCandidateRowsBytes: 190_891,
  projectionArraySeparators: 2,
  conservativeProjectionBytes: 235_370,
  maxProjectionBytes: 262_144,
});

export type MemoryM0DeclaredValue = true | string;
export type MemoryM0ClaimKey = readonly [
  predicateId: 'repo.command' | 'repo.package-manager' | 'repo.package-manifest' | 'repo.runtime-node',
  subject: string,
  scope: 'repository',
  slot: 'build' | 'test' | 'lint' | 'typecheck' | 'singleton',
];
export type MemoryM0Evidence = Readonly<{
  sourceId: string;
  sourcePath: string;
  pointer: string;
}>;
export type MemoryM0Assertion = Readonly<{
  key: MemoryM0ClaimKey;
  authority: 'declared';
  value: MemoryM0DeclaredValue;
  evidence: readonly MemoryM0Evidence[];
}>;
export type MemoryM0ConflictVariant = Readonly<{
  value: MemoryM0DeclaredValue;
  evidence: readonly MemoryM0Evidence[];
}>;
export type MemoryM0Conflict = Readonly<{
  key: MemoryM0ClaimKey;
  authority: 'declared';
  variants: readonly MemoryM0ConflictVariant[];
}>;
export type MemoryM0SourceEvidence = Readonly<{
  sourceId: string;
  kind: ParsedMemoryM0Source['kind'];
  path: string;
  bytes: number;
  contentSha256: string;
}>;
export type MemoryM0Projection = Readonly<{
  profile: typeof MEMORY_M0_PROFILE;
  registryProfile: typeof MEMORY_M0_REGISTRY_PROFILE;
  registrySha256: string;
  sources: readonly MemoryM0SourceEvidence[];
  assertions: readonly MemoryM0Assertion[];
  conflicts: readonly MemoryM0Conflict[];
  projectionSha256: string;
}>;

export type MemoryM0CanonicalSource = Readonly<{
  sourceId: string;
  kind: ParsedMemoryM0Source['kind'];
  path: string;
  bytes: Uint8Array;
  value: ParsedMemoryM0Source['value'];
}>;
export type MemoryM0Candidate = Readonly<{
  key: MemoryM0ClaimKey;
  value: MemoryM0DeclaredValue;
  evidence: MemoryM0Evidence;
}>;

type ValueGroup = {
  readonly value: MemoryM0DeclaredValue;
  readonly evidence: MemoryM0Evidence[];
};
type ClaimGroup = {
  readonly key: MemoryM0ClaimKey;
  readonly values: Map<string, ValueGroup>;
};

function claimKeyCompare(left: MemoryM0ClaimKey, right: MemoryM0ClaimKey): number {
  for (let index = 0; index < left.length; index += 1) {
    const difference = memoryM0AsciiCompare(left[index]!, right[index]!);
    if (difference !== 0) return difference;
  }
  return 0;
}

function evidenceCompare(left: MemoryM0Evidence, right: MemoryM0Evidence): number {
  return memoryM0AsciiCompare(left.sourceId, right.sourceId)
    || memoryM0AsciiCompare(left.sourcePath, right.sourcePath)
    || memoryM0AsciiCompare(left.pointer, right.pointer);
}

function sourceCompare(left: MemoryM0CanonicalSource, right: MemoryM0CanonicalSource): number {
  return memoryM0AsciiCompare(left.sourceId, right.sourceId)
    || memoryM0AsciiCompare(left.path, right.path);
}

function claimGroupCompare(left: ClaimGroup, right: ClaimGroup): number {
  return claimKeyCompare(left.key, right.key);
}

function valueGroupCompare(left: ValueGroup, right: ValueGroup): number {
  return memoryM0Utf8Compare(
    canonicalizeMemoryM0Json(left.value),
    canonicalizeMemoryM0Json(right.value),
  );
}

function deriveSourceId(source: ParsedMemoryM0Source): string {
  return source.kind === 'root-package-json'
    ? 'root-package-json'
    : `package-manifest/${source.path}`;
}

export function canonicalMemoryM0Sources(
  sources: readonly ParsedMemoryM0Source[],
): MemoryM0CanonicalSource[] {
  return sources.map((source) => ({
    sourceId: deriveSourceId(source),
    kind: source.kind,
    path: source.path,
    bytes: source.bytes,
    value: source.value,
  })).sort(sourceCompare);
}

function groupCandidates(candidates: readonly MemoryM0Candidate[]): ClaimGroup[] {
  const claims = new Map<string, ClaimGroup>();
  for (const candidate of candidates) {
    const keyId = canonicalizeMemoryM0Json(candidate.key);
    let claim = claims.get(keyId);
    if (!claim) {
      claim = { key: candidate.key, values: new Map() };
      claims.set(keyId, claim);
    }
    const valueId = canonicalizeMemoryM0Json(candidate.value);
    let value = claim.values.get(valueId);
    if (!value) {
      value = { value: candidate.value, evidence: [] };
      claim.values.set(valueId, value);
    }
    value.evidence.push(candidate.evidence);
  }
  return Array.from(claims.values()).sort(claimGroupCompare);
}

export function materializeMemoryM0Facts(candidates: readonly MemoryM0Candidate[]): Readonly<{
  assertions: MemoryM0Assertion[];
  conflicts: MemoryM0Conflict[];
}> {
  const assertions: MemoryM0Assertion[] = [];
  const conflicts: MemoryM0Conflict[] = [];
  for (const group of groupCandidates(candidates)) {
    const values = Array.from(group.values.values()).sort(valueGroupCompare);
    const variants = values.map((value) => ({
      value: value.value,
      evidence: value.evidence.slice().sort(evidenceCompare),
    }));
    if (variants.length === 1) {
      const only = variants[0]!;
      assertions.push({
        key: group.key,
        authority: 'declared',
        value: only.value,
        evidence: only.evidence,
      });
    } else {
      conflicts.push({ key: group.key, authority: 'declared', variants });
    }
  }
  return { assertions, conflicts };
}

function sourceEvidence(sources: readonly MemoryM0CanonicalSource[]): MemoryM0SourceEvidence[] {
  return sources.map((source) => ({
    sourceId: source.sourceId,
    kind: source.kind,
    path: source.path,
    bytes: source.bytes.byteLength,
    contentSha256: memoryM0Sha256(source.bytes),
  }));
}

function recursivelyFreeze<T>(value: T): T {
  if (value === null || typeof value !== 'object') return value;
  for (const child of Object.values(value as object)) recursivelyFreeze(child);
  return Object.freeze(value);
}

export function buildMemoryM0Projection(
  sources: readonly MemoryM0CanonicalSource[],
  assertions: readonly MemoryM0Assertion[],
  conflicts: readonly MemoryM0Conflict[],
): MemoryM0Projection {
  const withoutProjectionSha256 = {
    profile: MEMORY_M0_PROFILE,
    registryProfile: MEMORY_M0_REGISTRY_PROFILE,
    registrySha256: MEMORY_M0_REGISTRY_SHA256,
    sources: sourceEvidence(sources),
    assertions,
    conflicts,
  };
  const projectionSha256 = memoryM0DomainSha256(
    'memory-m0-projection-v2',
    canonicalizeMemoryM0Json(withoutProjectionSha256),
  );
  return recursivelyFreeze({ ...withoutProjectionSha256, projectionSha256 });
}
