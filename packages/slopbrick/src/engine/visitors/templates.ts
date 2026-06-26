// Public facade for the template-parsing helpers used by the AST walker.
//
// Implementation lives under src/engine/visitors/templates/:
//   - positions.ts — SourceRange + range finders
//                    (findAstroFrontmatterRange, findHtmlBlockRanges,
//                     findScriptAndStyleRanges, findHtmlCommentRanges,
//                     findAstroSkipRanges) + line / column helpers
//                    (lineNumberOf, positionFromCharOffset).
//   - astro.ts     — Astro-specific extractors:
//                    parseAstroAttributes,
//                    extractStaticTemplateClassNames,
//                    extractAstroComponents,
//                    extractAstroElementFacts.
//
// All four functions are pure source → facts transforms; they don't
// touch visitor state. The walker calls them from extractFacts() and
// merges the results into InternalFacts.
//
// This facade exists so callers (visitor.ts, tests) can keep using
// `from '../visitors/templates'` while the internals are organized
// by concern.

export type { SourceRange } from './templates/positions.js';
export {
  findAstroFrontmatterRange,
  findHtmlBlockRanges,
  findScriptAndStyleRanges,
  findHtmlCommentRanges,
  findAstroSkipRanges,
  lineNumberOf,
  positionFromCharOffset,
} from './templates/positions.js';

export {
  parseAstroAttributes,
  extractStaticTemplateClassNames,
  extractAstroComponents,
  extractAstroElementFacts,
} from './templates/astro.js';