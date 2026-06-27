import type { Issue, Rule, RuleContext, ScanFacts } from '../../types';
import { createRule } from '../rule';
import { computeZipfExponent, tokenizeIdentifiers } from '../../engine/zipf-heaps';
import { getCorpusBaselines } from '../../engine/corpus-baselines';

/**
 * v0.12.1: Zipf slope anomaly rule.
 *
 * Computes the Zipf exponent (rank-frequency slope) for the file's
 * identifier tokens. Per Zipf 1949, natural text has Zipf exponent
 * s ≈ 1.0–1.2. AI-generated code often has a flatter (lower s) or
 * steeper (higher s) slope depending on corpus.
 *
 * **v0.12.1 change**: the baseline is now corpus-derived
 * (`src/engine/corpus-baselines.json`). v0.12.0 used hardcoded
 * `s=1.0, σ=0.25`, which was INVERTED on the v6 full-corpus
 * calibration (fired more on human code than on AI).
 */
const FALLBACK_EXPONENT_MEAN = 1.0;
const FALLBACK_EXPONENT_STD = 0.25;
const DEVIATION_THRESHOLD_SIGMA = 2;
const MIN_TOKEN_COUNT = 50;
const MIN_R_SQUARED = 0.7;

export const zipfSlopeAnomalyRule = createRule<RuleContext>({
  id: 'logic/zipf-slope-anomaly',
  category: 'logic',
  severity: 'medium',
  aiSpecific: false,
  description: 'File identifier rank-frequency distribution (Zipf s) deviates from corpus baseline — peer-reviewed LLM indicator',
  create(context) {
    return context;
  },
  analyze(_context, facts): Issue[] {
    const issues: Issue[] = [];
    if (!facts.v2) return issues;
    const source = facts.v2._source ?? '';
    const tokens = tokenizeIdentifiers(source);
    if (tokens.length < MIN_TOKEN_COUNT) return issues;

    const freq = new Map<string, number>();
    for (const t of tokens) freq.set(t, (freq.get(t) ?? 0) + 1);

    const fit = computeZipfExponent(freq);
    if (fit.vocabularySize < 10) return issues;
    if (fit.rSquared < MIN_R_SQUARED) return issues; // poor fit → skip

    // Use corpus-derived baseline if available, else fallback to defaults.
    const baselines = getCorpusBaselines();
    const exponentMean = baselines?.features.zipf.mean ?? FALLBACK_EXPONENT_MEAN;
    const exponentStd = baselines?.features.zipf.std ?? FALLBACK_EXPONENT_STD;

    const z = (fit.exponent - exponentMean) / exponentStd;
    if (Math.abs(z) < DEVIATION_THRESHOLD_SIGMA) return issues;

    const direction = z > 0 ? 'steeper' : 'flatter';
    issues.push({
      ruleId: 'logic/zipf-slope-anomaly',
      category: 'logic',
      severity: 'medium',
      aiSpecific: false,
      message:
        `Zipf exponent s=${fit.exponent.toFixed(3)} is ${direction} than corpus baseline ` +
        `(${exponentMean.toFixed(2)} ± ${exponentStd.toFixed(2)}, z=${z.toFixed(2)}σ, R²=${fit.rSquared.toFixed(2)}). ` +
        `LLM-generated code has systematically different token-frequency slopes.`,
      line: 1,
      column: 1,
      advice:
        `Inspect for LLM-style frequency distribution: this file's identifier usage is ` +
        `${direction === 'steeper' ? 'more peaked (one dominant token)' : 'flatter (more uniform usage)'} ` +
        `than typical human code.`,
    });
    return issues;
  },
});

export default zipfSlopeAnomalyRule satisfies Rule<RuleContext>;
