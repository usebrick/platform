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
      // `crossFileDrift`, `aiQuality`, `engineeringHygiene` are
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
      // v0.18.6: require `(` to appear IMMEDIATELY after the
      // backtick span on the SAME line. The previous 50-char
      // window crossed newlines and captured `(` from subsequent
      // lines, producing false positives on every multi-line list
      // item like `- \`thresholds\` ...\n- next ...` and every
      // table row with prose on a separate line. We also reject
      // property-access (preceded by `.`) and table-cell
      // (preceded by `|`) positions because the backtick in those
      // cases is a noun, not a function call.
      const lineEnd = source.indexOf('\n', span.index);
      const restOfLine = source.slice(
        span.index,
        lineEnd === -1 ? source.length : lineEnd,
      );
      // Find the closing backtick position in restOfLine.
      const closeTick = restOfLine.indexOf('`', 1);
      if (closeTick === -1) continue;
      const afterTick = restOfLine.slice(closeTick + 1);
      if (!/^\s*\(/.test(afterTick)) continue;
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
        const looksLikeTypeAnnotation =
          !inside.includes(':') &&
          (
            /\b(string|number|boolean|null|undefined|object|array|required|optional|categorical|direct|n\/a|\bmapped\b|0[\-–][0-9]+|v[0-9]|higher is better|lower is better|added in|deprecated|pr-[0-9])\b/i.test(
              inside,
            ) ||
            // Short single-word label (≤ 24 chars, no `,`,
            // doesn't look like a function arg). Real function
            // calls are usually longer or contain commas.
            (trimmed.length > 0 && trimmed.length <= 24 && !trimmed.includes(','))
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
