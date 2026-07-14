/** Pure status helpers shared by the codegen freshness check and its tests. */

export function mergeCodegenChangePaths(...pathLists: ReadonlyArray<ReadonlyArray<string>>): string[] {
  return [...new Set(pathLists.flat().map((path) => path.trim()).filter(Boolean))].sort();
}

function schemaToGeneratedName(schemaName: string): string {
  return schemaName.endsWith('.schema.json')
    ? `${schemaName.slice(0, -'.schema.json'.length)}.ts`
    : schemaName;
}

export function findSchemaGenerationGaps(
  schemaNames: ReadonlyArray<string>,
  generatedNames: ReadonlyArray<string>,
): { missing: string[]; orphaned: string[] } {
  const expected = new Set(schemaNames.map(schemaToGeneratedName));
  const actual = new Set(generatedNames);
  return {
    missing: [...expected].filter((name) => !actual.has(name)).sort(),
    orphaned: [...actual].filter((name) => !expected.has(name)).sort(),
  };
}
