// Per-section renderers for the HTML reporter. Each function takes a
// ProjectReport and returns the HTML string for one report section.
//
// Composition order is fixed by ../html.ts (formatHtml entry point):
//
//   header → thresholds → category → top-offenders →
//   files → issues → parse-errors
//
// Helpers (escape, count, class names, signal badge) live in ./utils.ts.
// Static assets (CSS, JS) live in ./static.ts.

import type { Category, ComponentScore, Issue, ProjectReport, Severity } from '../../types.js';
import {
  categoryLabels,
  severityOrder,
  escapeHtml,
  countBySeverity,
  countByCategory,
  issuesForFile,
  severityClass,
  thresholdStatusClass,
  renderSignalBadge,
} from './utils.js';

function renderHeader(report: ProjectReport): string {
  const counts = countBySeverity(report.issues);
  const roundedSlop = Math.round(report.slopIndex);
  const roundedHealth = Math.round(report.assemblyHealth);
  const passed = report.slopIndex <= report.thresholds.meanSlop;
  const boundaryWeighted = (report.boundaryScore * 0.40).toFixed(1);
  const contextWeighted = (report.contextScore * 0.35).toFixed(1);
  const visualWeighted = (report.visualScore * 0.25).toFixed(1);

  return `
  <header class="report-header">
    <div class="header-title">
      <h1>slopbrick report</h1>
      <p class="meta">Version ${escapeHtml(report.version)} · Generated at ${escapeHtml(report.generatedAt)}</p>
    </div>
    <div class="score-cards">
      <div class="score-card coherence">
        <span class="score-value">${report.coherence ?? '–'}</span>
        <span class="score-label">Repository Coherence ${report.coherence !== undefined ? (report.coherence >= 70 ? '[PASS]' : '[FAIL]') : ''}</span>
      </div>
      <div class="score-card slop-index">
        <span class="score-value">${roundedSlop}</span>
        <span class="score-label">Slop Index (informational)</span>
      </div>
      <div class="score-card health">
        <span class="score-value">${roundedHealth}</span>
        <span class="score-label">Assembly Health</span>
      </div>
      <div class="score-card boundary">
        <span class="score-value">${report.boundaryScore.toFixed(1)}</span>
        <span class="score-label">Boundary (×0.40 = ${boundaryWeighted})</span>
      </div>
      <div class="score-card context">
        <span class="score-value">${report.contextScore.toFixed(1)}</span>
        <span class="score-label">Context (×0.35 = ${contextWeighted})</span>
      </div>
      <div class="score-card visual">
        <span class="score-value">${report.visualScore.toFixed(1)}</span>
        <span class="score-label">Visual (×0.25 = ${visualWeighted})</span>
      </div>
    </div>
    <div class="severity-counts">
      ${severityOrder
        .map(
          (severity: Severity) => `
        <span class="severity-badge ${severityClass(severity)}">
          ${escapeHtml(counts[severity])} ${severity}
        </span>
      `,
        )
        .join('')}
    </div>
  </header>`;
}

function renderThresholds(report: ProjectReport): string {
  const slop = report.slopIndex;
  const limit = report.thresholds.meanSlop;
  const failed = slop > limit;

  return `
  <section class="thresholds-section">
    <h2>Thresholds</h2>
    <table class="data-table thresholds-table">
      <thead>
        <tr>
          <th data-sort="string">Metric</th>
          <th data-sort="number">Value / Limit</th>
          <th data-sort="string">Status</th>
        </tr>
      </thead>
      <tbody>
        <tr>
          <td>Composite Slop Index</td>
          <td>${slop.toFixed(1)} / ${limit}</td>
          <td><span class="status-badge ${thresholdStatusClass(failed)}">${failed ? 'fail' : 'pass'}</span></td>
        </tr>
      </tbody>
    </table>
  </section>`;
}

interface CategoryRow {
  category: Category;
  score: number;
  count: number;
}

function renderCategoryBreakdown(report: ProjectReport): string {
  const categoryCounts = countByCategory(report.issues);
  const rows = (Object.entries(report.categoryScores) as [Category, number][])
    .map(([category, score]: [Category, number]) => ({ category, score, count: categoryCounts[category] }))
    .filter(({ score, count }: CategoryRow) => score > 0 || count > 0)
    .sort((a: CategoryRow, b: CategoryRow) => b.score - a.score);

  const maxScore = Math.max(...rows.map((r: CategoryRow) => r.score), 1);

  const tableRows = rows
    .map(({ category, score, count }: CategoryRow) => {
      const width = Math.round((score / maxScore) * 100);
      return `
      <tr data-category="${escapeHtml(category)}">
        <td>${escapeHtml(categoryLabels[category])}</td>
        <td data-sort="number">${score.toFixed(1)}</td>
        <td data-sort="number">${count}</td>
        <td>
          <div class="bar-track">
            <div class="bar-fill" style="width: ${width}%" aria-label="${score.toFixed(1)} points"></div>
          </div>
        </td>
      </tr>
    `;
    })
    .join('');

  return `
  <section class="category-section">
    <h2>Category breakdown</h2>
    <table class="data-table category-table" id="category-table">
      <thead>
        <tr>
          <th data-sort="string">Category</th>
          <th data-sort="number">Score</th>
          <th data-sort="number">Issues</th>
          <th>Distribution</th>
        </tr>
      </thead>
      <tbody>
        ${tableRows || '<tr><td colspan="4">No category scores to display.</td></tr>'}
      </tbody>
    </table>
  </section>`;
}

function renderTopOffenders(report: ProjectReport): string {
  if (!report.topOffenders || report.topOffenders.length === 0) return '';
  const rows = report.topOffenders
    .map((offender) => `
      <tr>
        <td>${escapeHtml(offender.filePath)}</td>
        <td data-sort="number">${offender.adjustedScore.toFixed(1)}</td>
        <td data-sort="number">${offender.issueCount}</td>
      </tr>`)
    .join('');
  return `
  <section class="top-offenders-section">
    <h2>Top offenders (by adjusted score)</h2>
    <table class="data-table top-offenders-table">
      <thead>
        <tr>
          <th data-sort="string">File</th>
          <th data-sort="number">Adjusted score</th>
          <th data-sort="number">Issues</th>
        </tr>
      </thead>
      <tbody>
        ${rows}
      </tbody>
    </table>
  </section>`;
}

function renderFiles(report: ProjectReport): string {
  const sortedComponents = [...report.components].sort(
    (a: ComponentScore, b: ComponentScore) => b.adjustedScore - a.adjustedScore,
  );

  const rows = sortedComponents
    .map((component: ComponentScore, index: number) => {
      const fileIssues = issuesForFile(report.issues, component.filePath);
      const issueRows = fileIssues
        .map(
          (issue: Issue) => `
        <tr class="issue-subrow severity-${issue.severity}" data-severity="${issue.severity}" data-category="${issue.category}">
          <td><span class="severity-pill ${severityClass(issue.severity)}">${issue.severity}</span></td>
          <td>${escapeHtml(categoryLabels[issue.category])}</td>
          <td>${escapeHtml(issue.ruleId)}</td>
          <td>${issue.line}:${issue.column}</td>
          <td>${escapeHtml(issue.message)}</td>
        </tr>
      `,
        )
        .join('');

      return `
      <tr class="file-row" data-index="${index}">
        <td class="expand-toggle" data-expand="${index}">▶</td>
        <td>${escapeHtml(component.filePath)}</td>
        <td data-sort="number">${component.rawScore.toFixed(1)}</td>
        <td data-sort="number">${component.componentScore.toFixed(1)}</td>
        <td data-sort="number">${component.adjustedScore.toFixed(1)}</td>
      </tr>
      <tr class="file-issues hidden" data-expand-target="${index}">
        <td colspan="5">
          <div class="file-issues-inner">
            <table class="data-table nested-table">
              <thead>
                <tr>
                  <th>Severity</th>
                  <th>Category</th>
                  <th>Rule</th>
                  <th>Line</th>
                  <th>Message</th>
                </tr>
              </thead>
              <tbody>
                ${issueRows || '<tr><td colspan="5">No issues in this file.</td></tr>'}
              </tbody>
            </table>
          </div>
        </td>
      </tr>
    `;
    })
    .join('');

  return `
  <section class="files-section">
    <h2>Files (${report.components.length})</h2>
    <table class="data-table files-table" id="files-table">
      <thead>
        <tr>
          <th class="expand-header"></th>
          <th data-sort="string">File</th>
          <th data-sort="number">Raw score</th>
          <th data-sort="number">Component score</th>
          <th data-sort="number">Adjusted score</th>
        </tr>
      </thead>
      <tbody>
        ${rows || '<tr><td colspan="5">No files scanned.</td></tr>'}
      </tbody>
    </table>
  </section>`;
}

function renderIssues(report: ProjectReport): string {
  const categories = [...new Set(report.issues.map((issue: Issue) => issue.category))].sort();

  const severityFilters = severityOrder
    .map(
      (severity: Severity) => `
    <button class="filter-btn severity-filter ${severityClass(severity)}" data-severity="${severity}" data-active="true">
      ${severity}
    </button>
  `,
    )
    .join('');

  const categoryFilters = categories
    .map(
      (category: Category) => `
    <button class="filter-btn category-filter" data-category="${category}" data-active="true">
      ${escapeHtml(categoryLabels[category] ?? category)}
    </button>
  `,
    )
    .join('');

  const rows = report.issues
    .map((issue: Issue, index: number) => {
      const file = issue.filePath ?? '-';
      const adviceRow = issue.advice
        ? `
        <tr class="advice-row hidden" data-advice-target="${index}">
          <td colspan="6">
            <div class="advice-box">
              <strong>Advice:</strong> ${escapeHtml(issue.advice)}
            </div>
          </td>
        </tr>
      `
        : '';

      return `
      <tr class="issue-row severity-${issue.severity}" data-severity="${issue.severity}" data-category="${issue.category}" data-index="${index}">
        <td><span class="severity-pill ${severityClass(issue.severity)}">${issue.severity}</span></td>
        <td>${escapeHtml(categoryLabels[issue.category])}</td>
        <td>${escapeHtml(issue.ruleId)}${issue.signalStrength ? renderSignalBadge(issue.signalStrength) : ''}</td>
        <td>${escapeHtml(file)}</td>
        <td data-sort="number">${issue.line}</td>
        <td class="expand-advice ${issue.advice ? 'has-advice' : ''}" data-advice="${issue.advice ? index : ''}">
          ${escapeHtml(issue.message)}
          ${issue.advice ? '<span class="advice-hint"> (click for advice)</span>' : ''}
        </td>
      </tr>
      ${adviceRow}
    `;
    })
    .join('');

  return `
  <section class="issues-section">
    <h2>Issues (${report.issues.length})</h2>
    <div class="filters">
      <div class="filter-group">
        <span class="filter-label">Severity:</span>
        <button class="filter-btn severity-filter all-filter" data-severity="all" data-active="true">all</button>
        ${severityFilters}
      </div>
      <div class="filter-group">
        <span class="filter-label">Category:</span>
        <button class="filter-btn category-filter all-filter" data-category="all" data-active="true">all</button>
        ${categoryFilters}
      </div>
    </div>
    <table class="data-table issues-table" id="issues-table">
      <thead>
        <tr>
          <th data-sort="string">Severity</th>
          <th data-sort="string">Category</th>
          <th data-sort="string">Rule</th>
          <th data-sort="string">File</th>
          <th data-sort="number">Line</th>
          <th data-sort="string">Message</th>
        </tr>
      </thead>
      <tbody>
        ${rows || '<tr><td colspan="6">No issues found.</td></tr>'}
      </tbody>
    </table>
  </section>`;
}

function renderParseErrors(report: ProjectReport): string {
  if (!report.parseErrors || report.parseErrors.length === 0) {
    return '';
  }

  const rows = report.parseErrors
    .map(
      ({ filePath, error }: { filePath: string; error: string }) => `
      <tr>
        <td>${escapeHtml(filePath)}</td>
        <td>${escapeHtml(error.split('\n')[0] ?? error)}</td>
      </tr>
    `,
    )
    .join('');

  return `
  <section class="parse-errors-section">
    <h2>Parse errors (${report.parseErrors.length})</h2>
    <table class="data-table parse-errors-table">
      <thead>
        <tr>
          <th>File</th>
          <th>Error</th>
        </tr>
      </thead>
      <tbody>
        ${rows}
      </tbody>
    </table>
  </section>`;
}

export {
  renderHeader,
  renderThresholds,
  renderCategoryBreakdown,
  renderTopOffenders,
  renderFiles,
  renderIssues,
  renderParseErrors,
};