// Report rendering dispatcher.
//
// Pure CLI-side orchestration: pick the right `formatXxx` based on
// `--format` / `--json` / `--html` / `--suggest` / `--why-failing` /
// `--brief` flags and emit to stdout or a file. The actual format
// implementations live in `src/report/*` (json, sarif, html, pretty,
// advice, etc.) — this file just routes between them.
//
// Side effect: writes to stdout via `logger.info` and (for
// `--html=path` / `--json=path`) to disk via atomic temp-file publication.

import { randomUUID } from 'node:crypto';
import { renameSync, unlinkSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

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
  isIncompleteScan,
  isGitScopedEmptySelection,
  isNotApplicableScan,
} from '../../report/scan-validity.js';
import type { CliGlobalOptions } from '../scan';
import type { ProjectReport } from '../../types';
import { validateOutputFormat } from './output-format.js';

/**
 * Publish machine-readable reports as one visible filesystem transition.
 * Watch consumers and CI readers can otherwise observe the target after
 * truncation but before the renderer has finished writing it.
 */
function writeReportFileAtomically(path: string, content: string): void {
  const target = resolve(path);
  const temporary = `${target}.${randomUUID()}.tmp`;
  try {
    writeFileSync(temporary, content, { encoding: 'utf8', flag: 'wx' });
    renameSync(temporary, target);
  } finally {
    try { unlinkSync(temporary); } catch { /* rename already published it */ }
  }
}

function withoutScoreDerivedViews(options: CliGlobalOptions): CliGlobalOptions {
  return {
    ...options,
    explainScore: false,
    whyFailing: false,
    brief: false,
    suggest: false,
  };
}

export function renderOutput(report: ProjectReport, options: CliGlobalOptions, cwd: string): void {
  validateOutputFormat(options.format);

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
    options = withoutScoreDerivedViews(options);
  }

  // A partial scan may retain findings for diagnosis, but its aggregate
  // placeholders are not measurements. Keep machine formats parseable with
  // their explicit incomplete discriminator; suppress every human score,
  // clean/pass, advice, and threshold view behind the validity notice.
  if (isIncompleteScan(report)) {
    if (!machineReportRequested) {
      if (!options.quiet) {
        logger.info(
          formatScanValidityNotice(report) ??
            'INCOMPLETE SCAN — scores are not valid for gating.',
        );
      }
      return;
    }
    options = withoutScoreDerivedViews(options);
  }

  // Explicit score explanation is intentionally opt-in. In JSON mode it
  // adds the deterministic aggregate inputs; ordinary JSON stays stable and
  // does not grow a report-only explanation field.
  if (options.explainScore) {
    if (options.json) {
      const json = formatJson(report, { includeScoreExplanation: true });
      if (typeof options.json === 'string') {
        writeReportFileAtomically(options.json, json);
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
      writeReportFileAtomically(options.html, html);
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
      writeReportFileAtomically(options.json, json);
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
    logger.info(formatPretty(report, { full: options.full === true }));
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
  if (isNotApplicableScan(report) || isIncompleteScan(report)) {
    renderOutput(report, options, cwd);
    return;
  }
  if (options.heatmap) {
    const { buildHeatmap, formatHeatmap } = await import('../../report/heatmap');
    const entries = await buildHeatmap(report, cwd);
    const json = formatHeatmap(entries, {
      json: options.format === 'json' || options.json !== undefined,
    });
    if (typeof options.json === 'string') {
      writeReportFileAtomically(options.json, json);
      if (!options.quiet) logger.info(`Wrote JSON report to ${options.json}`);
    } else if (!options.quiet) {
      logger.info(json);
    }
    return;
  }
  renderOutput(report, options, cwd);
}
