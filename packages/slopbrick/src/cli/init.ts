// Init wizard + diagnostics for slopbrick.
//
//   - runInitWizard — interactive setup prompts (framework, styling,
//     ui-libraries, strictness). Powers `slopbrick init`.
//   - runDoctor — pre-flight environment check (node version, config
//     file, git repo, parser, registry, baseline, source files).
//     Powers both the `doctor` subcommand and `--doctor` flag.
//
// `runInitWizard` is exported as part of the public API (re-exported via
// ./program for backward compat with src/index.ts).
// `runDoctor` is internal — called only from ./program.ts.

import { existsSync, writeFileSync, readFileSync, mkdirSync, rmSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { createInterface, type Interface as ReadlineInterface } from 'node:readline';

import {
  loadConfig,
  detectStylingSolution,
  resolveConfigPath as findConfigPath,
  type Framework,
  type StylingSolution,
  type UiLibrary,
  type Strictness,
  type WizardAnswers,
  type ResolvedConfig,
  detectConstitution,
  formatConstitution,
} from '../config';
import { discoverFiles } from '../engine/discover.js';
import { getGitHead } from './git.js';
import {
  loadBaseline,
  validateBaseline,
  hashConfig,
} from '../engine/cache';
import { logger } from '../engine/logger';
import {
  refreshRegistrySnapshot,
  copyBundledSnapshotToCache,
  isRegistryFresh,
  BUNDLED_REGISTRY_VERSION,
} from '../rules/registry-loader';

export function isInteractive(): boolean {
  return process.stdin.isTTY === true && process.stdout.isTTY === true && !process.env.CI;
}

const FRAMEWORK_OPTIONS: Framework[] = [
  'react',
  'vue',
  'svelte',
  'solid',
  'qwik',
  'astro',
  'react-native',
  'expo',
];

const STYLING_OPTIONS: StylingSolution[] = [
  'tailwind',
  'css-modules',
  'styled-components',
  'emotion',
  'panda',
  'other',
];

const UI_LIBRARY_OPTIONS: UiLibrary[] = ['shadcn/ui', 'mui', 'chakra', 'radix', 'tamagui', 'nativewind'];

const STRICTNESS_OPTIONS: Strictness[] = ['strict', 'balanced', 'permissive'];

const STRUCTURE_OPTIONS = ['feature-based', 'layer-based', 'flat', 'monorepo', 'other'] as const;

/**
 * v0.14.5d: free-text prompt for the open PickBrick categories
 * (state, auth, forms, testing). The PickBrick wizard in the user
 * brief lists specific canonical libraries (Zustand, NextAuth, etc.)
 * but in practice teams use any of a long tail. Accepting free text
 * matches how `slopbrick scan` detects packages — by npm-name
 * presence, not by whitelist membership — so the user can declare
 * their actual library.
 *
 * Empty input is allowed and returns `undefined`, which
 * `buildInitConfig` interprets as "this category is deliberately
 * undeclared" (the Constitution stays empty for the field).
 */
function promptText(
  rl: ReadlineInterface,
  question: string,
  detected: string,
): Promise<string | undefined> {
  return new Promise((resolve) => {
    const lines = [
      `? ${question} (detected: ${detected || 'none'}) — npm package name, or Enter to skip:`,
    ];
    rl.question(lines.join('\n') + '\n', (answer) => {
      const trimmed = answer.trim();
      if (trimmed === '') {
        resolve(undefined);
        return;
      }
      resolve(trimmed);
    });
  });
}

function promptSingleSelect<T extends string>(
  rl: ReadlineInterface,
  question: string,
  options: T[],
  defaultValue: T,
): Promise<T> {
  const defaultIndex = options.indexOf(defaultValue);
  const safeDefaultIndex = defaultIndex >= 0 ? defaultIndex : 0;
  const safeDefaultValue = options[safeDefaultIndex];

  return new Promise((resolve) => {
    function ask(): void {
      const lines = [
        `? ${question} (detected: ${safeDefaultValue}):`,
        ...options.map((opt, i) => `  ${i + 1}) ${opt}`),
        `  Press Enter to accept default (${safeDefaultIndex + 1}), or type a number:`,
      ];
      rl.question(lines.join('\n') + '\n', (answer) => {
        const trimmed = answer.trim();
        if (trimmed === '') {
          resolve(safeDefaultValue);
          return;
        }
        const num = parseInt(trimmed, 10);
        if (Number.isNaN(num) || num < 1 || num > options.length) {
          rl.write('Invalid selection. Please try again.\n');
          ask();
          return;
        }
        resolve(options[num - 1]);
      });
    }
    ask();
  });
}

function promptMultiSelect<T extends string>(
  rl: ReadlineInterface,
  question: string,
  options: T[],
  defaultValue: T[],
): Promise<T[]> {
  const defaultIndices = defaultValue.map((v) => options.indexOf(v)).filter((i) => i >= 0);
  const defaultDisplay = defaultValue.length > 0 ? defaultValue.join(', ') : 'none';
  const defaultNumbers =
    defaultIndices.length > 0 ? defaultIndices.map((i) => i + 2).join(',') : '1';

  return new Promise((resolve) => {
    function ask(): void {
      const lines = [
        `? ${question} (detected: ${defaultDisplay}):`,
        `  1) none`,
        ...options.map((opt, i) => `  ${i + 2}) ${opt}`),
        `Enter numbers separated by commas (default: ${defaultNumbers}):`,
      ];
      rl.question(lines.join('\n') + '\n', (answer) => {
        const trimmed = answer.trim();
        if (trimmed === '') {
          resolve(defaultValue.length > 0 ? defaultValue : []);
          return;
        }
        const numbers = trimmed
          .split(',')
          .map((s) => parseInt(s.trim(), 10))
          .filter((n) => !Number.isNaN(n));
        if (numbers.length === 0 || numbers.some((n) => n < 1 || n > options.length + 1)) {
          rl.write('Invalid selection. Please try again.\n');
          ask();
          return;
        }
        if (numbers.includes(1)) {
          resolve([]);
          return;
        }
        const selected = [...new Set(numbers.map((n) => options[n - 2]))];
        resolve(selected);
      });
    }
    ask();
  });
}

export async function runInitWizard(
  cwd: string,
  detected: Partial<ResolvedConfig>,
  options?: { input?: NodeJS.ReadableStream; output?: NodeJS.WritableStream },
): Promise<WizardAnswers> {
  const input = options?.input ?? process.stdin;
  const output = options?.output ?? process.stdout;
  const rl = createInterface({ input, output });

  try {
    const detectedFramework = detected.framework as Framework | undefined;
    const defaultFramework =
      detectedFramework && FRAMEWORK_OPTIONS.includes(detectedFramework) ? detectedFramework : 'react';
    const framework = await promptSingleSelect(rl, 'Framework', FRAMEWORK_OPTIONS, defaultFramework);

    const detectedStyling = detectStylingSolution(cwd);
    const defaultStyling = STYLING_OPTIONS.includes(detectedStyling) ? detectedStyling : 'other';
    const styling = await promptSingleSelect(rl, 'Styling solution', STYLING_OPTIONS, defaultStyling);

    const detectedUi = (detected.uiLibraries ?? []).filter((lib: string): lib is UiLibrary =>
      UI_LIBRARY_OPTIONS.includes(lib as UiLibrary),
    );
    const uiLibraries = await promptMultiSelect(rl, 'UI libraries', UI_LIBRARY_OPTIONS, detectedUi);

    const strictness = await promptSingleSelect(rl, 'Strictness', STRICTNESS_OPTIONS, 'balanced');

    // v0.14.5d: PickBrick taxonomy — the four open categories. Free
    // text (state / auth / forms / testing) so the user can declare
    // their actual library without a hardcoded whitelist; a 5-option
    // picker for structure. All optional — Enter-to-skip means the
    // field is undeclared in the Constitution.
    const stateManagement = await promptText(rl, 'State management', '');
    const auth = await promptText(rl, 'Auth', '');
    const forms = await promptText(rl, 'Forms (validation lib, e.g. zod)', '');
    const testing = await promptText(rl, 'Testing (e.g. vitest, jest, playwright)', '');
    const structure = await promptSingleSelect(
      rl,
      'Project structure',
      [...STRUCTURE_OPTIONS],
      'feature-based',
    );

    // Round 23: surface auto-detected constitution in the wizard's
    // final summary so users see what slopbrick inferred before
    // writing the config file. They can later override any field in
    // slopbrick.config.mjs.
    const detectedConstitution = detectConstitution(cwd);
    if (detectedConstitution && Object.keys(detectedConstitution).length > 0) {
      rl.write('\nDetected constitution (will be written to constitution field):\n');
      rl.write(formatConstitution(detectedConstitution) + '\n\n');
    }

    return {
      framework,
      styling,
      uiLibraries,
      strictness,
      stateManagement,
      auth,
      forms,
      testing,
      structure,
    };
  } finally {
    rl.close();
  }
}

/**
 * Pre-flight check for common setup problems. Used by the
 * `slopbrick doctor` subcommand and the `--doctor` flag on
 * `scan`. Returns an exit code:
 *   0 = ok (no warnings)
 *   1 = warnings present (Refactor 1: previously was 0, masking setup issues)
 *   3 = fatal (can't run slopbrick)
 */
export async function runDoctor(cwd: string): Promise<number> {
  let exitCode = 0;
  let warnCount = 0;
  const lines: string[] = [];
  const ok = (s: string) => lines.push(`  ✓ ${s}`);
  const warn = (s: string) => {
    lines.push(`  ⚠ ${s}`);
    warnCount += 1;
  };
  const fail = (s: string) => lines.push(`  ✗ ${s}`);

  lines.push('slopbrick doctor\n');
  lines.push('Checking your setup:\n');

  // 1. Node version
  const nodeMajor = parseInt(process.versions.node.split('.')[0] ?? '0', 10);
  if (nodeMajor >= 20) ok(`Node ${process.versions.node}`);
  else fail(`Node ${process.versions.node} — slopbrick needs Node 20 or newer. Run: nvm install 20`);

  lines.push(`\n  Working in: ${cwd}`);

  // 2. Config file
  try {
    const config = await loadConfig(cwd);
    lines.push(`\n  ✓ Config loaded from: ${findConfigPath(cwd) ?? '(default)'}`);
    const ruleCount = Object.keys(config.rules ?? {}).length;
    lines.push(`    ${ruleCount} rules configured in your config file.`);
  } catch (error) {
    fail(`Could not read your config: ${(error as Error).message}`);
    exitCode = 3;
  }

  // 3. Git repo
  try {
    const head = await getGitHead(cwd);
    if (head) ok(`Git repository detected (HEAD: ${head.slice(0, 8)})`);
    else warn('A Git repo exists but HEAD is empty (no commits yet). Some commands need at least one commit.');
  } catch {
    warn('Not a Git repository. Some commands (--staged, --changed, --since) need Git.');
  }

  // 4. SWC parser bindings
  try {
    const { parseFile: tryParse } = await import('@usebrick/engine');
    const testFile = join(cwd, '.slopbrick', '.doctor-test.ts');
    mkdirSync(dirname(testFile), { recursive: true });
    writeFileSync(testFile, 'export const x = 1;\n');
    await tryParse(testFile);
    rmSync(testFile, { force: true });
    ok('Parser is working.');
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    fail(`Parser binding check failed: ${message}. Try: pnpm install`);
    exitCode = 3;
  }

  // 5. shadcn/ui registry snapshot freshness
  const refresh = await refreshRegistrySnapshot(cwd);
  if (!refresh.ok) {
    copyBundledSnapshotToCache(cwd);
  }
  const fresh = isRegistryFresh(cwd);
  if (!fresh) {
    warn(`shadcn/ui registry snapshot is missing or older than bundled version ${BUNDLED_REGISTRY_VERSION}. Run \`slopbrick scan\` to refresh.`);
  } else {
    ok('shadcn/ui registry snapshot is up-to-date.');
  }
  lines.push(`  ${refresh.message}`);

  // 6. Baseline cache structural integrity
  const baselineCache = loadBaseline(cwd);
  if (baselineCache) {
    const configHash = hashConfig(await loadConfig(cwd));
    const gitHead = (await getGitHead(cwd)) ?? 'unknown';
    const validation = validateBaseline(baselineCache, configHash, gitHead);
    if (validation.valid) {
      ok('Baseline cache is structurally valid and matches config/git state.');
    } else {
      warn(`Baseline cache invalid: ${validation.reason}. Run \`slopbrick scan --baseline\` to recalibrate.`);
    }
  } else {
    lines.push("  (No baseline cache yet — that's fine. Run `slopbrick scan --baseline` to create one.)");
  }

  // 7. Working tree: any source files to scan?
  try {
    const cfg = await loadConfig(cwd);
    const files = await discoverFiles(cwd, cfg);
    const scannable = files.filter((f: string) => /\.(tsx?|jsx?|vue|svelte|astro|mdx?)$/i.test(f));
    if (scannable.length > 0) {
      ok(`Found ${scannable.length} source files to scan.`);
    } else {
      warn('No source files (.ts/.tsx/.js/.jsx/.vue/.svelte/.astro/.mdx) found in this directory.');
    }
  } catch {
    // discovery failure is not fatal
  }

  // 8. Repository Memory artifacts: .slopbrick/{inventory,constitution,health}.json + memory.md
  // v0.14.5d: the scan now writes all four artifacts atomically. Verify
  // each one is present + schema-valid, and warn if missing so the user
  // knows MCP `slop_suggest_with_memory` and external integrations will
  // fall back to a re-scan.
  const { existsSync: exists } = await import('node:fs');
  const { join: pjoin } = await import('node:path');
  const { loadInventory, loadConstitution, loadHealth } = await import('@usebrick/core');
  const { readStructureMarkdown } = await import('../engine/structure-md');

  const inv = loadInventory(cwd);
  if (inv) {
    ok(`.slopbrick/inventory.json present (${inv.patterns.length} patterns, ${inv.components.length} components).`);
  } else if (exists(pjoin(cwd, '.slopbrick', 'inventory.json'))) {
    warn('.slopbrick/inventory.json exists but failed schema validation. Run `slopbrick scan` to refresh.');
  } else {
    warn('No .slopbrick/inventory.json — MCP and external agents cannot read detected patterns. Run `slopbrick scan`.');
  }

  const con = loadConstitution(cwd);
  if (con) {
    const decl = Object.keys(con.declared).length;
    const forb = con.forbidden.length + con.forbiddenPrefixes.length;
    ok(`.slopbrick/constitution.json present (${decl} declared categories, ${forb} forbidden entries).`);
  } else if (exists(pjoin(cwd, '.slopbrick', 'constitution.json'))) {
    warn('.slopbrick/constitution.json exists but failed schema validation. Run `slopbrick scan` to refresh.');
  } else {
    warn('No .slopbrick/constitution.json — `slopbrick drift` cannot check declared rules. Run `slopbrick scan` (or set one up via `slopbrick init`).');
  }

  const health = loadHealth(cwd);
  if (health) {
    ok(`.slopbrick/health.json present (repositoryHealth=${health.repositoryHealth}, ${health.issueCounts.high}H / ${health.issueCounts.medium}M / ${health.issueCounts.low}L).`);
  } else if (exists(pjoin(cwd, '.slopbrick', 'health.json'))) {
    warn('.slopbrick/health.json exists but failed schema validation. Run `slopbrick scan` to refresh.');
  } else {
    warn('No .slopbrick/health.json — dashboards/CI gates will not show current health. Run `slopbrick scan`.');
  }

  const md = await readStructureMarkdown(cwd);
  if (md && md.length > 0) {
    ok(`.slopbrick/structure.md present (${md.length} bytes — agent-readable summary).`);
  } else if (exists(pjoin(cwd, '.slopbrick', 'structure.md'))) {
    warn('.slopbrick/structure.md exists but is empty. Run `slopbrick scan` to regenerate.');
  } else {
    warn('No .slopbrick/structure.md — `slop_suggest_with_structure` MCP tool will fall back to re-scanning. Run `slopbrick scan`.');
  }

  // Warnings bump exit code to 1 so CI gates that check $? see them.
  if (warnCount > 0 && exitCode === 0) {
    exitCode = 1;
  }

  lines.push('\nDone. If anything is marked ✗ or ⚠, address it before running `slopbrick scan`.');
  logger.info(lines.join('\n'));
  return exitCode;
}

// Re-export the wizard answers type so callers can consume the result
// without reaching into ./config.
export type { WizardAnswers };