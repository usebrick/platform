import chalk from 'chalk';
import { redactSecrets } from '../cli/render.js';
import type {
  FirstScanExperience,
  FirstScanFindingDelta,
  FirstScanRecommendedAction,
  GateDecision,
} from '../types/index.js';
import { FIRST_SCAN_AREAS } from './first-scan.js';

export interface FirstScanPrettyOptions {
  columns?: number;
  gateDecision?: GateDecision;
  meanSlop?: number;
  aiSlopScore?: number;
}

const HEADINGS = new Set([
  'Repository Health',
  'Scan status',
  'Policy gate',
  'Dimensions',
  'Areas',
  'Recommended actions',
  'Rescan comparison',
]);

const GRAPHEME_SEGMENTER = new Intl.Segmenter(undefined, { granularity: 'grapheme' });
const COMBINING_MARK = /\p{Mark}/u;

function isZeroWidthCodePoint(character: string, codePoint: number): boolean {
  return COMBINING_MARK.test(character)
    || codePoint === 0x200d
    || (codePoint >= 0xfe00 && codePoint <= 0xfe0f)
    || (codePoint >= 0xe0100 && codePoint <= 0xe01ef)
    || (codePoint >= 0x1f3fb && codePoint <= 0x1f3ff)
    || (codePoint >= 0xe0020 && codePoint <= 0xe007f)
    || codePoint <= 0x1f
    || (codePoint >= 0x7f && codePoint <= 0x9f);
}

function isWideCodePoint(codePoint: number): boolean {
  return codePoint >= 0x1100 && (
    codePoint <= 0x115f
    || codePoint === 0x2329
    || codePoint === 0x232a
    || (codePoint >= 0x2e80 && codePoint <= 0xa4cf && codePoint !== 0x303f)
    || (codePoint >= 0xac00 && codePoint <= 0xd7a3)
    || (codePoint >= 0xf900 && codePoint <= 0xfaff)
    || (codePoint >= 0xfe10 && codePoint <= 0xfe19)
    || (codePoint >= 0xfe30 && codePoint <= 0xfe6f)
    || (codePoint >= 0xff01 && codePoint <= 0xff60)
    || (codePoint >= 0xffe0 && codePoint <= 0xffe6)
    || (codePoint >= 0x1b000 && codePoint <= 0x1b001)
    || (codePoint >= 0x1f1e6 && codePoint <= 0x1f1ff)
    || (codePoint >= 0x1f200 && codePoint <= 0x1f251)
    || (codePoint >= 0x1f300 && codePoint <= 0x1faff)
    || (codePoint >= 0x20000 && codePoint <= 0x3fffd)
  );
}

function graphemeCellWidth(grapheme: string): number {
  let width = 0;
  let joined = false;
  let emojiPresentation = false;
  let regionalIndicators = 0;
  for (const character of grapheme) {
    const codePoint = character.codePointAt(0) ?? 0;
    if (codePoint === 0x200d) joined = true;
    if (codePoint === 0xfe0f) emojiPresentation = true;
    if (codePoint >= 0x1f1e6 && codePoint <= 0x1f1ff) regionalIndicators += 1;
    if (isZeroWidthCodePoint(character, codePoint)) continue;
    width += isWideCodePoint(codePoint) ? 2 : 1;
  }
  if (joined || emojiPresentation || regionalIndicators > 1) return width === 0 ? 0 : 2;
  return width;
}

function terminalCellWidth(value: string): number {
  let width = 0;
  for (const { segment } of GRAPHEME_SEGMENTER.segment(value)) {
    width += graphemeCellWidth(segment);
  }
  return width;
}

function splitByTerminalCells(value: string, width: number): string[] {
  const chunks: string[] = [];
  let chunk = '';
  let chunkWidth = 0;
  for (const { segment } of GRAPHEME_SEGMENTER.segment(value)) {
    const segmentWidth = graphemeCellWidth(segment);
    if (chunk && chunkWidth + segmentWidth > width) {
      chunks.push(chunk);
      chunk = '';
      chunkWidth = 0;
    }
    chunk += segment;
    chunkWidth += segmentWidth;
  }
  if (chunk) chunks.push(chunk);
  return chunks;
}

function displayColumns(options: FirstScanPrettyOptions): number {
  const detected = options.columns
    ?? (process.stdout.isTTY ? process.stdout.columns : 100)
    ?? 100;
  return Math.min(120, Math.max(32, Math.floor(detected)));
}

function formatNumber(value: number): string {
  return Number.isInteger(value) ? String(value) : String(Number(value.toFixed(2)));
}

function plural(count: number, singular: string, pluralForm = `${singular}s`): string {
  return `${count} ${count === 1 ? singular : pluralForm}`;
}

/** Wrap semantic prose before styling so ANSI bytes never affect width. */
function wrap(text: string, columns: number, indentation = 2): string[] {
  const indent = ' '.repeat(indentation);
  const width = Math.max(1, columns - indentation);
  const words = redactSecrets(text).replace(/\s+/g, ' ').trim().split(' ').filter(Boolean);
  if (words.length === 0) return [indent];

  const lines: string[] = [];
  let current = '';
  const flush = () => {
    if (current.length > 0) lines.push(`${indent}${current}`);
    current = '';
  };

  for (const original of words) {
    const wordWidth = terminalCellWidth(original);
    if (wordWidth > width) {
      flush();
      const chunks = splitByTerminalCells(original, width);
      for (const chunk of chunks.slice(0, -1)) {
        lines.push(`${indent}${chunk}`);
      }
      current = chunks.at(-1) ?? '';
      continue;
    }
    if (current.length === 0) {
      current = original;
      continue;
    }
    if (terminalCellWidth(current) + 1 + wordWidth <= width) {
      current += ` ${original}`;
      continue;
    }
    flush();
    current = original;
  }
  flush();
  return lines;
}

function section(heading: string, body: string[], columns: number): string {
  return [heading, ...body.flatMap((line) => wrap(line, columns))].join('\n');
}

function headlineSection(firstScan: FirstScanExperience, columns: number): string {
  if (!firstScan.headline) {
    return section(
      'Repository Health',
      [`unavailable — ${firstScan.status} scan has no valid score.`],
      columns,
    );
  }
  return section(
    'Repository Health',
    [`${formatNumber(firstScan.headline.value)} / 100 — higher is better`],
    columns,
  );
}

function policyGateLine(
  firstScan: FirstScanExperience,
  options: FirstScanPrettyOptions,
): string {
  if (firstScan.status !== 'complete') {
    return `not evaluated — scan status is ${firstScan.status}.`;
  }
  if (options.gateDecision) {
    return `${options.gateDecision.status} — ${options.gateDecision.summary}`;
  }
  if (options.aiSlopScore !== undefined && options.meanSlop !== undefined) {
    const passed = options.aiSlopScore <= options.meanSlop;
    return `${passed ? 'passed' : 'failed'} — AI Slop Score ${formatNumber(options.aiSlopScore)} ${passed ? '<=' : '>'} ${formatNumber(options.meanSlop)}.`;
  }
  return 'not evaluated — no gate decision is attached.';
}

function dimensionsSection(firstScan: FirstScanExperience, columns: number): string {
  if (!firstScan.headline) {
    return section(
      'Dimensions',
      [`unavailable — ${firstScan.status} scan has no valid dimensions.`],
      columns,
    );
  }
  return section(
    'Dimensions',
    firstScan.headline.dimensions.map((dimension) =>
      `${dimension.label}: ${formatNumber(dimension.value)} / 100; ${formatNumber(dimension.weight * 100)}% weight`
    ),
    columns,
  );
}

function areasSection(firstScan: FirstScanExperience, columns: number): string {
  return section(
    'Areas',
    FIRST_SCAN_AREAS.map(({ id, label }) => {
      const area = firstScan.areas.find((candidate) => candidate.id === id);
      const count = area?.findingCount ?? 0;
      const severity = area?.severity ?? { high: 0, medium: 0, low: 0 };
      return `${label}: ${plural(count, 'finding')} (high ${severity.high}, medium ${severity.medium}, low ${severity.low})`;
    }),
    columns,
  );
}

function evidenceSummary(action: FirstScanRecommendedAction): string {
  if (action.evidence.tier === 'calibrated' && action.evidence.calibration) {
    const calibration = action.evidence.calibration;
    return `calibrated; verdict ${calibration.verdict}; precision ${formatNumber(calibration.precision * 100)}%; last calibrated ${calibration.lastCalibratedAt.slice(0, 10)}. ${action.evidence.claim} Not a quality verdict.`;
  }
  if (action.evidence.tier === 'deterministic') {
    if (action.evidence.sourceSpan === 'exact') return 'deterministic; exact source span.';
    if (action.evidence.sourceSpan === 'omitted') return 'deterministic; bounded source span omitted.';
    return 'deterministic; no source span attached.';
  }
  return 'advisory; review guidance only.';
}

function actionKind(action: FirstScanRecommendedAction): string {
  if (action.action.kind === 'apply-finding-bound-fix') return 'finding-bound repair';
  if (action.action.kind === 'manual-review') return 'manual review';
  return 'no action';
}

function reachSummary(action: FirstScanRecommendedAction): string {
  const files = plural(action.reach.affectedFileCount, 'file');
  return `${action.reach.kind}; ${plural(action.reach.findingCount, 'finding')} across ${files}.`;
}

function recommendationsSection(firstScan: FirstScanExperience, columns: number): string {
  if (firstScan.status !== 'complete') {
    return section(
      'Recommended actions',
      [`unavailable — ${firstScan.status} scans do not recommend actions.`],
      columns,
    );
  }
  const recommendations = firstScan.recommendedActions.slice(0, 3);
  if (recommendations.length === 0) {
    return section('Recommended actions', ['None — no active findings.'], columns);
  }

  const areaLabels = new Map(FIRST_SCAN_AREAS.map((area) => [area.id, area.label]));
  const lines: string[] = ['Recommended actions'];
  for (const action of recommendations) {
    const area = areaLabels.get(action.area) ?? action.area;
    lines.push(...wrap(
      `${action.rank}. ${area} — ${action.ruleId} [${action.severity}]`,
      columns,
      2,
    ));
    lines.push(...wrap(`Evidence tier: ${evidenceSummary(action)}`, columns, 4));
    lines.push(...wrap(`Reach: ${reachSummary(action)}`, columns, 4));
    lines.push(...wrap(`Change: ${action.change}.`, columns, 4));
    lines.push(...wrap(`Why: ${action.why}`, columns, 4));
    lines.push(...wrap(`Action: ${actionKind(action)} — ${action.action.label}`, columns, 4));
  }
  return lines.join('\n');
}

function resolvedFindingLine(
  resolved: NonNullable<FirstScanFindingDelta['resolved']>[number],
): string {
  const location = resolved.filePath
    ? `${resolved.filePath}:${resolved.line}:${resolved.column}`
    : `project-wide:${resolved.line}:${resolved.column}`;
  return `Resolved: ${resolved.ruleId} at ${location}.`;
}

function rescanSection(firstScan: FirstScanExperience, columns: number): string {
  const delta = firstScan.delta;
  const lines = [delta.summary];
  if (delta.status === 'compared' && delta.baselineRevision !== undefined) {
    lines[0] = `${delta.summary} Baseline revision ${delta.baselineRevision}.`;
    if (delta.resolvedDetails === 'available') {
      lines.push(...(delta.resolved ?? []).map(resolvedFindingLine));
    }
  }
  return section('Rescan comparison', lines, columns);
}

function styleSemanticText(output: string): string {
  return output.split('\n').map((line) => {
    if (HEADINGS.has(line)) return chalk.bold(line);
    const semantic = line.trimStart();
    if (semantic === 'complete' || semantic.startsWith('passed —')) return chalk.green(line);
    if (semantic.startsWith('failed —') || semantic.includes('[high]') || semantic.startsWith('Change: new')) {
      return chalk.red(line);
    }
    if (
      semantic.startsWith('not evaluated —')
      || semantic.startsWith('unavailable —')
      || semantic.includes('[medium]')
      || semantic.startsWith('Action: manual review')
    ) return chalk.yellow(line);
    if (semantic.includes('[low]') || semantic.startsWith('Change: unchanged')) return chalk.gray(line);
    return line;
  }).join('\n');
}

export function formatFirstScanPretty(
  firstScan: FirstScanExperience,
  options: FirstScanPrettyOptions = {},
): string {
  const columns = displayColumns(options);
  const sections = [
    headlineSection(firstScan, columns),
    section('Scan status', [firstScan.status], columns),
    section('Policy gate', [policyGateLine(firstScan, options)], columns),
    dimensionsSection(firstScan, columns),
    areasSection(firstScan, columns),
    recommendationsSection(firstScan, columns),
    rescanSection(firstScan, columns),
    wrap(
      'Run again after a change to compare findings. Use --full for every score and finding.',
      columns,
      0,
    ).join('\n'),
  ];
  return styleSemanticText(sections.join('\n\n'));
}
