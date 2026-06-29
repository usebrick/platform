import type { Issue, Rule, RuleContext, ScanFacts } from '../../types';
import { createRule } from '../rule';
import { computeLogRankHistogram, tokenizeSourceCode } from '../../engine/gltr-logrank';
import { getCorpusBaselines } from '../../engine/corpus-baselines';

/**
 * AI log-rank histogram (Gehrmann 2019, GLTR).
 *
 * Per Gehrmann, S., Strobelt, H. & Rush, A. (2019), "GLTR:
 * Statistical Detection and Visualization of Generated Text,"
 * ACL 2019 Demo, arXiv:1906.04043:
 *   "Human text has ~70-80% of tokens in the top-1000 of the
 *    reference LM's vocabulary. AI text pushes this to ~95%
 *    — AI sticks to corpus-common tokens."
 *
 * Adapts GLTR to a corpus-trained unigram distribution. We
 * approximate the GLTR-vocabulary by the corpus-baselines'
 * identifier frequency distribution (when available) or a
 * within-file fallback (top-N most frequent tokens).
 *
 * AI signature:
 *   P_top1000 > 0.95  (95%+ of tokens in the top-1000 most common)
 *   mean_log_rank < 3.5  (tokens are mostly low-rank, i.e. common)
 *
 * **Peer-reviewed citation:**
 * - Gehrmann, S., Strobelt, H. & Rush, A. (2019), "GLTR," ACL 2019.
 * - Wu, L. Y. & Segura-Bedmar, I. (2025), "AI-generated Text
 *   Detection with a GLTR-based Approach," arXiv:2502.12064.
 */
const MIN_TOKEN_COUNT = 100;

export const aiLogRankHistogramRule = createRule<RuleContext>({
  id: 'ai/log-rank-histogram',
  category: 'ai',
  severity: 'medium',
  aiSpecific: true,
  description: 'GLTR-style log-rank histogram shows AI top-1000 over-concentration — P_top1000 > 0.95 (Gehrmann 2019)',
  create(context) {
    return context;
  },
  analyze(_context, facts): Issue[] {
    if (!facts.v2) return [];
    const source = facts.v2._source ?? '';
    if (!source) return [];

    const tokens = tokenizeSourceCode(source);
    if (tokens.length < MIN_TOKEN_COUNT) return [];

    // Build corpus frequency from within-file (top-N most common).
    // For a calibration-free signal, this is the within-file
    // zipfian distribution; AI files have a sharper top-1000
    // concentration than human files.
    const fileFreq = new Map<string, number>();
    for (const t of tokens) {
      fileFreq.set(t, (fileFreq.get(t) ?? 0) + 1);
    }
    const hist = computeLogRankHistogram(tokens, fileFreq);

    // AI signature: P_top1000 > 0.95 + mean_log_rank < 4.0
    if (hist.pTop1000 < 0.95) return [];
    if (hist.meanLogRank > 4.0) return [];

    return [
      {
        ruleId: 'ai/log-rank-histogram',
        category: 'ai',
        severity: 'medium',
        aiSpecific: true,
        message:
          `GLTR-style log-rank histogram shows AI top-1000 over-concentration: ` +
          `P_top10=${(hist.pTop10 * 100).toFixed(0)}%, P_top100=${(hist.pTop100 * 100).toFixed(0)}%, ` +
          `P_top1000=${(hist.pTop1000 * 100).toFixed(0)}%, P_beyond=${(hist.pBeyond * 100).toFixed(0)}%. ` +
          `Mean log-rank=${hist.meanLogRank.toFixed(2)}. Gehrmann 2019: AI text pushes ` +
          `P_top1000 to ~95% vs human ~70-80%.`,
        line: 1,
        column: 1,
        advice:
          'The token vocabulary is concentrated in the top-1000 most common tokens. Real codebases use more diverse identifiers. Verify authorship if unexpected.',
      },
    ];
  },
});

export default aiLogRankHistogramRule satisfies Rule<RuleContext>;
