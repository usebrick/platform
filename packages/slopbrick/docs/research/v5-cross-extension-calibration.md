# v5 cross-extension calibration — full rule-fire matrix

**Date:** 2026-06-26
**Status:** Audit complete + 1 critical heuristic leak fixed (business-logic → markdown)
**Scope:** All 62 rules × 4 file extensions (TS/JS, Python, SQL, Markdown)

This document captures what the v5 calibration pilots (SQL, markdown, Python) plus a v4-sample cross-extension scan revealed about which rules fire where, and the **heuristic leak** discovered during the markdown arm pilot.

---

## TL;DR — three cross-extension findings

1. **`business-logic/*` rules leak into markdown code blocks.** They use regex patterns (e.g. `/z\.string\s*\(\s*\)/`) that match literal text inside ```code fences in `.md`/`.mdx` files. The v5 markdown pilot reported `business-logic/unconstrained-zod-string` with **P=99.4%, R=0.2%, lift=158×** — an apparent massive AI-vs-human signal. It was a calibration artifact: production docs (vite, vue, svelte, astro) have zod examples; AI-generated docs don't. **Fixed**: added a file-extension guard to `analyzeBusinessLogic()` (returns `[]` for non-JS/TS/Vue/Svelte/Astro files). After the fix, business-logic findings on markdown are zero.

2. **`docs/*` rules are production-hygiene, not AI discriminators.** All 4 rules (broken-link, expired-code-example, stale-function-reference, stale-package-reference) calibrate as INVERTED or NOISY. Production docs accumulate rot (broken links, deprecated APIs) that AI-generated docs (which are fresh) don't have. The rules work correctly; the label was wrong. Recommendation: repurpose as production docs hygiene with a confidence-scored output (not a binary flag).

3. **No rule transfers to Python.** Full corpus scan of 4,765 neg + 23,665 pos `.py` files with all 62 rules = 0 issues, 0 components. The v5 plan's "re-test INVERTED JS rules on Python" hypothesis is unanswerable without first authoring Python-native rules. Recommendation: drop the Python arm from v5 — Pylint/Ruff/Mypy own that space.

---

## Full rule-fire matrix

| Rule family | TS/JS | Python | SQL | Markdown | Notes |
|-------------|-------|--------|-----|----------|-------|
| `logic/*` (zombie-state, ghost-defensive, etc.) | ✅ fires | ❌ | ❌ | ❌ | TSX/JSX-specific |
| `security/*` (missing-auth-check, hardcoded-secrets, etc.) | ✅ fires | ❌ | ❌ | ❌ | TS/JS string match |
| `component/*` (giant-component, multiple-components-per-file) | ✅ fires | ❌ | ❌ | ❌ | TSX/JSX-specific |
| `arch/*` (astro-island-leak) | ✅ fires | ❌ | ❌ | ❌ | .astro/.svelte specific |
| `visual/*` (off-scale spacing, color etc.) | ✅ fires | ❌ | ❌ | ❌ | TSX/CSS-in-JS |
| `wcag/*` (focus-appearance, target-size) | ✅ fires | ❌ | ❌ | ❌ | TSX/CSS |
| `layout/*` | ✅ fires | ❌ | ❌ | ❌ | TSX |
| `typo/*` | ✅ fires | ❌ | ❌ | ❌ | TS/JS identifiers |
| `perf/*` (halstead-anomaly) | ✅ fires | ❌ | ❌ | ❌ | TS/JS AST |
| `test/*` | ✅ fires | ❌ | ❌ | ❌ | .test.ts / .spec.ts |
| `context/*` (import-path-mismatch) | ✅ fires | ❌ | ❌ | ❌ | TS/JS imports |
| `product/*` (terminology-drift, ux-pattern-fragmentation) | ✅ fires | ❌ | ❌ | ❌ | TSX cross-file |
| **`business-logic/*`** | **✅ fires** | ❌ | ❌ | ⚠️ **leak fixed** | Regex-based; matched `z.string()` in code blocks. **After fix: only fires on JS/TS/Vue/Svelte/Astro** |
| `db/*` | ❌ | ❌ | ✅ fires | ❌ | SQL-only (uses pgsql-parser) |
| `docs/*` (stale-package/function-reference, broken-link, expired-code-example) | ❌ | ❌ | ❌ | ✅ fires | Markdown-only |
| `maintenance-cost` (categorical meta-score) | ✅ fires | ❌ | ❌ | ❌ | TS/JS AST |

**Key observation:** 11 of 13 rule families are TS/JS-specific. Only `db/*` and `docs/*` are correctly extension-scoped. The `business-logic/*` family was the outlier — now fixed.

---

## The business-logic heuristic leak in detail

### What was happening

`business-logic/unconstrained-zod-string` regex:

```ts
const ZOD_STRING = /z\.string\s*\(\s*\)/;
```

This matches the literal text `z.string()`. In a `.ts` file, this fires on real Zod schemas. In a `.md` file, it fires on `z.string()` snippets inside:

````markdown
Here's a Zod example:

```ts
const schema = z.string().email();
```
````
````

Markdown docs for libraries like Vite, Vue, Svelte, Astro, Nuxt have **hundreds** of such code examples. They trigger the rule repeatedly per file, even though the rule was designed for `.ts` source.

### Calibration artifact

The v5 markdown pilot (without the fix) reported:

```
| Rule | TP | FP | P | R | Lift | Verdict |
|------|---:|---:|--:|--:|----:|---------|
| business-logic/unconstrained-zod-string | 315 | 2 | 99.4% | 0.2% | 158.4× | USEFUL |
```

That's a **158× lift** — looks like an extraordinarily strong AI-vs-human signal. It is. But it's an artifact:
- NEG (production docs, vite/vue/svelte/astro/nuxt/nodejs): 315 fires — these docs have many zod code examples
- POS (AI-generated docs, next.js/chatgpt-next-web/langchain-template): 2 fires — these docs don't have zod code examples

The rule correctly fires on text that contains `z.string()`. The calibration just measures "how often does this text appear in AI docs vs human docs" — not "how often is this a real Zod schema violation in production code."

### The fix

Added a file-extension guard at `analyzeBusinessLogic()` entry:

```ts
const SOURCE_EXTENSION = /\.(tsx?|jsx?|vue|svelte|astro)$/i;

export function analyzeBusinessLogic(source: string, filePath: string): BusinessLogicIssue[] {
  if (!SOURCE_EXTENSION.test(filePath)) {
    return []; // ← skip non-JS/TS source
  }
  // ... existing detection logic
}
```

**After the fix:** `business-logic/*` findings on markdown are zero. Re-running the v5 markdown pilot will show only `docs/*` fires in that arm.

### Generalization

This pattern — regex-based detection without file-extension gating — should be audited across all rule families. The `db/*` and `docs/*` families use file-extension-scoped entry points (`runDbScan`, `analyzeDocs`) which is why they don't have the same problem. The rule-registry model should probably grow a `fileExtensions: string[]` field on each rule, and the engine should filter before invocation. That's a future refactor; for now the targeted guard in `analyzeBusinessLogic` is enough.

---

## Python arm: definitive no-transferability

Full corpus scan: 4,765 neg + 23,665 pos = 28,430 Python files, all 62 rules. Result: **0 issues, 0 components**.

This is the cleanest answer possible. **None of the existing rules transfer to Python.** All 62 are JS/TSX/Vue/Svelte/Astro specific.

The v5 plan's hypothesis was: "re-test INVERTED JS rules (e.g. `component/multiple-components-per-file`, `context/import-path-mismatch`) on Python to see if they're language-specific." This is **untestable** because:
1. No existing rule fires on Python at all (we'd need at least one positive fire to measure lift)
2. Authoring Python-native rules is a separate ~6-12 rule effort (`broad-except`, `print-debug-left-in`, `missing-type-hints`, etc.)
3. The market for Python per-file linting is well-served by Pylint/Ruff/Mypy

**Recommendation: drop the Python arm from v5.** Path 2 from `v5-corpus-plan.md` — "stay focused on cross-file pattern drift, not per-file linting."

---

## SQL arm: re-confirmed

See `v5-sql-pilot-results.md`. Key findings (354 neg + 974 pos):

| Rule | Verdict | Notes |
|------|---------|-------|
| `db/duplicate-index` | **USEFUL** | P=91.7%, Lift=4.0× |
| `db/missing-fk-index` | NOISY | Fires on 78.5% of production schemas — heuristic too broad |
| `db/missing-not-null` | INVERTED | AI schemas MORE careful than production (Lift=0.2×) |
| `db/naming-inconsistency` | NOISY | Equal fire rate (Lift=1.0×) |
| `db/enum-sprawl` | DORMANT | 0 fires — heuristic likely broken |
| `db/sql-concat` | DORMANT | 0 fires — heuristic likely broken |

**Recommended action:**
- `db/duplicate-index`: ship enabled (USEFUL)
- `db/missing-fk-index`: tighten heuristic or default-off (NOISY)
- `db/missing-not-null`: invert purpose — repurpose as production schema hygiene
- `db/naming-inconsistency`: tighten or default-off
- `db/enum-sprawl` / `db/sql-concat`: verify heuristics are alive with known-bad inputs

---

## Markdown arm: re-confirmed with leak fix

After the business-logic guard fix, the v5 markdown pilot numbers from `v5-markdown-pilot-results.md` are correct: docs/* rules catch production rot, not AI drift. Repurpose as production docs hygiene rules.

If the v5 markdown pilot is re-run post-fix, `business-logic/*` will no longer fire on markdown — the calibration will be cleaner and the docs/* verdicts will be the only cross-extension fire.

---

## Cross-references

- `docs/research/v5-corpus-plan.md` — full plan
- `docs/research/v5-sql-pilot-results.md` — SQL arm
- `docs/research/v5-markdown-pilot-results.md` — markdown arm
- `docs/research/v4-per-rule-pr-fpr.md` — v4 per-rule table
- `docs/research/calibration-report-2026.md` — full trajectory
- `scripts/compute-v5-per-rule.py` — P/R/FPR computation
- `signal-strength.json` — verdict storage (will be updated)
