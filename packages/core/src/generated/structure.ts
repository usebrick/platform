// AUTO-GENERATED from structure.schema.json. Do not hand-edit.

/**
 * This is the structured JSON projection of the repository structure summary. It is not the on-disk .slopbrick/structure.md file: that Markdown artifact is a derived human- and agent-readable rendering of inventory.json and constitution.json. Producers that emit the JSON projection MUST satisfy this schema; consumers of structure.md MUST treat the Markdown headings and body as a presentation format rather than validating the Markdown as JSON.
 */
export interface RepositoryStructureStructuredProjection {
  /**
   * Metadata in the structured JSON projection. The derived structure.md renderer may present these values as Markdown/YAML frontmatter, but structure.md itself is not schema input.
   */
  frontmatter: {
    /**
     * Structured projection format version. Currently "5".
     */
    schemaVersion: "5";
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
   * Ordered sections in the structured JSON projection. A Markdown renderer may map these section IDs to headings; readers of structure.md MUST tolerate presentation-only wording changes.
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
