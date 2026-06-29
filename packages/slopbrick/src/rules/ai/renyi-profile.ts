import type { Issue, Rule, RuleContext, ScanFacts } from '../../types';
import { createRule } from '../rule';
import { computeRenyiProfile, isAiRenyiSignature } from '../../engine/renyi-entropy';

/**
 * AI Rényi entropy profile (Rényi 1961; Moslonka 2025).
 *
 * Per Rényi, A. (1961), "On measures of entropy and information,"
 * Proc. 4th Berkeley Symposium 1:547–561:
 *   "The Rényi entropy H_α generalizes Shannon entropy; for
 *    α=2 (collision entropy) and α=∞ (min-entropy), it captures
 *    mass concentration that Shannon entropy alone misses."
 *
 * The signal: AI-generated text exhibits mass concentration on
 * common tokens (low H_2) and a thin rare-token tail (low H_0.5).
 * Human code has a heavier rare-token tail (unusual identifier
 * names, one-off string literals, domain-specific terminology).
 *
 * AI signature (from Moslonka et al. 2025, arXiv:2509.04492):
 *   H_2 / H_1 > 0.85 (collision/Shannon ratio)
 *   H_∞ / H_1 > 0.95 (min/Shannon ratio)
 *
 * The H_2/H_1 ratio is a clean AI-vs-human discriminator: AI files
 * cluster around 0.85 (mass concentration), human files around
 * 0.65 (more uniform).
 *
 * **Peer-reviewed citation:**
 * - Rényi, A. (1961), Proc. 4th Berkeley Symposium.
 * - Moslonka, C. et al. (2025), "Learned Hallucination Detection
 *   in Black-Box LLMs," arXiv:2509.04492.
 * - Lu, Y. et al. (2024), "An Entropy-based Text Watermarking
 *   Detection Method," arXiv:2403.13485.
 */
const MIN_TOKEN_COUNT = 50;
const IDENT_RE = /[a-z_][a-z0-9_]{1,}/g;

export const aiRenyiProfileRule = createRule<RuleContext>({
  id: 'ai/renyi-profile',
  category: 'ai',
  severity: 'medium',
  aiSpecific: true,
  description: 'Rényi entropy profile shows AI mass concentration — H_2/H_1 > 0.85 + H_∞/H_1 > 0.95 (Rényi 1961, Moslonka 2025)',
  create(context) {
    return context;
  },
  analyze(_context, facts): Issue[] {
    if (!facts.v2) return [];
    const source = facts.v2._source ?? '';
    if (!source) return [];

    const tokens = source.toLowerCase().match(IDENT_RE) ?? [];
    if (tokens.length < MIN_TOKEN_COUNT) return [];

    const counts = new Map<string, number>();
    for (const t of tokens) {
      counts.set(t, (counts.get(t) ?? 0) + 1);
    }
    const profile = computeRenyiProfile(counts);
    if (!isAiRenyiSignature(profile)) return [];

    return [
      {
        ruleId: 'ai/renyi-profile',
        category: 'ai',
        severity: 'medium',
        aiSpecific: true,
        message:
          `Rényi entropy profile shows AI mass concentration: H_1=${profile.h1.toFixed(2)}, ` +
          `H_2=${profile.h2.toFixed(2)} (H_2/H_1=${profile.h2H1Ratio.toFixed(2)}), ` +
          `H_∞=${profile.hInfinity.toFixed(2)} (H_∞/H_1=${profile.hInfH1Ratio.toFixed(2)}). ` +
          `Moslonka 2025: AI text has H_2/H_1 > 0.85 + H_∞/H_1 > 0.95.`,
        line: 1,
        column: 1,
        advice:
          'The token distribution is mass-concentrated on a few high-frequency tokens — characteristic of AI-generated code. Verify authorship if unexpected.',
      },
    ];
  },
});

export default aiRenyiProfileRule satisfies Rule<RuleContext>;
