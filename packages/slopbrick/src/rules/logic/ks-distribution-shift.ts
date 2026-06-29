import type { Issue, Rule, RuleContext, ScanFacts } from '../../types';
import { createRule } from '../rule';
import { multiFeatureKsTest } from '@usebrick/engine';
import { getCorpusBaselines } from '../../engine/corpus-baselines';

/**
 * v0.12.1: Multi-feature Kolmogorov–Smirnov distribution-shift rule.
 *
 * Per arXiv:2510.15996 (Oct 2025) "Using Kolmogorov-Smirnov Distance
 * for Measuring Distribution Shift in Machine Learning" — KS is the
 * right tool for ML distribution shift. This rule runs KS on multiple
 * per-file features (line lengths, identifier lengths, comment density)
 * against corpus baselines, Bonferroni-corrected for the family-wise
 * error rate.
 *
 * **v0.12.1 change**: the baselines are now corpus-derived
 * (`src/engine/corpus-baselines.json`) instead of the v0.12.0
 * hardcoded `n=18` reference vectors. The hardcoded vectors were so
 * small that KS fired on ~87% of human files (catastrophic FPR). With
 * `n=10000` corpus samples per feature, the rule should fire only on
 * genuinely anomalous files.
  * **Peer-reviewed citation:**
 * - Kolmogorov, A. N. (1933), "Sulla determinazione empirica di una
 *   legge di distribuzione," Giornale dell'Istituto Italiano degli
 *   Attuari 4:83-91. Smirnov, N. V. (1939), "Sur les écarts de la
 *   courbe de distribution empirique," Matematicheskii Sbornik
 *   48:3-26. The two-sample KS test is the canonical non-parametric
 *   test for distributional equality.
 * - v0.12.2 calibration: HYGIENE. The KS test correctly identifies
 *   distributional shift; whether that shift is AI- or
 *   production-rot-induced is ambiguous (reclassified from
 *   INVERTED in v0.12.1 to HYGIENE in v0.12.2). */
const MIN_SAMPLES_PER_FEATURE = 20;

interface FeatureStats {
  lineLengths: number[];
  identifierLengths: number[];
  commentDensity: number[];
}

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

export const ksDistributionShiftRule = createRule<RuleContext>({
  id: 'logic/ks-distribution-shift',
  category: 'logic',
  severity: 'medium',
  aiSpecific: false,
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

    // Use corpus-derived baselines if available; fall back to small
    // reference vectors if not (the rule will be very high-FPR with
    // fallback, but it won't crash).
    const baselines = getCorpusBaselines();
    const baselinesMap = new Map<string, readonly number[]>();
    if (baselines) {
      baselinesMap.set('lineLengths', baselines.features.lineLengths.sample);
      baselinesMap.set('identifierLengths', baselines.features.identifierLengths.sample);
      baselinesMap.set('commentDensity', baselines.features.commentDensity.sample);
    } else {
      // Fallback: small reference vectors (legacy, known to be noisy)
      baselinesMap.set('lineLengths', [20, 25, 30, 32, 35, 40, 45, 50, 55, 60, 65, 70, 75, 80, 85, 90, 95, 100]);
      baselinesMap.set('identifierLengths', [3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 18, 20, 24, 28]);
      baselinesMap.set('commentDensity', [0, 0, 0.05, 0.1, 0.15, 0.2, 0.25, 0.3, 0.4, 0.5]);
    }

    // Skip features with too few samples (KS is unreliable below n = 20).
    for (const [name, vals] of samples) {
      if (vals.length < MIN_SAMPLES_PER_FEATURE) samples.delete(name);
    }
    if (samples.size === 0) return issues;

    const result = multiFeatureKsTest(samples, baselinesMap, 0.05);
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
