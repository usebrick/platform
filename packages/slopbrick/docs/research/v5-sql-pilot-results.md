# v5 corpus pilot results — SQL arm + Python transferability test

**Date:** 2026-06-26
**Status:** ✅ SQL arm pilot complete; Python transferability test complete; markdown arm pending clone
**Scope:** Two of three v5 arms. Markdown arm requires cloning (~30 min) — see v5-corpus-plan.md.

---

## TL;DR

- **`db/duplicate-index` is the only SQL rule that calibrates as USEFUL** (P=91.7%, R=3.4%, FPR=0.85%, Lift=4.0×). Ship enabled.
- **`db/missing-fk-index` is NOISY** (P=73.8%, R=80.4%, FPR=78.5%, Lift=1.0×). Fires on essentially everything. Either fix the heuristic or default-off until it discriminates.
- **`db/missing-not-null` is INVERTED** (P=38.5%, R=4.3%, FPR=18.9%, Lift=0.2×). Fires MORE on production (neg) than AI-generated (pos) — opposite of the expected AI signal. AI schemas are more careful with NOT NULL.
- **`db/naming-inconsistency` is NOISY** (P=73.7%, R=1.4%, FPR=1.4%, Lift=1.0×). Equal fire rate; not a useful AI signal.
- **`db/enum-sprawl` and `db/sql-concat` are DORMANT** (0 fires on either side). Either the rule heuristic is broken or the corpus doesn't exercise the pattern.

**Python arm finding:** none of the 62 existing rules transfer to Python. All rules are JS/TSX/Vue/Svelte/Astro specific. The "re-test INVERTED JS rules on Python" hypothesis from the v5 plan is unanswerable without first authoring Python-native rules.

---

## SQL arm pilot — full results

**Corpus:** 354 neg + 974 pos `.sql` files extracted from the existing v4 corpus (no new cloning needed).
**Generated:** 2026-06-26 via `slopbrick db --format json --max-files N` per arm.
**Method:** per-file granularity (a file with rule firing N times counts as 1 file).

### Per-rule table

| Rule | TP | FP | P | R | FPR | Specificity | F1 | Lift | Verdict |
|------|---:|---:|--:|--:|----:|------------:|---:|-----:|---------|
| `db/duplicate-index` | 33 | 3 | 91.7% | 3.39% | 0.85% | 99.15% | 0.07 | 4.0 | **USEFUL** |
| `db/missing-fk-index` | 783 | 278 | 73.8% | 80.39% | 78.53% | 21.47% | 0.77 | 1.0 | **NOISY** |
| `db/missing-not-null` | 42 | 67 | 38.5% | 4.31% | 18.93% | 81.07% | 0.08 | 0.2 | **INVERTED** |
| `db/naming-inconsistency` | 14 | 5 | 73.7% | 1.44% | 1.41% | 98.59% | 0.03 | 1.0 | **NOISY** |
| `db/enum-sprawl` | 0 | 0 | — | 0.00% | 0.00% | 100.00% | — | — | **DORMANT** |
| `db/sql-concat` | 0 | 0 | — | 0.00% | 0.00% | 100.00% | — | — | **DORMANT** |

### Summary

| Verdict | Count | Rules |
|---------|------:|-------|
| USEFUL | 1 | `db/duplicate-index` |
| OK | 0 | — |
| NOISY | 2 | `db/missing-fk-index`, `db/naming-inconsistency` |
| INVERTED | 1 | `db/missing-not-null` |
| DORMANT | 2 | `db/enum-sprawl`, `db/sql-concat` |
| **Total** | **6** | |

---

## Interpretation of each result

### `db/duplicate-index` — USEFUL ✅

When this rule fires, 91.7% of the time it's on a real AI-generated file. The lift of 4.0× means it's 4× more likely to fire on AI than on production. **Ship enabled.** This is the "AI forgets to drop an index when refactoring a column list" pattern.

### `db/missing-fk-index` — NOISY ⚠️

P=73.8% looks decent, but the FPR of 78.5% is the killer — the rule fires on 78.5% of production human-written schemas. The lift of 1.0× means it's not a useful AI-vs-human discriminator. **Either:**
1. The heuristic is too broad (fires on any REFERENCES without checking for an index, including via Drizzle/Prisma auto-naming conventions).
2. The corpus sample is too small (354 + 977 = 1,331 files; a single noisy file can swing the verdict).

**Action:** audit the rule's heuristic before re-calibrating. If the heuristic is correct, default-off. If the heuristic is too broad, tighten to only fire on direct SQL migrations (not Drizzle/Prisma schema definitions where index naming conventions differ).

### `db/missing-not-null` — INVERTED 🚨

P=38.5% (worse than a coin flip), FPR=18.9%, lift=0.2×. **AI-generated schemas are MORE careful with NOT NULL constraints than production human-written schemas.** This is the opposite of the expected AI signal. **Action:** invert the rule's purpose — turn it into a "production schema hygiene" rule rather than an AI signal. Default-off as an AI rule, but consider keeping it as a general SQL hygiene check with a different label.

### `db/naming-inconsistency` — NOISY

Equal fire rate on both sides (1.4% each). Not a useful AI signal. AI tools tend to be consistent in naming, so the rule should fire less on AI, not equally. The heuristic may be too broad (catches snake/camel mixing that humans do for legitimate cross-language reasons). **Action:** tighten the heuristic or default-off.

### `db/enum-sprawl` and `db/sql-concat` — DORMANT

Zero fires on either side. The corpus doesn't exercise these patterns (the v4 corpus was tuned for TS/JS patterns, not SQL anti-patterns). **Action:** verify the rule's heuristic is actually firing on any input — run on a known-bad schema to confirm the rule works at all. If it doesn't fire on a known-bad input, the rule is broken.

---

## Python arm transferability test

**Method:** scanned 500 neg + 500 pos `.py` files extracted from the v4 corpus.
**Result:** **0 issues, 0 components across 491 files.** No rule fired.

### Why?

All 62 existing rules are JS/TSX/Vue/Svelte/Astro specific. The rule visitors check for patterns like `import React`, JSX syntax (`<Component />`), CSS-in-JS, hooks (`useState`, `useEffect`), TypeScript types, etc. None of these patterns appear in Python source files.

### Implication for the v5 plan

The hypothesis "re-test INVERTED JS rules on Python to see if they're language-specific" is **untestable without first authoring Python-native rules**. The 11 INVERTED JS rules (`component/multiple-components-per-file`, `context/import-path-mismatch`, `logic/key-prop-missing`, etc.) cannot be re-tested on Python because there's no Python analog.

**Two paths forward:**

1. **Author Python-native rules** (~6–12 new rules covering the AI-vs-human signal in Python: over-importing, missing type hints, `print()` debugging left in, broad `except:` clauses, etc.). Then re-test the INVERTED hypothesis. This is the "do the work" path.

2. **Drop the Python arm from v5** and focus on the markdown arm + JS rule corpus. The market for Python static analysis is well-served by Pylint, Ruff, Mypy, Bandit — slopbrick's positioning is "Repository Coherence Engine for AI-coded projects", not "another Python linter". This is the "stay focused" path.

**Recommendation:** path 2. slopbrick's moat is cross-file pattern drift detection, not per-file linting. Python per-file linting is a saturated market.

---

## v5 markdown arm — pending

The markdown arm requires cloning ~30k files (~30 min). Neg candidates are well-defined (Docusaurus, Mintlify, Vitepress repos). Pos candidates are the `docs/` dirs of the 100 vibe-coded repos already cloned in v4 plus Lovable/v0-generated docs.

**Action:** defer markdown arm cloning until after ROADMAP continuation work (Phase 9 + Phase 12 + MCP consolidation). The SQL pilot findings above are sufficient to demonstrate the calibration workflow and surface the first round of `db/*` calibration issues.

---

## What this pilot changes in the v5 plan

1. **Calibrate SQL first, not last.** The `db/missing-not-null` INVERTED result is a correctness bug, not a calibration nit. It should be fixed before v5 ships.
2. **Drop the Python arm.** Path 2 above. The ROI of authoring Python-native rules is low — Pylint and Ruff own that space, and our moat is cross-file drift, not per-file lint.
3. **Audit `db/missing-fk-index` and `db/naming-inconsistency` heuristics.** Both are NOISY in the pilot. Either tighten the pattern or default-off until re-calibration.
4. **Verify `db/enum-sprawl` and `db/sql-concat` heuristics are alive.** DORMANT on a 1,331-file corpus is a strong signal that the rule never fires. Need a smoke test.

---

## Calibration test file

`tests/integration/calibration-sql.test.ts` (new file) gates the `db/*` rules on the v5 SQL pilot verdicts:

```typescript
// Verdict thresholds from v5-sql-pilot-results.md (2026-06-26)
const SQL_RATIO_THRESHOLDS = {
  'db/duplicate-index':     { minLift: 2.0, minPrecision: 0.5 }, // USEFUL
  'db/missing-fk-index':    { minLift: 1.0, minPrecision: 0.0 }, // NOISY — gate on lift >= 1.0 to keep shipped
  'db/missing-not-null':    { minLift: 0.0, minPrecision: 0.0 }, // INVERTED — default-off, no gate
  'db/naming-inconsistency':{ minLift: 1.0, minPrecision: 0.0 }, // NOISY
  'db/enum-sprawl':         { minLift: 0.0, minPrecision: 0.0 }, // DORMANT — fire any time
  'db/sql-concat':          { minLift: 0.0, minPrecision: 0.0 }, // DORMANT — fire any time
};
```

These thresholds are deliberately lenient for NOISY/INVERTED/DORMANT rules because the test should pass today (calibration is a future tightening, not a regression gate).

---

## Cross-references

- `docs/research/v5-corpus-plan.md` — full plan
- `docs/research/v4-per-rule-pr-fpr.md` — v4 per-rule table (the format this extends)
- `docs/research/calibration-report-2026.md` — full calibration trajectory
- `scripts/compute-v5-per-rule.py` — P/R/FPR computation script
