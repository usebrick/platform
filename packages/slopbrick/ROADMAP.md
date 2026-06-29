# slopbrick Roadmap

> **v0.10 credibility milestone: reached in v0.14.5q (2026-06-28).**
> The v7 corpus calibration is live. 65 of 80 rules are now
> measured (31 USEFUL, 5 OK, 5 NOISY, 1 INVERTED, 23 HYGIENE).
> The remaining 15 rules are dormant (never fired on v7) and will
> be calibrated as the corpus grows. See
> [`research/v7-corpus-calibration.md`](./docs/research/v7-corpus-calibration.md)
> for the per-rule table. **v1.0** is the *stability commitment* —
> reserved for the point 6+ months after v0.15 ships, when the API
> can be frozen and backward compatibility guaranteed based on
> accumulated empirical feedback.

This document tracks the strategic plan. Each phase is independently shippable; each one strengthens the same positioning.

**0.7.0 → 0.10 framing:** these releases prove the vision AND build the credibility moat. Breaking changes are expected; APIs may shift. v1.0 then locks the interfaces and commits to backward compatibility based on 6 months of v0.10 production feedback.

---

## The scores (cumulative)

| Score | Shape | First shipped | Phase |
|-------|-------|---------------|-------|
| **Slop Index** | 0–100 (lower = better) | 0.5.0 | 1 |
| **Architecture Consistency** | 0–100 (higher = better) | 0.6.3 | 3 |
| **AI Security Risk** | `low` / `medium` / `high` / `critical` | 0.6.4 | 4 |
| **Constitution drift** | pass / fail + per-category | 0.6.2 | 2 |
| **Design-token drift** | inline violations | 0.6.3 | 3 |
| **PR Slop Score** | 0–100 + threshold (higher = worse) | 0.7.0 | 11 |
| **Test Quality** | 0–100 (higher = better) | 0.7.0 | 5 |
| **Business Logic Coherence** | 0–100 (higher = better) | 0.7.0 | 7 |
| **Pattern Fragmentation** | 0–100 (higher = better) | 0.7.0 | 7b |
| **Documentation Freshness** | 0–100 + categorical `docDrift` | 0.11.x | 6 |
| **Database Health** | 0–100 (higher = better) | 0.11.x | 8 |
| **AI Maintenance Cost** | `low` / `medium` / `high` / `critical` + `monthlyUSD` | 0.11.x | memo #4 |
| **Product Consistency** | 0–100 (higher = better) | 0.11.x | 9 |
| **Repository Health** (composite) | 0–100 + `AI Debt` band | 0.9.0 | 12 |

The end state (0.9.0): **one composite number + 11 subscores, surfaced through one CLI + 8 MCP tools**. An engineering manager scans the dashboard in five seconds; an AI agent calls `slop_suggest` once and gets everything it needs to write the next file.

---

## Phases

### Phase 1 — AI Slop Audit ✅ shipped (0.5.0)

Frontend quality scanner. Single Slop Index. 42 rules across 9 categories (visual, typo, wcag, layout, component, logic, arch, perf, security). Framework-aware (React, Vue, Svelte, Solid, Qwik, Astro, React Native). Calibrated against 6,142 AI-generated samples vs. 54,980 human-written samples; clean 5× separation between AI and human code on mean Slop Index.

**Why this phase:** adoption. The product has to be useful as a linter before the positioning can move up the stack.

### Phase 2 — Repository Constitution ✅ shipped (0.6.2)

The single feature most teams asked for. `slopbrick.config.mjs` gains a top-level `constitution` block declaring the stack (state management, data fetching, UI library, forms, styling, routing). `slopbrick drift` CLI exits 1 on any violation; `slop_suggest` and `slop_check_constitution` MCP tools let AI agents check before they PR.

**Why this phase:** protects architecture, not just code. Catches the "why did we introduce a second API layer" problem.

### Phase 3 — Architectural Drift Engine ✅ shipped (0.6.3)

Architecture Consistency Score. 0–100. Subtracts from 100 for each pattern-duplication finding: extra modal systems, button variants, API client modules, state libraries, data-fetching libraries, off-scale spacing values, off-scale radius values. Clamped. Audit-trail-friendly: every deduction is named and explainable.

**Why this phase:** this is the headline metric. Differentiates slopbrick from rule-counting linters.

### Phase 4 — AI Security Debt ✅ shipped (0.6.4)

Categorical `low | medium | high | critical` score. 8 security rules covering AI-induced failures (hardcoded secrets, exposed env vars, dangerous CORS, missing auth checks, unsafe HTML, fail-open auth, SQL construction, privileged-route auth). NOT a security scanner — Semgrep / GHAS / CodeQL / Gitleaks own that market. Catches patterns AI generates disproportionately.

**Why this phase:** a single hardcoded API key outranks everything else. The categorical level makes it scannable in two seconds.

### Phase 5 — Test Intelligence ✅ shipped (0.7.0)

Detect:
- **Weak assertions** — `expect(x).toBeDefined()` / `expect(x).toBeTruthy()` / `expect(x).not.toBe(null)` instead of value-shape assertions.
- **Duplicate test setups** — same boilerplate (`renderWithProviders`, `setupServer`, mock factory) repeated across N test files.
- **Missing edge cases** *(opt-in)* — production functions without any matching test.
- **Fake placeholders** — fixture literals like `'John Doe'`, `name: 'foo'`, `createdAt: '2020-01-01'`. Production data masquerading as fixtures.

```
slopbrick test [--format pretty|json] [--strict]
```

Four rules (`test/weak-assertion`, `test/duplicate-setup`, `test/missing-edge-case`, `test/fake-placeholder`) all short-circuit on non-test files. `--strict` exits 1 on any test issue (CI gate). Score: `100 - ceil(sum(weight) / 5)`, weights `low=1, medium=3, high=5`.

Output:

```
Test Quality: 54

Coverage: 92
Confidence: 38
```

Coverage ≠ quality. A 90%-covered repo with `expect(x).toBeDefined()` everywhere has lower real confidence than a 70%-covered repo with shape-based assertions.

**Why this phase:** reuse existing JSX/React extraction in `facts.v2`; bounded heuristic surface; high value to engineering managers ("do we actually test what we ship?").

### Phase 6 — Documentation Drift ✅ shipped (0.11.x, ahead of 0.8.0 target)

**New subcommand:** `slopbrick docs` (6 → 4 rules in v1; `stale-env-var-reference` and `stale-url-reference` deferred to 0.8.x for FP control).

**Why this phase now (research-backed):**

- **The market hole is real.** No shipped tool (Docusaurus, Mintlify CI, GitBook, mkdocstrings, TypeDoc) cross-references `package.json` ↔ README, exported names ↔ markdown inline code, or route paths ↔ doc URLs. Mintlify CI checks broken-link, Vale prose lint, grammar — explicitly "does not check external links." mkdocstrings / sphinx-autoapi / TypeDoc generate docs FROM code (one-way); they don't flag docs that contradict code.
- **The AI angle is the wedge.** Cursor, Continue.dev (acquired by Cursor Feb 2025), Aider, and Cody do not auto-update docs after code edits — they treat docs as out-of-context, neither retrieved nor refreshed. Mintlify Autopilot and Promptless are the only vendors closing this loop, both paid SaaS, both LLM-mediated.
- **The state-of-the-art is F1 = 96.73%** on description-code inconsistency (arXiv 2606.04769, June 2026). That's the calibration floor we'll publish against in 0.8.0 RC.
- **The framing hook is the AWS Kiro outage (Dec 2025)** — agentic coding tool deleted production, 13-hour outage. "Predictable given unchecked AI permissions." Stale code examples in READMEs are the same failure mode at a slower clock-speed: copy-paste from stale docs into AI-generated code.

**v1 rules (4):**
- `docs/stale-package-reference` — markdown mentions a package that isn't in `package.json`. Most common AI failure (refactor swaps the lib, README keeps the old name).
- `docs/stale-function-reference` — markdown inline code spans name a function/type/constant that isn't exported. Medium severity.
- `docs/expired-code-example` — code fences import or reference symbols that no longer exist. Highest-stakes for AI agents (copy-paste silently teaches the wrong thing).
- `docs/broken-link` — local relative links to files that don't exist. Lowest severity (visible to readers).

**Deferred to 0.8.x (2):**
- `docs/stale-env-var-reference` — high FP risk, only matters on onboarding paths.
- `docs/stale-url-reference` (route paths) — high FP risk, needs route registry first.

**Score formula (unchanged from plan):**
```
issueWeight = 5*stalePackage + 3*staleFunction + 4*expiredExample + 2*brokenLink
docFreshness = clamp(0, 100, 100 - issueWeight)
```

**Categorical bands:** 80–100 `low`, 60–79 `medium`, 40–59 `high`, 0–39 `critical` (exit 1 with `--strict` at high/critical).

**Out of v1 scope:**
- Remote-link checks (off by default; 3s timeout + 50 URL cap when enabled).
- Cross-file temporal ordering of migrations.
- LLM-mediated doc refresh (Mintlify / Promptless territory).

**Why this phase:** directly tracks the kind of debt that AI agents create — they refactor code, they don't refresh docs. v1 commits to publishing precision/recall against the arXiv 2606.04769 baseline before tagging 0.8.0 stable.

### Phase 7 — Business Logic Coherence ✅ shipped (0.7.0)

Eight `business-logic/*` rules + `slopbrick business-logic` subcommand:

- `business-logic/math-round-cents` — `Math.round(x * 100) / 100` without BigInt / `dinero.js` / decimal lib.
- `business-logic/magic-rate-decimal` — bare `0.0825` instead of a named constant.
- `business-logic/hardcoded-currency-symbol` — `$` / `€` in template literals.
- `business-logic/unconstrained-zod-string` — `z.string()` without `.min()` / `.email()`.
- `business-logic/missing-error-message` — `throw new Error()` with no message.
- `business-logic/hardcoded-iso-date` — `'2024-01-01'` in fixtures.
- `business-logic/locale-string-no-options` — `toLocaleString()` without explicit locale.
- `business-logic/raw-currency-in-template` — `${price} USD` in user-facing strings.

```
slopbrick business-logic [--format text|json|markdown]
```

Score: `100 - (issueWeight / scannedFiles) * 100`, weights `formatting=1, validation=2, pricing=3`.

**Why this phase:** directly tracks the kind of debt that AI agents create — they reach for "the function that does X" without checking if one already exists.

### Phase 7b — Pattern Fragmentation ✅ shipped (0.7.0)

`slopbrick patterns` subcommand. Counts the number of distinct UI / architectural patterns per category. Pattern Fragmentation is the **input** to `slop_suggest`'s `doNotCreate` list — agents that know there are already 3 modal systems in the repo won't introduce a 4th.

Eight categories, each with its own weight:

| Category | Weight |
|----------|--------|
| modal | 10 |
| auth | 8 |
| state | 6 |
| button | 4 |
| api | 4 |
| toast | 4 |
| card | 4 |
| forms | 3 |

```
slopbrick patterns [--format text|json|markdown] [--max-files <n>]
```

Score: `clamp(0, 100, 100 - (deduction / N) * 100)`, `N = sum(weights) * 4`. Always informational (exit 0) in 0.7.0.

### Phase Memo 4 — AI Maintenance Cost ✅ shipped (0.11.x, ahead of 0.8.0 target)

**New subcommand:** `slopbrick maintenance-cost`. Categorical headline + numeric `monthlyUSD` sub-score + per-axis health breakdown.

**Why this phase now (research-backed):**

The code-health aggregation market has converged on three patterns. The right one for slopbrick is the categorical-headline-plus-numeric-breakdown hybrid:

1. **CodeClimate's per-file letter grades** (A < 1h, B 1–2h, C 2–4h, D 4–8h, F > 8h remediation time) — works for per-issue cost calibration.
2. **Sonar's portfolio-level dollar rollup** — published benchmark of **$306,000/year per 1 MLoC** of code-level technical debt, derived from 200 projects and 11 MLoC. The most-cited, peer-reviewed-style published dollar anchor in the industry. (Sonar, 2025)
3. **Multi-dimensional productivity frameworks** (DORA, SPACE, DevEx) — explicitly *refuse* single-number rollups. Match the existing `aiSecurityRisk` pattern: label for humans, sub-scores for machines.

**The AI multiplier is the new piece.** CodeRabbit 1.7× issue rate, Faros 3× incident rate, GitClear 4× clone growth, Stack Overflow trust collapse — together justify an AI multiplier of 1.5×–2.5× applied when AI-typical signals are detected. METR's 19% slowdown for experienced devs means this multiplier is conservative.

**The formula (anchored to published benchmarks):**

```ts
// Per-issue cost: CodeClimate grade→minutes × $50/hr fully-loaded dev rate
const issueCost =
    highSeverityCount   * 400 +   // F-grade: 8h+
    mediumSeverityCount * 150 +   // C-grade: 3h
    lowSeverityCount    *  50;    // B-grade: 1h

// Sonar baseline: $25.50 per 1000 LoC per month
const locBaseline = (linesOfCode / 1000) * 25.50;

// Bucket multiplier (categorical → numeric)
const bucketMultiplier = { low: 0.5, medium: 1.0, high: 2.0, critical: 4.0 }[bucket];

// AI multiplier (only when AI-typical signals present)
const aiMultiplier = hasAiSignals ? 1.8 : 1.0;

const monthlyUSD = Math.round(
    Math.max(0, locBaseline * bucketMultiplier * aiMultiplier + issueCost * aiMultiplier)
);
```

**Sanity check:** a 100k LoC project, medium bucket, 50 issues (10 high / 30 medium / 10 low), AI signals detected → `(100 × 25.50 + (10×400 + 30×150 + 10×50)) × 1.8 ≈ $20,800/month`, ≈ $250k/year — in the same order of magnitude as Sonar's $306k/yr/MLoC.

**Axes consumed:**
- `aiQuality` (0–100, higher is better — v0.15.0 replacement for `slopIndex`)
- `engineeringHygiene` (0–100, higher is better)
- `security` (0–100, higher is better)
- `architectureConsistency` (0–100, direct)
- `aiSecurityRisk` (categorical → numeric via lookup)
- `constitutionViolations` count
- `designTokenDrift` (spacing + radius violation counts)
- `highSeverityIssueCount` (extra penalty)
- (Future) `testQuality`, `businessLogicCoherence`, `docFreshness`, `dbHealth`

**Why categorical + numeric:** managers want a bucket ("HIGH") but agents and trend pipelines need a number. Same shape `aiSecurityRisk` would have if it exposed `findings.medium >= 3` as numeric. Stripe's Developer Coefficient (42% of every dev's week lost to debt + bad code) gives an upper bound: a 50-dev team at $100k fully-loaded = **$1.65M/year** ≈ $137k/month.

**Calibration log:** every score to `.slop-audit/cache/maintenance-cost.jsonl` so v0.9 calibration can re-fit weights against real project outcomes.

**Why this phase:** the manager-friendly meta-score. The categorical form is deliberate — same reasoning as `aiSecurityRisk`: a single categorical bucket is harder to game than a numeric score, and a manager can read "AI Maintenance Cost: HIGH" in two seconds.

### Phase 8 — Database Intelligence ✅ shipped (0.11.x, ahead of 0.8.0 target)

**Reframed as static-only v1** (no live DB connection). Uses `pgsql-parser` (libpg_query port, ~3 MB install, supports PG 13–17, actively maintained as `@pgsql/parser` and `@libpg-query/parser` re-published monthly). Live DB introspection deferred to Phase 8.1.

**New subcommand:** `slopbrick db` (8 rules, Postgres-only v1).

**Why this phase now (research-backed):**

- **Drizzle ESLint plugin has only 2 rules** (`enforce-delete-with-where`, `enforce-update-with-where`). The Drizzle team explicitly says "no FK-index, no NOT NULL, no dead-column, no ENUM coverage." That's the wedge — `slopbrick db` is the only tool that statically analyzes Drizzle schema quality.
- **Prisma has 8+ Prisma-Lens rules** but they're per-file rule matching; our `db/naming-inconsistency` is schema-wide stats (a different layer).
- **Squawk owns migration safety; we own schema quality — don't fight them.** Squawk's 282 rules (`require-concurrent-index-creation`, `constraint-missing-not-valid`, `prefer-bigint-over-int`, `ban-drop-column`) are *operational* (DDL-time concerns). Our 8 rules are *structural* (what's wrong with the schema). The `advice` field on our issues links to the relevant Squawk rule where the two intersect (e.g., our `db/missing-fk-index` advice can say "after adding, use `CREATE INDEX CONCURRENTLY` per Squawk").
- **Postgres-only is reinforced by the 2026 "just use Postgres" narrative.** Multi-dialect SQL linters (SQLFluff, SlowQL) pay a heavy complexity tax for limited additional value in the AI-built-app segment. SQLFluff still has unparsed `DO/PL` blocks (issue #5488).
- **AI-generated SQL has a documented failure pattern that matches our v1 rule list exactly.** A 2025 case study describes a silent logic error in AI-written SQL that went undetected for 3 weeks and skewed quarterly revenue by 11.7%. The two most-cited failure modes — `missing NOT NULL` and `string-concat template literals` — are precisely two of our eight rules.

**v1 rules (8):**
- `db/missing-fk-index` — `REFERENCES` or Drizzle `references()` without a matching `CREATE INDEX` / `index()`. High.
- `db/duplicate-index` — same column-list declared twice. High.
- `db/dead-column` — `ALTER TABLE ... DROP COLUMN` references a column that exists in the schema (heuristic: appears in fewer than 2 queries). Medium. (v1 limited; full live-DB detection in 8.1.)
- `db/dead-table` — `CREATE TABLE` with no subsequent `INSERT` / `SELECT` in the corpus. Medium. (Same v1 caveat.)
- `db/naming-inconsistency` — snake_case ↔ camelCase mixing in identifiers. Low.
- `db/enum-sprawl` — `CREATE TYPE ... AS ENUM` with > 12 values (recommended maximum). Low.
- `db/missing-not-null` — `CREATE TABLE` with columns lacking `NOT NULL` for fields that should be required (`email`, `id`, `created_at`). High. (v1: heuristic; full data-aware in 8.1.)
- `db/sql-concat` — `prisma.$queryRaw\`...\${var}...\`` or `sql\`SELECT ... ${var} ...\`` template strings. High. (2025 AI-SQL case-study pattern.)

**Score formula:** `clamp(0, 100, 100 - (issueWeight / scannedFiles) * 5)`, weights: missing-fk-index=5, duplicate-index=4, dead-column=3, dead-table=3, naming=1, enum-sprawl=1, missing-not-null=4, sql-concat=5.

**Live DB introspection (Phase 8.1, v2):**
- `pg-index-health` parity: missing/duplicate/unused indexes, dead columns (real cardinality).
- `pg_stat_user_tables` integration for workload-aware suggestions.
- Requires network access at scan time — breaks the "static analysis" positioning, so v2 only.

**Why this phase:** directly tracks the kind of debt that AI agents create in 2026 (missing indexes, naive enums, string-concat queries). Drizzle ESLint plugin's 2-rule coverage is the clearest signal that the market is wide open.

### Phase 9 — Product Consistency ✅ shipped (0.11.x, ahead of 0.9.0 target)

Measure terminology drift + UX pattern fragmentation across the codebase:

- **Terminology drift** — `Post` / `Article` / `News` / `Story` used interchangeably in different files.
- **UX pattern fragmentation** — 5 modal patterns, 4 confirmation dialogs.

Output:

```
Product Consistency: 67

Terminology: 71
UX Patterns: 62
```

Especially valuable for AI-built products where each agent invocation picks slightly different words.

**Why this phase:** detection is bounded (naming-pattern matching); high value for product consistency.

### Phase 10 — Cost Intelligence ⏸ deferred

Track cloud waste, LLM costs, query waste, duplicate processing. **Different stack** — needs cloud-provider integration or static analysis of compute patterns. Speculative.

**Why deferred:** speculative; no clear technical anchor yet.

### Phase 11 — PR Governance ✅ shipped (0.7.0)

Every PR receives a single weighted slop score that can gate CI:

```
PR score: 4 (threshold: 20) — PASS
Base: main  Head: HEAD
Files changed: 1

src/store.ts  issues=1  constitution=1  score=4
  [medium ] security/public-admin-route — line 1
  [forbidden] Constitution violation: … imports 'redux' (canonical: 'redux').

────────────────────────────────────────────
PR score: 4 / 20 threshold — PASS
```

Implementation: `git diff --name-only base...head` (three-dot
syntax = merge-base diff), intersect with the engine's
`include`/`exclude` globs and source extensions, run
`scanFile` + `checkFileConstitution` per file, sum the weighted
scores. One number per PR. Configurable threshold
(`prScoreThreshold: 20` default, `--threshold` flag override).
Three output formats: `text`, `json`, `markdown`.

**Why this phase:** highest-leverage meta-feature. Completes the
governance story. Smallest implementation cost of the remaining
phases (reuses every score we already ship).

### Phase 12 — AI Agent Governance 🟡 partial (after 11)

After PR Governance is in, the meta-feature becomes:

```
Repository Health: 84

Architecture:        88
Security:            92
Testing:             71
Documentation:       80

AI Debt: MEDIUM
```

And every AI agent can query:

```
audit suggest
```

→ returns:

```
Use existing auth service.
Use existing pricing engine.
Do not create a new modal.
Follow repository conventions.
```

**Why this phase:** the endgame framing. Depends on Phase 11 having per-PR data.

---

## Recommended release train (0.7.0 → 0.10 → far-horizon 1.0)

Note: v0.10 is the credibility milestone (what we're working toward). v1.0 is the far-horizon stability commitment, 6+ months after v0.10 ships, and depends on accumulated empirical feedback. Do NOT promise v1.0 features in user-facing copy or commits.

### 0.7.0 — Constitution + Test + Business Logic + PR Governance ✅ in flight

**Phase 11 (PR Governance) + Phase 5 (Test Intelligence) + Phase 7 (Business Logic Intelligence) + the constitution rename + forbidden deny-list.**

All four:
- Reuse existing infrastructure (the scan pipeline + the duplicate-detection logic from Architecture Consistency).
- Strengthen the "repository coherence" positioning.
- Have tractable heuristics — no corpus calibration cycle needed.

### 0.8.0 — Docs + Database + Maintenance Cost (greenfield)

**Phase 6 (Documentation Drift) + Phase 8 (Database Intelligence, Postgres-only static) + memo #4 (AI Maintenance Cost Score, derived categorical).**

- **4 documentation-drift rules** in v1: `stale-package-reference`, `stale-function-reference`, `expired-code-example`, `broken-link`. **2 deferred to 0.8.x**: `stale-env-var-reference`, `stale-url-reference` (high FP risk per IEEE 2025 survey). Calibration floor: arXiv 2606.04769 F1 = 96.73% (June 2026). Marketing hook: AWS Kiro outage (Dec 2025, 13 hours).
- **8 database-health rules** in v1: `missing-fk-index`, `duplicate-index`, `dead-column`, `dead-table`, `naming-inconsistency`, `enum-sprawl`, `missing-not-null`, `sql-concat`. Postgres-only via `pgsql-parser` (libpg_query port, ~3 MB, actively maintained). Marketing wedge: `eslint-plugin-drizzle` ships 2 rules; we ship 8. Squawk owns migration safety — our `advice` strings cross-link to their rules.
- **1 derived categorical score** (`low | medium | high | critical`) from existing signals, with `monthlyUSD` sub-score calibrated to Sonar's $306K/yr/MLoC baseline + CodeClimate grade→minutes mapping + AI multiplier 1.5–2.5× (CodeRabbit 1.7×, Faros 3×, GitClear 4×, Stack Overflow trust collapse). Sanity check lands within 1 order of magnitude of Stripe Developer Coefficient upper bound.

Research notes:
- [Phase 6 — Doc Drift](./docs/research/phase-6-doc-drift-internet-2026.md)
- [Phase 8 — DB Health](./docs/research/phase-8-db-health-internet-2026.md)
- [Memo #4 — AI Maintenance Cost](./docs/research/phase-memo4-ai-cost-internet-2026.md)

**Skipped:** Phase 10 (Cost Intelligence) remains speculative; ship only after a real customer asks for cloud waste detection.

### 0.9.0 — Product Consistency + AI Agent Governance (endgame)

**Phase 9 (Product Consistency) + Phase 12 (AI Agent Governance).**

- Phase 9: terminology drift (verb-stem clustering) + UX pattern fragmentation (modal/button/toast/card/input/navigation)
- Phase 12: composite Repository Health score + `slop_governance` + extended `slop_suggest` (now returns canonical patterns, do-not-create directives, top issues, hot files, governance breakdown)

**Not the endgame.** 0.9.0 ships the 12-phase plan; **v0.10** (next) ships the credibility milestone (per-rule P/R/FPR + peer-reviewed thresholds). **v1.0** is the far-horizon stability commitment — 6+ months after v0.10 — and is NOT in this release train.

### 0.9.x — MCP consolidation

After 0.9.0 lands, **collapse the MCP tool surface**. Currently 6+ tools (`slop_doc_drift`, `slop_business_logic_score`, `slop_db_health`, `slop_product_score`, `slop_governance`, `slop_maintenance_cost`). Better surface:

| Tool | Purpose | Replaces |
|---|---|---|
| `slop_suggest` (one-shot) | Patterns + do-not-create + top issues + hot files + governance | All 6 above + existing `slop_suggest` |
| `slop_scan_file` (per-file) | Per-file scan | unchanged |
| `slop_check_constitution` (file-scoped) | Per-file constitution check | unchanged |
| `slop_explain_rule` (metadata) | Rule metadata | unchanged |

**Result:** 4 MCP tools total, not 11. Lower context-window cost for AI agents.

---

### 0.10 — Credibility milestone (the moat)

**✅ SHIPPED in v0.14.5q (2026-06-28).** Every detection rule that fired on the v7 corpus now ships with per-rule Precision / Recall / False Positive Rate, sorted by lift. 65 of 80 rules measured (31 USEFUL, 5 OK, 5 NOISY, 1 INVERTED, 23 HYGIENE). The remaining 15 are dormant — never fired on v7 — and will be calibrated as the corpus grows.

**v7 corpus (final, post v0.14.5q):**
- 184,488 neg files (human-written, ≥ 2025-01-01, v4 baseline + curated)
- 239,054 pos files (vibe-coded/*, claude-code, aider, tabby, continue, agent frameworks)
- 1,060,258 fire-events
- See [`docs/research/v7-corpus-calibration.md`](./docs/research/v7-corpus-calibration.md) for the per-rule table

The next v0.10 task is peer-reviewed citations behind every threshold. Currently 30 of 65 calibrated rules have a published citation; the remaining 35 are documented as heuristic and pending the v0.15 review pass.

**Not the stability commitment (that's v1.0). v0.10 is the credibility milestone** — every detection rule ships with per-rule Precision / Recall / False Positive Rate, plus a peer-reviewed citation behind every threshold.

The three numbers that tell you whether a detection rule actually works:

- **Precision** — when the rule fires, how often is it right? `security/missing-auth-check` fires 92.47% of the time on genuinely AI-generated files with a missing auth check. High precision = you can trust the alarm.
- **Recall** — of all the bad files that exist, how many does the rule catch? 0.63% for the same rule — acceptable for a CI gate where you want fewer false alarms at the cost of missing some real ones.
- **False Positive Rate** — of all the clean human-written files, how many does the rule wrongly flag? 0.04% (4 in 10,000) — very low means developers won't learn to ignore the rule.

A rule with high precision but 100% FPR is useless. A rule with high recall but 10% FPR gets disabled in a week. A rule with low FPR but 0% recall catches nothing. You need all three in range simultaneously — that's the calibration work.

**Ships:**
- **Per-rule P/R/FPR table** as the public calibration artifact (already drafted in `docs/research/v4-per-rule-pr-fpr.md`; v0.10 freezes it as the canonical reference).
- **Peer-reviewed thresholds**: Halstead 1977, McCabe 1976, Hindle 2012, Rissanen 1978, Kullback-Leibler 1951 — see [`docs/research/math-foundations-for-slopbrick.md`](./docs/research/math-foundations-for-slopbrick.md).
- **MDL composite score** — principled replacement for the heuristic weighted-average `Repository Coherence Score`. The score becomes the log-likelihood ratio of "all this evidence under M_ai" vs "under M_human"; engineers argue the model, not the weights.
- **Expanded USEFUL-rule test coverage** — every USEFUL rule in the v4 table has a test file (9 done, ~9 to go: math-gini-class-usage, math-rounded-entropy, reactive-hook-soup, sql-construction, focus-appearance, weak-assertion, etc.).
- **No new scores** — v0.10 deepens what 0.9.x proved, doesn't widen the surface.

**Why this comes before v1.0:** The earlier ratio numbers (322× on `wcag/focus-appearance` at v0.7.0) were misleading — ratio conflates P/R/FPR and a 322× ratio on a tiny corpus can still have terrible precision on a real codebase. P/R/FPR on the balanced corpus is what you actually need to know whether a rule is deployable. v0.10 ships that defensible surface; v1.0 then freezes it.

---

## Calibration trajectory (v0.7.0 → v0.10 → v1.0)

| Stage | Date | Form | Headline number | Defensibility |
|-------|------|------|-----------------|---------------|
| v0.5.0 | 2026-04 | rule fires per file | `Slop Index = 0–100` | low — 5× AI-vs-human separation, no per-rule calibration |
| v0.7.0 | 2026-05 | ratio = pos_fires / neg_fires (28:1 imbalanced corpus) | `wcag/focus-appearance = 322×` | ⚠️ small sample, ratio conflates P/R/FPR |
| v0.8.0 | 2026-06 | ratio (3.4:1 imbalanced corpus) | `wcag/focus-appearance = 7.98×` | ⚠️ less imbalanced, still ratio |
| **v0.9.0 (2026-06-25)** | 2026-06 | ratio on 1:1 balanced corpus (95k neg + 77k pos) | `wcag/focus-appearance = 3.01×` | ✅ balanced, 27/44 PASS |
| **v0.9.x (2026-08)** | 2026-08 | **per-rule Precision / Recall / FPR** (per-file granularity) + INVERTED/NOISY default-off | `security/missing-auth-check: P=92%, R=0.6%, FPR=0.04%` | ✅✅ engineer-trustworthy |
| **v0.10 (credibility milestone)** | **2026-06-25 ✅ shipped** | per-rule P/R/FPR + peer-reviewed citation behind every threshold | `18 USEFUL rules with cited thresholds; MDL composite replaces heuristic weights` | ✅✅✅ the credibility moat |
| **v0.12.0 (Tier-1.5 Calibration)** | **2026-06-27 ✅ shipped** | Bayesian LR-combiner posterior + Benjamini–Hochberg FDR + KS multi-feature shift + Zipf/Heaps LLM discriminators | `report.v012Stats.bayesianPosterior` + `survivingFiresCount`; 5 new peer-reviewed math foundations | ✅✅✅✅ **closes the calibration gap exposed by v0.10** |
| v1.0 | 2027-Q2 (target, 6+ months post-v0.10) | API freeze + backward compatibility commitment | no new scores; same surface, frozen | ✅✅✅✅ stability commitment |

**The three numbers that tell you whether a detection rule actually works** are **Precision, Recall, False Positive Rate** — and v0.10 ships every rule with all three documented. The earlier ratio metric was misleading: you can have a 322× ratio on a tiny corpus and still have terrible precision on a real codebase. P/R/FPR on the balanced 172k-file corpus is what you actually need to know whether a rule is deployable in production. That's the credibility differentiator and it's why it took months of calibration work to get here.

See [`docs/research/calibration-report-2026.md`](./docs/research/calibration-report-2026.md) for the full trajectory and [`docs/research/v4-per-rule-pr-fpr.md`](./docs/research/v4-per-rule-pr-fpr.md) for the per-rule P/R/FPR table. See [`docs/research/math-foundations-for-slopbrick.md`](./docs/research/math-foundations-for-slopbrick.md) for the roadmap that gets every threshold from "we measured it" to "see [McCabe 1976] / [Halstead 1977] / [Hindle 2012] / [Rissanen 1978]."

---

## Backlog — 5-bucket score compression (proposed for v1.0, far horizon)

**This is not on the immediate roadmap.** v0.10 ships first (credibility milestone), then 6+ months of empirical feedback, THEN v1.0 might adopt the 5-bucket compression — or it might not. Listed here for context only; don't promise this in user-facing copy.

External product review identified 13 subscores as too many for the user-facing surface. The proposed v1.0 launch compresses to **5 buckets**:

| Bucket | Weight | Top signal |
|--------|-------:|-----------|
| Architecture Consistency | 25% | Pattern Fragmentation (9 button implementations = bad) |
| AI Slop Signal | 30% | 18 USEFUL rules (P/R/FPR-verified) |
| Security | 25% | hardcoded-secret, missing-auth-check, dangerous-cors |
| Delivery Quality | 10% | test quality + business-logic coherence + docs |
| Codebase Health | 10% | DB schema + design-token + product consistency |

`Repository Health` = `0.25 + 0.30 + 0.25 + 0.10 + 0.10` weighted sum.

The 13-subscore diagnostic surface remains in `--format json` and `--format detailed` for the calibration / power-user audience regardless.

See [`docs/strategy/v1-score-compression.md`](./docs/strategy/v1-score-compression.md) for the full proposal, including:
- Why 5 buckets, not 13, for the product surface
- Why Pattern Fragmentation should be a top-level signal
- Why `slop_suggest` (MCP) is the lead, not the score
- Why bucket weights will be exposed as config in v1.1 (with labeled dataset)

---

## Non-goals (deliberately not building)

These markets are crowded; competing head-on with funded incumbents is a poor use of cycles:

- ❌ **General security scanner** — Semgrep, GHAS, CodeQL, Gitleaks.
- ❌ **Dependency vulnerability scanner** — Snyk, npm audit, Dependabot.
- ❌ **Formatter / type checker / coverage tool** — Prettier, TypeScript, istanbul/c8.
- ❌ **General AI PR review** — CodeRabbit, Qodo Merge, Anthropic Code Review, GitHub Copilot.
- ❌ **CTO / engineering analytics** — LinearB, Jellyfish, Waydev (different audience, different pricing).

The gap we're targeting: **repository coherence**. Nobody owns it. Almost nobody even frames it that way. That's the opening.

---

## Decision log

| Date | Decision | Rationale |
|------|----------|-----------|
| 2026-06-25 | Position as "Repository Coherence Engine" not "AI slop detector" | Generic AI debt is 5/10 opportunity; repository coherence is 9/10 |
| 2026-06-25 | Architecture Consistency Score as the headline metric | Aggregates cross-file signals into one number — ESLint can't do this |
| 2026-06-25 | AI Security Risk as categorical, not numeric | A single hardcoded API key outranks everything; categorical is harder to game |
| 2026-06-25 | Five scores in one tool, all surfaced by `slopbrick scan` | Single CLI invocation = lower friction; manager reads five numbers in 5 seconds |
| 2026-06-25 | Bump in 0.0.1 increments during feature work | Each commit traceable in `git log` + `npm changelog`; minor bumps reserved for headline-feature releases |

---

## Roadmap audit log

### 2026-06-26 — Status reconciliation against shipped source

Reconciled phase statuses with actual code under `src/`. Several phases marked `🟡 greenfield` had their engine + CLI surface already shipped (rule implementations live inline in `engine/*.ts`, not in `rules/<category>/`). This made them invisible to greps looking for `rules/{docs,db,product}/` directories.

| Phase | Old status | New status | Evidence |
|-------|------------|------------|----------|
| 1 — AI Slop Audit | ✅ shipped (0.5.0) | ✅ shipped (0.5.0) | unchanged |
| 2 — Repository Constitution | ✅ shipped (0.6.2) | ✅ shipped (0.6.2) | unchanged |
| 3 — Architectural Drift Engine | ✅ shipped (0.6.3) | ✅ shipped (0.6.3) | unchanged |
| 4 — AI Security Debt | ✅ shipped (0.6.4) | ✅ shipped (0.6.4) | unchanged |
| 5 — Test Intelligence | ✅ shipped (0.7.0) | ✅ shipped (0.7.0) | removed duplicated bullet list |
| **6 — Doc Drift** | 🟡 greenfield (0.8.0) | **✅ shipped (0.11.x)** | `src/cli/docs.ts`, `src/engine/doc-freshness.ts`, 4 rules inline |
| 7 — Business Logic Coherence | ✅ shipped (0.7.0) | ✅ shipped (0.7.0) | unchanged |
| 7b — Pattern Fragmentation | ✅ shipped (0.7.0) | ✅ shipped (0.7.0) | unchanged |
| **Memo 4 — AI Maintenance Cost** | 🟡 greenfield (0.8.0) | **✅ shipped (0.11.x)** | `src/cli/maintenance-cost.ts`, `src/engine/maintenance-cost.ts` |
| **8 — DB Intelligence** | 🟡 greenfield (0.8.0) | **✅ shipped (0.11.x)** | `src/cli/db.ts`, `src/engine/db-health.ts`, 6 rules inline |
| 9 — Product Consistency | 🟡 greenfield | **✅ shipped (0.11.x)** | `src/rules/product/terminology-drift.ts` + `ux-pattern-fragmentation.ts` (added 2026-06-26) |
| **10 — Cost Intelligence** | ⏸ deferred | ⏸ deferred | confirmed — no `cost-intelligence` CLI, engine, or rules |
| 11 — PR Governance | ✅ shipped (0.7.0) | ✅ shipped (0.7.0) | unchanged |
| **12 — AI Agent Governance** | 🟡 greenfield (after 11) | **🟡 partial (after 11)** | `slop_governance` MCP tool shipped; composite Repository Health not yet |

### Phase 10 — Cost Intelligence: deferred rationale (reaffirmed)

Cost Intelligence (cloud waste, LLM costs, query waste, duplicate processing) remains ⏸ deferred because:
- Requires cloud-provider integration (AWS/GCP/Azure SDKs) or static analysis of compute patterns — a different stack from current rules
- No clear technical anchor — Squawk/SQLFluff own SQL waste detection; cloud cost is dominated by Vantage/AWS Cost Explorer
- Speculative — no customer has asked for it
- Re-evaluate if a customer requests it (per the release train note: "ship only after a real customer asks")

### v0.10 calibration trajectory correction

v0.10 was listed as "2026-Q3 (target)" in the calibration trajectory table. Per `CHANGELOG.md`, **v0.10.0 actually shipped 2026-06-25** alongside the v0.11.0 platform rename. The credibility moat (per-rule P/R/FPR + peer-reviewed thresholds + MDL composite) is live.

### Documentation debt (cross-reference)

The same shipped-but-undocumented work also needs CHANGELOG entries. See CHANGELOG `[Unreleased]` section and `docs/research/v0.10-implementation-plan.md` "Documentation debt" section for the backfill list (Phases 6/8/9/11 of the v0.10 plan).

