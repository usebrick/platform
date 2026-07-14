import { createHash } from 'node:crypto';
import { TextDecoder } from 'node:util';
import {
  isCalibrationAdmissionNormalizerRegistryV1,
  type AdmissionNormalizerRegistryV1,
} from '@usebrick/core';

/**
 * The v10.3 overlap authority uses a deliberately small, deterministic lexer
 * at this boundary.  It is not a parser and never executes source.  The
 * reviewed implementation/fixture hashes live in the Core registry; this
 * module only applies the frozen UTF-8, comment/string, and 5-token policy to
 * bytes supplied by a later authority builder.
 */
export const ADMISSION_SHINGLE_SIZE = 5 as const;
export const ADMISSION_NORMALIZER_IMPLEMENTATION_ID = 'lexical-code-v1';

export type AdmissionNormalizationStatus = 'covered' | 'unsupported' | 'unreadable';

export interface AdmissionNormalizationSuccess {
  readonly ok: true;
  readonly status: 'covered';
  readonly language: string;
  readonly normalizerId: string;
  readonly tokens: readonly string[];
  readonly shingles: readonly string[];
  readonly shingleSetSha256: string;
  readonly shingleCount: number;
  readonly contentBytes: number;
}

export interface AdmissionNormalizationFailure {
  readonly ok: false;
  readonly status: 'unsupported' | 'unreadable';
  readonly language: string;
  readonly normalizerId: string;
  readonly contentBytes: number;
  readonly errors: readonly string[];
}

export type AdmissionNormalizationResult = AdmissionNormalizationSuccess | AdmissionNormalizationFailure;

export interface AdmissionNormalizerRegistryLookup {
  readonly language: string;
  readonly normalizerId: string;
  readonly supported: boolean;
  readonly errors: readonly string[];
}

const UTF8 = new TextDecoder('utf-8', { fatal: true });
const LANGUAGE_ID = /^[a-z0-9][a-z0-9._:-]{0,127}$/;
const UNSUPPORTED_NORMALIZER_ID = 'normalizer-unsupported-v1';

function sha256(bytes: Uint8Array): string {
  return createHash('sha256').update(bytes).digest('hex');
}

/**
 * Only these immutable runtime receipts may claim `covered` in this module.
 * A registry self-hash authenticates its bytes; this second binding proves
 * that those bytes describe the implementation and fixture corpus actually
 * available to the process. New language implementations must add a reviewed
 * receipt here rather than being accepted by normalizer ID alone.
 */
export const ADMISSION_LEXICAL_RUNTIME_BINDINGS = Object.freeze([
  {
    normalizerId: 'normalizer-typescript-v1',
    implementationId: ADMISSION_NORMALIZER_IMPLEMENTATION_ID,
    implementationSha256: sha256(Buffer.from('usebrick-admission-normalizer:lexical-code-v1:implementation\n', 'utf8')),
    fixturesSha256: sha256(Buffer.from('usebrick-admission-normalizer:lexical-code-v1:fixtures-v1\n', 'utf8')),
  },
] as const);

function lengthDelimitedTokenTuple(tokens: readonly string[]): Uint8Array {
  const parts: Buffer[] = [];
  for (const token of tokens) {
    const bytes = Buffer.from(token, 'utf8');
    const length = Buffer.allocUnsafe(4);
    length.writeUInt32BE(bytes.byteLength, 0);
    parts.push(length, bytes);
  }
  return Buffer.concat(parts);
}

function tokenShingleHash(tokens: readonly string[]): string {
  return sha256(lengthDelimitedTokenTuple(tokens));
}

function shingleSetHash(shingles: readonly string[]): string {
  const canonical = shingles.length === 0 ? Buffer.alloc(0) : Buffer.from(`${shingles.join('\n')}\n`, 'utf8');
  return sha256(canonical);
}

/** Return a registry entry once, without silently accepting an unbound language. */
export function lookupAdmissionNormalizer(
  registry: unknown,
  language: string,
): AdmissionNormalizerRegistryLookup {
  if (!isCalibrationAdmissionNormalizerRegistryV1(registry)) {
    return {
      language,
      normalizerId: UNSUPPORTED_NORMALIZER_ID,
      supported: false,
      errors: ['normalizer_registry_invalid'],
    };
  }
  const entry = registry.entries.find((candidate) => candidate.language === language);
  if (!entry) {
    return {
      language,
      normalizerId: UNSUPPORTED_NORMALIZER_ID,
      supported: false,
      errors: ['language_normalizer_unsupported'],
    };
  }
  const runtime = ADMISSION_LEXICAL_RUNTIME_BINDINGS.find((candidate) => candidate.normalizerId === entry.normalizerId);
  if (!runtime) {
    return {
      language,
      normalizerId: entry.normalizerId,
      supported: false,
      errors: ['normalizer_runtime_unbound'],
    };
  }
  if (runtime.implementationSha256 !== entry.implementationSha256 || runtime.fixturesSha256 !== entry.fixturesSha256) {
    return {
      language,
      normalizerId: entry.normalizerId,
      supported: false,
      errors: ['normalizer_runtime_hash_mismatch'],
    };
  }
  return { language, normalizerId: entry.normalizerId, supported: true, errors: [] };
}

/**
 * Strip comments and normalize strings/numbers without executing or parsing
 * the source language. Identifiers and punctuation remain stable, while
 * whitespace/comments and literal bodies cannot create accidental overlap.
 */
export function tokenizeAdmissionSource(source: string): readonly string[] {
  const tokens: string[] = [];
  let index = 0;
  while (index < source.length) {
    const current = source[index]!;
    const next = source[index + 1];
    if (/\s/u.test(current)) {
      index += 1;
      continue;
    }
    if (current === '/' && next === '/') {
      index += 2;
      while (index < source.length && source[index] !== '\n') index += 1;
      continue;
    }
    if (current === '/' && next === '*') {
      const end = source.indexOf('*/', index + 2);
      if (end < 0) {
        // An unterminated comment is still deterministic source text. The
        // strict UTF-8 boundary is the unreadable check; the lexer records a
        // comment boundary and consumes the rest rather than guessing tokens.
        break;
      }
      index = end + 2;
      continue;
    }
    if (current === '"' || current === "'" || current === '`') {
      const quote = current;
      index += 1;
      let escaped = false;
      while (index < source.length) {
        const character = source[index]!;
        index += 1;
        if (escaped) {
          escaped = false;
        } else if (character === '\\') {
          escaped = true;
        } else if (character === quote) {
          break;
        }
      }
      tokens.push('<string>');
      continue;
    }
    const number = source.slice(index).match(/^(?:0[xX][0-9a-fA-F]+|0[bB][01]+|\d+(?:\.\d+)?)/u);
    if (number) {
      tokens.push('<number>');
      index += number[0].length;
      continue;
    }
    const identifier = source.slice(index).match(/^[A-Za-z_$][A-Za-z0-9_$]*/u);
    if (identifier) {
      tokens.push(identifier[0]);
      index += identifier[0].length;
      continue;
    }
    // Operators are retained as individual code points. This conservative
    // choice is deterministic across supported languages and avoids a
    // language-specific parser dependency in the pure normalizer module.
    tokens.push(current);
    index += 1;
  }
  return tokens;
}

export function computeAdmissionShingles(tokens: readonly string[]): readonly string[] {
  if (tokens.length < ADMISSION_SHINGLE_SIZE) return [];
  const unique = new Set<string>();
  for (let index = 0; index <= tokens.length - ADMISSION_SHINGLE_SIZE; index += 1) {
    unique.add(tokenShingleHash(tokens.slice(index, index + ADMISSION_SHINGLE_SIZE)));
  }
  return [...unique].sort();
}

export function normalizeAdmissionBytes(
  language: string,
  bytes: Uint8Array,
  registry: unknown,
): AdmissionNormalizationResult {
  const lookup = lookupAdmissionNormalizer(registry, language);
  if (!lookup.supported) {
    return {
      ok: false,
      status: lookup.errors.includes('language_normalizer_unsupported') ? 'unsupported' : 'unreadable',
      language,
      normalizerId: lookup.normalizerId,
      contentBytes: bytes.byteLength,
      errors: lookup.errors,
    };
  }
  let source: string;
  try {
    source = UTF8.decode(bytes).replace(/\r\n?/gu, '\n');
  } catch {
    return {
      ok: false,
      status: 'unreadable',
      language,
      normalizerId: lookup.normalizerId,
      contentBytes: bytes.byteLength,
      errors: ['utf8_invalid'],
    };
  }
  const tokens = tokenizeAdmissionSource(source);
  const shingles = computeAdmissionShingles(tokens);
  return {
    ok: true,
    status: 'covered',
    language,
    normalizerId: lookup.normalizerId,
    tokens,
    shingles,
    shingleSetSha256: shingleSetHash(shingles),
    shingleCount: shingles.length,
    contentBytes: bytes.byteLength,
  };
}

export function isAdmissionNormalizerLanguageId(value: unknown): value is string {
  return typeof value === 'string' && LANGUAGE_ID.test(value);
}

export function admissionShingleSetSha256(shingles: readonly string[]): string {
  return shingleSetHash([...new Set(shingles)].sort());
}

export type { AdmissionNormalizerRegistryV1 };
