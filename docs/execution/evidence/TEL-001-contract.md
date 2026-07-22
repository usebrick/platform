# TEL-001 privacy-safe local outcome-event receipt

> **Current closeout — 2026-07-22:** the versioned local outcome-event
> contract, explicit lifecycle API, privacy boundaries, focused tests, final
> dual review, recursive gates, packed-consumer proof, and package-local
> self-scan are complete. This receipt does not authorize outbound ingestion,
> release, push, publication, deployment, or participant outreach.

**Status:** locally qualified; `TEL-001` complete
**Execution index:** revision 46
**Package:** unreleased `slopbrick@0.45.0` candidate
**Implementation checkpoint:** `be2a784f55ef1c67343d323ccf6a0dd627d64b50`
**Review base:** `0bcb540282e4c90c51224c7494563d4ce1209536`
**Runtime:** Node `v24.15.0`; pnpm `9.15.0`

The isolated execution worktree was
`/Users/cheng/platform-tel-001` on branch
`codex/tel-001-outcome-events`. The primary checkout's unrelated owner state
was not modified. The TEL execution entry begins at `b3a5b37f1`; the separate
CAL-002 temporary-fixture repair commits `49bc39030` and `e888ea6ce` are not
TEL implementation evidence.

## Delivered contract

`slopbrick-outcome-event-v1` contains four closed event families:

- scan completion for initial scans and rescans;
- first-finding usefulness assessment;
- applied, declined, or deferred action disposition; and
- return inside a 1-, 7-, 30-, or 90-day window.

The schema and runtime accept only the immutable 119-detector v1 allowlist,
the closed `0.45.0` producer coordinate, valid UTC calendar days, coarse
framework and repository-size buckets, and closed event-specific values.
Unknown fields and free-form values are rejected without echoing their names
or contents. Event states that cannot occur together are rejected by both the
runtime validator and Draft 2020-12 JSON Schema.

The public library surface exports validation plus explicit read, append,
export, and delete operations. Normal scans do not call those operations. No
outcome-event network adapter or hosted ingestion path exists. The existing
eight-field usage beacon remains separate, off unless both its CLI flag and
endpoint are supplied, and cannot carry outcome events.

API-written bytes use descriptor-captured, null-prototype canonical records.
The implementation closes caller, proxy, inherited `toJSON`, array method,
iterator, and numeric-index hooks, including numeric setters installed before
module import. The local JSONL ledger requires a final newline, rejects blank
lines, caps each event at 4 KiB, and caps the ledger at 1 MiB or 4,096 events.

POSIX storage uses canonical no-symlink paths, owner-only parents, nonblocking
no-follow opens, regular single-link files, a cooperative sibling lock for all
lifecycle operations, same-descriptor append, private atomic export, and
identity-checked deletion. A temporary storage-path identity probe rejects
filesystem-equivalent export aliases even when the ledger is absent, while
distinct case-sensitive paths remain valid. Unsupported filesystem semantics
fail closed.

## Focused qualification

| Gate | Result |
| --- | --- |
| Outcome event, store, and beacon matrix | 3 files passed; 30 tests passed; 1 unsupported-platform branch skipped on Darwin |
| SlopBrick typecheck | passed |
| Review-range whitespace check | passed |
| Schema/runtime closed cross-product | 89 combinations committed and passing |
| Packed consumer | 9 tests passed, including offline packed ESM and CJS outcome exports |
| Direct rebuilt ESM/CJS probes | both exited 0 and exposed the event version, closed producer coordinate, and all five public functions |

The final review was round 5 of 5. Two fresh reviewers independently returned
`98/100`, no `MUST-FIX`, no `SHOULD-FIX`, and `PASS`. Earlier rounds found and
drove closure of value-entropy, prototype/index, filesystem-alias, locking,
bounded-storage, and packed-export gaps; their failing verdicts were not reused
as approval.

## Recursive qualification

All commands ran serially from the isolated repository root:

| Gate | Fresh result |
| --- | --- |
| `corepack pnpm -r lint` | passed |
| `corepack pnpm -r typecheck` | passed; Astro checked 47 files with 0 errors, 0 warnings, and 0 hints |
| `SLOPBRICK_VITEST_WORKERS=1 corepack pnpm -r test` | Core 35 files/285 tests; Website 11/54; Engine 5/60; SlopBrick 392 passed files plus 5 skipped and 4,603 passed tests plus 18 skipped |
| `corepack pnpm -r build` | passed; Core codegen fresh, Website built 4 pages, and all package builds completed |
| `corepack pnpm plans:validate` before closeout | passed; 18 plans, implementation WIP 1/2, company WIP 0/1 |
| `corepack pnpm positioning:validate` | passed; 12/12 positioning checks |

Build output contained only the repository's existing non-fatal Zod
declaration-bundling warnings.

## Fresh package-local self-scan

The mandated ordinary scan ran without `--baseline`:

```text
corepack pnpm --filter slopbrick exec -- node ./bin/slopbrick.js scan \
  --workspace . --threads 1 --no-telemetry --no-color
```

It completed with Repository Health `99.94/100`, policy gate `pass`, four
current medium deterministic `dup/identical-block` findings, and no other
active finding. No durable debt baseline or outcome-event directory existed
afterward. The scan exited `0`; normal scanning remained separate from the
explicit outcome API.

## Boundaries retained

- Outcome events remain local workflow observations, not calibration labels,
  source authority, authorship evidence, or automatic severity/rule-state
  input.
- Repository policy remains authoritative over any future global prior.
- A future outcome transport requires a separate privacy and authorization
  decision.
- `MEM-001` is no longer dependency-blocked by TEL, but it remains `draft` and
  does not start through this receipt.
- npm release, GitHub Release, website deployment, merge, push, participant
  contact, and hosted ingestion remain separately controlled.

The v1 reader validates decoded JSON values and the writer/exporter emit
canonical bytes; v1 does not require manually supplied valid JSON to use the
writer's exact key order or escaping. A dedicated normal-scan negative test and
stricter canonical-input policy remain optional future hardening, not failed
TEL acceptance criteria.
