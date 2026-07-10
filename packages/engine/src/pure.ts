/**
 * Side-effect-free engine functions for hosts that already own source text.
 *
 * The package root retains Node filesystem compatibility adapters. This is a
 * host/editor-safe entrypoint, not a browser portability guarantee: SWC and
 * Node-compatible crypto/path dependencies remain deliberate requirements.
 * Do not add discovery, filesystem, process, or console dependencies here.
 */

export {
  computeLikelihoodRatios, bayesianPosterior, classifyByPosterior, combineFireSet,
  DEFAULT_PRIOR, type RuleLikelihoodRatio, type BayesPrior,
} from './lr-combiner';
export { parseSource, type ParseResult } from './parser-core';
export {
  buildPriorLogOdds, ruleLLR, getRuleSignal, compositeScore, directoryScore, formatComposite,
  type RuleSignal, type ConfidenceTier, type TriggeredRule, type CompositeScore,
} from './composite-scoring';
export {
  normalizeRoute, detectCrossFileDrift, detectCrossCategoryDrift,
  type CrossFileDriftSignal, type CrossCategoryDrift, type PatternMatch, type PatternInventory,
} from './cluster';
export {
  extractSignatures, fingerprintSignature, signatureSimilarity, type ComponentSignature,
} from './signatures';
export { buildImportGraph, louvainCommunityDetection, computeModularityForTest, type Community, type CommunityDetection } from './louvain';
export { buildDefaultMdlPriors, computeMDLikelihood, AI_FAVORED_RULE_IDS, HUMAN_FAVORED_RULE_IDS, MDL_SMOOTHING_FLOOR, type MdlModelProbs, type MdlLikelihood } from './mdl';
export { benjaminiHochberg, pValuesFromFires, survivingFires, type BHResult } from './multitest';
export { buildCorpusBaseline, defaultModel, tokenizeAstToks, computeNaturalness, computeNaturalnessForRange, type NaturalnessMetrics, type BaselineEntry, type NaturalnessModel } from './naturalness';
export { buildLaplacian, lanczosFiedler, analyzeSpectral, type Graph } from './spectral';
export { computeZipfExponent, computeHeapsExponent, computeZipfHeaps, heapsDeviationZScore, tokenizeIdentifiers, type ZipfFit, type HeapsFit } from './zipf-heaps';
export { ksStatistic, ksPValue, ksTest, multiFeatureKsTest, isDistributionShift, type KSTestResult, type MultiKSResult } from './ks';
export { computeKLNovelty, KL_NOVELTY_EPSILON } from './kl-novelty';
