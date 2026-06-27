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
    return chalk.dim('Category breakdown: no active categories (clean codebase).');
  }

  const max = entries[0]?.[1] ?? 1;
  const barWidth = 20;
  const lines: string[] = [];
  lines.push(chalk.bold('Category breakdown:'));
  const shown = entries.slice(0, topN);
  for (const [category, score] of shown) {
    const padded = category.padEnd(10, ' ');
    const valueStr = score.toFixed(0).padStart(6, ' ');
    const filled = Math.round((score / max) * barWidth);
    const bar = '█'.repeat(filled) + '░'.repeat(barWidth - filled);
    lines.push(`  ${padded} ${chalk.cyan(bar)} ${valueStr}`);
  }
  if (entries.length > topN) {
    lines.push(chalk.dim(`  +${entries.length - topN} more active categories`));
  }
  const inactive = Object.values(scores).filter((s) => s === 0).length;
  if (inactive > 0) {
    lines.push(chalk.dim(`  ${inactive} categories not applicable`));
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

  // Add the why-failing hint when failing
  const headline = typeof report.coherence === 'number' ? report.coherence : report.slopIndex;
  if (headline < 70) {
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
  // Aggregate per-rule weighted impact: sum(severity_weight × count)
  // for each active rule. Sort descending. This is the same math
  // the headline slopIndex uses, so the top entries here are the
  // rules with the most "lift" against the project.
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

  const headline = typeof report.coherence === 'number' ? report.coherence : report.slopIndex;
  const lines: string[] = [];
  lines.push(chalk.bold(`Headline score: ${headline.toFixed(0)}/100 (FAIL — below 70)`));
  lines.push('');
  lines.push(chalk.bold('Top 5 rules dragging the score down:'));
  for (let i = 0; i < ranked.length; i++) {
    const [ruleId, info] = ranked[i]!;
    const fileCount = info.files.size;
    const fileHint = fileCount > 0 ? ` across ${fileCount} file${fileCount === 1 ? '' : 's'}` : '';
    lines.push(
      `  ${i + 1}. ${chalk.cyan(ruleId)} — ${info.count} fire${info.count === 1 ? '' : 's'}${fileHint} (${info.points} weighted points)`,
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
 * Composite: 0.50 × Architecture Consistency + 0.30 × (100 − Pattern
 * Fragmentation) + 0.10 × Constitution Mapped + 0.10 × AI Debt Mapped.
 *
 * The Slop Index remains in the report as an informational value (it's
 * the per-rule aggregate of the supporting rules), but it is no longer
 * the headline — the lens is now "did this code introduce a new pattern
 * when an existing pattern already existed?", and the Slop Index was
 * averaging rules that don't fit that lens.
 */
const COHERENCE_WEIGHTS = {
  architectureConsistency: 0.50,
  patternFragmentation: 0.30,
  constitutionMapped: 0.10,
  aiDebtMapped: 0.10,
} as const;

function formatCompositeScore(report: ProjectReport): string {
  // v0.14.5i (P4): the slopIndex is now the SINGLE headline number,
  // matching what the user sees in .slopbrick/health.json. The
  // Repository Coherence composite is shown as a secondary line so
  // the two views are consistent.
  const slop = report.slopIndex;
  const slopValue = slop.toFixed(0).padStart(3, ' ');
  const passed = slop >= 70;
  const status = passed ? chalk.green('[PASS]') : chalk.red('[FAIL]');

  const lines: string[] = [];
  lines.push(chalk.bold(`Slop Index: ${slopValue} / 100 ${status}`));
  lines.push(
    chalk.dim(
      '(composite: 0.40 × boundary + 0.35 × context + 0.25 × visual; this is the same number in health.json)',
    ),
  );

  // Show the subscore breakdown
  lines.push(
    `  ├─ boundary: ${report.boundaryScore.toFixed(0).padStart(3, ' ')}  (40%)`,
  );
  lines.push(
    `  ├─ context:  ${report.contextScore.toFixed(0).padStart(3, ' ')}  (35%)`,
  );
  lines.push(
    `  └─ visual:   ${report.visualScore.toFixed(0).padStart(3, ' ')}  (25%)`,
  );

  // Secondary view: Repository Coherence (different formula)
  const coherence = report.coherence;
  if (typeof coherence === 'number') {
    const coherenceValue = coherence.toFixed(0).padStart(3, ' ');
    const coherenceStatus = coherence >= 70 ? chalk.green('[PASS]') : chalk.red('[FAIL]');
    lines.push('');
    lines.push(
      chalk.dim(
        `Repository Coherence: ${coherenceValue} / 100 ${coherenceStatus} ` +
          `(secondary view: 0.50 × Arch + 0.30 × (100 − Pattern Fragmentation) + 0.10 × Constitution + 0.10 × AI Debt)`,
      ),
    );
    const bd = report.coherenceBreakdown;
    const weights = report.coherenceWeights ?? COHERENCE_WEIGHTS;
    if (bd) {
      const archW = (bd.architectureConsistency * weights.architectureConsistency).toFixed(1);
      const fragInv = bd.patternFragmentation;
      const fragW = (fragInv * weights.patternFragmentation).toFixed(1);
      const constW = (bd.constitutionMapped * weights.constitutionMapped).toFixed(1);
      const debtW = (bd.aiDebtMapped * weights.aiDebtMapped).toFixed(1);
      lines.push(chalk.dim(
        `  ├─ Architecture:   ${bd.architectureConsistency.toFixed(1).padStart(5, ' ')} (Weighted: ${archW})`,
      ));
      lines.push(chalk.dim(
        `  ├─ Pattern (inv):  ${fragInv.toFixed(1).padStart(5, ' ')} (Weighted: ${fragW})`,
      ));
      lines.push(chalk.dim(
        `  ├─ Constitution:   ${bd.constitutionMapped.toFixed(1).padStart(5, ' ')} (Weighted: ${constW})`,
      ));
      lines.push(chalk.dim(
        `  └─ AI Debt:        ${bd.aiDebtMapped.toFixed(1).padStart(5, ' ')} (Weighted: ${debtW})`,
      ));
    }
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
  const coherence = report.coherence;
  const limit = report.thresholds.meanSlop; // legacy field; not used for Coherence
  // v0.14.5i: the slopIndex is the SINGLE headline number (matches the
  // health.json). The Repository Coherence composite is shown as
  // secondary context below. This unifies the scoring direction (one
  // number, one direction) so the user can read the CLI and the
  // health.json and see the same thing.
  const headline = report.slopIndex;
  const headlineLabel = 'Slop Index  ';
  const passed = headline >= 70;
  const valueText = `${headline.toFixed(1)} ≥ 70`.padStart(12, ' ');
  const status = passed ? chalk.green('pass') : chalk.red('fail');

  const result: string[] = ['Thresholds', `  ${headlineLabel}${valueText}  ${status}`];
  if (typeof coherence === 'number') {
    result.push(
      chalk.dim(
        `  Coherence  ${coherence.toFixed(1).padStart(5, ' ')} / 100  (secondary view, different formula)`,
      ),
    );
  }
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

  sections.push(formatSummary(report));

  sections.push(formatCompositeScore(report));

  const coherence = formatCoherenceScores(report);
  if (coherence.length > 0) {
    sections.push(coherence.join('\n'));
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

  if (report.componentCount <= 10) {
    sections.push(
      chalk.yellow(
        'Small project (10 or fewer components). Averages can be jumpy at this size—focus on individual file scores.',
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

  if (report.issues.length > 0) {
    sections.push(`Issues (${report.issues.length})`);
    sections.push(...report.issues.map(formatIssue));
  }

  return sections.join('\n\n');
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
