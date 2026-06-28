/**
 * v0.14.5+: @usebrick/engine — pure scanning engine.
 * No I/O, no console.log, no process.exit.
 *
 * Tasks B.2-B.7 move the pure functions from
 * packages/slopbrick/src/engine/ here.
 *
 * Note: the engine's `version` lives in package.json — we deliberately
 * do NOT export a `VERSION` constant from this index, because doing so
 * would collide with slopbrick's `VERSION` when both packages are
 * re-exported through a single barrel.
 */

// v0.15.0 B.2: Bayesian likelihood-ratio combiner.
export {
  computeLikelihoodRatios,
  bayesianPosterior,
  classifyByPosterior,
  combineFireSet,
  DEFAULT_PRIOR,
  type RuleLikelihoodRatio,
  type BayesPrior,
} from './lr-combiner';

// v0.15.0 B.3: SWC-backed source file parser.
export {
  parseFile,
  type ParseResult,
} from './parser';

// v0.15.0 B.4: Memory Platform bridge (ConstitutionFile /
// InventoryFile / HealthFile builders + telemetry log).
//
// Note: `Category` is intentionally NOT re-exported here — slopbrick
// owns its `Category` type, and re-exporting our `string` alias would
// collide when both packages are re-exported through the same barrel.
export {
  saveInventory,
  readRuns,
  appendRun,
  buildInventoryFromScan,
  buildConstitutionFromConfig,
  buildHealthFromReport,
  type MemoryIO,
  type MemoryReport,
  type MemoryConfig,
  type MemoryScanResult,
  type MemoryAuditRun,
  type MemoryPatternInventory,
  type MemoryPatternMatch,
} from './structure';

// v0.15.0 B.5: remaining pure functions moved from slopbrick's
// `src/engine/` to the engine package.
//
// Of the 14 files the v0.15.0 plan listed, 11 existed at
// `slopbrick/src/engine/` and have been moved. The other 3
// (`patterns.ts`, `ast-guards.ts`, `disabled-directives.ts`) are at
// different paths in the slopbrick package and were not in scope
// for this commit — see the B.5 commit message for details.

// B.5.1: composite AI-likelihood scoring (Naive Bayes LLR).
export {
  buildPriorLogOdds,
  ruleLLR,
  getRuleSignal,
  compositeScore,
  directoryScore,
  formatComposite,
  type Verdict,
  type RuleSignal,
  type ConfidenceTier,
  type TriggeredRule,
  type CompositeScore,
} from './composite-scoring';

// B.5.2: cross-file / cross-category pattern drift detection.
export {
  normalizeRoute,
  detectCrossFileDrift,
  detectCrossCategoryDrift,
  type CrossFileDriftSignal,
  type CrossCategoryDrift,
  type PatternMatch,
  type PatternInventory,
} from './cluster';

// B.5.3: hash-based function/component similarity (find_similar_function).
export {
  extractSignatures,
  fingerprintSignature,
  signatureSimilarity,
  findSimilarFunctions,
  type ComponentSignature,
  type SimilarMatch,
  type FindSimilarQuery,
} from './find-similar';

// B.5.4: Louvain community detection on pattern import graphs.
export {
  buildImportGraph,
  louvainCommunityDetection,
  computeModularityForTest,
  type Community,
  type CommunityDetection,
} from './louvain';

// B.5.5: Minimum Description Length composite scoring.
//
// Note: `Rule` is intentionally NOT re-exported here — slopbrick owns
// its `Rule` type, and re-exporting our local minimal interface would
// collide when both packages are re-exported through the same barrel.
export {
  buildDefaultMdlPriors,
  computeMDLikelihood,
  AI_FAVORED_RULE_IDS,
  HUMAN_FAVORED_RULE_IDS,
  MDL_SMOOTHING_FLOOR,
  type MdlModelProbs,
  type MdlLikelihood,
} from './mdl';

// B.5.6: Benjamini-Hochberg FDR control for multi-rule firing.
export {
  benjaminiHochberg,
  pValuesFromFires,
  survivingFires,
  type BHResult,
} from './multitest';

// B.5.7: identifier-token naturalness model.
export {
  buildCorpusBaseline,
  defaultModel,
  tokenizeAstToks,
  computeNaturalness,
  computeNaturalnessForRange,
  type NaturalnessMetrics,
  type BaselineEntry,
  type NaturalnessModel,
} from './naturalness';

// B.5.8: Laplacian + Lanczos spectral analysis.
export {
  buildLaplacian,
  lanczosFiedler,
  analyzeSpectral,
  type Graph,
} from './spectral';

// B.5.9: Zipf + Heaps identifier-distribution fits.
export {
  computeZipfExponent,
  computeHeapsExponent,
  computeZipfHeaps,
  heapsDeviationZScore,
  tokenizeIdentifiers,
  type ZipfFit,
  type HeapsFit,
} from './zipf-heaps';

// B.5.10: Kolmogorov-Smirnov two-sample test.
export {
  ksStatistic,
  ksPValue,
  ksTest,
  multiFeatureKsTest,
  isDistributionShift,
  type KSTestResult,
  type MultiKSResult,
} from './ks';

// B.5.11: KL-divergence novelty detection.
export {
  computeKLNovelty,
  KL_NOVELTY_EPSILON,
} from './kl-novelty';
