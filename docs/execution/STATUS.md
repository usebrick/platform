# Usebrick execution status

**Snapshot:** 2026-07-17
**Index revision:** 15
**Global status:** `advancing`

## Executive state

The documentation control plane, Corpus v1 admission decision, and bounded
source-attested Corpus v1 seed are complete. The local v0.45 trust-release
qualification is complete and waits only for an explicit owner decision on the
live/public claim boundary. The consent-safe vibecoder pilot protocol is ready
but no sessions are scheduled. CAL-001 has a frozen leakage-safe calibration
protocol, a deterministic non-admitting 100/100 scanner smoke receipt, and a
completed diagnostic full holdout with zero leakage findings; confound,
usefulness, and admission decisions remain open. Stale-path cleanup is
isolated behind exact owner approval and does not block local product work.

## Product and release truth

- The latest repository-verified public package is `slopbrick@0.43.0`. Its
  tagged generated catalog and exact tarball README contain **103 rules in 22 categories**. Registry metadata
  that says 24 categories is drift and must be corrected at the next truthful
  publish rather than copied into current documentation.
- The workspace contains an **unreleased** `slopbrick@0.45.0` candidate with
  **119 rules in 27 categories**.
- The SB-045 qualification checkpoint is
  `c2d337b7f385963b150a8da5f9e823ccffa51ea5`. Recursive typecheck and build,
  the serialized full SlopBrick package suite, and the packed Node 22/24
  diagnostic are green for that candidate. The repository-wide serialized
  test command records seven host-sensitive failures: beacon tests cannot
  listen under the sandbox, the special-mode test cannot observe setuid bits,
  and the packed consumer cannot write the user pnpm store without the
  required local-cache permission. Those affected tests pass in the isolated
  package receipt. These results do not authorize publication or deployment.
- The current package-local self-scan completed **263/263** selected files
  with **0** parse, timeout, crash, or internal failures and passes the
  configured AI-slop policy: **0.0** versus a threshold of **15**. It reports
  **0 active AI-specific signals**, **11 non-AI hygiene findings**, and **671
  audit-only suppressed** findings, then exits `0`. The disposition is
  **PASS for the configured local AI gate**. This pass comes from the
  evidence-backed default-off disposition for the unadmitted
  `ai/compression-profile` signal, not from lowering the threshold or making
  a current v10.3 calibration claim. Explicit per-rule opt-in remains
  available for diagnostic use.
- The CAL-001 smoke adapter and runner are checkpointed at
  `f00c5364fc13d6452756d94071c76158cb4a05cd`. The focused calibration tests
  and package typecheck pass; the recorded one-worker receipt scanned 200/200
  selected source-bound files successfully and remains `admitted: false`.
  The recursive release gates have not been rerun after this additive slice.
- The CAL-001 full holdout evaluator is checkpointed at
  `45d2dd038107d3d1d7731192126bf0d48dd6f84b`. Its one-worker receipt covers
  10,000/10,000 source-bound files across 7,970 train, 991 validation, and
  1,039 test rows with zero parse, timeout, scanner, exact-collision,
  normalized-collision, or family-split failures. The canonical receipt SHA is
  `db9551ec4540282bf35fbc896d0e33dc31434019de52da0f2972ade2d5dc4cfe` and
  canonical metrics SHA is
  `9d4e57ef42dfad1d65becf750690ef9991ba29c03f0181531fb4321853f1bea5`.
  This remains diagnostic-only: no threshold, rule state, usefulness result,
  admission, or release gate was changed.
- The v10.1 result covering 576,750 analyzed files is historical evidence, not
  current v10.3 admission evidence.
- The v10.3 material is local/quarantine-only: 452,382 registered/additive
  units and **zero admitted units**. Its authority protocol is retained as
  historical engineering evidence, not a prerequisite for a smaller truthful
  Corpus v1.
- The local publisher-labeled 5,000 AI / 5,000 human projection now passes the
  pinned, read-only source inventory and deterministic per-unit candidate
  projection. All 10,000 unit bytes match their source-declared hashes; two
  projections produced candidate-manifest SHA-256
  `c15d3cbc95f251b5a0514da14b3f8a90e26124fbfb7db5ce342a873635b383ac`.
  The family/duplicate-aware leakage planner found zero exact and zero
  normalized cross-label collision rows and deterministically assigned 7,970
  train, 991 validation, and 1,039 test rows, with plan SHA-256
  `9c4638526e9a4161d3e74f70197f0b25717439e6bd477bef98664a03c9a9219c`.
  Direct raw-CSV reconciliation now binds all 10,000 publisher rows to the
  projection's labels, sources, languages, problems, ordinals, byte counts,
  and content hashes. Row-binding SHA-256 is
  `86b46373ba0cae5149a722777eeff537b27c7a8d43fd8259fa8c197ea1bd300c`;
  receipt SHA-256 is
  `47bd66907ec2efa67da718e0cfb38458151ca84d3cdedc941488fe4b001475ac`.
  The deterministic non-admitting smoke now selects 100 unique exact-content
  units per polarity. Its manifest SHA-256 is
  `bdbcd43279077fa760ae3c99da05b953c38134022fa34626b69a6b6400be00de` and its
  receipt SHA-256 is
  `ccd74f7b9db49adc802c042df0d7b732d8284d2bbfc4e6ec39e6a1c001c60830`.
  The source remains an internal-analysis candidate, not an admitted,
  independently witnessed, quality-labeled, redistribution-approved, or
  production corpus.
- The post-smoke eligible projection retains all 10,000 rows with zero
  quarantine rows and zero unresolved exact/normalized cross-label collisions.
  Its manifest SHA-256 is
  `286134799c7f75837a7c292f0d18721d8da9263c25c041eef0ac4734801b52d8` and its
  receipt SHA-256 is
  `9f5274f57ed4adf9d1c1ef55205493e9a833abc86cb8e1ca2b332cd8c72d28ba`.
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
| Implementation | 1 | 2 | CAL-001 |
| Company | 0 | 1 | None |

`SB-045` is waiting external and does not consume an active implementation
slot. Start `GTM-001` in the independent company slot when the first pilot is
actually scheduled.
`DOC-PRUNE-001` may resume only after exact path approval and does not consume
WIP while waiting.

## Plan board

| Priority | Plan | Status | Unmet `requires` | Next action |
| ---: | --- | --- | --- | --- |
| 0 | [`PLAT-001`](plans/PLAT-001-planning-control.md) | `done` | — | Keep future strategy and status changes in the canonical control plane. |
| 1 | [`SB-045`](plans/SB-045-trust-release.md) | `waiting_external` | — | Obtain the owner's explicit live/public claim disposition and exact reviewed SHA if deployment is authorized. |
| 2 | [`CORPUS-DEC-001`](plans/CORPUS-DEC-001-admission-contract.md) | `done` | — | Apply the accepted evidence and rights boundary through `CORPUS-001`. |
| 3 | [`GTM-001`](plans/GTM-001-vibecoder-pilots.md) | `ready` | — | Recruit the first five vibecoder pilots using the consent-safe template before the first scan. |
| 4 | [`CORPUS-001`](plans/CORPUS-001-v1-seed.md) | `done` | — | Hand off the verified source-attested seed without widening its evidence or rights claims. |
| 5 | [`CAL-001`](plans/CAL-001-heldout-calibration.md) | `in_progress` | — | Review the recorded language/file-size confounds and assign a bounded, non-admitting decision row to every candidate rule. |
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
| Current checkout gates | Qualified with host boundary | Recursive typecheck/build pass and the serialized full SlopBrick suite is green; the recursive test command has seven documented sandbox/host-sensitive failures. |
| Self-scan disposition | PASS | 263/263 files complete with no runtime failures; 0 active AI-specific signals; AI Slop Score 0.0 against threshold 15. |
| Claims and metadata | Open | Reconcile version, category, artifact, privacy, and website claims. |
| Publish authorization | Not authorized | A green local candidate is not a release. GitHub Release + OIDC remains the only publish path. |
| Website deployment | Not authorized | The local candidate corrects verified live-site claim drift; it still requires owner/SHA review and separate deployment authorization. |

## Waiting external

`SB-045` waits for the repository owner to choose either an authorized live
website deployment at a named reviewed commit/SHA or an explicit decision to
keep the live v0.43 site unchanged while v0.45 remains local-only. A read-only
live-site check can verify that decision after authorization; it cannot replace
it. GTM-001 protocol preparation is parallel-safe, but participant recruitment
still requires real scheduling and consent.

`DOC-PRUNE-001` waits only for exact owner approval of its numbered archive and
delete inventory, including the disposition of five consumed Changesets. No
listed path has been moved or deleted. These are authorization gates, not
project blockers for local work.

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

The typed gate-decision, finding-bound fix, durable new-debt, claim-alignment,
and local privacy/history contracts are implemented and recorded in
[`SB-045-gate-decision.md`](evidence/SB-045-gate-decision.md). The complete
qualification packet is [`SB-045-release-qualification.md`](evidence/SB-045-release-qualification.md).
The next SB-045 checkpoint is the owner's explicit live/public claim
disposition; the local AI gate is already qualified. The next GTM-001
checkpoint is the first real scheduled pilot, using the new consent-safe
template. The CAL-001 one-worker smoke and full frozen holdout are complete;
the next CAL-001 checkpoint is confound review plus a bounded decision row for
every candidate, still without test tuning, usefulness claims, or rule
activation. Do not lower the threshold,
activate unmeasured rules, publish, tag, deploy, or push as a way to close any
boundary. Corpus v1 remains non-admitting.
