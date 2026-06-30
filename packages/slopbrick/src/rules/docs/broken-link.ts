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
// Severity: low (broken links are usually cosmetic — but on a public
// docs site they erode trust).
//
// aiSpecific: false.

import { existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import type { Issue, Rule, RuleContext, ScanFacts } from '../../types';
import { createRule } from '../rule';
import { extractMarkdownLinks } from '../../engine/doc-freshness';

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
      const resolved = join(docDir, target);
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
