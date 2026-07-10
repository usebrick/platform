#!/usr/bin/env npx tsx
/**
 * Standalone single-file scanner, run via child_process.
 *
 * Reads a file path from process.argv[2], runs the full slopbrick
 * scan on it, and writes the result to the path in SLOP_RESULT_PATH
 * (env var) so the parent can read it regardless of size.
 *
 * Why a separate file? Node's `worker_threads.Worker` constructor
 * can't load TypeScript files directly (no tsx resolution in
 * worker threads). And spawning a Node child with `process.execPath`
 * can't import .ts files (raw node doesn't speak TypeScript). The
 * reliable way to run a .ts payload in a child process is to invoke
 * it through tsx, which IS what this file's shebang does.
 *
 * Why file output (not stdout)? Some files produce >64KB of JSON
 * (large Apollo test files with many rule hits), which exceeds the
 * default Node.js stdout pipe buffer. Writing to a file avoids the
 * truncation issue entirely.
 */
import { writeFileSync } from 'node:fs';
import { scanFile } from '../src/engine/worker.js';
import { loadConfig } from '../src/config/index.js';
import { RuleRegistry } from '../src/rules/registry.js';

const filePath = process.argv[2];
const resultPath = process.env.SLOP_RESULT_PATH;
function readRuleFilter(name: 'SLOP_INCLUDE_RULES' | 'SLOP_EXCLUDE_RULES'): string[] {
  const raw = process.env[name];
  if (raw === undefined) return [];
  const value: unknown = JSON.parse(raw);
  if (!Array.isArray(value) || value.some((id) => typeof id !== 'string' || id.length === 0)) throw new Error(`${name} must be a JSON string array`);
  return value;
}
if (!filePath) {
  console.error('Usage: scan-file-worker.ts <file-path>');
  process.exit(1);
}
if (!resultPath) {
  console.error('SLOP_RESULT_PATH env var required');
  process.exit(1);
}

(async () => {
  try {
    const config = await loadConfig(filePath);
    const registry = new RuleRegistry();
    registry.loadBuiltins(undefined, { includeRules: readRuleFilter('SLOP_INCLUDE_RULES'), excludeRules: readRuleFilter('SLOP_EXCLUDE_RULES') });
    const result = await scanFile(filePath, config, registry, process.cwd());
    writeFileSync(resultPath, JSON.stringify({
      ok: true,
      issues: result.issues,
      componentCount: result.componentCount,
      parseError: result.parseError,
    }));
    process.exit(0);
  } catch (e) {
    writeFileSync(resultPath, JSON.stringify({
      ok: false,
      error: String((e as Error)?.message ?? e),
    }));
    process.exit(1);
  }
})();
