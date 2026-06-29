# Repository Memory → Repository Structure Rebrand

**Date**: 2026-06-26
**Status**: Approved — ready to merge with the architectural refactor plan
**Scope**: `packages/core/`, `packages/slopbrick/`, `packages/website/`, root docs
**Effort estimate**: ~3 days, 70+ files
**Author**: dystx (brainstorming session with Kimi Code CLI)

---

## Executive Summary

Rebrand the platform from **Repository Memory Platform** to **Repository Structure Platform (RSP)**. The word "memory" leads users to think LLM/vector DB/RAG/embeddings, but the platform is actually doing **deterministic structure modeling** — architecture, components, relationships, conventions, drift, enforcement. "Structure" is the right noun; "memory" is a misleading product category.

This spec is **merged with the architectural refactor spec** at `2026-06-26-architectural-refactor-design.md` (per user decision). The rebrand tasks become **Phase 0 of the architectural refactor plan** — they run before the existing 28 tasks so the new files (verdicts.ts, signal-strength-schema.ts, the new `engine/` package) are created with the new naming from the start.

**Version impact**: slopbrick bumps from **0.14.5 → 0.15.0** (major: schema version changes, file renames break any external consumer, public exports change). `@usebrick/core` stays workspace-only so no published-version bump.

---

## Background

### Why this change

The current "Repository Memory" terminology creates the wrong mental model:

- Users hear "memory" and think LLM memory, chat history, agent memory, vector databases, RAG, embeddings.
- But usebrick is **not** remembering conversations. It's discovering and maintaining the **structure** of a repository — deterministic analysis of source code, no LLM in the loop for the actual computation.
- The 4 product surfaces (PickBrick defines intended structure, SlopBrick discovers actual, MendBrick repairs, future LockBrick protects) all revolve around one noun: **structure**.
- "Structure" positions usebrick against architecture/governance tools (Spectral, MegaLinter, dependency-cruiser), not against AI memory products (Mem0, Zep, Letta).

### What changes in the user's mental model

**Before**: "BRICK remembers your repository."
After: "BRICK continuously discovers and maintains your repository's structure."

The user now thinks: architecture, components, relationships, dependencies, conventions, drift — which is what we actually build.

### What this enables

A clean, deterministic positioning: "We continuously model and govern repository structure." This is a different category from "AI memory" products and from "AI understands your repo" tools like RepoWise.

---

## Goals & Non-Goals

### Goals
- **G1**: Replace "Repository Memory" with "Repository Structure Platform" across all user-facing language.
- **G2**: Rename all type/function/file names from `memory*` → `structure*` (with the documented exceptions).
- **G3**: Bump `MEMORY_SCHEMA_VERSION = '2'` → `STRUCTURE_SCHEMA_VERSION = '3'` and slopbrick version 0.14.5 → 0.15.0.
- **G4**: Keep the 4 product names (PickBrick, SlopBrick, MendBrick, future LockBrick) — the "Brick" brand is intact.
- **G5**: Preserve outcome language: "BRICK gives AI persistent understanding of your repository" stays (the outcome is understanding, the underlying asset is structure).
- **G6**: The rebrand runs as Phase 0 of the architectural refactor — new files use "structure" naming from the start.
- **G7**: Engine/UI taxonomy split: keep the 6 engine verdicts for LR math and calibration, but expose a 3-bucket UI taxonomy (AI Findings / Engineering Hygiene / Suppressed) to the user. INVERTED is in the same UI bucket as HYGIENE (Engineering Hygiene) per the user's design intent ("INVERTED is basically HYGIENE").
- **G8**: Multi-dimensional health scoring: replace the single Slop Score with 3 independent scores (AI Quality / Engineering Hygiene / Security) plus a Repository Health composite. Hygiene does not affect the AI Slop Score.

### Non-Goals
- **NG1**: Rewriting git history (immutable; commit messages that said "memory" stay as-is).
- **NG2**: Renaming MCP tool internal name (renamed; the tool identifier breaks — Q1 decision).
- **NG3**: Publishing `@usebrick/core` to npm (still workspace-only).
- **NG4**: Adding a `slopbrick migrate` command (the cutover is clean; old `.slopbrick/memory.md` files are simply ignored; users run a fresh `slopbrick scan` to write the new `.slopbrick/structure.md`).
- **NG5**: Renaming the `slop-audit` (historical) directory in slopbrick (separate concern; tracked separately).
- **NG6**: Changing the verdict taxonomy (USEFUL/OK/NOISY/INVERTED/HYGIENE/DORMANT) — that's about what slopbrick measures, not what it models. The HYGIENE bucket remains "defaultOn in v7" per the verdict-type-safety spec.

---

## Design Decisions (Q1, Q2, Q3 — all answered 2026-06-26)

| Question | Decision | Rationale |
|----------|----------|-----------|
| **Q1**: MCP tool name `slop-suggest-memory` | **Rename to `slop-suggest-structure`** | User chose to break MCP clients. The tool is in early dev, no known external consumers. Clean cutover. |
| **Q2**: CHANGELOG history | **Rewrite v0.14.5 entries to "structure"** | User chose clean rebrand story. The CHANGELOG describes the platform, not the historical state of the world. |
| **Q3**: Platform brand name | **Repository Structure Platform (RSP)** | Noun-change, not brand-anchored. RSP is a memorable acronym. |

### Other decisions (made during brainstorming)

- **Q4** (user dismissed, I made the call): **Hard break, no aliases**. v0.15.0 ships with the new names; old `MEMORY_SCHEMA_VERSION` is gone. There are no known external consumers of the schema (slopbrick is the only writer; the website doesn't read it). Soft compat would just carry dead code.
- **Q5**: The "Outcome language" rule — keep "memory" only in phrases that mean "AI's persistent understanding." The user's own words: "BRICK gives AI persistent understanding of your repository" stays. "Every AI session starts by reading memory" becomes "Every AI session starts by reading structure." The verb changes; the noun changes; the meaning doesn't.
- **Q6**: The `slop-audit/` directory in slopbrick (legacy from the `slop-audit` v0.x tool that was renamed to `slopbrick`) is **out of scope**. The rebrand is "Repository Memory → Repository Structure", not "slop-audit → slop-structure". Renaming that directory is a separate refactor tracked in `docs/future-extractions.md`.

---

## Detailed Rename Map

### Concept renames (the noun change)

| Before | After |
|--------|-------|
| "Repository Memory Platform" | "Repository Structure Platform (RSP)" |
| "memory" (the noun, in most places) | "structure" |
| "memory.md" (the on-disk artifact) | "structure.md" |
| `MEMORY_SCHEMA_VERSION` (constant) | `STRUCTURE_SCHEMA_VERSION` |
| `MEMORY_SCHEMA_VERSION = '2'` (value) | `STRUCTURE_SCHEMA_VERSION = '3'` |
| "Memory" (in section headers like "The Memory Pipeline") | "Structure" |

### What to KEEP (per user's directive)

| Phrase | Why keep |
|--------|----------|
| "BRICK gives AI persistent understanding of your repository" | Outcome language, not positioning language |
| "Every AI session starts by understanding your repository's structure" | Already uses "structure"; correct |
| "structured" (as in "structured output") | Different word, unrelated |
| "unstructured" / "structured data" | Different word, unrelated |
| The `slop-audit/` directory name (legacy) | Separate refactor, out of scope |
| The verdict taxonomy (USEFUL/OK/NOISY/INVERTED/HYGIENE/DORMANT) | Not about positioning |
| Commit messages older than v0.15.0 that mention "memory" | Git history is immutable |

### File renames (commit-time, no runtime cost)

| Old path | New path | Reason |
|----------|----------|--------|
| `packages/core/src/memory.ts` | `packages/core/src/structure.ts` | API + import rename |
| `packages/core/src/memory-types.ts` | `packages/core/src/structure-types.ts` | API + import rename |
| `packages/core/schemas/v1/memory.schema.json` | `packages/core/schemas/v1/structure.schema.json` | Public schema path |
| `packages/slopbrick/src/engine/memory.ts` | `packages/slopbrick/src/engine/structure.ts` | Slopbrick-internal |
| `packages/slopbrick/src/engine/memory-md.ts` | `packages/slopbrick/src/engine/structure-md.ts` | Slopbrick-internal |
| `packages/slopbrick/src/mcp/slop-suggest-memory.ts` | `packages/slopbrick/src/mcp/slop-suggest-structure.ts` | MCP tool name (Q1: rename) |
| `packages/core/tests/memory.test.ts` | `packages/core/tests/structure.test.ts` | Test file |
| `packages/core/tests/memory-types.test.ts` | `packages/core/tests/structure-types.test.ts` | Test file |
| `packages/slopbrick/tests/engine/memory.test.ts` | `packages/slopbrick/tests/engine/structure.test.ts` | Test file |
| `packages/slopbrick/tests/engine/memory-md.test.ts` | `packages/slopbrick/tests/engine/structure-md.test.ts` | Test file |
| `packages/slopbrick/tests/engine/memory-artifacts.test.ts` | `packages/slopbrick/tests/engine/structure-artifacts.test.ts` | Test file |
| `packages/slopbrick/docs/repository-memory.md` | `packages/slopbrick/docs/repository-structure.md` | Doc file |

### Test/copy files that mention "memory" but are NOT renamed

These files mention "memory" in body text but are about other concerns; update the body text, don't rename the file.

- `packages/slopbrick/tests/engine/louvain.test.ts` (mentions memory.md as a side effect)
- `packages/slopbrick/tests/mcp/consolidation.test.ts` (memory.md references)
- `packages/slopbrick/tests/cli.test.ts` (scan output)
- `packages/slopbrick/CHANGELOG.md` — entries rewritten to "structure" terminology (Q2: rewrite)
- `packages/slopbrick/README.md` — sections rewritten
- `packages/slopbrick/AGENTS.md` — sections rewritten
- `packages/slopbrick/EXAMPLES.md` — examples rewritten (NOT historical preservation; the examples show current output)
- `packages/slopbrick/docs/launch-blog-post-v0.14.5d.md` — REWRITTEN (Q2: clean story); the launch was for v0.14.5 which shipped with "Repository Memory" terminology, so the rewrite replaces that with the new terminology. Note: this is a documentation-only change; the npm artifact at v0.14.5 is unchanged.
- `packages/slopbrick/docs/website-copy-v0.14.5d.md` — REWRITTEN
- `packages/website/src/components/Hero.astro` — Hero text rewritten
- `packages/website/src/components/Compare.astro` — Compare section rewritten
- `packages/website/src/components/Tools.astro` — Tool descriptions rewritten
- `packages/website/src/components/CTASection.astro` — CTA rewritten
- `packages/website/src/components/Footer.astro` — Footer rewritten
- `packages/website/src/layouts/Base.astro` — Title + meta tags rewritten
- `packages/website/src/data/version.json` — Description may need a tweak (manual review)

### Type/symbol renames (breaking API)

| Before | After | File |
|--------|-------|------|
| `loadMemory()` | `loadStructure()` | `core/src/structure.ts` |
| `saveMemory()` | `saveStructure()` | `core/src/structure.ts` |
| `MemoryFile` (type) | `StructureFile` | `core/src/structure-types.ts` |
| `MemoryCategory` | `StructureCategory` | `core/src/structure-types.ts` |
| `MemoryPattern` | `StructurePattern` | `core/src/structure-types.ts` |
| `ComponentFingerprint` (unchanged — already structure-flavored) | (no change) | — |
| `flywheelExport.memory` (field) | `flywheelExport.structure` | `slopbrick/src/types.ts` |
| `inventoryType` = `'memory'` (literal, if any) | `'structure'` | search-and-replace |

**Self-correction during review**: Verified that the actual flywheel type is `ResearchMetrics` (a separate type referenced by the `research?` field on the scan result), not `flywheel.memory`. The `flywheel` is a directory on disk (`.slop-audit/flywheel/`), not a type field. **Action**: in Phase 0 task R.9, the `research` field's JSDoc and any string references to "memory" get updated to "structure", but the field name itself stays `research` (it's already agnostic). The `flywheelExport` interface doesn't have a `.memory` field — that was a spec error on my part. **Final**: drop the `flywheelExport.memory` row from this table; the only "memory"-named artifact is the file `memory.md` itself, which R.5 renames.

### Positioning copy (user-visible)

| Location | Before | After |
|----------|--------|-------|
| usebrick.dev `<title>` | "usebrick.dev — repository memory for your code" | "usebrick.dev — repository structure for your code" |
| Hero `<h1>` | "A <em>repository memory</em> for your code" | "A <em>repository structure</em> for your code" |
| Hero subtitle | "...self-aware codebase..." | (kept — outcome language) |
| Footer copyright | "© usebrick — repository memory, one codebase at a time" | "© usebrick — repository structure, one codebase at a time" |
| OG meta description | "A four-tool platform that turns an LLM-augmented codebase into a self-aware codebase." | "A four-tool platform that continuously models and governs your repository's structure." |
| README.md lead | "Monorepo for the [usebrick.dev](https://usebrick.dev) platform." | (unchanged) |
| README.md "Why one monorepo" | "Repository Memory Platform schema" | "Repository Structure Platform schema" |
| README.md Packages table | 0 mentions of "Memory" | rewrite "Memory" → "Structure" in any package description |
| AGENTS.md lead table | "packages/core/ — Repository Memory Platform spec" | "packages/core/ — Repository Structure Platform spec" |
| CHANGELOG.md (v0.14.5 entry) | "Repository Memory pipeline + LockBrick prevention commands" | "Repository Structure pipeline + LockBrick prevention commands" |

### The 4 product names (UNCHANGED per user's directive)

- **PickBrick** — defines the intended structure (the constitution)
- **SlopBrick** — discovers the actual structure (the scanner)
- **MendBrick** — repairs the structure (the migrator)
- **LockBrick** — prevents structural drift (the enforcer, future)

### The 5 schemas (UNCHANGED semantics, just renamed)

| Before | After |
|--------|-------|
| `constitution.schema.json` (desired structure) | unchanged file name (the noun is already right) |
| `inventory.schema.json` (observed structure) | unchanged file name |
| `health.schema.json` (quality of structure) | unchanged file name |
| `memory.schema.json` (the agent-readable summary) | **`structure.schema.json`** |
| (none) | `drift.schema.json` (new — the difference between desired and observed) |

Wait — that's a scope expansion. The drift schema is a NEW artifact, not a rename. Let me defer it: **drift is a future extraction** (already noted in `docs/future-extractions.md` as `packages/contracts/`). The rebrand is just renaming what exists, not creating new schemas.

### The flywheel concept (UNCHANGED)

The flywheel (calibration → rules → flywheel) is unchanged. Only the `flywheel.memory` field in the export type renames to `flywheel.structure`.

### The MCP server (BREAKING — Q1 decision)

- Old: `slopbrick/src/mcp/slop-suggest-memory.ts` exports MCP tool `slop_suggest_memory`
- New: `slopbrick/src/mcp/slop-suggest-structure.ts` exports MCP tool `slop_suggest_structure`
- Any MCP client calling the old name will fail. The user accepts this.

---

## The Engine/UI Taxonomy Split (added 2026-06-26)

The user's deepest design insight: **"Calibration categories are for the engine. Health categories are for the user."** The engine's internal taxonomy (used for calibration, LR math, rule management) and the user-facing taxonomy (used for the report, the website, the schema) **should not be identical.** This is a deliberate seam, not an oversight.

### Engine taxonomy (internal — unchanged)

The 6 verdicts stay. They describe statistical behavior of rules against the corpus. The engine uses them to compute LRs, decide what's `defaultOff`, and emit `signal-strength.json`.

```
USEFUL   — high precision + high lift
OK       — moderate signal
NOISY    — fires on both classes
INVERTED — fires MORE on negative class
HYGIENE  — non-AI quality check
DORMANT  — never fires
```

### Presentation taxonomy (user-facing — new)

The report should answer: **"What should I do?"** Not "How was this rule calibrated?" So the user sees 3 buckets, not 6.

```
┌─ AI Findings ────────────────┐
│ ✓ 11 Useful                  │
│ ✓ 2 OK                       │
└───────────────────────────────┘
┌─ Engineering Hygiene ────────┐
│ ✓ 6 Issues                   │
└───────────────────────────────┘
┌─ Suppressed ─────────────────┐
│ ✓ 1 Noisy                   │
└───────────────────────────────┘
```

The mapping is:

| Engine verdict | User bucket | Why |
|----------------|-------------|-----|
| USEFUL | AI Findings | High-precision AI detection |
| OK | AI Findings | Moderate AI signal |
| HYGIENE | Engineering Hygiene | Non-AI code quality check |
| INVERTED | Engineering Hygiene | Non-AI code quality check (same action as HYGIENE for the user; engine still distinguishes for LR math) |
| NOISY | Suppressed | Fires on both classes — suppressed from slopIndex |
| DORMANT | Suppressed | Never fires — hidden |

**Decision recorded (Q1')**: The user explicitly said "INVERTED is basically HYGIENE" — they see these as the same kind of thing from an action perspective. The engine still distinguishes (INVERTED rules have LR < 1 and invert the Bayesian posterior; HYGIENE rules have LR ≈ 1 and are neutral), but the user bucket merges them. **Engineering Hygiene is the visible bucket for both.** NOISY and DORMANT stay hidden because they truly are engine noise (inconsistent or absent fires, with no useful action for the user).

**Verdict names are hidden from the user.** Developers don't care whether something is "USEFUL" or "OK" — they care about the rule's action ("Zombie State: Confidence High"). The rule name matters more than the calibration label.

### Multiple scores, not one Slop Score (NEW)

The v0.14.5 single-number "Slop Score" is replaced with 3 (or more) independent scores:

```
Repository Health
├── AI Quality       81/100   (USEFUL + OK only)
├── Engineering Hygiene  94/100   (HYGIENE only)
└── Security         100/100  (security/* rules regardless of verdict)
```

This is a critical separation. Two repositories:

```
Repository A:  AI 95  Hygiene 40
Repository B:  AI 40  Hygiene 95
```

These are very different problems. Repository A has excellent AI discipline but poor engineering cleanliness. Repository B has clean engineering practices but significant AI-induced architectural drift. **A single combined Slop Score would hide that distinction.**

The "Slop Score" name itself stays for the AI Quality dimension (it's the historical name and the user knows it), but it's now ONE of several scores, not THE score.

### Why hygiene doesn't affect the AI Slop Score

Concrete example: "My Slop Score went up because I forgot to remove a console.log." That's mixing two different concepts. The new taxonomy makes this impossible:

- AI Quality = computed from rules that detect AI-induced patterns (zombie state, ghost defensive, default React stack, etc.)
- Engineering Hygiene = computed from rules that detect non-AI code quality (console logs, missing FK indexes, hardcoded secrets — but security is its own dimension)
- Security = computed from security/* rules (regardless of verdict — a security issue is always a security issue)

### Implementation seam

The seam between engine and presentation is a new mapping function:

```ts
// packages/slopbrick/src/report/buckets.ts (new file)
export type Bucket = 'ai' | 'hygiene' | 'suppressed';

export function bucketForVerdict(verdict: Verdict): Bucket {
  switch (verdict) {
    case 'USEFUL':
    case 'OK':
      return 'ai';
    case 'HYGIENE':
    case 'INVERTED':
      return 'hygiene';
    case 'NOISY':
    case 'DORMANT':
      return 'suppressed';
  }
}
```

The mapping reflects the user's intent: "INVERTED is basically HYGIENE" from the action perspective. The engine's internal `verdict` is still preserved (so the Bayesian combiner can apply INVERTED's LR < 1 correctly), but the report groups them.

The HTML + Markdown + JSON reports all use `bucketForVerdict()` to group rules. The JSON consumers can read either the raw `verdict` (engine) or the derived `bucket` (UI).

### Schema impact

The v0.14.5 schema (`health.schema.json`) currently has a single `slopIndex` field. After the rebrand:

```json
{
  "version": "3",
  "aiQuality": 81,
  "engineeringHygiene": 94,
  "security": 100,
  "repositoryHealth": 91,  // weighted composite (configurable)
  "verdictDistribution": { ... },  // engine — for advanced consumers
  "bucketDistribution": { ... }    // UI — for default consumers
}
```

The `slopIndex` field is replaced by `aiQuality`. The `bucketDistribution` mirrors `verdictDistribution` but uses the 3-bucket taxonomy. **Breaking change** for any consumer that reads `slopIndex`; the migration path is to read `aiQuality` instead. (No alias per Q4 — hard break.)

### Scope impact

This is a **new sub-project** added to the merged refactor plan:

- **Phase 6 (NEW)**: Multi-dimensional health scoring
  - S.1  Add `bucketForVerdict()` function in `slopbrick/src/report/buckets.ts`
  - S.2  Update HTML report to show 3 buckets + 3 scores
  - S.3  Update Markdown report to match
  - S.4  Update JSON schema (`health.schema.json`) to expose `aiQuality` / `engineeringHygiene` / `security` / `repositoryHealth`
  - S.5  Update slopIndex → aiQuality everywhere
  - S.6  Update tests that assert on `slopIndex`
  - S.7  Update the website's "Slop Score" copy to "Repository Health" with the 3-component breakdown

~3 days of additional work. Total merged refactor + rebrand: **5-6 days** (was 1-2 days for refactor alone, then +1 for rebrand, now +1 more for the multi-score refactor).

### Why this scales

This architecture is the same pattern mature dev tools use:

- **Engine**: rich internal classifications, used for calibration, rule management, math
- **UI**: simple action-oriented view, hides calibration labels, shows scores per dimension
- **Schema**: exposes both, so advanced consumers (CI, dashboards) can use the engine view while default consumers (terminal, IDE) use the UI view

The seam is small (`bucketForVerdict()` + the `bucketDistribution` field) and the value is high: freedom to evolve the engine taxonomy (e.g. add a 7th verdict) without changing what users see.

---

## Sequencing — How This Merges with the Architectural Refactor

Per user directive: "do it with the architectural refactor spec."

The existing 28-task plan at `docs/superpowers/plans/2026-06-26-architectural-refactor.md` is restructured to:

```
Phase 0 (NEW — Rebrand, ~1 day, 12 tasks)
  R.1  Rename packages/core/src/memory.ts → structure.ts
  R.2  Rename packages/core/src/memory-types.ts → structure-types.ts
  R.3  Rename packages/core/schemas/v1/memory.schema.json → structure.schema.json
  R.4  Rename packages/slopbrick/src/engine/memory.ts → structure.ts
  R.5  Rename packages/slopbrick/src/engine/memory-md.ts → structure-md.ts
  R.6  Rename packages/slopbrick/src/mcp/slop-suggest-memory.ts → slop-suggest-structure.ts
  R.7  Rename test files (4 files in core/, 4 files in slopbrick)
  R.8  Update all import sites (grep for 'from .*memory' + 'from .*memory-types')
  R.9  Update type names (MemoryFile → StructureFile, etc.) + exports
  R.10 Bump MEMORY_SCHEMA_VERSION='2' → STRUCTURE_SCHEMA_VERSION='3'
  R.11 Bump slopbrick version 0.14.5 → 0.15.0
  R.12 Update CHANGELOG.md (add v0.15.0 entry, rewrite v0.14.5 to 'structure')

Phase 1 (P0, ship first, ~3 hours, 8 tasks — UNCHANGED)
  A.1-A.4  verdict type safety
  F.1-F.4  docs

Phase 2 (P1, ~5 hours, 12 tasks — UNCHANGED)
  D.1-D.8  web hardening
  C.1-C.4  schema codegen

Phase 3 (P1, big lift, ~5 hours, 8 tasks — UNCHANGED but with caveat)
  B.1-B.8  engine extraction
  CAVEAT: B.4 moves `memory.ts` to engine/src/structure.ts; this overlaps with R.4.
        R.4 must run FIRST so the file is already renamed when B.4 moves it.

Phase 4 (P2, polish, ~3 hours, 3 tasks — UNCHANGED)
  E.1, G.1, G.2  shader + LCP-swap

NEW Phase 5 (Rebrand-positioning copy, ~4 hours, 5 tasks)
  S.1  Update Hero.astro
  S.2  Update Compare.astro
  S.3  Update Tools.astro, CTASection.astro, Footer.astro
  S.4  Update Base.astro (title + meta tags)
  S.5  Update README.md, AGENTS.md, EXAMPLES.md, blog-post, website-copy docs
```

**Critical sequencing constraint**: R.1–R.9 (the type/file renames) MUST run BEFORE Phase 1 tasks A.1, A.2, A.3 (which import from the renamed files). Otherwise the architectural refactor's new files would import from `memory` paths and immediately need re-renaming.

**Recommended order**:
1. Phase 0 (Rebrand) — 1 day
2. Phase 1 (verdict type safety) — 3 hours
3. Phase 2 (web hardening + codegen) — 5 hours
4. Phase 3 (engine extraction) — 5 hours
5. Phase 4 (shader + LCP) — 3 hours
6. Phase 5 (positioning copy) — 4 hours

Total: ~4-5 days (was 1-2 days for the architectural refactor alone; the rebrand adds ~1 day of mechanical work + the version bump + CHANGELOG).

---

## Risk Register

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| Some consumer reads `MEMORY_SCHEMA_VERSION` and breaks | Low | High | Slopbrick is the only consumer; it's version-bumped in this same release |
| Some file path is hardcoded somewhere we missed | Medium | Low | Phase 0 has a `git grep -r "memory" packages/` step that must return zero results before Phase 1 starts |
| The 14-day-old npm-published `slopbrick@0.14.5` has consumers who don't migrate | Low | Medium | v0.15.0 README has a clear "This is a breaking change" note; consumers see it on next `npm install` |
| The `flywheel.memory` field is part of a public API | Low | High | Q1: breaking change accepted. The `flywheel.structure` field is the new name. |
| The website copy rewrites lose meaning (e.g. "memory" was load-bearing in some specific phrase) | Low | Low | Phase 5 has a "review the rewrite side-by-side" step |
| The test files for `louvain.test.ts`, `consolidation.test.ts`, `cli.test.ts` have deep `memory` references that take time to fix | Medium | Low | R.7 is dedicated to test renames; the others get a body-text update in their own task |

---

## Acceptance Criteria for the Whole Rebrand

When all phases ship:
- `git grep -i "memory" packages/` returns zero results (except in 5 explicitly-approved files: `CHANGELOG.md` for v0.14.5 historical mention, the old `slop-audit/` directory name, the `slop-audit` history in `docs/old-repo-redirect.md`, and the verdict taxonomy if any HYGIENE rules happen to mention "memory" in their descriptions).
- All `import` statements across the monorepo reference `structure` paths, not `memory` paths.
- The website tagline, Hero, Compare, CTA, Footer all say "repository structure" (no "memory" in any visible string).
- `MEMORY_SCHEMA_VERSION` is gone; `STRUCTURE_SCHEMA_VERSION = '3'` is in its place.
- The slopbrick version is 0.15.0; the npm artifact is published.
- The `flywheelExport` type's `memory` field is renamed to `structure` (self-corrected: the field doesn't exist; the file `memory.md` is the only "memory"-named artifact that gets renamed).
- The 4 product names (PickBrick, SlopBrick, MendBrick, LockBrick) are unchanged.
- The 4 schema names (`constitution`, `inventory`, `health`, `structure`) are unchanged in semantics, renamed in the `memory` case.
- The MCP tool name is `slop_suggest_structure` (renamed per Q1).

---

## Open Questions Resolved

All 6 open questions answered:

1. **Scope**: All 3 sub-projects (X copy, Y schemas, Z consumers) — full rebrand.
2. **Timing**: Merged with the architectural refactor spec, runs as Phase 0 of the 28-task plan.
3. **Backwards compat**: Hard break, no aliases. Version 0.15.0 with a clear "breaking change" note in README.
4. **MCP tool name**: Renamed (per Q1).
5. **CHANGELOG**: Rewritten (per Q2).
6. **Platform brand name**: Repository Structure Platform (RSP) (per Q3).

No remaining open questions for the user.

---

## Implementation Order (per Phase 0 + merged refactor)

```
Day 1: Phase 0 (Rebrand) — 12 tasks, ~1 day
Day 2: Phase 1 (verdict type safety) + Phase 2 (web hardening + codegen) — 13 hours
Day 3: Phase 3 (engine extraction) + Phase 4 (shader + LCP) — 8 hours
Day 4: Phase 5 (positioning copy) — 4 hours
Day 5: Final verification (git grep, full test suite, build, publish)
```

5 days total. PR breakdown: one PR per phase (5 PRs to v0.14.5d).
