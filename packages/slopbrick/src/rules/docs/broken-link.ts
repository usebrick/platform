// Rule: docs/broken-link
//
// Markdown relative link target doesn't resolve to a file on disk.
// Skips http(s)/, mailto:/tel:/, #-anchors, //protocol-relative, and
// absolute (/foo) paths — same heuristic as the v1 detection in
// `src/engine/doc-freshness.ts`.
//
// Strategy: for each markdown link, resolve relative to the doc's
// directory and check `existsSync`. If missing, fire.
//
// v0.42.0 post-self-scan fix: skip targets that look like regex
// patterns (character classes `[^...]`, escapes like `\s\d\w`,
// grouping `(?:...)` etc.). These are overwhelmingly JSDoc examples
// of the markdown-link syntax — not real relative links. The
// unshaped heuristic catches 2 of 3 false-positive buckets during
// self-scan without affecting real markdown.
//
// Severity: low (broken links are usually cosmetic — but on a public
// docs site they erode trust).
//
// aiSpecific: false.

import { existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import type { Issue, Rule, RuleContext, ScanFacts } from '../../types';
import { createRule } from '../rule';
import { extractMarkdownLinks } from '../../engine/doc-freshness';

/**
 * v0.42.0: returns true if a link target textually resembles a
 * regex pattern rather than a file path. Catches JSDoc examples
 * like `` `[text]([^'"]+)` `` where the rule would otherwise fire
 * on a target that has no file-existence meaning.
 */
function looksLikeRegexSyntax(target: string): boolean {
  // Common regex markers in markdown-link-target text:
  //   [^...]   - character class
  //   ?:?=?!   - group prefix (the link extractor strips the leading `(`,
  //              so we check the prefix chars directly on the target)
  //   \s \d \w \. - common escapes
  //   | {n,m}   - alternation / quantifier
  return (
    /\[[^\]]*\]/.test(target) ||
    /^\s*[?:=!]/.test(target) ||
    /\\(?:s|d|w|S|D|W|t|n|r|[^\\])/.test(target) ||
    /[{}|]/.test(target)
  );
}

export const brokenLinkRule = createRule<RuleContext>({
  id: 'docs/broken-link',
  category: 'docs',
  severity: 'low',
  aiSpecific: false,
  description:
    'Markdown link target is relative and does not resolve to a file on disk.',
  create(context) {
    return context;
  },
  analyze(context, facts): Issue[] {
    const issues: Issue[] = [];
    const source = facts.v2?._source;
    if (!source) return issues;
    const links = extractMarkdownLinks(source);
    // The orchestrator passes a project-relative `filePath`; unit tests
    // may pass an absolute one. `path.resolve` (not `path.join`) is
    // the right primitive here: when the second arg is absolute it
    // replaces the cwd, when it's relative it's appended. `path.join`
    // would concatenate two absolute paths and produce a doubled path.
    const docDir = dirname(resolve(context.cwd, context.filePath));
    for (const link of links) {
      const target = link.target;
      if (target.startsWith('http://') || target.startsWith('https://')) continue;
      if (target.startsWith('mailto:') || target.startsWith('tel:')) continue;
      if (target.startsWith('#')) continue;
      if (target.startsWith('//')) continue;
      if (target.startsWith('/')) continue;
      // v0.42.0: skip JSDoc-comment links. Markdown-link examples
      // inside `/* ... */` blocks (e.g. the regex-char-class
      // examples in the engine doc-freshness JSDoc) are not real
      // relative links — the extractor annotates them with
      // `inBlockComment: true` so the rule can drop them cheaply.
      if (link.inBlockComment) continue;
      // v0.42.0: skip JSDoc-regex false positives (see
      // `looksLikeRegexSyntax` above). Real broken links almost
      // never look like a regex; their targets are file-shaped
      // (letters + slashes + dots + extensions).
      if (looksLikeRegexSyntax(target)) continue;
      // v0.18.6: strip the #anchor before checking file existence.
      // Without this, `./EXAMPLES.md#strict-ci-gate` fails the
      // existsSync check (no file with that name) and is reported
      // as broken even though `./EXAMPLES.md` exists and has the
      // anchor. The anchor is a per-file property that the
      // per-link rule can't cheaply verify, so we accept it on
      // faith when the file resolves.
      const filePart = target.split('#')[0] ?? target;
      if (filePart === '') continue; // pure #anchor link
      const resolved = join(docDir, filePart);
      if (existsSync(resolved)) continue;
      issues.push({
        ruleId: 'docs/broken-link',
        category: 'docs',
        severity: 'low',
        aiSpecific: false,
        message: `Relative link \`${target}\` does not exist.`,
        line: link.line,
        column: link.column,
        advice: `Create the file or fix the link target.`,
        extras: { link: target },
      });
    }
    return issues;
  },
});

export default brokenLinkRule satisfies Rule<RuleContext>;
