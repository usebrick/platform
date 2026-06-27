// Small data helpers + shared constants for the HTML reporter.
// Kept separate from ./sections so section renderers can import them
// without dragging the section list with them.

import type { Category, Issue, Severity } from '../../types.js';

const categoryLabels: Record<Category, string> = {
  visual: 'Visual',
  typo: 'Typography',
  wcag: 'Accessibility',
  layout: 'Layout',
  component: 'Component',
  logic: 'Logic',
  arch: 'Architecture',
  perf: 'Performance',
  security: 'Security',
  test: 'Test Quality',
  docs: 'Documentation',
  db: 'Database',
  ai: 'AI Indicators',
  context: 'Context',
  product: 'Product',
  i18n: 'I18n',
};

const severityOrder: Severity[] = ['high', 'medium', 'low'];

function escapeHtml(value: unknown): string {
  const text = value === null || value === undefined ? '' : String(value);
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function countBySeverity(issues: Issue[]): Record<Severity, number> {
  const counts: Record<Severity, number> = { low: 0, medium: 0, high: 0 };
  for (const issue of issues) {
    counts[issue.severity] += 1;
  }
  return counts;
}

function countByCategory(issues: Issue[]): Record<Category, number> {
  const counts: Record<Category, number> = {
    visual: 0,
    typo: 0,
    wcag: 0,
    layout: 0,
    component: 0,
    logic: 0,
    arch: 0,
    perf: 0,
    security: 0,
    test: 0,
    docs: 0,
    db: 0,
    ai: 0,
    context: 0,
    product: 0,
    i18n: 0,
  };
  for (const issue of issues) {
    counts[issue.category] += 1;
  }
  return counts;
}

function issuesForFile(issues: Issue[], filePath: string): Issue[] {
  return issues.filter((issue: Issue) => issue.filePath === filePath);
}

function severityClass(severity: Severity): string {
  return `severity-${severity}`;
}

function thresholdStatusClass(failed: boolean): string {
  return failed ? 'status-fail' : 'status-pass';
}

// Color codes: green for reliable signals (precision >= 0.5 AND recall >=
// 0.1), red for unreliable, muted for partial data.
function renderSignalBadge(strength: Issue['signalStrength']): string {
  if (!strength) return '';
  const reliable = strength.precision >= 0.5 && strength.recall >= 0.1;
  const cls = reliable ? 'signal-badge signal-ok' : 'signal-badge signal-warn';
  const pct = (strength.precision * 100).toFixed(0);
  const recall = (strength.recall * 100).toFixed(0);
  return ` <span class="${cls}" title="precision ${pct}% · recall ${recall}%">P${pct}/R${recall}</span>`;
}

export {
  categoryLabels,
  severityOrder,
  escapeHtml,
  countBySeverity,
  countByCategory,
  issuesForFile,
  severityClass,
  thresholdStatusClass,
  renderSignalBadge,
};