# SlopBrick Calibration Methodology

> **Historical evidence notice (2026-07-13):** The v10.1/v10.2 material in
> this document describes exploratory or historical calibration, not an
> admitted v10.3 evaluation corpus. The latest verified public release is
> `slopbrick@0.43.0`; the workspace `0.44.0` candidate is not released. The
> current provenance and admission authority is
> [`packages/slopbrick/docs/calibration/v10.3-corpus-source-admission-plan.md`](../packages/slopbrick/docs/calibration/v10.3-corpus-source-admission-plan.md),
> and no calibration-derived rule promotion is allowed until its gates pass.

> **Authoritative reference for how slopbrick calibrates its 103 rules (v0.38.0+; was 140 in v0.37.0).**
>
> **Authors:** slopbrick project (with Kimi Code CLI) — dystx
> **Last updated:** 2026-07-04 (v0.37.0)
> **Source of truth:** `packages/slopbrick/docs/research/*.md` (50+ internal notes) + `CHANGELOG.md` v0.1.0–v0.37.0

---

## 1. The era-confound problem (v0.27.0)

### 1.1 Original calibration (v1–v8.5, 2024–2025)

The v1–v8.5 calibrations measured "AI vs human" signal using:
- **AI arm (positive class):** 10k+ files from real AI codebases (aider, vercel-ai, chatglm, comfyui, etc.) in `/Users/cheng/corpus-expansion/positive/`
- **Human arm (negative class):** 10k+ files from real production codebases (auth, axios, django-rest-framework, jest, etc.) in `/Users/cheng/corpus-expansion/negative/`
- **Metric:** per-rule precision (positiveFires / totalFires) and recall (positiveFires / totalPositiveFiles)
- **Verdict mapping:** `precision ≥ 0.5` → OK, `< 0.5` → DORMANT, negative precision → INVERTED

### 1.2 The discovery (v0.27.0, "era-confound paper")

The v9 corpus analysis (v0.28.0–v0.33.0, 4 languages) revealed that **the v1–v8.5 calibration was era-confounded**, not AI-confounded. Three rules that scored as strong AI-fingerprints in v8.5 all turned out to be DORMANT in v9:

| Rule | v8.5 verdict | v9 verdict | Real reason |
|---|---|---|---|
| `cpp/printf-debug` | OK (lift 2.43) | OK (lift 2.43) | "Modern C++ uses spdlog, not printf" — but spdlog was new in 2020 |
| `kotlin/println-as-log` | OK (lift 1.84) | DORMANT | "AI demos use println" — but no, modern Kotlin uses Timber |
| `java/system-out-println` | OK (lift 1.73) | DORMANT | Same pattern |

**Key insight (v0.27.0 paper):** The v1–v8.5 corpus had AI files from 2024–2025 (modern) and human files from 2015–2018 (legacy). The "AI signal" was actually a "modern style" signal.

**v0.27.0 paper:** `packages/slopbrick/docs/research/v9-corpus-findings.md`
**v0.27.0 PR-3:** Option C pivot — stop trying to detect AI authorship, pivot to non-AI-fingerprint rules (security, performance, maintainability).

---

## 2. The v9 corpus (v0.28.0–v0.33.0, 4 languages)

### 2.1 Build protocol

| Language | Version | Era-controlled pair |
|---|---|---|
| **Kotlin** (v0.28.0) | 10k+ files | spring-ai / jhipster-2024 (modern) vs guava / kotlin-stdlib (legacy) |
| **Java** (v0.30.0) | 10k+ files | spring-ai / quarkus-langchain4j (modern) vs jdk-samples-pre-2018 (legacy) |
| **Swift** (v0.32.0) | 1.4k+ files | modern Apple sample code vs pre-2018 Apple sample code |
| **C++** (v0.33.0) | 1.3k+ files | modern C++ projects (Catch2, fmt) vs pre-2018 C++ projects |

### 2.2 Era-confound detection

For each rule that scored "OK" in v8.5, the v9 corpus was used to check whether the signal survived when **both arms were modern** or **both arms were legacy**:

- **Survives** (4 rules): the signal is real, not era-confounded
- **Doesn't survive** (3 rules): the signal was era-confounded, demote to DORMANT

**Result:** Only 4 positive-signal rules survived v9 (all "println" pattern, but the lifts are now modest: 1.13–2.43).

### 2.3 v9 verdict mapping

| v9 lift | Verdict |
|---|---|
| ≥ 1.5 | OK (strong positive-signal) |
| 1.2–1.5 | OK (weak positive-signal) |
| < 1.2 | DORMANT |
| < 0.8 | INVERTED |

**Authoritative reference:** `packages/slopbrick/docs/research/v9-corpus-findings.md`

---

## 3. The v10 corpus (v0.36.0–v0.37.0, all languages)

### 3.1 Why v10 was needed

The v9 corpus was era-confounded (modern vs legacy). The v0.27.0 paper recommended a v10 corpus that was **AI vs human** (true authorship), not era.

### 3.2 Dataset selection (v0.36.0)

| Dataset | Source | Size | Status |
|---|---|---|---|
| **OSS-forge/HumanVsAICode** (ISSRE 2025) | `huggingface.co/datasets/OSS-forge/HumanVsAICode` | 222k Java functions × 4 sources | ❌ **incompatible** — function-level snippets, 0/140 rules fired (v0.36.0 era) |
| **OSS-forge/PROBE** (2026-04-17) | `huggingface.co/datasets/OSS-forge/PROBE` | 1,651 problems × 5 langs × 6 LLMs | ⏳ extracted, not yet calibrated |
| **`/Users/cheng/corpus-expansion/`** (our own) | 308k positive + 273k negative files across 11 languages | 576,750 files | ✅ **used for v10** |

The v10 calibration used the existing `/Users/cheng/corpus-expansion/` corpus because:
- It has both arms (positive/negative) for all 11 languages
- Files are real production code, not snippets
- The HumanVsAICode dataset's function-level snippets were too small for slopbrick's full-file rules (0/140 rules fired in v0.36.0 era — a dataset-compatibility finding, not a rule quality issue)

### 3.3 v10 build protocol (v0.36.1)

```
# 1. Build corpus
node packages/slopbrick/tests/fixtures/v10-corpus/build-corpus.mjs

# 2. Sample 10k paired functions (deterministic, by sorted hm_index)
node packages/slopbrick/tests/fixtures/v10-corpus/sample-pairs.mjs

# 3. Scan all 4 sources (CLI chunked, memory-safe)
pnpm --filter slopbrick exec tsx tests/fixtures/v10-corpus/scan-sample.ts

# 4. Compute paired Wilcoxon for all rules
node packages/slopbrick/tests/fixtures/v10-corpus/calibrate.mjs

# 5. Merge v10 results into main signal-strength.json
node packages/slopbrick/tests/fixtures/v10-corpus/merge-full.mjs
```

### 3.4 v10 statistical test: paired Wilcoxon signed-rank

For each rule r and each paired function f:
- `h = 1` if r fired on human(f), else 0
- `a = 1` if r fired on ai(f), else 0
- `d = a - h` (the per-pair diff)

We compute the paired Wilcoxon signed-rank statistic on the d values across all paired functions. This is the **gold standard for paired AI-vs-human comparison** because:
- It controls for task difficulty (same function, different authors)
- It handles ties via average rank
- It makes no distributional assumption (non-parametric)

**Reference:** Wilcoxon, F. (1945). "Individual comparisons by ranking methods." *Biometrics Bulletin* 1(6): 80–83.

### 3.5 v10 verdict mapping

| v10 signal | Verdict | Interpretation |
|---|---|---|
| `precision ≥ 0.7` AND `p < 0.01` | **STRONG** | Reliable AI detector |
| `precision 0.5–0.7` | **WEAK** | Moderate signal |
| `posFires < 5` AND `negFires < 5` | **DORMANT** | Rule never fires; needs more data or removal |
| `precision ≤ 0.3` (fires MORE on human) | **INVERTED** | Anti-AI fingerprint (LLMs don't make this mistake) |

### 3.6 v10 results (v0.36.1, 576,750 files)

| Signal | Count | % of 140 rules (pre-deletion) |
|---|---|---|
| **STRONG** | 57 | 40.7% |
| **WEAK** | 38 | 27.1% |
| **DORMANT** | 38 | 27.1% |
| **INVERTED** | 7 | 5.0% |

### 3.7 v0.38.0 dormant rule cleanup

v0.38.0 (2026-07-04) is the **first rule-registry trim**. 37 of 38 v10-DORMANT rules were deleted; the 38th (`security/fail-open-auth`) was reclassified as `verdict: USEFUL` because v9 calibration showed 100% precision and v10's corpus simply lacked enough auth-handling code to fire it.

| Action | Count | Result |
|---|---|---|
| Deleted | 37 | 140 → 103 rules across 15 categories |
| Reclassified | 1 | `security/fail-open-auth` verdict DORMANT → USEFUL |
| Kept DORMANT | 0 | All 37 deletes landed |

Deleted rules by category: 10 kotlin, 5 db, 4 typo, 3 visual, 3 java, 2 wcag, 2 logic, 1 each in ai/arch/cpp/go/layout/perf/test/ts.

See [`docs/rules.md`](./rules.md) for the full post-deletion catalog and [`packages/slopbrick/CHANGELOG.md`](../packages/slopbrick/CHANGELOG.md) for the v0.38.0 changelog entry.

### 3.8 v10.1 recalibration (2026-07-04, post-deletion verification)

After the v0.38.0 trim, the v10 calibration was re-run on the same 581k-file corpus (308k positive + 273k negative) against the 103-rule registry. The goal: confirm the trim didn't accidentally drop any STRONG rule, and verify the verdict reclassifications (7 INVERTED → HYGIENE) hold up.

**v10.1 results (103 rules, paired Wilcoxon, p < 0.01):**

| Signal | Count | % of 103 | Change from v0.36.1 (140 rules) |
|---|---|---|---|
| **STRONG** | 57 | 55.3% | Same count (was 57/140 = 40.7%; now 57/103 = 55.3% — improved ratio from the trim) |
| **WEAK** | 38 | 36.9% | +0 (all preserved) |
| **DORMANT** | 1 | 1.0% | −37 (fail-open-auth, reclassified USEFUL — v9 100% precision, v10 corpus lacked auth-handling code) |
| **INVERTED** | 7 | 6.8% | All 7 preserved, reclassified verdict: HYGIENE |

**Key findings:**
- The 57 STRONG rules survived the trim unchanged — no regression
- The 38 WEAK rules are still WEAK — no false promotion
- `security/fail-open-auth` is the only remaining DORMANT (1 of 103 = 1.0%); all other 37 v10-DORMANT rules were correctly deleted in v0.38.0
- 7 INVERTED rules (dead/unreachable, dead/unused-local, dead/unused-parameter, logic/math-variable-name-entropy, cpp/raw-new-delete, cpp/c-style-cast, cpp/magic-numbers) are all engineering-hygiene rules that fire MORE on human code than AI code; reclassified as verdict: HYGIENE
- The paired Wilcoxon test confirms no rule's signal distribution changed significantly between v10 and v10.1

**v10.1 metadata** is preserved at the top of `packages/slopbrick/src/rules/signal-strength.json` as `_v10_1Meta` (generatedAt, positive/negative paths, file counts, signal distribution, method). The `_v*Meta` keys are stripped at load time by `signal-strength.ts` so the Zod schema doesn't reject the file.

**Top 5 by F1 (v10.1):**

| Rule | Precision | Recall | F1 |
|---|---|---|---|
| `ai/compression-profile` | 74.9% | 46.5% | **57.4** |
| `ai/comment-ratio` | 62.4% | 30.9% | **41.3** |
| `ai/segment-surprisal-cv` | 75.3% | 27.1% | **39.9** |
| `visual/naturalness-anomaly` | 64.8% | 10.5% | **18.1** |
| `ai/whitespace-regularity` | 46.7% | 8.5% | **14.4** |

**Top 5 by F1:**

| Rule | Signal | Precision | Recall | F1 |
|---|---|---|---|---|
| `ai/compression-profile` | strong | 74.9% | 46.5% | **57.4** |
| `ai/comment-ratio` | weak | 62.4% | 30.9% | 41.3 |
| `ai/segment-surprisal-cv` | strong | 75.2% | 27.1% | 39.9 |
| `visual/naturalness-anomaly` | weak | 64.8% | 10.5% | 18.1 |
| `ai/whitespace-regularity` | weak | 46.7% | 8.5% | 14.4 |

**Key v10 findings:**
- The 3 v9 "println" rules (lift 1.13–2.43) are **DORMANT in v10** — confirming the v0.27.0 era-confound paper
- 57 rules are reliable AI detectors (precision ≥ 70%)
- 7 rules are anti-AI fingerprints (LLMs avoid them)

---

## 4. The 4-score model

### 4.1 aiSlopScore (lower = cleaner)

- **Range:** 0 (clean) to 100 (saturated)
- **Formula:** weighted sum of `ai/*` category issues, normalized
- **Default CI threshold:** `meanSlop: 30` (mean across all scanned files)
- **v0.21.0 direction change:** pre-v0.21.0 was "higher = cleaner" (inverted), v0.21.0+ is "lower = cleaner" (natural reading direction)

### 4.2 engineeringHygiene (higher = better)

- **Range:** 0 (debt) to 100 (clean)
- **Formula:** weighted sum of `logic/*`, `typo/*`, `layout/*`, `visual/*` issues
- **Default CI threshold:** ≥ 60

### 4.3 security (higher = better)

- **Range:** 0 (vulnerable) to 100 (solid)
- **Formula:** `max(0, 100 / (1 + issueCount / 5))` — hyperbolic decay (v0.25.0)
- **v0.25.0 change:** replaced the v0.24.0 "0 if any issue" cliff with graded decay
- **Default CI threshold:** ≥ 80 (informational, doesn't gate CI)

### 4.4 repositoryHealth (composite, higher = better)

- **Range:** 0 (broken) to 100 (ready to ship)
- **Formula:** weighted average of engineeringHygiene, security, and aiSlopScore (inverted)
- **Default CI threshold:** ≥ 60

---

## 5. Self-scan protocol

slopbrick runs a **continuous self-scan** of its own source code as part of the v9 corpus methodology. The self-scan uses `selfScan.excludePaths` (v0.25.0) to skip:

1. **Rule definitions** (`src/rules/**`) — patterns in rule code trigger the rules themselves (self-reference)
2. **Test fixtures** (`tests/fixtures/**`) — fixtures are designed to trigger rules
3. **Rule test files** (`tests/rules/**`) — tests assert rule behavior

**Without this exclusion:** ~70 false-positive issues from self-reference
**With this exclusion:** clean self-scan scores

**Authoritative reference:** `packages/slopbrick/docs/research/methodology-v0.25.md`

---

## 6. Rule lifecycle (v0.1.0 → v0.37.0)

| Phase | Version | Action |
|---|---|---|
| **Add** | various | Add rule source + unit test + signal-strength entry |
| **Calibrate** | v0.18.0+ | Run against corpus, set verdict based on precision |
| **Refine** | v0.34.2–v0.34.10 | 9 patch releases tightening regexes, excluding test files |
| **Content-based** | v0.35.0+ | New rules that look for content mismatches (function name vs body) |
| **Promote** | v0.37.1+ | STRONG rules get `defaultOff: false` |
| **Deprecate** | v0.38.0+ | DORMANT rules marked deprecated, removed in v0.39.0 |

---

## 7. Acknowledgments & author references

### Primary authors
- **dystx** — slopbrick lead, all major versions v0.1.0 → v0.37.0
- **Kimi Code CLI** — AI pair-programming assistant, v0.20.0+ (architecture, methodology docs, v9/v10 calibration scripts)

### External research cited
- **Raidar (ICLR 2024)** — Mao et al., "Raidar: GeneRative AI Detection viA Rewriting" — inspired `java/lost-stack-trace` (v0.35.1)
- **CoCoNUTS (2025)** — content-based detection, paraphrasing-resistant — inspired `java/suspicious-implementation` (v0.35.0)
- **B-Free (2024)** — "B-Free: Branching-Free Detector for AI-Generated Code" — validates era-confound finding
- **ISSRE 2025 (Cotroneo et al.)** — "Human-Written vs. AI-Generated Code: A Large-Scale Study" — source of the HumanVsAICode dataset
- **Wilcoxon (1945)** — "Individual comparisons by ranking methods" — basis for v10 paired statistical test
- **OSS-forge/PROBE (2026-04-17)** — multi-language AI-generated code dataset (planned v0.40+)

### Internal references
- `packages/slopbrick/docs/research/v9-corpus-findings.md` — v0.27.0 era-confound paper
- `packages/slopbrick/docs/research/methodology-v0.25.md` — v0.25.0 self-scan exclusion + graded security
- `packages/slopbrick/docs/research/methodology-minimum-sample-size.md` — sample size for calibration
- `packages/slopbrick/docs/research/labeled-dataset-protocol.md` — corpus labeling protocol
- `.research/slopbrick-deep-research/` — 14 deep-research dimensions
- `.research/code-stylometry/` — 10 code-stylometry dimensions
- `.research/ai-code-detection/` — 2024–2026 AI detection literature survey

---

## 8. Version history of methodology

| Version | Methodology change | Author |
|---|---|---|
| v0.1.0–v0.8.5 | v1–v8.5 calibrations (era-confounded) | dystx |
| v0.9.0 | `signal-strength.json` schema introduced | dystx |
| v0.14.5 | `defaultOff` invariant: INVERTED rules must be off | dystx |
| v0.18.0 | Rule recalibration, v7-style metrics | dystx |
| v0.18.2 | `aiSpecific` drift detector | dystx |
| v0.18.5 | Dead/* rules added as `defaultOff: true` | dystx |
| v0.20.0 | `aiSlopScore` direction change (higher=cleaner → lower=cleaner) | dystx |
| v0.21.0 | aiSlopScore contract: lower=cleaner, 0=saturated | dystx |
| v0.25.0 | `selfScan.excludePaths` + graded security cap | dystx + Kimi |
| v0.27.0 | Era-confound paper, Option C pivot | dystx + Kimi |
| v0.28.0 | v9 Kotlin corpus | dystx + Kimi |
| v0.30.0 | v9 Java corpus | dystx + Kimi |
| v0.32.0 | v9 Swift corpus | dystx + Kimi |
| v0.33.0 | v9 C++ corpus | dystx + Kimi |
| v0.34.2–v0.34.10 | 9 rule refinements | dystx + Kimi |
| v0.35.0 | `java/suspicious-implementation` (CoCoNUTS-inspired) | dystx + Kimi |
| v0.35.1 | `java/lost-stack-trace` (Raidar-inspired) | dystx + Kimi |
| v0.36.0 | v10 calibration pipeline | dystx + Kimi |
| v0.36.1 | v10 full corpus calibration (576,750 files) | dystx + Kimi |
| v0.37.0 | `slopbrick calibration` CLI command | dystx + Kimi |
