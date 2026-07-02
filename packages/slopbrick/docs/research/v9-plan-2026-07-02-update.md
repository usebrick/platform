# v9 plan — UPDATED 2026-07-02

**Status:** supersedes the original v9-plan.md (2026-07-01).
**Reason for update:** v0.20.0 and v0.21.0/.1/.2 shipped between the
original plan's authoring and the first calibration pass. The
shipped work has shifted several of the v0.20 / v0.21 milestones
forward; what's left is dedup v2/v3, Kotlin + Swift + C++ rules,
and the v9 corpus build itself.

---

## Executive summary

**Shipped since the original plan:**
- ✅ **v0.20.0** (2026-07-01): 6 Java rules ship as DORMANT
  (`java/system-out-println`, `java/legacy-date-api`, `java/raw-type-overuse`,
  `java/empty-catch-block`, `java/arraylist-vs-linkedlist`, `java/string-concat-loop`).
  Plus R-INVERTED removal + R9 chronic-offender refactor.
- ✅ **v0.21.0** (2026-07-02): FLIP `aiSlopScore` semantics
  (0=clean, 100=saturated), 16 rule `defaultOff` calibration pass,
  descriptive score messages.
- ✅ **v0.21.1** (2026-07-02): visitor bug fix for `import type { X }`,
  `dead/unused-local` scope tracking, dup WINDOW_SIZE 10→20,
  inline `import type` splits, errors-near-eof defaultOff.
  **873 self-scan FPs removed.**
- ✅ **v0.21.2** (2026-07-02): Java rules gated to `.java` files
  (-57 FPs), `ai/whitespace-regularity` defaultOff (P<0.6 floor),
  `dup/identical-block` calibration note (DORMANT-by-methodology).

**What the v9 plan originally promised for v0.20 / v0.21:**
- ❌ **dedup v2** (near-duplicate): not shipped. Still on the roadmap.
- ❌ **dedup v3** (structural): not shipped. Still on the roadmap.
- ❌ **Kotlin + Swift rules**: not started. No v9 mobile arm yet.
- ❌ **C++ rules**: not started. No v9 C++ arm yet.
- ❌ **v9 corpus build**: not started. All 4 new language arms
  need repos selected + fetched + scanned.

---

## Revised milestone sequence

The original v9 plan called for 3 releases (v0.20 / v0.21 / v0.22).
Those are shipped. What's next:

| Release | Scope | Source |
|---------|-------|--------|
| **v0.23.0** | **dedup v2 (near-duplicate)** — Type-2 clone detection via token shingling + MinHash + LSH banding. No corpus needed; the rule is deterministic and self-calibrates via the existing v8.5 corpus. | v9 plan Part 3, deferred |
| **v0.24.0** | **v9 corpus Java arm + Java rule calibration** — fetch Spring, Apache Commons, JDK, Hibernate, etc. (30k neg + 25k pos per the original plan). Run calibration on the 6 DORMANT Java rules. Promote USEFUL ones to default-on. | v9 plan Part 2, deferred |
| **v0.25.0** | **Kotlin + Swift rules + v9 mobile arm** — write 5 Kotlin + 5 Swift rules; fetch the mobile arm; calibrate. | v9 plan Part 4, deferred |
| **v0.26.0** | **C++ rules + v9 C++ arm** — write 5-7 C++ rules; fetch the C++ arm; calibrate. | v9 plan Part 5, deferred |
| **v0.27.0** | **dedup v3 (structural) + final v9.5 calibration** — AST sub-tree isomorphism. Per-project dedup cache (the methodology fix that makes dup/identical-block measurable). Re-measure all rules on the combined v7+v8+v9 corpus. | v9 plan Part 2, deferred |

**Rationale for the revised sequence:** dedup v2 ships first because
it needs no corpus. v9 corpus Java arm is second because Java rules
already exist (DORMANT) and the v9 corpus unblocks the calibration
that promotes them. Kotlin/Swift/C++ come after, in parallel arms.
dedup v3 + final calibration is the last step because it requires
the full v9 corpus (all 4 arms) to be useful.

---

## Part 1 — v1 → v8.5 calibration review: status

The original plan's 4 systemic patterns and 8 product gaps are
mostly unchanged. Updates:

**Pattern 1 (small samples produce wrong verdicts) — RESOLVED in v0.19.**
The 1k vs 546k reversal is documented in the methodology paper.

**Pattern 2 (DORMANT bucket shrinkage is monotonic) — STANDS.**
The 18 DORMANT-but-defined rules from v8.5 are still mostly
DORMANT. The 6 Java rules shipped in v0.20 are now DORMANT-by-
design (waiting for v9 Java arm calibration). The 12 other DORMANT
rules are awaiting the appropriate corpus arms.

**Pattern 3 (NOISY rules are stable) — STANDS.**
The 1 remaining INVERTED (`docs/expired-code-example`) was removed
in v0.20. The registry now has 0 INVERTED.

**Pattern 4 (AI-specific rules dominate USEFUL) — STANDS.**
60 of 72 USEFUL rules remain `aiSpecific: true` after v0.21.x.
The v0.21.1 visitor fix + scope tracking removed 43 more FPs
without losing any USEFUL rule.

**Gap 1 (Java / Kotlin / Swift / C++ missing) — PARTIALLY RESOLVED.**
Java rules shipped in v0.20 (DORMANT). Kotlin / Swift / C++ not
started. 3 of 4 languages still missing.

**Gap 2 (first full clone taxonomy) — PARTIALLY RESOLVED.**
`dup/identical-block` (Type-1) shipped in v0.19. dedup v2 / v3
not started.

**Gap 3 (18 DORMANT rules) — STANDS.**
The 18 are unchanged. The 6 new Java rules added in v0.20 are
now also DORMANT (24 total).

**Gap 4 (per-rule website pages) — UNCHANGED.**
Still no per-rule MDX pages on usebrick.dev.

**Gap 5 (chronic-offender test files) — PARTIALLY RESOLVED.**
R9 chronic-offender refactor in v0.20.0 fixed the worst 2
duplications. The 8 original test files now have fewer issues
(`test/weak-assertion` went from 5258 → 1248 fires after
v0.21.0 calibration).

**Gap 6 (4-score model has 2 placeholders) — RESOLVED in v0.21.0.**
`engineeringHygiene` and `repositoryHealth` are now properly
distinct from `aiSlopScore`. v0.21.0 FLIP fixed the direction.
The composite correctly inverts at the call site.

**Gap 7 (marketing copy ahead of implementation) — RESOLVED.**
The 4 scores are now fully implemented AND the marketing copy
(README, website) reflects the implementation as of v0.21.0.

**Gap 8 (methodology paper unpublished) — UNCHANGED.**
Still in `docs/research/methodology-minimum-sample-size.md`,
not yet on the website or submitted to a venue.

---

## Part 2 — v9 corpus build (revised)

### Per-arm status

| Arm | Original plan (neg + pos) | Current status | Blocker |
|-----|---------------------------|----------------|---------|
| **Java** | 30k neg + 25k pos | **Not started** | Repo selection + fetch (~3-4 days work) |
| **Kotlin** | 12k neg + 8k pos | **Not started** | Same as Java |
| **Swift** | 12k neg + 8k pos | **Not started** | Same |
| **C++** | 15k neg + 10k pos | **Not started** | Same + tree-sitter-cpp integration |

**Total v9 contribution:** 69k neg + 51k pos = ~120k new source files.
**Combined v9.5 corpus (v8.5 + v9):** ~666k files.

### Java arm — concrete plan (v0.24.0)

**Neg sources** (30k files target):
- Spring Framework — `git clone --depth 1 --branch 5.3.x https://github.com/spring-projects/spring-framework`
- Apache Commons Lang — `https://github.com/apache/commons-lang`
- JDK 8 stdlib samples (pre-2018)
- Hibernate ORM (2020)
- Guava (2021)
- Elasticsearch (2020)
- Apache Kafka (2018-2019)

**Pos sources** (25k files target):
- Spring AI (2024-12+) — first major Java AI integration
- LangChain4j
- Spring Initializr generators
- Quarkus AI extensions
- OpenAI Java SDK
- jhipster (2024+)

**Cutoff date for pos:** 2024-12-17 (matches v9 plan).

### Per-release rule count projection (revised)

| Release | New rules | New categories | Total cumulative |
|---------|----------:|----------------|-----------------:|
| v0.21.2 (shipped 2026-07-02) | 0 | — | 95+ |
| v0.23.0 (dedup v2) | 1 | `dup/near-duplicate` | 96+ |
| v0.24.0 (Java calibration) | 0-6 (existing DORMANT, calibrated) | — | 96+ |
| v0.25.0 (Kotlin + Swift) | 10 | `kotlin/`, `swift/` | 106+ |
| v0.26.0 (C++) | 5-7 | `cpp/` | 113+ |
| v0.27.0 (dedup v3 + final) | 1 | `dup/structural-clone` | 114+ |

---

## Part 3 — Revised quality gates (per release)

For v0.23, v0.24, v0.25, v0.26, v0.27:
- `pnpm -r typecheck` → 0 errors
- `pnpm --filter slopbrick test` → 0 failures
- `pnpm --filter slopbrick build` → exit 0
- `slopbrick scan --workspace .` on the slopbrick repo (self-audit) → security >= 80, repositoryHealth >= 70
- For dedup rules: cross-project dedup validation (build a small fixture repo with known duplicates)
- For v9 corpus releases: v9.5 calibration report

---

## Part 4 — Open questions for user

1. **v0.23 dedup v2 — opt-in or default-on?** The original plan recommended opt-in. With v9.5 calibration, default-on if FPR < 2%. **Recommendation: opt-in for v0.23, default-on in v0.27 if the calibration says so.**

2. **v9 corpus Java arm — fund the build?** Multi-day work to select + fetch 30+ repos. **Recommendation: 3-4 day focused effort, then run calibration.**

3. **Methodology paper (Gap 8) — submit to arXiv?** The 1k vs 546k finding is publishable. **Recommendation: yes, arXiv first, then HN marketing.**

4. **Adoption signal — telemetry opt-in?** Without it, "is anyone using us?" is unanswerable. **Recommendation: add `slopbrick scan --telemetry=opt-in` in v0.23, distinct from CI tests by project hash.**

5. **The 1549 download spike (2026-06-30) — your private verification script?** If yes, document it in `docs/operations/post-publish-verification.md` so future maintainers know.

---

## Part 5 — Risks and open questions (carried from original plan)

- **Java ecosystem diversity**: same as original. Mitigation: per-language within Java calibration.
- **Near-dup performance**: 30-60s scan overhead. Same mitigation: make v2 opt-in in v0.23.
- **Mobile corpus size**: same. Mitigation: INSUFFICIENT_DATA if <10k files in arm.
- **C++ parse failures**: same. Mitigation: measure parse-failure rate; "C++ lite" mode if >5%.
- **Structural clone false positives**: same. Mitigation: require >=3 functions with same canonical hash.
- **Sample-size discipline**: same. v9.5 calibration enforces 10k files / 10 fires floor.

---

## Part 6 — Success criteria for v9

The v9 plan is successful if (revised):

1. **5 releases shipped** (v0.23 dedup v2, v0.24 Java calibration, v0.25 Kotlin+Swift, v0.26 C++, v0.27 dedup v3 + final).
2. **+10-20 USEFUL rules** in the registry (from 72 to 82-92), from Java calibration + Kotlin + Swift + C++ rule adds.
3. **3 new languages** fully supported (Kotlin, Swift, C++ — Java shipped in v0.20).
4. **Full clone taxonomy** shipped (Type-1 in v0.19, Type-2 in v0.23, Type-3 in v0.27).
5. **24 DORMANT rules** measured (6 Java + 18 original).
6. **Methodology paper** published (arXiv).
7. **Self-audit scores** improved: `security >= 80`, `repositoryHealth >= 70`.
8. **Zero new DORMANT rules** from v0.23-v0.27 (per the methodology invariant).
9. **Telemetry opt-in** shipped (v0.23) to measure adoption.

If all 9 are met, slopbrick is the broadest AI code fingerprint
tool in the category, with the most rigorous calibration methodology
and the only SAST-class tool with full clone taxonomy.

---

## Appendix A — Calibration history (v1 → v8.5) + v9 projections

See the original `v9-plan.md` Appendix A. The v9.5 row is updated:

| Version | Date | Corpus size | USEFUL | OK | NOISY | INVERTED | DORMANT |
|---------|------|-------------|-------:|---:|------:|---------:|--------:|
| v8.5 (shipped) | 2026-07-01 | 546k | 72 | 12 | 1 | 0 | 0 |
| v9.5 (planned) | 2026-12 | 666k | 82-92 | 14-18 | 1 | 0 | 0 |

The DORMANT count drops to 0 (24 DORMANT rules are all measured
on v9, all expected to land in USEFUL or OK).

---

## Appendix B — v0.21.1 self-scan impact (for the record)

Before v0.21.1: 1140 self-scan issues in src/ (full report).
After v0.21.2: 974 self-scan issues in src/ (-14.6%).

Per-rule delta:

| Rule | Before | After | Δ |
|------|-------:|------:|---:|
| `dead/unused-import` (type-only FPs) | 267 | 0 | **–267** |
| `dup/identical-block` | 575 | 149 | **–426** |
| `ai/errors-near-eof` | 109 | 0 (defaultOff) | **–109** |
| `dead/unused-local` (module-scope FPs) | 52 | 9 | **–43** |
| `ts/import-type-misuse` | 56 | 0 | **–56** |
| `java/legacy-date-api` (TS cross-lang) | 29 | 0 | **–29** |
| `java/raw-type-overuse` (TS cross-lang) | 28 | 0 | **–28** |
| **Total FPs removed** | | | **–958** |

`ai/whitespace-regularity` (P<0.6 floor) was marked defaultOff in
v0.21.2; its 18 src/ fires are now hidden from the user-visible
report.

---

## Appendix C — Per-version rule count history (revised)

| Release | New rules | New categories | Total cumulative | Notes |
|---------|----------:|----------------|-----------------:|-------|
| v0.19.0 (shipped) | 5 TS + 3 Go + 1 dup + 4 rust* | `ts/`, `go/`, `dup/` | 104 | |
| v0.20.0 (shipped) | 6 Java (DORMANT) | `java/` | 110 | |
| v0.21.0 (shipped) | 0 (calibration only) | — | 110 | FLIP + messages |
| v0.21.1 (shipped) | 0 (calibration only) | — | 110 | 873 FPs removed |
| v0.21.2 (shipped) | 0 (calibration only) | — | 110 | Java gate + ws-regularity off |
| **v0.23.0 (planned)** | 1 | `dup/near-duplicate` | 111 | dedup v2 |
| v0.24.0 (planned) | 0-6 (Java calibration) | — | 111-117 | v9 Java arm |
| v0.25.0 (planned) | 10 | `kotlin/`, `swift/` | 121-127 | v9 mobile arm |
| v0.26.0 (planned) | 5-7 | `cpp/` | 126-134 | v9 C++ arm |
| v0.27.0 (planned) | 1 + N (re-calibrated) | `dup/structural-clone` | 127-135 | v9.5 final |
