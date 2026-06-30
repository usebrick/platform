// AUTO-GENERATED from inventory.schema.json. Do not hand-edit.

/**
 * Memory category. Must match one of the canonical Constitution field names so the same key set is used for declared vs detected.
 */
export type Category =
  | "stateManagement"
  | "dataFetching"
  | "uiLibrary"
  | "styling"
  | "forms"
  | "routing"
  | "modal"
  | "button"
  | "api"
  | "service"
  | "route"
  | "ormModel";

/**
 * Detected pattern inventory + component fingerprints for a scanned workspace. Written by slopbrick to .slopbrick/inventory.json. Read by slopbrick, stackpick, gir, MCP server, and any future usebrick.dev tool.
 */
export interface RepositoryMemoryInventory {
  /**
   * Schema version. Currently '2'. Bump when adding/removing fields or changing the on-disk directory name.
   */
  version: "2";
  /**
   * ISO 8601 timestamp of when this inventory was generated.
   */
  generatedAt: string;
  /**
   * Absolute path of the scanned workspace. Informational only.
   */
  workspace: string;
  /**
   * Number of files included in the scan.
   */
  scannedFiles: number;
  /**
   * Duration of the scan in milliseconds.
   */
  scanDurationMs: number;
  /**
   * Detected patterns grouped by category, sorted by fileCount desc within each category.
   */
  patterns: Pattern[];
  /**
   * Component fingerprints, sorted by name.
   */
  components: Component[];
}
export interface Pattern {
  category: Category;
  /**
   * Canonical pattern name (e.g. 'zustand', '@radix-ui/react-dialog').
   */
  name: string;
  /**
   * Bare import specifiers in the project that matched this pattern.
   */
  imports: string[];
  /**
   * Number of files that import any of the matching specifiers.
   */
  fileCount: number;
}
export interface Component {
  /**
   * Canonical component name (PascalCase as exported).
   */
  name: string;
  /**
   * Files in the project that export this component.
   *
   * @minItems 1
   */
  files: [string, ...string[]];
  /**
   * Stable hash for dedup + cross-project similarity (16-char hex prefix of sha256).
   */
  fingerprint: string;
  /**
   * React hooks the component uses.
   */
  hooks: string[];
  /**
   * Prop names the component accepts.
   */
  props: string[];
  /**
   * 1-indexed line of the component definition's start.
   */
  line: number;
  /**
   * 1-indexed line of the component definition's end.
   */
  endLine: number;
}
