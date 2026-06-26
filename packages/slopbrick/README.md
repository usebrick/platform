# slopbrick

> **Repository Coherence Scanner for AI-coded codebases.** Detects cross-file pattern drift (`zustand + redux in the same project`), AI-induced security failures (`sk-...` keys, `NEXT_PUBLIC_*` secrets, fail-open auth), design-token violations (`p-[13px]`), and AI test smells (`expect(x).toBeDefined()`). Run `npx slopbrick` and get a single **Repository Health** score (0–100) with per-rule precision/recall. Add the MCP server and your AI agent reads your existing patterns before it writes new ones.

**Status:** v0.11.2 (current). The v0.10 credibility milestone shipped 2026-06-25 — every detection rule ships with per-rule P/R/FPR against the balanced 172k-file v4 corpus, and 8 thresholds cite peer-reviewed papers (Halstead 1977, McCabe 1976, Hindle 2012, Rissanen 1978, Kullback-Leibler 1951).

**The problem.** AI coding assistants write logic well, but they drift. Every project ends up with three button variants, a hardcoded API key, inline styles next to Tailwind utilities, and a test file full of `expect(x).toBeDefined()`. The drift isn't the agent's fault — it's that the agent doesn't know your conventions. Existing linters catch syntax; nothing catches "you just invented a fourth modal system when this repo already has three."

**What this does.** `slopbrick` extracts the canonical patterns from your codebase (state lib, form lib, modal system, API client, data-fetching), enforces a declared Constitution at PR time, and exposes the pattern inventory to AI agents via MCP (`slop_suggest`) so they reuse what's there instead of inventing new patterns. The headline **Repository Health** score (0–100) is a proof that the Constitution is being followed — but the actual moat is the Constitution + Pattern Inventory itself, not the number.

## What an AI agent gets from `slop_suggest` (the primary entry point)

The MCP tool `slop_suggest` returns, in one call:

- **Existing patterns** — the canonical modal, button, API client, state library, data-fetching library the project already uses.
- **Do-not-create list** — explicit `constitution.forbidden` packages + canonical patterns not to duplicate.
- **Top issues by rule** — what to fix first in the changed files.
- **Hot files by issue count** — where the slop is concentrated.
- **Composite Repository Health** — the headline 0-100 score + per-axis breakdown.

> **Call this BEFORE writing new code so the agent reuses existing patterns instead of duplicating them.**

The MCP server is one command: `slopbrick mcp`. 14 tools ship in v0.11.2: `slop_suggest`, `slop_suggest_with_memory` (fast-path on `.slopbrick/memory.md`), `slop_scan_file`, `slop_explain_rule`, `slop_list_rules`, `slop_governance`, `slop_check_constitution`, `slop_architecture_score`, `slop_business_logic_score`, `slop_db_health`, `slop_find_similar`, and three more — see `src/mcp/tools.ts`.

## Headline Repository Health composite

`Repository Health: 84` with per-axis breakdown + `AI Debt: MEDIUM` band. Composed from up to 8 axes, weights renormalize when axes are missing:

| Axis | First shipped | What it measures |
|------|---------------|------------------|
| `slopIndex` (inverted) | 0.5.0 | Frontend lint composite |
| `architectureConsistency` | 0.6.3 | Cross-file pattern duplication |
| `aiSecurityRisk` (categorical) | 0.6.4 | AI-induced security failures |
| `designTokenViolations` | 0.6.3 | Spacing/radius off declared scales |
| `testQuality` | 0.7.0 | AI test smells |
| `businessLogicCoherence` | 0.7.0 | Pricing precision, validation completeness |
| `docFreshness` | 0.11.x | Stale READMEs vs code |
| `dbHealth` | 0.11.x | Postgres schema quality |
| `productConsistency` | 0.11.x | Terminology drift, UX pattern fragmentation |
| `mdlLogRatio` (Phase 3 v0.10) | 0.10.0 | Principled MDL log-likelihood ratio |

The 5-bucket compression (Architecture / AI Slop / Security / Delivery / Codebase) is the proposed v1.0 user-facing surface — not yet shipped, listed in `ROADMAP.md` "Backlog".

## Why this works (v0.10 credibility milestone)

The rules are calibrated against the **v4 balanced 1:1 corpus**:

- **101,156 human-written files** — 39 production repos (mui 16k, supabase 6.8k, antd 5.5k, storybook 3.5k, react-spectrum 3.3k, refine 6.3k, appsmith 5.5k, heroui 2.1k, …) + 54,980 from `ai-slop-baseline`.
- **105,563 AI-generated files** — 50 existing repos + **100 NEW shallow-cloned vibe-coded repos** (Claude Code, Cursor, Lovable, Bolt, gpt-pilot, v0, BloopAI, tldraw) in `corpus-expansion/positive/vibe-coded/`.

**62 rules ship in v0.11.2 across 11 categories** (`src/rules/`). Verdict distribution from v4 calibration:

| Verdict | Count | What it means |
|---------|------:|---------------|
| **USEFUL** | **18 (40%)** | P ≥ 50% AND lift ≥ 2 — gate on these |
| OK | 7 (16%) | P ≥ 30% AND lift ≥ 1.5 |
| NOISY | 9 (20%) | `defaultOff: true` — fires too rarely on AI |
| INVERTED | 11 (24%) | `defaultOff: true` — fires more on human than AI |
| DORMANT | 0 (0%) | — |

The form engineers trust (top USEFUL rules):

| Rule | P | Lift | What it catches |
|------|--:|-----:|-----------------|
| `logic/ghost-defensive` | 94.7% | 22.5× | Dead `if (x) return` guards |
| `security/missing-auth-check` | 92.5% | 15.3× | Auth bypass on API routes |
| `logic/math-console-log-storm` | 89.8% | 11.0× | Debug `console.log` left in |
| `logic/zombie-state` | 83.3% | 6.2× | Unused `useState` declarations |
| `test/duplicate-setup` | 71.0% | 3.1× | Verbatim `beforeEach` copy-paste |

Full per-rule table: [`docs/research/v4-per-rule-pr-fpr.md`](./docs/research/v4-per-rule-pr-fpr.md). v5 calibration pilot (SQL arm) ran 2026-06-26; results in [`docs/research/v5-sql-pilot-results.md`](./docs/research/v5-sql-pilot-results.md).

## For humans — 15 subcommands

| Subcommand | What it does |
|------------|--------------|
| `slopbrick scan` | The headline. One Repository Health number + per-rule findings. Use in CI. |
| `slopbrick scan --diff <ref>` | PR diff vs. git ref (VibeDrift-compatible). |
| `slopbrick pr` | One weighted number per PR. Exits 1 over `--threshold` (default 20). |
| `slopbrick architecture` | Architecture Consistency Score alone (0–100). |
| `slopbrick security` | AI Security Risk (categorical: low/medium/high/critical). |
| `slopbrick drift` | Constitution violations only; exits 1 on any. |
| `slopbrick test` | Test Quality score + 4 `test/*` rules. |
| `slopbrick business-logic` | Business Logic Coherence + 8 rules. |
| `slopbrick patterns` | Pattern Fragmentation; the input to `slop_suggest.doNotCreate`. |
| `slopbrick docs` | Documentation Freshness + 4 `docs/*` rules. |
| `slopbrick db` | Database Health (Postgres via pgsql-parser) + 6 `db/*` rules. |
| `slopbrick maintenance-cost` | AI Maintenance Cost (categorical + `$/month`). |
| `slopbrick tokens <path>` | Ingest W3C DTCG tokens.json. |
| `slopbrick migrate` | One-shot migration from `slop-audit@≤0.10.1` to `slopbrick@≥0.11.0`. |
| `slopbrick mcp` | Start the MCP server (JSON-RPC 2.0 over stdio). |

## For AI agents

Install the MCP server, then call `slop_suggest` before writing new code. The agent never has to guess what's already in the codebase. The fast-path `slop_suggest_with_memory` skips AST re-parsing by reading `.slopbrick/memory.md` (populated by `slopbrick scan`).

## What it does not do

It does **not** detect whether a human or AI wrote the code. It surfaces patterns that AI generates disproportionately (4 modal systems, exposed `NEXT_PUBLIC_OPENAI_API_KEY`, `if (NODE_ENV === 'development') return true`), and enforces the constitution the project has declared.

---

## What's shipped across the 12-phase plan

See [`ROADMAP.md`](./ROADMAP.md) for the full status table. Summary as of 2026-06-26:

| Phase | Description | Shipped | Version |
|-------|-------------|----------|---------|
| 1 | AI Slop Audit | ✅ | 0.5.0 |
| 2 | Repository Constitution | ✅ | 0.6.2 |
| 3 | Architectural Drift Engine | ✅ | 0.6.3 |
| 4 | AI Security Debt | ✅ | 0.6.4 |
| 5 | Test Intelligence | ✅ | 0.7.0 |
| 6 | Documentation Drift | ✅ | 0.11.x |
| 7 | Business Logic Coherence | ✅ | 0.7.0 |
| 7b | Pattern Fragmentation | ✅ | 0.7.0 |
| Memo 4 | AI Maintenance Cost | ✅ | 0.11.x |
| 8 | Database Intelligence | ✅ | 0.11.x |
| 9 | Product Consistency | ✅ | 0.11.x |
| **10** | **Cost Intelligence** | **⏸ deferred** | — |
| 11 | PR Governance | ✅ | 0.7.0 |
| 12 | AI Agent Governance | 🟡 partial | 0.11.x |

v0.10 ships the credibility moat (peer-reviewed thresholds + MDL composite). v1.0 is the stability commitment, 6+ months after v0.10.

### 0.6.0 – 0.6.4 recap (the foundation)

0.6.0 was the engine re-architecture. The 0.6.1 – 0.6.4 patch series shifts the framing from "AI slop detector" to **repository coherence engine** — the same scanner, now with three new scores, MCP tools so AI agents check before they PR, and eight security rules for AI-induced failures.

Five orthogonal scores, all in `slopbrick scan`:

| Score | Shape | Use it for |
|-------|-------|------------|
| **Slop Index** | 0–100 | Frontend lint quality |
| **Architecture Consistency** | 0–100 | Cross-file pattern duplication *(0.6.3)* |
| **AI Security Risk** | `low` / `medium` / `high` / `critical` | AI-induced security failures *(0.6.4)* |
| **Constitution drift** | pass / fail | Imports that violate declared stack *(0.6.2)* |
| **Design-token drift** | inline violations | Spacing/radius off declared scales *(0.6.3)* |

The slop detector is still here — but the bigger lever is *coherence*: one modal system, one state library, one fetch lib, a declared constitution that the AI agent checks before PR.

### What landed in 0.6.1 – 0.6.4

**0.6.4 — AI Security Risk (new score) + 8 Tier-1/Tier-2 security rules**

NOT a security scanner — Semgrep / GHAS / CodeQL / Gitleaks own that. This is a **categorical** score (`low | medium | high | critical`) for security failures that AI generates disproportionately. Independent of `slopIndex` — security failures do not get diluted into "good slop score" territory.

- `security/hardcoded-secret` — provider prefixes (`sk-`, `sk-ant-`, `AKIA`, `ghp_`, `sk_live_`, `AIza`, `xox[abprs]-`) + sensitive-name literals.
- `security/exposed-env-var` — `NEXT_PUBLIC_*` / `VITE_*` / etc. with secret names — inlined into every browser build.
- `security/dangerous-cors` — wildcard `Access-Control-Allow-Origin: *` + `cors({ origin: '*' })` + reflective `cors({ origin: true })`.
- `security/missing-auth-check` — Next.js `route.ts` / `pages/api` / Express handlers with no auth primitive.
- `security/unsafe-html-render` — `dangerouslySetInnerHTML` fed a non-literal value.
- `security/fail-open-auth` — `if (NODE_ENV === 'development') return true/next()`.
- `security/sql-construction` — template-literal / concat SQL queries (use parameterized queries).
- `security/public-admin-route` — routes under `/admin`, `/internal`, `/debug`, `/staff`, `/manage`, `/private`, etc. without an additional role check.

New `slopbrick security [--format pretty|json] [--strict]` subcommand. `--strict` exits 1 on high/critical (CI gate).

**0.6.3 — Architecture Consistency Score (the headline metric) + design-token enforcement**

One 0–100 number that reflects how consistent a repository's patterns are. Subtracts from 100 for each pattern-duplication finding: `-12` per extra modal system, `-8` per extra button variant, `-10` per extra API client module, `-15` per extra state library (highest), `-10` per extra data-fetching library, `-1` per 5 off-scale spacing values, `-1` per 5 off-scale radius values. A project with 1 modal, 1 button, 1 api client, 1 state lib, 1 fetch lib lands at 100. A project with 3 modal systems + 4 button variants + 2 state libs lands at 37.

Two new rules turn design tokens from docs into enforceable contracts:
- `visual/spacing-scale-violation` — flags `p-[13px]`, `gap-[1.75rem]` etc. off the declared `spacingScale`.
- `visual/radius-scale-violation` — flags `rounded-[7px]`, `rounded-tl-[2rem]` etc. off the declared `radiusScale`.

Both emit auto-fix candidates so `slopbrick scan --fix` rewrites `p-[13px]` → `p-1`.

**0.6.2 — Repository governance for AI coding agents**

The single feature most projects asked for. New top-level `constitution` field in `slopbrick.config.mjs`:

```js
export default {
  constitution: {
    stateManagement: ['zustand'],
    dataFetching: ['react-query'],
    uiLibrary: ['shadcn', 'radix'],
    forms: ['react-hook-form', 'zod'],
    styling: ['tailwind'],
    routing: ['next'],
  },
};
```

Auto-detected from `package.json` when unset; user declarations always win.

- `slopbrick drift` — CLI command, exits 1 on any violation (CI-friendly).
- `slop_suggest` MCP tool — project-wide inventory of existing patterns; AI agents call before writing new code.
- `slop_check_constitution` MCP tool — per-file constitution diff.
- `slop_architecture_score` MCP tool — Architecture Consistency Score via MCP.

**0.6.1 — bug fixes + small refinements**

- `slopbrick trend --format markdown` now actually emits markdown (the local flag was being shadowed by the global scan `--format`; renamed to `--render`).
- Calibration test surfaces stderr/stdout on chunk failures instead of swallowing them.
- v1.x working-tree labels stripped.

### CLI surface summary (post-0.8.0)

| Command | Purpose |
|---------|---------|
| `slopbrick scan` | Main scan — runs all rules + computes all 8 scores |
| `slopbrick architecture` | Architecture Consistency Score only |
| `slopbrick security` | AI Security Risk only |
| `slopbrick drift` | Constitution-violation scanner |
| `slopbrick pr` | PR slop score (single weighted number per PR) |
| `slopbrick test` | Test Quality score (4 `test/*` rules) |
| `slopbrick business-logic` | Business Logic Coherence score (8 rules) |
| `slopbrick patterns` | Pattern Fragmentation score (input to `slop_suggest`) |
| `slopbrick maintenance-cost` | AI Maintenance Cost (categorical low/medium/high/critical + $/month) *(0.8.0)* |
| `slopbrick docs` | Documentation Freshness (4 `docs/*` rules) *(0.8.0)* |
| `slopbrick db` | Database Health (6 `db/*` rules, Postgres-only) *(0.8.0)* |
| `slopbrick mcp` | MCP server (`slop_scan_file`, `slop_explain_rule`, `slop_list_rules`, `slop_suggest`, `slop_check_constitution`, `slop_architecture_score`) |
| `slopbrick trend` | Slop Index trend over time |
| `slopbrick flywheel` | Aggregated scan telemetry |
| `slopbrick init` | Interactive setup wizard |

### What 0.6.x did *not* change

- **No new competitor overlap.** We did not add a general security scanner, dependency vulnerability scanner, formatter, type checker, or coverage tool.
- **No breaking CLI changes.** Existing scan commands, JSON / SARIF / HTML output formats, and public-API exports are unchanged.

The full release history is in [CHANGELOG.md](./CHANGELOG.md).

---

## Why this matters (research-backed)

The 0.7.0 release sits on top of an industry that's converging fast on AI-generated-code debt. The numbers below are from 2024–2026 studies and explain why the Constitution, not the Slop Index, is the moat.

- **AI slows experienced developers.** METR's July 2025 RCT (16 experienced open-source devs, 246 tasks on repos averaging 22k stars / 1M LoC) found AI tools produced a **19% slowdown** — developers had expected a 24% speedup. ([METR, 2025](https://metr.org/blog/2025-07-10-early-2025-ai-experienced-os-dev-study/))
- **AI-generated code carries 1.7× more issues per PR** (10.83 vs 6.45) and a higher share of critical/major issues. ([CodeRabbit, 2025](https://coderabbit.ai/blog/state-of-ai-vs-human-code-generation-report))
- **Refactoring is collapsing.** GitClear's 211M-line analysis of Google/Microsoft/Meta repos shows "refactored" lines fell from 25% → <10% and "copy-pasted" lines rose from 8.3% → 12.3% between 2021–2024. ([GitClear, 2025](https://www.gitclear.com/ai_assistant_code_quality_2025_research))
- **PR size is up 51%, bugs/PR up 28%, incidents/PR up 3×, code churn up 10×** across 22k developers in 2026. ([Faros AI, 2026](https://www.faros.ai/research/ai-acceleration-whiplash))
- **Trust in AI accuracy dropped from 40% → 29%** in one year; 66% of devs spend *more* time debugging AI output. ([Stack Overflow 2025 Developer Survey](https://survey.stackoverflow.co/2025/ai))
- **Code-surface ↔ doc-surface staleness is an open hole.** No shipped tool (Docusaurus, Mintlify, GitBook, mkdocstrings, TypeDoc) cross-references `package.json` ↔ README or exported names ↔ markdown inline code. The 2026 state-of-the-art is F1 = 96.73% on a single analog task (description-code inconsistency, [arXiv 2606.04769](https://arxiv.org/html/2606.04769v1)). That's what `slopbrick docs` ships against in 0.8.0.
- **Schema-quality static analysis is an open hole for Drizzle.** The official `eslint-plugin-drizzle` has exactly 2 rules. Prisma has 8+ Prisma-Lens rules but they target per-file linting, not schema-wide drift. Squawk owns migration safety; nobody owns schema quality. That's the wedge for `slopbrick db` in 0.8.0.
- **The canonical AI-coding-agent failure is the AWS Kiro outage (Dec 2025).** An agentic coding tool autonomously deleted a production environment; 13-hour outage in a China region. ([Docker blog, 2026](https://www.docker.com/blog/coding-agent-horror-stories-the-13-hour-aws-outage/)) The post-mortem: "predictable given unchecked AI permissions." The preventive: a Constitution the agent checks before it acts, with a `$306,000/yr/MLoC` baseline for what the debt costs when it isn't checked. ([Sonar, 2025](https://www.sonarsource.com/blog/new-research-from-sonar-on-cost-of-technical-debt/))

The full research notes for each 0.8.0 phase are in [`docs/research/`](./docs/research/).

**Mathematical foundations** — the peer-reviewed methods behind every threshold:
[`docs/research/math-foundations-for-slopbrick.md`](./docs/research/math-foundations-for-slopbrick.md) maps 8 published results (Halstead 1977, Hindle 2012, Rissanen 1978, Kullback-Leibler 1951, Blondel 2008, Fiedler 1973, McCabe 1976, Adams-MacKay 2007) to the slopbrick rules and composite scores that cite them. v0.9.3+ ships the highest-leverage ones (Halstead, Code Naturalness, MDL composite) to replace heuristic thresholds with closed-form citations.

**v0.10 implementation plan** — the credibility-milestone roadmap with dependency graph, effort estimates per phase, and readiness checklist: [`docs/research/v0.10-implementation-plan.md`](./docs/research/v0.10-implementation-plan.md). Phases 1–5 (~4 working days) ship v0.10; Phases 6–11 land the far-horizon graph-theoretic, Repository Memory, `--diff`, `find_similar_function`, BRICK, and SARIF work.

---

## Roadmap

| Version | Themes | Status |
|---------|--------|--------|
| 0.5.x | Engine re-architecture, Slop Index, framework support | Shipped |
| 0.6.x | Constitution, Architecture Consistency, AI Security Risk, design-token enforcement | Shipped |
| 0.7.0 | Constitution rename + `forbidden` deny-list, `pr` subcommand, Test / Business-Logic / Patterns subcommands | Shipped 2026-06-25 |
| 0.8.0 | `docs` (Doc Drift), `db` (Database Health, Postgres-static), `maintenance-cost` ($/month categorical) | Shipped 2026-07-15 |
| **0.9.0** | **Repository Coherence Scanner reframe, default-off INVERTED + NOISY rules, expanded `slop_suggest`, new `slop_governance` MCP tool** | **Shipped 2026-08-15** |
| **0.10** | **Credibility milestone: per-rule P/R/FPR + peer-reviewed thresholds (Halstead, McCabe, Hindle, Rissanen, Kullback-Leibler); MDL composite replaces heuristic weights** | **In flight — see [`docs/research/v0.10-implementation-plan.md`](./docs/research/v0.10-implementation-plan.md)** |
| 1.0 | Stability commitment — 6+ months post-v0.10 empirical feedback; freezes the surface, no new scores | Far horizon |

Per-version research notes:
- [Phase 6 — Doc Drift](./docs/research/phase-6-doc-drift-internet-2026.md)
- [Phase 8 — DB Health](./docs/research/phase-8-db-health-internet-2026.md)
- [Memo #4 — AI Maintenance Cost](./docs/research/phase-memo4-ai-cost-internet-2026.md)
- [Math foundations — peer-reviewed methods for v0.9.3+ rules](./docs/research/math-foundations-for-slopbrick.md)
- [v0.10 implementation plan — credibility milestone roadmap](./docs/research/v0.10-implementation-plan.md)

---

## Installation

Run once without installing:

```bash
npx slopbrick
```

Add to a project as a dev dependency:

```bash
pnpm add -D slopbrick
```

---

## Quick start

Initialize a config in the project root:

```bash
npx slopbrick init
```

Scan the current workspace:

```bash
npx slopbrick scan
```

Or scan specific paths:

```bash
npx slopbrick scan src app
```

On first run, `slopbrick` auto-detects your framework, styling solution, UI libraries (Tailwind, Tamagui, shadcn/ui, MUI, etc.), and workspace packages. Framework presets automatically disable or downgrade rules that are idiomatic for React Native, Expo, or Tamagui.

### Don't want to write a config from scratch?

Four ready-to-use starter configs live in [`examples/`](./examples):

- [`examples/basic/`](./examples/basic) — sensible defaults for most projects
- [`examples/strict/`](./examples/strict) — CI gating with `noIncrease` baseline
- [`examples/monorepo/`](./examples/monorepo) — pnpm/turbo workspaces
- [`examples/ci/`](./examples/ci) — JSON + SARIF output for code-scanning upload

```bash
cp examples/strict/slopbrick.config.mjs ./slopbrick.config.mjs
npx slopbrick validate-config   # check it before running a scan
```

See [`examples/README.md`](./examples/README.md) for the full walkthrough.

---

## Configuration

Config lives at `slopbrick.config.mjs` in the project root. It is an ES module that exports a default object.

```js
export default {
  include: ['src/**/*', 'app/**/*', 'pages/**/*', 'components/**/*'],
  exclude: [
    '**/node_modules/**',
    '**/*.test.{ts,tsx,js,jsx}',
    '**/*.stories.{ts,tsx}',
    '**/.next/**',
    '**/dist/**',
    '**/build/**',
    '**/coverage/**',
  ],

  // Per-category weight multiplier
  categoryWeights: {
    visual: 1.2,
    logic: 1.0,
    perf: 0.8,
    typo: 0.5,
    wcag: 1.0,
    layout: 1.0,
    component: 1.0,
    arch: 1.0,
    security: 1.0,
  },

  // CI threshold (Phase 2 §10: composite Slop Index only)
  thresholds: {
    meanSlop: 30,
  },

  // Rule severity overrides.
  // 'auto' keeps the rule's natural severity; 'off' disables it.
  rules: {
    'visual/inline-style': 'auto',
    'visual/hardcoded-color': 'low',
    'logic/style-sheet-avoidance': 'medium',
  },

  // Boost or reduce scores for specific frameworks
  frameworkMultipliers: {
    astro: 0.8,
  },

  // Phase 2 §10: brick.config.json import paths. Defaults to common
  // shadcn-style paths. Imports from `@/components/*` not matching
  // these prefixes are flagged by `context/import-path-mismatch`.
  allowedImports: [
    '@/components/ui/',
    '@/components/',
    '@/lib/',
    '@/hooks/',
  ],
};
```

### Key options

| Option | What it does |
|--------|--------------|
| `include` | File patterns to scan (default: all source files) |
| `exclude` | File patterns to skip |
| `categoryWeights` | Make certain issue types count more or less |
| `thresholds` | CI gates — see "Thresholds" below |
| `rules` | Turn specific rules off or change their severity |
| `frameworkMultipliers` | Boost/reduce scores for specific frameworks |
| `arbitraryValueAllowlist` | Tailwind values that are OK to use |
| `allowedImports` | brick.config.json import paths (Phase 2 §10) |
| `wcag` | Accessibility-specific settings |

---

## Composite Slop Index (Phase 2 §10)

slopbrick produces a single composite score that prioritizes structural integrity over minor visual escapes:

```
S = (0.40 × S_boundary) + (0.35 × S_context) + (0.25 × S_visual)
```

Each subscore is `min(100, severityPoints / componentCount)`, where `severityPoints` is the sum of severity weights for issues in that bucket.

**Bucket weights:**

| Bucket | Weight | What it measures |
|--------|-------:|------------------|
| **Boundary** | 40% | Structural integrity: file-size limits, multiple components per file, direct API calls in UI |
| **Context** | 35% | Prop correctness, imports, state management |
| **Visual** | 25% | CSS, layout, typography, accessibility |

**Rule → Subscore mapping:**

- **Boundary (40%)**: `logic/boundary-violation`, `component/giant-component`, `component/multiple-components-per-file`
- **Context (35%)**: `component/shadcn-prop-mismatch`, `arch/astro-island-leak`, `context/import-path-mismatch`, most `logic/*`
- **Visual (25%)**: all `visual/*`, `layout/*`, `typo/*`, `wcag/*`, `perf/*`

---

## CLI reference

```text
Usage: slopbrick [options] [command]

Options:
  -V, --version                       output the version number
  --framework <name>                  framework multiplier to apply
  --include <glob>                    include pattern (repeatable)
  --exclude <glob>                    exclude pattern (repeatable)
  --ai-only                           only report AI-specific issues
  --human-only                        only report human-facing issues
  --ignore-wcag22                     ignore WCAG 2.2 related issues
  --format <pretty|json|sarif|html>   output format (default: "pretty")
  --threads <n>                       number of worker threads
  --since <ref>                       only scan files changed since git ref
  --workspace <path>                  workspace/project path
  --tighten                           tighten baseline allowances
  --fix                               apply auto-fixes
  --dry-run                           preview fixes without writing any files
  --diff                              print unified diff of proposed auto-fixes
  --doctor                            run diagnostics
  --watch                             watch files and re-run
  --suggest                           print remediation advice
  --heatmap                           print migration ROI heatmap
  --quiet                             suppress non-error output
  --strict                            exit 2 if any high-severity issue remains
  --no-increase                       exit 2 if slop index increased since last run
  --auto-disable-noisy-rules          downgrade rules whose measured precision < 0.5
                                       or recall < 0.1 by one severity step
  --baseline                          save a baseline after this scan
  --trend [n]                         print a sparkline of the last n runs
  --json [path]                       write JSON report to path or stdout
  --html [path]                       write HTML report to path or stdout
  --staged                            scan only staged files
  --changed                           scan working-tree changes
  --incremental                       skip unchanged files via content-hash cache
  --cache-path <path>                 path to the incremental cache (default: .slop-audit-cache.json)
  --tokens <path>                     merge tokens.json layout values into the
                                       arbitrary-value allowlist
  --cache                             cache parsed AST results locally
  --rule <ruleId>                     run a single rule by id, skip all others
  -h, --help                          display help for command

Commands:
  init [options]                      create a slopbrick config file
  install                             install the git pre-commit hook
  uninstall                           uninstall the git pre-commit hook
  badge                               print a shields.io slop-index badge
  suggest                             print remediation advice
  flywheel [options]                  summarize aggregated scan telemetry
  scan [paths...]                     scan files for slop
  explain <ruleId>                    print rationale, pattern, and remediation for a single rule
  tokens <path>                       ingest a W3C DTCG tokens.json and summarize it by category
  report <path>                       re-render a saved JSON report (from --json path.json)
  doctor                              check your setup, config, and environment for common problems
  rules [--category <name>] [--ai-only] [--json]
                                      list all built-in rules with descriptions
  mcp                                 run an MCP server (for AI agents)
  help [command]                      display help for command
```

### pr — score a pull request

`slopbrick pr` runs the engine over the files changed between two
git refs and returns a single weighted slop score. The score is
`sum(SEVERITY_WEIGHTS[issue.severity]) + constitution_violations`
per file, summed across the diff. With the default threshold of
`20` (configurable via `prScoreThreshold` or `--threshold`), a PR
can introduce roughly 4 medium-severity issues before it fails.

```bash
slopbrick pr [--base <ref>] [--head <ref>]
              [--format text|json|markdown]
              [--threshold <n>] [--max-files <n>]
```

Defaults: `--base main` (falls back to `master` then the first
commit), `--head HEAD`, `--format text`, `--threshold 20`,
`--max-files 500`. The diff is computed with three-dot syntax
(`git diff --name-only base...head`), which matches GitHub's PR
view (merge-base comparison).

```text
$ slopbrick pr
PR score: 4 (threshold: 20) — PASS
Base: main  Head: HEAD
Files changed: 1

src/store.ts  issues=1  constitution=1  score=4
  [medium ] security/public-admin-route — line 1
  [forbidden] Constitution violation: … imports 'redux' (canonical: 'redux').

────────────────────────────────────────────
PR score: 4 / 20 threshold — PASS
```

Use it as a CI gate:

```yaml
- run: npx slopbrick pr --threshold 10
  # exits 1 when PR score > 10
```

### Exit codes

| Code | Meaning |
|------|---------|
| `0` | Composite Slop Index under `meanSlop` threshold |
| `1` | Composite Slop Index exceeds threshold |
| `2` | High-severity issues with `--strict`, score regression with `--no-increase`, or hook install failure |
| `3` | Unexpected scan error (parser crash, worker failure after retries) |

---

## Example terminal output

```text
$ npx slopbrick scan
Scanned 312 files, 501 components, 1423 issues (high: 48, medium: 321, low: 1054)

Slop Index:  14.2 / 100 [PASS]
(Phase 2 §10 composite: 0.40 × Boundary + 0.35 × Context + 0.25 × Visual)
  ├─ Boundary Slop: 12.5 (Weighted: 5.0)
  ├─ Context Slop:    4.0 (Weighted: 1.4)
  └─ Visual Slop:    31.0 (Weighted: 7.8)

Top offending components
    72.3  src/app/(tabs)/keepsakes.tsx
    65.1  src/app/(tabs)/search.tsx
    58.0  src/app/child/[id]/edit.tsx
    ...

Thresholds

  Composite Slop Index   14.2 ≤ 30  pass

All thresholds passed.

Issues (1423)
[HIGH   ] logic/boundary-violation · src/app/(tabs)/keepsakes.tsx:91:22
  Data layer mixed with UI component
  → Move fetch/state into a server action or hook.
```

---

## How scoring works

### Severity weights

| Severity | Weight |
|----------|-------:|
| high | 5 |
| medium | 3 |
| low | 1 |

(The `critical` tier was removed during the scoring-model refactor to prevent scoring inflation.)

### Per-file scoring

For each file, the engine:
1. Parses the source (SWC for TS/JS, regex for HTML, dedicated parsers for Vue/Svelte/Astro).
2. Walks the AST to extract facts: imports, JSX elements, class names, inline styles, hooks, state bindings, etc.
3. Runs each of the 42 registered rules against the facts.
4. Each rule returns 0+ issues with severity, line, column, and optional fix suggestions.

### Project scoring (Phase 2 §10)

1. **Bucket** every issue into one of three subscores (boundary, context, visual) using the rule-to-bucket map.
2. **Sum** severity weights per bucket: `bucketPoints[b] = Σ SEVERITY_WEIGHTS[issue.severity]`.
3. **Normalize**: `subscore[b] = min(100, bucketPoints[b] / componentCount × 100)`.
4. **Composite**: `slopIndex = 0.40 × boundary + 0.35 × context + 0.25 × visual`.
5. **Health**: `assemblyHealth = max(0, 100 - slopIndex)`.

### Threshold

A single threshold (`meanSlop`) gates the exit code: `slopIndex > meanSlop` → exit 1.

---

## Architecture

### High-level pipeline

```
┌────────────┐    ┌──────────┐    ┌──────────┐    ┌──────────┐    ┌──────────┐
│   CLI bin/ │───▶│ discover │───▶│  parser  │───▶│ visitor  │───▶│  rules   │
│ slopbrick │    │ discover │    │  engine/ │    │  engine/ │    │ rules/   │
│    .js     │    │   .ts    │    │ parser.ts│    │ visitor.ts│   │ *.ts     │
└────────────┘    └──────────┘    └──────────┘    └──────────┘    └──────────┘
                                                                  │
                                                                  ▼
┌────────────┐    ┌──────────────┐    ┌────────────────┐    ┌─────────────────┐
│  Output    │◀───│  aggregate   │◀───│   report       │◀───│  ProjectReport  │
│  report/   │    │   metrics    │    │   ProjectReport│    │   (per-issue)   │
│  *.ts      │    │   metrics.ts │    │                │    │                 │
└────────────┘    └──────────────┘    └────────────────┘    └─────────────────┘
```

### End-to-end flow (`slopbrick scan`)

1. **CLI entry** (`bin/slopbrick.js`)

   Loads `dist/index.js` (the bundled CLI), parses command-line flags with Commander, and resolves `cwd` from `--workspace` or `process.cwd()`.

2. **Config loading** (`src/config.ts`)

   Walks up from cwd looking for `slopbrick.config.{js,mjs,cjs,ts}`, merges the user config with `DEFAULT_CONFIG` (which sets `thresholds`, `rules`, `allowedImports`), and validates the merged result against the schema.

3. **File discovery** (`src/discover.ts`)

   Uses `globby` to expand `include` patterns and `minimatch` to apply `exclude`. For files without an extension, it reads the first 512 bytes and sniffs the content type (TSX/TS/JSX/JS/Vue/Svelte/Astro/HTML). It de-duplicates by basename when both extension-less and proper-extension versions exist, then filters by `SOURCE_EXTENSIONS` (`.ts`, `.tsx`, `.js`, `.jsx`, `.vue`, `.svelte`, `.astro`, `.html`).

4. **Per-file scanning** (`src/engine/worker.ts`, `src/engine/parser.ts`, `src/engine/visitor.ts`)

   Runs in worker threads (configurable via `--threads`).

   The **parser** dispatches based on file extension: SWC for TS/JS, dedicated handlers for Vue/Svelte/Astro, regex for HTML. Extension-less files try TSX → TS → JSX → JS in order.

   The **visitor** walks the AST and extracts a `ScanFacts` summary, including:
   - `imports[]` — `{source, importedNames, line, column}`
   - `interactiveElements[]` — JSX `<button>`, `<a>`, `<input>`, etc. with attributes
   - `staticClassNames[]` — className string literals
   - `styleProps[]` — inline `style={{...}}` props
   - `componentSizes[]` — per-component line count + JSX branch count
   - `propBindings[]`, `stateBindings[]`, `hooks[]`, `logicalExpressions[]`, etc.

   **Rule execution** iterates the registered rules (built-ins + user overrides) and calls each rule's `analyze(facts, context)` method, collecting `Issue[]`.

5. **Aggregation** (`src/engine/metrics.ts`)

   Sums severity points per subscore bucket (boundary / context / visual), normalizes each bucket by component count capped at 100, and computes `slopIndex = 0.40 × boundary + 0.35 × context + 0.25 × visual`. Returns the structured `ProjectReport` with all subscores, severity counts, and per-file scores.

6. **Threshold check** (`src/cli/threshold.ts`)

   Calls `thresholdExceeded(report, config)`, which compares `report.slopIndex` against `config.thresholds.meanSlop`. Returns true → exit code 1. Also checks per-category thresholds (`categoryThresholds`) if configured.

7. **Output rendering** (`src/report/`)

   One module per format:
   - `pretty.ts` — human-readable terminal output with the composite breakdown tree
   - `json.ts` — serialized `ProjectReport` (full data)
   - `sarif.ts` — SARIF 2.1.0 for IDE/editor integration
   - `html.ts` — self-contained HTML report with score cards
   - `markdown.ts` — Markdown report for PR comments
   - `heatmap.ts` — migration ROI heatmap (top files by score)
   - `unified-diff.ts` — unified diff of the report
   - `advice.ts` — remediation suggestions
   - `flywheel.ts` — telemetry summary

### File layout

```
src/
├── index.ts                  # Public facade (re-exports from ./cli/)
├── config.ts                 # Public config facade (re-exports from ./config/)
├── config/                   # config/{defaults,presets,detect,load,init}
├── cli/                      # CLI surface (Commander wiring + scan + init engines)
│   ├── program.ts            # runCli — Commander setup, per-command .action() callbacks
│   ├── scan.ts               # runScan, scanProject, watchProject, renderOutput
│   ├── init.ts               # runInitWizard, runDoctor, init prompts
│   ├── options.ts            # CLI option parsers (parseThreads, collectGlob, …)
│   ├── render.ts             # colorForSlop, formatBadge, formatSparkline, …
│   └── threshold.ts          # thresholdExceeded, stagedGating, filterIssues, …
├── engine/
│   ├── parser.ts             # SWC/Vue/Svelte/Astro/HTML dispatch + extension-less fallback
│   ├── visitor.ts            # AST walker → ScanFacts extraction (1313 lines — largest file)
│   ├── worker.ts             # Per-file scan worker thread
│   ├── metrics.ts            # Composite Slop Index aggregation
│   ├── logger.ts             # Test-aware logging
│   ├── pool.ts               # WorkerPool with work-stealing + retry
│   ├── executor.ts           # Inline scan path for small file counts
│   ├── cache.ts              # .slop-audit-cache.json + baseline.json
│   ├── memory.ts             # run-history.json (--trend, --no-increase)
│   ├── telemetry.ts          # Flywheel payloads
│   └── trend.ts              # --trend sparkline builder
├── rules/                    # Rule modules (42 built-in rules across 9 categories)
│   ├── arch/                 #   1 rule  — astro-island-leak
│   ├── component/            #   3 rules — giant-component, multiple-components-per-file,
│   │                                    shadcn-prop-mismatch
│   ├── context/              #   1 rule  — import-path-mismatch
│   ├── layout/               #   4 rules — gap-monopoly, math-element-uniformity,
│   │                                    math-grid-uniformity, spacing-grid
│   ├── logic/                #  11 rules — boundary-violation, ghost-defensive,
│   │                                    key-prop-missing, math-any-density,
│   │                                    math-console-log-storm, math-gini-class-usage,
│   │                                    math-variable-name-entropy, optimistic-no-rollback,
│   │                                    qwik-hook-leak, reactive-hook-soup, zombie-state
│   ├── perf/                 #   2 rules — cls-image, css-bloat
│   ├── typo/                 #   5 rules — calc-fontsize, calc-raw-px, clamp-offscale,
│   │                                    math-button-label-uniformity, math-cta-vocabulary
│   ├── visual/               #  11 rules — arbitrary-escape, clamp-soup, generic-centering,
│   │                                    inline-style-dominance, math-color-cluster,
│   │                                    math-default-font, math-font-entropy,
│   │                                    math-gradient-hue-rotation, math-rounded-entropy,
│   │                                    math-spacing-entropy
│   ├── wcag/                 #   4 rules — dragging-movements, focus-appearance,
│   │                                    focus-obscured, target-size
│   ├── builtins.ts           # Auto-generated registry (pnpm generate:rules)
│   ├── rule.ts               # createRule + RuleDefinition types
│   ├── registry.ts           # RuleRegistry (loadBuiltins, loadProjects)
│   ├── registry-loader.ts    # shadcn/ui registry snapshot cache
│   ├── project.ts            # Project-level rules (runProjectRules)
│   ├── signal-strength.ts    # --show-signal-strength lookup
│   └── signal-strength.json  # Per-rule precision/recall measurements
├── report/                   # Output formatters (pretty, json, sarif, html, …)
│   ├── pretty.ts, json.ts, sarif.ts, html.ts, markdown.ts
│   ├── advice.ts             # --suggest output
│   ├── unified-diff.ts       # --diff output
│   ├── heatmap.ts            # --heatmap output
│   ├── flywheel.ts           # flywheel summary
│   └── html/                 # html/{utils,sections,static}.ts
├── fix/                      # Auto-fix codemods
│   ├── index.ts              # applyFixes orchestrator
│   ├── visual-codemod.ts     # Round-20 visual codemods entry point
│   └── visual-codemods/      # tailwind.ts, jsx.ts, source.ts
├── snippet.ts                # AI agent rule snippet generators (facade)
├── snippet/                  # snippet/{data,render,generators,targets}
├── flywheel.ts               # Flywheel state machine
├── mcp/                      # MCP server (src/mcp/server.ts + tools)
├── research/                 # research/generate, analyze, candidates, calibrate
├── config-validation.ts      # Static config schema validator
├── discover.ts               # File discovery + extension sniffing
├── git.ts                    # --staged / --changed / --since git integration
├── installer.ts              # install/uninstall git pre-commit hook
├── explain.ts                # `slopbrick explain <ruleId>` output
├── tokens.ts                 # W3C DTCG tokens.json parser
├── types.ts                  # All public types (ProjectReport, ScanFacts, Issue, …)
└── bin/                      # bin/slopbrick.js entry point
```

---

## MCP server (for AI agents)

slopbrick ships a [Model Context Protocol](https://modelcontextprotocol.io/) server so AI coding agents can call it directly:

```bash
slopbrick mcp   # JSON-RPC 2.0 over stdio
```

Exposes three tools:

| Tool | Args | Returns |
|------|------|---------|
| `slop_scan_file`    | `{path, framework?}` | issues + Slop Index for one file |
| `slop_explain_rule` | `{ruleId}`          | rule metadata + rationale + file location |
| `slop_list_rules`   | `{category?}`       | all rules with category / severity / aiSpecific |

Add to your MCP client config:

```json
{
  "mcpServers": {
    "slopbrick": {
      "command": "npx",
      "args": ["slopbrick", "mcp"],
      "cwd": "/path/to/your/project"
    }
  }
}
```

### AI agent rule snippets

Generate directive snippets that teach your AI agent the slop rules BEFORE it writes code:

```bash
slopbrick init --matrix                       # print the matrix table
slopbrick init --yes --agents-md              # Codex / opencode / Pi / Cline / Gemini
slopbrick init --yes --claude-md              # Claude Code
slopbrick init --yes --all                    # all targets at once
```

| Flag | File | Agent |
|------|------|-------|
| `--cursor`      | `.cursor/rules/slopbrick.mdc` | Cursor (new format) |
| `--cursorrules` | `.cursorrules` | Cursor (legacy format, deprecated) |
| `--agents-md`   | `AGENTS.md` | OpenAI Codex / opencode / Pi / Cline / Continue / Gemini |
| `--claude-md`   | `CLAUDE.md` | Claude Code (takes precedence over AGENTS.md) |
| `--aider`       | `CONVENTIONS.md` | Aider |
| `--windsurf`    | `.windsurfrules` | Windsurf (Cascade) |
| `--cline`       | `.clinerules/AGENTS.md` | Cline (folder-based) |
| `--gemini`      | `.gemini/GEMINI.md` | Gemini CLI |
| `--copilot`     | `.github/copilot-instructions.md` | GitHub Copilot |

Content is generated live from the rule registry — always matches what slopbrick actually checks.

---

## Adding new rules

Rule modules live in `src/rules/<category>/<rule>.ts`. Each module must export a const ending in `Rule` and a matching default export:

```ts
import { createRule } from '../rule';
import type { Issue, Rule, RuleContext, ScanFacts } from '../../types';

export const myRule = createRule<RuleContext>({
  id: 'category/my-rule',
  category: 'visual',
  severity: 'medium',
  aiSpecific: true,
  description: 'Short one-line description used in `slopbrick rules` output.',
  create(context) {
    return context;
  },
  analyze(_context, facts: ScanFacts): Issue[] {
    const issues: Issue[] = [];
    // ... analyze facts ...
    return issues;
  },
});

export default myRule satisfies Rule<RuleContext>;
```

Run `pnpm generate:rules` to regenerate `src/rules/builtins.ts`. This runs automatically before `pnpm build` and `pnpm test`.

---

## Calibration against held-out human code

The tool ships with an automated calibration test (`tests/integration/calibration.test.ts`) that scans both corpora and asserts every AI-signal rule has a recall/FP ratio ≥ its threshold. It runs as part of `pnpm test` and exits non-zero on regression.

The corpora live at `/Users/cheng/ai-slop-baseline/extracted/`:
- `positive/` — 6,142 AI-generated samples (vibe-coded React apps).
- `negative/` — 54,980 human-written samples (shadcn/ui, calcom, dub, mantine, excalidraw, lobehub, etc.).

A rule with a recall/FP ratio above 1.0× is a useful AI tell. A ratio below 1.0× is an anti-signal — tighten it, scope-restrict it, or drop it.

---

## Glossary

- **Slop Index** — 0–100 composite score per Phase 2 §10. Lower is better. Weighted average of boundary (40%), context (35%), and visual (25%) subscores.
- **Assembly Health** — Inverse of Slop Index. Higher is better.
- **Composite Slop Index** — Phase 2 §10's weighted three-bucket formula.
- **AI-specific rule** — Rule that catches patterns AI defaults to but humans rarely do (e.g. `bg-violet-500`, "Get started today", badge-above-h1 layout).
- **General rule** — Catches real bugs or code-quality issues regardless of author.
- **brick.config.json** — Project config (in `slopbrick.config.mjs`) listing allowed import paths for `context/import-path-mismatch`.
- **RSC / Server component** — React Server Component. Runs on the server, can't use `useState`/`useEffect`. The fix is `'use client'`.
- **Memoization** — React skips re-renders if inputs haven't changed. Inline handlers break memoization because they're new functions on every render.
- **Astro island** — Interactive component inside an otherwise static Astro page. Without `client:*` directive, clicks won't fire.
- **DTCG tokens** — W3C Design Token Community Group JSON format. `slopbrick tokens <path>` reads these.
- **MCP** — Model Context Protocol. JSON-RPC 2.0 over stdio for AI agent integration.

---

## Development

```bash
pnpm install
pnpm typecheck
pnpm test
pnpm build
```

Adding a rule? Update `tests/integration/calibration.test.ts` to add a calibration entry — the corpus test will verify your rule discriminates AI from human code.

---

## License

[MIT](./LICENSE)
