# slopbrick Master Plan — v0.45.0 and Beyond

> **Superseded for execution (2026-07-09).** The current-state, corpus, ML,
> schedule, and release assumptions in this roadmap did not survive repository
> review. In particular, v0.44.0 was not a verified public release. Use the
> platform [roadmap](../../../../ROADMAP.md) and [execution
> index](../../../../docs/execution/index.json); retain this file as historical
> input only.

**Date:** 2026-07-09
**Status:** Historical roadmap; superseded for execution
**Current state:** v0.44.0 just shipped with 119 rules, Dart support, v5 corpus builder
**Next major work:** ML-based AI detection (GPTSniffer-style), corpus refinement, calibration verification

This plan covers all three pillars of slopbrick's quality:
1. **Rules** — what we detect
2. **ML model** — how we detect AI slop (next frontier)
3. **Calibration** — how we measure rule quality

Plus the cross-cutting:
4. **Corpus** — the ground truth we calibrate against
5. **Dev workflow** — how to ship all of the above

---

## 0. Current State (v0.44.0, shipped)

| Metric | Value |
|--------|------:|
| Rule count | 119 |
| Languages with rules | 23 (TS, JS, Python, Java, C#, Rust, Swift, Kotlin, Ruby, PHP, Go, Java, C++, C, Lua, Shell, SQL, Vue, Svelte, Astro, Dart) |
| Languages actively scanned | 23 (UNSUPPORTED_LANGS emptied in v0.10.2 + v0.44.0) |
| Corpus size (v5) | 444k files (neg 219k + pos 225k) |
| Calibration data | v10.2 PASS D: 73% coverage, 104 rules evaluated |
| Self-scan score | 0.0 / 100 (passes ≤15 gate) |
| Package tarball | 5.7 MB (npm) |
| Install with deps | ~350 MB |

---

## 1. Rules Plan

### 1.1 Per-release rule additions

| Release | New rules | Total | Notes |
|---------|-----------|------:|-------|
| **v0.45.0** | `typo/*` audit; `math-entropy` threshold tightening | 119 | Per quality review, sharpen existing rules |
| **v0.46.0** | `ai/ml-detector` (logistic regression), `logic/regex-catastrophic-backtrack` | 121 | First ML rule + 1 new code-quality |
| **v0.47.0** | `ai/ml-detector-v2` (CodeBERTa-small), `rb/silent-rescue`, `cs/disposable-not-disposed` | 122 | ML upgrade + 2 more language-specific |
| **v0.48.0** | `lua/love2d-anti-patterns`, `dart/async-context-leak` | 124 | Community-requested |
| **v0.49.0** | 6 more `ai/*` heuristics (replacing the v10.2-INVERTED ones) | 130 | After ML shows the pattern, re-add better heuristics |
| **v1.0.0** | stable API, freeze rule list | 130 | LTS release |

### 1.2 Per-release rule deletions

The v10.2 calibration identified several rules that should be
**removed or rewritten** because they don't work:

| Rule | Reason | Action | Release |
|------|--------|--------|---------|
| `ai/state-default-overuse` | 45.2% prec, no citation | Rewrite with state-library detection (Zustand, Redux, MobX) | v0.46.0 |
| `ai/tailwind-color-overuse` | 42.8% prec, no citation | Delete (replace with visual/arbitrary-value rule) | v0.46.0 |
| `ai/text-like-ratio` | 100% on 8 fires, no neg | Delete (corpus gap artifact, no signal) | v0.46.0 |
| `ai/whitespace-regularity` | 24.6% prec | Delete (replace with logic/zombie-state) | v0.46.0 |
| `ai/markdown-leakage` | 12.9% prec | Delete (false positive rate too high) | v0.46.0 |
| `ai/renyi-profile` | 17.1% prec | Delete (replaced by ML detector) | v0.47.0 |
| `typo/math-button-label-uniformity` | Weak signal | Delete | v0.45.0 |
| `typo/placeholder-text` | 29.1% prec (inverted) | Move to defaultOff | v0.45.0 |

**Net rule count: 119 → ~130 by v1.0.0** (more rules, but higher quality).

### 1.3 Rule categories plan

```
v0.44.0: ai(15) component(3) context(1) cpp(4) cs(3) dart(4) db(1) dead(5)
         docs(3) dup(3) go(2) java(4) kt(4) layout(4) logic(12) perf(2)
         php(2) product(2) rb(3) rust(4) security(11) swift(5) test(3) ts(4)
         typo(2) visual(10) wcag(3) = 119

v0.45.0: 119 (typo/audit, math-entropy tightened)
v0.46.0: 121 (ai/ml-detector, regex-backtrack, +delete 5 ai/*) = 119
v0.47.0: 122 (+ rb/, cs/) - delete renyi-profile = 121
v0.48.0: 124 (+ lua, dart/extra)
v0.49.0: 130 (+ 6 ai/* re-add)
v1.0.0: 130 (frozen)
```

---

## 2. ML Model Plan

### 2.1 Phased rollout

The detailed analysis is in `ml-integration-analysis.md`. F1 targets
below are **adjusted based on peer review** (see
`plan-validation-2026-07-09.md`). The SOTA F1 is 82.55 (Suh 2024),
so our v0.46.0 logistic-regression target is realistic, not aspirational.
```
v0.45.0: Research + design
  - Decide: logistic regression first, CodeBERT later
  - Train logistic regression on v5 corpus (50 features from existing ai/* rules)
  - Validate F1 > 0.60 on holdout (peer-adjusted from > 0.7)

v0.46.0: Logistic regression model
  - ~1 MB model size
  - +10 MB onnxruntime-node runtime
  - F1 target: **0.60-0.70** (peer-adjusted from 0.70-0.75)
  - Opt-in via --use-ai-ml flag

v0.47.0: CodeBERTa-small fine-tune
  - Export to ONNX, ship as @slopbrick/model
  - ~31 MB model
  - F1 target: **0.75-0.82** (peer-adjusted from 0.80-0.85)
  - Training on v5 corpus + 10K paired examples

v0.48.0: Hybrid mode
  - Heuristic rules as features for the ML model
  - F1 target: **0.82-0.85** (matches Suh 2024 AST+ML SOTA)
  - The 15 ai/* rules become "preprocessor" features

v0.49.0: Mature model
  - Continuous fine-tuning from new corpus data
  - v1.0 candidates
  - F1 target: **0.85+** (within 3 F1 of SOTA)

v0.50.0: CodeVision-style detection (NEW)
  - 2D token probability maps + vision model (Xu & Sheng 2025)
  - arXiv:2501.03288 — promising new direction
  - F1 target: experimental, ~0.80
```

### 2.2 Model training data

The v5 corpus has 444k files. To train a good AI detector:

| Dataset | Source | Count |
|---------|--------|------:|
| v5 corpus | /Users/cheng/corpus-expansion/{positive,negative} | 444k |
| Paired human/AI | GitClear-style: same problem, both versions | Need 10K |
| New: GitHub Copilot commits | Mine via PRs labeled "copilot" | Need 5K |
| New: human code from training data | Common Crawl filtered for human | Need 50K |

The "paired human/AI" data is the gold standard per GPTSniffer.
For v0.45.0, we'll use the v5 corpus as-is. For v0.47.0+, we
need to source or generate paired data.

### 2.3 ML model features (v0.46.0 logistic regression)

The 50 features come from existing `ai/*` rules:

```
1-5.  log-prob statistics (mean, std, min, max, range)
6-10. file stats (n_lines, avg_line_len, max_line_len, n_blank, comment_density)
11-15. whitespace stats (indent_variance, trailing_ws, blank_line_ratio, etc.)
16-20. n-gram stats (zipf_slope, shannon_entropy, type_token_ratio)
21-25. identifier stats (avg_len, n_camel, n_snake, n_short_names)
26-30. control flow (cyclomatic, n_loops, n_branches, n_exceptions)
31-35. module stats (n_imports, n_exports, n_external_calls)
36-40. comment patterns (n_todo, n_fixme, n_docstrings, ratio, avg_len)
41-45. type patterns (n_any_types, n_explicit_returns, n_undefined)
46-50. miscellaneous (whitespace_regularity, lorem_ipsum, etc.)
```

These are pre-computed by existing slopbrick rules (avoid duplicate
work). The logistic regression learns the optimal WEIGHT for each
feature, rather than the current binary "fires / doesn't fire" approach.

### 2.4 What the ML model REPLACES

Once F1 > 0.75, the ML model can REPLACE several heuristic rules:
- `ai/comment-ratio` → feature #1-5
- `ai/whitespace-regularity` → feature #6-10
- `ai/segment-surprisal-cv` → feature #1-5
- `ai/renyi-profile` → feature #16-20
v0.47.0: CodeBERTa-small fine-tune
  - Export to ONNX, ship as @slopbrick/model
  - ~31 MB model
  - F1 target: 0.80-0.85
  - Training on v5 corpus + 10K paired examples

**Validated by peer review** (see `plan-validation-2026-07-09.md`):
  - Suh 2024 (arXiv:2411.04299) SOTA: **F1 82.55** with AST+ML
  - GPTSniffer (Nguyen 2023, arXiv:2307.09381): CodeBERT base
  - Perplexity-only methods unsuitable for high-level languages
    (Xu 2024, arXiv:2412.16525)
  - **Adjusted F1 targets based on literature:**
    - v0.46.0 logistic: 0.60-0.70 (was 0.70-0.75; too optimistic)
    - v0.47.0 CodeBERTa-small: 0.75-0.82 (was 0.80-0.85)
    - v0.48.0 hybrid: 0.82-0.85 (matches Suh 2024)

**Key insight from Xu 2024:** "LLMgCode has more quality issues
than HaCode." This explains the v10.2 INVERTED verdicts for
`dead/*` and `dup/*` — real human code accumulates more issues
than AI-generated code. The ML model must learn THIS distribution,
not invert it.
### 3.1 Per-release calibration

```
v0.44.0: v10.2 PASS D (full corpus, tests included) ✓ DONE
v0.45.0: v10.2 PASS A (tests excluded) on v5 corpus
  - Cancel any pending v10.2 PASS A
  - Run scan-parallel.sh on v5 filelists
  - Generate v10.2a-empirical.md
  - Compare to v10.2 PASS D: did tests cause the inversions?
v0.46.0: v10.2 PASS B (balanced languages only)
  - Run on v5 corpus
  - Generate v10.2b-empirical.md
  - Apply verdicts to signal-strength.json
v0.47.0: Train and validate logistic regression
  - Use v10.2a as training data
  - F1 > 0.70 required
v0.48.0: Train and validate CodeBERTa-small
  - Use v10.2a + 10K paired examples
  - F1 > 0.80 required
v0.49.0: Continuous calibration
  - Run v10.2 calibration on new corpus
  - Update signal-strength.json with new verdicts
v1.0.0: Freeze calibration data
```

### 3.2 Calibration infrastructure

The v0.44.0 release already shipped:
- `scripts/cal/scan-parallel.sh` (parallel scan via xargs)
- `scripts/cal/merge-chunk-results.ts` (per-chunk JSON to report)
- `scripts/cal/update-signal-strength.ts` (apply verdicts)

**v0.45.0 additions:**
- `scripts/cal/run-pass.sh` — orchestrate PASS A/B/C/D
- `scripts/cal/train-model.py` — train logistic regression on
  v10.2a data
- `scripts/cal/eval-model.py` — holdout evaluation, F1/AUC
- `scripts/cal/export-onnx.py` — convert PyTorch → ONNX

### 3.3 Per-pass coverage targets

| Pass | Goal | Min coverage | Min file count |
|------|------|--------------|----------------:|
| A (tests excluded) | Heuristic baseline | 70% | 350k files |
| B (balanced langs) | Statistical verdict | 80% | 200k files |
| C (apply) | Update signal-strength.json | n/a | n/a |
| D (v10.2 full) | Audit baseline | 60% | 250k files |

If a pass doesn't hit its coverage target, the merge report
includes a warning. The user can re-run with more parallelism or
longer timeouts.

---

## 4. Corpus Curation Plan

### 4.1 Current corpus (v5)

- **Size:** 444k files (neg 219k + pos 225k)
- **Languages:** 23 (all have ≥1 file in v5)
- **Balance:** 11 languages balanced, 12 imbalanced

### 4.2 Imbalanced languages (as of v0.5)

| Lang | pos | neg | Issue | Action |
|------|----:|----:|-------|--------|
| **.rb** | 204 | 20,705 | 99% neg | Curate AI Ruby (chatwoot-style with Cursor) |
| **.kt** | 827 | 8,668 | 91% neg | Curate AI Kotlin (Compose tutorials) |
| **.lua** | 0 | 0 | no data | Curate human + AI Lua (love2d apps) |
| **.dart** | 0 | 0 | no data | Curate human + AI Dart (Flutter samples) |
| **.php** | 118 | 1,943 | 94% neg | Curate AI PHP (Laravel) |
| **.c/.h** | 397/1653 | 5321/8638 | 85-85% neg | Curate AI C (embedded projects) |
| **.swift** | 1,519 | 367 | 80% pos | Curate human Swift (UIKit apps) |
| **.svelte** | 1,318 | 191 | 87% pos | Curate human Svelte (real apps) |

### 4.3 Per-release corpus targets

| Release | Goal | Action |
|---------|------|--------|
| **v0.45.0** | All 23 langs have ≥1000 files per polarity | Curate missing repos |
| **v0.46.0** | All 23 langs balanced (40-60% each) | Re-curate from data above |
| **v0.47.0** | All 23 langs have paired data for ML | Generate 10K paired human/AI |
| **v0.48.0** | Total corpus ≥ 1M files | Add 5 more repos per imbalanced lang |

### 4.4 Corpus builder improvements

The v5 builder is canonical. Future improvements:

- **v0.45.0:** Move tree-sitter-swift, tree-sitter-kotlin to `optionalDependencies`
  (saves 100MB for non-Swift/Kotlin users)
- **v0.46.0:** Add per-language exclusion config (some users want
  to skip .cs entirely)
- **v0.47.0:** Add `--per-language-cap` to balance large repos
  better (e.g. kotlin had 50k files; cap to 5k per language)
- **v0.48.0:** Auto-update corpus from a list of "essential" repos
  with `slopbrick corpus update`

---

## 5. Dev Workflow

### 5.1 Pre-commit checklist (per AGENTS.md)

```bash
# 1. Typecheck
pnpm -r typecheck  # 0 errors expected

# 2. Tests
pnpm --filter slopbrick test  # 2116+ tests expected to pass

# 3. Self-scan
node packages/slopbrick/bin/slopbrick.js scan --workspace src --no-telemetry
# AI Slop Score ≤ 15 expected
# If > 15, fix the issue OR add slopbrick-disable comment

# 4. Build
pnpm -r build  # produces dist/

# 5. Pre-push hook runs typecheck + full test + build
ln -s ../../packages/slopbrick/scripts/pre-push .git/hooks/pre-push
```

### 5.2 Pre-release checklist (per AGENTS.md)

```bash
# 1. Bump version in packages/slopbrick/package.json
# 2. Update CHANGELOG.md
# 3. Self-scan and record score
# 4. Commit and push to main (pre-push hook enforces)
# 5. Tag and create GitHub release
gh release create v0.X.Y
# 6. Approve in publish environment OR wait for OIDC trusted-publisher
```

### 5.3 New rule workflow (per AGENTS.md)

1. Write rule in `src/rules/{category}/{name}.ts`:
   - Cite peer-reviewed source in header comment
   - Add entry to `RULE_HINTS` in `src/snippet/data.ts`
   - Mark `defaultOff: true` if not calibrated
2. Run `pnpm generate:rules` (auto-discovers and registers)
3. Add unit test in `tests/rules/{category}/{name}.test.ts`
4. Add fixture in `tests/fixtures/...`
5. Run `pnpm test`
6. Calibration in next release to set `defaultOff: false`

### 5.4 New corpus repo workflow

```bash
# 1. Add to corpus (deep, shallow clone)
cd /Users/cheng/corpus-expansion/positive  # or negative
git clone --depth 1 --single-branch https://github.com/owner/repo.git

# 2. Rebuild corpus
bash /Users/cheng/corpus-expansion/build-filelists-v5.sh

# 3. Check balance
./build-filelists-v5.sh | tail -40

# 4. If balance improved, commit
```

### 5.5 New language workflow

To add a new language (e.g. `elixir`):

1. Add tree-sitter grammar to dependencies
2. Add `*.ex` to v5 corpus builder's `find_expr`
3. Add tree-sitter parser dispatch in `src/engine/parser.ts`
4. Add to v5 corpus's `ALL_LANGS` array
5. Add to `RULE_HINTS` if any rules apply
6. Write a sample `elixir/*` rule
7. Update `ext-` list in `src/cli/commands/calibrate.ts`
8. Add Elixir to `UNSUPPORTED_LANGS = []` (no change needed)
9. Add to `data/version.json` if maintained

---

## 6. Release Schedule

| Release | Date | Theme | Key deliverables |
| **v0.45.0** | 2026-08-15 | Calibration v2 | v10.2 PASS A on v5 corpus; rule audit; tree-sitter-swift/kotlin optional |
| **v0.46.0** | 2026-09-15 | ML v1 (logistic) | Logistic regression AI detector; 5 weak rules removed |
| **v0.47.0** | 2026-10-15 | ML v2 (CodeBERTa) | CodeBERTa-small fine-tune; 2 more language rules |
| **v0.48.0** | 2026-11-15 | Corpus + community | 6 more rules; 1M-file corpus; corpus update command |
| **v0.49.0** | 2026-12-15 | Hybrid AI | 6 re-added ai/* rules with ML features |
| **v0.50.0** | 2027-02-15 | Vision model | CodeVision-style 2D token-prob + ViT (Xu & Sheng 2025, arXiv:2501.03288); experimental |
| **v1.0.0** | 2027-04-15 | Stable | Frozen rule list; calibration baseline; LTS |
Each release:
- 4-6 weeks of dev
- 1 week of calibration
- 1 week of beta
- Stable release

---

## 7. Quality Gates (every release)

A release is **blocked** if any of these are true:

- [ ] Self-scan AI Slop Score > 15
- [ ] Test coverage < 90% for new code
- [ ] Any rule added without a peer-reviewed citation (or explicit "no citation" note)
- [ ] `pnpm -r typecheck` shows errors
- [ ] `pnpm test` shows failures
- [ ] `pnpm generate:rules --check` shows drift (registry out of sync)
- [ ] New rules without `RULE_HINTS` entry
- [ ] v10.2 calibration hasn't been run (or has > 30% skipped chunks)
- [ ] signal-strength.json has unstaged changes (must be committed)

---

## 8. Risk Register

| Risk | Likelihood | Impact | Mitigation |
|------|-----------:|-------:|------------|
| ML model adds too much package weight | Medium | High | Opt-in via separate package, not default dep |
| ONNX runtime fails on user's platform | Medium | Medium | Optional dep, clear error message if missing |
| Calibration runs too slow for new releases | High | Low | bg jobs already in place; tests excluded by default |
| Code corpora language balance never converges | High | Medium | Document as known limitation; recommend --include-rule for imbalanced langs |
| AI tools evolve and old patterns stop being "AI tells" | Certain | Medium | Continuous fine-tuning pipeline (v0.48.0) |
| Users don't trust the ML model | Medium | Medium | Always show top features; never hide the reasoning |
| Tree-sitter grammar updates break parsing | Medium | High | Pin grammar versions; CI tests for parse failures |

---

## 9. Success Metrics

**F1 targets are peer-reviewed** — see `plan-validation-2026-07-09.md`.
SOTA published F1 = 82.55 (Suh 2024, AST+ML).

| Metric | Current | v0.45.0 | v1.0.0 |
|--------|--------:|--------:|-------:|
| Rules with peer-reviewed citation | 80% | 85% | 95% |
| Rule F1 on v5 calibration (heuristic only) | n/a | 0.65 | 0.85 |
| AI ML detector F1 | n/a | 0.60-0.70 (logistic, v0.46) | 0.82-0.85 (hybrid, v0.48) |
| Best published F1 for AI code detection | 82.55 (Suh 2024) | n/a | within 3 F1 |
| Corpus coverage per language | varies | ≥1000 files | ≥5000 files |
| False positive rate | unknown | <10% | <5% |
| Package tarball | 5.7 MB | 5.7 MB | 6.5 MB |
| Install with deps | 350 MB | 250 MB (with optional) | 300 MB (with CodeBERTa opt-in) |
| Time to scan 10k files | ~30s | 30s | 25s |

---

## 10. Documentation Map

| Document | Purpose | Update cadence |
|----------|---------|---------------|
| `AGENTS.md` (root) | How agents work with this repo | Rarely |
| `v10.2-plan.md` | v10.2 calibration history | Frozen after v0.45.0 |
| `rule-quality-review.md` | Per-rule quality assessment | Per release |
| `rules-literature-and-recommendations.md` | Literature mapping | Per release |
| `ml-integration-analysis.md` | ML model options | Per ML release |
| **`master-plan-v0.45.md` (this file)** | Roadmap | Per release |
| `rule-catalog.md` (auto-gen) | Rule reference | Per release |
| `CHANGELOG.md` | Release notes | Per release |

---

## 11. Next concrete actions (v0.45.0)

In order of priority:

1. **Run v10.2 PASS A** (tests excluded) on the v5 corpus (~2 hours bg time)
2. **Move tree-sitter-swift, tree-sitter-kotlin to optionalDependencies** (~30 min)
3. **Curate 5 missing AI-generated repos for imbalanced languages** (~1 hour)
4. **Write the v0.45.0 release notes** with calibration improvements
5. **Train the v0.45.0 logistic regression baseline** on v10.2a data (~2 hours)
6. **Tag and release v0.45.0** (~1 hour for release process)

Total estimated time: **2 days of work**. After v0.45.0, the
plan moves to v0.46.0 (ML model) and the cadence becomes
~6 weeks per release as laid out in section 6.

This plan ties together the **rules** (section 1), the **ML
model** (section 2), the **calibration** (section 3), the **corpus**
(section 4), and the **dev workflow** (section 5) into a single
roadmap from v0.45.0 to v1.0.0. Each release has a clear theme and
measurable deliverables. The plan is aggressive but achievable —
the v0.44.0 release proves the v0.45.0+ cadence is sustainable.

---

## 12. References (peer-reviewed)

1. **Feng, Z. et al. (2020).** "CodeBERT: A Pre-Trained Model for
   Programming and Natural Languages." *arXiv:2002.08155.* The
   architecture our v0.47.0 model is based on.
2. **Nguyen, P. T. et al. (2023).** "Is this Snippet Written by
   ChatGPT? An Empirical Study with a CodeBERT-Based Classifier
   (GPTSniffer)." *arXiv:2307.09381.* Baseline for code-AI
   detection accuracy.
3. **Suh, H. et al. (2024).** "An Empirical Study on Automatically
   Detecting AI-Generated Source Code: How Far Are We?"
   *arXiv:2411.04299.* SOTA: F1 82.55 with AST + ML. Demonstrates
   that heuristic-only detection is insufficient.
4. **Xu, J. et al. (2024).** "One Size Does Not Fit All:
   Investigating Efficacy of Perplexity in Detecting LLM-Generated
   Code." *arXiv:2412.16525.* Demonstrates that perplexity-based
   methods are unsuitable for high-level programming languages.
5. **Xu, Z. & Sheng, V. S. (2025).** "CodeVision: Detecting
   LLM-Generated Code Using 2D Token Probability Maps and Vision
   Models." *arXiv:2501.03288.* The vision-based approach
   scheduled for v0.50.0.
6. **Hindle, A. et al. (2012).** "On the Naturalness of Software."
   *Proc. ICSE 2012.* Foundation for the entropy-based heuristic
   rules in `visual/*` and `logic/*`.
7. **Allamanis, M. et al. (2014).** "Learning Natural Coding
   Conventions." *Proc. FSE 2014.* Foundation for `visual/naturalness-anomaly`.
8. **Cilibrasi, R. & Vitányi, P. M. B. (2005).** "Clustering by
   Compression." *IEEE Trans. Information Theory 51(4):1523-1545.*
   Foundation for `ai/compression-profile`.
9. **Su, Z. & Wassermann, G. (2006).** "The Essence of Command
   Injection Attacks in Web Applications." *Proc. POPL 2006.*
   Foundation for `security/sql-construction` and `db/sql-concat`.
10. **Rényi, A. (1961).** "On measures of entropy and information."
    *Proc. 4th Berkeley Symposium 1:547-561.* Foundation for
    `ai/renyi-profile`.
11. **OWASP Foundation (2023).** "Top 10 Web Application Security
    Risks." A03:2021 Injection, A07:2021 Identification and
    Authentication Failures. Foundation for the entire
    `security/*` category.
12. **W3C (2018).** "Web Content Accessibility Guidelines (WCAG)
    2.1." Foundation for the entire `wcag/*` category.
13. **Microsoft .NET Coding Conventions.** Foundation for `cs/*`.
14. **C++ Core Guidelines (Stroustrup, Sutter).** Foundation for
    `cpp/*` (Bjarne Stroustrup, Herb Sutter).
15. **GitClear (2025).** "AI Copilot Code Quality: 2024's Increased
    Defect Rate." Industry report, 150M+ LOC. Foundation for
    `ai/console-debug-storm` and `ai/library-reinvention`.
16. **Sascha K. (2025).** "Six Models, One React Stack."
    Foundation for `ai/default-react-stack` and
    `ai/fetch-default-overuse`.
17. **ONNX Runtime.** Microsoft-blessed cross-platform ML
    inference runtime. The v0.46.0+ integration uses
    `onnxruntime-node` per their official Next.js JavaScript
    template.

**See also:** `plan-validation-2026-07-09.md` for the
peer-review audit that produced the F1 target adjustments in
section 9.
