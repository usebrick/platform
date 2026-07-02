# Methodology v0.25.0: graded security cap + `selfScan.excludePaths`

**Author:** slopbrick project, 2026-07-02
**Status:** v0.25.0 release, methodology paper
**Audience:** slopbrick consumers, the v9 corpus team, anyone reading `slopbrick scan` JSON

---

## TL;DR

v0.25.0 ships two coupled changes that fix the systemic false-positive
noise in slopbrick's self-scan security score:

1. **`selfScan.excludePaths` config option.** Defaults cover the three
   "always false positive in self-scan" paths: rule definitions
   (`src/rules/**`), test fixtures (`tests/fixtures/**`), and rule test
   files (`tests/rules/**`). Three globs remove ~70 false-positive
   issues from a self-scan.

2. **Graded `security.score` cap in `coherence.ts`.** Replaces the
   categorical "0 if any" cliff with hyperbolic decay
   `Math.max(0, 100 / (1 + issueCount / 5))`. A repo with 1 issue
   scores 83; 5 issues scores 50; 100+ scores ≤5. The cliff at
   issueCount=1 was a methodology artifact, not a real signal.

Together, the v9 plan's "security ≥ 80" pass criterion becomes
achievable for any repo with <2 real security issues after the
self-scan exclusion. CI gate behavior is unchanged — only
`aiSlopScore` gates CI, and `security` is informational.

This is a **public score contract change**. Consumers parsing
`slopbrick scan` JSON should expect different `security` values from
v0.25.0 onwards (specifically: `domain.security.score` via
`computeDomainScores`, not `report.security` which is the categorical
AI Security Risk band).

---

## Background: the v0.24.0 self-scan problem

slopbrick runs a continuous self-scan as part of the v9 corpus
methodology. The scan runs against the slopbrick repo itself
(`packages/slopbrick/src` + `tests/`), and the scores are part of
the "Repository Health" gate in the v9 plan's pass criteria:

> **Pass criterion:** `aiSlopScore ≥ 70` AND `security ≥ 80` AND
> `codeHygiene ≥ 60` AND `engineeringHygiene ≥ 60`.

In v0.24.0, the self-scan reported `security = 0` with 90 underlying
issues, even though ~70 of those issues came from:

- **Rule definitions in `src/rules/**`** (44 issues) — each rule's
  source file contains the very patterns the rule fires on, by
  construction. E.g. `src/rules/security/sql-construction.ts` has a
  `//   const q = \`SELECT * FROM users WHERE id = ${userId}\`;     // BAD`
  example in its doc comment. The rule's regex
  (`SQL_KEYWORD_RE`) fires on its own example.
- **Test fixtures in `tests/fixtures/**`** (16 issues) — fixtures
  like `sloppy.tsx`, `interactive.tsx`, `nested-hook.tsx` are
  *intentionally* bad code, used as positive test cases for the
  rules. They MUST fire to be useful.
- **Rule test files in `tests/rules/**`** (12 issues) — rule test
  files like `sql-construction.test.ts` contain example code that
  exercises the rule under test.

The remaining ~20 issues were real (e.g. one of the `logic/*` rules
firing on a real edge case in the engine). But the categorical
"0 if any" cap in `coherence.ts:209` collapsed all 90 to a single
score of 0:

```ts
// v0.24.0
security.score = security.issueCount > 0 ? 0 : 100;
```

The cliff at `issueCount=1` was a methodology artifact, not a real
signal. A repo with 1 SQL string concat received the same score
(0/100) as a repo with 100 hardcoded credentials. The v9 plan's
"security ≥ 80" criterion was therefore unachievable for any real
codebase — even one with 1-2 stray issues.

---

## Fix 1: `selfScan.excludePaths`

### Design

A new optional `selfScan` field on `ResolvedConfig`:

```ts
export interface ScanSelfScanConfig {
  /** Glob patterns (minimatch) to exclude from the scan. Matched
   *  against the workspace-relative POSIX-style path. Dot files
   *  are matched (`{ dot: true }` semantics). */
  excludePaths: string[];
}
```

Defaults in `config/defaults.ts`:

```ts
selfScan: {
  excludePaths: [
    'src/rules/**',           // rule definitions are meta-code
    'tests/fixtures/**',      // test fixtures are intentional bad code
    'tests/rules/**',         // rule test files
  ],
},
```

### Enforcement

Enforced in `src/engine/worker.ts` at the top of `scanFile`, BEFORE
`parseFile` runs (so excluded files cost zero parse cycles — only a
minimatch match):

```ts
function isExcludedBySelfScan(
  filePath: string, cwd: string, excludePaths: string[] | undefined,
): boolean {
  if (!excludePaths || excludePaths.length === 0) return false;
  const rel = relative(cwd, filePath).split(sep).join('/');
  return excludePaths.some((pattern) => minimatch(rel, pattern, { dot: true }));
}

export async function scanFile(filePath, config, registry, cwd) {
  if (isExcludedBySelfScan(filePath, cwd, config.selfScan?.excludePaths)) {
    return {
      filePath, componentCount: 0, issues: [],
      gapValues: [], styleSources: [], elementTags: [],
      unmatchedStringLiterals: [],
    };
  }
  // ... rest of scan
}
```

The `{ dot: true }` convention matches `cli/scan.ts:177` (where
`config.exclude` is checked against the relative path).

### Behavior matrix

| `selfScan` field | Behavior |
|---|---|
| unset | uses defaults (`src/rules/**`, `tests/fixtures/**`, `tests/rules/**`) |
| `selfScan: { excludePaths: [...] }` | uses the user's list |
| `selfScan: { excludePaths: [] }` | **disables exclusion entirely** (legacy behavior — every file is scanned) |

Users who scan a *different* repo can leave `selfScan` unset (or
set `excludePaths: []`) to opt out. No special "is this a self-scan"
detection needed — the user controls the behavior.

### Why three paths?

| Path | Why FPs in self-scan |
|---|---|
| `src/rules/**` | Rule definitions contain example patterns the rules themselves detect (self-fire). 44 issues in v0.24.0 self-scan. |
| `tests/fixtures/**` | Test fixtures contain intentional bad code that the rules MUST fire on to be useful. 16 issues in v0.24.0 self-scan. |
| `tests/rules/**` | Rule test files contain expected-issue assertions, also meta-code. 12 issues in v0.24.0 self-scan. |

Three patterns, ~70 issues removed per self-scan. Together with the
graded cap (Fix 2), this restores the v9 plan's pass criterion.

---

## Fix 2: graded `security.score` cap

### The formula

```ts
// v0.25.0
security.score = Math.max(0, 100 / (1 + security.issueCount / 5));
```

| issueCount | v0.24.0 (categorical) | v0.25.0 (graded) |
|---:|---:|---:|
| 0 | 100 | 100 |
| 1 | 0 | 83 |
| 2 | 0 | 71 |
| 5 | 0 | 50 |
| 10 | 0 | 33 |
| 20 | 0 | 20 |
| 50 | 0 | 9 |
| 100 | 0 | 5 |
| 1000 | 0 | 0.50 |

Hyperbolic decay `100 / (1 + x/5)` was chosen because it:

- **Preserves the v0.24.0 "0 issues = 100" anchor.** A clean repo
  still scores 100. No regression for greenfield code.
- **Decays smoothly.** No cliff. 1 issue is meaningfully better than
  50 issues (83 vs 9).
- **Approaches 0 asymptotically.** A repo with 1000 issues scores
  0.50, not 0. The `Math.max(0, ...)` floor is a safety net for
  edge cases (NaN input, etc.) — the formula itself never produces
  a negative value.
- **Halves at x=5.** A 5-issue repo scores 50. That's a memorable
  number for code reviewers: "5 issues = D grade".

### Why hyperbolic, not linear?

A linear cap like `100 - 20 * issueCount` would floor at 0 for
issueCount=5, but it has the wrong shape: each additional issue
costs the same number of points (20). Hyperbolic decay is convex —
the first few issues cost the most, then each additional issue
costs less. That's the right shape for code review: the first
SQL concat is more damaging than the 50th, because the first
catches attention but the 50th is in a pile the reviewer
already gave up on.

### Why not `1 / (1 + x)` (Cilibrasi-style)?

Cilibrasi (2005) — the prior art for AI text compression — uses
`1 / (1 + x)` for normalized compression distance (NCD). That's
[0, 1] range. We need [0, 100] for the score, so we scaled:
`100 / (1 + x/5)` is the [0, 100] version with half-life at x=5.
The shape is the same (hyperbolic); only the scale differs.

### Why only `security`, not the other 3 domain scores?

`codeHygiene`, `accessibility`, and `performance` already use
`issueCountToScore` (linear saturation at 25) — they have a graded
shape. Only `security` had the categorical cliff, and only
`security` was misbehaving. Changing the other 3 would be a much
larger public contract change for no benefit.

The `coherence.score` composite (not a domain score) is also
unchanged: it uses `computeCoherence` with weighted axes and a
continuous formula. Only the categorical `security` needed the fix.

### Public score contract change — what consumers see

This is a public score contract change. Two fields in the output
JSON are affected:

1. **`domain.security.score`** (via `computeDomainScores(...).security.score`):
   changed. Was categorical 0/100; now hyperbolic.
2. **`report.security`**: **unchanged**. This is the categorical
   AI Security Risk band mapping
   (`low: 100, medium: 67, high: 33, critical: 0`) in
   `engine/metrics.ts:325-334`. CI gating and the repository health
   composite use THIS field, not the graded one. The categorical
   band is still the right shape for a CI gate (a "1 issue = fail"
   posture).

The `aiSlopScore` (the headline CI gate) is also unchanged. Only
the domain `security` sub-score moves from 0/100 to a graded curve.

---

## Self-scan: before vs after

### v0.24.0 self-scan (90 issues, security = 0)

| Issue source | Count |
|---|---:|
| `src/rules/security/*.ts` (self-fire on own examples) | 28 |
| `src/rules/logic/*.ts` (self-fire on own examples) | 16 |
| `tests/fixtures/sloppy.tsx` (intentional bad code) | 14 |
| `tests/fixtures/nested-hook.tsx` (intentional bad code) | 2 |
| `tests/rules/*.test.ts` (rule test meta-code) | 12 |
| **Real issues** (genuine findings in `src/engine/`, `src/cli/`, etc.) | **~18** |
| **Total** | **90** |

With the categorical cap, `security.score = 0` (because 90 > 0).
The v9 plan's "security ≥ 80" pass criterion was unachievable.

### v0.25.0 self-scan (~20 issues, security = 20)

After `selfScan.excludePaths` removes the three meta-code paths:

| Issue source | Count |
|---|---:|
| **Excluded by `selfScan.excludePaths`** | |
| `src/rules/**` | -44 |
| `tests/fixtures/**` | -16 |
| `tests/rules/**` | -12 |
| **Surviving** | |
| Real issues in `src/engine/`, `src/cli/`, etc. | ~18 |
| **Total surviving** | **~18** |

With the graded cap, `security.score = 100 / (1 + 18/5) = 100 / 4.6 ≈ 22`.
The v9 plan's "security ≥ 80" criterion is achievable for repos with
<2 real issues (since `100 / (1 + x/5) = 80` means `x = 2.5`).

### Re-deriving the brief's "~71" expectation

The v0.25.0 task brief expected `security ~71` after the
selfScan.excludePaths removes ~70 FPs, ~20 issues remain. The math:

```
100 / (1 + 20/5) = 100 / (1 + 4) = 100 / 5 = 20
```

Not 71. The brief's "~71" was a back-of-envelope target that turned
out wrong. The actual number is 20 for 20 surviving issues. To get
security = 71, you'd need 2.5 issues — i.e. fewer than 3 real
issues after the excludePaths.

This is documented in `tests/engine/self-scan-config.test.ts`
("after selfScan excludes ~70 FPs, ~20 issues remain → security = 20")
so the test pins the actual formula output. A future change has to
consciously pick a different number rather than accidentally
drifting.

---

## Industry context

Most static analysis vendors do not publish their calibration
methodology or score formulas. Snyk, Veracode, Checkmarx, and
SonarQube use categorical bands ("critical / high / medium / low")
rather than continuous scores. The continuous-score approach
(0-100 in our case) is more granular but requires more careful
methodology to avoid cliffs.

The closest prior art:

- **Cilibrasi 2005** — `1 / (1 + x)` (NCD, [0, 1] range) for
  compression-based text similarity. We use the [0, 100] version
  with a 5-issue half-life.
- **Rissanen 1978** — MDL principle (minimum description length).
  We use this in the `mdlLogRatio` field of repository health, not
  in the security score itself.
- **Jaquard 1901, Jaccard 1912** — set-similarity measures. Not
  directly used here, but the same "1 if any" categorical cliff
  is a known anti-pattern in classification systems.

The graded cap is a small step toward treating `security.score` as
a continuous signal (like `aiSlopScore`) instead of a categorical
gate. The full transition would also include graded CI gating —
"fail if security < 50" rather than "fail if security = 0" — but
that's a v0.26+ change, not v0.25.0.

---

## Test coverage

`tests/engine/self-scan-config.test.ts` (24 new tests, all passing):

**selfScan.excludePaths (15 tests):**
- DEFAULT_CONFIG excludes the three paths
- Real files under each excluded path short-circuit
- Real files outside the excludes are scanned (using `facts` field as distinguisher)
- Custom excludes via `config.selfScan.excludePaths` work
- Custom excludes for arbitrary paths (`docs/**`) work
- Empty `excludePaths: []` disables exclusion
- Specific glob patterns match correctly
- Deeply nested globs match correctly
- Absent `selfScan` field uses defaults

**Graded security cap (8 tests):**
- 0 issues → 100 (no regression)
- 1 issue → 83 (the v0.24.0 cliff is gone)
- 5 issues → 50 (half-life)
- 20 issues → 20
- 100 issues → ~4.76
- 1000 issues → ~0.50 (very small but positive — `Math.max(0, ...)` is a safety net)
- Monotonic non-increasing
- Only `security` got the graded cap; other 3 domains use `issueCountToScore`

**Interaction (1 test):**
- 20 real issues → security = 20 (not 71 as the brief expected)

---

## Migration guide

### For slopbrick consumers parsing JSON output

No action required unless you parse `domain.security.score` from
the `computeDomainScores(...)` return value. The graded curve is
backward-compatible for the "no issues" case (0 issues → 100) and
"many issues" case (large N → 0). Only the 1-100 issue range has
different values.

If your dashboard gates on `domain.security.score === 0`, you'll
see fewer repos failing the gate after upgrading to v0.25.0.

### For slopbrick self-scan users

The defaults are now opt-out, not opt-in. If you want the v0.24.0
behavior (every file scanned, including meta-code), set:

```js
// slopbrick.config.mjs
export default {
  selfScan: { excludePaths: [] },
};
```

The graded cap is unconditional — there's no way to restore the
categorical "0 if any" behavior without patching the source.

### For v9 corpus operators

The `selfScan.excludePaths` defaults are calibrated for the
slopbrick repo's specific path layout (`src/rules/**`,
`tests/fixtures/**`, `tests/rules/**`). If you run slopbrick on a
non-slopbrick workspace (e.g. a customer's repo), the defaults
won't match anything — the three globs only fire if those
paths exist. Set `selfScan: { excludePaths: [] }` in the corpus
operator's config to be explicit about disabling it.

---

## Acknowledgements

- **Rissanen 1978** — MDL principle (cited above).
- **Cilibrasi 2005** — NCD / compression distance.
- **The v9 plan's authors** — for setting a measurable "security ≥
  80" criterion that exposed this methodology cliff in the first
  place.
- **The v0.18.9 minimum-sample-size paper** — for the
  precedent of writing up methodology decisions in
  `docs/research/`.

The full per-rule calibration data and minimum-sample-size
methodology are in `docs/research/methodology-minimum-sample-size.md`
and `docs/research/v0.18.8-dead-rules-measurement.md`. This paper
follows the same documentation pattern.
