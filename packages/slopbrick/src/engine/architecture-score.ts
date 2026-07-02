// Architecture Consistency Score (0–100).
//
// Aggregates cross-file pattern detection into a single number that
// reflects how consistent a repository's chosen libraries + patterns
// are. Designed to be the headline metric that distinguishes
// slopbrick from rule-counting linters (ESLint, SonarQube, Semgrep).
//
// Categories inspected:
//   1. Modal/Dialog systems       — extra copies beyond the first  → -12 each
//   2. Button component variants   — extra copies beyond the first  →  -8 each
//   3. API client modules          — extra copies beyond the first  → -10 each
//   4. State management libraries  — extra libs beyond the first     → -15 each
//   5. Data-fetching libraries     — extra libs beyond the first     → -10 each
//   6. Spacing-scale violations    — 1 point per 5 findings          →  -1 per 5
//   7. Radius-scale violations     — 1 point per 5 findings          →  -1 per 5
//   8. Cross-file drift (v0.9.2)   — per-extra-variant per stem      → -10 each
//   9. Cross-category drift        — same stem in 2+ categories      → -15 per stem
//
// The formula is intentionally simple (subtractive from 100, clamped
// to [0, 100]) so the per-category breakdown is auditable. A project
// with 1 modal, 1 button, 1 api client, 1 state lib, 1 fetch lib, no
// drift, and no off-scale values lands at 100. A project with 3
// modal systems, 4 button variants, 2 state libs (zustand + redux)
// lands at 100 - 24 - 24 - 15 = 37.
//
// Cross-file drift closes the gap the lens exposes: "did this code
// introduce a new pattern when an existing pattern already existed?"
// Three ways to do the same thing (e.g. UserService + UserManager +
// UserHandler) is worse than two different state libs, because the
// drift represents ongoing, in-repo inconsistency rather than a
// finished migration.
//
// Pattern detection reuses buildPatternInventory from
// src/mcp/patterns.ts. Scale-violation counts come from running the
// spacing-scale + radius-scale rules across the project. Drift
// detection reuses the cluster.ts helpers.

import { buildPatternInventory } from '../mcp/patterns.js';
import type { PatternInventory } from '../mcp/patterns.js';
import { detectCrossFileDrift, detectCrossCategoryDrift } from '@usebrick/engine';
import type { CrossFileDriftSignal, CrossCategoryDrift as CrossCategoryDriftSignal } from '@usebrick/engine';
import { parseFile } from '@usebrick/engine';
import { extractFacts } from './visitor.js';
import { spacingScaleViolationRule } from '../rules/visual/spacing-scale-violation.js';
import { radiusScaleViolationRule } from '../rules/visual/radius-scale-violation.js';
import { discoverFiles } from './discover.js';
import type { ResolvedConfig, RuleContext, FileScanResult } from '../types';

export interface CategoryDeduction {
  category: string;
  count: number;
  /** Weight per unit (per-extra or per-N-findings). */
  weight: number;
  /** Total deduction applied to the score. */
  deduction: number;
  /** Human-readable summary, e.g. "3 modal systems, 2 beyond baseline". */
  summary: string;
  /** Concrete findings (filenames, category labels, etc.). */
  findings: string[];
}

export interface ArchitectureScore {
  /** Final 0-100 score (100 = perfectly consistent). */
  score: number;
  /** How many files were scanned to produce the score. */
  scannedFiles: number;
  /** Per-category breakdown. */
  deductions: CategoryDeduction[];
  /** Highest-level summary line, e.g. "Architecture consistency: 71/100". */
  headline: string;
  /** v0.9.2 — Cross-file drift signals (stem → variants in 1 category). */
  driftSignals: CrossFileDriftSignal[];
  /** v0.9.2 — Cross-category drift (same stem in 2+ categories). */
  crossCategoryDrift: CrossCategoryDriftSignal[];
  /**
   * v0.10 — KL divergence novelty (Kullback & Leibler 1951).
   * Reserved field; populated in the v0.10.5 follow-up once the
   * corpus baseline lands. Undefined on this commit.
   */
  klNovelty?: number;
}

const WEIGHTS = {
  modal: 12,
  button: 8,
  api: 10,
  state: 15,
  fetching: 10,
  /** Scale violations: per-5-findings weight. */
  spacingScalePerFive: 1,
  radiusScalePerFive: 1,
  /** v0.9.2 — per-extra-variant weight for cross-file drift. The first
   *  variant of a stem is the baseline; the second, third, ... each
   *  incur a deduction. */
  crossFileDrift: 10,
  /** v0.9.2 — flat penalty per stem that appears in 2+ categories. This
   *  captures a deeper incoherence (one conceptual entity realised
   *  across multiple roles) on top of the per-category drift cost. */
  crossCategoryDrift: 15,
} as const;

const SCALE_VIOLATIONS_PER_DEDUCTION_UNIT = 5;

/**
 * Build the architecture consistency score for a project.
 *
 * Combines pattern inventory (modal/button/api/state/fetching) with
 * a quick scale-violation sweep. Returns a structured report with
 * per-category findings.
 *
 * Refactor 2: when the caller has already scanned (the CLI main scan
 * path), pass `results` to reuse the pre-extracted `facts` from each
 * FileScanResult. This eliminates a second parse + extractFacts call
 * per file in the scale-violation sweep.
 */
export async function buildArchitectureScore(
  cwd: string,
  config: ResolvedConfig,
  maxFiles = 500,
  results?: FileScanResult[],
): Promise<ArchitectureScore> {
  const inventory = await buildPatternInventory(cwd, config, maxFiles);
  const scaleIssues = await collectScaleViolations(cwd, config, maxFiles, results);
  const scannedFiles = inventory.scannedFiles;

  // v0.9.2 — detect drift from the same inventory used above. Computing
  // it here (rather than calling detectCrossFileDrift from the CLI) lets
  // the headline score reflect what the user sees in the pretty-report
  // drift section, and removes a duplicate buildPatternInventory call.
  const driftSignals = detectCrossFileDrift(inventory);
  const crossCategoryDrift = detectCrossCategoryDrift(driftSignals);

  const deductions: CategoryDeduction[] = [];

  // Modal systems: count distinct modal-class names (>= 1) and deduct per extra.
  const modalCount = inventory.patterns.modal.length;
  if (modalCount > 1) {
    deductions.push({
      category: 'modalSystems',
      count: modalCount,
      weight: WEIGHTS.modal,
      deduction: (modalCount - 1) * WEIGHTS.modal,
      summary: `${modalCount} modal/dialog systems, ${modalCount - 1} beyond baseline`,
      findings: inventory.patterns.modal.map((m) => `${m.name} (${m.files.length} files)`),
    });
  }

  // Button variants.
  const buttonCount = inventory.patterns.button.length;
  if (buttonCount > 1) {
    deductions.push({
      category: 'buttonVariants',
      count: buttonCount,
      weight: WEIGHTS.button,
      deduction: (buttonCount - 1) * WEIGHTS.button,
      summary: `${buttonCount} button components, ${buttonCount - 1} beyond baseline`,
      findings: inventory.patterns.button.map((b) => `${b.name} (${b.files.length} files)`),
    });
  }

  // API client modules (lib/api, services/, etc.).
  const apiFileCount = inventory.patterns.api.reduce((sum, m) => sum + m.files.length, 0);
  if (apiFileCount > 1) {
    deductions.push({
      category: 'apiClientModules',
      count: apiFileCount,
      weight: WEIGHTS.api,
      deduction: (apiFileCount - 1) * WEIGHTS.api,
      summary: `${apiFileCount} api-client modules, ${apiFileCount - 1} beyond baseline`,
      findings: inventory.patterns.api.flatMap((m) => m.files),
    });
  }

  // State-management libraries (zustand, redux, jotai, etc.).
  const stateLibs = inventory.patterns.state.map((s) => s.name);
  if (stateLibs.length > 1) {
    deductions.push({
      category: 'stateLibraries',
      count: stateLibs.length,
      weight: WEIGHTS.state,
      deduction: (stateLibs.length - 1) * WEIGHTS.state,
      summary: `${stateLibs.length} state libraries (${stateLibs.join(', ')}), ${
        stateLibs.length - 1
      } beyond baseline`,
      findings: inventory.patterns.state.map(
        (s) => `${s.name} via ${s.imports.join(', ')}`,
      ),
    });
  }

  // Data-fetching libraries.
  const fetchLibs = inventory.patterns.dataFetching.map((s) => s.name);
  if (fetchLibs.length > 1) {
    deductions.push({
      category: 'dataFetchLibraries',
      count: fetchLibs.length,
      weight: WEIGHTS.fetching,
      deduction: (fetchLibs.length - 1) * WEIGHTS.fetching,
      summary: `${fetchLibs.length} data-fetching libraries (${fetchLibs.join(', ')}), ${
        fetchLibs.length - 1
      } beyond baseline`,
      findings: inventory.patterns.dataFetching.map(
        (s) => `${s.name} via ${s.imports.join(', ')}`,
      ),
    });
  }

  // Scale violations: each set of 5 findings deducts 1 point.
  const spacingCount = scaleIssues.spacing;
  if (spacingCount > 0) {
    const units = Math.ceil(spacingCount / SCALE_VIOLATIONS_PER_DEDUCTION_UNIT);
    deductions.push({
      category: 'spacingScaleViolations',
      count: spacingCount,
      weight: WEIGHTS.spacingScalePerFive,
      deduction: units * WEIGHTS.spacingScalePerFive,
      summary: `${spacingCount} off-scale spacing values (${units} deduction units)`,
      findings: [],
    });
  }
  const radiusCount = scaleIssues.radius;
  if (radiusCount > 0) {
    const units = Math.ceil(radiusCount / SCALE_VIOLATIONS_PER_DEDUCTION_UNIT);
    deductions.push({
      category: 'radiusScaleViolations',
      count: radiusCount,
      weight: WEIGHTS.radiusScalePerFive,
      deduction: units * WEIGHTS.radiusScalePerFive,
      summary: `${radiusCount} off-scale radius values (${units} deduction units)`,
      findings: [],
    });
  }

  // v0.9.2 — cross-file drift: per-extra-variant per stem.
  // 3 variants on the same stem → (3-1) * 10 = 20 deduction.
  // Sorted signals are kept as-is; the user's pretty-report grouping
  // already orders by variant-count desc, and the per-signal findings
  // list carries enough context.
  if (driftSignals.length > 0) {
    const totalExtras = driftSignals.reduce(
      (sum, s) => sum + Math.max(0, s.variants.length - 1),
      0,
    );
    const deduction = totalExtras * WEIGHTS.crossFileDrift;
    if (deduction > 0) {
      deductions.push({
        category: 'crossFileDrift',
        count: totalExtras,
        weight: WEIGHTS.crossFileDrift,
        deduction,
        summary: `${driftSignals.length} drift signal${driftSignals.length === 1 ? '' : 's'} (${totalExtras} extra variant${totalExtras === 1 ? '' : 's'} across stems)`,
        findings: driftSignals.flatMap((s) =>
          [`${s.category}: ${s.stem} → ${s.variants.join(', ')}`],
        ),
      });
    }
  }

  // v0.9.2 — cross-category drift: same stem in 2+ categories. Flat
  // per-stem deduction because the cost is qualitative (you have the
  // same conceptual entity spanning multiple roles), not variant-count.
  if (crossCategoryDrift.length > 0) {
    const deduction = crossCategoryDrift.length * WEIGHTS.crossCategoryDrift;
    deductions.push({
      category: 'crossCategoryDrift',
      count: crossCategoryDrift.length,
      weight: WEIGHTS.crossCategoryDrift,
      deduction,
      summary: `${crossCategoryDrift.length} stem${crossCategoryDrift.length === 1 ? '' : 's'} spanning 2+ categories`,
      findings: crossCategoryDrift.map(
        (d) => `${d.stem}: ${Array.from(d.byCategory.entries()).map(([cat, vars]) => `${cat}[${vars.join(',')}]`).join(' / ')}`,
      ),
    });
  }

  const totalDeduction = deductions.reduce((sum, d) => sum + d.deduction, 0);
  const score = Math.max(0, Math.min(100, 100 - totalDeduction));

  return {
    score,
    scannedFiles,
    deductions,
    headline: `Architecture consistency: ${score}/100`,
    driftSignals,
    crossCategoryDrift,
    // v0.10 — reserved; populated in v0.10.5 once the corpus baseline
    // (and per-category P_corpus) lands. Undefined for now.
    klNovelty: undefined,
  };
}

/**
 * Run the spacing-scale + radius-scale rules across the project and
 * count the issues.
 *
 * Refactor 2: when `results` is supplied (the CLI scan path), reuse the
 * pre-extracted facts from the main scan — no second parse, no second
 * file read, no second extractFacts call per file. When `results` is
 * omitted (standalone call from tests / `--architecture` without a prior
 * scan), fall back to file discovery + parse.
 */
async function collectScaleViolations(
  cwd: string,
  config: ResolvedConfig,
  maxFiles: number,
  results?: FileScanResult[],
): Promise<{ spacing: number; radius: number }> {
  let spacing = 0;
  let radius = 0;

  if (results) {
    // Reuse facts from the main scan.
    for (const r of results.slice(0, maxFiles)) {
      if (!r.facts) continue;
      const ctx: RuleContext = { config, filePath: r.filePath, cwd };
      const spacingCtx = spacingScaleViolationRule.create(ctx);
      const radiusCtx = radiusScaleViolationRule.create(ctx);
      spacing += spacingScaleViolationRule.analyze(spacingCtx, r.facts).length;
      radius += radiusScaleViolationRule.analyze(radiusCtx, r.facts).length;
    }
    return { spacing, radius };
  }

  // Standalone path — file discovery + parse + extract.
  const files = (await discoverFiles(cwd, config)).slice(0, maxFiles);
  for (const filePath of files) {
    let facts: ReturnType<typeof extractFacts>;
    try {
      const { ast, source } = await parseFile(filePath);
      facts = extractFacts(filePath, ast, source);
    } catch {
      continue;
    }
    const ctx: RuleContext = { config, filePath, cwd };
    const spacingCtx = spacingScaleViolationRule.create(ctx);
    const radiusCtx = radiusScaleViolationRule.create(ctx);
    spacing += spacingScaleViolationRule.analyze(spacingCtx, facts).length;
    radius += radiusScaleViolationRule.analyze(radiusCtx, facts).length;
  }
  return { spacing, radius };
}

/**
 * Render the score as a human-readable text block.
 */
export function formatArchitectureScore(score: ArchitectureScore): string {
  const lines: string[] = [];
  lines.push(score.headline);
  lines.push('');
  lines.push(`  Scanned files: ${score.scannedFiles}`);
  if (score.deductions.length === 0) {
    lines.push('  No architectural drift detected. ✓');
    return lines.join('\n');
  }
  lines.push('');
  lines.push('  Deductions:');
  // Sort by deduction descending so the worst offenders come first.
  const sorted = [...score.deductions].sort((a, b) => b.deduction - a.deduction);
  for (const d of sorted) {
    lines.push(`    [${d.category}] -${d.deduction}`);
    lines.push(`        ${d.summary}`);
    for (const f of d.findings.slice(0, 5)) {
      lines.push(`        · ${f}`);
    }
    if (d.findings.length > 5) {
      lines.push(`        · …and ${d.findings.length - 5} more`);
    }
  }
  return lines.join('\n');
}

// Internal helper exported for tests that want to assert category weights.
export const ARCHITECTURE_SCORE_WEIGHTS = WEIGHTS;

// Re-export for callers that want to inject a pre-built inventory.
export interface ScoreInputs {
  inventory: PatternInventory;
  scaleIssues: { spacing: number; radius: number };
  /** v0.9.2 — optional pre-computed drift. If omitted, drift is
   *  computed from the inventory (mirrors buildArchitectureScore). */
  driftSignals?: CrossFileDriftSignal[];
  crossCategoryDrift?: CrossCategoryDriftSignal[];
}

export function buildArchitectureScoreFromInputs(
  inputs: ScoreInputs,
  scannedFiles: number,
): ArchitectureScore {
  // Mostly duplicates buildArchitectureScore's deduction logic but
  // takes pre-built data — useful for unit tests with synthetic
  // inventories. Kept as a separate function so the integration path
  // (file scan) and the unit-test path (handcrafted inputs) stay
  // independently testable.
  const { inventory, scaleIssues } = inputs;
  const driftSignals = inputs.driftSignals ?? detectCrossFileDrift(inventory);
  const crossCategoryDrift =
    inputs.crossCategoryDrift ?? detectCrossCategoryDrift(driftSignals);
  const deductions: CategoryDeduction[] = [];

  const modalCount = inventory.patterns.modal.length;
  if (modalCount > 1) {
    deductions.push({
      category: 'modalSystems',
      count: modalCount,
      weight: WEIGHTS.modal,
      deduction: (modalCount - 1) * WEIGHTS.modal,
      summary: `${modalCount} modal/dialog systems, ${modalCount - 1} beyond baseline`,
      findings: inventory.patterns.modal.map((m) => `${m.name} (${m.files.length} files)`),
    });
  }
  const buttonCount = inventory.patterns.button.length;
  if (buttonCount > 1) {
    deductions.push({
      category: 'buttonVariants',
      count: buttonCount,
      weight: WEIGHTS.button,
      deduction: (buttonCount - 1) * WEIGHTS.button,
      summary: `${buttonCount} button components, ${buttonCount - 1} beyond baseline`,
      findings: inventory.patterns.button.map((b) => `${b.name} (${b.files.length} files)`),
    });
  }
  const apiFileCount = inventory.patterns.api.reduce((sum, m) => sum + m.files.length, 0);
  if (apiFileCount > 1) {
    deductions.push({
      category: 'apiClientModules',
      count: apiFileCount,
      weight: WEIGHTS.api,
      deduction: (apiFileCount - 1) * WEIGHTS.api,
      summary: `${apiFileCount} api-client modules, ${apiFileCount - 1} beyond baseline`,
      findings: inventory.patterns.api.flatMap((m) => m.files),
    });
  }
  const stateLibs = inventory.patterns.state.map((s) => s.name);
  if (stateLibs.length > 1) {
    deductions.push({
      category: 'stateLibraries',
      count: stateLibs.length,
      weight: WEIGHTS.state,
      deduction: (stateLibs.length - 1) * WEIGHTS.state,
      summary: `${stateLibs.length} state libraries, ${stateLibs.length - 1} beyond baseline`,
      findings: inventory.patterns.state.map((s) => `${s.name}`),
    });
  }
  const fetchLibs = inventory.patterns.dataFetching.map((s) => s.name);
  if (fetchLibs.length > 1) {
    deductions.push({
      category: 'dataFetchLibraries',
      count: fetchLibs.length,
      weight: WEIGHTS.fetching,
      deduction: (fetchLibs.length - 1) * WEIGHTS.fetching,
      summary: `${fetchLibs.length} data-fetching libraries, ${fetchLibs.length - 1} beyond baseline`,
      findings: inventory.patterns.dataFetching.map((s) => `${s.name}`),
    });
  }
  const spacingCount = scaleIssues.spacing;
  if (spacingCount > 0) {
    const units = Math.ceil(spacingCount / SCALE_VIOLATIONS_PER_DEDUCTION_UNIT);
    deductions.push({
      category: 'spacingScaleViolations',
      count: spacingCount,
      weight: WEIGHTS.spacingScalePerFive,
      deduction: units * WEIGHTS.spacingScalePerFive,
      summary: `${spacingCount} off-scale spacing values`,
      findings: [],
    });
  }
  const radiusCount = scaleIssues.radius;
  if (radiusCount > 0) {
    const units = Math.ceil(radiusCount / SCALE_VIOLATIONS_PER_DEDUCTION_UNIT);
    deductions.push({
      category: 'radiusScaleViolations',
      count: radiusCount,
      weight: WEIGHTS.radiusScalePerFive,
      deduction: units * WEIGHTS.radiusScalePerFive,
      summary: `${radiusCount} off-scale radius values`,
      findings: [],
    });
  }

  // Cross-file drift (v0.9.2).
  if (driftSignals.length > 0) {
    const totalExtras = driftSignals.reduce(
      (sum, s) => sum + Math.max(0, s.variants.length - 1),
      0,
    );
    const deduction = totalExtras * WEIGHTS.crossFileDrift;
    if (deduction > 0) {
      deductions.push({
        category: 'crossFileDrift',
        count: totalExtras,
        weight: WEIGHTS.crossFileDrift,
        deduction,
        summary: `${driftSignals.length} drift signal${driftSignals.length === 1 ? '' : 's'} (${totalExtras} extra variant${totalExtras === 1 ? '' : 's'})`,
        findings: driftSignals.flatMap((s) =>
          [`${s.category}: ${s.stem} → ${s.variants.join(', ')}`],
        ),
      });
    }
  }

  // Cross-category drift (v0.9.2).
  if (crossCategoryDrift.length > 0) {
    const deduction = crossCategoryDrift.length * WEIGHTS.crossCategoryDrift;
    deductions.push({
      category: 'crossCategoryDrift',
      count: crossCategoryDrift.length,
      weight: WEIGHTS.crossCategoryDrift,
      deduction,
      summary: `${crossCategoryDrift.length} stem${crossCategoryDrift.length === 1 ? '' : 's'} spanning 2+ categories`,
      findings: crossCategoryDrift.map(
        (d) => `${d.stem}: ${Array.from(d.byCategory.entries()).map(([cat, vars]) => `${cat}[${vars.join(',')}]`).join(' / ')}`,
      ),
    });
  }

  const totalDeduction = deductions.reduce((sum, d) => sum + d.deduction, 0);
  const score = Math.max(0, Math.min(100, 100 - totalDeduction));
  return {
    score,
    scannedFiles,
    deductions,
    headline: `Architecture consistency: ${score}/100`,
    driftSignals,
    crossCategoryDrift,
    // v0.10 — reserved; populated in v0.10.5 once the corpus baseline
    // (and per-category P_corpus) lands. Undefined for now.
    klNovelty: undefined,
  };
}