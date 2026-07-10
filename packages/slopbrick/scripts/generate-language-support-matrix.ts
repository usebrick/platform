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

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const output = path.join(root, 'docs/language-support-matrix.md');

type Row = {
  language: string;
  extensions: string;
  parser: string;
  rules: string;
  defaults: string;
  fixtures: string;
  calibration: string;
};

const rows: Row[] = [
  { language: 'TypeScript / JavaScript', extensions: '.ts, .tsx, .js, .jsx, .vue, .svelte, .astro, .html', parser: 'SWC for JS/TS + dedicated Vue/Svelte/Astro/HTML adapters', rules: 'Shared registry; framework and generic rules', defaults: 'Mixed (see rule catalog)', fixtures: 'tests/rules/**; framework fixtures', calibration: 'Eligible; calibrated cohorts vary' },
  { language: 'Python', extensions: '.py', parser: 'Blank module + source-preserving facts', rules: 'Shared regex/AI/security rules; Python MCP pattern visitor', defaults: 'No Python-specific scan rules', fixtures: 'tests/engine/visitors/python.test.ts', calibration: 'Research-only unless cohort is declared' },
  { language: 'Go', extensions: '.go', parser: 'Blank module + source-preserving facts', rules: 'go/* plus shared regex/AI/security rules', defaults: 'go/* default-off (DORMANT)', fixtures: 'tests/engine/visitors/go.test.ts; tests/rules/go', calibration: 'Research-only; current go/* cohort is dormant' },
  { language: 'Rust', extensions: '.rs', parser: 'Blank module + tree-sitter Rust visitor', rules: 'rust/* plus shared rules', defaults: 'rust/* default-on (USEFUL/OK)', fixtures: 'tests/engine/rust-visitor.test.ts; tests/rules/rust', calibration: 'Eligible for existing v10 cohort' },
  { language: 'Dart', extensions: '.dart', parser: 'Blank module + source-preserving facts', rules: 'dart/* plus shared source-text rules; Dart MCP pattern visitor', defaults: 'All dart/* default-off (DORMANT)', fixtures: 'tests/engine/visitors/dart.test.ts; tests/rules/dart', calibration: 'Not eligible for release claims; v10.2 cohort pending' },
  { language: 'Ruby', extensions: '.rb', parser: 'Blank module + source-preserving facts', rules: 'rb/* plus shared source-text rules; Ruby MCP patterns', defaults: 'All rb/* default-off (DORMANT)', fixtures: 'tests/rules/rb', calibration: 'Not eligible; corpus calibration pending' },
  { language: 'PHP', extensions: '.php', parser: 'Blank module + source-preserving facts', rules: 'php/* plus shared source-text rules; PHP MCP patterns', defaults: 'All php/* default-off (DORMANT)', fixtures: 'tests/rules/php', calibration: 'Not eligible; corpus calibration pending' },
  { language: 'C#', extensions: '.cs', parser: 'Blank module + source-preserving facts', rules: 'cs/* source-text rules', defaults: 'All cs/* default-off (DORMANT)', fixtures: 'tests/engine/csharp-routing.test.ts; tests/rules/cs', calibration: 'Not eligible; corpus calibration pending' },
  { language: 'Java', extensions: '.java', parser: 'Blank module + source-preserving facts', rules: 'java/* plus shared source-text rules', defaults: 'Mixed; Java-specific calibration is historical', fixtures: 'tests/rules/java', calibration: 'Research-only unless cohort is declared' },
  { language: 'Kotlin', extensions: '.kt, .kts', parser: 'Blank module + source-preserving facts', rules: 'kt/* plus shared source-text rules', defaults: 'kt/* default-off (DORMANT)', fixtures: 'tests/rules/kt', calibration: 'Research-only; current kt/* cohort is dormant' },
  { language: 'Swift', extensions: '.swift', parser: 'Blank module + source-preserving facts', rules: 'swift/* plus shared source-text rules', defaults: 'swift/* default-off (mostly DORMANT)', fixtures: 'tests/rules/swift', calibration: 'Research-only; cohort below release evidence bar' },
  { language: 'C / C++', extensions: '.c, .h, .cc, .cpp, .cxx, .hpp, .hxx', parser: 'Blank module + source-preserving facts', rules: 'cpp/* plus shared source-text rules', defaults: 'cpp/* default-on (HYGIENE/OK)', fixtures: 'tests/rules/cpp', calibration: 'Eligible for hygiene; not an AI-authorship claim' },
];

function render(): string {
  const lines = [
    '<!-- GENERATED FILE: pnpm generate:language-matrix. Do not edit manually. -->',
    '# Language support matrix',
    '',
    'This matrix is the release-facing contract for file discovery, parsing, rule execution, fixtures, and calibration scope. “Supported” means a file is discovered and scanned; it does **not** imply a complete language AST or a calibrated AI-authorship signal.',
    '',
    '| Language | Extensions | Parser / facts path | Rules executed | Defaults | Fixtures | Calibration eligibility |',
    '|---|---|---|---|---|---|---|',
    ...rows.map((r) => `| ${r.language} | ${r.extensions} | ${r.parser} | ${r.rules} | ${r.defaults} | ${r.fixtures} | ${r.calibration} |`),
    '',
    '## Interpretation',
    '',
    '- Generic source-text rules can run on parserless files when parsing yields a blank module with the original source preserved.',
    '- A default-off/DORMANT language rule is available for explicit opt-in, but must not be presented as calibrated release evidence.',
    '- Rust is the only non-JS language in this table with a tree-sitter visitor in the scan path. MCP pattern visitors are separate from scan-rule parsing.',
    '- The matrix intentionally separates discovery and execution from calibration eligibility; adding an extension must not silently expand public claims.',
    '',
    'Regenerate and check drift with `pnpm --filter slopbrick generate:language-matrix` and `pnpm --filter slopbrick exec tsx scripts/generate-language-support-matrix.ts --check`.',
    '',
  ];
  return lines.join('\n');
}

const generated = render();
if (process.argv.includes('--check')) {
  const existing = await readFile(output, 'utf8').catch(() => '');
  if (existing !== generated) {
    console.error(`Language support matrix is stale: ${path.relative(process.cwd(), output)}`);
    process.exitCode = 1;
  }
} else {
  await writeFile(output, generated, 'utf8');
}
