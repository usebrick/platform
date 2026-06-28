/**
 * v0.15.0 B.8: Public API surface snapshot test.
 *
 * Verifies that @usebrick/engine exports the expected set of runtime
 * values (functions + constants). When a new export is added to the
 * engine, this test will fail until the snapshot is updated — which
 * is the signal to review the public API change.
 *
 * Runtime values only: TypeScript types are erased at runtime and
 * therefore cannot be inspected via `Object.keys(engine)` or
 * `engine.hasOwnProperty(name)`. Types are covered separately by
 * `pnpm -r typecheck`.
 *
 * What is NOT in this snapshot, and why:
 * - `VERSION` — B.2 deliberately removed this from the engine's
 *   exports to avoid colliding with slopbrick's `VERSION` when both
 *   packages are re-exported through a single barrel.
 * - `Category` type — slopbrick owns the canonical `Category` type.
 * - `Rule` type — slopbrick owns the canonical `Rule` type.
 */

import { describe, expect, it } from 'vitest';
import * as engine from '../src/index';

describe('@usebrick/engine public API', () => {
  it('exports all expected runtime values', () => {
    const expected = [
      // v0.15.0 B.2 — Bayesian likelihood-ratio combiner (lr-combiner.ts).
      'computeLikelihoodRatios',
      'bayesianPosterior',
      'classifyByPosterior',
      'combineFireSet',
      'DEFAULT_PRIOR',

      // v0.15.0 B.3 — SWC-backed source file parser (parser.ts).
      'parseFile',

      // v0.15.0 B.4 — Memory Platform bridge (structure/index.ts).
      'saveInventory',
      'readRuns',
      'appendRun',
      'buildInventoryFromScan',
      'buildConstitutionFromConfig',
      'buildHealthFromReport',

      // v0.15.0 B.5.1 — composite AI-likelihood scoring (composite-scoring.ts).
      'buildPriorLogOdds',
      'ruleLLR',
      'getRuleSignal',
      'compositeScore',
      'directoryScore',
      'formatComposite',

      // v0.15.0 B.5.2 — cross-file / cross-category pattern drift (cluster.ts).
      'normalizeRoute',
      'detectCrossFileDrift',
      'detectCrossCategoryDrift',

      // v0.15.0 B.5.3 — hash-based function/component similarity (find-similar.ts).
      'extractSignatures',
      'fingerprintSignature',
      'signatureSimilarity',
      'findSimilarFunctions',

      // v0.15.0 B.5.4 — Louvain community detection (louvain.ts).
      'buildImportGraph',
      'louvainCommunityDetection',
      'computeModularityForTest',

      // v0.15.0 B.5.5 — Minimum Description Length composite scoring (mdl.ts).
      'buildDefaultMdlPriors',
      'computeMDLikelihood',
      'AI_FAVORED_RULE_IDS',
      'HUMAN_FAVORED_RULE_IDS',
      'MDL_SMOOTHING_FLOOR',

      // v0.15.0 B.5.6 — Benjamini-Hochberg FDR control (multitest.ts).
      'benjaminiHochberg',
      'pValuesFromFires',
      'survivingFires',

      // v0.15.0 B.5.7 — identifier-token naturalness model (naturalness.ts).
      'buildCorpusBaseline',
      'defaultModel',
      'tokenizeAstToks',
      'computeNaturalness',
      'computeNaturalnessForRange',

      // v0.15.0 B.5.8 — Laplacian + Lanczos spectral analysis (spectral.ts).
      'buildLaplacian',
      'lanczosFiedler',
      'analyzeSpectral',

      // v0.15.0 B.5.9 — Zipf + Heaps identifier-distribution fits (zipf-heaps.ts).
      'computeZipfExponent',
      'computeHeapsExponent',
      'computeZipfHeaps',
      'heapsDeviationZScore',
      'tokenizeIdentifiers',

      // v0.15.0 B.5.10 — Kolmogorov-Smirnov two-sample test (ks.ts).
      'ksStatistic',
      'ksPValue',
      'ksTest',
      'multiFeatureKsTest',
      'isDistributionShift',

      // v0.15.0 B.5.11 — KL-divergence novelty detection (kl-novelty.ts).
      'computeKLNovelty',
      'KL_NOVELTY_EPSILON',
    ];

    for (const name of expected) {
      expect(engine, `engine should export ${name}`).toHaveProperty(name);
    }
  });
});
