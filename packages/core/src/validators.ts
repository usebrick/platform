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

function isNonEmptyString(v: unknown): v is string {
  return typeof v === 'string' && v.length > 0;
}

function isUniqueStringArray(v: unknown): v is string[] {
  return isStringArray(v) && new Set(v).size === v.length;
}

function isNonEmptyStringArray(v: unknown): v is string[] {
  return isStringArray(v) && v.every((item) => item.length > 0);
}

function isUniqueNonEmptyStringArray(v: unknown): v is string[] {
  return isUniqueStringArray(v) && v.every((item) => item.length > 0);
}

function isNonNegativeInteger(v: unknown): v is number {
  return typeof v === 'number' && Number.isInteger(v) && v >= 0;
}

function isPositiveInteger(v: unknown): v is number {
  return typeof v === 'number' && Number.isInteger(v) && v >= 1;
}

function isScore(v: unknown): v is number {
  return isNonNegativeInteger(v) && v <= 100;
}

function isDateTime(v: unknown): v is string {
  if (!isNonEmptyString(v)) return false;
  const match = /^(\d{4})-(\d{2})-(\d{2})T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/.exec(v);
  if (!match || Number.isNaN(Date.parse(v))) return false;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const leapYear = year % 400 === 0 || (year % 4 === 0 && year % 100 !== 0);
  const daysInMonth = [31, leapYear ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][month - 1] ?? 0;
  return month >= 1 && month <= 12 && day >= 1 && day <= daysInMonth;
}

function isNumber(v: unknown): v is number {
  return typeof v === 'number' && Number.isFinite(v);
}

const STRUCTURE_PATTERN_CATEGORIES = new Set([
  'stateManagement',
  'dataFetching',
  'uiLibrary',
  'styling',
  'forms',
  'routing',
  'modal',
  'button',
  'api',
  'service',
  'route',
  'ormModel',
]);

export function isStructurePattern(value: unknown): value is StructurePattern {
  if (!isRecord(value)) return false;
  return (
    typeof value.category === 'string' &&
    STRUCTURE_PATTERN_CATEGORIES.has(value.category) &&
    isNonEmptyString(value.name) &&
    isUniqueNonEmptyStringArray(value.imports) &&
    isNonNegativeInteger(value.fileCount)
  );
}

export function isComponentFingerprint(value: unknown): value is ComponentFingerprint {
  if (!isRecord(value)) return false;
  return (
    isNonEmptyString(value.name) &&
    isNonEmptyStringArray(value.files) &&
    value.files.length >= 1 &&
    typeof value.fingerprint === 'string' &&
    /^[0-9a-f]{16}$/.test(value.fingerprint) &&
    isStringArray(value.hooks) &&
    isStringArray(value.props) &&
    new Set(value.hooks).size === value.hooks.length &&
    new Set(value.props).size === value.props.length &&
    isPositiveInteger(value.line) &&
    isPositiveInteger(value.endLine)
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
  if (!isDateTime(value.generatedAt)) return false;
  if (!isNonEmptyString(value.workspace)) return false;
  if (!isNonNegativeInteger(value.scannedFiles)) return false;
  if (!isNonNegativeInteger(value.scanDurationMs)) return false;
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
  if (!isDateTime(value.generatedAt)) return false;
  if (!isNonEmptyString(value.workspace)) return false;
  if (!isRecord(value.declared)) return false;
  if (!Object.values(value.declared).every(isNonEmptyString)) return false;
  if (!isUniqueNonEmptyStringArray(value.forbidden)) return false;
  if (!isUniqueStringArray(value.forbiddenPrefixes)) return false;
  if (!value.forbiddenPrefixes.every((prefix) => /.+\/$/.test(prefix))) return false;
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
  if (!isDateTime(value.generatedAt)) return false;
  if (!isNonEmptyString(value.workspace)) return false;
  // v0.15.0 U.4: the four headline scores are now the required
  // ones. The legacy `slopIndex` and `categoryScores` are optional
  // for backward compat.
  // v0.21.0: aiSlopScore is now the raw amount (0=clean, 100=saturated).
  // The v0.20.1 aiQuality alias was removed because the flip changed
  // its meaning (old aiQuality: 70 = 70 cleaner, new aiSlopScore: 70 =
  // 70% slop). Readers handling v4 health.json files must migrate
  // explicitly: invert the value (100 - x) when reading.
  if (!isScore(value.aiSlopScore)) return false;
  if (!isScore(value.engineeringHygiene)) return false;
  if (!isScore(value.security)) return false;
  if (!isScore(value.repositoryHealth)) return false;
  if (!isRecord(value.issueCounts)) return false;
  const counts = value.issueCounts as { high?: unknown; medium?: unknown; low?: unknown };
  if (!isNonNegativeInteger(counts.high)) return false;
  if (!isNonNegativeInteger(counts.medium)) return false;
  if (!isNonNegativeInteger(counts.low)) return false;
  if (value.slopIndex !== undefined && !isScore(value.slopIndex)) return false;
  if (value.categoryScores !== undefined) {
    if (!isRecord(value.categoryScores)) return false;
    for (const score of Object.values(value.categoryScores)) {
      if (!isScore(score)) return false;
    }
  }
  if (value.constitutionDrift !== undefined && !isNonNegativeInteger(value.constitutionDrift)) return false;
  if (value.topOffenseIds !== undefined) {
    if (!isUniqueNonEmptyStringArray(value.topOffenseIds) || value.topOffenseIds.length > 3) return false;
    if (!value.topOffenseIds.every((id) => /^[a-z]+\/[a-z-]+$/.test(id))) return false;
  }
  if (value.scanDurationMs !== undefined && !isNonNegativeInteger(value.scanDurationMs)) return false;
  if (value.scoreBasis !== undefined) {
    if (!isRecord(value.scoreBasis)) return false;
    const basis = value.scoreBasis as {
      denominator?: unknown;
      analyzedFiles?: unknown;
      issueSet?: unknown;
      suppressedIssueCount?: unknown;
      parseErrorCount?: unknown;
    };
    if (!isNonNegativeInteger(basis.denominator)) return false;
    if (!isNonNegativeInteger(basis.analyzedFiles)) return false;
    if (basis.issueSet !== 'effective') return false;
    if (!isNonNegativeInteger(basis.suppressedIssueCount)) return false;
    if (!isNonNegativeInteger(basis.parseErrorCount)) return false;
  }
  // v0.18.2: optional Bayesian composite aggregate. Validate the
  // shape when present (G6 schema/writer/validator coherence).
  // Omitted in v0.18.1 and earlier health.json files; readers
  // should treat it as informational.
  if (value.compositeScore !== undefined) {
    if (!isRecord(value.compositeScore)) return false;
    const cs = value.compositeScore as { mean?: unknown; max?: unknown; tier?: unknown; fileCount?: unknown };
    if (typeof cs.mean !== 'number' || !Number.isFinite(cs.mean) || cs.mean < 0 || cs.mean > 1) return false;
    if (typeof cs.max !== 'number' || !Number.isFinite(cs.max) || cs.max < 0 || cs.max > 1) return false;
    if (cs.tier !== 'LIKELY_HUMAN' && cs.tier !== 'INCONCLUSIVE' && cs.tier !== 'LIKELY_AI' && cs.tier !== 'VERY_LIKELY_AI') return false;
    if (!isNonNegativeInteger(cs.fileCount)) return false;
  }
  return true;
}
