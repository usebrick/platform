// AUTO-GENERATED from structure.schema.json. Do not hand-edit.

/**
 * structure.md is not structured JSON — it's a markdown file. This schema describes the section structure that renderers MUST emit and readers MUST tolerate. The actual content of each section is free-form markdown.
 */
export interface RepositoryStructureStructureMarkdown {
  /**
   * YAML frontmatter at the top of memory.md. Machine-parseable metadata about the rendered summary.
   */
  frontmatter: {
    /**
     * memory.md format version. Currently '2'.
     */
    schemaVersion: "2";
    generatedAt: string;
    workspace: string;
    /**
     * Schema version of the inventory this memory.md was rendered from.
     */
    inventoryVersion?: string;
    /**
     * Schema version of the constitution this memory.md was rendered from.
     */
    constitutionVersion?: string;
  };
  /**
   * Ordered sections in memory.md. Renderers MUST emit sections in this order. Readers MUST tolerate missing optional sections.
   *
   * @minItems 1
   */
  sections: [
    {
      id:
        | "patterns"
        | "components"
        | "constitution-declared"
        | "constitution-forbidden"
        | "do-not-create"
        | "migrate-notice";
      title: string;
      /**
       * Free-form markdown body. Renderers should use bullet lists for pattern/component listings.
       */
      body?: string;
    },
    ...{
      id:
        | "patterns"
        | "components"
        | "constitution-declared"
        | "constitution-forbidden"
        | "do-not-create"
        | "migrate-notice";
      title: string;
      /**
       * Free-form markdown body. Renderers should use bullet lists for pattern/component listings.
       */
      body?: string;
    }[]
  ];
}
