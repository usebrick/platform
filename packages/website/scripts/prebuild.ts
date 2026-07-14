/* ============================================================
   prebuild — read the slopbrick + core package.json files
   and write src/data/version.json so the Footer can show the
   live version. Runs automatically before `astro build` via
   the `prebuild` script in package.json.
   ============================================================ */

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, resolve } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, '..');

function readVersion(pkgPath: string): string {
  try {
    const data = JSON.parse(readFileSync(pkgPath, 'utf-8'));
    return data.version || '0.0.0';
  } catch (err) {
    console.warn(`prebuild: could not read ${pkgPath}, using 0.0.0`);
    return '0.0.0';
  }
}

const slopbrick = readVersion(join(root, '..', 'slopbrick', 'package.json'));
const core = readVersion(join(root, '..', 'core', 'package.json'));

function readJson<T>(filePath: string, fallback: T): T {
  try {
    return JSON.parse(readFileSync(filePath, 'utf-8')) as T;
  } catch {
    return fallback;
  }
}

function readCatalogCounts(filePath: string): { ruleCount: number; categoryCount: number } {
  try {
    const catalog = readFileSync(filePath, 'utf-8');
    const ruleCount = Number(catalog.match(/\*\*Total rules:\s*(\d+)/)?.[1] ?? 0);
    const section = catalog.match(/## Category distribution\n\n([\s\S]*?)\n## /)?.[1] ?? '';
    const categoryCount = [...section.matchAll(/^\| `[^`]+` \|/gm)].length;
    return { ruleCount, categoryCount };
  } catch {
    return { ruleCount: 0, categoryCount: 0 };
  }
}

interface RegistryFacts {
  ruleCount: number;
  categoryCount: number;
  ruleIds: string[];
}

/**
 * Read the generated executable registry and its rule modules. The website
 * must not treat a hand-edited catalog as the source of truth; the catalog is
 * checked against these facts below and the build fails on drift.
 */
function readRegistryFacts(builtinsPath: string, rulesRoot: string): RegistryFacts {
  const builtins = readFileSync(builtinsPath, 'utf-8');
  const importPaths = [...builtins.matchAll(/^import \{ \w+ \} from '\.\/([^/]+)\/([^']+)';$/gm)]
    .map((match) => ({ category: match[1]!, file: match[2]! }));
  const ruleIds = importPaths.map(({ category, file }) => {
    const source = readFileSync(join(rulesRoot, category, `${file}.ts`), 'utf-8');
    const id = source.match(/\bid:\s*['"]([^'"]+)['"]/)?.[1];
    if (!id) throw new Error(`prebuild: no rule id found in ${category}/${file}.ts`);
    return id;
  });
  return {
    ruleCount: ruleIds.length,
    categoryCount: new Set(importPaths.map(({ category }) => category)).size,
    ruleIds,
  };
}

const signalPath = join(root, '..', 'slopbrick', 'src', 'rules', 'signal-strength.json');
const signal = readJson<Record<string, any>>(signalPath, {});
const v10Meta = signal._v10_1Meta ?? {};
const catalogCounts = readCatalogCounts(join(root, '..', 'slopbrick', 'docs', 'rule-catalog.md'));
const registryFacts = readRegistryFacts(
  join(root, '..', 'slopbrick', 'src', 'rules', 'builtins.ts'),
  join(root, '..', 'slopbrick', 'src', 'rules'),
);
if (catalogCounts.ruleCount !== registryFacts.ruleCount || catalogCounts.categoryCount !== registryFacts.categoryCount) {
  throw new Error(
    `prebuild: catalog drift (${catalogCounts.ruleCount}/${catalogCounts.categoryCount}) ` +
    `does not match executable registry (${registryFacts.ruleCount}/${registryFacts.categoryCount}); ` +
    'run `pnpm generate:rules` before building the website',
  );
}
const signalRuleIds = Object.keys(signal).filter((id) => !id.startsWith('_')).sort();
const registryRuleIds = [...registryFacts.ruleIds].sort();
if (signalRuleIds.length !== registryRuleIds.length || signalRuleIds.some((id, index) => id !== registryRuleIds[index])) {
  throw new Error('prebuild: signal-strength rule keys drift from the executable registry');
}
const negativeFiles = Number(v10Meta.negativeFileCount ?? 0);
const positiveFiles = Number(v10Meta.positiveFileCount ?? 0);
const sampleFiles = Number(v10Meta.positiveSampleSize ?? 0) + Number(v10Meta.negativeSampleSize ?? 0);
const analyzedFiles = positiveFiles + negativeFiles;

function buildMetadataDate(): string {
  const raw = process.env.SOURCE_DATE_EPOCH;
  if (raw !== undefined && /^\d+$/.test(raw)) {
    const date = new Date(Number(raw) * 1000);
    if (!Number.isNaN(date.valueOf())) return date.toISOString().slice(0, 10);
  }
  // A wall-clock date makes static builds differ byte-for-byte and can make
  // an unreleased candidate look freshly shipped. Keep the default explicit;
  // release automation may provide SOURCE_DATE_EPOCH for a reproducible date.
  return 'unreleased';
}
const showcaseIds = [
  'ai/comment-ratio',
  'ai/compression-profile',
  'security/dangerous-cors',
  'visual/spacing-scale-violation',
  'test/weak-assertion',
  'ai/console-debug-storm',
  'dup/identical-block',
  'docs/stale-package-reference',
];
const showcaseRules = Object.fromEntries(showcaseIds.map((id) => {
  const entry = signal[id] ?? {};
  const negative = Number(entry._v10_1NegativeFiles ?? entry._v10NegativeFiles ?? 0);
  return [id, {
    precision: Number(entry._v10_1Precision ?? entry._v10Precision ?? entry.precision ?? 0),
    recall: Number(entry._v10_1Recall ?? entry._v10Recall ?? entry.recall ?? 0),
    fpr: negativeFiles > 0 ? negative / negativeFiles : Number(entry.fpRate ?? 0),
    defaultOff: entry.defaultOff === true,
    verdict: entry._v10_1Signal ?? entry._v10Signal ?? entry.verdict ?? 'unmeasured',
  }];
}));

const data = {
  slopbrick,
  core,
  built: buildMetadataDate(),
};

const outDir = join(root, 'src', 'data');
mkdirSync(outDir, { recursive: true });
const outPath = join(outDir, 'version.json');
writeFileSync(outPath, JSON.stringify(data, null, 2) + '\n');

const productFacts = {
  ...registryFacts,
  // Backward-compatible top-level aliases used by the current components.
  ruleCount: registryFacts.ruleCount,
  categoryCount: registryFacts.categoryCount,
  defaultOffCount: Object.entries(signal)
    .filter(([id, entry]) => !id.startsWith('_') && (entry as any)?.defaultOff === true).length,
  corpusFiles: analyzedFiles,
  corpusLabel: 'v10.1 historical',
  corpusAnalyzedFiles: analyzedFiles,
  corpusSampleFiles: sampleFiles,
  measuredRuleCount: Object.values(signal).filter((entry: any) => entry && !entry._v10_1Meta && entry._v10_1Precision !== undefined).length,
  unmeasuredRuleCount: registryFacts.ruleCount - Object.values(signal).filter((entry: any) => entry && !entry._v10_1Meta && entry._v10_1Precision !== undefined).length,
  workspaceStatus: 'unreleased candidate',
  candidate: {
    version: slopbrick,
    ruleCount: registryFacts.ruleCount,
    categoryCount: registryFacts.categoryCount,
  },
  published: {
    version: '0.43.0',
    ruleCount: 103,
    categoryCount: 22,
    verifiedAt: '2026-07-12',
    source: 'npm registry metadata and unpacked slopbrick@0.43.0 audit',
  },
  showcaseRules,
};
const factsPath = join(outDir, 'product-facts.json');
writeFileSync(factsPath, JSON.stringify(productFacts, null, 2) + '\n');

console.log(`prebuild: wrote ${outPath} (slopbrick=${slopbrick}, core=${core})`);
console.log(`prebuild: wrote ${factsPath} (${productFacts.ruleCount} rules, ${productFacts.categoryCount} categories)`);
