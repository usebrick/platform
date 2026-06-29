import chalk from 'chalk';
import type {
  ComponentScore,
  Issue,
  ProjectReport,
  Severity,
  TopOffender,
} from '../types.js';

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
    counts[issue.severity] += 1;
  }
  return counts;
}

function pluralize(count: number, word: string): string {
  return `${count} ${word}${count === 1 ? '' : 's'}`;
}

function formatSummary(report: ProjectReport): string {
  const counts = countBySeverity(report.issues);
  const fileCount = report.fileCount;
  const base = `Scanned ${pluralize(fileCount, 'file')}, ${pluralize(report.componentCount, 'component')}, ${pluralize(report.issues.length, 'issue')} (high: ${counts.high}, medium: ${counts.medium}, low: ${counts.low})`;
  // v0.10.1: PR Slop Score header for --diff <ref> mode (VibeDrift-compatible).
  if (report.prSlopScore !== undefined) {
    return `${base}\nComparing against \`${report.diffRef ?? 'HEAD~'}\`: PR Slop Score = ${report.prSlopScore}`;
  }
  return base;
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
 */
function scoreBand(score: number): { label: string; color: (s: string) => string } {
  if (score >= 90) return { label: 'excellent', color: chalk.green };
  if (score >= 70) return { label: 'passing', color: chalk.green };
  if (score >= 40) return { label: 'needs work', color: chalk.yellow };
  return { label: 'concerning', color: chalk.red };
}

/**
 * v0.14.5j (P9) — Trajectory delta. Returns a short string like
 * "  ↓3 (cleaner)" or "  ↑5 (worse)" to append to the headline.
 * Returns empty string when no previous run exists.
 *
 * Color: green for improvement (lower = better, so negative delta
 * is good), red for regression. Yellow for no change. A tiny
 * change (±0.5) is treated as noise and not shown.
 */
function formatDeltaSuffix(report: ProjectReport): string {
  if (typeof report.previousSlopIndex !== 'number') return '';
  // v0.15.0 U.4+: slopIndex → aiQuality (higher is better; sign
  // conventions for the arrow flip accordingly).
  const delta = report.aiQuality - report.previousSlopIndex;
  if (Math.abs(delta) < 0.5) return ''; // noise floor
  const arrow = delta < 0 ? '↓' : '↑';
  const absDelta = Math.abs(delta).toFixed(0);
  // aiQuality higher = better; delta > 0 means improved → show as
  // "cleaner" with a down-arrow (consistent with the v0.14.5j
  // convention of down = good).
  const word = delta > 0 ? 'cleaner' : 'worse';
  const color = delta > 0 ? chalk.green : chalk.red;
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
  // v0.15.0 U.4+: slopIndex → aiQuality (0-100, higher is better).
  const score = report.aiQuality;
  const band = scoreBand(score);

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

  // Add the why-failing hint when failing. v0.15.0 U.4+: use
  // aiQuality (the SINGLE headline number, not coherence).
  if (report.aiQuality < 70) {
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

  // v0.15.0 U.4+: use aiQuality (the SINGLE headline number).
  const headline = report.aiQuality;
  const status = headline >= 70 ? 'PASS' : 'FAIL';
  const colorize = headline >= 70 ? chalk.green : chalk.red;
  const lines: string[] = [];
  lines.push(colorize.bold(`Headline score: ${headline.toFixed(0)}/100 (${status} — below 70)`));
  lines.push('');
  lines.push(chalk.bold('Top 5 rules dragging the score down:'));
  for (let i = 0; i < ranked.length; i++) {
    const [ruleId, info] = ranked[i]!;
    const fileCount = info.files.size;
    const fileHint = fileCount > 0 ? ` across ${fileCount} file${fileCount === 1 ? '' : 's'}` : '';
    const catShort = CATEGORY_GLOSSARY[info.count > 0 ? '' : '']?.short;
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
  // v0.15.0 U.4+: aiQuality is the SINGLE headline number, matching
  // what the user sees in .slopbrick/health.json. The Repository
  // Coherence composite is shown as a secondary line so the two
  // views are consistent.
  //
  // v0.14.5j (P8): replaced [PASS]/[FAIL] with plain-language band
  // labels (excellent / passing / needs work / concerning).
  //
  // v0.15.0 U.4+: aiQuality is higher-is-better (the opposite of
  // the legacy slopIndex direction). The band label / color already
  // encode this.
  //
  // v0.14.5j (P9): trajectory delta "±N from last run" appended to
  // the headline so the user can see the trend without grep'ing
  // the run log.
  const slop = report.aiQuality;
  const slopValue = slop.toFixed(0).padStart(3, ' ');
  const band = scoreBand(slop);
  const status = chalk.bold(`[${band.label.toUpperCase()}]`);

  const lines: string[] = [];
  const deltaSuffix = formatDeltaSuffix(report);
  lines.push(
    chalk.bold(`AI Quality: ${slopValue} / 100 ${band.color(status)}${deltaSuffix}`),
  );
  lines.push(
    chalk.dim(
      'higher = better · measures AI-slop signatures. The same number in .slopbrick/health.json.',
    ),
  );

  // Show the subscore breakdown with plain-language labels
  lines.push(
    `  ├─ boundary: ${report.boundaryScore.toFixed(0).padStart(3, ' ')}  (40%)  ${chalk.dim('— structural integrity')}`,
  );
  lines.push(
    `  ├─ context:  ${report.contextScore.toFixed(0).padStart(3, ' ')}  (35%)  ${chalk.dim('— props / state / imports')}`,
  );
  lines.push(
    `  └─ visual:   ${report.visualScore.toFixed(0).padStart(3, ' ')}  (25%)  ${chalk.dim('— CSS / a11y / layout')}`,
  );

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
        `This is a secondary view; the Slop Index above is the gate.`,
      ),
    );
  }
  return lines.join('\n');
}

function formatCoherenceScores(report: ProjectReport): string[] {
  const lines: string[] = [];
  // 3 secondary domain scores (Code Hygiene, Accessibility, Performance).
  // These roll up the supporting rules into standalone numbers.
  const domains: Array<{ key: keyof ProjectReport; label: string }> = [
    { key: 'codeHygiene', label: 'Code Hygiene' },
    { key: 'accessibility', label: 'Accessibility' },
    { key: 'performance', label: 'Performance' },
  ];
  for (const { key, label } of domains) {
    const value = report[key];
    if (typeof value === 'number') {
      const padded = value.toString().padStart(3, ' ');
      lines.push(`${label.padEnd(20)} ${padded}/100`);
    }
  }

  // Keep Business Logic Coherence (existing, separate subcommand).
  const bl = report.businessLogicCoherence;
  if (typeof bl === 'number') {
    const blValue = bl.toString().padStart(3, ' ');
    lines.push(`${'Business Logic'.padEnd(20)} ${blValue}/100`);
  }

  // AI Security Risk remains categorical (existing).
  if (report.aiSecurityRisk) {
    const secValue = report.aiSecurityRisk.toUpperCase().padEnd(3, ' ');
    lines.push(`${'Security Risk'.padEnd(20)} ${secValue}`);
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
  // ONLY the AI Quality score, since that's the gate. The previous
  // version showed Coherence here too, which made the gate look
  // ambiguous.
  const limit = report.thresholds.meanSlop; // legacy field; not used anymore
  const headline = report.aiQuality;
  const passed = headline >= 70;
  const valueText = `${headline.toFixed(1)} ≥ 70`.padStart(12, ' ');
  const status = passed ? chalk.green('pass') : chalk.red('fail');

  const result: string[] = ['Threshold (CI gate)', `  AI Quality  ${valueText}  ${status}`];
  // legacy limit reference (silence unused-variable lint without removing the field)
  void limit;
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
  const body = `  ${chalk.dim(issue.message)}`;
  const lines = [header, body];

  if (issue.advice) {
    lines.push(`  ${chalk.cyan('→')} ${issue.advice}`);
  }

  return lines.join('\n');
}

export function formatPretty(report: ProjectReport): string {
  const sections: string[] = [];

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

  if (report.issues.length > 0) {
    sections.push(`Issues (${report.issues.length})`);
    sections.push(...report.issues.map(formatIssue));
  }

  return sections.join('\n\n');
}

/**
 * v0.14.5j — Plain-English explanation of the two scores, as a
 * footnote at the bottom of the report. The user asked
 * "what actually is repository coherence?" so the answer is
 * in the output itself.
 */
function formatScoringExplainer(_report: ProjectReport): string {
  return chalk.dim(
    'Why two scores? The Slop Index measures AI-slop signatures ' +
    '(lower = better, this is the CI gate). The Repository Coherence ' +
    'measures internal consistency (higher = better, informational). ' +
    'A codebase can be hand-written AND inconsistent (low Slop, low Coherence) ' +
    'or AI-generated AND consistent (high Slop, high Coherence). ' +
    'See docs/scoring-explained.md for the full math.',
  );
}

/**
 * v0.14.5i (P3) — `--why-failing` flag. Renders just the top 5
 * rules that are dragging the score down. Standalone output (does
 * not include the full report) so it's fast to read on a slow
 * terminal.
 */
export function formatWhyFailingReport(report: ProjectReport): string {
  return formatWhyFailing(report);
}

/**
 * v0.14.5j (P10) — `--brief` flag. Terse output for CI / scripts:
 * the verdict, the headline, the threshold, the delta. No category
 * breakdown, no top offenders, no issues dump. Designed to fit
 * in 4-5 lines on a terminal.
 */
export function formatBriefReport(report: ProjectReport): string {
  // v0.15.0 U.4+: slopIndex → aiQuality.
  const slop = report.aiQuality;
  const band = scoreBand(slop);
  const passed = slop >= 70;
  const deltaSuffix = formatDeltaSuffix(report);
  const lines: string[] = [];

  // One-line verdict
  lines.push(formatVerdict(report));
  lines.push('');
  // Headline + threshold
  lines.push(
    `AI Quality: ${slop.toFixed(0)}/100 ${chalk.bold(`[${band.label.toUpperCase()}]`)}${deltaSuffix} ` +
    `(threshold 70: ${passed ? chalk.green('pass') : chalk.red('fail')})`,
  );

  // Coherence as a one-line secondary, only if computed
  if (typeof report.coherence === 'number') {
    const cohBand = scoreBand(report.coherence);
    lines.push(chalk.dim(
      `Coherence:  ${report.coherence.toFixed(0)}/100 [${cohBand.label.toUpperCase()}] (informational)`,
    ));
  }

  // Suppression trust signal
  const suppressed = report.defaultOffSuppressedCount ?? 0;
  if (suppressed > 0) {
    lines.push(chalk.green(`✓ ${suppressed} INVERTED/NOISY issue(s) suppressed`));
  }

  return lines.join('\n');
}
