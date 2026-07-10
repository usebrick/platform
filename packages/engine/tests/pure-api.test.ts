/**
 * Contract for the browser/editor-safe portion of @usebrick/engine.
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

describe('@usebrick/engine/pure public API', () => {
  it('has an exact, reviewable runtime export surface', () => {
    expect(Object.keys(pure).sort()).toEqual([...PURE_RUNTIME_EXPORTS].sort());
  });

  it('builds without filesystem discovery, process control, or console output', () => {
    const artifact = readFileSync(resolve(fileURLToPath(new URL('..', import.meta.url)), 'dist/pure.js'), 'utf8');
    expect(artifact).not.toMatch(/(?:node:)?fs(?:\/promises)?|\bglobby\b|process\.(?:argv|exit)|console\./);
  });
});
