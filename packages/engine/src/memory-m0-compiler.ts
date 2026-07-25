/**
 * Pure, package-private MemoryBrick M0 fact compiler.
 *
 * It consumes Slice A's private byte copies and does no acquisition,
 * rendering, benchmark execution, persistence, or policy enforcement.
 */

import {
  parseMemoryM0Request,
  type MemoryM0AdmissionFailure,
  type MemoryM0JsonObject,
  type MemoryM0JsonValue,
  type MemoryM0ParseFailure,
  type MemoryM0Request,
} from './memory-m0';
import {
  canonicalizeMemoryM0Json,
  memoryM0Utf8ByteLength,
} from './memory-m0-canonical';
import {
  buildMemoryM0Projection,
  canonicalMemoryM0Sources,
  materializeMemoryM0Facts,
  type MemoryM0Candidate,
  type MemoryM0CanonicalSource,
  type MemoryM0ClaimKey,
  type MemoryM0DeclaredValue,
  type MemoryM0Evidence,
  type MemoryM0Projection,
} from './memory-m0-projection';

export { canonicalizeMemoryM0Json } from './memory-m0-canonical';
export { MEMORY_M0_SLICE_B_BOUNDS } from './memory-m0-projection';
export type {
  MemoryM0Assertion,
  MemoryM0ClaimKey,
  MemoryM0Conflict,
  MemoryM0ConflictVariant,
  MemoryM0DeclaredValue,
  MemoryM0Evidence,
  MemoryM0Projection,
  MemoryM0SourceEvidence,
} from './memory-m0-projection';

export type MemoryM0PredicateFailure = Readonly<{
  ok: false;
  error: 'predicate-violation';
  reason:
    | 'package-manager'
    | 'runtime-node'
    | 'scripts'
    | 'script'
    | 'package-name'
    | 'value-bytes';
  sourcePath: string;
}>;
export type CompileMemoryM0Result =
  | Readonly<{ ok: true; projection: MemoryM0Projection }>
  | MemoryM0AdmissionFailure
  | MemoryM0ParseFailure
  | MemoryM0PredicateFailure;

const PACKAGE_MANAGER = /^[a-z0-9][a-z0-9._-]{0,31}@[0-9A-Za-z][0-9A-Za-z._+-]{0,95}$/;
const PACKAGE_NAME = /^(?:@[a-z0-9][a-z0-9._-]{0,63}\/)?[a-z0-9][a-z0-9._-]{0,127}$/;
const VERSION_SOURCE = String.raw`v?(?:\d+|[xX*])(?:\.(?:\d+|[xX*])){0,2}(?:-[A-Za-z0-9.-]+)?(?:\+[A-Za-z0-9.-]+)?`;
const NODE_COMPARATOR = new RegExp(`^(?:<=|>=|<|>|=|~|\\^)?${VERSION_SOURCE}$`);
const NODE_HYPHEN_RANGE = new RegExp(`^${VERSION_SOURCE} +- +${VERSION_SOURCE}$`);
const COMMAND_SLOTS = ['build', 'test', 'lint', 'typecheck'] as const;

function isJsonObject(value: MemoryM0JsonValue | undefined): value is MemoryM0JsonObject {
  return value instanceof Map;
}

function isAscii(value: string): boolean {
  return /^[\x00-\x7f]*$/.test(value);
}

function validPackageManager(value: string): boolean {
  return isAscii(value) && PACKAGE_MANAGER.test(value);
}

function validPackageName(value: string): boolean {
  return value.length >= 1
    && value.length <= 214
    && isAscii(value)
    && PACKAGE_NAME.test(value);
}

function validNodeGroup(group: string): boolean {
  if (NODE_HYPHEN_RANGE.test(group)) return true;
  return group.split(/ +/).every((part) => NODE_COMPARATOR.test(part));
}

function validNodeRange(value: string): boolean {
  if (value.length < 1 || value.length > 128 || !isAscii(value)) return false;
  if (value.startsWith(' ') || value.endsWith(' ')) return false;
  return value.split(/ +\|\| +/).every(validNodeGroup);
}

function predicateFailure(
  reason: MemoryM0PredicateFailure['reason'],
  sourcePath: string,
): MemoryM0PredicateFailure {
  return Object.freeze({ ok: false, error: 'predicate-violation', reason, sourcePath });
}

function makeEvidence(source: MemoryM0CanonicalSource, pointer: string): MemoryM0Evidence {
  return { sourceId: source.sourceId, sourcePath: source.path, pointer };
}

function appendCandidate(
  candidates: MemoryM0Candidate[],
  source: MemoryM0CanonicalSource,
  key: MemoryM0ClaimKey,
  value: MemoryM0DeclaredValue,
  pointer: string,
): MemoryM0PredicateFailure | undefined {
  const valueJcs = canonicalizeMemoryM0Json(value);
  if (memoryM0Utf8ByteLength(valueJcs) > 256) {
    return predicateFailure('value-bytes', source.path);
  }
  candidates.push({ key, value, evidence: makeEvidence(source, pointer) });
  return undefined;
}

function extractPackageManager(
  source: MemoryM0CanonicalSource,
  candidates: MemoryM0Candidate[],
): MemoryM0PredicateFailure | undefined {
  if (source.kind !== 'root-package-json' || !source.value.has('packageManager')) return undefined;
  const value = source.value.get('packageManager');
  if (typeof value !== 'string' || !validPackageManager(value)) {
    return predicateFailure('package-manager', source.path);
  }
  return appendCandidate(
    candidates,
    source,
    ['repo.package-manager', 'repository', 'repository', 'singleton'],
    value,
    '/packageManager',
  );
}

function extractRuntime(
  source: MemoryM0CanonicalSource,
  candidates: MemoryM0Candidate[],
): MemoryM0PredicateFailure | undefined {
  if (!source.value.has('engines')) return undefined;
  const engines = source.value.get('engines');
  if (!isJsonObject(engines)) return predicateFailure('runtime-node', source.path);
  if (!engines.has('node')) return undefined;
  const value = engines.get('node');
  if (typeof value !== 'string' || !validNodeRange(value)) {
    return predicateFailure('runtime-node', source.path);
  }
  return appendCandidate(
    candidates,
    source,
    ['repo.runtime-node', 'repository', 'repository', 'singleton'],
    value,
    '/engines/node',
  );
}

function extractCommands(
  source: MemoryM0CanonicalSource,
  candidates: MemoryM0Candidate[],
): MemoryM0PredicateFailure | undefined {
  if (source.kind !== 'root-package-json' || !source.value.has('scripts')) return undefined;
  const scripts = source.value.get('scripts');
  if (!isJsonObject(scripts)) return predicateFailure('scripts', source.path);
  for (const slot of COMMAND_SLOTS) {
    if (!scripts.has(slot)) continue;
    if (typeof scripts.get(slot) !== 'string') return predicateFailure('script', source.path);
    const failure = appendCandidate(
      candidates,
      source,
      ['repo.command', 'repository', 'repository', slot],
      true,
      `/scripts/${slot}`,
    );
    if (failure) return failure;
  }
  return undefined;
}

function extractPackageName(
  source: MemoryM0CanonicalSource,
  candidates: MemoryM0Candidate[],
): MemoryM0PredicateFailure | undefined {
  if (!source.value.has('name')) return undefined;
  const value = source.value.get('name');
  if (typeof value !== 'string' || !validPackageName(value)) {
    return predicateFailure('package-name', source.path);
  }
  return appendCandidate(
    candidates,
    source,
    ['repo.package-manifest', source.path, 'repository', 'singleton'],
    value,
    '/name',
  );
}

function extractCandidates(
  sources: readonly MemoryM0CanonicalSource[],
): Readonly<{ ok: true; candidates: readonly MemoryM0Candidate[] }> | MemoryM0PredicateFailure {
  const candidates: MemoryM0Candidate[] = [];
  for (const source of sources) {
    const failure = extractPackageManager(source, candidates)
      ?? extractRuntime(source, candidates)
      ?? extractCommands(source, candidates)
      ?? extractPackageName(source, candidates);
    if (failure) return failure;
  }
  return { ok: true, candidates };
}

export function compileMemoryM0Request(request: MemoryM0Request): CompileMemoryM0Result {
  const parsed = parseMemoryM0Request(request);
  if (!parsed.ok) return parsed;
  const sources = canonicalMemoryM0Sources(parsed.sources);
  const extracted = extractCandidates(sources);
  if (!extracted.ok) return extracted;
  const facts = materializeMemoryM0Facts(extracted.candidates);
  const projection = buildMemoryM0Projection(sources, facts.assertions, facts.conflicts);
  return Object.freeze({ ok: true, projection });
}
