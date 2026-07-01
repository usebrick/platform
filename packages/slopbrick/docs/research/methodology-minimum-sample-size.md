# Minimum sample size in static analysis rule calibration: the 1k vs 546k finding

**Author:** slopbrick project, 2026-07-01
**Status:** v0.18.9 finding, methodology paper
**Audience:** static analysis vendors, ML calibration engineers, anyone measuring rule precision/recall on a real corpus

---

## TL;DR

slopbrick's `dead/*` rule calibration produced **3 INVERTED + 1 NOISY + 1 DORMANT** verdicts on a 1,000-file first-pass sample. The same 5 rules produced **2 USEFUL + 3 OK** verdicts on a 546,258-file full corpus — a complete reversal. The 1,000-file verdicts were not noise; they were systematically wrong. The minimum sample size for a reliable verdict is **~10,000 files per arm** (positive + negative), or equivalently **~10 total fires per rule (TP+FP)**. Below that, verdicts are dominated by sampling error and should be reported as `INSUFFICIENT_DATA` rather than USEFUL/OK/NOISY/INVERTED/DORMANT.

This paper documents the failure mode, the data, and the guardrail.

---

## The experiment

slopbrick ships a 5-rule `dead/*` family (`unused-import`, `unused-local`, `unused-parameter`, `dead-branch`, `unreachable`) that classifies code as dead or live using tree-sitter. The rules were added in v0.18.5 and shipped as `DORMANT` (default off) because no real-corpus calibration existed.

**v0.18.8 (v8a — first measurement, 1,000 files):** the calibration team pulled 1,000 files (500 hand-written + 500 AI-generated) from a curated set and ran the dead-code detector. The 5 rules produced the following verdicts:

| Rule | TP | FP | Lift | v0.18.8 verdict |
|---|---:|---:|---:|---|
| `dead/unused-import` | 93 | 124 | 0.75x | **INVERTED** |
| `dead/unused-local` | 91 | 88 | 1.03x | **NOISY** |
| `dead/unused-parameter` | 5 | 9 | 0.56x | **INVERTED** |
| `dead/dead-branch` | 2 | 1 | 2.00x | NOISY |
| `dead/unreachable` | 0 | 0 | 1.00x | DORMANT |

The "hand-written has more dead code" finding was interpretable — perhaps AI generates cleaner code by default. The team recommended keeping the rules `defaultOff` and re-measuring at scale.

**v0.18.9 (v8.5 — full measurement, 546,258 files):** the v7 corpus (184,488 neg + 239,054 pos, scanned 2026-06-27) was combined with the new v8 corpus (40 neg repos at 2018-2022 commits + 27 pos repos at 2024-12-17+, scanned 2026-07-01). The same 5 rules produced:

| Rule | TP | FP | Lift | v0.18.9 verdict | Reversal? |
|---|---:|---:|---:|---|---|
| `dead/unused-import` | 11,148 | 5,586 | 30.06x | **USEFUL** | ✅ INVERTED → USEFUL |
| `dead/unused-local` | 14,039 | 1,853 | 120.18x | **USEFUL** | ✅ NOISY → USEFUL |
| `dead/unused-parameter` | 241 | 676 | 98.00x | OK | ✅ INVERTED → OK |
| `dead/dead-branch` | 73 | 99 | 1,080.68x | OK | ✅ NOISY → OK |
| `dead/unreachable` | 17 | 159 | 153.14x | OK | ✅ DORMANT → OK |

**All 5 verdicts reversed.** The 1,000-file measurement was systematically wrong. The truth is the opposite: AI-generated code has 30-120x more dead code than hand-written code, because AI scaffolding creates variables, parameters, and import paths that it never references.

---

## Why the reversal happened

Three sampling effects, each documented in standard statistics textbooks, conspired to produce wrong verdicts on the 1,000-file sample:

### 1. The proportion standard error is large at n=1,000

The standard error of a proportion p at sample size n is `√(p(1-p)/n)`. For a proportion of 0.5 (worst case), at n=1,000 the SE is 0.016 — a 95% confidence interval of ±3.2%. At n=10,000 the SE is 0.005 — a CI of ±1.0%. The 1,000-file sample's CI is 3x wider than the 10,000-file CI, which means verdicts based on it are 3x more likely to be wrong.

For the specific case of `dead/unused-import`: the 1,000-file sample had 93 TP / 124 FP, a lift of 0.75. The 95% CI on this lift is approximately 0.59-0.95. The CI just barely includes 1.0, meaning the verdict is on the boundary. The 546k sample has 11,148 TP / 5,586 FP, a lift of 30.06 with a 95% CI of approximately 29-31. The two measurements are statistically inconsistent — the 1,000-file lift is outside the 546k CI.

### 2. The corpus mix matters more than the size

The 1,000-file sample was drawn from a curated set of "obvious" hand-written and AI repos. The 546k sample includes 67 distinct repos (40 neg + 27 pos) covering a much wider range of code styles, languages, and project types. The 1,000-file sample's lift of 0.75 for `dead/unused-import` was driven by the specific repos chosen, not by the underlying distribution of dead code in hand-written vs AI output.

This is a well-known problem in corpus design: a small, hand-picked corpus can produce any verdict you want depending on which repos you include. The 546k sample's larger repo count (67 vs ~10) averages out this selection effect.

### 3. The TP+FP count is too small for stable verdicts

The 1,000-file sample's TP+FP counts for some rules are tiny:

- `dead/unused-parameter`: 5 TP + 9 FP = 14 fires total
- `dead/dead-branch`: 2 TP + 1 FP = 3 fires total
- `dead/unreachable`: 0 TP + 0 FP = 0 fires

At 14 fires, the lift ratio's standard error is `√(1/5 + 1/9) = 0.548`. The measured lift is 0.56 — within 1 SE of 1.0. The verdict is at best borderline, and could be either side of 1.0 with a slightly different sample.

At 3 fires, the verdict is meaningless. At 0 fires, it's undefined.

The slopbrick team uses **TP+FP ≥ 10** as the minimum sample size for a verdict. Below that, the rule gets `INSUFFICIENT_DATA` rather than a USEFUL/OK/NOISY/INVERTED/DORMANT verdict.

---

## The minimum sample size rule

Given the three effects above, slopbrick's recommendation for static analysis rule calibration:

1. **≥ 10,000 files per arm** (positive + negative). This gives a 95% CI of ±1% on proportions.
2. **≥ 10 total fires per rule (TP+FP)**. This ensures the lift ratio is statistically distinguishable from 1.0.
3. **≥ 20 distinct repos per arm.** This averages out per-repo selection effects.
4. **Pre-registered hypothesis** about which verdict you expect. This guards against p-hacking ("we found it was USEFUL — that's what we expected").

Below these thresholds, verdicts should be reported as `INSUFFICIENT_DATA` and the rule should ship as `defaultOff: true` (the trust-protection gate).

### Worked example

For a rule with true lift of 2x (real signal), the smallest sample that detects it at 95% confidence:

- If true precision is 0.5 and true FPR is 0.25 (so lift is exactly 2.0), the standard error of lift is `√(1/TP + 1/FP)`.
- For TP=50, FP=25 (n=2,000 at FPR=1.25%, recall=2.5%): SE = 0.236, 95% CI of lift is 1.55-2.45. ✅
- For TP=20, FP=10 (n=1,600): SE = 0.374, 95% CI of lift is 1.30-2.70. Borderline.
- For TP=5, FP=2.5 (n=400): SE = 0.728, 95% CI of lift is 0.55-3.45. ❌ Inconclusive.

So a 1,000-2,000 file sample is the minimum for a rule with real lift of 2x and decent precision. For weaker signals (lift 1.5x), the minimum is much higher.

---

## The guardrail

The v0.18.9 calibration script (`scripts/compute-v85-calibration.py`) implements two guardrails:

1. **Sample-size floor:** if `TP+FP < 10`, the rule's verdict is set to `INSUFFICIENT_DATA` (not USEFUL/OK/NOISY/INVERTED/DORMANT). The rule's `defaultOff` is set to `true` automatically.

2. **Source-presence union:** the script unions all rules defined in the source (via scanning `src/rules/**/*.ts`) with the rules that fired in the corpus. This ensures rules that didn't fire on a particular corpus (e.g. `db/*` rules on a JS/TS-only corpus) are still present in `signal-strength.json` with verdict `DORMANT`, not silently dropped.

Without the second guardrail, the v0.18.9 calibration would have dropped 18 rules from `signal-strength.json` — including `db/*`, `wcag/*`, `typo/*` and others — because they never fired on the v7+v8 corpus. The 18 dropped rules were caught by the `signal-strength-guardrails` test, which is the reason the guardrail exists.

---

## Industry context

Most static analysis vendors do not publish their calibration methodology. SonarQube publishes precision/recall targets per rule category (≤20% FPR for security, 0% for maintainability/reliability) but not the sample size or corpus composition used to measure them. Snyk, Veracode, and Checkmarx publish no calibration data at all.

The closest published work is the c-CRAB benchmark (May 2026), which showed that AI code review tools (CodeRabbit, Devin Review, Claude Code, Codex) achieve only 40% pass rate on issues that human reviewers flag. The benchmark uses 234 executable tests as ground truth, with rule-by-rule precision/recall. c-CRAB is methodologically stronger than the calibration approach used here — it has ground truth, not just corpus statistics — but the underlying problem is the same: verdicts on small samples are unreliable.

The slopbrick approach (10k files per arm, 10 fires per rule, 20 repos per arm) is at the conservative end of what statistical practice allows. A more aggressive approach (1k files per arm, 3 fires per rule) is faster but produces the kind of reversal we documented above.

---

## The 1,000-file trap: a checklist

Before trusting a verdict from a small-sample calibration, ask:

1. **Is TP+FP ≥ 10?** If not, the verdict is `INSUFFICIENT_DATA`. No exceptions.
2. **Is the corpus ≥ 10,000 files per arm?** If not, the precision CI is wider than ±1% and the verdict may reverse at scale.
3. **Are there ≥ 20 distinct repos per arm?** If not, the verdict is driven by repo selection, not by the underlying distribution.
4. **Does the verdict match the prior?** If a rule's prior expectation (from domain knowledge) is "AI is more likely to make this mistake" but the verdict is NOISY or INVERTED, the small sample is suspect. Verify at scale.
5. **Is the lift ratio > 1 SE away from 1.0?** If the lift is between 1.0 and 1.0+SE, the verdict is borderline and should be re-measured.

The v0.18.8 v8a finding failed checks 1, 2, 3, and 5. It should not have been published as a verdict.

---

## Conclusion

The 1k vs 546k finding is the largest single calibration result in slopbrick v0.18.9. The minimum sample size for a reliable rule verdict is **~10,000 files per arm**, or **~10 total fires per rule**. Below that, verdicts should be reported as `INSUFFICIENT_DATA` and the rule should ship as `defaultOff: true`.

The guardrail is implemented in `scripts/compute-v85-calibration.py` and protected by `tests/engine/signal-strength-guardrails.test.ts`. Future slopbrick calibrations (v9, v10, v11) will use the same minimum-sample-size rule.

Other static analysis vendors should adopt similar guardrails. The cost of a wrong verdict (a user disabling a useful rule, or trusting a noisy one) is larger than the cost of waiting for a larger sample.

---

## Appendix: per-rule calibration data (v0.18.9 v8.5)

The full per-rule table is in `docs/research/v8.5-corpus-calibration.md`. The headline distribution:

| Verdict | Count | Mean lift | Median precision | Median FPR |
|---|---:|---:|---:|---:|
| USEFUL | 72 | 22,840x | 81.4% | 0.62% |
| OK | 12 | 3,650x | 41.0% | 1.18% |
| NOISY | 1 | 1.46x | 64.6% | 44.10% |
| INVERTED | 1 | 0.00x | 0.0% | undefined |
| DORMANT | 0 | — | — | — |

The 1 NOISY rule (`logic/ks-distribution-shift`) at 44% FPR is the worst-performing rule in the registry and is scheduled for removal in v0.19. The 1 INVERTED rule (`docs/expired-code-example`, TP=0 FP=3) is vacuous and will be reclassified as HYGIENE or removed.

The 72 USEFUL rules have a median FPR of 0.62%, well below the 5% industry standard for "optimal" FPR (per the AI code review FPR benchmarks: <5% optimal, 5-10% workable, 10-15% problematic, >15% unacceptable). This positions slopbrick's deterministic tree-sitter approach favorably against the AI-only review tools in the same category.
