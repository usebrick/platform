/**
 * Rule: dup/identical-block
 *
 * Cross-file Type-1 clone evidence.  The rule itself is deliberately
 * stateless: a per-file `analyze()` call cannot know which other files are in
 * the project and therefore returns no cross-file findings.  The scan
 * orchestrator invokes `collectIdenticalBlockIssues()` once, after all
 * successful file results are available.
 *
 * This boundary matters for correctness.  A module cache made findings
 * depend on worker assignment, call order, and previous scans in a long-lived
 * process.  The coordinator sorts its inputs and does all grouping in one
 * pure pass, so thread count and scan history cannot change the result.
 */

import * as crypto from 'node:crypto';
import { parseSource } from '@usebrick/engine';
import type { Module } from '@swc/core';
import type { Rule, Issue, RuleContext, ScanFacts } from '../../types';
import { createRule } from '../rule';
import { sniffSourceExtension } from '../../engine/source-sniff.js';

/** Number of non-empty normalized code lines in a candidate window. */
export const IDENTICAL_BLOCK_WINDOW_SIZE = 20;

/** Bound memory and report volume on generated/very large repositories. */
export const IDENTICAL_BLOCK_MAX_WINDOWS_PER_FILE = 2_048;
export const IDENTICAL_BLOCK_MAX_TOTAL_WINDOWS = 250_000;
export const IDENTICAL_BLOCK_MAX_ISSUES_PER_FILE = 64;

const MIN_NORMALIZED_LENGTH = 40;
const TRUSTED_EXTENSIONS = new Set([
  '.js', '.jsx', '.ts', '.tsx', '.mjs', '.cjs', '.mts', '.cts',
]);

interface ByteSpan {
  start: number;
  end: number;
}

interface CodeLine {
  sourceLine: number;
  normalized: string;
}

interface Candidate {
  filePath: string;
  startIndex: number;
  endIndex: number;
  startLine: number;
  endLine: number;
  canonical: string;
  hash: string;
}

interface Region {
  filePath: string;
  startIndex: number;
  endIndex: number;
  startLine: number;
  endLine: number;
  lineCount: number;
  canonical: string;
  hash: string;
}

interface VerifiedMatch {
  left: Candidate;
  right: Candidate;
  delta: number;
}

interface PairRegion {
  left: Region;
  right: Region;
}

interface PairGroup {
  leftPath: string;
  rightPath: string;
  byDelta: Map<number, VerifiedMatch[]>;
}

export interface IdenticalBlockSource {
  filePath: string;
  source: string;
}

/** Injectable only for deterministic collision tests; production uses SHA-256. */
export interface IdenticalBlockCoordinatorOptions {
  hash?: (canonical: string) => string;
}

/** Map-compatible result with explicit truncation accounting for reports. */
export type IdenticalBlockIssueMap = Map<string, Issue[]> & {
  candidateWindows: number;
  maxCandidateWindows: number;
  skippedInputs: number;
  truncated: boolean;
};

const PROTECTED_NODE_TYPES = new Set([
  'StringLiteral',
  'RegExpLiteral',
  'JSXText',
  'TemplateElement',
]);

function compareStrings(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

function sha256(canonical: string): string {
  return crypto.createHash('sha256').update(canonical, 'utf8').digest('hex');
}

function collectProtectedSpans(ast: Module, byteLength: number): ByteSpan[] {
  const spans: ByteSpan[] = [];

  function visit(value: unknown): void {
    if (Array.isArray(value)) {
      for (const item of value) visit(item);
      return;
    }
    if (!value || typeof value !== 'object') return;

    const node = value as Record<string, unknown>;
    if (typeof node.type === 'string' && PROTECTED_NODE_TYPES.has(node.type)) {
      const span = node.span as { start?: unknown; end?: unknown } | undefined;
      if (typeof span?.start === 'number' && typeof span.end === 'number') {
        const start = Math.max(0, span.start - 1);
        const end = Math.min(byteLength, span.end - 1);
        if (end > start) spans.push({ start, end });
      }
      return;
    }

    for (const [key, child] of Object.entries(node)) {
      if (key !== 'span') visit(child);
    }
  }

  visit(ast);
  return spans;
}

function lineBreakWidth(bytes: Buffer, index: number): number {
  if (bytes[index] === 0x0a) return 1;
  if (bytes[index] === 0x0d) return bytes[index + 1] === 0x0a ? 2 : 1;
  if (
    bytes[index] === 0xe2 &&
    bytes[index + 1] === 0x80 &&
    (bytes[index + 2] === 0xa8 || bytes[index + 2] === 0xa9)
  ) return 3;
  return 0;
}

function maskRange(bytes: Buffer, start: number, end: number): void {
  for (let index = Math.max(0, start); index < Math.min(bytes.length, end); index++) {
    const width = lineBreakWidth(bytes, index);
    if (width > 0) {
      index += width - 1;
      continue;
    }
    bytes[index] = 0x20;
  }
}

/**
 * Remove real comments while preserving strings, regexes, JSX prose, and
 * template quasis.  SWC spans protect delimiters that are ambiguous in raw
 * text; if the source cannot be parsed by the trusted SWC path we abstain.
 */
interface StrippedSource {
  bytes: Buffer;
  protectedBytes: Uint8Array;
}

function stripComments(source: string, ast: Module): StrippedSource {
  const bytes = Buffer.from(source, 'utf8');
  const protectedBytes = new Uint8Array(bytes.length);
  for (const span of collectProtectedSpans(ast, bytes.length)) {
    protectedBytes.fill(1, span.start, span.end);
  }

  // A hashbang is lexical syntax, not a code line.
  if (bytes[0] === 0x23 && bytes[1] === 0x21) {
    let end = 2;
    while (end < bytes.length && lineBreakWidth(bytes, end) === 0) end++;
    maskRange(bytes, 0, end);
  }

  let index = 0;
  while (index < bytes.length) {
    if (protectedBytes[index] === 1) {
      index++;
      continue;
    }

    const current = bytes[index];
    const next = bytes[index + 1];
    if (current !== 0x2f || protectedBytes[index + 1] === 1) {
      index++;
      continue;
    }

    if (next === 0x2f) {
      let end = index + 2;
      while (end < bytes.length && lineBreakWidth(bytes, end) === 0) end++;
      maskRange(bytes, index, end);
      index = end;
      continue;
    }

    if (next !== 0x2a) {
      index++;
      continue;
    }

    let end = bytes.length;
    for (let cursor = index + 2; cursor + 1 < bytes.length; cursor++) {
      if (
        protectedBytes[cursor] !== 1 &&
        protectedBytes[cursor + 1] !== 1 &&
        bytes[cursor] === 0x2a &&
        bytes[cursor + 1] === 0x2f
      ) {
        end = cursor + 2;
        break;
      }
    }
    maskRange(bytes, index, end);
    index = end;
  }

  return { bytes, protectedBytes };
}

function isTrustedSource(filePath: string, source: string, ast: Module): boolean {
  const normalized = filePath.toLowerCase().replace(/[?#].*$/, '');
  const fileName = normalized.slice(normalized.lastIndexOf('/') + 1);
  if (/\.d\.(?:ts|mts|cts)$/.test(fileName)) return false;
  const dot = fileName.lastIndexOf('.');
  const extension = dot === -1 ? '' : fileName.slice(dot);
  if (extension !== '' && !TRUSTED_EXTENSIONS.has(extension)) return false;
  if (extension === '') {
    const sniffed = sniffSourceExtension(source);
    if (sniffed === null || !TRUSTED_EXTENSIONS.has(sniffed)) return false;
  }
  // parseSource() routes trusted extensions through full SWC parsing.  Do not
  // require `ast.span.start === 1`: a valid file may begin with a comment or
  // a shebang before its first syntax token.
  const sourceEnd = Buffer.byteLength(source, 'utf8') + 1;
  return ast.span.start >= 1 && ast.span.end >= ast.span.start && ast.span.end <= sourceEnd;
}

function lineRanges(bytes: Buffer): Array<{ start: number; end: number }> {
  const ranges: Array<{ start: number; end: number }> = [];
  let start = 0;
  let index = 0;
  while (index < bytes.length) {
    const width = lineBreakWidth(bytes, index);
    if (width === 0) {
      index++;
      continue;
    }
    ranges.push({ start, end: index });
    index += width;
    start = index;
  }
  ranges.push({ start, end: bytes.length });
  return ranges;
}

interface NormalizedChunk {
  protected: boolean;
  text: string;
}

function normalizeCodeLine(
  bytes: Buffer,
  protectedBytes: Uint8Array,
  start: number,
  end: number,
): string | undefined {
  const chunks: NormalizedChunk[] = [];
  let index = start;
  while (index < end) {
    const isProtected = protectedBytes[index] === 1;
    let cursor = index + 1;
    while (cursor < end && (protectedBytes[cursor] === 1) === isProtected) cursor++;
    const text = bytes.subarray(index, cursor).toString('utf8');
    chunks.push({
      protected: isProtected,
      text: isProtected ? text : text.replace(/\s+/gu, ' '),
    });
    index = cursor;
  }

  // Trim only unprotected whitespace. Literal, regex, template, and JSX
  // spans remain byte-for-byte intact, including meaningful leading/trailing
  // spaces inside those spans.
  while (chunks.length > 0 && !chunks[0]!.protected) {
    chunks[0]!.text = chunks[0]!.text.trimStart();
    if (chunks[0]!.text.length > 0) break;
    chunks.shift();
  }
  while (chunks.length > 0 && !chunks[chunks.length - 1]!.protected) {
    const last = chunks[chunks.length - 1]!;
    last.text = last.text.trimEnd();
    if (last.text.length > 0) break;
    chunks.pop();
  }

  if (chunks.length === 0) return undefined;
  const normalized = chunks.map((chunk) => chunk.text).join('');
  return normalized.trim().length > 0 ? normalized : undefined;
}

interface ExtractedCodeLines {
  lines: CodeLine[];
  skipped: boolean;
}

function extractCodeLines(input: IdenticalBlockSource): ExtractedCodeLines {
  try {
    const parsed = parseSource(input.source, input.filePath);
    if (!isTrustedSource(input.filePath, input.source, parsed.ast)) {
      return { lines: [], skipped: false };
    }

    const stripped = stripComments(input.source, parsed.ast);
    const ranges = lineRanges(stripped.bytes);
  const codeLines: CodeLine[] = [];
    for (let index = 0; index < ranges.length; index++) {
      const range = ranges[index]!;
      const normalized = normalizeCodeLine(
        stripped.bytes,
        stripped.protectedBytes,
        range.start,
        range.end,
      );
      if (normalized !== undefined) {
        codeLines.push({ sourceLine: index + 1, normalized });
      }
    }
    return { lines: codeLines, skipped: false };
  } catch {
    // A malformed AST, unexpected span, or parser exception in one file must
    // not discard the rest of a project-level clone pass.
    return { lines: [], skipped: true };
  }
}

interface BuiltCandidates {
  candidates: Candidate[];
  skipped: boolean;
}

function buildCandidates(
  input: IdenticalBlockSource,
  hash: (canonical: string) => string,
): BuiltCandidates {
  const extracted = extractCodeLines(input);
  const lines = extracted.lines;
  if (lines.length < IDENTICAL_BLOCK_WINDOW_SIZE) {
    return { candidates: [], skipped: extracted.skipped };
  }

  const candidates: Candidate[] = [];
  for (
    let startIndex = 0;
    startIndex <= lines.length - IDENTICAL_BLOCK_WINDOW_SIZE &&
      candidates.length < IDENTICAL_BLOCK_MAX_WINDOWS_PER_FILE;
    startIndex++
  ) {
    const window = lines.slice(startIndex, startIndex + IDENTICAL_BLOCK_WINDOW_SIZE);
    const canonical = window.map((line) => line.normalized).join('\n');
    if (canonical.length < MIN_NORMALIZED_LENGTH) continue;
    candidates.push({
      filePath: input.filePath,
      startIndex,
      endIndex: startIndex + IDENTICAL_BLOCK_WINDOW_SIZE - 1,
      startLine: window[0]!.sourceLine,
      endLine: window[window.length - 1]!.sourceLine,
      canonical,
      hash: hash(canonical),
    });
  }
  return { candidates, skipped: extracted.skipped };
}

function regionFromCandidate(candidate: Candidate): Region {
  return {
    filePath: candidate.filePath,
    startIndex: candidate.startIndex,
    endIndex: candidate.endIndex,
    startLine: candidate.startLine,
    endLine: candidate.endLine,
    lineCount: IDENTICAL_BLOCK_WINDOW_SIZE,
    canonical: candidate.canonical,
    hash: candidate.hash,
  };
}

function extendRegion(region: Region, candidate: Candidate): void {
  region.endIndex = Math.max(region.endIndex, candidate.endIndex);
  region.endLine = Math.max(region.endLine, candidate.endLine);
  region.lineCount = region.endIndex - region.startIndex + 1;
}

function lowerBound(candidates: readonly Candidate[], startIndex: number): number {
  let low = 0;
  let high = candidates.length;
  while (low < high) {
    const middle = (low + high) >>> 1;
    if (candidates[middle]!.startIndex < startIndex) low = middle + 1;
    else high = middle;
  }
  return low;
}

/** Pair matching windows by nearest code-line offset, not by arrival order. */
function pairCandidates(left: Candidate[], right: Candidate[]): VerifiedMatch[] {
  const orderedLeft = [...left].sort((a, b) => a.startIndex - b.startIndex);
  const orderedRight = [...right].sort((a, b) => a.startIndex - b.startIndex);
  const matches: VerifiedMatch[] = [];
  const seen = new Set<string>();
  for (const source of orderedLeft) {
    const insertion = lowerBound(orderedRight, source.startIndex);
    const options = [orderedRight[insertion - 1], orderedRight[insertion]].filter(
      (candidate): candidate is Candidate => candidate !== undefined,
    );
    options.sort((a, b) =>
      (Math.abs(a.startIndex - source.startIndex) - Math.abs(b.startIndex - source.startIndex)) ||
      (a.startIndex - b.startIndex),
    );
    const target = options[0];
    if (!target) continue;
    const key = `${source.startIndex}:${target.startIndex}`;
    if (seen.has(key)) continue;
    seen.add(key);
    matches.push({
      left: source,
      right: target,
      delta: target.startIndex - source.startIndex,
    });
  }
  return matches;
}

/**
 * Coalesce verified windows only when they belong to the same file pair and
 * preserve the same code-line offset.  This prevents a long clone from
 * becoming one finding per sliding window while keeping two separated clones
 * distinct and preserving the actual matching counterpart.
 */
function coalescePairMatches(matches: VerifiedMatch[]): PairRegion[] {
  const sorted = [...matches].sort((a, b) =>
    (a.left.startIndex - b.left.startIndex) ||
    (a.right.startIndex - b.right.startIndex) ||
    compareStrings(a.left.hash, b.left.hash),
  );
  const regions: PairRegion[] = [];
  for (const match of sorted) {
    const previous = regions[regions.length - 1];
    if (
      previous &&
      match.left.startIndex <= previous.left.endIndex + 1 &&
      match.right.startIndex <= previous.right.endIndex + 1
    ) {
      extendRegion(previous.left, match.left);
      extendRegion(previous.right, match.right);
      continue;
    }
    regions.push({
      left: regionFromCandidate(match.left),
      right: regionFromCandidate(match.right),
    });
  }
  return regions;
}

function makeIssue(target: Region, other: Region): Issue {
  return {
    ruleId: 'dup/identical-block',
    category: 'logic',
    severity: 'medium',
    aiSpecific: false,
    filePath: target.filePath,
    message:
      `Identical normalized ${target.lineCount}-line code region at line ${target.startLine} ` +
      `also appears in ${other.filePath}:${other.startLine}`,
    line: target.startLine,
    column: 0,
    advice:
      'Consider extracting this repeated code into a shared helper or module. ' +
      'Duplication is maintainability evidence; it does not establish authorship or AI generation.',
    extras: {
      duplicateOf: {
        file: other.filePath,
        line: other.startLine,
        lineEnd: other.endLine,
        hash: target.hash,
      },
      region: {
        startLine: target.startLine,
        endLine: target.endLine,
        lineCount: target.lineCount,
      },
      evidence: 'exact-normalized-code-sequence',
    },
  };
}

/**
 * Find exact normalized code regions across a complete project result set.
 * Inputs are copied/sorted and no mutable state escapes this invocation.
 * Unsupported or unparsable dialects abstain instead of using a fragile
 * comment/string regex.
 */
export function collectIdenticalBlockIssues(
  inputs: readonly IdenticalBlockSource[],
  options: IdenticalBlockCoordinatorOptions = {},
): IdenticalBlockIssueMap {
  const hash = options.hash ?? sha256;
  const orderedInputs = [...inputs]
    .filter((input) => input && typeof input.filePath === 'string' && typeof input.source === 'string')
    .sort((a, b) => compareStrings(a.filePath, b.filePath));

  // SHA-256 is only a candidate bucket.  Keeping the canonical sequence as
  // the second key makes even an intentionally-colliding hash harmless.
  const buckets = new Map<string, Map<string, Candidate[]>>();
  let candidateWindows = 0;
  let skippedInputs = 0;
  let truncated = false;
  for (const input of orderedInputs) {
    if (candidateWindows >= IDENTICAL_BLOCK_MAX_TOTAL_WINDOWS) {
      truncated = true;
      skippedInputs += 1;
      continue;
    }

    let built: BuiltCandidates;
    try {
      built = buildCandidates(input, hash);
    } catch {
      // A malformed AST, a host parser failure, or an unexpected candidate
      // shape is isolated to this input; the rest of the project remains
      // eligible for evidence.
      skippedInputs += 1;
      continue;
    }
    if (built.skipped) skippedInputs += 1;
    let candidates = built.candidates;
    const remaining = IDENTICAL_BLOCK_MAX_TOTAL_WINDOWS - candidateWindows;
    if (candidates.length > remaining) {
      candidates = candidates.slice(0, remaining);
      truncated = true;
    }
    candidateWindows += candidates.length;
    for (const candidate of candidates) {
      let exact = buckets.get(candidate.hash);
      if (!exact) {
        exact = new Map<string, Candidate[]>();
        buckets.set(candidate.hash, exact);
      }
      const list = exact.get(candidate.canonical) ?? [];
      list.push(candidate);
      exact.set(candidate.canonical, list);
    }
  }

  // First retain verified candidate pairs.  A candidate is paired only after
  // its canonical sequence matched exactly; hashes never create evidence on
  // their own.  Grouping by file pair and code-line offset lets a long clone
  // coalesce across different sliding-window hashes.
  const pairGroups = new Map<string, PairGroup>();
  for (const exact of buckets.values()) {
    for (const candidates of exact.values()) {
      const files = new Map<string, Candidate[]>();
      for (const candidate of candidates) {
        const list = files.get(candidate.filePath) ?? [];
        list.push(candidate);
        files.set(candidate.filePath, list);
      }
      if (files.size < 2) continue;

      const filePaths = [...files.keys()].sort(compareStrings);
      for (let leftIndex = 0; leftIndex < filePaths.length; leftIndex++) {
        for (let rightIndex = leftIndex + 1; rightIndex < filePaths.length; rightIndex++) {
          const leftPath = filePaths[leftIndex]!;
          const rightPath = filePaths[rightIndex]!;
          const key = `${leftPath}\u0000${rightPath}`;
          let group = pairGroups.get(key);
          if (!group) {
            group = { leftPath, rightPath, byDelta: new Map() };
            pairGroups.set(key, group);
          }
          const matches = pairCandidates(files.get(leftPath)!, files.get(rightPath)!);
          for (const match of matches) {
            const list = group.byDelta.get(match.delta) ?? [];
            list.push(match);
            group.byDelta.set(match.delta, list);
          }
        }
      }
    }
  }

  const pairRegions: Array<PairRegion & { leftPath: string; rightPath: string }> = [];
  const orderedGroups = [...pairGroups.values()].sort((a, b) =>
    compareStrings(a.leftPath, b.leftPath) || compareStrings(a.rightPath, b.rightPath),
  );
  for (const group of orderedGroups) {
    const deltas = [...group.byDelta.keys()].sort((a, b) => a - b);
    for (const delta of deltas) {
      for (const region of coalescePairMatches(group.byDelta.get(delta)!)) {
        pairRegions.push({ ...region, leftPath: group.leftPath, rightPath: group.rightPath });
      }
    }
  }

  pairRegions.sort((a, b) =>
    compareStrings(a.leftPath, b.leftPath) ||
    compareStrings(a.rightPath, b.rightPath) ||
    (a.left.startLine - b.left.startLine) ||
    (a.right.startLine - b.right.startLine),
  );

  const byFile = Object.assign(new Map<string, Issue[]>(), {
    candidateWindows,
    maxCandidateWindows: IDENTICAL_BLOCK_MAX_TOTAL_WINDOWS,
    skippedInputs,
    truncated,
  }) as IdenticalBlockIssueMap;
  for (const pair of pairRegions) {
    const leftIssues = byFile.get(pair.leftPath) ?? [];
    if (leftIssues.length < IDENTICAL_BLOCK_MAX_ISSUES_PER_FILE) {
      leftIssues.push(makeIssue(pair.left, pair.right));
      byFile.set(pair.leftPath, leftIssues);
    }
    const rightIssues = byFile.get(pair.rightPath) ?? [];
    if (rightIssues.length < IDENTICAL_BLOCK_MAX_ISSUES_PER_FILE) {
      rightIssues.push(makeIssue(pair.right, pair.left));
      byFile.set(pair.rightPath, rightIssues);
    }
  }

  for (const issues of byFile.values()) {
    issues.sort((a, b) =>
      (a.line - b.line) ||
      compareStrings(String(a.extras?.duplicateOf && (a.extras.duplicateOf as Record<string, unknown>).file),
        String(b.extras?.duplicateOf && (b.extras.duplicateOf as Record<string, unknown>).file)) ||
      compareStrings(String(a.extras?.duplicateOf && (a.extras.duplicateOf as Record<string, unknown>).hash),
        String(b.extras?.duplicateOf && (b.extras.duplicateOf as Record<string, unknown>).hash)),
    );
  }
  return byFile;
}

export interface DupIdenticalBlockContext {
  // Cross-file state is supplied by collectIdenticalBlockIssues().
}

export const dupIdenticalBlockRule = createRule<DupIdenticalBlockContext>({
  id: 'dup/identical-block',
  category: 'logic',
  severity: 'medium',
  aiSpecific: false,
  defaultOff: true,
  description: 'Repeated normalized code region across project files (Type-1 clone evidence)',
  create(_context: RuleContext): DupIdenticalBlockContext {
    return {};
  },
  analyze(_context: DupIdenticalBlockContext, _facts: ScanFacts): Issue[] {
    // A direct file analysis has no project set.  Returning [] is intentional:
    // it prevents cross-file state and preserves deterministic single-file API
    // behavior.  runScan() appends the batch coordinator's findings later.
    return [];
  },
});

/** Compatibility no-op for callers that used the old cache reset hook. */
export function resetIdenticalBlockCache(): void {
  // No module-scope state remains.
}

/** Compatibility alias retained for existing tests/integrations. */
export const _resetDedupCacheForTesting = resetIdenticalBlockCache;

export default dupIdenticalBlockRule satisfies Rule<DupIdenticalBlockContext>;
