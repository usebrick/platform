/**
 * v0.18.2 PR-2: drift detector for `aiSpecific` source-of-truth.
 *
 * Bug class: the rule's `aiSpecific` field is declared in the
 * rule's TypeScript source (any `*.ts` file under `src/rules`)
 * by the rule author. The `signal-strength.json` file is the
 * runtime cache that the engine reads at scan time (it's a
 * `Record<ruleId, SignalStrengthEntry>`). The `aiSpecific`
 * value lives in BOTH places. The two must agree — if they
 * drift, the engine will weight a rule differently than the
 * source declares.
 *
 * Decision: TS rule source is the source of truth at design
 * time. The `signal-strength.json` is a derived (compiled) cache
 * that the calibration script (`scripts/compute-v7-calibration.py`)
 * regenerates. This test fails CI on drift, forcing the
 * calibrator to re-run.
 *
 * G1 reproduction (verified before this test, in v0.18.1):
 *   $ grep -c '"aiSpecific":' packages/slopbrick/src/rules/signal-strength.json
 *   0     # the field was wiped on every calibration run; the
 *         #   entry dict in the script didn't include it
 *
 * The fix (in v0.18.2 PR-2): the script now writes
 * `entry["aiSpecific"] = r["aiSpecific"]` (where `r` is the row
 * dict populated from the rule-source scan at line 162-172).
 * This test catches future regressions.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const RULES_DIR = join(__dirname, '..', 'src', 'rules');
const JSON_PATH = join(__dirname, '..', 'src', 'rules', 'signal-strength.json');

interface SignalStrengthEntry {
  aiSpecific?: boolean;
  [key: string]: unknown;
}

/** Walk the rules dir and extract `{ ruleId: aiSpecific }` from
 *  the rule's TypeScript source. We rely on the meta-object
 *  pattern: `id: '...'` followed by `aiSpecific: true|false`
 *  within the same `{...}` block. The non-greedy `[\s\S]*?`
 *  matches the same pattern used by `compute-v7-calibration.py`. */
function readAiSpecificFromSource(): Map<string, boolean> {
  const out = new Map<string, boolean>();
  function walk(dir: string) {
    for (const entry of readdirSync(dir)) {
      const p = join(dir, entry);
      const base = entry;
      if (statSync(p).isDirectory()) {
        walk(p);
      } else if (
        p.endsWith('.ts') &&
        // Skip top-level harness / utility files (not rule files).
        // We use `base` (just the filename) to avoid false-positive
        // rejections like `db/duplicate-index.ts` ending in `index.ts`
        // — that's a real rule, not the directory's `index.ts`.
        base !== 'rule.ts' &&
        base !== 'index.ts' &&
        base !== 'registry.ts' &&
        base !== 'builtins.ts' &&
        base !== 'math-utils.ts' &&
        base !== 'project.ts' &&
        base !== 'registry-loader.ts' &&
        base !== 'signal-strength.ts' &&
        base !== 'utils.ts'
      ) {
        const text = readFileSync(p, 'utf-8');
        // Match the first `id: 'rule-id'` followed by the
        // FIRST `aiSpecific: true|false` in the same file. We
        // anchor to the rule's meta by requiring the `id` to
        // have a quoted string value (the rule id), and the
        // `aiSpecific` to be a literal boolean (not a variable).
        // The meta object lives in a `createRule({...})` or
        // `createXxxRule({...})` call which is the first such
        // pattern in the file.
        const m = text.match(
          /id:\s*['"]([^'"]+)['"][\s\S]{0,2000}?aiSpecific:\s*(true|false)/,
        );
        if (m) {
          out.set(m[1], m[2] === 'true');
        }
      }
    }
  }
  walk(RULES_DIR);
  return out;
}

describe('aiSpecific drift detector (v0.18.2 PR-2)', () => {
  it('rule source `aiSpecific` matches signal-strength.json for every calibrated rule', () => {
    const sourceMap = readAiSpecificFromSource();
    // Sanity: the source map should be non-empty. If it's empty,
    // the regex above broke and this drift detector would silently
    // pass. Fail loudly instead.
    expect(sourceMap.size).toBeGreaterThan(0);

    const json = JSON.parse(
      readFileSync(JSON_PATH, 'utf-8'),
    ) as Record<string, SignalStrengthEntry>;

    // v0.38.x: skip calibration-run metadata entries like
    // `_v10_1Meta` (they're not rule entries — they carry
    // corpus paths + method info, with `_v10_1MetaVerdict:
    // 'META'` as the discriminator). Same filter as
    // `tests/engine/signal-strength-guardrails.test.ts`.
    const jsonRuleIds = Object.keys(json).filter((k) => !k.startsWith('_'));

    // For every rule in the JSON, the source and JSON values
    // must agree. We iterate the JSON (the smaller set) and
    // skip source-only rules (new rules not yet calibrated).
    const mismatches: Array<{ ruleId: string; source: boolean | 'missing'; json: boolean | 'missing' }> = [];
    for (const ruleId of jsonRuleIds) {
      const entry = json[ruleId] as SignalStrengthEntry;
      const source = sourceMap.get(ruleId);
      if (source === undefined) {
        mismatches.push({ ruleId, source: 'missing', json: entry.aiSpecific ?? 'missing' });
        continue;
      }
      // The drift class: source declares X, JSON has Y.
      // The fix: re-run `scripts/compute-v7-calibration.py` to
      // regenerate the JSON from the current rule sources.
      if (entry.aiSpecific !== source) {
        mismatches.push({ ruleId, source, json: entry.aiSpecific ?? 'missing' });
      }
    }
    if (mismatches.length > 0) {
      const lines = mismatches.map(
        (m) =>
          `  ${m.ruleId}: source=${m.source} json=${m.json} — re-run scripts/compute-v7-calibration.py to regenerate signal-strength.json from the current rule sources.`,
      );
      throw new Error(
        `aiSpecific drift detected between rule source and signal-strength.json (${mismatches.length} mismatches):\n${lines.join('\n')}`,
      );
    }
    expect(mismatches).toEqual([]);
  });

  it('every source rule has its `aiSpecific` reachable (regex sanity)', () => {
    // The drift detector above iterates JSON entries. This test
    // iterates the SOURCE and verifies every rule's meta is
    // matched by the regex. Catches regex bugs (e.g. if a future
    // refactor changes the rule structure).
    const sourceMap = readAiSpecificFromSource();
    // Same number of rules as in the JSON — sanity.
    const json = JSON.parse(readFileSync(JSON_PATH, 'utf-8')) as Record<string, unknown>;
    // v0.38.x: skip calibration-run metadata entries (same filter as
    // the test above). The "jsonOnlyRules" assertion below needs to
    // exclude `_v10_1Meta` for the same reason the first test does.
    const jsonRuleIds = new Set(Object.keys(json).filter((k) => !k.startsWith('_')));
    const sourceRuleIds = new Set(sourceMap.keys());

    // Source rules not in the JSON: these are new rules that
    // haven't been calibrated yet. That's a soft warning, not
    // a hard fail. Log them but don't fail.
    const sourceOnlyRules = [...sourceRuleIds].filter((r) => !jsonRuleIds.has(r));
    if (sourceOnlyRules.length > 0) {
      // Not a hard fail. Just surface in test output.
      console.warn(
        `${sourceOnlyRules.length} rule(s) in source but not yet in signal-strength.json (need calibration): ${sourceOnlyRules.join(', ')}`,
      );
    }

    // Every JSON rule must be in the source. (The drift detector
    // above covers value mismatches; this covers the structural
    // "JSON has a rule that doesn't exist in source" case.)
    const jsonOnlyRules = [...jsonRuleIds].filter((r) => !sourceRuleIds.has(r));
    expect(jsonOnlyRules).toEqual([]);
  });
});
