# SlopBrick scoring runbook

This is the operator guide for interpreting and gating SlopBrick reports. The
plain-language score definitions are in [scoring
explained](./scoring-explained.md). The versioned code contract is
[`src/report/score-contract.ts`](../src/report/score-contract.ts).

## First: verify the outcome

Before reading any numeric score, inspect:

```text
completionStatus
scoreValidity
requested / analyzed / failed / skipped
scanAccounting
selectionAccounting
```

Only `scoreValidity=valid` is safe for configured numeric gates.

- `valid`: the selected population completed.
- `incomplete`: one or more selected outcomes are missing, failed, timed out,
  crashed, or skipped; use findings/accounting for diagnosis, not a pass/fail
  score claim.
- `not-applicable`: nothing eligible was selected; do not reinterpret omitted
  scores as zero.

For a release or repository-health claim, scan the intended full population.
A complete changed-file scan is valid for that changed-file population; it is
not automatically a complete-project measurement.

## Headline contract

| Field | Direction | Standard use |
|---|---|---|
| `aiSlopScore` | lower is cleaner | primary mean threshold |
| `engineeringHygiene` | higher is better | maintainability diagnostic |
| `security` | higher is better | security-pattern diagnostic |
| `repositoryHealth` | higher is better | deterministic summary, not the mean gate |

Repository Health is:

```text
0.4 × (100 − aiSlopScore)
+ 0.3 × engineeringHygiene
+ 0.2 × security
+ 0.1 × testQuality
```

The four displayed fields remain independent. Do not gate AI Slop by
inverting Repository Health, and do not describe the informational Bayesian
`compositeScore` as a fifth headline score or authorship proof.

## Common operator commands

### Inspect a repository

```bash
slopbrick scan --brief
slopbrick scan --why-failing
slopbrick scan --explain-score
slopbrick scan --format json
```

- `--brief` shows the result and threshold compactly.
- `--why-failing` ranks material rules by weighted impact.
- `--explain-score` shows deterministic aggregate inputs.
- JSON is the best source for coverage and downstream automation.

### Inspect a changed population

```bash
slopbrick scan --changed --format json
slopbrick scan --staged --format json
slopbrick pr
```

Record the selection scope with the result. A changed-file score should not be
presented as the repository's full score.

### Establish and compare a baseline

```bash
slopbrick scan --baseline
slopbrick scan --no-increase
```

`aiSlopScore` is lower-is-better. An increase is a regression. Review the
baseline artifact and diff before accepting a new baseline; do not re-baseline
merely to silence a failure.

## Gate behavior

### Configured scan gate

The central mean gate is:

```text
aiSlopScore <= thresholds.meanSlop
```

Category thresholds can add policy failures. The report may also show p90 and
peak/individual diagnostics; check the current CLI/config contract and tests
before wiring a new external gate to them.

`--strict` additionally fails when a retained high-severity issue remains.
`--no-increase` fails when the raw AI Slop Score rose from the reviewed
baseline.

### CI command

```bash
slopbrick ci --max-slop <n> --strict-constitution
```

The current `ci` command forces changed-file selection and no-increase
behavior. `--max-slop` is a ceiling on raw `aiSlopScore`; higher values are
worse. `--strict-constitution` fails on declared-policy violations.

Treat the runtime help and tests as authoritative. Do not document an option as
working merely because Commander displays it; its behavior must be covered by
an executable test.

### Exit interpretation

The CLI distinguishes a clean pass, policy/threshold or partial outcome, and
usage/internal failures. Automation should consume the documented command's
exit code plus `scoreValidity`, not infer success from a numeric field alone.

## Effective findings and suppression

Only effective findings affect headline arithmetic. Findings can be excluded
by:

- default-off policy;
- explicit rule severity/configuration;
- path and selection filters;
- inline directives;
- other runtime eligibility checks.

Suppressed findings remain available to audit output and accounting. When a
score looks surprising, compare the effective and suppressed sets before
changing a threshold.

Never enable a noisy/default-off rule just to make the scanner look more
sensitive. Promotion requires the active calibration and review policy.

## Specialised diagnostics

SlopBrick also has specialised commands for architecture, security, tests,
documentation, database/business logic, patterns, PRs, and maintenance cost.
These can expose categorical scores, sub-scores, or estimates, but they do not
expand the four-field headline contract.

Use each command's runtime help and tests. Do not combine unrelated sub-scores
into a new public composite in documentation.

## Persisted evidence

The canonical repository snapshots are:

```text
.slopbrick/inventory.json
.slopbrick/constitution.json
.slopbrick/health.json
.slopbrick/structure.md
```

`health.json` rounds headline scores for the snapshot; machine report JSON
preserves full precision and human output displays one decimal place.

The bounded legacy/local `.slopbrick/structure.json` run log and
`.slopbrick/flywheel/scans.jsonl` history are separate from those canonical
snapshots and have different controls. See [repository
structure](./repository-structure.md).

## Calibration interpretation

The shipped signal table contains historical point estimates. They must not be
presented as current v10.3 metrics unless the rule is bound to an admitted
cohort and complete denominator-aware run.

Current release truth:

- v10.1's 576,750 analysed files are historical;
- v10.3 currently has no admitted release cohort;
- unknown/unmeasured candidates stay default-off;
- a finding or Bayesian probability is not an authorship verdict.

See the live [calibration index](./calibration/README.md).

## Troubleshooting

### “The score is green but files failed”

Check `scoreValidity`. An incomplete scan cannot establish a passing numeric
gate even if compatibility numerics are visible for diagnosis.

### “The score changed after adding files with no findings”

Clean files do not dilute existing AI bucket burden. Check whether the selected
population, effective findings, rule registry, configuration, or baseline
changed.

### “The CLI and health snapshot differ”

Check rounding, timestamps, workspace, completion status, and whether artifact
persistence warned or was disabled. A successful report does not prove every
optional write succeeded.

### “Repository Health is high but AI Slop fails”

Expected: Repository Health combines four inputs, while the standard mean gate
uses raw `aiSlopScore` directly. Fix/disposition the findings or adjust a
reviewed policy; do not gate through the composite.

### “A rule says AI-specific”

That marks detector intent/weighting. It does not establish file authorship.
Read the matched evidence, calibration status, and false-positive context.

## Release checklist

For a release candidate:

1. run the root typecheck, full test, and build gates;
2. run a complete package-local self-scan with one thread;
3. record coverage, four scores, threshold outcome, and exact commit;
4. resolve or explicitly disposition each failure;
5. keep historical calibration claims separate from current release evidence;
6. publish only through the reviewed GitHub Release/OIDC workflow.

Current milestones and decisions live in the root
[roadmap](../../../ROADMAP.md) and [execution ledger](../../../docs/execution/README.md).
