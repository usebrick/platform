# LOCK-001 owner validation — deterministic new-debt gate

- **Date:** 2026-07-25
- **Branch:** `codex/lock-001-new-debt`
- **Workspace candidate:** unreleased `slopbrick@0.45.0`
- **Disposition:** local implementation proof complete; unshipped and not
  team-validated

## What this receipt proves

The existing `slopbrick ci` surface can now opt into one bounded Lock workflow:

```bash
npx slopbrick scan --baseline
npx slopbrick ci --lock-new-debt
```

The gate evaluates only exact `context/import-path-mismatch` findings created
from a repository-authored `allowedImports` policy. Existing matching debt is
preserved by the reviewed durable baseline. A newly introduced matching import
is blocked, and correcting it passes without rebasing existing debt.

This receipt proves deterministic local behavior for one policy family. It
does not prove team adoption, willingness to pay, external precision, a
standalone Lock package, npm availability, or public release qualification.

## Implemented trust boundary

- Stable semantic finding identity v2 uses rule, repository-relative location,
  source span, and exact matched evidence rather than mutable message copy.
- Legacy v1 debt baselines remain readable; newly written baselines use v2 and
  are persisted atomically.
- The baseline config hash includes the effective import policy, so changed
  policy cannot silently reuse an incompatible debt baseline.
- Lock authority must come from repository `allowedImports`. Built-in defaults
  return `not-evaluated` and fail closed.
- Only self-consistent exact matched-source evidence can block. Unrelated,
  advisory, score-only, and imprecise findings are outside `LOCK-001`.
- Waivers are bound to one finding identity and require owner, reason, and an
  exact ISO expiry. Active waivers pass visibly; expired or invalid waivers do
  not.
- Partial, empty, missing-baseline, and config-mismatched scans never pass as
  proof of policy compliance.
- JSON, SARIF, Markdown, and pretty output retain the typed decision. Human CI
  output names the policy source, exact file/line, matched import, disposition,
  and waiver state.
- The gate is an explicit `ci --lock-new-debt` opt-in. Existing CI behavior is
  unchanged when the flag is absent.

## Owner-controlled scenario receipt

| Scenario | Expected and observed decision | Exit boundary |
| --- | --- | ---: |
| Reviewed baseline contains an existing disallowed import | `passed`; existing debt is not new debt | 0 |
| A second exact disallowed import is introduced | `failed`; one new finding is blocked with exact source evidence | 1 |
| The introduced import is corrected to an approved prefix | `passed`; no unwaived new policy finding remains | 0 |
| Repository does not declare `allowedImports` | `not-evaluated`; built-in defaults cannot become repository policy | 1 |
| The exact new finding has an active owned waiver | `passed`; one finding is visibly waived | 0 |
| The same waiver is expired | `failed`; the finding is blocked and expiry remains visible | 1 |
| A selected changed source becomes unreadable | `not-evaluated`; incomplete scan cannot prove compliance | 1 |

The controlled matrix recorded one confirmed prevention and zero false blocks
against its declared expected outcomes. It exercised one active and one
expired waiver. The current waiver burden is four explicit fields plus review
of the semantic finding identity. No human time-to-resolution claim is made:
the 20.35-second focused test runtime and 13.998-second self-scan runtime are
automation timings, not user workflow evidence.

## Verification

Focused Lock and regression matrix:

```text
8 test files passed
75 tests passed
```

Complete recursive qualification:

| Gate | Result |
| --- | --- |
| `corepack pnpm -r typecheck` | PASS |
| `corepack pnpm -r test` | Core 288; Engine 150; Website 54; SlopBrick 4,616 passed with 18 intentional skips |
| `corepack pnpm -r build` | PASS; website plus SlopBrick CJS, ESM, and declarations produced |
| `corepack pnpm security:audit` | PASS; 377 production packages, zero high-threshold advisories |
| Runtime import graph | PASS; 654 source files, zero cycles |
| Package-local self-scan | PASS; 307/307 analyzed, complete, policy gate passed, Repository Health 99.94/100 |

The self-scan retained four medium `dup/identical-block` advisory signals. One
pair is deliberately duplicated comment stripping for separate dedup
pipelines, as documented in source; the other pair keeps independent versioned
CAL-002 validators. The detector is itself `DORMANT`, default-off, and records
historical precision 0%, so no coupling-increasing extraction was made merely
to force a perfect score.

During the complete test run, one real config regression was reproduced and
fixed: adding Lock policy provenance created a replacement config object and
lost explicit rule provenance stored by object identity. The red test is
`b3d170b5c`; the correction is `0b28d9c73`. A separate one-time package builder
identity failure did not reproduce in a focused 9/9 run, a concurrent 747/747
run, or the complete suite. Its strict guard remains unchanged. Both incident
records are retained under `specs/bugs/`.

## Decision and remaining gates

`LOCK-001` satisfies its bounded local acceptance criteria and may close as
`done`. The team-enforcement and monetization gates remain open because the
repository owner is still the only tester and external sessions remain zero.

`MEND-001` remains parked even though its plan dependency is now complete. Its
separate resume gate requires the owner to accept this enforcement behavior as
useful and select one deterministic repair worth evaluating with dry-run,
idempotence, rescan, repository checks, and byte-identical rollback.

## Rollback

Omit `--lock-new-debt` to return CI to its prior behavior. Preserve the debt
baseline and decision receipt for reproduction; do not refresh the baseline to
silence a failed policy decision.
