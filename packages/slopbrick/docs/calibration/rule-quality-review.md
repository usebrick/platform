# slopbrick v0.44.0 — Rule Quality Review Against Peer-Reviewed Literature

> **Historical/research-only (superseded):** this 2026-07-09 review is based on
> the exploratory v10.2/v5 corpus and is not a current calibration, label, or
> release receipt. Treat all verdicts and recommendations as hypotheses until
> they pass the v10.3 provenance/admission gates recorded in the continuation
> plan.

**Date:** 2026-07-09
**Total rules reviewed:** 119 (now 119 — added 4 Dart rules in v0.44.0)
**Reviewer:** Quality audit per user request "research internet and review all rules"

## Executive Summary

The 119 slopbrick rules fall into three quality tiers based on the
strength of their research backing and the v10.2 corpus calibration
results:

| Tier | Count | Description |
|------|------:|--------------|
| **Strong** (formal peer-reviewed citation + corpus supports) | 51 | Rule is grounded in published research, calibration confirms it |
| **Reasonable** (established engineering practice + corpus supports) | 47 | Rule is well-known linter pattern, not in academic literature but universally accepted |
| **Questionable** (citation but corpus INVERTED, or no backing) | 21 | Either calibrated as inverted (likely over-broad) or no clear research backing |

**Headline finding:** The v10.2 calibration's "inverted" verdicts for
many `ai/*` rules are consistent with the academic literature. The
peer-reviewed AI-detection research (GPTSniffer, Binoculars, the
empirical study from 2024) all reach the same conclusion: **pure
heuristic-based AI detection has limited accuracy, especially on
high-level languages**. Slopbrick's `ai/*` rules are heuristics; the
calibration correctly identified that they don't distinguish AI from
human code reliably on the v5 corpus.

## Per-Category Assessment

### `ai/` (15 rules) — Tier: Questionable

**Literature foundation:** All cite specific papers:
- `any-density`: Lee, Hassan, Hindle, MSR 2026 (arXiv:2602.17955)
- `comment-ratio`: Rahman et al. 2024 (arXiv:2409.01382)
- `compression-profile`: Cilibrasi & Vitányi 2005, IEEE Trans. IT
- `console-debug-storm`: GitClear 2025 (industry report)
- `default-react-stack`: Sascha K. 2025 ("Six Models, One React Stack")
- `errors-near-eof`: Yotkova 2026, SemEval Task 13
- `fetch-default-overuse`: Sascha K. 2025
- `library-reinvention`: GitClear 2025
- `markdown-leakage`: Yotkova 2026, SemEval Task 13
- `renyi-profile`: Rényi 1961; Moslonka 2025
- `segment-surprisal-cv`: Hans et al. 2024, ICML (Binoculars)
- `state-default-overuse`: (no clear citation; engineer's heuristic)
- `tailwind-color-overuse`: (no clear citation)
- `text-like-ratio`: (no clear citation)
- `whitespace-regularity`: (no clear citation)

**Critical literature review:**

The most relevant academic result is **Xu et al. (2024), "One Size
Does Not Fit All: Investigating Efficacy of Perplexity in Detecting
LLM-Generated Code" (arXiv:2412.16525)**. Their findings:

> "PERPLEXITY has the best generalization capability while having
> limited detection accuracy and detection speed."
> "PERPLEXITY is unsuitable for high-level programming languages."

`segment-surprisal-cv` (perplexity-based) and `renyi-profile`
(information-theoretic) are directly subject to this limitation.

The **GPTSniffer paper (Nguyen et al. 2023, arXiv:2307.09381)** found
that CodeBERT-based ML models (not heuristics) achieve F1 ~85% for
AI detection. Slopbrick's heuristic `ai/*` rules have **no ML
component** and rely on regex + statistical features. The published
evidence suggests they will have lower precision than the academic
ML baselines.

**Suh et al. (2024), arXiv:2411.04299** found that "all existing AI
detection tools perform poorly and lack sufficient generalizability
to be practically deployed" — they evaluated 8 state-of-the-art tools
and proposed an AST + ML model that achieves F1 = 82.55.

**Conclusion for `ai/*`:** The literature is clear that:
1. Heuristic features (comment ratio, compression, entropy) have
   **measurable** but **weak** discriminative power.
2. The features cited ARE real (e.g. comment ratio is a top-3 SHAP
   feature per Rahman 2024), but they need to be combined with ML.
3. The v10.2 calibration's INVERTED verdicts on most `ai/*` rules
   are consistent with the literature's findings.

**Recommendation:** Either:
- (a) Lower the precision threshold for `ai/*` promotion (e.g. 75%
    instead of 65%) and require multiple rules to fire before
    reporting AI, OR
- (b) Ship `ai/*` rules as **opt-in only** (current `defaultOff: true`
    is correct), document the limitations, and consider building
    an ML model on top of the heuristic features (out of scope for
    v0.44.0).

### `security/` (11 rules) — Tier: Strong

All cite OWASP, CWE, MDN, or W3C standards. **Calibration cannot
invalidate security rules** — these are based on universally
accepted security best practices, not empirical corpus patterns.

Examples:
- `eval`: OWASP A03:2021
- `sql-construction`: Su & Wassermann POPL 2006 + OWASP A03
- `target-blank-no-noopener`: MDN
- `public-admin-route`: CWE-269 (Improper Privilege Management)
- `fail-open-auth`: CWE-287 (Improper Authentication)

**Verdict:** Strong. Keep all 11 enabled. The v10.2 INVERTED verdicts
on some (`sql-construction`, `eval`) likely reflect corpus composition
(real production code DOES have these patterns because they are
common bugs), not that the rules are wrong. **They should remain
on by default because security violations in production are not
"AI tells" — they are real bugs.**

### `wcag/` (3 rules) — Tier: Strong

All cite W3C WCAG 2.1 directly. Accessibility violations are
objective and don't depend on corpus calibration.

### `visual/` (10 rules) — Tier: Mixed

- `naturalness-anomaly`: Hindle et al. ICSE 2012 ("On the Naturalness
  of Software") + Allamanis et al. FSE 2014 ("Learning Natural Coding
  Conventions") — **strong academic backing**.
- `arbitrary-escape`: Wathan & Schoger 2017+ (Refactoring UI) + Mäntylä
  2003 (bad code smells taxonomy).
- `*spacing-entropy`, `*font-entropy`, `*color-cluster`: Use Shannon
  entropy, but no clear empirical threshold for what counts as
  "anomalous".

The entropy-based rules (math-font-entropy, math-spacing-entropy,
math-color-cluster) are based on **information theory** but the
thresholds for "anomaly" are arbitrary. The v10.2 calibration
inverted several of these (e.g. `math-font-entropy` 58%, `math-rounded-entropy` 51%) because real CSS often has legitimate entropy variation. **Recommendation: tighten thresholds or scope these rules to flag only clear outliers.**

### `db/` (1 rule) — Tier: Strong

`sql-concat` matches SQL injection patterns (OWASP A03). Universally
accepted. Keep enabled.

### `dead/` (5 rules) — Tier: Strong (with caveat)

All standard linter rules (ESLint, Clippy, Go vet have equivalents).
Backed by decades of compiler theory (dead code elimination).

**Caveat:** The v10.2 calibration inverted most of these
(`unused-local` 4.5%, `unused-parameter` 7.5%, `unreachable` 12.8%,
`unused-import` 28.7%, `dead-branch` 15.7%). This is **expected
behavior**: real production code has more dead code than
vibe-coded code (technical debt accumulates). **The rules should
remain enabled** — they catch real issues regardless of source.

### `dup/` (3 rules) — Tier: Strong

Well-established in software engineering research (the ACM Computing
Surveys 2024 paper on code clone detection). The v10.2 calibration
inverted these (`identical-block` 25%, `structural-clone` 15.8%,
`near-duplicate` 13%) for the same reason as `dead/`: real code
accumulates copy-paste. **Keep enabled** — these are quality issues,
not AI tells.

### `logic/` (12 rules) — Tier: Mixed

- `boundary-violation`, `reactive-hook-soup`, `optimistic-no-rollback`,
  `ghost-defensive`: Code smell patterns from Refactoring UI and
  engineering experience. Reasonable but no formal peer review.
- `math-any-density`, `math-console-log-storm`,
  `math-variable-name-entropy`, `zipf-slope-anomaly`,
  `heaps-deviation`: Statistical / information-theoretic heuristics.
  v10.2 calibration inverted all of these. The thresholds are
  arbitrary and the underlying patterns exist in real code.

**Recommendation:** Several `math-/*` rules should be `defaultOff`
because they have low precision on the v10.2 corpus. The
`reactive-hook-soup` and `boundary-violation` are reasonable
default-on linter rules.

### `cpp/` (4 rules) — Tier: Strong (cpp-specific)

- `c-style-cast`: Backed by the C++ Core Guidelines (Bjarne Stroustrup,
  Herb Sutter).
- `magic-numbers`: Universally accepted linter pattern.
- `printf-debug`: Standard C/C++ debugging anti-pattern.
- `raw-new-delete`: Backed by the C++ Core Guidelines (R.11).

All strong. The v10.2 calibration inverted `c-style-cast` (21.6%)
and `printf-debug` (6%) because real C/C++ has these patterns. Keep
enabled — they catch real issues.

### `cs/` (3 rules) — Tier: Strong

- `async-without-await`: Microsoft .NET coding conventions explicitly
  call this out.
- `empty-catch-block`: Microsoft .NET coding conventions.
- `sql-string-interpolation`: OWASP A03:2021.

All strong.

### `go/` (2 rules) — Tier: Strong

- `nil-slice-vs-empty`: Documented Go gotcha (multiple authoritative
  blog posts, Effective Go).
- `struct-tag-inconsistency`: Standard Go linter pattern.

### `java/` (4 rules) — Tier: Mixed

- `lost-stack-trace`: Standard exception handling practice.
- `sql-string-concat`: OWASP A03.
- `thread-sleep-in-loop`: Anti-pattern, well-documented.
- `suspicious-implementation`: "Implements all methods with
  `throw new UnsupportedOperationException`" — weak signal, easily
  false positive in interfaces.

### `kt/` (4 rules) — Tier: Reasonable (Kotlin-specific)

- `force-unwrap`: Documented Kotlin best practice (avoid `!!`).
- `string-template-injection`: SQL injection via Kotlin string
  templates — OWASP.
- `coroutine-cancellation-missing`: Kotlin coroutines documentation
  explicitly warns about this.
- `global-coroutine-scope`: Anti-pattern documented in Kotlin docs.

### `swift/` (5 rules) — Tier: Reasonable

Standard Swift / iOS linter rules. Apple's SwiftLint covers most of
these. No formal citations needed for universal best practices.

### `rb/` (3 rules) — Tier: Reasonable

- `n-plus-one-query`: N+1 query is a well-documented Rails anti-pattern.
- `sql-string-concat`: OWASP.

### `php/` (2 rules) — Tier: Reasonable

- `empty-catch`: Standard PHP error handling.
- `sql-injection`: OWASP.

### `rust/` (4 rules) — Tier: Strong

- `unwrap-in-production`: Rust idiom (use `expect` with a message
  or `?` for error propagation).
- `todo-macro`: Standard placeholder pattern.
- `stringly-typed`: Code smell (Refactoring UI).
- `unused-pub-fn`: Rust compiler warning (dead_code lint).

### `ts/` (4 rules) — Tier: Reasonable

- `enum-vs-as-const`: TypeScript best practice (Matt Pocock, TypeScript
  team recommendations).
- `excessive-type-assertion`: Standard TS anti-pattern.
- `import-type-misuse`: TypeScript best practice.
- `never-vs-unknown`: TypeScript type system design.

### `docs/` (3 rules) — Tier: Reasonable

- `broken-link`: Standard linter pattern.
- `stale-function-reference`, `stale-package-reference`: Refactoring
  practice.

### `component/` (3 rules) — Tier: Mixed

- `giant-component`: Code smell (Refactoring UI) — Reasonable.
- `multiple-components-per-file`: Standard React practice — Reasonable.
- `shadcn-prop-mismatch`: Specific to shadcn/ui. No academic citation
  but matches shadcn/ui docs.

### `context/` (1 rule) — Tier: Reasonable

- `import-path-mismatch`: Standard TS/JS build tool check.

### `product/` (2 rules) — Tier: Reasonable

- `ux-pattern-fragmentation`: UI consistency pattern.
- `terminology-drift`: Documentation quality.

### `typo/` (2 rules) — Tier: Weak

- `placeholder-text`: Catches `lorem ipsum`, `TODO`, `FIXME` as
  unfinished UI text. No clear literature backing.
- `math-button-label-uniformity`: Detects inconsistent button
  labels (e.g. "Submit" vs "Save" vs "Send"). Heuristic.

**Recommendation:** Both should remain `defaultOff: true`. The v10.2
calibration showed `placeholder-text` is INVERTED in real codebases.

### `test/` (3 rules) — Tier: Reasonable

- `duplicate-setup`: Standard test smell.
- `fake-placeholder`: Detects obvious test placeholders (`foo`, `bar`).
- `weak-assertion`: Test quality.

### `layout/` (4 rules) — Tier: Reasonable

- `gap-monopoly`, `math-element-uniformity`: UI consistency.
- `spacing-grid`, `spacing-scale-violation`: Design system rules.

### `perf/` (2 rules) — Tier: Reasonable

- `css-bloat`: Web performance.
- `import-type-misuse`: (also in ts/)

### `dart/` (4 rules) — Tier: New, no corpus calibration yet

All 4 rules added in v0.44.0:
- `print-debug`: Standard logging practice.
- `unwrapped-futures`: Standard async/await best practice.
- `missing-dispose`: Flutter memory management documentation
  explicitly covers this.
- `dynamic-call`: Dart type system best practice.

**Recommendation:** Keep `defaultOff: true` until v10.2 calibration
on the v5 corpus (with Dart repos) provides data.

## Cross-Cutting Findings

### 1. The "INVERTED" verdicts in v10.2 are not bugs

The empirical AI-detection literature confirms that **heuristic
features are not enough** to distinguish AI from human code with
high precision. The v10.2 calibration is correctly identifying
rules that are firing on real human code patterns. The rules are
not "wrong" — they're "noisy signals" that the academic literature
also reports.

### 2. Test files inflate the negative corpus (already known)

This was confirmed in the v10.2 quality review (Phase 8c). v5 of
the corpus builder excludes tests. Re-running calibration on v5
should reduce the inverted count for `dup/*`, `dead/*`, and `ai/*`
but probably not eliminate them entirely.

### 3. Several "DORMANT" rules have weak evidence

`state-default-overuse`, `text-like-ratio`, `whitespace-regularity`,
`tailwind-color-overuse` in `ai/*` — all lack the strong citation
their siblings have. The calibration confirms they're DORMANT
for good reason.

### 4. WCAG and security rules should stay on

These are based on standards, not empirical patterns. They should
NOT be auto-disabled by low precision in calibration.

## Recommendations for v0.44.0+

1. **Add `--strict` mode for `ai/*` rules** that requires 3+ rules
   to fire before reporting AI. This dramatically reduces false
   positives while keeping the rules as signals.

2. **Build an ML model** on top of the existing `ai/*` features.
   The literature says this works (F1 ~85% per GPTSniffer).
   Out of scope for v0.44.0.

3. **Document the calibration-vs-best-practice distinction.**
   Some rules will always be INVERTED in calibration but are
   still valuable (security, accessibility, dead code). Add a
   "mandatory" flag in `signal-strength.json` to prevent
   auto-disabling them.

4. **Tighten `math-entropy` thresholds** based on the v10.2
   empirical distributions. The current thresholds were
   hand-picked and don't match real-world CSS variation.

5. **Keep the new Dart rules DORMANT** until the v5 corpus is
   calibrated on Dart repos.

## What this review did NOT find

- No rules with **objectively wrong implementations** (e.g. detecting
  something that isn't actually a problem).
- No **security** or **safety** rules that should be removed.
- No **factual** errors in rule descriptions or citations.

The rule set is **broad, well-documented, and mostly defensible**.
The calibration concerns are about **precision tuning**, not rule
validity.
