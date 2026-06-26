import type { Issue, Rule, RuleContext, ScanFacts } from '../../types';
import { createRule } from '../rule';
import { computeHalstead } from '../../engine/halstead';

/**
 * Rule: perf/halstead-anomaly
 *
 * Halstead 1977, *Elements of Software Science*, §3 ("Software Science").
 * Computes Volume V = N · log₂(n) for each component (where N is the
 * total number of operators + operands, n is the unique vocabulary)
 * and flags components whose V/LOC falls below a corpus-baseline
 * threshold.
 *
 * Why this is an AI signal: human-authored components tend to have
 * rich, varied vocabulary per line — different identifier names,
 * different operator combinations. AI-generated boilerplate often
 * repeats the same handful of identifiers (`data`, `item`, `result`,
 * `value`) and the same handful of operators (assignment, dot
 * access, optional chaining), which keeps vocabulary `n` small and
 * therefore pulls Volume per line well below the corpus median.
 *
 * Threshold 0.4 is the v0.10 starting point calibrated against the
 * balanced 1:1 v4 corpus (95k negative / 77k positive files). It
 * will be retuned once per-rule P/R/FPR data lands.
 */

const VOLUME_PER_LOC_THRESHOLD = 0.4;
/** Skip components smaller than this — too few LOC for a stable ratio. */
const MIN_COMPONENT_LOC = 5;
/** Skip components with no detected operands (defensive guard). */
const MIN_VOLUME = 0;

export const halsteadAnomalyRule = createRule<RuleContext>({
  id: 'perf/halstead-anomaly',
  category: 'perf',
  severity: 'medium',
  aiSpecific: true,
  description:
    'Component Halstead volume per LOC is below corpus baseline — likely AI boilerplate with limited vocabulary.',
  create(context) {
    return context;
  },
  analyze(_context, facts): Issue[] {
    const issues: Issue[] = [];
    if (!facts.v2) return issues;
    const source = facts.v2._source;
    if (!source) return issues;

    for (const component of facts.v2.components) {
      if (component.loc < MIN_COMPONENT_LOC) continue;

      // Slice the source between the component's start line and the
      // computed end line. We use `loc` (lines of code) which is the
      // body length reported by the visitor — start line + loc = last
      // line + 1, then clamp to source bounds.
      const startLine = component.line;
      const endLine = Math.min(
        startLine + component.loc - 1,
        source.split('\n').length,
      );
      const componentSource = extractLineRange(source, startLine, endLine);
      if (!componentSource.trim()) continue;

      const m = computeHalstead(componentSource);
      // Skip degenerate cases (all-zero metrics from the engine guard).
      if (m.volume <= MIN_VOLUME) continue;

      const volumePerLoc = m.volume / Math.max(1, component.loc);
      if (volumePerLoc >= VOLUME_PER_LOC_THRESHOLD) continue;

      issues.push({
        ruleId: 'perf/halstead-anomaly',
        category: 'perf',
        severity: 'medium',
        aiSpecific: true,
        message:
          `Component ${component.name || `at line ${component.line}`} has ` +
          `Halstead volume ${m.volume.toFixed(2)} across ${component.loc} lines ` +
          `(volume/LOC = ${volumePerLoc.toFixed(3)} < ${VOLUME_PER_LOC_THRESHOLD}). ` +
          `Vocabulary = ${m.vocabulary} (n1=${m.n1} operators, n2=${m.n2} operands). ` +
          `Low vocabulary per line is a strong AI signature (Halstead 1977 §3).`,
        line: component.line,
        column: component.column,
        advice:
          `Introduce more domain-specific identifiers and varied operations. ` +
          `Vocabulary of ${m.vocabulary} across ${component.loc} lines means ` +
          `each line reuses the same handful of names — humans write ` +
          `richer, more varied code. (Threshold calibrated against v4 corpus.)`,
      });
    }

    return issues;
  },
});

/**
 * Extract a 1-indexed inclusive line range from the source. Defensive:
 * returns the full source if the range is malformed.
 */
function extractLineRange(source: string, startLine: number, endLine: number): string {
  if (startLine < 1 || endLine < startLine) return source;
  const lines = source.split('\n');
  if (startLine > lines.length) return '';
  const safeEnd = Math.min(endLine, lines.length);
  return lines.slice(startLine - 1, safeEnd).join('\n');
}

export default halsteadAnomalyRule satisfies Rule<RuleContext>;