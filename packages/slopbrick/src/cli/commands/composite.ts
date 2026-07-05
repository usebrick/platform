/**
 * v0.42.0 (Sprint 3, §3b.6): `slopbrick composite` — empirically
 * discover composite rules + opt specific composites into the
 * registry. The discovery half runs the 5-step clusterer on
 * `.slopbrick/flywheel/scans.jsonl` and writes
 * `composites.json` next to `signal-strength.json`. The enable
 * half writes the chosen composite's id into
 * `slopbrick.config.mjs#compositeRules` so subsequent scans apply
 * it (per §3b.5 wiring in `cli/scan.ts:285`).
 *
 * Both subcommands are opt-in only (Q9): no automatic emission per
 * scan. The first run is `discover` (data inspection), the user
 * audits the candidates, then `enable <id>` opts each one in
 * individually.
 */

import { resolve } from 'node:path';
import { Command } from 'commander';

import { logger } from '../../engine/logger';
import { readTelemetry } from '../../engine/telemetry';
import { runClusterer, describeComposite } from '../../engine/cluster';
import { writeComposites, readComposites } from '../../rules/composite-loader';

import type { CliGlobalOptions } from '../scan';

export function registerComposite(program: Command): void {
  const cmd = program
    .command('composite')
    .description(
      'discover and enable composite rules (Sprint 3, §3b). ' +
        'Run `slopbrick composite discover` to scan scans.jsonl, ' +
        'audit the candidates, then `slopbrick composite enable <id>` ' +
        'to opt a specific composite into slopbrick.config.mjs.',
    );

  cmd
    .command('discover')
    .description(
      'run the empirical composite clusterer on .slopbrick/flywheel/scans.jsonl; writes composites.json',
    )
    .action(async (_cmdOptions: Record<string, unknown>, command: Command) => {
      const options = command.optsWithGlobals() as CliGlobalOptions;
      const cwd = resolve(options.workspace ?? process.cwd());

      // v0.42.0: the clusterer inputs (fireMatrix +
      // positiveFiles) come from the historical telemetry ledger.
      // For a first run, we DON'T have a positive/negative labeled
      // set; we let the clusterer surface candidates that meet
      // support + NPMI + Fisher thresholds but skip the recall/FP
      // gate (the user audits the result).
      const payloads = readTelemetry(cwd);
      if (payloads.length === 0) {
        logger.error(
          '`composite discover` needs at least 2 scans in .slopbrick/flywheel/scans.jsonl. ' +
            'Run `slopbrick scan` a few times first.',
        );
        process.exit(1);
      }

      // Rebuild the fireMatrix from rule fires captured in telemetry.
      // Each payload carries per-rule violation counts; the unique
      // per-file rule-id set is approximated by `files[].ruleIds`.
      const fireMatrix = new Map<string, Set<string>>();
      for (const payload of payloads) {
        for (const f of payload.files) {
          const set = fireMatrix.get(f.hash) ?? new Set<string>();
          for (const id of f.ruleIds) set.add(id);
          if (set.size > 0) fireMatrix.set(f.hash, set);
        }
      }

      const out = runClusterer({
        fireMatrix,
        // No labeled positive set; let the clusterer surface for audit.
        positiveFiles: undefined,
        now: new Date().toISOString(),
      });
      // v0.42.0 (§3b.8): if the clusterer can't synthesize any entries
      // (cold-start with insufficient telemetry), append the
      // hand-curated seed so the user has a starting composite to
      // audit. Drop the seed once empirical clusters dominate the
      // ledger.
      const finalEntries =
        out.entries.length === 0
          ? [...(await import('../../rules/composite-seed')).HAND_CURATED_SEED]
          : out.entries;
      writeComposites(cwd, finalEntries);

      if (out.entries.length === 0) {
        logger.info('Composite discovery: no clusters passed the empirical gate.');
        logger.info(
          '  (Try lowering --min-support, or run more scans to densify the ledger.)',
        );
        return;
      }

      logger.info(
        `Composite discovery: ${out.entries.length} candidate(s) written to composites.json`,
      );
      const lines: string[] = [];
      for (const e of out.entries) {
        lines.push('');
        lines.push(
          `  ${e.id}  minMatch=${e.minMatch}  F1=${e.calibration.F1}  ` +
            `(${e.ruleIds.length} members)`,
        );
        lines.push(`    ${describeComposite(e.ruleIds, e.minMatch)}`);
        lines.push(
          `    provenance: ${e.provenance.seed} npmi=${e.provenance.npmi} ` +
            `fisherP=${e.provenance.fisherP}`,
        );
      }
      logger.info(lines.join('\n'));
      logger.info(
        '\nNext step: review each entry. Opt in with ' +
          '`slopbrick composite enable <id>`; opt out by removing the entry.',
      );
    });

  cmd
    .command('enable <id>')
    .description(
      'opt a specific composite into slopbrick.config.mjs#compositeRules (one composite per call)',
    )
    .action(async (id: string, _cmdOptions: Record<string, unknown>, command: Command) => {
      const options = command.optsWithGlobals() as CliGlobalOptions;
      const cwd = resolve(options.workspace ?? process.cwd());

      const composites = readComposites(cwd);
      const target = composites.find((c) => c.id === id);
      if (!target) {
        logger.error(
          `Composite "${id}" not found in composites.json. Run ` +
            '`slopbrick composite discover` first to populate the ledger.',
        );
        process.exit(1);
      }

      // Edit the user's slopbrick.config.mjs to append the
      // composite rule to its `compositeRules` array. We do a
      // minimal string append — idempotent on re-run (checks
      // for existing id).
      const cfgPath = resolve(cwd, 'slopbrick.config.mjs');
      const fs = require('node:fs') as typeof import('node:fs');
      if (!fs.existsSync(cfgPath)) {
        logger.error(`No slopbrick.config.mjs found at ${cfgPath}.`);
        process.exit(1);
      }
      const src = fs.readFileSync(cfgPath, 'utf-8');
      const compositeSnippet = JSON.stringify(
        {
          id: target.id,
          category: 'ai',
          severity: target.severity,
          aiSpecific: true,
          description: target.description,
          defaultOff: true,
          ruleIds: target.ruleIds,
          minMatch: target.minMatch,
          create: '() => ({})',
          analyze: '() => []',
        },
        null,
        2,
      );
      if (src.includes(`id: '${target.id}'`) || src.includes(`id: "${target.id}"`)) {
        logger.info(`Composite "${id}" is already enabled in slopbrick.config.mjs (idempotent).`);
        return;
      }
      // Simple append: place at the end of the default-export object.
      // Real configs can be edited by hand; this is a deliberate
      // ergonomic shortcut, not a robust config-rewriter.
      const updated = src.replace(
        /(export default\s*{[\s\S]*?)(}\s*;?\s*)$/,
        (_match, head, tail) =>
          `${head}  compositeRules: [\n${compositeSnippet}\n  ],\n${tail}`,
      );
      fs.writeFileSync(cfgPath, updated, 'utf-8');
      logger.info(`Composite "${id}" enabled.`);
      logger.info('Next scan will apply it; rerun `slopbrick scan` to see the effect.');
    });

  // v0.42.0: `slopbrick composite list` — pretty-print the current
  // composites.json ledger.
  cmd
    .command('list')
    .description('list composites currently registered (composites.json + config-declared)')
    .action(async (_cmdOptions: Record<string, unknown>, command: Command) => {
      const options = command.optsWithGlobals() as CliGlobalOptions;
      const cwd = resolve(options.workspace ?? process.cwd());
      const composites = readComposites(cwd);
      if (composites.length === 0) {
        logger.info('No composites registered. Run `slopbrick composite discover` first.');
        return;
      }
      const lines: string[] = ['Registered composites:'];
      for (const e of composites) {
        lines.push(
          `\n  ${e.id}\n` +
            `    ${describeComposite(e.ruleIds, e.minMatch)}\n` +
            `    members=[${e.ruleIds.join(', ')}]  minMatch=${e.minMatch}\n` +
            `    F1=${e.calibration.F1}  recall=${e.calibration.recall}  FP=${e.calibration.FP}`,
        );
      }
      logger.info(lines.join('\n'));
    });
}
