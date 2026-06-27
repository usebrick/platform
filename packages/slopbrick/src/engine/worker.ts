import { isMainThread, parentPort, workerData } from 'node:worker_threads';
import { extname } from 'node:path';
import { parseFile } from './parser';
import { extractFacts } from './visitor';
import { BACKEND_EXTENSIONS } from './discover.js';
import { RuleRegistry } from '../rules/registry';
import { setLoggerQuiet } from './logger';
import { compositeScore } from './composite-scoring';
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
  // v0.9.2 — Backend files (Python, Go) are skipped by the rule engine
  // because the existing AST visitors only know JS/TSX/Vue/Svelte/Astro/
  // HTML. The inventory still picks them up via the lazy-imported
  // backend visitors in buildPatternInventory, so service/route/ormModel
  // patterns surface in cross-file drift detection — but the main scan
  // doesn't try to parse them.
  if (BACKEND_EXTENSIONS.has(extname(filePath).toLowerCase())) {
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
    const rawIssues = rules.flatMap(({ rule, context }) => rule.analyze(context, facts));
    const issues = applyRuleOverrides(rawIssues, config.rules);

    // v0.14.6: composite AI-likelihood score. Naive Bayes LLR
    // combination of the unique rule IDs that fired on this file
    // (post-severity-override). See src/engine/composite-scoring.ts
    // for the math and references.
    const triggeredRuleIds = Array.from(new Set(issues.map((i) => i.ruleId)));
    const compScore = compositeScore(triggeredRuleIds);

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
