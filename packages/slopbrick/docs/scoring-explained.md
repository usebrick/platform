# SlopBrick scoring explained

A short, plain-language reference for the four scores that `slopbrick scan`
reports. Read this if the numbers in the CLI output don't make sense.

> **v0.21.0:** The `aiSlopScore` field is now the **raw amount of AI slop**
> detected (0 = no AI slop, 100 = max AI slop, **lower = cleaner**).
> The v0.15.0–v0.20.1 inversion (higher = better) was confusing —
> users read "AI Slop Score: 100" as "100% slop". The new semantics
> match the natural reading of the name. The other three scores
> (`engineeringHygiene`, `security`, `repositoryHealth`) keep the
> "higher = better" convention; the composite `repositoryHealth`
> inverts `aiSlopScore` at the call site (`100 - aiSlopScore`).
> The legacy `slopIndex` field stores the same raw amount as
> `aiSlopScore` (matching the v0.14 convention).

## The four scores

### `AI Slop Score` — the CI gate (0-100, **lower = cleaner**)

**What it measures:** how much AI-style fingerprint the codebase has.

`aiSlopScore` is the **headline number** and the one used by
`--strict` and the `slopbrick ci` subcommand. It is also the number
in `.slopbrick/health.json`. **Default `meanSlop: 30` passes**
(score must be ≤ 30). 0 is the cleanest, 100 is saturated with AI slop.

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

## All four scores at a glance

The four scores fall into two groups:

- **`AI Slop Score`** — RAW amount of slop, **lower = cleaner**.
  CI gate. Inverted to its reciprocal internally to feed into
  the repositoryHealth composite.
- **`Engineering Hygiene`**, **`Security`**, **`Repository Health`**
  — cleanliness-style composite scores, **higher = better**.
  Informational; only the aiSlopScore line gates CI.

| Score | Direction | What it tells you |
|-------|-----------|-------------------|
| **AI Slop Score** | lower = cleaner | how much AI fingerprint the codebase has |
| **Engineering Hygiene** | higher = better | per-category internal consistency |
| **Security** | higher = better | AI-flags lowered for high-risk patterns (inverted) |
| **Repository Health** | higher = better | weighted composite that inverts aiSlopScore internally |

## Which one should I focus on?

**Start with AI Slop Score** — it's the CI gate and the headline.

- The other three are signals that *explain* the headline, not
  separate goals. If `engineeringHygiene` is low, the AI slop
  rules will tell you which categories are misbehaving.
- If the AI Slop Score is high but Engineering Hygiene is high,
  the codebase is AI-generated but consistent — your team
  should focus on the AI slop rules, not the consistency rules.
- If both are low, the codebase has both AI slop AND internal
  inconsistency — your team should run `slopbrick scan --why-failing`
  to see which rules are firing.

## Why was AI Slop Score the primary headline?

`health.json` has always carried the AI Slop Score. CLI users
expected the headline number to match. In v0.15.0–v0.20.1 an
intermediate rename to "cleanliness" inverted the score but
caused confusion: users read "100" as "100% slop" and thought
they were failing when they were passing. v0.21.0 flipped it
back to the natural reading ("0 = no slop") while keeping
the v0.14 field name semantics for telemetry consumers
(`previousSlopIndex` on ProjectReport).

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

## What's the AI Slop Score threshold?

The CI gate uses `report.thresholds.meanSlop` from your config
(the default is 30). The gate condition is:

  **AI Slop Score ≤ meanSlop → pass** (lower = cleaner since v0.21)

So a score of 25 with `meanSlop: 15` is **failing**, and a score
of 25 with `meanSlop: 30` is **passing**. The slopbrick repo
itself uses `meanSlop: 15` (a strict threshold for self-scan).

Band labels in the CLI output ("no slop", "low", "medium",
"high", "saturated") come from `slopScoreBand()`:

| AI Slop Score | Band |
|---|---|
| 0–9 | no slop (green) |
| 10–29 | low (green) |
| 30–49 | medium (yellow) |
| 50–69 | high (red) |
| 70–100 | saturated (red) |

For the **other three scores** (`engineeringHygiene`, `security`,
`repositoryHealth`), the bands are inverted because those are
higher-is-better:

| Score | Band starts at |
|---|---|
| excellent | ≥ 90 |
| passing | ≥ 70 |
| needs work | ≥ 40 |
| concerning | < 40 |
