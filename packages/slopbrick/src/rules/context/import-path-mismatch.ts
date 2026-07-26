import {
  ISSUE_EVIDENCE_MAX_SNIPPET_BYTES,
  ISSUE_EVIDENCE_MAX_SNIPPET_CHARS,
} from '../../types';
import type { Issue, IssueEvidence, Rule, RuleContext, ScanFacts } from '../../types';
import { createRule } from '../rule';

/**
 * Rule: context/import-path-mismatch
 * Phase 2 §10 (Context Slop). The `slopbrick.config.*#allowedImports`
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

function positionAt(source: string, offset: number): { line: number; column: number } {
  const before = source.slice(0, offset);
  const line = before.split('\n').length;
  const previousNewline = source.lastIndexOf('\n', offset - 1);
  return { line, column: offset - previousNewline };
}

function importSourceEvidence(
  sourceText: string | undefined,
  importSource: string,
  sourceValueSpan: ScanFacts['v2']['imports'][number]['sourceValueSpan'],
  allowedPrefixCount: number,
): IssueEvidence | undefined {
  if (!sourceText || !sourceValueSpan) return undefined;
  const { startOffset, endOffsetExclusive } = sourceValueSpan;
  if (
    !Number.isInteger(startOffset)
    || !Number.isInteger(endOffsetExclusive)
    || startOffset < 1
    || endOffsetExclusive <= startOffset
    || endOffsetExclusive >= sourceText.length
    || sourceText.slice(startOffset, endOffsetExclusive) !== importSource
  ) return undefined;

  const openingQuote = sourceText[startOffset - 1];
  if (
    (openingQuote !== "'" && openingQuote !== '"')
    || sourceText[endOffsetExclusive] !== openingQuote
  ) return undefined;

  const endOffset = endOffsetExclusive - 1;
  const location = {
    start: positionAt(sourceText, startOffset),
    end: positionAt(sourceText, endOffset),
  };
  const snippetChars = importSource.length;
  const snippetBytes = new TextEncoder().encode(importSource).byteLength;
  const exact = snippetChars <= ISSUE_EVIDENCE_MAX_SNIPPET_CHARS
    && snippetBytes <= ISSUE_EVIDENCE_MAX_SNIPPET_BYTES;

  return exact
    ? {
        kind: 'matched-source-span',
        status: 'exact',
        snippet: importSource,
        location,
        matched: {
          field: 'import-source',
          key: 'module-specifier',
          value: importSource,
        },
        details: {
          policyField: 'allowedImports',
          allowedPrefixCount,
        },
      }
    : {
        kind: 'matched-source-span',
        status: 'omitted',
        location,
        matched: { field: 'import-source', key: 'module-specifier' },
        omission: {
          reason: 'oversized',
          snippetChars,
          snippetBytes,
          valueChars: snippetChars,
          valueBytes: snippetBytes,
        },
      };
}

export const importPathMismatchRule = createRule<RuleContext & { allowedPrefixes: string[] }>({
  id: 'context/import-path-mismatch',
  category: 'arch',
  severity: 'medium',
  aiSpecific: false,
  description: 'Import path does not match the repository allowedImports policy.',
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

      const evidence = importSourceEvidence(
        facts.v2._source,
        source,
        imp.sourceValueSpan,
        prefixes.length,
      );
      const importRewrites = context.config.mend?.importRewrites;
      const replacement = importRewrites
        && Object.hasOwn(importRewrites, source)
        ? importRewrites[source]
        : undefined;

      issues.push({
        ruleId: 'context/import-path-mismatch',
        category: 'arch',
        severity: 'medium',
        aiSpecific: false,
        message: `Import '${source}' does not match the repository allowedImports policy. Allowed prefixes: ${prefixes.join(', ')}.`,
        line: imp.line,
        column: imp.column,
        advice: `Use one of the canonical import paths: ${prefixes.join(', ')}. If '${source}' should be allowed, update slopbrick.config.mjs#allowedImports.`,
        evidence,
        fix: evidence?.status === 'exact'
          && typeof replacement === 'string'
          && replacement !== source
          && prefixes.some((prefix) => replacement.startsWith(prefix))
          ? {
              kind: 'module-specifier',
              description: 'Apply the exact repository-owned import rewrite',
              targetFile: context.filePath,
              oldValue: source,
              newValue: replacement,
            }
          : undefined,
      });
    }

    return issues;
  },
});

export default importPathMismatchRule satisfies Rule<RuleContext>;
