/**
 * Pure, package-private MemoryBrick M0 admission and parsing boundary.
 *
 * The module intentionally has no entrypoint export. It accepts a trusted
 * TypeScript request container while treating registered paths and exact
 * repository bytes as untrusted data.
 */

import {
  parseBoundedMemoryM0JsonObject,
  type MemoryM0JsonArray,
  type MemoryM0JsonObject,
  type MemoryM0JsonValue,
} from './memory-m0-json';
import {
  MemoryM0JsonFault,
  type MemoryM0JsonFaultReason,
  type MemoryM0JsonPrimitive,
} from './memory-m0-json-tokenizer';

const MEMORY_M0_PROFILE = 'memory-m0-v2' as const;
export const MEMORY_M0_SLICE_A_LIMITS = Object.freeze({
  maxSources: 65,
  maxPackageManifests: 64,
  maxSourceBytes: 262_144,
  maxTotalSourceBytes: 4_194_304,
  maxJsonDepth: 32,
  maxJsonTokens: 16_384,
});

const PACKAGE_MANIFEST_PATH = /^(?:[a-z0-9_@][a-z0-9._@-]{0,63}\/)+package\.json$/;

export type MemoryM0SourceKind = 'root-package-json' | 'package-manifest';
export type MemoryM0Source = Readonly<{
  kind: MemoryM0SourceKind;
  path: string;
  bytes: Uint8Array;
}>;
export type MemoryM0Request = Readonly<{
  profile: typeof MEMORY_M0_PROFILE;
  sources: readonly MemoryM0Source[];
}>;
export type PreparedMemoryM0Source = Readonly<MemoryM0Source>;

export type MemoryM0AdmissionFailure = Readonly<{
  ok: false;
  error: 'invalid-profile' | 'invalid-registration' | 'source-limit';
  reason:
    | 'profile'
    | 'source-count'
    | 'root-count'
    | 'root-path'
    | 'package-path'
    | 'duplicate-path'
    | 'source-bytes'
    | 'source-bytes-total';
  sourcePath: string | null;
}>;
export type PrepareMemoryM0Result =
  | Readonly<{ ok: true; sources: readonly PreparedMemoryM0Source[] }>
  | MemoryM0AdmissionFailure;

export type ParsedMemoryM0Source = Readonly<{
  kind: MemoryM0SourceKind;
  path: string;
  bytes: Uint8Array;
  value: MemoryM0JsonObject;
}>;
export type MemoryM0ParseFailure = Readonly<{
  ok: false;
  error: 'parse-failed';
  reason: MemoryM0JsonFaultReason;
  sourcePath: string;
}>;
export type ParseMemoryM0Result =
  | Readonly<{ ok: true; sources: readonly ParsedMemoryM0Source[] }>
  | MemoryM0AdmissionFailure
  | MemoryM0ParseFailure;

export type {
  MemoryM0JsonArray,
  MemoryM0JsonObject,
  MemoryM0JsonPrimitive,
  MemoryM0JsonValue,
};

type AdmissionState = {
  readonly paths: Set<string>;
  rootCount: number;
  packageCount: number;
  totalBytes: number;
};

function failure(
  error: MemoryM0AdmissionFailure['error'],
  reason: MemoryM0AdmissionFailure['reason'],
  sourcePath: string | null = null,
): MemoryM0AdmissionFailure {
  return Object.freeze({ ok: false, error, reason, sourcePath });
}

function validateSourceKind(
  source: MemoryM0Source,
  state: AdmissionState,
): MemoryM0AdmissionFailure | undefined {
  if (source.kind === 'root-package-json') {
    state.rootCount += 1;
    return source.path === 'package.json'
      ? undefined
      : failure('invalid-registration', 'root-path', source.path);
  }
  if (source.kind !== 'package-manifest') {
    return failure('invalid-registration', 'package-path', source.path);
  }
  state.packageCount += 1;
  if (state.packageCount > MEMORY_M0_SLICE_A_LIMITS.maxPackageManifests) {
    return failure('source-limit', 'source-count');
  }
  return source.path.length <= 256 && PACKAGE_MANIFEST_PATH.test(source.path)
    ? undefined
    : failure('invalid-registration', 'package-path', source.path);
}

function validateSourceBytes(
  source: MemoryM0Source,
  state: AdmissionState,
): MemoryM0AdmissionFailure | undefined {
  if (!(source.bytes instanceof Uint8Array)) {
    return failure('invalid-registration', 'source-bytes', source.path);
  }
  if (source.bytes.byteLength > MEMORY_M0_SLICE_A_LIMITS.maxSourceBytes) {
    return failure('source-limit', 'source-bytes', source.path);
  }
  const remaining = MEMORY_M0_SLICE_A_LIMITS.maxTotalSourceBytes - state.totalBytes;
  if (source.bytes.byteLength > remaining) return failure('source-limit', 'source-bytes-total');
  state.totalBytes += source.bytes.byteLength;
  return undefined;
}

function validateSource(
  source: MemoryM0Source,
  state: AdmissionState,
): MemoryM0AdmissionFailure | undefined {
  const kindFailure = validateSourceKind(source, state);
  if (kindFailure) return kindFailure;
  if (state.paths.has(source.path)) {
    return failure('invalid-registration', 'duplicate-path', source.path);
  }
  state.paths.add(source.path);
  return validateSourceBytes(source, state);
}

function copySources(sources: readonly MemoryM0Source[]): readonly PreparedMemoryM0Source[] {
  return Object.freeze(sources.map((source) => Object.freeze({
    kind: source.kind,
    path: source.path,
    bytes: new Uint8Array(source.bytes),
  })));
}

export function prepareMemoryM0Request(request: MemoryM0Request): PrepareMemoryM0Result {
  if (request.profile !== MEMORY_M0_PROFILE) return failure('invalid-profile', 'profile');
  const { length } = request.sources;
  if (length < 1 || length > MEMORY_M0_SLICE_A_LIMITS.maxSources) {
    return failure('source-limit', 'source-count');
  }
  const state: AdmissionState = { paths: new Set(), rootCount: 0, packageCount: 0, totalBytes: 0 };
  for (const source of request.sources) {
    const sourceFailure = validateSource(source, state);
    if (sourceFailure) return sourceFailure;
  }
  if (state.rootCount !== 1) return failure('invalid-registration', 'root-count');
  return Object.freeze({ ok: true, sources: copySources(request.sources) });
}

const fatalUtf8 = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true });

function decodeSourceBytes(source: PreparedMemoryM0Source): string {
  if (source.bytes[0] === 0xef && source.bytes[1] === 0xbb && source.bytes[2] === 0xbf) {
    throw new MemoryM0JsonFault('bom');
  }
  try {
    return fatalUtf8.decode(source.bytes);
  } catch {
    throw new MemoryM0JsonFault('utf8');
  }
}

function parseSource(source: PreparedMemoryM0Source): ParsedMemoryM0Source {
  const decoded = decodeSourceBytes(source);
  return Object.freeze({
    kind: source.kind,
    path: source.path,
    bytes: source.bytes,
    value: parseBoundedMemoryM0JsonObject(
      decoded,
      MEMORY_M0_SLICE_A_LIMITS.maxJsonDepth,
      MEMORY_M0_SLICE_A_LIMITS.maxJsonTokens,
    ),
  });
}

function parseFailure(sourcePath: string, error: unknown): MemoryM0ParseFailure {
  return Object.freeze({
    ok: false,
    error: 'parse-failed',
    reason: error instanceof MemoryM0JsonFault ? error.reason : 'json',
    sourcePath,
  });
}

export function parseMemoryM0Request(request: MemoryM0Request): ParseMemoryM0Result {
  const prepared = prepareMemoryM0Request(request);
  if (!prepared.ok) return prepared;
  const sources: ParsedMemoryM0Source[] = [];
  for (const source of prepared.sources) {
    try {
      sources.push(parseSource(source));
    } catch (error) {
      return parseFailure(source.path, error);
    }
  }
  return Object.freeze({ ok: true, sources: Object.freeze(sources) });
}
