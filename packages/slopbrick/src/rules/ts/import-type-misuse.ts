/**
 * Rule: ts/import-type-misuse
 *
 * Inline type imports — `import { type X, Y }` or `import { X, type Y }`
 * — are syntactically valid but stylistically inconsistent. Real
 * engineers split type-only imports into a separate `import type { X }
 * from '...'` statement for clarity. AI agents mix them in a single
 * import.
 *
 * **Why this matters:**
 * - The `import { type X }` syntax was added in TypeScript 4.5
 *   (Nov 2021). It's a real and supported feature, but it's used
 *   less often than the older `import type` form.
 * - AI agents sometimes use the inline form because their training
 *   data mixes both. Real codebases tend to pick one and stick with
 *   it.
 * - Severity: low. This is a stylistic signal, not a bug.
 * - Default off (DORMANT) until calibrated on v10 corpus.
 * The v10 corpus (576,750 files) is the source data; the rule is
 * DORMANT until a v10-specific precision/recall pass confirms
 * FPR stays below 0.5%.
 *
 * **Scope:** file-local. Regex on the source text.
 */

import type { Rule, Issue, RuleContext, ScanFacts } from '../../types';
import { createRule } from '../rule';

export interface TsImportTypeMisuseContext {
  // No configuration.
}

// Matches: `import { ..., type X, ... }` (inline type import in a
// value import) — note the negative-lookahead to avoid false
// positives on `import type { ... }` (the canonical form).
const INLINE_TYPE_IMPORT_REGEX = /^[ \t]*import\s*\{[^}]*\btype\s+[A-Za-z_]/gm;

export const tsImportTypeMisuseRule = createRule<TsImportTypeMisuseContext>({
  id: 'ts/import-type-misuse',
  category: 'typo',
  severity: 'low',
  aiSpecific: true,
  description: 'Inline `import { type X }` — prefer `import type { X }` for clarity',
  create(_context: RuleContext): TsImportTypeMisuseContext {
    return {};
  },
  analyze(_context: TsImportTypeMisuseContext, facts: ScanFacts): Issue[] {
    const issues: Issue[] = [];
    const source = facts.v2?._source;
    if (!source) return issues;

    let match: RegExpExecArray | null;
    INLINE_TYPE_IMPORT_REGEX.lastIndex = 0;
    while ((match = INLINE_TYPE_IMPORT_REGEX.exec(source)) !== null) {
      const line = source.slice(0, match.index).split('\n').length;
      issues.push({
        ruleId: 'ts/import-type-misuse',
        category: 'typo',
        severity: 'low',
        aiSpecific: true,
        message:
          'Inline `type` in a value import — split into a separate `import type` statement',
        line,
        column: match[0].indexOf('type') + 1,
        advice:
          'Use `import type { X } from "..."` instead of ' +
          '`import { type X } from "..."`. The inline form is valid but ' +
          'the split form is more common in real codebases and makes the ' +
          'type-only intent unambiguous. Reference: ts/import-type-misuse v0.19.',
      });
    }
    return issues;
  },
});

export default tsImportTypeMisuseRule satisfies Rule<TsImportTypeMisuseContext>;
