/**
 * Reviewable product contract for language-level scan support.
 *
 * Discovery imports this manifest, and release-facing documentation is
 * generated from it. Parser/default/calibration wording remains deliberate
 * human-reviewed product language; it is not inferred from raw rule counts.
 */
export type LanguageSupport = {
  language: string;
  extensions: readonly string[];
  discoveryGroup: 'frontend' | 'backend';
  parserKind: 'swc-and-framework-adapters' | 'source-preserving' | 'source-preserving-with-rust-visitor';
  parser: string;
  rules: string;
  defaults: string;
  fixtures: string;
  calibration: string;
};

export const LANGUAGE_SUPPORT: readonly LanguageSupport[] = [
  { language: 'TypeScript / JavaScript', extensions: ['.ts', '.tsx', '.js', '.jsx', '.vue', '.svelte', '.astro', '.html'], discoveryGroup: 'frontend', parserKind: 'swc-and-framework-adapters', parser: 'SWC for JS/TS + dedicated Vue/Svelte/Astro/HTML adapters', rules: 'Shared registry; framework and generic rules', defaults: 'Mixed (see rule catalog)', fixtures: 'tests/rules/**; framework fixtures', calibration: 'Eligible; calibrated cohorts vary' },
  { language: 'Python', extensions: ['.py'], discoveryGroup: 'backend', parserKind: 'source-preserving', parser: 'Blank module + source-preserving facts', rules: 'Shared regex/AI/security rules; Python MCP pattern visitor', defaults: 'No Python-specific scan rules', fixtures: 'tests/engine/visitors/python.test.ts', calibration: 'Research-only unless cohort is declared' },
  { language: 'Go', extensions: ['.go'], discoveryGroup: 'backend', parserKind: 'source-preserving', parser: 'Blank module + source-preserving facts', rules: 'go/* plus shared regex/AI/security rules', defaults: 'go/* default-off (DORMANT)', fixtures: 'tests/engine/visitors/go.test.ts; tests/rules/go', calibration: 'Research-only; current go/* cohort is dormant' },
  { language: 'Rust', extensions: ['.rs'], discoveryGroup: 'backend', parserKind: 'source-preserving-with-rust-visitor', parser: 'Blank module + tree-sitter Rust visitor', rules: 'rust/* plus shared rules', defaults: 'rust/* default-on (USEFUL/OK)', fixtures: 'tests/engine/rust-visitor.test.ts; tests/rules/rust', calibration: 'Eligible for existing v10 cohort' },
  { language: 'Dart', extensions: ['.dart'], discoveryGroup: 'backend', parserKind: 'source-preserving', parser: 'Blank module + source-preserving facts', rules: 'dart/* plus shared source-text rules; Dart MCP pattern visitor', defaults: 'All dart/* default-off (DORMANT)', fixtures: 'tests/engine/visitors/dart.test.ts; tests/rules/dart', calibration: 'Not eligible for release claims; v10.2 cohort pending' },
  { language: 'Ruby', extensions: ['.rb'], discoveryGroup: 'backend', parserKind: 'source-preserving', parser: 'Blank module + source-preserving facts', rules: 'rb/* plus shared source-text rules; Ruby MCP patterns', defaults: 'All rb/* default-off (DORMANT)', fixtures: 'tests/rules/rb', calibration: 'Not eligible; corpus calibration pending' },
  { language: 'PHP', extensions: ['.php'], discoveryGroup: 'backend', parserKind: 'source-preserving', parser: 'Blank module + source-preserving facts', rules: 'php/* plus shared source-text rules; PHP MCP patterns', defaults: 'All php/* default-off (DORMANT)', fixtures: 'tests/rules/php', calibration: 'Not eligible; corpus calibration pending' },
  { language: 'C#', extensions: ['.cs'], discoveryGroup: 'backend', parserKind: 'source-preserving', parser: 'Blank module + source-preserving facts', rules: 'cs/* source-text rules', defaults: 'All cs/* default-off (DORMANT)', fixtures: 'tests/engine/csharp-routing.test.ts; tests/rules/cs', calibration: 'Not eligible; corpus calibration pending' },
  { language: 'Java', extensions: ['.java'], discoveryGroup: 'backend', parserKind: 'source-preserving', parser: 'Blank module + source-preserving facts', rules: 'java/* plus shared source-text rules', defaults: 'Mixed; Java-specific calibration is historical', fixtures: 'tests/rules/java', calibration: 'Research-only unless cohort is declared' },
  { language: 'Kotlin', extensions: ['.kt', '.kts'], discoveryGroup: 'backend', parserKind: 'source-preserving', parser: 'Blank module + source-preserving facts', rules: 'kt/* plus shared source-text rules', defaults: 'kt/* default-off (DORMANT)', fixtures: 'tests/rules/kt', calibration: 'Research-only; current kt/* cohort is dormant' },
  { language: 'Swift', extensions: ['.swift'], discoveryGroup: 'backend', parserKind: 'source-preserving', parser: 'Blank module + source-preserving facts', rules: 'swift/* plus shared source-text rules', defaults: 'swift/* default-off (mostly DORMANT)', fixtures: 'tests/rules/swift', calibration: 'Research-only; cohort below release evidence bar' },
  { language: 'C / C++', extensions: ['.c', '.h', '.cc', '.cpp', '.cxx', '.hpp', '.hxx'], discoveryGroup: 'backend', parserKind: 'source-preserving', parser: 'Blank module + source-preserving facts', rules: 'cpp/* plus shared source-text rules', defaults: 'cpp/* default-on (HYGIENE/OK)', fixtures: 'tests/rules/cpp', calibration: 'Eligible for hygiene; not an AI-authorship claim' },
];

function extensionsFor(group?: LanguageSupport['discoveryGroup']): string[] {
  return LANGUAGE_SUPPORT
    .filter((entry) => group === undefined || entry.discoveryGroup === group)
    .flatMap((entry) => entry.extensions)
    .sort();
}

export function supportedExtensions(): string[] {
  return extensionsFor();
}

export function frontendSourceExtensions(): string[] {
  return extensionsFor('frontend');
}

export function backendSourceExtensions(): string[] {
  return extensionsFor('backend');
}

/** Shared runtime/docs wording. The frontend framework option remains separate. */
export const SCAN_FILE_TOOL_DESCRIPTION =
  'Scan a single supported source file for configured slop rules. Language support is scoped by the language support matrix: discovery and scanning do not imply a complete language AST or calibrated AI-authorship signal. Returns issues (ruleId, category, severity, line, column, message, advice, and bounded whyItFired facts), a composite AI-likelihood score (probability + confidenceTier), and a componentCount. The composite score is the Bayesian log-likelihood ratio of all rules that fired, NOT a per-file "Slop Index" — for project-level scores use slop_suggest.';
