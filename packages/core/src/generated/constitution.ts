// AUTO-GENERATED from constitution.schema.json. Do not hand-edit.

/**
 * Declared project constitution. Mirrors the user-facing `constitution` block in slopbrick.config.mjs. Written by slopbrick to .slopbrick/constitution.json. Read by slopbrick, the constitution-enforcement gate, stackpick (for pattern-suggestion enforcement), and any future tool that needs to know what the project has declared off-limits.
 */
export interface RepositoryStructureConstitution {
  /**
   * Schema version. Bump when adding/removing fields. Currently "3".
   */
  version: "3";
  /**
   * ISO 8601 timestamp of when this constitution was generated.
   */
  generatedAt: string;
  /**
   * Absolute path of the workspace this constitution applies to.
   */
  workspace: string;
  /**
   * Declared canonical pattern per category. Empty or omitted means 'we deliberately don't use this category.' The category keys match the `category` enum in inventory.schema.json.
   */
  declared: {
    [k: string]: string;
  };
  /**
   * Bare package specifiers that any PR introducing must fail (deny-list). Matched against import strings during constitution enforcement.
   */
  forbidden: string[];
  /**
   * Scope prefixes that any PR introducing must fail (e.g. '@scope/'). Matched as prefix against import strings.
   */
  forbiddenPrefixes: string[];
}
