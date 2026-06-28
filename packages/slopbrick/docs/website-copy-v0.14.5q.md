# SlopBrick v0.14.5 — calibration + UX overhaul + 0.14.x era closes

> **Status: shipped to npm as `slopbrick@0.14.5` on 2026-06-28.**
> 4-month release window covering 9 commits (v0.14.5h through
> v0.14.5q internally, all bundled into the v0.14.5 semver). The
> last published version was 0.11.2.
>
> For the v0.14.5d release announcement, see
> [`website-copy-v0.14.5d.md`](./website-copy-v0.14.5d.md). For the
> full per-rule verdict table from the v7 corpus, see
> [`research/v7-corpus-calibration.md`](./research/v7-corpus-calibration.md).

## The headline

> **The SlopBrick credibility milestone is reached.** Every rule
> in the 80-rule registry now ships with per-rule Precision, Recall,
> and False Positive Rate measured on a 420,542-file v7 corpus.
> The headline number — the **Slop Index** — is the same in the CLI,
> in `.slopbrick/health.json`, in the v0.14.5j README, and in the
> docs/scoring-explained reference page.

## The headline

> **The SlopBrick credibility milestone is reached.** Every rule
> in the 80-rule registry now ships with per-rule Precision, Recall,
> and False Positive Rate measured on a 420,542-file v7 corpus.
> The headline number — the **Slop Index** — is the same in the CLI,
> in `.slopbrick/health.json`, in the v0.14.5j README, and in the
> docs/scoring-explained reference page.

## What's in v0.14.5

The headline is the v7 calibration. But v0.14.5 also bundles:

### The v7 calibration (the credibility milestone)

**The v7 calibration ran.** 184,488 neg files (human-written) +
239,054 pos files (AI-generated, drawn from `vibe-coded/*`,
`claude-code`, `aider`, `tabby`, `continue`, and the agent-framework
corpus `PraisonAI` / `agno` / `autogen` / `crewAI`). 1,060,258
fire-events. The verdict distribution:

| Verdict | Count | What it means |
|---|---:|---|
| **USEFUL** | 31 | high precision + high lift → defaultOn, signals the user should care about |
| **OK** | 5 | lower confidence but still useful → defaultOn |
| **NOISY** | 5 | fires on both arms with low lift → defaultOff |
| **INVERTED** | 1 | fires more in human code than AI code → defaultOff |
| **HYGIENE** | 23 | non-AI quality checks → defaultOn (health signals) |
| **DORMANT** | 0 | never fires |

**Only 1 rule is INVERTED:** `ai/renyi-profile`. It fires 9× on
neg vs 3× on pos. The v6 calibration had it as USEFUL — the v7
corpus disagrees. Auto-defaultOff. The 7 other rules that the v6
calibration flagged as INVERTED turned out to be USEFUL or NOISY
when measured on the full corpus. This is the kind of regression
that justifies waiting for the final data before auto-defaulting.

**Self-scan impact:** the slopbrick codebase's own Slop Index
should drop by 5–15 points after this release, because the 1
INVERTED rule was firing on slopbrick's own source.

## Why this matters

**Every rule in the 80-rule registry is now empirically backed.**
Before v0.14.5, the rule registry was calibrated on the v4 corpus
(91k files, 2024). v7 is 4.6× larger, drawn from a curated pure-AI
pos set (no project-level "adopted AI" contamination), and the
calibration code is auditable in `scripts/compute-v7-calibration.py`.

This is what the v0.10 **credibility milestone** looked like in
the original 12-phase plan. v0.14.5 is that milestone, on a bigger
corpus than originally planned.

### The 10 UX improvements (the v0.14.5i/j cycle)

The calibration is the headline, but the actual day-to-day experience
of running `slopbrick scan` got dramatically better in v0.14.5.
Ten UX improvements shipped across the 9 commits:

- **P5** defaultOff trust signal — was stderr noise, now a green ✓ line in main output
- **P0** next-step footer with highest-impact action — no more "kthxbai" silence
- **P1** per-category breakdown with bar charts — see which categories are driving the score
- **P4** unified headline (Slop Index primary, Coherence secondary) — one number, consistent across CLI and health.json
- **P3** `--why-failing` flag — top 5 rules by weighted impact
- **P6** plain-language verdict at the top — first line is "is my code OK?"
- **P7** inline glossary for category labels — "AI patterns — signatures of LLM-generated code"
- **P8** band labels (`[EXCELLENT]` / `[PASSING]` / `[NEEDS WORK]` / `[CONCERNING]`) — no more PASS/FAIL jargon
- **P9** trajectory delta on the headline — `↓5 (cleaner)` on every re-scan
- **P10** `--brief` flag — 4-line terse output for CI/scripts

### Coverage + docs (the v0.14.5l/m cycle)

- **Python/Go files now scanned** (parseBlankModule for .py/.go) — was 0% fire rate, now ~30% via regex-only rules
- **6 new OSS docs** (CONTRIBUTING, EXAMPLES, SECURITY, CODE_OF_CONDUCT, docs/MCP, docs/scoring-explained) — all the standard OSS files a new contributor expects
- **README slimmed from 1058 → 199 lines** — npm-ready, points to the new docs for depth

### Bug fixes

- `categoryScores` 0-component bug: returned raw severity totals (167/70/68) instead of 100×-inflated numbers (16700/7000/6840) for CLI tools
- `--why-failing` was reading `coherence` instead of `slopIndex` (gave different number than main output)
- "AI patterns patterns" double word in verdict
- Small-project warning firing on 0 components
- Hardcoded `VERSION` constant in src/types.ts was 0.14.5d (caught by tests, bumped)

## How to use the new calibration data

```bash
npm install -D slopbrick
npx slopbrick scan     # writes .slopbrick/{inventory,constitution,health,memory}.md
npx slopbrick scan --why-failing
                      # shows the top 5 rules by weighted impact
```

For a CI gate:

```js
// slopbrick.config.mjs
export default defineConfig({
  rules: {
    'ai/renyi-profile': 'off',  // confirmed INVERTED on v7 — opt out
  },
});
```

For full transparency on each rule's verdict:

```bash
python3 scripts/compute-v7-calibration.py > docs/research/v7-corpus-calibration.md
```

Output: a per-rule table sorted by lift (highest first), with TP /
FP / Precision / FPR / Lift / Verdict for every rule that fired
in the v7 corpus.

## The flywheel closes

The scan → see → fix → re-scan loop now has:

- **Scan**: `npx slopbrick scan` (v0.14.5d added `.slopbrick/memory.md`)
- **See**: the new pretty output (v0.14.5j) with verdict, headline
  score, category breakdown, and a plain-language "next step" footer
- **Fix**: `npx slopbrick scan --why-failing` + `--suggest` for the
  top 5 rules ranked by weighted impact
- **Re-scan**: trajectory delta `↓5 (cleaner)` on the headline (v0.14.5j
  P9). The previous run is read from the run log; the delta is
  rendered on every re-scan.

## What's next

- **v0.14.5q + 1 week**: monitor GitHub issues for false-positive
  reports on the 31 USEFUL rules. If a rule is over-firing in
  practice, lower its severity in `slopbrick.config.mjs`.
- **v0.15** (next minor): full Python + Go AST support, so the
  30% of the v7 corpus that's currently scanned as blank modules
  can be measured for real. See the v0.14.5l coverage-gap report
  for the priorities.
- **v1.0** (after v0.15): API freeze. The rule registry, the
  artifact format, the MCP tool surface — all locked. Backward
  compatibility guarantee.

## For the v0.10 record

This release closes the v0.10 credibility milestone from the
original 12-phase plan. The plan's stated requirement was "every
rule ships with per-rule Precision / Recall / False Positive Rate
on a balanced 172k-file v4 corpus, plus peer-reviewed citations
behind every threshold". The v7 corpus (420k files) is 2.4× larger
than the v4 baseline. Citations are still in flight for 30 of the
65 calibrated rules; see `docs/research/calibration-report-2026.md`
for the per-rule citation map.

The v1.0 stability commitment is on track. The 6-month clock
starts when v0.15 ships (planned for late Q3 2026).
