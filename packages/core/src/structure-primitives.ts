/** Leaf-level repository-structure primitives shared by types and validators. */
export const STRUCTURE_SCHEMA_VERSION = '5' as const;

/** Incremental freshness-cache entry; not part of the public JSON schemas. */
export interface FileMtimeEntry {
  /** Absolute path of the scanned file. */
  file: string;
  /** mtime in milliseconds since epoch. */
  mtimeMs: number;
  /** Hash of the file content at scan time. */
  hash: string;
}
