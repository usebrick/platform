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
