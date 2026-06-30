// AUTO-GENERATED from structure.schema.json. Do not hand-edit.

/**
 * structure.md is not structured JSON — it's a markdown file. This schema describes the section structure that renderers MUST emit and readers MUST tolerate. The actual content of each section is free-form markdown.
 */
export interface RepositoryStructureStructureMarkdown {
  /**
   * YAML frontmatter at the top of structure.md. Machine-parseable metadata about the rendered summary.
   */
  frontmatter: {
    /**
     * structure.md format version. Currently '3' (bumped in v0.15.0 rebrand from memory.md → structure.md).
     */
    schemaVersion: "3";
    generatedAt: string;
    workspace: string;
    /**
     * Schema version of the inventory this structure.md was rendered from.
     */
    inventoryVersion?: string;
    /**
     * Schema version of the constitution this structure.md was rendered from.
     */
    constitutionVersion?: string;
  };
  /**
   * Ordered sections in structure.md. Renderers MUST emit sections in this order. Readers MUST tolerate missing optional sections.
   */
  sections: {
    id: string;
    title: string;
    body?: string;
  }[];
}
