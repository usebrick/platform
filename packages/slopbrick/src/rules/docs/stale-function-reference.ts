// Rule: docs/stale-function-reference
//
// Markdown inline code references an identifier in a calling context
// (`foo()`) that is not exported by the project. Common cause: docs
// reference a function that was renamed, deleted, or hallucinated.
//
// Strategy: sync walk of src/lib/app/components (cap 200 files) to
// collect exported names. Then for each inline span that is identifier-
// like, ≥3 chars, not in a reserved-word set, and followed by `(`
// within 50 chars — fire if it isn't in the export set.
//
// Severity: medium (callouts are usually correct, but a stale name
// surfaces copy-paste rot or hallucinated API references).
//
// aiSpecific: false.

import { readFileSync, readdirSync, existsSync, type Dirent } from 'node:fs';
import { join, extname } from 'node:path';
import type { Issue, Rule, RuleContext, ScanFacts } from '../../types';
import { createRule } from '../rule';
import { extractInlineCodeSpans } from '../../engine/doc-freshness';

// Compact set of JS reserved words + UI copy that would otherwise
// produce false positives. Smaller than the v1 set in doc-freshness
// because doc drift doesn't trip on backend-specific keywords.
const RESERVED = new Set([
  'true','false','null','undefined','this','self','get','set','init','destroy',
  'value','key','id','name','data','error','info','debug','log','warn',
  'type','class','function','const','let','var','return','if','else','for',
  'while','do','switch','case','default','break','continue','new','delete',
  'try','catch','finally','async','await','import','export','from','as',
  'then','resolve','reject','next','prev','current','index','count','length',
  'size','width','height','top','left','right','bottom','result','response',
  'request','user','message','code','status','state','props','ctx','context',
  'config','options','params','args','event','target','input','output','src',
  'dest','path','file','dir','url','header','body','token','auth','session',
  'react','node','next','vue','angular','svelte',
]);

const SOURCE_EXTS = new Set(['.ts','.tsx','.js','.jsx','.mjs','.cjs']);
const SOURCE_ROOTS = ['src','lib','app','components'];
const CAP = 200;

function walk(dir: string, out: string[], cap: number): void {
  if (!existsSync(dir) || out.length >= cap) return;
  let entries: Dirent[];
  try { entries = readdirSync(dir, { withFileTypes: true }); } catch { return; }
  for (const entry of entries) {
    if (out.length >= cap) return;
    if (entry.name === 'node_modules' || entry.name.startsWith('.')) continue;
    const full = join(dir, entry.name);
    if (entry.isDirectory()) walk(full, out, cap);
    else if (entry.isFile() && SOURCE_EXTS.has(extname(entry.name))) out.push(full);
  }
}

function collectExports(cwd: string): Set<string> {
  const out = new Set<string>();
  const files: string[] = [];
  for (const root of SOURCE_ROOTS) walk(join(cwd, root), files, CAP);
  for (const file of files) {
    let source: string;
    try { source = readFileSync(file, 'utf-8'); } catch { continue; }
    for (const re of [
      /\bexport\s+(?:async\s+)?function\s+([A-Za-z_$][\w$]*)/g,
      /\bexport\s+(?:const|let|var)\s+([A-Za-z_$][\w$]*)/g,
      /\bexport\s+class\s+([A-Za-z_$][\w$]*)/g,
      /\bexport\s+interface\s+([A-Za-z_$][\w$]*)/g,
      /\bexport\s+type\s+([A-Za-z_$][\w$]*)/g,
      /\bexport\s+default\s+(?:function\s+|class\s+)?([A-Za-z_$][\w$]*)/g,
    ]) {
      let m: RegExpExecArray | null;
      while ((m = re.exec(source)) !== null) {
        const name = m[1];
        if (name) out.add(name);
      }
    }
  }
  return out;
}

interface StaleFunctionContext extends RuleContext { exports: Set<string>; }

export const staleFunctionReferenceRule = createRule<StaleFunctionContext>({
  id: 'docs/stale-function-reference',
  category: 'docs',
  severity: 'medium',
  aiSpecific: false,
  description:
    'Markdown references an identifier in a calling context (foo()) that is not exported by the project.',
  create(context) { return { ...context, exports: collectExports(context.cwd) }; },
  analyze(context, facts): Issue[] {
    const issues: Issue[] = [];
    const source = facts.v2?._source;
    if (!source) return issues;
    for (const span of extractInlineCodeSpans(source)) {
      const text = span.text;
      if (!/^[A-Za-z_$][A-Za-z0-9_$]*$/.test(text)) continue;
      if (text.length < 3) continue;
      if (RESERVED.has(text.toLowerCase())) continue;
      if (context.exports.has(text)) continue;
      const end = Math.min(source.length, span.index + text.length + 50);
      if (!/\(/.test(source.slice(span.index, end))) continue;
      issues.push({
        ruleId: 'docs/stale-function-reference',
        category: 'docs',
        severity: 'medium',
        aiSpecific: false,
        message: `Documents \`${text}()\` but no such export exists.`,
        line: span.line, column: span.column,
        advice: `Rename the doc reference, or add a \`${text}\` wrapper export.`,
      });
    }
    return issues;
  },
});

export default staleFunctionReferenceRule satisfies Rule<StaleFunctionContext>;
