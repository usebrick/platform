# v9 plan: Multi-language expansion + dedup v2/v3 + ecosystem fixes

> **Historical planning snapshot.** It is not current strategy or execution
> authority. Use the platform [roadmap](../../../../ROADMAP.md) and [execution
> index](../../../../docs/execution/index.json).

**Historical status at authoring:** draft, 2026-07-01
**Author:** v0.19.x review session
**Scope:** v9 corpus (v9.5 calibration) + v0.20 / v0.21 / v0.22 releases + cross-cutting ecosystem fixes
**Window:** ~6 months (Jul 2026 – Dec 2026), 3 releases

---

## Executive summary

The v1 → v8.5 calibration history reveals **4 systemic patterns** and **8 product gaps**. The v9 plan addresses them via:

1. **Language expansion to 10 supported languages** (v0.20 Java, v0.21 Kotlin + Swift, v0.22 C++) with v9 corpus arms for each.
2. **The first full clone taxonomy** (dedup v1 in v0.19, v2 near-dup in v0.20, v3 structural in v0.21) — first SAST tool to ship all three.
3. **Calibration of the 18 DORMANT-but-defined rules** that have never fired (db/*, wcag/*, etc.) on the v9 corpus.
4. **Ecosystem fixes** (per-rule pages, chronic-offender cleanup, 4-score model, methodology paper publication) folded into the 3 releases.

The total estimate: **3 releases, ~3,000-4,000 new LOC, 4 new tree-sitter integrations, ~20 new rules, 1 new corpus arm per language, 2 new clone detection algorithms**.

---

## Part 1 — v1 → v8.5 calibration review: 4 systemic patterns + 8 product gaps

### 4 systemic patterns

**Pattern 1: Small samples produce wrong verdicts (the 1k vs 546k story)**

The v0.18.8 v8a measurement on 1,000 files produced **3 INVERTED + 1 NOISY + 1 DORMANT** for the 5 `dead/*` rules. The v0.18.9 v8.5 measurement on 546,258 files produced **2 USEFUL + 3 OK** for the same 5 rules. The reversal is total — the 1,000-file verdicts were systematically wrong.

**Implication for v9:** Every future calibration pass must enforce a **minimum sample size of 10,000 files per arm** AND **10 total fires per rule (TP+FP)**. Below that, the verdict is `INSUFFICIENT_DATA`, not USEFUL/OK/NOISY/INVERTED/DORMANT. The methodology paper (`docs/research/methodology-minimum-sample-size.md`) establishes this as a v0.19+ invariant.

**Pattern 2: DORMANT bucket shrinkage is monotonic**

| Version | USEFUL | OK | NOISY | INVERTED | DORMANT | Total rules |
|---|---:|---:|---:|---:|---:|---:|
| v4 (v4 corpus, ~2k files) | 18 | 7 | 9 | 11 | 1 | 44 |
| v5 (v5 corpus, ~30k files) | 32 | 6 | 5 | 1 | 32 | 80 |
| v7 (v7 corpus, ~423k files) | 32 | 6 | 5 | 1 | 32 | 95 |
| v8.5 (v7 + v8, ~546k files) | 72 | 12 | 1 | 1 | 0 | 86 |

Every corpus expansion moves rules from DORMANT to a verdict. The DORMANT bucket went from 32 → 0 between v7 and v8.5. The pattern: **more data = more rules have signal**.

**Implication for v9:** New rules ship as DORMANT, but the expectation is that they'll be measured on a future corpus. The 18 DORMANT-but-defined rules from v8.5 will be measured on v9. The 5 new TS rules + 3 new Go rules + dup/identical-block (added in v0.19) will also be measured on v9.

**Pattern 3: NOISY rules are stable across corpus versions**

The NOISY bucket has been small in every corpus version: v4 (9), v5 (5), v7 (5), v8.5 (1). Most NOISY rules are the same across versions. The exception in v8.5 was `logic/ks-distribution-shift` (44.1% FPR) — the worst-performing rule in the registry. **Removed in v0.19.**

**Implication for v9:** The 1 remaining INVERTED (`docs/expired-code-example`, 0 TP, 3 FP) is vacuous. Recommend reclassification as HYGIENE or removal in v0.20. New NOISY rules are unlikely; the calibration methodology has converged on USEFUL/OK/INVERTED.

**Pattern 4: AI-specific rules dominate USEFUL**

In v8.5, 60 of 72 USEFUL rules are `aiSpecific: true`. The 12 non-AI USEFUL rules are the trusted core: `security/fail-open-auth`, `visual/radius-scale-violation`, `component/shadcn-prop-mismatch`, `dead/unused-local`, `logic/ghost-defensive`, `wcag/focus-obscured`, and a few others. This is the right distribution — slopbrick is an AI fingerprint tool, and most USEFUL rules should detect AI.

**Implication for v9:** Continue prioritizing AI-specific rules. The 8 new TS/Go rules added in v0.19c/d are all `aiSpecific: true`. The dup rules are `aiSpecific: false` (duplication is a general code-quality issue, not AI-specific).

### 8 product gaps

**Gap 1: 6 supported languages, but the 4 most-requested are missing**

slopbrick currently supports 6 source languages: TS, TSX, JS, JSX, PY, GO, RS. The 4 most-requested additions (per industry trends, mobile growth, enterprise market):
- **Java** — the enterprise market. SonarQube, Snyk, Veracode all have strong Java support. slopbrick has 0 Java rules.
- **Kotlin** — Android + KMP. AI code generation in Android is the fastest-growing segment.
- **Swift** — iOS / macOS. Same growth story as Kotlin.
- **C++** — game dev, ML infra, embedded systems. Narrowest market but high-value.

**Gap 2: First full clone taxonomy doesn't exist**

slopbrick has zero duplication detection. v0.19 ships the first one (`dup/identical-block`). But Type-1 clone detection alone misses the most common AI pattern: code that's been refactored, renamed, or whitespace-normalized. The full taxonomy is:
- **Type-1 (identical):** byte-for-byte identical (after normalization). Shipped in v0.19.
- **Type-2 (near-duplicate):** token-similar (renames, whitespace changes). Plan: v0.20.
- **Type-3 (structural):** AST-isomorphic (different syntax, same structure). Plan: v0.21.

**Gap 3: 18 DORMANT-but-defined rules**

The v0.18.9 calibration revealed 18 rules that exist in `src/rules/` but never fired on the v8 corpus. Examples: `db/*` rules on a JS/TS/Rust corpus, `typo/*` and `wcag/*` rules on the same. The calibration script fix (sample-size guardrail) preserves these entries, but they remain unmeasured.

**Gap 4: Per-rule website pages are missing**

`find packages/website -name 'rule*.mdx'` returns nothing. Rules are only documented in `docs/rule-catalog.md`. Per-rule pages are SEO gold — every "X rule" search could land on a dedicated page. The v0.17.0 plan (R7) called this out; not done.

**Gap 5: Chronic-offender test files**

8 test files have been flagged for 5+ consecutive scans (per v0.17.0 self-audit). They're test files that have accumulated `weak-assertion`, `duplicate-setup`, and `naturalness-anomaly` issues. The tool has been nagging; the team hasn't refactored.

**Gap 6: 4-score model has 2 placeholders**

`engineeringHygiene` and `repositoryHealth` in `src/engine/metrics.ts:243-247` both alias `aiQuality` (per v0.16.0 audit). Users see 3 identical numbers out of 4. R3 (v0.16.0) was to fix this; partially done in v0.18.2 (compositeScore surfacing).

**Gap 7: The 4-score model in the marketing copy is ahead of the implementation**

The slopbrick website advertises 4 scores. Only AI Quality is fully computed. The other 3 are placeholders or partial implementations. This is a marketing-vs-engineering gap.

**Gap 8: Methodology paper is unpublished**

The 1k vs 546k story is a publishable finding. It establishes a sample-size rule for static analysis calibration that no other vendor documents. The paper exists as `docs/research/methodology-minimum-sample-size.md` (v0.19a) but is not yet published on the website or submitted to a venue.

---

## Part 2 — v9 corpus design

### v9 corpus arms

| Arm | Source | Files (est.) | Negative cutoff | Positive cutoff |
|---|---|---:|---|---|
| **Java neg** | Spring Framework (2019), Apache Commons (2018), JDK (pre-2018), Hibernate ORM (2020), Guava (2021), Elasticsearch (2020), Google Guice, Apache Kafka | 30,000 | 2018-01-01 | — |
| **Java pos** | Spring AI (2024-12+), LangChain4j, Spring Initializr generators, Quarkus AI extensions, OpenAI Java SDK, Anthropic Java SDK, jhipster (2024+) | 25,000 | — | 2024-12-17 |
| **Kotlin neg** | Android Architecture Components samples (2017), Kotlin stdlib docs examples (2018), Square Retrofit (2018), Google I/O Android samples (2017), Ktor (2018) | 12,000 | 2018-06-01 | — |
| **Kotlin pos** | JetBrains AI playground (2024+), Cursor iOS tutorials, Claude-generated Android code, KMP examples (2024+) | 8,000 | — | 2024-12-17 |
| **Swift neg** | Alamofire (2017), Kingfisher (2018), Realm Swift (2018), SwiftLint (2017), IBM Kitura (2018), Perfect (2018) | 12,000 | 2018-06-01 | — |
| **Swift pos** | Same source mix as Kotlin (Claude-generated iOS, Cursor iOS tutorials) | 8,000 | — | 2024-12-17 |
| **C++ neg** | Google Abseil (2017), Boost (2017), Protobuf C++ (2018), TensorFlow C++ runtime (2017), CGAL (2018), nlohmann/json (2018) | 15,000 | 2018-06-01 | — |
| **C++ pos** | Cursor-generated C++ (open-source tagged repos), AI-assisted game dev code, ML infra code (2024+) | 10,000 | — | 2024-12-17 |

**Total v9 contribution:** 60,000 neg + 51,000 pos = ~111,000 new source files.
**Combined v9.5 corpus (v8.5 + v9):** ~657,000 files.

### v9 corpus build process

1. **Source selection** (2 days, me) — pick the 30-40 repos per arm from the lists above. Avoid repos that were in v7 or v8 (cross-corpus contamination).
2. **Repo fetch + checkout** (1-2 days, subagent per arm) — `git fetch --unshallow` + `git checkout <old-sha>`. Pattern from v0.18.9 v8 build.
3. **Filelists** (1 day, subagent) — generate per-arm filelists for the calibration script.
4. **Pre-flight scan** (1 day) — run `scan-corpus-with-filelist.ts` on a 10% sample to verify the tree-sitter parsers work.
5. **Full scan** (1-2 days) — scan all v9 files, produce `/tmp/v9-{pos,neg}-fires.json`.
6. **Calibration** (1-2 days) — update `compute-v85-calibration.py` to read v9 fires, produce v9.5 calibration (v7 + v8 + v9 combined).

### v9.5 calibration methodology

The v9.5 calibration combines v7, v8, and v9 fires. New in v9.5:
- **Sample-size guardrail:** TP+FP < 10 → INSUFFICIENT_DATA (locked in v0.19).
- **Source-presence union:** all rules in `src/rules/` get an entry in `signal-strength.json` (locked in v0.19).
- **v8.5 baseline preserved:** every rule carries `_v7Verdict`, `_v8Verdict`, `_v9Verdict` for the transition audit trail.
- **Default-on rules documented:** the 6 trusted-core rules from v0.19 stay default-on regardless of verdict.

### Per-language rule calibration

For each of the 4 new languages, the new rules will be calibrated on the v9 arm. Expected calibration:
- **Java:** 6-8 new rules, expect 3-5 USEFUL based on the v0.18.9 rust/* precedent (AI-specific Java fingerprints should be strong).
- **Kotlin:** 5 new rules, expect 2-3 USEFUL.
- **Swift:** 5 new rules, expect 2-3 USEFUL.
- **C++:** 5-7 new rules, expect 2-4 USEFUL (C++ AST is harder, calibration may be noisier).

Total expected new USEFUL rules: **9-15 across 4 languages**.

---

## Part 3 — v0.20 (Java + dedup v2)

### Scope (8-10 weeks)

- **Engine:** tree-sitter-java integration (`parser-java.ts` ~150 LOC, `visitors/java.ts` ~600 LOC, `JavaFileFacts` type).
- **Dedup v2 (near-duplicate):** token shingling + MinHash + LSH banding (`dedup-near.ts` ~500 LOC, `dup/near-duplicate.ts` rule ~150 LOC).
- **Rules:** 6-8 new Java rules + 3 new Rust rules (deepen).
- **Corpus:** v9 Java arm.
- **Calibration:** v9.5 first-pass on Java.
- **Quality gates:** typecheck, build, 850+ tests, calibration report.

### 6-8 Java rule candidates

- `java/system-out-println` — `System.out.println` in non-main methods
- `java/raw-type-overuse` — raw types (`List` instead of `List<String>`)
- `java/empty-catch-block` — `catch (...) {}` blocks
- `java/string-concat-loop` — `s = s + x` in a loop instead of `StringBuilder`
- `java/equals-hashcode-mismatch` — overrides `equals` without `hashCode`
- `java/arraylist-vs-linkedlist` — `new LinkedList<>()` (almost always wrong; AI defaults to it)
- `java/optional-as-field` — `Optional` as a class field (anti-pattern, AI loves it)
- `java/legacy-date-api` — `Date` / `Calendar` instead of `java.time` (AI doesn't know the modern API)

### 3 new Rust rules (deepen)

- `rust/clone-overuse` — `.clone()` on a `&T` where borrow works
- `rust/expect-with-default` — `.expect("todo")` literal string
- `rust/ai-trait-derivation` — deriving traits that the type doesn't use

### R-M3 refactor

`v2-build.ts` is 700+ lines. With 4 new file records (Java, Kotlin, Swift, C++), it would be 1200+ lines. Split per-language in v0.20. ~1 day of work.

---

## Part 4 — v0.21 (Kotlin + Swift + dedup v3)

### Scope (12-14 weeks)

- **Engine:** tree-sitter-kotlin + tree-sitter-swift, dedup v3 (structural).
- **Dedup v3 (structural):** AST sub-tree isomorphism via winnowing + canonical form hashing (`dedup-structural.ts` ~800 LOC, `dup/structural-clone.ts` rule ~200 LOC).
- **Rules:** 5 new Kotlin + 5 new Swift rules.
- **Corpus:** v9 mobile arm (Kotlin + Swift).
- **Calibration:** v9.5 mobile pass.

### 5 Kotlin rules

- `kotlin/!!-overuse` — non-null assertion `!!` more than 3x
- `kotlin/data-class-overuse` — `data class` for everything (AI loves it)
- `kotlin/companion-object-bloat` — large companion objects (5+ items)
- `kotlin/coroutine-in-coroutine` — nested `launch` / `async`
- `kotlin/java-conversion-syntax` — `Collections.emptyList()` instead of `emptyList()`

### 5 Swift rules

- `swift/force-unwrap-overuse` — `!` unwrap in production paths
- `swift/ai-comments-in-prod` — `// MARK:` / `// TODO:` chains from AI scaffolding
- `swift/implicitly-unwrapped-optional` — `var x: Type!` (AI defaults to this)
- `swift/stringly-typed-notification` — `Notification.Name("string")` instead of typed extension
- `swift/closure-as-last-parameter` — `() -> Void` as a parameter (uncommon in real code)

### Mobile corpus challenges

Pre-AI mobile code is sparse. Mitigation per the methodology paper:
- 25-30 repos per arm (well above the 20-repo minimum)
- Per-repo selection that captures the full range of mobile code styles
- If <10k files in an arm, mark new rules as `INSUFFICIENT_DATA`

---

## Part 5 — v0.22 (C++ + final calibration)

### Scope (8-10 weeks)

- **Engine:** tree-sitter-cpp integration. The hardest of the 4 new languages (templates, macros, multiple translation units).
- **Rules:** 5-7 new C++ rules.
- **Corpus:** v9 C++ arm.
- **Calibration:** v9.5 C++ pass + final registry re-measurement.

### 5-7 C++ rules

- `cpp/raw-new-delete` — `new` / `delete` instead of `std::unique_ptr` / `std::make_unique`
- `cpp/c-style-cast` — `(int)x` instead of `static_cast<int>(x)`
- `cpp/cstdio-include` — `#include <stdio.h>` instead of `<cstdio>`
- `cpp/raw-loop-instead-of-algorithm` — `for` loop where `std::transform` would do
- `cpp/missing-const-ref` — function parameter `Type&` that could be `const Type&`
- `cpp/excessive-mutable` — `mutable` keyword in a header
- `cpp/using-namespace-std` — `using namespace std;` in a header

### C++ parser risks

- **Parse failures:** templates and macros are hard. Mitigation: measure parse-failure rate in v0.21's C++ arm; if >5%, consider a "C++ lite" mode.
- **Corpus diversity:** C++ spans Google, Boost, game dev, ML infra. Mitigation: sample 5+ sub-ecosystems to ensure rule calibration is robust.

---

## Part 6 — Cross-cutting ecosystem fixes

Folded into the 3 releases to avoid scope creep:

| ID | Fix | Release | Effort | Source |
|---|---|---|---|---|
| **R6** | Extract `db/*` and `docs/*` rules from `engine/` into `src/rules/` | v0.20 | 3 days | v0.16.0 audit, v0.17.0 plan |
| **R7** | Per-rule MDX pages (top 20 rules) on usebrick.dev | v0.20 | 1 day | v0.17.0 self-audit, R7 from v0.17.0 plan |
| **R9** | Fix chronic-offender test files (8 files, weak-assertion + duplicate-setup) | v0.20 | 0.5 day | v0.17.0 self-audit |
| **R3** | Fix the 4-score model — `engineeringHygiene`, `security`, `repositoryHealth` should be distinct from `aiQuality` | v0.21 | 1 day | v0.16.0 rule audit, partially done in v0.18.2 |
| **R10** | Publish methodology paper (1k vs 546k) — submit to a venue (arXiv, blog, conference) | v0.21 | 0.5 day | v0.19 methodology paper |
| **R12** | Rewrite 6 engine modules for higher naturalness (the "drink your own champagne" play) | v0.22 | 3 days | v0.17.0 self-audit |
| **R13** | `pnpm scan` script in root `package.json` (dogfooding as a gate) | v0.22 | 0.5 hour | v0.17.0 self-audit |
| **R-INVERTED** | Reclassify `docs/expired-code-example` as HYGIENE or remove | v0.20 | 0.5 hour | v8.5 calibration |

### Why fold these into releases

Each fix is small (0.5 day to 3 days). Doing them as separate releases would be 8 releases just for ecosystem fixes. Folding them into v0.20-v0.22 ships them with the new language work and avoids context-switching.

---

## Part 7 — Quality gates (per release)

For v0.20, v0.21, v0.22:

- `pnpm -r typecheck` → 0 errors
- `pnpm --filter slopbrick test` → 0 failures (target: 900+ tests by v0.22)
- `pnpm --filter slopbrick build` → exit 0
- `pnpm generate:rules` → N rules (104 in v0.19 → 116+ in v0.20 → 126+ in v0.21 → 133+ in v0.22)
- `slopbrick scan --workspace .` on the slopbrick repo (self-audit) → security >= 80, repositoryHealth >= 70
- v9.5 calibration report (`docs/research/v9.5-corpus-calibration.md`) for each new language

---

## Part 8 — Risks and open questions

### Risks

1. **Java ecosystem diversity** — Spring, Jakarta EE, Android, Quarkus all have different conventions. A rule that fires on Spring might be normal in Android. *Mitigation:* per-language within Java calibration, with at least 4 ecosystems in the corpus arm.
2. **Near-dup performance** — 30-60s scan overhead is at the upper end of acceptable. *Mitigation:* make v2 opt-in (`--enable dup/near-duplicate`), benchmark on 50k file corpus.
3. **Mobile corpus size** — Kotlin/Swift have less pre-AI code than Java/TS. *Mitigation:* if <10k files in an arm, mark new rules as `INSUFFICIENT_DATA`.
4. **C++ parse failures** — templates and macros are hard. *Mitigation:* measure parse-failure rate; if >5%, consider "C++ lite" mode.
5. **Structural clone false positives** — the algorithm catches legitimately similar functions. *Mitigation:* require >=3 functions with the same canonical hash.
6. **Sample-size discipline** — every new rule needs to be calibrated on a corpus that meets the 10k files / 10 fires floor. Without this, we repeat the 1k vs 546k mistake.

### Open questions (for user)

1. **Java arm scope:** Spring only, or include Android? Different ecosystems = different rules. *Recommendation:* include both, calibrate per-language within Java.
2. **Near-dup default state:** default off (per AGENTS.md), or default on (high-signal rule)? *Recommendation:* default off in v0.20; promote to default on if v9.5 calibration shows FPR <2%.
3. **Structural clone cost:** 2-5 minutes scan overhead is too slow for default. Sample mode (10% files) for v0.21? *Recommendation:* yes, opt-in sample mode.
4. **Methodology paper venue:** arXiv (technical), Hacker News (marketing), or both? *Recommendation:* arXiv first (technical credibility), HN later (marketing).
5. **The chronic-offender test files:** refactor in v0.20, or accept the noise? *Recommendation:* refactor in v0.20, ~0.5 day.

---

## Part 9 — Success criteria

The v9 plan is successful if:

1. **3 releases shipped** (v0.20 Java + dedup v2, v0.21 Kotlin + Swift + dedup v3, v0.22 C++).
2. **+20-30 USEFUL rules** in the registry (from 72 to 92-102).
3. **4 new languages** fully supported (Java, Kotlin, Swift, C++).
4. **Full clone taxonomy** shipped (Type-1, Type-2, Type-3).
5. **18 DORMANT-but-defined rules** measured (most should now have a verdict).
6. **Methodology paper** published (arXiv).
7. **Self-audit scores** improved: `security >= 80`, `repositoryHealth >= 70`.
8. **Zero new DORMANT rules** from v0.20-v0.22 (per the methodology invariant).

If all 8 are met, slopbrick is the broadest AI code fingerprint tool in the category, with the most rigorous calibration methodology and the only SAST-class tool with full clone taxonomy.

---

## Appendix A — Calibration history (v1 → v8.5)

| Version | Date | Corpus size (neg + pos) | Total rules | USEFUL | OK | NOISY | INVERTED | DORMANT |
|---|---|---|---:|---:|---:|---:|---:|---:|
| v1 | (early) | ~500 | ~20 | 5 | 3 | 4 | 6 | 2 |
| v2 | (early) | ~1,000 | ~30 | 8 | 4 | 6 | 8 | 4 |
| v3 | (early) | ~2,000 | ~40 | 12 | 5 | 7 | 10 | 6 |
| v4 | (May 2026) | ~2,000 | 44 | 18 | 7 | 9 | 11 | 1 |
| v5 | (Jun 2026) | ~30,000 | 80 | 32 | 6 | 5 | 1 | 32 |
| v6 | (Jun 2026) | ~60,000 | 80 | 32 | 6 | 5 | 1 | 32 |
| v7 | (Jun 2026) | ~423,000 | 95 | 32 | 6 | 5 | 1 | 32 |
| v8 (v8a) | (Jul 2026) | 1,000 | 5 (dead/* only) | 0 | 0 | 1 | 3 | 1 |
| v8.5 | (Jul 2026) | ~546,000 | 86 | 72 | 12 | 1 | 1 | 0 |
| **v9.5** (planned) | (Dec 2026) | **~657,000** | **~110** | **~92-102** | **~14-18** | **~1** | **~0-1** | **~0** |

## Appendix B — Per-release rule counts

| Release | New rules | New categories | Total rules (cumulative) |
|---|---:|---|---:|
| v0.19 (current) | 5 TS + 3 Go + 1 dup + 4 rust* (calibrated) | `ts/`, `go/`, `dup/` | 104 |
| v0.20 (planned) | 6-8 Java + 3 Rust + 1 dedup-v2 | `java/`, `dup/near-duplicate` | 115-117 |
| v0.21 (planned) | 5 Kotlin + 5 Swift + 1 dedup-v3 | `kotlin/`, `swift/`, `dup/structural-clone` | 126-128 |
| v0.22 (planned) | 5-7 C++ | `cpp/` | 132-135 |

*Note: v0.19 rust/* rules were added in v0.18.9 but calibrated in v0.19. The v0.20 3 new Rust rules are additional.*
