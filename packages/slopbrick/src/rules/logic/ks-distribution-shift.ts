import type { Issue, Rule, RuleContext, ScanFacts } from '../../types';
import { createRule } from '../rule';
import { multiFeatureKsTest } from '../../engine/ks';

/**
 * v0.12.0: Multi-feature Kolmogorov–Smirnov distribution-shift rule.
 *
 * Per arXiv:2510.15996 (Oct 2025) "Using Kolmogorov-Smirnov Distance
 * for Measuring Distribution Shift in Machine Learning" — KS is the
 * right tool for ML distribution shift. This rule runs KS on multiple
 * per-file features (line lengths, identifier lengths, comment density)
 * and fires when any feature shows a statistically significant shift
 * vs the corpus baseline, Bonferroni-corrected for the family-wise
 * error rate.
 *
 * Calibration: replace `CORPUS_BASELINES` with values measured from
 * the calibration corpus. Defaults are conservative natural-source
 * approximations.
 */
const MIN_SAMPLES_PER_FEATURE = 20;

interface FeatureStats {
  lineLengths: number[];
  identifierLengths: number[];
  commentDensity: number[];
}

/** Per-file feature extractors. Each returns a vector of samples. */
function extractFileFeatures(source: string): FeatureStats {
  const lines = source.split('\n');
  const lineLengths = lines.map((l) => l.length);
  const identifierLengths: number[] = [];
  const idRe = /[A-Za-z_$][A-Za-z0-9_$]*/g;
  let m: RegExpExecArray | null;
  while ((m = idRe.exec(source)) !== null) {
    identifierLengths.push(m[0].length);
  }
  // comment density: ratio of comment chars to total chars, computed per line.
  const commentDensity = lines.map((l) => {
    const trimmed = l.trim();
    if (trimmed.length === 0) return 0;
    const commentChars =
      (trimmed.match(/^\/\/.*$/)?.[0]?.length ?? 0) +
      (trimmed.match(/^\s*\/\*.*?\*\/\s*$/)?.at(0)?.length ?? 0);
    return commentChars / trimmed.length;
  });
  return { lineLengths, identifierLengths, commentDensity };
}

/**
 * Approximate natural-source baselines. These are rough conservative
 * defaults; replace with corpus-specific baselines for production use.
 */
const CORPUS_BASELINES = {
  lineLengths: [
    20, 25, 30, 32, 35, 40, 45, 50, 55, 60, 65, 70, 75, 80, 85, 90, 95, 100,
  ],
  identifierLengths: [
    3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 18, 20, 24, 28,
  ],
  commentDensity: [0, 0, 0.05, 0.1, 0.15, 0.2, 0.25, 0.3, 0.4, 0.5],
};

export const ksDistributionShiftRule = createRule<RuleContext>({
  id: 'logic/ks-distribution-shift',
  category: 'logic',
  severity: 'medium',
  aiSpecific: true,
  description: 'Multi-feature Kolmogorov–Smirnov distribution-shift vs corpus baseline (Bonferroni-corrected). Peer-reviewed ML distribution-shift detector (arXiv:2510.15996, Oct 2025).',
  create(context) {
    return context;
  },
  analyze(_context, facts): Issue[] {
    const issues: Issue[] = [];
    if (!facts.v2) return issues;
    const source = facts.v2._source ?? '';
    if (source.length < 200) return issues; // skip tiny files

    const features = extractFileFeatures(source);
    const samples = new Map<string, readonly number[]>([
      ['lineLengths', features.lineLengths],
      ['identifierLengths', features.identifierLengths],
      ['commentDensity', features.commentDensity],
    ]);
    const baselines = new Map<string, readonly number[]>([
      ['lineLengths', CORPUS_BASELINES.lineLengths],
      ['identifierLengths', CORPUS_BASELINES.identifierLengths],
      ['commentDensity', CORPUS_BASELINES.commentDensity],
    ]);

    // Skip features with too few samples (KS is unreliable below n = 20).
    for (const [name, vals] of samples) {
      if (vals.length < MIN_SAMPLES_PER_FEATURE) samples.delete(name);
    }
    if (samples.size === 0) return issues;

    const result = multiFeatureKsTest(samples, baselines, 0.05);
    if (!result.anySignificant) return issues;

    const shifted = result.significantFeatures.join(', ');
    const details = result.significantFeatures
      .map((name) => {
        const r = result.perFeature.get(name);
        if (!r) return name;
        return `${name} (D=${r.statistic.toFixed(3)}, p=${r.pValue.toExponential(2)})`;
      })
      .join('; ');

    issues.push({
      ruleId: 'logic/ks-distribution-shift',
      category: 'logic',
      severity: 'medium',
      aiSpecific: true,
      message:
        `Distribution shift detected on ${result.significantFeatures.length} of ${result.perFeature.size} features ` +
        `(Bonferroni α=${result.bonferroniAlpha.toExponential(2)}). Features: ${shifted}. ` +
        `Detail: ${details}.`,
      line: 1,
      column: 1,
      advice:
        'Inspect the shifted features. KS detects both AI anomalies and production-rot anomalies ' +
        '(it is symmetric); combine with Heaps/Zipf for AI-specific signal.',
    });
    return issues;
  },
});

export default ksDistributionShiftRule satisfies Rule<RuleContext>;