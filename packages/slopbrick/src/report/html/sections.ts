// Per-section renderers for the HTML reporter. Each function takes a
// ProjectReport and returns the HTML string for one report section.
//
// Composition order is fixed by ../html.ts (formatHtml entry point):
//
//   header → thresholds → repository-health (4 named scores) → buckets →
//   category → top-offenders → files → issues → parse-errors
//
// Helpers (escape, count, class names, signal badge) live in ./utils.ts.
// Static assets (CSS, JS) live in ./static.ts.

import type { Verdict } from '@usebrick/core';
import type { Category, ComponentScore, Issue, ProjectReport, Severity } from '../../types';
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
import { bucketForVerdict, bucketDistribution } from '../buckets.js';
import { SCORE_BRIEFS, formatHeadlineScore } from '../score-contract.js';

function renderHeader(report: ProjectReport): string {
  const counts = countBySeverity(report.issues);
  const roundedHealth = Math.round(report.assemblyHealth);

  // v0.15.0+: 4 named scores replace the single `slopIndex`.
  // `repositoryHealth` is the only one already on `ProjectReport` — the
  // other three (aiSlopScore, engineeringHygiene, security) live on the new
  // composite object that U.5 introduces. Until U.5 lands, we cast
  // through `unknown` so the typecheck stays clean while the HTML
  // surfaces the new labels.
  const namedScores = extractNamedScores(report);

  return `
  <header class="report-header">
    <div class="header-title">
      <h1>slopbrick report</h1>
      <p class="meta">Version ${escapeHtml(report.version)} · Generated at ${escapeHtml(report.generatedAt)}</p>
      ${report.scoreBasis ? `<p class="meta">Scores use ${report.scoreBasis.denominator} analysed file${report.scoreBasis.denominator === 1 ? '' : 's'}; effective findings only (${report.scoreBasis.suppressedIssueCount} suppressed; ${report.scoreBasis.parseErrorCount} parse errors).</p>` : ''}
    </div>
    <div class="score-cards">
      <div class="score-card coherence">
        <span class="score-value">${report.coherence ?? '–'}</span>
        <span class="score-label">Repository Coherence ${report.coherence !== undefined ? (report.coherence >= 70 ? '[PASS]' : '[FAIL]') : ''}</span>
        <span class="score-brief">${SCORE_BRIEFS.engineeringHygiene}</span>
      </div>
      <div class="score-card repository-health-card">
        <span class="score-value">${namedScores.repositoryHealth}</span>
        <span class="score-label">Repository Health (composite)</span>
        <span class="score-brief">${SCORE_BRIEFS.repositoryHealth}</span>
      </div>
      <div class="score-card ai-quality">
        <span class="score-value">${namedScores.aiSlopScore}</span>
        <span class="score-label">AI Slop Score</span>
        <span class="score-brief">${SCORE_BRIEFS.aiSlopScore}</span>
      </div>
      <div class="score-card engineering-hygiene">
        <span class="score-value">${namedScores.engineeringHygiene}</span>
        <span class="score-label">Engineering Hygiene</span>
        <span class="score-brief">${SCORE_BRIEFS.engineeringHygiene}</span>
      </div>
      <div class="score-card security-score">
        <span class="score-value">${namedScores.security}</span>
        <span class="score-label">Security</span>
        <span class="score-brief">${SCORE_BRIEFS.security}</span>
      </div>
      <div class="score-card health">
        <span class="score-value">${roundedHealth}</span>
        <span class="score-label">Assembly Health</span>
        <span class="score-brief"></span>
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

interface NamedScores {
  aiSlopScore: string;
  engineeringHygiene: string;
  security: string;
  repositoryHealth: string;
}

/**
 * v0.15.0+: Extract the 4 named scores from the report. Each field is
 * optional on the report until U.5 lands; we read through `unknown` so
 * typecheck passes today. Numbers retain one decimal place for display.
 */
function extractNamedScores(report: ProjectReport): NamedScores {
  const score = (v: unknown): string =>
    typeof v === 'number' && !Number.isNaN(v) ? formatHeadlineScore(v) : '–';

  // Cast to a record shape that holds the optional v0.15.0 fields. The
  // real fields land in U.5; until then we surface the new labels and
  // fall back to the legacy `repositoryHealth` for the composite.
  const r = report as unknown as {
    aiSlopScore?: number;
    engineeringHygiene?: number;
    security?: number;
    repositoryHealth?: number;
  };

  return {
    aiSlopScore: score(r.aiSlopScore),
    engineeringHygiene: score(r.engineeringHygiene),
    security: score(r.security),
    repositoryHealth: score(r.repositoryHealth ?? report.repositoryHealth),
  };
}

function renderThresholds(report: ProjectReport): string {
  // v0.21.0: the CI gate is `aiSlopScore <= meanSlop` (raw amount of
  // slop, lower is better). Until v0.42.0 the HTML threshold table
  // showed only Repository Health (the v0.15-composite) with a
  // hardcoded "limit 70" — but that's NOT the CI gate. The render-time
  // check `score < limit` was for the inverted v0.15-20.1 cleanliness
  // reading. The HTML didn't surface the actual gate.
  //
  // v0.42.0 (user-review fix): add a row for the real gate and use
  // `report.thresholds.meanSlop` for the limit (not the legacy 70).
  // Repository Health is moved to "informational" since it doesn't
  // gate anything by default.
  const meanSlop = report.thresholds?.meanSlop ?? 30;
  const aiAvailable = typeof report.aiSlopScore === 'number';
  const aiPassed = aiAvailable && report.aiSlopScore <= meanSlop;
  const rh = report.repositoryHealth;
  const rhAvailable = typeof rh === 'number';
  // Repository Health is higher-is-better. The legacy 70 is the soft
  // band from `scoreBand()`. Keep it but label the row "informational".
  const rhLimit = 70;
  const rhPassed = rhAvailable && rh >= rhLimit;

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
          <td>AI Slop Score (CI gate)</td>
          <td>${aiAvailable ? `${report.aiSlopScore.toFixed(1)} / ${meanSlop}` : '–'}</td>
          <td><span class="status-badge ${thresholdStatusClass(!aiPassed)}">${aiAvailable ? (aiPassed ? 'pass' : 'fail') : 'n/a'}</span></td>
        </tr>
        <tr>
          <td>Repository Health (informational)</td>
          <td>${rhAvailable ? `${rh.toFixed(1)} / ${rhLimit}` : '–'}</td>
          <td><span class="status-badge ${thresholdStatusClass(!rhPassed)}">${rhAvailable ? (rhPassed ? 'pass' : 'fail') : 'n/a'}</span></td>
        </tr>
      </tbody>
    </table>
  </section>`;
}

/**
 * v0.15.0+: Render the 3-bucket taxonomy (AI Findings / Engineering
 * Hygiene / Suppressed). Rules are grouped via `bucketForVerdict()`
 * and counts come from `bucketDistribution()`. The `verdicts` field
 * is new on `ProjectReport` and lands in U.5; until then we cast
 * through `unknown`.
 */
function renderBuckets(report: ProjectReport): string {
  const verdicts = extractVerdicts(report);
  const distribution = bucketDistribution(verdicts);
  const rules = extractRuleVerdicts(report);

  const aiRules = rules.filter((r) => bucketForVerdict(r.verdict) === 'ai');
  const hygieneRules = rules.filter((r) => bucketForVerdict(r.verdict) === 'hygiene');
  const suppressedRules = rules.filter((r) => bucketForVerdict(r.verdict) === 'suppressed');

  const aiCounts = countVerdicts(aiRules.map((r) => r.verdict));
  const hygieneCounts = countVerdicts(hygieneRules.map((r) => r.verdict));
  const suppressedCounts = countVerdicts(suppressedRules.map((r) => r.verdict));

  return `
  <section class="buckets-section">
    <h2>Findings by bucket</h2>
    <div class="bucket-grid">
      <section class="ai-findings">
        <h3>AI Findings <span class="bucket-count">${distribution.ai}</span></h3>
        <p class="bucket-summary">${formatVerdictCounts(aiCounts, ['USEFUL', 'OK'])}</p>
        ${renderBucketList(aiRules)}
      </section>
      <section class="engineering-hygiene-bucket">
        <h3>Engineering Hygiene <span class="bucket-count">${distribution.hygiene}</span></h3>
        <p class="bucket-summary">${formatVerdictCounts(hygieneCounts, ['HYGIENE', 'INVERTED'])}</p>
        ${renderBucketList(hygieneRules)}
      </section>
      <section class="suppressed-bucket">
        <h3>Suppressed Rules <span class="bucket-count">${distribution.suppressed}</span></h3>
        <p class="bucket-summary">${formatVerdictCounts(suppressedCounts, ['NOISY', 'DORMANT'])}</p>
        ${renderSuppressedList(suppressedRules)}
      </section>
    </div>
  </section>`;
}

interface RuleVerdict {
  ruleId: string;
  verdict: Verdict;
  confidence?: string;
  message?: string;
}

/**
 * Pull the per-rule verdict list off the report. The new field lands
 * in U.5; until then we accept the empty array (buckets show 0/0/0).
 */
function extractVerdicts(report: ProjectReport): Verdict[] {
  const r = report as unknown as { verdicts?: Verdict[] };
  return Array.isArray(r.verdicts) ? r.verdicts : [];
}

/**
 * Pull the richer per-rule list (ruleId + verdict + optional
 * confidence/message) off the report. Used by the bucket sections to
 * render one row per rule. New field lands in U.5.
 */
function extractRuleVerdicts(report: ProjectReport): RuleVerdict[] {
  const r = report as unknown as { ruleVerdicts?: RuleVerdict[] };
  return Array.isArray(r.ruleVerdicts) ? r.ruleVerdicts : [];
}

function countVerdicts(verdicts: Verdict[]): Record<Verdict, number> {
  const counts: Record<Verdict, number> = {
    USEFUL: 0,
    OK: 0,
    NOISY: 0,
    INVERTED: 0,
    HYGIENE: 0,
    DORMANT: 0,
  };
  for (const v of verdicts) counts[v]++;
  return counts;
}

function formatVerdictCounts(counts: Record<Verdict, number>, keys: Verdict[]): string {
  const parts = keys
    .filter((k) => counts[k] > 0)
    .map((k) => `${counts[k]} ${displayVerdictLabel(k)}`);
  return parts.length > 0 ? parts.join(' · ') : 'No items';
}

/**
 * Display label for a verdict in the bucket summary. Spec uses
 * "Useful" + "OK" — i.e. title-case everything except OK, which is
 * conventionally all-caps. (Follow the spec verbatim so users can
 * match the headline to the doc.)
 */
function displayVerdictLabel(value: Verdict): string {
  if (value === 'OK') return 'OK';
  return titleCase(value);
}

function titleCase(value: string): string {
  if (value.length === 0) return value;
  return value[0]!.toUpperCase() + value.slice(1).toLowerCase();
}

function renderBucketList(rules: RuleVerdict[]): string {
  if (rules.length === 0) {
    return '<p class="bucket-empty">No rules in this bucket.</p>';
  }
  const items = rules
    .map(
      (r) => `
      <li>
        <span class="rule-id">${escapeHtml(r.ruleId)}</span>
        <span class="rule-verdict verdict-${escapeHtml(r.verdict.toLowerCase())}">${escapeHtml(r.verdict)}</span>
        ${r.confidence ? `<span class="rule-confidence">Confidence: ${escapeHtml(r.confidence)}</span>` : ''}
        ${r.message ? `<span class="rule-message">${escapeHtml(r.message)}</span>` : ''}
      </li>`,
    )
    .join('');
  return `<ul class="bucket-list">${items}</ul>`;
}

function renderSuppressedList(rules: RuleVerdict[]): string {
  if (rules.length === 0) {
    return '<p class="bucket-empty">No suppressed rules.</p>';
  }
  const items = rules
    .map(
      (r) => `
      <li>
        <span class="rule-id">${escapeHtml(r.ruleId)}</span>
        <span class="rule-verdict verdict-${escapeHtml(r.verdict.toLowerCase())}">${escapeHtml(r.verdict)}</span>
        ${r.message ? `<span class="rule-message">${escapeHtml(r.message)}</span>` : ''}
      </li>`,
    )
    .join('');
  return `
    <details>
      <summary>Show suppressed rules (${rules.length})</summary>
      <ul class="bucket-list">${items}</ul>
    </details>`;
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
  renderBuckets,
  renderCategoryBreakdown,
  renderTopOffenders,
  renderFiles,
  renderIssues,
  renderParseErrors,
};
