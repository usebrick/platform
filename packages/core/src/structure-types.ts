/**
 * @usebrick-dev/core — Repository Memory Platform schemas.
 *
 * The `.slop-audit/` directory persists three artifacts that any
 * usebrick.dev tool can read or write:
 *
 *   inventory.json     — detected pattern inventory + component fingerprints
 *   constitution.json  — declared constitution (mirrors config.constitution)
 *   cache.json         — per-file mtime + hash map (drives isInventoryFresh)
 *
 * The cache file is intentionally NOT part of the public schema; it is an
 * implementation detail of the freshness check.
 *
 * Schema is versioned via the top-level `version` field.
 *
 *   '1' — first version, lived in `.slop-audit/` (slop-audit pre-v0.11.0)
 *   '2' — current version, lives in `.slopbrick/` (slopbrick v0.11.0+)
 *
 * Bump the version when adding/removing fields OR when the on-disk
 * directory name changes. Older binaries reading newer files treat
 * mismatched versions as "schema unknown" and return null from the
 * loader. Migration: `slopbrick migrate` rewrites a v1 project to v2.
 */

export const MEMORY_SCHEMA_VERSION = '2' as const;

/** Categories tracked in the inventory. Mirrors Constitution field
 * names so the same key set is used for declared vs detected. */
export type MemoryCategory =
  | 'stateManagement'
  | 'dataFetching'
  | 'uiLibrary'
  | 'styling'
  | 'forms'
  | 'routing'
  | 'modal'
  | 'button'
  | 'api'
  | 'service'
  | 'route'
  | 'ormModel';

/**
 * A single detected pattern: which category, which canonical name,
 * which bare import specifiers in this project contribute to it.
 */
export interface MemoryPattern {
  category: MemoryCategory;
  /** Canonical pattern name (e.g. "zustand", "@radix-ui/react-dialog"). */
  name: string;
  /** Bare import specifiers in the project that matched this pattern. */
  imports: string[];
  /** Number of files that import any of the matching specifiers. */
  fileCount: number;
}

/**
 * Fingerprint of a single canonical component (Button, Modal, etc.)
 * derived from its props / hooks / signature. Two components with
 * the same fingerprint should be deduplicated — same component,
 * just imported in different files.
 */
export interface ComponentFingerprint {
  /** Canonical component name (PascalCase as exported). */
  name: string;
  /** Files in the project that export this component. */
  files: string[];
  /** Stable hash for dedup + cross-project similarity. */
  fingerprint: string;
  /** Hooks the component uses (e.g. `useState`, `useEffect`). */
  hooks: string[];
  /** Prop names the component accepts. */
  props: string[];
  /** Line range of the component definition in `files[0]`. */
  line: number;
  endLine: number;
}

/**
 * .slop-audit/inventory.json schema (machine-readable).
 */
export interface InventoryFile {
  /** Schema version. Bump when adding/removing fields. */
  version: typeof MEMORY_SCHEMA_VERSION;
  /** ISO timestamp of when this inventory was generated. */
  generatedAt: string;
  /** Absolute path of the scanned workspace (informational only). */
  workspace: string;
  /** Number of files included in the scan. */
  scannedFiles: number;
  /** Duration of the scan in milliseconds (informational). */
  scanDurationMs: number;
  /** Detected patterns grouped by category, sorted by fileCount desc. */
  patterns: MemoryPattern[];
  /** Component fingerprints, sorted by name. */
  components: ComponentFingerprint[];
}

/**
 * .slop-audit/constitution.json schema (machine-readable).
 */
export interface ConstitutionFile {
  version: typeof MEMORY_SCHEMA_VERSION;
  generatedAt: string;
  workspace: string;
  /**
   * Declared canonical patterns per category. Empty string or omitted
   * means "we deliberately don't use this category."
   */
  declared: Partial<Record<MemoryCategory, string>>;
  /** Packages that any PR introducing must fail (deny-list). */
  forbidden: string[];
  /** Scope prefix that any PR introducing must fail (e.g. "@scope/"). */
  forbiddenPrefixes: string[];
}

/**
 * Per-file mtime + fingerprint for the incremental refresh path.
 * Stored as `.slop-audit/cache.json` (not part of the public schema).
 */
export interface FileMtimeEntry {
  /** Absolute path of the scanned file. */
  file: string;
  /** mtime in milliseconds since epoch. */
  mtimeMs: number;
  /** Hash of the file content at scan time. */
  hash: string;
}

/**
 * .slopbrick/health.json schema (machine-readable).
 *
 * Headline repository health snapshot from a single slopbrick scan.
 * This is the artifact dashboards, CI status checks, and the website
 * project page consume. Compared to `InventoryFile` (which describes
 * WHAT exists) and `ConstitutionFile` (which describes WHAT SHOULD
 * EXIST), `HealthFile` describes HOW GOOD the current state is.
 *
 * All fields are derived from a `ProjectReport`; the writer is
 * `saveHealth()` in `memory.ts`. Schema version bumps are
 * coordinated with `health.schema.json`.
 */
export interface HealthFile {
  /** Schema version. Bump when adding/removing fields. */
  version: typeof MEMORY_SCHEMA_VERSION;
  /** ISO timestamp of when this health snapshot was generated. */
  generatedAt: string;
  /** Absolute path of the scanned workspace (informational only). */
  workspace: string;
  /** Slop Index (0-100, lower is better). The headline score. */
  slopIndex: number;
  /** Per-category scores. Each is 0-100; exact interpretation
   *  depends on the category. */
  categoryScores: Record<string, number>;
  /** Number of issues per severity level. */
  issueCounts: { high: number; medium: number; low: number };
  /** Number of constitution violations detected in this scan. */
  constitutionDrift?: number;
  /** Top 3 most-firing rule IDs, sorted by issue count desc. */
  topOffenseIds?: string[];
  /** How long the scan took in milliseconds. */
  scanDurationMs?: number;
}

// ---------------------------------------------------------------------------
// Validators — every loader runs the parsed JSON through these to refuse
// silently corrupted or version-mismatched files. Mismatch returns `null`
// from the public loaders rather than throwing, so callers degrade
// gracefully (e.g. rebuild the inventory instead of crashing).
// ---------------------------------------------------------------------------

export function isMemoryPattern(value: unknown): value is MemoryPattern {
  if (typeof value !== 'object' || value === null) return false;
  const v = value as Partial<MemoryPattern>;
  return (
    typeof v.category === 'string' &&
    typeof v.name === 'string' &&
    Array.isArray(v.imports) &&
    v.imports.every((i) => typeof i === 'string') &&
    typeof v.fileCount === 'number'
  );
}

export function isComponentFingerprint(value: unknown): value is ComponentFingerprint {
  if (typeof value !== 'object' || value === null) return false;
  const v = value as Partial<ComponentFingerprint>;
  return (
    typeof v.name === 'string' &&
    Array.isArray(v.files) &&
    v.files.every((f) => typeof f === 'string') &&
    typeof v.fingerprint === 'string' &&
    Array.isArray(v.hooks) &&
    v.hooks.every((h) => typeof h === 'string') &&
    Array.isArray(v.props) &&
    v.props.every((p) => typeof p === 'string') &&
    typeof v.line === 'number' &&
    typeof v.endLine === 'number'
  );
}

export function isInventoryFile(value: unknown): value is InventoryFile {
  if (typeof value !== 'object' || value === null) return false;
  const v = value as Partial<InventoryFile>;
  return (
    v.version === MEMORY_SCHEMA_VERSION &&
    typeof v.generatedAt === 'string' &&
    typeof v.workspace === 'string' &&
    typeof v.scannedFiles === 'number' &&
    typeof v.scanDurationMs === 'number' &&
    Array.isArray(v.patterns) &&
    Array.isArray(v.components) &&
    v.patterns.every(isMemoryPattern) &&
    v.components.every(isComponentFingerprint)
  );
}

export function isConstitutionFile(value: unknown): value is ConstitutionFile {
  if (typeof value !== 'object' || value === null) return false;
  const v = value as Partial<ConstitutionFile>;
  return (
    v.version === MEMORY_SCHEMA_VERSION &&
    typeof v.generatedAt === 'string' &&
    typeof v.workspace === 'string' &&
    typeof v.declared === 'object' &&
    v.declared !== null &&
    Array.isArray(v.forbidden) &&
    v.forbidden.every((f) => typeof f === 'string') &&
    Array.isArray(v.forbiddenPrefixes) &&
    v.forbiddenPrefixes.every((f) => typeof f === 'string')
  );
}

export function isFileMtimeEntry(value: unknown): value is FileMtimeEntry {
  if (typeof value !== 'object' || value === null) return false;
  const v = value as Partial<FileMtimeEntry>;
  return (
    typeof v.file === 'string' &&
    typeof v.mtimeMs === 'number' &&
    typeof v.hash === 'string'
  );
}

export function isHealthFile(value: unknown): value is HealthFile {
  if (typeof value !== 'object' || value === null) return false;
  const v = value as Partial<HealthFile>;
  if (v.version !== MEMORY_SCHEMA_VERSION) return false;
  if (typeof v.generatedAt !== 'string') return false;
  if (typeof v.workspace !== 'string') return false;
  if (typeof v.slopIndex !== 'number') return false;
  if (typeof v.categoryScores !== 'object' || v.categoryScores === null) return false;
  if (typeof v.issueCounts !== 'object' || v.issueCounts === null) return false;
  const counts = v.issueCounts as { high?: unknown; medium?: unknown; low?: unknown };
  if (typeof counts.high !== 'number') return false;
  if (typeof counts.medium !== 'number') return false;
  if (typeof counts.low !== 'number') return false;
  if (v.constitutionDrift !== undefined && typeof v.constitutionDrift !== 'number') return false;
  if (v.topOffenseIds !== undefined) {
    if (!Array.isArray(v.topOffenseIds)) return false;
    if (!v.topOffenseIds.every((id) => typeof id === 'string')) return false;
  }
  if (v.scanDurationMs !== undefined && typeof v.scanDurationMs !== 'number') return false;
  return true;
}
