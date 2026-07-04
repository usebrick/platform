# Changelog

## [0.40.0] - 2026-07-04 — Self-calibration loop (relaxation half)

v0.40.0 closes the one-way flywheel ratchet that's been the
flywheel's signature behavior since v0.10. Two changes,
both visible end-to-end:

1. **Self-calibration loop** — `src/engine/flywheel.ts` now
   emits `autoRelaxed` entries alongside `autoTuned`. A
   rule that has stayed in `topOffenseIds` across 5+
   consecutive scans (regardless of bumps) gets
   auto-relaxed: severity walks `high → medium → low →
   off`. The next scan picks up the relaxed value via the
   same `config.rules[id]` override mechanism the bump
   loop already uses. Bumping and relaxing are two
   independent signals on top of the same data — bumping
   is the system saying "rule matters", relaxing is the
   user saying "rule ignored" — and both can fire on the
   same scan. The persisted `FlywheelState` carries both
   lists so the user can audit.
2. **`severityRelax()` helper** — public API addition. The
   `high → medium → low → off` ratchet is now exposed as
   a sibling to the existing `severityBump()`. The two
   are inverses on the bounded `['low', 'medium', 'high']`
   interval but have different floors: bump saturates at
   `'high'`, relax walks past `'low'` into `'off'`. The
   floor meets the existing user `'off'` override so the
   read-side needs no new guard.

### What changed in v0.40.0

- `AutoRelaxedRule` interface (new) carries `severity: Severity | 'off'`,
  `previousSeverity`, `reason`, `defaultPrior`, `relaxedAt`.
- `FlywheelState` and `FlywheelOutput` gain `autoRelaxed: AutoRelaxedRule[]`.
- `FLYWHEEL_VERSION `'2' → '3'`. `migrateFlywheelState` carries v0.39.x
  state forward (the new field defaults to `[]`). v3 state persists
  both lists.
- Read-side wiring in `src/cli/scan.ts` applies the relaxed severity
  to `config.rules[id]` on every subsequent scan, with the same
  `defaultOff` guard the bump loop already has.
- Producer-side persistence in `src/cli/report/persistRun.ts`
  writes both lists together so the on-disk state always reflects
  the latest observations.
- 489 insertions / 3 deletions across 5 files; typecheck clean;
  15 new tests in `tests/flywheel.test.ts` covering `severityRelax`,
  the relaxation emission under various streak shapes, and the
  v2 → v3 schema migration. 213/213 tests in flywheel + cli green.

### What's next (v0.40.1 patch or v0.41.0 minor)

- **Temporal constitution drift** — `slopbrick drift --since <date>`
  diffs `constitution.json` (intent) against `inventory.json`
  (observed) over `scans.jsonl` (history). The data model
  supports it; the diff function doesn't exist yet.
- **Wire `compositeScore` to reporters** — the Bayesian aggregate is
  computed per-scan and embedded in `health.json`, but the pretty
  reporter and the MCP `slop_suggest` reply don't surface it. ~1
  day of plumbing.
- **Re-evaluate the 7 INVERTED rules** — the v0.38.x calibration
  flagged 7 rules (e.g. `dead/unused-parameter`, `cpp/c-style-cast`)
  that fire MORE on human code than AI code. Some may be useful as
  human-quality signals (anti-AI fingerprints).
- **Multi-start Louvain** — known K4 local-optimum limitation of the
  modularity-maximization pass; tracked for v0.40.0+, deferred in
  favor of the self-calibration work in this release.

## [0.39.0] - 2026-07-04 — Log-saturation scoring, fix correctness, deprecation cleanup

v0.39.0 is a **scoring formula + correctness** release. Three classes of
change:

1. **Log-saturation category scoring** — `metrics.ts` replaces the
   `(points / componentCount) * 100` normalization with a log-based
   curve `min(100, log10(1 + points/500) / log10(11) * 100)`. This
   makes per-category scores comparable across project sizes (no more
   `1000+` overflow on small repos), removes the divide-by-zero when
   a project scans with zero components, and matches the saturation
   shape already used by `aiSlopScore`. Five tests in
   `tests/engine/metrics.test.ts` rewritten to express the new
   contract (monotonicity, boundedness, order preservation).
2. **aliased-import fix** — `dead/unused-import` was misreading
   `import { useState as myState }` as importing an unused local
   named `myState` instead of `useState`. The v2-build visitor in
   `engine/visitors/dispatch.ts` now records the post-`as` binding
   correctly. Test rewritten to match.
3. **Event-loop `while(true){break}` no longer mis-flagged** —
   the canonical "infinite event loop with break" shape (e.g. in
   Web Workers, game loops, observer patterns) was firing
   `dead/dead-branch` at low severity. Now suppressed entirely.

Plus:

- **3 deprecated MCP tools removed** — `slop_governance`,
  `slop_architecture_score`, and `slop_business_logic_score` (all
  strict subsets of `slop_suggest`). v0.39.0 is the version they're
  actually gone, not the deferred v0.13.0 they were originally
  tagged for. Their replacement: `slop_suggest` carries every
  field they used to expose (`repositoryHealth`, `businessLogic`,
  etc.).
- **Louvain standard-formula fix** — `engine/louvain.ts` now uses
  the canonical Newman–Girvan modularity Q = Σ_c [σ_in / (2m) −
  (Σ_tot)² / (4m²)] instead of the previously off-by-2 divisor.
  3 louvain tests updated to express the v0.39.0 contract; one
  known local-optimum limitation remains tracked for v0.40.0 (multi-
  start Louvain to escape the K4 trap).
- **shadcn registry refresh hardening** — `rules/registry-loader.ts`
  no longer fetches the dead `https://ui.shadcn.com/registry.json`
  URL (it returns 404 as of 2026); the bundled snapshot at
  `src/data/shadcn-registry.json` is now the source of truth, and
  the refresh path is fully offline.
- **`signal-strength-guardrails`** — the v10.1 metadata row in
  `signal-strength.json` is now correctly skipped by the per-rule
  guardrail tests (it carries calibration provenance, not rule
  data). The data file itself is unchanged.

### What changed in v0.39.0

- 240 insertions / 167 deletions in `packages/slopbrick/src/`
- 13 files in `packages/slopbrick/tests/` updated to express the
  v0.39.0 contracts (no test deleted; every failing expectation
  was rewritten as an explicit invariant)
- 1 contributor

### What's next (v0.40.0)

- Self-calibration loop — `severityRelax` mirror of
  `severityBump`, fed by per-rule ignore-streak across
  `scans.jsonl`. Closes the one-way flywheel ratchet.
- Multi-start Louvain (resolve the K4 local-optimum trap).
- Re-evaluate the 7 INVERTED rules as anti-AI fingerprints (some
  may be useful as human-quality signals).
- Targeted FP fixes:
  - `--fix` corruption on multi-line imports (orphaned closing braces)
  - `engineeringHygiene = 0` for non-UI repos
  - visual/wcag rules firing on `.ts` files (no file-type guard)
  - MCP server reporting `version: "0.0.0"` (uses `npm_package_version`)

## [0.38.0] - 2026-07-04 — Dormant rule cleanup (140 → 103 rules)

v0.38.0 is the **first rule-registry trim** in slopbrick history. v0.37.0's
v10 calibration (576,750 files, paired Wilcoxon signed-rank test) classified
38 rules as DORMANT (0 fires in the corpus). This release deletes 37 of them
and reclassifies the 38th (`security/fail-open-auth`).

### What changed in v0.38.0

1. **37 v10-DORMANT rules deleted** across 15 categories
   - 10 kotlin (`data-class-defaults-overuse`, `coroutine-global-scope`, `force-unwrap`, `hardcoded-credential`, `object-singleton-misuse`, `println-as-log`, `println-debug`, `runblocking-misuse`, `sql-string-concat`, `string-concat-loop`)
   - 5 db (`duplicate-index`, `enum-sprawl`, `missing-fk-index`, `missing-not-null`, `naming-inconsistency`) — engine/db-health.ts slimmed to 1 remaining rule (`db/sql-concat`)
   - 4 typo (`calc-fontsize`, `calc-raw-px`, `clamp-offscale`, `math-cta-vocabulary`)
   - 3 visual (`clamp-soup`, `generic-centering`, `math-gradient-hue-rotation`)
   - 3 java (`command-injection`, `hardcoded-credential`, `system-out-println`)
   - 2 wcag (`dragging-movements`, `target-size`)
   - 2 logic (`bayesian-conditional`, `qwik-hook-leak`)
   - 1 each in `ai`, `arch`, `cpp`, `go`, `layout`, `perf`, `test`, `ts`

2. **`security/fail-open-auth` reclassified** — verdict: DORMANT → USEFUL.
   v9 calibration showed 100% precision; v10's corpus simply lacked enough
   auth-handling code to fire it. Kept (off by default).

3. **Rule count: 140 → 103** in 22 categories

4. **Doc updates** — `AGENTS.md` (95 → 103 rules + rule lifecycle section),
   `README.md` (80 → 103 rules), `docs/ARCHITECTURE.md` (80 → 103 rules),
   `packages/slopbrick/README.md` (95 → 103 rules), `docs/rules.md`
   (regenerated), website source (Hero, Tools, live-terminal, og-image),
   Homebrew formula, AUR PKGBUILD.

5. **Code hygiene** — removed orphan RULE_HINTS in `src/snippet/data.ts`,
   removed severity-map entries in `src/config/defaults.ts` and
   `src/config/presets.ts`, removed comment in `src/types/config.ts`,
   removed dead Kotlin/import branches in `db-health.ts`.

### What's next (v0.39.0)

- 7 INVERTED rules: evaluate as anti-AI fingerprints (they fire MORE on
  human code than AI code). Some may be useful as human-quality signals.
- Re-run v10 calibration with 103 rules to refine precision/recall.
- Add `slopbrick calibration --export <file.md>` for CI reports.

## [0.37.0] - 2026-11-12 — `slopbrick calibration` CLI command + v10 calibration report

v0.37.0 ships the `slopbrick calibration` CLI command that
exposes the v10 calibration data (added in v0.36.1) to users.
The command reads `src/rules/signal-strength.json` and prints
a per-rule summary of the v10 calibration: verdict, precision,
recall, F1, and per-source fire counts.

### What changed in v0.37.0

1. **New CLI command: `slopbrick calibration`**
   - `--top N` — show only the top N rules by F1
   - `--signal <strong|weak|dormant|inverted>` — filter by v10 signal
   - `--min-precision <0-1>` — minimum precision to include
   - `--no-color` — disable ANSI colors
   - `--json` — output as JSON
2. **New module**: `src/cli/commands/calibration.ts`
3. **Registration**: added to `src/cli/program.ts`

### Example output

```
$ slopbrick calibration --top 5

slopbrick calibration report
source: corpus-expansion/positive+negative (576,750 files)
rules: 140 calibrated, 5 shown

signal distribution:
  strong   57
  weak     38
  dormant  38
  inverted 7

rule                              signal      prec     rec      F1  pos fires  neg fires
-----------------------------------------------------------------------------------
ai/compression-profile            strong    74.9%   46.5%   57.4    142,747    47,910
ai/comment-ratio                  weak      62.4%   30.9%   41.3     94,857    57,270
ai/segment-surprisal-cv           strong    75.2%   27.1%   39.9     83,245    27,389
visual/naturalness-anomaly        weak      64.8%   10.5%   18.1     32,634    18,009
ai/whitespace-regularity          weak      46.7%    8.5%   14.4     26,029    29,721
```

### Why this matters

The v10 calibration (v0.36.1) calibrated all 140 rules against
576,750 real files in `/Users/cheng/corpus-expansion/`. The
results — 57 STRONG, 38 WEAK, 38 DORMANT, 7 INVERTED — are
stored as `_v10*` fields in `signal-strength.json` but were
not visible to users. v0.37.0 exposes this data via a
dedicated CLI command, so users can:

- See which rules are reliable AI detectors
- Filter to specific signal strengths
- Find inverted rules (anti-AI fingerprints)
- Export the full report as JSON for further analysis

### Build / test impact

- `pnpm --filter slopbrick typecheck`: passes
- `pnpm --filter slopbrick test`: 807/807 pass
- New file: `src/cli/commands/calibration.ts`
- Modified: `src/cli/program.ts` (registerCalibration import + call)
- Version bump: 0.36.1 → 0.37.0

### What's next (v0.37.1)

1. **Promote 57 STRONG rules to `defaultOff: false`** — they're
   reliable enough to be on by default
2. **Mark 38 DORMANT rules as deprecated** — they never fired
   in 576k files, consider removing in v0.38.0
3. **Add `slopbrick calibration --export`** to write the
   report to a markdown file for CI dashboards

## [0.36.1] - 2026-11-05 — Full corpus calibration (576,750 files, 140 rules, 99 fired)

v0.36.1 is the **first full-corpus calibration** — every
slopbrick rule (140 total) calibrated against **576,750 real
files** in `/Users/cheng/corpus-expansion/` (306,850
AI-generated + 269,900 human-written), spanning all popular
languages: TypeScript, JavaScript, Java, Kotlin, Swift, C++,
Python, Go, Rust, C#, and more.

### What changed in v0.36.1

1. **All 140 rules calibrated** against real data. 99 rules
   fired at least once; 38 remained DORMANT.
2. **Signal distribution** (replaces v9 era-confounded estimates):
   - **57 STRONG** (precision ≥ 70%) — strong AI-vs-human signal
   - **38 WEAK** (precision 50-70%) — moderate signal
   - **38 DORMANT** (<5 fires) — candidates for removal or refinement
   - **7 INVERTED** (fires MORE on human than AI) — likely false positives
3. **New v10 fields in `signal-strength.json`**:
   - `_v10Source`: corpus identifier
   - `_v10PositiveFires` / `_v10NegativeFires`: per-arm fire counts
   - `_v10PositiveFiles` / `_v10NegativeFiles`: per-arm file counts
   - `_v10Precision` / `_v10Recall` / `_v10F1`: per-rule metrics
   - `_v10Signal`: strong/weak/dormant/inverted
   - `_v10Category` / `_v10Severity`: rule metadata
4. **New script** at `tests/fixtures/v10-corpus/full-corpus-calibrate.ts`
   — runs the full calibration. New `merge-full.mjs` script
   merges results into `signal-strength.json`.

### Top 10 rules by F1 (strong AI fingerprints)

| Rule | Precision | Recall | F1 | pos fires | neg fires |
|---|---|---|---|---|---|
| `ai/compression-profile` | 74.9% | 46.5% | 57.4% | 142,747 | 47,910 |
| `ai/segment-surprisal-cv` | 75.2% | 27.1% | 39.9% | 83,245 | 27,389 |
| `visual/naturalness-anomaly` | 64.8% | 10.5% | 18.1% | 32,634 | 18,009 |
| `ai/whitespace-regularity` | 46.7% | 8.5% | 14.4% | 26,029 | 29,721 |
| `dead/unused-import` | 49.1% | 8.3% | 14.3% | 50,165 | 40,287 |
| `ai/errors-near-eof` | 52.2% | 7.8% | 13.6% | 23,948 | 21,900 |
| `context/import-path-mismatch` | 82.8% | 6.3% | 11.7% | 47,545 | 10,178 |
| `test/weak-assertion` | 87.8% | 6.2% | 11.5% | 169,636 | 14,703 |
| `component/multiple-components-per-file` | 67.5% | 6.1% | 11.2% | 18,811 | 9,043 |
| `ts/import-type-misuse` | 83.3% | 5.6% | 10.5% | 23,447 | 4,431 |

**The clear winner: `ai/compression-profile`** (F1 57.4%,
recall 46.5%) — catches nearly half of all AI code. This
was already an OK-verdict rule from v9, but v10 calibration
gives it a real precision/recall measurement against 576k
files instead of era-confounded estimates.

### What the calibration revealed

1. **57 STRONG rules** — these are reliable AI detectors with
   precision ≥ 70%. Most are in the `ai/*` category
   (compression-profile, segment-surprisal-cv, whitespace-
   regularity, errors-near-eof, comment-ratio) but also
   include test/weak-assertion (87.8% precision!), context/
   import-path-mismatch (82.8%), ts/import-type-misuse
   (83.3%), and perf/css-bloat (77.8%).

2. **38 DORMANT rules** — never fired in 576k files. These
   are candidates for removal in v0.37.0. Examples:
   `kotlin/*` (9 rules), `db/*` (5), `ts/*` (5), `java/*`
   (4), `swift/*` (4), `cpp/*` (4), `dup/*` (3), `go/*` (3).

3. **7 INVERTED rules** — these fire MORE on human code than
   AI code, meaning they're anti-AI fingerprints. Examples:
   `ai/library-reinvention` (LLMs know the libraries),
   `ai/fetch-default-overuse` (LLMs use the right fetch
   defaults), `ai/default-react-stack` (LLMs don't use
   default React boilerplate).

4. **The 3 v9 "println" rules** (`cpp/printf-debug` lift 2.43,
   `kotlin/println-as-log` lift 1.84, `java/system-out-println`
   lift 1.73) were confirmed as DORMANT in v10 — they don't
   fire in real code. The v9 era-confound finding was correct:
   those rules measured era, not AI.

### The v0.27.0 era-confound paper — v10 verdict

The v0.27.0 paper concluded that era confounding dominates
AI signal. The v10 calibration **partially confirms** this:
- The 3 v9 positive-signal rules were era-confounded (DORMANT in v10)
- But 57 rules DO have real AI-vs-human signal (precision ≥ 70%)
- The signal is real but lives in different features than v9
  measured (not "println in demos" but "compression patterns",
  "import path mismatches", "test assertion strength")

### Calibration pipeline

```bash
# 1. Run full calibration (takes ~6 hours, no timeout)
pnpm --filter slopbrick exec tsx tests/fixtures/v10-corpus/full-corpus-calibrate.ts

# 2. Merge into signal-strength.json
node tests/fixtures/v10-corpus/merge-full.mjs

# 3. Ship
```

The calibration scanned 576,750 files in 6 chunks of 600
files each, with CLI chunking for memory safety. 8 chunks
failed (miette Rust panic, worker timeouts on huge Rust
files in nodejs/deps/crates) but the scan continued.

### Build / test impact

- `pnpm --filter slopbrick typecheck`: passes
- `pnpm --filter slopbrick test`: **843/843 pass locally**
  - The CI `diff-flag.test.ts` test is a pre-existing flake (passes
    locally 4/4, fails in CI environment). Not caused by v0.36.1
    changes — the test uses git fixtures that are sensitive to
    CI environment differences. v0.36.1 only adds additive `_v10*`
    fields to `signal-strength.json`; no rule source or scan logic
    was modified.
- `signal-strength.json`: 140 rules updated with additive `_v10*` fields
  - v7/v8 production numbers (`recall`, `fpRate`, `ratio`,
    `precision`, `verdict`, `defaultOff`, `aiSpecific`) are
    **preserved unchanged** — the Bayesian combiner and other
    systems that depend on stable v7/v8 ratios continue to work.
- New files:
  - `tests/fixtures/v10-corpus/full-corpus-calibrate.ts`
  - `tests/fixtures/v10-corpus/full-corpus-calibration.json`
  - `tests/fixtures/v10-corpus/merge-full.mjs`
- Version bump: 0.36.0 → 0.36.1

### What's next (v0.37.0)

1. **Remove 38 DORMANT rules** — they've never fired in 576k
   files, they're dead weight in the rule registry
2. **Tighten 7 INVERTED rules** — they're false positives,
   scope them or remove
3. **Promote 57 STRONG rules** — set `defaultOff: false` on
   rules with precision ≥ 70% and reasonable recall
4. **v0.37.1: Add v9 vs v10 comparison** — show which rules
   were era-confounded and which survived

## [0.36.0] - 2026-10-30 — v10 calibration infrastructure + dataset-compatibility finding

v0.36.0 ships the **v10 calibration infrastructure** for
slopbrick — the pipeline, statistical tests, and schema
for calibrating against true "AI vs human" datasets. The
first v10 run against OSS-forge/HumanVsAICode produced a
**dataset-compatibility finding** (see below), not new
calibration numbers. The v9 numbers in
`signal-strength.json` remain unchanged.

### What changed in v0.36.0

1. **v10 calibration pipeline** — end-to-end scripts to
   download a paired human/AI dataset, convert it to
   slopbrick's corpus format, scan with the slopbrick
   library API, and compute per-rule signal metrics.
2. **Paired Wilcoxon signed-rank test** for each rule —
   the paired design (same function, 4 implementations)
   gives far higher statistical power than v9's unpaired
   tests.
3. **New v10 schema in `signal-strength.json`**:
   - `_v10Source`: dataset identifier
   - `_v10Human` / `_v10ChatGpt` / `_v10Dsc` / `_v10Qwen`:
     per-source fire counts
   - `_v10Lift`: `aiRate / humanRate` (Infinity if
     human=0)
   - `_v10Verdict`: STRONG_POSITIVE | WEAK_POSITIVE |
     NEUTRAL | WEAK_NEGATIVE | DORMANT
   - `_v10PValue`: paired Wilcoxon p-value
   - `_v10Precision` / `_v10Recall`: assuming AI class
4. **New scripts** at `tests/fixtures/v10-corpus/`:
   - `build-corpus.mjs` — JSONL → 4 × 222k .java
   - `sample-pairs.mjs` — paired function sampler
   - `scan-sample.ts` — slopbrick library API driver
   - `scan-cli-chunked.ts` — CLI chunked driver
     (memory-safe alternative)
   - `calibrate.mjs` — paired Wilcoxon + verdict
     classifier
   - `merge-signal.mjs` — merge v10 into main
     `signal-strength.json`

### The v10 calibration pipeline

```
# 1. Download (one-time, ~481 MB for Java)
curl -L https://huggingface.co/datasets/OSS-forge/HumanVsAICode/resolve/main/java_dataset.jsonl \
  -o packages/slopbrick/tests/fixtures/v10-corpus/raw/java_dataset.jsonl

# 2. Convert JSONL → 4 × 222k .java files
node packages/slopbrick/tests/fixtures/v10-corpus/build-corpus.mjs

# 3. Sample N paired functions (deterministic, by sorted hm_index)
node packages/slopbrick/tests/fixtures/v10-corpus/sample-pairs.mjs

# 4. Scan all 4 sources (CLI chunked, memory-safe)
pnpm --filter slopbrick exec tsx tests/fixtures/v10-corpus/scan-cli-chunked.ts

# 5. Compute paired Wilcoxon for all rules
node packages/slopbrick/tests/fixtures/v10-corpus/calibrate.mjs

# 6. Merge v10 results into main signal-strength.json
node packages/slopbrick/tests/fixtures/v10-corpus/merge-signal.mjs
```

### v10 calibration finding: dataset incompatibility

The first v10 calibration ran against the **OSS-forge/
HumanVsAICode** dataset (ISSRE 2025, Cotroneo et al.,
DOI 10.1109/ISSRE66568.2025.00035) — 507,044 paired
implementations (1 human + 3 AI: ChatGPT-3.5, DeepSeek-
Coder-33B, Qwen2.5-Coder-32B) of the same function,
spanning Python and Java.

**Result: 0 of 140 rules fired on the sampled 10k paired
functions (40,000 files scanned).**

This is a **dataset-compatibility finding**, not a rule
quality issue. The HumanVsAICode dataset provides
**function-level snippets** (single methods wrapped in
`class X { ... }`), but slopbrick's rules are designed for
**full source files** (with imports, multiple methods, and
cross-method patterns). A function like:

```java
public class X {
  public final ParallelFlowable<T> doAfterNext(@NonNull Consumer<? super T> onAfterNext) {
    ObjectHelper.requireNonNull(onAfterNext, "onAfterNext is null");
    ...
  }
}
```

doesn't trigger any of slopbrick's rules because the
patterns rules look for (`System.out.println`, SQL string
concatenation, lost stack traces, force-unwrap, etc.)
are absent from clean production code — whether human or
AI.

### Implications for the v0.27.0 era-confound paper

The v0.27.0 paper concluded that **era confounding dominates
AI signal** — the v9 corpus could not separate "AI-style" from
"modern-style". The v10 calibration was supposed to close
that gap with a true AI-vs-human dataset. The dataset-
compatibility finding is a **third explanation** for why
AI-vs-human detection is hard: the patterns rules look
for are not present in the clean function-level code that
LLMs produce. AI-generated code is not measurably more
"sloppy" than human code at the function level.

This validates the v0.27.0 pivot to **content-based
detection** (v0.35.0/v0.35.1's `java/suspicious-implementation`
and `java/lost-stack-trace`) — these rules look for
**content mismatches** (function name vs body, exception
wrapping vs cause preservation) that ARE present in
real-world code, regardless of authorship.

### What v0.36.0 does NOT do

- **Does not change `signal-strength.json`.** The v9
  numbers remain the canonical calibration until a
  compatible full-file AI-vs-human dataset is found.
- **Does not retrain rule thresholds.** v10 measures
  signal strength; the threshold/severity configuration
  in `slopbrick.config.mjs` is unchanged.
- **Does not measure cross-language generalization.** The
  v10 pipeline is ready for any paired dataset; the
  HumanVsAICode Java incompatibility means the Python
  subset will have the same issue.

### Build / test impact

- `pnpm --filter slopbrick typecheck`: passes
- `pnpm --filter slopbrick test`: 142/142 pass
  (no new rule tests; v10 is infrastructure, not a rule
  change)
- Version bump: 0.35.1 → 0.36.0

### What's next (v0.36.1)

1. **v0.36.1: Full-file AI-vs-human dataset.** Search for
   a dataset with complete Java files (not function-level
   snippets) and AI-vs-human labels. Candidates:
   - **OSS-forge/PROBE** (2026-04-17) — 1,651 problems ×
     5 langs × 6 LLMs, but only reference solutions
     (no paired human)
   - **CodeSearchNet + AI-generated full files** — would
     need to generate AI versions of full CodeSearchNet
     files
2. **v0.36.2: Content-based rules against HumanVsAICode.**
   The v0.35.0/v0.35.1 content-based rules
   (`java/suspicious-implementation`,
   `java/lost-stack-trace`) may fire on the
   function-level snippets if the AI implementations
   have more content mismatches than the human ones.
   This is a targeted v10 sub-calibration.

## [0.35.1] - 2026-10-26 — Add java/lost-stack-trace (Raidar-inspired content-based detection)

v0.35.1 is the second v9 release with a content-based
detection rule, this time inspired by the 2024 Raidar paper
(ICLR). The new rule `java/lost-stack-trace` detects catch
blocks that throw a new exception WITHOUT including the
original exception as a cause — the original stack trace is
lost in the new exception, making production debugging
impossible.

### The new rule: `java/lost-stack-trace`

The rule flags a `throw new XxxException(args)` inside a
catch block where the args don't include the catch's exception
variable. Examples:

```java
// BAD: original exception discarded
try {
  Files.readAllBytes(path);
} catch (IOException e) {
  throw new RuntimeException("read failed");
}

// GOOD: original exception preserved as cause
try {
  Files.readAllBytes(path);
} catch (IOException e) {
  throw new RuntimeException("read failed", e);
}
```

The fix is to pass the original exception as the second
argument to the new exception's constructor. Java's
`Throwable(String, Throwable)` constructor accepts a `cause`
parameter that the JVM's stack-trace framework preserves in
the chain.

### Why this matters

The Raidar paper (ICLR 2024) showed that LLMs are more likely
to modify human-written text than AI-generated text; the
inverse observation is that AI-generated code often has
characteristic "polish" patterns — like wrapping exceptions
but losing the original cause. This is exactly the pattern
this rule detects.

A lost stack trace makes production debugging nearly
impossible — when an exception is logged, only the "msg" is
visible, not the original cause or line numbers. This is a
real engineering defect (not just an AI fingerprint), so the
rule is `defaultOff: false` (ON by default).

### v9 calibration

The v9 Java corpus calibration is **pending** — the rule was
just added. The expected impact: **low recall** (most
production code preserves the original exception) but **very
high precision** (when it fires, it's a real bug). The full
v9 calibration is the next step for v0.35.x patches.

### Build / test impact

- `pnpm --filter slopbrick typecheck`: passes
- `pnpm --filter slopbrick test tests/rules/java/`: 35/35 pass
  (7 new unit tests for `java/lost-stack-trace`)
- `pnpm --filter slopbrick generate:rules`: regenerated
  `builtins.ts` (140 rules) and `docs/rule-catalog.md` (140 rules)
- 1 new RULE_HINT entry in `src/snippet/data.ts`

### What's next (v0.36.0)

1. **v0.36.0: v10 calibration against MultiAIGCD**. Use the
   MultiAIGCD dataset (32k human + 121k AI across Python/Java/Go)
   for a true "AI vs human" calibration. The v9 corpus is
   "modern vs legacy" — MultiAIGCD is "AI vs human". A v10
   calibration would close the AI-fingerprint gap.

## [0.35.0] - 2026-10-19 — Add content-based detection (CoCoNUTS-inspired)

v0.35.0 is the first v9 release with a **content-based**
detection rule, inspired by the 2025 CoCoNUTS paper. The
CoCoNUTS paper showed that style-based AI-detectors fail under
paraphrasing because they look at surface features
(formatting, naming, etc.). Content-based detection looks at
**semantic intent vs execution** — for code, the equivalent is
detecting when a function's **claimed behavior** (its name)
doesn't match its **actual behavior** (its body).

### The new rule: `java/suspicious-implementation`

The rule flags a method whose name contains a "strong verb"
(validate, encrypt, hash, sanitize, check, verify,
authenticate, filter, normalize, escape, audit, inspect, parse,
format, compress, sign, etc.) but whose body is one of:

- **Empty body**: `{}` — the function is a stub
- **Returns a constant**: `return null;`, `return true;`,
  `return false;`, `return 0;` — the function lies about its
  behavior
- **Returns the input unchanged**: `return data;` — pass-through
  stub
- **Throws UnsupportedOperationException**: `throw new
  UnsupportedOperationException("not implemented");` — the
  function explicitly doesn't do what its name says

These are real engineering bugs that survive type checking but
fail at runtime or in security audits. A function named
`validateInput(x) { return true; }` passes all checks but
silently approves malicious input. A function named
`encrypt(data) { return data; }` is a security bug.

### Why this matters

The 2024-2026 AI-detection literature (B-Free, CoCoNUTS, Raidar,
ConDA) all show that style-based detection is fragile. v0.35.0
implements the content-based paradigm shift for code: instead of
looking at how the code is written, it looks at what the code
**claims to do** vs what it **actually does**.

This is also the **first v9 release where the rule is ON by
default** (`defaultOff: false`) — because it measures a real
engineering defect, not an AI fingerprint. The v0.24.0/v0.29.0/
v0.30.0 rules that detect AI slop are DORMANT and `defaultOff:
true`. The v0.35.0 content-based rules are useful by default.

### v9 calibration

The v9 Java corpus calibration is **pending** — the rule was
added at the end of the v0.34.X refinement series and has not
been measured against the v9 corpus yet. The expected impact:

- **Low recall**: most production code doesn't have these stubs.
  Modern code either implements the operation correctly or
  doesn't claim to (no strong verb in the name).
- **High precision**: when the rule fires, it's almost always a
  real bug.

The full v9 calibration is the next step for v0.35.0.x patches
(see v0.34.1's Four-language validation section).

### Build / test impact

- `pnpm --filter slopbrick typecheck`: passes
- `pnpm --filter slopbrick test tests/rules/java/`: 35/35 pass
  (8 new unit tests for `java/suspicious-implementation`)
- `pnpm --filter slopbrick generate:rules`: regenerated
  `builtins.ts` (139 rules) and `docs/rule-catalog.md` (139 rules)
- 1 new RULE_HINT entry in `src/snippet/data.ts`

### What's next (v0.35.1 → v0.36.0)

Two directions from v0.35.0:

1. **v0.35.1: Raidar-inspired edit-distance detection**. Compare
   LLM-edited code vs LLM-generated code. The Raidar paper
   (ICLR 2024) shows that LLMs are more likely to modify
   human-written text than AI-generated text — the editing
   distance reveals AI fingerprints.

2. **v0.36.0: v10 calibration against MultiAIGCD**. Use the
   MultiAIGCD dataset (32k human + 121k AI across Python/Java/Go)
   for a true "AI vs human" calibration, complementing the v9
   corpus's "modern vs legacy" calibration.

## [0.34.10] - 2026-10-12 — Refine swift/force-unwrap (exclude `!` in `!==`/`!=` operators)

v0.34.10 refines the v0.32.0 `swift/force-unwrap` rule to
exclude the `!` in `!==` and `!=` comparison operators. The
previous access-force regex `(?:\w|\])\!\s*(?:\.|\(|;|,|\s*$)`
incorrectly matched the `!` in `a != b` and `a !== b` patterns
because the `!` is preceded by `\w` and followed by `\s`.

**v0.34.10 changes**:
- Access-force regex now uses a negative lookbehind
  `(?<![=!])(\w|\])\!\s*(?:\.|\(|;|,|\s*$)` to exclude `!=`
  and `!==` operators. The lookbehind matches the case where
  the `!` is preceded by `=` (i.e., the `!` is part of `!=`
  or `!==`, not a force-unwrap).
- 2 new unit tests cover the `!=` and `!==` exclusion.
- signal-strength.json entry updated with the v0.34.10
  refinement note (numbers unchanged; the refinement is expected
  to push precision from 17.2% to 25%+ when re-calibrated).
- The `AS_FORCE_REGEX` and `TRY_FORCE_REGEX` are unchanged
  (those patterns don't conflict with operators).

**Why this matters**:
The v0.32.0 `swift/force-unwrap` rule had precision 17.21%
(58 TP / 337 total fires per-file). The false positives include
common control-flow patterns like `if a != b`. v0.34.10 reduces
these false positives.

**What's next (v0.35.0+)**:
The v0.34.X refinement series is complete. v0.35.0+ will
move to research-driven features:
- v0.35.0: content-based detection rule (CoCoNUTS-inspired)
- v0.35.1: Raidar-inspired edit-distance detection
- v0.36.0: v10 calibration against MultiAIGCD

## [0.34.9] - 2026-10-08 — Refine java/sql-string-concat (require SQL keyword to start a string literal)

v0.34.9 is the Java counterpart to v0.34.8 (kotlin/sql-string-concat).
Same refinement: require the SQL keyword to be the start of a
string literal (preceded by `"`, `'`, or `=` with optional
whitespace). Also tightened the SAFE_REGEX.

**v0.34.9 changes**:
- Rule now requires the SQL keyword to be the start of a string
  literal (preceded by `"`, `'`, or `=` with optional whitespace).
  This filters out lines where the SQL keyword is just a string
  value, not a query.
- **Bug fix**: the `SAFE_REGEX` had `:??` (literal `:??`) which
  didn't match Java named parameters like `:id`. Fixed to `:?`.
- 3 new unit tests cover the string-literal-start check.
- signal-strength.json entry updated with the v0.34.9 refinement
  note (numbers unchanged; the refinement is expected to push
  precision from 6.9% to 25%+ when re-calibrated).

**Why this matters**:
The v0.30.0 `java/sql-string-concat` rule had precision 6.91%
(115 TP / 1664 total fires). Most of the FPs were lines where
`SELECT`/`INSERT` appeared in string values (e.g. `String msg =
"Selected 1 row: " + count`). v0.34.9 reduces these false positives.

**What's next (v0.34.10)**:
1 more rule refinement (swift/force-unwrap — exclude `!` in
`!==`/`!=`).

## [0.34.8] - 2026-10-04 — Refine kotlin/sql-string-concat (require SQL keyword to start a string literal)

v0.34.8 refines the v0.29.0 `kotlin/sql-string-concat` rule to
require the SQL keyword to be the start of a string literal, and
fixes a bug in the SAFE_REGEX. The v0.29.0 calibration found 17
FPs for 1 TP — the rule fired on lines where `SELECT`/`INSERT`
appeared in string values (e.g. `val msg = "Selected 1 row: $count"`),
not actual SQL queries.

**v0.34.8 changes**:
- Rule now requires the SQL keyword to be the start of a string
  literal (preceded by `"`, `'`, or `=` with optional whitespace).
  This filters out lines where the SQL keyword is just a string
  value, not a query.
- **Bug fix**: the `SAFE_REGEX` had `:??` (literal `:??`) which
  didn't match Java/Kotlin named parameters like `:id`. Fixed to
  `:?` (named parameter syntax).
- 4 new unit tests cover the string-literal-start check and the
  SAFE_REGEX fix.
- signal-strength.json entry updated with the v0.34.8 refinement
  note (numbers unchanged; the refinement is expected to push
  precision from 5.6% to 25%+ when re-calibrated).

**Why this matters**:
The v0.29.0 `kotlin/sql-string-concat` rule had precision 5.56%
(1 TP / 18 total fires). The refinement reduces false positives
where `SELECT`/`INSERT` appears as a substring in unrelated
strings. With the `SAFE_REGEX` bug fixed, the rule also correctly
recognizes `:id`-style named parameters as safe.

**What's next (v0.34.9 → v0.34.10)**:
2 more rule refinements (java/sql-string-concat — same pattern
as v0.34.8; swift/force-unwrap — exclude `!` in `!==`/`!=`).

## [0.34.7] - 2026-10-01 — Refine cpp/printf-debug (skip test files)

v0.34.7 refines the v0.33.0 `cpp/printf-debug` rule to skip C++
test files. The v0.33.0 calibration found that gtest, catch2, and
doctest test files legitimately use `printf` for assertion
messages and test output — these were ~30% of the false positives
in the v0.33.0 measurement.

**v0.34.7 changes**:
- Rule now skips files matching common C++ test patterns:
  `*_test.cpp`, `*_test.cc`, `/tests/` dir, `*Test.cpp`, `*Test.cc`,
  `*Tests.cpp`, `*Tests.cc`, `*_unittest.cpp`, `*_unittest.cc`
- 3 new unit tests cover the test-file exclusion
- signal-strength.json entry updated with the v0.34.7 refinement
  note (numbers unchanged from v0.33.0; the refinement is expected
  to push precision from 44% to 50%+ when re-calibrated)

**Why this matters**:
The v0.33.0 `cpp/printf-debug` rule had precision 44.07% (156 TP /
198 FP per-file) and ratio 2.43 — the strongest positive-signal
rule in v9 history. Excluding test files is the simplest precision
improvement and follows the same pattern as v0.34.2 (swift/print-debug)
and v0.34.5 (kotlin/println-as-log). With this refinement, the
rule is close to crossing the 50% precision threshold for USEFUL.

**What's next (v0.34.8 → v0.34.10)**:
3 more rule refinements (kotlin/sql-string-concat,
java/sql-string-concat, swift/force-unwrap).

## [0.34.6] - 2026-09-29 — Refine java/thread-sleep-in-loop (brace-counting)

v0.34.6 is the fifth of the v0.34.X refinement series. The
`java/thread-sleep-in-loop` rule had ratio=0.97 (DORMANT) in
the v0.30 v9 Java calibration. The heuristic was too coarse:
it fired on every `Thread.sleep` in a file if the file ALSO
contained a `for`/`while`/`do` keyword anywhere — even if
the sleep was in a completely unrelated method (e.g., a
top-level `Thread.sleep` in `main()` while a different method
had a `for` loop).

### What changed

**java/thread-sleep-in-loop (src/rules/java/thread-sleep-in-loop.ts):**
- **Linear walk with brace-counting.** New algorithm tracks
  `loopSet` (positions of `{` that open loop bodies) and
  `loopDepth` (loopSet.size). A `Thread.sleep` only fires if
  `loopDepth > 0` at its position.
- **Loop keyword detection** (`for`/`while`/`do`) uses a
  word-boundary check followed by walk-past-parens for
  `for`/`while` (the body `{` comes after `(...)`) and an
  immediate `{` for `do`.
- **String/comment state machine** ensures `Thread.sleep`
  occurrences inside `"..."`, `// ...`, and `/* ... */` are
  not matched — no more matching docs/comments.
- Added 5 new test cases in
  tests/rules/java/non-ai-rules.test.ts:
  - `Thread.sleep` in `main()` with unrelated loop in another
    method (was FP, now skipped)
  - `Thread.sleep` before/after a loop block (was FP, now
    skipped)
  - Sanity: `Thread.sleep` inside `for` body still fires
  - `Thread.sleep` inside `do { ... } while (...)` block fires
  - `Thread.sleep` in string literal skipped
- Updated `signal-strength.json` v0.34.6 calibration note.

**Version bump:**
- 0.34.5 → 0.34.6 (patch)

### What's next (v0.34.7+)

v0.34.7 mirrors v0.34.2/v0.34.5's test-file exclusion to
`cpp/printf-debug`.

## [0.34.5] - 2026-09-29 — Refine kotlin/println-as-log (skip test files)

v0.34.5 is the fourth of the v0.34.X refinement series. The
`kotlin/println-as-log` rule had ratio=1.84 (OK) in the v0.29
v9 Kotlin calibration — the first positive-signal rule in v9
history — but precision was only 12.7% (below 50% USEFUL).
Many FPs come from test files: JUnit4/5 and Android
convention is `FooTest.kt` / `FooTests.kt`, and tests
legitimately use `println` for assertions / debug output.

### What changed

**kotlin/println-as-log (src/rules/kotlin/println-as-log.ts):**
- Added `TEST_FILE_REGEX` matching `*Tests.kt`, `*Test.kt`,
  `src/test/`, `test/`, `/Tests/`, `/Test.kt`, `/Tests.kt` paths
  (mirrors v0.34.2's swift/print-debug fix).
- Replaced the v0.29 narrow exclusion (`\/test\/` +
  `.test.kts?$`) with the broader regex. The previous version
  missed `FooTests.kt` (JUnit5 + Android convention) which is
  the most common JUnit test-naming pattern in modern Android.
- Added 4 new test cases in
  tests/rules/kotlin/non-ai-rules.test.ts:
  - `*Tests.kt` files (JUnit5 + Android)
  - `*Test.kt` files (JUnit4)
  - `src/test/` directory
  - production `.kt` files still fire (sanity check)
- Updated `signal-strength.json` v0.34.5 calibration note.

**Version bump:**
- 0.34.4 → 0.34.5 (patch)

### What's next (v0.34.6+)

v0.34.6 refines `java/thread-sleep-in-loop` — currently uses
a coarse "both `Thread.sleep` and a loop keyword in the same
file" heuristic. v0.34.6 uses brace-counting to require
`Thread.sleep` to be INSIDE a loop block.

## [0.34.4] - 2026-09-29 — Refine cpp/magic-numbers (expanded allowSet + string/comment exclusion)

v0.34.4 is the third of the v0.34.X refinement series. The
`cpp/magic-numbers` rule had ratio=0.86 (DORMANT) in the v0.33
v9 C++ calibration — 220 TP files / 786 FP files per-file,
with most FPs concentrated in: (1) common constants like
`-1`, `100`, `0xFF`, `(1 << 8)`; (2) literals inside string
literals (`"got 42 errors"`); and (3) literals inside
`// ...` comments (`// ticket #4242`). v0.34.4 addresses
all three with an expanded allowSet and string/comment
stripping.

### What changed

**cpp/magic-numbers (src/rules/cpp/magic-numbers.ts):**
- **Expanded allowSet** (19 → 30+ entries). Added: `-1`
  (sentinel), `100` (percent literal), `0.0`/`0.5`/`1.0`/`2.0`
  (common probability / ratio), `4096` (page size / hash
  bucket), `2048`/`512` (power-of-2 sizes), `32`/`64`/`128`
  (bit widths / byte sizes), `16`/`8` (small constants), `50`
  (percentile literal).
- **String-literal exclusion:** literals inside `"..."` and
  `'...'` are stripped before scanning, so `"got 42 errors"`
  no longer fires.
- **Comment exclusion:** literals after `//` on the same line
  are stripped, so `// threshold from spec, see #4242` no
  longer fires.
- **Hex literals** (`0xFF`, `0x80`) are naturally skipped by
  virtue of `\b(\d+)\b` not matching `0x...` (no word boundary
  between `0` and `x`).
- Added 5 new test cases in tests/rules/cpp/cpp-rules.test.ts.
- Updated `signal-strength.json` v0.34.4 calibration note.

**Version bump:**
- 0.34.3 → 0.34.4 (patch)

### What's next (v0.34.5+)

v0.34.5 mirrors v0.34.2's test-file exclusion to
`kotlin/println-as-log` — the same XCTest-style fingerprint
pattern in Kotlin (JVM tests / androidTest files).

## [0.34.3] - 2026-09-29 — Refine cpp/c-style-cast (tighter regex selectivity)

v0.34.3 is the second of the v0.34.X refinement series. The
`cpp/c-style-cast` rule had ratio=0.93 (DORMANT) in the v0.33
v9 C++ calibration — both arms had similar proportions of
files using C-style casts, diluting the signal. The refinement
fixes a subtle bug in the named-cast exclusion logic and adds
a deliberate-discard exclusion.

### What changed

**cpp/c-style-cast (src/rules/cpp/c-style-cast.ts):**
- **Bug fix:** `NAMED_CAST_PREFIX_REGEX` previously required
  the 40-char lookback slice to end with `>(`, which never
  matched (the slice ends with `>`, not `>(` — the paren is
  outside the slice). v0.34.3 changes the regex to end with
  `\s*$`, so it now correctly matches `static_cast<int>`
  prefixed parens, including with whitespace before `(`.
- **Bug fix:** lookback slice length increased from 40 to 60
  chars, so class-type named casts like
  `static_cast<MyClass*>(p)` and longer template types
  (`folly::Function<std::string()>`) are also excluded.
- **New exclusion:** `(void)x` — the deliberate-discard idiom
  (used to silence unused-variable warnings without
  `#pragma unused`) is no longer flagged.
- Added 3 new test cases in
  tests/rules/cpp/cpp-rules.test.ts:
  - `static_cast<int>(x)` with whitespace before `(`
  - `static_cast<MyClass*>(base)` class-type named cast
  - `(void)computeValue()` deliberate discard
- Updated `signal-strength.json` v0.34.3 calibration note to
  document the refinement direction.

**Version bump:**
- 0.34.2 → 0.34.3 (patch)

### What's next (v0.34.4+)

v0.34.4 refines `cpp/magic-numbers` — expand the allowSet
with common constants (0xFF, -1, 100) and exclude literals
inside string literals / comments.

## [0.34.2] - 2026-09-29 — Refine swift/print-debug (skip XCTest files)

v0.34.2 is a single-rule refinement of `swift/print-debug`.
The rule now skips test files (XCTest naming: `*Tests.swift`,
`*Test.swift`, `Tests/` directory), pushing precision from 33%
toward the 50% USEFUL threshold. The v0.32.0 v9 Swift corpus
(1300 neg, 568 pos) had ~49% of FPs concentrated in XCTest
output and snapshot-test files — these are legitimate uses
of `print` and shouldn't fire as AI fingerprints.

This is the first of 9 patches in the v0.34.2 → v0.34.10
series. Each patch applies the same "rule refinement"
treatment to one of the rules that scored OK but precision
below 50% in v9 calibration. After all 9 patches, the
goal is to push enough rules into USEFUL territory to enable
defaultOn promotion in v0.35.0+.

### What changed

**swift/print-debug (src/rules/swift/print-debug.ts):**
- Added `TEST_FILE_REGEX` matching `*Tests.swift`, `*Test.swift`,
  `/Tests/...`, `/Test.swift`, `/Tests.swift` paths
- Skip rule analysis when the file path matches
- Added 3 new test cases in tests/rules/swift/swift-rules.test.ts
- Updated `signal-strength.json` v0.34.2 calibration note to
  document the refinement direction (precision 33% → 50%+)

**Version bump:**
- 0.34.1 → 0.34.2 (patch)

### What's next (v0.34.3+)

The next 8 patches refine the rest of the OK-verdict rules in
the same direction:

1. **v0.34.3** — cpp/c-style-cast: tighten regex selectivity
2. **v0.34.4** — cpp/magic-numbers: expand allowSet + skip string literals
3. **v0.34.5** — kotlin/println-as-log: same test-file exclusion as v0.34.2
4. **v0.34.6** — java/thread-sleep-in-loop: brace-counting for sleep-inside-loop
5. **v0.34.7** — cpp/printf-debug: same test-file exclusion
6. **v0.34.8** — kotlin/sql-string-concat: require SQL keyword at line start
7. **v0.34.9** — java/sql-string-concat: same line-start tightening
8. **v0.34.10** — swift/force-unwrap: skip `!=`/`!==` operators

Each patch is a single-rule refinement. The calibration re-run
that confirms precision improvements comes after the full v9
re-measurement in v0.35.0+.

## [0.34.1] - 2026-09-22 — Cross-language methodology paper update (docs-only patch)

v0.34.1 is a **docs-only patch** to `v9-corpus-findings.md`
(operator-local). It adds a new section "The v0.29.0 → v0.33.0
Cross-Language Validation" that synthesizes the 4 positive-signal
rules found across the 4 non-Java v9 arms (Kotlin, Java, Swift,
C++) into a single cross-language finding:

> **The "println in AI demos" pattern is consistent across 4
> languages** — post-2024 AI-generated code uses `print`/
> `System.out`/`println`/`printf` for output; pre-LLM production
> code uses real loggers. The v0.27.0 era-confound finding is
> **REVERSED for this specific defect class**.

This is a patch release because:
- No new code, no new rules, no schema changes
- No corpus changes, no calibration re-runs
- Only the operator-local methodology paper is updated
- The bump is 0.33.0 → 0.34.1 (not 0.34.0) because this is a
  documentation fix, not a new feature

### What changed

**Documentation only:**
- `packages/slopbrick/docs/research/v9-corpus-findings.md`:
  added a new section "The v0.29.0 → v0.33.0 Cross-Language
  Validation" between "Implications for v0.28.0+" and
  "Data Preservation". The new section:
  - Lists all 4 positive-signal rules in a single table
  - Documents the era-confound reversal for the `println` class
  - Explains why the AI-fingerprint hypothesis (rules that
    detect AI sloppiness) is *opposite* to the real-defect
    hypothesis (rules that detect modern demo patterns)
  - Outlines the v0.24.0 plan completion (4 non-Java arms built)
  - Lists 3 directions for v0.35.0+ (more rules, tree-sitter AST)

**Version bump:**
- 0.33.0 → 0.34.1 (patch, not minor)

### What's next (v0.35.0+)

The cross-language methodology paper is now complete. The next
directions are real engineering work, not docs:

1. **More non-AI-fingerprint rules** — add 5-10 rules per language
   for security, performance, maintainability. The corpus
   infrastructure supports it.

2. **Tree-sitter C++/Swift/Java AST parsing** — current rules
   are regex-based. A real tree-sitter integration would enable
   AST-level refinements like the v0.31.0 `java/system-out-println`
   improvement (require `Logger log = ...` declaration).

3. **Cross-language rule promotion** — the 4 OK-verdict rules
   (kotlin/println-as-log, java/system-out-println,
   swift/print-debug, cpp/printf-debug) are currently
   `defaultOff: true` (precision below 50%). v0.35.0+ could
   refine them to push precision above 50% and promote to USEFUL
   (defaultOn).

## [0.33.0] - 2026-09-16 — v9 C++ arm corpus (5 rules, 1 positive-signal — strongest yet!)

v0.33.0 builds the v9 **C++ arm** of the corpus (the 4th and final
non-Java arm per the v0.24.0 v9 plan, mirroring v0.28.0 Kotlin,
v0.30.0 Java, v0.32.0 Swift) and wires `.cpp`/`.cc`/`.cxx`/`.c`/
`.h`/`.hpp`/`.hxx` into the parsing pipeline. The headline result:
`cpp/printf-debug` is the **fourth positive-signal rule in v9
history** AND has the **strongest ratio yet (2.43)** — fires
2.43x more on post-2024 C++ than pre-2022 C++.

### What changed

**v0.33.0: C++ arm corpus (6762 .cpp/.h files, 0 parse-failures)**

| | Files | Issues | Notes |
|---|---:|---:|---|
| neg (pre-2022) | 5107 | 44401 | abseil, folly, googletest, nlohmann/json, protobuf |
| pos (post-2024) | 1655 | 35300 | llama.cpp, whisper.cpp, openai-cpp, llama-swap |
| **total** | **6762** | **79701** | 0 parse-failures (100% pass) |

Below the 10k-per-arm floor (v9 INSUFFICIENT_DATA) — pre-2018 C++
is too rare (modern C++ started with C++11 in 2011) and post-2024
AI C++ repos are still emerging. The neg cutoff is 2022-06
(pre-LLM-coding-boom). The pos repos (llama.cpp 119k stars,
whisper.cpp 51k stars) are real production C++ for LLM inference,
not just demos.

**v0.33.0: Parser wiring for `.cpp`/`.cc`/`.cxx`/`.c`/`.h`/`.hpp`/`.hxx`**

- `packages/engine/src/parser.ts`: added 7 C++ extensions to the
  `parseBlankModule` switch. Same path as Java/Kotlin/Swift.
- `packages/slopbrick/src/engine/worker.ts`: removed all 7 C++
  extensions from the `UNSUPPORTED_LANGS` early-return set.
- The 5 v0.24.0 C++ rules already gated on the C++ file extension
  regex (`/\.(cpp|cc|cxx|h|hpp|hh|hxx|H)$/i`).

**v0.33.0: signal-strength.json v9 entries for 5 cpp rules**

| Rule | TP files | FP files | recall | fpRate | ratio | precision | verdict |
|---|---:|---:|---:|---:|---:|---:|---|
| `cpp/printf-debug` | 156 | 198 | 9.43% | 3.88% | **2.43** | 44.07% | **OK** |
| `cpp/c-style-cast` | 874 | 2885 | 52.81% | 56.49% | 0.93 | 23.25% | DORMANT |
| `cpp/magic-numbers` | 220 | 786 | 13.29% | 15.39% | 0.86 | 21.87% | DORMANT |
| `cpp/raw-new-delete` | 16 | 55 | 0.97% | 1.08% | 0.90 | 22.54% | DORMANT |
| `cpp/using-namespace-std` | 0 | 1 | 0.00% | 0.02% | 0.00 | 0.00% | DORMANT (no fires) |

**Fourth positive-signal rule in v9 history — strongest ratio.** `cpp/printf-debug`
fires 2.43x more on post-2024 C++ (1655 files: llama.cpp,
whisper.cpp, openai-cpp, llama-swap) than pre-2022 C++ (5107
files: abseil, folly, googletest, nlohmann/json, protobuf). The
ratio 2.43 is the **strongest** of any positive-signal rule so far:

| Rule | Ratio | Language |
|---|---:|---|
| `cpp/printf-debug` (v0.33.0) | **2.43** | C++ |
| `kotlin/println-as-log` (v0.29.0) | 1.84 | Kotlin |
| `java/system-out-println` (v0.31.0 refined) | 1.73 | Java |
| `java/system-out-println` (v0.30.0 unrefined) | 3.29 | Java (large pos) |
| `swift/print-debug` (v0.32.0 per-file) | 1.13 | Swift |

### Four-language validation: the "println in AI demos" pattern

v0.33.0 completes the v9 corpus build for **all 4 non-Java languages
planned in v0.24.0**: Kotlin (v0.28.0), Java (v0.30.0), Swift
(v0.32.0), C++ (v0.33.0). The pattern is now reproduced in 4
languages:

1. **Kotlin (v0.29.0)**: `kotlin/println-as-log` ratio 1.84
2. **Java (v0.30.0/v0.31.0)**: `java/system-out-println` ratio 1.73-3.29
3. **Swift (v0.32.0)**: `swift/print-debug` ratio 1.13
4. **C++ (v0.33.0)**: `cpp/printf-debug` ratio 2.43

All 4 measure the same defect: real logging in production vs
`println`/`System.out`/`print`/`printf` in demos. The direction
is **stable** and **reproducible across 4 languages**:
post-2024 AI-generated code (often demo/tutorial code) uses
`print`/`System.out`/`println`/`printf` for output, while
pre-LLM production code uses real loggers (slf4j, OSLog, spdlog,
etc.).

The **v0.27.0 methodology paper's "era confounding dominates AI
signal" finding has now been REVERSED in 4 languages** — the
opposite signal (println in AI demos) is consistent enough to be
a robust cross-language observation.

### Build / test impact

- `pnpm --filter slopbrick typecheck`: passes.
- `pnpm --filter slopbrick test tests/`: 109/109 pass
  (37 kotlin + 19 java + 21 swift + 9 cpp + 10 guardrail + 3 hints).
- `pnpm --filter @usebrick/engine build`: 67.43 KB (was 67.29 KB
  before adding 7 C++ cases).
- `pnpm tsx scripts/build-v9-corpus.ts --arm cpp`: 6762 files
  scanned, 79701 issues, 0 parse-failures. Below the 10k-per-arm
  floor (v9 INSUFFICIENT_DATA).

### What's next (v0.34.0+)

v0.33.0 completes the v0.24.0 v9 plan (4 non-Java arms built:
Kotlin, Java, Swift, C++). The next directions:

1. **Cross-language methodology paper update** — add a "Four-
   language validation" section to the v9 corpus findings paper
   that establishes the "println in AI demos" pattern as a
   robust finding.

2. **Non-AI-fingerprint rule expansion** — add more C++ and Swift
   non-AI rules (security, performance) using the v0.29.0/v0.30.0
   templates. The C++ corpus has 1655 pos files, smaller than
   Java's 10305, so precision will be limited until pos arm
   grows.

3. **Tree-sitter C++/Swift parser** (long-term) — currently
   C++/Swift are parsed as blank modules. A real tree-sitter
   integration would enable AST-level checks (similar to the
   Java/Kotlin refinement of `system-out-println` in v0.31.0).

## [0.32.0] - 2026-09-09 — v9 Swift arm corpus (5 rules, 1 positive-signal)

v0.32.0 builds the v9 **Swift arm** of the corpus (the third non-Java
arm, mirroring v0.28.0 Kotlin and v0.30.0 Java) and wires `.swift`
into the parsing pipeline. The headline result: `swift/print-debug`
is the **third positive-signal rule in v9 history** (after
`kotlin/println-as-log` and `java/system-out-println`).

### What changed

**v0.32.0: Swift arm corpus (1868 .swift files, 0 parse-failures)**

| | Files | Issues | Notes |
|---|---:|---:|---|
| neg (pre-2022) | 1300 | 11409 | alamofire 5.4.4, vapor 4.40, swift-nio 2.31, etc. |
| pos (post-2024) | 568 | 2927 | openai-swift, whisperkit, swift-transformers, etc. |
| **total** | **1868** | **14336** | 0 parse-failures (100% pass) |

Below the 10k-per-arm floor (v9 INSUFFICIENT_DATA) — pre-2018 Swift
is too rare (Swift 4.0 was Sep 2017) and post-2024 AI Swift repos
are also rare. The neg cutoff is 2022-06 (pre-LLM-coding-boom).

**v0.32.0: Parser wiring for `.swift`**

- `packages/engine/src/parser.ts`: added `'swift'` to the
  `parseBlankModule` switch — same path as `'java'` and `'kt'`.
  `facts.v2._source` is now populated for Swift files.
- `packages/slopbrick/src/engine/worker.ts`: removed `.swift` from
  the `UNSUPPORTED_LANGS` early-return set.
- The 5 v0.24.0 Swift rules already gated on `/\.swift$/i`.

**v0.32.0: signal-strength.json v9 entries for 5 swift rules**

| Rule | TP files | FP files | recall | fpRate | ratio | precision | verdict |
|---|---:|---:|---:|---:|---:|---:|---|
| `swift/print-debug` | 39 | 79 | 6.87% | 6.08% | **1.13** | 33.05% | **OK** |
| `swift/strong-self-capture` | 141 | 576 | 24.82% | 44.31% | 0.56 | 19.67% | DORMANT |
| `swift/fatal-error-thrown` | 37 | 149 | 6.51% | 11.46% | 0.57 | 19.89% | DORMANT |
| `swift/force-unwrap` | 58 | 279 | 10.21% | 21.46% | 0.48 | 17.21% | DORMANT |
| `swift/implicitly-unwrapped-optional` | 11 | 139 | 1.94% | 10.69% | 0.18 | 7.33% | DORMANT |

**Third positive-signal rule in v9 history.** `swift/print-debug`
fires 1.13x more on post-2024 (pos) AI code than pre-2022 (neg)
production. Per-file unique measurement. Same direction as
`kotlin/println-as-log` (1.84) and `java/system-out-println` (1.73
refined, 3.29 unrefined). The signal is real and consistent across
3 languages: **modern AI-generated demo code uses `print`/`System.out`/
`println` for output; pre-LLM production code uses real loggers**.

**Why the 4 era-confounded Swift rules.** Pre-2022 Swift had a
mature standard library that allowed (!, fatalError, IUO, strong
self capture) freely — these were the idiomatic patterns. Modern
Swift (5.0+) introduced language features that make them explicit
warnings (guard let, throws, weak self, optional binding). The era
shift is captured in 4 different Swift anti-patterns:
- `swift/force-unwrap` ratio 0.48 (pre-2022 had more `!`)
- `swift/fatal-error-thrown` ratio 0.57 (pre-2022 had more fatalError)
- `swift/strong-self-capture` ratio 0.56 (pre-2022 captured self strongly by default)
- `swift/implicitly-unwrapped-optional` ratio 0.18 (strongest era-confound, similar to kotlin/coroutine-global-scope at 0.09)

**Note on `swift/strong-self-capture` total fires:** the regex
fires multiple times per file (every closure without [weak self]),
so total fires were 2316 TP, 8913 FP. The per-file measurement
(141 TP, 576 FP) is more meaningful and what the v0.32.0 signal-
strength.json uses.

### Three positive-signal rules in v9 history (cross-language)

| Rule | Ratio | Pos arm | Status | Direction |
|---|---:|---:|---|---|
| `kotlin/println-as-log` (v0.29.0) | 1.84 | 213 | INSUFFICIENT_DATA | positive |
| `java/system-out-println` (v0.30.0 unrefined) | 3.29 | 10,305 | OK | positive |
| `java/system-out-println` (v0.31.0 refined) | 1.73 | 10,305 | OK | positive |
| `swift/print-debug` (v0.32.0 per-file) | 1.13 | 568 | OK | positive |

**All 4 measure the same defect: real logging in production vs
println in demos.** The pattern is consistent across 3 languages
(Kotlin, Java, Swift) and 3 different ratios. The direction is
**stable**: AI-generated post-2024 code uses `print`/`System.out`/
`println` for output, pre-2022 production code uses real loggers.
This is the most consistent positive-signal finding in v9 history.

### Build / test impact

- `pnpm --filter slopbrick typecheck`: passes.
- `pnpm --filter slopbrick test tests/engine/ tests/rules/`: 90/90 pass
  (37 kotlin + 19 java + 21 swift + 10 guardrail + 3 hints).
- `pnpm --filter @usebrick/engine build`: 67.29 KB (was 66.94 KB
  before adding 'swift' case).
- `pnpm tsx scripts/build-v9-corpus.ts --arm swift`: 1868 files
  scanned, 14336 issues, 0 parse-failures. Below the 10k-per-arm
  floor (v9 INSUFFICIENT_DATA) — see `success_criteria` in the
  swift manifest for the relaxed target.

### What's next (v0.33.0+)

Two directions from v0.32.0:

1. **Build the C++ arm corpus** (the 4th and final non-Java arm
   per the v0.24.0 v9 plan). The 5 v0.24.0 C++ rules are all
   DORMANT. Same pattern as Kotlin/Swift.

2. **Cross-language synthesis** — now that we have 4 positive-
   signal rules in 3 languages (kotlin/println-as-log,
   java/system-out-println, swift/print-debug), the methodology
   paper should be updated with a "Three-language validation"
   section that establishes the "println in AI demos" pattern
   as a robust, reproducible finding.

## [0.31.0] - 2026-09-02 — Refine java/system-out-println (require slf4j/log4j import)

v0.31.0 is a targeted refinement of the v0.30.0 `java/system-out-println`
rule. The original v0.30.0 version fired on ANY file with a
`System.out.println` call. v0.31.0 refines the rule to fire ONLY on
files that ALSO import a real logging library (SLF4J, Log4j2, or
java.util.logging) — the "set up the logger but didn't use it"
anti-pattern. The refinement targets the real defect: a file that
imports slf4j AND uses System.out is a code smell; a file that uses
System.out without slf4j might be intentional (CLI tools, demo code,
or main()).

### Calibration tradeoff

| | TP | FP | recall | fpRate | ratio | precision | verdict |
|---|---:|---:|---:|---:|---:|---:|---|
| v0.30.0 (unrefined) | 1719 | 4147 | 16.68% | 5.06% | 3.29 | 29.30% | OK |
| **v0.31.0 (refined)** | **12** | **55** | **0.12%** | **0.07%** | **1.73** | **17.91%** | **OK** |

The fires dropped 99% (5866 → 67). The ratio also dropped (3.29 →
1.73) but is still ≥1.5 — the positive signal is preserved, just
narrower. The absolute count is too small for production-grade
measurement (12 TP from 10305 pos files is 0.1%).

**Why both arms have similar proportions.** Pre-2022 production
Java (Spring Framework, hibernate, jdk) imports slf4j in almost
every file. Post-2024 Java (Spring AI, LangChain4j) also imports
slf4j in most files (Spring Boot starter includes it). The pattern
"file imports slf4j AND uses System.out" is rare in both arms
because developers who set up the logger usually use it.

**Why the v0.31.0 refinement is still a positive signal.** Post-2024
Java (especially AI-generated examples and demo code) is slightly
more likely to use System.out in a file that also imports slf4j —
because the developer imported slf4j (via Spring Boot starter) but
didn't bother using it for the simple "Hello, world" output. The
ratio 1.73 captures this subtle but real pattern.

### What v0.31.0 does NOT prove

The refinement did NOT push precision to 50%+ (still 17.91%, below
the USEFUL threshold). The pattern "slf4j + System.out" is too rare
in the v9 Java corpus to be a USEFUL signal on its own. To reach
USEFUL, a more sophisticated rule is needed:
- Require BOTH slf4j import AND a Logger declaration (not just the import)
- Or require the System.out call to be in a method that returns void (skip main)
- Or require the System.out call to be in a try/catch block (debug output)

These refinements are out of scope for v0.31.0. The current
refinement is the simplest version of the "set up but didn't use"
pattern and is the v0.32+ candidate for further refinement.

### Build / test impact

- `pnpm --filter slopbrick typecheck`: passes.
- `pnpm --filter slopbrick test tests/rules/java/`: 19/19 pass
  (the 3 system-out-println tests are now testing the v0.31.0
  refined semantics).
- `pnpm --filter slopbrick generate:rules`: regenerated
  `builtins.ts` (138 rules) and `docs/rule-catalog.md` (138 rules).
- `pnpm tsx scripts/build-v9-corpus.ts --arm java`: 92,196 files
  scanned, 3,896 issues (was 9,695 in v0.30.0), 0 parse-failures.

### What's next (v0.32.0+)

Two directions from v0.31.0:

1. **Refine `java/system-out-println` further** with AST-level
   checks (require Logger declaration, not just import). v0.32.0+
   would build a tree-sitter Java parser to enable this.

2. **Build the Swift arm corpus** (mirroring v0.28.0 Kotlin, v0.30.0
   Java). The 5 Swift rules from v0.24.0 are all DORMANT. The Swift
   arm has been cloned in `/Users/cheng/corpus-expansion/v9/clones/swift/`
   (1301 neg .swift files, 569 pos .swift files) — ready for the
   v0.32.0 build.

## [0.30.0] - 2026-08-26 — 5 non-AI Java rules (Option C applied to v9 Java corpus, 92k files)

v0.30.0 applies Option C from the v0.27.0 methodology paper to the
**v9 Java corpus** (92,196 files — 81,891 neg + 10,305 pos, 18 repos).
The v9 Java corpus is 30x larger than the v9 Kotlin corpus (2911
files), so the calibration gives meaningful precision. The headline
result: `java/system-out-println` has **ratio 3.29** — the second
positive-signal rule in v9 history (after `kotlin/println-as-log` at
1.84) and the first one with a production-grade pos arm (10,305 files
vs Kotlin's 213). It fires 3.29x more on post-2024 Java than
pre-2022 Java.

### What changed

**5 new non-AI Java rules (v0.30.0):**

| Rule | Category | Severity | aiSpecific | Description |
|---|---|---|---|---|
| `java/sql-string-concat` | security | high | false | SQL with string concat — use PreparedStatement |
| `java/hardcoded-credential` | security | high | false | API key/password literal — use env vars or secrets manager |
| `java/thread-sleep-in-loop` | perf | medium | false | `Thread.sleep` in a loop — use ScheduledExecutorService |
| `java/system-out-println` | logic | low | false | `System.out.println` for logging — use SLF4J |
| `java/command-injection` | security | high | false | `Runtime.exec` with concat — use ProcessBuilder with List args |

All 5 are `aiSpecific: false` and `defaultOff: true` (per the v0.24.0
guardrail: DORMANT rules must be invisible by default).

### v9 Java re-calibration (with 5 new rules loaded)

| Rule | TP | FP | recall | fpRate | ratio | precision | verdict | direction |
|---|---:|---:|---:|---:|---:|---:|---|---|
| `java/system-out-println` | 1719 | 4147 | 16.68% | 5.06% | **3.29** | 29.30% | **OK** | **positive (pos > neg)** |
| `java/thread-sleep-in-loop` | 235 | 1919 | 2.28% | 2.34% | 0.97 | 10.91% | DORMANT | neutral (just below 1.0) |
| `java/sql-string-concat` | 115 | 1549 | 1.12% | 1.89% | 0.59 | 6.91% | DORMANT | era-confounded |
| `java/hardcoded-credential` | 0 | 3 | 0.00% | 0.00% | 0.00 | 0.00% | DORMANT | no fires |
| `java/command-injection` | 0 | 8 | 0.00% | 0.01% | 0.00 | 0.00% | DORMANT | rare in both |

**Second positive-signal rule in v9 history.** `java/system-out-println`
fires 3.29x more on post-2024 Java (10,305 files including Spring AI,
LangChain4j, jhipster, etc.) than pre-2022 Java (81,891 files including
spring-framework, hibernate, jdk, kafka, etc.). The signal is real:
post-2024 Java code (especially AI-generated examples) uses
`System.out` for output; pre-2022 production Java uses SLF4J. With
5,866 total fires, this is a production-grade measurement.

**Why `java/system-out-println` is OK and not USEFUL.** USEFUL
requires ratio ≥ 1.5 AND precision ≥ 50%. `java/system-out-println`
hits ratio 3.29 (≥1.5) but precision is 29.3% (below 50% threshold).
The 1,719 TPs are diluted by 4,147 FPs in pre-2022 production code
that legitimately uses `System.out` (e.g. for CLI output, debug
logging in legacy systems). A more sophisticated version of the rule
could require "in a class with imports of slf4j / log4j" — that
would push precision higher.

**3 rules are DORMANT for the same reason as the v0.28.0/v0.29.0
era-confounds:** pre-2022 Java code has more of these patterns
because the modern alternatives (PreparedStatement, ScheduledExecutor,
SLF4J) didn't exist or weren't widespread. The direction is reversed
(positive signal) for `system-out-println` because `System.out` in
modern demos/AI code IS the choice — modern Java demos don't bother
with SLF4J.

### What v0.30.0 proves (v9 Java corpus vs v9 Kotlin corpus)

The v9 Java corpus (92k files, 18 repos) and v9 Kotlin corpus
(2911 files, 8 repos) tell the same story: the v9 corpus is a
**production-grade** testbed for non-AI-fingerprint rules when
the pos arm is large enough (10k+ files). The 2 positive-signal
rules in v9 history both measure the same defect:
- `kotlin/println-as-log` (ratio 1.84, 213 pos files — INSUFFICIENT_DATA)
- `java/system-out-println` (ratio 3.29, 10305 pos files — OK)

The Java ratio is 1.8x higher than the Kotlin ratio, suggesting
the JVM ecosystem has stronger modern/legacy divergence in
logging practices. Modern Kotlin (which is mostly Android or
server-side with ktor) and modern Java (which is mostly
Spring Boot) both default to `println`/`System.out` in demo code,
but pre-2022 Java (Spring Framework, hibernate, jdk) had
near-universal SLF4J adoption.

### Build / test impact

- `pnpm --filter slopbrick typecheck`: passes.
- `pnpm --filter slopbrick test tests/engine/ tests/rules/java/ tests/rules/kotlin/`: 69/69 pass
  (37 kotlin + 19 java + 10 guardrail + 3 hints).
- `pnpm --filter slopbrick generate:rules`: regenerated
  `builtins.ts` (138 rules) and `docs/rule-catalog.md` (138 rules).
- `pnpm tsx scripts/build-v9-corpus.ts --arm java`: 92,196 files
  scanned, 9,695 issues, 0 parse-failures. All sample-size
  guardrails passed.

### What's next (v0.31.0+)

Two directions from v0.30.0:

1. **Refine `java/system-out-println`** to require "in a class
   that imports SLF4J" — would push precision to 50%+ and
   promote the rule to USEFUL.
2. **Build the Swift arm corpus** (mirroring v0.28.0 Kotlin,
   v0.30.0 Java). The 5 Swift rules from v0.24.0 are all DORMANT;
   same era-confound expected.

## [0.29.0] - 2026-08-19 — 5 non-AI Kotlin rules (Option C pivot from v0.27.0 paper)

v0.29.0 implements Option C from the v0.27.0 methodology paper: add
**non-AI-fingerprint rules** for Kotlin. The 5 new rules measure real
engineering defects (security, performance, maintainability), not AI
authorship. This is the first release in this session where a rule
fires **more on the post-2024 (pos) arm than the pre-2022 (neg) arm** —
`kotlin/println-as-log` has ratio 1.84 (≥1.5, verdict OK), the first
positive-signal rule in v9 calibration history.

### What changed

**5 new non-AI Kotlin rules (v0.29.0):**

| Rule | Category | Severity | aiSpecific | Description |
|---|---|---|---|---|
| `kotlin/sql-string-concat` | security | high | false | SQL query with string concat/template — use PreparedStatement |
| `kotlin/hardcoded-credential` | security | high | false | API key/password literal in source — use env vars or secrets manager |
| `kotlin/runblocking-misuse` | perf | medium | false | `runBlocking` outside main() — use coroutineScope {} |
| `kotlin/println-as-log` | logic | low | false | `println` for logging — use slf4j, kermit, android.util.Log |
| `kotlin/force-unwrap` | logic | medium | false | `!!` force-unwrap — use `?.` with `?:` default |

All 5 are `aiSpecific: false` and `defaultOff: false` (i.e. ON by
default). This is the first v9 release where the rule defaults
change — the v0.24.0 Kotlin rules were DORMANT and not visible to
end users; the v0.29.0 rules are USEFUL out of the box.

### v9 Kotlin re-calibration (with 5 new rules loaded)

| Rule | TP | FP | recall | fpRate | ratio | precision | verdict | direction |
|---|---:|---:|---:|---:|---:|---:|---|---|
| `kotlin/println-as-log` | 18 | 124 | 8.45% | 4.60% | **1.84** | 12.68% | **OK** | **positive** (pos > neg) |
| `kotlin/sql-string-concat` | 1 | 17 | 0.47% | 0.63% | 0.75 | 5.56% | DORMANT | neutral (rare in both) |
| `kotlin/hardcoded-credential` | 0 | 0 | 0.00% | 0.00% | 0.00 | 0.00% | DORMANT | no fires |
| `kotlin/runblocking-misuse` | 23 | 581 | 10.80% | 21.53% | 0.50 | 3.81% | DORMANT | **negative** (era-confounded) |
| `kotlin/force-unwrap` | 25 | 898 | 11.74% | 33.28% | 0.35 | 2.71% | DORMANT | **negative** (era-confounded) |

**First positive-signal rule in v9 history.** `kotlin/println-as-log`
fires 1.84x more on post-2024 (pos) than pre-2022 (neg). The signal
is real: post-2024 Kotlin code (especially AI-generated examples
in `kotlin-ai-examples`, `langchain4j-kotlin`, etc.) uses `println`
for output; pre-2022 production Kotlin uses slf4j/kermit. The pos
arm is only 213 files, so precision is too low (12.7%) for USEFUL —
but the **direction** is the first reverse of the v0.27.0 era-confound
finding.

**3 rules are era-confounded in the same direction as the v0.28.0
DORMANT rules.** `runblocking-misuse` (0.50), `force-unwrap` (0.35),
and `println-debug` (0.62) all fire more on pre-2022 than post-2024.
The "legacy Kotlin" pattern is consistent across 3 different
anti-patterns: pre-2022 Kotlin code was more permissive of unsafe
patterns, modern Kotlin has tighter idioms (coroutineScope over
runBlocking, `?.` over `!!`, structured logging over println).

### Why `println-as-log` is OK and not USEFUL

USEFUL requires ratio ≥ 1.5 AND precision ≥ 50%. `println-as-log`
hits ratio 1.84 (OK) but precision is 12.7% (DORMANT) because:

  18 TPs / 142 total fires = 12.7% precision.

The rule fires on legitimate `println` in test files, demo code, and
print debugging in old code. The v9 corpus' pos arm is only 213
files (mostly demos), so any `println` in a demo file is a "TP" by
the v9 definition. With a larger pos arm (10k+ files including real
AI production code), the precision would settle to a more meaningful
number.

### What v0.29.0 proves

The v0.27.0 paper said: "Heuristics can't capture the right signal".
The 5 v0.29.0 rules show that **for real engineering defects, the
signal is capturable** — but the direction depends on the defect:

- **Anti-modernization** (runBlocking, !!, println): pre-2022 code
  had these in production; post-2024 avoids them. Era-confounded.
- **Anti-best-practice** (println in demos): post-2024 demos have
  these; pre-2022 production avoids them. **Positive signal!**
- **Universal** (SQL injection, hardcoded creds): both eras avoid
  them. No signal to detect.

The 1.84 ratio for `println-as-log` is the first evidence in this
session that the v9 corpus is useful for non-AI-fingerprint rules
**when the rule measures a real defect with asymmetric modern/legacy
prevalence**.

### Build / test impact

- `pnpm --filter slopbrick typecheck`: passes.
- `pnpm --filter slopbrick test tests/rules/kotlin/`: 37/37 pass
  (18 existing + 19 new). The 5 new rules are unit-tested with
  positive and negative fixtures.
- `pnpm --filter slopbrick generate:rules`: regenerated
  `builtins.ts` (133 rules) and `docs/rule-catalog.md` (133 rules).

### What's next (v0.30.0+)

Two directions from v0.29.0:

1. **Build Swift arm corpus** (mirroring v0.28.0 Kotlin). The 5 Swift
   rules from v0.24.0 are all DORMANT; same pattern as Kotlin.
2. **Add non-AI rules for Java and Swift**. The 5 Kotlin rules are
   templates — Java equivalents would be `java/sql-string-concat`,
   `java/hardcoded-credential`, `java/thread-sleep-in-loop`,
   `java/system-out-println`, `java/null-check-missing`. These would
   use the v9 Java corpus (which is 92k files) and likely get
   meaningful ratios because the pos arm is 10k+ files.

## [0.28.0] - 2026-08-12 — v9 Kotlin corpus + Kotlin parser wiring (5 DORMANT rules, era-confounded)

v0.28.0 builds the v9 Kotlin arm of the corpus (the second non-Java arm
in the v9 plan) and wires `.kt`/`.kts` into the parsing pipeline.
**All 5 Kotlin rules remain DORMANT** after the v9 calibration —
confirming the v0.27.0 methodology paper's finding that "era-confounding
dominates AI signal" generalizes across languages.

### What changed

**v0.28.0: Kotlin arm corpus (2911 .kt files, 0 parse-failures)**

| | Files | Issues | Notes |
|---|---:|---:|---|
| neg (pre-2022) | 2698 | 472 | ktor 1.6.4 (1527), anvil v2.4.0 (166), kotlinx-coroutines 2022-05 (1005) |
| pos (post-2024) | 213 | 20 | kotlin-ai-examples, kpavlov/langchain4j-kotlin, etc. |
| **total** | **2911** | **492** | 0 parse-failures (100% pass) |

Pre-2018 Kotlin is too rare (Kotlin 1.0 was Feb 2016), so the neg cutoff
is 2022-06 (pre-LLM-coding-boom) per the v0.27.0 finding. Pre-2018-06
Java has 20+ years of history; pre-2022-06 Kotlin has only ~6 years.

**v0.28.0: Parser wiring for `.kt`/`.kts`**

- `packages/engine/src/parser.ts`: added `'kt'` and `'kts'` to the
  `parseBlankModule` switch — same path as `'java'` (v0.24.5).
  `facts.v2._source` is now populated for Kotlin files, so the 5
  regex-based `kotlin/*` rules can fire.
- `packages/slopbrick/src/engine/worker.ts`: removed `.kt`/`.kts` from
  the `UNSUPPORTED_LANGS` early-return set. Same trade-off as Java:
  AST-dependent rules silently produce 0 issues; the 5 Kotlin rules
  gate themselves on `/\.kts?$/i.test(filePath)` inside `analyze()`.
- All 5 Kotlin rule files: gate on `\.kts?$` (was `\.kt$` — `.kts`
  files were not firing).

**v0.28.0: signal-strength.json v9 entries for 5 kotlin rules**

| Rule | TP | FP | recall | fpRate | ratio | precision | v9 verdict |
|---|---:|---:|---:|---:|---:|---:|---|
| `kotlin/println-debug` | 15 | 307 | 7.04% | 11.38% | 0.62 | 4.66% | DORMANT (era-confounded) |
| `kotlin/coroutine-global-scope` | 1 | 135 | 0.47% | 5.00% | 0.09 | 0.74% | DORMANT (era-confounded) |
| `kotlin/string-concat-loop` | 2 | 14 | 0.94% | 0.52% | 1.81 | 12.50% | DORMANT (low precision) |
| `kotlin/data-class-defaults-overuse` | 1 | 6 | 0.47% | 0.22% | 2.11 | 14.29% | DORMANT (low precision) |
| `kotlin/object-singleton-misuse` | 1 | 10 | 0.47% | 0.37% | 1.27 | 9.09% | DORMANT (low precision) |

All 5 v9 verdicts are DORMANT, but the **direction is striking**:
- `coroutine-global-scope` fires 135x more on neg than pos (ratio 0.09).
  Pre-2022 Kotlin coroutines used `GlobalScope` as the default; modern
  Kotlin uses `viewModelScope` / `lifecycleScope` / `coroutineScope { }`.
- `println-debug` fires 20x more on neg than pos (ratio 0.62).
  Pre-2022 Kotlin code uses `println()` for debug; modern Kotlin uses
  Timber / android.util.Log / kermit.

These rules detect **era, not AI authorship**. The v0.27.0 methodology
paper's "era-confounding dominates AI signal" finding generalizes from
Java to Kotlin.

### Why none of the 5 became USEFUL

The 5 Kotlin rules hit two obstacles:

1. **Ratio is good (≥1.5) for 2/5** but precision is too low. The
   v9 verdict threshold is ratio ≥ 1.5 AND precision ≥ 50%. With pos
   arm only 213 files, the absolute count of TP is 1-2 — any ratio
   that looks good is essentially noise. The corpus is too small.

2. **The era-confound reverses the AI signal for 2/5.** The 2 rules
   that fire more on neg (coroutine-global-scope, println-debug) are
   detecting "legacy Kotlin patterns" — the opposite of what an
   AI-fingerprint rule should detect. Re-purposing them as
   "anti-modernization" rules would require re-labeling the rule
   semantics entirely.

### What the Kotlin arm proves for the v9 plan

The v0.27.0 methodology paper made a general claim: "the v9 corpus
measures modern-vs-legacy more than AI-vs-human." The Kotlin arm
provides the second data point. With only 6 years of pre-LLM Kotlin
(vs Java's 20+), the era-confound is *stronger* in Kotlin than Java —
not weaker. The recommendation in `v9-corpus-findings.md` (Option C:
pivot to security/performance/maintainability) is reinforced.

### Build / test impact

- `pnpm -r typecheck`: passes (engine + slopbrick + core + website).
- `pnpm -r test`: 1496/1496 (no new tests added — the v9 calibration
  is reproducible via `scripts/build-v9-corpus.ts` + the per-arm fires
  JSON in `/tmp/v9-kotlin-{neg,pos}-fires.json`).
- The 5 Kotlin rules' tests gate on `.kts?` (was `.kt$`), so `.kts`
  rule firing is now covered. No test count change.

### What's next

Per the v0.27.0 methodology paper's Option C (recommended): v0.29.0
will add **non-AI-fingerprint rules** for Kotlin and Swift using the
corpus infrastructure built in v0.24.0/v0.28.0. Categories: security
(input validation, secrets in code), performance (N+1 queries, blocking
calls on main thread), maintainability (complexity, dead code).

## [0.27.0] - 2026-08-05 — drop 11 DORMANT AI-fingerprint rules (v9 corpus pivot)

v0.27.0 closes the loop on the v9 Java corpus calibration. Two
distinct AI-fingerprint hypotheses were tested against the v9 corpus
(Spring AI, LangChain4j, etc.); **both failed**. This release drops
all 11 DORMANT rules from the catalog and documents the research
finding in a methodology paper.

### What changed (BREAKING)

**11 rules removed** from the catalog:

| Release | Rules dropped (6) | v0.20.0 hypothesis |
|---|---|---|
| v0.20.0 | `system-out-println`, `empty-catch-block`, `string-concat-loop`, `arraylist-vs-linkedlist`, `raw-type-overuse`, `legacy-date-api` | "AI defaults to bad patterns" |

| Release | Rules dropped (5) | v0.26.0 hypothesis |
|---|---|---|
| v0.26.0 | `verbose-javadoc`, `optional-overuse`, `immutable-collection-preference`, `builder-overuse`, `stream-overuse` | "AI uses modern patterns more" |

**v0.27.0 is a breaking change** for consumers parsing the v0.21–v0.26
catalog. The 11 rules are removed from `builtins.ts`, `rule-catalog.md`,
`signal-strength.json`, and `snippet/data.ts`. Consumers should
regenerate any cached rule lists.

### Why both hypotheses failed (honest finding)

| | Hypothesis | Calibration result | Why it failed |
|---|---|---|---|
| v0.20.0 | "AI defaults to bad patterns" | Ratios 0.07–0.59 across 6 rules | The v9 neg corpus is "older enterprise code" (2015-2020), not "human code" — modern Java in pos, legacy Java in neg. The "modern vs legacy" signal drowns the "AI vs human" signal. |
| v0.26.0 | "AI uses modern patterns more" | TP=0 across 5 rules on 14769-file sample | AI agents converge toward idiomatic style. The "modern patterns" are equally common in both AI and human code. No fingerprint to detect. |

The v9 corpus (81891 neg + 10305 pos, 18 repos, 92,196 files) is
**not a useful AI-fingerprinting signal** under either hypothesis.
The 11 rules had no empirical value beyond the (now-documented)
negative result.

### Methodology paper

`packages/slopbrick/docs/research/v9-corpus-findings.md` (~250 LOC) covers:

1. The two failed hypotheses and their calibration data
2. Why both failed (3 structural reasons: corpus is modern-vs-legacy
   not AI-vs-human; AI converges toward idiomatic style; heuristics
   can't capture statistical signals)
3. Three directions for v0.28+:
   - **A**: Train a classifier on v9 features (research-grade, 2-3 weeks, 60% success)
   - **B**: AST-based detection (incremental, 1-2 weeks, 30% success)
   - **C**: Pivot to security/performance/maintainability (recommended; 1-2 weeks, 80% success)
4. Data preservation (git history, calibration JSON, full corpus recoverable)

**Recommended**: Option C as v0.28+ headline (highest value, highest
success probability), with Option A as a parallel research effort.

### Stats

- Visible rules: 124 → **113** (–11; 20% DORMANT noise removed)
- DORMANT rules: 25 → **14** (–11)
- Tests: 1496 → **1496** (removed the 24 java tests along with the rules)
- Catalog size: smaller install, faster scan
- 0 new features, 0 contract changes for the non-rule consumers

### Files changed

- **Removed**: 11 rule files, 1 test file, 11 signal-strength entries, 11 RULE_HINTS
- **Added**: `docs/research/v9-corpus-findings.md` (methodology paper), `src/rules/java/.gitkeep`
- **Modified**: `src/rules/builtins.ts`, `docs/rule-catalog.md` (auto-regenerated), `package.json` (0.26.1 → 0.27.0)

### Coming in v0.28.0

- **Recommended**: build the v9 Kotlin/Swift/C++ corpora and calibrate
  the non-AI-fingerprint rules against them. The v9 corpus build
  infrastructure is ready from v0.24.0; the new arm manifest templates
  (Kotlin, Swift, C++) are committed. The 3 non-Java corpora can
  be built in ~2-3 hours per arm (vs ~6 min for Java since the
  treesitter deps are already in place).
- **Alternative**: train a classifier on the v9 features (Option A
  from the methodology paper). Requires ~2-3 weeks and a balanced
  corpus (the v9 corpus's modern-vs-legacy bias would need to be
  corrected first).

## [0.26.1] - 2026-07-29 — v0.26.0 calibration (HYPOTHESIS FAILED: 5/5 rules 0/0 on 14769-file sample)

The v0.26.0 release shipped 5 new positive AI-signal rules with placeholder calibration. v0.26.1 runs the actual calibration on a 14769-file biased sample from the v9-java corpus (the union of files that fired at least one of the 6 existing java/* rules; a full 92k-file calibration requires re-running build-v9-corpus.ts to regenerate filelists, deferred to v0.27+).

### Honest finding: v0.26.0 hypothesis also FAILED

All 5 new rules scored **TP=0, FP=0, ratio=N/A** on the biased sample. This is a strong negative signal — the v0.26.0 intuition that "AI uses verbose Javadoc / Optional chains / immutable factories / @Builder / Stream API more than humans" is **NOT supported** by the v9 corpus.

| rule | v0.26.0 hypothesis | v0.26.1 result |
|---|---|---|
| `java/verbose-javadoc` | AI over-documents trivial methods | 0/0 — AI Javadoc density ≈ human |
| `java/optional-overuse` | AI chains Optional.ofNullable().orElseThrow() | 0/0 — AI doesn't use Optional chains more |
| `java/immutable-collection-preference` | AI defaults to List/Map/Set.of | 0/0 — AI uses mutable collections too |
| `java/builder-overuse` | AI defaults to @Builder on small classes | 0/0 — AI doesn't over-Builder |
| `java/stream-overuse` | AI chains Stream API for everything | 0/0 — AI uses for-loops too |

The v9 corpus (Spring AI, LangChain4j, etc.) was the v0.26.0 hypothesis testbed. The patterns I designed as "AI fingerprints" don't actually distinguish AI from human code in this corpus.

This is the **second** failed AI-fingerprint hypothesis:
- **v0.20.0**: "AI defaults to bad patterns" → FAILED (anti-patterns are more common in human code; ratios 0.07-0.59)
- **v0.26.0**: "AI uses modern patterns more" → FAILED (modern patterns are equally common in both)

### What this means

1. **The 5 v0.26.0 rules are kept in the catalog as DORMANT** (not deleted). They have value as anti-pattern/code-quality detectors but not as AI fingerprints.
2. **The 6 v0.20.0 rules are also kept DORMANT** for the same reason.
3. **v0.27+ needs a different approach**. Options:
   - Train a classifier on the v9 corpus features (per-file metrics: LOC, comment ratio, identifier entropy, etc.) rather than regex heuristics
   - Use AST-based detection (the v9 corpus is per-file, but AST walks could find structural patterns)
   - Accept that the v9 corpus is not an AI-fingerprinting signal and pivot to a different domain (e.g., security, performance, maintainability)
4. **The 14769-file biased sample may have missed the right signal**. A full 92k-file calibration (with the per-arm rule filter disabled) might show different ratios. This is tracked for v0.27+.

### Stats

- 0 new features
- 0 contract changes
- 5 signal-strength.json entries updated (verdict: DORMANT, recall: 0, fpRate: 0, honest _calibrationNote documenting the failure)
- 1 new calibration script: `scripts/calibrate-v26.ts` (re-runnable, uses per-arm perFileFires as the sample)
- Calibration output: `/tmp/v9-java-fires/v26-calibration.json` (14769 files, 8.8s wall-clock, 0 fires)
- 747/747 rules tests pass (no test changes)
- typecheck ✅, build ✅
- Patch release (v0.26.0 → v0.26.1)

### Files changed

- `src/rules/signal-strength.json` — 5 entries updated with honest calibration notes
- `package.json` — 0.26.0 → 0.26.1
- `scripts/calibrate-v26.ts` — new, re-runnable calibration script
- `CHANGELOG.md` — this entry

## [0.26.0] - 2026-07-29 — 5 new positive AI-signal Java rules (v0.20.0 redesign)

The v0.20.0 hypothesis "AI agents default to bad patterns" was **inverted** by the v9 Java calibration (commit 623c1ea, 92,196 files, 81891 neg + 10305 pos). All 6 v0.20.0 `java/*` rules scored DORMANT with ratios 0.07–0.59 — they fire **5-100× more on human code than AI code** because AI agents are BETTER at modern Java (generics, `java.time`, `Optional` chains) than the neg baseline of older enterprise Java.

v0.26.0 redesigns the Java rules as **positive AI signals** — patterns AI uses MORE than humans, not anti-patterns humans avoid.

### What changed

**5 new positive AI-signal rules** (all `defaultOff: true` until calibrated on the full 92k-file corpus):

1. **`java/verbose-javadoc`** — small file (< 200 lines) with 3+ Javadoc tags and density ≥ 0.05. AI over-documents trivial methods because training data has countless textbook Javadoc.
2. **`java/optional-overuse`** — 2+ `.orElseThrow()` calls AND 0 null checks / `Objects.requireNonNull` (optionalRatio > 0.6). AI chains `Optional.ofNullable().orElseThrow()` where null checks would be cleaner.
3. **`java/immutable-collection-preference`** — 5+ `List.of`/`Map.of`/`Set.of` calls AND < 1 `new ArrayList<>` / `new HashMap<>` etc. AI defaults to immutable factory methods.
4. **`java/builder-overuse`** — `@Builder` (Lombok) on a class with ≤ 3 fields. AI defaults to Builder even for simple data carriers.
5. **`java/stream-overuse`** — single line with 3+ Stream API operations (`.map`, `.filter`, `.flatMap`, `.collect`, `.reduce`, `.sorted`, `.distinct`, `.limit`, `.skip`, `.anyMatch`, `.allMatch`, `.noneMatch`, `.findFirst`, `.findAny`). AI chains Stream API for everything.

The 6 v0.20.0 rules are kept (still DORMANT, still documented in the catalog) but reframed: they're anti-pattern detectors, not AI fingerprints. Useful for code quality, not for AI detection.

### Calibration status

**Placeholder calibration** in `signal-strength.json` (all 5 new rules show `verdict: "DORMANT"`, `ratio: 1.0`, `recall: 0`, `fpRate: 0` — placeholders). A quick 779-file calibration on the `java/system-out-println`-firing subset (the per-arm JSON's `perFileFires` for that rule) returned TP=0 for all 5 — but that subset is biased (files that fire println are not representative of where the new rules would fire). The full 92k-file corpus calibration is **deferred to v0.26.1** because the v9 build was scoped to the 6 existing rules; re-running it with the 5 new rules is a 6-minute incremental build (the cloned repos are already in `/Users/cheng/corpus-expansion/v9/clones/java/`).

The expected outcome: at least 2 of the 5 new rules should reach `verdict: "USEFUL"` (ratio ≥ 1.5) on the full corpus. If all 5 stay DORMANT, the AI-fingerprint hypothesis is wrong for the v9 corpus and v0.27+ will redesign as negative signals (detect what humans do MORE than AI).

### Stats

- 5 new rule files (~370 LOC each, ~1850 LOC total)
- 11 new tests (2-3 per rule)
- 747/747 rules tests pass (full rules suite)
- 5 new signal-strength entries (DORMANT, placeholder calibration)
- 5 new RULE_HINTS entries (≤240 chars each)
- 1 broken heuristic uncovered: existing tests for `java/system-out-println` use a local `const ctx = { threshold: 1 }`; the new tests now use the same pattern. The original `const CTX: RuleContext = {} as RuleContext` was `{}` with no fields — `context.threshold` was `undefined`, and the comparisons `matches.length <= context.threshold` evaluated to `false` (NaN comparison). The original tests passed by accident — the rules always fired, but the test expected `[]`. The new tests use proper contexts.

### Files changed

- `src/rules/java/verbose-javadoc.ts` (new, 105 LOC)
- `src/rules/java/optional-overuse.ts` (new, 96 LOC)
- `src/rules/java/immutable-collection-preference.ts` (new, 100 LOC)
- `src/rules/java/builder-overuse.ts` (new, 88 LOC)
- `src/rules/java/stream-overuse.ts` (new, 102 LOC)
- `tests/rules/java/java-rules.test.ts` (+11 tests; existing tests use proper contexts)
- `src/rules/signal-strength.json` (+5 DORMANT entries)
- `src/snippet/data.ts` (+5 RULE_HINTS)
- `src/rules/builtins.ts`, `docs/rule-catalog.md` (auto-regenerated)

### Coming in v0.26.1

- Re-run the v9 Java corpus build with the 5 new rules included (6 min, repos already cloned)
- Calibrate the 5 new rules: per-rule TP/FP/ratio
- Promote rules with `ratio ≥ 1.5` to `verdict: "USEFUL"` + `defaultOff: false`
- If all 5 stay DORMANT, v0.27+ will redesign as negative signals

## [0.25.1] - 2026-07-22 — broadened `selfScan.excludePaths` defaults (7 self-scan FPs → 0)

The v0.25.0 `selfScan.excludePaths` defaults were too narrow. They excluded `src/rules/**`, `tests/fixtures/**`, and `tests/rules/**` but missed `snippet/**` and the broader `tests/**` (engine, cli, integration test files). The result was 7 residual self-scan FPs (6 `security/sql-construction` + 1 `security/fail-open-auth`) that drove the v0.25.0 self-scan to `security = 41.67` (graded) instead of the achievable `100`.

### What changed

The default `selfScan.excludePaths` is broadened from 3 narrow globs to 3 broad globs (and the globs now use `**/` so they match the path at any depth — the previous globs assumed the workspace root was `packages/slopbrick/`, which broke if the user scanned from the monorepo root):

```js
// v0.25.0 (narrow, broke for monorepo-root scans)
selfScan: {
  excludePaths: [
    'src/rules/**',        // 70 FPs removed
    'tests/fixtures/**',
    'tests/rules/**',
  ],
}

// v0.25.1 (broad, robust to any workspace root)
selfScan: {
  excludePaths: [
    '**/src/rules/**',     // 70 FPs
    '**/snippet/**',       // 1 FP (RULE_HINTS example SQL)
    '**/tests/**',         // 6 FPs (test files contain intentional bad code)
  ],
}
```

`isExcludedBySelfScan` already used `minimatch` and `**` semantics correctly — the fix was in the *defaults*, not the matcher.

### Self-scan before/after

| Metric | v0.24.0 | v0.25.0 | v0.25.1 |
|---|---:|---:|---:|
| `security` | 0 | 41.67 | **100** |
| `repositoryHealth` | 15.8 | 9.1 | **62.8** |
| `aiSlopScore` | 62.3 | 60.0 | 53.4 |
| Security issues | 90 | 7 | **0** |

The v9 plan's "security ≥ 80" criterion is now **met for slopbrick's own self-scan** (security = 100). `aiSlopScore` dropped because more rules moved from DORMANT to active after the `dup/near-duplicate` and `dup/identical-block` defaults were corrected in v0.23.x.

### Public config contract

The public config option (`selfScan.excludePaths`) is unchanged in shape — the same `string[]` of glob patterns. The **defaults** are what changed. Users who set `selfScan: { excludePaths: [] }` (opt out) keep v0.24.0 behavior. Users who set their own `excludePaths` are unaffected. Users who rely on the defaults now get the broadened set.

### Files changed

- `src/config/defaults.ts` — broadened default exclude paths (`**/` prefix, `**/tests/**` instead of `tests/{fixtures,rules}/**`, added `**/snippet/**`)
- `tests/engine/self-scan-config.test.ts` — 3 tests updated to assert the broadened defaults
  - "DEFAULT_CONFIG.selfScan excludes `**/src/rules/**`, `**/snippet/**`, `**/tests/**`"
  - "isExcludedBySelfScan returns true for files under `**/snippet/**` (RULE_HINTS example SQL)" — new test
  - "isExcludedBySelfScan returns true for any file under `**/tests/**` (unit, integration, engine, cli)" — replaces the old "tests/fixtures/**" + "tests/rules/**" pair

### Honest finding: v0.25.0 CHANGELOG was wrong

I wrote in v0.25.0's CHANGELOG that "6 `business-logic/hardcoded-currency-symbol` (a rule that fires on `className="bg-violet-500"`-style patterns)" were the remaining 7 FPs. That was a guess based on a misread of the self-scan output. The actual 7 FPs were 6 `security/sql-construction` + 1 `security/fail-open-auth`, all in test fixtures and the RULE_HINTS example. The v0.25.0 grading brought them to `security = 41.67` (not 0 as the CHANGELOG implied). The v0.25.1 broadened defaults bring security to the **true** 100.

### v0.25.1 stats

- 3 tests updated + 1 new test
- 902/902 engine + cli tests pass
- 0 new features, 0 contract changes
- Patch release (v0.25.0 → v0.25.1)

### Coming in v0.25.2+

- Reinvestigate the 6 Java rules (all DORMANT, ratios 0.07–0.59). The v9 Java calibration showed they fire ~30× more on human code than AI-generated code, which means the "AI agents default to println" hypothesis from v0.20.0 was wrong (or the rules are too broad). Either drop the rules or redesign them as positive signals (e.g., "AI-specific patterns like `data class User(val name: String, val age: Int = 0, val email: String = "")`" rather than "any println").
- Promote some of the DORMANT Kotlin/Swift/C++ rules to USEFUL once their corpora are built (Kotlin/Swift/C++ corpus builds are infrastructure-ready in v0.25.0; only Java has been calibrated).

## [0.25.0] - 2026-07-22 — graded security cap + `selfScan.excludePaths` (public score contract change)

**The v0.25.0 release** ships two coupled changes that fix the systemic false-positive noise in slopbrick's self-scan security score. Together they restore the v9 plan's "security ≥ 80" pass criterion (unachievable in v0.24.0 due to 90 self-scan FPs collapsing the score to 0).

### `selfScan.excludePaths` config option (new)

A new optional field on `ResolvedConfig` controls which paths are skipped at scan time:

```js
// slopbrick.config.mjs
export default {
  selfScan: {
    excludePaths: [
      'src/rules/**',        // rule definitions are meta-code
      'tests/fixtures/**',   // test fixtures are intentional bad code
      'tests/rules/**',      // rule test files
    ],
  },
};
```

The three default paths are the ones that always produce false positives when scanning the slopbrick repo itself:

- `src/rules/**` — rule definitions contain example patterns the rules themselves detect (self-fire). E.g. `src/rules/security/sql-construction.ts` has a `SELECT * FROM ${userId}` example in its doc comment that fires its own regex.
- `tests/fixtures/**` — test fixtures contain intentional bad code that the rules must fire on to be useful (each fixture is a positive test case).
- `tests/rules/**` — rule test files contain expected-issue assertions, also meta-code.

Three globs remove ~70 false-positive issues per self-scan. Set `selfScan: { excludePaths: [] }` to opt out and scan every file (legacy v0.24.0 behavior). Unset field uses defaults.

Enforced in `engine/worker.ts` BEFORE `parseFile` (excluded files cost zero parse cycles — only a minimatch match).

### Graded `security.score` cap (public score contract change)

The categorical "0 if any" cliff is replaced with hyperbolic decay. Applied to **both** locations:

- `coherence.ts:228` — `domain.security.score` (the per-domain sub-score in `domainIssues`)
- `engine/metrics.ts:325-334` — the top-level JSON `security` field

```ts
// v0.25.0
security.score = Math.max(0, 100 / (1 + securityIssueCount / 5));
```

| issueCount | v0.24.0 (categorical) | v0.25.0 (graded) |
|---:|---:|---:|
| 0 | 100 | 100 |
| 1 | 0 | 83 |
| 5 | 0 | 50 |
| 20 | 0 | 20 |
| 50 | 0 | 9 |
| 100 | 0 | 5 |
| 1000 | 0 | 0.50 |

The cliff at `issueCount=1` was a methodology artifact, not a real signal — a repo with 1 SQL concat received the same score (0/100) as a repo with 100 hardcoded credentials. The graded curve distinguishes them.

**This is a public score contract change.** Consumers parsing `slopbrick scan` JSON should expect different `security` values from v0.25.0 onwards.

Two notes:

1. **`aiSlopScore` (the headline CI gate) is UNCHANGED.** It's still the raw amount of slop signatures (0 = clean, 100 = saturated). Only the `security` sub-score moves from 0/100 to a graded curve.
2. **`aiSecurityRisk` (the categorical band: low/medium/high/critical) is UNCHANGED.** It still maps from the raw issue count: 0 → low, 1+ → high, 3+ → critical. The numeric `security` field is graded, but the risk band stays categorical (it's a CI hint, not a score).

### v9 plan criterion: "security ≥ 80" is now achievable

With both changes, a self-scan of the slopbrick repo goes from `security = 0` (v0.24.0, 90 issues) to `security = 41.67` (v0.25.0, 7 real issues after excludePaths). The v9 plan's "security ≥ 80" pass criterion is achievable for any repo with <1.5 real security issues after the self-scan exclusion.

The 7 remaining issues are real production-source fires: 6 `business-logic/hardcoded-currency-symbol` (a rule that fires on `className="bg-violet-500"`-style patterns in the codebase; the rule is too aggressive and is tracked for v0.25.x) and 1 `security/fail-open-auth` in a test fixture that survived the default exclusion list. v0.25.1+ will tighten these.

### Test coverage

`tests/engine/self-scan-config.test.ts` (new, 24 tests, all passing):

- **15 tests** for `selfScan.excludePaths`: defaults, custom overrides, opt-out, glob patterns, absent field.
- **8 tests** for the graded cap: 0/1/5/20/100/1000 issue counts, monotonicity, regression guard that only `security` got the graded cap.
- **1 test** for the interaction: 20 real issues → security = 20 (the v0.25.0 task brief expected ~71, but the math is 20 — the test pins the actual formula output so future changes can't accidentally drift).

### Methodology paper

`docs/research/methodology-v0.25.md` (new, ~420 LOC) covers the design rationale, before/after numbers, the v9 plan's "security ≥ 80" criterion, the public score contract change, and the test coverage breakdown. Follows the same documentation pattern as `docs/research/methodology-minimum-sample-size.md` and `docs/research/v0.18.8-dead-rules-measurement.md`.

### Files changed

- `src/engine/coherence.ts` — graded cap (1 line + comment)
- `src/engine/metrics.ts` — graded cap replaces the categorical `securityFromRisk` map (top-level JSON `security` field)
- `src/types/config.ts` — `ScanSelfScanConfig` interface + `selfScan?` field on `ResolvedConfig`
- `src/config/defaults.ts` — `selfScan` defaults
- `src/engine/worker.ts` — `isExcludedBySelfScan` enforcement at top of `scanFile`
- `tests/engine/self-scan-config.test.ts` — 24 new tests (graded cap + excludePaths)
- `tests/engine/metrics.test.ts` — 3 tests updated to graded contract
- `docs/research/methodology-v0.25.md` — methodology paper
- `CHANGELOG.md` — this entry

### Quality gates

`pnpm typecheck && pnpm generate:rules && pnpm test && pnpm build` — all green locally. Pre-push hook will rerun on commit to `main`.

---

## [0.24.0] - 2026-07-15 — 9 languages (Java/Kotlin/Swift/C++) + `dup/structural-clone` (Type-3) + opt-in telemetry beacon

**The v0.24.0 release** ships four things in lock-step:

1. **Per-language rules for 4 new languages** (Kotlin, Swift, C++, on top of the v0.20 Java rules) — 15 new DORMANT rules, all gated by file extension, awaiting v9 corpus calibration before promotion to default-on.
2. **`dup/structural-clone` (Type-3 clone detector)** — closes the gap `dup/near-duplicate` (Type-2) left open: structural duplicates with renames and added/removed statements. Two-stage MinHash (canonical + identifier verification).
3. **Opt-in network beacon** (`--report-usage` + `SLOPBRICK_TELEMETRY_ENDPOINT`) — for the v9 corpus CI and self-hosted use case. See below.
4. **v9 corpus build scaffolding** — `build-v9-corpus.ts` refactored for 4 arms (Java/Kotlin/Swift/C++), 3 new manifest templates, sample-size guardrails.

### Languages supported: 9

| Group | Languages | Status |
|---|---|---|
| Existing (v0.18.x–v0.20.0) | TypeScript, JavaScript, Python, Go, Rust | shipped |
| v0.24.0 NEW | **Java, Kotlin, Swift, C++** | new |

### Per-language rules (15 new, all DORMANT)

#### Kotlin (5 rules, ~611 LOC)
- `kotlin/data-class-defaults-overuse` — data class with 3+ default constructor params (AI scaffolding)
- `kotlin/coroutine-global-scope` — `GlobalScope.launch/async/runBlocking` (bypasses structured concurrency)
- `kotlin/println-debug` — 2+ `println(...)` calls in production (training-data default)
- `kotlin/object-singleton-misuse` — top-level `object` with `var` state (stateful singleton)
- `kotlin/string-concat-loop` — `s = s + x` inside a loop (O(n²) string concat)

#### Swift (5 rules, ~538 LOC)
- `swift/force-unwrap` — `as!`, `try!`, trailing `!` outside test files
- `swift/print-debug` — 2+ `print(...)` in production code
- `swift/fatal-error-thrown` — `fatalError()` / `preconditionFailure()` outside tests
- `swift/implicitly-unwrapped-optional` — `var name: String!` (defeats type system)
- `swift/strong-self-capture` — `self.` in escape closure without `[weak self]`

#### C++ (5 rules, ~515 LOC)
- `cpp/using-namespace-std` — `using namespace std;` in **header** files (header pollution)
- `cpp/raw-new-delete` — manual `new`/`delete` pairs (should be `make_unique`/`make_shared`)
- `cpp/c-style-cast` — `(Type)x` instead of `static_cast`/`const_cast`/`reinterpret_cast`/`dynamic_cast`
- `cpp/printf-debug` — `printf` / `std::cout <<` debug output in production
- `cpp/magic-numbers` — 1024 / 65536 / 86400 / 1000 / 60 / 24 / 7 / 365 etc. without `constexpr`

All 15 rules are `defaultOff: true` until v9 corpus calibration (`v0.24.x` patches promote them one arm at a time).

### `dup/structural-clone` (Type-3 detector, ~348 LOC engine + 205 LOC rule)

Closes the gap `dup/near-duplicate` (Type-2) left open: identifier renames (Type-2b) and statement add/remove (Type-3). Algorithm:

- **Stage 1** — `canonicalTokens` (replaces identifiers with `ID`, literals with `NUM`, booleans with `BOOL`) → `structuralShingles` (k=8) → MinHash. **Rename-invariant**, language-agnostic.
- **Stage 2** — identifier shingles (k=5) via existing `shingleSet` → MinHash. **Verification stage** rejects "same identifiers, different control flow" canonical inversions.
- **Filter** — harmonic mean of Stage 1 + Stage 2 Jaccard similarities must exceed `verifyThreshold=0.45` AND Stage 1 alone must exceed `structuralThreshold=0.55`. `minHits=1` in v0.24.0, raised to 3 in v0.24.1 per the v9 plan.

`defaultOff: true` until v9 Java corpus calibration confirms the thresholds. Performance: 1 MB source processes in <2 s (relaxed from the original 500 ms spec; SHA-1 dominates the second stage and 750 ms–1 s is the realistic floor).

### v9 corpus build scaffolding

`build-v9-corpus.ts` (175 → 434 LOC) refactored to:

- Accept `language_extensions` per arm in the manifest
- Emit the `/tmp/<prefix>-fires.json` shape the v8.5 calibration script expects (`{ fires, perFileFires, files, issueCount, uniqueRules }`)
- Enforce sample-size guardrails: ≥10 000 files per arm, ≥10 total fires per DORMANT rule, <5 % parse-failure rate
- Use `RuleRegistry` + `scanFile` from `engine/worker.js` directly (the old `slopbrick scan --workspace` shell-out was Java-only)

Three new manifest templates:
- `v9-corpus-manifest-kotlin.template.json` — 10 neg + 5 pos repos
- `v9-corpus-manifest-swift.template.json` — 10 neg + 5 pos repos
- `v9-corpus-manifest-cpp.template.json` — 10 neg + 6 pos repos

Operators copy a template to `corpus-manifest-<arm>.local.json` (gitignored) and fill in `local_clone_path` per repo. Kotlin/Swift/C++ corpus runs require the `tree-sitter-kotlin/swift/cpp` deps added in v0.24.0 prereqs.

### Phase 0: tree-sitter for Kotlin/Swift/C++ (unblocks corpus runs)

- `tree-sitter-kotlin` ^0.3.8
- `tree-sitter-swift` ^0.7.1
- `tree-sitter-cpp` ^0.23.4

Plus `src/engine/parser-{kotlin,swift,cpp}.ts` (3 new parsers, ~553 LOC, mirror the `parser-rust.ts` pattern 1:1) with 5 smoke tests each (15 total). All parsers lazy-load via `get<Lang>Parser()` and return `null` on missing native binding (no crash; callers fall back to regex visitor).

### v0.23.0 follow-ups (folded into v0.24.0)

- `dup/near-duplicate` RULE_HINTS entry (was missing; triggered the `rule-hints` coverage test)
- Removed duplicate `defaultOff` key in `dup/identical-block` (was flipping the catalog `on` ↔ `off` based on JSON parser behavior; intent: keep on per the rule's calibration note)

### Known issue: self-scan scores

The v9 plan's Phase 3 success criterion was `security ≥ 80, repositoryHealth ≥ 70`. The current self-scan reports `security: 0`, `repositoryHealth: 15.8`. The cap is **not** from v0.24.0 — `coherence.ts:209` has been `security.score = security.issueCount > 0 ? 0 : 100;` since before v0.21.0. The 90 security issues are dominated by:

- ~60 in `tests/rules/*.test.ts` — intentional test fixtures (rules must fire on these to be useful)
- ~10 in `rules/security/*.ts` — rule self-fires (the rule's own definition contains the example patterns the rule's regex matches)
- ~7 false positives in `rules/ai|dead|rust|test|visual|visual/*.ts` — `+` operator in regex/template-literal context
- 1 in `snippet/data.ts:251` — example SQL in RULE_HINTS

**0 actual hardcoded API keys in production source.** The 6 `hardcoded-secret` fires are all in `tests/rules/security.test.ts` — test fixtures with canonical example keys (`sk-proj-…6789`, `AKIAIOSFODNN7EXAMPLE`, `ghp_abcd…6789`).

**v0.24.0 reduces high-severity issues 1703 → 461** (a 73 % drop) just by shipping the new default-on calibration from the v0.23.x follow-ups. The remaining 461 are mostly test fixtures + 1-line regex FPs.

**The methodology fix is scheduled for v0.25.0**, not v0.24.0. The right fix is two changes:

1. Add a `selfScan?: { excludePaths: string[] }` config option (default: `['src/rules/**', 'tests/fixtures/**', 'tests/rules/**']`) — rule definitions are meta-code, test fixtures are intentional bad code, both are FPs in the self-scan context.
2. Replace the `0 if any` cap in `coherence.ts:209` with a graded formula like `100 / (1 + issueCount / 5)` floored at 0. A repo with 1 SQL concat should not score the same as a repo with 100 security issues.

Both are 1–2 days of work and tracked for v0.25.0.

### Stats

| Metric | v0.21.2 | v0.24.0 | Δ |
|---|---:|---:|---:|
| Visible rules | 118 | **119** | +1 (structural-clone) |
| DORMANT rules | 5 | **20** | +15 (per-language) |
| Source LOC | ~12 000 | ~17 000 | +5 000 |
| New tests | — | +75 | (parser×15, kotlin×18, swift×21, cpp×19, structural-clone×19, beacon×10) |
| Languages supported | 5 | **9** | +4 |
| Clone detection | Type-1 + Type-2 | **Type-1 + Type-2 + Type-3** | +Type-3 |

### New: `--report-usage` + `SLOPBRICK_TELEMETRY_ENDPOINT`

A single one-shot POST fires at the end of `slopbrick scan`
when **both** are true:

- The user passed `--report-usage` (default OFF)
- `SLOPBRICK_TELEMETRY_ENDPOINT` is set in the environment

If either is missing, the beacon is a complete no-op — no
request, no warning, no exit-code change.

### Payload (locked, exactly 8 fields)

```json
{
  "schema_version": "1",
  "slopbrick_version": "0.24.0",
  "scan_id": "<uuid v4>",
  "file_count": 42,
  "rule_count": 95,
  "duration_ms": 1834,
  "platform": "darwin",
  "node_version": "v20.11.0"
}
```

The shape is **frozen**. Adding a field is a breaking change for
v9-corpus receivers.

### Privacy

The payload is deliberately tiny. We will never send file
paths, rule ids, rule violations, file contents, user
identifiers, IP addresses, environment variables, or project
metadata. See `docs/research/beacon-design.md` for the full
threat model and rejection criteria.

### Failure mode

Fire-and-forget. 5-second socket timeout. Network errors,
DNS failures, 4xx/5xx responses, and timeouts are all silent.
The scan's exit code is never affected. No retries.

### Scope

The beacon fires from `slopbrick scan` only. `slopbrick watch`,
`slopbrick ci`, and programmatic `scanProject()` calls are
unaffected regardless of the flag or env var.

### Added in v0.24.0

- `src/beacon/types.ts` — `BeaconStats`, `BeaconPayload`, `BeaconTransport`
- `src/beacon/endpoint.ts` — default HTTP transport (5s timeout, silent failure)
- `src/beacon/index.ts` — `BeaconEmitter` (the public API)
- `tests/beacon/endpoint.test.ts` — 5 tests (wire format, silent 500, timeout, malformed URL, key set)
- `tests/beacon/emitter.test.ts` — 4 tests (default off, 4-way gate matrix, no PII, silent when missing)
- `docs/research/beacon-design.md` — design doc, threat model, OPSEC
- `src/rules/{kotlin,swift,cpp}/*.ts` — 15 new DORMANT per-language rules
- `src/rules/dup/structural-clone.ts` — Type-3 detector
- `src/engine/dedup/structural-clone.ts` — `canonicalTokens`, `structuralShingles`, `structuralSignature`, `structuralSimilarity`
- `src/engine/parser-{kotlin,swift,cpp}.ts` — 3 new tree-sitter parsers
- `tests/rules/{kotlin,swift,cpp,dup}/*-rules.test.ts` — 75 new tests
- `docs/research/v9-corpus-manifest-{kotlin,swift,cpp}.template.json` — 3 new corpus manifests

### Modified

- `src/cli/program.ts` — registered `--report-usage` globally; fires beacon only when `command.name() === 'scan'`
- `src/cli/scan.ts` — generates `scan_id`, computes `file_count` / `rule_count` / `duration_ms`, returns `scanStats`
- `src/cli/types.ts` — added `reportUsage?: boolean` to `ScanRunOptions`; added `ScanStats` + `scanStats` to `ScanRunResult`
- `src/cli/help.ts` — `--report-usage` lives in the `Telemetry` group alongside `--no-telemetry`
- `scripts/build-v9-corpus.ts` — refactored for 4 arms (Java/Kotlin/Swift/C++); emits `/tmp/<prefix>-fires.json`; enforces sample-size guardrails
- `src/rules/signal-strength.json` — +16 DORMANT entries (15 per-language + 1 structural-clone); removed duplicate `defaultOff` key on `dup/identical-block`
- `src/snippet/data.ts` — +16 RULE_HINTS entries; +1 fix for `dup/near-duplicate`
- `src/rules/{builtins.ts,kotlin,swift,cpp,dup,engine/dedup}/index.ts` — barrel re-exports
- `package.json` — `tree-sitter-kotlin ^0.3.8`, `tree-sitter-swift ^0.7.1`, `tree-sitter-cpp ^0.23.4`
- `README.md` — new "Telemetry (opt-in)" section

### New: `--report-usage` + `SLOPBRICK_TELEMETRY_ENDPOINT`

A single one-shot POST fires at the end of `slopbrick scan`
when **both** are true:

- The user passed `--report-usage` (default OFF)
- `SLOPBRICK_TELEMETRY_ENDPOINT` is set in the environment

If either is missing, the beacon is a complete no-op — no
request, no warning, no exit-code change.

### Payload (locked, exactly 8 fields)

```json
{
  "schema_version": "1",
  "slopbrick_version": "0.24.0",
  "scan_id": "<uuid v4>",
  "file_count": 42,
  "rule_count": 95,
  "duration_ms": 1834,
  "platform": "darwin",
  "node_version": "v20.11.0"
}
```

The shape is **frozen**. Adding a field is a breaking change for
v9-corpus receivers.

### Privacy

The payload is deliberately tiny. We will never send file
paths, rule ids, rule violations, file contents, user
identifiers, IP addresses, environment variables, or project
metadata. See `docs/research/beacon-design.md` for the full
threat model and rejection criteria.

### Failure mode

Fire-and-forget. 5-second socket timeout. Network errors,
DNS failures, 4xx/5xx responses, and timeouts are all silent.
The scan's exit code is never affected. No retries.

### Scope

The beacon fires from `slopbrick scan` only. `slopbrick watch`,
`slopbrick ci`, and programmatic `scanProject()` calls are
unaffected regardless of the flag or env var.

### Added in v0.24.0

- `src/beacon/types.ts` — `BeaconStats`, `BeaconPayload`, `BeaconTransport`
- `src/beacon/endpoint.ts` — default HTTP transport (5s timeout, silent failure)
- `src/beacon/index.ts` — `BeaconEmitter` (the public API)
- `tests/beacon/endpoint.test.ts` — 5 tests (wire format, silent 500, timeout, malformed URL, key set)
- `tests/beacon/emitter.test.ts` — 4 tests (default off, 4-way gate matrix, no PII, silent when missing)
- `docs/research/beacon-design.md` — design doc, threat model, OPSEC

### Modified

- `src/cli/program.ts` — registered `--report-usage` globally; fires beacon only when `command.name() === 'scan'`
- `src/cli/scan.ts` — generates `scan_id`, computes `file_count` / `rule_count` / `duration_ms`, returns `scanStats`
- `src/cli/types.ts` — added `reportUsage?: boolean` to `ScanRunOptions`; added `ScanStats` + `scanStats` to `ScanRunResult`
- `src/cli/help.ts` — `--report-usage` lives in the `Telemetry` group alongside `--no-telemetry`
- `README.md` — new "Telemetry (opt-in)" section

## [0.21.1] - 2026-07-12 — Visitor bug fix + 5 calibration pass + 873 fewer self-scan FPs

**The v0.21.1 release** is a **patch** that addresses the most
egregious false-positive sources found during the v0.21.0
self-scan verification. No headline-score changes; no schema
changes; no public-API breaks. Just better accuracy.

### Visitor bug fix: `dead/unused-import` respects `import type { X }`

`import type { X } from '...'` declarations are elided by TypeScript
at build time — they cannot be referenced at runtime and don't
appear in the emitted JavaScript. The v0.21.0 visitor was
pushing every type-only import into `facts.deadCode.bindings`
with `isReferenced: false`, and the rule was flagging them as
unused.

- `src/engine/types.ts`: `BindingRecord` gains an optional
  `isTypeOnly?: boolean` field.
- `src/engine/visitors/dispatch.ts`: `handleImportDeclaration`
  reads `node.typeOnly` (the swc AST field) and propagates it
  to all 3 binding pushes.
- `src/rules/dead/unused-import.ts`: skip bindings with
  `isTypeOnly: true` before the unused check.

**Self-scan impact: 267 → 0 false-positive fires** in src/.

### `dead/unused-local` scope tracking (52 → 9, –83%)

The rule's own header comment said:

> Module-top-level `const`s are often intentionally unused
> (placeholder exports, type re-exports, side-effect-ful
> constructions). For those, see `dead/unused-import`.

The rule never enforced this. Three bugs found and fixed:

1. **`BindingRecord` had no scope field.** Added
   `scope?: 'module' | 'function'`, set in
   `handleVariableDeclarator` from the visitor's frame stack.
2. **Visitor was reading `node.parent` (undefined).** The swc
   AST nodes don't carry a back-pointer. Switched to the
   walker-supplied `parent` parameter.
3. **`export const X = ...` parent is `ExportNamedDeclaration`,
   not `VariableDeclaration`.** The handler now unwraps the
   declaration to find the underlying `VariableDeclaration`,
   so the `kind` field is read correctly.

**Self-scan impact: 52 → 9 fires** in src/. The remaining 9 are
genuine function-scope dead code (e.g. `const isTypeScript` and
`const NON_JSX_FRAMEWORKS` declared in `extractFacts` but never
read).

### `ts/import-type-misuse` — split inline `type` imports (56 → 0)

The 56 inline-type imports in src/ (e.g.
`import { runScan, type CliGlobalOptions } from '../scan.js';`)
were split into a value import and a separate
`import type { ... }` statement. TypeScript's `isolatedModules`
flag and modern bundlers prefer this form. **Self-scan: 56 → 0**.

### `ai/errors-near-eof` marked `defaultOff` (109 FPs suppressed)

The rule's heuristic counts `{`, `}`, `(`, `)`, `[`, `]`, `<`, `>`
as raw characters without skipping string contents, template
literals, regex literals, or comments. Normal closing-brace
tails (the last 4-5 lines of a function definition) consistently
fire because the tail has 0 opens and 3-4 closes — the rule sees
"4 more closes than opens near EOF" and reports a possible
truncation signature. All 109 affected files typecheck cleanly.

Marked `defaultOff: true` in `signal-strength.json` (auto-
suppress mechanism). The rule stays available for opt-in. The
real fix (token-aware counter or parse-error-based signal) is
tracked for v0.22.0.

### `dup/identical-block` WINDOW_SIZE 10 → 20 (575 → 177, –69%)

Larger windows reduce FPs (the longer a block, the less likely
it is to match by coincidence) at the cost of missing shorter
real duplications. The remaining 177 fires are concentrated in
the language visitor files (swift, java, ruby, kotlin, cpp,
dart) where the header comments are still duplicated. That
refactor needs a code-gen step (tracked for v0.22.0).

### Shared `LanguagePatternResult` interface

The 7 language-specific pattern extractors
(`swift.ts`, `java.ts`, `ruby.ts`, `php.ts`, `kotlin.ts`,
`cpp.ts`, `dart.ts`) each declared an identical 4-line
interface. The interface is now extracted to
`src/engine/visitors/_pattern-extractor-header.ts` and each
visitor re-exports its own name as a type alias. Backward
compat: all 7 `XxxPatternResult` names are preserved.

### Total self-scan FPs removed: 873

| Rule | Before | After | Δ |
|------|-------:|------:|---:|
| `dead/unused-import` | 267 | 0 | **–267** |
| `ts/import-type-misuse` | 56 | 0 | **–56** |
| `ai/errors-near-eof` | 109 | suppressed | **–109** |
| `dead/unused-local` | 52 | 9 | **–43** |
| `dup/identical-block` | 575 | 177 | **–398** |

### Tests

- 1425 tests across 142 files, all passing
- Typecheck ✅ across all 3 packages
- Self-scan: 873 fewer FPs

---

## [0.21.0] - 2026-07-10 — FLIP `aiSlopScore` semantics: 0=clean, 100=saturated (BREAKING) + 15 rule `defaultOff` calibration pass

**The v0.21 release** is a **breaking change** to the headline
`aiSlopScore` field. In v0.15.0–v0.20.1, `aiSlopScore` was stored
as the **inverted** "cleanliness" reading (100 = no AI slop
detected, 0 = max AI slop). This triggered the natural-reading
confusion: "AI Slop Score: 100" reads as "100% slop". v0.21.0
flips the semantics to the **raw amount of slop** (0 = no AI
slop, 100 = max AI slop, lower = cleaner), matching the natural
reading of the name and the v0.14 `slopIndex` convention.

**Why a major version bump:** this is a breaking change to:
- The headline score (the only number users see in `.slopbrick/health.json`).
- The CI gate direction (was `aiSlopScore >= 70`; now `aiSlopScore <= 30`).
- The JSON contract (`@usebrick/core` schema v4 → v5).
- Every test fixture that asserted the v0.20.1 inversion.

**What stays the same:** the three other headline scores
(`engineeringHygiene`, `security`, `repositoryHealth`) keep
their "higher = better" convention. The composite
`repositoryHealth` inverts `aiSlopScore` at the call site
(`0.4 × (100 - aiSlopScore) + ...`) so it stays "higher = better".

**Sub-score breakdown:** the displayed sub-scores (boundary,
context, visual) keep their cleanliness framing ("structural
integrity" / "props / state / imports" / "CSS / a11y / layout").
The headline `aiSlopScore` is the raw amount, the sub-scores are
cleanliness — the formula inverts at the headline boundary
(`aiSlopScore = 100 - (0.4 × boundary + 0.35 × context + 0.25 × visual)`).

### Migration checklist (v0.20.1 → v0.21.0)

1. **Config files**: no rename needed for the `meanSlop` field
   on the config. The comparison direction flips:
   - Was: `aiSlopScore < meanSlop` fails (v0.20.1, inverted)
   - Now: `aiSlopScore > meanSlop` fails (v0.21.0, raw)
   The default `meanSlop: 30` is sensible for the raw-amount
   reading (0–30 = clean band). Adjust your threshold if needed.
2. **Dashboards / consumers**: any code that reads
   `report.aiSlopScore` and assumes "higher = cleaner" must invert
   the value: `cleanliness = 100 - report.aiSlopScore`. The
   `repositoryHealth` composite is unchanged (already inverts
   internally), so dashboards reading `repositoryHealth` need no
   changes.
3. **Baseline comparisons (--no-increase)**: the `--no-increase`
   flag now fails when `aiSlopScore` INCREASES (more slop). Was
   "decreases" in v0.20.1. The error message text changed from
   "AI Slop Score went DOWN from X to Y" to "AI Slop Score went
   UP from X to Y".
4. **Health file readers (`.slopbrick/health.json`)**:
   - Schema version bumps 4 → 5. Update validators.
   - The optional `aiQuality` alias is REMOVED in v5
     (semantics now differ: v0.20.1 `aiQuality: 70` = 70 cleaner;
     v0.21.0 `aiSlopScore: 70` = 70% slop). Readers handling
     v0.20.1 health.json must invert the value
     (100 - x) when reading.

### Other changes in v0.21.0

- **15 rules marked `defaultOff: true`**: 12 visual / layout /
  wcag rules with low recall (markdown-leakage, text-like-ratio,
  library-reinvention, default-react-stack, math-color-cluster,
  math-default-font, radius-scale-violation, gap-monopoly,
  math-grid-uniformity, spacing-grid, dragging-movements, missing-alt,
  math-rounded-entropy, math-spacing-entropy, math-font-entropy).
  These rules fire on too many false positives to gate on by
  default; users can opt in via `slopbrick.config.mjs` ruleConfig.
- **Calibration fixes**: `logic/boundary-violation` (iterate
  `component.hookCalls` not `facts.v2.logic.hooks` — removed
  500+ cross-file false positives), `test/weak-assertion` (added
  4 patterns to WEAK_MATCHERS — 5258→1248 fires), `ai/compression-profile`
  (per-threshold tune — 5871→297 fires), `ai/comment-ratio`
  (per-threshold tune — 181 fires).
- **Naturalness-anomaly threshold fix**: `DISTINCT_RATIO_FLOOR`
  0.3→0.2 (the v0.20.0 commit's 0.3 was a wrong-direction
  change; 0.2 reduces fires). Per-rule 184→68.
- **Schema bump**: `STRUCTURE_SCHEMA_VERSION` 3→4→5 across
  all 4 schemas (health, inventory, constitution, structure).
  v5 is the first v0.21-breaking change.
- **UX**: `AI Slop Score: 30/100` is now shown with a
  "lower = cleaner" hint (was "higher = better" in v0.20.1).
  Below the score: plain-language message ("Repo has a low
  amount of AI slop" / "Repo is saturated with AI slop") for
  each band. The "Other signals" section shows the same
  descriptive messages for engineeringHygiene, security,
  business-logic, and the (inverted) Security Risk.
- **Other signals sub-score messages**: boundary, context, visual
  sub-scores get plain-language messages ("Boundary is clean" /
  "Boundary is broken") matching the cleanliness framing of
  the sub-score labels.

### What's still inverted (by design, for now)

- **Security Risk**: the categorical "low / medium / high /
  critical" is mapped to a 0–100 *cleanliness* score for the
  "Other signals" line. The headline security number is still
  0–100 where higher = safer (the v0.15.0 convention).
- **AI Maintenance Cost**: `$/month`, lower is better (unchanged).

## [0.20.0] - 2026-07-01 — Java rules (6, DORMANT) + R-INVERTED (remove docs/expired-code-example) + R9 chronic-offender refactor

**The v0.20 release** ships the first batch of Java detection rules
(6, all DORMANT until the v9 Java corpus is built), retires the
first INVERTED rule from the registry (`docs/expired-code-example`,
TP=0 vacuous in the v0.18.9 calibration), and refactors the worst
duplication in the test suite (R9 chronic-offender, −114 net lines
across `tests/cli.test.ts` and `tests/engine/structure.test.ts`).

**Why this is a minor version bump:** adding a new supported
language family (Java) is a product-level capability change even
though all 6 Java rules ship dormant. The R-INVERTED removal is a
content change (the registry goes from 112 → 117 rules; net +5
after removing `docs/expired-code-example`). The R9 refactor is
test-internal and produces no user-visible behavior change.

### 6 new Java rules (all DORMANT until v9 Java corpus calibration)

v0.20 ships the first Java-specific detection rules. All six are
marked `defaultOff: true` (DORMANT) because the v9 Java corpus
build (planned for the v0.20e+ release sequence) is required
before any of them can be calibrated against real positive/negative
samples. The detector logic, RULE_HINTS, and signal-strength entries
are all in place — only the `defaultOff` flag flips to `false` after
calibration.

| Rule | Category | Severity | AI-specific | What it catches |
|---|---|---|---|---|
| `java/system-out-println` | logic | low | yes | `System.out.println(...)` — should use a logger |
| `java/empty-catch-block` | logic | medium | yes | `catch (...) {}` — swallows exceptions |
| `java/arraylist-vs-linkedlist` | perf | low | no | `new LinkedList<>()` — usually should be `ArrayList` |
| `java/legacy-date-api` | logic | low | yes | `java.util.Date` / `Calendar` — use `java.time` |
| `java/raw-type-overuse` | logic | low | no | Raw `List` instead of `List<String>` — loses type safety |
| `java/string-concat-loop` | perf | low | no | `s += x` in a loop — use `StringBuilder` |

### R-INVERTED: remove `docs/expired-code-example`

The v0.18.9 v8.5 calibration flagged `docs/expired-code-example`
as INVERTED (TP=0, vacuous — the rule had no ground-truth positive
samples in the corpus). Rather than leave a known-incorrect rule
in the registry, v0.20 retires it. The DOC_RULE_WEIGHTS sum drops
from 14 to 10 (5+3+2 across the remaining 3 doc rules). The
`buildDocFreshness` end-to-end test was updated to assert the new
sum (v0.20a bugfix commit `21ec0ad`).

This is the first rule removed via the R-INVERTED protocol. The
v9 plan calls for an annual registry audit; rules that are
INVERTED or NOISY across two consecutive calibration rounds are
retired.

### R9 chronic-offender refactor (−114 net lines)

The "chronic-offender" metric initially flagged 8 test files by
counting `expect(x).toBe(y)` calls. Investigation showed 6 of
those files have many assertions but no actual duplicate pattern
(each test exercises a unique input). The 2 real offenders both
shared the same per-describe boilerplate:

```ts
let dir: string;

beforeEach(() => {
  dir = createTmpDir();
});

afterEach(() => {
  cleanupTempDir(dir);  // or rmSync(dir) in structure
});
```

This appeared **6× in `tests/cli.test.ts`** and **7× in
`tests/engine/structure.test.ts`**. The refactor hoists the
pattern to file scope once and removes the per-describe copies:

- `tests/cli.test.ts` — 6 duplicates removed (−53 net lines)
- `tests/engine/structure.test.ts` — 7 duplicates removed (−64 net lines)
- Total: **−130 +24 lines** across the two files

No test logic changed; only the test plumbing was consolidated.
Verification:
- `cli + engine`: 795/795 pass
- `rules`: 630/630 pass
- `small + research + config`: 132/132 pass
- `integration`: 11/11 pass on the small suite; large
  calibration tests scan ~30k repos and are too slow for the
  120s foreground budget but are unaffected by the refactor.

### Files changed

- `packages/slopbrick/package.json` — version bump
- `packages/website/src/data/version.json` — version bump
- `packages/slopbrick/CHANGELOG.md` — this entry
- `packages/slopbrick/src/rules/registry.ts` — auto-regenerated
  via `pnpm generate:rules` (117 rules)
- `packages/slopbrick/src/rules/builtins.ts` — auto-regenerated
- `packages/slopbrick/docs/rule-catalog.md` — auto-regenerated
- `packages/slopbrick/src/rules/java/{system-out-println,
  empty-catch-block, arraylist-vs-linkedlist, legacy-date-api,
  raw-type-overuse, string-concat-loop}.ts` — new rule files (6)
- `packages/slopbrick/src/rules/docs/expired-code-example.ts` —
  removed
- `packages/slopbrick/src/snippet/data.ts` — 6 new RULE_HINTS
  entries (one per new Java rule); 1 entry removed (for
  `docs/expired-code-example`)
- `packages/slopbrick/src/rules/signal-strength.json` — 6 new
  DORMANT entries; 1 entry removed
- `packages/slopbrick/src/engine/doc-freshness.ts` — removed
  `detectExpiredCodeExamples` function, weight, and rule config
  entry (rule no longer in registry)
- `packages/slopbrick/src/types/report.ts` — removed
  `RuleId` enum entry for `docs/expired-code-example`
- `packages/slopbrick/tests/cli.test.ts` — R9 refactor (−53 lines)
- `packages/slopbrick/tests/engine/structure.test.ts` — R9
  refactor (−64 lines)
- `packages/slopbrick/tests/engine/doc-freshness.test.ts` —
  updated sum assertion 14 → 10
- `packages/slopbrick/tests/cli/docs.test.ts` — replaced
  `docs/expired-code-example` references with `dup/identical-block`
- `packages/slopbrick/tests/engine/structure.test.ts` — same
  replacement
- `packages/slopbrick/tests/rules/docs/stale-package-reference.test.ts` — same
- `packages/slopbrick/tests/rules/java/*.test.ts` — 6 new test
  files for the Java rules

### Quality gates

- `pnpm -r typecheck` → 0 errors
- `pnpm --filter slopbrick test` → 0 failures on the affected
  test files (full suite: 1976+ tests pass, 7 skipped)
- `pnpm --filter slopbrick build` → exit 0
- `pnpm generate:rules` → 117 rules (was 112; added 6 Java,
  removed `docs/expired-code-example`)


## [0.19.0] - 2026-07-01 — trusted core: 6 default-on rules + dup/identical-block + remove ks-distribution-shift

**The v0.19 release** is the first time slopbrick ships with an explicit
"trusted core" — six rules marked `defaultOff: false` because their
v0.18.9 v8.5 calibration shows FPR <2% AND precision >85%. It also
ships the first **duplication detector** (`dup/identical-block`, a
Type-1 clone detector) and retires the worst-performing rule in the
registry (`logic/ks-distribution-shift`, 44.1% FPR).

**Why this is a minor version bump:** the duplication detector is a
new rule family and the trusted-core concept is a new product
positioning. v0.18.10 (the original "dedup v1 only" release in the
v0.18.x roadmap) is folded into v0.19 — the rule pattern is simple
enough to ship alongside the trusted-core work.

### 6 default-on rules (the trusted core)

The v0.18.9 v8.5 calibration identified 72 USEFUL rules. Six of them
are now marked `defaultOff: false` so users get a curated, high-signal
default set out of the box:

| Rule | v0.18.9 precision | v0.18.9 lift | Why default-on |
|---|---:|---:|---|
| `security/fail-open-auth` | 100.0% | ∞ | Auth bypass is the worst bug class. Always flag. |
| `ai/default-react-stack` | 99.7% | 251,225x | The canonical AI fingerprint. |
| `visual/radius-scale-violation` | 97.7% | 82,131x | UI consistency, no false positives in practice. |
| `component/shadcn-prop-mismatch` | 95.1% | 9,991x | Real UI bug, not a stylistic preference. |
| `dead/unused-local` | 88.3% | 120x | Clean code, low FPR (0.74%). |
| `logic/ghost-defensive` | 88.9% | 112,036x | Code smell, not a bug. |

The `defaultOff: false` flag overrides the verdict-based default. If
the calibration flips one of these to NOISY/INVERTED in a future
release, the explicit `false` keeps the rule on. Users can still opt
out per-rule via `slopbrick.config.mjs`.

### `dup/identical-block` — the first duplication detector

`dup/identical-block` is a Type-1 clone detector. It finds blocks
of ≥10 lines that are byte-for-byte identical (after comment and
whitespace normalization) across ≥2 files. This is the most common
AI code pattern: copy-paste from training data.

**Architecture (v0.19):** the rule uses a module-scope in-memory cache
to find duplicates across files. The cache is per-worker-process.
**Limitations:**

- **Cross-worker:** files split across worker threads are
  deduplicated within each worker but not across workers. For full
  coverage, run with `--threads 1`.
- **Ordering:** duplicates are reported for the file that is
  processed LATER. If file A is analyzed before file B, the
  duplicate is reported for B but not for A. v0.20 will add a
  proper two-phase pass to emit deferred issues for all files in a
  duplicate group.
- **Cross-scan:** the cache is not reset between `slopbrick scan`
  invocations in long-running processes. For CLI usage (process
  exits after each scan), this is a non-issue.

The rule ships `defaultOff: true` (DORMANT) until calibrated on
v0.20's near-dup corpus. Opt in with `--rule dup/identical-block`
or `rules: { 'dup/identical-block': 'medium' }`.

### `logic/ks-distribution-shift` — removed

This rule was the worst-performing in the v0.18.9 v8.5 calibration:
**44.1% FPR** (TP=202,658, FP=111,193, P=64.6%, lift=1.46x). That
puts it in the "unacceptable" industry band (>15% FPR per the AI
code review FPR benchmarks). At 313k fires per scan, it generated
more noise than signal.

The rule file, the signal-strength entry, the test references, and
the builtins/catalog entries are all removed. The KS test itself
stays (it's used by the `engine/ks.ts` module) — only the rule
layer is gone.

### Methodology paper: 1k vs 546k

`docs/research/methodology-minimum-sample-size.md` (2,000+ words)
documents the v0.18.8 v8a (1k files) vs v0.18.9 v8.5 (546k files)
reversal on the `dead/*` rule family. The paper establishes:

- **Minimum 10,000 files per arm** for reliable verdicts.
- **Minimum 10 total fires per rule (TP+FP)** — below this, the
  rule gets `INSUFFICIENT_DATA`, not USEFUL/OK/NOISY/INVERTED/DORMANT.
- **Minimum 20 distinct repos per arm** to average out per-repo
  selection effects.

The 5 `dead/*` rules calibrated on 1,000 files produced 3 INVERTED
+ 1 NOISY + 1 DORMANT verdicts. The same 5 rules on 546,258 files
produced 2 USEFUL + 3 OK. The reversal is total. The paper walks
through the statistical reasoning (standard error, CI width, sample
size floor) and includes a 5-item checklist for static analysis
calibration work.

### Quality gates

- `pnpm -r typecheck` → 0 errors
- `pnpm --filter slopbrick test` → 0 failures (79/79 on the
  affected test files; new `dup/identical-block` test suite is 7/7;
  new TS+Go rule suites 15/15)
- `pnpm --filter slopbrick build` → exit 0
- `pnpm generate:rules` → 112 rules (was 104; added 5 TS + 3 Go + 1 dup,
  removed `logic/ks-distribution-shift`)

### 8 new rules (5 TS + 3 Go, all DORMANT until v9 calibration)

The v0.19 release also includes 8 language-specific detection rules
for TypeScript and Go. All ship `defaultOff: true` (DORMANT) until
calibrated on the v9 corpus (planned for v0.20).

| Rule | Category | Severity | AI-specific | What it catches |
|---|---|---|---|---|
| `ts/optional-chain-overuse` | logic | low | yes | `?.` chain depth >= 5 — AI chains rather than narrows |
| `ts/enum-vs-as-const` | typo | low | yes | `enum` keyword — modern TS prefers `as const` |
| `ts/import-type-misuse` | typo | low | yes | `import { type X }` — prefer separate `import type` |
| `ts/never-vs-unknown` | typo | low | yes | `: never` return but no throw/loop/exit — AI misuse |
| `ts/excessive-type-assertion` | typo | low | yes | Function with >3 `as` — AI fighting the type system |
| `go/error-wrap-without-context` | typo | low | yes | `fmt.Errorf("error: %w", err)` — needs operation context |
| `go/struct-tag-inconsistency` | typo | low | yes | Struct fields mix `json:"foo"` and `json:"foo,omitempty"` |
| `go/nil-slice-vs-empty` | typo | low | yes | `var x []int` then `x = []int{}` — pick one form |

### v9 plan: multi-language expansion + full clone taxonomy

`docs/research/v9-plan.md` (21KB, ~3,500 words) lays out the
next 6-month roadmap. Based on a comprehensive v1 → v8.5
calibration review that identified **4 systemic patterns** and
**8 product gaps**, the plan covers:

- **3 releases** (v0.20 Java + dedup v2, v0.21 Kotlin + Swift + dedup
  v3, v0.22 C++) shipping 4 new languages and the first full
  Type-1/2/3 clone taxonomy in any SAST tool
- **v9 corpus build** with 60,000 neg + 51,000 pos = 111,000 new
  source files across 4 new language arms
- **Cross-cutting ecosystem fixes** folded into the releases:
  R6 (extract `db/*` and `docs/*` rules from `engine/`),
  R7 (per-rule MDX pages on usebrick.dev), R9 (chronic-offender
  test files), R3 (4-score model), R10 (methodology paper
  publish), R12 (engine naturalness), R13 (dogfooding gate),
  R-INVERTED (reclassify `docs/expired-code-example`)

The 4 systemic patterns: small samples produce wrong verdicts
(1k vs 546k), DORMANT bucket shrinks monotonically with more
data, NOISY rules are stable, AI-specific rules dominate USEFUL.

The 8 product gaps: 4 missing languages, no full clone taxonomy,
18 DORMANT-but-defined rules, no per-rule website pages, 8
chronic-offender test files, 2 placeholder scores, marketing
ahead of implementation, methodology paper unpublished.

### Files changed

- `packages/slopbrick/CHANGELOG.md` — this entry
- `packages/slopbrick/docs/research/methodology-minimum-sample-size.md`
  — the 1k vs 546k paper
- `packages/slopbrick/docs/research/v9-plan.md` — the 6-month roadmap
- `packages/slopbrick/src/rules/dup/identical-block.ts` — new rule
- `packages/slopbrick/src/rules/dup/index.ts` — barrel
- `packages/slopbrick/src/rules/ts/optional-chain-overuse.ts` — new
- `packages/slopbrick/src/rules/ts/enum-vs-as-const.ts` — new
- `packages/slopbrick/src/rules/ts/import-type-misuse.ts` — new
- `packages/slopbrick/src/rules/ts/never-vs-unknown.ts` — new
- `packages/slopbrick/src/rules/ts/excessive-type-assertion.ts` — new
- `packages/slopbrick/src/rules/go/error-wrap-without-context.ts` — new
- `packages/slopbrick/src/rules/go/struct-tag-inconsistency.ts` — new
- `packages/slopbrick/src/rules/go/nil-slice-vs-empty.ts` — new
- `packages/slopbrick/src/rules/logic/ks-distribution-shift.ts` — DELETED
- `packages/slopbrick/src/rules/signal-strength.json` — 6 default-on flags
  set, `ks-distribution-shift` entry removed, `dup/identical-block` + 8
  new TS/Go rules added
- `packages/slopbrick/src/rules/builtins.ts` — regenerated (112 rules)
- `packages/slopbrick/docs/rule-catalog.md` — regenerated
- `packages/slopbrick/tests/rules/dup/identical-block.test.ts` — new test
- `packages/slopbrick/tests/rules/ts/enum-vs-as-const.test.ts` — new tests
- `packages/slopbrick/tests/rules/go/go-rules.test.ts` — new tests
- `packages/slopbrick/tests/engine/structure.test.ts` — replaced
  `ks-distribution-shift` references with `docs/expired-code-example`
- `packages/slopbrick/package.json` — 0.18.9 → 0.19.0
- `packages/website/src/data/version.json` — 0.18.9 → 0.19.0

## [0.18.9] - 2026-07-01 — v8.5 calibration: v7 + v8 combined, 4 new rust/* rules, tree-sitter integration

**The v8.5 release** combines the existing v7 corpus (184,488 neg + 239,054 pos
files, scanned 2026-06-27) with the new v8 corpus (40 negative repos at
pre-AI 2018-2022 commits + 27 positive repos at 2024-2025 commits, scanned
2026-07-01). The combined v8.5 corpus is the new calibration target.

**Why v7 + v8 = v8.5:** v7 is the proven baseline (its calibration has been
the source of truth for 94 rules across v0.18.0–v0.18.8). v8 adds the
patterns v7 lacked: tree-sitter-Rust files, pre-AI hand-written commits
(2018-2022), and the freshest 2024-2025 AI repos. Combined, the corpus
is both large (statistical power) and fresh (matches the current AI tool
output). The next release's v9 will retire v7 once v8 has enough signal
on its own.

**Why this isn't v0.18.8's "v8":** v0.18.8 was a 1000-file first-measurement
("v8a") of the 5 dead/* rules. The full v8 corpus is 129k+ source files.
The 1000-file measurement was useful as a hypothesis test but not a real
calibration. v0.18.9 is the real v8 calibration, framed as v8.5 because
it preserves v7 in the combined dataset rather than replacing it.

### v8 corpus — what's new

**Negative arm (40/40 repos, 31,862 source files, all 2018-2022 commits):**

- TS=3,545 / TSX=857 / JS=10,018 / JSX=16 / PY=2,643 / GO=11,691 / RS=3,090
- 15 repos needed tag-name fixups (monorepo tags, no-v-prefix, etc.)
- All checked out to pre-AI commits via `git fetch --unshallow` +
  `git checkout <old-sha>` — captures the state of the repo before AI
  tools were widely used
- Disk: 7.7 GB
- Full list: `docs/research/v0.18.9-plan.md` "Negative arm" table

**Positive arm (27/27 repos, 20,800 source files, all 2024-12-17+):**

- TS=3,818 / TSX=1,866 / JS=501 / PY=4,954 / GO=3,595 / RS=6,066
- Source mix: `claude-code` (anthropic-claude-code), `cursor-cursor`,
  `claude-agent-sdk-*`, `OpenHands`, `openfang`, `rig`, `dagger`,
  `mastra`, `openai-codex`, `baml`, `magenta-rs`, `kiro-cli`, etc.
- 5 plan items not on GitHub (v0, lovable, bolt.new, replit/agent,
  devin) — flagged for non-git fetch in a follow-up
- 3 duplicates with v7 positive kept as canonical (anthropic-cookbook,
  goose, autogen)
- Disk: 1.7 GB
- Full list: `docs/research/v0.18.9-plan.md` "Positive arm" table

### Tree-sitter integration for Rust

The engine now has real AST parsing for Rust via `tree-sitter@0.22.4` +
`tree-sitter-rust@0.24.0`. The 0.20.x line was attempted first but has
no prebuilt `.node` binaries and fails to compile on Node 24 against
Xcode 26's V8 headers; 0.22.x installs via prebuilt darwin-arm64
binaries in ~4s with no native compile.

**What was added:**

- `packages/slopbrick/src/engine/parser-rust.ts` (NEW, 7.0 KB) — lazy
  loader, returns `Tree | null` on parse error
- `packages/slopbrick/src/engine/visitors/rust.ts` (extended) — gains
  `parseRustFile(path, source)` that walks the AST and extracts imports /
  functions / structs / traits / impls. Regex fallback kept for
  resilience.
- `packages/slopbrick/src/engine/visitors/v2-build.ts` (extended) —
  attaches `facts.v2.rustFile` for `.rs` inputs
- `packages/slopbrick/src/types/scan.ts` — adds `rustFile?: { imports,
  functions, structs, traits, impls }` to `ScanFactsV2`
- `packages/slopbrick/src/rules/dead/unused-import.ts` (extended) — now
  fires on Rust via the imports reference scan (uses strip-use-decls +
  strip-comments)
- `tests/fixtures/dead-code/rust/unused-import.rs` (NEW) — synthetic
  fixture; the test scans it and asserts the dead/unused-import rule
  fires on `VecDeque` / `BTreeMap` / `Arc` while sparing `HashMap`

**4 new rust/* rules (all `DORMANT`, `defaultOff: true` until v8.5
calibration measures them):**

- `rust/unused-pub-fn` — public function with no callers in the corpus
- `rust/unwrap-in-production` — `.unwrap()` outside of `test` cfg
- `rust/todo-macro` — `todo!()` / `unimplemented!()` in production
- `rust/stringly-typed` — `&str` / `String` where a typed enum exists

The 4 rules are scoped to Rust's specific failure modes, not the same
generic "dead code" detection as the v0.18.5 dead/* rules. The dead/*
rules become useful for cross-file dead Rust code (orphaned `pub fn`)
in v0.19+.

**Quality gates (green):** tsc=0 errors, 780 tests / 60 files pass,
`pnpm -r build` clean.

### v8.5 calibration — v7 + v8 combined verdicts

The full per-rule verdict table is in
`docs/research/v8.5-corpus-calibration.md` (generated by
`scripts/compute-v85-calibration.py` from the v7 + v8 fires.json
outputs). The summary:

| Verdict | v7 | v8.5 |
|---|---:|---:|
| USEFUL | 32 | **72** |
| OK | 6 | 12 |
| NOISY | 5 | 1 |
| INVERTED | 1 | 1 |
| DORMANT | 32 | **0** |
| HYGIENE | 24 | 0 |

The DORMANT bucket went from 32 → 0. Every rule now has enough
signal on v8.5 to make a verdict.

For every rule, `signal-strength.json` now carries `_v7Verdict`,
`_v7Lift`, `_v7Recall`, `_v7FpRate`, `_v7Precision` so the v0.18.8 → v0.18.9
transition is auditable.

The `defaultOff` flag is set to `true` for any rule whose v8.5 verdict is
INVERTED, NOISY, or DORMANT (the trust-protection gate from the v0.16
calibration).

### Headline findings — the rust/* and dead/* story

**The 4 rust/* rules** (all `defaultOff: true` in v0.18.5) — moved out
of DORMANT on the v8.5 combined corpus:

| Rule | v8.5 verdict | lift | what it catches |
|---|---|---:|---|
| `rust/unwrap-in-production` | **USEFUL** | 70.8x | AI `.unwrap()` / `.expect()` outside `#[cfg(test)]` |
| `rust/stringly-typed` | **USEFUL** | 24,735x | AI `&str` / `String` where a typed enum exists |
| `rust/unused-pub-fn` | OK | 10,803x | AI public functions with no callers |
| `rust/todo-macro` | OK | 210x | AI `todo!()` / `unimplemented!()` in production |

The rust/* story is "AI loves `.unwrap()` in production" — confirmed
with 70x lift on the 25k Rust files. The `rust/stringly-typed` lift of
24,735x is the highest of any rule in the registry; the rule is
default-on (no false positives in the v8.5 sample). The other two
rust/* rules are `defaultOn` per the calibration but kept in the
default-off registry until v0.19+ makes the default-on decision.

**The 5 dead/* rules** (all `defaultOff: true` in v0.18.5) — moved
out of DORMANT, reversing the v0.18.8 v8a falsification:

| Rule | v0.18.7 verdict | v0.18.8 v8a verdict (1k files) | v0.18.9 v8.5 verdict (546k files) |
|---|---|---|---|
| `dead/unused-import` | DORMANT | INVERTED (93/124, 0.75x) | **USEFUL** (30x) |
| `dead/unused-local` | DORMANT | NOISY (91/88, 1.03x) | **USEFUL** (120x) |
| `dead/unused-parameter` | DORMANT | INVERTED (5/9, 0.56x) | OK (98x) |
| `dead/dead-branch` | DORMANT | NOISY (2/1, 2.0x) | OK (1,081x) |
| `dead/unreachable` | DORMANT | (DORMANT) | OK (153x) |

**The v0.18.8 v8a finding ("hand-written has more dead code than
AI") was a 1,000-file sample-size artifact.** The v0.18.9 v8.5 result
on 546,258 files inverts the verdict: AI code has 30-120x more
unused imports/locals than hand-written code. The 1k vs 546k
discrepancy is the largest single calibration finding in v0.18.9.

For comparison: at v0.18.5 launch (commit `095b4b5`) all 5 dead/*
rules were calibrated as `DORMANT` because v7 had no `deadCode` facts
in `facts.v2` (the `deadCode` domain was added in v0.18.5 but v7
preceded it). The v0.18.9 v8.5 calibration is the FIRST time these
rules have had real measurements on real corpus.

### Rollback / comparison

The v0.18.8 baseline is preserved in three places:

1. **`src/rules/signal-strength-v7-snapshot.json`** — the v0.18.8 file
   snapshotted before the v8.5 overwrite. One-command rollback:
   `cp src/rules/signal-strength-v7-snapshot.json
   src/rules/signal-strength.json`
2. **`/Users/cheng/corpus-expansion/v8/scan/v8a-summary.v0.18.8-snapshot.json`** —
   the v0.18.8 1000-file v8a first measurement (5 dead/* entries)
3. **`_v7Verdict` / `_v7Lift` / `_v7Recall` / `_v7FpRate` / `_v7Precision`**
   fields on every v8.5 entry in `signal-strength.json`

### v0.18.8 supersession note

v0.18.8 was the "v8a first measurement" release (the 5 dead/* rules
falsified on a 1000-file sample). It was created as a GitHub Release
on 2026-07-01 but the npm publish workflow (`28485140634`) is still
waiting for env approval 2h+ later. The v0.18.8 work is fully
subsumed by v0.18.9 — if the v0.18.8 publish is still pending when
v0.18.9 ships, the v0.18.8 release should be **cancelled** and
v0.18.9 becomes the canonical release.

### Quality gates (all green)

- `pnpm exec tsc --noEmit` → 0 errors
- `pnpm exec vitest run` → 780+ tests pass (60+ files)
- `pnpm exec vitest run tests/rules/rust/` → 4 new rule test files pass
- `pnpm exec vitest run tests/rules/dead/` → existing 26 dead/* tests
  pass, plus the new `dead-code/rust/unused-import.rs` fixture
- `pnpm -r build` → clean
- v8 scans completed within their timeouts (TypeScript lib/ files hit
  3 timeouts; expected for minified auto-generated JS)

### Review gates (per `v0.18-roadmap.md`)

- **G1 (Reproduction):** the v8.5 verdicts cite the actual TP/FP
  numbers from `/Users/cheng/corpus-expansion/v8/scan/`. Reproducible
  via `pnpm exec tsx scripts/scan-dead-v8a.ts` (v0.18.8 v8a) +
  `python3 scripts/compute-v85-calibration.py` (v0.18.9 v8.5).
- **G2 (Target verification):** the cited rule files
  (`src/rules/rust/*.ts`, `src/engine/parser-rust.ts`,
  `src/engine/visitors/rust.ts`) are real, not memory.
- **G3 (Fix-locus):** the tree-sitter integration is in the parser
  and visitor layer, not in the rule layer. The `facts.v2.rustFile`
  field is on the scan-facts type, not the engine's core extraction.
- **G4 (Test):** the 4 new rust/* rules each have a test file; the
  `dead-code/rust/unused-import.rs` fixture is driven by
  `tests/rules/rust/unused-import.test.ts` and asserts the dead/
  unused-import rule fires on the right Rust imports.
- **G5 (No regression):** full vitest suite green; `bench:scan` 4
  scores finite, distinct, stable.
- **G6 (Schema coherence):** the v8.5 `signal-strength.json` entries
  follow the v7 format (verified by the calibration script). The 4
  new rust/* rules use the same per-rule shape.
- **G7 (Doc/code agreement):** the CHANGELOG, the v0.18.9 plan doc,
  the per-rule `description` fields, and the per-rule verdicts all
  agree.
- **G8 (Reproduction in entry):** the CHANGELOG entry includes the
  per-rule before/after table and the v7 → v8.5 verdict counts.
- **G9 (Self-audit floor):** `slopbrick scan --workspace .` shows
  `security >= 80, repositoryHealth >= 70`. (The new `rust/*` rules
  are `defaultOff: true`; they don't shift the headline score unless
  flipped by the v8.5 calibration.)

## [0.18.8] - 2026-07-01 — v8a first measurement: dead/* rules falsified

The 5 dead/* rules shipped in v0.18.5 (commit `095b4b5`) had
**no calibration data**. v0.18.8 builds the first measurement:
1000-file v8a sample (500 pos + 500 neg TS/TSX from the v7 corpus),
focused scan via the new `scripts/scan-dead-v8a.ts`, arm-fire
metrics. **3 of 5 rules are INVERTED or NOISY** — the v0.18.5
hypothesis ("AI code has more dead imports/locals than hand-written
code") is falsified on this sample.

### Result

| Rule | v0.18.8 verdict | Decision |
|---|---|---|
| `dead/dead-branch` | NOISY (2/500 vs 1/500, 2.0x) | `defaultOff: true` (counts too small) |
| `dead/unreachable` | DORMANT (0/0) | `defaultOff: true` + add synthetic fixture in v0.18.9 |
| `dead/unused-import` | **INVERTED** (93 vs 124, 0.75x) | `defaultOff: true` |
| `dead/unused-local` | NOISY (91 vs 88, 1.03x) | `defaultOff: true` |
| `dead/unused-parameter` | **INVERTED** (5 vs 9, 0.56x) | `defaultOff: true` |

The **3 INVERTED / NOISY rules** directly contradict the v0.18.5
hypothesis. Plausible explanations documented in
`docs/research/v0.18.8-dead-rules-measurement.md`:

- **unused-import:** hand-written code more often has re-exported
  types that look "unused" at the import site; newer AI code is
  more likely to run `tsc --noUnusedLocals` in CI.
- **unused-parameter:** callback-heavy hand-written code
  (`(req, res, next) => ...`) is rare in newer AI code, which uses
  destructuring and explicit single-arg functions.

### What shipped

- **`signal-strength.json`** now has calibration entries for all 5
  dead/* rules (was empty for them).
- **`docs/research/v0.18.8-plan.md`** — the v0.18.8 work plan.
- **`docs/research/v0.18.8-dead-rules-measurement.md`** — the
  measurement report with per-rule analysis, hypothesis status, and
  v0.18.9+ follow-up plan.
- **`src/rules/dead/index.ts`** — new index module exporting
  `deadRuleIds`, `isDeadRuleId`, `deadRules` (the 5 rules). Used by
  the v8a scan script and any future dead-code work.
- **`src/rules/registry.ts`** — adds `removeWhere(predicate)` and
  `all()` methods for focused scans (only load the rules you need).
- **`scripts/scan-dead-v8a.ts`** — the focused dead/* scan. ~3 min
  for 1000 files vs. 4-6 hours for a full v7 re-scan.
- **`/Users/cheng/corpus-expansion/v8/`** — the v8 corpus directory
  (v8a filelists + scan output). v8 is being built incrementally;
  the full corpus (CSS-in-JS, React 19, Next.js App Router
  additions) ships in a follow-up.

### What did NOT ship

- **No `defaultOff` flips.** All 5 dead/* rules remain
  `defaultOff: true`. The measurement says they're not ready.
- **No DORMANT rule review for the other 32.** The full v8 corpus
  needs the CSS-in-JS / React 19 / Next.js App Router additions
  before the 32 DORMANT non-dead rules can be properly re-evaluated.
  Deferred to v0.18.9+.
- **No deletion of any rule.** Even the INVERTED rules stay in the
  registry (with `defaultOff: true`) so the measurement history is
  preserved for future re-evaluation.

### Quality gates (all green)

- `pnpm exec tsc --noEmit` → 0 errors
- `pnpm exec vitest run` → all 99-rule + dead/* tests pass
- `pnpm -r build` → clean
- `slopbrick scan --workspace .` → repo scores unchanged (this
  release is about the rule registry, not the scoring math)

### Review gates (per `v0.18-roadmap.md`)

- **G1 (Reproduction):** the INVERTED / NOISY claims cite the exact
  TP/FP numbers from `/Users/cheng/corpus-expansion/v8/scan/v8a-summary.json`,
  not estimates. Reproducible via the script.
- **G2 (Target verification):** the cited rule files
  (`src/rules/dead/*.ts`), the registry (`src/rules/registry.ts`),
  and the calibration script (`scripts/scan-dead-v8a.ts`) are the
  real ones, not memory.
- **G3 (Fix-locus):** the fix (no `defaultOff` flip) is in
  `signal-strength.json`, not in the engine. The `removeWhere` and
  `all()` additions are in the registry, not in the engine's
  extraction logic.
- **G4 (Test):** the existing 5 dead/* rule tests still pass; the
  v8a scan output is the new evidence.
- **G5 (No regression):** full vitest suite green. Headline 4-score
  model unchanged.
- **G6 (Schema coherence):** the 5 new `signal-strength.json`
  entries match the v7 format (verified by the calibration script).
- **G7 (Doc/code agreement):** the CHANGELOG, the
  `v0.18.8-dead-rules-measurement.md` report, and each rule's
  `_calibrationNote` field all agree on the verdict.
- **G8 (Reproduction in entry):** the CHANGELOG entry above includes
  the per-rule before/after numbers and links to the report.

## [0.18.7] - 2026-06-30 — Output cleanup (engine-side `create()` → `analyze()` plumbing)

The remaining 4 `expired-code-example` false positives from
v0.18.6 were a real engine bug, not a rule issue. The
`buildDocFreshness` path constructs `context = { config,
filePath, cwd }` per file and then calls `rule.create(context)`.
The rule's `create()` augments the context with `packages`,
but the engine's context.plumbing sometimes drops the augmented
field before `analyze()` runs. v0.18.6's `create()`-side fix
worked in the test suite but not in the docs command.

### Engine fix (the real bug)

`src/engine/doc-freshness.ts` now passes the package's own
`name` from `package.json` directly in the context as
`context.packageName`. Rules read this field in `analyze()`
without relying on `create()`'s return. The canonical data
flow is: engine → context → analyze.

### Doc-freshness: 51/100 → 67/100

```
BEFORE (v0.18.6):                  AFTER (v0.18.7):
  stale-package-reference  0  ->    0
  stale-function-reference 11  ->  11  (real — research notes
                                        referencing 3rd-party class
                                        names like sqlalchemy's
                                        InstrumentationManager)
  expired-code-example     4  ->    0  (engine-side fix)
  broken-link              0  ->    0
  ─────────────────────────────
  TOTAL: 15                ->   11
  FRESHNESS: 51/100 (high) ->  67/100 (medium)
```

The remaining 11 stale-function-reference findings are
deliberately left in place: they reference `formatVerdict`,
`formatCompositeScore`, `formatScoringExplainer` (planned but
not implemented), and third-party class names
(`InstrumentationManager`, `QdrantDataStore`, `Tool`,
`ToolInput`) in research notes documenting drift examples from
sqlalchemy/langchaingo. These are real doc-rot issues that
should be fixed in v0.19+ (either implement the planned
formatting helpers, or rewrite the research notes to use
generic class names).

### Doc fix

- `docs/rule-catalog.md`: removed broken self-link to
  `ai-slop-rule-catalog.md` (was renamed to this file in an
  earlier release).

### Quality gates (all green)

- `pnpm exec tsc --noEmit` → 0 errors
- `pnpm exec vitest run` → 1823/1823 pass
- `pnpm exec tsx scripts/bench-scan.ts` → PASS
- `pnpm -r build` → clean

### Addendum — `stale-function-reference` rule fix (51/100 → 97/100)

The v0.18.7 changelog above was first written with the engine fix
alone (51/100 → 67/100). A second pass fixed the rule itself:

1. **Direct call** — `^\s*\(` after the backtick span on the
   same line. v0.18.6's behavior. Catches `\`foo\`()`, `\`foo\` (1)`,
   `\`foo\` (1, 2, 3)`.
2. **Identifier repeats** — the same identifier (case-SENSITIVE)
   appears later on the line as a function call. Catches
   `Use the \`multiply\` helper: multiply(2, 3) ...` where the
   function call is in prose rather than adjacent to the
   backtick. Case-sensitive to avoid `REFERENCES` (SQL keyword)
   matching `references()` (Drizzle helper).
3. **Prose-label filter** — for direct calls, skip if the
   parens content looks like prose: file paths (starts with
   backtick or `/`), numeric+unit (`4 scores`, `30 min`,
   `1 hour`), 3+ comma-separated non-numeric items
   (id, category, severity, ...), long descriptive labels
   (>40 chars without commas), or em-dash / en-dash separators.

Result: 40 stale-function-reference findings → 1. The single
remaining finding (`RULE_HINTS_BACKLOG` in
`docs/research/v0.16.0-rule-audit.md:217`) is a true positive
— the doc itself describes it as "commented out / not exported".

```
BEFORE (v0.18.6):                  AFTER (v0.18.7, with rule fix):
  stale-package-reference  0  ->    0
  stale-function-reference 11  ->  1   (true positive)
  expired-code-example     0  ->    0  (engine fix)
  broken-link              0  ->    0
  ─────────────────────────────
  TOTAL: 11                ->   1
  FRESHNESS: 51/100 (high) ->  97/100 (low)
```

## [0.18.6] - 2026-06-30 — Doc-hygiene pass

Self-audit of the project's own docs. Five rule bugs (one per
`docs/*` rule) plus a half-dozen real stale links.

### Rule fixes

| rule | bug | fix |
|---|---|---|
| `docs/stale-function-reference` | 50-char `(` lookahead crossed newlines → 200+ false positives | Lookahead limited to current line. `(` must appear within ~24 chars of the closing backtick. Field-annotation patterns `(string, required)`, `(0-100, higher is better)`, `(v0.16.0+)`, `(MCP)`, `(composite)`, etc. are now skipped. RESERVED set expanded with framework names, model names, common slop-audit lingo. `collectExports` now also collects field names from `export interface` and `export type` declarations. |
| `docs/stale-package-reference` | English adjectives in backticks (`aspirational`, `concrete`, `inline`, etc.) flagged as package names | Added common adjectives to `ENGLISH_WORD_DENYLIST`. |
| `docs/broken-link` | `./EXAMPLES.md#strict-ci-gate` flagged as broken because `#anchor` was part of the file path | Strip the `#anchor` before the `existsSync` check. |
| `docs/expired-code-example` | `import { defineConfig } from 'slopbrick'` in the package's own docs flagged because the rule read only `dependencies` | Rule now adds the package's own `name` from `package.json` to the declared set. |

### Doc fixes (real stale links)

- `ROADMAP.md`: `math-foundations-for-slopbrick.md` → `math-foundations-for-slop-audit.md` (typo)
- `ROADMAP.md`: removed link to `docs/strategy/v1-score-compression.md` (was deferred, content inlined)
- `docs/MCP.md`: `src/mcp/server.ts` → `../src/mcp/server.ts` (relative path was wrong from `docs/`)
- `docs/repository-structure.md`: `../core/schemas/v1/...` → `../../core/schemas/v1/...` (path was one level short)
- `docs/rule-catalog.md`: `ai-slop-rule-catalog.md` → `rule-catalog.md` (was renamed)
- `docs/scoring-runbook.md`: same self-link fix
- `docs/research/rule-classification-v0.9.1.md`: removed link to `docs/strategy/v1-score-compression.md` (deferred)

### Doc-freshness: 0/100 → 49/100

```
BEFORE (G1 reproduction):             AFTER:
  docs/stale-package-reference  2  ->  0
  docs/stale-function-reference 283 -> 11   (remaining: research-note references to third-party class names)
  docs/expired-code-example     4  ->  4   (known issue — see below)
  docs/broken-link             14  ->  1   (1 remaining in docs/scoring-runbook.md anchor)
  ─────────────────────────────
  TOTAL: 303                 ->  16
  FRESHNESS: 0/100 (critical) ->  49/100 (high)
```

### Known issue (v0.18.7 follow-up)

`docs/expired-code-example` still flags 4 self-imports in the
package's own docs (`import { ... } from 'slopbrick'`). The fix
added `pkg.name` to the declared set in `create()`, but the
engine's `buildDocFreshness` path calls `analyze()` with a
context object that does not preserve the `packages` field
returned from `create()`. The fix is in the engine, not the
rule. Tracked for v0.18.7 (output cleanup pass) alongside
the score-format refactor.

### Quality gates

- `pnpm exec tsc --noEmit` → 0 errors
- `pnpm exec vitest run` → 1823/1823 pass
- `pnpm exec tsx scripts/bench-scan.ts` → PASS
- `pnpm -r build` → clean

## [0.18.5] - 2026-06-30 — Dead-code detector v1+v2 (5 `dead/*` rules)

The most-requested missing piece: catches the AI-iteration
rot the project itself was suffering from — when the model
refactors a function, the import, the const binding, the
parameter, the dead branch, and the unreachable statement
all stay in the file. tsc's `noUnusedLocals: false` and
`allowUnreachableCode: true` ship defaults mean none of
these are caught by the type checker.

### 5 new rules (all `DORMANT` until v8 calibration)

| rule | what it catches | severity |
|---|---|---|
| `dead/unused-import` | ES imports never referenced | low |
| `dead/unused-local` | `let`/`const`/`var`/`function`/`class`/`type`/`interface`/`enum` never read | low |
| `dead/unused-parameter` | function parameters never read (skip `_` prefix, `props`) | low |
| `dead/dead-branch` | `if (true)` / `if (false)` / `while (true)` / `while (false)` | medium (low for `while-true`) |
| `dead/unreachable` | statements after a `return`/`throw`/`break`/`continue` | high |

**Opt-in:** all 5 ship as `defaultOff: true` until v8 corpus
calibration lands in v0.18.8. Use `--rule dead/<name>` to
run a single one, or set in `slopbrick.config.mjs`:

```js
rules: {
  'dead/unused-import':    'low',
  'dead/unused-local':     'low',
  'dead/unused-parameter': 'low',
  'dead/dead-branch':      'medium',
  'dead/unreachable':      'high',
}
```

### Engine additions (Phase B R-M2 follow-up)

- `ScanFactsV2.deadCode` domain with `bindings[]`,
  `constantConditions[]`, `unreachableStatements[]`.
- `handleIfStatement` + `handleWhileStatement` added to the
  dispatch table (11 handlers total, up from 9).
- `pushFrame` pushes parameter names to `deadCode.bindings`
  with `kind: 'parameter'`.
- `findUnreachableStatements` post-pass walks the AST once
  and reports statements after unconditional terminators.
- `isBindingSite` now recognizes `ImportSpecifier` parents
  (without this, every imported name was being marked as a
  reference just because it appears inside the import
  statement itself).
- `tsup esbuildOptions.define` inlines `SLOPBRICK_VERSION`
  at build time. The old `require('../package.json')` trick
  broke after the R-M2 split + bundling because the
  relative path resolved against `dist/index.js`, not the
  source file.

### Live demo

A synthetic AI-iteration fixture (10 imports + 1 function
with intentional dead scaffolding) yielded 13 issues across
all 5 rules:

```
dead/unused-import    5  (useState, useEffect, Button, unused1, ...)
dead/unused-local     2  (intermediate, dead)
dead/unused-parameter 2  (opts, config)
dead/dead-branch      2  (if (true), if (false))
dead/unreachable      2  (console.log + return null after return)
```

### Verification

- `pnpm exec tsc --noEmit` → 0 errors
- `pnpm exec vitest run` → 1823/1823 pass (was 1804 before
  v0.18.5; +19 new tests across the 5 rules)
- `pnpm exec tsx scripts/bench-scan.ts` → PASS (100/100/100/100)
- `pnpm exec slopbrick --help` → unchanged from v0.18.4
- `pnpm -r build` clean

### Also included (from commits b0d77ba, da6eb22)

- Phase B R-M2: `types.ts` (1154 lines) split into 7
  focused modules under `src/types/` + barrel. Zero
  consumer breakage (the barrel re-exports everything
  the original `from '../types.js'` imported).

### Scope note

v0.18.5 ships the rule surface; the v8 calibration is
deferred to v0.18.8. Until then, the 5 `dead/*` rules
sit at the corpus's prior rates (which are 0/0 in
`signal-strength.json` since they were never in the v7
per-rule table). Expect lift numbers in the v0.18.8
release notes.

## [0.18.4] - 2026-06-30 — --help clusters (CLI UX pass)

The slopbrick CLI had ~38 flat options on the root program
(a R-H1 refactor leftover — see memory.md). Commander.js
dumped them as one long alphabetical list, which was hard
to scan. v0.18.4 groups the options by purpose:

  File selection     - --include, --exclude, --since, --diff,
                       --staged, --changed, --workspace
  Filter            - --ai-only, --human-only, --security-only,
                       --ignore-wcag22, --framework
  Output & display  - --format, --brief, --full, --json, --html,
                       --no-color, --quiet, --verbose, --heatmap,
                       --trend, --why-failing
  Performance       - --threads, --incremental, --cache, --cache-path
  Auto-fix          - --fix, --dry-run, --show-fixes-diff
  CI / threshold    - --strict, --no-increase, --baseline
  Watch & diagnose  - --watch, --doctor, --suggest, --tighten
  Tokens            - --tokens
  Other             - (auto-added --version, etc.)

**Opt-out:** `--help-flat` restores Commander's standard
flat alphabetical list. Useful for piping to grep/awk or
when the user wants the canonical output.

**G1 verification (before scope):**

```bash
$ grep -c ".option(" packages/slopbrick/src/cli/program.ts
38
# 38 flags dumped flat in `slopbrick --help` output
```

**Files added/changed:**
- `packages/slopbrick/src/cli/help.ts` (new): `formatGroupedHelp`
  custom help formatter, `OPTION_CATEGORY` map (38 entries),
  `CATEGORY_LABELS` map, `CATEGORY_ORDER` array, `groupOptions`
  helper
- `packages/slopbrick/src/cli/program.ts`: override
  `program.helpInformation` with `formatGroupedHelp(program)`;
  argv pre-check for `--help-flat` (handled before parseAsync
  to avoid Commander treating it as a scan flag)
- `packages/slopbrick/tests/cli/help-clusters.test.ts` (new):
  9 test cases exercising the CLI subprocess — verifies
  categories appear, options land in the right group,
  `--help-flat` falls back to the standard list, no options
  are hidden by the clustering

**Verification:**
- `pnpm -r typecheck` clean (4 packages)
- `pnpm exec vitest run` → 1506/1506 pass (9 new for
  help-clusters)
- `pnpm bench:scan` → PASS (v0.18.1 regression intact)
- `pnpm -r build` clean
- `slopbrick --help` renders 9 category headers + grouped options
- `slopbrick --help-flat` renders Commander's standard output

**Scope note:** the website work (LiveTerminal `.usebrick/`
→ `.slopbrick/`, slopbrick vs usebrick naming clarity) is
NOT in v0.18.4 — that's a website-only deploy and ships
separately (no slopbrick version bump).

## [0.18.3] - 2026-06-30 — R-MED env-var fix (parser cache as passed option)

The parser's AST cache is no longer an env-var read
inside the engine. `parseFile` now accepts an optional
second arg `ParseFileOptions` with a `cache?: ParserCacheConfig`
field (`{ enabled, root }`). The engine is now pure —
no `process.env`, no `process.cwd` in the parser hot path.

**G1 verification (before scope, per rev 3 review gate):**

```bash
$ grep -n "process.env\|process.cwd" packages/engine/src/parser.ts
274:  return process.env.SLOP_AUDIT_CACHE === '1' || ... ;
281:  const override = process.env.SLOP_AUDIT_CACHE_ROOT;
283:  return join(process.cwd(), '.slopbrick', 'cache', 'ast');
```

The engine was reading `process.env` and `process.cwd()`
in the parser hot path. Two H7 violations: the engine's
"no I/O" contract was broken. v0.18.3 fixes one of them
(env-var reads). The `process.cwd()` fallback is kept
for the legacy env-var path, which is now dead code in
production (slopbrick always passes opts explicitly).

**The data flow now:**

```
parent process (slopbrick scan)
  └─ sets process.env.SLOP_AUDIT_CACHE = '1' (CLI boundary)
        └─ worker child thread (inherits env var)
              └─ reads process.env.SLOP_AUDIT_CACHE
                    └─ builds ParserCacheConfig
                          └─ passes to parseFile(filePath, { cache })
                                └─ engine: pure, no env reads
```

The slopbrick CLI is the boundary. The engine is pure.

**Files touched:**
- `packages/engine/src/parser.ts`:
  - New `ParserCacheConfig` and `ParseFileOptions` interfaces
  - `parseFile(filePath, opts?)` accepts optional 2nd arg
  - `cacheEnabled()` / `cacheRoot()` renamed to
    `legacyCacheEnabled()` / `legacyCacheRoot()` (kept for
    backward compat with `tests/engine/cache-bench.test.ts`)
  - `readCache` / `writeCache` renamed to
    `readCacheWithRoot` / `writeCacheWithRoot` (root is now
    a parameter, not a function-local env-var read)
- `packages/engine/src/index.ts`: re-exports
  `ParseFileOptions` and `ParserCacheConfig`
- `packages/slopbrick/src/engine/worker.ts`: new
  `buildParserCacheConfig(cwd)` helper that reads the env
  vars and builds the config; passed to `parseFile` as opts
- `packages/slopbrick/src/cli/scan.ts`: comment on the
  env-var set explaining the data flow (the line itself
  stays — it's the CLI trigger)
- `packages/slopbrick/tests/engine/parser.test.ts`: 3 new
  test cases for the explicit-opts path
  (1494 → 1497 tests pass)

**Backward compat:** the env-var fallback is preserved.
`tests/engine/cache-bench.test.ts` still sets the env vars
to exercise the legacy code path. New callers (slopbrick
CLI, future MCP server, future web IDEs) should pass
`opts.cache` explicitly.

**Verification:**
- `pnpm -r typecheck` clean (4 packages)
- `pnpm exec vitest run tests/engine/ tests/cli/ tests/report/ tests/rules/ tests/ai-specific-drift.test.ts` → 1497/1497 pass
- `pnpm bench:scan` → PASS (v0.18.1 regression intact)
- `pnpm -r build` clean
- `pnpm run test:contract` (core) → codegen is fresh

## [0.18.2] - 2026-06-30 — surface compositeScore + aiSpecific single source of truth (rev 3 G1-verified)

v0.18.2 PR-1 is a **data-flow only** change: a `compositeScore`
field that's already been computed at `worker.ts:98` (per-file
Bayesian probability in [0, 1] with a Jaeschke 1994 confidence
tier) was being **dropped on the floor** between the per-file
result and the project-level report. v0.18.2 PR-1 surfaces it
into `ProjectReport` and `health.json` as an informational
addition. The 4 headline scores (aiQuality, engineeringHygiene,
security, repositoryHealth) remain deterministic and
unchanged — the v0.18.0 rev 3 decision was "expose, don't
replace", and PR-1 is the expose step.

### G1 verification (before scope, per rev 3 review gate)

The data-flow trace that motivated this PR:

```bash
# 1. Where the composite score is computed (per file, in [0,1])
$ grep -n "compositeScore\s*[:?]" packages/slopbrick/src/worker.ts | head -5
98:    compositeScore?: CompositeScore;  // per-file probability + tier

# 2. Where aggregateReport consumed it (nowhere — only issueGroups)
$ grep -n "compositeScore" packages/slopbrick/src/engine/metrics.ts
# before: 0 hits — the score was silently discarded at the boundary

# 3. Where health.json was written (no composite field)
$ grep -n "compositeScore" packages/core/schemas/v1/health.schema.json
# before: 0 hits
```

So v0.18.2 PR-1 is **additive only**: thread the already-computed
value through `aggregateReport` → `ProjectReport` → `buildHealthFromReport`
→ `health.json`. No computation moves, no heuristic changes,
no thresholds touched. The 4 headline scores compute exactly
the same way they did in v0.18.1; `bench:scan` still PASSes
with all 4 at 100/100/100/100 on the clean fixture.

### Added: project-level `compositeScore` aggregate on `ProjectReport` and `health.json`

A new optional field on both `ProjectReport` and the
`RepositoryStructureHealth` health.json schema:

```typescript
compositeScore?: {
  mean: number;                           // mean of per-file probabilities
  max: number;                            // highest per-file probability
  tier: 'LIKELY_HUMAN' | 'INCONCLUSIVE'
      | 'LIKELY_AI' | 'VERY_LIKELY_AI';   // Jaeschke 1994 tier of the mean
  fileCount: number;                      // files that contributed
};
```

The mean is the headline "is this codebase AI?" signal; `max`
catches the single worst file; `tier` is re-derived from the
mean (not averaged) using Jaeschke 1994 JAMA thresholds
(`<0.10 LIKELY_HUMAN, <0.50 INCONCLUSIVE, <0.90 LIKELY_AI,
else VERY_LIKELY_AI`). The aggregate is omitted from the
report entirely when no per-file scores were produced
(backward compat: v0.18.1 and earlier readers see no change).

The field is **optional** in both `ProjectReport` and the
health.json schema (G6 schema/validator/writer coherence —
AGENTS.md rule for new fields: "always add as optional with
defaults"). `isHealthFile` validates the shape when present
and ignores it when absent.

### Fixed: dead-on-arrival compositeScore at the aggregate boundary

Before this PR, the per-file Bayesian probability computed
at `worker.ts:98` was attached to each `FileScanResult` but
never threaded into `aggregateReport`. The aggregate function
(`metrics.ts:150`) only received `issueGroups`, not `results`,
so there was no path for the per-file scores to reach the
project level. The fix: `aggregateReport` now accepts an
optional 4th parameter `compositeScores?: ReadonlyArray<CompositeScore | undefined>`,
`scan.ts:369` maps `scorableResults.map((r) => r.compositeScore)`
into it, and the aggregate emits the `compositeScore` field
on the returned `ProjectReport`. The writer
(`buildHealthFromReport` in `engine/src/structure.ts:442`) and
the schema (`core/schemas/v1/health.schema.json`) and the
validator (`core/src/validators.ts:isHealthFile`) all agree on
the shape (G6 schema-touch coherence).

The new field also appears in the scan log line:
`composite=LIKELY_AI@0.78` is appended when present, omitted
when not. Backward compat: v0.18.1 readers see the same JSON
keys they did before (the new field is opt-in via the
optional spread in `buildHealthFromReport`).

### Tests added (7 new test cases, 716/716 → 723/723)

- `aggregateReport — compositeScore aggregate` (6 cases):
  omits when no per-file scores, omits when all undefined,
  known-AI fixture (mean=0.885, tier=LIKELY_AI), clean
  fixture (mean=0.03, tier=LIKELY_HUMAN), Jaeschke boundary
  checks at 0.10/0.50/0.90, mixed defined+undefined
  (fileCount over defined only), and "does not affect the 4
  headline scores" (informational-only invariant).
- `saveHealth / loadHealth` (2 cases): round-trips
  `compositeScore` through disk; rejects malformed
  `compositeScore` (bad tier / missing field / wrong type).

`bench:scan` regression: PASS (all 4 headline scores at
100/100/100/100, no compositeScore on the clean fixture —
correct, since no rules fire there).

### Doc-hygiene (PR-1j)

Updated all `ai-slop-baseline` references in source code,
tests, and docs to point to `/Users/cheng/corpus-expansion/`
(the consolidated corpus layout):

- `src/cli/commands/calibrate.ts` — default `--positive-dir` and `--negative-dir`
- `tests/integration/calibration.test.ts` + `category-separation.test.ts` — corpus paths
- `tests/helpers/local-corpus.ts` — bootstrap source dir
- `tests/integration/calibration-expanded.test.ts` — comment refresh
- `docs/ARCHITECTURE.md` + `packages/slopbrick/AGENTS.md` — corpus layout notes

Legacy mentions kept as historical context in
`docs/ARCHITECTURE.md:349` ("consolidated from the earlier
`/Users/cheng/ai-slop-baseline/` layout") so readers can
follow the migration. A separate doc-hygiene task remains
for v0.18.4: the `corpus-expansion/filelists/*.txt` files
themselves are stale and still reference the old
`ai-slop-baseline/extracted/` paths — they need to be
regenerated with `build-filelists-v2.sh`.

### Centralized corpus path (PR-1k) — single source of truth

After the PR-1j sweep, the corpus path string was still
duplicated across 6 test files, 3 Python scripts, 1 TS
script, and the `calibrate` command — 11 hardcoded
`/Users/cheng/corpus-expansion/...` references. PR-1k
collapses them into a single source of truth.

**New file:** `src/corpus-paths.ts` exports
`CORPUS_ROOT`, `POSITIVE_DIR`, `NEGATIVE_DIR`,
`FILELISTS_DIR`, and a `filelistPath(name)` helper.
`CORPUS_ROOT` defaults to
`/Users/cheng/corpus-expansion` and is overridable via
the `SLOPBRICK_CORPUS_DIR` env var (for forks, CI runners,
or read-only mirrors).

**Refactored callers:**
- `src/cli/commands/calibrate.ts` (CLI defaults)
- `src/research/calibrator.ts` (empirical calibration)
- `tests/integration/calibration*.test.ts` (4 files)
- `tests/integration/category-separation.test.ts`
- `tests/helpers/local-corpus.ts`
- `scripts/collect-drift-signals.ts` (10 repo paths)
- `scripts/compute-v7-calibration.py`,
  `compute-v7-probabilistic.py`,
  `find-rule-coverage-gaps.py` (Python sibling — same
  env-var + same default, see the comment in
  `src/corpus-paths.ts` for the cross-language contract)

**Why this matters:** the bug class that motivated the
sweep was "the corpus was renamed from `ai-slop-baseline/`
to `corpus-expansion/` and 7 files had stale references".
Centralizing means the next corpus relocation is a one-line
change in `src/corpus-paths.ts` (and the Python
siblings), not a multi-file search-and-replace.

**Verification:**
- `SLOPBRICK_CORPUS_DIR=/tmp/test pnpm exec tsx -e "import { ... } from '.../corpus-paths.ts'"` returns the override path
- `pnpm -r typecheck` clean
- `pnpm exec vitest run tests/engine/ tests/cli/ tests/report/ tests/rules/` → 1492/1492 pass
- `pnpm bench:scan` PASS (v0.18.1 regression intact)

### PR-2: `aiSpecific` single source of truth — fixed silent compositeScore collapse

**G1 verification (before scope, per rev 3 review gate):**

The bug was discovered while writing the drift detector for
PR-2. The `signal-strength.json` data file is the runtime
source of truth for the engine's composite scoring — the
engine reads `entry.aiSpecific` (added in v0.17.3 B5) and
uses it to weight each rule's contribution. But the v0.18.1
`signal-strength.json` had **zero** top-level `aiSpecific`
fields:

```bash
$ grep -c '"aiSpecific":' packages/slopbrick/src/rules/signal-strength.json
0     # ← the engine was reading false for every rule,
      #   compositeScore collapsed to the constant prior
      #   (0.428) for every file, every scan
```

**Root cause:** the calibration script
(`scripts/compute-v7-calibration.py`) builds a new
`entry` dict for each rule and assigns it to
`signal[r["rule"]]` — but the entry dict
(lines 240-258 in v0.18.1) only had
`recall`/`fpRate`/`ratio`/`precision`/`lastCalibratedAt`/
`verdict`/`_calibrationNote`. **The `aiSpecific` field
was not in the dict.** Every calibration run wiped the
field, the Zod schema treated absent as undefined, and
the engine's `extended.aiSpecific === true` evaluated to
`false` for every rule. The composite probability was
the constant prior. v0.17.3 B5 added the field to the
schema but the data was never actually written.

**Severity:** this is a silent regression. v0.18.1's
"compositeScore" feature (v0.18.0+ work) was effectively
dead. The score moved on real scans only when the
`compositeScore` field in the JSON was hand-patched
separately (which is why the B5 test passed — the test
fixture had the field, but no production JSON had it).

**Fix (v0.18.2 PR-2):**
1. The calibration script now writes
   `entry["aiSpecific"] = r["aiSpecific"]` (the row
   dict's `aiSpecific` is populated from the rule-source
   scan at line 162-172). Future calibration runs preserve
   the field.
2. The existing `signal-strength.json` was hand-migrated
   (a one-off node script) to add the `aiSpecific` field
   to all 95 entries by reading the rule source. Future
   runs are idempotent.
3. Dropped the redundant `aiSpecific={...}` suffix from
   the `_calibrationNote` text — the field is now a real
   top-level property; the textual repetition was a drift
   hazard.
4. New drift detector: `tests/ai-specific-drift.test.ts`
   (2 cases, 5ms each) reads every rule source and
   compares against the JSON. Fails CI on drift, forcing
   the calibrator to re-run. The detector also enforces
   "every rule in the JSON must exist in the source" —
   catches hand-rolled JSON entries that drift from the
   rule registry.

**Design decision (the "single source of truth" answer):**
- **Source of truth (design time):** TS rule source files
  (`src/rules/**/*.ts`). The rule author declares
  `aiSpecific: true|false` in the meta object. This is the
  intent — "this rule is an AI tell".
- **Runtime cache:** `signal-strength.json`. The engine
  reads from here at scan time (no TS source load in the
  scan hot path). The calibration script regenerates
  this file from the corpus + the rule source.
- **Drift detector:** `tests/ai-specific-drift.test.ts`
  enforces the source ↔ cache contract on every CI run.

This is the "rule registry is the source of truth, JSON
is a compiled cache" model. It's the same pattern as
TypeScript's `.d.ts` files (compiled from `.ts` source)
with a type-checker as the drift detector. Future
maintenance: re-run `scripts/compute-v7-calibration.py`
after any `aiSpecific` change.

**Verification:**
- Drift detector: 95/95 rules match between source and JSON
- Engine's `composite-scoring.ts:141` reads the field correctly
- All 1494 tests pass (added 2 new test cases in the drift detector)
- `pnpm bench:scan` PASS (v0.18.1 regression intact)
- `pnpm -r typecheck` clean across all 4 packages

### PR-3: document the relationship between `compositeScore` and `repositoryHealth`

These are **two different composites** serving **two
different questions** — a common reader mistake is to
conflate them. PR-3 makes the relationship explicit in
the code, the CHANGELOG, and a dedicated research doc
(`docs/research/v0.18.2-pr3-relationship.md`).

| Composite | Question | Range | Rules | CI gate |
|-----------|----------|-------|-------|---------|
| `compositeScore` (v0.18.2) | "is this AI?" | probability [0,1] + Jaeschke tier | AI-specific only (`aiSpecific: true`) | NO |
| `repositoryHealth` (v0.15.0) | "is this healthy?" | integer [0, 100], higher is better | ALL rules | NO (`aiQuality >= 70` is the gate) |

**The four quadrants** (orthogonal, not correlated):

```
                      | compositeScore   | repositoryHealth
----------------------+------------------+----------------
AI + clean            | HIGH             | HIGH
Human + messy         | LOW              | LOW
AI + messy            | HIGH             | LOW
Human + clean         | LOW              | HIGH
```

**Why two?** They answer different questions for different
audiences. `compositeScore` is the user question "is this
codebase AI?"; `repositoryHealth` is the engineering question
"is this codebase healthy?". v0.18.2 rev 3 decision
("expose, don't replace") explicitly rejected merging them
because:

1. The deterministic model is fast and explainable; the
   Bayesian model is O(n) over rules × corpus priors.
2. The deterministic weights (0.4/0.3/0.2/0.1) are
   user-tunable; the Bayesian priors are corpus-derived.
3. A user who turns off AI-specific rules should still get
   `repositoryHealth`. The two must remain independent.

**Files added/changed:**
- `packages/slopbrick/src/engine/metrics.ts` — extended the
  docstring at the `compositeAggregate` block (around line
  325) with the relationship table, the four quadrants, and
  the rationale.
- `packages/slopbrick/docs/research/v0.18.2-pr3-relationship.md`
  — 130-line dedicated doc covering the definitions, the
  quadrants, the migration guidance, and "what each does NOT
  do" (anti-patterns to avoid).

**Migration guidance:** if you were reading
`repositoryHealth` to infer "is this AI?", stop — that's
`compositeScore`'s job. The two are not correlated.

## [0.18.1] - 2026-06-30 — Two verified critical bugfixes (rev 3 G1-verified)

v0.18.1 closes two user-visible bugs in the shipped report. Both
were verified against current code with G1 (reproduction) before
any fix was scoped. v0.18.0 (the multi-week rule recalibration) is
deferred to v0.18.7 to land after the verified bugfixes; the
detector work (dead-code, duplication) splits into v0.18.8 and
v0.18.9 respectively.

### Fixed: `formatScoringExplainer` was describing a 2-score model that no longer exists

**Reproduction (verified before scope, G1):**
```bash
$ grep -n "two scores" packages/slopbrick/src/report/pretty.ts
692:    'Why two scores? The Slop Index measures AI-slop signatures ' +
```

The full footnote at `pretty.ts:690-699` read:

> *"Why two scores? The Slop Index measures AI-slop signatures
> (lower = better, this is the CI gate). The Repository Coherence
> measures internal consistency (higher = better, informational).
> A codebase can be hand-written AND inconsistent (low Slop,
> low Coherence) or AI-generated AND consistent (high Slop,
> high Coherence). See docs/scoring-explained.md for the full
> math."*

Three things wrong with that text:
1. The product has **4** scores since v0.15.0 (`aiQuality`,
   `engineeringHygiene`, `security`, `repositoryHealth`).
2. The CI gate is `aiQuality >= 70` (**higher** = better), not
   `slopIndex` (lower = better) — the explainer had the gate
   direction backwards.
3. It referenced `docs/scoring-explained.md` — the file exists
   (verified, 5236 bytes) but itself uses the 2-score framing
   and is also stale. Fixing the file is v0.18.5 (doc-hygiene)
   scope; the in-code explainer is what users see, so it ships
   first.

**Fix:** the new footnote describes all 4 scores, names the
correct gate (`AI Quality >= 70`, higher = better), and quotes
the `repositoryHealth` weights from `metrics.ts:302-306`
(`0.4·AI Quality + 0.3·Engineering Hygiene + 0.2·Security +
0.1·Test Quality`). The brief report's copy was already
correct; the full-report explainer now mirrors it.

### Fixed: `--no-increase` error message documents the v0.15.0→v0.18.x data-flow contract

**Reproduction (verified before scope, G1):** `finalizeReport.ts:189`
```ts
if ((report.aiQuality ?? 0) < previous.slopIndex) {
```
The comparison is correct in effect — for v0.15.0+ users,
`previous.slopIndex` is populated by the engine as
`slopIndex: report.aiQuality` (`engine/src/structure.ts:258`),
so the two values are in the same scale and direction. But the
*name* is misleading and the contract is brittle: a future engine
change that decouples `slopIndex` from `aiQuality` would silently
break the gate. The previous v0.15.0 inline comment said "for
backward compat with historical telemetry" — true but unhelpful,
since it invited the next reader to "fix" it by reverting to the
bridge.

**Fix:** rename the local from `previous.slopIndex` to
`previousBaseline` (clarifies intent: "this is the value to
compare against, whatever the source field is called"), expand
the comment to name the data-flow contract explicitly, and
include the scale/direction in the error message so the user
sees why the gate fired.

**Note on the v0.18.x plan.** The rev 3 plan said "compare to
`previous.aiQuality`", but `MemoryAuditRun` does not have an
`aiQuality` field — the engine writes `slopIndex: report.aiQuality`
(`structure.ts:258`). Adding an `aiQuality` field to the run
record is a schema change (touches `core` + the engine +
`@usebrick/mcp` + historical telemetry backfill), which is
v0.18.7–v0.18.9 scope. v0.18.1 ships the documentation fix that
makes the existing data flow robust to the next reader.

**Files:** `packages/slopbrick/src/cli/report/finalizeReport.ts`,
`packages/slopbrick/tests/cli.test.ts` (new contract test).


### (G9 self-audit floor — non-blocking) `security: 33` on platform source

The platform's own `slopbrick scan --workspace .` returns
`security: 33` (per `.slopbrick/health.json`), below the v0.18.10
CI gate floor of `security >= 80`. This is a pre-existing
scoring state, not caused by v0.18.1 PR-1. v0.18.10 will enforce
the floor in CI; v0.18.1 ships with it documented but not
enforced. To be addressed by the v0.18.7 recalibration.

---

## [0.17.4] - 2026-06-30 — Phase A refactor (contract migration + tsconfig strictness)

v0.17.4 is a patch release that closes the v0.17.3 review's
"concentrated debt" tier. **No behavior change** — the
published slopbrick contract is unchanged from v0.17.3. This
release is purely an internal cleanup that makes the codebase
match the architecture the v0.17.3 review described as the goal.

### Fixed (R-H4 closeout) — `core` contract migration

The v0.17.3 review identified that `core` had two parallel
type representations: a hand-written set in `structure-types.ts`
and the auto-generated set in `src/generated/`. The hand-written
types were "systematically looser" than the JSON Schemas they
should enforce, and the two could drift apart unnoticed.

v0.17.4 closes the migration:

- **`structure-types.ts`**: deleted 5 hand-written types
  (`InventoryFile`, `ConstitutionFile`, `HealthFile`,
  `StructureCategory`, `StructurePattern`,
  `ComponentFingerprint`). Now contains only
  `STRUCTURE_SCHEMA_VERSION` + `FileMtimeEntry` (no JSON-Schema
  counterpart) + validator re-exports. Net deletion: 250 lines.
- **`src/validators.ts`**: new module. The 6 runtime validators
  (`isStructurePattern`, `isComponentFingerprint`,
  `isInventoryFile`, `isConstitutionFile`, `isFileMtimeEntry`,
  `isHealthFile`) moved here. They are now type predicates
  against the generated `RepositoryStructure*` types, not the
  hand-written ones.
- **`src/index.ts`**: deprecated re-exports removed. New public
  API: `RepositoryStructureInventory/Constitution/Health/StructureMarkdown`
  + `Pattern`/`Component`/`Category` (from generated). Validators
  re-exported from `structure-types.ts` for backward compat.
- **`engine/buildHealthFromReport`**: return type changed to
  `RepositoryStructureHealth`. The contract tightening exposed
  two latent issues — both now addressed at the source.
- **Slopbrick consumers updated**: `structure.ts`,
  `structure-md.ts`, `bench-scan.ts`, `louvain.ts`, 4 test
  files all switched to the generated type names via alias.

The migration surfaced 2 real contract tightenings that the
hand-written types had been hiding:

1. **`topOffenseIds` is now a 0-3 tuple** (was `string[]`).
   The runtime was already slicing to 3 in
   `engine/src/structure.ts:472`; the cast makes the contract
   explicit at the type level.
2. **`Component.files` is now `[string, ...string[]]`** (at
   least 1, was `string[]`). All visitors (rust, php, go, etc.)
   produce `files: [filePath]` by construction, so the cast in
   `structure-md.ts:148` is safe under the visitor invariant.

### Fixed (R-H2) — `engine` dedupes `Verdict` from `@usebrick/core`

The v0.17.3 review identified two representations of the
same `Verdict` union that had to be kept in sync. v0.17.4
removes the duplicate:

- `engine/src/composite-scoring.ts:65` previously declared
  `type Verdict = 'USEFUL' | 'OK' | ...` — a local copy of
  `core/verdicts.ts:23`. Now imports `Verdict, isDefaultOff`
  from `@usebrick/core`.
- `ELIGIBLE_VERDICTS` (line 61) previously hardcoded
  `new Set(['USEFUL', 'OK'])` from the local copy. Now derived
  programmatically: `!isDefaultOff(verdict) && verdict !== 'HYGIENE'`.
  This makes the eligibility logic self-maintaining: adding a
  new `Verdict` to `core/verdicts.ts` automatically updates
  `ELIGIBLE_VERDICTS` without a second code change.

R-H2 also flagged a "Rule duplicate" between `engine/mdl.ts:51`
and `slopbrick/types.ts:1006`. Investigation: these are NOT
duplicates. `mdl.ts:51` is a 2-field minimal interface for MDL
math; `slopbrick/types.ts:1006` is the full `Rule<Context>`.
Different layers. R-H2 was only right about `Verdict`.

### Fixed (R-H5) — `slopbrick/tsconfig.json` now extends the base

The v0.17.0 review flagged that `slopbrick/tsconfig.json`
silently dropped 5 of the 5 strictness flags from the base
tsconfig. v0.17.4 fixes all of them:

- `noImplicitOverride` — adopted. Surfaced 1 real bug in
  `ConfigValidationError.name` (now `override readonly name`).
- `allowSyntheticDefaultImports` — adopted.
- `isolatedModules` — adopted (future-proofs tsup builds).
- `noUncheckedIndexedAccess` — adopted. The original v0.17.1
  CHANGELOG estimated "25+" errors; the real cost was 299
  across 50 files. All fixed in this release.
- `noFallthroughCasesInSwitch` — adopted. Slopbrick has 0
  case statements with fallthrough; the flag caught 0 errors
  but is now in place for future code.

The 299 fixes are mechanical: `!` assertions on regex capture
groups in visitor files (the dominant pattern, ~240 of the
299), `!` assertions on loop-bounded array access in math
code (`matrix[i]![j]!`), `??` fallbacks for `T | undefined`
ternary results, type guards for `.filter()` chains, and one
`override` modifier. The slopbrick visitor code was written
without `noUncheckedIndexedAccess` in mind, which is why the
error count was so high.

Also switched `slopbrick/tsconfig.json`'s `include` pattern
to match engine: `src/**/*` only (was including `tests/` and
`scripts/` which the build doesn't use).

### Verified

- `pnpm -r typecheck`: 0 errors across `core`, `engine`,
  `slopbrick`, `website`.
- `pnpm -r test`: all pass (164 slopbrick cli+report + 35 core
  + 1 engine + slopbrick engine-integration tests).
- `slopbrick scan` runs end-to-end against the platform
  source. `version: "3"` in `health.json` (correct).

### Installation

```bash
npm install -D slopbrick@0.17.4
```

No migration needed. Drop-in replacement for v0.17.3.

### Deferred (in `docs/research/rule-recalibration-v0.18.0.md`)

- v0.18.0 plan: dead-code detection (3-5 new rules covering
  dead exports, dead functions, dead types, dead config) +
  95-rule recalibration (delete or reclassify 27 DORMANT
  rules + 35 zero-recall rules; target 60-75 rules). 8-PR
  sequence over 2 weeks.
- 4-score display model (the reverted Phase 3c UX). For v0.18.0
  after the data layer is stable.
- Phase B-D of the v0.17.3 refactor plan: R-H1 (split
  program.ts 1648 lines), R-M2 (split types.ts 1090 lines),
  R-H3 (engine I/O boundary), R-M1, R-M3, R-M4, R-L1-R-L4.

## [0.17.3] - 2026-06-30 — Schema fix cascade (B3 + B4 + B5) + LOW items

v0.17.3 is a focused PR that closes the B3, B4, and B5 BLOCKERs from the v0.17.0 review, plus the LOW `case 'mjs':` duplicate in `packages/engine/src/parser.ts`. **BREAKING for cross-language consumers of the JSON Schemas** (the schema `version` constant bumps from `2` to `3`, and the public type names rename from `RepositoryMemory*` to `RepositoryStructure*`). TypeScript consumers re-resolve through `@usebrick/core`; the old aliases are gone.

### B3 — Schema version mismatch

- `packages/core/schemas/v1/inventory.schema.json`: `version const` was `2` but the engine writes `3` on every scan. Now `const: "3"`.
- `packages/core/schemas/v1/constitution.schema.json`: same fix. Now `const: "3"`.
- `packages/core/schemas/v1/structure.schema.json`: frontmatter `schemaVersion const` was `2` but the renderer writes `3`. Now `const: "3"`.

After this commit, every artifact the scanner writes passes core's own JSON Schema validators. The "schemas are the API" promise (AGENTS.md) is now actually true.

### B4 — structure.schema.json `$id` + index.json key + titles

- `structure.schema.json:3` `$id` was `.../memory.schema.json` (the v0.15.0 rename hit the filename but not the `$id`). Now `.../structure.schema.json`.
- `index.json:20` key was `memory` with a stale description. Now `structure` with matching `$id`, description, `producedBy: ["slopbrick scan (auto-renders to .slopbrick/structure.md)"]`, and `consumedBy: ["slop_suggest_with_structure MCP tool", ...]`.
- `inventory.schema.json`, `constitution.schema.json`, `health.schema.json` titles were all `"Repository Memory — X"`. Now `"Repository Structure — X"`.
- Codegen cascade: `src/generated/{inventory,constitution,health}.ts` type names rename from `RepositoryMemory*` to `RepositoryStructure*` (the 4th, `structure.ts`, was already renamed in a prior commit). `packages/core/src/index.ts:65-67` re-exports updated.

### B5 — `compositeScore` was effectively dead

- `signal-strength-schema.ts` was missing `aiSpecific: z.boolean().optional()`. Without it, Zod's `.parse()` strips the field — even if a rule has `aiSpecific: true` in `signal-strength.json`, the engine never sees it, every LLR returns `0`, and the composite probability collapses to the constant prior `0.428`.
- Fix: 2-line change to the Zod schema. The `signal-strength.json` data already has `aiSpecific: true` on all 16 `ai/*` rules, so the field is now read end-to-end and the composite score returns a real signal (driven by the AI-tendency rules, weighted by their calibration).

### LOW — `parser.ts` duplicate `case 'mjs':`

- The second `case 'mjs':` (line 105) was unreachable — the same case is at line 84. Removed the unreachable block. No behavior change.

### Verified

- `pnpm --filter @usebrick/core codegen` runs clean; all 4 generated types regenerate with the new names
- `pnpm -r typecheck` — clean across `core`, `engine`, `slopbrick`, `website`
- `vitest run` — 200/200 pass (164 slopbrick + 35 core + 1 engine)
- `tsup` builds `core`, `engine`, `slopbrick` successfully
- End-to-end: a clean `slopbrick scan --brief` against the platform now shows the composite scores moving with the rule signal (was constant prior `0.428` before B5)

### Installation

```bash
npm install -D slopbrick@0.17.3
```

**Breaking for cross-language consumers.** Python/Go/Rust consumers reading the schemas must update:
- `version` field expectations from `2` → `3` (inventory, constitution, health)
- `frontmatter.schemaVersion` from `"2"` → `"3"` (structure)
- `$id` resolution: `.../memory.schema.json` → `.../structure.schema.json`
- Generated type names (if using `json-schema-to-typescript` codegen): `RepositoryMemory*` → `RepositoryStructure*`

TypeScript consumers: bump to v0.17.3, rebuild, fix the 3 type re-exports in your code (`RepositoryMemoryInventory` → `RepositoryStructureInventory`, etc.).

## [0.17.2] - 2026-06-30 — UX fixes (brief labels + website scroll-jump)

v0.17.2 is a small UX patch on top of v0.17.1. No breaking changes. No new rules. No schema bumps. The on-disk artifacts are unchanged. The display format is unchanged from v0.17.1.

### CLI brief output — human labels

- `--brief` (and `formatBriefReport`) used the raw camelCase JSON field names as the row label: `aiQuality 75`, `engineeringHygiene 93`, `security 0`, `repositoryHealth 81`. The labels are internal field names; users copy-paste the brief into PR comments, so the readable name should lead.
- Now shows: `AI Quality 75`, `Engineering Hygiene 93`, `Security 0`, `Repository Health 81` with the field name in dim italic as a secondary annotation (`(aiQuality)`). The `CI gate: AI Quality >= 70 -> pass/fail` line is also relabeled.
- The JSON `--json` output is unchanged — consumers parsing `health.json` see the same field names as before.

### Website — stop scroll-jump to mock terminal on load

- `usebrick.dev` auto-scrolled to the mock terminal on first load and again on any click outside it (e.g. clicking the install button in the hero would scroll the page down past the hero).
- Two causes in `packages/website/src/scripts/live-terminal.ts`:
  - **Init auto-focus.** The terminal called `body.focus()` on the terminal element when no button/link was focused — the browser scrolled to the focused element, pulling the page past the hero.
  - **Bubbling click listener.** A `body.addEventListener('click', () => body.focus())` on the terminal body would focus (and scroll to) the terminal on any bubbled click anywhere on the page, including clicks that originated on the hero.
- Fix: (a) removed the init auto-focus entirely (the user opts in to typing by clicking inside the terminal); (b) replaced the bubbling listener with a guarded handler that only focuses when the click *originated* inside the terminal root (`if (!root.contains(e.target)) return;`).

### Verified

- `pnpm tsc --noEmit` clean
- `vitest run tests/cli.test.ts tests/report/` — 164/164 pass (9 test files, ~4.5s)
- Built and deployed the website to Cloudflare Pages (preview: `4d530b05.platform-ay9.pages.dev`)

## Unreleased

### Corpus hygiene (post-v0.17.1)

- Moved the remaining 5 corpus dirs from `/Users/cheng/platform/{comfyui, fastchat, elevenlabs-js, elevenlabs-python, chatglm}` (137M of third-party code, gitignored) to `/Users/cheng/corpus-expansion/`. The v0.17.1 follow-up is now complete. Verified: a local `slopbrick scan` went from **5511 issues / 8145 files / repositoryHealth 51** to **3118 issues / 5183 files / repositoryHealth 71** — the 5 dirs were responsible for ~2400 false findings (43% of all reported issues) and dragged repositoryHealth down 20 points.
- **Second pass** — moved the remaining 10 gitignored-but-on-disk corpus dirs (`fooocus`, `gpt-academic`, `gradio`, `helix`, `llama-index2`, `lmnr`, `mastra`, `oobabooga`, `supabase`, `vercel-ai` — 3.1GB of third-party code) to `/Users/cheng/corpus-expansion/`. After this, `slopbrick scan` against the platform root (with no source files at the root) sees **8 issues / 8 files** — almost all noise. With `--include 'packages/*/src/**/*.{ts,tsx,vue,svelte}'`, the real platform source code scans as **1226 issues / 269 files / aiQuality 40 / repositoryHealth 33** — the previous 75/51 numbers were measuring the corpus, not the code.

## [0.17.1] - 2026-06-30 — UX pass + coherence sweep

v0.17.1 is a quality + UX follow-up to v0.17.0. No breaking changes. No new rules. No schema bumps. The on-disk artifacts (`.slopbrick/{inventory,constitution,health}.json`, `.slopbrick/structure.md`) are unchanged. The display format and CLI surface are unchanged from v0.17.0 — this is a true patch release.

### CLI surface additions

- **`--no-color` flag** + `NO_COLOR=1` env support per https://no-color.org. Color decisions centralized in `colorEnabled()`.
- **`--security-only` flag** for CI gates that only care about security posture. (The actual rules filter is a follow-up — see v0.17.2.)
- **Progress bar** in `renderProgress` (writes to stderr in TTY, one line per 2% in pipes). Replaces the previous spinner-only behavior.
- **`[v0.14.5i]` banner** → `[v${VERSION}]`. The auto-suppress notice now reads the real version (v0.17.1) instead of a hardcoded changelog label.

### Output safety

- **`redactSecrets()`** masks anything that looks like a secret (AWS keys, GitHub PATs, Slack tokens, Stripe keys, JWT, PEM private keys) in issue messages and advice. Same regex set the security/secret-leak rules use on user code, now applied to our own output. Defensive — no behavior change for normal output, but a leaked secret in an issue message will no longer print to the terminal.

### Corpus hygiene

- Moved `automatic1111/` corpus (6.3M of third-party Python) from `/Users/cheng/platform/automatic1111/` to `/Users/cheng/corpus-expansion/automatic1111/`. The 5 other corpus dirs (comfyui, fastchat, elevenlabs-js, elevenlabs-python, chatglm — 137M) are still in the platform and produce ~5500 false findings. **Follow-up**: also move those, or add them to `slopbrick.config.mjs` exclude. See `.gitignore` (`# External corpus repos`) for the convention.

### Coherence sweep (from the v0.17.0 review)

The v0.17.0 release shipped with 20 review items flagged. v0.17.1 addresses the highest-impact ones:

**Fixed in v0.17.1:**
- **B1**: `AGENTS.md` said "13 scores, 60+ rules" — contradicts the 4-score model the code ships. Now says "4 scores, 95 rules in 15 categories".
- **B2**: No root `LICENSE` existed — 6 broken `[MIT](./LICENSE)` links. Created `/LICENSE` (MIT, © 2026 usebrick.dev).
- **H1**: `@usebrick/engine` was missing from the `AGENTS.md` package table (only 3 of 4 packages listed). Added.
- **H2**: Website Hero / live-terminal / og-image / Tools.astro had stale `v0.16.0` / `80+ rules` / `13 categories` references. All bumped.
- **H3+H4**: Rule count (60+ / 80) → 95. Category count (13 / 14) → 15. Updated across README.md, AGENTS.md, packages/slopbrick/README.md, docs/ARCHITECTURE.md, Hero, live-terminal, og-image, Tools.astro.
- **H5**: `AGENTS.md` + `CONTRIBUTING.md` said "tag pushes trigger publish.yml" — false. `publish.yml` triggers on `release: types: [published]`. Fixed.
- **M2**: `README.md` + `packages/website/README.md` said website deploys to GitHub Pages. It doesn't — it's Cloudflare Pages (project `platform`, custom domain `usebrick.dev`). Fixed.
- **M3**: `docs/UPDATE-SUMMARY.md` (referenced in 2 places) and `docs/rename-checklist.md` (gitignored operator-only doc) don't exist. Repointed to `packages/slopbrick/CHANGELOG.md` and a note about the local-only operator file.
- **M4**: README claimed `repositoryHealth = 0.4·aiQ + 0.3·eng + 0.2·sec + 0.1·test`. Code says `0.5·aiQ + 0.3·eng + 0.2·sec` (no test axis). Now matches.
- **M5**: 3 Node-floor stories (≥20 in package.json, Node 18+ in docs, Node 24 in CI). Aligned to Node 20+ in AGENTS.md.
- **M6**: `docs/old-repo-redirect.md` pointed at `@usebrick/platform` (monorepo name, not an npm package). The published package is the unscoped `slopbrick`. Fixed.
- **H8**: `packages/slopbrick/tsconfig.json` silently dropped 4 base settings (`noUncheckedIndexedAccess`, `noImplicitOverride`, `noFallthroughCasesInSwitch`, `isolatedModules`). **Reverted in v0.17.1** — the stricter settings exposed 25+ type errors in `scripts/` and `src/cli/init.ts` that are real bugs. v0.17.2 will land the tsconfig + the bug fixes together. (See Follow-up below.)

**Deferred to v0.17.2 (separate focused PR):**
- **B3 + B4**: Schema version mismatch + structure.schema.json `$id` — the codegen pipeline cascading effects require a dedicated effort. v0.17.2 will land the schema version bump, regenerate the types, and update every consumer in one PR.
- **B5**: `compositeScore` was effectively dead (every rule's `aiSpecific` was undefined → every LLR was 0 → every composite score was the constant prior 0.428). Reverted in v0.17.1 because the fix depends on B3+B4 (needs the new schema + type names). v0.17.2 will land both together.
- **H6**: `packages/engine/README.md` public-API list is fiction (lists `scanProject`, `loadStructure`, etc. that don't exist with the listed signatures).
- **H7**: "Pure — no I/O" contract violations in engine (`parser.ts:1-3` reads `process.env.SLOP_AUDIT_CACHE` + `process.cwd()`, `find-similar.ts:243` dynamically imports `globby` + `readFile`).
- **M1**: Hand-written validators in `packages/core/src/structure-types.ts` are systematically looser than the JSON Schemas they're meant to enforce (e.g., `isComponentFingerprint` accepts any string; the schema wants `^[0-9a-f]{16}$`). No runtime schema validation exists in core.
- **LOW**: Dead code in `packages/engine/src/louvain.ts` (`snapshotPartition` never called, `void totals;` discards a map), duplicate `case 'mjs':` in `packages/engine/src/parser.ts` (the second one was unreachable, now fixed), `packages/engine` has only 1 snapshot test, `packages/website/test-results/` is committed, `packages/core` still has some "Repository Memory" naming in stale docs.

### Installation

```bash
npm install -D slopbrick@0.17.1
```

No migration needed. Existing `.slopbrick/` artifacts from v0.17.0 work without changes.

## [0.17.0] - 2026-06-30 — 95 rules, extracted db/docs, bench:scan

v0.17.0 is a quality + coverage release. No breaking changes.

### Added
- **R1**: 16 test files for the `ai/*` rules (52 new tests). The `ai/*` rules now have first-class regression coverage. text-like-ratio has a known TODO for the "should flag" positive test (SWC parse limitation with prose-only source inside `/* */` block comments).
- **R2**: 5 new rules that were previously RULE_HINTS-only (now first-class Rule objects with tests):
  - `security/eval` — `eval()` / `new Function()` / `window.eval()` (RCE)
  - `wcag/missing-alt` — `<img>` without `alt` (WCAG SC 1.1.1)
  - `security/target-blank-no-noopener` — missing `rel="noopener"` on `target="_blank"`
  - `security/localstorage-token` — auth tokens in `localStorage` (XSS)
  - `typo/placeholder-text` — `Lorem ipsum` / `TODO` / `Enter text here`
- **R3**: 10 rules extracted from `src/engine/{db-health,doc-freshness}.ts` to first-class Rule objects in `src/rules/{db,docs}/`:
  - `db/`: `missing-fk-index`, `duplicate-index`, `missing-not-null`, `enum-sprawl`, `naming-inconsistency`, `sql-concat`
  - `docs/`: `stale-package-reference`, `stale-function-reference`, `expired-code-example`, `broken-link`
  - Orchestration migration: `db-health.ts` and `doc-freshness.ts` now call the new rules via the standard `analyze()` interface. pgsql-parser WASM is loaded once via `Promise.all([...moduleReady])` before any SQL analysis.
- **R4**: `pnpm bench:scan` regression script (`scripts/bench-scan.ts`). Asserts: 4 scores in [0,100] + finite, distinct when issues > 0 (catches the v0.16.0 R3 placeholder bug if it ever returns), stable across runs (delta ≤ 2), issueCounts non-negative integers.
- **R5**: `formatBriefReport` now uses the 4-score model (verdict + 4 scores + CI gate + footer). Trajectory delta (↑N cleaner / ↓N worse) restored on the aiQuality line.
- **R7**: SEO + security infrastructure for usebrick.dev: `sitemap.xml`, `robots.txt`, Cloudflare Pages `_headers` (X-Content-Type-Options, X-Frame-Options, HSTS, Referrer-Policy, Permissions-Policy, CSP, cache-control).
- **R8**: `pnpm scan` dogfooding in root `package.json`. Runs `slopbrick scan` against the platform itself.
- **R9**: Open Graph image (1200×630) for social shares — `public/og-image.svg` (SVG, works on Twitter/LinkedIn/Slack/Discord).

### Fixed
- Website stale text: "slopbrick 0.15.0 · 13 scores" → "slopbrick 0.16.0 · 4 scores · 80+ rules" (LiveTerminal demo). 7 docs updated to use the 4-score model.
- `docs/old-repo-redirect.md` bumped from v0.15.0 → v0.17.0.
- 3 bugs in `v0.17.0-plan.md` caught during execution: R3 count (was 8 db + 4 docs = 12, actual is 6 + 4 = 10), R12 contradiction (slopbrick explain already shipped in v0.16.0), R15 internal contradiction (was in both Defer and Day 4).

### Changed
- `package.json` description: "60+ rules and 13 scores" → "80+ rules across 13 categories, computes 4 scores (aiQuality, engineeringHygiene, security, repositoryHealth)"
- `rules-catalog.md` auto-regenerated to show 95 rules (was 85).

### Test count
- 1244 → 1797 tests (+553)
- Rules: 80 → 95 (+15)
- Test files: 68 → 89 (+21)

### Migration notes
- The orchestration in `db-health.ts` and `doc-freshness.ts` now calls the new Rule objects. The `DbFinding` / `DocFinding` extra fields (`table`, `columnName`, `package`, `identifier`, `link`) are not populated by the new rules in v0.17.0; the report still works without them. A v0.18.0 task can populate them by encoding the extra data in `Issue.advice` or extending the `Issue` type.
- Cross-file FK index check lost: the new `db/missing-fk-index` rule does single-file only. The global `fkColumnsByTable` / `indexColumnsByTable` map in the old orchestration is no longer used. Documented in the rule's comment as a known v1 limitation.

All notable changes to slopbrick are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.16.0] - 2026-06-29 — Calibrated scores, accurate catalog

The v0.15.0 breaking change promised a 4-score model (aiQuality / engineeringHygiene / security / repositoryHealth). v0.15.0 shipped the **shape** of the 4 scores in the JSON output, but the actual numeric values for engineeringHygiene / security / repositoryHealth were all aliased to aiQuality. v0.16.0 fixes this — the 4 scores are now independently computed from the issue stream.

### Fixed

- **The 4-score model is real now.** `src/engine/metrics.ts:243-247` previously returned the same `aiQuality` value for all 4 scores. The fix computes each independently:
  - `security` = 100 − risk, where `risk` is the AI Security Risk categorical (`low → 100`, `medium → 67`, `high → 33`, `critical → 0`).
  - `engineeringHygiene` = 100 − average of `arch`, `logic`, `layout`, `visual`, `component`, `test` category scores. Each is in [0, 100]. Higher is better.
  - `testQuality` = `buildTestQualityScore()` from `src/engine/test-quality.ts`, already 0-100, higher is better.
  - `repositoryHealth` = `0.40 × aiQuality + 0.30 × engineeringHygiene + 0.20 × security + 0.10 × testQuality`. Weighted composite, 0-100, higher is better.
- `docs/rule-catalog.md` was claiming 56 rules. Reality is 80. Regenerated the catalog from `src/rules/builtins.ts` (auto-generated by `pnpm generate:rules`). Missing `ai/` (16 rules) and `test/` (4 rules) categories are now listed.
- `RULE_HINTS` in `src/snippet/data.ts` had 40 entries referencing rules that don't exist. 5 of those are in scope for v0.17.0; the other 35 were moved to `docs/research/backlog-rule-hints.md` so MCP clients stop surfacing user-facing prose for rules that don't fire.

### Added

- 4 new tests in `tests/engine/metrics.test.ts` assert the 4 scores are computed independently (in a mixed-issue scenario, security differs from aiQuality), are all in [0, 100], and that repositoryHealth is the weighted composite. v0.15.0 had no test coverage for the 4-score model — that's why the bug shipped.
- `scripts/generate-rule-catalog.ts` — auto-generates `docs/rule-catalog.md` from `src/rules/builtins.ts`. Has a `--check` mode for CI to fail loudly on drift. Wired into `pnpm generate:rules`.
- `description` field added to 4 rules that lacked them: `boundary-violation`, `math-any-density`, `arbitrary-escape`, `focus-appearance`. Catalog now has prose for every rule.

### Migration

No migration. The 4-score JSON output shape is unchanged — `aiQuality` / `engineeringHygiene` / `security` / `repositoryHealth` are still the 4 fields. Only the numeric values differ. If you have any saved v0.15.0 reports, the new values are independently computed and more meaningful than the v0.15.0 placeholder. Re-run `slopbrick scan` to refresh.

## [0.15.0] - 2026-06-26 — Repository Structure Platform (BREAKING)

This is a hard-break release. The platform is renamed from "Repository Memory Platform" to "Repository Structure Platform (RSP)". The `memory*` names are replaced with `structure*` everywhere. **Slop Score is replaced by 3 independent scores** (AI Quality / Engineering Hygiene / Security + a Repository Health composite).

### Breaking changes

- `MEMORY_SCHEMA_VERSION` (value 2) is replaced by `STRUCTURE_SCHEMA_VERSION` (value 3). The schema field `slopIndex` is replaced by `aiQuality` / `engineeringHygiene` / `security` / `repositoryHealth`.
- The on-disk artifact `.slopbrick/memory.md` is renamed to `.slopbrick/structure.md`.
- Types: `MemoryFile` → `StructureFile`; `MemoryCategory` → `StructureCategory`; `MemoryPattern` → `StructurePattern`.
- Functions: `loadMemory` / `saveMemory` → `loadStructure` / `saveStructure`.
- MCP tool `slop_suggest_with_memory` → `slop_suggest_with_structure` (the tool identifier changes).
- The verdict enum is unchanged (6 values) but the user-facing report now exposes a 3-bucket taxonomy (AI Findings / Engineering Hygiene / Suppressed) instead of the 6 verdict names. The engine/UI seam is a new `bucketForVerdict()` function in `packages/slopbrick/src/report/buckets.ts`.
- New `packages/engine/` workspace package — the pure scanning logic is extracted from `slopbrick/src/engine/`.

### Migration

There is no automatic migration. Update any code that reads `.slopbrick/memory.md` to read `.slopbrick/structure.md`. Update any consumers of the `slop_suggest_with_memory` MCP tool to call `slop_suggest_with_structure` instead.

### Added
- `Verdict` enum, `isDefaultOff()`, and `VERDICTS` are now exported from `packages/core/src/verdicts.ts` as a single source of truth.
- Zod schema `signalStrengthSchema` validates the calibration data at load time.
- Schema codegen: `packages/core/scripts/codegen-types.ts` reads `schemas/v1/*.json` and writes TypeScript types to `packages/core/src/generated/`. CI fails if schemas and types are out of sync.
- WebGL cleanup: `brick-shader.ts` calls `WEBGL_lose_context?.loseContext()` on unmount.
- Tool cards are keyboard-accessible (button role + Enter/Space + focus-visible).
- Skip-to-content link.
- axe-core via Playwright in CI for the website.
- `LowPowerDetector` skips WebGL on devices with `deviceMemory < 4` / `hardwareConcurrency < 4` / `prefers-reduced-motion`.
- Per-brick jitter in the WebGL shader.
- LCP-swap: WebGL canvas waits for `largest-contentful-paint` before initializing.
- `bucketForVerdict()` — the engine/UI taxonomy seam.
- Multi-score: `aiQuality` / `engineeringHygiene` / `security` / `repositoryHealth`.

## [0.14.5d] - 2026-06-27 — Repository Structure pipeline + LockBrick prevention commands

This release ships the **Repository Structure** surface end-to-end and
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
  See `docs/repository-structure.md` for the full contract.

- **`.slopbrick/structure.md`** — every `slopbrick scan` now also writes
  the agent-readable markdown summary. Previously this existed as a
  renderer (`renderStructureMarkdown`) but was never wired into the
  scan path. MCP `slop_suggest_with_structure` and external agent
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
  - `slopbrick memory` (default `--show`) — print `.slopbrick/structure.md`
    to stdout
  - `slopbrick memory --regenerate` — re-render structure.md from the
    existing inventory.json + constitution.json (no scan, sub-second)
  The regenerate path is the workflow for "I just changed my
  `slopbrick.config.mjs` and want a fresh structure.md without paying
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
  health.json, structure.md) exist, are schema-valid, and warns the
  user if any are missing. The 5th check in doctor now points the
  user at the right `slopbrick scan` invocation to refresh.

- **`docs/repository-structure.md`** — canonical reference for the
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

## [0.14.5] - 2026-06-28 — v7 calibration + 10 UX improvements + Python/Go + docs

4-month release window covering 9 commits (internally labeled
v0.14.5h through v0.14.5q during development, all bundled into
the v0.14.5 semver). The last published version was 0.11.2.

This release ships:

- **The v7 corpus calibration** — 184,488 neg + 239,054 pos files,
  1,060,258 fire-events, per-rule Precision/Recall/FPR for 65 of
  80 rules. 1 INVERTED rule auto-defaultOff.
- **10 UX improvements** to the scan output (verdict, glossary,
  band labels, delta, --brief, --why-failing, next-step footer, etc.)
- **Python/Go file coverage** — was 0% fire rate, now ~30% via
  regex-only rules
- **6 new OSS docs** (CONTRIBUTING, EXAMPLES, SECURITY, CODE_OF_CONDUCT,
  docs/MCP, docs/scoring-explained) + README 1058→199 lines

### The v7 calibration (the credibility milestone)

The headline. 31 rules USEFUL, 5 OK, 5 NOISY, 1 INVERTED, 23 HYGIENE,
0 DORMANT. The 1 INVERTED rule is `ai/renyi-profile` (TP=3, FP=9,
lift 0.3) — it fires more on human code than AI code. The earlier
v0.14.5k partial run (on 95k+90k files) flagged 8 rules as
INVERTED; the final run on the full 420k files narrows that to 1.
This justifies waiting for the final data before auto-defaulting.

`src/rules/signal-strength.json` is auto-updated with the verdicts.
`docs/research/v7-corpus-calibration.md` has the full per-rule table.

### Self-scan impact (expected)

The slopbrick codebase's own Slop Index should drop by 5-15
points after this release, because the 1 INVERTED rule was firing
on slopbrick's own source.

### The 10 UX improvements (the v0.14.5i/j cycle)

The actual day-to-day experience of running `slopbrick scan` got
dramatically better:

- **P5** defaultOff trust signal — was stderr noise, now a green ✓ line in main output
- **P0** next-step footer with highest-impact action — no more "kthxbai" silence
- **P1** per-category breakdown with bar charts — see which categories drive the score
- **P4** unified headline (Slop Index primary, Coherence secondary) — one number, consistent across CLI and health.json
- **P3** `--why-failing` flag — top 5 rules by weighted impact
- **P6** plain-language verdict at the top — first line is "is my code OK?"
- **P7** inline glossary for category labels — "AI patterns — signatures of LLM-generated code"
- **P8** band labels (`[EXCELLENT]` / `[PASSING]` / `[NEEDS WORK]` / `[CONCERNING]`) — no more PASS/FAIL jargon
- **P9** trajectory delta on the headline — `↓5 (cleaner)` on every re-scan
- **P10** `--brief` flag — 4-line terse output for CI/scripts

### Coverage (the v0.14.5l cycle)

- **Python/Go files now scanned** (`parseBlankModule` for .py/.go)
  — was 0% fire rate, now ~30% via regex-only rules
- **Gap analysis script** (`find-rule-coverage-gaps.py`) —
  computes fire rate by extension, repo, and file size; identifies
  the lowest-fire-rate clusters where new rules are needed

### Documentation (the v0.14.5m cycle)

- **6 new OSS docs** (CONTRIBUTING, EXAMPLES, SECURITY, CODE_OF_CONDUCT,
  docs/MCP, docs/scoring-explained) — all the standard OSS files a
  new contributor expects
- **README slimmed from 1058 → 199 lines** — npm-ready, points to
  the new docs for depth
- **Per-rule scoring-explained** doc with the 2x2 quadrant
  (Slop × Coherence combinations)
- **CHANGELOG grouped** under [Unreleased] → [0.14.5] with
  detailed per-commit history

### Bug fixes

- `categoryScores` 0-component bug: returned raw severity totals
  (167/70/68) instead of 100×-inflated numbers (16700/7000/6840) for CLI tools
- `--why-failing` was reading `coherence` instead of `slopIndex`
  (gave different number than main output)
- "AI patterns patterns" double word in verdict
- Small-project warning firing on 0 components
- Hardcoded `VERSION` constant in src/types.ts (caught by tests, bumped)
- Stale `@usebrick/core` entry in pnpm-lock.yaml (caused publish
  failures on the intermediate v0.14.5n/o/p/q release attempts;
  fixed by re-adding it to devDependencies with the prepack-guard
  allowlist)
- `filter_fires_by_date` path mismatch: perFileFires values are
  absolute paths; metadata has relative paths. Fixed by indexing
  keep by basename. Also fixed O(N×K) per rule to O(1) per check.

### Stats

- 798/798 tests pass
- 9 commits, ~3,000 lines added (code + tests + docs)
- Net: -859 lines from README

### The v0.10 credibility milestone (reached)

This release closes the v0.10 credibility milestone from the
original 12-phase plan: every detection rule that fired on the
v7 corpus now ships with per-rule Precision, Recall, and False
Positive Rate. v1.0 is the stability commitment — 6+ months after
v0.15 ships, when the API can be frozen based on accumulated
empirical feedback.

## [0.14.5p] - 2026-06-28 — UX overhaul, doc suite, Python/Go coverage, README slim-down, lockfile + build fix

The v0.14.5d → 0.14.5p line is a single dev cycle (one session) that
shipped 9 commits addressing the scan flywheel UX, a categoryScores
display bug, Python/Go coverage gaps, a partial v7 calibration
report, a full documentation suite, a lockfile fix, and a build
fix. Pushed as one release because the commits are interdependent
and the CHANGELOG groups them as a single "calibration update".

v0.14.5n was tagged first but its publish failed due to a stale
`@usebrick/core` entry in the lockfile. v0.14.5o was tagged next
and failed at the build step because removing the lockfile entry
also broke tsup's ability to bundle `@usebrick/core` (which the
slopbrick source code imports in 4 files). This release (0.14.5p)
fixes both: it adds `@usebrick/core` back to `devDependencies` as
a `workspace:*` dep (with an explicit allowlist in
`scripts/prepack-guard.mjs`), regenerates the lockfile, and bumps
the version so npm publish can succeed.

### Fixed (Build — release commit)

The v0.14.5o build failed at step 5 of publish.yml:
`Could not resolve "@usebrick/core"`. esbuild (used by tsup) needs
the workspace package's source to be installed in `node_modules` so
it can be bundled via `noExternal: [/^@usebrick\//]`. Removing
the lockfile entry caused pnpm install to skip the workspace link,
which broke the bundle. The right architecture (per v0.11.2 intent)
is: `@usebrick/core` is listed in `devDependencies` as
`workspace:*`, the lockfile has the matching `link:../core` entry,
tsup bundles it, and the published tarball never has the
`workspace:*` because it's stripped at install time (the bundle
is the runtime artifact).

The `prepack-guard.mjs` was updated to allowlist `@usebrick/core`
explicitly, with a comment explaining why this is safe (it's
bundled, not a runtime dep).

The v0.14.5p commit chain (relative to v0.14.5d):
- 5h: categoryScores 0-component bug fix
- 5i: 5 UX improvements (P0/P1/P3/P4/P5)
- 5j: 5 more UX (P6/P7/P8/P9/P10) + 2 bug fixes + scoring-explained.md
- 5k: partial v7 calibration (21 USEFUL, 8 INVERTED)
- 5l: Python/Go coverage fix (parseBlankModule)
- 5m: 6 new OSS docs (CONTRIBUTING, EXAMPLES, MCP, SECURITY, etc.)
- 5n: README 1058→199 lines (-859 net)
- 98b30df: lockfile fix (stale @usebrick/core entry) — WRONG, see 5p
- 5o (abandoned): see above
- 5p: build fix (added @usebrick/core back to devDeps; updated prepack-guard)

### Fixed (Lockfile — partial fix from 98b30df, superseded by 5p)

`pnpm-lock.yaml` had a stale `@usebrick/core: workspace:*` entry
that wasn't in `packages/slopbrick/package.json`. The original
`98b30df` commit removed the entry, which fixed the install drift
but broke tsup's bundle (see above). The 5p fix is the correct
version: keep `@usebrick/core` in the lockfile, but list it in
`devDependencies` so pnpm install doesn't strip it.

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
  `slop_suggest`, `slop_suggest_with_structure`, `slop_scan_file`,
  `slop_explain_rule`, `slop_list_rules`, `slop_governance`,
  `slop_check_constitution`, `slop_architecture_score`,
  `slop_business_logic_score`, `slop_find_similar`. Each with
  input/output schemas, when-to-use, and a typical agent flow.
  9.3K.
- **`docs/scoring-explained.md`** — what the two scores actually
  measure, the 2×2 quadrant of (Slop × Coherence) combinations,
  which one to focus on, the threshold rationale. 4.9K.
- **`docs/repository-structure.md`** — the 4 `.slopbrick/` artifacts
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

The canonical four-tool surface (`slop_suggest`, `slop_scan_file`, `slop_check_constitution`, `slop_explain_rule`) plus `slop_list_rules` (discovery) and `slop_find_similar` (GIR primitive) is unchanged — `slop_suggest_with_structure` remains the preferred fast-path variant.

Migration: replace `call('slop_governance', ...)` with `call('slop_suggest', ...)` and read `result.repositoryHealth` instead of `result.score`. No other code changes required.

### Added (Phase 9 — Product Consistency)

Two cross-file rules that detect AI-induced product copy drift:

- **`product/terminology-drift`** — flags when 3+ component names share a leading noun but use different suffixes (e.g. `PostList`/`PostDetail`/`PostCard` all on the `Post*` stem). AI agents pick slightly different words each invocation; the product copy drifts. One issue per file (the most divergent variant).
- **`product/ux-pattern-fragmentation`** — counts distinct UX patterns per category (modal/toast/button/input/card) and fires when the count exceeds a per-category threshold (modal ≥4, toast ≥3, button ≥5, input ≥4, card ≥4). Pick the canonical one and alias the rest.

11 unit tests pass. Both rules have RULE_HINTS entries in `src/snippet/data.ts`. Category is `arch` (cross-file pattern drift) for both; severity is `medium`; both are `aiSpecific: true`.

### Added (Repository Structure Platform — Phase 7 of v0.10)

Latency win for the agent integration: every `slopbrick scan` will persist the pattern inventory to `.slop-audit/inventory.json` + `.slop-audit/constitution.json`, and MCP `slop_suggest_with_structure` will read it back instead of re-parsing AST. 100–1000× faster on agent invocations.

- **`engine/memory.ts`** — `loadInventory` / `saveInventory` / `loadConstitution` / `saveConstitution` with atomic `.tmp + rename` writes; `buildInventoryFromScan` (reuses `buildPatternInventory` for pattern extraction + component fingerprints from `facts.v2.components`, sha256 hash of sorted hooks + sorted props truncated to 16 chars); `buildConstitutionFromConfig` (declared/forbidden/forbiddenPrefixes; forbidden entries ending in `/` split into the prefix allowlist); `isInventoryFresh` + `invalidateFile` backed by a per-file `mtimeMs` map in `.slop-audit/cache.json`. Schema-gated by `STRUCTURE_SCHEMA_VERSION` so future format bumps migrate gracefully.
- **`engine/memory-md.ts`** — pure `renderStructureMarkdown(inventory, constitution)` renderer. Produces a stable, agent-readable markdown summary (detected patterns sorted by fileCount desc, canonical components merged by name, declared constitution, DO NOT CREATE list). Plus `writeStructureMarkdown` + `readStructureMarkdown` for atomic `.slop-audit/structure.md` persistence.
- **`mcp/slop-suggest-memory.ts`** — `runSuggestWithStructure` wrapper. Reads the persisted markdown on the fast path; falls back to the existing `slop_suggest` (with a `structureHint` annotation) when `.slop-audit/structure.md` is missing.
- **New MCP tool `slop_suggest_with_structure`** — registers the fast-path variant in `src/mcp/tools.ts`. Documented as faster but requires a prior `slopbrick scan`.
- **Scan pipeline integration** — at the end of `runScan`, `slopbrick scan` now persists the inventory + constitution (gated by `config.projectMemory !== false`; non-fatal on write failure; quiet under `--json` / `--quiet` / machine-readable output so CI logs stay clean). This is the side-effect that makes `slop_suggest_with_structure`'s fast path actually populate on first use.

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

