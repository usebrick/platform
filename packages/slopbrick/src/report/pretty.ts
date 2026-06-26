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
  const coherence = report.coherence;
  const coherenceValue = (coherence ?? 0).toString().padStart(3, ' ');
  const passed = coherence !== undefined && coherence >= 70; // B-grade or better
  const status = passed ? chalk.green('[PASS]') : chalk.red('[FAIL]');

  const lines: string[] = [];
  if (typeof coherence === 'number') {
    lines.push(chalk.bold(`Repository Coherence: ${coherenceValue} / 100 ${status}`));
    lines.push(
      chalk.dim(
        '(v0.9.1 Coherence composite: 0.50 × Arch + 0.30 × (100 − Pattern Fragmentation) + 0.10 × Constitution + 0.10 × AI Debt)',
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
      lines.push(`  ├─ Architecture:   ${bd.architectureConsistency.toFixed(1).padStart(5, ' ')} (Weighted: ${archW})`);
      lines.push(`  ├─ Pattern (inv):  ${fragInv.toFixed(1).padStart(5, ' ')} (Weighted: ${fragW})`);
      lines.push(`  ├─ Constitution:   ${bd.constitutionMapped.toFixed(1).padStart(5, ' ')} (Weighted: ${constW})`);
      lines.push(`  └─ AI Debt:        ${bd.aiDebtMapped.toFixed(1).padStart(5, ' ')} (Weighted: ${debtW})`);
    }
  } else {
    // Fallback to the legacy Slop Index if the Coherence composite wasn't
    // computed (e.g. early abort). Keeps the report informative.
    const slop = report.slopIndex.toFixed(1);
    const slopValue = report.slopIndex.toFixed(1).padStart(5, ' ');
    lines.push(chalk.bold(`Slop Index: ${slopValue} / 100 ${status}`));
    lines.push(
      chalk.dim('(legacy composite — Coherence unavailable; run with full scan to populate)'),
    );
    lines.push(`  Score: ${slop}`);
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
  // For v0.9.1 we report the threshold against the Coherence score; the
  // legacy slop-index field stays for backward compat with --strict.
  const headline = typeof coherence === 'number' ? coherence : report.slopIndex;
  const headlineLabel = typeof coherence === 'number' ? 'Coherence     ' : 'Slop Index   ';
  const passed = headline >= 70;
  const valueText = `${headline.toFixed(1)} ≥ 70`.padStart(12, ' ');
  const status = passed ? chalk.green('pass') : chalk.red('fail');

  const result: string[] = ['Thresholds', `  ${headlineLabel}${valueText}  ${status}`];
  if (!passed) {
    result.push('');
    result.push(
      'Next step: run `slopbrick scan --suggest` to see fixes, or `slopbrick scan --baseline` to accept today\'s scores as the new baseline.',
    );
  } else {
    result.push('');
    result.push(chalk.green('All thresholds passed.'));
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

  if (report.issues.length > 0) {
    sections.push(`Issues (${report.issues.length})`);
    sections.push(...report.issues.map(formatIssue));
  }

  return sections.join('\n\n');
}
