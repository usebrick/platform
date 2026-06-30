// Rule: docs/expired-code-example
//
// Fenced code block in a markdown doc imports a package that isn't
// in package.json. Mirrors the v1 detection in
// `src/engine/doc-freshness.ts` — same heuristics, same output shape,
// but as a first-class Rule so it composes with the rest of the
// rules pipeline.
//
// Strategy: for each fenced code block (ts/tsx/js/jsx/javascript/
// typescript only, ≥2 lines), run `extractImports` and check each
// bare specifier against the declared packages set.
//
// Severity: medium (a copy-pasteable example that doesn't install is
// the textbook doc-drift failure mode).
//
// aiSpecific: false (humans leave stale import examples behind too).

import type { Issue, Rule, RuleContext, ScanFacts } from '../../types';
import { createRule } from '../rule';
import {
  declaredPackages,
  extractFencedCodeBlocks,
} from '../../engine/doc-freshness';
import { extractImports } from '../../mcp/patterns';

const CODE_LANGS = new Set(['ts', 'tsx', 'js', 'jsx', 'javascript', 'typescript']);

interface ExpiredCodeContext extends RuleContext {
  packages: Set<string>;
}

function stripSubpath(spec: string): string {
  if (spec.startsWith('@')) return spec.split('/').slice(0, 2).join('/');
  return spec.split('/')[0] ?? spec;
}

export const expiredCodeExampleRule = createRule<ExpiredCodeContext>({
  id: 'docs/expired-code-example',
  category: 'docs',
  severity: 'medium',
  aiSpecific: false,
  description:
    'A fenced code example imports a package that is not declared in package.json.',
  create(context) {
    return { ...context, packages: declaredPackages(context.cwd) };
  },
  analyze(context, facts): Issue[] {
    const issues: Issue[] = [];
    const source = facts.v2?._source;
    if (!source) return issues;
    // v0.18.6: lazy-resolve the package set on first use. The
    // `context.packages` from create() works in scan-pipeline mode
    // but is empty in the engine's `buildDocFreshness` path (which
    // calls create then analyze with separate context objects).
    // Resolve the package set from disk on demand and cache it on
    // `context` for the duration of this analyze call.
    let packages = context.packages as Set<string> | undefined;
    if (!packages || !packages.size) {
      packages = declaredPackages(context.cwd);
      try {
        const pkg = JSON.parse(
          require('node:fs').readFileSync(
            require('node:path').join(context.cwd, 'package.json'),
            'utf-8',
          ),
        ) as { name?: string };
        if (pkg.name) packages.add(pkg.name);
      } catch {
        // Ignore — package.json is malformed or missing.
      }
      // Stash back on context so a second analyze() call (if any)
      // reuses the resolved set.
      (context as { packages?: Set<string> }).packages = packages;
    }
    const blocks = extractFencedCodeBlocks(source);
    for (const block of blocks) {
      if (!CODE_LANGS.has(block.lang)) continue;
      if (block.body.split('\n').length < 2) continue;
      const imports = extractImports(block.body);
      for (const imp of imports) {
        // extractImports only returns bare specifiers (it skips
        // relative paths), so we don't need a separate branch for
        // relative imports here.
        const pkgName = stripSubpath(imp);
        if (packages.has(pkgName)) continue;
        issues.push({
          ruleId: 'docs/expired-code-example',
          category: 'docs',
          severity: 'medium',
          aiSpecific: false,
          message:
            `Code example imports \`${imp}\` but \`${pkgName}\` is not in package.json.`,
          line: block.line,
          column: block.column,
          advice: `Add \`${pkgName}\` to package.json or update the example.`,
        });
      }
    }
    return issues;
  },
});

export default expiredCodeExampleRule satisfies Rule<ExpiredCodeContext>;
