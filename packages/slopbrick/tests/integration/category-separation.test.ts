import { describe, it, expect } from 'vitest';
import { existsSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { parseFile } from '@usebrick/engine';
import { extractFacts } from '../../src/engine/visitor';
import { scoreFile, aggregateReport } from '../../src/engine/metrics';
import { SEVERITY_WEIGHTS } from '../../src/engine/metrics';
import { builtinRules } from '../../src/rules/builtins';
import { RuleRegistry } from '../../src/rules/registry';
import type { ResolvedConfig, ScanFacts } from '../../src/types';

const POSITIVE_DIR = '/Users/cheng/ai-slop-baseline/extracted/positive';
const NEGATIVE_DIR = '/Users/cheng/ai-slop-baseline/extracted/negative';

const DEFAULT_CONFIG: ResolvedConfig = {
  include: [],
  exclude: [],
  rules: {},
  frameworkMultipliers: { react: 1, vue: 1, svelte: 1, astro: 1, html: 1 },
  ruleConfig: {},
  arbitraryValueAllowlist: [],
  wcag: { targetSizeExemptSelectors: [] },
  thresholds: { meanSlop: 15, p90Slop: 30, individualSlopThreshold: 60 },
};

const registry = new RuleRegistry();
registry.loadBuiltins();

async function scanFileSafe(filePath: string): Promise<ScanFacts | null> {
  try {
    const { ast, source } = await parseFile(filePath);
    return extractFacts(filePath, ast, source);
  } catch {
    return null;
  }
}

async function sampleFiles(dir: string, max: number): Promise<string[]> {
  if (!existsSync(dir)) return [];
  const out: string[] = [];
  const SOURCE_EXTENSIONS = new Set(['.ts', '.tsx', '.js', '.jsx']);
  const walk = (current: string): void => {
    if (out.length >= max) return;
    let entries: string[];
    try {
      entries = readdirSync(current);
    } catch {
      return;
    }
    for (const entry of entries) {
      if (out.length >= max) return;
      const full = join(current, entry);
      let st;
      try {
        st = statSync(full);
      } catch {
        continue;
      }
      if (st.isDirectory()) {
        walk(full);
      } else if (st.isFile()) {
        const dot = entry.lastIndexOf('.');
        if (dot > 0 && SOURCE_EXTENSIONS.has(entry.slice(dot).toLowerCase())) {
          out.push(full);
        }
      }
    }
  };
  walk(dir);
  return out;
}

interface CategoryAcc {
  boundary: number;
  context: number;
  visual: number;
  total: number;
}

async function measureDir(dir: string, max = 100): Promise<CategoryAcc> {
  const files = await sampleFiles(dir, max);
  const acc: CategoryAcc = { boundary: 0, context: 0, visual: 0, total: 0 };
  for (const fp of files) {
    const facts = await scanFileSafe(fp);
    if (!facts) continue;
    const rules = registry.createContexts(DEFAULT_CONFIG, fp, '/');
    const issues = rules.flatMap(({ rule, context }) => rule.analyze(context, facts));
    const filtered = issues.filter((i) => i.category !== 'security');
    if (filtered.length === 0) continue;
    acc.total += 1;
    for (const issue of filtered) {
      const weight = SEVERITY_WEIGHTS[issue.severity] ?? 1;
      // Map category to bucket the same way metrics.ts RULE_TO_BUCKET does
      if (issue.category === 'component' && issue.ruleId.includes('giant')) acc.boundary += weight;
      else if (issue.ruleId === 'logic/boundary-violation') acc.boundary += weight;
      else if (issue.category === 'visual' || issue.category === 'layout' || issue.category === 'typo' || issue.category === 'wcag' || issue.category === 'perf') {
        acc.visual += weight;
      } else {
        acc.context += weight;
      }
    }
  }
  return acc;
}

describe('composite Slop Index category separation', () => {
  it.skipIf(!existsSync(POSITIVE_DIR) || !existsSync(NEGATIVE_DIR))(
    'reports per-bucket separation between AI and human corpora',
    async () => {
      const positive = await measureDir(POSITIVE_DIR, 50);
      const negative = await measureDir(NEGATIVE_DIR, 50);

      // Sanity: both corpora should have non-empty samples.
      expect(positive.total).toBeGreaterThan(0);
      expect(negative.total).toBeGreaterThan(0);

      // Per-bucket avg weight should be higher for AI than human on at
      // least one bucket (we don't require all three because some
      // buckets are intentionally weaker — that's what the diagnostic is
      // for).
      const aiAvg = {
        boundary: positive.boundary / positive.total,
        context: positive.context / positive.total,
        visual: positive.visual / positive.total,
      };
      const humanAvg = {
        boundary: negative.boundary / negative.total,
        context: negative.context / negative.total,
        visual: negative.visual / negative.total,
      };
      const separation = {
        boundary: aiAvg.boundary - humanAvg.boundary,
        context: aiAvg.context - humanAvg.context,
        visual: aiAvg.visual - humanAvg.visual,
      };

      // At least one bucket must separate by >= 1 weight point per file.
      // This catches regressions where a category becomes useless.
      const bestSeparation = Math.max(separation.boundary, separation.context, separation.visual);
      expect(bestSeparation, `category separation too weak: ${JSON.stringify(separation)}`).toBeGreaterThanOrEqual(1);

      // Diagnostic output for human review.
      // eslint-disable-next-line no-console
      console.log('\nCategory separation diagnostic:');
      // eslint-disable-next-line no-console
      console.log(`  positive: ${positive.total} files scanned`);
      // eslint-disable-next-line no-console
      console.log(`  negative: ${negative.total} files scanned`);
      // eslint-disable-next-line no-console
      console.log(`  AI avg weights:   boundary=${aiAvg.boundary.toFixed(2)} context=${aiAvg.context.toFixed(2)} visual=${aiAvg.visual.toFixed(2)}`);
      // eslint-disable-next-line no-console
      console.log(`  human avg weights: boundary=${humanAvg.boundary.toFixed(2)} context=${humanAvg.context.toFixed(2)} visual=${humanAvg.visual.toFixed(2)}`);
      // eslint-disable-next-line no-console
      console.log(`  AI - human:       boundary=${separation.boundary.toFixed(2)} context=${separation.context.toFixed(2)} visual=${separation.visual.toFixed(2)}`);
    },
    60_000,
  );
});

// Reference the builtin rules so the test file isn't flagged for unused
// imports if the registry is dropped in a future refactor.
void builtinRules;