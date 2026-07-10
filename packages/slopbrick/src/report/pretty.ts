import chalk from 'chalk';
import type {
  ComponentScore,
  Issue,
  ProjectReport,
  Severity,
  TopOffender,
} from '../types';
import { HEADLINE_SCORES, REPOSITORY_HEALTH_FORMULA, SCORE_BRIEFS, formatHeadlineScore } from './score-contract.js';
import { formatScanValidityNotice } from './scan-validity.js';
// v0.17.1: redact any secret-looking strings in issue messages / advice
// before they reach the terminal. Same regex set the security/secret-leak
// rules use on user code, applied to our own output.
import { redactSecrets } from '../cli/render.js';

function severityColor(severity: Severity): (text: string) => string {
  switch (severity) {
    case 'high':
      return chalk.red;
    case 'medium':
      return chalk.yellow;
    case 'low':
    default:
      return chalk.gray;
  }
}

function countBySeverity(issues: Issue[]): Record<Severity, number> {
  const counts: Record<Severity, number> = { low: 0, medium: 0, high: 0 };
  for (const issue of issues) {
    // v0.43.0: 'off' issues are default-off rules that are auto-
    // suppressed. They show in the JSON but should NOT be counted
    // in the visible severity breakdown.
    if ((issue.severity as string) === 'off') continue;
    counts[issue.severity] += 1;
  }
  return counts;
}

/** v0.43.0: count of issues that are visible to the user
 *  (excludes 'off'-severity suppressed issues). */
function activeIssueCount(issues: Issue[]): number {
  let n = 0;
  for (const i of issues) if ((i.severity as string) !== 'off') n++;
  return n;
}

function pluralize(count: number, word: string): string {
  return `${count} ${word}${count === 1 ? '' : 's'}`;
}

function formatScoreBasis(report: ProjectReport): string | null {
  if (!report.scoreBasis) return null;
  const { denominator, suppressedIssueCount, parseErrorCount } = report.scoreBasis;
  return `Scores use ${pluralize(denominator, 'analysed file')}; effective findings only (${suppressedIssueCount} suppressed, ${parseErrorCount} parse errors).`;
}

function formatSummary(report: ProjectReport): string {
  const counts = countBySeverity(report.issues);
  const fileCount = report.fileCount;
  // v0.43.0: count only active (non-off) issues in the visible
  // summary. The total in the JSON includes suppressed issues for
  // tooling, but the human-facing report shows what the user
  // actually needs to fix.
  const active = activeIssueCount(report.issues);
  const base = `Scanned ${pluralize(fileCount, 'file')}, ${pluralize(report.componentCount, 'component')}, ${pluralize(active, 'issue')} (high: ${counts.high}, medium: ${counts.medium}, low: ${counts.low})`;
  const basis = formatScoreBasis(report);
  const basisLine = basis ? `\n${basis}` : '';
  // v0.10.1: PR Slop Score header for --diff <ref> mode (VibeDrift-compatible).
  if (report.prSlopScore !== undefined) {
    return `${base}${basisLine}\nComparing against \`${report.diffRef ?? 'HEAD~'}\`: PR Slop Score = ${report.prSlopScore}`;
  }
  return `${base}${basisLine}`;
}

/**
 * v0.14.5i — Trust-signal section: surfaces the count of issues
 * auto-suppressed because their rule was marked `defaultOff: true` in
 * signal-strength.json (INVERTED or NOISY rules that would erode
 * trust in the tool if surfaced in CI). Previously went to stderr
 * where it was easy to miss.
 */
function formatDefaultOffSuppression(report: ProjectReport): string | null {
  const suppressed = report.defaultOffSuppressedCount ?? 0;
  const total = report.defaultOffRuleCount ?? 0;
  if (suppressed === 0) return null;
  return chalk.green(
    `✓ ${suppressed} INVERTED/NOISY issue(s) correctly suppressed ` +
      `from ${total} default-off rule(s). ` +
      `The top offenses below are the ones that matter — re-enable per-rule via ` +
      `\`rules: { 'rule/id': 'medium' }\` in slopbrick.config.mjs.`,
  );
}

/**
 * v0.14.5j (P8) — Better status labels. PASS/FAIL is technical jargon;
 * "passing" / "needs work" / "concerning" reads in plain English.
 * Maps a 0-100 score to one of four bands with color + label.
 *
 * v0.21.0: this band is for "higher = better" scores (composite
 * `repositoryHealth`, sub-scores cleanliness). For the AI Slop Score
 * headline (now "lower = better" — raw amount of slop), use
 * `slopScoreBand()` instead.
 */
function scoreBand(score: number): { label: string; color: (s: string) => string } {
  if (score >= 90) return { label: 'excellent', color: chalk.green };
  if (score >= 70) return { label: 'passing', color: chalk.green };
  if (score >= 40) return { label: 'needs work', color: chalk.yellow };
  return { label: 'concerning', color: chalk.red };
}

/**
 * v0.21.0: Band for the AI Slop Score headline (raw amount of slop,
 * 0=clean, 100=saturated, lower = better). Mirrors the `slop` message
 * tiers so the headline status and the message below it stay in sync:
 *   < 10  → "no slop" (green)
 *   < 30  → "low"      (green)
 *   < 50  → "medium"   (yellow)
 *   < 70  → "high"     (red)
 *   ≥ 70  → "saturated" (red)
 */
function slopScoreBand(score: number): { label: string; color: (s: string) => string } {
  if (score >= 70) return { label: 'saturated', color: chalk.red };
  if (score >= 50) return { label: 'high', color: chalk.red };
  if (score >= 30) return { label: 'medium', color: chalk.yellow };
  if (score >= 10) return { label: 'low', color: chalk.green };
  return { label: 'no slop', color: chalk.green };
}

/**
 * v0.14.5j (P9) — Trajectory delta. Returns a short string like
 * "  ↓3 (cleaner)" or "  ↑5 (worse)" to append to the headline.
 * Returns empty string when no previous run exists.
 *
 * v0.21.0: aiSlopScore is now raw amount of slop (0=clean, 100=saturated).
 * The delta semantics FLIP: lower score = cleaner, higher score = more
 * slop. So delta < 0 (score went down) means cleaner, delta > 0 means worse.
 * This is the same convention the v0.14 headline slopIndex used.
 *
 * Color: green for improvement (score went DOWN = cleaner), red for
 * regression (score went UP = more slop). Yellow for no change. A tiny
 * change (±0.5) is treated as noise and not shown.
 */
function formatDeltaSuffix(report: ProjectReport): string {
  if (typeof report.previousSlopIndex !== 'number') return '';
  // v0.21.0: aiSlopScore is raw amount (higher = more slop, lower = cleaner).
  // For readers with a v0.20.1 baseline (where slopIndex was the inverted
  // aiSlopScore = cleanliness), the value is the INVERSE of the new
  // aiSlopScore. v0.21 readers should pass a normalized baseline (raw
  // amount). The engine that writes the previousBaseline handles the
  // version-aware migration in finalizeReport.ts.
  const delta = report.aiSlopScore - report.previousSlopIndex;
  if (Math.abs(delta) < 0.5) return ''; // noise floor
  const arrow = delta < 0 ? '↓' : '↑';
  const absDelta = Math.abs(delta).toFixed(0);
  // aiSlopScore lower = cleaner; delta < 0 means score went down → cleaner.
  const word = delta < 0 ? 'cleaner' : 'worse';
  const color = delta < 0 ? chalk.green : chalk.red;
  return color(`  ${arrow}${absDelta} (${word})`);
}

/**
 * v0.14.5j (P6) — Plain-language verdict. A single sentence that
 * answers the user's actual question: "Is my code OK, and if not,
 * what's the one thing I should do?"
 *
 * Replaces the bare "25 [FAIL]" with something a non-technical
 * reader can act on. Adapts to the report's actual data:
 * - If score is high: short reassurance
 * - If score is failing: identify the dominant category, the
 *   dominant rule, and the dominant file
 * - If no issues: explicit "all clean" verdict
 */
function formatVerdict(report: ProjectReport): string {
  // v0.42.0 (user-review fix): the verdict used to be derived from
  // scoreBand(), which is correct for higher-is-better scores like
  // boundaryScore/contextScore/visualScore/repositoryHealth (0 = bad,
  // 100 = clean). But aiSlopScore is the OPPOSITE direction (0 = clean,
  // 100 = saturated slop). The fix: route through slopScoreBand(),
  // which has the correct band mapping for a cleanliness metric. The
  // output was "Repo is concerning (25/100)" for the slopbrick repo,
  // but score 25 is well below the 30 threshold and is in fact "low
  // slop" - the verdict should reflect "this is OK" not "this is bad".
  const score = report.aiSlopScore;
  const band = slopScoreBand(score);

  // Build context: dominant category + rule + file
  const ranked = rankByImpact(report.issues);
  const topRule = ranked[0];
  const topFile = report.topOffenders?.[0];

  if (report.issues.length === 0) {
    return chalk.bold.green(
      `✓ Clean. No AI slop signatures or anti-patterns found. The repo is ` +
      `coherent with the patterns it was written in.`,
    );
  }

  if (score >= 70) {
    return band.color(
      `Repo is ${band.label} (${score}/100). ${report.issues.length} ` +
      `minor issue${report.issues.length === 1 ? '' : 's'} — none of ` +
      `them are doing real damage.`,
    );
  }

  // Failing — find the dominant category so we can name it
  const dominantCat = topRule ? topRule[0].category : 'mixed';
  const catGloss = CATEGORY_GLOSSARY[dominantCat as keyof typeof CATEGORY_GLOSSARY];
  // v0.14.5j: avoid "AI patterns patterns" — `catGloss.short` already
  // includes the noun (e.g. "AI patterns", "visual style") so we
  // don't append "patterns" again.
  const catLabel = catGloss?.short ?? dominantCat;
  const fileHint = topFile ? ` — worst file is ${topFile.filePath}` : '';

  return band.color(
    `Repo is ${band.label} (${score}/100). The biggest problem is ` +
    `${catLabel}${fileHint}. Run \`slopbrick scan --why-failing\` ` +
    `for the top 5 rules, or \`slopbrick scan --suggest\` for fixes.`,
  );
}

/**
 * v0.14.5j (P7) — Category glossary. Each of the 16 categories gets
 * a plain-language label and a one-line explanation. Used by the
 * category breakdown to make the bars self-explanatory.
 */
const CATEGORY_GLOSSARY: Record<string, { short: string; long: string }> = {
  visual:   { short: 'visual style',    long: 'colors, spacing, font sizes, layout' },
  typo:     { short: 'typography',      long: 'font weights, line heights, font choices' },
  wcag:     { short: 'accessibility',   long: 'a11y: focus rings, target size, drag' },
  layout:   { short: 'layout',          long: 'flex/grid, gaps, alignment' },
  component:{ short: 'component shape', long: 'component size, one-per-file rules' },
  logic:    { short: 'logic patterns',  long: 'state, hooks, prop usage' },
  arch:     { short: 'architecture',    long: 'cross-file structure, file size' },
  perf:     { short: 'performance',     long: 'CSS size, image CLS, render cost' },
  security: { short: 'security',        long: 'secrets, XSS, injection patterns' },
  test:     { short: 'test quality',    long: 'test coverage, naming, structure' },
  docs:     { short: 'docs freshness',  long: 'stale references, broken links' },
  db:       { short: 'database health', long: 'SQL anti-patterns, schema issues' },
  ai:       { short: 'AI patterns',     long: 'signatures of LLM-generated code' },
  context:  { short: 'context',         long: 'imports, props, dependency boundaries' },
  product:  { short: 'product',         long: 'feature flags, dead code, churn' },
  i18n:     { short: 'i18n',            long: 'translations, locale handling' },
};

/**
 * Helper: rank issues by weighted impact (severity × count). Reused
 * by the verdict and the why-failing output.
 */
function rankByImpact(issues: Issue[]): Array<[Issue, number]> {
  const SEVERITY_WEIGHT: Record<Severity, number> = { low: 1, medium: 3, high: 5 };
  const byRule = new Map<string, { count: number; points: number; sample: Issue }>();
  for (const issue of issues) {
    if ((issue.severity as string) === 'off') continue;
    const cur = byRule.get(issue.ruleId) ?? { count: 0, points: 0, sample: issue };
    cur.count += 1;
    cur.points += SEVERITY_WEIGHT[issue.severity];
    cur.sample = issue;
    byRule.set(issue.ruleId, cur);
  }
  return [...byRule.entries()]
    .sort(([, a], [, b]) => b.points - a.points)
    .map(([ruleId, info]) => [{ ...info.sample, ruleId }, info.points]);
}

/**
 * v0.14.5i — Per-category breakdown table. The 16 raw categoryScores
 * are already in the report (and the health.json) but were not visible
 * in the CLI. Now surfaced as a compact bar chart so the user can see
 * which categories are driving the score.
 *
 * Sort: descending by raw points. Show top N (default 5), then a
 * "+M more" line if there are more. Categories with 0 points are
 * counted in a summary line ("K categories not applicable").
 */
function formatCategoryBreakdown(report: ProjectReport, topN = 5): string {
  const scores = report.categoryScores ?? {};
  const entries = Object.entries(scores)
    .filter(([, score]) => score > 0)
    .sort(([, a], [, b]) => b - a);

  if (entries.length === 0) {
    return chalk.dim('Category breakdown: no active categories — the codebase is clean across all 16 categories.');
  }

  const max = entries[0]?.[1] ?? 1;
  const barWidth = 20;
  const lines: string[] = [];
  lines.push(chalk.bold('Category breakdown (what kind of issue, and how much):'));
  const shown = entries.slice(0, topN);
  for (const [category, score] of shown) {
    const gloss = CATEGORY_GLOSSARY[category];
    const label = gloss ? gloss.short : category;
    const padded = label.padEnd(16, ' ');
    const valueStr = score.toFixed(0).padStart(6, ' ');
    const filled = Math.round((score / max) * barWidth);
    const bar = '█'.repeat(filled) + '░'.repeat(barWidth - filled);
    const longHint = gloss ? chalk.dim(` — ${gloss.long}`) : '';
    lines.push(`  ${padded} ${chalk.cyan(bar)} ${valueStr}${longHint}`);
  }
  if (entries.length > topN) {
    lines.push(chalk.dim(`  +${entries.length - topN} more active categories`));
  }
  const inactive = Object.values(scores).filter((s) => s === 0).length;
  if (inactive > 0) {
    lines.push(chalk.dim(`  ${inactive} other categories are clean`));
  }
  return lines.join('\n');
}

/**
 * v0.14.5i — Highest-impact next step. Compute which single action
 * would most improve the score, based on the report's actual data.
 * Returns a concrete command line the user can run.
 */
function formatNextStep(report: ProjectReport): string {
  const lines: string[] = [];
  lines.push(chalk.bold('Next step:'));

  // Compute the dominant impact driver by looking at the top offending
  // file. The user can target that specifically with --rule.
  const top = report.topOffenders?.[0];
  if (top) {
    const issueWord = top.issueCount === 1 ? 'issue' : 'issues';
    lines.push(
      chalk.cyan(`  → \`slopbrick scan --rule ${top.filePath}\` to drill into the worst file (${top.issueCount} ${issueWord})`),
    );
  }

  // Always offer the universal "see fixes" / "save baseline" escape hatches.
  lines.push(
    chalk.cyan(`  → \`slopbrick scan --suggest\` for auto-fix advice`),
  );
  lines.push(
    chalk.dim(
      `  → \`slopbrick scan --baseline\` to accept today's scores as the new floor`,
    ),
  );

  // v0.42.0 (user-review fix): the hint was previously hardcoded to
  // "exceeds 30" (the default meanSlop). For users with a stricter
  // meanSlop (e.g. slopbrick repo's 15), the hint would only appear
  // after the scan already failed — too late. It should mirror the
  // actual gate: show --why-failing whenever aiSlopScore is over
  // the user's configured threshold, not just the default.
  const meanSlop = report.thresholds?.meanSlop ?? 30;
  if (report.aiSlopScore > meanSlop) {
    lines.push(
      chalk.dim(
        `  → \`slopbrick scan --why-failing\` for the top 5 issues dragging the score down`,
      ),
    );
  }
  return lines.join('\n');
}

/**
 * v0.14.5i — Why-failing output. Renders the top 5 rules (by weighted
 * impact) that are dragging the headline score down. Used by the
 * `--why-failing` flag for users who want a quick triage view.
 */
function formatWhyFailing(report: ProjectReport): string {
  // v0.14.5j: reuse the rankByImpact helper instead of the inline
  // version that was here. Now also collects the file set per rule
  // so the output can say "across N files".
  const SEVERITY_WEIGHT: Record<Severity, number> = { low: 1, medium: 3, high: 5 };
  const impact = new Map<string, { count: number; points: number; files: Set<string> }>();
  for (const issue of report.issues) {
    if ((issue.severity as string) === 'off') continue;
    const cur = impact.get(issue.ruleId) ?? { count: 0, points: 0, files: new Set() };
    cur.count += 1;
    cur.points += SEVERITY_WEIGHT[issue.severity];
    if (issue.filePath) cur.files.add(issue.filePath);
    impact.set(issue.ruleId, cur);
  }
  const ranked = [...impact.entries()]
    .sort(([, a], [, b]) => b.points - a.points)
    .slice(0, 5);

  if (ranked.length === 0) {
    return chalk.green('Nothing is failing the threshold. Score is clean.');
  }

  // v0.21.0: aiSlopScore is raw amount of slop (0=clean, 100=saturated).
  // PASS when <= 30 (default meanSlop: 30). Was >= 70 in v0.15–v0.20.1
  // (cleanliness inversion).
  //
  // v0.42.0 (post-cleanup follow-up): the prior `above 30` qualifier
  // was wrong for a cleanliness metric — lower is better. When the
  // score is 25 we want to say "below the 30 threshold," not
  // "above." The fix: condition the qualifier on the direction.
  //
  // v0.42.0 (user-review fix): the threshold was hardcoded to 30 in
  // 3 places here and 1 in --brief. For users who set their own
  // meanSlop (e.g. slopbrick repo itself uses meanSlop=15) the
  // why-failing output showed "PASS — below 30" while the actual
  // scan returned exit code 1. Same bug as the brief one. Fix:
  // read the threshold from the report.
  const headline = report.aiSlopScore;
  const meanSlop = report.thresholds?.meanSlop ?? 30;
  const status = headline <= meanSlop ? 'PASS' : 'FAIL';
  const colorize = headline <= meanSlop ? chalk.green : chalk.red;
  const qualifier = headline <= meanSlop ? `below ${meanSlop}` : `above ${meanSlop}`;
  const lines: string[] = [];
  lines.push(colorize.bold(`Headline score: ${headline.toFixed(0)}/100 (${status} — ${qualifier})`));
  lines.push('');
  lines.push(chalk.bold('Top 5 rules dragging the score down:'));
  for (let i = 0; i < ranked.length; i++) {
    const [ruleId, info] = ranked[i]!;
    const fileCount = info.files.size;
    const fileHint = fileCount > 0 ? ` across ${fileCount} file${fileCount === 1 ? '' : 's'}` : '';
    // v0.42.0: removed the `catShort` const that was computed and never read.
    // The line below already derives `cat` correctly from the actual
    // sampleIssue's category. (Separately, the prior ternary
    // `info.count > 0 ? '' : ''` was always returning `''` regardless of
    // info.count — a separate, pre-existing bug. Filed as a follow-up.)
    const sampleIssue = report.issues.find((i) => i.ruleId === ruleId);
    const cat = sampleIssue ? CATEGORY_GLOSSARY[sampleIssue.category]?.short : null;
    const catHint = cat ? chalk.dim(` [${cat}]`) : '';
    lines.push(
      `  ${i + 1}. ${chalk.cyan(ruleId)}${catHint} — ${info.count} fire${info.count === 1 ? '' : 's'}${fileHint} (${info.points} weighted points)`,
    );
  }
  lines.push('');
  lines.push(chalk.dim('  Run `slopbrick scan --suggest` for auto-fix advice per rule.'));
  return lines.join('\n');
}

function severityBadge(severity: Severity): string {
  const colorize = severityColor(severity);
  const label = severity.toUpperCase().padEnd(8, ' ');
  return colorize(label);
}

/**
 * v0.20.0 — Plain-language message for each score range. The user
 * asked for adjectives/messages beyond the bare number (the band
 * label [PASSING/CONCERNING] wasn't enough). Each message is
 * repo-focused ("Repo has...", not "Score is...") so the output
 * reads as a status report, not a dashboard.
 *
 * Thresholds match the band labels in `scoreBand`:
 *   ≥90 = excellent / no / clean / healthy
 *   ≥70 = passing / low / minor
 *   ≥50 = needs work / medium / moderate
 *   ≥30 = concerning / high / significant
 *   <30 = critical / saturated / serious
 */
const SCORE_MESSAGES: Record<string, ReadonlyArray<readonly [number, string]>> = {
  // AI Slop Score (v0.21.0: lower = cleaner; field stores the RAW
  // amount of slop. 0 = no AI slop, 100 = max AI slop. The tier
  // thresholds are flipped vs the v0.20.1 inverted reading.)
  slop: [
    [90, 'Repo is saturated with AI slop'],
    [70, 'Repo has a high amount of AI slop'],
    [50, 'Repo has a medium amount of AI slop'],
    [30, 'Repo has a low amount of AI slop'],
    [0,  'Repo has no detectable AI slop'],
  ],
  // Engineering Hygiene (higher = better = fewer arch/logic/layout issues)
  hygiene: [
    [90, 'Repo is clean'],
    [70, 'Repo has minor code quality issues'],
    [50, 'Repo has moderate code quality issues'],
    [30, 'Repo has significant code quality issues'],
    [0,  'Repo has serious code quality issues'],
  ],
  // Security (higher = better = inverted from risk level)
  security: [
    [90, 'Repo has no security risks'],
    [70, 'Repo has low security risk'],
    [50, 'Repo has medium security risk'],
    [30, 'Repo has high security risk'],
    [0,  'Repo has critical security risk'],
  ],
  // Repository Health (higher = better = composite of 4 scores)
  health: [
    [90, 'Repo is healthy'],
    [70, 'Repo has minor concerns'],
    [50, 'Repo has moderate concerns'],
    [30, 'Repo has significant concerns'],
    [0,  'Repo has serious concerns'],
  ],
  // Test Quality (higher = better = more test coverage, better assertions)
  test: [
    [90, 'Tests are comprehensive'],
    [70, 'Good test coverage'],
    [50, 'Moderate test coverage'],
    [30, 'Weak test coverage'],
    [0,  'Tests are inadequate'],
  ],
  // Business Logic Coherence (higher = better = fewer cyclic imports, etc.)
  logic: [
    [90, 'Logic is clean'],
    [70, 'Minor logic tangles'],
    [50, 'Moderate logic tangles'],
    [30, 'Significant logic tangles'],
    [0,  'Serious logic tangles'],
  ],
  // Accessibility (higher = better = fewer WCAG violations)
  accessibility: [
    [90, 'No accessibility issues'],
    [70, 'Minor accessibility issues'],
    [50, 'Moderate accessibility issues'],
    [30, 'Significant accessibility issues'],
    [0,  'Critical accessibility issues'],
  ],
  // Performance (higher = better = fewer render-blocking, N+1, bloat)
  performance: [
    [90, 'No performance issues'],
    [70, 'Minor performance issues'],
    [50, 'Moderate performance issues'],
    [30, 'Significant performance issues'],
    [0,  'Critical performance issues'],
  ],
  // Sub-score buckets (boundary/context/visual within AI Slop Score)
  boundary: [
    [90, 'Boundary is clean'],
    [70, 'Minor boundary issues'],
    [50, 'Moderate boundary issues'],
    [30, 'Significant boundary issues'],
    [0,  'Boundary is broken'],
  ],
  context: [
    [90, 'Context is clean'],
    [70, 'Minor context issues'],
    [50, 'Moderate context issues'],
    [30, 'Significant context issues'],
    [0,  'Context is broken'],
  ],
  visual: [
    [90, 'Visual is clean'],
    [70, 'Minor visual issues'],
    [50, 'Moderate visual issues'],
    [30, 'Significant visual issues'],
    [0,  'Visual is broken'],
  ],
};

function scoreToMessage(score: number, type: keyof typeof SCORE_MESSAGES): string {
  // SCORE_MESSAGES covers every value of `type` (the type signature
  // is `keyof typeof SCORE_MESSAGES`), so the lookup is total. Use
  // `!` to tell TypeScript this without a runtime fallback (the
  // `?? []` is defensive only — in practice the branch is dead).
  const tiers = SCORE_MESSAGES[type] ?? [];
  for (const [threshold, message] of tiers) {
    if (score >= threshold) return message;
  }
  // Below all thresholds (or empty tiers) → return the lowest tier's
  // message, or a generic fallback if tiers is empty.
  const last = tiers[tiers.length - 1];
  return last ? last[1] : 'Score unavailable';
}

/**
 * v0.9.1 — Repository Coherence is the new headline metric.
 * v0.9.1 — Repository Coherence was the new headline metric.
 * Composite: 0.50 × Architecture Consistency + 0.30 × (100 − Pattern
 * Fragmentation) + 0.10 × Constitution Mapped + 0.10 × AI Debt Mapped.
 *
 * v0.14.5i — Reverted: Slop Index is the headline again, because
 * users found the dual-scoring confusing. Coherence is now shown
 * as a secondary view in `formatCompositeScore()`.
 *
 * v0.14.5j — Coherence formula is no longer dumped into the
 * output (was confusing). Replaced with a one-line plain-English
 * explanation. The full formula is in `docs/scoring-explained.md`.
 */

function formatCompositeScore(report: ProjectReport): string {
  // v0.15.0 U.4+: aiSlopScore is the SINGLE headline number, matching
  // what the user sees in .slopbrick/health.json. The Repository
  // Coherence composite is shown as a secondary line so the two
  // views are consistent.
  //
  // v0.14.5j (P8): replaced [PASS]/[FAIL] with plain-language band
  // labels (excellent / passing / needs work / concerning).
  //
  // v0.21.0: aiSlopScore is now the RAW amount of slop
  // (0=clean, 100=saturated, lower = better). The band labels flip:
  // "no slop / low / medium / high / saturated" — driven by
  // `slopScoreBand()` (the old `scoreBand()` still serves the
  // repositoryHealth composite, which is "higher = better").
  //
  // v0.14.5j (P9): trajectory delta "±N from last run" appended to
  // the headline so the user can see the trend without grep'ing
  // the run log.
  const slop = report.aiSlopScore;
  const slopValue = formatHeadlineScore(slop);
  const band = slopScoreBand(slop);
  const status = chalk.bold(`[${band.label.toUpperCase()}]`);

  const lines: string[] = [];
  const deltaSuffix = formatDeltaSuffix(report);
  lines.push(
    chalk.bold(`AI Slop Score: ${slopValue} / 100 ${band.color(status)}${deltaSuffix}`),
  );
  // v0.20.0: plain-language message (band label alone wasn't enough).
  // v0.21.0: aiSlopScore is the raw amount of slop. The 'slop' tier
  // messages are authored in the natural reading direction (≥90
  // saturated, <10 no slop) so the lookup is direct.
  lines.push(`  ${chalk.dim(scoreToMessage(slop, 'slop'))}`);
  lines.push(
    chalk.dim(
      'lower = cleaner · measures AI-slop signatures (0 = no AI slop detected, 100 = max AI slop). ' +
        'The rules are calibrated to detect AI patterns, so this measures how much AI-style fingerprint the codebase has. ' +
        'Same number in .slopbrick/health.json.',
    ),
  );

  // Keep the other headline axes beside the AI-slop gate. They are not
  // thresholds, but hiding them makes the pretty renderer lose report data.
  for (const { field, label } of HEADLINE_SCORES.slice(1)) {
    const value = report[field];
    lines.push(chalk.dim(`${label}: ${formatHeadlineScore(value)} / 100 — ${SCORE_BRIEFS[field]}`));
  }

  // Show the subscore breakdown with plain-language labels.
  // v0.20.0: each sub-score also gets a plain-language message.
  lines.push(
    `  ├─ boundary: ${report.boundaryScore.toFixed(0).padStart(3, ' ')}  (40%)  ${chalk.dim('— structural integrity')}`,
  );
  lines.push(`  │           ${chalk.dim(scoreToMessage(report.boundaryScore, 'boundary'))}`);
  lines.push(
    `  ├─ context:  ${report.contextScore.toFixed(0).padStart(3, ' ')}  (35%)  ${chalk.dim('— props / state / imports')}`,
  );
  lines.push(`  │           ${chalk.dim(scoreToMessage(report.contextScore, 'context'))}`);
  lines.push(
    `  └─ visual:   ${report.visualScore.toFixed(0).padStart(3, ' ')}  (25%)  ${chalk.dim('— CSS / a11y / layout')}`,
  );
  lines.push(`              ${chalk.dim(scoreToMessage(report.visualScore, 'visual'))}`);

  // Secondary view: Repository Coherence (different formula, opposite direction)
  // v0.14.5j: kept terse. The full formula was confusing — the user
  // asked "what actually is repository coherence?" so the answer
  // should be in the output, not the formula.
  const coherence = report.coherence;
  if (typeof coherence === 'number') {
    const coherenceValue = coherence.toFixed(0).padStart(3, ' ');
    const cohBand = scoreBand(coherence);
    lines.push('');
    lines.push(
      chalk.dim(
        `Repository Coherence: ${coherenceValue} / 100 [${cohBand.label.toUpperCase()}] — ` +
        `higher = better · measures internal consistency. ` +
        `This is a secondary view; the AI Slop Score above is the gate.`,
      ),
    );
  }

  // Sprint 2.3 §2b.1: surface the project-level Bayesian composite
  // aggregate in the pretty report. Previously this lived only as
  // a post-report log line at `persistRun.ts:229-230` (F12 — only
  // visible in stderr, not in --format pretty or --brief). The
  // format mirrors that log line so users see the same
  // `composite=<tier>@<mean>` shape in both places: terse, no
  // prose, gated on the field being present (the v0.18.0-and-
  // earlier shape omits it, so older reports stay backward-compat).
  // We gate on `report.compositeScore` (not `health.compositeScore`,
  // per F13 — the in-memory report shape is the source of truth for
  // what the pretty reporter renders).
  const composite = report.compositeScore;
  if (composite !== undefined) {
    lines.push('');
    lines.push(
      chalk.dim(
        `composite=${composite.tier}@${composite.mean.toFixed(2)} — ` +
        `project-level Bayesian aggregate across ${composite.fileCount} file${composite.fileCount === 1 ? '' : 's'} ` +
        `(max ${composite.max.toFixed(2)}); informational, does not gate CI.`,
      ),
    );
  }
  return lines.join('\n');
}

function formatCoherenceScores(report: ProjectReport): string[] {
  const lines: string[] = [];
  // 3 secondary domain scores (Code Hygiene, Accessibility, Performance)
  // + Business Logic + Security Risk. Each gets:
  //   - a one-line explanation of what it measures
  //   - a `higher = better` (or `inverted`) annotation
  //   - for Security Risk: show BOTH the risk label (CRITICAL/HIGH/...)
  //     AND the inverted numeric score, so the double-inversion
  //     footgun (where the label says "CRITICAL" but the underlying
  //     score is low-because-bad) is no longer confusing.
  const domains: Array<{
    key: keyof ProjectReport;
    label: string;
    measure: string;
    direction: 'higher' | 'lower';
  }> = [
    {
      key: 'codeHygiene',
      label: 'Code Hygiene',
      measure: 'issues per category across arch/logic/layout/component/test',
      direction: 'higher',
    },
    {
      key: 'accessibility',
      label: 'Accessibility',
      measure: 'WCAG violations, ARIA misuse, focus management',
      direction: 'higher',
    },
    {
      key: 'performance',
      label: 'Performance',
      measure: 'render-blocking, N+1 queries, bundle bloat',
      direction: 'higher',
    },
  ];
  for (const { key, label, measure, direction } of domains) {
    const value = report[key];
    if (typeof value === 'number') {
      const padded = value.toString().padStart(3, ' ');
      const arrow = direction === 'higher' ? '↑' : '↓';
      lines.push(
        `${label.padEnd(20)} ${padded}/100  (${arrow} ${direction} = better · ${measure})`,
      );
      // v0.20.0: plain-language message under each score.
      const messageType =
        key === 'codeHygiene' ? 'hygiene' :
        key === 'accessibility' ? 'accessibility' :
        key === 'performance' ? 'performance' :
        'hygiene'; // fallback
      lines.push(`${''.padEnd(20)} ${chalk.dim(scoreToMessage(value, messageType as keyof typeof SCORE_MESSAGES))}`);
    }
  }

  // Business Logic Coherence (existing, separate subcommand).
  const bl = report.businessLogicCoherence;
  if (typeof bl === 'number') {
    const blValue = bl.toString().padStart(3, ' ');
    lines.push(
      `${'Business Logic'.padEnd(20)} ${blValue}/100  (↑ higher = better · tangled dependencies, cyclic imports, god modules)`,
    );
  }

  // AI Security Risk: intentionally CATEGORICAL, not numeric.
  // See src/engine/ai-security-risk.ts lines 4-10: a numeric score
  // invites gaming (suppress the one finding that bumps 79→81);
  // a categorical score is what an engineering manager scans in
  // two seconds, and the single hardcoded API key outranks
  // everything else. The label IS the risk level (LOW / MEDIUM /
  // HIGH / CRITICAL). Previously the rendering was a double-
  // inversion footgun — the label "CRITICAL" was shown without
  // explaining that this is a risk level (worse = more risk = bad),
  // not a score. Now the inversion is explicit in the annotation.
  if (report.aiSecurityRisk) {
    const secLabel = report.aiSecurityRisk.toUpperCase();
    lines.push(
      `${'Security Risk'.padEnd(20)} ${secLabel.padEnd(9)} (↑ higher = better · inverted from risk level · CRITICAL = worst)`,
    );
    // Security score: 100/67/33/0 for low/medium/high/critical.
    // Map categorical risk back to the inverted numeric score for
    // the message lookup.
    const secToScore: Record<string, number> = { low: 100, medium: 67, high: 33, critical: 0 };
    const secNum = secToScore[report.aiSecurityRisk] ?? 0;
    lines.push(`${''.padEnd(20)} ${chalk.dim(scoreToMessage(secNum, 'security'))}`);
  }
  return lines;
}

/**
 * v0.9.2 — Architecture Drift section. Renders the cross-file drift
 * signals: stems that appear as 2+ distinct patterns in the same
 * category (in-category drift) plus stems that span 2+ categories
 * (cross-category drift). This is the user-visible payoff of the
 * "Repository Coherence Scanner" reframe — without this section the
 * visitors are plumbing.
 */
function formatDriftSection(report: ProjectReport): string | null {
  const inCategory = report.crossFileDrift ?? [];
  const cross = report.crossCategoryDrift ?? [];
  if (inCategory.length === 0 && cross.length === 0) return null;

  const lines: string[] = [];
  lines.push(chalk.bold('Architecture Drift'));

  if (inCategory.length === 0) {
    lines.push(chalk.dim('  No within-category drift detected.'));
  } else {
    // Group by category so the output reads naturally (all service drift
    // together, all ormModel drift together).
    const byCategory = new Map<string, typeof inCategory>();
    for (const signal of inCategory) {
      const list = byCategory.get(signal.category) ?? [];
      list.push(signal);
      byCategory.set(signal.category, list);
    }
    // Stable category order — matches the categories enum.
    const categoryOrder = [
      'service',
      'ormModel',
      'route',
      'modal',
      'button',
      'state',
      'dataFetching',
      'api',
    ];
    for (const category of categoryOrder) {
      const signals = byCategory.get(category);
      if (!signals) continue;
      for (const signal of signals) {
        const variantList = signal.variants.join(', ');
        lines.push(
          `  ${chalk.cyan(signal.stem)} pattern (${signal.variants.length} implementations):`,
        );
        lines.push(`    ${chalk.dim('category:')} ${signal.category}`);
        lines.push(`    ${chalk.dim('patterns:')} ${variantList}`);
        for (const file of signal.files.slice(0, 5)) {
          lines.push(`    ${chalk.dim('·')} ${file}`);
        }
        if (signal.files.length > 5) {
          lines.push(
            `    ${chalk.dim(`…and ${signal.files.length - 5} more`)}`,
          );
        }
      }
    }
  }

  if (cross.length > 0) {
    lines.push('');
    lines.push(chalk.bold('Cross-Category Drift'));
    lines.push(
      chalk.dim(
        '  Same conceptual entity realized across multiple roles (e.g. service.User + ormModel.User):',
      ),
    );
    for (const drift of cross) {
      const cats = Object.keys(drift.byCategory).sort();
      const summary = cats
        .map((c) => `${c}: [${drift.byCategory[c]!.join(', ')}]`)
        .join('  ');
      lines.push(`  ${chalk.cyan(drift.stem)}: ${summary}`);
    }
  }

  return lines.join('\n');
}

function formatThresholds(report: ProjectReport): string[] {
  // v0.15.0 U.4+: the Thresholds section is the CI gate — it shows
  // ONLY the AI Slop Score, since that's the gate. The previous
  // version showed Coherence here too, which made the gate look
  // ambiguous.
  //
  // v0.42.0 (user-review fix): the previous code hardcoded a `>= 70`
  // comparison and constant-string "≥ 70" in the display. That
  // direction is the v0.15–v0.20.1 INVERTED reading where aiSlopScore
  // was cleanliness (higher = better). Since v0.21.0, aiSlopScore is
  // raw amount of slop (lower = better) and the gate is "<= meanSlop
  // passes". For the slopbrick repo's config (meanSlop=15, score=25),
  // the old code displayed:
  //
  //   Threshold (CI gate)
  //     AI Slop Score      25.0 ≥ 70  fail
  //
  // which says "we expected ≥ 70 for pass and you got 25, so fail" —
  // the OPPOSITE of the truth. Fix: use report.thresholds.meanSlop
  // and the correct direction.
  const meanSlop = report.thresholds?.meanSlop ?? 30;
  const headline = report.aiSlopScore;
  const passed = headline <= meanSlop;
  const valueText = `${headline.toFixed(1)} ≤ ${meanSlop}`.padStart(12, ' ');
  const status = passed ? chalk.green('pass') : chalk.red('fail');

  const result: string[] = ['Threshold (CI gate)', `  AI Slop Score  ${valueText}  ${status}`];
  return result;
}

function formatTopComponents(components: ComponentScore[], topOffenders?: TopOffender[]): string {
  if (topOffenders && topOffenders.length > 0) {
    const rows = topOffenders.map((offender) => {
      const score = offender.adjustedScore.toFixed(1).padStart(5, ' ');
      const issues = `${offender.issueCount} issue${offender.issueCount === 1 ? '' : 's'}`;
      return `  ${score}  ${issues.padEnd(12)}  ${offender.filePath}`;
    });
    return ['Top offending components (by adjusted score)', ...rows].join('\n');
  }

  const offenders = [...components]
    .sort((a, b) => b.adjustedScore - a.adjustedScore)
    .slice(0, 5);

  if (offenders.length === 0) {
    return '';
  }

  const rows = offenders.map((component) => {
    const score = component.adjustedScore.toFixed(1).padStart(5, ' ');
    return `  ${score}  ${component.filePath}`;
  });

  return ['Top offending components', ...rows].join('\n');
}

function formatIssue(issue: Issue): string {
  const badge = severityBadge(issue.severity);
  const location = issue.filePath
    ? `${issue.filePath}:${issue.line}:${issue.column}`
    : `${issue.line}:${issue.column}`;
  const header = `[${badge}] ${issue.ruleId} · ${location}`;
  // v0.17.1: redact any secrets that may have leaked into the issue
  // message or advice before they reach the terminal.
  const body = `  ${chalk.dim(redactSecrets(issue.message))}`;
  const lines = [header, body];

  if (issue.advice) {
    lines.push(`  ${chalk.cyan('→')} ${redactSecrets(issue.advice)}`);
  }

  return lines.join('\n');
}

export function formatPretty(report: ProjectReport): string {
  const sections: string[] = [];
  const validityNotice = formatScanValidityNotice(report);
  if (validityNotice) sections.push(chalk.bold.yellow(validityNotice));

  // v0.14.5j (P6): plain-language verdict FIRST. The user opens the
  // scan output and the first thing they see is a one-sentence answer
  // to "is my code OK?".
  sections.push(formatVerdict(report));

  // v0.14.5j: tightened summary. "Scanned 95 files" is technical
  // noise — the user came for the score, not the file count. Put
  // it after the verdict where it provides supporting context.
  sections.push(formatSummary(report));

  sections.push(formatCompositeScore(report));

  // v0.14.5j: the secondary domain scores (Code Hygiene, A11y,
  // Performance, Business Logic, Security Risk) used to be in a
  // separate list. They were easy to confuse with the headline.
  // Now grouped under a "Other signals" header that makes it
  // clear these are NOT the gate.
  const coherence = formatCoherenceScores(report);
  if (coherence.length > 0) {
    sections.push(chalk.dim('Other signals (not the gate):') + '\n' + coherence.join('\n'));
  }

  // v0.14.5i (P5): trust-signal — surface the defaultOff suppression
  // count in the main output (not stderr) so the user can see the
  // tool is calibrated.
  const trustSignal = formatDefaultOffSuppression(report);
  if (trustSignal) sections.push(trustSignal);

  // v0.14.5i (P1): per-category breakdown table so the user can see
  // which categories are driving the score without cat'ing health.json.
  sections.push(formatCategoryBreakdown(report));

  // v0.9.2 — Architecture Drift (the user-visible cross-file signal).
  const driftSection = formatDriftSection(report);
  if (driftSection) sections.push(driftSection);

  // v0.14.5j: small-project warning is now a dim footnote, not a
  // yellow alert. It's noise for most users.
  if (report.componentCount > 0 && report.componentCount <= 10) {
    sections.push(
      chalk.dim(
        `note: ${report.componentCount} component${report.componentCount === 1 ? '' : 's'} — per-component averages can be jumpy at this size.`,
      ),
    );
  }

  const componentsSection = formatTopComponents(report.components, report.topOffenders);
  if (componentsSection) {
    sections.push(componentsSection);
  }

  sections.push(...formatThresholds(report));

  if (report.parseErrors && report.parseErrors.length > 0) {
    sections.push(
      chalk.yellow(`Parse errors (${report.parseErrors.length}) — these files were skipped:`),
    );
    for (const { filePath, error } of report.parseErrors) {
      const firstLine = error.split('\n')[0] ?? error;
      sections.push(`  ${filePath}: ${firstLine}`);
    }
    sections.push('');
    sections.push(chalk.dim('Tip: add a path to `exclude` in your config to skip files the parser can\'t handle.'));
  }

  // v0.14.5i (P0): next-step footer with the highest-impact action.
  // Replaces the old "Next step: run --suggest" one-liner with a
  // prioritized list that adapts to the report's actual data.
  sections.push(formatNextStep(report));

  // v0.14.5j: the user asked "what actually is Repository Coherence?"
  // — answer with a one-paragraph footnote so the next person who
  // wonders has the explanation in the output itself, not in a
  // separate doc.
  sections.push(formatScoringExplainer(report));

  // v0.43.0: filter 'off'-severity suppressed issues from the
  // full list. They show in the JSON for tooling but the report
  // shows only what the user can act on.
  const active = report.issues.filter((i) => (i.severity as string) !== 'off');
  if (active.length > 0) {
    sections.push(`Issues (${active.length})`);
    sections.push(...active.map(formatIssue));
  }

  return sections.join('\n\n');
}

/**
 * v0.18.1 — Plain-English explanation of the 4-score model, as a
 * footnote at the bottom of the report. v0.14.5j had a 2-score
 * "Why two scores?" / "docs/scoring-explained.md" footer that
 * contradicted the v0.15.0 split (which produced 4 scores, not 2)
 * and pointed at a file that never existed. The CI gate was also
 * mis-stated (lower = better instead of higher = better). This
 * footnote now matches the v0.17.x 4-score model and the
 * `metrics.ts:302-306` repositoryHealth formula.
 */
function formatScoringExplainer(report: ProjectReport): string {
  // v0.42.0 (user-review fix): the previous version hardcoded a
  // "higher = better" caveat for "AI Slop Score >= 70" — that's the
  // v0.15–v0.20.1 INVERTED reading. Since v0.21.0, aiSlopScore is raw
  // amount of slop and lower = cleaner. Fix: read the actual threshold
  // from the report and use the correct comparison direction.
  const meanSlop = report.thresholds?.meanSlop ?? 30;
  return chalk.dim(
    'Four orthogonal scores (all 0-100, **lower AI Slop Score = cleaner**): ' +
    `AI Slop Score (AI-slop signatures; the CI gate, AI Slop Score ≤ ${meanSlop} passes), ` +
    'Engineering Hygiene (issues per category across arch/logic/layout/component/test; higher = cleaner), ' +
    'Security (AI-flagged security risks, inverted from risk level; higher = cleaner), ' +
    `Repository Health (composite: ${REPOSITORY_HEALTH_FORMULA}). ` +
    'Only AI Slop Score gates CI; the others are informational. ' +
    'Default-off rules (INVERTED/NOISY/DORMANT) are suppressed from the scores automatically.',
  );
}

/**
 * v0.14.5i (P3) — `--why-failing` flag. Renders just the top 5
 * rules that are dragging the score down. Standalone output (does
 * not include the full report) so it's fast to read on a slow
 * terminal.
 */
export function formatWhyFailingReport(report: ProjectReport): string {
  const validityNotice = formatScanValidityNotice(report);
  return validityNotice
    ? `${chalk.bold.yellow(validityNotice)}\n\n${formatWhyFailing(report)}`
    : formatWhyFailing(report);
}

/**
 * v0.14.5j (P10) — `--brief` flag. Terse output for CI / scripts:
 * the verdict, the headline, the threshold, the delta. No category
 * breakdown, no top offenders, no issues dump. Designed to fit
 * in 4-5 lines on a terminal.
 */
export function formatBriefReport(report: ProjectReport): string {
  // v0.17.0: 4-score model (aiSlopScore, engineeringHygiene, security, repositoryHealth).
  // The previous v0.15.0 "AI Slop Score + Coherence" dual-scoring was confusing;
  // the 4-score model shows all 4 orthogonal axes up front.
  const lines: string[] = [];
  const validityNotice = formatScanValidityNotice(report);
  if (validityNotice) {
    lines.push(chalk.bold.yellow(validityNotice));
    lines.push('');
  }

  // One-line verdict
  lines.push(formatVerdict(report));
  lines.push('');

  // 4 named scores, each on its own line with band label.
  // The aiSlopScore line also gets the trajectory delta (↑N cleaner /
  // ↓N worse) since aiSlopScore is the CI gate.
  // v0.17.1: human label first, raw field name in dim — the brief is
  // what users copy-paste into PR comments, so the readable label
  // leads. JSON consumers reading --json get the raw field name
  // unchanged.
  // v0.43.0 (user-review parity with usebrick.dev): each score now
  // includes a one-line "brief" — what the score measures in plain
  // English. Mirrors the calibration section on the website so the
  // CLI output and the marketing site tell the same story. The user
  // can read the brief inline without having to consult the docs
  // to understand what "Engineering Hygiene" or "Repository Health"
  // actually means.
  const scoreLines = HEADLINE_SCORES.map(({ label, field }) => ({
    label,
    field,
    value: report[field],
    brief: SCORE_BRIEFS[field],
  }));
  const deltaSuffix = formatDeltaSuffix(report);
  // v0.42.0 (user-review fix): the 4-score matrix in --brief used
  // scoreBand() for ALL four scores, but aiSlopScore has the
  // INVERTED direction (0=clean, 100=saturated). With score=25 the
  // band was "concerning" (>= 70 inverted to "passing", >= 40 to
  // "needs work", else "concerning"). For the slopbrick repo this
  // showed the headline score 25 with the band "concerning" which
  // is the OPPOSITE of the truth. The fix: route aiSlopScore through
  // slopScoreBand() (the correct band mapping for a cleanliness
  // metric) and the other three through scoreBand() (their direction
  // is unchanged - higher = better).
  scoreLines.forEach(({ label, field, value, brief }, idx) => {
    const band = field === 'aiSlopScore' ? slopScoreBand(value) : scoreBand(value);
    const paddedLabel = label.padEnd(20, ' ');
    const valueStr = formatHeadlineScore(value);
    const delta = idx === 0 ? deltaSuffix : '';
    // Two-line format: first line is "<label> <value> <band> (<field>)",
    // second line is the brief indented under the label. The brief
    // is dimmer so the eye sees the score first and the explanation
    // second.
    lines.push(
      `  ${paddedLabel} ${band.color(valueStr)}   ${chalk.dim(band.label)}  ${chalk.dim.italic(`(${field})`)}${delta}`,
    );
    lines.push(`  ${' '.repeat(20)} ${chalk.dim(brief)}`);
  });

  // Gate info: v0.21.0 — aiSlopScore is raw amount of slop. The CI
  // gate uses the `meanSlop` config (default 30). The gate condition
  // is `aiSlopScore <= meanSlop` (the legacy v0.14 / v0.21+ direction
  // was always "<= meanSlop passes", only v0.15–v0.20.1 had the
  // inverted `>= 70` reading).
  //
  // v0.42.0 (user-review fix): the previous version hardcoded the
  // threshold to 30, which was wrong for users who set a stricter
  // `meanSlop` (e.g. the slopbrick repo itself uses meanSlop=15).
  // For those users, the brief showed "CI gate: AI Slop Score <= 30
  // -> pass" while the actual scan returned exit code 1 with "1
  // threshold failed". The displayed gate and the actual gate
  // disagreed. Fix: read the threshold from the report (always set
  // since v0.21 by project-report.ts), so the brief and the exit
  // code always agree.
  const meanSlop = report.thresholds?.meanSlop ?? 30;
  const passed = report.aiSlopScore <= meanSlop;
  lines.push('');
  lines.push(
    chalk.dim(
      `  CI gate: AI Slop Score <= ${meanSlop} -> ${passed ? chalk.green('pass') : chalk.red('fail')}`,
    ),
  );

  // Suppression trust signal
  const suppressed = report.defaultOffSuppressedCount ?? 0;
  if (suppressed > 0) {
    lines.push('');
    lines.push(
      chalk.green(
        `  ✓ ${suppressed} INVERTED/NOISY issue(s) suppressed from ${report.defaultOffRuleCount ?? 0} default-off rule(s)`,
      ),
    );
  }

  // Footer: where to find more
  lines.push('');
  // v0.43.0: use active count (excludes auto-suppressed issues)
  const active = activeIssueCount(report.issues);
  lines.push(
    chalk.dim(
      `  Scanned ${report.fileCount} file${report.fileCount === 1 ? '' : 's'}, ${active} issue${active === 1 ? '' : 's'}. Re-run without --brief for the full report.`,
    ),
  );
  const basis = formatScoreBasis(report);
  if (basis) lines.push(chalk.dim(`  Score basis: ${basis.slice('Scores use '.length)}`));

  return lines.join('\n');
}
