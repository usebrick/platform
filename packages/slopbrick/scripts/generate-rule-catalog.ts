/**
 * Generates docs/rule-catalog.md from src/rules/ (real rule modules) +
 * src/rules/signal-strength.json (default-off + calibration verdict).
 *
 * Run with: pnpm generate:rules:catalog
 *
 * Wired into scripts/generate-rule-registry.ts's `pnpm generate:rules`
 * orchestrator so a single `pnpm generate:rules` regenerates both
 * `src/rules/builtins.ts` AND `docs/rule-catalog.md`.
 *
 * --check mode: emit to stdout instead of writing; exit 1 if existing
 * file would change. Wire into CI to fail loudly when the catalog drifts
 * from src/rules/.
 */
import { existsSync } from 'node:fs';
import { readdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const RULES_DIR = path.resolve(__dirname, '../src/rules');
const SIGNAL_STRENGTH = path.resolve(__dirname, '../src/rules/signal-strength.json');
const OUTPUT_FILE = path.resolve(__dirname, '../docs/rule-catalog.md');

interface SignalStrength {
  recall?: number;
  fpRate?: number;
  ratio?: number;
  precision?: number;
  verdict?: string;
  defaultOff?: boolean;
  lastCalibratedAt?: string;
}

interface RuleMeta {
  /** Rule id from the source file (`id: 'category/name'`). Authoritative for grouping. */
  id: string;
  /** The category the rule declares (`category: '...'`). Usually matches id prefix, but doesn't have to. */
  fileCategory: string;
  /** Physical folder the rule file lives in. */
  file: string;
  /** Source severity (`severity: 'low' | 'medium' | 'high'`). */
  severity: 'low' | 'medium' | 'high';
  /** Whether the rule fires on AI-specific facts. */
  aiSpecific: boolean;
  /** Short description from `description: '...'`. */
  description: string;
  /** Whether the rule is `defaultOff: true` in signal-strength.json. */
  defaultOff: boolean;
  /** Calibration verdict (USEFUL / OK / HYGIENE / NOISY / INVERTED / DORMANT). */
  verdict: string | null;
}

// ---------------------------------------------------------------------------
// Description extraction — handles:
//   1. Inline string literals:     description: 'foo'
//   2. Multiline string literals:  description:\n  'foo\n  bar'
//   3. Mixed quote types:          description: "foo 'bar' baz"
//   4. Constant references:        description: SOME_CONST
// ---------------------------------------------------------------------------

function extractRuleMeta(src: string): {
  id?: string;
  category?: string;
  severity?: 'low' | 'medium' | 'high';
  aiSpecific?: boolean;
  description?: string;
} {
  const find = (re: RegExp): string | undefined => src.match(re)?.[1];

  return {
    id: find(/\bid:\s*['"]([^'"]+)['"]/),
    category: find(/category:\s*['"]([^'"]+)['"]/),
    severity: find(/severity:\s*['"]([^'"]+)['"]/) as 'low' | 'medium' | 'high' | undefined,
    aiSpecific: /aiSpecific:\s*true/.test(src) ? true : /aiSpecific:\s*false/.test(src) ? false : undefined,
    description: extractDescription(src),
  };
}

function extractDescription(src: string): string {
  // Find the `id:` field that opens the rule body.
  const idM = src.match(/\bid:\s*['"][^'"]+['"]/);
  if (!idM) return '';
  const idPos = idM.index!;

  // The rule's *own* `description:` lives between `id:` and the next
  // `create(` / `analyze(` call. Anything past that boundary is a
  // FixSuggestion / Issue description inside the analyze body.
  const afterId = src.slice(idPos + idM[0].length);
  const endOfMetadata = afterId.search(/\b(create|analyze)\s*[<(]/);
  const region = endOfMetadata < 0 ? afterId : afterId.slice(0, endOfMetadata);

  const descIdx = region.indexOf('description:');
  if (descIdx < 0) return '';
  let pos = descIdx + 'description:'.length;
  while (pos < region.length && /\s/.test(region[pos])) pos++;
  if (pos >= region.length) return '';

  const opener = region[pos];
  if (opener !== "'" && opener !== '"' && opener !== '`') {
    // Constant reference — record the name so the gap is visible.
    const ident = region.slice(pos).match(/^[A-Za-z_$][A-Za-z0-9_$]*/);
    return ident ? `[constant: ${ident[0]}]` : '';
  }

  pos++;
  let buf = '';
  while (pos < region.length) {
    const c = region[pos];
    if (c === '\\' && pos + 1 < region.length) {
      buf += region[pos + 1];
      pos += 2;
      continue;
    }
    if (c === opener) break;
    buf += c;
    pos++;
  }
  return buf.trim();
}

async function discoverRules(): Promise<RuleMeta[]> {
  const ss = (await readFile(SIGNAL_STRENGTH, 'utf8').catch(() => '{}')) as string;
  const signalStrength: Record<string, SignalStrength> = JSON.parse(ss);

  const entries = await readdir(RULES_DIR, { withFileTypes: true });
  const categories = entries.filter((e) => e.isDirectory()).map((e) => e.name).sort();

  const out: RuleMeta[] = [];

  for (const category of categories) {
    const dir = path.join(RULES_DIR, category);
    const files = (await readdir(dir))
      .filter((f) => f.endsWith('.ts') && !f.endsWith('.test.ts'))
      .filter((f) => f !== 'utils.ts' && !f.endsWith('.utils.ts'))
      // Barrel re-exports (`index.ts`) don't declare rules; skip them
      // so the catalog build doesn't fail on `dead/index.ts` etc.
      .filter((f) => f !== 'index.ts')
      .sort();

    for (const file of files) {
      const filePath = path.join(dir, file);
      const src = await readFile(filePath, 'utf8');
      const meta = extractRuleMeta(src);

      if (!meta.id) {
        throw new Error(`Could not find id in ${path.join(category, file)}`);
      }

      const id = meta.id;
      const ssEntry = signalStrength[id] || {};
      const desc = meta.description || '';
      out.push({
        id,
        fileCategory: meta.category || category,
        file: file.replace(/\.ts$/, ''),
        severity: meta.severity || 'medium',
        aiSpecific: meta.aiSpecific === true,
        description: desc || '(description missing — file has no `description:` field at top of rule)',
        defaultOff: ssEntry.defaultOff === true,
        verdict: ssEntry.verdict || null,
      });
    }
  }

  return out;
}

function groupBy(rules: RuleMeta[], key: 'id' | 'fileCategory'): Map<string, RuleMeta[]> {
  const m = new Map<string, RuleMeta[]>();
  for (const r of rules) {
    const group = key === 'id' ? r.id.split('/')[0] : r.fileCategory;
    const arr = m.get(group) || [];
    arr.push(r);
    m.set(group, arr);
  }
  return m;
}

function count<T>(items: T[], pred: (t: T) => boolean): number {
  return items.filter(pred).length;
}

function render(rules: RuleMeta[]): string {
  // Sanity check: dedupe by id
  const seen = new Set<string>();
  for (const r of rules) {
    if (seen.has(r.id)) {
      throw new Error(`Duplicate rule id in catalog: ${r.id}`);
    }
    seen.add(r.id);
  }

  // Group by id-prefix (the canonical category)
  const byIdCat = groupBy(rules, 'id');

  // Sort categories by name alphabetically for stable output.
  const categories = [...byIdCat.keys()].sort();
  // Stable ordering inside each category
  for (const c of categories) {
    byIdCat.get(c)!.sort((a, b) => a.id.localeCompare(b.id));
  }

  // Severity counts
  const highCount = count(rules, (r) => r.severity === 'high');
  const medCount = count(rules, (r) => r.severity === 'medium');
  const lowCount = count(rules, (r) => r.severity === 'low');

  // Category counts (sorted alphabetically, descending by count)
  // Pad category names evenly so the column lines up.
  const catNameWidth = Math.max(...categories.map((c) => c.length));
  const catRows = categories
    .map((c) => `| \`${c.padEnd(catNameWidth)}\` | ${byIdCat.get(c)!.length} |`)
    .join('\n');

  let md = '';
  md += `# slopbrick Rule Catalog\n\n`;
  md += `**Total rules: ${rules.length}** — maintained in [`;
  md += `../src/rules/builtins.ts` + `](../src/rules/builtins.ts) (auto-regenerated by [`;
  md += `scripts/generate-rule-registry.ts` + `](../scripts/generate-rule-registry.ts) on every build/test).\n`;
  md += `This file is auto-generated by [`;
  md += `scripts/generate-rule-catalog.ts` + `](../scripts/generate-rule-catalog.ts).\n\n`;

  md += `## Severity distribution\n\n`;
  md += `| Severity | Count |\n`;
  md += `|----------|------:|\n`;
  md += `| high     | ${highCount} |\n`;
  md += `| medium   | ${medCount} |\n`;
  md += `| low      | ${lowCount} |\n\n`;

  md += `## Category distribution\n\n`;
  md += `| Category   | Count |\n`;
  md += `|------------|------:|\n`;
  md += `${catRows}\n\n`;

  // Per-category sections.
  for (const cat of categories) {
    const catRules = byIdCat.get(cat)!;
    const one = catRules.length === 1;

    md += `## \`${cat}/\` (${catRules.length} rule${one ? '' : 's'})\n\n`;
    md += `| Rule | Severity | Default | AI-specific | Description |\n`;
    md += `|------|----------|:-------:|:-----------:|-------------|\n`;
    for (const r of catRules) {
      const sev = r.severity;
      const def = r.defaultOff ? 'off' : 'on';
      const ai = r.aiSpecific ? '✓' : '—';
      // escape `|` inside description
      const desc = r.description.replace(/\|/g, '\\|');
      md += `| \`${r.id}\` | ${sev} | ${def} | ${ai} | ${desc} |\n`;
    }
    md += '\n';
  }

  // "Default" key for readers: short glossary before "See also".
  md += `## Glossary\n\n`;
  md += `- **Default** — whether the rule runs out of the box. `;
  md += `Rules marked \`off\` are \`defaultOff: true\` in [`;
  md += `../src/rules/signal-strength.json` + `](../src/rules/signal-strength.json) (typically INVERTED, NOISY, or DORMANT calibration verdict) and require explicit opt-in via \`rules: { '${'<id>'}': 'medium' }\` in \`slopbrick.config.mjs\`.\n`;
  md += `- **AI-specific** — marks the AI-associated detector lane used for reporting and calibration. It is rule metadata, not proof that AI wrote a file or that the pattern is unique to AI-generated code; calibration status and default state determine how the evidence may be used.\n`;
  md += `- **Severity** — see [scoring-runbook.md](./scoring-runbook.md) for the per-severity weight in PR Slop Score.\n\n`;

  md += `## Regenerating this catalog\n\n`;
  md += `This file is **auto-generated** by [`;
  md += `scripts/generate-rule-catalog.ts` + `](../scripts/generate-rule-catalog.ts) which reads each rule file in `;
  md += `[`;
  md += `../src/rules/` + `](../src/rules/) and `;
  md += `[`;
  md += `../src/rules/signal-strength.json` + `](../src/rules/signal-strength.json) for the \`defaultOff\` flag.\n\n`;
  md += `If you add or change a rule, regenerate the registry (which also regenerates this catalog):\n\n`;
  md += '```bash\n';
  md += `pnpm generate:rules\n`;
  md += '```\n\n';
  md += `This runs automatically before \`pnpm build\` and \`pnpm test\` via the existing \`prebuild\` / pre-` + `\`test\`` + ` chain.\n\n`;

  md += `## See also\n\n`;
  md += `- [scoring-runbook.md](./scoring-runbook.md) — interpreting the four headline scores\n`;
  md += `- [../../../ROADMAP.md](../../../ROADMAP.md) — canonical platform roadmap\n`;

  return md;
}

async function main() {
  const checkMode = process.argv.includes('--check');

  const rules = await discoverRules();
  const output = render(rules);

  if (checkMode) {
    if (!existsSync(OUTPUT_FILE)) {
      console.error(`❌ ${OUTPUT_FILE} does not exist.`);
      console.error(`   Run \`pnpm generate:rules:catalog\` to create it, then commit.`);
      process.exit(1);
    }
    const existing = await readFile(OUTPUT_FILE, 'utf8');
    if (existing !== output) {
      console.error(`❌ ${path.relative(process.cwd(), OUTPUT_FILE)} is out of sync with src/rules/.`);
      console.error(`   Run \`pnpm generate:rules:catalog\` and commit the result.`);
      console.error(`   (${rules.length} rule(s) discovered; existing file has different content.)`);
      process.exit(1);
    }
    console.log(`✓ ${path.relative(process.cwd(), OUTPUT_FILE)} is in sync (${rules.length} rule(s)).`);
    return;
  }

  await writeFile(OUTPUT_FILE, output, 'utf8');
  console.log(`Generated ${OUTPUT_FILE} with ${rules.length} rule(s).`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
