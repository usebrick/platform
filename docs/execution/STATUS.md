# Usebrick execution status

**Snapshot:** 2026-07-17
**Index revision:** 4
**Global status:** `advancing`

## Executive state

The documentation control plane and Corpus v1 admission decision are complete.
The project is advancing through two active implementation plans: the v0.45
trust release and the bounded Corpus v1 seed. The vibecoder pilot lane is ready
in parallel. Stale-path cleanup is isolated behind exact owner approval and
does not block product or corpus work.

## Product and release truth

- The latest repository-verified public package is `slopbrick@0.43.0`. Its
  tagged generated catalog and exact tarball README contain **103 rules in 22 categories**. Registry metadata
  that says 24 categories is drift and must be corrected at the next truthful
  publish rather than copied into current documentation.
- The workspace contains an **unreleased** `slopbrick@0.45.0` candidate with
  **119 rules in 27 categories**.
- Recorded typecheck, full-test, build, and packed Node 22/24 diagnostics are
  green for their recorded commits. They do not prove the current dirty
  checkout, publication, or deployment.
- The most recent recorded self-scan completed all 254 discovered files but
  failed the configured AI-slop policy: **18.3** versus a threshold of **15**.
  Runtime completion is proven; the release disposition remains open.
- The v10.1 result covering 576,750 analyzed files is historical evidence, not
  current v10.3 admission evidence.
- The v10.3 material is local/quarantine-only: 452,382 registered/additive
  units and **zero admitted units**. Its authority protocol is retained as
  historical engineering evidence, not a prerequisite for a smaller truthful
  Corpus v1.
- The local publisher-labeled 5,000 AI / 5,000 human projection now passes the
  pinned, read-only source inventory. It remains an internal-analysis candidate,
  not an admitted, independently witnessed, quality-labeled, redistribution-
  approved, or leakage-safe production corpus.
- MemoryBrick, LockBrick, and MendBrick are not shipped standalone products.
- A 2026-07-17 read-only check of `https://usebrick.dev/` still showed the old
  v0.43 marketing artifact, including contradictory rule counts and absolute
  “no telemetry” claims. The local website candidate corrects those claims,
  but no live deployment has been authorized or inferred.
- Roadmap consolidation has not published npm, created a GitHub release,
  deployed the website, pushed a branch, deleted the old corpus, or made any
  other remote mutation.
- The working tree contains unrelated/user-owned changes. It must not be
  described as clean without a fresh verification.
- Outbound usage reporting is opt-in. Local scan history is on by default; the
  two behaviors must not be collapsed into a single "no telemetry" claim.

## WIP

| Track | Active | Limit | Plans |
| --- | ---: | ---: | --- |
| Implementation | 2 | 2 | `SB-045`, `CORPUS-001` |
| Company | 0 | 1 | None |

Keep `SB-045` and `CORPUS-001` within the two-slot implementation limit. Start
`GTM-001` in the independent company slot when the first pilot is actually
scheduled. `DOC-PRUNE-001` may resume only after exact path approval and does
not consume WIP while waiting.

## Plan board

| Priority | Plan | Status | Unmet `requires` | Next action |
| ---: | --- | --- | --- | --- |
| 0 | [`PLAT-001`](plans/PLAT-001-planning-control.md) | `done` | — | Keep future strategy and status changes in the canonical control plane. |
| 1 | [`SB-045`](plans/SB-045-trust-release.md) | `in_progress` | — | Red-test one gate decision for report and exit behavior. |
| 2 | [`CORPUS-DEC-001`](plans/CORPUS-DEC-001-admission-contract.md) | `done` | — | Apply the accepted evidence and rights boundary through `CORPUS-001`. |
| 3 | [`GTM-001`](plans/GTM-001-vibecoder-pilots.md) | `ready` | — | Recruit five vibecoder pilots and establish the outcome template. |
| 4 | [`CORPUS-001`](plans/CORPUS-001-v1-seed.md) | `in_progress` | — | Red-test deterministic per-unit manifest projection and quarantine reasons. |
| 5 | [`CAL-001`](plans/CAL-001-heldout-calibration.md) | `draft` | `CORPUS-001` | Freeze leakage-safe splits and the admission matrix. |
| 6 | [`SB-UX-001`](plans/SB-UX-001-first-scan.md) | `draft` | `SB-045` | Snapshot-test the five-part report information architecture. |
| 7 | [`TEL-001`](plans/TEL-001-local-outcomes.md) | `draft` | `SB-045` | Define the privacy-safe local outcome event. |
| 8 | [`MEM-001`](plans/MEM-001-read-only-m0.md) | `draft` | `SB-UX-001`, `TEL-001` | Approve the M0 storage/provenance/freshness ADR. |
| 9 | [`LOCK-001`](plans/LOCK-001-new-debt-gate.md) | `draft` | `SB-UX-001` | Red-test one deterministic new-debt gate. |
| 10 | [`MEND-001`](plans/MEND-001-repair-proof.md) | `parked` | `LOCK-001` | Wait for enforcement trust, then prove one reversible repair. |
| 11 | [`ENT-001`](plans/ENT-001-demand-gate.md) | `parked` | `LOCK-001`, `GTM-001` | Validate repeated demand after paid team pilots. |
| 12 | [`DOC-PRUNE-001`](plans/DOC-PRUNE-001-approved-cleanup.md) | `waiting_external` | — | Await exact owner approval for the numbered stale-path inventory while other lanes continue. |

## Release gates

| Gate | State | Meaning |
| --- | --- | --- |
| Candidate scope | Satisfied | v0.45 is a trust/reliability release; no new rules are planned. |
| Current checkout gates | Open | Re-run bounded tests during implementation and the full release gate before a go/no-go decision. |
| Self-scan disposition | Open | Completion is proven; score/policy treatment must be explicitly accepted or fixed. |
| Claims and metadata | Open | Reconcile version, category, artifact, privacy, and website claims. |
| Publish authorization | Not authorized | A green local candidate is not a release. GitHub Release + OIDC remains the only publish path. |
| Website deployment | Not authorized | The local candidate corrects verified live-site claim drift; it still requires owner/SHA review and separate deployment authorization. |

## Waiting external

`DOC-PRUNE-001` waits only for exact owner approval of its numbered archive and
delete inventory, including the disposition of five consumed Changesets. No
listed path has been moved or deleted. This is a cleanup authorization gate,
not a project blocker: `SB-045`, `CORPUS-001`, and `GTM-001` can advance.

Missing, invalid, or overbuilt corpus machinery is handled inside Corpus v1.
If a source fails the rights or evidence contract, quarantine that source and
continue with another eligible source or a smaller honest corpus.

## Risks and decisions due

- Repeated rule/category/version statements can drift unless generated from the
  release artifact.
- A completed self-scan can still fail policy; runtime success and release
  acceptance must remain separate.
- Origin labels can be mistaken for quality labels; calibration must report
  those evaluations separately.
- Large corpus operations can consume time and memory without improving
  evidence. Start with bounded inventories and 100/100 smoke runs.
- Memory can become stale or context-heavy. M0 remains read-only and benchmark
  gated.
- The current `slopbrick ci --max-new-issues` option is advertised but does not
  affect the gate and still names the retired `.slop-audit-cache.json` path.
  `SB-045` must either implement a stable-identity new-finding contract or
  remove/deprecate the option; it must not remain a silent no-op.
- Archive/delete candidates still require explicit path-level approval; that
  approval does not prevent additive documentation and product work.

## Next checkpoint

The next product checkpoint is reached when `SB-045` proves one typed gate
decision drives report output and process exit, and `CORPUS-001` emits a
deterministic, per-unit-hashed candidate manifest with explicit quarantine
reasons. The read-only 5,000/5,000 source inventory is verified. `GTM-001`
remains the independent company-track start. Approved stale-path cleanup can
be executed later without displacing either active implementation lane.
