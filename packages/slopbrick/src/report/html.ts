// Public entry point for the HTML reporter.
//
// Implementation is split across ./html/:
//   - utils.ts   — small data helpers + category / severity labels
//   - sections.ts — renderHeader / renderThresholds / renderBuckets /
//                   renderCategoryBreakdown / renderTopOffenders /
//                   renderFiles / renderIssues / renderParseErrors
//   - static.ts  — renderStyles (CSS) + renderScripts (interactive JS)
//
// This file is intentionally tiny — it just composes the section
// renderers inside a single self-contained HTML document.

import type { ProjectReport } from '../types';
import {
  renderHeader,
  renderThresholds,
  renderBuckets,
  renderCategoryBreakdown,
  renderTopOffenders,
  renderFiles,
  renderIssues,
  renderParseErrors,
} from './html/sections.js';
import { renderStyles, renderScripts } from './html/static.js';

export function formatHtml(report: ProjectReport): string {
  // Human-facing reports surface only actionable findings. JSON and SARIF
  // deliberately retain disabled findings for audit and tool integration.
  const effectiveReport = {
    ...report,
    issues: report.issues.filter((issue) => (issue.severity as string) !== 'off'),
  };
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>slopbrick report</title>
  ${renderStyles()}
</head>
<body>
  ${renderHeader(effectiveReport)}
  ${renderThresholds(effectiveReport)}
  ${renderBuckets(effectiveReport)}
  ${renderCategoryBreakdown(effectiveReport)}
  ${renderTopOffenders(effectiveReport)}
  ${renderFiles(effectiveReport)}
  ${renderIssues(effectiveReport)}
  ${renderParseErrors(effectiveReport)}
  ${renderScripts()}
</body>
</html>`;
}
