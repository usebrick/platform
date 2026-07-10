/**
 * Contract for the host/editor-safe portion of @usebrick/engine.
 *
 * The root entry point intentionally preserves Node compatibility adapters.
 * Consumers that already own source text must be able to import this entry
 * without pulling filesystem discovery or process behaviour into their bundle.
 */

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import * as pure from '../src/pure';

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

const FORBIDDEN_IMPORTS = new Set(['fs', 'fs/promises', 'node:fs', 'node:fs/promises', 'globby']);
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

function findPureGraphViolations(entry: string): string[] {
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
      const local = localModulePath(module, specifier);
      if (local) pending.push(local);
    }
    if (/\bprocess\.(?:argv|exit)\b/.test(source)) violations.push(`${module}: process control`);
    if (/\bconsole\./.test(source)) violations.push(`${module}: console output`);
  }
  return violations;
}

describe('@usebrick/engine/pure public API', () => {
  it('has an exact, reviewable runtime export surface', () => {
    expect(Object.keys(pure).sort()).toEqual([...PURE_RUNTIME_EXPORTS].sort());
  });

  it('detects a forbidden import in a reachable controlled fixture', () => {
    const entry = fileURLToPath(new URL('./fixtures/pure-graph/entry.js', import.meta.url));
    const nested = resolve(entry, '..', 'nested.js');
    expect(findPureGraphViolations(entry)).toEqual([
      `${nested}: node:fs`,
      `${nested}: globby`,
      `${nested}: process control`,
      `${nested}: console output`,
    ]);
  });

  it('builds a complete local module graph without prohibited dependencies', () => {
    const entry = resolve(fileURLToPath(new URL('..', import.meta.url)), 'dist/pure.js');
    expect(findPureGraphViolations(entry)).toEqual([]);
  });
});
