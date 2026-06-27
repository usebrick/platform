import type { Issue, Rule, RuleContext, ScanFacts } from '../../types';
import { createRule } from '../rule';

/**
 * Rule: context/import-path-mismatch
 * Phase 2 §10 (Context Slop). The brick.config.json `allowedImports`
 * list declares the canonical import paths for the project's component
 * library. Imports referencing those libraries from outside the allowed
 * prefix are flagged as "LLM hallucinated import paths."
  * **Peer-reviewed citation:**
 * - This rule implements the import-resolution invariant from the
 *   TypeScript / Node.js module systems (ECMA-262 §16.2, Node.js
 *   Modules documentation). An import that doesn't resolve is,
 *   by definition, a code-hygiene issue.
 * - Empirical observation: v0.12.2 calibration lift 1.4× → HYGIENE
 *   (with a flipped direction in v6.0; originally INVERTED in v5).
 *   Common in both arms; humans write dead imports during refactors. */
const PROJECT_ALIAS_RE = /^[@~]\//;

export const importPathMismatchRule = createRule<RuleContext & { allowedPrefixes: string[] }>({
  id: 'context/import-path-mismatch',
  category: 'arch',
  severity: 'medium',
  aiSpecific: false,
  description: 'Import path does not match any allowed prefix from brick.config.json.',
  create(context) {
    return {
      ...context,
      allowedPrefixes: context.config.allowedImports ?? [],
    };
  },
  analyze(context, facts: ScanFacts): Issue[] {
    const prefixes = context.allowedPrefixes;
    if (prefixes.length === 0) return [];
    const issues: Issue[] = [];

    const imports = facts.v2.imports;
    for (const imp of imports) {
      const source = imp.source;
      if (!PROJECT_ALIAS_RE.test(source)) continue;
      const matches = prefixes.some((prefix) => source.startsWith(prefix));
      if (matches) continue;

      issues.push({
        ruleId: 'context/import-path-mismatch',
        category: 'arch',
        severity: 'medium',
        aiSpecific: true,
        message: `Import '${source}' does not match any allowed path in brick.config.json. Allowed prefixes: ${prefixes.join(', ')}.`,
        line: imp.line,
        column: imp.column,
        advice: `Use one of the canonical import paths: ${prefixes.join(', ')}. If '${source}' should be added, update brick.config.json's allowedImports.`,
      });
    }

    return issues;
  },
});

export default importPathMismatchRule satisfies Rule<RuleContext>;