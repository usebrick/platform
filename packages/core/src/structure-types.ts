/**
 * @usebrick-dev/core — schema-version constant + cache entry type.
 *
 * The full schema-derived types (InventoryFile, ConstitutionFile,
 * HealthFile, Pattern, Component, Category) are generated from
 * `packages/core/schemas/v1/*.schema.json` into `src/generated/`.
 * The generated types are the public API for the on-disk shapes.
 *
 * This file now contains only the bits with no JSON-Schema
 * counterpart:
 *
 *   - `STRUCTURE_SCHEMA_VERSION` — the version string constant
 *     every artifact's `version` field is pinned against. Bumping
 *     it is a breaking change for cross-language consumers.
 *   - `FileMtimeEntry` — the `cache.json` shape. The cache file is
 *     an implementation detail of the freshness check and is
 *     intentionally NOT in the public schemas.
 *
 * The runtime validators (`isInventoryFile`, `isConstitutionFile`,
 * `isHealthFile`, `isFileMtimeEntry`, `isStructurePattern`,
 * `isComponentFingerprint`) live in `./validators.ts` and are the
 * load-time check the public loaders run parsed JSON through.
 *
 * v0.17.4 (R-H4 closeout): deleted `InventoryFile`, `ConstitutionFile`,
 * `HealthFile`, `StructureCategory`, `StructurePattern`, and
 * `ComponentFingerprint` from this file. They were hand-written
 * duplicates of types already generated from the canonical JSON
 * Schemas. The hand-written copies were systematically looser
 * (no `Pattern` enum check on `category`, no `fingerprint` regex,
 * no ISO-8601 timestamp check) and could drift from the schema
 * without anyone noticing. Consumers now import the generated
 * types from `@usebrick/core` (re-exported from `./generated/*`).
 */

export const STRUCTURE_SCHEMA_VERSION = '5' as const;

/**
 * Per-file mtime + fingerprint for the incremental refresh path.
 * Stored as `.slopbrick/cache.json` (not part of the public schema). This is
 * distinct from SlopBrick's root-level `.slopbrick-cache.json` incremental
 * scan cache, which has a different format.
 */
export interface FileMtimeEntry {
  /** Absolute path of the scanned file. */
  file: string;
  /** mtime in milliseconds since epoch. */
  mtimeMs: number;
  /** Hash of the file content at scan time. */
  hash: string;
}

// Re-export the validators from their new home. Kept here as a
// backward-compat shim so existing imports of the form
// `import { isInventoryFile } from '@usebrick/core'` continue to
// work after the validators move to `./validators.ts`.
//
// New code should import the validators directly from
// `./validators` (or from `@usebrick/core`, which re-exports them).
export {
  isStructurePattern,
  isComponentFingerprint,
  isInventoryFile,
  isConstitutionFile,
  isFileMtimeEntry,
  isHealthFile,
} from './validators';
