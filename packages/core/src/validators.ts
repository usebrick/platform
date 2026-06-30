/**
 * @usebrick-dev/core — runtime validators for the persisted artifacts.
 *
 * The JSON Schemas in `packages/core/schemas/v1/*.schema.json` are the
 * contract (see AGENTS.md — "schemas are the API"). The codegen in
 * `scripts/codegen-types.ts` reads them and generates the
 * `RepositoryStructure*` TypeScript types in `src/generated/`.
 *
 * At runtime, every loader (`loadInventory`, `loadConstitution`,
 * `loadHealth`, `readCache`) reads the JSON from disk, parses it, and
 * runs it through one of these validators before returning. A
 * mismatch returns `null` from the public loader rather than throwing,
 * so callers degrade gracefully (e.g. rebuild the inventory instead
 * of crashing).
 *
 * The validators are deliberately TIGHTER than `any` but LOOSER than
 * the JSON Schemas:
 *
 *   - **Tighter than `any`** — they reject obviously-corrupt data
 *     (missing required fields, wrong primitive types). The user's
 *     read in the v0.17.3 review that they were "systematically
 *     looser than the JSON Schemas" is right that they don't enforce
 *     every schema constraint — see the comparison below — but they
 *     catch the common cases (wrong version, wrong field types,
 *     missing required fields).
 *
 *   - **Looser than the schemas** — they don't enforce every
 *     per-field constraint (e.g. ISO 8601 datetime, regex on
 *     `fingerprint`, enum membership for `category`). For those
 *     cases, a strict consumer should re-validate using a real JSON
 *     Schema validator (e.g. `ajv`) before consuming. The point of
 *     the runtime check here is to refuse obviously-bad data and to
 *     return a useful error path — not to be a second schema
 *     implementation.
 *
 * v0.17.4 (R-H4 closeout): extracted from `structure-types.ts` so
 * that the only types in that file are the hand-written bits with
 * no schema counterpart (`STRUCTURE_SCHEMA_VERSION`,
 * `FileMtimeEntry`). The generated `RepositoryStructure*` types
 * from `src/generated/` are the public API for the schema-derived
 * shapes.
 */

import { STRUCTURE_SCHEMA_VERSION } from './structure-types';
import type {
  Pattern as StructurePattern,
  Component as ComponentFingerprint,
  RepositoryStructureInventory,
} from './generated/inventory';
import type { RepositoryStructureConstitution } from './generated/constitution';
import type { RepositoryStructureHealth } from './generated/health';

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function isStringArray(v: unknown): v is string[] {
  return Array.isArray(v) && v.every((i) => typeof i === 'string');
}

function isNumber(v: unknown): v is number {
  return typeof v === 'number' && Number.isFinite(v);
}

export function isStructurePattern(value: unknown): value is StructurePattern {
  if (!isRecord(value)) return false;
  return (
    typeof value.category === 'string' &&
    typeof value.name === 'string' &&
    isStringArray(value.imports) &&
    isNumber(value.fileCount)
  );
}

export function isComponentFingerprint(value: unknown): value is ComponentFingerprint {
  if (!isRecord(value)) return false;
  return (
    typeof value.name === 'string' &&
    isStringArray(value.files) &&
    typeof value.fingerprint === 'string' &&
    isStringArray(value.hooks) &&
    isStringArray(value.props) &&
    isNumber(value.line) &&
    isNumber(value.endLine)
  );
}

function isVersion3(value: unknown): boolean {
  return value === STRUCTURE_SCHEMA_VERSION;
}

/**
 * Validate an `inventory.json` artifact against the canonical
 * `inventory.schema.json`. Returns `true` iff every required field is
 * present, typed correctly, and the schema version is current.
 */
export function isInventoryFile(value: unknown): value is RepositoryStructureInventory {
  if (!isRecord(value)) return false;
  if (!isVersion3(value.version)) return false;
  if (typeof value.generatedAt !== 'string') return false;
  if (typeof value.workspace !== 'string') return false;
  if (!isNumber(value.scannedFiles)) return false;
  if (!isNumber(value.scanDurationMs)) return false;
  if (!Array.isArray(value.patterns) || !value.patterns.every(isStructurePattern)) return false;
  if (!Array.isArray(value.components) || !value.components.every(isComponentFingerprint)) return false;
  return true;
}

/**
 * Validate a `constitution.json` artifact against the canonical
 * `constitution.schema.json`.
 */
export function isConstitutionFile(value: unknown): value is RepositoryStructureConstitution {
  if (!isRecord(value)) return false;
  if (!isVersion3(value.version)) return false;
  if (typeof value.generatedAt !== 'string') return false;
  if (typeof value.workspace !== 'string') return false;
  if (!isRecord(value.declared)) return false;
  if (!isStringArray(value.forbidden)) return false;
  if (!isStringArray(value.forbiddenPrefixes)) return false;
  return true;
}

/**
 * Validate a `cache.json` entry (per-file mtime + fingerprint). The
 * cache file is an implementation detail of the freshness check and
 * is intentionally NOT in the public JSON Schemas.
 */
export function isFileMtimeEntry(value: unknown): boolean {
  if (!isRecord(value)) return false;
  return (
    typeof value.file === 'string' &&
    isNumber(value.mtimeMs) &&
    typeof value.hash === 'string'
  );
}

/**
 * Validate a `health.json` artifact against the canonical
 * `health.schema.json`. The legacy `slopIndex` and `categoryScores`
 * fields are kept as optional for backward compat with v0.14
 * readers (per the v0.15.0 U.4 migration notes in
 * `src/structure-types.ts:165`).
 */
export function isHealthFile(value: unknown): value is RepositoryStructureHealth {
  if (!isRecord(value)) return false;
  if (!isVersion3(value.version)) return false;
  if (typeof value.generatedAt !== 'string') return false;
  if (typeof value.workspace !== 'string') return false;
  // v0.15.0 U.4: the four headline scores are now the required
  // ones. The legacy `slopIndex` and `categoryScores` are optional
  // for backward compat.
  if (!isNumber(value.aiQuality)) return false;
  if (!isNumber(value.engineeringHygiene)) return false;
  if (!isNumber(value.security)) return false;
  if (!isNumber(value.repositoryHealth)) return false;
  if (!isRecord(value.issueCounts)) return false;
  const counts = value.issueCounts as { high?: unknown; medium?: unknown; low?: unknown };
  if (!isNumber(counts.high)) return false;
  if (!isNumber(counts.medium)) return false;
  if (!isNumber(counts.low)) return false;
  if (value.slopIndex !== undefined && !isNumber(value.slopIndex)) return false;
  if (value.categoryScores !== undefined) {
    if (!isRecord(value.categoryScores)) return false;
    for (const score of Object.values(value.categoryScores)) {
      if (!isNumber(score)) return false;
    }
  }
  if (value.constitutionDrift !== undefined && !isNumber(value.constitutionDrift)) return false;
  if (value.topOffenseIds !== undefined) {
    if (!isStringArray(value.topOffenseIds)) return false;
  }
  if (value.scanDurationMs !== undefined && !isNumber(value.scanDurationMs)) return false;
  return true;
}
