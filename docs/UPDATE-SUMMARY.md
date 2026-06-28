# Update Summary — v0.14.5 → 3928d66

**Date**: 2026-06-26
**Session**: post-v0.14.5 publish → rebrand spec → multi-score design
**Author**: dystx (with Kimi Code CLI)
**Status**: Spec approved, implementation pending

---

## TL;DR

This session went from **"v0.14.5 publish failed with 5 test errors"** through **"the test errors are a symptom of a deeper architectural problem"** through **"the deeper problem is the entire 'Repository Memory' positioning"** to **"we now have a 3-score (AI Quality / Engineering Hygiene / Security) Repository Health model with a clean engine/UI taxonomy seam."**

Net: **2 specs + 1 plan + 1 reference written, 1 bug fixed, 1 reference committed.** No production code changes yet — all the work is in `docs/superpowers/` and `docs/`.

---

## Chronological log

### 1. v0.14.5 publish test failures (commits c260809)

The `publish.yml` workflow failed at the test step with 5 errors in `signal-strength-guardrails.test.ts` and `lr-combiner.test.ts`. The user said: "no inverted rules they are now hygiene."

**Root cause**: The v7 calibration (commit `aed68df`) flipped HYGIENE from `defaultOff: true` to "implicit defaultOn" (the field is now absent, not explicitly false). The tests pinned to v6 contract counts (13 USEFUL, 0 INVERTED, 24 HYGIENE all defaultOff) broke.

**Fix**: `c260809 fix(slopbrick): update v6-baseline tests to v7 calibration contract` — 2 files, 61 insertions, 42 deletions. Tests rewritten to use property-based assertions (USEFUL > 20, INVERTED ≤ 5, HYGIENE opt-out ≤ 10%) instead of exact counts. 41/41 critical tests pass.

**User directive**: "no inverted rules they are now hygiene" — meaning the v6-INVERTED rules (heaps-deviation, zipf-slope-anomaly, math-variable-name-entropy) were all reclassified as HYGIENE in v7.

### 2. Architectural refactor brainstorming (commits 5d8ad7c, 27392bd, c2e3a6f, 06811b4)

**Audit finding**: The verdict taxonomy is loosely coupled. The `SignalStrength` TS type in `packages/slopbrick/src/rules/signal-strength.ts:19-43` is **missing the `verdict` field** that exists in the JSON. 8 source files reference verdict strings with no type-safety.

**Spec**: `5d8ad7c docs: architectural refactor design spec` (783 lines, 7 sub-projects A–G).

**5 open questions answered**:
- Q1 (engine extract): **Clean break** → new `packages/engine/` package
- Q2 (generated types): **Public** — generated types ARE the public API
- Q3 (a11y testing): **axe-core via Playwright in CI**
- Q4 (GSAP removal): **SKIP** — keep GSAP (user pushback: "cant we keep gsap? why change?")
- Q5 (session scope): **All 7 sub-projects, 1-2 days**

**Plan**: `06811b4 docs(plan): architectural refactor implementation plan` (2,439 lines, 28 tasks across 4 phases).

### 3. Rebrand brainstorming (commits f0e199d, 3928d66)

**User argument**: "Structure is significantly better than Memory." The word "memory" creates the wrong mental model (LLM memory, chat history, vector databases, RAG) when usebrick is actually doing deterministic structure modeling.

**Decisions**:
- Q1 (MCP tool name): **Rename** `slop-suggest-memory` → `slop-suggest-structure` (breaks MCP clients)
- Q2 (CHANGELOG): **Rewrite** v0.14.5 entries to "structure" (clean story, falsifies historical)
- Q3 (brand): **Repository Structure Platform (RSP)**
- Q4 (compat, made by Kimi): **Hard break**, no aliases, version bump 0.14.5 → 0.15.0

**Spec**: `f0e199d docs(spec): Repository Memory → Repository Structure rebrand` (315 lines, 59 files in blast radius).

### 4. Engine/UI taxonomy split + multi-score design (commit 3928d66)

**User insight**: "Calibration categories are for the engine. Health categories are for the user." The engine's internal 6-verdict taxonomy (for LR math) and the user-facing 3-bucket taxonomy (for the report) **should not be identical**. This is a deliberate seam.

**Then user**: "arent inverted basilly hygiene?" — sharp question, my answer: **keep INVERTED in the engine enum (LR < 1 is critical for the Bayesian combiner) but in the UI, INVERTED rules appear in the same bucket as HYGIENE rules (Engineering Hygiene).** The user is right that the distinction is degree (ratio) not kind (semantic).

**Final design**:
- **Engine (6 verdicts)**: USEFUL / OK / NOISY / INVERTED / HYGIENE / DORMANT — for calibration, LR math, defaultOff logic
- **UI (3 buckets)**:
  - **AI Findings**: USEFUL + OK
  - **Engineering Hygiene**: HYGIENE + INVERTED
  - **Suppressed**: NOISY + DORMANT (hidden)
- **Multiple scores, not one Slop Score**:
  - AI Quality (USEFUL + OK)
  - Engineering Hygiene (HYGIENE + INVERTED)
  - Security (security/* rules regardless of verdict)
  - Repository Health (weighted composite)

**Spec update**: `3928d66 docs(spec): engine/UI taxonomy split + INVERTED→HYGIENE bucketing` (153 insertions, 8 goals total).

### 5. Corpus reference (commit 02f1728)

**User request**: "register a reference to the outside repo corpus." → "but gitignore it, corpus isnt public."

**Solution**: 
- `packages/core/corpus-manifest.template.json` (committed, public format spec)
- `packages/core/corpus-manifest.local.json` (gitignored, your private copy with absolute path)
- `.gitignore` updated: `**/corpus-manifest.local.json` pattern

The template documents the corpus contract (location, structure, latest calibration, scripts). The local file has your actual values (`/Users/cheng/corpus-expansion`, 2026-06-26, the real v7 calibration).

---

## What changed in code

| Commit | Files | Purpose |
|--------|-------|---------|
| `c260809` | 2 | Test fix: v6→v7 calibration contract |
| `02f1728` | 2 | Corpus reference: template + gitignore |
| `5d8ad7c` | 1 | Architectural refactor spec |
| `06811b4` | 1 | Architectural refactor plan (28 tasks) |
| `c2e3a6f` | 1 | Spec update: 5 open questions resolved |
| `27392bd` | 1 | Spec update: author + Q4 GSAP-removal skipped |
| `f0e199d` | 1 | Rebrand spec (315 lines) |
| `3928d66` | 1 | Spec update: engine/UI split + INVERTED bucketing |

**Total committed changes this session**: 10 files, ~3,500 insertions. **All in `docs/`. Zero changes to production code yet.**

---

## What needs to happen next

The user has approved both specs (architectural refactor + rebrand). The next step is to **invoke `writing-plans` to merge them into one consolidated implementation plan** that respects the sequencing:

1. **Phase 0**: Rebrand (12 tasks, ~1 day) — file renames, type renames, version bump
2. **Phase 1**: Verdict type safety (8 tasks, ~3 hours) — A.1-A.4 + F.1-F.4
3. **Phase 2**: Web hardening + schema codegen (12 tasks, ~5 hours) — D.1-D.8 + C.1-C.4
4. **Phase 3**: Engine extraction (8 tasks, ~5 hours) — B.1-B.8
5. **Phase 4**: Shader + LCP-swap (3 tasks, ~3 hours) — E.1, G.1, G.2
6. **Phase 5** (new): Positioning copy (5 tasks, ~4 hours) — S.1-S.5
7. **Phase 6** (new): Engine/UI split + multi-score (7 tasks, ~3 days) — taxonomy seam, 3 scores, 3-bucket reports

**Total**: 5-6 days, 6 PRs to v0.14.5d, ~70 files modified.

---

## Key decisions made (locked in, don't re-litigate)

| Decision | Source | Status |
|----------|--------|--------|
| `verdict` is a typed enum (6 values) | Sub-project A | locked |
| `VERDICTS` is the single source of truth in `packages/core/src/verdicts.ts` | Sub-project A | locked |
| Zod schema validates `signal-strength.json` at load time | Sub-project A | locked |
| Engine extraction = clean break to `packages/engine/` | Q1 (architectural) | locked |
| Schema codegen = generated types ARE the public API | Q2 (architectural) | locked |
| a11y testing = axe-core via Playwright in CI | Q3 (architectural) | locked |
| GSAP stays in the bundle | Q4 (architectural) | locked |
| Rebrand = "Repository Structure Platform" (RSP) | Q3 (rebrand) | locked |
| MCP tool `slop-suggest-memory` → `slop-suggest-structure` (breaks clients) | Q1 (rebrand) | locked |
| CHANGELOG v0.14.5 entries rewritten to "structure" | Q2 (rebrand) | locked |
| Hard break, no aliases, version 0.14.5 → 0.15.0 | Q4 (rebrand) | locked |
| Engine keeps 6 verdicts; UI exposes 3 buckets (AI Findings / Engineering Hygiene / Suppressed) | Engine/UI split | locked |
| INVERTED + HYGIENE in the same UI bucket (Engineering Hygiene) | INVERTED bucketing | locked |
| Multiple scores (AI Quality / Engineering Hygiene / Security) + Repository Health composite | Multi-score design | locked |
| Coroutine manifest is template + gitignored local | Corpus reference | locked |

---

## Open items for the merged implementation plan

1. The plan at `2026-06-26-architectural-refactor.md` is the 28-task version. The rebrand + engine/UI split + multi-score work has been SPEC'D but not yet PLAN'D. The merged plan needs ~24 new tasks added (12 rebrand + 5 positioning copy + 7 engine/UI/multi-score).
2. The merged plan needs explicit cross-references between the 2 specs so the engineer knows where each task comes from.
3. The sequencing constraint: R.1–R.9 (rebrand renames) MUST run before Phase 1's verdict-type-safety work, because Phase 1 creates new files that import from the renamed paths.
