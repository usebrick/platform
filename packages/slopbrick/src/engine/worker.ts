import { isMainThread, parentPort, workerData } from 'node:worker_threads';
import { extname } from 'node:path';
import { join, relative, sep } from 'node:path';
import { minimatch } from 'minimatch';
import { parseFile } from '@usebrick/engine';
import type { ParserCacheConfig } from '@usebrick/engine';
import { extractFacts } from './visitor';
import { BACKEND_EXTENSIONS } from './discover.js';
import { RuleRegistry } from '../rules/registry';
import { setLoggerQuiet } from './logger';
import { compositeScore } from '@usebrick/engine';
import { loadSignalStrength } from '../rules/signal-strength.js';
import type { FileScanResult, Issue, ResolvedConfig, ScanFacts } from '../types';

// v0.18.3 (R-MED env-var fix): the parser cache is now a
// passed option, not an env-var read inside the engine. The
// slopbrick CLI is the boundary that reads the env vars
// (SLOP_AUDIT_CACHE, SLOP_AUDIT_CACHE_ROOT) and threads the
// ParserCacheConfig into parseFile via the worker. The
// engine is now pure — no process.env, no process.cwd in
// the parser hot path.
function buildParserCacheConfig(cwd: string): ParserCacheConfig {
  const envVal = process.env.SLOP_AUDIT_CACHE;
  const enabled = envVal === '1' || envVal === 'true';
  const root = process.env.SLOP_AUDIT_CACHE_ROOT
    ?? join(cwd, '.slopbrick', 'cache', 'ast');
  return { enabled, root };
}

function applyRuleOverrides(issues: Issue[], rules: ResolvedConfig['rules']): Issue[] {
  const result: Issue[] = [];
  for (const issue of issues) {
    const override = rules[issue.ruleId];
    if (override === 'off') continue;
    if (override === 'auto' || override === undefined) {
      result.push(issue);
      continue;
    }
    result.push({ ...issue, severity: override });
  }
  return result;
}

/**
 * v0.25.0: self-scan exclusion. Returns true if `filePath` (absolute)
 * matches any glob in `excludePaths` relative to `cwd`. Used at the
 * top of `scanFile` to short-circuit files that would be false
 * positives in a self-scan (rule definitions, test fixtures, rule
 * test files).
 *
 * Behavior:
 *   - `excludePaths` undefined or `[]` → returns false (no exclusion).
 *   - Otherwise: returns true if any glob matches.
 *
 * Match uses minimatch with `{ dot: true }` semantics (the same
 * convention `cli/scan.ts:177` uses for `config.exclude`).
 */
function isExcludedBySelfScan(
  filePath: string,
  cwd: string,
  excludePaths: string[] | undefined,
): boolean {
  if (!excludePaths || excludePaths.length === 0) return false;
  const rel = relative(cwd, filePath).split(sep).join('/');
  return excludePaths.some((pattern) => minimatch(rel, pattern, { dot: true }));
}

export async function scanFile(
  filePath: string,
  config: ResolvedConfig,
  registry?: RuleRegistry,
  cwd = process.cwd(),
): Promise<FileScanResult> {
  // v0.25.0: self-scan excludePaths enforcement. Runs BEFORE
  // parseFile so excluded files cost zero parse cycles (only a
  // minimatch match). Default excludes (in `config/defaults.ts`)
  // cover `src/rules/**`, `tests/fixtures/**`, and `tests/rules/**`
  // — the three paths that are always false positives in a
  // self-scan of the slopbrick repo. Users can opt out by setting
  // `selfScan: { excludePaths: [] }` in slopbrick.config.mjs.
  if (isExcludedBySelfScan(filePath, cwd, config.selfScan?.excludePaths)) {
    return {
      filePath,
      componentCount: 0,
      issues: [],
      gapValues: [],
      styleSources: [],
      elementTags: [],
      unmatchedStringLiterals: [],
    };
  }

  // v0.18.3 (R-MED env-var fix): build the parser cache config
  // from env vars (read here in the slopbrick CLI layer, not
  // in the engine). Passed to parseFile below.
  const cache = buildParserCacheConfig(cwd);

  // v0.14.5l: split the backend early-return. Languages we have
  // visitors for (.py, .go, .rs) get the rule engine pass — rules
  // that need SWC silently produce 0 issues for those files, but
  // regex-based rules (markdown-leakage, comment-ratio, etc.) can
  // fire. Languages we have NO visitor for (.swift, .dart,
  // .cpp, .rb, .php) still get the early-return because every
  // rule attempt would burn the parseError path.
  //
  // v0.18.9: removed `.rs` from this set. The tree-sitter Rust
  // integration (see `visitors/rust.ts` and `parser-rust.ts`) is
  // wired through `v2-build.ts::buildRustFileRecord`, which fires
  // for `.rs` files. The 4 new `rust/*` rules (unused-pub-fn,
  // unwrap-in-production, todo-macro, stringly-typed) need this
  // for their v0.18.9 v8.5 calibration to produce non-DORMANT
  // verdicts. Tradeoff: corpus scans now process Rust files,
  // adding ~10-20s per 1,000 Rust files.
  //
  // v0.24.5: removed `.java` from this set (v9 corpus build).
  // Java files now flow through `parseSource` → `parseBlankModule`
  // (returns empty AST + original source), and the worker fires
  // regex-only rules on `facts.v2._source`. The 6 v0.20.0
  // `java/*` rules (system-out-println, empty-catch-block, etc.)
  // are regex-based and will start firing. AST-dependent rules
  // (component/*, layout/*, ai/*) silently produce 0 issues on
  // `.java` files since the AST is a structural placeholder. The
  // 6 java rules gate themselves on `/\.java$/i.test(filePath)`
  // inside their `analyze()` so they don't fire on TS/Go files
  // that happen to contain Java-looking source in comments.
  //
  // v0.28.0: removed `.kt` and `.kts` from this set (v9 Kotlin
  // corpus build). All 5 `kotlin/*` rules are regex-based (the
  // tree-sitter Kotlin integration is a much larger lift; the
  // v0.27.0 methodology paper confirmed era-confounding is the
  // dominant signal anyway, so a regex-only Kotlin pass is
  // sufficient for the calibration goal). Same trade-off as
  // Java: AST-dependent rules silently produce 0 issues on
  // `.kt`/`.kts` files. The 5 kotlin rules gate themselves on
  // `/\.kts?$/i.test(filePath)` inside their `analyze()`.
  const ext = extname(filePath).toLowerCase();
  const UNSUPPORTED_LANGS = new Set([
    '.swift', '.dart',
    '.cpp', '.cc', '.cxx', '.c', '.h', '.hpp', '.hxx',
    '.rb', '.php',
  ]);
  if (UNSUPPORTED_LANGS.has(ext)) {
    return {
      filePath,
      componentCount: 0,
      issues: [],
      gapValues: [],
      styleSources: [],
      elementTags: [],
      unmatchedStringLiterals: [],
    };
  }

  try {
    const { ast, source } = await parseFile(filePath, { cache });
    const facts = extractFacts(filePath, ast, source, config.supportsRsc ?? true, config.framework ?? 'react', config);

    const activeRegistry = registry ?? new RuleRegistry();
    if (!registry) {
      activeRegistry.loadBuiltins();
    }
    const rules = activeRegistry.createContexts(config, filePath, cwd);
    // v0.14.5c-fix3: per-rule try/catch so a buggy rule doesn't take
    // down the whole file scan. Previously, `rules.flatMap` would
    // propagate any rule.analyze() exception up to the outer try/catch
    // where it was mis-categorized as a parseError — so a single
    // broken rule (e.g., `require()` in an ESM module) made every
    // file look like a parse failure. Now we isolate each rule.
    const rawIssues: Issue[] = [];
    for (const { rule, context } of rules) {
      try {
        const issues = rule.analyze(context, facts);
        rawIssues.push(...issues);
      } catch (err) {
        // A buggy rule should not block the scan. Log to stderr in
        // debug mode (when SLOP_AUDIT_DEBUG=1) but stay silent otherwise
        // — production scans hit 100k+ files, and a per-rule log line
        // per file would be noise.
        if (process.env.SLOP_AUDIT_DEBUG === '1') {
          console.error(`[worker] rule ${rule.id} threw on ${filePath}: ${(err as Error).message}`);
        }
      }
    }
    const issues = applyRuleOverrides(rawIssues, config.rules);

    // v0.14.6: composite AI-likelihood score. Naive Bayes LLR
    // combination of the unique rule IDs that fired on this file
    // (post-severity-override). See src/engine/composite-scoring.ts
    // for the math and references.
    const triggeredRuleIds = Array.from(new Set(issues.map((i) => i.ruleId)));
    const compScore = compositeScore(triggeredRuleIds, loadSignalStrength());

    const gapValues = collectGapValues(facts);
    const styleSources = collectStyleSources(facts);
    const elementTags = facts.v2.jsx.elements.map((e) => e.tag);
    const unmatchedStringLiterals: string[] = [];

    return {
      filePath,
      componentCount: facts.v2.components.length,
      issues,
      gapValues,
      styleSources,
      elementTags,
      unmatchedStringLiterals,
      facts,
      compositeScore: compScore,
    };
  } catch (err) {
    return {
      filePath,
      componentCount: 0,
      issues: [],
      parseError: err instanceof Error ? err.message : String(err),
      gapValues: [],
      styleSources: [],
      unmatchedStringLiterals: [],
    };
  }
}

async function run(): Promise<void> {
  const data = workerData as { config: unknown; quiet?: unknown };
  if (!data.config || typeof data.config !== 'object') {
    throw new Error('workerData.config must be a ResolvedConfig object');
  }
  setLoggerQuiet(data.quiet === true);
  const { config } = data as { config: ResolvedConfig };

  const registry = new RuleRegistry();
  registry.loadBuiltins();

  if (!parentPort) {
    throw new Error('parentPort is not available in worker thread');
  }

  parentPort.on('message', async (msg: { filePath?: string }) => {
    if (!parentPort || !msg.filePath) return;
    const result = await scanFile(msg.filePath, config, registry, process.cwd());
    parentPort.postMessage({ type: 'result', result });
    parentPort.postMessage({ type: 'ready' });
  });

  parentPort.postMessage({ type: 'ready' });
}

function collectGapValues(facts: ScanFacts): string[] {
  const values: string[] = [];
  // Walk every JSX element's className tokens for a representative gap.
  for (const el of facts.v2.jsx.elements) {
    const firstGap = el.classNames.find((token) => /^gap(-[xy])?-/.test(token));
    if (firstGap) values.push(firstGap);
  }
  // gap-from-style-source check falls back to scanning raw inlineStyles
  // (parsed key→value maps) when present.
  for (const el of facts.v2.jsx.elements) {
    const gap = el.inlineStyles.gap;
    if (gap) values.push(gap);
  }
  return values;
}

function collectStyleSources(facts: ScanFacts): string[] {
  const sources: string[] = [];
  for (const el of facts.v2.jsx.elements) {
    sources.push(...el.classNames);
  }
  return sources;
}

if (!isMainThread) {
  run().catch((err) => {
    console.error(err);
    process.exitCode = 1;
    parentPort?.close();
  });
}
