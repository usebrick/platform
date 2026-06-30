# slopbrick Scoring Runbook

> **v0.15.0+:** `slopbrick` reports a **headline 4-score model** for the user-facing surface and a **13-subscore diagnostic surface** behind `--format json` / `--format detailed`. This runbook covers both.

## The 4-score headline (user-facing surface)

| Score | Direction | One-line question |
|-------|-----------|-------------------|
| **AI Quality** | Higher is better | "Does this look like AI wrote it? And is it any good?" |
| **Engineering Hygiene** | Higher is better | "Is this codebase internally consistent — one stack, one pattern, no drift?" |
| **Security** | Higher is better | "Are there security holes?" |
| **Repository Health** (composite) | Higher is better | "Will the codebase hold up at scale?" |

`Repository Health` (composite) is a weighted sum of the 3 sub-scores plus secondary signals (architecture consistency, test quality, business logic coherence, doc freshness, DB health).

**Why 4 scores, not 1:** The legacy `slopIndex` conflated AI-specific findings with engineering hygiene. Two repos could both score 70/100 for completely different reasons — one had AI drift, the other had pattern fragmentation. The 4-score model lets users see the actual problem. See [`docs/scoring-explained.md`](./scoring-explained.md) for the full math.

---

## The 13-subscore diagnostic surface (calibration audience)

| Score | Shape | Direction | Drives |
|-------|-------|-----------|--------|
| **AI Quality** | 0–100 | **Higher is better** | Threshold gates in CI (`meanSlop`, `p90Slop`, `individualSlopThreshold`) |
| **Architecture Consistency** | 0–100 | **Higher is better** | `slopbrick architecture` subcommand + dashboard trend |
| **Pattern Fragmentation** | 0–100 | **Higher is better** | `slopbrick patterns` + input to `slop_suggest`'s doNotCreate list |
| **AI Security Risk** | categorical | Ordered: `low < medium < high < critical` | `slopbrick security [--strict]` CI gate |
| **Constitution drift** | pass / fail | **No violations = pass** | `slopbrick drift` subcommand; exit 1 on any violation |
| **Design-token drift** | inline violations | **Zero = clean** | `slopbrick scan --fix` auto-rewrites offenders |
| **Test Quality** | 0–100 | **Higher is better** | `slopbrick test` subcommand |
| **Business Logic Coherence** | 0–100 | **Higher is better** | `slopbrick business-logic` subcommand |
| **Documentation Freshness** | 0–100 | **Higher is better** | `slopbrick docs` subcommand |
| **Database Health** | 0–100 | **Higher is better** | `slopbrick db` subcommand |
| **Engineering Hygiene** | 0–100 | **Higher is better** | Composite of architecture + patterns + constitution + AI debt |
| **Repository Health** (composite) | 0–100 + `AI Debt` band | **Higher is better** | Headline number |
| **AI Maintenance Cost** | `$/month` | **Lower is better** | `slopbrick maintenance-cost` |
| **AI Debt band** | A / B / C / D / F | **Higher is better** | Letter grade from composite |

The 4 headline scores + 9 secondary scores are computed independently. A project can score `AI Quality 90` (great code quality) AND `AI Security Risk CRITICAL` (hardcoded API key). Do not let one score mask another.

---

## Per-rule Precision / Recall / FPR (v4.1, the form engineers trust)

Beyond the headline scores, each rule has a measured per-rule P/R/FPR against the v4 corpus. This is the calibration evidence behind the headline 5-bucket score.

| Verdict | Definition | Count | Action |
|---------|------------|------:|--------|
| **USEFUL** | P ≥ 50% AND lift ≥ 2× | 18 | gate on these in CI |
| **OK** | P ≥ 30% AND lift ≥ 1.5× | 7 | usable, lower confidence |
| **NOISY** | everything else | 9 | don't gate on these |
| **INVERTED** | lift < 1.0 | 11 | fires more on human than AI; needs different corpus |
| **DORMANT** | 0 fires both | 1 | needs new corpus (DnD-heavy) |

Per-rule precision / recall / FPR numbers are kept in the
operator's local calibration log (not in the public repo).

---

## 1. AI Quality (v0.15.0+ replacement for `slopIndex`)

`aiQuality` aggregates per-file, per-rule, per-category issue
densities into one number in [0, 100]. **Higher is better.**
`aiQuality = 100 − slopIndex` (the v0.15.0 model inverts the
v0.14 single-axis, where lower was better).

### Formula

`aiQuality` is computed as the inverted version of the v0.14
`slopIndex` formula: `100 − S`, where

```
S = (0.40 × S_boundary) + (0.35 × S_context) + (0.25 × S_visual)
```

Each subscore = `min(100, severityPoints / componentCount)`,
where `severityPoints = sum(SEVERITY_WEIGHTS[issue.severity])`
for issues in that bucket.

**Bucket mappings:**
- **Boundary (40%)** — structural integrity: file-size limits, multiple components per file, direct API calls in UI.
- **Context (35%)** — prop correctness, imports, state management.
- **Visual (25%)** — CSS, layout, typography, accessibility.

### Interpretation bands

The bands below use the `aiQuality` value reported by
`slopbrick scan` (higher is better — opposite of v0.14).

- **90–100:** Very clean; likely hand-maintained or heavily reviewed.
- **75–89:** Typical AI-assisted codebase; address high/critical issues first.
- **50–74:** Visible drift; treat as technical debt with active cleanup.
- **0–49:** High slop; prioritize refactoring and rule tuning before adding features.

### CI gates

`slopbrick.config.mjs` accepts:

```js
thresholds: {
  // v0.15.0+: breach when aiQuality DROPS below the threshold
  // (legacy `meanSlop` field is kept for backward compat; the
  // comparison direction flipped)
  meanSlop: 25,             // fail if aiQuality < this
  p90Slop: 45,              // fail if the 90th-percentile composite > this
  individualSlopThreshold: 70,  // fail if any single file > this (per-file)
}
```

A threshold breach exits **1**. The `--no-increase` flag exits
**2** if `aiQuality` dropped since the last run.

### Empirical calibration (carried over from v0.14)

Tested against 6,142 AI-generated samples vs. 54,980
human-written samples (shadcn/ui, calcom, dub, mantine,
excalidraw, lobehub). **Mean `aiQuality` is 5× lower on AI
code than human code** — clean separation without manual
tuning. The v0.15.0 split (AI Quality / Engineering Hygiene
/ Security / Repository Health) lets users see the actual
problem (AI drift vs. internal-consistency drift) when
separation breaks down.

---

## 2. Architecture Consistency Score

`architectureConsistency` in [0, 100]. **Higher is better.** 100 = one modal system, one button variant, one API client, one state lib, one fetch lib, no off-scale values.

### Formula

```
score = 100
deductions per category:
  modalSystems           -12 per extra
  buttonVariants         -8  per extra
  apiClientModules       -10 per extra
  stateLibraries         -15 per extra  (highest)
  dataFetchLibraries     -10 per extra
  spacingScaleViolations -1  per 5 findings
  radiusScaleViolations  -1  per 5 findings
  crossFileDrift         -10 per extra variant per stem (v0.9.2)
  crossCategoryDrift     -15 per stem spanning 2+ categories (v0.9.2)
clamped to [0, 100]
```

### Interpretation bands

- **90–100:** Coherent. One of each pattern, no drift. Ship it.
- **70–89:** Mild drift. A few extra patterns have crept in. Worth a sweep before adding more.
- **50–69:** Significant drift. New patterns are competing with established ones. Recommend centralization.
- **0–49:** Architectural chaos. Multiple modal systems, multiple state libs, off-scale values everywhere. Stop adding features; refactor first.

### Audit-trail

Every deduction is named and explainable. `report.architectureDeductions` is an array of `{ category, count, weight, deduction, summary, findings }`. Use it to drive a "what changed since last month" dashboard.

### Cross-file drift (v0.9.2 — experimental capability)

Drift detection is wired into the headline score as of v0.9.2. Two new deduction categories flag the "did this code introduce a new pattern when an existing pattern already existed?" lens answer:

- **`crossFileDrift` (-10 per extra variant per stem):** same conceptual entity realized as 2+ distinct names in one category across files. Example: `UserService` + `UserManager` + `UserHandler` all strip to stem `User` → 3 variants → 2 extras → -20.
- **`crossCategoryDrift` (-15 per stem in 2+ categories):** same stem appears with 2+ variants in 2+ categories. Example: `User` exists as both a service (3 variants) and an ormModel (2 variants) → the stem spans roles → -15.

**Status: experimental.** Empirically calibrated against 10 Python + Go repos (calibration log kept in the operator's local notes):

| Category | Raw precision | Prod-only precision | Verdict |
|----------|---------------|---------------------|---------|
| `service` | **100%** (3/3) | **80%** (4/5) | Calibrated, thesis-aligned. The 1 prod FP is a borderline name-collision (semantically different concepts sharing a stem). |
| `route` | 0% (0/11) | **n/a (0 emitted)** | The 0% in raw scan is a calibration artifact — all 11 FPs are fastapi `docs_src/` tutorial routes. After excluding tutorial paths the detector correctly emits 0 signals in production fastapi. |
| `ormModel` | 0% (0/1) | 0% (0/1) | n=1 inconclusive. Borderline FP — same-file wrapper, not cross-file drift. |

**Production-only precision (after excluding tutorial / docs / tests): 66.7% overall, 80-100% on the calibrated `service` category.**

#### Why "experimental" and not "flagship"

- Sample size n=10 is illustrative, not statistically meaningful. Per-category precision is informative but not actionable for product decisions.
- Structural FN documented (vendor-style class names like `MilvusDataStore` + `PineconeDataStore` + `QdrantDataStore` — they implement the same `DataStore` interface but don't share a stripped suffix, so the detector can't cluster them).
- The `route` category's high FPR on tutorial-heavy repos means users MUST configure exclude patterns to get clean output.

**Promotion criteria for flagship (v0.9.3+):**
- n≥50 calibration repos per category
- Structural FN attack implemented (shared base class detection for vendor-style names)
- Per-category precision ≥90% with documented methodology

#### Recommended user configuration

Exclude tutorial / docs / tests paths in `slopbrick.config.mjs` to get production-only precision:

```js
export default {
  exclude: [
    'docs/**',
    'docs_src/**',
    'docs-src/**',
    'documentation/**',
    'examples/**',
    'tutorials/**',
    'demos/**',
    'playground/**',
    'benchmarks/**',
    'fixtures/**',
    'testdata/**',
    'tests/**',
    '__tests__/**',
  ],
};
```

This is the recommended baseline; tune per-project. Re-running `slopbrick` against a repo with this config produces the **production-only** precision numbers shown in the calibration report.

#### Known structural FN (chatgpt-retrieval-plugin)

The detector misses drift when sibling classes share an interface but no common suffix. Example: `MilvusDataStore` + `PineconeDataStore` + `QdrantDataStore` (6 datastore providers in `chatgpt-retrieval-plugin`) implement the same `DataStore` interface but their names don't share a stripped suffix. Adding `DataStore` to the suffix list would risk FPs elsewhere (`RedisDataStore` ≠ `RedisConfig`). Fixable only via semantic analysis (parse class declaration, see shared base class). v0.9.3 candidate.

### CLI

```bash
slopbrick architecture [--format pretty|json] [--max-files <n>]
```

JSON output emits the full `ArchitectureScore` (including `driftSignals` and `crossCategoryDrift`) for dashboards.

---

## 3. AI Security Risk

Categorical: `low | medium | high | critical`. **The order matters** — `slopbrick security --strict` exits 1 on `high` or `critical`.

### Mapping

- `critical` — ≥1 critical-severity finding **OR** ≥3 high-severity findings
- `high`     — ≥1 high-severity finding **OR** ≥3 medium-severity findings
- `medium`   — ≥1 medium-severity finding
- `low`      — 0 findings

### Why categorical

A single hardcoded API key outranks everything else. A numeric score invites gaming — a project can suppress one finding and bump from 79 to 81. Categorical levels make "AI Security Risk: HIGH" the kind of line an engineering manager scans in two seconds.

### 8 rules driving it (Tier 1 + Tier 2)

See [rule-catalog.md](./rule-catalog.md#security-8-rules--tier-1--tier-2-ai-security-risk) for the full list.

### CLI

```bash
slopbrick security [--format pretty|json] [--strict]
```

`--strict` exits **1** on `high` or `critical`. Default exit 0 (info only, like `architecture`).

### Why this is not a security scanner

Semgrep / GitHub Advanced Security / CodeQL / Gitleaks own that market. We catch *AI-induced* security failures — patterns AI generates disproportionately. Hardcoded secrets, exposed env vars, fail-open auth, SQL string-concat. Real projects use slopbrick alongside a real scanner.

---

## 4. Constitution drift

Binary pass / fail. **No violations = pass.** Computed from `constitution` declared in `slopbrick.config.mjs`.

### CLI

```bash
slopbrick drift [--format pretty|json] [--max-files <n>]
```

- Exit **0** — no violations (or no constitution declared)
- Exit **1** — at least one violation (CI-friendly)
- Exit **2** — fatal error (config / IO)

### How to read

```
Constitution drift report

  Scanned files:          1
  Files with violations:  1
  Total violations:       1
  Constitution source:      declared

  Declared constitution:
    stateManagement: zustand

  Violations by category:
    stateManagement      1

  Violations:
  src/bad.ts
    [stateManagement] Constitution violation: project declares 'zustand' for state management, but this file imports 'redux' (canonical: 'redux').
```

### MCP integration

`slop_check_constitution(path)` returns the same violation list per-file for AI agents that need to check before PR.

---

## 5. Design-token drift

Inline violations. **Zero = clean.** Driven by `spacingScale` + `radiusScale` declared in `slopbrick.config.mjs` (defaults match Tailwind).

### Auto-fix

Both `visual/spacing-scale-violation` and `visual/radius-scale-violation` emit `fixes: [{ kind: 'replace', oldValue, newValue }]` so:

```bash
slopbrick scan --fix
```

rewrites `p-[13px]` → `p-1` and `rounded-[7px]` → `rounded-md` automatically.

### How to read

A single `p-[13px]` in a 50k-line codebase is one violation. The architecture score deducts 1 point per 5 violations — design-token drift doesn't dominate the architecture score, but it's visible per-issue.

---

## 6. PR slop score

A single weighted number per PR. Scans only the files changed between `--base` and `--head`, sums weighted slop points plus constitution violations, and exits 1 when the total exceeds the threshold.

### CLI

```bash
slopbrick pr [--base <ref>] [--head <ref>]
              [--format text|json|markdown]
              [--threshold <n>] [--max-files <n>]
```

Defaults: `--base main` (falls back to `master`, then the first
commit), `--head HEAD`, `--format text`, `--threshold 20`,
`--max-files 500`. The diff uses three-dot syntax
(`git diff --name-only base...head`) so the result matches GitHub's
PR view (merge-base comparison).

### Formula

Per file:

```
slop       = sum(SEVERITY_WEIGHTS[issue.severity]) for all issues
violations = count of constitution violations
total      = slop + violations
```

`SEVERITY_WEIGHTS` is the same constant the engine uses for
`slopIndex` (`low=1, medium=3, high=5`). Constitution violations
include both canonical-category mismatches and `forbidden`
deny-list hits — see [§4 Constitution drift](#4-constitution-drift).
PR score = sum of per-file totals.

### Default threshold

`20` (configurable). With this default, a PR can introduce:

- 4 high-severity issues (`4 × 5 = 20`)
- ~6.5 medium-severity issues (`6 × 3 = 18` + 2 low)
- 20 low-severity issues (`20 × 1 = 20`)
- any combination of the above plus up to 20 constitution violations

before failing. Tighten the threshold for stricter projects:

```js
// slopbrick.config.mjs
export default {
  prScoreThreshold: 10, // fail PRs adding more than 10 slop points
};
```

Or override per invocation: `slopbrick pr --threshold 0` (fail on
any issue at all).

### CI gate

```yaml
# .github/workflows/pr.yml
- name: PR slop score
  run: npx slopbrick pr --threshold 10
  # exits 1 when score > 10
```

### Exit codes

- `0` — score ≤ threshold (PASS)
- `1` — score > threshold (FAIL — PR adds too much slop)
- `2` — fatal error (not a git repository, config / IO failure)

### Output formats

- `text` (default) — human-readable, per-file issue list with
  severity, rule ID, line number, and constitution violations
  called out separately.
- `json` — full structured `PrResult` for dashboards / status
  checks. Includes `base`, `head`, `filesChanged`, `totalScore`,
  `threshold`, `byCategory`, `bySeverity`, `files[]`, and `passed`.
- `markdown` — GitHub-flavored markdown with `<details>` blocks per
  file, suitable for posting as a PR comment.

---

## How the six scores interact

```
                        ┌─────────────────────────────┐
                        │      slopbrick scan        │
                        │     runs all 52 rules       │
                        └──────────────┬──────────────┘
                                       │
        ┌──────────────┬───────────────┼───────────────┬──────────────┬──────────────┐
        ▼              ▼               ▼               ▼              ▼              ▼
   Slop Index    Architecture    AI Security    Constitution    Design-token    PR slop
   (0–100)       Consistency     Risk           drift          drift          score
   numeric       (0–100)         categorical    pass/fail      per-file       (numeric)
                                  low/med/                       violations
                                  high/crit
        │              │               │               │              │              │
        ▼              ▼               ▼               ▼              ▼              ▼
   CI gate         Dashboard      CI gate         CI gate       --fix auto-    PR CI gate
   (--strict,      (trends)       (--strict        (drift)        rewrite       (pr --threshold)
   --no-                            command)
   increase)
```

A project that scores well on all six:
- Slop Index <25 (clean code)
- Architecture Consistency >85 (one of each pattern)
- AI Security Risk: low (no AI-induced security failures)
- Constitution drift: pass (no violations)
- Design-token drift: 0 violations (no off-scale values)
- PR slop score ≤ threshold (per-PR)

...has high repository coherence. A project with all six at the bad
end is being destroyed by AI drift.

---

## Reference baselines

These are sample projects run against `slopbrick` for calibration; they are not stored in the repo.

| Project | Slop Index | Architecture | Security | Top Categories |
|---------|-----------|--------------|----------|----------------|
| clean-react | 0 | 100 | low | — |
| clean-next | 0 | 100 | low | — |
| sloppy-react (vibe-coded) | 72 | 37 | high | visual, wcag, logic |
| sloppy-next (vibe-coded) | 59 | 41 | high | logic, visual |

The clean projects hit 100 across the board. The sloppy projects drag on every axis — visual, architecture, and security all degrade together. **Repository coherence moves as a single trajectory.**

---

## See also

<!-- v0.18.6: ai-slop-rule-catalog.md renamed to docs/rule-catalog.md -->
- [rule-catalog.md](./rule-catalog.md) — design philosophy + what slopbrick is / isn't
- [rule-catalog.md](./rule-catalog.md) — every rule with severity + AI-specific flag
- [framework-parity-matrix.md](./framework-parity-matrix.md) — per-rule framework coverage
- [ROADMAP.md](../ROADMAP.md) — strategic positioning + 12-phase plan
