# slopbrick Architecture (historical design record; current train v0.44.0 unreleased)

> **Repository Structure Scanner.** Cross-file pattern drift detection, Constitution enforcement, and MCP tools so AI coding agents follow your existing patterns instead of inventing new ones. The 4-score model (`aiSlopScore` / `engineeringHygiene` / `security` / `repositoryHealth`) proves the Constitution is being followed. v0.43.0 ships the calibration ritual + MCP server + JSON Schemas; v1.0 is reserved for the stability commitment after 6 months of empirical feedback.

> **Current-state correction (2026-07-10):** the latest published package is
> `slopbrick@0.43.0`; the v0.44.0 trust-restoration train is unreleased. The
> canonical MCP registry currently exposes seven tools (see `docs/MCP.md`),
> and the website uses native browser APIs plus WebGL rather than Lenis/GSAP.
> Sections below preserve historical design decisions; package code, schemas,
> the support matrix, and the continuation plan are normative for current work.

## 1. Positioning

`slopbrick` started as an AI-slop linter (Phase 1, 0.5.0). It evolved through the 12-phase plan into a **Repository Constitution Engine**:

- **Phase 1–4** built the foundation: 56 rules across 9 categories, calibrated against 6,142 AI-generated vs 54,980 human-written samples.
- **Phase 5/7/7b** added the first three specialised subcommands (Test Quality, Business Logic Coherence, Pattern Fragmentation).
- **Phase 2 + 11** made the Constitution enforceable: drift detection + forbidden deny-list + per-PR scoring.
- **Phase 6/8** added documentation drift + database health scoring.
- **Phase Memo #4** composed a derived categorical meta-score (AI Maintenance Cost) on top of all signals.
- **Legacy Phase 12** experimented with a management-oriented optional-axis composite. It is retained only as historical/diagnostic code; it is not the current scan headline.

The moat is **the Constitution** — the `slopbrick.config.mjs` block that declares your state management library, your form lib, your modal system, your forbidden packages. Everything else is a score that proves the Constitution is being followed.

## 2. Primary user

**The AI agent.** The headline workflow is `slop_suggest` (MCP): agents call it before writing new code, get the project's `doNotCreate` list, follow the existing patterns, never violate the Constitution. The human-facing CLI is the enforcement layer.

This is a deliberate choice. The two-user framing has been the source of design tension throughout the project:

- **AI agent as primary user** → MCP tools, `doNotCreate` lists, governance breakdown. Agents don't read pretty-printed terminal output; they consume JSON.
- **Human as primary user** → CLI subcommands, `--format pretty`, headline scores. Humans scan one number and act.

The historical 0.9.0 design resolved this in favour of the agent. Current tool counts and command surfaces are defined by `docs/MCP.md`; the current scan headline is the documented four-axis `repositoryHealth`, while legacy management composites are diagnostic only.

## 3. The 4 headline scores and 13 categories (v0.16.0+)

The legacy v0.15.0 model had a single "Slop Index" composite plus 12 sub-scores, totalling 13 numbers split across 3 tiers. That model conflated AI-specific findings with engineering hygiene. v0.16.0 R3 replaced it with 4 orthogonal scores backed by 80+ rules across 13 categories.

### Tier 1 — Headline scores (the 4-score model)

These are the 4 numbers humans and CI gates read. **Each is 0–100 with the score-direction matching the metric** (per v0.21+ convention):

| Score | Shape | Source | Confidence |
|-------|-------|--------|------------|
| **aiSlopScore** | 0–100 (lower = cleaner) | 16 `ai/*` rules (slop signatures, LLM-detection math). Raw amount of slop since v0.21. | High — calibrated corpus; CI gate at `≤ meanSlop` |
| **engineeringHygiene** | 0–100 | Inverted mean burden across the six effective categories: arch, logic, layout, visual, component, test | High — deterministic effective-finding aggregation |
| **security** | 0–100 | Continuous effective security-finding score: `100 / (1 + N / 5)` | High — deterministic effective-finding aggregation |
| **repositoryHealth** | 0–100 | `0.4×(100−aiSlopScore) + 0.3×engineeringHygiene + 0.2×security + 0.1×testQuality` | High — pure aggregation |

The composite `repositoryHealth` is the single number for dashboards (informational; doesn't gate CI). The CI gate is `aiSlopScore ≤ meanSlop`. The other three are the actionable axes: if `aiSlopScore` is high, the team has AI-slop; if `engineeringHygiene` is low, the structure is drifting; if `security` is low, fix the security findings.

### Tier 2 — Heuristic (specialised subcommands)

These scores use heuristics that are calibrated against real projects but not as precise as Tier 1. False positives are possible; the rules are documented as such and shipped with `--strict` opt-ins.

| Score | Shape | Source | Calibration |
|-------|-------|--------|------------|
| **Test Quality** | 0–100 | Canonical effective finding set, including effective `test/*` findings | Heuristic (FP control deferred to 0.9.x) |
| **Business Logic Coherence** | 0–100 | 8 `business-logic/*` rules | Heuristic (named constants, regex) |
| **Documentation Freshness** | 0–100 + `docDrift` band | 4 `docs/*` rules (2 deferred) | Heuristic + arXiv 2606.04769 baseline F1=96.73% |
| **Database Health** | 0–100 + `dbDrift` band | 6 `db/*` rules + `pgsql-parser` | Heuristic (live-DB in 8.1) |

### Tier 3 — Derived (composites)

These scores are pure aggregations of the axes above. They have no detection rules of their own; they compose.

| Score | Shape | Composition | Anchored to |
|-------|-------|-------------|-------------|
| **AI Maintenance Cost** | categorical + `monthlyUSD` | Weighted + Sonar/CodeClimate/$ formula | Sonar $306K/yr/MLoC |
| **Repository Health** | 0–100 | Canonical four-axis weighted aggregate (not renormalized optional axes) | Headline metric |
| **AI Debt band** | `low` / `medium` / `high` / `critical` | Band from canonical Repository Health (`≥80` / `≥60` / `≥40` / lower) | Same |

Treating all 13 as equivalent would invite readers to compare a deterministic Tier 1 score against a heuristic Tier 2 score as if they had the same precision. The tier split makes it explicit: Tier 1 is the contract; Tier 2 is the diagnostic; Tier 3 is the dashboard.

## 4. The Constitution lifecycle

The Constitution is the moat. Its lifecycle has four stages:

```
┌─────────────────────────────────────────────────────────────────────┐
│                                                                     │
│  ┌───────────────┐    ┌───────────────┐    ┌─────────────────────┐  │
│  │  Detect       │    │  Declare      │    │  Enforce            │  │
│  │  (auto from   │───▶│  (override in │───▶│  (drift at PR time, │  │
│  │  package.json)│    │  config.mjs)  │    │   MCP check, CI gate)│  │
│  └───────────────┘    └───────────────┘    └─────────────────────┘  │
│                                                                     │
│  ┌───────────────────────────────────────────────────────────────┐  │
│  │  Guide                                                         │  │
│  │  (slop_suggest MCP returns doNotCreate + declaredStack +      │  │
│  │   existingPatterns so agents follow the Constitution)           │  │
│  └───────────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────────┘
```

**Detect** — `src/config/detect/` walks `package.json` + tsconfig + framework conventions and proposes an initial Constitution. Auto-detected values are *suggestions*; user declarations always win.

**Declare** — `slopbrick.config.mjs` exports a `constitution: { stateManagement, dataFetching, uiLibrary, forms, styling, routing, forbidden }` block. The user can edit freely — auto-detection is bypassed when the field is set.

**Enforce** — Three enforcement surfaces:

- `slopbrick drift` CLI exits 1 on any violation (CI-friendly)
- `slopbrick pr` per-PR score gates PRs on a configurable threshold
- `slop_check_constitution` MCP tool gives per-file feedback

**Guide** — `slop_suggest` MCP tool returns the Constitution as actionable guidance for AI agents: the `doNotCreate` deny-list (from `constitution.forbidden`), the declared stack (flattened), and the existing-pattern inventory. Agents consume this *before* writing new code, not after.

The lifecycle is what makes the Constitution a working contract rather than a doc nobody reads. The "killer feature" is the Guide surface — agents that have the Constitution in their context window are measurably better-behaved than agents that don't.

## 5. Historical MCP tool surface (v0.9 planning artifact; not current)

The table below preserves the v0.9 planning proposal only. It is **not** a
runtime tool registry: names such as `slop_governance`,
`slop_architecture_score`, and `slop_business_logic_score` are not current
MCP tools. The canonical seven-tool registry is generated in
[`docs/MCP.md`](./MCP.md).

| Tool | Purpose | Used by |
|------|---------|---------|
| `slop_scan_file` | Single-file scan with issues + Slop Index | Per-file inspection |
| `slop_explain_rule` | Rule metadata (id, category, severity, rationale, fix path) | Before auto-apply --fix |
| `slop_list_rules` | All registered rules with optional category filter | Discovery |
| `slop_suggest` | **Primary entry point for agents.** Existing patterns + `doNotCreate` + `declaredStack` + governance | Before writing new code |
| `slop_governance` | Composite Repository Health + AI Debt + per-axis breakdown | Headline number for agents |
| `slop_check_constitution` | Per-file constitution diff | After writing new code |
| `slop_architecture_score` | Architecture Consistency Score (0–100) + per-category deductions | Diagnostic |
| `slop_business_logic_score` | Business Logic Coherence (0–100) + per-rule counts + issues | Diagnostic |

**Context budget:** at the documented input sizes, the tool responses are designed to fit in a single MCP response (≤ 8 KB). Larger inventories (default maxFiles=200, capped at 2000) stay under that ceiling.

## 6. Layer diagram

The codebase has three layers. (The earlier doc had six boxes which mixed layers and concerns.)

```
┌─────────────────────────────────────────────────────────────────────┐
│  CLI surface (src/cli/)                                             │
│    scan · drift · architecture · security · pr · test ·             │
│    business-logic · patterns · maintenance-cost · docs · db          │
│                                                                     │
│    Each subcommand:                                                 │
│      1. Load config (slopbrick.config.mjs)                         │
│      2. Run engine (returns Issue[] + per-rule meta)                 │
│      3. Compute score (pure function over Issue[])                  │
│      4. Render (text | json | markdown)                             │
│      5. process.exit with --strict-aware code                       │
└─────────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────────┐
│  Engine (src/engine/)                                               │
│                                                                     │
│  Detection:    parser.ts → visitor.ts → rules/<cat>/*.ts → Issue[]  │
│  Composition:  repository-health.ts, maintenance-cost.ts,           │
│                architecture-score.ts, test-quality.ts, etc.          │
│                                                                     │
│  Pure functions. No I/O. Reused by CLI + MCP.                       │
└─────────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────────┐
│  Configuration (src/config/)                                        │
│                                                                     │
│  defaults.ts (DEFAULT_CONFIG)                                       │
│    └── categoryWeights, rule severities, constitution auto-detect   │
│  conventions.ts (CONSTITUTION_SIGNALS — 40+ entries)                │
│  load.ts (resolveConfigFromFile)                                    │
│  init.ts (interactive wizard)                                       │
└─────────────────────────────────────────────────────────────────────┘
```

The CLI is thin. The engine is the testable surface. The config layer is the source of truth for what counts as "the project." When in doubt, the Constitution lives in `slopbrick.config.mjs`; the engine reads it, the CLI renders it, the MCP returns it.

## 7. Endgame framing

The 0.9.0 endgame is **the end of the 12-phase plan**. After 0.9.0, the project stops adding new scores and focuses on:

- **MCP tool consolidation** — drop `slop_architecture_score` + `slop_business_logic_score` in favour of `slop_suggest` + `slop_governance`. Reduces context-window cost for agents.
- **Calibration against real users** — the heuristic Tier 2 scores need empirical data to tighten F1. Without users, calibration is a guess.
- **1.0 stability commitment** — after 6 months of empirical feedback, the API freezes. Breaking changes become a major-version bump.

Until 1.0, breaking changes are expected and APIs may shift. See `ROADMAP.md` for the post-1.0 commitments.

## 8. Open trade-offs

These are the unresolved design tensions as of 0.9.0. They're documented so future contributors understand which decisions were deliberate:

| Trade-off | Current choice | Why | Open question |
|-----------|----------------|-----|---------------|
| Two-user framing | Agent-primary | MCP tools are the highest-leverage surface | Is the human a first-class user or just a consumer of agent outputs? |
| Heuristic Tier 2 FPs | Ship with documented FPs | Better to ship a useful-but-noisy rule than no rule | When to gate on real user feedback vs. ship more rules? |
| Postgres-only DB | v1 Postgres-static via `pgsql-parser` | Multi-dialect tax doesn't pay off in AI-built segment | When (if ever) does MySQL support justify the maintenance burden? |
| Docs stale-env-var + route | Deferred to 0.9.x | IEEE 2025 + Docsie case studies show high FP | When does user feedback justify shipping them? |
| Phase 9 Product Consistency | Not in 0.9.0 | Lower leverage than the composite endgame | When does a project grow enough to need terminology drift detection? |
| Per-phase MCP tools | Shipped alongside `slop_governance` | Avoid forcing early users to learn a new shape | When to deprecate per-phase tools? |

---

For the per-score semantics, see `docs/scoring-runbook.md`. For the 12-phase plan and release train, see `ROADMAP.md`. For the empirical research grounding the v0.8.0/0.9.0 phase decisions, see `docs/research/`.
