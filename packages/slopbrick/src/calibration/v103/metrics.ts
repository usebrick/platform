import { isV103RuleEvidenceList, type V103RuleEvidence } from './rule-evidence';

/** The only labels admitted to the calibration metric denominator. */
export type V103MetricPolarity = 'verified_ai' | 'verified_human';

type SuccessfulStatus = 'success_findings' | 'success_zero';
type V103MetricObservationStatus = SuccessfulStatus | 'excluded' | 'parse_failure' | 'timeout' | 'scanner_failure';

/**
 * The observation fields needed by the pure metrics reducer.  The upstream
 * scan verifier owns the full v10.3 observation contract; this narrower shape
 * keeps the reducer independent of paths, files, and CLI state.
 */
export interface V103MetricObservation {
  readonly version: 'v10.3';
  readonly runId: string;
  readonly fileId: string;
  readonly repositoryId: string;
  readonly familyId: string;
  readonly language: string;
  readonly polarity: V103MetricPolarity;
  readonly status: V103MetricObservationStatus;
  readonly findingsCount?: number;
  readonly exclusionReason?: string;
  readonly failureCode?: string;
  readonly ruleEvidence?: readonly V103RuleEvidence[];
}

/** The complete registry snapshot is required so zero-fire rules are visible. */
export interface V103MetricRuleDefinition {
  readonly ruleId: string;
  readonly aiSpecific: boolean;
}

export interface V103EligibleFileIds {
  readonly verified_ai: readonly string[];
  readonly verified_human: readonly string[];
}

export interface V103MetricsInput {
  readonly observations: readonly V103MetricObservation[];
  readonly ruleCatalog: readonly V103MetricRuleDefinition[];
  readonly eligibleFileIdsByPolarity: V103EligibleFileIds;
  readonly prior?: number;
  readonly smoothing?: number;
}

export type V103MetricRuleStatus = 'measured' | 'zero-fire' | 'ineligible';

export interface V103ConfidenceInterval {
  readonly lower: number;
  readonly upper: number;
}

export interface V103RuleMetric {
  readonly ruleId: string;
  readonly aiSpecific: boolean;
  readonly status: V103MetricRuleStatus;
  /** TP and FP are file counts; repeated findings in one file count once. */
  readonly tp?: number;
  readonly fp?: number;
  /** P and N are the explicit eligible AI and human file denominators. */
  readonly p?: number;
  readonly n?: number;
  readonly recall?: number;
  readonly fpr?: number;
  readonly recallInterval?: V103ConfidenceInterval;
  readonly fprInterval?: V103ConfidenceInterval;
  readonly lrPlus?: number;
  readonly balancedPpv?: number;
  readonly priorPpv?: number;
}

export type V103MetricsUnavailableReason =
  | 'eligible-cohort-unavailable'
  | 'rule-evidence-unavailable';

export interface V103MetricsUnavailable {
  readonly status: 'unavailable';
  readonly reason: V103MetricsUnavailableReason;
}

export interface V103MetricsAvailable {
  readonly status: 'available';
  readonly prior: number;
  readonly smoothing: number;
  readonly positiveFiles: number;
  readonly negativeFiles: number;
  readonly rules: readonly V103RuleMetric[];
}

export type V103MetricsResult = V103MetricsAvailable | V103MetricsUnavailable;

export type V103MacroRuleStatus = V103MetricRuleStatus | 'unavailable';

export interface V103MacroRuleMetric {
  readonly ruleId: string;
  readonly aiSpecific: boolean;
  readonly status: V103MacroRuleStatus;
  /** Pooled counts are retained for audit; rates below are equal-weight macro means. */
  readonly tp?: number;
  readonly fp?: number;
  readonly p?: number;
  readonly n?: number;
  readonly positiveGroups?: number;
  readonly negativeGroups?: number;
  readonly recall?: number;
  readonly fpr?: number;
  readonly lrPlus?: number;
  readonly balancedPpv?: number;
  readonly priorPpv?: number;
  readonly f1?: number;
}

export interface V103MacroAggregate {
  /** `repository-cluster` uses the stable provenance familyId dimension. */
  readonly kind: 'repository-cluster' | 'language';
  readonly groupKeys: readonly string[];
  readonly positiveGroupCount: number;
  readonly negativeGroupCount: number;
  readonly rules: readonly V103MacroRuleMetric[];
}

export interface V103MacroMetricsAvailable extends V103MetricsAvailable {
  readonly repositoryCluster: V103MacroAggregate;
  readonly language: V103MacroAggregate;
}

export type V103MacroMetricsResult = V103MacroMetricsAvailable | V103MetricsUnavailable;

export interface V103BootstrapOptions {
  /** A stable unsigned 32-bit seed; no ambient/random source is consulted. */
  readonly seed: number;
  /** Defaults to 1,000 and is capped at 10,000 for bounded memory/runtime. */
  readonly replicates?: number;
  /** Defaults to 0.95; percentile tails are split evenly. */
  readonly confidenceLevel?: number;
}

export interface V103BootstrapRuleMetric {
  readonly ruleId: string;
  readonly aiSpecific: boolean;
  readonly status: V103MacroRuleStatus;
  readonly lrPlus?: V103ConfidenceInterval;
  readonly balancedPpv?: V103ConfidenceInterval;
  readonly f1?: V103ConfidenceInterval;
}

export interface V103RepositoryClusterBootstrapAvailable {
  readonly status: 'available';
  readonly method: 'cluster-bootstrap-percentile-v1';
  readonly unit: 'familyId';
  readonly seed: number;
  readonly replicates: number;
  readonly confidenceLevel: number;
  readonly positiveClusterCount: number;
  readonly negativeClusterCount: number;
  readonly rules: readonly V103BootstrapRuleMetric[];
}

export type V103RepositoryClusterBootstrapResult =
  | V103RepositoryClusterBootstrapAvailable
  | V103MetricsUnavailable;

const POLARITIES = ['verified_ai', 'verified_human'] as const;
const SUCCESS_STATUSES = new Set<SuccessfulStatus>(['success_findings', 'success_zero']);
const OBSERVATION_STATUSES = new Set<V103MetricObservationStatus>([
  'success_findings', 'success_zero', 'excluded', 'parse_failure', 'timeout', 'scanner_failure',
]);
const RULE_ID = /^[A-Za-z0-9][A-Za-z0-9._/-]*$/;
const WILSON_Z_95 = 1.959963984540054;

function isSuccessfulStatus(value: V103MetricObservationStatus): value is SuccessfulStatus {
  return SUCCESS_STATUSES.has(value as SuccessfulStatus);
}

function assertFiniteProbability(value: number, label: string): void {
  if (!Number.isFinite(value) || value <= 0 || value >= 1) {
    throw new RangeError(`${label} must be finite and strictly between 0 and 1`);
  }
}

function assertPositiveFinite(value: number, label: string): void {
  if (!Number.isFinite(value) || value <= 0) throw new RangeError(`${label} must be finite and greater than zero`);
}

function wilsonInterval(successes: number, trials: number): V103ConfidenceInterval {
  if (!Number.isSafeInteger(successes) || !Number.isSafeInteger(trials)
    || successes < 0 || trials <= 0 || successes > trials) {
    throw new RangeError('Wilson interval counts are invalid');
  }
  const n = trials;
  const p = successes / n;
  const z = WILSON_Z_95;
  const zSquared = z * z;
  const denominator = 1 + zSquared / n;
  const center = (p + zSquared / (2 * n)) / denominator;
  const halfWidth = (z / denominator) * Math.sqrt((p * (1 - p) / n) + (zSquared / (4 * n * n)));
  return {
    lower: Math.max(0, center - halfWidth),
    upper: Math.min(1, center + halfWidth),
  };
}

function assertCatalog(ruleCatalog: readonly V103MetricRuleDefinition[]): Map<string, V103MetricRuleDefinition> {
  const catalog = new Map<string, V103MetricRuleDefinition>();
  for (const definition of ruleCatalog) {
    if (typeof definition.ruleId !== 'string' || typeof definition.aiSpecific !== 'boolean'
      || !RULE_ID.test(definition.ruleId) || catalog.has(definition.ruleId)) {
      throw new TypeError('Rule catalog contains an invalid or duplicate rule ID');
    }
    catalog.set(definition.ruleId, definition);
  }
  return catalog;
}

function assertObservation(value: V103MetricObservation): void {
  if (value.version !== 'v10.3' || typeof value.fileId !== 'string' || value.fileId.length === 0
    || typeof value.runId !== 'string' || value.runId.length === 0
    || typeof value.repositoryId !== 'string' || value.repositoryId.length === 0
    || typeof value.familyId !== 'string' || value.familyId.length === 0
    || typeof value.language !== 'string' || value.language.length === 0
    || !POLARITIES.includes(value.polarity) || !OBSERVATION_STATUSES.has(value.status)) {
    throw new TypeError('Metrics observation has an invalid v10.3 identity or status');
  }
  if (value.status === 'success_findings'
    && (typeof value.findingsCount !== 'number' || !Number.isSafeInteger(value.findingsCount) || value.findingsCount <= 0)) {
    throw new TypeError('Findings observations must have a positive findingsCount');
  }
  if (value.status === 'success_zero' && value.findingsCount !== 0) {
    throw new TypeError('Zero-findings observations must have findingsCount zero');
  }
  if (isSuccessfulStatus(value.status)
    && (value.exclusionReason !== undefined || value.failureCode !== undefined)) {
    throw new TypeError('Successful observations cannot contain exclusion or failure metadata');
  }
  if (value.status === 'success_zero' && value.ruleEvidence !== undefined) {
    throw new TypeError('Zero-findings observations cannot contain rule evidence');
  }
  if (value.status === 'excluded' && (typeof value.exclusionReason !== 'string' || value.exclusionReason.length === 0
    || value.findingsCount !== undefined || value.failureCode !== undefined || value.ruleEvidence !== undefined)) {
    throw new TypeError('Excluded observations must contain only an exclusion reason');
  }
  if (!isSuccessfulStatus(value.status) && value.status !== 'excluded'
    && (typeof value.failureCode !== 'string' || value.failureCode.length === 0
      || value.findingsCount !== undefined || value.exclusionReason !== undefined || value.ruleEvidence !== undefined)) {
    throw new TypeError('Failed observations must contain only a failure code');
  }
  if (value.ruleEvidence !== undefined && !isV103RuleEvidenceList(value.ruleEvidence)) {
    throw new TypeError('Metrics observation rule evidence is malformed');
  }
  if (value.status === 'success_findings' && value.ruleEvidence !== undefined
    && value.findingsCount !== undefined
    && value.ruleEvidence.reduce((sum, evidence) => sum + evidence.count, 0) !== value.findingsCount) {
    throw new TypeError('Rule evidence count must equal findingsCount');
  }
}

function assertEligibleIds(
  eligibleFileIdsByPolarity: V103EligibleFileIds,
): Map<string, V103MetricPolarity> {
  const eligible = new Map<string, V103MetricPolarity>();
  for (const polarity of POLARITIES) {
    for (const fileId of eligibleFileIdsByPolarity[polarity]) {
      if (typeof fileId !== 'string' || fileId.length === 0 || eligible.has(fileId)) {
        throw new TypeError('Eligible file IDs must be unique across both polarities');
      }
      eligible.set(fileId, polarity);
    }
  }
  return eligible;
}

/**
 * Compute denominator-aware per-rule calibration metrics from verified scan
 * observations.  This function has no filesystem, clock, environment, or
 * process dependency and never infers eligibility from folder names or
 * observation polarity alone: callers must provide the explicit eligible
 * file-ID census.
 *
 * Haldane/Laplace smoothing uses alpha (default 0.5):
 *   smoothed recall = (TP + alpha) / (P + 2 alpha)
 *   smoothed FPR    = (FP + alpha) / (N + 2 alpha)
 *   LR+             = smoothed recall / smoothed FPR
 *
 * TP/FP are file-level fires, so an evidence count of 10 still contributes
 * one fire for that file.  Rules outside the AI-specific catalog are emitted
 * as `ineligible`, while AI rules with no fires remain explicit `zero-fire`.
 * This bounded slice emits deterministic point estimates plus Wilson 95%
 * intervals. Family-cluster bootstrap intervals are exposed by a separate
 * diagnostic API below; neither this reducer nor the diagnostic APIs promote
 * a report or admission manifest.
 */
export function computeV103Metrics(input: V103MetricsInput): V103MetricsResult {
  const prior = input.prior ?? 0.5;
  const smoothing = input.smoothing ?? 0.5;
  assertFiniteProbability(prior, 'prior');
  assertPositiveFinite(smoothing, 'smoothing');
  const catalog = assertCatalog(input.ruleCatalog);
  const eligibleIds = assertEligibleIds(input.eligibleFileIdsByPolarity);
  const observationsById = new Map<string, V103MetricObservation>();
  let observedRunId: string | undefined;
  for (const observation of input.observations) {
    assertObservation(observation);
    if (observedRunId !== undefined && observedRunId !== observation.runId) {
      throw new TypeError('Metrics observations contain multiple run IDs');
    }
    observedRunId = observation.runId;
    if (observationsById.has(observation.fileId)) throw new TypeError('Metrics observations contain a duplicate file ID');
    observationsById.set(observation.fileId, observation);
  }

  if (eligibleIds.size === 0) return { status: 'unavailable', reason: 'eligible-cohort-unavailable' };

  const selected: V103MetricObservation[] = [];
  for (const [fileId, polarity] of eligibleIds) {
    const observation = observationsById.get(fileId);
    if (observation === undefined || observation.polarity !== polarity || !isSuccessfulStatus(observation.status)) {
      return { status: 'unavailable', reason: 'eligible-cohort-unavailable' };
    }
    selected.push(observation);
  }

  const positiveFiles = selected.filter((observation) => observation.polarity === 'verified_ai').length;
  const negativeFiles = selected.length - positiveFiles;
  if (positiveFiles === 0 || negativeFiles === 0) {
    return { status: 'unavailable', reason: 'eligible-cohort-unavailable' };
  }

  // An omitted evidence list on a successful findings observation means the
  // scanner could not prove which rules fired; it must never become zero-fire.
  if (selected.some((observation) => observation.status === 'success_findings' && observation.ruleEvidence === undefined)) {
    return { status: 'unavailable', reason: 'rule-evidence-unavailable' };
  }

  const firesByRule = new Map<string, { readonly ai: Set<string>; readonly human: Set<string> }>();
  for (const ruleId of catalog.keys()) firesByRule.set(ruleId, { ai: new Set(), human: new Set() });
  for (const observation of selected) {
    for (const evidence of observation.ruleEvidence ?? []) {
      const definition = catalog.get(evidence.ruleId);
      if (definition === undefined || definition.aiSpecific !== evidence.aiSpecific) {
        throw new TypeError('Rule evidence does not match the complete rule catalog');
      }
      const fires = firesByRule.get(evidence.ruleId)!;
      fires[observation.polarity === 'verified_ai' ? 'ai' : 'human'].add(observation.fileId);
    }
  }

  const rules = [...catalog.values()].sort((left, right) => left.ruleId < right.ruleId ? -1 : left.ruleId > right.ruleId ? 1 : 0).map((definition) => {
    if (!definition.aiSpecific) return { ruleId: definition.ruleId, aiSpecific: false, status: 'ineligible' as const };
    const fires = firesByRule.get(definition.ruleId)!;
    const tp = fires.ai.size;
    const fp = fires.human.size;
    const recall = tp / positiveFiles;
    const fpr = fp / negativeFiles;
    const smoothedRecall = (tp + smoothing) / (positiveFiles + 2 * smoothing);
    const smoothedFpr = (fp + smoothing) / (negativeFiles + 2 * smoothing);
    const lrPlus = smoothedRecall / smoothedFpr;
    const balancedDenominator = recall + fpr;
    const priorDenominator = prior * recall + (1 - prior) * fpr;
    return {
      ruleId: definition.ruleId,
      aiSpecific: true,
      status: tp === 0 && fp === 0 ? 'zero-fire' as const : 'measured' as const,
      tp,
      fp,
      p: positiveFiles,
      n: negativeFiles,
      recall,
      fpr,
      recallInterval: wilsonInterval(tp, positiveFiles),
      fprInterval: wilsonInterval(fp, negativeFiles),
      lrPlus,
      balancedPpv: balancedDenominator === 0 ? 0 : recall / balancedDenominator,
      priorPpv: priorDenominator === 0 ? 0 : (prior * recall) / priorDenominator,
    };
  });

  return { status: 'available', prior, smoothing, positiveFiles, negativeFiles, rules };
}

interface MacroGroupAccumulator {
  readonly key: string;
  positiveFiles: number;
  negativeFiles: number;
  readonly positiveFires: Map<string, number>;
  readonly negativeFires: Map<string, number>;
}

function buildMacroGroups(
  observations: readonly V103MetricObservation[],
  eligibleFileIdsByPolarity: V103EligibleFileIds,
  keyOf: (observation: V103MetricObservation) => string,
): readonly MacroGroupAccumulator[] {
  const eligible = new Set<string>([
    ...eligibleFileIdsByPolarity.verified_ai,
    ...eligibleFileIdsByPolarity.verified_human,
  ]);
  const groups = new Map<string, MacroGroupAccumulator>();
  for (const observation of observations) {
    if (!eligible.has(observation.fileId)) continue;
    const key = keyOf(observation);
    let group = groups.get(key);
    if (group === undefined) {
      group = { key, positiveFiles: 0, negativeFiles: 0, positiveFires: new Map(), negativeFires: new Map() };
      groups.set(key, group);
    }
    const fires = observation.polarity === 'verified_ai' ? group.positiveFires : group.negativeFires;
    if (observation.polarity === 'verified_ai') group.positiveFiles += 1;
    else group.negativeFiles += 1;
    for (const evidence of observation.ruleEvidence ?? []) {
      // Evidence lists are validated by computeV103Metrics and are unique per
      // observation, so incrementing once here keeps the macro unit file-level.
      fires.set(evidence.ruleId, (fires.get(evidence.ruleId) ?? 0) + 1);
    }
  }
  return [...groups.values()].sort((left, right) => left.key < right.key ? -1 : left.key > right.key ? 1 : 0);
}

function mean(values: readonly number[]): number {
  return values.length === 0 ? 0 : values.reduce((sum, value) => sum + value, 0) / values.length;
}

function macroRules(
  groups: readonly MacroGroupAccumulator[],
  ruleCatalog: readonly V103MetricRuleDefinition[],
  prior: number,
  smoothing: number,
): readonly V103MacroRuleMetric[] {
  const rules = [...ruleCatalog].sort((left, right) => left.ruleId < right.ruleId ? -1 : left.ruleId > right.ruleId ? 1 : 0);
  return rules.map((definition) => {
    if (!definition.aiSpecific) return { ruleId: definition.ruleId, aiSpecific: false, status: 'ineligible' as const };
    const positiveGroups = groups.filter((group) => group.positiveFiles > 0);
    const negativeGroups = groups.filter((group) => group.negativeFiles > 0);
    if (positiveGroups.length === 0 || negativeGroups.length === 0) {
      return {
        ruleId: definition.ruleId,
        aiSpecific: true,
        status: 'unavailable' as const,
        positiveGroups: positiveGroups.length,
        negativeGroups: negativeGroups.length,
      };
    }
    const positiveCounts = positiveGroups.map((group) => group.positiveFires.get(definition.ruleId) ?? 0);
    const negativeCounts = negativeGroups.map((group) => group.negativeFires.get(definition.ruleId) ?? 0);
    const rawRecalls = positiveGroups.map((group, index) => positiveCounts[index]! / group.positiveFiles);
    const rawFprs = negativeGroups.map((group, index) => negativeCounts[index]! / group.negativeFiles);
    const recall = mean(rawRecalls);
    const fpr = mean(rawFprs);
    const smoothedRecall = mean(positiveGroups.map((group, index) =>
      (positiveCounts[index]! + smoothing) / (group.positiveFiles + 2 * smoothing)));
    const smoothedFpr = mean(negativeGroups.map((group, index) =>
      (negativeCounts[index]! + smoothing) / (group.negativeFiles + 2 * smoothing)));
    const balancedDenominator = recall + fpr;
    const balancedPpv = balancedDenominator === 0 ? 0 : recall / balancedDenominator;
    const priorDenominator = prior * recall + (1 - prior) * fpr;
    const priorPpv = priorDenominator === 0 ? 0 : (prior * recall) / priorDenominator;
    const f1Denominator = balancedPpv + recall;
    const f1 = f1Denominator === 0 ? 0 : (2 * balancedPpv * recall) / f1Denominator;
    const tp = positiveCounts.reduce((sum, count) => sum + count, 0);
    const fp = negativeCounts.reduce((sum, count) => sum + count, 0);
    const p = positiveGroups.reduce((sum, group) => sum + group.positiveFiles, 0);
    const n = negativeGroups.reduce((sum, group) => sum + group.negativeFiles, 0);
    return {
      ruleId: definition.ruleId,
      aiSpecific: true,
      status: tp === 0 && fp === 0 ? 'zero-fire' as const : 'measured' as const,
      tp,
      fp,
      p,
      n,
      positiveGroups: positiveGroups.length,
      negativeGroups: negativeGroups.length,
      recall,
      fpr,
      lrPlus: smoothedRecall / smoothedFpr,
      balancedPpv,
      priorPpv,
      f1,
    };
  });
}

function buildMacroAggregate(
  observations: readonly V103MetricObservation[],
  eligibleFileIdsByPolarity: V103EligibleFileIds,
  ruleCatalog: readonly V103MetricRuleDefinition[],
  prior: number,
  smoothing: number,
  kind: V103MacroAggregate['kind'],
  keyOf: (observation: V103MetricObservation) => string,
): V103MacroAggregate {
  const groups = buildMacroGroups(observations, eligibleFileIdsByPolarity, keyOf);
  return {
    kind,
    groupKeys: groups.map((group) => group.key),
    positiveGroupCount: groups.filter((group) => group.positiveFiles > 0).length,
    negativeGroupCount: groups.filter((group) => group.negativeFiles > 0).length,
    rules: macroRules(groups, ruleCatalog, prior, smoothing),
  };
}

/**
 * Add deterministic macro views to the same explicit eligible cohort used by
 * computeV103Metrics. `familyId` is the repository/source-cluster unit: it is
 * the stable provenance grouping and avoids treating files from one origin as
 * independent repositories. Rates are equal-weight means across groups, with
 * pooled counts retained only as audit totals. The macro reducer emits point
 * estimates; the separate bootstrap API supplies seeded percentile intervals,
 * and neither API writes report/manifest artifacts.
 */
export function computeV103MacroMetrics(input: V103MetricsInput): V103MacroMetricsResult {
  const base = computeV103Metrics(input);
  if (base.status !== 'available') return base;
  const repositoryCluster = buildMacroAggregate(
    input.observations,
    input.eligibleFileIdsByPolarity,
    input.ruleCatalog,
    base.prior,
    base.smoothing,
    'repository-cluster',
    (observation) => observation.familyId,
  );
  const language = buildMacroAggregate(
    input.observations,
    input.eligibleFileIdsByPolarity,
    input.ruleCatalog,
    base.prior,
    base.smoothing,
    'language',
    (observation) => observation.language,
  );
  return { ...base, repositoryCluster, language };
}

const DEFAULT_BOOTSTRAP_REPLICATES = 1_000;
const MAX_BOOTSTRAP_REPLICATES = 10_000;
const DEFAULT_BOOTSTRAP_CONFIDENCE = 0.95;
const UINT32_MAX = 0xffff_ffff;

function validateBootstrapOptions(options: V103BootstrapOptions): Required<V103BootstrapOptions> {
  if (!Number.isSafeInteger(options.seed) || options.seed < 0 || options.seed > UINT32_MAX) {
    throw new RangeError('Bootstrap seed must be an unsigned 32-bit integer');
  }
  const replicates = options.replicates ?? DEFAULT_BOOTSTRAP_REPLICATES;
  if (!Number.isSafeInteger(replicates) || replicates < 2 || replicates > MAX_BOOTSTRAP_REPLICATES) {
    throw new RangeError(`Bootstrap replicates must be an integer from 2 through ${MAX_BOOTSTRAP_REPLICATES}`);
  }
  const confidenceLevel = options.confidenceLevel ?? DEFAULT_BOOTSTRAP_CONFIDENCE;
  assertFiniteProbability(confidenceLevel, 'Bootstrap confidenceLevel');
  return { seed: options.seed, replicates, confidenceLevel };
}

function createBootstrapRng(seed: number): () => number {
  // Xorshift32 is deliberately local and specified here so seeded results do
  // not depend on a host runtime's random implementation.
  let state = (seed >>> 0) || 0x9e3779b9;
  return () => {
    state ^= state << 13;
    state ^= state >>> 17;
    state ^= state << 5;
    state >>>= 0;
    return state / 0x1_0000_0000;
  };
}

function sampleGroups(groups: readonly MacroGroupAccumulator[], size: number, random: () => number): MacroGroupAccumulator[] {
  const sampled = new Array<MacroGroupAccumulator>(size);
  for (let index = 0; index < size; index += 1) sampled[index] = groups[Math.floor(random() * groups.length)]!;
  return sampled;
}

function bootstrapRuleValues(
  ruleId: string,
  positiveGroups: readonly MacroGroupAccumulator[],
  negativeGroups: readonly MacroGroupAccumulator[],
  smoothing: number,
): { readonly lrPlus: number; readonly balancedPpv: number; readonly f1: number; readonly zeroFire: boolean } {
  let recall = 0;
  let fpr = 0;
  let smoothedRecall = 0;
  let smoothedFpr = 0;
  let tp = 0;
  let fp = 0;
  for (const group of positiveGroups) {
    const fires = group.positiveFires.get(ruleId) ?? 0;
    tp += fires;
    recall += fires / group.positiveFiles;
    smoothedRecall += (fires + smoothing) / (group.positiveFiles + 2 * smoothing);
  }
  for (const group of negativeGroups) {
    const fires = group.negativeFires.get(ruleId) ?? 0;
    fp += fires;
    fpr += fires / group.negativeFiles;
    smoothedFpr += (fires + smoothing) / (group.negativeFiles + 2 * smoothing);
  }
  recall /= positiveGroups.length;
  fpr /= negativeGroups.length;
  smoothedRecall /= positiveGroups.length;
  smoothedFpr /= negativeGroups.length;
  const balancedDenominator = recall + fpr;
  const balancedPpv = balancedDenominator === 0 ? 0 : recall / balancedDenominator;
  const f1Denominator = balancedPpv + recall;
  return {
    lrPlus: smoothedRecall / smoothedFpr,
    balancedPpv,
    f1: f1Denominator === 0 ? 0 : (2 * balancedPpv * recall) / f1Denominator,
    zeroFire: tp === 0 && fp === 0,
  };
}

function percentile(values: Float64Array, probability: number): number {
  const position = (values.length - 1) * probability;
  const lower = Math.floor(position);
  const upper = Math.ceil(position);
  if (lower === upper) return values[lower]!;
  const weight = position - lower;
  return values[lower]! + (values[upper]! - values[lower]!) * weight;
}

function percentileInterval(values: Float64Array, confidenceLevel: number): V103ConfidenceInterval {
  values.sort();
  const tail = (1 - confidenceLevel) / 2;
  return { lower: percentile(values, tail), upper: percentile(values, 1 - tail) };
}

/**
 * Compute a seeded, deterministic percentile bootstrap over provenance
 * familyId units. AI and human family arms are sampled independently with
 * replacement, each preserving its observed family count. This is the
 * repository-cluster uncertainty contract for LR+, balanced PPV, and F1;
 * it intentionally does not bootstrap the language view or write artifacts.
 */
export function computeV103RepositoryClusterBootstrap(
  input: V103MetricsInput,
  options: V103BootstrapOptions,
): V103RepositoryClusterBootstrapResult {
  const checked = validateBootstrapOptions(options);
  const base = computeV103Metrics(input);
  if (base.status !== 'available') return base;
  const groups = buildMacroGroups(input.observations, input.eligibleFileIdsByPolarity, (observation) => observation.familyId);
  const positiveGroups = groups.filter((group) => group.positiveFiles > 0);
  const negativeGroups = groups.filter((group) => group.negativeFiles > 0);
  if (positiveGroups.length === 0 || negativeGroups.length === 0) {
    return { status: 'unavailable', reason: 'eligible-cohort-unavailable' };
  }
  const point = buildMacroAggregate(
    input.observations,
    input.eligibleFileIdsByPolarity,
    input.ruleCatalog,
    base.prior,
    base.smoothing,
    'repository-cluster',
    (observation) => observation.familyId,
  );
  const pointByRule = new Map(point.rules.map((rule) => [rule.ruleId, rule]));
  const aiRules = [...input.ruleCatalog]
    .filter((definition) => definition.aiSpecific)
    .sort((left, right) => left.ruleId < right.ruleId ? -1 : left.ruleId > right.ruleId ? 1 : 0);
  const buffers = new Map<string, { readonly lrPlus: Float64Array; readonly balancedPpv: Float64Array; readonly f1: Float64Array }>();
  for (const rule of aiRules) {
    buffers.set(rule.ruleId, {
      lrPlus: new Float64Array(checked.replicates),
      balancedPpv: new Float64Array(checked.replicates),
      f1: new Float64Array(checked.replicates),
    });
  }
  const random = createBootstrapRng(checked.seed);
  for (let replicate = 0; replicate < checked.replicates; replicate += 1) {
    const sampledPositive = sampleGroups(positiveGroups, positiveGroups.length, random);
    const sampledNegative = sampleGroups(negativeGroups, negativeGroups.length, random);
    for (const rule of aiRules) {
      const values = bootstrapRuleValues(rule.ruleId, sampledPositive, sampledNegative, base.smoothing);
      const bucket = buffers.get(rule.ruleId)!;
      bucket.lrPlus[replicate] = values.lrPlus;
      bucket.balancedPpv[replicate] = values.balancedPpv;
      bucket.f1[replicate] = values.f1;
    }
  }

  const rules: V103BootstrapRuleMetric[] = [...input.ruleCatalog]
    .sort((left, right) => left.ruleId < right.ruleId ? -1 : left.ruleId > right.ruleId ? 1 : 0)
    .map((definition) => {
      if (!definition.aiSpecific) return { ruleId: definition.ruleId, aiSpecific: false, status: 'ineligible' as const };
      const pointRule = pointByRule.get(definition.ruleId);
      const bucket = buffers.get(definition.ruleId);
      if (pointRule === undefined || bucket === undefined || pointRule.status === 'unavailable') {
        return { ruleId: definition.ruleId, aiSpecific: true, status: 'unavailable' as const };
      }
      return {
        ruleId: definition.ruleId,
        aiSpecific: true,
        status: pointRule.status,
        lrPlus: percentileInterval(bucket.lrPlus, checked.confidenceLevel),
        balancedPpv: percentileInterval(bucket.balancedPpv, checked.confidenceLevel),
        f1: percentileInterval(bucket.f1, checked.confidenceLevel),
      };
    });
  return {
    status: 'available',
    method: 'cluster-bootstrap-percentile-v1',
    unit: 'familyId',
    seed: checked.seed,
    replicates: checked.replicates,
    confidenceLevel: checked.confidenceLevel,
    positiveClusterCount: positiveGroups.length,
    negativeClusterCount: negativeGroups.length,
    rules,
  };
}
