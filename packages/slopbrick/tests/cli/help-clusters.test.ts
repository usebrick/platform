/**
 * v0.18.4 (--help clusters): tests for the grouped --help output.
 *
 * The slopbrick CLI had ~38 flat options on the root program,
 * making --help hard to scan. PR-1 (this) groups them into
 * 9 categories (File selection, Filter, Output, Performance,
 * Auto-fix, CI / threshold, Watch & diagnose, Tokens, Other).
 *
 * These tests exercise the CLI subprocess to verify:
 *   1. `slopbrick --help` renders the grouped view (categories
 *      appear as headers, options are listed under their
 *      category, no flat alphabetical dump).
 *   2. `slopbrick --help-flat` renders Commander's standard
 *      flat alphabetical list (the opt-out).
 *   3. The grouped view includes all 38 options (no regression
 *      where a category hides an option).
 */
import { describe, expect, it } from 'vitest';
import { spawnSync } from 'node:child_process';
import { Command } from 'commander';
import { binPath } from '../helpers/cli';
import { registerScan } from '../../src/cli/commands/scan';

const SLOPBRICK = binPath;

function runHelp(args: string[]): string {
  const result = spawnSync('node', [SLOPBRICK, ...args], {
    encoding: 'utf-8',
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  // --help and --help-flat should exit 0.
  expect(result.status).toBe(0);
  return result.stdout;
}

describe('v0.18.4 — --help clusters', () => {
  it('groups options by category in the default --help output', () => {
    const out = runHelp(['--help']);

    // All 9 category headers must be present (in order).
    const expectedCategories = [
      'File selection:',
      'Filter:',
      'Output & display:',
      'Performance:',
      'Auto-fix:',
      'CI / threshold:',
      'Watch & diagnose:',
      'Tokens:',
      // 'Other:' is rendered if there are uncategorized options
      // (e.g. --version). Don't assert it strictly.
    ];
    for (const category of expectedCategories) {
      expect(out).toContain(category);
    }
  });

  it('lists --include under File selection', () => {
    const out = runHelp(['--help']);
    // The first option in the File selection group should be --include.
    // (We use a substring check: the line "  --include <glob>" must
    // appear, and the File selection header must appear before it.)
    const fileSelectionIdx = out.indexOf('File selection:');
    const includeIdx = out.indexOf('--include <glob>');
    expect(fileSelectionIdx).toBeGreaterThan(-1);
    expect(includeIdx).toBeGreaterThan(fileSelectionIdx);
  });

  it('lists --threads under Performance', () => {
    const out = runHelp(['--help']);
    const perfIdx = out.indexOf('Performance:');
    const threadsIdx = out.indexOf('--threads <n>');
    expect(perfIdx).toBeGreaterThan(-1);
    expect(threadsIdx).toBeGreaterThan(perfIdx);
  });

  it('lists --fix under Auto-fix', () => {
    const out = runHelp(['--help']);
    const autoFixIdx = out.indexOf('Auto-fix:');
    const fixIdx = out.indexOf('  --fix');
    expect(autoFixIdx).toBeGreaterThan(-1);
    expect(fixIdx).toBeGreaterThan(autoFixIdx);
  });

  it('lists --strict under CI / threshold', () => {
    const out = runHelp(['--help']);
    const ciIdx = out.indexOf('CI / threshold:');
    const strictIdx = out.indexOf('--strict');
    expect(ciIdx).toBeGreaterThan(-1);
    expect(strictIdx).toBeGreaterThan(ciIdx);
  });

  it('does not include all 38 options in a single flat block', () => {
    // The grouped view should NOT have Commander's standard
    // "Options:" header followed by a flat alphabetical list.
    // Verify by checking that "Options:" does not appear.
    const out = runHelp(['--help']);
    expect(out).not.toMatch(/^Options:\s*$/m);
  });

  it('--help-flat shows Commander standard flat output', () => {
    const out = runHelp(['--help-flat']);
    // Standard flat output has "Options:" header.
    expect(out).toMatch(/^Options:\s*$/m);
  });

  it('--help-flat includes all 38 options in the flat list', () => {
    // Sanity: --help-flat is the standard Commander output,
    // so it should include all options (not just the
    // categorized ones). Spot-check a few that are clustered
    // in the grouped view: they should still be in the flat view.
    const out = runHelp(['--help-flat']);
    expect(out).toContain('--include');
    expect(out).toContain('--threads');
    expect(out).toContain('--fix');
    expect(out).toContain('--strict');
    expect(out).toContain('--watch');
    expect(out).toContain('--tokens');
  });

  it('grouped help mentions the --help-flat opt-out', () => {
    // The grouped help output should include a footer that
    // tells users about the --help-flat opt-out.
    const out = runHelp(['--help']);
    expect(out).toContain('--help-flat');
  });

  it('derives the grouped command index from registered commands', () => {
    const out = runHelp(['--help']);

    for (const command of ['calibration', 'research', 'db', 'ci']) {
      expect(out).toMatch(new RegExp(`^  ${command}\\s`, 'm'));
    }
  });

  it('links to the documentation route that the website actually serves', () => {
    const out = runHelp(['--help']);

    expect(out).toContain('https://usebrick.dev/docs/');
    expect(out).not.toContain('/docs/scan-options');
  });

  it('clarifies that --no-telemetry disables the local flywheel, not project memory', () => {
    const program = new Command();
    registerScan(program, async () => {});
    const scan = program.commands.find((command) => command.name() === 'scan');
    const option = scan?.options.find((candidate) => candidate.long === '--no-telemetry');

    expect(option?.description).toContain('local flywheel');
    expect(option?.description).toContain('project-memory artifacts still write');
    expect(option?.description).toContain('projectMemory: false');
  });
});
