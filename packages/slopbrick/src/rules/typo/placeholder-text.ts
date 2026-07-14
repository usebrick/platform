// Rule: typo/placeholder-text
//
// Per NN/g (Nielsen Norman Group, 2020), "Placeholders in Form Fields
// Are Harmful" — placeholders that contain dev/AI defaults ("Lorem
// ipsum", "Enter text here", "Type here", "Placeholder", "TODO")
// are a strong signal the UI was never finished. Real copy is
// specific ("Search products", "Email address", "Your name").
//
// Catches placeholder attributes (HTML and JSX) whose value matches
// a known-bad pattern. Honors an `allowlist` and `minLength` from
// `config.ruleConfig['typo/placeholder-text']`.
//
// aiSpecific: false (this catches unfinished UI regardless of who
// wrote it — but AI vibe-coding produces this pattern heavily).
// severity: low (cosmetic / unfinished work, not a bug).

import {
  ISSUE_EVIDENCE_MAX_SNIPPET_BYTES,
  ISSUE_EVIDENCE_MAX_SNIPPET_CHARS,
} from '../../types';
import type { Issue, IssueEvidence, Rule, RuleContext, ScanFacts } from '../../types';
import { createRule } from '../rule';
import { lineOfSource } from '../utils';

const BAD_PATTERNS: RegExp[] = [
  /\blorem\s+ipsum\b/i,
  /\bplaceholder\b/i,
  /\b(todo|fixme|xxx|aaa)\b/i,
  /\benter\s+text\b/i,
  /\btype\s+here\b/i,
  /\byour\s+text\s+here\b/i,
  /\bclick\s+here\b/i,
  /\b(asdf|qwerty)\b/i,
  /^(test|foo|bar|baz|sample)$/i,
];

const PLACEHOLDER_HTML_RE = /\bplaceholder\s*=\s*("([^"]*)"|'([^']*)')/gi;
const PLACEHOLDER_JSX_RE = /\bplaceholder\s*=\s*\{\s*("([^"]*)"|'([^']*)')\s*\}/gi;

interface PlaceholderConfig {
  allowlist?: string[];
  minLength?: number;
}

function isBadPlaceholder(value: string, config: PlaceholderConfig): boolean {
  const trimmed = value.trim();
  if (config.allowlist && config.allowlist.includes(trimmed)) return false;
  const minLength = config.minLength ?? 3;
  if (trimmed.length < minLength) return false;
  return BAD_PATTERNS.some((re) => re.test(trimmed));
}

function utf8Bytes(value: string): number {
  return new TextEncoder().encode(value).byteLength;
}

function scanForBadPlaceholders(
  source: string,
  config: PlaceholderConfig,
): Array<{
  message: string;
  line: number;
  column: number;
  value: string;
  evidence: IssueEvidence;
}> {
  const hits: Array<{
    message: string;
    line: number;
    column: number;
    value: string;
    evidence: IssueEvidence;
  }> = [];
  const seen = new Set<number>();
  const re = /placeholder\s*=\s*(?:"([^"]*)"|'([^']*)'|\{\s*"([^"]*)"\s*\}|\{\s*'([^']*)'\s*\})/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(source)) !== null) {
    if (seen.has(m.index)) continue;
    seen.add(m.index);
    const value = m[1] ?? m[2] ?? m[3] ?? m[4] ?? '';
    if (!isBadPlaceholder(value, config)) continue;
    const endOffset = m.index + m[0].length - 1;
    const startColumn = m.index - source.lastIndexOf('\n', m.index - 1);
    const endColumn = endOffset - source.lastIndexOf('\n', endOffset - 1);
    const snippet = source.slice(m.index, m.index + m[0].length);
    const snippetChars = snippet.length;
    const snippetBytes = utf8Bytes(snippet);
    const valueBytes = utf8Bytes(value);
    const exact = snippetChars <= ISSUE_EVIDENCE_MAX_SNIPPET_CHARS &&
      snippetBytes <= ISSUE_EVIDENCE_MAX_SNIPPET_BYTES;
    const location = {
      start: { line: lineOfSource(source, m.index), column: startColumn },
      end: { line: lineOfSource(source, endOffset), column: endColumn },
    };
    hits.push({
      message:
        `Placeholder text "${exact ? value : '[omitted oversized value]'}" is a development placeholder. Replace with real copy ` +
        `describing the expected input (e.g. "Search products", "Email address").`,
      line: lineOfSource(source, m.index),
      column: startColumn,
      value,
      evidence: exact
        ? {
            kind: 'matched-source-span',
            status: 'exact',
            snippet,
            location,
            matched: { field: 'placeholder', key: 'placeholder', value },
          }
        : {
            kind: 'matched-source-span',
            status: 'omitted',
            location,
            matched: { field: 'placeholder', key: 'placeholder' },
            omission: {
              reason: 'oversized',
              snippetChars,
              snippetBytes,
              valueChars: value.length,
              valueBytes,
            },
          },
    });
  }
  return hits;
}

export const placeholderTextRule = createRule<RuleContext>({
  id: 'typo/placeholder-text',
  category: 'typo',
  severity: 'low',
  aiSpecific: false,
  description:
    'Placeholder text contains dev/AI defaults (Lorem ipsum, Enter text here, TODO, etc.) — unfinished UI.',
  create(context) {
    return context;
  },
  analyze(context, facts): Issue[] {
    const issues: Issue[] = [];
    const source = facts.v2?._source;
    if (!source) return issues;
    const config = (context.config.ruleConfig['typo/placeholder-text'] ?? {}) as PlaceholderConfig;
    for (const hit of scanForBadPlaceholders(source, config)) {
      issues.push({
        ruleId: 'typo/placeholder-text',
        category: 'typo',
        severity: 'low',
        aiSpecific: false,
        message: hit.message,
        line: hit.line,
        column: hit.column,
        advice: 'Replace with specific, user-facing copy.',
        evidence: hit.evidence,
      });
    }
    return issues;
  },
});

export default placeholderTextRule satisfies Rule<RuleContext>;
