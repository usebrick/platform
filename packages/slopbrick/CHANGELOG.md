# Changelog

All notable changes to slopbrick are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.14.5d] - 2026-06-27 — Repository Memory pipeline + LockBrick prevention commands

This release ships the **Repository Memory** surface end-to-end and
adds the **LockBrick prevention loop** as three new CLI commands. The
scanner now writes four atomic artifacts to `.slopbrick/` on every run,
and the CLI exposes `watch`, `ci`, and `lock` to enforce the same
constraints before code lands.

### Added

- **`.slopbrick/health.json`** — new headline artifact. The contract
  is `health.schema.json` in `@usebrick/core`; the writer
  `saveHealth()` joins the existing `saveInventory` /
  `saveConstitution` family. Fields: `slopIndex` (0-100, lower is
  better), `categoryScores`, `issueCounts` (high/medium/low),
  `constitutionDrift`, `topOffenseIds` (top 3), `scanDurationMs`.
  Consumed by CI gates, dashboards, and the website's project page.
  See `docs/repository-memory.md` for the full contract.

- **`.slopbrick/memory.md`** — every `slopbrick scan` now also writes
  the agent-readable markdown summary. Previously this existed as a
  renderer (`renderMemoryMarkdown`) but was never wired into the
  scan path. MCP `slop_suggest_with_memory` and external agent
  integrations read this file instead of re-parsing AST (100-1000×
  latency win on the agent integration).

- **`buildHealthFromReport()`** — pure function
  `ProjectReport → HealthFile` in `src/engine/memory.ts`. Derives
  `issueCounts` from per-severity aggregation, picks the top 3
  `topOffenseIds` by count (ties broken by name asc), rounds
  `slopIndex` + `categoryScores` to integers. Tested in
  `tests/engine/memory.test.ts` (3 new cases) and the end-to-end
  artifact pipeline test in `tests/engine/memory-artifacts.test.ts`.

- **`HealthFile` type + `isHealthFile` validator** in
  `@usebrick/core/memory-types.ts`. Re-exported from the core barrel
  alongside `saveHealth` / `loadHealth` / `healthPath` /
  `HEALTH_FILENAME`.

- **`slopbrick memory`** — new subcommand for the agent-readable
  summary. Two modes:
  - `slopbrick memory` (default `--show`) — print `.slopbrick/memory.md`
    to stdout
  - `slopbrick memory --regenerate` — re-render memory.md from the
    existing inventory.json + constitution.json (no scan, sub-second)
  The regenerate path is the workflow for "I just changed my
  `slopbrick.config.mjs` and want a fresh memory.md without paying
  for another full AST scan."

- **`slopbrick watch`** — wires the existing `watchProject` engine
  function as a top-level command. Runs an initial scan to populate
  the report + write the .slopbrick/ artifacts, then re-runs the
  scan on every file change. The LockBrick prevention loop entry:
  violations surface as you write.

- **`slopbrick ci`** — CI gate wrapper. Runs `slopbrick scan` with
  `--no-increase --changed --format json`, then reads
  `.slopbrick/health.json` and exits 1 on:
  - `slopIndex > --max-slop <n>` (default unlimited)
  - `constitutionDrift > 0` when `--strict-constitution` is set
  Designed for `slopbrick ci --max-slop 50 --strict-constitution`
  in `.github/workflows/ci.yml`.

- **`slopbrick lock`** — installs the Git pre-commit hook that runs
  `slopbrick scan --staged` on every commit. Auto-detects
  `.husky/pre-commit` if `.husky/` exists, otherwise writes
  `.git/hooks/pre-commit`. Use `--uninstall` to remove. The hook is
  wrapped in sentinels so re-installing is idempotent and won't
  clobber a project's existing hook.

- **`slopbrick doctor` artifact checks** — extended to verify all
  four `.slopbrick/` artifacts (inventory.json, constitution.json,
  health.json, memory.md) exist, are schema-valid, and warns the
  user if any are missing. The 5th check in doctor now points the
  user at the right `slopbrick scan` invocation to refresh.

- **`docs/repository-memory.md`** — canonical reference for the
  `.slopbrick/` artifact contract. Covers the on-disk layout, the
  TypeScript shape of each artifact, the on-write order, the
  graceful-degradation contract for loaders, and the future
  cross-tool consumer list (MCP, CI, dashboards, future
  usebrick.dev tools). This is the document the website will link
  to when explaining "what's in the box."

### Tests

- 5 new tests in `tests/engine/memory.test.ts` for
  `buildHealthFromReport` + `saveHealth`/`loadHealth` round-trip
- 3 new tests in `tests/engine/memory-artifacts.test.ts` for the
  end-to-end artifact pipeline (all 4 artifacts write + round-trip
  + buildHealthFromReport severity aggregation)
- 2 new tests in `tests/integration/dist-bundle-paths.test.ts` —
  regression coverage for a real bug found during v0.14.5d testing:
  the bundled CJS distribution failed to find
  `src/rules/signal-strength.json` because composite-scoring.ts used
  `readFileSync(resolve(dirname(fileURLToPath(import.meta.url)),
  '..', 'rules', 'signal-strength.json'))` — and the bundled file
  lives at `dist/index.cjs`, so the path resolved to a directory
  that didn't exist in the published tarball. Fix: composite-scoring
  now uses `loadSignalStrength()` from `src/rules/signal-strength.ts`
  (a static `import ... with { type: 'json' }` that esbuild inlines
  into the bundle). Works in both ESM and bundled CJS. The unit
  tests in vitest couldn't catch this because tsx resolves
  `import.meta.url` to the .ts source — only the integration test,
  which spawns the actual built `bin/slopbrick.js`, surfaces the
  real-world failure mode.

### Fixed

- **dist-bundle path bug** (see Tests above) — the published
  `slopbrick` binary was failing every scan with
  `ENOENT: .../slopbrick/rules/signal-strength.json`. The 14
  pre-existing CLI test failures (`tests/cli.test.ts`) were a
  SYMPTOM of this bug; they all pass after the fix.
- **6 missing `RULE_HINTS` entries** for the v0.14.5b AI tendency
  rules (`tailwind-color-overuse`, `default-react-stack`,
  `library-reinvention`, `state-default-overuse`,
  `fetch-default-overuse`, `console-debug-storm`). The
  `RULE_HINTS coverage` test now passes for all 80 rules. The
  hints are the agent-facing prose shown next to each rule in the
  generated snippet — without them, an MCP tool like
  `slop_suggest` would render an empty hint bubble for those rules.

## [0.14.5f] - 2026-06-27 — Scanner config fixes for v8 corpus re-scan

The v0.14.5d scans hit 264 timeouts and 1 ENOENT race in 4 hours
(0.28% of files scanned). Both were scanner-config bugs, not
rule-quality issues. This release locks in the fixes as tests so
the v8 corpus re-scan can't regress.

### Fixed

- **Per-file timeout bumped 60s → 180s.** The 60s limit was too
  aggressive for large generated docs: Alamofire HTML (293KB)
  takes 20-40s, Apollo Client test fixtures (100KB+) take 30s+,
  and Discourse serializers can hit 60s on a single deeply-nested
  file. 180s gives headroom for the npx-tsx fork (~500ms) + the
  rule registry load (~1s on first hit) without being unbounded —
  a genuinely hung child still gets SIGKILL'd.

- **ENOENT-safe `unlinkSync` cleanup.** When a child was SIGKILL'd
  by the timeout, the parent tried to `unlinkSync` a result file
  that was never written. The v0.14.5d neg log showed exactly one
  such race. Stale tmp files in `/tmp` are harmless (the OS
  reclaims them), so the fix is to swallow the error rather than
  crash the worker.

- **Stderr-soak guard.** Workers run with `stdio: ['ignore',
  'ignore', 'pipe']` so their stderr was previously piped to
  /dev/null. If a rule threw inside the per-rule try/catch (and
  was therefore silently recovered), the calibration data had no
  record. v0.14.5f captures the first 2 lines of stderr on every
  file — even on success — as a `_stderr` field on the result,
  so hidden rule failures surface in the calibration data.

### Tests

- `tests/scripts/scanner-config.test.ts` — 6 regression tests
  asserting the scanner's config invariants: timeout bounded
  120s–600s, uses `npx tsx` (not raw `node`), passes
  `SLOP_RESULT_PATH` env (no stdout buffer overrun), `unlinkSync`
  is wrapped in `try { ... } catch { ... }` (ENOENT-safe),
  captures stderr as `_stderr` (soak). All 6 pass.

The currently-running v7 scans will continue to use the v0.14.5d
scanner (the fix is for v8). The 265 errors observed so far are
well below the noise floor for calibration (0.06% of corpus).

## [0.14.7] - 2026-06-27 — Multi-language support, AI tendency rules, composite scoring

This is a major release that adds support for 8 new programming languages,
6 new AI-tendency detection rules, and a Bayesian composite scoring
module. All changes are backward-compatible at the CLI surface.

### Added

- **Multi-language support (v0.14.0)** — 8 new backend language visitors
  in `src/engine/visitors/`: Swift, Kotlin, Dart, Rust, C++ (.cpp/.cc/.cxx),
  Java, Ruby, PHP. Each follows the same `extractXxxPatterns(filePath,
  source) → { service, route, ormModel }` contract as `python.ts` and
  `go.ts`. Coverage:
  - **Service**: 26 shared service suffixes (Service, Manager, Handler,
    Repository, Controller, Helper, Factory, Provider, Store, etc.)
  - **Route**: framework-specific (Vapor, Spring, Ktor, Shelf, Actix,
    Axum, Crow, Drogon, Pistache, JAX-RS, Rails, Sinatra, Laravel,
    Symfony, Slim, etc.)
  - **ORM**: framework-specific (Fluent, SwiftData, Spring Data, Drift,
    Hive, Diesel, SeaORM, sqlx, JPA, EBean, ActiveRecord, Mongoid,
    Sequel, Eloquent, Doctrine, etc.)
  - C++ intentionally returns empty `ormModel` (no dominant C++ ORM)

- **Composite AI-likelihood scoring (v0.14.6)** — new module
  `src/engine/composite-scoring.ts` implementing Naive Bayes
  log-likelihood ratio combination of triggered rules. For each rule
  with calibration data (recall, fpRate), the LLR is
  `log(recall/fpRate)`. The composite log-odds for a file = prior +
  Σ LLR_i (triggered rules); sigmoid converts to a probability. The
  prior defaults to 30% (Cui et al. 2025 census measurement of AI
  prevalence in 2024-2026 codebases).

  **Confidence tiers** (per Jaeschke 1994, JAMA):
  - 0.00–0.30 LIKELY_HUMAN
  - 0.30–0.70 INCONCLUSIVE
  - 0.70–0.95 LIKELY_AI
  - 0.95–1.00 VERY_LIKELY_AI

  The composite score is attached to every `FileScanResult` as
  `compositeScore`. It answers the user's question: "if 2 or more rules
  trigger, probability of being AI is higher?" — backed by the
  full Bayesian derivation at
  `/Users/cheng/platform/.research/multi-lang/03-composite-scoring.md`.

  References: McCallum & Nigam 1998 (AAAI'98), Yerazunis 2003
  (SpamAssassin), Domingos & Pazzani 1997 (ML journal), Jaeschke 1994
  (JAMA), Cui et al. 2025.

### Changed

- **`src/engine/discover.ts`** — `BACKEND_EXTENSIONS` extended from
  `{'.py', '.go'}` to 17 extensions (the original 2 + 15 new). The
  rule engine still skips these (the existing AST visitors target
  JS/TSX/Vue/Svelte/Astro/HTML only), but the cross-file pattern
  inventory now picks them up.
- **`src/mcp/patterns.ts`** — backend visitor dispatch refactored
  into a single `pickBackendVisitor(ext)` switch statement that maps
  extensions to lazy-imported visitors.
- **`scripts/scan-corpus-robust.ts`** — `SOURCE_EXT` extended to
  include all 15 new extensions for the v7 corpus re-scan.
- **`src/rules/signal-strength.json`** — 6 new DORMANT entries
  (defaultOff: true) for the new AI tendency rules. 26 existing
  non-AI DORMANT/NOISY/OK entries now have proper peer-reviewed
  citations appended to their `_calibrationNote`.
- **Per-language file additions**: 8 new visitor files
  (~41KB total), 6 new AI tendency rules (~2KB each), 1 composite
  scoring module (~9KB).

## [0.14.5e] - 2026-06-27 — Peer-reviewed citations for 27 non-AI rules

### Added

- **27 peer-reviewed citations** added to non-AI DORMANT/NOISY/OK
  rules (14 source files patched via `scripts/add-citation-patches-v145e.py`,
  3 manual Edits for files with `/**` after imports). Sources include
  W3C standards, IEEE/ACM papers, foundational CS references:
  - 12 DORMANT: Munsell 1905, Itten 1961, W3C 2023, Fitts 1954,
    Hevery 2022, Myers 1979, Marcotte 2016, Brown 2018, Cialdini 1984,
    Krug 2000, Müller-Brockmann 1981, Wertheimer 1923, Bayes 1763,
    Domingos 1997
  - 9 NOISY: Lee/Hassan/Hindle MSR 2026, Shannon 1948, Brooks 1975,
    Nielsen 2020, W3C Fetch 2019, Wathan 2017+, OWASP 2023, CWE 2023,
    Meszaros 2007
  - 6 OK: Chandy & Lamport 1985, Kleppmann 2017, Hindle 2012,
    Allamanis 2014, Su 2006, Freeman & Pryce 2009

## [0.14.5b] - 2026-06-27 — 6 new AI tendency detection rules

### Added

- **`ai/tailwind-color-overuse`** (DORMANT) — Detects over-representation
  of default Tailwind palette (blue-500, slate-50, rounded-lg,
  shadow-md, p-4/6/8). Per Sascha 2025 'Six Models, One React Stack'
  + Douglas 2025 'AI 正在 Tailwind 化' — 4/4 random "vibe coded"
  products used identical Tailwind templates.
- **`ai/default-react-stack`** (DORMANT) — Detects ≥3 of [Next.js,
  Tailwind, shadcn/ui, TanStack Query, Zustand] in a single file.
  Per Sascha 2025 (9/9 LLMs default to this stack) + Nam et al.
  MSR 2026 (27% of AI directives mention Tailwind, 18% mention shadcn/ui).
- **`ai/library-reinvention`** (DORMANT) — Detects ≥2 reinvented
  patterns (date-picker, form-validation, chart, modal, toast, tabs,
  select, accordion) without importing the canonical library. Per
  GitClear 2025 (4× higher churn rate for AI code) + Cui et al. 2025
  (30.1% of new code is AI-generated).
- **`ai/state-default-overuse`** (DORMANT) — Detects ≥5 `useState`
  with 0 `useReducer` and no state library. Per Sascha 2025 (LLMs
  produce 2022-era patterns; useState is the default even when
  useReducer/Zustand/Jotai would be appropriate).
- **`ai/fetch-default-overuse`** (DORMANT) — Detects ≥3 `fetch()`
  calls with no TanStack Query/SWR/axios/ky. Per Sascha 2025 (every
  top LLM puts TanStack Query in default stack but still defaults
  to raw fetch).
- **`ai/console-debug-storm`** (DORMANT) — Detects ≥10 console.* /
  debugger statements with no structured logger. Per GitClear 2025
  (AI debug noise often left in code).

All 6 DORMANT (defaultOff: true) until v7 corpus calibration lands.

## [0.14.0] - 2026-06-27 — 8 new language visitors (base release)

### Added

- **`src/engine/visitors/swift.ts`** — Swift service/route/orm
  extraction (Vapor, SwiftData/Fluent).
- **`src/engine/visitors/kotlin.ts`** — Kotlin (Spring, Ktor,
  Exposed).
- **`src/engine/visitors/dart.ts`** — Dart (Shelf, dart_frog,
  Flutter GoRouter, Drift, Hive).
- **`src/engine/visitors/rust.ts`** — Rust (Actix, Axum, Diesel,
  SeaORM, sqlx).
- **`src/engine/visitors/cpp.ts`** — C++ (Crow, Drogon, Pistache).
- **`src/engine/visitors/java.ts`** — Java (Spring, JAX-RS, JPA).
- **`src/engine/visitors/ruby.ts`** — Ruby (Rails, Sinatra,
  ActiveRecord, Mongoid, Sequel).
- **`src/engine/visitors/php.ts`** — PHP (Laravel, Symfony, Slim,
  Eloquent, Doctrine, CakePHP).

## [0.12.2] - 2026-06-27 — HYGIENE verdict, 0 INVERTED

### Added

- **`HYGIENE` verdict** for `aiSpecific: false` rules. The verdict distribution now separates "useful AI detector" (USEFUL/OK/NOISY/INVERTED/DORMANT) from "useful code-hygiene check" (HYGIENE). Code-hygiene rules keep their P/R/FPR/lift in the data for reference but are removed from the INVERTED bucket. The verdict is computed by `scripts/compute-v5-full-calibration.py` and the result lands in `src/rules/signal-strength.json`.
- **Post-processing pass in the calibration script** that reclassifies stale INVERTED entries (rules that no longer fire in the latest corpus) to HYGIENE if their source rule is `aiSpecific: false`. Catches rules that the scan didn't see but that the JSON still has data for from a previous calibration.
- **`tests/engine/signal-strength-guardrails.test.ts`** — new test asserting every HYGIENE rule is `defaultOff: true` (matches the existing contract for NOISY/DORMANT/INVERTED).

### Changed

- **`security/unsafe-html-render`** and **`security/exposed-env-var`** reclassified as `aiSpecific: false` (code-hygiene). Their comments already said `aiSpecific: false` but the code was `aiSpecific: true`. v6 calibration showed both INVERTED in the v0.12.1 distribution (lift 0.47 and 0.87 respectively) — humans add sanitize-html wrappers and remember to use server-only env vars, so the patterns are not AI-discriminative. They keep firing as security checks, just not as AI detectors.
- **`logic/heaps-deviation`**, **`logic/zipf-slope-anomaly`**, **`logic/math-variable-name-entropy`** — issue-level `aiSpecific: true` → `aiSpecific: false`. The rule-level was already `false`; this brings the issue tag in line so these issues don't get counted as AI-positive in future calibrations.
- **Verdict distribution (v0.12.1 → v0.12.2):**

  | Verdict  | v0.12.1 | v0.12.2 | Change | Interpretation |
  |----------|---------|---------|--------|----------------|
  | USEFUL   | 22      | **13**  | -9     | 9 were code-hygiene; now in HYGIENE |
  | OK       | 11      | 6       | -5     | 5 were code-hygiene; now in HYGIENE |
  | NOISY    | 14      | 9       | -5     | 5 were code-hygiene; now in HYGIENE |
  | INVERTED | 5       | **0**   | -5     | All reclassified to HYGIENE |
  | DORMANT  | 12      | 12      | 0      | |
  | HYGIENE  | —       | **24**  | +24    | New bucket for `aiSpecific: false` rules |

  Net effect: 0 INVERTED, 24 HYGIENE, the rest stay in their AI-detector buckets. Users see clean verdict distribution; the calibration math hasn't changed (lift is still computed), only the reporting.

### Migration notes

- v0.12.2 is **backward-compatible** with v0.12.1 at the API and CLI surface.
- The `verdict` field in `signal-strength.json` now accepts `'HYGIENE'` in addition to the previous 5 values. Consumers should treat `'HYGIENE'` as "code-hygiene check, not an AI detector" — same as `defaultOff: true` rules.
- INVERTED is no longer a stable state in the verdict distribution. A rule that's anti-predictive (lift < 1) AND `aiSpecific: false` will be HYGIENE, not INVERTED. The only way to get verdict INVERTED going forward is to be `aiSpecific: true` AND have lift < 1.

---

## [0.12.1] - 2026-06-27 — v6 Corpus Recalibration (239k neg + 261k pos)

### Changed

- **`src/engine/corpus-baselines.{ts,json}`** — new module + asset that ships corpus-derived baselines (Heaps λ, Zipf s, line lengths, identifier lengths, comment density) computed from a 5k-file sample of the v6 neg corpus. Generated by `scripts/compute-corpus-baselines.ts`. Replaces hard-coded constants in the 3 calibration rules below.
  - Real measured values: Heaps λ = 0.742 ± 0.169, Zipf s = 0.715 ± 0.201. These are not textbook values (Heaps 1978 expected ~0.5, Zipf 1949 expected ~1.0) — they reflect a corpus of modern OSS JavaScript/Python.
- **`src/rules/logic/heaps-deviation.ts`** — threshold now adapts to corpus (mean ± 2σ) instead of hardcoded `0.5 ± 0.15`. Falls back to constants if `corpus-baselines.json` is absent.
- **`src/rules/logic/zipf-slope-anomaly.ts`** — same pattern, mean ± 2σ. Falls back to `1.0 ± 0.25` if baselines unavailable.
- **`src/rules/logic/ks-distribution-shift.ts`** — KS test now compares the file's empirical distribution against a corpus-derived reference sample (10k down-sampled points per feature) rather than a uniform distribution. Falls back to small reference vectors if baselines unavailable.
- **14 INVERTED rules reclassified** as `aiSpecific: false` (code-hygiene, not AI). These rules were calibrated INVERTED in v5 (lift < 1) because v5's smaller neg corpus skewed. With the v6 558k-file corpus, these rules' lift landed in (1, 1.5) — they are NOISY discriminators, not inverted AI detectors. The 14 reclassified rules:
  - `context/import-path-mismatch`, `component/multiple-components-per-file`, `product/terminology-drift`
  - `style/identical-comments`, `style/emoji-in-comments`, `style/one-line-comments-only`, `style/too-perfect-formatting`
  - `docs/excessive-jsdoc`, `docs/copy-pasted-headers`, `docs/comment-density-anomaly`
  - `ai/typical-ai-mistake`, `ai/cliche-structure`, `ai/hedging-language`
  - `i18n/missing-locale`, `i18n/hardcoded-string`

### Removed

- **10 phantom rules** from `src/rules/signal-strength.json` that had no backing rule file: `db/query-no-pagination`, `db/no-index-hint`, `db/sql-injection-pattern`, `db/orm-n-plus-one`, `db/transaction-boundary-issues`, `db/connection-pool-exhaustion`, `db/seed-data-leakage`, `db/missing-migration`, `db/soft-delete-without-index`, `db/audit-log-missing` and 4 docs rules (`docs/excessive-jsdoc`, `docs/copy-pasted-headers`, `docs/comment-density-anomaly`, `docs/missing-api-examples`). These were never real rules but were counted in calibration, inflating the INVERTED count.

### Verdict distribution (v6 calibration)

| Verdict | v5 (162k files) | v6 (524k files) | Change |
|---------|-----------------|-----------------|--------|
| USEFUL  | 16 | **22** | +6 (calibration unlocked 6 new ones) |
| OK      |  7 | **11** | +4 |
| NOISY   | 13 | **14** | +1 |
| DORMANT | 21 | **12** | -9 (now calibrated) |
| INVERTED| 18 | **5**  | -13 (reclassified) |

### Added

- **`scripts/compute-corpus-baselines.ts`** — extracts corpus-derived baselines from a neg workspace sample. Run with `tsx scripts/compute-corpus-baselines.ts <workspace> [sample-size]`.
- **`scripts/scan-corpus-robust.ts`** — child-process-per-file scanner that survives SWC native panics (which previously killed the entire scan). Times out at 30s per file and writes partial output every 10k files.
- **`tests/engine/signal-strength-guardrails.test.ts`** — new assertions pinning the v6 verdict distribution (22 USEFUL, 5 INVERTED) so future calibration changes don't silently regress.

### Fixed

- **3 failing tests in `tests/engine/lr-combiner.test.ts`** — v0.12.0's tests pinned `context/import-path-mismatch`, `component/multiple-components-per-file`, and `product/terminology-drift` as INVERTED test cases. v6 calibration reclassified these as NOISY, so the tests now use the 3 rules that are still genuinely INVERTED in v6: `logic/heaps-deviation`, `logic/zipf-slope-anomaly`, `logic/math-variable-name-entropy`.
- **Typecheck errors in `scripts/scan-corpus-*.ts`** — fixed `import.meta.dirname` references (replaced with `fileURLToPath` + `dirname(__filename)`) and a `process.on('uncaughtException')` handler that referenced an outer-scope `i` (replaced with a `currentFile` tracker).

### Tests

- All 1,650 tests pass.
- `pnpm typecheck` clean.

### Migration notes

- v0.12.1 is **backward-compatible** with v0.12.0 at the API and CLI surface.
- If you depend on the exact verdict count (e.g., "expect 5 INVERTED rules"), update your expectations: v6 = 5 INVERTED, but these are now 3 logic rules + 1 wcag + 1 perf (different from v5's 18).
- The 14 reclassified rules remain enabled (`aiSpecific: false` means they still fire and report, but they don't contribute to `slopIndex`).
- `corpus-baselines.json` is checked in (308KB). If you want a custom baseline for your own corpus, run `scripts/compute-corpus-baselines.ts` and replace the file.

---

## [0.12.0] - 2026-06-27 — Tier-1.5 Calibration Methods (Bayesian + BH-FDR + KS + Zipf/Heaps)

### Added

- **`src/engine/lr-combiner.ts`** — Bayesian likelihood-ratio combiner per Bento et al. 2024 *Neurocomputing*. Computes the calibrated posterior P(AI | fired_rules) via naive-Bayes log-odds combination of per-rule LRs (Haldane-smoothed). Replaces the heuristic weighted average with a calibrated probability.
- **`src/engine/multitest.ts`** — Benjamini–Hochberg FDR correction per Benjamini & Hochberg 1995 *JRSS B* 57(1):289–300. Surfaces the 60-rule multi-testing problem (`P(≥1 false positive) ≈ 95%`) and brings it under control at α = 0.05. **Highest credibility-per-line-of-code ratio in v0.12.0.**
- **`src/engine/ks.ts`** — Kolmogorov–Smirnov two-sample test + multi-feature Bonferroni-corrected shift detector per Kolmogorov 1933 / Smirnov 1939 + arXiv:2510.15996 (Oct 2025).
- **`src/engine/zipf-heaps.ts`** — Zipf's law + Heaps' law fits per Zipf 1949, Heaps 1978, and Christ, Bavarian, Koyejo, Lapata 2025 *EMNLP Findings 2025* — the only peer-reviewed paper directly proposing Heaps λ and Zipf s as LLM discriminators.
- **`src/engine/confidence-intervals.ts`** — Wilson score + Clopper-Pearson binomial confidence intervals per Wilson 1927 *JASA* 22:209–212 and Clopper & Pearson 1934 *Biometrika* 26:404–413.
- **4 new rules** using the new engines:
  - `logic/bayesian-conditional` (high) — fires when P(AI|fires) ≥ 0.7.
  - `logic/heaps-deviation` (medium) — fires when file's Heaps λ deviates > 2σ from corpus baseline.
  - `logic/ks-distribution-shift` (medium) — multi-feature KS shift (Bonferroni α = 0.05/K).
  - `logic/zipf-slope-anomaly` (medium) — fires when rank-frequency slope deviates > 2σ with R² ≥ 0.7.
- **`report.v012Stats`** — diagnostic field in `ProjectReport` exposing the calibrated Bayesian posterior and BH-FDR surviving-fire count. Surfaces in HTML/JSON reporters under "v0.12 Calibration Diagnostics". Does NOT affect slopIndex or any headline score (informational only).
- **`docs/research/math-foundations-for-slop-audit.md`** — new "Tier 1.5: Calibration Methods" section with peer-reviewed citations for all 5 new math foundations.

### Peer-reviewed math added in v0.12.0

| Method | Citation | Tier | Solves |
|--------|----------|------|--------|
| Bayesian LR combination | Bento et al. 2024 *Neurocomputing* | S | All 4 calibration failure modes |
| Kolmogorov–Smirnov | Kolmogorov 1933 + arXiv:2510.15996 (Oct 2025) | S | High-FPR USEFUL, INVERTED reclassification |
| Zipf's & Heaps' laws | Christ et al. 2025 EMNLP Findings | S | New AI discriminators |
| Benjamini–Hochberg FDR | Benjamini & Hochberg 1995 *JRSS B* | S | Silent FPR inflation (free rigor) |
| Wilson/Clopper-Pearson CIs | Wilson 1927 *JASA* + Clopper & Pearson 1934 *Biometrika* | S | Calibration doc rigor |

### Tests

- 91 new tests across 5 new engine modules (76 + 15).
- All tests pass with strict TypeScript typecheck.

### Migration notes

- v0.12.0 is **backward-compatible** with v0.11.x at the API and CLI surface.
- New rules are added with `defaultOff: true` (DORMANT) until v0.12 corpus re-calibration lands.
- `report.v012Stats` is additive — existing reporters ignore the field if absent.

---

## [0.11.2] - 2026-06-26 — Prepack guard + workspace dep cleanup

### Fixed

- **`npm install slopbrick@0.11.1` was broken** by a leaked `workspace:*` dep on
  `@usebrick/core`. npm cannot resolve pnpm's `workspace:` protocol, so installing
  v0.11.1 failed with `EUNSUPPORTEDPROTOCOL`. v0.11.2 removes the dep entry from
  `package.json` AND adds a hard guard so the regression cannot recur.

### Added

- **`scripts/prepack-guard.mjs`** — refuses to pack a tarball that contains any
  `workspace:*` deps in `dependencies` / `devDependencies` / `peerDependencies` /
  `optionalDependencies`. Wired into `pnpm prepack` (auto-invoked by `npm pack`
  / `pnpm pack`). Exit code 1 with a clear remediation hint on violation.
- **`tsup.config.ts` `noExternal: [/^@usebrick\//]`** — bundles the private
  `@usebrick/core` workspace package into `dist/`, so the published tarball has
  zero runtime dep on it. AGENTS.md flags `@usebrick/core` as "defer until the
  schema is earned by ≥2 consumers like stackpick or gir" — bundling keeps that
  promise while still letting the rest of the monorepo consume it via pnpm.

### Changed

- **`src/index.ts` no longer re-exports types or values from `@usebrick/core`.**
  Re-exporting would force every TypeScript consumer of slopbrick to depend on
  a package that is private and not on npm. Runtime functions are still bundled
  into `dist/index.cjs` via the new `noExternal` rule, so end users never need
  to know about `@usebrick/core`.
- **`.gitignore`** — ignore local `slopbrick-*.tgz` tarballs from `pnpm pack`.

### Migration

For users on `slop-audit@*` or `slopbrick@<0.11.2`, upgrade is identical to v0.11.1:

```bash
npm install --save-dev slopbrick@latest
npx slopbrick migrate     # only needed if upgrading from slop-audit@≤0.10.1
```

No code changes are required — v0.11.2 is a pure metadata + build artifact fix.

## [0.11.1] - 2026-06-25 — CI workflow rename + publish gate

### Changed

- **GitHub Actions workflows renamed** for clarity:
  - `.github/workflows/slopbrick.yml` → `.github/workflows/ci.yml` (CI workflow)
  - `.github/workflows/release.yml` → `.github/workflows/publish.yml` (publish workflow)
- **`publish.yml` now targets the `publish` environment.** Tag pushes land in the
  `publish` GitHub Actions environment; configure reviewer + branch restrictions in
  Settings → Environments to gate publishes. Optional `NPM_TOKEN` deployment secret
  for non-OIDC fallback.
- **`VERSION` constant in `src/types.ts`** updated to match `package.json` (was lagging
  at `0.10.0` while published versions advanced). Now single source of truth.

### Notes

- No source-code changes vs v0.11.0 — this is a CI/metadata patch.
- v0.11.0 was published from a local uncommitted state (commit happened after npm
  publish); v0.11.1 is the first version published from a fully committed + tagged
  state on the `usebrick/slopbrick` repo.
- npm Trusted Publishers config on https://www.npmjs.com/package/slopbrick/access
  must include the new workflow filename `publish.yml` + environment name `publish`
  for the OIDC flow to work end-to-end.

## [0.11.0] - 2026-06-25 — Clean rename + platform move (BREAKING)

This release completes the move from `slop-audit` to `slopbrick` as part of the
[usebrick.dev](https://usebrick.dev) platform. Every reference to `slop-audit` in code,
docs, and CLI surface has been removed. The on-disk artifact directory has been renamed
from `.slop-audit/` to `.slopbrick/` — this is a **breaking change** for any project
that has been scanned by a pre-0.11.0 version. Run `slopbrick migrate` once to upgrade.

### Breaking changes

- **Artifact directory renamed**: `.slop-audit/` → `.slopbrick/`. Cache file renamed:
  `.slop-audit-cache.json` → `.slopbrick-cache.json`. The schema version field bumps
  from `'1'` to `'2'` so readers can detect old vs new projects.
- **Config filename renamed**: `slop-audit.config.{mjs,cjs,js}` → `slopbrick.config.*`.
  The back-compat fallback (added in 0.10.1) is removed.
- **Package renamed on npm**: `slop-audit` → `slopbrick`. The old name is deprecated;
  users get a deprecation warning on `npm install slop-audit`.

### Added

- **`slopbrick migrate`** — one-shot migration command. Detects `.slop-audit/` +
  `.slop-audit-cache.json` + `slop-audit.config.*` in the current workspace, renames
  each to the new name, bumps `version: '1'` → `version: '2'` in inventory.json +
  constitution.json, and updates `.gitignore` lines. Supports `--dry-run` (prints the
  plan without touching the filesystem) and `--force` (overwrites if both old + new
  exist). Idempotent: refuses to run if migration is already complete.

### Migration

For projects previously scanned by `slop-audit@≤0.10.1`:

```bash
# After upgrading slop-audit → slopbrick in your package.json:
npm install --save-dev slopbrick
npx slopbrick migrate     # renames .slop-audit/ → .slopbrick/, updates .gitignore
npx slopbrick scan        # regenerates inventory + constitution at schema v2
```

Projects without a prior `.slop-audit/` directory don't need `migrate` — just install
and scan.

### Internal

- `@usebrick/core` bumped to **0.2.0** — schema version `'2'`, paths use `.slopbrick/`
  (artifact dir) + `.slopbrick-cache.json` (cache, sibling of `.slopbrick/`). Zero
  runtime dependencies.

## [0.14.5o] - 2026-06-28 — UX overhaul, doc suite, Python/Go coverage, README slim-down, lockfile fix

The v0.14.5d → 0.14.5o line is a single dev cycle (one session) that
shipped 9 commits addressing the scan flywheel UX, a categoryScores
display bug, Python/Go coverage gaps, a partial v7 calibration
report, a full documentation suite, and a lockfile fix. Pushed as
one release because the commits are interdependent and the
CHANGELOG groups them as a single "calibration update".

v0.14.5n was tagged first but its publish failed due to a stale
`@usebrick/core` entry in the lockfile. Rather than re-publish
under the same version, this release renumbers to 0.14.5o and
absorbs the lockfile fix as a first-class commit.

### Fixed (Lockfile — release commit)

`pnpm-lock.yaml` had a stale `@usebrick/core: workspace:*` entry
that wasn't in `packages/slopbrick/package.json`. This caused
`pnpm install --frozen-lockfile` to fail in publish.yml on the
v0.14.5n tag. Removed the stale entry; `pnpm install` now reports
the lockfile is up to date. 3 lines deleted.

### Changed (README slim-down — v0.14.5n)

The README had grown to 1,058 lines / 28 sections and was behaving
like a user manual. The v0.14.5m commit added 6 separate docs
(`CONTRIBUTING.md`, `EXAMPLES.md`, `docs/MCP.md`, `SECURITY.md`,
`CODE_OF_CONDUCT.md`, `docs/scoring-explained.md`) that covered
~70% of the README's content. This release slims the README to
199 lines (the 5-min version: hero, install, what you get,
quick start, headlines, example output, docs index, contributing,
license). Net change: -945 lines from the README. All content
preserved in the existing separate docs (CONTRIBUTING, EXAMPLES,
docs/MCP, docs/scoring-explained, docs/repository-memory,
docs/rule-catalog, docs/architecture, CHANGELOG, ROADMAP).

Why: the README displays on the npm package page. Users coming
from npm want the 5-min version. The detailed material is for
users who actually install the tool and want to go deeper — they
get it via the docs index, which is now the second section of
the README.

The 14 linked files are all present (verified). No content lost
(verified by cross-referencing every removed line to a destination
doc). The "Comprehensive manual" sections removed:
- 19 subcommands — `slopbrick --help` (live, auto-generated)
- Composite Slop Index math — `docs/scoring-explained.md`
- CLI reference — `docs/MCP.md` (per-tool reference) +
  `EXAMPLES.md` (config reference)
- Architecture — `docs/architecture.md`
- Adding new rules — `CONTRIBUTING.md`
- Calibration details — `docs/research/calibration-report-2026.md`
- What's new in v0.12.0/v0.12.1 — `CHANGELOG.md`

### Added (Documentation suite — v0.14.5m)

The public documentation set was missing several standard OSS files
and had stale references. This release adds the missing docs and
fixes the references.

- **`CONTRIBUTING.md`** — how to add a new rule (copy a template,
  edit `analyze()`, add a test, add to `signal-strength.json` with
  `defaultOff: true`), how to run the v0.14.5k calibration locally,
  dev setup, project structure, code style. 8.6K.
- **`SECURITY.md`** — vulnerability reporting to `security@usebrick.dev`,
  supported versions, security best practices for slopbrick users
  (don't commit `.slopbrick/` to public repos, MCP server trust
  model, the `ai/security-risk` band is a heuristic not a SAST).
  3.8K.
- **`CODE_OF_CONDUCT.md`** — Contributor Covenant 2.1. 5.6K.
- **`EXAMPLES.md`** — copy-paste `slopbrick.config.mjs` patterns for
  strict CI, monorepo, per-rule severity, exclude test fixtures,
  include Python/Go, disable defaultOff, enable dormant, custom
  category weights, MCP server settings. 8.7K.
- **`docs/MCP.md`** — full reference for the 10 MCP tools:
  `slop_suggest`, `slop_suggest_with_memory`, `slop_scan_file`,
  `slop_explain_rule`, `slop_list_rules`, `slop_governance`,
  `slop_check_constitution`, `slop_architecture_score`,
  `slop_business_logic_score`, `slop_find_similar`. Each with
  input/output schemas, when-to-use, and a typical agent flow.
  9.3K.
- **`docs/scoring-explained.md`** — what the two scores actually
  measure, the 2×2 quadrant of (Slop × Coherence) combinations,
  which one to focus on, the threshold rationale. 4.9K.
- **`docs/repository-memory.md`** — the 4 `.slopbrick/` artifacts
  contract, on-write order, graceful-degradation. 8.5K.

### Fixed (Documentation drift)

- **README.md**: corrected "14 tools" → "10 tools" for the MCP server
  (was true in v0.12.0 when 4 tools were added on top of 10).
  Replaced the v0.9.1 "Repository Health: 84" example with the
  v0.14.5j-correct output (Slop Index primary, Coherence secondary).
  Added a Documentation index table linking all 14 public docs.
- **`docs/website-copy-v0.14.5d.md`**: replaced the bad
  `ai: 16700, visual: 7000, logic: 6840` numbers with the
  v0.14.5h-correct raw totals (167 / 70 / 68) and a footnote
  explaining the 0-component fix.

### Changed (Scan UX — v0.14.5i)

Five UX improvements for the scan → see → fix → re-scan loop. The
self-scan revealed that the numbers were correct but the user
had no idea what to do with them. Fixes:

- **P5** — DefaultOff suppression count moved from stderr to the
  main output as a green ✓ trust signal: `✓ 99 INVERTED/NOISY
  issues correctly suppressed from 24 default-off rules. The top
  offenses below are the ones that matter.`
- **P0** — Next-step footer with the highest-impact action. Replaces
  the one-line "run --suggest" with a prioritized list that
  adapts to the report's data: top offending file, --suggest,
  --baseline, --why-failing (when score < 70).
- **P1** — Per-category breakdown table with bar charts. The 16 raw
  categoryScores (visible in `health.json`) are now shown in the
  CLI as `ai: 167 ████████████  visual: 70 ██████  logic: 68 ████`.
- **P4** — Slop Index is now the SINGLE headline number. Repository
  Coherence is shown as a secondary "different formula" line. The
  CLI and `health.json` now show the same number.
- **P3** — `--why-failing` flag. Quick triage view: top 5 rules
  ranked by weighted impact (severity × count) that are dragging
  the score down. Takes precedence over `--format pretty`.

### Fixed (--why-failing bug)

- `--why-failing` was reading `coherence` (60) instead of `slopIndex`
  (25), giving a different number than the main scan output. Now
  reads slopIndex, matches the main output. The bug was introduced
  in v0.14.5i and fixed in v0.14.5j.

### Added (At-a-glance + with-help UX — v0.14.5j)

Five more UX improvements, focused on making the output
self-explanatory:

- **P6** — Plain-language verdict at the top. First line is a
  one-sentence answer to "is my code OK?": `Repo is concerning
  (25/100). The biggest problem is AI patterns — worst file is
  src/cli/scan.ts.`
- **P7** — Inline glossary for category labels. Each of the 16
  categories now has a plain-language label + one-line description
  in the bar chart: `AI patterns — signatures of LLM-generated
  code`, `visual style — colors, spacing, font sizes, layout`.
- **P8** — Better status labels. `[PASS] / [FAIL]` replaced with
  `[EXCELLENT] / [PASSING] / [NEEDS WORK] / [CONCERNING]`. The
  `[pass] / [fail]` text is kept in the `Threshold (CI gate)`
  section so CI scripts that grep for it still work.
- **P9** — Trajectory delta `↓5 (cleaner)` on the headline. The
  previous run is read from the run log and the delta rendered
  on every re-scan. Noise floor ±0.5 to avoid spurious "↑0".
- **P10** — `--brief` flag. 4-5 line terse output for CI/scripts:
  verdict + headline + threshold + delta + Coherence + suppression
  count. No category breakdown, no top offenders, no issues dump.

### Fixed (Scan UX bugs)

- The "AI patterns patterns" double word in the verdict
  (catGloss.short already includes the noun).
- Small-project warning was firing on 0 components; now requires
  `> 0 && ≤ 10`.
- "Thresholds" section showed both Slop Index AND Coherence; now
  only the Slop Index (the gate) is shown in that section.
- Coherence formula was dumped into the output; now a one-line
  plain-English explanation.
- `formatThresholds` lost the coherence line; restored with
  "different formula" annotation.
- `formatSummary` pluralization for "1 issue" vs "N issues".

### Changed (Rule coverage — v0.14.5l)

The v0.14.5k gap analysis revealed a major coverage gap: the
worker had a `BACKEND_EXTENSIONS` early-return that stripped out
Python, Go, Java, Rust, etc. before any rules ran. So the v7
calibration was measuring 80 rules against only ~30% of the
corpus (TS/JS only). The 70% gap (44,956 Python files + 14,536
Go files + 90,000+ others) was unmeasured.

- **`src/engine/worker.ts`** — split the backend early-return.
  Languages we have visitors for (`.py`, `.go`) now fall through
  to the rule engine. Languages we DON'T have visitors for
  (`.swift`, `.kt`, `.dart`, `.rs`, `.cpp`, `.java`, `.rb`,
  `.php`) still get the early-return.
- **`src/engine/parser.ts`** — added `parseBlankModule()` for
  `.py` and `.go`. Same trick as `parseAstro`/`parseHtml` —
  blank-pad the source to preserve line offsets, parse as an
  empty SWC module. AST-dependent rules silently produce 0
  issues; regex-only rules (markdown-leakage, comment-ratio,
  etc.) can fire.
- **Expected impact**: 0/44,956 Python files fired any rule →
  ~30% should fire (regex-only AI markers) → 13,000+ new data
  points for the v0.14.5d calibration.

### Added (Calibration automation — v0.14.5k)

The v7 corpus scans are running (~7-13h ETAs). To get
actionable signal while waiting, two new tools:

- **`scripts/compute-v7-calibration-partial.py`** — runs on the
  in-progress partial-fires.json files. Produces
  `docs/research/v7-partial-calibration-<timestamp>.md` with
  USEFUL / OK / NOISY / INVERTED / DORMANT / HYGIENE verdict
  per rule based on precision, recall, FPR, and lift. MONITORING
  ONLY — does not update `signal-strength.json`. The final
  calibration (when scans finish) will update the rule registry.
- **`scripts/find-rule-coverage-gaps.py`** — computes fire rate
  by extension, repo, and file size bucket. Identifies the lowest-
  fire-rate clusters (e.g. agent harness repos, Python test
  files) where new rules are needed. Produces
  `docs/research/v7-coverage-gaps-<timestamp>.md`.
- **Partial calibration result** (v0.14.5k, on the 95k neg +
  89.5k pos sample): 21 USEFUL, 7 OK, 5 NOISY, 8 INVERTED,
  0 DORMANT, 22 HYGIENE. The 8 INVERTED rules will be auto-
  defaultOff in the final calibration, which should reduce
  noise in the user-facing score by ~5-15 points.

### Fixed (v0.14.5h — categoryScores bug)

`categoryScores` exploded to 16700 / 7000 / 6840 when
`componentCount=0` (the case for CLI tools, pure backend, or
libraries without React/Vue/Astro UI). The bug: the per-
component-average normalization `sum / 1 * 100` produced
wildly wrong numbers. The fix: when `componentCount=0`, return
raw severity totals (sum of severity × weight) instead of
dividing by 1 and multiplying by 100. For codebases WITH
components, the per-component normalization is preserved so
scores stay comparable across project sizes.

3 regression tests in `tests/engine/metrics.test.ts`. 17 user-
facing numbers updated (in `health.json`, `website-copy-v0.14.5d.md`,
README example) from `ai: 16700, visual: 7000, logic: 6840` to
`ai: 167, visual: 70, logic: 68`.

### Fixed (v0.14.5g — self-scan fix)

Three bugs in series caused the self-scan to show a misleading
slopIndex 100 / Repository Coherence 0:

- **`src/config/validation.ts`** — the `VALID_CATEGORIES` whitelist
  was missing 7 categories (`product`, `i18n`, `visual`, `typo`,
  `wcag`, `layout`, `context`). The scanner silently dropped issues
  whose category wasn't in the whitelist. Now all 16 are accepted.
- **`src/engine/memory.ts` (`buildHealthFromReport`)** — was
  including issues with `severity='off'` (defaultOff rules) in
  `issueCounts` and `topOffenseIds`. The suppressed issues were
  the INVERTED/NOISY rules that fire on human code as often as
  AI code. Now excluded.
- **`src/cli/scan.ts` (autotune loop)** — was overwriting
  `severity='off'` on issues from defaultOff rules. Now skips
  those rules entirely.

Result: self-scan slopIndex 100 → 60, defaultOff suppression
count surfaced in the headline (99 suppressed), topOffenseIds
filtered to the rules that matter.

### Fixed (v0.14.5f — scanner config for v8 corpus re-scan)

The v0.12.0 scanner would crash and lose ~10% of the corpus
on certain JSX files (SWC native panic). v0.14.5f:

- **PER_FILE_TIMEOUT_MS bounded 120-600s** (was unbounded, could
  hang the worker for hours on a bad file).
- **Uses `npx tsx`** for the worker subprocess (was `node` with
  CommonJS — broke when the package switched to ESM).
- **Passes `SLOP_RESULT_PATH` env var** for file-based output
  (was stdout pipe — buffered and lost on partial completion).
- **ENOENT-safe `unlinkSync`** when cleaning up worker tmp files.
- **Captures stderr as `_stderr`** in the result, so worker
  crashes show in the output instead of being swallowed.

6 regression tests in `tests/scripts/scanner-config.test.ts`.

### Changed (MCP tool consolidation — completes the v0.9.x consolidation plan)

Three narrow-axis MCP tools are now marked deprecated in favor of `slop_suggest`, which already returns the same data as a sibling field in its response. The tools continue to work through v0.12.x (backward compatibility) but the server attaches a `_meta.deprecation` notice to the JSON-RPC response so MCP clients can soft-warn the agent. Removal planned for **v0.13.0**.

| Deprecated tool | Replaced by | Why redundant |
|-----------------|-------------|---------------|
| `slop_governance` | `slop_suggest` | `slop_suggest` already returns `repositoryHealth` + per-axis breakdown |
| `slop_architecture_score` | `slop_suggest` | `slop_suggest` already returns `architectureConsistency` |
| `slop_business_logic_score` | `slop_suggest` | `slop_suggest` already returns `businessLogicCoherence` |

The canonical four-tool surface (`slop_suggest`, `slop_scan_file`, `slop_check_constitution`, `slop_explain_rule`) plus `slop_list_rules` (discovery) and `slop_find_similar` (GIR primitive) is unchanged — `slop_suggest_with_memory` remains the preferred fast-path variant.

Migration: replace `call('slop_governance', ...)` with `call('slop_suggest', ...)` and read `result.repositoryHealth` instead of `result.score`. No other code changes required.

### Added (Phase 9 — Product Consistency)

Two cross-file rules that detect AI-induced product copy drift:

- **`product/terminology-drift`** — flags when 3+ component names share a leading noun but use different suffixes (e.g. `PostList`/`PostDetail`/`PostCard` all on the `Post*` stem). AI agents pick slightly different words each invocation; the product copy drifts. One issue per file (the most divergent variant).
- **`product/ux-pattern-fragmentation`** — counts distinct UX patterns per category (modal/toast/button/input/card) and fires when the count exceeds a per-category threshold (modal ≥4, toast ≥3, button ≥5, input ≥4, card ≥4). Pick the canonical one and alias the rest.

11 unit tests pass. Both rules have RULE_HINTS entries in `src/snippet/data.ts`. Category is `arch` (cross-file pattern drift) for both; severity is `medium`; both are `aiSpecific: true`.

### Added (Repository Memory Platform — Phase 7 of v0.10)

Latency win for the agent integration: every `slopbrick scan` will persist the pattern inventory to `.slop-audit/inventory.json` + `.slop-audit/constitution.json`, and MCP `slop_suggest_with_memory` will read it back instead of re-parsing AST. 100–1000× faster on agent invocations.

- **`engine/memory.ts`** — `loadInventory` / `saveInventory` / `loadConstitution` / `saveConstitution` with atomic `.tmp + rename` writes; `buildInventoryFromScan` (reuses `buildPatternInventory` for pattern extraction + component fingerprints from `facts.v2.components`, sha256 hash of sorted hooks + sorted props truncated to 16 chars); `buildConstitutionFromConfig` (declared/forbidden/forbiddenPrefixes; forbidden entries ending in `/` split into the prefix allowlist); `isInventoryFresh` + `invalidateFile` backed by a per-file `mtimeMs` map in `.slop-audit/cache.json`. Schema-gated by `MEMORY_SCHEMA_VERSION` so future format bumps migrate gracefully.
- **`engine/memory-md.ts`** — pure `renderMemoryMarkdown(inventory, constitution)` renderer. Produces a stable, agent-readable markdown summary (detected patterns sorted by fileCount desc, canonical components merged by name, declared constitution, DO NOT CREATE list). Plus `writeMemoryMarkdown` + `readMemoryMarkdown` for atomic `.slop-audit/memory.md` persistence.
- **`mcp/slop-suggest-memory.ts`** — `runSuggestWithMemory` wrapper. Reads the persisted markdown on the fast path; falls back to the existing `slop_suggest` (with a `memoryHint` annotation) when `.slop-audit/memory.md` is missing.
- **New MCP tool `slop_suggest_with_memory`** — registers the fast-path variant in `src/mcp/tools.ts`. Documented as faster but requires a prior `slopbrick scan`.
- **Scan pipeline integration** — at the end of `runScan`, `slopbrick scan` now persists the inventory + constitution (gated by `config.projectMemory !== false`; non-fatal on write failure; quiet under `--json` / `--quiet` / machine-readable output so CI logs stay clean). This is the side-effect that makes `slop_suggest_with_memory`'s fast path actually populate on first use.

### Added (Tier 2 graph-theoretic — Phase 6 of v0.10)

Three engine modules wire peer-reviewed graph methods into the Architecture Consistency Score, completing the v0.10 plan's post-credibility phase. All three backstop the cross-file drift signal that already ships.

- **`engine/louvain.ts`** — Louvain community detection on the import graph (Blondel, Guillaume, Lambiotte & Lefebvre 2008, *J. Stat. Mech.* P10008). Modularity-maximizing partition; outliers in their community = drift signal.
- **`engine/spectral.ts`** — Fiedler value (second-smallest eigenvalue of the import-graph Laplacian). Low value = fragmented modules = drift. Computed inline from the Louvain adjacency matrix.
- **`engine/changepoint.ts`** — Bayesian Online Changepoint Detection (Adams & MacKay 2007, *Proc. ICMLA*). Detects regime changes in rule-firing rate over the lines of a file. Surfaces "this PR was authored under a different regime than the rest of the file" — likely AI-assistance mid-edit.

### Added (Phase 8 — `--diff <ref>` flag)

VibeDrift-compatible CLI surface. `slopbrick scan --diff main` returns the delta in pattern inventory, constitution drift count, and per-rule PR Slop Score for the working tree vs. the named git ref.

- **`cli/program.ts`** — `--diff <ref>` option (alias for `--since <ref>`; also adds PR Slop Score to the report). Implemented in `src/cli/scan.ts` via `formatUnifiedDiff`.

### Added (Phase 9 — `find_similar_function` MCP tool)

Foundation for the GIR (Give-Implementation-Reference) pattern in `slop_suggest`. AI agents call `find_similar_function` before writing new code to discover existing implementations they should be referencing.

- **`engine/find-similar.ts`** — given a function/hook signature, find the most similar existing implementations across the codebase. Uses AST fingerprints (no LLM, no embeddings — just hash-based tree similarity per Chilowicz 2009 syntax-tree fingerprinting).
- **New MCP tool `find_similar_function`** — registered in `src/mcp/tools.ts` and exposed to Claude Code / Cursor / Copilot.

## [0.10.0] - 2026-06-25 — Credibility milestone

> **v0.10 ships the credibility moat.** Every detection rule now ships with per-rule Precision / Recall / False Positive Rate on the balanced 172k-file v4 corpus, plus peer-reviewed citations behind every threshold. The three numbers that tell you whether a detection rule actually works.

The headline change: the `Repository Coherence` score is now backed by the **MDL principle** (Rissanen 1978) — principled model selection between `m_ai` and `m_human` based on the log-likelihood ratio of the rule-firing pattern. Engineers can argue the model (which rules belong to m_ai vs m_human), not the weights.

### Added (peer-reviewed thresholds, see [`docs/research/math-foundations-for-slopbrick.md`](./docs/research/math-foundations-for-slopbrick.md))

- **`engine/halstead.ts`** — Halstead complexity measures (Halstead 1977, *Elements of Software Science*, §3). Computes vocabulary, length, calculated length, volume, difficulty, effort, and estimated bugs per-component. 25 unit tests pinning tokenizer + metric output.
- **`engine/cyclomatic` (in halstead.ts)** — Cyclomatic complexity (McCabe 1976, *IEEE TSE*). `M = E - N + 2P` approximated from decision-point keyword occurrences.
- **`rules/perf/halstead-anomaly.ts`** — fires when component's `volume / LOC` is below a corpus-baseline threshold. **Lower than baseline = AI tendency** (LLMs reuse naming patterns from training data, lowering vocabulary per unit length). Cite: Halstead 1977 §3.
- **`engine/naturalness.ts`** — Code Naturalness via AST-tok entropy (Hindle et al., ICSE 2012, "On the Naturalness of Software"). Per-component cross-entropy + distinctTokenRatio.
- **`rules/visual/naturalness-anomaly.ts`** — fires when distinctTokenRatio < 0.3 AND length > 50 (skip trivial files). Lower ratio = more repetitive naming = AI signature. Cite: Hindle 2012.
- **`engine/kl-novelty.ts`** — KL divergence pattern novelty (Kullback & Leibler 1951, "On Information and Sufficiency"). `KL(P_project ‖ P_corpus) = Σ P_project(x) · log(P_project(x) / P_corpus(x))`. Reserved field on `ArchitectureScore` for v0.10.5 follow-up.
- **`engine/mdl.ts`** — MDL composite score (Rissanen 1978, *Automatica*; textbook: Grunwald 2007). `Coherence_MDL(file) = log P(rules_fired | m_ai) - log P(rules_fired | m_human)` with Laplace smoothing. Wired into `repository-health.ts` as the new `mdlLogRatio` axis (alongside the existing weighted-average composite for now).

### Added (test coverage expansion — Phase 4 of v0.10 plan)

USEFUL rules per v4 calibration now tested:
- `logic/math-gini-class-usage` — CSS class usage Gini coefficient anomaly
- `visual/math-rounded-entropy` — rounded-number value clustering
- `logic/reactive-hook-soup` — ≥3 un-guarded hooks in a component
- `visual/spacing-scale-violation` — Tailwind arbitrary value detection
- `component/shadcn-prop-mismatch` — shadcn primitive prop-name validation
- `security/sql-construction` — SQL string concatenation detection
- `wcag/focus-appearance` — focus indicator style detection
- `test/weak-assertion` — `expect(x).toBeDefined()` etc.
- `visual/inline-style-dominance` — deduped by class signature

**Test count: 1376 / 1376** (was 1258 at v0.9.2). +118 tests for v0.10.

### Changed (defaultOff for INVERTED + NOISY rules, already shipped in 0.9.x)

- 6 INVERTED rules (fire MORE on human code than AI): `component/multiple-components-per-file`, `context/import-path-mismatch`, `logic/key-prop-missing`, `logic/math-variable-name-entropy`, `security/public-admin-route`, `security/unsafe-html-render`. **Marked `defaultOff: true` in `signal-strength.json`**.
- 20 NOISY rules (recall < 0.1 in v4 corpus): fired too rarely on AI code to be a useful default. **Marked `defaultOff: true`**.
- User opts back in via `slopbrick.config.mjs`'s `rules:` block.
- Removed obsolete `--auto-disable-noisy-rules` flag (replaced by default behavior).

### Added (infrastructure)

- `SignalStrength` interface extended with optional `defaultOff?: boolean` field.
- `getDefaultOffRules()` helper in `signal-strength.ts` returns the set; scan.ts applies 'off' to their issues before the severity filter.
- 6 INVERTED rules added to `signal-strength.json` with v4 calibration numbers (recall/fpRate/precision).
- Default-off info message goes to stderr so `--format json` output stays clean.

### Added (tooling + refactors already shipped in 0.9.x)

- Refactor 8: `matchAll` helper in `src/rules/utils.ts` centralizes 16 per-rule regex.exec sites
- math-any-density rule fixed (was flagging its own source via `\: any` literal pattern)
- `DriftSignal` renamed to `CrossFileDriftSignal` (v0.9.2 cross-file drift-detection naming consistency)
- Top-level src files moved into subfolders (config, engine, cli)
- Type consolidation: 3 overlapping rule type contracts → single canonical `Rule<Context>` (deleted dead `RuleDefinition` + `src/rules/types.ts`)
- Dispatch refactor: killed `visitor.ts ⇄ dispatch.ts` circular dependency + 47 lines of no-op branches
- First-time user onboarding block (Refactor 9): friendly hint when no `slopbrick.config.mjs` + 0 files matched
- wcag/focus-obscured.ts:31 dedup bug fix (was hardcoded `'file'` literal, fired once per file regardless of element count)

### Added (docs)

- [`docs/research/math-foundations-for-slopbrick.md`](./docs/research/math-foundations-for-slopbrick.md) — peer-reviewed citations per method (Halstead, McCabe, Hindle, Rissanen, Kullback-Leibler, Blondel, Fiedler, Adams-MacKay)
- [`docs/research/v0.10-implementation-plan.md`](./docs/research/v0.10-implementation-plan.md) — the credibility-milestone roadmap (12 phases, dependency graph, effort estimates, v0.10 readiness checklist)
- [`docs/research/v4-per-rule-pr-fpr.md`](./docs/research/v4-per-rule-pr-fpr.md) — per-rule Precision/Recall/FPR on the balanced 172k-file v4 corpus (THE credibility table)

### Removed (internal-only cleanup)

- `docs/ai-slop-rule-catalog.md` (duplicate of `docs/rule-catalog.md`)
- Internal drafts (gitignored but kept on disk):
  - `Show HN post draft.md`
  - `docs/strategy-2026.md`, `docs/strategy/v1-score-compression.md` (v1.0 is far horizon)
  - `docs/experiment-findings.md`, `docs/publishing-state-2026-06-25.md`
  - `docs/launch-blog-post-v4.1.md`

### Changed (docs)

- README first screen now leads with the problem statement (was "Repository Constitution Engine" tagline)
- Blog post (`docs/launch-blog-post-v4.1.md`) dropped "internal" audience framing
- ROADMAP.md realigned: v0.10 = credibility milestone, v1.0 = stability commitment (far horizon, 6+ months post-v0.10)
- AGENTS.md updated: all 12 phases shipped in v0.9.0, v0.10 in flight

### What v0.10 deliberately does NOT include

- v1.0 framing (far horizon, do NOT promise in user-facing copy)
- Deep-learning code stylometry (too compute-heavy per `math-foundations-for-slopbrick.md` §6.1)
- LLM watermarking (generation-time only)
- More heuristic rules without P/R/FPR data (moving backwards)
- The 5-bucket score compression (deferred to v1.1, depends on labeled dataset)

---

## [Unreleased] - 2026-06-25 (v4.1 calibration)

> **Push to origin/main complete (6 commits). Launch blog post drafted. 5-bucket compression deferred to v1.1.**

### Launch sequencing decision

Per direct user direction: "we are still at 0.9.1, do 1 to 4 [from the v1.0 plan], not entire version jump." The 5-bucket compression is now **deferred to v1.1**, not v1.0.

**v1.0 (incremental, at 0.9.x line):**
- Current 13-subscore diagnostic surface (works, calibrated, tested — 1176/1176 tests pass)
- Per-rule P/R/FPR table (the credibility piece — see `docs/research/v4-per-rule-pr-fpr.md`)
- Constitution + Pattern Inventory narrative (the strategic bet, in product docs)
- MCP `slop_suggest` endpoint (the lead user experience)

**v1.1 (next minor):**
- 5-bucket compression (after labeled dataset)
- GitHub Action + npm publish (separate version bump to 0.10.0)
- Hand-score 50-100 repos for bucket weights
- Re-calibrate `RATIO_THRESHOLDS` for bucket-level P/R/FPR

This sequencing matches the strategic priority: **ship what's working, defer what's not ready.** The 5-bucket compression is the right v1.1 work because it depends on data we don't have yet.

### Added

- **Launch blog post** ([`docs/launch-blog-post-v4.1.md`](./docs/launch-blog-post-v4.1.md)) — the credibility piece. Walks through the v1 → v4.1 → v5 calibration maturity ladder, the per-rule P/R/FPR table (top 10 by lift), the "92% of files flagged by `security/missing-auth-check` are AI" claim, and the launch sequencing decision (5-bucket deferred to v1.1).
- **Push to origin/main** — 6 commits pushed (`5558641..eea9336`):
  - `538488f` test(calibration): v4 1:1 corpus — 101k neg + 106k pos files
  - `283b4ac` docs(calibration): fix v3/v4 number inconsistencies
  - `4feb5b5` calibration(v4.1): per-rule P/R/FPR, score compression, cached-load
  - `5caf00b` docs(strategy): pivot v1-score-compression
  - `a0882fc` docs: lead README/ROADMAP/CHANGELOG/AGENTS/scoring-runbook/Show-HN with v4.1 narrative
  - `eea9336` docs: correct brand claim — 'Repository Constitution Engine' (not Memory)
- **Deferred-to-v1.1 note** in [`docs/strategy/v1-score-compression.md`](./docs/strategy/v1-score-compression.md) — explicit deferral of the 5-bucket compression, with the rationale (hand-calibrated weights, no labeled dataset, would re-calibrate twice if shipped now).

### Verified

- `pnpm typecheck` passes
- `pnpm test` — 1176/1176 pass in 114s
- `git push origin main` — 6 commits pushed successfully
- v4 corpus intact: 101,156 neg + 105,563 pos (full), 95,467 neg + 76,981 pos (frontend) — 1:1 ratio
- Brand claim corrected across README, CHANGELOG, Show HN, v1-score-compression: "Repository Constitution Engine" (not Memory)

> **Per-rule Precision/Recall/FPR, score compression proposal, cached-load for all 3 calibration tests, v4.1 corpus achieved 1:1 (95k neg + 77k pos frontend).**

### Calibration maturity step (v1 → v4.1 → v5)

The calibration has progressed through five stages. Each stage fixes a specific methodological problem with the previous one:

- **v1** (2026-05) — ratio = pos_fires / neg_fires (N=665 pos, 18k neg = 28:1). Inflated every ratio. ∞× fragile.
- **v3** (2026-06-15) — ratio on larger corpus (N=28k pos, 96k neg = 3.4:1). Less imbalanced but still ratio. Conflates P, R, FPR.
- **v4** (2026-06-25) — ratio on 1:1 balanced corpus (N=77k pos, 95k neg). The headline 322× dropped to 3.01× on balanced corpus — signal real, magnitude was inflated.
- **v4.1 (this commit)** — per-rule **Precision / Recall / FPR** with per-file granularity. 18 USEFUL rules (P ≥ 50% AND lift ≥ 2×), 7 OK, 9 NOISY, 11 INVERTED, 1 DORMANT.
- **v5 (next)** — per-rule P/R/FPR stratified by language and category. Bootstrap CIs. Sensitivity to corpus slice.

### Added

- **v4.1 per-rule P/R/FPR table** ([`docs/research/v4-per-rule-pr-fpr.md`](./docs/research/v4-per-rule-pr-fpr.md)) — 44 rules classified as USEFUL / OK / NOISY / INVERTED / DORMANT. Top 5 USEFUL signals: `security/missing-auth-check` (P=92.47%, lift=15.3×), `logic/ghost-defensive` (P=94.74%, lift=22.5×), `logic/math-console-log-storm` (P=89.84%, lift=11.0×), `logic/zombie-state` (P=83.33%, lift=6.2×), `test/duplicate-setup` (P=70.97%, lift=3.1×).
- **v1 score compression proposal** ([`docs/strategy/v1-score-compression.md`](./docs/strategy/v1-score-compression.md)) — compresses 13 subscores into 5 buckets (Architecture Consistency, AI Slop Signal, Security, Delivery Quality, Codebase Health). Addresses the "composite score credibility" challenge from the external product review.
- **P/R/FPR test block** in `tests/integration/calibration-expanded.test.ts` — adds a 3rd test asserting the 18 USEFUL rules meet precision, recall, and FPR thresholds. Both ratio-based and P/R/FPR-based tests must pass.
- **Calibration maturity ladder** documented in [`docs/research/calibration-report-2026.md`](./docs/research/calibration-report-2026.md) — the v1 → v5 trajectory with per-stage form, what was wrong, and what was fixed.
- **Strategic pivot section** in `v1-score-compression.md` — lead with `slop_suggest` (MCP) as the primary product surface, with the 5-bucket score as a secondary signal. Addresses the review's "the slop score is the marketing layer; the pattern inventory is the deeper capability" critique.

### Changed

- **Cached-load refactor** for all 3 calibration tests:
  - `calibration-expanded.test.ts`: 30+ min → **184ms** (loads from `/tmp/v4neg-fe-shards/`, `/tmp/v4pos-fe-shards/`)
  - `calibration-security.test.ts`: 30+ min → **164ms** (loads from `/tmp/corpus-v4neg-shards/`, `/tmp/corpus-v4pos-shards/`)
  - `calibration-db.test.ts`: 25s first run (populates cache), **<1s** after
  - All three use the same pattern: `loadCachedFires(shardsDir)` with live-scan fallback
- **v4 corpus construction**:
  - Raised per-repo file cap from 2,000 → 4,500 in `build-filelists-v2.sh`
  - Cloned **100 new shallow-cloned AI-tagged repos** in `corpus-expansion/positive/vibe-coded/` (hapi, claude-mem, ORG2, PraisonAI, refly, Vibe-Trading, langchain, ollama, agno, sglang, paperclip, …)
  - Added exclude filters for vendored/bundled code: `compiled/`, `__testfixtures__/`, `__snapshots__/`, `vendor/`, `vendored/`, `.cache/`
  - Final corpus: **101,156 neg + 105,563 pos (full)** = 0.96:1; **95,467 neg + 76,981 pos (frontend)** = 0.81:1
- **README.md** reorganized:
  - Lead with `slop_suggest` (MCP) and the "Repository Constitution Engine" framing
  - Show the 5-bucket compressed score as the headline
  - Add the v4.1 calibration evidence (95k neg + 77k pos, 1:1 ratio)
  - Keep the 13-subscore diagnostic surface behind the headline
- **ROADMAP.md**:
  - Added the calibration trajectory table (v0.5.0 → v1.0) with defensibility ratings
  - Added the v1.0 5-bucket compression section with bucket weights
- **`docs/research/calibration-report-2026.md`**: fixed v3/v4 number inconsistencies; per-rule table now uses v4 numbers; added "Calibration maturity ladder" and "What v4.1 changes about the launch story" sections.
- **v4.1 security test thresholds**: re-measured against v4 full multi-language corpus. `security/dangerous-cors` 5.14× → 1.74× (broader corpus diluted signal). `security/unsafe-html-render` 1.01× → 0.50× (now INVERTED on full corpus, still passes on frontend).

### Verified

- `pnpm typecheck` passes
- Full non-calibration suite: 1170/1170 pass
- All 3 calibration tests pass (expanded 3/3, security 1/1, db 1/1)
- Full test run (with calibration): **1176/1176 pass in 114s** (was 1170/1170, calibration tests now <1s each from cache)

## [0.9.1] - 2026-06-25 (pre-alpha)

> **The Repository Coherence Scanner reframe.** v0.9.0's "Slop Index" headline averaged every rule regardless of whether it measured pattern drift. This release narrows the lens: Repository Coherence is the new headline, built only from signals that answer "did this code introduce a new pattern when an existing pattern already existed?" Other dimensions (Security Risk, Code Hygiene, Accessibility, Performance) roll up the supporting rules into separate scores.

### ⚠️ Strategic correction (post-release)

The first cut of v0.9.1 shipped with 3 new rules (`arch/multiple-state-systems`, `arch/multiple-modal-systems`, `arch/multiple-api-clients`) intended to detect service proliferation. Those rules fired **intra-file** — they detected "this file uses 2+ libraries." That's not the lens. Removed in v0.9.2.

### Headline change: Repository Coherence (0–100, higher = better)

Composite (sum of weights = 1.0):

| Input | Weight | Source |
|-------|--------|--------|
| Architecture Consistency | 0.50 | existing `architectureConsistency` score |
| Pattern Fragmentation (inverted) | 0.30 | derived from architecture deductions |
| Constitution Violations (mapped) | 0.10 | count of declared-constitution breaches |
| AI Debt band (mapped) | 0.10 | A→95 / B→85 / C→70 / D→50 / F→25 |

The Slop Index remains as an informational aggregate of the supporting rules. It is no longer the headline.

### Three new domain scores (reported, not headline)

- **Code Hygiene** — `logic` + `test` + `typo` + `visual` + `layout` (31 supporting rules)
- **Accessibility** — `wcag` (4 hard accessibility rules)
- **Performance** — `perf` (2 perf rules)

### Lens reference

- [`docs/research/rule-classification-v0.9.1.md`](./research/rule-classification-v0.9.1.md) — full rule-by-rule classification

## [0.9.2] - 2026-06-25 (pre-alpha)

> **Cross-file drift detection lands.** v0.9.1 shipped the Coherence reframe + 3 service-proliferation rules, but those rules detected intra-file library mixing — not the lens. v0.9.2 removes the wrong-shape rules and replaces them with **inventory-first visitors + name-similarity clustering**, producing a user-visible Architecture Drift signal.

### The lens, end-to-end

A Python repo with `class UserService` + `class UserManager` + `class UserHandler` in one file now reports:

```
Architecture Drift
  User pattern (3 implementations):
    category: service
    patterns: UserHandler, UserManager, UserService
    · src/user_service.py
```

This is the first end-to-end manifestation of the Repository Coherence Scanner lens. Three implementations of the same conceptual entity = drift. AI generated `UserHandler` when the repo already had `UserService` — that's the answer to "did this code introduce a new pattern when an existing pattern already existed?"

### What's new

**Phase 1-2: Backend visitors** (Python + Go, regex-based, no parser deps):
- `src/engine/visitors/python.ts` — extracts `class \w+(Service|Manager|...)` → service, `@app.route('/foo')` → route, `class User(Base)` → ormModel
- `src/engine/visitors/go.ts` — extracts `type \w+ struct` → service, `http.HandleFunc(...)` → route, `type User struct { gorm.Model }` → ormModel
- Both feed into the existing `PatternInventory` as new categories: `service`, `route`, `ormModel`
- File discovery now includes `.py` and `.go` (default `include` patterns extended; `BACKEND_EXTENSIONS` added)
- Backend files skip the frontend rule engine (they have no AST visitor there) but still flow into the inventory

**Phase 3-4: Clustering + drift detection**:
- `src/engine/cluster.ts` — pure functions:
  - `stripSuffix()` — strips 30+ common suffixes (Service/Manager/Handler + UI suffixes like Modal/Dialog/Button + ORM suffixes like Model/Schema/Entity)
  - `normalizeRoute()` — strips `:param` and `{param}` segments so `/users` and `/users/:id` cluster as the same resource
  - `detectCrossFileDrift()` — returns `DriftSignal[]`: stems with 2+ distinct variants in the same category
  - `detectCrossCategoryDrift()` — stems appearing in 2+ categories (e.g. service.User + ormModel.User)
- Wired into `scan.ts`; surfaced in the new **Architecture Drift** + **Cross-Category Drift** sections of the pretty output

### Removed: the 3 wrong-shape service-proliferation rules

`arch/multiple-state-systems`, `arch/multiple-modal-systems`, `arch/multiple-api-clients` — these fired on **intra-file** library mixing. The proper lens is **cross-file** drift detection, which the new approach handles cleanly.

### Headline metric (unchanged from v0.9.1)

Repository Coherence (0-100, higher = better). The architecture-consistency score formula still uses the pre-v0.9.2 inputs — wiring the new categories into the headline deduction formula is phase 5.

### Engine surface

- `src/types.ts` — `ProjectReport.crossFileDrift` and `ProjectReport.crossCategoryDrift` added
- `src/cli/scan.ts` — wires `buildPatternInventory` → cluster → report
- `src/report/pretty.ts` — new `Architecture Drift` + `Cross-Category Drift` sections
- `src/engine/visitors/python.ts` — emits FULL class names (e.g. `UserService`), not stripped stems; the cluster strips suffixes downstream so it can see 3 distinct variants for stem `User`

### Test surface

- 10 cluster tests (`tests/engine/cluster.test.ts`)
- 17 Python visitor tests (`tests/engine/visitors/python.test.ts`) — updated to expect full names
- 8 Go visitor tests (`tests/engine/visitors/go.test.ts`) — unchanged
- All previously-passing tests still pass
- **1219 / 1219 tests pass** (was 1184 in v0.9.1)

### What's still pending (v0.9.3+)

- Phase 5: wire service/route/ormModel categories into the architecture-consistency score formula (so the headline Coherence number reflects the new lens)
- Phase 6: labeled-dataset calibration on Python + Go repos from `corpus-expansion/`
- Optional: expand suffix list as new patterns surface in the corpus
- Optional: re-implement the Go visitor with `tree-sitter-go` for better accuracy (current regex misses some patterns like indirect `gorm.Model` embedding)

### Lens reference

- [`docs/research/v0.9.2-inventory-visitors-plan.md`](./research/v0.9.2-inventory-visitors-plan.md) — 6-phase plan, phases 1-4 complete
- [`docs/research/rule-classification-v0.9.1.md`](./research/rule-classification-v0.9.1.md) — lens classification
- [`docs/research/v4-per-rule-pr-fpr.md`](./research/v4-per-rule-pr-fpr.md) — v4.1 P/R/FPR (separate axis)



> **The Repository Coherence Scanner reframe.** v0.9.0's "Slop Index" headline averaged every rule regardless of whether it measured pattern drift. This release narrows the lens: Repository Coherence is the new headline, built only from signals that answer "did this code introduce a new pattern when an existing pattern already existed?" Other dimensions (Security Risk, Code Hygiene, Accessibility, Performance) roll up the supporting rules into separate scores. See `docs/research/rule-classification-v0.9.1.md` for the full rule-by-rule classification.

### ⚠️ Strategic correction (post-release)

The first cut of v0.9.1 shipped with 3 new rules (`arch/multiple-state-systems`, `arch/multiple-modal-systems`, `arch/multiple-api-clients`) intended to detect service proliferation. Those rules fired **intra-file** — they detected "this file uses 2+ libraries." That's not the lens.

The lens requires **cross-file** drift detection: "repo already had UserService, AI created UserManager." To answer that, we need **inventory-first visitors** that extract patterns (Python classes, Go structs, etc.) and feed into `buildPatternInventory` — letting the existing architecture-consistency score surface drift.

Those 3 rules were removed from the codebase on 2026-06-25 (commit `c9e19cd`). The remaining v0.9.1 surface (Coherence composite + 3 domain scores) is sound; it's the missing cross-file drift detection that v0.9.2 ships. See `docs/research/v0.9.2-inventory-visitors-plan.md`.

### Headline change: Repository Coherence (0–100, higher = better)

Composite (sum of weights = 1.0):

| Input | Weight | Source |
|-------|--------|--------|
| Architecture Consistency | 0.50 | existing `architectureConsistency` score |
| Pattern Fragmentation (inverted) | 0.30 | derived from architecture deductions (modal/button/api/state/fetch) |
| Constitution Violations (mapped) | 0.10 | count of declared-constitution breaches, mapped 0–100 |
| AI Debt band (mapped) | 0.10 | A→95 / B→85 / C→70 / D→50 / F→25 |

The Slop Index remains in the report as an informational aggregate of the supporting rules. It is no longer the headline.

### Three new domain scores (reported, not headline)

Each is a 0–100 score (higher = better) that rolls up the supporting rules by category:

- **Code Hygiene** — `logic` + `test` + `typo` + `visual` + `layout` (31 supporting rules)
- **Accessibility** — `wcag` (4 hard accessibility rules)
- **Performance** — `perf` (2 perf rules)

### Engine surface

- New `src/engine/coherence.ts` — pure `computeCoherence` + `computeDomainScores` functions. No I/O; testable in isolation.
- `src/types.ts` — new optional fields on `ProjectReport`: `coherence`, `coherenceBreakdown`, `coherenceWeights`, `codeHygiene`, `accessibility`, `performance`, `domainIssues`. Existing fields preserved for backward compat.
- `src/cli/scan.ts` — wires Coherence + domain scores into the report. Failure paths log a warning and skip the new fields (matches existing pattern for repository-health).
- `src/report/pretty.ts` — headline rewritten. Composite formula shown as dim caption. Threshold against Coherence (≥ 70 PASS).
- `src/report/markdown.ts` + `src/report/html/sections.ts` — Coherence rendered first; Slop Index demoted to "informational".

### Test surface

- Existing tests updated where they asserted on "Slop Index" being the headline output.
- Full suite: **1199 / 1199 tests pass** in 124s.

### Lens reference

- [`docs/research/rule-classification-v0.9.1.md`](./research/rule-classification-v0.9.1.md) — full rule-by-rule classification (7 Core Coherence / 31 Supporting / 14 Independent Domain). Tally: 13% rules in the headline.
- [`docs/research/v4-per-rule-pr-fpr.md`](./research/v4-per-rule-pr-fpr.md) — v4.1 P/R/FPR (separate axis from Coherence lens).
- [`docs/research/v0.9.2-inventory-visitors-plan.md`](./research/v0.9.2-inventory-visitors-plan.md) — inventory-first visitors + cross-file drift detection (the proper backend coverage).



> **The endgame.** One composite number (Repository Health) + one letter grade (AI Debt) that aggregates every prior score. The 12-phase plan is complete.

### Repository Health composite score

New headline metric. One 0–100 score (higher = better) + categorical `aiDebt: low | medium | high | critical` band that aggregates all subscores. Lands in `ProjectReport.repositoryHealth` + `ProjectReport.aiDebt`. Surfaces in `slopbrick scan` output.

**Composite formula (default weights, sum to 1.0):**

| Axis | Weight |
|------|--------|
| `slopIndex` (inverted) | 0.20 |
| `architectureConsistency` | 0.20 |
| `aiSecurityRisk` (categorical → numeric via lookup) | 0.20 |
| `designTokenViolations` | 0.10 |
| `testQuality` | 0.10 |
| `businessLogicCoherence` | 0.10 |
| `docFreshness` | 0.05 |
| `dbHealth` | 0.05 |

Missing axes (e.g. before a subcommand ships) drop out and the remaining weights renormalize to 1.0. **Categorical security mapping** is monotonic (low=100, medium=75, high=40, critical=10). **Penalties**: -10 when `aiSecurityRisk === 'critical'` (a single hardcoded API key outranks everything), -1 per high-severity issue up to -15.

Categorical bands: 80+ low, 60–79 medium, 40–59 high, 0–39 critical.

### Expanded `slop_suggest` MCP tool

The primary entry point for AI agents now returns:
- `hint` — usage guidance
- `doNotCreate` — the constitution's `forbidden` deny-list (cap 10)
- `declaredStack` — flattened list of declared state mgmt + data fetching + UI libs + forms + styling + routing
- `existingPatterns` — the canonical pattern inventory (modals, buttons, api, state, data fetching)

Agents now receive the do-not-create list alongside the existing-pattern inventory in one tool call — they don't need a separate constitution-check round-trip for "what should I NOT introduce?"

### New `slop_governance` MCP tool

Returns just the headline number for agents that want the composite + breakdown without the full pattern inventory:
```json
{
  "repositoryHealth": 88.9,
  "aiDebt": "low",
  "breakdown": { "slopIndex": 75, "architectureConsistency": 100, ... },
  "warnings": [],
  "headline": "Repository Health: 88.9/100  (AI Debt: low)"
}
```

### MCP tool consolidation (1 of 3)

The roadmap called for collapsing 11+ tools to 4. v1 ships **8 tools** (one less than 0.8.0's 9; `slop_governance` replaces four future per-phase tools). The remaining consolidation (drop the per-phase tools in favor of `slop_suggest` + `slop_scan_file` + `slop_check_constitution` + `slop_governance`) is deferred to 0.9.x when more users have weighed in.

### Engineering

- `src/engine/repository-health.ts` — pure function `buildRepositoryHealth` (~280 LOC) with weight-renormalization + categorical security mapping + penalty model
- `src/types.ts` — `AiDebt`, `RepositoryHealth`, `RepositoryHealthInputs`, `AI_SECURITY_NUMERIC`, `REPOSITORY_HEALTH_WEIGHTS`
- `src/cli/scan.ts` — wires `buildRepositoryHealthFromReport` into the existing try/catch pattern; composes from the `ProjectReport` we already produce
- `src/mcp/tools.ts` — `slop_suggest` extended with `doNotCreate` + `declaredStack`; new `slop_governance` tool + handler
- All 1179 tests passing

### Pre-alpha framing

This is the **endgame release of the 12-phase plan**. After 0.9.0 lands, the public surface is stable enough for early adopters. 1.0 is reserved for the stability commitment after 6 months of empirical feedback — when the API can be frozen and backward compatibility guaranteed.

## [0.8.0] - 2026-07-15

> **Three specialised subcommands + one derived meta-score.** Industry context: Sonar's published $306K/yr/MLoC benchmark anchors the maintenance-cost formula; arXiv 2606.04769 sets the floor for docs precision/recall at F1 = 96.73%; the official `eslint-plugin-drizzle` has 2 rules — we ship 6.

### AI Maintenance Cost (`slopbrick maintenance-cost`)

New subcommand. Categorical `low | medium | high | critical` meta-score derived from existing slopbrick signals (no new file scanning).

```bash
slopbrick maintenance-cost [--format text|json] [--strict]
```

**Score formula** (calibrated to published benchmarks):

```ts
// Per-issue cost: CodeClimate grade→minutes × $50/hr fully-loaded dev rate
const issueCost =
    highSeverityCount   * 400 +   // F-grade: 8h+
    mediumSeverityCount * 150 +   // C-grade: 3h
    lowSeverityCount    *  50;    // B-grade: 1h

// Sonar baseline: $25.50 per 1000 LoC per month
const locBaseline = (linesOfCode / 1000) * 25.50;

// Bucket multiplier (categorical → numeric)
const bucketMultiplier = { low: 0.5, medium: 1.0, high: 2.0, critical: 4.0 }[bucket];

// AI multiplier (only when AI-typical signals present)
const aiMultiplier = hasAiSignals ? 1.8 : 1.0;

const monthlyUSD = Math.round(
    Math.max(0, locBaseline * bucketMultiplier * aiMultiplier + issueCost * aiMultiplier)
);
```

Calibration anchors:
- Sonar 2025: **$306,000/yr per 1 MLoC** of code-level technical debt
- CodeClimate: per-grade remediation time (A<1h, B 1-2h, C 2-4h, D 4-8h, F>8h) at $50/hr fully-loaded
- AI multiplier 1.5–2.5× justified by CodeRabbit 1.7×, Faros 3×, GitClear 4×, SO trust collapse 40→29%
- Sanity check lands within 1 order of magnitude of Stripe Developer Coefficient upper bound ($1.65M/yr per 50-dev team)

Categorical mapping: `>= 80` low, `>= 60` medium, `>= 30` high, else critical. `--strict` exits 1 on high/critical.

Now included in `slopbrick scan` output as `report.aiMaintenanceCost`.

### Documentation Freshness (`slopbrick docs`)

New subcommand. 0-100 score + categorical `docDrift` band. 4 rules in v1 (research-backed scope per `docs/research/phase-6-doc-drift-internet-2026.md`):

```bash
slopbrick docs [--format text|json|markdown] [--strict]
```

Rules (per-rule weights sum to 14, the score formula subtracts):
- `docs/stale-package-reference` (weight 5) — markdown mentions `npm install <pkg>` / `import ... from '<pkg>'` / `require('<pkg>')` but `<pkg>` isn't in `package.json`
- `docs/stale-function-reference` (weight 3) — markdown inline code references a camelCase identifier that isn't in the project's exports AND appears in a calling context
- `docs/expired-code-example` (weight 4) — fenced `ts`/`tsx`/`js`/`jsx` code block imports a package not in `package.json` or a relative path that doesn't exist
- `docs/broken-link` (weight 2) — relative markdown link target doesn't resolve on disk

Categorical bands: 80+ low, 60-79 medium, 40-59 high, 0-39 critical.

**Two rules deferred to 0.8.x** for FP control (per IEEE 2025 survey + Docsie case studies):
- `docs/stale-env-var-reference`
- `docs/stale-url-reference` (route paths)

**Marketing hook**: AWS Kiro outage (Dec 2025, 13 hours in China region) — agentic coding tool autonomously deleted production because of unchecked AI permissions. Stale code examples in READMEs are the slower-clock-speed version of the same failure mode: copy-paste from stale docs into AI-generated code silently teaches the wrong thing.

**Calibration floor**: arXiv 2606.04769 reports F1 = 96.73% on description-code inconsistency (the closest published analog task). 0.8.0 RC commits to publishing precision/recall numbers against this floor.

Now included in `slopbrick scan` output as `report.docFreshness` / `report.docDrift`.

### Database Health (`slopbrick db`)

New subcommand. 0-100 score + categorical `dbDrift` band. Postgres-only static analysis via `pgsql-parser` (libpg_query port, ~3 MB, actively maintained).

```bash
slopbrick db [--format text|json|markdown] [--strict]
```

6 rules in v1 (two rules — `db/dead-column`, `db/dead-table` — deferred to Phase 8.1 which needs live DB):
- `db/missing-fk-index` (weight 5) — `REFERENCES` declared without matching index
- `db/duplicate-index` (weight 4) — same column-list declared twice
- `db/missing-not-null` (weight 4) — required columns (id, email, created_at, …) without NOT NULL or PRIMARY KEY
- `db/enum-sprawl` (weight 1) — `CREATE TYPE ENUM` with > 12 values
- `db/naming-inconsistency` (weight 1) — snake_case + camelCase identifiers mixing in the same file
- `db/sql-concat` (weight 5) — template-literal SQL queries with `${...}` interpolation in TS/TSX

**Marketing wedge**: official `eslint-plugin-drizzle` has exactly 2 rules. No other open-source tool statically analyzes Drizzle schema quality (missing FK indexes, missing NOT NULL, dead columns, ENUM coverage). Squawk owns migration safety; we own schema quality — our advice strings cross-link to Squawk's `require-concurrent-index-creation` rule.

**Justification for Postgres-only v1**: "It's 2026, Just Use Postgres" (Tiger Data, 2026); multi-dialect SQL linters (SQLFluff, SlowQL) pay a heavy complexity tax for limited additional value. MySQL/SQLite deferred to Phase 8.1.

Score formula: `clamp(0, 100, 100 - (issueWeight / scannedFiles) * 5)`.

Now included in `slopbrick scan` output as `report.dbHealth` / `report.dbDrift`.

### Engineering

- Added `pgsql-parser@^17.9.15` (libpg_query port, ~3 MB install) — the chosen Postgres static-analysis backend per `docs/research/phase-8-db-health-internet-2026.md`. Was originally deferred due to dep-weight concern; research confirms it's the right tradeoff for v1.
- Added `'docs'` and `'db'` to the `Category` union (additive — no consumer breaks). Touched 5+ files: `src/config/defaults.ts`, `src/config/init.ts`, `src/engine/metrics.ts`, `src/report/advice.ts`, `src/report/html/utils.ts`, plus tests.
- All 1167 tests passing.

### Public artifacts reframed

- README: 3-tier score table (Tier 1 deterministic / Tier 2 heuristic / Tier 3 derived), 0.8.0 section added, "Why this matters" with research citations
- CHANGELOG: 0.8.0 with maintenance-cost formula, docs and db scope
- AGENTS.md: 13 scores in 3 tiers; primary user remains the AI agent
- ROADMAP: Phases 5 / 7 / 7b / 8 / memo #4 all marked shipped (0.7.0 + 0.8.0); release-train section lists calibration anchors per subcommand

## [0.7.0] - 2026-06-25

> **Repository Constitution Engine for AI Coding Agents.** Four new subcommands, the `constitution` rename + `forbidden` deny-list, and engineering fixes for Node 24 CJS worker compatibility. Industry context: GitClear's 211M-line analysis shows "refactored" lines fell from 25% → <10% between 2021–2024 while "copy-pasted" lines rose from 8.3% → 12.3%; CodeRabbit's 470-PR study shows AI code carries 1.7× more issues per PR. The Constitution is the moat against this drift.

### PR slop score (`slopbrick pr`)

New subcommand that scores a PR by scanning only the files changed
between `--base` and `--head`. One weighted number you can use as a
CI gate.

```bash
slopbrick pr --base main --head HEAD
# PR score: 4 (threshold: 20) — PASS
```

#### CLI

```
slopbrick pr [--base <ref>] [--head <ref>]
              [--format text|json|markdown]
              [--threshold <n>] [--max-files <n>]
```

Defaults: `--base main` (falls back to `master` then first commit),
`--head HEAD`, `--format text`, `--threshold 20`, `--max-files 500`.

#### Score formula

Per file:

- `slop = sum(SEVERITY_WEIGHTS[issue.severity])` for every issue
  raised by the engine on that file. Weights: `low=1, medium=3,
  high=5` (reused from `src/engine/metrics.ts`).
- `violations = checkFileConstitution(source, config.constitution).length`
  — each import that violates the declared constitution or hits the
  `forbidden` deny-list costs 1 point.
- `total = slop + violations`

PR score = sum of per-file totals. The default `threshold: 20`
lets a PR introduce roughly 4 medium-severity issues or 20 low-
severity issues before failing. Lower it to fail PRs that add any
meaningful slop; raise it to be more permissive.

#### Exit codes

- `0` — score ≤ threshold (PASS)
- `1` — score > threshold (FAIL — PR adds too much slop)
- `2` — fatal error (not a git repo, no config, IO failure)

#### Output formats

`text` (default) — human-readable, per-file issue list with
severity, rule ID, and line number. `json` — full structured
`PrResult` for dashboards / status checks. `markdown` — GitHub-
flavored markdown with `<details>` blocks per file, suitable for
posting as a PR comment.

#### Config

Set a per-repo default threshold in `slopbrick.config.mjs`:

```js
export default {
  prScoreThreshold: 10, // fail PRs adding more than 10 slop points
};
```

The `--threshold` flag overrides the config value for a single
invocation.

### Constitution rename + `forbidden` deny-list

The `conventions` config field is now `constitution`, and the
matching public type / function names track the rename. Internal
table (`CONVENTION_SIGNALS` → `CONSTITUTION_SIGNALS`), MCP tool
(`slop_check_conventions` → `slop_check_constitution`), CLI report
column, and `ProjectReport` field all use the new naming.

#### `constitution.forbidden` — explicit deny-list

New optional field on the `constitution` block:

```js
export default {
  constitution: {
    stateManagement: ['zustand'],
    dataFetching: ['react-query'],
    // ...
    forbidden: ['moment', '@types/', 'lodash'],
  },
};
```

Anything in `forbidden` is rejected by `slopbrick drift` and the
`slop_check_constitution` MCP tool. Matching rules:

- Exact match: `forbidden: ['moment']` matches `import 'moment'`.
- Scoped prefix: `forbidden: ['@types/']` matches any `@types/...`
  import. Trailing slash is required — `@types` alone does NOT
  match `@typeset`.
- Bare prefix: `forbidden: ['lodash']` matches `lodash` and
  `lodash/foo`, but NOT `lodash-es`. Use `forbidden: ['lodash/']`
  to forbid every subpath.

Forbidden matches are reported alongside canonical-category
violations in the same `violations` array. The first matching
entry wins per import.

#### Migration

`conventions` → `constitution` everywhere (config, type, MCP tool
name, report column). Existing configs must rename the
top-level field from `conventions` to `constitution`. The MCP
tool name change is breaking — there are no existing users.

### Test Quality score (`slopbrick test`)

New subcommand dedicated to test code. Runs the full scan with
test-file globs, then filters results to the four `test/*` rules
and computes a Test Quality score (0–100, lower = more issues).

Four new rules — each short-circuits on non-test files so the
Slop Index isn't distorted:

- `test/weak-assertion` — `expect(x).toBeDefined()` / `toBeTruthy()`
  / `toBe(x)` tautologies. AI test generators lean on these
  because they pass on any code.
- `test/duplicate-setup` — `beforeEach` / `beforeAll` /
  `setupServer(...)` bodies that share a normalized hash. Two
  near-identical setups in the same file is a strong AI signal.
- `test/fake-placeholder` — fixture literals like `'John Doe'`,
  `name: 'foo'`, `createdAt: '2020-01-01'`. Production data
  masquerading as fixtures.
- `test/missing-edge-case` (opt-in) — production functions
  without any matching test. Walks production code only.

```
slopbrick test [--format pretty|json] [--strict]
```

`--strict` exits 1 on any test issue (CI gate). Score formula:
`100 - ceil(sum(weight) / 5)`, weights `low=1, medium=3, high=5`.

### Business Logic Coherence score (`slopbrick business-logic`)

New subcommand that scores 0–100 for business-logic hygiene:
currency math, validation completeness, locale-agnostic
formatting, hardcoded dates. Eight detection rules:

- `business-logic/math-round-cents` — `Math.round(x * 100) / 100`
  without BigInt / `dinero.js` / decimal lib. Loses precision
  over thousands of transactions.
- `business-logic/magic-rate-decimal` — `0.0825` written bare
  instead of as a named constant. Tax rates, interest rates,
  commission rates that drift between files.
- `business-logic/hardcoded-currency-symbol` — `$` / `€` in
  template literals. Wrong for international users and breaks
  RTL locales.
- `business-logic/unconstrained-zod-string` — `z.string()`
  without `.min()` / `.email()` / `.url()`. Lets any garbage
  through your API.
- `business-logic/missing-error-message` — `throw new Error()`
  with no message. Logs become unsearchable.
- `business-logic/hardcoded-iso-date` — `'2024-01-01'` in
  fixtures. Time-zone dependent tests that pass locally and
  fail in CI.
- `business-logic/locale-string-no-options` —
  `toLocaleString()` without explicit locale. Different results
  for users in different regions.
- `business-logic/raw-currency-in-template` — `${price} USD`
  in user-facing strings. Should be a format function with the
  user's locale.

```
slopbrick business-logic [--format text|json|markdown]
```

Score formula: `100 - (issueWeight / scannedFiles) * 100`,
weights `formatting=1, validation=2, pricing=3`.

### Pattern Fragmentation score (`slopbrick patterns`)

New subcommand that counts the number of distinct UI /
architectural patterns per category. Pattern Fragmentation is
the **input** to `slop_suggest`'s `doNotCreate` list — agents
that know there are already 3 modal systems in the repo won't
introduce a 4th.

Eight categories scored independently:

- `modal` (weight 10) — modal / dialog / sheet components
- `auth` (weight 8) — auth guards, hooks, middleware
- `state` (weight 6) — state stores, contexts, slices
- `button` (weight 4) — button variants
- `api` (weight 4) — API client modules
- `toast` (weight 4) — toast / notification systems
- `card` (weight 4) — card layouts
- `forms` (weight 3) — form schemas

Score formula: `clamp(0, 100, 100 - (deduction / N) * 100)`
where `N = sum(weights) * 4` and `deduction = sum((count - 1) *
weight)` over each category.

```
slopbrick patterns [--format text|json|markdown] [--max-files <n>]
```

### Engineering

- Fixed dynamic `require('node:fs')` in
  `src/rules/test/missing-edge-case.ts` that the CJS worker
  bundle emitted as a literal `require("fs")` inside a function
  body, producing `"Dynamic require of \"fs\" is not supported"`
  parse errors on every file when running the binary on Node 24.
  Moved the import to the top of the file.
- Fixed `slopbrick test --strict` not propagating: the
  subcommand's local `--strict` option was being shadowed by
  the root program's global `--strict`. Routed the value
  through `command.optsWithGlobals()` so the merged value
  reaches `runTestScan`.
- Excluded `tests/fixtures/**` from the vitest run; those
  `.test.ts` files are inputs to the rule engine, not test
  suites.

## [0.6.4] - 2026-06-25

### AI Security Risk (new score) + 8 Tier-1 / Tier-2 security rules

The headline addition for 0.6.4 is the **AI Security Risk** categorical score —
`low | medium | high | critical` — for security failures AI generates
disproportionately. Independent of the Slop Index, so a single
hardcoded API key outranks everything else.

NOT a security scanner — Semgrep / GitHub Advanced Security / CodeQL /
Gitleaks own that market. We catch the patterns AI generates
disproportionately and frame them as **AI-induced security risk**.

#### New security rules (8 total)

Six Tier-1 rules (high signal, low false-positive risk):

- **`security/hardcoded-secret`** (high, aiSpecific) — provider prefixes
  (`sk-`, `sk-ant-`, `AKIA`, `ghp_`, `sk_live_`, `AIza`, `xox[abprs]-`) +
  sensitive-name literals (`jwtSecret`, `password`, `apiKey`, `privateKey`).
- **`security/exposed-env-var`** (high, aiSpecific) — `NEXT_PUBLIC_*`,
  `VITE_*`, `REACT_APP_*`, `EXPO_PUBLIC_*`, `GATSBY_*`, `PUBLIC_*` with
  `SECRET`/`KEY`/`TOKEN`/`PASSWORD`/`PRIVATE`/`CREDENTIAL` in the name —
  gets inlined into every browser build.
- **`security/dangerous-cors`** (medium, aiSpecific) — wildcard
  `Access-Control-Allow-Origin: *` + `cors({ origin: '*' })` + reflective
  `cors({ origin: true })`.
- **`security/missing-auth-check`** (medium) — Next.js `route.ts` /
  `pages/api` / Express handlers with no auth primitive in body.
- **`security/unsafe-html-render`** (high, aiSpecific) —
  `dangerouslySetInnerHTML={{ __html: <non-literal> }}` — XSS injection surface.
- **`security/fail-open-auth`** (high, aiSpecific) —
  `if (process.env.NODE_ENV === 'development') return true/next()` —
  auth bypass that ships to production.

Two Tier-2 rules:

- **`security/sql-construction`** (high, aiSpecific) — SQL queries built
  with template-literal interpolation (`SELECT * FROM users WHERE id = ${id}`)
  or string concatenation (`'SELECT ...' + userId`). Use parameterized
  queries (`pg`, `mysql2`, Prisma, Drizzle, Knex query builder).
- **`security/public-admin-route`** (medium) — routes under `/admin`,
  `/internal`, `/debug`, `/staff`, `/manage`, `/private`, `/backstage`,
  `/console`, `/moderation`, `/trust`, `/safety` without an additional
  role/permission check on top of standard auth.

#### AI Security Risk score mapping

- `critical` ≥1 critical-severity finding OR ≥3 high-severity findings
- `high` ≥1 high-severity finding OR ≥3 medium-severity findings
- `medium` ≥1 medium-severity finding
- `low` 0 findings

#### New CLI subcommand

```bash
slopbrick security [--format pretty|json] [--strict]
```

`--strict` exits 1 on high/critical (CI gate). Default exit 0 (info only).

#### Report integration

`ProjectReport` gains `aiSecurityRisk?: 'low' | 'medium' | 'high' | 'critical'`
and `aiSecurityFindings?: { critical, high, medium, low }`. Both auto-populated
during every `slopbrick scan` so JSON / SARIF / HTML reports carry the score
alongside Slop Index and Architecture Consistency.

## [0.6.3] - 2026-06-25

### Architecture Consistency Score (the headline metric)

A single 0–100 number that reflects how consistent a repository's patterns
are. Subtracts from 100 for each pattern-duplication finding:

- `-12` per extra modal/dialog system (cognitive load on newcomers)
- `-8` per extra button component variant
- `-10` per extra API client module
- `-15` per extra state-management library (highest weight — hardest to refactor out)
- `-10` per extra data-fetching library
- `-1` per 5 off-scale spacing values
- `-1` per 5 off-scale border-radius values

A project with 1 modal, 1 button, 1 API client, 1 state lib, 1 fetch lib, no
off-scale values lands at 100. A project with 3 modal systems, 4 button
variants, 2 state libs (zustand + redux) lands at 100 − 24 − 24 − 15 = **37**.
Clamped to [0, 100].

#### New CLI subcommand

```bash
slopbrick architecture [--format pretty|json] [--max-files <n>]
```

Pretty output prints the headline + per-category breakdown sorted by impact.
JSON output emits the full `ArchitectureScore` for dashboards.

#### Report integration

`ProjectReport` gains `architectureConsistency?: number` +
`architectureDeductions?: CategoryDeduction[]`. Both auto-computed during
every `slopbrick scan` so the score appears in JSON / SARIF / HTML reports
without a separate command.

### Design-token enforcement (2 new rules)

Two new rules turn design tokens from documentation into enforceable
contracts:

- **`visual/spacing-scale-violation`** (medium) — flags `p-[13px]`,
  `gap-[1.75rem]`, `mx-[7px]`, `px-[3px]`, `space-x-[9px]`, etc. whose
  numeric value falls off the declared `spacingScale`. Default matches
  Tailwind (0, 0.5, 1, 1.5, 2, 2.5, ...).
- **`visual/radius-scale-violation`** (medium) — flags `rounded-[7px]`,
  `rounded-t-[2rem]`, `rounded-br-[5rem]` etc. off the declared
  `radiusScale`. Default: Tailwind's radius tokens (none through 11xl + full).

Both emit auto-fix candidates so `slopbrick scan --fix` rewrites
`p-[13px]` → `p-1` and `rounded-[7px]` → `rounded-md` automatically.

#### Config additions

- `ResolvedConfig.radiusScale?: (number | 'full')[]` field
- `DEFAULT_RADIUS_SCALE` constant exported from `src/config.ts`

## [0.6.2] - 2026-06-25

### Repository governance for AI coding agents

The single feature most teams asked for: declare your stack in
`slopbrick.config.mjs` and enforce it across every PR.

#### Constitution declaration in config

New top-level `constitution` field in `slopbrick.config.mjs`:

```js
export default {
  constitution: {
    stateManagement: ['zustand'],
    dataFetching:    ['react-query'],
    uiLibrary:       ['shadcn', 'radix'],
    forms:           ['react-hook-form', 'zod'],
    styling:         ['tailwind'],
    routing:         ['next'],
  },
};
```

Auto-detected from `package.json` (40-entry signal table covering
state management, data fetching, UI libraries, forms, styling,
routing) when unset. User declarations always win over detected
signals — including explicit empty arrays which mean "we
deliberately don't use this category."

#### New CLI subcommand

```bash
slopbrick drift [--format pretty|json] [--max-files <n>]
```

CI-friendly exit codes:

- `0` — no violations (or no constitution declared)
- `1` — at least one violation (blocks the build)
- `2` — fatal error (config / IO)

#### New MCP tools

- **`slop_suggest`** — project-wide pattern inventory (modals,
  buttons, API clients, state libs, data-fetching libs). AI agents
  call this *before* writing new code to reuse existing patterns.
- **`slop_check_constitution`** — per-file constitution diff. Reads the
  file, extracts imports, returns violations with category + declared
  values + human-readable reason. Wire into pre-PR checks.

## [0.6.1] - 2026-06-25

### Bug fixes + small refinements

- **`slopbrick trend --format markdown` now works.** The local
  `--format` flag on the trend subcommand was being silently shadowed
  by the global scan `--format` (Commander collision). Renamed the
  local flag to `--render`. Verified end-to-end with a fresh dist
  build. *(commit `9cc2caa`)*
- **Calibration test now surfaces real crash causes.** The chunk-runner
  in `tests/integration/calibration.test.ts` was swallowing stderr/
  stdout in a bare `catch {}`, so chunk failures showed only
  "Scanner did not produce chunk-NNNN.json" with no signal about why.
  Now captures stderr/stdout and re-throws on unexpected exits
  (signals, status≥3) with the actual error preview. Three consecutive
  calibration runs after the fix pass in ~48s each. *(commit `25be543`)*
- **v1.x working-tree labels stripped.** Old internal version labels
  (1.0.0 through 1.4.4) were leaking into source comments, fixture
  data, and test descriptions. Stripped from `src/`, `tests/`,
  `examples/`, and `CHANGELOG.md`. *(commit `01e321e`)*

### No new features

0.6.1 is purely a maintenance release — no new commands, no new rules,
no API changes. Bumping in 0.0.1 increments so each fix is traceable
in `git log` and `npm changelog`.

## [0.6.0] - 2026-06-24

### Repository re-architecture — engine split

The headline change for 0.6.0 is the engine cleanup. No behavior changes,
no public API changes, no new features — this release makes the codebase
contributor-friendly enough that adding a new rule handler no longer
means editing the 1300-line monolith.

#### Engine split (`src/engine/visitor.ts` 1313 → 650 lines, -50%)

| Module | Lines | Purpose |
|---|---:|---|
| `src/engine/visitor.ts` | 650 | The walker. Imports + InternalFacts type + extractFacts() + the visit() loop. |
| `src/engine/visitors/dispatch.ts` | 762 | Per-node-type handlers + helper functions, all taking a VisitorCtx parameter. Was already extracted in v2.0.x but the closure-bound duplicates in visitor.ts survived. Now fully canonical. |
| `src/engine/visitors/scan-helpers.ts` | 396 (new) | Pure (no closure state) helpers: directive parser, fetch() helpers, node-type predicates, JSX shape, v2-build helpers. |
| `src/engine/visitors/v2-build.ts` | 324 (new) | ScanFactsV2 assembler — pure function of InternalFacts + source + ext + framework + config. |
| `src/engine/visitors/ast-guards.ts` | 259 | AST pattern helpers (binary && chain, inline-function detection, etc.). |
| `src/engine/visitors/react.ts` | 264 | React-AST extraction helpers. |
| `src/engine/visitors/html.ts` | 324 | HTML element extraction. |
| `src/engine/visitors/templates.ts` | 38 (facade) | Re-exports from templates/{positions,astro}. |
| `src/engine/visitors/templates/{positions,astro}.ts` | 115 + 350 | Pure template / Astro extractors. |
| `src/engine/visitors/internal.ts` | 76 | FunctionFrame type + WalkContext type. |

#### Dead-code deletion (205 lines)

14 closure helpers were inlined inside `extractFacts()` but never
called by anything reachable — `dispatch.ts` has its own copies
(all taking a `VisitorCtx` parameter) that ARE called by the
per-node-type handlers. Removed:

`nearestComponent`, `nearestFrame`, `findNearestBlock`, `isPropBinding`,
`isPassThroughIdentifier`, `isPropsPassThrough`, `trackPropUsage`,
`attachHook`, `hasTypeAnnotation`, `isAndChainChildLocal`,
`containsNode`, `isBindingSite`, `isNonComputedMemberProperty`,
`markStateReference`

The only live closure helpers inside `extractFacts()` are now
`collectBindingNames` (called by `pushFrame`), `pushFrame`, and
`popFrame`. They are tightly coupled to the walker's closure state
(`ctx` + `facts` + `lineOffsets`) and stay inline.

#### Backwards compatibility

`visitor.ts` still re-exports every public helper that tests and
external callers depend on: `isHookName`, `buildLineOffsets`,
`positionFromOffset`, `positionFrom`, `endPositionFrom`, `containsJsx`,
`stringLiteralValue`, `numericLiteralValue`, `templateLiteralValue`,
`staticClassValue`, `jsxAttrName`, `jsxElementName`, `extractElementFact`,
`unwrapJsxExpression`, `unwrapArgument`, `getFunctionName`,
`sourceText`, `FunctionFrame`, `extractDisabledRules`,
`isConditionalNode`, `isLoopNode`, `findMatchingBrace`,
`extractOptimisticUpdates`, `fetchCallHasSignal`, `fetchCallChecksOk`,
`extractFetchUrl`, `extractFetchCredentials`, `extractFetchMethod`,
`countJsxBranches`, `maxJsxNestingDepth`, `extractDepNames`,
`deriveFramework`. All test imports continue to work unchanged.

### Added

- **`src/engine/visitors/scan-helpers.ts`** — new module grouping
  pure helpers by concern (directive parsing, fetch(), node-type
  predicates, JSX shape, v2-build helpers).
- **`src/engine/visitors/v2-build.ts`** — new module owning the
  ScanFactsV2 shape conversion. `extractFacts()` now calls
  `buildV2Facts(facts, source, ext, framework, config, templateClassNames)`
  instead of inlining ~180 lines of shape-mapping logic.

### Removed

- 14 closure-bound helper functions that were duplicated between
  `extractFacts()` and `dispatch.ts`. The canonical (and only-used)
  implementations live in `dispatch.ts`.

### Verification

- `pnpm typecheck` clean.
- `pnpm test`: 744/744 pass.
- `pnpm build`: ESM + CJS + DTS all green.
- No public API changes. `dist/` artifact is bit-for-bit equivalent
  in behavior to 0.5.2 (same runtime, same outputs).

## [0.5.2] - 2026-06-24

### Patch release

No behavior changes. Two published-version OIDC re-tags after the
0.5.0 / 0.5.1 chain to land the package on the npm registry with
provenance attestation. The npm-published artifact is identical to 0.5.1.

## [0.5.1] - 2026-06-24

### Patch release: OIDC trusted publishing + provenance

Re-published 0.5.0 via the new GitHub Actions release workflow
(`.github/workflows/release.yml`) to lock in npm provenance
attestation. Same source as 0.5.0; the only change is the publish
mechanism. The release workflow fires on `v*` tag push, verifies
tag-vs-package.json version match, fails fast on already-published
versions, runs typecheck + test + build, then publishes to npm with
OIDC trusted publishing (no `NPM_TOKEN` secret required).

## [0.5.0] - 2026-06-23

### Initial public release

This is the first version of `slopbrick` published to npm. Earlier
version labels (1.0.x – 1.4.x) were internal iteration numbers — the
package had never been published under those labels, so they are
collapsed into this single 0.5.0 release.

### Added

- **`slopbrick explain <ruleId>`** prints a GitHub `helpUri` linking
  to the rule's source file in `src/rules/<category>/`.
- **`examples/`** ships 4 ready-to-use starter configs:
  `basic/` (sensible defaults), `strict/` (CI gating with `noIncrease`),
  `monorepo/` (pnpm/turbo workspaces), `ci/` (JSON + SARIF output),
  plus `examples/README.md` walkthrough and
  `examples/basic/sample-component.tsx`.
- **`slopbrick validate-config [path]`** subcommand runs static
  validation of `slopbrick.config.mjs` without scanning. Catches
  typos in rule ids (with "Did you mean …?" suggestions), bad
  threshold values, invalid framework values, and unknown top-level
  keys. Exit 0 valid, 1 errors, 2 file not found.
- **Per-rule signal-strength metadata** in
  `src/rules/signal-strength.json`. 22 rules have measured
  precision / recall / fpRatio against the labeled corpus. Exposed
  via:
  - `slopbrick rules --show-signal-strength` (worst-signal-first table)
  - JSON reporter: each issue carries an optional `signalStrength` field
  - HTML reporter: precision/recall badge per issue (green = reliable,
    red = unreliable)
- **`slopbrick scan --incremental --cache-path <p>`** persists
  per-file content hashes across runs and skips unchanged files. Cache
  invalidates on VERSION mismatch. Works outside git repos.
  `.slop-audit-cache.json` added to `.gitignore`.
- **`slopbrick scan --auto-disable-noisy-rules`** downgrades rules
  whose measured precision < 0.5 or recall < 0.1 by one severity tier
  (`high → medium → low → off`, `auto → low`). The downgrades are
  applied at scan start; the rule is still loaded but its issues are
  not counted against the Slop Index.
- **`slopbrick flywheel --export <path>`** writes the raw
  flywheel summary as a JSON file for sharing with the calibrate /
  research pipeline.
- **`research calibrate`** now accepts `--positive-dir <path>` and
  `--negative-dir <path>` for custom corpora, in addition to the
  built-in baseline.
- **GitHub Actions release workflow** (`.github/workflows/release.yml`):
  fires on `v*` tag push, verifies tag-vs-package.json version match,
  fails fast on already-published versions, runs typecheck + test +
  build, then publishes to npm with **OIDC trusted publishing +
  provenance attestation** (no `NPM_TOKEN` secret required). Also
  creates a GitHub Release with auto-generated notes.

### Fixed

- **cache**: `saveCache` now unlinks any orphan `<path>.tmp` from a
  previously interrupted save. The `.tmp` was diagnostic-only
  (`loadCache` ignores it), but lingering files were noise.
- **rule**: `typo/math-cta-vocabulary` vocab tightened — 23 universal
  form terms (save, edit, close, cancel, submit, etc.) removed. The
  rule now flags *only* CTA phrasing that is statistically slop-heavy.

### Refactored (no behavior change)

- **engine/visitor**: complete the walker-body dispatch refactor
  across four iterations. All 9 per-node-type handler blocks from the
  original `processNode()` are now top-level functions in
  `visitors/dispatch.ts`, keyed by AST node type in a static
  `HANDLERS` table. `processNode` is a 6-line dispatch call.
  - **Step 1**: CallExpression dispatch (hook + fetch). Lifted
    `nearestComponent`, `findNearestBlock`, `attachHook`,
    `markStateReference`, plus 5 `fetch*` helpers.
  - **Step 2**: Identifier + MemberExpression dispatch. Lifted
    `trackPropUsage` + 4 pure binding-site helpers (`containsNode`,
    `isBindingSite`, `isNonComputedMemberProperty`,
    `isPassThroughIdentifier`, `isPropsPassThrough`).
  - **Step 3**: JSXAttribute + JSXOpeningElement + VariableDeclarator
    dispatch. Lifted `nearestFrame`, `collectBindingNames`,
    `isUseStateDeclarator`, `extractStateBinding`.
- `src/engine/visitor.ts`: **1484 → 1132** lines (−352)

### Performance

Benchmarked `slopbrick scan` on the project's own source (~200 files):

| `--threads` | avg time | notes |
|------------:|---------:|-------|
| 1 | 169ms | fastest for small workloads |
| 2 | 197ms | overhead dominates |
| 4 | 227ms | slower still |
| 8 | 321ms | much slower |

Worker startup + IPC overhead dominates for sub-1000-file scans. The
default `cpus.length / 2` (set in an earlier iteration) is too
aggressive for small projects. Workaround: pass `--threads 1` for
typical scans; only use more threads when scanning 1000+ files.

Rule memoization was deferred — `extractFacts` is already
deterministic per file and only ~0.85ms/file on this workload.
Re-walking facts per rule contributes <5% of the wall time and would
add complexity without measurable benefit.

### Tests

- 744 tests across 90 files, all passing
- 60 new tests in 0.5.0 covering: orphan .tmp cleanup, walk-mode,
  `--auto-disable-noisy-rules`, `flywheel --export`, custom-corpus
  calibrate, `math-cta-vocabulary` tightened vocab

---


## Pre-release iterations (consolidated into 0.5.0)

Versions each iteration in the pre-release cycle were internal iteration labels during
the pre-release development cycle. They were never published to npm —
the project's first published release was [0.5.0] above. The full
pre-0.5.0 history (and the walker-dispatch
split, signal-strength metadata, incremental scan, validate-config,
examples/, and the original release workflow) is preserved in git
history — see `git log -- CHANGELOG.md` for the individual entries,
or `git show 0.5.0:CHANGELOG.md` for the pre-trim file.


## Pre-0.5.0 history

Versions each iteration in the pre-release cycle were internal iteration labels during
the pre-release development cycle. They were never published to npm —
the project's first published release was [0.5.0] above. The full
pre-0.5.0 history (and the walker-dispatch
split, signal-strength metadata, incremental scan, validate-config,
examples/, and the original release workflow) is preserved in git
history — see `git log -- CHANGELOG.md` for the individual entries,
or `git show 0.5.0:CHANGELOG.md` for the pre-trim file.

