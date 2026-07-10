/**
 * Contract for the host/editor-safe portion of @usebrick/engine.
 *
 * The root entry point intentionally preserves Node compatibility adapters.
 * Consumers that already own source text must be able to import this entry
 * without pulling filesystem discovery or process behaviour into their bundle.
 */

import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

const PURE_RUNTIME_EXPORTS = [
  'AI_FAVORED_RULE_IDS',
  'DEFAULT_PRIOR',
  'HUMAN_FAVORED_RULE_IDS',
  'KL_NOVELTY_EPSILON',
  'MDL_SMOOTHING_FLOOR',
  'analyzeSpectral',
  'bayesianPosterior',
  'benjaminiHochberg',
  'buildCorpusBaseline',
  'buildDefaultMdlPriors',
  'buildImportGraph',
  'buildLaplacian',
  'buildPriorLogOdds',
  'classifyByPosterior',
  'combineFireSet',
  'compositeScore',
  'computeHeapsExponent',
  'computeKLNovelty',
  'computeLikelihoodRatios',
  'computeMDLikelihood',
  'computeModularityForTest',
  'computeNaturalness',
  'computeNaturalnessForRange',
  'computeZipfExponent',
  'computeZipfHeaps',
  'defaultModel',
  'detectCrossCategoryDrift',
  'detectCrossFileDrift',
  'directoryScore',
  'extractSignatures',
  'fingerprintSignature',
  'formatComposite',
  'getRuleSignal',
  'heapsDeviationZScore',
  'isDistributionShift',
  'ksPValue',
  'ksStatistic',
  'ksTest',
  'lanczosFiedler',
  'louvainCommunityDetection',
  'multiFeatureKsTest',
  'normalizeRoute',
  'pValuesFromFires',
  'parseSource',
  'ruleLLR',
  'signatureSimilarity',
  'survivingFires',
  'tokenizeAstToks',
  'tokenizeIdentifiers',
] as const;

const FORBIDDEN_IMPORTS = new Set([
  'fs',
  'fs/promises',
  'node:fs',
  'node:fs/promises',
  'globby',
  // The root Core facade owns persistence adapters. A pure engine entry may
  // only reach an explicitly-audited Core subpath.
  '@usebrick/core',
]);
const SPECIFIER_PATTERNS = [
  /\b(?:import|export)\s+(?:[\s\S]*?\s+from\s+)?['"]([^'"]+)['"]/g,
  /\bimport\s*\(\s*['"]([^'"]+)['"]\s*\)/g,
  /\brequire\s*\(\s*['"]([^'"]+)['"]\s*\)/g,
];

function importSpecifiers(source: string): string[] {
  return SPECIFIER_PATTERNS.flatMap((pattern) => Array.from(source.matchAll(pattern), (match) => match[1] ?? ''));
}

function localModulePath(parent: string, specifier: string): string | undefined {
  return specifier.startsWith('.') ? resolve(parent, '..', specifier) : undefined;
}

function workspaceModulePath(specifier: string, coreVerdictsEntry: string): string | undefined {
  if (specifier === '@usebrick/core/verdicts') {
    return coreVerdictsEntry;
  }
  return undefined;
}

function findPureGraphViolations(entry: string, coreVerdictsEntry: string): string[] {
  const pending = [entry];
  const visited = new Set<string>();
  const violations: string[] = [];
  while (pending.length > 0) {
    const module = pending.pop()!;
    if (visited.has(module)) continue;
    visited.add(module);
    const source = readFileSync(module, 'utf8');
    for (const specifier of importSpecifiers(source)) {
      if (FORBIDDEN_IMPORTS.has(specifier)) violations.push(`${module}: ${specifier}`);
      const local = localModulePath(module, specifier) ?? workspaceModulePath(specifier, coreVerdictsEntry);
      if (local) pending.push(local);
    }
    if (/\bprocess\.(?:argv|exit)\b/.test(source)) violations.push(`${module}: process control`);
    if (/\bconsole\./.test(source)) violations.push(`${module}: console output`);
  }
  return violations;
}

const ENGINE_ROOT = fileURLToPath(new URL('..', import.meta.url));
const CORE_ROOT = resolve(ENGINE_ROOT, '..', 'core');
const CORE_TSUP = resolve(CORE_ROOT, 'node_modules/.bin/tsup');
const ENGINE_TSUP = resolve(ENGINE_ROOT, 'node_modules/.bin/tsup');

let artifactRoot = '';
let freshPure: typeof import('../src/pure');
let freshCoreVerdictsEntry = '';
let freshPureEntry = '';

function buildFreshPureArtifactClosure(): void {
  artifactRoot = mkdtempSync(resolve(tmpdir(), 'usebrick-engine-pure-'));
  const coreOutput = resolve(artifactRoot, 'core-dist');
  const engineOutput = resolve(artifactRoot, 'engine-dist');
  const corePackage = resolve(artifactRoot, 'node_modules/@usebrick/core');
  const swcPackage = resolve(artifactRoot, 'node_modules/@swc/core');

  // The temporary package tree lets the freshly built Engine artifact import
  // the freshly built Core subpath without touching ignored workspace dist/.
  mkdirSync(corePackage, { recursive: true });
  mkdirSync(resolve(swcPackage, '..'), { recursive: true });
  copyFileSync(resolve(CORE_ROOT, 'package.json'), resolve(corePackage, 'package.json'));

  // Use each package's checked-in local tsup binary and config. `--entry.*`
  // limits this test to the two runtime entries it audits; `--no-dts` keeps
  // the setup focused on the JavaScript closure rather than declaration work.
  execFileSync(CORE_TSUP, [
    '--entry.verdicts', 'src/verdicts.ts', '--out-dir', coreOutput, '--no-dts',
  ], { cwd: CORE_ROOT, stdio: 'pipe' });
  symlinkSync(coreOutput, resolve(corePackage, 'dist'), 'dir');
  symlinkSync(resolve(ENGINE_ROOT, 'node_modules/@swc/core'), swcPackage, 'dir');
  execFileSync(ENGINE_TSUP, [
    '--entry.pure', 'src/pure.ts', '--out-dir', engineOutput, '--no-dts',
  ], { cwd: ENGINE_ROOT, stdio: 'pipe' });

  freshCoreVerdictsEntry = resolve(coreOutput, 'verdicts.js');
  freshPureEntry = resolve(engineOutput, 'pure.js');
}

describe('@usebrick/engine/pure public API', () => {
  beforeAll(async () => {
    buildFreshPureArtifactClosure();
    freshPure = await import(pathToFileURL(freshPureEntry).href) as typeof import('../src/pure');
  });

  afterAll(() => {
    if (artifactRoot) rmSync(artifactRoot, { recursive: true, force: true });
  });

  it('has an exact, reviewable runtime export surface', () => {
    expect(Object.keys(freshPure).sort()).toEqual([...PURE_RUNTIME_EXPORTS].sort());
  });

  it('detects a forbidden import in a reachable controlled fixture', () => {
    const entry = fileURLToPath(new URL('./fixtures/pure-graph/entry.js', import.meta.url));
    const nested = resolve(entry, '..', 'nested.js');
    expect(findPureGraphViolations(entry, freshCoreVerdictsEntry)).toEqual([
      `${nested}: node:fs`,
      `${nested}: globby`,
      `${nested}: process control`,
      `${nested}: console output`,
    ]);
  });

  it('builds a complete pure module graph without root Core or filesystem dependencies', () => {
    expect(findPureGraphViolations(freshPureEntry, freshCoreVerdictsEntry)).toEqual([]);
  });
});
