# v9 plan — UPDATED 2026-07-02 (slower cadence)

**Status:** supersedes the original v9-plan.md (2026-07-01).
**Reason for update:** v0.20.0 and v0.21.0/.1/.2 shipped between
the original plan's authoring and the first calibration pass.

**2026-07-02 update: cadence revised per user request** — original
plan called for 5 releases (v0.23–v0.27). The user wants fewer
version bumps. Revised plan: **3 releases over 6 months** instead
of 5. Each release is bigger; the work is batched. v0.23.0 just
shipped (dedup v2); the remaining milestones are bundled into
v0.24 (Sep 2026) and v0.25 (Mar 2027).

---

## Executive summary

**Shipped since the original plan:**
- ✅ **v0.20.0** (2026-07-01): 6 Java rules ship as DORMANT
- ✅ **v0.21.0** (2026-07-02): FLIP `aiSlopScore` semantics
- ✅ **v0.21.1** (2026-07-02): visitor bug fix + 873 FPs removed
- ✅ **v0.21.2** (2026-07-02): Java rules gated + whitespace off
- ✅ **v0.23.0** (just shipped, this session): dup/near-duplicate
  (Type-2 clone detector, MinHash + Jaccard, 118 rules total)

**What the v9 plan originally promised for v0.20 / v0.21:**
- ✅ dedup v2 (Type-2 clone): shipped in v0.23.0
- ❌ dedup v3 (Type-3 structural): still on the roadmap
- ❌ Kotlin + Swift + C++ rules: not started
- ❌ v9 corpus build: not started

---

## Revised milestone sequence (slower cadence + proper semver)

The user wants:
1. **Fewer version bumps** (slower cadence — 3 minor releases over 6 months)
2. **Lower version increments within each minor** — use patch bumps
   (v0.23.1, v0.23.2) for fixes/calibration, not a new minor for
   every change. Standard semver.

Original v9 plan called for 5 releases (v0.23, v0.24, v0.25, v0.26,
v0.27) over 6 months. Revised to **3 minor releases** with **patch
releases** between them. The cadence is:

- **Minor bump** (v0.23.0 → v0.24.0 → v0.25.0) = new feature
  (breaking-ish behavior change, new rule, or new category)
- **Patch bump** (v0.23.0 → v0.23.1 → v0.23.2) = fix, calibration
  refinement, FP suppression, documentation

| Release | Bump type | Target date | Scope | Source |
|---------|-----------|-------------|-------|--------|
| **v0.23.0** | minor | **SHIPPED** | **dedup v2 (near-duplicate)** — Type-2 clone detector (MinHash + Jaccard on k-gram tokens) | this session |
| **v0.23.1** | patch | (any time) | First calibration patch for `dup/near-duplicate` once v9 corpus arm is available | ongoing |
| **v0.23.x** | patch | (incremental) | Continued calibration: FPs removed, threshold tuned, near-dup opt-in flag promoted to default-on if calibration confirms | ongoing |
| **v0.24.0** | minor | **Sep 2026** | **v9 Java arm + Java rule calibration + telemetry opt-in** — fetch Spring/Apache/JDK/Hibernate/Guava/Elasticsearch/Kafka, run calibration on the 6 DORMANT Java rules, ship `slopbrick scan --telemetry=opt-in` for adoption signal | v9 plan Part 2 |
| **v0.24.1** | patch | (any time) | Java calibration refinements: rule-specific threshold tunes, FP suppressions, ai/*-style rule lifts | ongoing |
| **v0.25.0** | minor | **Mar 2027** | **Kotlin + Swift + C++ calibration + dup v3 + methodology paper** — write Kotlin/Swift/C++ rules, fetch the mobile + C++ arms, ship dup/structural-clone (Type-3), publish methodology paper to arXiv | v9 plan Part 4+5+6 |

**Rationale:** batch new features into minor releases. Within a
minor, use patch bumps for fixes and calibration refinements.
This matches npm semver conventions and gives users a clear
"breaking change or new feature" signal at minor bumps.

**Example of the new cadence:**

```
v0.23.0   dedup v2 ships (new rule)
v0.23.1   threshold tuned to 0.65 after first 100-file self-scan
v0.23.2   near-dup promoted from defaultOff to default-on after v9 calibration
v0.23.3   FP suppression for the rule's most common false positive
v0.24.0   v9 Java arm + Java calibration + telemetry (new feature)
v0.24.1   Java rule-specific threshold tune
v0.24.2   more Java calibration refinement
v0.25.0   Kotlin/Swift/C++ + dup v3 + methodology paper
v0.25.1   Kotlin/Swift/C++ calibration refinements
```

**Trade-off:** more releases total (8-10 in 6 months instead of
3-5), but each is small, focused, and easily reversible if
something regresses. Patches don't carry breaking-change risk;
the user can safely upgrade `^0.23.0` → `^0.23.x`.

---

## Part 1 — v1 → v8.5 calibration review: status

The original plan's 4 systemic patterns and 8 product gaps are
mostly unchanged. Updates:

**Pattern 1 (small samples produce wrong verdicts) — RESOLVED in v0.19.**

**Pattern 2 (DORMANT bucket shrinkage is monotonic) — STANDS.**
The 18 DORMANT-but-defined rules from v8.5 + 6 new Java DORMANT
rules = 24 total. Awaiting v9 calibration.

**Pattern 3 (NOISY rules are stable) — STANDS.**
0 INVERTED rules remaining (expired-code-example removed in v0.20).

**Pattern 4 (AI-specific rules dominate USEFUL) — STANDS.**
60 of 72 USEFUL rules remain `aiSpecific: true`.

**Gap 1 (Java / Kotlin / Swift / C++ missing) — PARTIALLY RESOLVED.**
Java rules shipped in v0.20 (DORMANT). Kotlin / Swift / C++ ship
in v0.25.

**Gap 2 (first full clone taxonomy) — PARTIALLY RESOLVED.**
Type-1 (v0.19), Type-2 (v0.23 just shipped), Type-3 (v0.25).

**Gap 3 (24 DORMANT rules) — STANDS.**

**Gap 4 (per-rule website pages) — UNCHANGED.**

**Gap 5 (chronic-offender test files) — PARTIALLY RESOLVED.**
R9 refactor in v0.20. `test/weak-assertion` 5258 → 1248 fires.

**Gap 6 (4-score model has 2 placeholders) — RESOLVED in v0.21.0.**

**Gap 7 (marketing copy ahead of implementation) — RESOLVED.**

**Gap 8 (methodology paper unpublished) — UNCHANGED.**
Ships with v0.25 (arXiv submission bundled).

---

## Part 2 — v9 corpus build (revised, batched into v0.24 + v0.25)

### v0.24: Java arm only

| Arm | Target files | Status |
|-----|------:|--------|
| **Java neg** | 30k | 8 repos: Spring, Commons, JDK, Hibernate, Guava, Elasticsearch, Guice, Kafka |
| **Java pos** | 25k | 6 repos: Spring AI, LangChain4j, Spring Initializr, Quarkus AI, OpenAI Java SDK, jhipster |

Manifest template: `docs/research/v9-corpus-manifest.template.json`
Build script: `scripts/build-v9-corpus.ts` (already committed)
Per-language calibration: 6 DORMANT Java rules become USEFUL on v9.

### v0.25: Kotlin + Swift + C++ arms

| Arm | Target files | Status |
|-----|------:|--------|
| **Kotlin** | 12k neg + 8k pos | 5 new Kotlin rules |
| **Swift** | 12k neg + 8k pos | 5 new Swift rules |
| **C++** | 15k neg + 10k pos | 5-7 new C++ rules |

### Per-release rule count projection (revised)

| Release | New rules | Total cumulative |
|---------|----------:|-----------------:|
| v0.23.0 (shipped) | 1 | 118 |
| v0.24.0 (Sep 2026) | 0-6 (Java calibration) | 118-124 |
| v0.25.0 (Mar 2027) | 21+ (Kotlin + Swift + C++ + dup v3 + re-calibrated) | 139-145 |

---

## Part 3 — Quality gates (per release)

For v0.24, v0.25:
- `pnpm -r typecheck` → 0 errors
- `pnpm --filter slopbrick test` → 0 failures (target: 800+ tests by v0.25)
- `pnpm --filter slopbrick build` → exit 0
- `slopbrick scan --workspace .` on the slopbrick repo → security >= 80, repositoryHealth >= 70
- For dedup rules: cross-project dedup validation
- For v9 corpus releases: v9.5 calibration report

---

## Part 4 — Open questions for user

1. **v0.23 dedup v2 — opt-in or default-on?** Currently DORMANT. **Recommendation: opt-in initially, default-on in v0.25 calibration if P >= 0.6.**
2. **v0.24 Java arm — fund the build?** 3-4 day effort. **Recommendation: yes, this is the critical-path work for v0.24.**
3. **Methodology paper (Gap 8) — submit to arXiv?** Ships with v0.25.
4. **Telemetry opt-in — ship in v0.24?** **Recommendation: yes, this is the only way to measure adoption signal.**
5. **The 1549 download spike — your private verification script?** Document in `docs/operations/post-publish-verification.md` if yes.

---

## Part 5 — Risks

- **Java ecosystem diversity** — per-ecosystem calibration
- **Near-dup performance** — opt-in
- **Mobile / C++ corpus size** — INSUFFICIENT_DATA if <10k files
- **C++ parse failures** — "C++ lite" mode if >5%
- **Structural clone FPs** — require >=3 functions with same canonical hash
- **Sample-size discipline** — 10k files / 10 fires floor

---

## Part 6 — Success criteria for v9 (revised for 3-release cadence)

1. **3 releases shipped** (v0.23 dedup v2 done, v0.24 Java + telemetry, v0.25 Kotlin/Swift/C++ + dup v3 + methodology paper)
2. **+10-20 USEFUL rules** in the registry
3. **3 new languages** fully supported
4. **Full clone taxonomy** shipped
5. **24 DORMANT rules** measured
6. **Methodology paper** published
7. **Self-audit scores** improved
8. **Zero new DORMANT rules** from v0.23-v0.25
9. **Telemetry opt-in** shipped (v0.24) to measure adoption

---

## Appendix A — Calibration history (v1 → v8.5) + v9 projections

| Version | Date | Corpus size | USEFUL | OK | NOISY | INVERTED | DORMANT |
|---------|------|-------------|-------:|---:|------:|---------:|--------:|
| v8.5 (shipped) | 2026-07-01 | 546k | 72 | 12 | 1 | 0 | 0 |
| v9.5 (planned) | 2027-03 | 666k | 82-92 | 14-18 | 1 | 0 | 0 |

---

## Appendix B — v0.21 self-scan impact (for the record)

958 FPs removed across 7 rule fixes in v0.21.1/2.

---

## Appendix C — Per-version rule count history (revised, 3 releases)

| Release | New rules | New categories | Total cumulative | Notes |
|---------|----------:|----------------|-----------------:|-------|
| v0.19.0 (shipped) | 5+3+1+4 | `ts/`, `go/`, `dup/` | 104 | |
| v0.20.0 (shipped) | 6 Java (DORMANT) | `java/` | 110 | |
| v0.21.0 (shipped) | 0 (FLIP + messages) | — | 110 | |
| v0.21.1 (shipped) | 0 (873 FPs removed) | — | 110 | |
| v0.21.2 (shipped) | 0 (Java gate + ws off) | — | 110 | |
| **v0.23.0 (shipped)** | **1** | **`dup/near-duplicate`** | **118** | **dedup v2** |
| **v0.24.0 (Sep 2026)** | 0-6 (Java calibration) | — | 118-124 | Java arm + telemetry |
| **v0.25.0 (Mar 2027)** | 21+ (Kotlin/Swift/C++/dup v3) | `kotlin/`, `swift/`, `cpp/`, `dup/structural-clone` | 139-145 | methodology paper |
