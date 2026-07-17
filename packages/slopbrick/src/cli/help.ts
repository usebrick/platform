/**
 * v0.18.4: --help clusters.
 *
 * The slopbrick CLI had ~38 flat options on the root program
 * (a R-H1 refactor leftover — see memory.md). Commander.js
 * natively dumps them as one long list, which is hard to
 * scan. This module provides a custom help formatter that
 * groups options by purpose:
 *
 *   File selection  - --include, --exclude, --since, --diff,
 *                     --staged, --changed, --workspace
 *   Filter         - --ai-only, --human-only, --security-only,
 *                     --ignore-wcag22, --framework
 *   Output         - --format, --brief, --full, --json, --html,
 *                     --no-color, --quiet, --verbose, --heatmap,
 *                     --trend, --why-failing
 *   Performance    - --threads, --incremental, --cache, --cache-path
 *   Auto-fix       - --fix, --dry-run, --show-fixes-diff
 *   CI / threshold - --strict, --no-increase, --baseline, --threshold
 *   Watch/diagnose - --watch, --doctor, --suggest, --tighten
 *   Tokens         - --tokens
 *   Telemetry      - --no-telemetry
 *
 * The standard flat-list output is still available via the
 * `--help-flat` flag (added in v0.18.4) for users who prefer it
 * (e.g. when piping to grep/awk).
 */
import type { Command, Option } from 'commander';

export type OptionCategoryKey =
  | 'file'
  | 'filter'
  | 'output'
  | 'perf'
  | 'fix'
  | 'ci'
  | 'watch'
  | 'tokens'
  | 'telemetry'
  | 'other';

export const CATEGORY_LABELS: Record<OptionCategoryKey, string> = {
  file: 'File selection',
  filter: 'Filter',
  output: 'Output & display',
  perf: 'Performance',
  fix: 'Auto-fix',
  ci: 'CI / threshold',
  watch: 'Watch & diagnose',
  tokens: 'Tokens',
  telemetry: 'Telemetry',
  other: 'Other',
};

/**
 * Map from option long name (e.g. `--include`) to its
 * category. Options not in this map fall into the `other`
 * category (rendered last).
 */
export const OPTION_CATEGORY: Record<string, OptionCategoryKey> = {
  // File selection
  '--include': 'file',
  '--exclude': 'file',
  '--since': 'file',
  '--diff': 'file',
  '--staged': 'file',
  '--changed': 'file',
  '--workspace': 'file',

  // Filter
  '--ai-only': 'filter',
  '--human-only': 'filter',
  '--security-only': 'filter',
  '--ignore-wcag22': 'filter',
  '--framework': 'filter',

  // Output & display
  '--format': 'output',
  '--brief': 'output',
  '--full': 'output',
  '--json': 'output',
  '--html': 'output',
  '--no-color': 'output',
  '--quiet': 'output',
  '--verbose': 'output',
  '--heatmap': 'output',
  '--trend': 'output',
  '--why-failing': 'output',

  // Performance
  '--threads': 'perf',
  '--incremental': 'perf',
  '--cache': 'perf',
  '--cache-path': 'perf',

  // Auto-fix
  '--fix': 'fix',
  '--dry-run': 'fix',
  '--show-fixes-diff': 'fix',

  // CI / threshold
  '--strict': 'ci',
  '--no-increase': 'ci',
  '--baseline': 'ci',
  '--threshold': 'ci',

  // Watch & diagnose
  '--watch': 'watch',
  '--doctor': 'watch',
  '--suggest': 'watch',
  '--tighten': 'watch',

  // Tokens
  '--tokens': 'tokens',

  // Telemetry
  '--no-telemetry': 'telemetry',
  // v0.24.0 (Workstream C): opt-in network beacon. Distinct from
  // --no-telemetry (which gates the local flywheel); this gates a
  // single POST at scan end.
  '--report-usage': 'telemetry',
};

/** Category order (used when rendering — keeps the most-used
 *  categories near the top). */
const CATEGORY_ORDER: OptionCategoryKey[] = [
  'file',
  'filter',
  'output',
  'perf',
  'fix',
  'ci',
  'watch',
  'tokens',
  'telemetry',
  'other',
];

interface GroupedOption {
  category: OptionCategoryKey;
  flags: string;
  description: string;
}

/** Group the command's options by category. The result is
 *  ordered by CATEGORY_ORDER, then alphabetical within a
 *  category (preserving Commander's natural order for the
 *  options themselves). */
function groupOptions(cmd: Command): Map<OptionCategoryKey, GroupedOption[]> {
  const grouped = new Map<OptionCategoryKey, GroupedOption[]>();
  for (const category of CATEGORY_ORDER) {
    grouped.set(category, []);
  }
  for (const opt of cmd.options) {
    // Skip auto-added --help and --version
    if (opt.hidden) continue;
    const longFlag = opt.long ?? opt.short ?? '';
    // Commander normalizes --foo to --foo (not -foo). Skip
    // options without a long flag for the lookup (e.g. -V
    // for version). They'll fall into `other`.
    const category: OptionCategoryKey = longFlag
      ? (OPTION_CATEGORY[longFlag] ?? 'other')
      : 'other';
    grouped.get(category)!.push({
      category,
      flags: opt.flags,
      description: opt.description ?? '',
    });
  }
  return grouped;
}

/** Render a single option's flags+description as a help line.
 *  Aligned columns for readability:
 *    --foo <bar>      description text
 *    --baz, -b        another description
 *  Width is computed from the longest flag string in the
 *  command (so columns align). */
function renderOption(opt: GroupedOption, flagWidth: number): string {
  const padded = opt.flags.padEnd(flagWidth, ' ');
  return `  ${padded}  ${opt.description}`;
}

/** Custom help formatter. Output:
 *
 *   Usage: slopbrick scan [options]
 *
 *   File selection:
 *     --include <glob>      include pattern (repeatable)
 *     --exclude <glob>      exclude pattern (repeatable)
 *     ...
 *
 *   Filter:
 *     --ai-only             only report AI-specific issues
 *     ...
 *
 *   Output & display:
 *     ...
 *
 *   ...
 *
 *   Use `--help-flat` for the standard un-grouped list.
 *   See `https://usebrick.dev/docs/` for full docs.
 */
export function formatGroupedHelp(cmd: Command): string {
  const lines: string[] = [];

  // Usage line
  const usage = cmd.usage ? cmd.usage() : `Usage: ${cmd.name()} [options]`;
  lines.push(usage);
  lines.push('');

  // Description (if any)
  if (cmd.description()) {
    lines.push(cmd.description());
    lines.push('');
  }

  const grouped = groupOptions(cmd);

  // Compute flag column width for alignment (longest flag
  // string across all categories + 2 for the leading spaces)
  let flagWidth = 0;
  for (const options of grouped.values()) {
    for (const opt of options) {
      if (opt.flags.length > flagWidth) flagWidth = opt.flags.length;
    }
  }

  // Render each non-empty category
  let firstCategory = true;
  for (const category of CATEGORY_ORDER) {
    const options = grouped.get(category)!;
    if (options.length === 0) continue;
    // Blank line before each category (except the first)
    if (!firstCategory) lines.push('');
    firstCategory = false;
    lines.push(`  ${CATEGORY_LABELS[category]}:`);
    for (const opt of options) {
      lines.push(renderOption(opt, flagWidth));
    }
  }

  lines.push('');
  // v0.42.0 (post-cleanup follow-up): the prior help output ended
  // abruptly at "Use `--help-flat`" with no hint that slopbrick has
  // subcommands. A new user reading `slopbrick --help` had no way
  // to discover that `scan`, `drift`, `pr`, `init`, etc. exist
  // without running `slopbrick --help-flat` (or stumbling onto them).
  // Append a compact subcommand index here so the grouped help is
  // also a usable index.
  const commandWidth = Math.max(...cmd.commands.map((command) => command.name().length));
  const commandLines = cmd.commands.map((command) => {
    const description = command.description().replace(/\s+/g, ' ').trim();
    return `  ${command.name().padEnd(commandWidth)}  ${description}`.trimEnd();
  });
  lines.push(
    'Commands (run `<command> --help` for per-command details):\n' +
      commandLines.join('\n'),
  );
  lines.push('');
  lines.push(
    'Use `--help-flat` for the standard un-grouped list. ' +
      'See `https://usebrick.dev/docs/` for full docs.',
  );

  return lines.join('\n');
}
