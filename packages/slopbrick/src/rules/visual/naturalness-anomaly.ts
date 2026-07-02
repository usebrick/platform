// Rule: visual/naturalness-anomaly
//
// Per Hindle, A. et al. (2012), ‘On the Naturalness of Software’, Proc. ICSE 2012, pp. 837-847; Allamanis, M., Barr, E. T., Bird, C. & Sutton, C. (2014), ‘Learning Natural Coding Conventions’, Proc. FSE 2014, pp. 281-293.
//
// Phase 2 of v0.10 — Code Naturalness (Hindle et al., ICSE 2012,
// "On the Naturalness of Software", §3-§5).
//
// Fires on files whose identifier stream is *too* uniform relative
// to the baseline model built in `src/engine/naturalness.ts`:
//
//   - `length > 50`               — skip trivial files (a 30-line
//                                   snippet doesn't have enough tokens
//                                   to estimate a ratio reliably).
//   - `distinctTokenRatio < 0.3`  — fewer than 30% of tokens are
//                                   unique. Hindle 2012's central
//                                   observation: human code has more
//                                   identifier diversity per length
//                                   than LLM-generated code, which
//                                   reuses the same handful of names
//                                   over and over.
//
// Severity: medium. aiSpecific: true.
//
// Threshold rationale (see docs/research/math-foundations-for-slopbrick.md
// §3.2 + Hindle 2012 §4.3): a uniform 0.3 floor is deliberately
// conservative for the v1 static-baseline model. A v2 model trained
// on the v4 corpus can raise this to 0.4-0.5 once we have a real
// perplexity distribution to calibrate against. For now, the
// ratio-based signal is robust to absolute-entropy noise.

import type { Issue, Rule, RuleContext, ScanFacts } from '../../types';
import { createRule } from '../rule';
import {
  computeNaturalness,
  computeNaturalnessForRange,
  defaultModel,
  type NaturalnessMetrics,
  type NaturalnessModel,
} from '@usebrick/engine';
import { buildLineOffsets } from '../../engine/visitor';

export interface NaturalnessAnomalyContext {
  /** Pre-built model. Cached so we don't re-allocate the vocabulary
   *  map per file. */
  model: NaturalnessModel;
}

/** Skip files shorter than this many tokens. */
const MIN_LENGTH = 50;

/**
 * Lower bound on the distinct-token ratio. Below this the file is
 * flagged. Cite Hindle 2012 §4.3 in any PR that touches this number.
 *
 * v0.20.0 calibration tune: original 0.3 fired 184 times on
 * self-scan and was the dominant contributor to the visual
 * sub-score saturating at 100. First attempt raised to 0.4
 * (matching the rule's own comment) but the fire condition is
 * `ratio < FLOOR` — raising FLOOR fires on MORE files (319
 * with 0.4, up from 184), not fewer. The comment is misleading.
 * Correct fix: lower the floor to 0.2 (subset of < 0.3, so
 * fewer fires, higher precision). Re-evaluate with the v9
 * corpus calibration.
 */
const DISTINCT_RATIO_FLOOR = 0.2;

export const naturalnessAnomalyRule = createRule<NaturalnessAnomalyContext>({
  id: 'visual/naturalness-anomaly',
  category: 'visual',
  severity: 'medium',
  aiSpecific: true,
  description:
    'Identifier stream has unusually low distinct-token ratio (<30%) — AI-default-naming signature (Hindle 2012 §4.3).',
  create(_context: RuleContext): NaturalnessAnomalyContext {
    return { model: defaultModel() };
  },
  analyze(context: NaturalnessAnomalyContext, facts: ScanFacts): Issue[] {
    const issues: Issue[] = [];
    const source = facts.v2?._source;
    if (!source) return issues;

    const lineOffsets = buildLineOffsets(source);
    const components = facts.v2?.components ?? [];

    // File-level metric. We compute per-component when component
    // boundaries are available, otherwise file-level is the only
    // signal.
    const perComponentMetrics: NaturalnessMetrics[] = components
      .filter((c) => c.loc > 0)
      .map((c) =>
        computeNaturalnessForRange(source, lineOffsets, c.line, c.line + c.loc - 1, context.model),
      );

    // If the file has no recognized components (rare — utility scripts),
    // fall back to file-level so the rule still fires.
    const candidates: Array<{ metrics: NaturalnessMetrics; line: number; column: number }> =
      perComponentMetrics.length > 0
        ? components
            .filter((c) => c.loc > 0)
            .map((c, i) => {
              const m = perComponentMetrics[i];
              return m
                ? { metrics: m, line: c.line, column: c.column }
                : { metrics: computeNaturalness(source, context.model), line: 1, column: 1 };
            })
        : [{ metrics: computeNaturalness(source, context.model), line: 1, column: 1 }];

    for (const { metrics, line, column } of candidates) {
      if (metrics.length < MIN_LENGTH) continue;
      if (metrics.distinctTokenRatio >= DISTINCT_RATIO_FLOOR) continue;

      issues.push({
        ruleId: 'visual/naturalness-anomaly',
        category: 'visual',
        severity: 'medium',
        aiSpecific: true,
        message:
          `Identifier stream is suspiciously uniform: ${metrics.distinctCount}/${metrics.length} ` +
          `distinct tokens (ratio ${metrics.distinctTokenRatio.toFixed(2)} < ${DISTINCT_RATIO_FLOOR}). ` +
          `Perplexity vs Hindle 2012 v1 baseline: ${metrics.perplexity.toFixed(1)}.`,
        line,
        column,
        advice:
          'Mix in more domain-specific identifier names so the vocabulary reflects the actual problem domain ' +
          '(Hindle 2012 §4.3: LLM-generated code reuses a narrow band of training-data identifiers).',
      });
    }

    return issues;
  },
});

export default naturalnessAnomalyRule satisfies Rule<NaturalnessAnomalyContext>;
