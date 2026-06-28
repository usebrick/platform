# usebrick — Architecture & Functional Reference

**Date**: 2026-06-26
**Status**: v0.14.5 stable, v0.15.0 planned (rebrand + architectural refactor)
**Author**: dystx (with Kimi Code CLI)
**Source of truth for future changes**: `docs/superpowers/specs/2026-06-26-structure-rebrand-design.md` + `docs/superpowers/specs/2026-06-26-architectural-refactor-design.md`

---

## 1. What usebrick is

**usebrick.dev** is the [Repository Structure Platform](#2-the-naming-shift) — a four-tool monorepo that continuously discovers, models, and governs the structure of a code repository.

usebrick is **not** an LLM-memory product. It does not embed code, does not chat, does not RAG. It is **deterministic analysis** — every output is reproducible from the input source files plus a calibration dataset.

### One-sentence positioning

> "BRICK continuously discovers and maintains your repository's structure."

### The four products

| Product | Purpose | Status |
|---------|---------|--------|
| **PickBrick** | Defines the **intended** structure (the constitution) | planned (was part of v0.14.5 roadmap) |
| **SlopBrick** | Discovers the **actual** structure (the scanner) | shipped as `slopbrick@0.14.5` on npm |
| **MendBrick** | Repairs the structure (the migrator) | planned (was part of v0.14.5 roadmap) |
| **LockBrick** | Protects the structure (the enforcer, in CI) | planned (was part of v0.14.5 roadmap) |

The four revolve around one noun: **structure**. The user reads the model as:

```
Repository
  ├── Constitution (desired structure)
  ├── Inventory (observed structure)
  ├── Health (quality of structure)
  ├── Drift (difference from desired)
  └── History (how structure evolved)
```

---

## 2. The naming shift

usebrick was originally named "Repository Memory Platform" — the word "memory" was meant in the sense of "persistent understanding." But it consistently led users to think of LLM memory, chat history, vector databases, RAG, embeddings. None of that is what usebrick does.

**v0.15.0** (planned) renames the platform to **Repository Structure Platform (RSP)**. The 4 product names (PickBrick, SlopBrick, MendBrick, LockBrick) are unchanged. The internal file/type/function names change from `memory*` → `structure*`. The on-disk artifact `memory.md` becomes `structure.md`. The schema version bumps from `MEMORY_SCHEMA_VERSION = '2'` to `STRUCTURE_SCHEMA_VERSION = '3'`. The single `slopIndex` score is replaced by 3 independent scores (AI Quality, Engineering Hygiene, Security) plus a Repository Health composite.

The change is **hard break, no aliases**. There are no known external consumers of the schema (slopbrick is the only writer; the website doesn't read it). The MCP tool name `slop_suggest_memory` becomes `slop_suggest_structure` — any client calling the old name breaks. The user accepted this.

**What to keep**: outcome language. "BRICK gives AI persistent understanding of your repository" stays (the outcome is understanding, the underlying asset is structure). The 4 product names stay. The `slop-audit/` directory name (legacy) stays out of scope.

---

## 3. Repository layout

```
platform/
├── packages/
│   ├── core/                  @usebrick/core (private, workspace-only)
│   ├── slopbrick/             slopbrick (published as `slopbrick`)
│   ├── engine/                @usebrick/engine (private, workspace-only, NEW in v0.15.0)
│   └── website/               @usebrick/website (private, deployed to GitHub Pages)
├── docs/
│   ├── architecture.md         this file
│   ├── update-summary.md       v0.14.5 → v0.15.0 changelog
│   ├── future-extractions.md   packages/memory + packages/contracts (future)
│   ├── old-repo-redirect.md    (content for usebrick/slopbrick README redirect)
│   └── superpowers/
│       ├── specs/              design specs for v0.15.0
│       └── plans/              implementation plans
├── AGENTS.md                   AI agent instructions
├── CONTRIBUTING.md             (will be added in v0.15.0)
├── README.md                   project readme
└── package.json                root (private workspace hub)
```

---

## 4. Packages — what each does

### 4.1 `@usebrick/core` (workspace-only, not published)

The schema contract. Defines the cross-language data model that every tool in the platform reads or writes. Lives at `packages/core/`.

**Public exports** (`packages/core/src/index.ts`):
- Types: `InventoryFile`, `ConstitutionFile`, `StructureFile` (was `MemoryFile`), `HealthFile`
- `MemoryCategory` (→ renamed `StructureCategory` in v0.15.0)
- Verdict enum: `VERDICTS = ['USEFUL', 'OK', 'NOISY', 'INVERTED', 'HYGIENE', 'DORMANT']`
- `isDefaultOff(verdict)` — property test
- Zod schema: `signalStrengthSchema` for the calibration data
- `STRUCTURE_SCHEMA_VERSION` (was `MEMORY_SCHEMA_VERSION` in v0.14.5)

**Schemas** (`packages/core/schemas/v1/`):
- `constitution.schema.json` — desired structure (what the project declares it should be)
- `inventory.schema.json` — observed structure (what slopbrick detected)
- `structure.schema.json` (was `memory.schema.json`) — agent-readable markdown summary
- `health.schema.json` — health snapshot (the scores)
- `index.json` — schema index

**Corpus reference** (`packages/core/corpus-manifest.template.json` + gitignored `.local.json`): where the calibration corpus lives, what calibration is current.

**v0.15.0 plans**: add Zod schemas for the JSON Schemas themselves, codegen TS types from the JSON Schemas, make the generated types the public API. The verdict enum is the single source of truth for the calibration pipeline.

### 4.2 `slopbrick` (published as `slopbrick` on npm)

The flagship CLI. The only tool currently shipping. Lives at `packages/slopbrick/`.

**One-liner** (current README, will change in v0.15.0):
> "Your codebase remembers itself. SlopBrick gives AI agents persistent repository memory so they stop reinventing your architecture every session."

**v0.15.0 one-liner** (planned):
> "Discovered, modeled, and governed repository structure — deterministic analysis, no LLM in the loop."

**Commands** (bin: `slopbrick`):
- `slopbrick init` — generate a `slopbrick.config.mjs` for the project
- `slopbrick scan` — scan source files, emit `.slopbrick/{inventory,constitution,health,structure}.json` + structure.md
- `slopbrick scan --diff <ref>` — scan only files changed since the git ref
- `slopbrick scan --pr` — compute PR Slop Score, exit 1 if over threshold (for CI)
- `slopbrick drift` — show how the structure has drifted since the last scan
- `slopbrick test` — run the per-rule test suite on the current project
- `slopbrick explain <rule>` — show the rule's docs, calibration stats, and recent fires
- `slopbrick doctor` — diagnose the project setup, check config validity
- `slopbrick security` — security-focused scan (subset of rules)
- `slopbrick docs` — generate per-rule markdown documentation
- `slopbrick flywheel` — show the calibration flywheel (proposed rules, declining rules)
- `slopbrick flywheel --export` — export the flywheel snapshot
- `slopbrick calibrate` — (research) run the calibration pipeline against the corpus
- `slopbrick migrate` — migrate v1 (`.slop-audit/`) projects to v2 (`.slopbrick/`)

**Source layout** (current):
- `src/cli/` — 19 command modules, plus `program.ts` (Commander wiring) and `scan.ts` (1469 lines — the biggest file)
- `src/engine/` — 30+ pure-function modules (parser, memory.md, lr-combiner, scoring, visitors)
- `src/rules/` — 80 rules in 14 categories (ai/, arch/, component/, context/, db/, layout/, logic/, perf/, product/, security/, sql/, test/, typo/, visual/, wcag/)
- `src/rules/builtins.ts` — auto-generated registry of all rules (rebuilt by `pnpm generate:rules`)
- `src/rules/signal-strength.json` — the v7 calibration data (the only consumer of the corpus)
- `src/mcp/` — MCP server exposing `slop_suggest`, `slop_suggest_with_memory` (→ `slop_suggest_with_structure` in v0.15.0), `slop_check_constitution`, `slop_find_similar`
- `src/types.ts` — 1010 lines of public types
- `src/config/` — config validation, defaults
- `src/research/` — the calibration flywheel (candidates, generator, prompts, provider)

**v0.15.0 plans**: extract `src/engine/` to a new `packages/engine/` package. Slim `src/cli/scan.ts` from 1469 lines to ~500 by extracting report generation. Add the engine/UI taxonomy seam. Multi-score: replace `slopIndex` with `aiQuality` / `engineeringHygiene` / `security` / `repositoryHealth`.

### 4.3 `@usebrick/engine` (workspace-only, NEW in v0.15.0)

The pure-function engine extracted from `slopbrick/src/engine/`. No I/O, no `console.log`, no `process.exit`. Reusable from CLI, MCP, future web IDEs, future CI binaries.

**Public API** (`packages/engine/src/index.ts`):
- `scanProject(options, io)` — pure scan, takes an `MemoryIO` interface for file I/O
- `loadStructure` / `saveStructure` — structure persistence
- `computeLikelihoodRatios(ruleIds, corpus)` — LR math
- `bayesianPosterior(firedRuleIds, lrs)` — naive Bayes update
- `parseFile(filePath, content)` — AST parsing
- 30+ more exports

**v0.15.0 build dependency**: `slopbrick` imports `@usebrick/engine` (instead of `src/engine/`).

### 4.4 `@usebrick/website` (workspace-only, deployed to GitHub Pages)

The [usebrick.dev](https://usebrick.dev) marketing site. Lives at `packages/website/`.

**Stack** (per AGENTS.md "library-first" principle): Astro 4.16 (static, no framework) + Lenis smooth scroll + GSAP 3.12 (per-tool-card shake) + @tabler/icons-webfont + custom WebGL fragment shader for the hero.

**Sections** (all static HTML, no React/Vue/Svelte):
- **Nav** — fixed translucent bar, 4 anchor links
- **Hero** — full-bleed WebGL brick wall, terracotta prompt, copy-to-clipboard install command
- **Tools** — 4 tool cards (pickbrick, mendbrick, slopbrick, core), click-to-break animation on click
- **Compare** — usebrick vs everything else, terminal preview
- **Calibration** — 4 stats that count up on reveal
- **CTA** — final install + GitHub buttons
- **Footer** — version sourced from sibling packages

**Theme** (per the design system at `packages/website/docs/design-system.md`):
- Warm dark mortar `#1a0e08` (background)
- Terracotta `#dc4a26` (accent — the brick color)
- Running-bond brick pattern overlays on hero, calibration, CTA

**v0.15.0 plans**: update copy to "Repository Structure Platform" (Hero, Compare, CTA, Footer, tagline, title, meta). Add skip-to-content link, button role on tool cards, axe-core in CI. WebGL context cleanup. LowPowerDetector.

---

## 5. Data flow

```
                    ┌──────────────────────┐
                    │  slopbrick scan      │
                    │  (CLI)               │
                    └──────────┬───────────┘
                               │
                               ▼
                  ┌────────────────────────────┐
                  │   @usebrick/engine         │
                  │   (pure functions)         │
                  │   parser, scoring,         │
                  │   lr-combiner, visitors    │
                  └────────────┬───────────────┘
                               │
                               ▼
                  ┌────────────────────────────┐
                  │   .slopbrick/              │
                  │   ├─ inventory.json        │
                  │   ├─ constitution.json     │
                  │   ├─ structure.md          │  (was memory.md)
                  │   └─ health.json           │
                  └────────────┬───────────────┘
                               │
                               ▼
                  ┌────────────────────────────┐
                  │   @usebrick/core           │  validates against
                  │   (schemas/v1/*.json)      │  JSON Schemas
                  └────────────┬───────────────┘
                               │
                               ▼
                  ┌────────────────────────────┐
                  │   MCP server               │  exposes structure.md
                  │   (slopbrick/mcp/)         │  to editors + agents
                  └────────────┬───────────────┘
                               │
                               ▼
                  ┌────────────────────────────┐
                  │   usebrick.dev website     │  marketing surface
                  │   (packages/website/)      │  (no data ingestion)
                  └────────────────────────────┘
```

The website is **separate** from the data flow — it doesn't read or write any data. It's a static marketing site.

---

## 6. The verdict taxonomy (engine, internal)

`signal-strength.json` assigns each of 80 rules a verdict from a 6-value enum. This is the **engine's** classification; the user doesn't see these labels.

| Verdict | Meaning | Default on? | LR (lift) | Fires on |
|---------|---------|-------------|-----------|----------|
| **USEFUL** | High precision + high lift | yes | ≥ 2 | AI more than human |
| **OK** | Moderate signal | yes | 1–2 | AI slightly more than human |
| **NOISY** | Fires on both classes | no | < 1, inconsistent | both |
| **INVERTED** | Fires MORE on negative class | no | < 1, consistent | humans more than AI |
| **HYGIENE** | Non-AI quality check | yes (v7) | ≈ 1 (low) | both, slightly more on human |
| **DORMANT** | Never fires | no | undefined | never |

**v7 distribution** (committed in `aed68df`): 32 USEFUL, 6 OK, 5 NOISY, 1 INVERTED, 24 HYGIENE, 12 DORMANT.

The verdict drives:
- `defaultOff` logic: rules with `verdict ∈ {NOISY, INVERTED, DORMANT}` are off by default (HYGIENE is the exception — it's on in v7 because it's "additional layer of value rather than primary metric")
- LR math in the Bayesian combiner: INVERTED rules have LR < 1 and invert the AI signal
- HTML/JSON report color-coding: USEFUL/OK badges are different colors from NOISY/INVERTED

**v0.15.0 plans**: extract `VERDICTS` and `Verdict` to `packages/core/src/verdicts.ts` as the single source of truth. Add Zod schema for `signal-strength.json`. Replace exact-count tests with property-based assertions.

---

## 7. The report taxonomy (UI, user-facing)

A **deliberate seam** between the engine's 6 verdicts and what the user sees. The user doesn't care about "USEFUL" or "OK" — they care about the rule's action. The seam is one function:

```ts
// packages/slopbrick/src/report/buckets.ts (new in v0.15.0)
export type Bucket = 'ai' | 'hygiene' | 'suppressed';

export function bucketForVerdict(verdict: Verdict): Bucket {
  switch (verdict) {
    case 'USEFUL': case 'OK':            return 'ai';
    case 'HYGIENE': case 'INVERTED':    return 'hygiene';
    case 'NOISY': case 'DORMANT':       return 'suppressed';
  }
}
```

The user sees 3 buckets:

```
┌─ AI Findings ────────────────┐
│ ✓ 11 Useful                  │   ← USEFUL + OK
│ ✓ 2 OK                       │
└───────────────────────────────┘
┌─ Engineering Hygiene ────────┐
│ ✓ 6 Issues                   │   ← HYGIENE + INVERTED
└───────────────────────────────┘
┌─ Suppressed ─────────────────┐
│ ✓ 1 Noisy                    │   ← NOISY (hidden by default)
└───────────────────────────────┘
```

**The key design decision**: INVERTED and HYGIENE are in the same UI bucket because from the user's perspective they're "non-AI rules I should know about" — the engine's distinction (LR < 1 vs LR ≈ 1) is calibration detail, not action detail.

---

## 8. The scoring model

### v0.14.5 (current): one number

```
Slop Score: 78/100
```

Computed from rules with `verdict ∈ {USEFUL, OK}` only (HYGIENE was supposed to be opt-out but the v7 calibration made it defaultOn, which made the score unpredictable).

### v0.15.0 (planned): three numbers + composite

```
Repository Health
├── AI Quality              81/100   (USEFUL + OK)
├── Engineering Hygiene     94/100   (HYGIENE + INVERTED)
└── Security               100/100  (security/* rules regardless of verdict)
```

The composite `repositoryHealth` is a weighted sum (weights are configurable; default 50/30/20 AI/Hygiene/Security).

**Why this scales**: two repositories:

```
Repository A: AI 95  Hygiene 40   ← excellent AI discipline, poor engineering cleanliness
Repository B: AI 40  Hygiene 95   ← clean engineering practices, significant AI drift
```

A single combined Slop Score would hide that distinction. Two numbers + a composite let users see the actual problem.

**Why hygiene doesn't affect AI Quality**: "My Slop Score went up because I forgot to remove a console.log." That's mixing two different concepts. The new model makes it impossible.

---

## 9. The MCP server

The slopbrick CLI also ships an MCP server (Model Context Protocol — for AI editor integration). 4 tools:

| Tool (current) | Tool (v0.15.0) | Purpose |
|----------------|---------------|---------|
| `slop_suggest` | unchanged | Suggest patterns from the inventory |
| `slop_suggest_with_memory` | `slop_suggest_with_structure` | Fast-path: read `.slopbrick/structure.md` (was `memory.md`) instead of re-scanning (100-1000× faster) |
| `slop_check_constitution` | unchanged | Check if a file violates the constitution |
| `slop_find_similar` | unchanged | Find files similar to a given file (Louvain community detection) |

The `slop_suggest_with_memory` → `slop_suggest_with_structure` rename is a **breaking change** for any MCP client. The user accepted this (no known external consumers; the tool is in early dev).

---

## 10. The corpus

usebrick's calibration is data-driven: every rule's `recall` (TP per AI file) and `fpRate` (FP per human file) are measured against a labeled corpus of ~420k files (184k negative + 239k positive, as of v7).

**The corpus is not vendored** — it's too large (~43GB) and a shallow clone is faster than a checkout. The reference is in `packages/core/corpus-manifest.template.json` (committed, public format spec) and `corpus-manifest.local.json` (gitignored, your private copy with absolute path).

**Structure** (live, as of v0.14.5):
- `negative/` — 39 categories of human-written code (react, python, express, fastify, jest, koajs, lodash, etc.)
- `positive/` — 91 directories of AI-generated / AI-assisted code (anthropic-cookbook, aider, ai-chatbot, etc.)
- `v5/`, `v7/` — calibration outputs (older + current)
- `filelists/` — pre-computed file lists for each source
- `tools/baseline/` — calibration tooling (classify.py, extract_*.py, rank_*.py) — was at `/Users/cheng/ai-slop-baseline/`
- `output/`, `labeled/` — pipeline outputs and manually labeled subsets

The corpus is referenced (but not vendored) by `signal-strength.json` via rule IDs.

---

## 11. Build & release

### Build order

1. `@usebrick/core` (no deps)
2. `@usebrick/engine` (deps: `@usebrick/core`) — new in v0.15.0
3. `slopbrick` (deps: `@usebrick/core`, `@usebrick/engine`)
4. `@usebrick/website` (no monorepo deps; reads sibling versions at build time via `prebuild.ts`)

### Release cadence

- `slopbrick` — published on npm. Bumps patch for fixes, minor for new scores/rules, **major for breaking scan output or schema changes** (v0.15.0 = major).
- `@usebrick/core` — workspace-only. No published version.
- `@usebrick/engine` — workspace-only. New in v0.15.0. Tracks slopbrick version in lock-step.
- `@usebrick/website` — workspace-only. Deployed to GitHub Pages on `main` when `packages/website/**` changes.

### v0.15.0 release plan

- **Major version bump**: slopbrick 0.14.5 → 0.15.0
- **Breaking changes**:
  - `MEMORY_SCHEMA_VERSION` gone, `STRUCTURE_SCHEMA_VERSION = '3'` instead
  - File `memory.md` → `structure.md`
  - Type `MemoryFile` → `StructureFile`; same for `MemoryCategory`, `MemoryPattern`, etc.
  - Functions `loadMemory` / `saveMemory` → `loadStructure` / `saveStructure`
  - MCP tool `slop_suggest_with_memory` → `slop_suggest_with_structure`
  - Score `slopIndex` replaced by `aiQuality` / `engineeringHygiene` / `security` / `repositoryHealth`
  - `flywheelExport.memory` field gone (the file rename covers the on-disk artifact)
- **No aliases** (Q4 user decision)
- **6 PRs to v0.14.5d** (one per phase), then merge to `main`, then npm publish

---

## 12. What's in `docs/superpowers/`

The brainstorming, design, and planning artifacts for the v0.15.0 work:

- `docs/superpowers/specs/2026-06-26-architectural-refactor-design.md` (773 lines) — the original 7-sub-project refactor
- `docs/superpowers/specs/2026-06-26-structure-rebrand-design.md` (470 lines) — the rebrand + engine/UI split + multi-score design
- `docs/superpowers/plans/2026-06-26-architectural-refactor.md` (2,439 lines) — the 28-task implementation plan (to be merged with the rebrand + multi-score work)

The full session log is in `docs/UPDATE-SUMMARY.md`.

---

## 13. Future direction

Documented in `docs/future-extractions.md` and the v0.14.5 ROADMAP:

- **packages/memory/** (or `packages/structure/` after v0.15.0) — when the structure module outgrows the schema
- **packages/contracts/** — when a non-TypeScript consumer needs the schemas (Python stackpick analyzer, Go CI binary)
- **packages/mcp/** — extract the MCP server as a standalone library
- **packages/sdk/** — programmatic SDK for embedding usebrick.dev tools in other pipelines
- **stackpick**, **gir** — future CLIs (the planned 4-product expansion)

---

## Appendix A: Glossary

| Term | Meaning |
|------|---------|
| **AI Findings** | Rules that detect AI-induced patterns in source code (zombie state, ghost defensive, default React stack, etc.) |
| **Constitution** | The declared/intended structure (what the project says it should be) |
| **Drift** | The difference between constitution and inventory (what should be vs. what is) |
| **Engine** | The pure-function scanning logic (no I/O, no console.log, no process.exit) |
| **Health** | The per-scan quality snapshot: scores, rule fires, pattern counts |
| **Hygiene** | Non-AI code quality (security, style, docs, test) — fires on patterns common in both human and AI code |
| **Inventory** | The observed/actual structure (what slopbrick detected in the scan) |
| **LR (likelihood ratio)** | `recall / fpRate` — the math used in the Bayesian combiner. LR > 1 = AI signal; LR < 1 = anti-AI signal |
| **Slop Score** | v0.14.5: single number. v0.15.0: renamed to AI Quality |
| **Structure** | The repository's actual layout: components, files, patterns, dependencies, conventions |
| **Structure Score** | v0.15.0: composite of AI Quality + Engineering Hygiene + Security |
| **Verdict** | The engine's classification of a rule (USEFUL/OK/NOISY/INVERTED/HYGIENE/DORMANT) |

## Appendix B: Cross-references

- v0.14.5 release notes: `packages/slopbrick/CHANGELOG.md` and the v0.14.5q launch blog at `packages/slopbrick/docs/launch-blog-post-v0.14.5d.md`
- Agent instructions: `AGENTS.md`
- Contributing guide (coming in v0.15.0): `CONTRIBUTING.md`
- Public API doc (coming in v0.15.0): `packages/core/docs/public-api.md`
- Architecture doc (this file): `docs/architecture.md`
- Update summary: `docs/update-summary.md`
- Future work: `docs/future-extractions.md`
- Old repo redirect: `docs/old-repo-redirect.md`
