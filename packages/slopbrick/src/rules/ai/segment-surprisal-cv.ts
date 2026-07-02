import type { Issue, Rule, RuleContext, ScanFacts } from '../../types';
import { createRule } from '../rule';
import { segmentSurprisalCV, buildTrigramLM, tokenizeSourceCode } from '../../engine/binoculars-cv';
import { getCorpusBaselines } from '../../engine/corpus-baselines';

/**
 * AI Binoculars-style per-segment cross-entropy CV.
 *
 * Per Hans, A., Schwarzschild, A., Cherepanova, V. et al. (2024),
 * "Spotting LLMs with Binoculars: Zero-Shot Detection of
 * Machine-Generated Text," ICML 2024, arXiv:2401.12070:
 *   "AI text occupies a *narrow band* of cross-entropy under a
 *    reference LM. The CV (coefficient of variation) of
 *    per-window cross-entropy is a clean discriminator: AI ~ 0.10,
 *    human ~ 0.20+."
 *
 * AI signature:
 *   surprisal_cv < 0.10  (very uniform per-window entropy)
 *   surprisal_max_slope < 0.5  (no "registers" within the file)
 *
 * Human signature:
 *   surprisal_cv > 0.20  (real edits, varied registers)
 *   surprisal_max_slope > 1.0  (docstring vs hot loop)
 *
 * **Peer-reviewed citation:**
 * - Hans, A. et al. (2024), "Spotting LLMs with Binoculars,"
 *   ICML 2024, arXiv:2401.12070.
 */
const MIN_TOKEN_COUNT = 200;
const N_SEGMENTS = 20;

export const aiSegmentSurprisalCvRule = createRule<RuleContext>({
  id: 'ai/segment-surprisal-cv',
  category: 'ai',
  severity: 'medium',
  aiSpecific: true,
  // v0.21.0: defaultOff. The rule fires on 250/250 files in the
  // self-scan (1 per file), which means it's not discriminating
  // between AI and non-AI text — it fires on every file. The
  // Binoculars-style per-segment entropy CV is too coarse a
  // signal at the file level; the entropy floor is hit by most
  // structured TypeScript regardless of whether the author was
  // an LLM. Re-enable per-file via
  // `rules: { 'ai/segment-surprisal-cv': 'medium' }` in
  // slopbrick.config.mjs once a tighter threshold is calibrated.
  defaultOff: true,
  description: 'Per-segment cross-entropy CV is suspiciously low — Binoculars (Hans 2024): AI text has near-constant per-window entropy',
  create(context) {
    return context;
  },
  analyze(_context, facts): Issue[] {
    if (!facts.v2) return [];
    const source = facts.v2._source ?? '';
    if (!source) return [];

    const tokens = tokenizeSourceCode(source);
    if (tokens.length < MIN_TOKEN_COUNT) return [];

    // Build a per-file trigram LM. For corpus-wide calibration,
    // we'd need a pre-built trigram LM from a labeled corpus;
    // for now, the within-file LM works as a self-similarity
    // baseline (AI files have lower CV against their own LM
    // because they have less within-file variation).
    const lm = buildTrigramLM([tokens]);
    const stats = segmentSurprisalCV(tokens, lm, N_SEGMENTS);
    if (stats.nSegments < 4) return [];

    // AI signature: low CV + low max slope
    if (stats.cvH >= 0.10) return [];
    if (stats.maxSlope >= 0.5) return [];

    return [
      {
        ruleId: 'ai/segment-surprisal-cv',
        category: 'ai',
        severity: 'medium',
        aiSpecific: true,
        message:
          `Per-segment cross-entropy CV is suspiciously low: CV=${stats.cvH.toFixed(2)}, ` +
          `max slope=${stats.maxSlope.toFixed(2)}, range=${stats.rangeH.toFixed(2)}, ` +
          `mean H=${stats.meanH.toFixed(2)}, ${stats.nSegments} segments. ` +
          `Binoculars (Hans 2024): AI text has near-constant per-window entropy; ` +
          `real code has CV > 0.20 from register switches (docstring → hot loop).`,
        line: 1,
        column: 1,
        advice:
          'The cross-entropy is suspiciously uniform across the file. Real codebases have varied registers (docstring blocks, hot loops, regex literals). Verify authorship if unexpected.',
      },
    ];
  },
});

export default aiSegmentSurprisalCvRule satisfies Rule<RuleContext>;
