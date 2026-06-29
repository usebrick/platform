// Rule: docs/stale-package-reference
//
// Markdown inline code references a package that is not declared in
// the project's package.json AND appears in an npm-install / import /
// require context.
//
// Strategy: for each backtick span, parse the surrounding line for an
// install / import / require command. The token immediately after the
// command keyword is the candidate package name. If that name is not
// in `declaredPackages(cwd)`, fire.
//
// Severity: medium (stale install commands are a high-signal drift
// indicator — copy/pasted from a previous project, or hallucinated).
//
// aiSpecific: false (humans do this too — copy-paste from old READMEs).

import type { Issue, Rule, RuleContext, ScanFacts } from '../../types';
import { createRule } from '../rule';
import {
  declaredPackages,
  extractInlineCodeSpans,
} from '../../engine/doc-freshness';

// Common English words / npm-cmd abbreviations that look like
// package names but aren't. Inlined (not exported from
// doc-freshness) to keep the rule self-contained.
const ENGLISH_WORD_DENYLIST = new Set([
  'the', 'and', 'for', 'with', 'from', 'this', 'that', 'npm', 'npx',
  'pnpm', 'yarn', 'node', 'git', 'cli', 'api', 'sdk', 'src', 'dist',
  'lib', 'bin', 'doc', 'docs', 'test', 'spec', 'todo', 'fix', 'bug',
  'feat', 'refactor', 'chore', 'http', 'https', 'url', 'json', 'xml',
  'yaml', 'sql', 'orm', 'css', 'html', 'svg', 'png', 'jpg', 'pdf',
  'csv', 'md', 'mdx', 'ts', 'tsx', 'js', 'jsx', 'ok', 'no', 'yes',
]);

interface StalePackageContext extends RuleContext {
  packages: Set<string>;
}

export const stalePackageReferenceRule = createRule<StalePackageContext>({
  id: 'docs/stale-package-reference',
  category: 'docs',
  severity: 'medium',
  aiSpecific: false,
  description:
    'Markdown references a package (npm install / from / require) that is not in package.json.',
  create(context) {
    return { ...context, packages: declaredPackages(context.cwd) };
  },
  analyze(context, facts): Issue[] {
    const issues: Issue[] = [];
    const source = facts.v2?._source;
    if (!source) return issues;
    const spans = extractInlineCodeSpans(source);
    for (const span of spans) {
      const lineStart = source.lastIndexOf('\n', span.index) + 1;
      const lineEnd = source.indexOf('\n', span.index);
      const line = source.slice(lineStart, lineEnd === -1 ? source.length : lineEnd);

      let candidate: string | undefined;
      const installMatch =
        /(npm\s+install|pnpm\s+add|yarn\s+add)\s+([A-Za-z0-9_./@-]+)/i.exec(line);
      if (installMatch) candidate = installMatch[2];
      if (!candidate) {
        const fromMatch = /from\s+['"]([^'"]+)['"]/i.exec(line);
        if (fromMatch) candidate = fromMatch[1];
      }
      if (!candidate) {
        const requireMatch = /require\s*\(\s*['"]([^'"]+)['"]\s*\)/i.exec(line);
        if (requireMatch) candidate = requireMatch[1];
      }
      if (!candidate) continue;
      let pkgName = candidate;
      if (pkgName.startsWith('@')) {
        pkgName = pkgName.split('/').slice(0, 2).join('/');
      } else {
        pkgName = pkgName.split('/')[0] ?? pkgName;
      }
      if (!/^@?[a-z][a-z0-9._/-]*$/.test(pkgName)) continue;
      if (pkgName.length < 2) continue;
      if (ENGLISH_WORD_DENYLIST.has(pkgName)) continue;
      if (context.packages.has(pkgName)) continue;
      issues.push({
        ruleId: 'docs/stale-package-reference',
        category: 'docs',
        severity: 'medium',
        aiSpecific: false,
        message: `Documents \`${pkgName}\` but it is not in package.json.`,
        line: span.line,
        column: span.column,
        advice: `Add \`${pkgName}\` to package.json or update the doc to reference an installed package.`,
      });
    }
    return issues;
  },
});

export default stalePackageReferenceRule satisfies Rule<StalePackageContext>;
