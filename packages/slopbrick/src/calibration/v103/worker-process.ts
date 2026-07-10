import { writeFileSync } from 'node:fs';
import { scanFile } from '../../engine/worker.js';
import { loadConfig } from '../../config/index.js';
import { RuleRegistry } from '../../rules/registry.js';

function ruleFilter(name: 'SLOP_INCLUDE_RULES' | 'SLOP_EXCLUDE_RULES'): string[] {
  const raw = process.env[name];
  if (raw === undefined) return [];
  const value: unknown = JSON.parse(raw);
  if (!Array.isArray(value) || value.some((id) => typeof id !== 'string' || id.length === 0)) throw new Error(`${name} must be a JSON string array`);
  return value;
}

const filePath = process.argv[2];
const resultPath = process.env.SLOP_RESULT_PATH;
async function main(): Promise<void> {
  if (!filePath || !resultPath) process.exit(1);
  try {
    const config = await loadConfig(filePath);
    const registry = new RuleRegistry();
    registry.loadBuiltins(undefined, { includeRules: ruleFilter('SLOP_INCLUDE_RULES'), excludeRules: ruleFilter('SLOP_EXCLUDE_RULES') });
    const result = await scanFile(filePath, config, registry, process.cwd());
    writeFileSync(resultPath, JSON.stringify({ ok: true, issues: result.issues, componentCount: result.componentCount, parseError: result.parseError }));
    process.exit(0);
  } catch (error) {
    if (resultPath) writeFileSync(resultPath, JSON.stringify({ ok: false, error: String(error instanceof Error ? error.message : error) }));
    process.exit(1);
  }
}

void main();
