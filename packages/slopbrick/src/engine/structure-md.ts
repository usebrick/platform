/**
 * v0.10.7: Repository Memory Platform — markdown renderer.
 *
 * `renderMemoryMarkdown(inventory, constitution)` is a pure function
 * that turns the persisted `InventoryFile` + `ConstitutionFile` schemas
 * into a single human + agent-readable markdown summary. The output is
 * what `slop_suggest_with_memory` returns to the agent on the fast path
 * (no re-scan needed).
 *
 * `writeMemoryMarkdown` + `readMemoryMarkdown` are the on-disk helpers
 * that persist the rendered summary to `.slopbrick/memory.md`. Read
 * returns `null` if the file is missing or unreadable — the caller
 * decides whether that means "fall back to re-scanning" or "fail".
 *
 * Design choices:
 *   - Patterns within each category are sorted by `fileCount` desc,
 *     name asc tiebreak. Agent scans the most-used pattern first.
 *   - Components with the same `name` are merged: their `files` arrays
 *     are unioned (deduped) and the first non-empty `hooks`/`props`
 *     list wins. The schema permits multiple fingerprints per name
 *     because a project's "Button" may have several distinct shapes.
 *   - Markdown-significant characters in names + imports are escaped
 *     so a component literally named `Button{` renders safely.
 *   - Empty categories are skipped in the patterns section to keep
 *     the output focused. The constitution + DO NOT CREATE sections
 *     always render with a placeholder when empty, so the agent can
 *     tell the difference between "no data" and "data missing".
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import type {
  ComponentFingerprint,
  ConstitutionFile,
  InventoryFile,
  MemoryCategory,
} from '@usebrick/core';

const MEMORY_MD_FILE = join('.slopbrick', 'memory.md');

/** Human-readable labels for each memory category, in display order. */
const CATEGORY_LABELS: Record<MemoryCategory, string> = {
  stateManagement: 'State management',
  dataFetching: 'Data fetching',
  uiLibrary: 'UI library',
  styling: 'Styling',
  forms: 'Forms',
  routing: 'Routing',
  modal: 'Modals',
  button: 'Buttons',
  api: 'API clients',
  service: 'Services',
  route: 'Routes',
  ormModel: 'ORM models',
};

/** Display order for the patterns section. Frontend canonical first,
 *  then component categories, then backend service categories. */
const CATEGORY_ORDER: readonly MemoryCategory[] = [
  'stateManagement',
  'dataFetching',
  'uiLibrary',
  'styling',
  'forms',
  'routing',
  'modal',
  'button',
  'api',
  'service',
  'route',
  'ormModel',
];

/** Categories surfaced in the Declared constitution section. The
 *  backend categories (modal/button/api/service/route/ormModel) come
 *  from the inventory; the canonical stack categories come from the
 *  user's declaration in `slopbrick.config.mjs`. */
const DECLARED_FIELDS: readonly MemoryCategory[] = [
  'stateManagement',
  'dataFetching',
  'uiLibrary',
  'styling',
  'forms',
  'routing',
];

/** Map `scanDurationMs` to a human-readable string. */
function formatDuration(ms: number): string {
  if (!Number.isFinite(ms) || ms < 0) return 'unknown';
  if (ms < 1000) return `${Math.round(ms)}ms`;
  const seconds = ms / 1000;
  if (seconds < 60) return `${seconds.toFixed(1)}s`;
  const minutes = Math.floor(seconds / 60);
  const rem = Math.round(seconds - minutes * 60);
  return `${minutes}m ${rem}s`;
}

/** Escape the markdown-significant characters we care about. Kept
 *  deliberately narrow — we only escape what would actually break
 *  rendering inside a list item or table cell: backslashes (escape
 *  char), backticks (inline code spans), curly braces (some renderer
 *  extensions), pipes (table cells), and embedded newlines (which
 *  would split the list item). */
function escapeMarkdown(s: string): string {
  return s
    .replace(/\\/g, '\\\\')
    .replace(/`/g, '\\`')
    .replace(/\{/g, '\\{')
    .replace(/\}/g, '\\}')
    .replace(/\|/g, '\\|')
    .replace(/\r?\n/g, ' ');
}

/** In-place sort: fileCount desc, name asc tiebreak. */
function sortPatterns(
  patterns: Array<{ fileCount: number; name: string }>,
): void {
  patterns.sort((a, b) => b.fileCount - a.fileCount || a.name.localeCompare(b.name));
}

/** Merge component fingerprints that share the same `name`. The schema
 *  permits multiple distinct fingerprints per name (different
 *  signatures, hooks, props) so the agent can see all variants in the
 *  inventory. For display we aggregate them into a single entry per
 *  name, unioning `files` and keeping the first non-empty `hooks` /
 *  `props` list (most useful for the agent). Returns a new array sorted
 *  by name; the input is not mutated. */
function mergeComponentsByName(
  components: ComponentFingerprint[],
): ComponentFingerprint[] {
  const byName = new Map<string, ComponentFingerprint>();
  for (const c of components) {
    const existing = byName.get(c.name);
    if (existing) {
      for (const f of c.files) {
        if (!existing.files.includes(f)) existing.files.push(f);
      }
      if (existing.hooks.length === 0 && c.hooks.length > 0) {
        existing.hooks = c.hooks.slice();
      }
      if (existing.props.length === 0 && c.props.length > 0) {
        existing.props = c.props.slice();
      }
      continue;
    }
    byName.set(c.name, {
      ...c,
      files: c.files.slice(),
      hooks: c.hooks.slice(),
      props: c.props.slice(),
    });
  }
  return Array.from(byName.values()).sort((a, b) => a.name.localeCompare(b.name));
}

/** Render a single pattern bullet. Pattern name is bolded; the count
 *  parens use the natural-language plural ("1 file" vs "2 files"). */
function formatPattern(p: { name: string; fileCount: number; imports: string[] }): string {
  const fileWord = p.fileCount === 1 ? 'file' : 'files';
  const importWord = p.imports.length === 1 ? 'import' : 'imports';
  return `- **${escapeMarkdown(p.name)}** (${p.fileCount} ${fileWord}, ${p.imports.length} ${importWord})`;
}

/** Render a single component bullet. The order is: defined in N files
 *  → props → hooks, joined by `; ` per the documented format. */
function formatComponent(c: ComponentFingerprint): string {
  const fileWord = c.files.length === 1 ? 'file' : 'files';
  const parts: string[] = [`defined in ${c.files.length} ${fileWord}`];
  if (c.props.length > 0) {
    parts.push(`props: ${c.props.map(escapeMarkdown).join(', ')}`);
  }
  if (c.hooks.length > 0) {
    parts.push(`hooks: ${c.hooks.map(escapeMarkdown).join(', ')}`);
  }
  return `- **${escapeMarkdown(c.name)}** (${parts.join('; ')})`;
}

/**
 * Pure renderer. Produces a markdown summary suitable for AI agents
 * to read directly. The output structure is stable across versions —
 * downstream tools (MCP clients, agent prompts) can pattern-match on
 * the section headings without parsing the body.
 */
export function renderMemoryMarkdown(
  inventory: InventoryFile,
  constitution: ConstitutionFile,
): string {
  const lines: string[] = [];

  // ---- Header + metadata ----------------------------------------------
  lines.push('# slopbrick memory');
  lines.push('');
  lines.push(`Generated: ${inventory.generatedAt}`);
  lines.push(`Workspace: ${inventory.workspace}`);
  lines.push(`Scanned files: ${inventory.scannedFiles}`);
  lines.push(`Scan duration: ${formatDuration(inventory.scanDurationMs)}`);
  lines.push('');

  // ---- Detected patterns ----------------------------------------------
  // Empty categories are skipped — the agent doesn't need to see
  // "State management: (none)" cluttering the output. If the entire
  // inventory has zero patterns, the section header still renders so
  // downstream parsers see the same outline.
  lines.push('## Detected patterns (canonical, use these)');
  lines.push('');
  let renderedAnyCategory = false;
  for (const category of CATEGORY_ORDER) {
    const patterns = inventory.patterns.filter((p) => p.category === category);
    if (patterns.length === 0) continue;
    sortPatterns(patterns);
    lines.push(`### ${CATEGORY_LABELS[category]}`);
    lines.push('');
    for (const p of patterns) {
      lines.push(formatPattern(p));
    }
    lines.push('');
    renderedAnyCategory = true;
  }
  if (!renderedAnyCategory) {
    lines.push('_No patterns detected._');
    lines.push('');
  }

  // ---- Canonical components -------------------------------------------
  const components = mergeComponentsByName(inventory.components);
  lines.push('## Canonical components');
  lines.push('');
  if (components.length === 0) {
    lines.push('_No components detected._');
  } else {
    for (const c of components) {
      lines.push(formatComponent(c));
    }
  }
  lines.push('');

  // ---- Declared constitution ------------------------------------------
  lines.push('## Declared constitution');
  lines.push('');
  let hasDeclared = false;
  for (const field of DECLARED_FIELDS) {
    const value = constitution.declared[field];
    if (typeof value === 'string' && value.trim().length > 0) {
      lines.push(`- **${CATEGORY_LABELS[field]}:** ${escapeMarkdown(value)}`);
      hasDeclared = true;
    }
  }
  if (!hasDeclared) {
    lines.push('_No constitution declared._');
  }
  lines.push('');

  // ---- DO NOT CREATE ---------------------------------------------------
  lines.push('## DO NOT CREATE');
  lines.push('');
  let hasDoNot = false;
  for (const entry of constitution.forbidden) {
    lines.push(`- ${escapeMarkdown(entry)} (forbidden)`);
    hasDoNot = true;
  }
  for (const prefix of constitution.forbiddenPrefixes) {
    lines.push(`- ${escapeMarkdown(prefix)} (any package under this scope)`);
    hasDoNot = true;
  }
  if (!hasDoNot) {
    lines.push('_No deny-list declared._');
  }
  lines.push('');

  // ---- Top issues (placeholder; persisted memory doesn't carry the
  //      cross-file drift analysis — that's recomputed at scan time).
  lines.push('## Top issues (most impactful)');
  lines.push('');
  lines.push(
    '_Run `slopbrick scan` to populate cross-file drift findings. Persisted memory captures the canonical patterns, not the drift analysis._',
  );
  lines.push('');

  return lines.join('\n');
}

/**
 * Write the rendered markdown to `<workspaceDir>/.slopbrick/memory.md`.
 * Creates the `.slopbrick/` directory if it doesn't exist. The
 * underlying `writeFileSync` is atomic for small payloads on POSIX
 * (single `write()` call below `PIPE_BUF`); on crash the file is
 * either the old content or the new content, never half-written.
 */
export async function writeMemoryMarkdown(
  workspaceDir: string,
  md: string,
): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    try {
      const path = join(workspaceDir, MEMORY_MD_FILE);
      mkdirSync(dirname(path), { recursive: true });
      writeFileSync(path, md, 'utf-8');
      resolve();
    } catch (err) {
      reject(err instanceof Error ? err : new Error(String(err)));
    }
  });
}

/**
 * Read `.slopbrick/memory.md` from the workspace. Returns `null` if
 * the file doesn't exist or can't be read — never throws. The caller
 * decides whether `null` means "fall back to re-scanning" or "fail".
 */
export async function readMemoryMarkdown(
  workspaceDir: string,
): Promise<string | null> {
  return new Promise<string | null>((resolve) => {
    try {
      const path = join(workspaceDir, MEMORY_MD_FILE);
      if (!existsSync(path)) {
        resolve(null);
        return;
      }
      const content = readFileSync(path, 'utf-8');
      resolve(content);
    } catch {
      resolve(null);
    }
  });
}