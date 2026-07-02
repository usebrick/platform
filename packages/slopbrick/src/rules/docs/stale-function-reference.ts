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

import { readFileSync, readdirSync, existsSync } from 'node:fs';
import type { Dirent } from 'node:fs';
import { join, extname } from 'node:path';
import type { Issue, Rule, RuleContext, ScanFacts } from '../../types';
import { createRule } from '../rule';
import { extractInlineCodeSpans } from '../../engine/doc-freshness';

// v0.18.6: expanded reserved set. Adds framework names, model
// names, common slop-audit lingo, and a few common TypeScript
// terms that would otherwise produce false positives in markdown
// tables and prose. The rule's `(` lookahead is also restricted
// to the same line as the backtick span (see the analyze() body),
// which kills the multi-line list-item false positives.
const RESERVED = new Set([
  // JS reserved words
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
  // Framework / runtime names
  'html','astro','python','jvm','kotlin','swift','dart','ruby','rust','cpp',
  'go','java','php','php-html','csharp','typescript','javascript','jsx','tsx',
  'mjs','cjs','esnext','es6','es2022','es2023','esm','cjs','umd','amd',
  'commonjs','require','module','exports','define','global','window','document',
  'process','console','buffer','stream','fetch','axios','express','fastify',
  'koa','hapi','nextjs','nuxt','remix','gatsby','sveltekit','solid','preact',
  'qwik','lit','stencil','marko','alpine','stimulus','turbo','hotwire',
  // Models / providers
  'gpt','claude','gpt-3','gpt-3.5','gpt-4','gpt-oss','haiku','sonnet','opus',
  'aider','tabby','copilot','cursor','windsurf','devin','claude-code',
  // LLM-detection lingo
  'heuristic','heuristics','calibrate','calibration','calibrator',
  'corpus','baseline','baselines','corpus-baselines','lift','recall',
  'precision','fpRate','ratio','verdict','USEFUL','NOISY','INVERTED',
  'HYGIENE','DORMANT','OK','aiSpecific','defaultOff',
  // Common slop-audit verbs/nouns
  'commit','push','reset','rebase','merge','cherry-pick','revert',
  'scan','parse','build','test','lint','format','check','audit',
  'fix','patch','diff','pr','ci','cd','gh','npm','npx','pnpm',
  'yaml','json','toml','csv','md','mdx','sh','bash','zsh','fish',
  'ascii','utf8','utf-8','base64','hex','binary','text',
  // Common design / ui terms
  'flex','grid','auto','min','max','fill','stretch','wrap','nowrap',
  'inline','block','hidden','visible','static','fixed','absolute','relative',
  'sticky','pointer','cursor','focus','hover','active','disabled','readonly',
  'primary','secondary','tertiary','success','warning','danger','info','muted',
  'sm','md','lg','xl','xxl','xs','2xl','3xl','4xl',
  // Math / types
  'array','map','set','weakmap','weakset','object','string','number',
  'boolean','bigint','symbol','null','undefined','any','unknown','never',
  'void','readonly','private','public','protected','static','abstract',
  'async','generator','iterator','iterable','promise','observable',
  // Auth / domain
  'admin','user','guest','anonymous','authenticated','unauthenticated',
  'jwt','oauth','oidc','saml','csrf','xss','sql','nosql','orm','prisma',
  'drizzle','sequelize','mongoose','redis','postgres','mysql','sqlite',
  'kafka','rabbitmq','graphql','rest','grpc','websocket',
  // slop-audit specific
  'slopbrick','usebrick','deadcode','unused','orphan','zombie',
  'blocker','warning','info','error','verbose','debug','silly',
  'p50','p90','p95','p99','min','max','avg','mean','median',
  'ratchet','tier','composite','fitness','fpr','tpr','roc',
  'should','could','would','might','must','shall','may','can',
  'todo','fixme','xxx','hack','note','warning','attention',
  'h1','h2','h3','h4','h5','h6','strong','em','b','i','u',
  'true','false','yes','no','on','off','enable','disable',
  'ltr','rtl','auto','start','end','center','baseline','stretch',
  'rounded','sharp','outline','ghost','link','filled',
  'row','col','gap','pad','margin','padding','border','shadow',
  'transparent','currentcolor','inherit','initial','unset','revert',
  'hover','focus','active','disabled','checked','indeterminate',
  'open','close','expanded','collapsed','selected','pressed',
  // Web/CSS
  'div','span','p','a','img','ul','ol','li','table','tr','td','th',
  'thead','tbody','tfoot','caption','figure','figcaption','main','section',
  'article','aside','header','footer','nav','form','input','button','select',
  'option','textarea','label','fieldset','legend','details','summary',
  'dialog','menu','menuitem','template','slot','picture','source','track',
  'video','audio','canvas','svg','iframe','embed','object','portal',
  // Common business terms
  'api','cli','ui','ux','sdk','ide','cli','docs','doc','blog','post',
  'page','view','tab','panel','card','list','grid','form','modal','menu',
  'button','icon','avatar','badge','chip','tooltip','popover','dropdown',
  'banner','alert','toast','notification','drawer','sidebar','navbar',
  'header','footer','hero','cta','cta-primary','cta-secondary',
  'pricing','price','cost','rate','percent','pct','count','total',
  'small','medium','large','xl','xxl','tiny','huge',
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
      // v0.18.6: also collect field names from `export interface` and
      // `export type` declarations. Without this, fields like
      // `crossFileDrift`, `aiSlopScore`, `engineeringHygiene` are
      // flagged as stale even though they're valid type fields.
      /^\s*(?:readonly\s+)?([A-Za-z_$][\w$]*)\s*[?:]/gm,
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

// Detect prose/file-path labels inside the parens that follow a
// backtick span. The backtick context is `\`foo\` (label)` where
// `label` is a description, NOT a function call. We want to keep
// firing on real calls — `()`, `(1)`, `(2, 3)`, `(2, 3, 4)`,
// `(a, b)` — and skip labels that just happen to contain a `(`.
function looksLikeProseLabel(inside: string): boolean {
  const trimmed = inside.trim();
  if (trimmed.length === 0) return false; // `()` is a real call
  // File path / inline-code ref: starts with backtick or contains
  // one. Catches `(\`sqlalchemy/ext/instrumentation.py\`)`,
  // `(6 datastore providers in \`chatgpt-retrieval-plugin\`)`, etc.
  if (trimmed.startsWith('`') || trimmed.startsWith('/')) return true;
  if (trimmed.includes('`')) return true;
  // Numeric + unit: "4 scores", "30 min", "1 hour",
  // "R-MED, 30 min", "5 datastore providers". A function call
  // never has this shape.
  if (/\d+\s+[a-z]/i.test(trimmed)) return true;
  // 3+ comma-separated items where at least one is non-numeric
  // is a prose list (id, category, severity, rationale, fix path),
  // not a function call. Real multi-arg calls are usually all
  // numeric or all single-word identifiers — not multi-word prose.
  const parts = trimmed.split(',').map((s) => s.trim());
  if (parts.length >= 3) {
    const allNumeric = parts.every((p) => /^\d+\.?\d*$/.test(p));
    if (!allNumeric) return true;
  }
  // Long descriptive label without any commas (a sentence, a
  // requirement, a "requires X — separate task" note). Real
  // function calls rarely exceed 40 chars and almost always
  // contain a comma or `=>` once they're that long. Catches
  // "requires report format changes — separate task" etc.
  if (trimmed.length > 40 && !trimmed.includes(',')) return true;
  // Em-dash / en-dash is a strong prose signal; real function
  // call arguments don't contain `—` or `–`.
  if (trimmed.includes('—') || trimmed.includes('–')) return true;
  return false;
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
      // v0.18.7: require a CALL CONTEXT for the backtick span.
      // Two patterns qualify (must be same line as the backtick):
      //   (a) direct call — `(` appears immediately after the
      //       closing backtick (whitespace OK). The v0.18.6 rule.
      //   (b) identifier repeats as a call — the same identifier
      //       appears later on the line followed by `(`. Catches
      //       `Use the \`multiply\` helper: multiply(2, 3) ...`
      //       where the function call is documented in prose
      //       rather than adjacent to the backtick. The v0.18.5
      //       50-char window crossed newlines and caught prose
      //       parens far away; the identifier-repeat check
      //       guarantees we only fire when the doc is actually
      //       showing the identifier AS a call.
      const lineEnd = source.indexOf('\n', span.index);
      const restOfLine = source.slice(
        span.index,
        lineEnd === -1 ? source.length : lineEnd,
      );
      const closeTick = restOfLine.indexOf('`', 1);
      if (closeTick === -1) continue;
      const afterTick = restOfLine.slice(closeTick + 1);
      const directCall = /^\s*\(/.test(afterTick);
      let identifierRepeats = false;
      if (!directCall) {
        // Case-SENSITIVE: docs and exports usually agree on
        // capitalization. Case-insensitive matching produces
        // false positives like `REFERENCES` matching the
        // unrelated `references()` Drizzle helper on the
        // same line.
        const afterSpan = restOfLine.slice(closeTick + 1);
        const needle = text + '(';
        identifierRepeats = afterSpan.indexOf(needle) !== -1;
      }
      if (!directCall && !identifierRepeats) continue;
      // Reject property access: look at the char immediately
      // before the opening backtick.
      const beforeTickIdx = span.index - 1;
      const beforeChar = beforeTickIdx >= 0 ? source[beforeTickIdx] : '';
      if (beforeChar === '.' || beforeChar === '|') continue;
      // Reject field-annotation patterns: `fieldName` (type, optional)
      // or `fieldName` (0–100, higher is better). The content
      // inside the parens is a type description, not a function
      // call. Heuristic: the parens' content does NOT contain a
      // colon (function calls usually do — `fn(arg: Type)`) AND
      // contains a TS-type keyword OR a range/numeric descriptor.
      const parenStart = restOfLine.indexOf('(', closeTick);
      const parenEnd = restOfLine.indexOf(')', parenStart);
      if (parenStart !== -1 && parenEnd !== -1) {
        const inside = restOfLine.slice(parenStart + 1, parenEnd);
        // v0.18.6: expanded type-annotation detection. Catches
        // the common docs patterns:
        //   `field` (v0.16.0+)
        //   `field` (string, required)
        //   `field` (0-100, higher is better)
        //   `field` (categorical, mapped via lookup)
        //   `field` (n/a, in PR-2)
        //   `field` (deprecated as of 0.18.0)
        //   `field` (added in 0.6.2)
        //   `field` (MCP)            — short label
        //   `field` (composite)       — short label
        //   `field` (PR-3)             — short label
        const trimmed = inside.trim();
        // v0.18.7: also filter PROSE labels — the most common
        // false positive when a backtick is followed by ` (some
        // description)`. Patterns that are NOT function calls:
        //   - file path / inline-code ref: starts with backtick
        //     or contains a backtick (`/...py`, `(.../path)`)
        //   - numeric + unit: "4 scores", "30 min", "1 hour"
        //   - 3+ comma-separated items where at least one is
        //     non-numeric (a property/field list like
        //     "id, category, severity, rationale, fix path")
        // Real function calls stay: `foo()`, `foo(1)`,
        // `foo(2, 3)`, `foo(a, b)`, `foo(2, 3, 4)`.
        if (looksLikeProseLabel(inside)) continue;
        const looksLikeTypeAnnotation =
          !inside.includes(':') &&
          (
            /\b(string|number|boolean|null|undefined|object|array|required|optional|categorical|direct|n\/a|\bmapped\b|0[\-–][0-9]+|v[0-9]|higher is better|lower is better|added in|deprecated|pr-[0-9])\b/i.test(
              inside,
            ) ||
            // Short single-word label (≤ 24 chars, no `,`,
            // doesn't look like a function arg). Real function
            // calls are usually longer or contain commas.
            (trimmed.length > 0 && trimmed.length <= 24 && !trimmed.includes(',') && /[a-zA-Z]/.test(trimmed))
          );
        if (looksLikeTypeAnnotation) continue;
      }
      issues.push({
        ruleId: 'docs/stale-function-reference',
        category: 'docs',
        severity: 'medium',
        aiSpecific: false,
        message: `Documents \`${text}()\` but no such export exists.`,
        line: span.line, column: span.column,
        advice: `Rename the doc reference, or add a \`${text}\` wrapper export.`,
        extras: { identifier: text },
      });
    }
    return issues;
  },
});

export default staleFunctionReferenceRule satisfies Rule<StaleFunctionContext>;
