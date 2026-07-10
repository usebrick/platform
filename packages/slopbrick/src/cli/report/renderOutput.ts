// Report rendering dispatcher.
//
// Pure CLI-side orchestration: pick the right `formatXxx` based on
// `--format` / `--json` / `--html` / `--suggest` / `--why-failing` /
// `--brief` flags and emit to stdout or a file. The actual format
// implementations live in `src/report/*` (json, sarif, html, pretty,
// advice, etc.) — this file just routes between them.
//
// Side effect: writes to stdout via `logger.info` and (for
// `--html=path` / `--json=path`) to disk via `writeFileSync`.

import { resolve } from 'node:path';
import { writeFileSync } from 'node:fs';

import { logger } from '../../engine/logger';
import { formatJson } from '../../report/json';
import { formatPretty, formatWhyFailingReport, formatBriefReport } from '../../report/pretty';
import { formatScoreExplanation } from '../../report/score-explanation';
import { formatSarif } from '../../report/sarif';
import { formatHtml } from '../../report/html';
import { formatAdvice } from '../../report/advice';
import { formatUnifiedDiff } from '../../report/unified-diff';
import {
  formatGitScopedEmptySelectionNotice,
  formatScanValidityNotice,
  isGitScopedEmptySelection,
  isNotApplicableScan,
} from '../../report/scan-validity.js';
import type { CliGlobalOptions } from '../scan';
import type { ProjectReport } from '../../types';

const VALID_FORMATS = new Set(['pretty', 'json', 'sarif', 'html']);

export function renderOutput(report: ProjectReport, options: CliGlobalOptions, cwd: string): void {
  // Validate --format up front. Previously an unknown --format value
  // silently fell through to pretty — users with CI scripts that
  // depended on JSON output got HTML or pretty and never noticed.
  if (options.format && !VALID_FORMATS.has(options.format)) {
    process.stderr.write(
      `Unknown --format value: ${options.format}. Valid: pretty, json, sarif, html.\n`,
    );
    process.exit(2);
  }

  const machineReportRequested = Boolean(options.html || options.json) ||
    options.format === 'json' || options.format === 'sarif' || options.format === 'html';

  // Internal score aggregation still needs numeric fields, but zero-file
  // renderers must never expose those placeholders as measurements. Machine
  // serializers project a discriminated metadata envelope; every human view
  // collapses to one truthful notice.
  if (isNotApplicableScan(report)) {
    if (!machineReportRequested) {
      if (!options.quiet) {
        logger.info(
          isGitScopedEmptySelection(report, options)
            ? formatGitScopedEmptySelectionNotice()
            : formatScanValidityNotice(report) ?? 'NO FILES ANALYSED — scores are not applicable for gating.',
        );
      }
      return;
    }
    options = {
      ...options,
      explainScore: false,
      whyFailing: false,
      brief: false,
      suggest: false,
    };
  }

  // A partial scan may retain findings for diagnosis, but its aggregate
  // placeholders are not measurements. Keep machine formats parseable with
  // their explicit incomplete discriminator; suppress every human score,
  // clean/pass, advice, and threshold view behind the validity notice.
  if (report.scoreValidity === 'incomplete' && !machineReportRequested) {
    if (!options.quiet) {
      logger.info(
        formatScanValidityNotice(report) ??
          'INCOMPLETE SCAN — scores are not valid for gating.',
      );
    }
    return;
  }

  // Explicit score explanation is intentionally opt-in. In JSON mode it
  // adds the deterministic aggregate inputs; ordinary JSON stays stable and
  // does not grow a report-only explanation field.
  if (options.explainScore) {
    if (options.json) {
      const json = formatJson(report, { includeScoreExplanation: true });
      if (typeof options.json === 'string') {
        writeFileSync(resolve(options.json), json);
        if (!options.quiet) logger.info(`Wrote JSON report to ${options.json}`);
      } else {
        logger.info(json);
      }
      return;
    }
    if (options.format === 'json') {
      logger.info(formatJson(report, { includeScoreExplanation: true }));
      return;
    }
    if (!options.quiet) logger.info(formatScoreExplanation(report));
    return;
  }

  // --why-failing: quick triage view (top 5 rules dragging the score
  // down). Takes precedence over --suggest / --format because it's a
  // different output entirely.
  if (options.whyFailing) {
    if (!options.quiet) {
      logger.info(formatWhyFailingReport(report));
    }
    return;
  }

  // --brief: terse output for CI / scripts. Just the verdict, headline,
  // threshold, delta, and trust signal. Takes precedence over --format
  // pretty for the same reason as --why-failing.
  // `--full` is an explicit override for scripts that compose a shared
  // option set (for example `--brief --full`). The normal pretty renderer
  // is already the complete report, so this branch only needs to cancel
  // the terse view rather than inventing a second formatter.
  if (options.brief && !options.full) {
    if (!options.quiet) {
      logger.info(formatBriefReport(report));
    }
    return;
  }

  if (options.suggest) {
    if (!options.quiet) {
      logger.info(formatAdvice(report));
      const diff = formatUnifiedDiff(report, cwd);
      if (diff) {
        logger.info(diff);
      }
    }
    return;
  }

  if (options.html) {
    const html = formatHtml(report);
    if (typeof options.html === 'string') {
      writeFileSync(resolve(options.html), html);
      if (!options.quiet) {
        logger.info(`Wrote HTML report to ${options.html}`);
      }
    } else {
      logger.info(html);
    }
    return;
  }

  if (options.json) {
    const json = formatJson(report);
    if (typeof options.json === 'string') {
      writeFileSync(resolve(options.json), json);
      if (!options.quiet) {
        logger.info(`Wrote JSON report to ${options.json}`);
      }
    } else {
      logger.info(json);
    }
    return;
  }

  if (options.format === 'json') {
    logger.info(formatJson(report));
    return;
  }

  if (options.format === 'sarif') {
    const cwdSarif = resolve(options.workspace ?? process.cwd());
    logger.info(formatSarif(report, { cwd: cwdSarif }));
    return;
  }

  if (options.format === 'html') {
    logger.info(formatHtml(report));
    return;
  }

  if (!options.quiet) {
    logger.info(formatPretty(report));
  }
}

/**
 * Top-level scan output dispatcher. Handles the `--heatmap` flag
 * (which needs I/O via `buildHeatmap`) before falling through to
 * `renderOutput` for the standard format dispatch.
 */
export async function outputScanResults(
  report: ProjectReport,
  options: CliGlobalOptions,
  cwd: string,
): Promise<void> {
  if (options.heatmap) {
    const { buildHeatmap, formatHeatmap } = await import('../../report/heatmap');
    const entries = await buildHeatmap(report, cwd);
    logger.info(formatHeatmap(entries, { json: options.format === 'json' }));
    return;
  }
  renderOutput(report, options, cwd);
}
