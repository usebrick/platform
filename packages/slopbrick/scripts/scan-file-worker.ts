#!/usr/bin/env npx tsx
/**
 * Standalone single-file scanner, run via child_process.
 *
 * Reads a file path from process.argv[2], runs the full slopbrick
 * scan on it, and prints the result as JSON to stdout. Used by
 * `scan-corpus-robust.ts` as the child-process payload.
 *
 * Why a separate file? Node's `worker_threads.Worker` constructor
 * can't load TypeScript files directly (no tsx resolution in
 * worker threads). And spawning a Node child with `process.execPath`
 * can't import .ts files (raw node doesn't speak TypeScript). The
 * reliable way to run a .ts payload in a child process is to invoke
 * it through tsx, which IS what this file's shebang does.
 */
import { scanFile } from '../src/engine/worker.js';
import { loadConfig } from '../src/config/index.js';
import { RuleRegistry } from '../src/rules/registry.js';

const filePath = process.argv[2];
if (!filePath) {
  console.error('Usage: scan-file-worker.ts <file-path>');
  process.exit(1);
}

(async () => {
  try {
    const config = await loadConfig(filePath);
    const registry = new RuleRegistry();
    registry.loadBuiltins();
    const result = await scanFile(filePath, config, registry, process.cwd());
    process.stdout.write(JSON.stringify({
      ok: true,
      issues: result.issues,
      componentCount: result.componentCount,
      parseError: result.parseError,
    }));
    process.exit(0);
  } catch (e) {
    process.stdout.write(JSON.stringify({ ok: false, error: String((e as Error)?.message ?? e) }));
    process.exit(1);
  }
})();
