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
const MAX_IMPORT_SEARCH_CHARS = 4096;

function lineStartOffset(source: string, line: number): number | undefined {
  if (!Number.isInteger(line) || line < 1) return undefined;
  let offset = 0;
  for (let currentLine = 1; currentLine < line; currentLine += 1) {
    const newline = source.indexOf('\n', offset);
    if (newline === -1) return undefined;
    offset = newline + 1;
  }
  return offset;
}

function positionAt(source: string, offset: number): { line: number; column: number } {
  const before = source.slice(0, offset);
  const line = before.split('\n').length;
  const previousNewline = source.lastIndexOf('\n', offset - 1);
  return { line, column: offset - previousNewline };
}

function importSourceEvidence(
  sourceText: string | undefined,
  importSource: string,
  line: number,
  column: number,
  allowedPrefixCount: number,
): IssueEvidence | undefined {
  if (!sourceText) return undefined;
  const lineStart = lineStartOffset(sourceText, line);
  if (lineStart === undefined) return undefined;
  const declarationStart = lineStart + Math.max(0, column - 1);
  const searchEnd = Math.min(sourceText.length, declarationStart + MAX_IMPORT_SEARCH_CHARS);
  const quotedCandidates = [`'${importSource}'`, `"${importSource}"`];
  const quotedOffset = quotedCandidates.reduce<number | undefined>((earliest, quoted) => {
    const candidate = sourceText.indexOf(quoted, declarationStart);
    if (candidate === -1 || candidate >= searchEnd) return earliest;
    return earliest === undefined ? candidate : Math.min(earliest, candidate);
  }, undefined);
  if (quotedOffset === undefined) return undefined;

  const startOffset = quotedOffset + 1;
  const endOffset = startOffset + importSource.length - 1;
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
        imp.line,
        imp.column,
        prefixes.length,
      );
      const importRewrites = context.config.mend?.importRewrites;
      const replacement = importRewrites
        && Object.prototype.hasOwnProperty.call(importRewrites, source)
        ? importRewrites[source]
        : undefined;
      const fix = evidence?.status === 'exact'
        && typeof replacement === 'string'
        && replacement !== source
        && prefixes.some((prefix) => replacement.startsWith(prefix))
        ? {
            kind: 'module-specifier' as const,
            description: `Rewrite import '${source}' to '${replacement}'`,
            targetFile: context.filePath,
            oldValue: source,
            newValue: replacement,
          }
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
        ...(fix ? { fix } : {}),
      });
    }

    return issues;
  },
});

export default importPathMismatchRule satisfies Rule<RuleContext>;
