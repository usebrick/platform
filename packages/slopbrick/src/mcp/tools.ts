// Round 17: MCP tool implementations.

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { scanFile } from '../engine/worker.js';
import { buildPatternInventory, checkFileConstitution } from './patterns.js';
import { buildArchitectureScore } from '../engine/architecture-score.js';
import { analyzeBusinessLogic, buildBusinessLogicReport } from '../engine/business-logic.js';
import { readStructureMarkdown } from '../engine/structure-md';

import type { Rule, ResolvedConfig } from '../types';

export interface ToolContext {
  cwd: string;
  rules: Rule[];
  config: ResolvedConfig;
}

export interface ToolDefinition {
  name: string;
  description: string;
  inputSchema: {
    type: 'object';
    properties: Record<string, unknown>;
    required?: string[];
  };
  /**
   * If set, this tool is a deprecated alias for another tool. The value
   * is the canonical tool name. MCP clients see a soft deprecation warning
   * in the tool description and are routed to the canonical tool.
   */
  deprecated?: {
    /** Canonical replacement tool. */
    replacedBy: string;
    /** When the tool will be removed (semver-style). */
    removedIn?: string;
    /** Short user-facing reason. */
    reason: string;
  };
}

export const TOOL_DEFINITIONS: ToolDefinition[] = [
  {
    name: 'slop_scan_file',
    description:
      'Scan a single TypeScript/JavaScript file for AI-generated frontend slop. Returns issues (ruleId, severity, line, column, message, advice) and the file-level Slop Index.',
    inputSchema: {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'Absolute or cwd-relative path to the source file.' },
        framework: {
          type: 'string',
          enum: ['react', 'vue', 'svelte', 'astro', 'html'],
          description: 'Framework multiplier to apply. Defaults to the configured framework.',
        },
      },
      required: ['path'],
    },
  },
  {
    name: 'slop_explain_rule',
    description:
      'Return metadata for a single rule (id, category, severity, aiSpecific) plus a rationale and the recommended fix. Use this before auto-applying --fix to understand what the rule catches.',
    inputSchema: {
      type: 'object',
      properties: {
        ruleId: { type: 'string', description: 'e.g. "visual/ai-default-palette".' },
      },
      required: ['ruleId'],
    },
  },
  {
    name: 'slop_list_rules',
    description:
      'List all registered rules with their category, severity, and aiSpecific flag. Optional category filter (visual | logic | wcag | security | perf | typo | layout | component | arch).',
    inputSchema: {
      type: 'object',
      properties: {
        category: { type: 'string', description: 'Optional category filter.' },
      },
    },
  },
  {
    name: 'slop_suggest',
    description:
      '**Primary entry point for AI agents.** Returns the project\'s existing patterns (modals, buttons, api clients, state libs, data-fetching libs), the do-not-create list (forbidden imports + canonical patterns not to duplicate), top issues by rule, hot files by issue count, and the composite Repository Health score. Call this BEFORE writing new code so the agent reuses existing patterns instead of duplicating them.',
    inputSchema: {
      type: 'object',
      properties: {
        maxFiles: {
          type: 'number',
          description: 'Cap on files scanned to keep the inventory cheap. Defaults to 200.',
        },
      },
    },
  },
  {
    name: 'slop_suggest_with_structure',
    description:
      'Fast-path variant of `slop_suggest` that reads `.slopbrick/structure.md` from disk instead of re-scanning the codebase. Requires a prior `slopbrick scan` to have persisted the inventory (100–1000× latency win on the agent integration). If `structure.md` is missing, falls back to `slop_suggest` and annotates the response with `structureHint` so the caller knows to run `slopbrick scan` first.',
    inputSchema: {
      type: 'object',
      properties: {
        maxFiles: {
          type: 'number',
          description: 'Cap on files scanned for the slow-path fallback. Defaults to 200.',
        },
      },
    },
  },
  {
    // v0.39.0: removed 3 deprecated tools (slop_governance,
    // slop_architecture_score, slop_business_logic_score) that
    // were marked for removal in v0.13.0 but never removed.
    // They were strict subsets of slop_suggest; users should
    // call slop_suggest and read repositoryHealth /
    // architectureConsistency / businessLogicCoherence.
    name: 'slop_check_constitution',
    description:
      "Check a single file against the project's declared constitution (stateManagement, dataFetching, uiLibrary, forms, styling, routing, plus a forbidden deny-list in slopbrick.config.mjs). Returns a list of imports that violate declared values or hit the deny-list. Use this on a newly-written or modified file before suggesting a PR.",
    inputSchema: {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'Absolute or cwd-relative path to the source file.' },
      },
      required: ['path'],
    },
  },
  {
    // v0.10.1: find_similar_function. The GIR (Give-Implementation-
    // Reference) primitive for slop_suggest. Given a function signature
    // (name + hooks + props), find the most similar existing
    // implementations across the codebase. Uses AST fingerprints
    // (sha256 over sorted hooks ∪ props ∪ params) + Jaccard similarity
    // — no LLM, no embeddings, deterministic. Foundation for StackPick.
    name: 'slop_find_similar',
    description:
      "Find the most similar existing function/component implementations across the codebase, ranked by Jaccard similarity over the union of (hooks ∪ props ∪ params). Use this BEFORE writing new code so the agent reuses an existing pattern instead of inventing a new one. Returns top-k matches with name, file, line, fingerprint, and similarity score in [0, 1].",
    inputSchema: {
      type: 'object',
      properties: {
        name: {
          type: 'string',
          description: 'Function/component name to match. Omit to match by hooks+props only.',
        },
        hooks: {
          type: 'array',
          items: { type: 'string' },
          description: 'React hooks used by the target signature, e.g. ["useState", "useEffect"].',
        },
        props: {
          type: 'array',
          items: { type: 'string' },
          description: 'Component props for the target signature, e.g. ["variant", "size", "children"].',
        },
        limit: {
          type: 'number',
          description: 'Top-k results to return. Default 10. Capped at 50.',
        },
      },
    },
  },
];

export interface ToolResult {
  content: Array<{ type: 'text'; text: string }>;
  isError?: boolean;
}

function toolError(message: string): ToolResult {
  return {
    content: [{ type: 'text', text: JSON.stringify({ error: message }) }],
    isError: true,
  };
}

async function runScanFile(args: Record<string, unknown>, ctx: ToolContext): Promise<ToolResult> {
  const path = args.path as string | undefined;
  if (!path) return toolError('Missing required argument: path');
  const result = await scanFile(path, ctx.config);
  const simplified = {
    filePath: result.filePath,
    componentCount: result.componentCount,
    parseError: result.parseError,
    issues: result.issues.map((i) => ({
      ruleId: i.ruleId,
      category: i.category,
      severity: i.severity,
      line: i.line,
      column: i.column,
      message: i.message,
      advice: i.advice,
    })),
  };
  return {
    content: [{ type: 'text', text: JSON.stringify(simplified, null, 2) }],
  };
}

function explainRule(args: Record<string, unknown>, ctx: ToolContext): ToolResult {
  const ruleId = args.ruleId as string | undefined;
  if (!ruleId) return toolError('Missing required argument: ruleId');
  const rule = ctx.rules.find((r) => r.id === ruleId);
  if (!rule) return toolError('Unknown rule: ' + ruleId);
  const explanation = {
    ruleId: rule.id,
    category: rule.category,
    severity: rule.severity,
    aiSpecific: rule.aiSpecific,
    rationale:
      'This rule flags ' +
      rule.category +
      ' patterns associated with AI-generated code. It is marked as ' +
      (rule.aiSpecific ? 'AI-specific' : 'cross-cutting') +
      '. Severity: ' +
      rule.severity +
      '.',
    whereToLook: 'src/rules/' + rule.category + '/' + rule.id.replace(/^[^/]+\//, '') + '.ts',
  };
  return {
    content: [{ type: 'text', text: JSON.stringify(explanation, null, 2) }],
  };
}

function listRules(args: Record<string, unknown>, ctx: ToolContext): ToolResult {
  const category = args.category as string | undefined;
  const filtered = category ? ctx.rules.filter((r) => r.category === category) : ctx.rules;
  const rules = filtered.map((r) => ({
    id: r.id,
    category: r.category,
    severity: r.severity,
    aiSpecific: r.aiSpecific,
  }));
  return {
    content: [
      {
        type: 'text',
        text: JSON.stringify({ count: rules.length, rules }, null, 2),
      },
    ],
  };
}

// v0.41.0 (Sprint 2, task 2b.0): consolidated `runSuggest` + the
// former `runSuggestWithStructure` (in `slop-suggest-structure.ts`)
// into a single function with an `includeStructure` opt-in. The
// backward-compat shim in `slop-suggest-structure.ts` now wraps
// `runSuggest(args, ctx, { includeStructure: true })` so the public
// import surface is unchanged for existing callers.
export interface RunSuggestOptions {
  /**
   * When true, prefer `.slopbrick/structure.md` over re-scanning.
   * Fast-path: returns the markdown as a single text block — the
   * agent's context window sees the patterns directly without
   * parsing JSON. Slow-path: falls back to the JSON re-scan and
   * annotates the response with `structureHint` so the caller
   * knows to run `slopbrick scan` first.
   *
   * Defaults to false (legacy `slop_suggest` behavior).
   */
  includeStructure?: boolean;
}

// Same hint text the previous `runSuggestWithStructure` emitted
// when no `structure.md` existed. Kept as a module-level constant
// so the test can pin the wire format.
export const STRUCTURE_NOT_FOUND_HINT =
  'No .slopbrick/structure.md found. Run `slopbrick scan` to persist the pattern inventory, then call this tool again for the O(read file) fast path.';

export async function runSuggest(
  args: Record<string, unknown>,
  ctx: ToolContext,
  options: RunSuggestOptions = {},
): Promise<ToolResult> {
  const { includeStructure = false } = options;

  // Fast path: `includeStructure` was requested AND a persisted
  // `.slopbrick/structure.md` exists. Return it as a single text
  // block — the markdown is already an agent-readable summary,
  // rendered by `renderStructureMarkdown`. MCP clients render it
  // inline so the agent sees the patterns directly without parsing
  // JSON. This is the 100-1000× latency win on agent integrations
  // that call this tool frequently.
  if (includeStructure) {
    const cached = await readStructureMarkdown(ctx.cwd);
    if (cached !== null) {
      return {
        content: [{ type: 'text', text: cached }],
      };
    }
    // Slow path: no cache yet. Run the JSON re-scan below and
    // annotate the response with `structureHint` so the caller can
    // surface the upgrade path. Fall through to the inventory build.
  }

  const maxFilesRaw = args.maxFiles;
  const maxFiles =
    typeof maxFilesRaw === 'number' && Number.isFinite(maxFilesRaw) && maxFilesRaw > 0
      ? Math.min(2000, Math.floor(maxFilesRaw))
      : 200;
  try {
    const inventory = await buildPatternInventory(ctx.cwd, ctx.config, maxFiles);
    // Extract the do-not-create list from the constitution's forbidden
    // deny-list. AI agents MUST NOT import these packages.
    const doNotCreate: string[] = [
      ...(ctx.config.constitution?.forbidden ?? []),
    ];
    // Add libraries that are NOT in the declared stateManagement / dataFetching
    // stacks — those are also implicit "do not introduce a second one".
    const declared = new Set<string>();
    for (const list of [
      ctx.config.constitution?.stateManagement ?? [],
      ctx.config.constitution?.dataFetching ?? [],
      ctx.config.constitution?.uiLibrary ?? [],
      ctx.config.constitution?.forms ?? [],
      ctx.config.constitution?.styling ?? [],
      ctx.config.constitution?.routing ?? [],
    ]) {
      for (const lib of list) declared.add(lib);
    }
    // Cap the doNotCreate list to keep the agent's context window small.
    const doNotCreateCapped = doNotCreate.slice(0, 10);

    const payload: Record<string, unknown> = {
      hint: 'Use these patterns instead of creating new ones. Pick the closest existing entry and import it. The `doNotCreate` list is the deny-list — never import any of these.',
      doNotCreate: doNotCreateCapped,
      declaredStack: Array.from(declared),
      existingPatterns: inventory,
    };
    // Slow-path annotation for `includeStructure` callers — tells
    // the agent to run `slopbrick scan` next time so the cache hit.
    if (includeStructure) {
      payload.structureHint = STRUCTURE_NOT_FOUND_HINT;
    }
    // v0.41.0 (Sprint 2, task 2b.2): surface the project-level
    // Bayesian composite aggregate so MCP clients (Cursor, Claude
    // Code, Continue) can show "is this codebase AI?" alongside
    // the per-file suggestions. Read from .slopbrick/health.json
    // when present — the same source the `pretty` and `sarif`
    // reporters consume (F12). Skip when health.json is missing
    // or pre-dates v0.18.2 (no composite field).
    //
    // Plan note: §2b.2 calls for the field to also carry
    // `topContributors` (rules ranked by their log-likelihood
    // contribution). The persisted shape (HealthFile.compositeScore,
    // core/src/generated/health.ts:64) does NOT yet carry that —
    // adding it requires bumping @usebrick/core's STRUCTURE_SCHEMA_VERSION,
    // which AGENTS.md gates on a breaking change. We surface what
    // exists today; the `topContributors` slot lands in v0.42.0
    // alongside the empirical-composites engine (§3b), which
    // produces ranking data natively.
    try {
      const { loadHealth } = await import('@usebrick/core') as typeof import('@usebrick/core');
      const health = loadHealth(ctx.cwd);
      if (health?.compositeScore) {
        payload.compositeScore = health.compositeScore;
      }
    } catch {
      // health.json missing or unreadable — composite is optional,
      // skip silently so first-run users aren't blocked. The agent
      // gets the per-file patterns without the aggregate hint.
    }

    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify(payload, null, 2),
        },
      ],
    };
  } catch (err) {
    return toolError(err instanceof Error ? err.message : String(err));
  }
}

async function runGovernance(
  args: Record<string, unknown>,
  ctx: ToolContext,
): Promise<ToolResult> {
  try {
    // Lazy import to keep startup fast.
    const { runScan } = await import('../cli/scan.js');
    const maxFiles =
      typeof args.maxFiles === 'number' && Number.isFinite(args.maxFiles) && args.maxFiles > 0
        ? Math.floor(args.maxFiles)
        : 500;
    const { report } = await runScan({
      workspace: ctx.cwd,
      quiet: true,
      format: 'json',
      telemetry: false,
    });
    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify(
            {
              repositoryHealth: report.repositoryHealth,
              aiDebt: report.aiDebt,
              breakdown: report.repositoryHealthBreakdown,
              warnings: report.repositoryHealthWarnings ?? [],
              headline: report.repositoryHealth != null
                ? `Repository Health: ${report.repositoryHealth}/100  (AI Debt: ${report.aiDebt ?? 'unknown'})`
                : 'Repository Health: not computed',
            },
            null,
            2,
          ),
        },
      ],
    };
  } catch (err) {
    return toolError(err instanceof Error ? err.message : String(err));
  }
}

function runCheckConstitution(args: Record<string, unknown>, ctx: ToolContext): ToolResult {
  const path = args.path as string | undefined;
  if (!path) return toolError('Missing required argument: path');
  const absPath = resolve(ctx.cwd, path);
  let source: string;
  try {
    source = readFileSync(absPath, 'utf-8');
  } catch (err) {
    return toolError(
      `Cannot read file ${absPath}: ${err instanceof Error ? err.message : String(err)}`,
    );
  }

  const result = checkFileConstitution(source, ctx.config.constitution);
  return {
    content: [
      {
        type: 'text',
        text: JSON.stringify(
          {
            file: absPath,
            importCount: result.imports.length,
            violationCount: result.violations.length,
            imports: result.imports,
            violations: result.violations,
            // Field name kept stable for backward compatibility with
            // older consumers; the value reflects whether the merged
            // `config.constitution` was declared, detected, or absent.
            conventionSource: ctx.config.constitution ? 'declared-or-detected' : 'none',
          },
          null,
          2,
        ),
      },
    ],
  };
}

async function runArchitectureScore(
  args: Record<string, unknown>,
  ctx: ToolContext,
): Promise<ToolResult> {
  const maxFilesRaw = args.maxFiles;
  const maxFiles =
    typeof maxFilesRaw === 'number' && Number.isFinite(maxFilesRaw) && maxFilesRaw > 0
      ? Math.min(2000, Math.floor(maxFilesRaw))
      : 500;
  try {
    const score = await buildArchitectureScore(ctx.cwd, ctx.config, maxFiles);
    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify(
            {
              hint:
                'Score 100 = no architectural drift. Lower scores mean the project has multiple competing patterns (modal systems, button variants, state libs, fetch libs) or off-scale design tokens.',
              score: score.score,
              scannedFiles: score.scannedFiles,
              deductions: score.deductions,
              headline: score.headline,
            },
            null,
            2,
          ),
        },
      ],
    };
  } catch (err) {
    return toolError(err instanceof Error ? err.message : String(err));
  }
}

async function runBusinessLogicScore(
  args: Record<string, unknown>,
  ctx: ToolContext,
): Promise<ToolResult> {
  const maxFilesRaw = args.maxFiles;
  const maxFiles =
    typeof maxFilesRaw === 'number' && Number.isFinite(maxFilesRaw) && maxFilesRaw > 0
      ? Math.min(2000, Math.floor(maxFilesRaw))
      : 500;
  try {
    // Walk the same files the engine visits, run the anti-pattern
    // detectors, and aggregate. We re-discover here (rather than reuse
    // the architecture-score's inventory) because the two detectors
    // want different file sets — business logic cares about every
    // .ts/.tsx source file, not just components.
    const { discoverFiles } = await import('../engine/discover.js');
    const { readFileSync } = await import('node:fs');
    const allFiles = await discoverFiles(ctx.cwd, ctx.config);
    const limited = allFiles.slice(0, maxFiles);
    const issues: ReturnType<typeof analyzeBusinessLogic> = [];
    for (const absPath of limited) {
      let source: string;
      try {
        source = readFileSync(absPath, 'utf-8');
      } catch {
        continue;
      }
      for (const issue of analyzeBusinessLogic(source, absPath)) {
        issues.push(issue);
      }
    }
    const report = buildBusinessLogicReport(issues, limited.length);
    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify(
            {
              hint:
                'Score 100 = no anti-patterns. Lower scores mean the project uses Math.round(price*100)/100, magic tax rates, z.string() without constraints, hardcoded ISO dates, or raw currency in templates — patterns AI emits disproportionately. Replace with Intl.NumberFormat, named constants, zod constraints, and config-driven dates.',
              score: report.score,
              scannedFiles: report.scannedFiles,
              byCategory: report.byCategory,
              weight: report.weight,
              headline: report.headline,
              issues: report.issues,
            },
            null,
            2,
          ),
        },
      ],
    };
  } catch (err) {
    return toolError(err instanceof Error ? err.message : String(err));
  }
}

// v0.10.1: find_similar handler. The GIR primitive for slop_suggest.
async function runFindSimilar(
  args: Record<string, unknown>,
  ctx: ToolContext,
): Promise<ToolResult> {
  const { findSimilarFunctions } = await import('@usebrick/engine');
  const hooks = Array.isArray(args.hooks) ? (args.hooks as string[]) : [];
  const props = Array.isArray(args.props) ? (args.props as string[]) : [];
  const limitRaw = args.limit;
  const limit =
    typeof limitRaw === 'number' && Number.isFinite(limitRaw) && limitRaw > 0
      ? Math.floor(limitRaw)
      : 10;
  try {
    const matches = await findSimilarFunctions(
      {
        name: typeof args.name === 'string' ? args.name : undefined,
        hooks,
        props,
        limit,
        workspaceDir: ctx.cwd,
      },
      { cwd: ctx.cwd },
    );
    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify(
            {
              hint:
                'Each match is ranked by Jaccard similarity over (hooks ∪ props ∪ params). similarity=1 means the matched signature has an identical feature set. Agents should prefer the top match instead of writing a new implementation.',
              count: matches.length,
              matches: matches.map((m) => ({
                name: m.signature.name,
                file: m.signature.fileRel,
                line: m.signature.line,
                similarity: Number(m.similarity.toFixed(3)),
                fingerprint: m.fingerprint,
                hooks: m.signature.hooks,
                props: m.signature.props,
                params: m.signature.params,
              })),
            },
            null,
            2,
          ),
        },
      ],
    };
  } catch (err) {
    return toolError(err instanceof Error ? err.message : String(err));
  }
}

export async function handleToolCall(
  toolName: string,
  args: Record<string, unknown>,
  ctx: ToolContext,
): Promise<ToolResult> {
  // Soft-warn the agent when a deprecated tool is called. The call still
  // succeeds (we keep backward compatibility through v0.12.x) but the
  // response carries a `deprecation` field the MCP client can surface.
  const deprecation = getDeprecation(toolName);
  const deprecationNotice = deprecation
    ? {
        tool: toolName,
        replacedBy: deprecation.replacedBy,
        removedIn: deprecation.removedIn ?? 'next major',
        reason: deprecation.reason,
      }
    : undefined;

  switch (toolName) {
    case 'slop_scan_file':
      return runScanFile(args, ctx);
    case 'slop_explain_rule':
      return explainRule(args, ctx);
    case 'slop_list_rules':
      return listRules(args, ctx);
    case 'slop_suggest':
      return runSuggest(args, ctx);
    case 'slop_suggest_with_structure':
      // v0.41.0 (Sprint 2, task 2b.0): route through the
      // consolidated `runSuggest` with the structure fast-path flag.
      // The legacy import (`runSuggestWithStructure` from
      // `slop-suggest-structure.ts`) is kept as a backward-compat
      // re-export for any external consumer that imports the named
      // function directly.
      return runSuggest(args, ctx, { includeStructure: true });
    // v0.39.0: removed 3 deprecated tools (slop_governance,
    // slop_architecture_score, slop_business_logic_score) that
    // were marked for removal in v0.13.0 but never removed.
    // Their runner functions (runGovernance, runArchitectureScore,
    // runBusinessLogicScore) are kept in the file for now
    // (marked @deprecated) to keep the diff small; they can be
    // deleted in a follow-up. New clients will never see these
    // tools listed in the MCP tools/list response.
    case 'slop_check_constitution':
      return runCheckConstitution(args, ctx);
    case 'slop_find_similar':
      return runFindSimilar(args, ctx);
    default:
      return toolError('Unknown tool: ' + toolName);
  }
}

/**
 * Returns the set of canonical (non-deprecated) MCP tool names. Use this
 * when validating an MCP client's requested tool name, when emitting
 * documentation, or when deciding whether to gate a tool behind a feature
 * flag. The four canonical tools in v0.11.x are:
 *
 *   - `slop_suggest` / `slop_suggest_with_structure` — primary entry points
 *   - `slop_scan_file` — single-file scan (for editor integration)
 *   - `slop_check_constitution` — pre-commit gate on declared stack
 *   - `slop_explain_rule` — rule documentation lookup
 *
 * Plus `slop_list_rules` (discovery) and `slop_find_similar` (GIR primitive)
 * which are unique-purpose tools that don't fit the axis-score pattern.
 */
export function canonicalToolNames(): string[] {
  return TOOL_DEFINITIONS.filter((t) => !t.deprecated).map((t) => t.name);
}

/**
 * Returns the deprecation metadata for a tool, or undefined if the tool
 * is canonical. MCP clients can use this to soft-warn users in their UI
 * before the tool is removed in v0.13.0.
 */
export function getDeprecation(toolName: string):
  | { replacedBy: string; removedIn?: string; reason: string }
  | undefined {
  return TOOL_DEFINITIONS.find((t) => t.name === toolName)?.deprecated;
}