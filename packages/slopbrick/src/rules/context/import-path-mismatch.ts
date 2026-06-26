import type { Issue, Rule, RuleContext, ScanFacts } from '../../types';
import { createRule } from '../rule';

/**
 * Rule: context/import-path-mismatch
 * Phase 2 §10 (Context Slop). The brick.config.json `allowedImports`
 * list declares the canonical import paths for the project's component
 * library. Imports referencing those libraries from outside the allowed
 * prefix are flagged as "LLM hallucinated import paths."
 */
const PROJECT_ALIAS_RE = /^[@~]\//;

export const importPathMismatchRule = createRule<RuleContext & { allowedPrefixes: string[] }>({
  id: 'context/import-path-mismatch',
  category: 'arch',
  severity: 'medium',
  aiSpecific: true,
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