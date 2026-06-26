import type { Issue, Rule, RuleContext, ScanFacts } from '../../types';
import { createRule } from '../rule';

/**
 * Math rule: AI-default font without custom font import.
 *
 * AI vibe-coded UIs almost always rely on the framework's default sans-serif
 * font (Inter via Tailwind, system-ui via shadcn). Real production code
 * either imports a custom font (`next/font/google`, `@import url(...)`) or
 * explicitly references a typography system via CSS variables.
 *
 * Detect when:
 *   1. font-sans or font-mono Tailwind class is used
 *   2. NO custom font import appears in the imports or string literals
 *      (no `next/font`, no `@import url`, no `Google Fonts` reference,
 *       no `@font-face` declaration)
 *
 * Threshold: ≥3 font-sans/mono usages AND 0 custom font signals.
 */
const FONT_CLASS_RE = /\bfont-(?:sans|mono|serif)\b/;
const FONT_IMPORT_HINT_RE = /next\/font|@import\s+url|fonts\.googleapis|fonts\.gstatic|@font-face|Google_Fonts/i;
const NEXT_FONT_IMPORT_RE = /import\s+.*from\s+['"]next\/font\/(?:google|local)['"]/;

export const mathDefaultFontRule = createRule<RuleContext>({
  id: 'visual/math-default-font',
  category: 'visual',
  severity: 'high',
  aiSpecific: true,
  description: 'UI uses framework default font (Inter/system) with no custom font import — strong AI signature',
  create(context) {
    return context;
  },
  analyze(_context, facts): Issue[] {
    const issues: Issue[] = [];
    let fontClassCount = 0;
    let firstFontAnchor: { line: number; column: number } | undefined;

    if (facts.v2) {
      for (const element of facts.v2.jsx.elements) {
        for (const cls of element.classNames) {
          if (!FONT_CLASS_RE.test(cls)) continue;
          fontClassCount++;
          if (!firstFontAnchor) firstFontAnchor = { line: element.line, column: element.column };
          break; // one per element is enough for counting
        }
      }

      if (fontClassCount < 3) return issues;

      // Check imports.
      let hasCustomFontImport = false;
      for (const imp of facts.v2.imports) {
        if (NEXT_FONT_IMPORT_RE.test(imp.source) || FONT_IMPORT_HINT_RE.test(imp.source)) {
          hasCustomFontImport = true;
          break;
        }
      }

      // Check source text (catches @import url(...) and @font-face).
      if (!hasCustomFontImport && facts.v2._source) {
        if (FONT_IMPORT_HINT_RE.test(facts.v2._source)) {
          hasCustomFontImport = true;
        }
      }

      if (hasCustomFontImport) return issues;

      issues.push({
        ruleId: 'visual/math-default-font',
        category: 'visual',
        severity: 'high',
        aiSpecific: true,
        message:
          `UI uses framework default font (font-sans/mono, ${fontClassCount} occurrences) without any custom font import. ` +
          `AI defaults to Inter/system-ui; humans import a distinctive typeface.`,
        line: firstFontAnchor?.line ?? 1,
        column: firstFontAnchor?.column ?? 1,
        advice:
          'Import a distinctive font (next/font/google, @font-face, or a CSS variable) instead of relying on the framework default.',
      });

      return issues;
    }

    return issues;
  },
});

export default mathDefaultFontRule satisfies Rule<RuleContext>;
