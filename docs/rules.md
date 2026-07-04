# SlopBrick Rule Catalog (103 Rules)

> **Authoritative reference for all 103 built-in rules.**
>
> **Authors:** slopbrick project (dystx) with Kimi Code CLI · **v0.38.0**
> **Source:** `packages/slopbrick/src/rules/builtins.ts` (103 imports)
> **Calibration:** v10 — 576,750 real files, paired Wilcoxon signed-rank
> **Source of truth:** `packages/slopbrick/src/rules/signal-strength.json`
>
> **v0.38.0 cleanup:** 37 v10-DORMANT rules were deleted. The 38th
> (`security/fail-open-auth`) was reclassified as `verdict: USEFUL`
> because v9 calibration showed 100% precision; v10's corpus simply
> lacked enough auth-handling code to fire it. See
> [`docs/methodology.md`](./methodology.md#v0380-dormant-rule-cleanup)
> and [`packages/slopbrick/CHANGELOG.md`](../packages/slopbrick/CHANGELOG.md)
> for details.

---

## Summary by Category (24 categories, 103 rules)

| Category | Count | Notes |
|---|---|---|
| `ai/*` | 16 | AI-detection heuristics (v0.1.0+ → v0.34.x refinements) |
| `logic/*` | 14 | Logic / state-management anti-patterns |
| `visual/*` | 13 | Visual entropy / spacing / color / radius |
| `security/*` | 11 | Security anti-patterns (XSS, eval, hardcoded secrets) |
| `kotlin/*` | 10 | Kotlin-specific (coroutine misuse, hardcoded creds) |
| `java/*` | 7 | Java-specific (incl. v0.35.0 + v0.35.1 content-based) |
| `db/*` | 6 | Database anti-patterns (missing indexes, naming) |
| `typo/*` | 6 | Numeric typos (calc-fontsize, clamp-offscale) |
| `dead/*` | 5 | Dead code (branch, import, local, parameter) |
| `layout/*` | 5 | Layout math entropy |
| `ts/*` | 5 | TypeScript anti-patterns |
| `wcag/*` | 5 | Accessibility (focus, target size, alt text) |
| `swift/*` | 5 | Swift-specific |
| `cpp/*` | 5 | C++-specific |
| `rust/*` | 4 | Rust-specific |
| `test/*` | 4 | Test quality (weak assertions, missing edge cases) |
| `component/*` | 3 | Component architecture |
| `docs/*` | 3 | Documentation drift |
| `dup/*` | 3 | Code duplication |
| `go/*` | 3 | Go-specific |
| `perf/*` | 3 | Performance (CSS bloat, image CLS) |
| `product/*` | 2 | Product UX |
| `arch/*` | 1 | Astro island leak |
| `context/*` | 1 | Import path mismatch |

---

## v10 Calibration Status (576,750 files, all 103 rules post-v0.38.0)

| Verdict | Count | % |
|---|---|---|
| **USEFUL** (v7/v8 + v10 production) | 72 | 51.4% |
| **OK** (v9 positive-signal) | 19 | 13.6% |
| **DORMANT** (never fired in 576k files) | 38 | 27.1% |
| **INVERTED** (fires MORE on human) | 7 | 5.0% |
| **ON by default** (`defaultOff: false`) | 19 | 13.6% |

**v10 STRONG signals (precision ≥ 70% in v10 paired Wilcoxon, p < 0.01): 57 rules**
**v10 WEAK signals (precision 50–70%): 38 rules**

---

## All 103 Rules by Category

### `ai/*` (16 rules) — AI-detection heuristics

| Rule | v10 signal | Author | Note |
|---|---|---|---|
| `ai/any-density` | dormant | dystx | Token distribution density (Shannon entropy) |
| `ai/comment-ratio` | **weak** (62.4% prec) | dystx | Comment density / code ratio |
| `ai/compression-profile` | **strong** (74.9% prec, 46.5% recall) | dystx | #1 rule by F1 (57.4) |
| `ai/console-debug-storm` | dormant | dystx | Many console.log/debug calls |
| `ai/default-react-stack` | dormant | dystx | LLM default React boilerplate |
| `ai/errors-near-eof` | weak (52.2% prec) | dystx | Errors at end of file (LLM tendency) |
| `ai/fetch-default-overuse` | dormant | dystx | Default fetch without options |
| `ai/library-reinvention` | **inverted** | dystx | LLMs don't reinvent libraries (anti-AI) |
| `ai/log-rank-histogram` | dormant | dystx | Log-rank of token frequencies |
| `ai/markdown-leakage` | dormant | dystx | Markdown syntax in code comments |
| `ai/renyi-profile` | dormant | dystx | Rényi entropy profile |
| `ai/segment-surprisal-cv` | **strong** (75.2% prec, 27.1% recall) | dystx | CV of per-segment surprisal |
| `ai/state-default-overuse` | dormant | dystx | Default state initialisations |
| `ai/tailwind-color-overuse` | **strong** (84.4% prec) | dystx | Overuse of specific Tailwind colors |
| `ai/text-like-ratio` | dormant | dystx | Text-to-code ratio |
| `ai/whitespace-regularity` | weak (46.7% prec) | dystx | Whitespace variance |

### `logic/*` (14 rules) — Logic / state-management

| Rule | v10 signal | Author | Note |
|---|---|---|---|
| `logic/bayesian-conditional` | dormant | dystx | Bayesian conditional usage |
| `logic/boundary-violation` | weak (68.5% prec) | dystx | Cross-boundary state corruption |
| `logic/ghost-defensive` | weak | dystx | Defensive code for impossible cases |
| `logic/heaps-deviation` | weak (49.9% prec) | dystx | Heaps law deviation in identifiers |
| `logic/key-prop-missing` | dormant | dystx | React key prop missing |
| `logic/math-any-density` | weak (60.8% prec) | dystx | Math any-type density |
| `logic/math-console-log-storm` | dormant | dystx | Many console.log calls |
| `logic/math-gini-class-usage` | dormant | dystx | Gini coefficient of class usage |
| `logic/math-variable-name-entropy` | dormant | dystx | Variable name entropy |
| `logic/optimistic-no-rollback` | dormant | dystx | Optimistic UI without rollback |
| `logic/qwik-hook-leak` | dormant | dystx | Qwik hook lifecycle leak |
| `logic/reactive-hook-soup` | dormant | dystx | React reactive hook soup |
| `logic/zipf-slope-anomaly` | weak (60.8% prec) | dystx | Zipf slope anomaly in token dist |
| `logic/zombie-state` | dormant | dystx | State set but never read |

### `visual/*` (13 rules) — Visual entropy

| Rule | v10 signal | Author | Note |
|---|---|---|---|
| `visual/arbitrary-escape` | dormant | dystx | Arbitrary Tailwind value escape |
| `visual/clamp-soup` | dormant | dystx | Many clamp() calls |
| `visual/generic-centering` | dormant | dystx | Generic centering (not flex/grid) |
| `visual/inline-style-dominance` | dormant | dystx | Inline styles dominate CSS |
| `visual/math-color-cluster` | dormant | dystx | Color cluster entropy |
| `visual/math-default-font` | dormant | dystx | Default font (sans-serif) |
| `visual/math-font-entropy` | dormant | dystx | Font entropy |
| `visual/math-gradient-hue-rotation` | dormant | dystx | Gradient hue rotation |
| `visual/math-rounded-entropy` | dormant | dystx | Border-radius entropy |
| `visual/math-spacing-entropy` | dormant | dystx | Spacing entropy |
| `visual/naturalness-anomaly` | weak (64.8% prec) | dystx | Unnatural visual patterns |
| `visual/radius-scale-violation` | dormant | dystx | Border-radius not on scale |
| `visual/spacing-scale-violation` | dormant | dystx | Spacing not on scale |

### `security/*` (11 rules) — Security

| Rule | v10 signal | Author | Note |
|---|---|---|---|
| `security/dangerous-cors` | dormant | dystx | `Access-Control-Allow-Origin: *` |
| `security/eval` | dormant | dystx | `eval()` usage |
| `security/exposed-env-var` | dormant | dystx | `process.env.X` exposed to client |
| `security/fail-open-auth` | OK (USEFUL, 100% prec) | dystx | Auth that fails open |
| `security/hardcoded-secret` | dormant | dystx | Hardcoded API keys |
| `security/localstorage-token` | dormant | dystx | Tokens in localStorage |
| `security/missing-auth-check` | dormant | dystx | Route without auth check |
| `security/public-admin-route` | **strong** (75.0% prec) | dystx | Public admin route |
| `security/sql-construction` | dormant | dystx | String-built SQL |
| `security/target-blank-no-noopener` | dormant | dystx | `target="_blank"` without `noopener` |
| `security/unsafe-html-render` | USEFUL (66.1% prec) | dystx | `dangerouslySetInnerHTML` without sanitisation |

### `kotlin/*` (10 rules) — Kotlin-specific

| Rule | v10 signal | Author | Note |
|---|---|---|---|
| `kotlin/coroutine-global-scope` | dormant | dystx | `GlobalScope` usage |
| `kotlin/data-class-defaults-overuse` | dormant | dystx | Data class with too many defaults |
| `kotlin/force-unwrap` | dormant | dystx | `!!` force-unwrap |
| `kotlin/hardcoded-credential` | dormant | dystx | Hardcoded credentials in Kotlin |
| `kotlin/object-singleton-misuse` | dormant | dystx | `object` keyword misuse |
| `kotlin/println-as-log` | DORMANT in v10 (was OK v9) | dystx | `println` instead of logger |
| `kotlin/println-debug` | dormant | dystx | `println("debug: ...")` |
| `kotlin/runblocking-misuse` | dormant | dystx | `runBlocking` in coroutine context |
| `kotlin/sql-string-concat` | dormant | dystx | String-concatenated SQL |
| `kotlin/string-concat-loop` | dormant | dystx | String concat in hot loop |

### `java/*` (7 rules) — Java-specific

| Rule | v10 signal | Author | Note |
|---|---|---|---|
| `java/command-injection` | dormant | dystx | `Runtime.exec` with user input |
| `java/hardcoded-credential` | dormant | dystx | Hardcoded creds in Java |
| `java/lost-stack-trace` | **OK** (new, v0.35.1) | dystx + Kimi | **Raidar-inspired** — catch block throws without cause |
| `java/sql-string-concat` | dormant | dystx | String-concatenated SQL |
| `java/suspicious-implementation` | **OK** (new, v0.35.0) | dystx + Kimi | **CoCoNUTS-inspired** — function name vs body mismatch |
| `java/system-out-println` | DORMANT in v10 (was OK v9) | dystx | `System.out.println` |
| `java/thread-sleep-in-loop` | dormant | dystx | `Thread.sleep` in loop |

### `db/*` (6 rules) — Database

| Rule | v10 signal | Author | Note |
|---|---|---|---|
| `db/duplicate-index` | dormant | dystx | Duplicate DB index |
| `db/enum-sprawl` | dormant | dystx | ENUM with too many values |
| `db/missing-fk-index` | dormant | dystx | FK column without index |
| `db/missing-not-null` | dormant | dystx | NOT NULL constraint missing |
| `db/naming-inconsistency` | dormant | dystx | DB naming inconsistency |
| `db/sql-concat` | dormant | dystx | SQL string concatenation |

### `typo/*` (6 rules) — Numeric typos

| Rule | v10 signal | Author | Note |
|---|---|---|---|
| `typo/calc-fontsize` | dormant | dystx | `calc()` with font-size |
| `typo/calc-raw-px` | dormant | dystx | `calc()` with raw px |
| `typo/clamp-offscale` | dormant | dystx | `clamp()` off scale |
| `typo/math-button-label-uniformity` | dormant | dystx | Button label length variance |
| `typo/math-cta-vocabulary` | dormant | dystx | CTA word variance |
| `typo/placeholder-text` | dormant | dystx | Placeholder text not customised |

### `dead/*` (5 rules) — Dead code

| Rule | v10 signal | Author | Note |
|---|---|---|---|
| `dead/dead-branch` | **OK** (v0.18.5+) | dystx | Unreachable branch |
| `dead/unreachable` | **OK** (v0.18.5+) | dystx | Unreachable code |
| `dead/unused-import` | weak (49.1% prec) | dystx | Unused import |
| `dead/unused-local` | dormant | dystx | Unused local variable |
| `dead/unused-parameter` | **inverted** | dystx | Unused parameter (LLMs use all params) |

### `layout/*` (5 rules) — Layout math

| Rule | v10 signal | Author | Note |
|---|---|---|---|
| `layout/forced-layout` | dormant | dystx | Forced layout (no flex/grid) |
| `layout/gap-monopoly` | dormant | dystx | Single gap value used everywhere |
| `layout/math-element-uniformity` | dormant | dystx | Element size entropy |
| `layout/math-grid-uniformity` | dormant | dystx | Grid size entropy |
| `layout/spacing-grid` | dormant | dystx | Spacing not on grid |

### `ts/*` (5 rules) — TypeScript

| Rule | v10 signal | Author | Note |
|---|---|---|---|
| `ts/enum-vs-as-const` | dormant | dystx | `enum` vs `as const` |
| `ts/excessive-type-assertion` | dormant | dystx | Too many `as` casts |
| `ts/import-type-misuse` | **strong** (83.3% prec) | dystx | `import type` misuse |
| `ts/never-vs-unknown` | dormant | dystx | `never` vs `unknown` confusion |
| `ts/optional-chain-overuse` | dormant | dystx | Overuse of `?.` |

### `wcag/*` (5 rules) — Accessibility

| Rule | v10 signal | Author | Note |
|---|---|---|---|
| `wcag/dragging-movements` | OK (40% prec) | dystx | Dragging without alternative |
| `wcag/focus-appearance` | dormant | dystx | Focus indicator missing |
| `wcag/focus-obscured` | dormant | dystx | Focus obscured by other elements |
| `wcag/missing-alt` | dormant | dystx | `<img>` without `alt` |
| `wcag/target-size` | dormant | dystx | Interactive element < 44×44px |

### `swift/*` (5 rules) — Swift

| Rule | v10 signal | Author | Note |
|---|---|---|---|
| `swift/fatal-error-thrown` | dormant | dystx | `fatalError()` in non-test code |
| `swift/force-unwrap` | dormant | dystx | `!` force-unwrap |
| `swift/implicitly-unwrapped-optional` | dormant | dystx | `T!` implicit unwrap |
| `swift/print-debug` | **weak** (lift 1.13) | dystx | `print()` debug |
| `swift/strong-self-capture` | dormant | dystx | `[strong self]` capture in closures |

### `cpp/*` (5 rules) — C++

| Rule | v10 signal | Author | Note |
|---|---|---|---|
| `cpp/c-style-cast` | **inverted** | dystx | C-style cast (LLMs use C++ casts) |
| `cpp/magic-numbers` | dormant | dystx | Magic numbers |
| `cpp/printf-debug` | DORMANT in v10 (was OK v9) | dystx | `printf` for debug |
| `cpp/raw-new-delete` | dormant | dystx | Raw `new`/`delete` |
| `cpp/using-namespace-std` | dormant | dystx | `using namespace std;` |

### `rust/*` (4 rules) — Rust

| Rule | v10 signal | Author | Note |
|---|---|---|---|
| `rust/stringly-typed` | dormant | dystx | Stringly-typed APIs |
| `rust/todo-macro` | OK (v0.18.5+) | dystx | `todo!()` macro |
| `rust/unused-pub-fn` | OK (v0.18.5+) | dystx | Unused `pub fn` |
| `rust/unwrap-in-production` | dormant | dystx | `.unwrap()` in non-test code |

### `test/*` (4 rules) — Test quality

| Rule | v10 signal | Author | Note |
|---|---|---|---|
| `test/duplicate-setup` | dormant | dystx | Duplicate test setup |
| `test/fake-placeholder` | dormant | dystx | Fake values like `42` or `"test"` |
| `test/missing-edge-case` | dormant | dystx | Test missing edge case |
| `test/weak-assertion` | **strong** (87.8% prec) | dystx | Weak test assertion (e.g. `expect(x).toBeTruthy()`) |

### `component/*` (3 rules) — Component architecture

| Rule | v10 signal | Author | Note |
|---|---|---|---|
| `component/giant-component` | dormant | dystx | Component > 500 LOC |
| `component/multiple-components-per-file` | weak (67.5% prec) | dystx | Multiple components in one file |
| `component/shadcn-prop-mismatch` | dormant | dystx | shadcn prop mismatch |

### `docs/*` (3 rules) — Documentation

| Rule | v10 signal | Author | Note |
|---|---|---|---|
| `docs/broken-link` | OK (v0.18.5+) | dystx | Broken link in docs |
| `docs/stale-function-reference` | dormant | dystx | Stale function reference |
| `docs/stale-package-reference` | OK (v0.18.5+) | dystx | Stale package reference |

### `dup/*` (3 rules) — Code duplication

| Rule | v10 signal | Author | Note |
|---|---|---|---|
| `dup/identical-block` | weak (63.7% prec) | dystx | Identical code block |
| `dup/near-duplicate` | weak (47.5% prec) | dystx | Near-duplicate code |
| `dup/structural-clone` | weak (48.7% prec) | dystx | Structural clone |

### `go/*` (3 rules) — Go

| Rule | v10 signal | Author | Note |
|---|---|---|---|
| `go/error-wrap-without-context` | dormant | dystx | `fmt.Errorf` without context |
| `go/nil-slice-vs-empty` | dormant | dystx | `nil` slice vs `[]T{}` |
| `go/struct-tag-inconsistency` | dormant | dystx | Struct tag inconsistency |

### `perf/*` (3 rules) — Performance

| Rule | v10 signal | Author | Note |
|---|---|---|---|
| `perf/cls-image` | dormant | dystx | Image without width/height (CLS) |
| `perf/css-bloat` | **strong** (77.8% prec) | dystx | CSS bloat (unused selectors) |
| `perf/halstead-anomaly` | dormant | dystx | Halstead complexity anomaly |

### `product/*` (2 rules) — Product UX

| Rule | v10 signal | Author | Note |
|---|---|---|---|
| `product/terminology-drift` | dormant | dystx | Inconsistent terminology |
| `product/ux-pattern-fragmentation` | dormant | dystx | UX pattern fragmentation |

### `arch/*` (1 rule)

| Rule | v10 signal | Author | Note |
|---|---|---|---|
| `arch/astro-island-leak` | dormant | dystx | Astro island hydration leak |

### `context/*` (1 rule)

| Rule | v10 signal | Author | Note |
|---|---|---|---|
| `context/import-path-mismatch` | **strong** (82.8% prec) | dystx | Import path doesn't match tsconfig paths |

---

## Rule lifecycle

| Phase | Version | What happens |
|---|---|---|
| **Prototype** | varies | Add rule source + unit test, `verdict: DORMANT` |
| **First calibration** | v0.18.0+ | Run against v9 corpus, set `verdict: OK` if precision ≥ 0.5 |
| **Refinement** | v0.34.2–v0.34.10 | 9 patch releases tightening regexes, excluding test files |
| **v10 re-calibration** | v0.36.1 | All 140 rules calibrated against 576k files (37 deleted in v0.38.0) |
| **Promotion** | v0.37.1+ | STRONG rules get `defaultOff: false` |
| **Deprecation** | v0.38.0+ | DORMANT rules marked deprecated |

---

## Notable rule authors

| Author | Rules | Notes |
|---|---|---|
| **dystx** | ~130 rules | slopbrick lead, v0.1.0 → v0.37.0 |
| **Kimi Code CLI** | `java/suspicious-implementation` (v0.35.0), `java/lost-stack-trace` (v0.35.1) | AI pair-programming assistant |

---

## External inspiration (with attribution)

| Rule | Inspired by | Citation |
|---|---|---|
| `java/suspicious-implementation` | CoCoNUTS (2025) | Content-based detection, paraphrasing-resistant |
| `java/lost-stack-trace` | Raidar (ICLR 2024) | Mao et al., "Raidar: GeneRative AI Detection viA Rewriting" |

---

## See also

- `docs/methodology.md` — full calibration methodology (v1–v8.5 era-confounded, v9 era-controlled, v10 paired Wilcoxon)
- `docs/maths.md` — all mathematical foundations (Bayesian, Zipf, Heaps, Shannon, Wilcoxon, etc.)
- `packages/slopbrick/CHANGELOG.md` — rule additions by version
- `src/rules/signal-strength.json` — v10 calibration data for all 103 rules (v0.38.0)
