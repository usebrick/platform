# SlopBrick scoring explained

`slopbrick scan` reports four headline scores. They describe different aspects
of the observed implementation; none proves whether a human or AI wrote the
code.

## The four scores

| Score | Direction | Question |
|---|---|---|
| **AI Slop Score** (`aiSlopScore`) | lower is cleaner | How much effective AI-associated implementation signal fired? |
| **Engineering Hygiene** (`engineeringHygiene`) | higher is better | How clean are the engineering-category burdens? |
| **Security** (`security`) | higher is better | How much retained security finding burden is present? |
| **Repository Health** (`repositoryHealth`) | higher is better | What is the deterministic weighted health summary? |

The scores are independent. A repository can have few AI-associated signals
and serious security findings, or many AI-associated signals while remaining
internally consistent. Do not use one score to erase another.

## AI Slop Score

`aiSlopScore` is 0–100, where 0 is clean and higher means more effective
AI-associated signal. It is the default mean-threshold gate:

```text
aiSlopScore <= meanSlop  -> pass
aiSlopScore >  meanSlop  -> fail
```

The default `meanSlop` is 30. A score of 25 passes that default but fails a
repository configured with `meanSlop: 15`.

The score combines boundary, context, and visual slop-amount buckets. For each
effective file/group, severity-weighted evidence is log-scaled; file burdens
are then additively accumulated and passed through a fixed cumulative
transform. Clean files contribute zero and do not dilute existing evidence.
The analysed-file count remains coverage/provenance, not a divisor that can
make a finding disappear in a large repository.

Only the **effective issue set** contributes: configured-off, default-off, path
filtered, directive-suppressed, and otherwise excluded findings remain
auditable but do not alter the score.

## Engineering Hygiene

`engineeringHygiene` is 0–100, higher is better. It inverts the mean burden
across the effective `arch`, `logic`, `layout`, `visual`, `component`, and
`test` categories.

This is maintainability context, not a hidden authorship classifier. The full
generated rule catalog contains more categories; do not hard-code its current
count into scoring documentation.

## Security

`security` is 0–100, higher is better. It is derived from the number of
effective `security/*` findings:

```text
security = 100 / (1 + securityFindingCount / 5)
```

The specialised `slopbrick security` command also exposes categorical risk and
its own strict gate. The numeric headline and categorical diagnostic answer
related but different questions.

## Repository Health

`repositoryHealth` is 0–100, higher is better:

```text
0.4 × (100 − aiSlopScore)
+ 0.3 × engineeringHygiene
+ 0.2 × security
+ 0.1 × testQuality
```

`testQuality` is an internal input from the test-quality scorer, not a fifth
headline field. The AI Slop Score is inverted at the call site so every input
to Repository Health points in the higher-is-better direction.

## Score validity and accounting

Always read the outcome before the number:

| `scoreValidity` | Meaning |
|---|---|
| `valid` | complete scan; canonical scores may be used for configured gates |
| `incomplete` | partial scan; diagnostics/accounting are useful, but numbers must not gate |
| `not-applicable` | empty selection; canonical score fields are not applicable |

Use `requested`, `analyzed`, `failed`, `skipped`, `scanAccounting`, and
`selectionAccounting` to understand the denominator. A green number without
complete coverage is not release evidence.

Run:

```bash
slopbrick scan --explain-score
```

to print the deterministic aggregate inputs behind the current report. The
explanation deliberately stops at aggregate inputs; nonlinear saturation means
that a simplistic per-rule marginal attribution would be misleading.

## Human-readable bands

AI Slop Score uses lower-is-better bands:

| AI Slop Score | Band |
|---|---|
| 0–9 | no slop |
| 10–29 | low |
| 30–49 | medium |
| 50–69 | high |
| 70–100 | saturated |

The other three headline fields use higher-is-better bands:

| Score | Band |
|---|---|
| 90–100 | excellent |
| 70–89 | passing |
| 40–69 | needs work |
| below 40 | concerning |

Band labels are summaries, not substitutes for findings and evidence.

## Other score-like fields

- `assemblyHealth` is the legacy inverse of `aiSlopScore` retained only for
  complete-report wire/history compatibility.
- `totalScore` is a retired compatibility field and is omitted from current
  JSON output.
- `slopIndex` is a legacy name; use `aiSlopScore` in new consumers.
- `compositeScore` is an informational Bayesian AI-likelihood aggregate. It is
  not one of the four deterministic headline scores, does not prove
  authorship, and does not drive the standard mean gate.
- architecture, PR, documentation, database, business-logic, maintenance-cost,
  and test subcommands expose specialised diagnostics with their own contracts.

For operator procedures, see the [scoring runbook](./scoring-runbook.md). For
the versioned implementation contract, see
[`src/report/score-contract.ts`](../src/report/score-contract.ts) and the tests
that cover it.
