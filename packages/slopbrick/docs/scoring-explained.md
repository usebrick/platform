# SlopBrick scoring explained

A short, plain-language reference for the four scores that `slopbrick scan`
reports. Read this if the numbers in the CLI output don't make sense.

> **v0.15.0+:** The single `Slop Index` was replaced by **4 independent scores**:
> `aiQuality` / `engineeringHygiene` / `security` / `repositoryHealth` (composite).
> The legacy `slopIndex` field is kept as optional on `ProjectReport` for
> backward compat with existing test fixtures and historical telemetry; will be
> removed in v0.16.0.

## The four scores

### `AI Quality` — the CI gate (0-100, **higher = better**)

**What it measures:** how good the AI-generated code in the codebase is.

`aiQuality` is the **headline number** and the one used by
`--strict` and the `slopbrick ci` subcommand. It is also the number
in `.slopbrick/health.json`. **70 passes.** 0 is the worst case, 100 is clean.

**How it's computed:** weighted average of three sub-scores, each
capped at 0-100:

| Subscore | Weight | What it measures |
|----------|--------|------------------|
| `boundary` | 40% | structural integrity — large files, multiple components per file, switch-on-stringly-typed-value |
| `context`  | 35% | prop correctness, imports, state management — things that affect correctness |
| `visual`   | 25% | CSS, layout, typography, accessibility — visual style violations |

For codebases WITH components, each subscore is normalized as
`min(100, sum(severity × weight) / componentCount * 100)`. For
codebases with **0 components** (CLI tools, pure backend,
libraries), the raw severity totals are returned so the user sees
honest numbers (e.g. `ai: 167`, not `ai: 16700` — the v0.14.5h fix).

### `Engineering Hygiene` — the secondary view (0-100, **higher = better**)

**What it measures:** internal consistency of the codebase's engineering practices.

Hygiene is informational. It does NOT affect the CI gate. It uses
a different formula because it asks a different question:

> "Is this codebase internally consistent — one modal system, one
> state library, one fetch pattern, declared allow-list, no drift?"

**How it's computed:** weighted average of four axes:

| Axis | Weight | What it measures |
|------|--------|------------------|
| Architecture Consistency | 50% | one modal/state/fetch lib, no off-scale values |
| Pattern Fragmentation (inverted) | 30% | the same patterns across files, not a zoo |
| Constitution Mapped | 10% | is there a declared `.slopbrick/constitution.json`? |
| AI Debt | 10% | bucket of total AI debt detected |

## Why two scores?

They measure different things:

| | Coherence LOW | Coherence HIGH |
|---|---|---|
| **Slop LOW** | Human-written, internally inconsistent (mixed conventions) | Hand-written, internally consistent (the ideal) |
| **Slop HIGH** | AI-generated AND inconsistent (worst case) | AI-generated but using consistent patterns (just AI) |

A codebase can be:
- **Low Slop, high Coherence**: hand-written, internally consistent (the ideal)
- **High Slop, high Coherence**: AI-generated but using consistent patterns (just AI)
- **Low Slop, low Coherence**: human-written but inconsistent (mixed conventions)
- **High Slop, low Coherence**: AI-generated AND inconsistent (worst case)

## Which one should I focus on?

**Fix the Slop Index first.** It's the CI gate and the headline.
The other scores (Coherence, Code Hygiene, Accessibility, etc.)
are signals that explain the Slop Index, not separate goals.

When the Slop Index is high but Coherence is high, the codebase is
AI-generated but consistent — your team should focus on the AI
slop rules, not the consistency rules.

When both are high, the codebase has both AI slop AND internal
inconsistency — your team should run `slopbrick scan --why-failing`
to see which rules are firing.

## Why was Coherence the primary headline in v0.9.x?

In v0.9.1 the team believed "consistency" was the more useful lens
for AI-assisted development. In v0.14.5i that decision was rolled
back because users found the dual-scoring confusing — they
expected to see the same number in the CLI that they see in
`health.json`, and `health.json` has always used Slop Index.

Coherence is preserved as a secondary view because it carries
information that the Slop Index doesn't — specifically, the
architecture consistency lens.

## How to read the per-category breakdown

The 16 categories (visual, typo, wcag, layout, component, logic,
arch, perf, security, test, docs, db, ai, context, product, i18n)
each get a bar in the breakdown. The bar length is proportional to
the raw severity points in that category.

**For codebases with components**, the bar shows per-component × 100
so scores are comparable across project sizes.

**For codebases with 0 components** (CLI tools, libraries), the
bar shows raw severity totals so the user sees honest numbers.

A category with 0 points is "clean" — it has no active rules firing.

## What's the threshold?

**70 = pass** (B-grade). Below 70, the CI gate fails with `--strict`.
Above 70 is "passing." 90+ is "excellent." 40-69 is "needs work."
0-39 is "concerning."

The band labels in the CLI output (excellent / passing / needs
work / concerning) are derived from these thresholds.
