// PR slop scoring (CLI surface for `slopbrick pr`).
//
// Phase 11 of the 0.7.0 roadmap. Scores a PR by scanning only the
// files changed between two git refs, with the diff produced via
// `git diff --name-only base...head` (three-dot syntax = the merge-base
// comparison GitHub uses for PRs).
//
//   runPrScan(cwd, config, options) -> PrResult
//   formatPrReport(result, { format }) -> string
//   prExitCode(result) -> 0 | 1
//
// Exit codes (set by the program.ts action, not here):
//   0  — score ≤ threshold (PASS)
//   1  — score > threshold (FAIL — PR adds too much slop)
//   2  — fatal error (not a git repo, no config, IO failure)
//
// Score formula (per file):
//   slop       = sum(SEVERITY_WEIGHTS[issue.severity]) for all issues
//   violations = count of constitution violations
//   total      = slop + violations
// PR score = sum(per-file totals). Default threshold = 20.

import { readFileSync } from 'node:fs';
import { extname, relative, resolve } from 'node:path';
import { execFile as execFileCb } from 'node:child_process';
import { promisify } from 'node:util';
import { minimatch } from 'minimatch';

import { getFilesInRange, getGitRoot } from './git.js';
import { scanFile } from '../engine/worker';
import { SEVERITY_WEIGHTS } from '../engine/metrics';
import { checkFileConstitution } from '../mcp/patterns';
import { SOURCE_EXTENSIONS } from '../engine/discover.js';
import type { ResolvedConfig, Severity } from '../types';

const execFile = promisify(execFileCb);

// `.mdx` is supported as a source extension for the PR subcommand
// even though it's not in the engine's default `SOURCE_EXTENSIONS`
// set (we don't run the rule engine on it). The `pr` subcommand
// treats it as scoreable so projects that ship .mdx get coverage.
const PR_EXTENSIONS: Set<string> = new Set([...SOURCE_EXTENSIONS, '.mdx']);

export type PrFormat = 'text' | 'json' | 'markdown';

export interface PrOptions {
  /** Base ref (default 'main', falls back to 'master' then the first commit). */
  base?: string;
  /** Head ref (default 'HEAD'). */
  head?: string;
  /** Output format. Default: 'text'. */
  format?: PrFormat;
  /** Override the config-level threshold. */
  threshold?: number;
  /** Cap on files scanned. Default: 500. */
  maxFiles?: number;
}

export interface PrIssueEntry {
  ruleId: string;
  severity: Severity;
  line: number;
  message: string;
  category: string;
}

export interface PrConstitutionEntry {
  import: string;
  category: string;
  message: string;
}

export interface PrFileResult {
  /** Absolute file path on disk. */
  file: string;
  /** Path relative to `cwd`, forward-slash separated. */
  relPath: string;
  /** Per-file total (slop points + constitution violations). */
  score: number;
  /** Total issues found in the file. */
  issueCount: number;
  /** Constitution violation count. */
  constitutionViolationCount: number;
  /** Slop points (sum of SEVERITY_WEIGHTS for each issue). */
  slopPoints: number;
  /** Detailed issues (ruleId, severity, line, message). */
  issues: PrIssueEntry[];
  /** Detailed constitution violations. */
  constitutionViolations: PrConstitutionEntry[];
}

export interface PrResult {
  /** The base ref actually used (after fallback). */
  base: string;
  /** The head ref actually used. */
  head: string;
  /** Number of source files scanned after filtering. */
  filesChanged: number;
  /** Total PR slop score (sum of per-file scores). */
  totalScore: number;
  /** The threshold applied (CLI > config > default 20). */
  threshold: number;
  /** Issue counts grouped by rule category. */
  byCategory: Record<string, number>;
  /** Issue counts grouped by severity. */
  bySeverity: Record<Severity, number>;
  /** Per-file detail, sorted by descending score then relPath. */
  files: PrFileResult[];
  /** True when the PR's total score is within the threshold. */
  passed: boolean;
  /** When the scan ran. */
  generatedAt: string;
}

/**
 * Return the resolved SHA for a ref, or undefined if the ref does
 * not exist. Uses `git rev-parse --verify` so we can distinguish
 * "ref doesn't resolve" from "ref resolves but the diff is empty"
 * (both surface as `[]` from `getFilesInRange`).
 */
async function refExists(cwd: string, ref: string): Promise<string | undefined> {
  try {
    const { stdout } = await execFile('git', ['rev-parse', '--verify', '--quiet', `${ref}^{commit}`], {
      cwd,
      encoding: 'utf-8',
    });
    const sha = stdout.trim();
    return sha.length > 0 ? sha : undefined;
  } catch {
    return undefined;
  }
}

/**
 * Return the SHA of the first commit in the repository (the root
 * commit). Used as the last-resort base ref when neither 'main' nor
 * 'master' exists (e.g. shallow clones with a feature branch checked
 * out). Returns undefined in an empty repo with no commits.
 */
async function firstCommit(cwd: string): Promise<string | undefined> {
  try {
    const { stdout } = await execFile('git', ['rev-list', '--max-parents=0', 'HEAD'], {
      cwd,
      encoding: 'utf-8',
    });
    const lines = stdout.trim().split('\n').filter((l) => l.trim().length > 0);
    return lines.length > 0 ? lines[lines.length - 1]!.trim() : undefined;
  } catch {
    return undefined;
  }
}

/**
 * Resolve the base ref using a deterministic fallback chain:
 *   1. The user-provided value (default 'main').
 *   2. 'main'.
 *   3. 'master'.
 *   4. The first commit (covers shallow-clone edge cases).
 * Returns the literal ref name to use, or undefined when nothing
 * resolves (empty repo).
 */
async function resolveBaseRef(
  cwd: string,
  requested: string,
): Promise<string | undefined> {
  for (const ref of [requested, 'main', 'master']) {
    if (await refExists(cwd, ref)) return ref;
  }
  return firstCommit(cwd);
}

/**
 * Build the candidate set of files to score for this PR.
 *
 * Order of operations:
 *  1. List changed files via `git diff --name-only base...head`.
 *  2. Filter to source extensions known to slopbrick.
 *  3. Apply the config's include/exclude globs.
 *  4. Drop any files that don't exist on disk (e.g. deleted in the PR).
 *  5. Cap at `maxFiles`.
 */
async function discoverPrFiles(
  cwd: string,
  config: ResolvedConfig,
  base: string,
  head: string,
  maxFiles: number,
): Promise<string[]> {
  const gitFiles = await getFilesInRange(cwd, base, head);
  if (gitFiles.length === 0) return [];

  const sourceFiles: string[] = [];
  for (const relOrAbs of gitFiles) {
    // git paths are repo-relative forward-slash; resolve against cwd.
    const abs = resolve(cwd, relOrAbs);
    const ext = extname(abs).toLowerCase();
    if (!PR_EXTENSIONS.has(ext)) continue;
    const rel = relative(cwd, abs).split('\\').join('/');

    if (
      config.include.length > 0 &&
      !config.include.some((pattern) => minimatch(rel, pattern))
    ) {
      continue;
    }
    if (config.exclude.some((pattern) => minimatch(rel, pattern))) {
      continue;
    }
    sourceFiles.push(abs);
  }

  return sourceFiles.slice(0, maxFiles);
}

/**
 * Run the PR slop scan. Returns a fully populated `PrResult` even when
 * the diff is empty (in that case `totalScore` is 0, `filesChanged`
 * is 0, and `passed` is true).
 *
 * Never throws on per-file errors — a single unreadable file is
 * logged via `logger.warn` (or silently skipped in `--quiet` mode)
 * and the scan continues. Throws only on fatal configuration /
 * git errors.
 */
export async function runPrScan(
  cwd: string,
  config: ResolvedConfig,
  options: PrOptions = {},
): Promise<PrResult> {
  const head = options.head ?? 'HEAD';
  const requestedBase = options.base ?? 'main';
  const threshold = options.threshold ?? config.prScoreThreshold ?? 20;
  const maxFiles = options.maxFiles ?? 500;

  if (!getGitRoot(cwd)) {
    throw new Error(`Not a git repository: ${cwd}`);
  }

  const base = (await resolveBaseRef(cwd, requestedBase)) ?? requestedBase;

  const candidates = await discoverPrFiles(cwd, config, base, head, maxFiles);

  const files: PrFileResult[] = [];
  const byCategory: Record<string, number> = {};
  const bySeverity: Record<Severity, number> = { low: 0, medium: 0, high: 0 };
  let totalScore = 0;

  for (const absPath of candidates) {
    let source: string;
    try {
      source = readFileSync(absPath, 'utf-8');
    } catch {
      continue;
    }

    // ---- 1. Constitution check (cheap) ------------------------------
    const constitutionResult = checkFileConstitution(source, config.constitution);

    // ---- 2. Slop scan via worker.scanFile ----------------------------
    let scan;
    try {
      scan = await scanFile(absPath, config);
    } catch {
      continue;
    }

    const issues: PrIssueEntry[] = scan.issues.map((i) => ({
      ruleId: i.ruleId,
      severity: i.severity,
      line: i.line,
      message: i.message,
      category: i.category,
    }));

    const constitutionViolations: PrConstitutionEntry[] = constitutionResult.violations.map(
      (v) => ({
        import: v.import,
        category: v.category,
        message: v.message,
      }),
    );

    let slopPoints = 0;
    for (const issue of scan.issues) {
      const weight = SEVERITY_WEIGHTS[issue.severity] ?? 0;
      slopPoints += weight;
      bySeverity[issue.severity] = (bySeverity[issue.severity] ?? 0) + 1;
      byCategory[issue.category] = (byCategory[issue.category] ?? 0) + 1;
    }
    // Constitution violations are counted under their own category
    // (stateManagement, dataFetching, ..., or "forbidden") so the
    // byCategory breakdown is consistent with the slop issues.
    for (const v of constitutionResult.violations) {
      byCategory[v.category] = (byCategory[v.category] ?? 0) + 1;
    }

    const constitutionPenalty = constitutionResult.violations.length;
    const fileScore = slopPoints + constitutionPenalty;

    if (issues.length === 0 && constitutionViolations.length === 0) {
      // Skip files that contribute nothing to the score so the report
      // stays focused on the offenders.
      continue;
    }

    totalScore += fileScore;

    files.push({
      file: absPath,
      relPath: relative(cwd, absPath).split('\\').join('/'),
      score: fileScore,
      issueCount: issues.length,
      constitutionViolationCount: constitutionViolations.length,
      slopPoints,
      issues,
      constitutionViolations,
    });
  }

  files.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    return a.relPath < b.relPath ? -1 : a.relPath > b.relPath ? 1 : 0;
  });

  return {
    base,
    head,
    filesChanged: files.length,
    totalScore,
    threshold,
    byCategory,
    bySeverity,
    files,
    passed: totalScore <= threshold,
    generatedAt: new Date().toISOString(),
  };
}

/**
 * Render the PR slop report for the terminal (text) or for
 * downstream consumers (json / markdown).
 */
export function formatPrReport(
  result: PrResult,
  opts: { format: PrFormat } = { format: 'text' },
): string {
  if (opts.format === 'json') {
    return JSON.stringify(result, null, 2);
  }
  if (opts.format === 'markdown') {
    return formatPrMarkdown(result);
  }
  return formatPrText(result);
}

function formatPrText(result: PrResult): string {
  const lines: string[] = [];
  const verdict = result.passed ? 'PASS' : 'FAIL';
  lines.push(`PR score: ${result.totalScore} (threshold: ${result.threshold}) — ${verdict}`);
  lines.push(`Base: ${result.base}  Head: ${result.head}`);
  lines.push(`Files changed: ${result.filesChanged}`);
  lines.push('');

  if (result.files.length === 0) {
    lines.push('  (no source files changed in this diff)');
  } else {
    for (const file of result.files) {
      lines.push(
        `${file.relPath}  issues=${file.issueCount}  constitution=${file.constitutionViolationCount}  score=${file.score}`,
      );
      for (const issue of file.issues) {
        const sev = issue.severity.padEnd(7);
        lines.push(`  [${sev}] ${issue.ruleId} — line ${issue.line}`);
        lines.push(`             ${issue.message}`);
      }
      for (const v of file.constitutionViolations) {
        lines.push(`  [forbidden] ${v.message}`);
      }
    }
  }

  lines.push('');
  lines.push('─'.repeat(60));
  lines.push(
    `PR score: ${result.totalScore} / ${result.threshold} threshold — ${verdict}`,
  );

  if (Object.keys(result.bySeverity).length > 0) {
    const sev = result.bySeverity;
    lines.push(
      `  By severity: low=${sev.low}  medium=${sev.medium}  high=${sev.high}`,
    );
  }
  if (Object.keys(result.byCategory).length > 0) {
    lines.push('  By category:');
    const entries = Object.entries(result.byCategory).sort((a, b) => b[1] - a[1]);
    for (const [cat, n] of entries) {
      lines.push(`    ${cat.padEnd(12)} ${n}`);
    }
  }

  return lines.join('\n');
}

function formatPrMarkdown(result: PrResult): string {
  const verdict = result.passed ? 'PASS' : 'FAIL';
  const lines: string[] = [];
  lines.push('# PR slop report');
  lines.push('');
  lines.push(`- **Base:** \`${result.base}\``);
  lines.push(`- **Head:** \`${result.head}\``);
  lines.push(`- **Files changed:** ${result.filesChanged}`);
  lines.push(`- **Score:** **${result.totalScore}** / ${result.threshold} threshold — **${verdict}**`);
  lines.push('');

  if (Object.keys(result.bySeverity).some((k) => result.bySeverity[k as Severity] > 0)) {
    const sev = result.bySeverity;
    lines.push('## By severity');
    lines.push('');
    lines.push(`| Low | Medium | High |`);
    lines.push(`|-----|--------|------|`);
    lines.push(`| ${sev.low} | ${sev.medium} | ${sev.high} |`);
    lines.push('');
  }

  lines.push('## Files');
  lines.push('');
  lines.push('| File | Issues | Constitution | Score |');
  lines.push('|------|--------|--------------|-------|');
  if (result.files.length === 0) {
    lines.push('| _no source files changed in this diff_ | | | |');
  } else {
    for (const f of result.files) {
      lines.push(
        `| \`${f.relPath}\` | ${f.issueCount} | ${f.constitutionViolationCount} | ${f.score} |`,
      );
    }
  }
  lines.push('');

  for (const f of result.files) {
    lines.push(`<details><summary>${f.relPath} — score ${f.score}</summary>`);
    lines.push('');
    for (const i of f.issues) {
      lines.push(`- \`[${i.severity}] ${i.ruleId}\` — line ${i.line}: ${i.message}`);
    }
    for (const v of f.constitutionViolations) {
      lines.push(`- \`[forbidden]\` ${v.message}`);
    }
    lines.push('');
    lines.push('</details>');
    lines.push('');
  }

  lines.push(`---`);
  lines.push(`*${verdict} — generated ${result.generatedAt}*`);
  return lines.join('\n');
}

/**
 * Pure helper: derive a stable exit code from a `PrResult` without
 * coupling the test to `process.exit`. Used by the program.ts action
 * and by tests.
 */
export function prExitCode(result: PrResult): 0 | 1 {
  return result.totalScore > result.threshold ? 1 : 0;
}
