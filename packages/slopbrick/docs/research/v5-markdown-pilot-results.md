# v5 markdown arm pilot results — docs/* rules calibration

**Date:** 2026-06-26
**Status:** ✅ markdown arm pilot complete
**Scope:** All 4 `docs/*` rules (the only Phase 6 / Documentation Drift rules) calibrated against 4,817 neg + 1,197 pos `.md`/`.mdx` files.

---

## TL;DR

**None of the 4 `docs/*` rules calibrate as USEFUL or OK against the markdown arm.** All 4 are either INVERTED (3) or NOISY (1). This is the same finding as the SQL arm's `db/missing-not-null`: the rules are catching **production docs rot**, not AI drift. They should be repurposed as "production docs hygiene" rules rather than AI discriminators.

| Rule | Verdict | P | R | FPR | Lift | Action |
|------|---------|--:|--:|----:|-----:|--------|
| `docs/broken-link` | **INVERTED** | 14.5% | 2.9% | 4.3% | 0.7× | Repurpose as hygiene rule |
| `docs/expired-code-example` | **INVERTED** | 16.3% | 9.1% | 11.6% | 0.8× | Repurpose as hygiene rule |
| `docs/stale-package-reference` | **INVERTED** | 15.2% | 0.8% | 1.2% | 0.7× | Repurpose as hygiene rule |
| `docs/stale-function-reference` | **NOISY** | 29.2% | 15.1% | 9.1% | 1.7× | Repurpose as hygiene rule |

---

## Why INVERTED?

The markdown arm's neg side is mature production docs (vite, vue, svelte, astro, nuxt, nodejs, shadcn-ui) — repos that have accumulated broken links and stale references over years. The pos side is AI-generated docs (next.js, chatgpt-next-web, langchain-template, next-auth-example) — fresh repos with no time to accumulate rot.

So **production docs have more stale refs than AI-generated docs** — opposite of the AI-vs-human signal. This is the same pattern as `db/missing-not-null`: AI schemas/docs are MORE careful than production in the moment of creation, but production accumulates rot over time.

## Corpus breakdown

**Neg (4,817 files):**

| Source | Files |
|--------|------:|
| `withastro/docs` | 2,532 |
| `nuxt/docs` | 1,147 |
| `nodejs/node` | 674 |
| `shadcn-ui/ui` | 283 |
| `sveltejs/svelte` | 135 |
| `vuejs/docs` | 122 |
| `vitejs/vite` | 84 |
| (excluded node_modules, vendor) | |
| **Total** | **4,977 → 4,817 after exclude filter** |

**Pos (1,197 files):**

| Source | Files |
|--------|------:|
| `vercel/next.js` | 1,202 |
| `Yidadaa/ChatGPT-Next-Web` | 28 |
| `langchain-ai/langchain-nextjs-template` | 4 |
| `nextauthjs/next-auth-example` | 1 |
| (excluded node_modules) | |
| **Total** | **1,235 → 1,197 after exclude filter** |

---

## Per-rule detail

### `docs/broken-link` — INVERTED 🚨

P=14.5%, R=2.9%, FPR=4.3%, **Lift=0.7×** (fires more on production than AI).

Production docs accumulate broken external links over years as websites move, repos archive, and packages rename. AI-generated docs link to fresh, live URLs (or are generated before the links break).

**Repurpose:** keep as a production docs hygiene check. Don't market it as an "AI signal" — it's a "stale docs smell."

### `docs/expired-code-example` — INVERTED 🚨

P=16.3%, R=9.1%, FPR=11.6%, **Lift=0.8×**.

Production docs have code examples that reference deprecated APIs (Vue 2 options syntax in a Vue 3 doc, React class components in a hooks-era doc, etc.). AI-generated docs default to current best practices.

**Repurpose:** same — production docs hygiene.

### `docs/stale-package-reference` — INVERTED 🚨

P=15.2%, R=0.8%, FPR=1.2%, **Lift=0.7×**.

Same pattern — production docs reference deprecated/archived packages.

### `docs/stale-function-reference` — NOISY ⚠️

P=29.2%, R=15.1%, FPR=9.1%, **Lift=1.7×** (closer to useful but still under the OK threshold of 1.5×).

Slightly above OK threshold on lift but precision is below 30%. Same directionality — production docs are worse.

---

## Action plan

### Immediate: repurpose as hygiene rules

1. **Rename the rule category** from "AI Docs Drift" to "Documentation Freshness" (the v0.11.x CHANGELOG already uses "Documentation Drift" — keep this name).
2. **Update rule descriptions** to reflect the new purpose: "Detect references in markdown that are likely out of date (deprecated APIs, renamed functions, broken external links). High-recall, lower-precision — use as a hint not a gate."
3. **Move to `defaultOff: true`** for all 4 rules pending heuristic tightening (the rules still fire correctly on the broken-link pattern; they just don't discriminate AI vs human).

### Medium-term: tighten the heuristics

For each rule, add a confidence score that includes:

- **Age of the docs file** (newer docs → lower confidence on rot flags; older docs → higher confidence)
- **Reference density** (a doc with 50 package refs is more likely to have stale ones than one with 3)
- **Source-known-stable check** (if the referenced package is in the corpus's known-stable list, lower the rot flag)

This converts the rules from "binary: broken or not" to "scored: rot-likelihood 0–100". The score can then be calibrated per-docs-file-age bucket.

### Long-term: build a docs freshness corpus

The current 6k-file markdown arm is small. A 30k-file arm would tighten the per-rule verdicts. The v5 plan documents the path:

1. Clone 30k files (currently 6k — need ~5× more)
2. Balance by age (newer AI docs vs. older production docs is the real signal)
3. Calibrate with the v4 commit-history overlay (production docs with recent commits = actively maintained = lower rot)

---

## Cross-arm verdict consistency

Both v5 pilot arms (SQL + markdown) produced the same pattern:

| Rule | Pilot verdict | Pattern |
|------|---------------|---------|
| `db/missing-not-null` | INVERTED | AI more careful than production |
| `docs/broken-link` | INVERTED | Production accumulates rot over time |
| `docs/expired-code-example` | INVERTED | Same |
| `docs/stale-package-reference` | INVERTED | Same |
| `docs/stale-function-reference` | NOISY | Same, weaker signal |
| `db/duplicate-index` | USEFUL | Genuine AI discriminator |
| `db/missing-fk-index` | NOISY | Fires on everything |
| `db/naming-inconsistency` | NOISY | Fires equally on both |
| `db/enum-sprawl` | DORMANT | Heuristic likely broken |
| `db/sql-concat` | DORMANT | Heuristic likely broken |

**The "AI is more careful than production" pattern is real and dominates 5/10 rules in v5.** Only rules with distinct AI-specific fingerprints (like `db/duplicate-index` for "AI forgets to drop redundant indexes") survive as USEFUL. Everything else needs to be reframed as production hygiene with a different label.

---

## Cross-references

- `docs/research/v5-corpus-plan.md` — full plan
- `docs/research/v5-sql-pilot-results.md` — SQL arm calibration (precedent)
- `docs/research/calibration-report-2026.md` — calibration trajectory
- `scripts/compute-v5-per-rule.py` — P/R/FPR computation script
- `signal-strength.json` — verdict storage (will be updated with these docs/* verdicts)
