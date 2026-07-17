// Round 17: MCP tool implementations.

import { readFileSync, realpathSync } from 'node:fs';
import { isAbsolute, relative, resolve, sep } from 'node:path';
import { scanFile } from '../engine/worker.js';
import { buildPatternInventory, checkFileConstitution } from './patterns.js';
import { buildArchitectureScore } from '../engine/architecture-score.js';
import { analyzeBusinessLogic, buildBusinessLogicReport } from '../engine/business-logic.js';
import { readStructureMarkdown } from '../engine/structure-md';
import { SCORE_BRIEFS } from '../report/score-contract.js';
import { isIncompleteScan, isNotApplicableScan } from '../report/scan-validity.js';
import { buildRuleCalibrationEvidence, buildRuleExplanation } from '../rules/explanation.js';
import { getSignalStrength } from '../rules/signal-strength.js';
import { RULE_HINTS } from '../snippet/data.js';
import { SCAN_FILE_TOOL_DESCRIPTION } from '../engine/language-support.js';

import {
  ISSUE_EVIDENCE_MAX_SNIPPET_BYTES,
  ISSUE_EVIDENCE_MAX_SNIPPET_CHARS,
} from '../types';
import type { Issue, IssueEvidence, Rule, ResolvedConfig } from '../types';

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
    description: SCAN_FILE_TOOL_DESCRIPTION,
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
      'Explain one rule with its pattern, remediation/source path, suppression snippet, evidence category, honest calibration point estimates (confidence intervals are explicitly unavailable when not validated), and static configuration policy. The policy is not a claim about direct-file scan runtime behavior.',
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
      'List all registered rules with their category, severity, and aiSpecific flag. Optionally filter by any registered category.',
    inputSchema: {
      type: 'object',
      properties: {
        category: { type: 'string', description: 'Optional exact registered-category filter.' },
      },
    },
  },
  {
    name: 'slop_suggest',
    description:
      '**Primary entry point for AI agents.** Returns the project\'s existing patterns (modals, buttons, api clients, state libs, data-fetching libs), the do-not-create list (forbidden imports + canonical patterns not to duplicate), the declared stack, and (when .slopbrick/health.json exists) a Bayesian composite AI-likelihood score. Call this BEFORE writing new code so the agent reuses existing patterns instead of duplicating them. For per-issue details or per-file hot-spots, use slop_scan_file on each candidate path.',
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
      'Fast-path variant of `slop_suggest` that reads `.slopbrick/structure.md` from disk instead of re-scanning the codebase. Requires a prior `slopbrick scan` to have persisted the inventory and avoids repeated scanning; measure the speed-up in the target repository and client workflow. If `structure.md` is missing, falls back to `slop_suggest` and annotates the response with `structureHint` so the caller knows to run `slopbrick scan` first.',
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
      "Check a single file against the project's declared constitution (stateManagement, dataFetching, uiLibrary, forms, styling, routing, plus a forbidden deny-list in slopbrick.config.mjs). Returns the file path, total import + violation counts, the parsed imports, the list of violations (each with import, category, and reason), and a conventionSource indicating whether the constitution was declared, detected, or absent. Use this on a newly-written or modified file before suggesting a PR.",
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
      "Find the most similar existing function/component implementations across the codebase, ranked by Jaccard similarity over the union of (hooks ∪ props ∪ params). Use this BEFORE writing new code so the agent reuses an existing pattern instead of inventing a new one. Returns up to `limit` matches (default 10) with name, file, line, fingerprint (sha256 over signature), hooks, props, params, and similarity in [0, 1].",
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

/**
 * Resolve an MCP file argument inside the server workspace. MCP clients may
 * provide either an absolute path or a path relative to `ctx.cwd`, but they
 * must not be able to make the server read arbitrary files from the host.
 * Resolve symlinks when the target exists so a workspace link cannot escape
 * the configured root either.
 */
function resolveWorkspaceFile(cwd: string, input: string): string | null {
  const root = resolve(cwd);
  const candidate = resolve(root, input);
  let rootBoundary = root;
  let candidateBoundary = candidate;
  let candidateExists = false;
  try {
    rootBoundary = realpathSync(root);
  } catch {
    // The workspace should normally exist; retain the lexical path so the
    // normal file-read error remains useful if a caller supplies a bad cwd.
  }
  try {
    candidateBoundary = realpathSync(candidate);
    candidateExists = true;
  } catch {
    // Let the caller report a missing-file error, but still enforce the
    // lexical boundary below.
  }
  // If the target does not exist, compare lexical paths. This preserves the
  // useful "Cannot read file" error for missing in-workspace files even on
  // macOS, where `/var` is a symlink to `/private/var`.
  if (!candidateExists) {
    rootBoundary = root;
    candidateBoundary = candidate;
  }
  const rel = relative(rootBoundary, candidateBoundary);
  if (rel === '..' || rel.startsWith(`..${sep}`) || isAbsolute(rel)) return null;
  // Bind existing targets to the validated inode path. Returning the
  // lexical path here would re-open a symlink race between validation and
  // the subsequent read/parse (TOCTOU). Missing files keep the lexical path
  // so callers still receive the normal "Cannot read file" diagnostic.
  return candidateExists ? candidateBoundary : candidate;
}

async function runScanFile(args: Record<string, unknown>, ctx: ToolContext): Promise<ToolResult> {
  const path = args.path as string | undefined;
  if (!path) return toolError('Missing required argument: path');
  const absPath = resolveWorkspaceFile(ctx.cwd, path);
  if (!absPath) return toolError('Path must be inside the MCP workspace');
  const result = await scanFile(absPath, ctx.config, undefined, ctx.cwd);
  const simplified = {
    filePath: result.filePath,
    componentCount: result.componentCount,
    parseError: result.parseError,
    // Keep the per-file Bayesian score promised by the MCP contract. The
    // worker computes this for every successfully parsed file; preserving
    // the full object gives clients both the advertised probability/tier
    // and the contributing-rule details for explainability.
    compositeScore: result.compositeScore,
    issues: result.issues.map((issue) => toMcpFinding(issue, ctx.cwd)),
  };
  return {
    content: [{ type: 'text', text: JSON.stringify(simplified, null, 2) }],
  };
}

const MAX_MCP_FACT_KEYS = 32;
const MAX_MCP_FACT_ARRAY_ITEMS = 32;
const MAX_MCP_FACT_STRING_LENGTH = 512;
const MAX_MCP_FACT_DEPTH = 3;
const MAX_MCP_FACT_KEY_LENGTH = 128;
const MAX_MCP_FACT_NODES = 64;
const MAX_MCP_FACT_BYTES = 2048;
const MAX_MCP_EVIDENCE_SNIPPET_CHARS = ISSUE_EVIDENCE_MAX_SNIPPET_CHARS;
const MAX_MCP_EVIDENCE_SNIPPET_BYTES = ISSUE_EVIDENCE_MAX_SNIPPET_BYTES;
const MAX_MCP_MESSAGE_CHARS = 2048;
const MAX_MCP_MESSAGE_BYTES = 4096;
const MCP_EVIDENCE_OVERSIZED_SNIPPET = '[omitted oversized snippet]';
const MCP_EVIDENCE_SOURCE_LIKE_SNIPPET = '[omitted source-like snippet]';
const MCP_EVIDENCE_UNSAFE_TEXT = '[omitted unsafe evidence]';
const MCP_EVIDENCE_REDACTED_TEXT = '[redacted sensitive text]';
const MCP_EVIDENCE_DETAILS_OMITTED = '[omitted evidence details]';
const MCP_MESSAGE_OVERSIZED = '[omitted oversized message]';
const MCP_MESSAGE_SOURCE_LIKE = '[omitted source-like message]';

const SOURCE_LIKE_FACT_KEY = /(?:^|[-_])(source|code|content|body|text|raw)(?:$|[-_])/i;
const SENSITIVE_FACT_KEY = /(?:^|[-_])(token|secret|password|credential|authorization|cookie|api[-_]?key)(?:$|[-_])/i;
const WINDOWS_ABSOLUTE_PATH = /^[A-Za-z]:[\\/]/;
// These patterns intentionally stop only at source/string delimiters. A
// path embedded in prose can contain spaces (for example
// `C:\\Program Files\\app.ts`) and a POSIX path can be only one segment
// (`/tmp`), so token-like path regexes are not sufficient here. Over-redacting
// the remainder of an unterminated quote is preferable to leaking a suffix.
const EMBEDDED_POSIX_ABSOLUTE_PATH = /(?<![A-Za-z0-9_<>=])\/(?=[-A-Za-z0-9._~+])(?:[^"'`<>()[\],;{}\r\n]+?)(?=$|["'`<>()[\],;{}\r\n])/g;
const EMBEDDED_WINDOWS_ABSOLUTE_PATH = /(?<![A-Za-z0-9_])\b[A-Za-z]:[\\/](?:[^"'`<>()[\],;{}\r\n]+?)(?=$|["'`<>()[\],;{}\r\n])/g;
const EMBEDDED_UNC_ABSOLUTE_PATH = /(?<![A-Za-z0-9_])\\\\(?=[^"'`<>()[\],;{}\r\n])(?:[^"'`<>()[\],;{}\r\n]+?)(?=$|["'`<>()[\],;{}\r\n])/g;
const SENSITIVE_EVIDENCE_ASSIGNMENT = /\b(?:token|secret|password|passwd|credential|authorization|cookie|api[-_]?key|private[-_]?key|client[-_]?key|secret[-_]?key|[A-Za-z][A-Za-z0-9]*(?:token|secret|password|passwd|credential|authorization|cookie))\b\s*(?:[:=]|=>)\s*(?:"[^"]*"|'[^']*'|[^\s,;)}]+)/gi;
const SECRET_TOKEN_VALUE = /\b(?:sk[-_](?:live|test)[-_][A-Za-z0-9_-]+|ghp_[A-Za-z0-9_-]+|github_pat_[A-Za-z0-9_-]+|xox[baprs]-[A-Za-z0-9-]+|AKIA[0-9A-Z]{16})\b/i;

type McpEvidenceOmissionReason = 'unsafe-path' | 'sensitive' | 'source-like' | 'oversized' | 'details-dropped';
type McpDetailDropReason = 'budget' | 'depth' | 'unsupported' | 'nonfinite' | 'property' | 'key-limit' | 'array-limit';

const SENSITIVE_EVIDENCE_BASES = new Set([
  'token', 'secret', 'password', 'passwd', 'credential', 'authorization', 'cookie',
]);
const SENSITIVE_EVIDENCE_KNOWN_KEYS = new Set([
  'apikey', 'privatekey', 'clientkey', 'secretkey',
]);

interface McpProjectedEvidenceOmission {
  source: 'mcp-projection';
  reason: McpEvidenceOmissionReason;
  snippetChars: number;
  snippetBytes: number;
  valueChars?: number;
  valueBytes?: number;
  detailsDropped?: boolean;
  detailReason?: McpDetailDropReason;
}

interface McpProducerEvidenceOmission {
  reason: 'oversized';
  snippetChars: number;
  snippetBytes: number;
  valueChars: number;
  valueBytes: number;
}

type McpEvidenceOmission = McpProjectedEvidenceOmission | McpProducerEvidenceOmission;

type McpFact = null | boolean | number | string | McpFact[] | { [key: string]: McpFact };

interface McpFactBudget {
  nodes: number;
  bytes: number;
}

function utf8Bytes(value: string): number {
  return new TextEncoder().encode(value).byteLength;
}

function consumeMcpFact(budget: McpFactBudget, value: McpFact): boolean {
  const bytes = utf8Bytes(JSON.stringify(value));
  if (budget.nodes >= MAX_MCP_FACT_NODES || budget.bytes + bytes > MAX_MCP_FACT_BYTES) return false;
  budget.nodes += 1;
  budget.bytes += bytes;
  return true;
}

function reserveMcpFactBytes(budget: McpFactBudget, bytes: number): boolean {
  if (budget.bytes + bytes > MAX_MCP_FACT_BYTES) return false;
  budget.bytes += bytes;
  return true;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function isSourceLikeString(value: string): boolean {
  return value.includes('\n') && /(?:\bimport\b|\bexport\b|\bconst\b|\bfunction\b|=>|<[A-Za-z])/.test(value);
}

function isSourceLikeEvidence(value: string): boolean {
  return isSourceLikeString(value) ||
    /(?:\b(?:import|export|const|let|var|function|class)\b|=>|<\/?[A-Za-z][^>]*>|\b(?:def|fn)\s+[A-Za-z_]\w*\s*\(|\b(?:struct|trait|impl|enum|interface|namespace)\s+[A-Za-z_]\w*|\b(?:pub\s+)?(?:fn|struct|trait|impl|mod|use)\s+[A-Za-z_]\w*|^\s*#\s*(?:include|define)\b|^#!\/|^\s*(?:select|insert|update|delete|create|alter|with)\b[\s\S]*(?:;|\bfrom\b|\bset\b|\bvalues\b|\btable\b)|(?:^|\n)\s*(?:echo|printf)\s+(?:["']|[A-Za-z_$])|\b(?:println|eprintln|print)!\s*\()/im.test(value);
}

function redactEmbeddedAbsolutePaths(value: string): string {
  return value
    .replace(EMBEDDED_WINDOWS_ABSOLUTE_PATH, MCP_EVIDENCE_UNSAFE_TEXT)
    .replace(EMBEDDED_UNC_ABSOLUTE_PATH, MCP_EVIDENCE_UNSAFE_TEXT)
    .replace(EMBEDDED_POSIX_ABSOLUTE_PATH, MCP_EVIDENCE_UNSAFE_TEXT);
}

function redactSensitiveEvidenceText(value: string): string {
  const redacted = value.replace(SENSITIVE_EVIDENCE_ASSIGNMENT, MCP_EVIDENCE_REDACTED_TEXT);
  return redacted !== value || isSensitiveEvidenceText(redacted)
    ? (redacted !== value ? redacted : MCP_EVIDENCE_REDACTED_TEXT)
    : value;
}

function normalizeSensitiveEvidenceKey(value: string): string {
  return value.replace(/[^A-Za-z0-9]/g, '').toLowerCase();
}

function sensitiveEvidenceSegments(value: string): string[] {
  return value
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .split(/[^A-Za-z0-9]+/)
    .filter(Boolean)
    .map((segment) => segment.toLowerCase());
}

function isSensitiveEvidenceKey(value: string): boolean {
  const normalized = normalizeSensitiveEvidenceKey(value);
  return SENSITIVE_EVIDENCE_KNOWN_KEYS.has(normalized) ||
    sensitiveEvidenceSegments(value).some((segment) => SENSITIVE_EVIDENCE_BASES.has(segment));
}

function isSensitiveEvidenceText(value: string): boolean {
  if (SECRET_TOKEN_VALUE.test(value)) return true;
  return value.match(/[A-Za-z0-9]+(?:[-_][A-Za-z0-9]+)*/g)
    ?.some((token) => isSensitiveEvidenceKey(token)) ?? false;
}

function evidenceOmissionMarker(reason: McpEvidenceOmissionReason, fallback: string): string {
  switch (reason) {
    case 'unsafe-path': return MCP_EVIDENCE_UNSAFE_TEXT;
    case 'sensitive': return MCP_EVIDENCE_REDACTED_TEXT;
    case 'source-like': return MCP_EVIDENCE_SOURCE_LIKE_SNIPPET;
    case 'oversized': return fallback;
    case 'details-dropped': return MCP_EVIDENCE_DETAILS_OMITTED;
  }
}

interface EvidenceTextProjection {
  value: string;
  reason?: McpEvidenceOmissionReason;
  chars: number;
  bytes: number;
}

function projectEvidenceText(value: string, fallback: string, sensitiveContext = false): EvidenceTextProjection {
  const chars = value.length;
  const bytes = utf8Bytes(value);
  const embeddedPathRedaction = redactEmbeddedAbsolutePaths(value);
  if (isAbsolute(value) || WINDOWS_ABSOLUTE_PATH.test(value) || value.startsWith('file://') || embeddedPathRedaction !== value) {
    return { value: evidenceOmissionMarker('unsafe-path', fallback), reason: 'unsafe-path', chars, bytes };
  }
  if (isSourceLikeEvidence(value)) {
    return { value: evidenceOmissionMarker('source-like', fallback), reason: 'source-like', chars, bytes };
  }
  if (sensitiveContext || isSensitiveEvidenceKey(value) || redactSensitiveEvidenceText(value) !== value) {
    return { value: evidenceOmissionMarker('sensitive', fallback), reason: 'sensitive', chars, bytes };
  }
  if (chars > MAX_MCP_EVIDENCE_SNIPPET_CHARS || bytes > MAX_MCP_EVIDENCE_SNIPPET_BYTES) {
    return { value: evidenceOmissionMarker('oversized', fallback), reason: 'oversized', chars, bytes };
  }
  return { value, chars, bytes };
}

function projectMcpMessage(value: string): string {
  const pathsRedacted = redactEmbeddedAbsolutePaths(value);
  const absolutePath = isAbsolute(value) || WINDOWS_ABSOLUTE_PATH.test(value) || value.startsWith('file://');
  const sensitiveRedacted = redactSensitiveEvidenceText(pathsRedacted);
  const isOversized = (candidate: string): boolean =>
    candidate.length > MAX_MCP_MESSAGE_CHARS || utf8Bytes(candidate) > MAX_MCP_MESSAGE_BYTES;
  if (absolutePath || pathsRedacted !== value) {
    if (isOversized(sensitiveRedacted)) return MCP_MESSAGE_OVERSIZED;
    if (isSourceLikeEvidence(sensitiveRedacted)) return MCP_MESSAGE_SOURCE_LIKE;
    return sensitiveRedacted === pathsRedacted && pathsRedacted === value
      ? MCP_EVIDENCE_UNSAFE_TEXT
      : sensitiveRedacted;
  }
  if (isOversized(sensitiveRedacted)) return MCP_MESSAGE_OVERSIZED;
  if (isSourceLikeEvidence(value)) return MCP_MESSAGE_SOURCE_LIKE;
  if (sensitiveRedacted !== pathsRedacted) return sensitiveRedacted;
  return sensitiveRedacted;
}

function projectEvidencePosition(position: IssueEvidence['location']['start']) {
  const line = Number.isSafeInteger(position.line) && position.line > 0 ? position.line : 1;
  const column = Number.isSafeInteger(position.column) && position.column > 0 ? position.column : 1;
  return { line, column };
}

function omissionForProjection(
  projection: EvidenceTextProjection,
  value?: string,
): McpEvidenceOmission | undefined {
  if (!projection.reason) return undefined;
  return {
    source: 'mcp-projection',
    reason: projection.reason,
    snippetChars: projection.chars,
    snippetBytes: projection.bytes,
    ...(value === undefined ? {} : { valueChars: value.length, valueBytes: utf8Bytes(value) }),
  };
}

interface EvidenceDetailsProjection {
  value?: McpFact;
  reason?: McpEvidenceOmissionReason;
  detailReason?: McpDetailDropReason;
}

function droppedEvidenceDetail(detailReason: McpDetailDropReason): EvidenceDetailsProjection {
  return { reason: 'details-dropped', detailReason };
}

function projectMcpEvidenceDetails(
  value: unknown,
  depth: number,
  budget: McpFactBudget,
): EvidenceDetailsProjection {
  if (value === null || typeof value === 'boolean') {
    return consumeMcpFact(budget, value) ? { value } : droppedEvidenceDetail('budget');
  }
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) return droppedEvidenceDetail('nonfinite');
    return consumeMcpFact(budget, value) ? { value } : droppedEvidenceDetail('budget');
  }
  if (typeof value === 'string') {
    const projected = projectEvidenceText(value, MCP_EVIDENCE_OVERSIZED_SNIPPET);
    return consumeMcpFact(budget, projected.value)
      ? { value: projected.value, reason: projected.reason }
      : projected.reason ? { reason: projected.reason } : droppedEvidenceDetail('budget');
  }
  if (depth >= MAX_MCP_FACT_DEPTH) {
    const omitted = '[omitted nested value]';
    return consumeMcpFact(budget, omitted) ? { value: omitted, ...droppedEvidenceDetail('depth') } : droppedEvidenceDetail('depth');
  }
  if (Array.isArray(value)) {
    if (value.length > MAX_MCP_FACT_ARRAY_ITEMS) {
      const omitted = '[omitted oversized array]';
      return consumeMcpFact(budget, omitted)
        ? { value: omitted, ...droppedEvidenceDetail('array-limit') }
        : droppedEvidenceDetail('budget');
    }
    const projected: McpFact[] = [];
    if (!consumeMcpFact(budget, projected)) return droppedEvidenceDetail('budget');
    let reason: McpEvidenceOmissionReason | undefined;
    let detailReason: McpDetailDropReason | undefined;
    for (const item of value) {
      if (!reserveMcpFactBytes(budget, 1)) {
        reason ??= 'details-dropped';
        detailReason ??= 'budget';
        break;
      }
      const child = projectMcpEvidenceDetails(item, depth + 1, budget);
      if (child.reason && !reason) reason = child.reason;
      if (child.detailReason && !detailReason) detailReason = child.detailReason;
      if (child.value !== undefined) projected.push(child.value);
    }
    return { value: projected, reason, detailReason };
  }
  if (!isPlainObject(value)) return droppedEvidenceDetail('unsupported');

  const projected: Record<string, McpFact> = {};
  if (!consumeMcpFact(budget, projected)) return droppedEvidenceDetail('budget');
  let reason: McpEvidenceOmissionReason | undefined;
  let detailReason: McpDetailDropReason | undefined;
  const descriptors = Object.getOwnPropertyDescriptors(value);
  const ownKeys = Reflect.ownKeys(value);
  const allEntries = ownKeys
    .filter((key): key is string => typeof key === 'string')
    .map((key) => [key, descriptors[key]!] as const);
  const entries = allEntries
    .sort(([left], [right]) => left < right ? -1 : left > right ? 1 : 0)
    .slice(0, MAX_MCP_FACT_KEYS);
  if (ownKeys.some((key) => typeof key !== 'string')) {
    reason = 'details-dropped';
    detailReason = 'property';
  }
  if (allEntries.length > MAX_MCP_FACT_KEYS) {
    reason = 'details-dropped';
    detailReason = 'key-limit';
  }
  for (const [key, descriptor] of entries) {
    if (!('value' in descriptor)) {
      reason ??= 'details-dropped';
      detailReason ??= 'property';
      continue;
    }
    if (key.length > MAX_MCP_FACT_KEY_LENGTH) {
      reason ??= 'details-dropped';
      detailReason ??= 'key-limit';
      continue;
    }
    const projectedKey = projectEvidenceText(key, MCP_EVIDENCE_UNSAFE_TEXT);
    if (projectedKey.reason) {
      reason ??= projectedKey.reason;
      continue;
    }
    if (!reserveMcpFactBytes(budget, utf8Bytes(JSON.stringify(projectedKey.value)) + 2)) {
      reason ??= 'details-dropped';
      detailReason ??= 'budget';
      break;
    }
    const child = projectMcpEvidenceDetails(descriptor.value, depth + 1, budget);
    if (child.reason && !reason) reason = child.reason;
    if (child.detailReason && !detailReason) detailReason = child.detailReason;
    if (child.value !== undefined) projected[projectedKey.value] = child.value;
  }
  return { value: projected, reason, detailReason };
}

function projectMcpEvidence(evidence: IssueEvidence | undefined): {
  kind: 'matched-source-span';
  status: 'exact' | 'omitted';
  snippet: string;
  location: {
    start: { line: number; column: number };
    end: { line: number; column: number };
  };
  matched: { field: string; key: string; value?: string };
  omission?: McpEvidenceOmission;
  details?: Record<string, McpFact>;
} | undefined {
  if (!evidence || evidence.kind !== 'matched-source-span') return undefined;
  const location = {
    start: projectEvidencePosition(evidence.location.start),
    end: projectEvidencePosition(evidence.location.end),
  };
  const field = projectEvidenceText(evidence.matched.field, MCP_EVIDENCE_UNSAFE_TEXT);
  const key = projectEvidenceText(evidence.matched.key, MCP_EVIDENCE_UNSAFE_TEXT);
  const matched = { field: field.value, key: key.value };
  if (evidence.status === 'omitted') {
    return {
      kind: evidence.kind,
      status: 'omitted',
      snippet: MCP_EVIDENCE_OVERSIZED_SNIPPET,
      location,
      matched,
      omission: evidence.omission,
    };
  }
  const snippet = projectEvidenceText(evidence.snippet, MCP_EVIDENCE_OVERSIZED_SNIPPET);
  const value = projectEvidenceText(
    evidence.matched.value,
    MCP_EVIDENCE_UNSAFE_TEXT,
    isSensitiveEvidenceKey(evidence.matched.field) || isSensitiveEvidenceKey(evidence.matched.key),
  );
  const details = evidence.details !== undefined
    ? projectMcpEvidenceDetails(evidence.details, 0, { nodes: 0, bytes: 0 })
    : undefined;
  const projectedDetails = details?.value && !Array.isArray(details.value) && typeof details.value === 'object'
    ? details.value as Record<string, McpFact>
    : undefined;
  const detailsRootDropped = details !== undefined &&
    (details.value === undefined || details.value === null || Array.isArray(details.value) || typeof details.value !== 'object');
  const detailsReason = details?.reason ?? (detailsRootDropped ? 'details-dropped' as const : undefined);
  const detailsDetailReason = details?.detailReason ?? (detailsRootDropped ? 'unsupported' as const : undefined);
  const primaryOmission = omissionForProjection(snippet) ??
    omissionForProjection(field) ?? omissionForProjection(key) ?? omissionForProjection(value, evidence.matched.value) ??
    undefined;
  const detailsOmission = detailsReason ? {
      source: 'mcp-projection' as const,
      reason: detailsReason,
      snippetChars: evidence.snippet.length,
      snippetBytes: utf8Bytes(evidence.snippet),
      detailsDropped: true,
      ...(detailsDetailReason ? { detailReason: detailsDetailReason } : {}),
    } : undefined;
  const omission = primaryOmission && detailsReason
    ? {
        ...primaryOmission,
        detailsDropped: true,
        ...(detailsDetailReason ? { detailReason: detailsDetailReason } : {}),
      }
    : primaryOmission ?? detailsOmission;
  if (omission) {
    return {
      kind: evidence.kind,
      status: 'omitted',
      snippet: evidenceOmissionMarker(omission.reason, MCP_EVIDENCE_OVERSIZED_SNIPPET),
      location,
      matched: {
        ...matched,
        value: value.value,
      },
      ...(projectedDetails ? { details: projectedDetails } : {}),
      omission,
    };
  }
  return {
    kind: evidence.kind,
    status: 'exact',
    snippet: snippet.value,
    location,
    matched: {
      ...matched,
      value: value.value,
    },
    ...(projectedDetails ? { details: projectedDetails } : {}),
  };
}

function projectMcpPath(value: string, cwd?: string): string | null {
  if (!isAbsolute(value) && !WINDOWS_ABSOLUTE_PATH.test(value) && !value.startsWith('file://')) return null;
  if (!cwd || !isAbsolute(value)) return '[redacted absolute path]';

  const pathFromWorkspace = relative(cwd, value);
  if (pathFromWorkspace === '' || (!pathFromWorkspace.startsWith(`..${sep}`) && pathFromWorkspace !== '..' && !isAbsolute(pathFromWorkspace))) {
    return pathFromWorkspace || '.';
  }
  return '[redacted absolute path]';
}

function projectMcpFact(value: unknown, cwd: string | undefined, depth: number, budget: McpFactBudget): McpFact | undefined {
  if (value === null || typeof value === 'boolean') return consumeMcpFact(budget, value) ? value : undefined;
  if (typeof value === 'number') return Number.isFinite(value) && consumeMcpFact(budget, value) ? value : undefined;
  if (typeof value === 'string') {
    const path = projectMcpPath(value, cwd);
    const projected = path ?? (value.length > MAX_MCP_FACT_STRING_LENGTH
      ? '[omitted oversized string]'
      : isSourceLikeString(value) ? '[omitted source-like value]' : value);
    return consumeMcpFact(budget, projected) ? projected : undefined;
  }
  if (depth >= MAX_MCP_FACT_DEPTH) {
    const omitted = '[omitted nested value]';
    return consumeMcpFact(budget, omitted) ? omitted : undefined;
  }
  if (Array.isArray(value)) {
    if (value.length > MAX_MCP_FACT_ARRAY_ITEMS) {
      const omitted = '[omitted oversized array]';
      return consumeMcpFact(budget, omitted) ? omitted : undefined;
    }
    const projected: McpFact[] = [];
    if (!consumeMcpFact(budget, projected)) return undefined;
    for (const item of value) {
      // Reserve punctuation before descending, so the final JSON can never
      // exceed the global evidence byte ceiling.
      if (!reserveMcpFactBytes(budget, 1)) break;
      const fact = projectMcpFact(item, cwd, depth + 1, budget);
      if (fact !== undefined) projected.push(fact);
    }
    return projected;
  }
  if (!isPlainObject(value)) return undefined;

  const projected: Record<string, McpFact> = {};
  if (!consumeMcpFact(budget, projected)) return undefined;
  const entries = Object.entries(Object.getOwnPropertyDescriptors(value))
    .sort(([left], [right]) => left < right ? -1 : left > right ? 1 : 0)
    .slice(0, MAX_MCP_FACT_KEYS);
  for (const [key, descriptor] of entries) {
    if (!('value' in descriptor) || SOURCE_LIKE_FACT_KEY.test(key) || SENSITIVE_FACT_KEY.test(key)) continue;
    if (key.length > MAX_MCP_FACT_KEY_LENGTH) continue;
    // A property needs a quoted key, colon, and (except the last) comma.
    // Counting a comma for every entry is deliberately conservative.
    if (!reserveMcpFactBytes(budget, utf8Bytes(JSON.stringify(key)) + 2)) break;
    const fact = projectMcpFact(descriptor.value, cwd, depth + 1, budget);
    if (fact !== undefined) projected[key] = fact;
  }
  return projected;
}

/**
 * Projects rule-authored evidence into a small, JSON-safe explanation.
 * This is deliberately not a parser fact dump: it rejects non-plain values,
 * bounds shape and size, omits source-like values, and never returns absolute
 * filesystem paths outside the workspace.
 */
export function toMcpFinding(issue: Issue, cwd?: string) {
  const facts = issue.extras ? projectMcpFact(issue.extras, cwd, 0, { nodes: 0, bytes: 0 }) : null;
  const evidence = projectMcpEvidence(issue.evidence);
  const message = projectMcpMessage(issue.message);
  const advice = issue.advice === undefined ? undefined : projectMcpMessage(issue.advice);
  return {
    ruleId: issue.ruleId,
    category: issue.category,
    severity: issue.severity,
    aiSpecific: issue.aiSpecific,
    // Keep the per-finding calibration claim aligned with `slop_explain_rule`:
    // historical estimates are useful context, but no v10.3 source/cohort is
    // admitted yet. Unknown rules must say unavailable instead of omitting the
    // field and making consumers guess whether metadata was lost.
    calibration: buildRuleCalibrationEvidence(getSignalStrength(issue.ruleId)),
    line: issue.line,
    column: issue.column,
    message,
    advice,
    whyItFired: {
      summary: message,
      location: { line: issue.line, column: issue.column },
      facts: facts && !Array.isArray(facts) && typeof facts === 'object' ? facts : null,
      ...(evidence ? { evidence } : {}),
    },
  };
}

function explainRule(args: Record<string, unknown>, ctx: ToolContext): ToolResult {
  const ruleId = args.ruleId as string | undefined;
  if (!ruleId) return toolError('Missing required argument: ruleId');
  const rule = ctx.rules.find((r) => r.id === ruleId);
  if (!rule) return toolError('Unknown rule: ' + ruleId);
  const explanation = buildRuleExplanation(rule, ctx.config, RULE_HINTS);
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
  // JSON. This avoids repeated scanning for agent integrations that call this
  // tool frequently; the actual latency improvement is workload-dependent.
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
      if (health) {
        // Incomplete/empty health snapshots may retain compatibility
        // numerics for inspection, but no project-level aggregate is safe for
        // an agent's gating or remediation decisions.
        const scoreAggregatesValid = !isIncompleteScan(health) && !isNotApplicableScan(health);
        if (scoreAggregatesValid && health.compositeScore) payload.compositeScore = health.compositeScore;
        payload.scoreBasis = health.scoreBasis;
        // Preserve the health snapshot's gate-safety contract so MCP clients
        // cannot treat a partial scan's numeric scores as deploy/CI evidence.
        payload.completionStatus = health.completionStatus;
        payload.scoreValidity = health.scoreValidity;
        payload.scanAccounting = health.scanAccounting;
        payload.selectionAccounting = health.selectionAccounting;
        // v0.43.0: include the same scoreBriefs that the CLI
        // --brief and --json surfaces now ship. MCP clients
        // (Cursor, Claude Code, Continue) get the same plain-
        // language explanation of each score the agent is
        // going to act on. Without this, an agent receiving a
        // compositeScore sees the number but not what it
        // measures; the brief makes it self-explanatory.
        payload.scoreBriefs = SCORE_BRIEFS;
        if (scoreAggregatesValid) {
          payload.scores = {
            aiSlopScore: health.aiSlopScore,
            engineeringHygiene: health.engineeringHygiene,
            security: health.security,
            repositoryHealth: health.repositoryHealth,
          };
        }
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
              scoreBasis: report.scoreBasis,
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
  const absPath = resolveWorkspaceFile(ctx.cwd, path);
  if (!absPath) return toolError('Path must be inside the MCP workspace');
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
  // v0.42.0: removed unused `deprecationNotice` const. The planned
  // "soft-warn agent when deprecated tool is called" surface was
  // never wired into the response builder (each case returns its own
  // shaped ToolResult). The const was dead-on-arrival — left over from
  // an earlier prototype. getDeprecation(toolName) is no longer
  // called here; if we want to wire the warning in a future change,
  // add it back at this site.

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
