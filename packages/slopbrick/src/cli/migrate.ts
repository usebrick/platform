/**
 * v0.11.0 — `slopbrick migrate` — one-shot migration from slop-audit
 * (v0.10.x and earlier) to slopbrick (v0.11.0+).
 *
 * What it does:
 *   1. Renames `.slop-audit/` → `.slopbrick/`
 *   2. Renames `.slop-audit-cache.json` → `.slopbrick-cache.json`
 *   3. Renames `slop-audit.config.{mjs,cjs,js}` → `slopbrick.config.*`
 *   4. Bumps `version: '1'` → `version: '2'` in inventory.json + constitution.json
 *   5. Rewrites `.gitignore` lines that ignore `.slop-audit/` and
 *      `.slop-audit-cache.json` to use the new names.
 *
 * Idempotent: refuses to run if `.slopbrick/` already exists (unless
 * `--force` is passed). Re-running on a v2 project is a no-op success.
 *
 * `--dry-run` prints the planned moves without touching the filesystem.
 */

import { existsSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { logger } from '../engine/logger';

export interface MigratePlan {
  moves: Array<{ from: string; to: string; kind: 'dir' | 'file' | 'config' }>;
  rewrites: Array<{ path: string; field: string; from: string; to: string }>;
  gitignoreEdits: Array<{ path: string; from: string; to: string }>;
}

export interface MigrateOptions {
  workspace: string;
  dryRun?: boolean;
  force?: boolean;
}

export interface MigrateResult {
  ok: boolean;
  alreadyMigrated: boolean;
  planned: MigratePlan;
  applied: boolean;
  reason?: string;
}

/** Build the migration plan without touching the filesystem. */
export function planMigration(workspaceDir: string): MigratePlan {
  const moves: MigratePlan['moves'] = [];
  const rewrites: MigratePlan['rewrites'] = [];
  const gitignoreEdits: MigratePlan['gitignoreEdits'] = [];

  // 1. Rename .slop-audit/ → .slopbrick/
  const oldDir = join(workspaceDir, '.slop-audit');
  const newDir = join(workspaceDir, '.slopbrick');
  if (existsSync(oldDir)) {
    moves.push({ from: oldDir, to: newDir, kind: 'dir' });
    // Inventory + constitution schema bumps
    rewrites.push({
      path: join(newDir, 'inventory.json'),
      field: 'version',
      from: '"1"',
      to: '"2"',
    });
    rewrites.push({
      path: join(newDir, 'constitution.json'),
      field: 'version',
      from: '"1"',
      to: '"2"',
    });
  }

  // 2. Rename .slop-audit-cache.json → .slopbrick-cache.json
  const oldCache = join(workspaceDir, '.slop-audit-cache.json');
  const newCache = join(workspaceDir, '.slopbrick-cache.json');
  if (existsSync(oldCache)) {
    moves.push({ from: oldCache, to: newCache, kind: 'file' });
  }

  // 3. Rename slop-audit.config.* → slopbrick.config.*
  for (const ext of ['mjs', 'cjs', 'js']) {
    const oldCfg = join(workspaceDir, `slop-audit.config.${ext}`);
    const newCfg = join(workspaceDir, `slopbrick.config.${ext}`);
    if (existsSync(oldCfg)) {
      moves.push({ from: oldCfg, to: newCfg, kind: 'config' });
    }
  }

  // 4. .gitignore edits
  const gi = join(workspaceDir, '.gitignore');
  if (existsSync(gi)) {
    const content = readFileSync(gi, 'utf-8');
    if (content.includes('.slop-audit/')) {
      gitignoreEdits.push({
        path: gi,
        from: '.slop-audit/',
        to: '.slopbrick/',
      });
    }
    if (content.includes('.slop-audit-cache.json')) {
      gitignoreEdits.push({
        path: gi,
        from: '.slop-audit-cache.json',
        to: '.slopbrick-cache.json',
      });
    }
  }

  return { moves, rewrites, gitignoreEdits };
}

/** Detect whether the workspace is already on v2 (no work to do). */
export function isAlreadyMigrated(workspaceDir: string): boolean {
  return (
    existsSync(join(workspaceDir, '.slopbrick')) &&
    !existsSync(join(workspaceDir, '.slop-audit'))
  );
}

/** Apply the migration plan. Idempotent + dry-run aware. */
export function applyMigration(
  plan: MigratePlan,
  options: { dryRun?: boolean } = {},
): void {
  if (options.dryRun) return;

  // Moves (must come before rewrites since rewrites target the new paths)
  for (const m of plan.moves) {
    renameSync(m.from, m.to);
  }

  // Schema version rewrites
  for (const r of plan.rewrites) {
    if (!existsSync(r.path)) continue;
    const content = readFileSync(r.path, 'utf-8');
    const next = content.replace(`"version": ${r.from}`, `"version": ${r.to}`);
    writeFileSync(r.path, next);
  }

  // .gitignore edits
  for (const g of plan.gitignoreEdits) {
    const content = readFileSync(g.path, 'utf-8');
    const next = content.replaceAll(g.from, g.to);
    writeFileSync(g.path, next);
  }
}

/** Top-level: dry-run, plan, idempotency check, apply. */
export function runMigrate(options: MigrateOptions): MigrateResult {
  const { workspace, dryRun = false, force = false } = options;

  if (!existsSync(workspace)) {
    return {
      ok: false,
      alreadyMigrated: false,
      planned: { moves: [], rewrites: [], gitignoreEdits: [] },
      applied: false,
      reason: `Workspace ${workspace} does not exist`,
    };
  }

  const alreadyMigrated = isAlreadyMigrated(workspace);
  const newDir = join(workspace, '.slopbrick');
  const oldDir = join(workspace, '.slop-audit');

  if (existsSync(newDir) && existsSync(oldDir) && !force) {
    return {
      ok: false,
      alreadyMigrated: false,
      planned: { moves: [], rewrites: [], gitignoreEdits: [] },
      applied: false,
      reason:
        `Both .slopbrick/ and .slop-audit/ exist. Use --force to overwrite ` +
        `the .slopbrick/ directory, or manually resolve the conflict.`,
    };
  }

  const planned = planMigration(workspace);
  const nothingToDo =
    planned.moves.length === 0 &&
    planned.rewrites.length === 0 &&
    planned.gitignoreEdits.length === 0;

  if (nothingToDo) {
    return {
      ok: true,
      alreadyMigrated,
      planned,
      applied: false,
    };
  }

  applyMigration(planned, { dryRun });
  return {
    ok: true,
    alreadyMigrated: false,
    planned,
    applied: !dryRun,
  };
}

/** Pretty-printer for the migrate subcommand's stdout. */
export function formatMigrate(result: MigrateResult): string {
  const lines: string[] = [];
  if (result.alreadyMigrated) {
    lines.push('Already migrated to v2 (no work needed).');
    return lines.join('\n');
  }
  if (!result.ok) {
    lines.push(`ERROR: ${result.reason ?? 'unknown failure'}`);
    return lines.join('\n');
  }
  if (result.planned.moves.length === 0 && result.planned.gitignoreEdits.length === 0) {
    lines.push('Nothing to migrate — workspace is already on slopbrick v0.11.0+.');
  }
  if (result.planned.moves.length > 0) {
    lines.push('Moves:');
    for (const m of result.planned.moves) {
      lines.push(`  ${m.from}`);
      lines.push(`    → ${m.to}  (${m.kind})`);
    }
  }
  if (result.planned.rewrites.length > 0) {
    lines.push('Schema version bumps:');
    for (const r of result.planned.rewrites) {
      lines.push(`  ${r.path}  ${r.field}: ${r.from} → ${r.to}`);
    }
  }
  if (result.planned.gitignoreEdits.length > 0) {
    lines.push('.gitignore edits:');
    for (const g of result.planned.gitignoreEdits) {
      lines.push(`  ${g.path}: ${g.from} → ${g.to}`);
    }
  }
  lines.push('');
  if (result.applied) {
    lines.push('Migration applied. Run `slopbrick scan` to regenerate inventory at v2.');
  } else {
    lines.push('DRY RUN — no files were changed. Re-run without --dry-run to apply.');
  }
  return lines.join('\n');
}

/** Re-exported for the CLI runner so unused-import warnings don't fire. */
export { logger };
