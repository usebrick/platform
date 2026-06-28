import { isMainThread, parentPort, workerData } from 'node:worker_threads';
import { extname } from 'node:path';
import { parseFile } from '@usebrick/engine';
import { extractFacts } from './visitor';
import { BACKEND_EXTENSIONS } from './discover.js';
import { RuleRegistry } from '../rules/registry';
import { setLoggerQuiet } from './logger';
import { compositeScore } from '@usebrick/engine';
import { loadSignalStrength } from '../rules/signal-strength.js';
import type { FileScanResult, Issue, ResolvedConfig, ScanFacts } from '../types';

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

export async function scanFile(
  filePath: string,
  config: ResolvedConfig,
  registry?: RuleRegistry,
  cwd = process.cwd(),
): Promise<FileScanResult> {
  // v0.14.5l: split the backend early-return. Languages we have
  // visitors for (.py, .go) get the rule engine pass — rules that
  // need SWC silently produce 0 issues for those files, but
  // regex-based rules (markdown-leakage, comment-ratio, etc.) can
  // fire. Languages we have NO visitor for (.swift, .kt, .dart,
  // .rs, .cpp, .java, .rb, .php) still get the early-return
  // because every rule attempt would burn the parseError path.
  //
  // Tradeoff: the corpus scans now process ~70% more files, but
  // the v7 calibration sees more ground truth. v0.15 will add
  // real Python + Go AST support.
  const ext = extname(filePath).toLowerCase();
  const UNSUPPORTED_LANGS = new Set([
    '.swift', '.kt', '.kts', '.dart', '.rs',
    '.cpp', '.cc', '.cxx', '.c', '.h', '.hpp', '.hxx',
    '.java', '.rb', '.php',
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
    const { ast, source } = await parseFile(filePath);
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
