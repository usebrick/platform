/**
 * Generate the language support contract used by release documentation.
 *
 * This is deliberately a small, reviewable table rather than a claim that
 * every extension has a full AST implementation.  Keep parser and rule
 * semantics here in sync with engine/parser.ts, engine/discover.ts, and the
 * rule registry. Run with --check in CI to detect documentation drift.
 */
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { LANGUAGE_SUPPORT } from '../src/engine/language-support.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const output = path.join(root, 'docs/language-support-matrix.md');
const websiteSummaryOutput = path.join(root, '..', 'website', 'src', 'data', 'language-support.json');

function render(): string {
  const lines = [
    '<!-- GENERATED FILE: pnpm generate:language-matrix. Do not edit manually. -->',
    '# Language support matrix',
    '',
    'This matrix is the release-facing contract for file discovery, parsing, rule execution, fixtures, and calibration scope. “Supported” means a file is discovered and scanned; it does **not** imply a complete language AST or a calibrated AI-authorship signal. Current v10.3 admission is zero; historical eligibility wording is not current release evidence.',
    '',
    '| Language | Extensions | Parser / facts path | Rules executed | Defaults | Fixtures | Calibration eligibility |',
    '|---|---|---|---|---|---|---|',
    ...LANGUAGE_SUPPORT.map((r) => `| ${r.language} | ${r.extensions.join(', ')} | ${r.parser} | ${r.rules} | ${r.defaults} | ${r.fixtures} | ${r.calibration} |`),
    '',
    '## Interpretation',
    '',
    '- Generic source-text rules can run on parserless files when parsing yields a blank module with the original source preserved.',
    '- A default-off/DORMANT language rule is available for explicit opt-in, but must not be presented as calibrated release evidence.',
    '- Rust is the only non-JS language in this table with a tree-sitter visitor in the scan path. MCP pattern visitors are separate from scan-rule parsing.',
    '- The matrix intentionally separates discovery and execution from calibration eligibility; adding an extension must not silently expand public claims.',
    '- Current v10.3 admission is zero. Historical cohorts remain useful research evidence but do not qualify the v0.45.0 candidate.',
    '',
    'Regenerate and check drift with `pnpm --filter slopbrick generate:language-matrix` and `pnpm --filter slopbrick exec node --import tsx scripts/generate-language-support-matrix.ts --check`.',
    '',
  ];
  return lines.join('\n');
}

function renderWebsiteSummary(): string {
  const names = LANGUAGE_SUPPORT.map((entry) => entry.language);
  return JSON.stringify({
    count: names.length,
    countLabel: `${names.length} language families`,
    names,
  }, null, 2) + '\n';
}

const generated = render();
const websiteSummary = renderWebsiteSummary();
if (process.argv.includes('--check')) {
  const existing = await readFile(output, 'utf8').catch(() => '');
  const existingWebsiteSummary = await readFile(websiteSummaryOutput, 'utf8').catch(() => '');
  if (existing !== generated) {
    console.error(`Language support matrix is stale: ${path.relative(process.cwd(), output)}`);
    process.exitCode = 1;
  }
  if (existingWebsiteSummary !== websiteSummary) {
    console.error(`Language support website summary is stale: ${path.relative(process.cwd(), websiteSummaryOutput)}`);
    process.exitCode = 1;
  }
} else {
  await writeFile(output, generated, 'utf8');
  await writeFile(websiteSummaryOutput, websiteSummary, 'utf8');
}
