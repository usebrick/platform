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
import { fileURLToPath, pathToFileURL } from 'node:url';

import ts from 'typescript';
import { canonicalJson } from '../src/calibration/v103/canonical.js';
import {
  createCurrentEvidencePolicyAccessors,
  type CurrentEvidencePolicyAccessors,
} from '../src/rules/current-evidence-policy.js';
import { getCurrentEvidencePolicyAccessors } from '../src/rules/current-evidence-policy-runtime.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const RULES_DIR = path.resolve(__dirname, '../src/rules');
const SIGNAL_STRENGTH = path.resolve(__dirname, '../src/rules/signal-strength.json');
const OUTPUT_FILE = path.resolve(__dirname, '../docs/rule-catalog.md');

export interface GenerateRuleCatalogOptions {
  readonly policyPath?: string;
  readonly check: boolean;
}

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
//   5. Concatenated literals:       description: 'foo ' + 'bar'
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
  const source = ts.createSourceFile(
    'rule.ts',
    src,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TS,
  );
  const constants = new Map<string, ts.Expression[]>();
  let description: ts.Expression | undefined;

  const nameOf = (name: ts.PropertyName): string | undefined => {
    if (ts.isIdentifier(name) || ts.isStringLiteralLike(name)) return name.text;
    if (ts.isComputedPropertyName(name) && ts.isStringLiteralLike(name.expression)) {
      return name.expression.text;
    }
    return undefined;
  };

  const visit = (node: ts.Node): void => {
    if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && node.initializer) {
      const existing = constants.get(node.name.text) ?? [];
      existing.push(node.initializer);
      constants.set(node.name.text, existing);
    }
    if (ts.isObjectLiteralExpression(node)) {
      const id = node.properties.find((property) =>
        ts.isPropertyAssignment(property)
        && nameOf(property.name) === 'id'
        && ts.isStringLiteralLike(property.initializer),
      );
      if (id) {
        const candidate = node.properties.find((property) =>
          ts.isPropertyAssignment(property) && nameOf(property.name) === 'description',
        );
        if (candidate && ts.isPropertyAssignment(candidate)) description = candidate.initializer;
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(source);
  if (!description) return '';

  const resolve = (expression: ts.Expression, seen: ReadonlySet<ts.Node>): string => {
    if (seen.has(expression)) throw new TypeError('Cyclic rule-description constant');
    const nextSeen = new Set(seen);
    nextSeen.add(expression);

    if (ts.isStringLiteralLike(expression)) return expression.text;
    if (ts.isParenthesizedExpression(expression)
      || ts.isAsExpression(expression)
      || ts.isTypeAssertionExpression(expression)
      || ts.isNonNullExpression(expression)
      || ts.isSatisfiesExpression(expression)) {
      return resolve(expression.expression, nextSeen);
    }
    if (ts.isBinaryExpression(expression)
      && expression.operatorToken.kind === ts.SyntaxKind.PlusToken) {
      return resolve(expression.left, nextSeen) + resolve(expression.right, nextSeen);
    }
    if (ts.isIdentifier(expression)) {
      const candidates = constants.get(expression.text) ?? [];
      if (candidates.length !== 1) {
        throw new TypeError(
          `Rule description constant ${expression.text} must resolve exactly once; found ${candidates.length}`,
        );
      }
      return resolve(candidates[0]!, nextSeen);
    }
    throw new TypeError(
      `Rule description must be statically resolvable; found ${ts.SyntaxKind[expression.kind]}`,
    );
  };

  return resolve(description, new Set()).trim();
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

function assertPolicyCatalogParity(
  rules: readonly RuleMeta[],
  currentPolicy: CurrentEvidencePolicyAccessors,
): void {
  const discoveredIds = rules.map((rule) => rule.id).sort();
  const policyIds = currentPolicy.policy.rows.map((row) => row.ruleId).sort();
  if (discoveredIds.length !== 119 || policyIds.length !== 119) {
    throw new TypeError(
      `Current policy catalog must contain exactly 119 rows; discovered ${discoveredIds.length}, policy ${policyIds.length}`,
    );
  }
  if (discoveredIds.some((ruleId, index) => ruleId !== policyIds[index])) {
    throw new TypeError('Current policy rows do not exactly match the generated rule catalog');
  }
}

function render(
  rules: RuleMeta[],
  currentPolicy: CurrentEvidencePolicyAccessors | undefined,
): string {
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
    if (currentPolicy) {
      md += `| Rule | Severity | runtimeOutcome | enabledByDefault | runnableByExplicitOptIn | scoreEligible | evidenceProvenance | qualityDomain | claimClass | admitted | historicalVerdict | AI-specific | Description |\n`;
      md += `|------|----------|----------------|:----------------:|:-----------------------:|:-------------:|--------------------|---------------|------------|:--------:|-------------------|:-----------:|-------------|\n`;
    } else {
      md += `| Rule | Severity | Default | AI-specific | Description |\n`;
      md += `|------|----------|:-------:|:-----------:|-------------|\n`;
    }
    for (const r of catRules) {
      const sev = r.severity;
      const def = r.defaultOff ? 'off' : 'on';
      const ai = r.aiSpecific ? '✓' : '—';
      // escape `|` inside description
      const desc = r.description.replace(/\|/g, '\\|');
      if (currentPolicy) {
        const row = currentPolicy.getCurrentRulePolicy(r.id);
        if (!row) throw new TypeError(`Current policy is missing catalog rule ${r.id}`);
        md += `| \`${r.id}\` | ${sev} | ${row.runtimeOutcome} | ${row.enabledByDefault} | ${row.runnableByExplicitOptIn} | ${row.scoreEligible} | ${row.provenance} | ${row.qualityDomain} | ${row.claimClass} | ${currentPolicy.policy.admitted} | ${r.verdict ?? 'unavailable'} | ${ai} | ${desc} |\n`;
      } else {
        md += `| \`${r.id}\` | ${sev} | ${def} | ${ai} | ${desc} |\n`;
      }
    }
    md += '\n';
  }

  // "Default" key for readers: short glossary before "See also".
  md += `## Glossary\n\n`;
  if (currentPolicy) {
    md += `- **Current policy columns** — \`runtimeOutcome\`, default/runnable state, score authority, provenance, quality domain, claim class, and admission come only from the validated owner-approved policy projection.\n`;
    md += `- **historicalVerdict** — the immutable legacy signal-table verdict, retained as historical context only; it is not current quality authority or authorship evidence.\n`;
  } else {
    md += `- **Default** — whether the rule runs out of the box. `;
    md += `Rules marked \`off\` are \`defaultOff: true\` in [`;
    md += `../src/rules/signal-strength.json` + `](../src/rules/signal-strength.json) (typically INVERTED, NOISY, or DORMANT calibration verdict) and require explicit opt-in via \`rules: { '${'<id>'}': 'medium' }\` in \`slopbrick.config.mjs\`.\n`;
  }
  md += `- **AI-specific** — marks the AI-associated detector lane used for reporting and calibration. It is rule metadata, not proof that AI wrote a file or that the pattern is unique to AI-generated code; calibration status and default state determine how the evidence may be used.\n`;
  md += `- **Severity** — see [scoring-runbook.md](./scoring-runbook.md) for the per-severity weight in PR Slop Score.\n\n`;

  md += `## Regenerating this catalog\n\n`;
  md += `This file is **auto-generated** by [`;
  md += `scripts/generate-rule-catalog.ts` + `](../scripts/generate-rule-catalog.ts) which reads each rule file in `;
  md += `[`;
  md += `../src/rules/` + `](../src/rules/) and `;
  md += `[`;
  md += currentPolicy
    ? `../src/rules/signal-strength.json` + `](../src/rules/signal-strength.json) for separately labeled historical verdicts; current columns come from the validated \`--policy\` projection.\n\n`
    : `../src/rules/signal-strength.json` + `](../src/rules/signal-strength.json) for the \`defaultOff\` flag.\n\n`;
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

function parseOptions(args: readonly string[]): GenerateRuleCatalogOptions {
  let check = false;
  let policyPath: string | undefined;
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === '--check') {
      if (check) throw new TypeError('--check may only be supplied once');
      check = true;
      continue;
    }
    if (arg === '--policy') {
      if (policyPath !== undefined) {
        throw new TypeError('--policy may only be supplied once');
      }
      const value = args[index + 1];
      if (!value || value.startsWith('--')) {
        throw new TypeError('--policy requires one JSON file path');
      }
      policyPath = value;
      index += 1;
      continue;
    }
    throw new TypeError(`Unknown generate-rule-catalog option: ${arg}`);
  }
  return { check, ...(policyPath === undefined ? {} : { policyPath }) };
}

async function readCanonicalJson(policyPath: string): Promise<unknown> {
  const bytes = await readFile(path.resolve(policyPath), 'utf8');
  let value: unknown;
  try {
    value = JSON.parse(bytes) as unknown;
  } catch {
    throw new TypeError('Current evidence policy is not valid JSON');
  }
  const canonical = canonicalJson(value);
  if (bytes !== canonical && bytes !== `${canonical}\n`) {
    throw new TypeError('Current evidence policy must be exact canonical JSON');
  }
  return value;
}

async function resolveCurrentPolicy(
  policyPath: string | undefined,
): Promise<CurrentEvidencePolicyAccessors | undefined> {
  if (policyPath === undefined) return getCurrentEvidencePolicyAccessors();
  return createCurrentEvidencePolicyAccessors(await readCanonicalJson(policyPath));
}

export async function generateRuleCatalogOutput(
  options: GenerateRuleCatalogOptions,
): Promise<string> {
  const rules = await discoverRules();
  const currentPolicy = await resolveCurrentPolicy(options.policyPath);
  if (currentPolicy) assertPolicyCatalogParity(rules, currentPolicy);
  return render(rules, currentPolicy);
}

async function main() {
  const options = parseOptions(process.argv.slice(2));
  const rules = await discoverRules();
  const currentPolicy = await resolveCurrentPolicy(options.policyPath);
  if (currentPolicy) assertPolicyCatalogParity(rules, currentPolicy);
  const output = render(rules, currentPolicy);

  if (options.check) {
    if (!existsSync(OUTPUT_FILE)) {
      console.error(`❌ ${OUTPUT_FILE} does not exist.`);
      console.error(`   Run \`pnpm generate:rules:catalog\` to create it, then commit.`);
      process.exit(1);
    }
    const existing = await readFile(OUTPUT_FILE, 'utf8');
    if (existing !== output) {
      const authority = currentPolicy
        ? 'src/rules/ and the selected current policy projection'
        : 'src/rules/';
      console.error(`❌ ${path.relative(process.cwd(), OUTPUT_FILE)} is out of sync with ${authority}.`);
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

const executedPath = process.argv[1]
  ? pathToFileURL(path.resolve(process.argv[1])).href
  : undefined;
if (executedPath === import.meta.url) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
