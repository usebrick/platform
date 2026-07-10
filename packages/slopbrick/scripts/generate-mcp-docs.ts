/**
 * Keep the public MCP documentation anchored to the runtime registry.
 *
 * Usage:
 *   pnpm --filter slopbrick generate:mcp-docs  # verify (default)
 *   pnpm --filter slopbrick generate:mcp-docs -- --write
 *
 * The surrounding MCP guide remains hand-written; only the small registry
 * block is generated. This catches renamed tools and input-schema drift
 * without making the prose documentation a generated monolith.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { TOOL_DEFINITIONS, type ToolDefinition } from '../src/mcp/tools.js';

const DOC_PATH = resolve(import.meta.dirname, '../docs/MCP.md');
const BEGIN = '<!-- slopbrick:mcp-registry:begin -->';
const END = '<!-- slopbrick:mcp-registry:end -->';

function names(definitions: readonly ToolDefinition[]): string {
  return definitions
    .filter((tool) => !tool.deprecated)
    .map((tool) => tool.name)
    .join(', ');
}

function formatFields(tool: ToolDefinition): string {
  const fields = Object.keys(tool.inputSchema.properties);
  if (fields.length === 0) return 'none';
  const required = new Set(tool.inputSchema.required ?? []);
  return fields.map((field) => `${field}${required.has(field) ? ' (required)' : ''}`).join(', ');
}

function generatedBlock(definitions: readonly ToolDefinition[]): string {
  const canonical = definitions.filter((tool) => !tool.deprecated);
  const rows = canonical.map((tool) =>
    `| \`${tool.name}\` | ${formatFields(tool)} | ${tool.description.replace(/\|/g, '\\|')} |`,
  );
  return [
    BEGIN,
    '## Runtime registry (generated)',
    '',
    'This table is generated from `TOOL_DEFINITIONS`; it currently exposes ' +
      `${canonical.length} canonical tools: ${names(definitions)}.`,
    '',
    '| Tool | Inputs | Runtime description |',
    '| --- | --- | --- |',
    ...rows,
    '',
    END,
  ].join('\n');
}

function replaceBlock(document: string, block: string): string {
  const begin = document.indexOf(BEGIN);
  const end = document.indexOf(END);
  if (begin === -1 && end === -1) {
    const marker = '## Quick start';
    const at = document.indexOf(marker);
    if (at === -1) throw new Error(`Cannot place generated MCP registry: missing ${marker}`);
    return `${document.slice(0, at)}${block}\n\n${document.slice(at)}`;
  }
  if (begin === -1 || end === -1 || end < begin) {
    throw new Error('MCP docs contain an incomplete generated-registry marker pair');
  }
  return `${document.slice(0, begin)}${block}${document.slice(end + END.length)}`;
}

export function verifyMcpDocsDocument(document: string): string {
  const expected = generatedBlock(TOOL_DEFINITIONS);
  const actual = replaceBlock(document, expected);
  const canonical = TOOL_DEFINITIONS.filter((tool) => !tool.deprecated);
  for (const tool of canonical) {
    if (!document.includes(`#### \`${tool.name}\``)) {
      throw new Error(`MCP docs are missing the canonical tool section: ${tool.name}`);
    }
  }
  return actual;
}

function main(): void {
  const document = readFileSync(DOC_PATH, 'utf8');
  const actual = verifyMcpDocsDocument(document);
  if (process.argv.includes('--write')) {
    if (actual !== document) writeFileSync(DOC_PATH, actual, 'utf8');
    return;
  }
  if (actual !== document) {
    throw new Error('MCP.md runtime registry is stale. Run `pnpm --filter slopbrick generate:mcp-docs -- --write`.');
  }
}

const invokedPath = process.argv[1] ? pathToFileURL(resolve(process.argv[1])).href : undefined;
if (invokedPath === import.meta.url) {
  try {
    main();
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}
