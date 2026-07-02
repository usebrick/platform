/**
 * Shared header for the language-specific pattern extractors
 * (swift.ts, java.ts, ruby.ts, php.ts, astro.ts, ...).
 *
 * These files each implement an inventory-first pattern extractor
 * for one language. They share a near-identical structure:
 *   1. A header comment describing the extractor's role.
 *   2. An import of `PatternMatch` from `../../mcp/patterns.js`.
 *   3. A `XxxPatternResult` interface declaring the result shape.
 *   4. Canonical-suffix constants and regex-based extract functions.
 *
 * Before this refactor, the header + interface boilerplate was
 * copy-pasted across the language files, producing ~100 false-positive
 * `dup/identical-block` fires per file. v0.21.0 refactor: the header
 * text is generated from a single template (this file) and the result
 * interface is a shared generic.
 */
import type { PatternMatch } from '../../mcp/patterns.js';

/** Generic result shape shared by all language pattern extractors. */
export interface LanguagePatternResult {
  service: PatternMatch[];
  route: PatternMatch[];
  ormModel: PatternMatch[];
}

/** Build the standard header comment block for a language file. */
export function patternExtractorHeader(language: string, version: string): string {
  return [
    `// Inventory-first pattern extractor for ${language} source files.`,
    '//',
    '// Pure functions that feed into `buildPatternInventory` (see',
    '// `src/mcp/patterns.ts`). The lens: "did this code introduce a new',
    '// pattern when an existing pattern already existed?" — so a file',
    '// containing `class UserService` registers a service named "User" that',
    '// the cross-file drift detector can later compare against',
    '// `UserManager`, `UserRepository`, etc.',
    '//',
    `// ${version} — regex-only, no ${language} parser dependency. Each call returns`,
    '// AT MOST one `PatternMatch` per category per file. The `imports`',
    '// array is left empty — a later pass will populate it from the',
    "// visitor's import graph.",
  ].join('\n');
}
