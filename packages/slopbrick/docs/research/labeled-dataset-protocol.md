# Labeled dataset protocol — v0.9.1 calibration validation

**Goal:** Validate the v4.1 per-rule P/R/FPR calibration against hand-scored ground truth on a small (50–100 repo) dataset. Find rules where empirical precision/recall diverges from calibration, so v0.9.1 can adjust thresholds or fix rule logic.

**Target:** 20 repos in v0.9.1 (10 positive, 10 negative), scaling to 50–100 if findings warrant.

---

## Why a labeled dataset

v4.1 calibration uses **bulk statistical thresholds** computed across 95k+ frontend files and 100k+ full-corpus files:
- P ≥ 50% AND lift ≥ 2× = USEFUL (18 rules)
- P ≥ 30% but lift < 2× = OK (7 rules)
- Lift ≤ 1× = NOISY (9 rules)
- Neg-corpus has more fires than pos = INVERTED (11 rules)
- < 5 fires total = DORMANT (1 rule)

These thresholds are corpus-relative, not ground-truth. They tell us *which rules separate vibe-coded code from hand-written code* — but not whether the fires are *real issues*.

A hand-labeled dataset answers the second question:
- **Precision** = "of the rule's fires, how many are real issues?" (TP / (TP + FP))
- **Recall** = "of the real issues in the repo, how many did the rule catch?" (TP / (TP + missed))
- **FPR** = "of the rule's fires on hand-written code, how many are false alarms?" (FP / total_neg_fires)

The empirical numbers should match the calibration thresholds within a few percentage points. If they don't, either the calibration is off or the rule logic has bugs.

---

## Sampling strategy

**Source:** the v4 corpus at `/Users/cheng/corpus-expansion/`:
- `positive/vibe-coded/` — 100 repos hand-picked for AI-vibe-coding tells (Kaggle, blog posts, AI-tagged GitHub PRs)
- `negative/` — 101 repos of mainstream hand-written OSS (popular React/Vue/Svelte projects)

**Per v0.9.1 round:** pick 10 positive + 10 negative from this corpus. Stratify so every USEFUL rule category has at least 3 positive repos likely to trigger it:

| Rule category | Coverage needed | Repos |
|---------------|-----------------|-------|
| `security/*` | security-touching code | 3+ positive (auth, payments, API routes) |
| `visual/*` | UI-heavy code | 3+ positive (form pages, dashboards) |
| `logic/*` | state + effects | 3+ positive (forms, animations, lists) |
| `test/*` | AI-generated tests | 3+ positive (with test suites) |
| `component/*` | React/Vue/Svelte components | 3+ positive (component-heavy apps) |

If v0.9.1 round 1 surfaces a rule whose calibration diverges wildly, pull more repos for that rule's category in round 2.

---

## Scoring protocol

For each repo:

1. **Run the engine** — `node bin/slopbrick.js scan --format json --workspace <repo> > fires.json` to capture all rule fires.

2. **Build a manifest** — for each fire, the manifest row is:
   ```
   repo, file_relpath, rule_id, line, severity, message, label
   ```
   `label` starts blank.

3. **Hand-score** — open each file at the rule's line, decide:
   - **TP** (true positive) — the rule identified a real issue that a reviewer would fix
   - **FP** (false positive) — the rule fired but the code is fine (rule logic too broad)
   - **missed** — not in fires.json, but a real issue exists at the line the rule is supposed to catch (rule logic too narrow)
   - **skip** — file is generated, vendored, or test fixture (don't count)

   Spend ~30 seconds per fire. For a repo with 50 fires, this is ~25 minutes.

4. **Look for missed issues** — for each rule that's "interesting" (USEFUL or OK in v4.1), scan 2–3 files in the repo that didn't fire and check whether the rule *should* have fired there. Record any misses.

5. **Compute per-rule stats** for the repo:
   ```
   TP_<rule> = count of TP labels
   FP_<rule> = count of FP labels
   missed_<rule> = count of missed labels
   ```
   Skip the file if `label = skip`.

---

## Output schema

Save to `corpus-expansion/labeled/<repo_id>.json`:

```json
{
  "repo": "owner/repo",
  "label": "positive",
  "scoredAt": "2026-07-01T...",
  "scoredBy": "cheng",
  "filesScanned": 142,
  "filesScored": 138,
  "filesSkipped": 4,
  "ruleStats": {
    "security/hardcoded-secret": {
      "TP": 3,
      "FP": 1,
      "missed": 0,
      "fireExamples": [
        {"file": "src/api/auth.ts", "line": 42, "verdict": "TP", "note": "real Stripe key in client code"}
      ],
      "missExamples": []
    },
    ...
  }
}
```

After scoring all 20 repos, aggregate into `corpus-expansion/labeled/_aggregate.json`:

```json
{
  "generatedAt": "...",
  "rules": {
    "security/hardcoded-secret": {
      "positives": {"TP": 18, "FP": 4, "missed": 1},
      "negatives": {"TP": 1, "FP": 6, "missed": 0},
      "empiricalPrecision": 0.82,   // TP / (TP + FP)
      "empiricalRecall": 0.95,     // TP / (TP + missed) on positives
      "empiricalFPR": 0.005,       // FP / total_neg_files (need to track)
      "v41Calibration": {
        "category": "USEFUL",
        "ratio": 2.29,
        "precision": 0.70
      },
      "divergesFromV41": false
    },
    ...
  }
}
```

---

## How this informs v0.9.1

After round 1 (20 repos):

1. **Rules that diverge wildly** — empirical precision < 50% when v4.1 says USEFUL → likely rule-logic bug, fix in v0.9.1
2. **Rules with low recall** — empirical recall < 30% → rule misses common patterns, fix in v0.9.1
3. **Rules that should be INVERTED** — if pos fires more than neg, the rule was wrongly classified, adjust thresholds in v0.9.1
4. **Rules whose threshold is too lax** — if empirical precision is high but at huge FPR cost, raise the minimum ratio

If no rules diverge significantly, **no v0.9.1 is needed**. Defer until item 2 surfaces real findings.

---

## Time budget

- Setup protocol doc: done (this file)
- Build aggregate script (compute empirical P/R/FPR from scored files): ~30 min
- Round 1 (20 repos × 25 min): ~8 hours spread across sessions
- Round 2 (if needed, 30 more repos): ~12 hours
- Write findings doc + decide v0.9.1 scope: ~2 hours

Total: ~22 hours for round 1 + 2 + decision. Achievable in 5–7 sessions.

---

## Cross-references

- [`docs/research/v4-per-rule-pr-fpr.md`](./v4-per-rule-pr-fpr.md) — v4.1 P/R/FPR table being validated
- [`docs/research/calibration-report-2026.md`](./calibration-report-2026.md) — v4.1 narrative + corpus construction
- `/Users/cheng/corpus-expansion/` — corpus being sampled
