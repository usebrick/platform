import type { Issue, Rule, RuleContext, ScanFacts } from '../../types';
import { createRule } from '../rule';
import { computeCompressionProfile, lineCompressionStats } from '../../engine/ncd-compression';

/**
 * AI compression profile (NCD / Kolmogorov complexity).
 *
 * Per Cilibrasi, R. & Vitányi, P. M. B. (2005), "Clustering by
 * Compression," IEEE Trans. Information Theory 51(4):1523–1545:
 *   "NCD approximates Kolmogorov complexity K. Files with lower K
 *    (more compressible) are more similar to each other."
 *
 * And Mahoney, M. V. (1999), "Text Compression as a Test for
 * Artificial Intelligence," AAAI'99 motivates compression as an
 * information-theoretic test. Neither paper validates these code
 * thresholds or establishes authorship for an individual file.
 *
 * Provisional profile:
 *   - High gzip savings (≥ 0.60 for files > 2KB) — highly repetitive input
 *     more boilerplate
 *   - High line-to-line NCD similarity (mean NCD < 0.30) — AI
 *     repeats the same patterns
 *   - Low CV of line-level NCD (< 0.50) — uniform repetition
 *
 * A high-compression profile is not itself evidence of authorship: generated
 * files, schemas, fixtures, and hand-written boilerplate can share it. The
 * rule is useful only as a calibrated association alongside other signals.
 *
 * Human code may show:
 *   - Lower gzip savings (more local variety)
 *   - Lower mean line-to-line NCD similarity (humans write
 *     novel code per line)
 *   - Higher CV of line-level NCD
 *
 * **Peer-reviewed citation:**
 * - Cilibrasi, R. & Vitányi, P. M. B. (2005), IEEE Trans. IT.
 * - Mahoney, M. V. (1999), AAAI'99.
 * - Li, M. et al. (2004), "The Similarity Metric," IEEE Trans. IT.
 */
const MIN_BYTES = 2000;       // 2KB minimum for stable compression
// v0.20.0 calibration tune: original thresholds (0.50 / 0.30 / 0.50)
// gave 5,871 self-scan fires with 15% FP rate. The lift was 4.89×
// (USEFUL verdict) but the absolute fire count was unmanageable —
// well-compressible structured code (JSON, YAML, schema, generated
// files) hits 2 of 3 conditions without being AI. Tightened each
// threshold to reduce FP while keeping the rule alive (the
// over-aggressive 'require all 3' fix from earlier this session
// gave 0 fires = dead rule). These new values are conservative
// per-threshold shifts; re-calibrate against the v9 corpus before
// shipping.
const GZIP_RATIO_AI_THRESHOLD = 0.60;
const MEAN_LINE_NCD_HUMAN_MAX = 0.25;
const NCD_CV_AI_MAX = 0.40;

export const aiCompressionProfileRule = createRule<RuleContext>({
  id: 'ai/compression-profile',
  category: 'ai',
  severity: 'low',
  aiSpecific: true,
  description: 'NCD/compression profile exceeds provisional repetition thresholds; interpret only with corpus calibration (Cilibrasi 2005, Mahoney 1999)',
  create(context) {
    return context;
  },
  analyze(_context, facts): Issue[] {
    if (!facts.v2) return [];
    const source = facts.v2._source ?? '';
    if (!source) return [];

    const profile = computeCompressionProfile(source);
    if (profile.bytes < MIN_BYTES) return [];

    const lineStats = lineCompressionStats(source);

    const conditions: string[] = [];
    let aiCount = 0;
    if (profile.gzipRatio > GZIP_RATIO_AI_THRESHOLD) {
      conditions.push(`gzip savings ${profile.gzipRatio.toFixed(2)} > ${GZIP_RATIO_AI_THRESHOLD}`);
      aiCount++;
    }
    if (lineStats.meanNcd > 0 && lineStats.meanNcd < MEAN_LINE_NCD_HUMAN_MAX) {
      conditions.push(`mean line-to-line NCD ${lineStats.meanNcd.toFixed(2)} < ${MEAN_LINE_NCD_HUMAN_MAX}`);
      aiCount++;
    }
    if (lineStats.cvNcd > 0 && lineStats.cvNcd < NCD_CV_AI_MAX) {
      conditions.push(`NCD CV ${lineStats.cvNcd.toFixed(2)} < ${NCD_CV_AI_MAX}`);
      aiCount++;
    }

    if (aiCount < 2) return [];

    return [
      {
        ruleId: 'ai/compression-profile',
        category: 'ai',
        severity: 'low',
        aiSpecific: true,
        message:
          `NCD/compression profile shows an unusually repetitive pattern: ` +
          `gzip savings=${profile.gzipRatio.toFixed(2)} (${profile.gzipBytes}/${profile.bytes} bytes), ` +
          `mean line-to-line NCD=${lineStats.meanNcd.toFixed(2)}, NCD CV=${lineStats.cvNcd.toFixed(2)}. ` +
          `Signals: ${conditions.join('; ')}. Cilibrasi 2005 supports NCD as a ` +
          `similarity proxy; Mahoney 1999 motivates compression-based tests. ` +
          `Neither establishes authorship for this file.`,
        line: 1,
        column: 1,
        advice:
          'The file compresses unusually well and lines are highly repetitive. Check whether generated output, schemas, fixtures, or shared boilerplate explain the pattern before treating it as an AI-associated signal.',
      },
    ];
  },
});

export default aiCompressionProfileRule satisfies Rule<RuleContext>;
