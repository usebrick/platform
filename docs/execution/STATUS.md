# Usebrick execution status

**Snapshot:** 2026-07-18
**Index revision:** 22
**Global status:** `advancing`

## Executive state

The documentation control plane, Corpus v1 admission decision, bounded
source-attested Corpus v1 seed, CAL-001 evaluation, and CORPUS-002 source-use
routing are complete. The deterministic router preserves every existing
Mendeley and CAL-001 hash while failing closed for pending, reference-only,
unregistered, malformed, or manually widened source dispositions. The local
v0.45 trust-release qualification is complete under `SB-045`; `REL-001` now
owns the separate npm and website decisions and consumes no WIP. `SB-UX-001`
and `TEL-001` are ready, with the first-scan UX first by priority. The
repository owner is the only current product tester; `VAL-001` remains ready
with an intentionally empty owner-validation ledger, while `GTM-001` remains
parked with zero sessions and no recruitment authorization. CAL-001 records
`applied: false` and `admitted: false`; usefulness review and any rule-state
change remain separate owner decisions. Stale-path cleanup is isolated behind
exact owner approval and does not block local product work.

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
  evidence-backed default-off disposition for the
  `ai/compression-profile` signal, not from lowering the threshold or making
  a current v10.3 calibration claim. No Corpus v1 measurement activates the
  rule; explicit per-rule opt-in remains available for diagnostic use.
- The CAL-001 smoke adapter and runner are checkpointed at
  `f00c5364fc13d6452756d94071c76158cb4a05cd`. The focused calibration tests
  and package typecheck pass; the recorded one-worker receipt scanned 200/200
  selected source-bound files successfully and records `admitted: false`.
  The recursive release gates were rerun after this additive slice and pass.
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
- The CAL-001 unapplied decision matrix is checkpointed at
  `215647e22d8b289f944cc44e047efeedb553a04d`. It assigns 72 AI-specific rows
  `default-off` and 47 non-AI rows `quality-only`; 40 rows require owner review
  before any policy change, and the matrix records `applied: false` and
  `admitted: false`. Canonical matrix SHA-256 is
  `3c170e308f8ec0be1c1c31b4a5716810388f2692f6e7f0a179b4fd48665eca1c`.
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
  The deterministic diagnostic smoke (`admitted: false`) now selects 100 unique
  exact-content units per polarity. Its manifest SHA-256 is
  `bdbcd43279077fa760ae3c99da05b953c38134022fa34626b69a6b6400be00de` and its
  receipt SHA-256 is
  `ccd74f7b9db49adc802c042df0d7b732d8284d2bbfc4e6ec39e6a1c001c60830`.
  The source is verified for publisher-attested internal origin analysis and
  calibration evaluation. Its labels remain publisher claims, not witnessed
  authorship or quality labels. This permitted use does not approve public
  redistribution, admit v10.3 data, activate a rule, or make the source a
  production corpus.
- The post-smoke eligible projection retains all 10,000 rows with zero
  quarantine rows and zero unresolved exact/normalized cross-label collisions.
  Its manifest SHA-256 is
  `286134799c7f75837a7c292f0d18721d8da9263c25c041eef0ac4734801b52d8` and its
  receipt SHA-256 is
  `9f5274f57ed4adf9d1c1ef55205493e9a833abc86cb8e1ca2b332cd8c72d28ba`.
- CORPUS-002 now records one closed source registry and deterministic
  authority/integrity/rights router. Mendeley permits internal origin
  measurement and calibration evaluation; FormAI, OSSForge, and controlled
  HumanEval remain non-executable under their current dispositions. This
  source-use result does not change redistribution, v10.3 admission,
  usefulness-review, or rule-application state.
- MemoryBrick, LockBrick, and MendBrick are not shipped standalone products.
- A 2026-07-18 read-only check of `https://usebrick.dev/` still showed the old
  v0.43 marketing artifact, including contradictory rule counts and absolute
  “no telemetry” claims. The local website candidate corrects those claims,
  but no live deployment has been authorized or inferred.
- The approved recovery branch was merged and pushed to `main` at
  `11769b3a6d88faa94b16e8a3de96536a8bbc5ca6` after the installed pre-push gate
  passed. That integration did not create a tag, GitHub Release, npm publish,
  website deployment, corpus deletion, or other public release mutation.
- The working tree contains unrelated/user-owned changes. It must not be
  described as clean without a fresh verification.
- Outbound usage reporting is opt-in. Local scan history is on by default; the
  two behaviors must not be collapsed into a single "no telemetry" claim.

## WIP

| Track | Active | Limit | Plans |
| --- | ---: | ---: | --- |
| Implementation | 0 | 2 | None |
| Company | 0 | 1 | None |

`SB-045` is done. `SB-UX-001` and `TEL-001` are ready but do not consume WIP
until execution starts; priority selects the UX plan first. `VAL-001` remains
outside WIP until the repository owner starts a real walkthrough. `REL-001`
and `DOC-PRUNE-001` are waiting external and consume no WIP. `GTM-001` is
parked; no participant recruitment is planned or authorized.
`DOC-PRUNE-001` may resume only after exact path approval and does not consume
WIP while waiting.

## Plan board

| Priority | Plan | Status | Unmet `requires` | Next action |
| ---: | --- | --- | --- | --- |
| 0 | [`PLAT-001`](plans/PLAT-001-planning-control.md) | `done` | — | Keep future strategy and status changes in the canonical control plane. |
| 1 | [`SB-045`](plans/SB-045-trust-release.md) | `done` | — | Preserve the local qualification packet and hand first-scan work to SB-UX-001. |
| 2 | [`CORPUS-DEC-001`](plans/CORPUS-DEC-001-admission-contract.md) | `done` | — | Apply the accepted evidence and rights boundary through `CORPUS-001`. |
| 3 | [`CORPUS-002`](plans/CORPUS-002-source-use-routing.md) | `done` | — | Hand the completed source disposition to `VAL-001` without changing rule state. |
| 4 | [`CORPUS-001`](plans/CORPUS-001-v1-seed.md) | `done` | — | Hand off the verified source-attested seed without widening its evidence or rights claims. |
| 5 | [`CAL-001`](plans/CAL-001-heldout-calibration.md) | `done` | — | Keep the matrix `applied: false` and `admitted: false`; route usefulness review through `VAL-001`. |
| 6 | [`SB-UX-001`](plans/SB-UX-001-first-scan.md) | `ready` | — | Snapshot-test the five-part report information architecture. |
| 7 | [`TEL-001`](plans/TEL-001-local-outcomes.md) | `ready` | — | Define the privacy-safe local outcome event after the first UX contract establishes its finding/outcome boundary. |
| 8 | [`MEM-001`](plans/MEM-001-read-only-m0.md) | `draft` | `SB-UX-001`, `TEL-001` | Approve the M0 storage/provenance/freshness ADR. |
| 9 | [`LOCK-001`](plans/LOCK-001-new-debt-gate.md) | `draft` | `SB-UX-001` | Red-test one deterministic new-debt gate. |
| 10 | [`MEND-001`](plans/MEND-001-repair-proof.md) | `parked` | `LOCK-001` | Wait for enforcement trust, then prove one reversible repair. |
| 11 | [`ENT-001`](plans/ENT-001-demand-gate.md) | `parked` | `LOCK-001` | Wait for explicit future external-demand evidence; owner testing cannot satisfy it. |
| 12 | [`DOC-PRUNE-001`](plans/DOC-PRUNE-001-approved-cleanup.md) | `waiting_external` | — | Await exact owner approval for the numbered stale-path inventory while other lanes continue. |
| 13 | [`VAL-001`](plans/VAL-001-owner-validation.md) | `ready` | — | Run the first real owner-controlled scan-to-rescan walkthrough when the owner chooses. |
| 14 | [`GTM-001`](plans/GTM-001-vibecoder-pilots.md) | `parked` | — | Preserve the dormant protocol; do not recruit without a future owner-authorized revision. |
| 15 | [`REL-001`](plans/REL-001-public-release-boundary.md) | `waiting_external` | — | Await independent owner dispositions for npm release and website deployment. |

## Release gates

| Gate | State | Meaning |
| --- | --- | --- |
| Candidate scope | Satisfied | v0.45 is a trust/reliability release; no new rules are planned. |
| Current checkout gates | Satisfied | Recursive lint, typecheck, full test, and build gates pass in the current checkout; the build emits only the existing zod declaration-bundling warnings. |
| Self-scan disposition | PASS | 263/263 files complete with no runtime failures; 0 active AI-specific signals; AI Slop Score 0.0 against threshold 15. |
| Local qualification | Complete | `SB-045` owns the completed local contract; public decisions have moved to `REL-001`. |
| Public claims and metadata | Waiting external | The public package and live website remain unchanged until `REL-001` records exact owner dispositions. |
| Publish authorization | Not authorized | A green local candidate is not a release. GitHub Release + OIDC remains the only publish path. |
| Website deployment | Not authorized | The local candidate corrects verified live-site claim drift; it still requires owner/SHA review and separate deployment authorization. |

## Waiting external

`REL-001` waits for independent repository-owner dispositions for the npm
package and website. Each surface must be `hold` or `authorize`; every
authorization must name the exact reviewed commit/SHA and, for npm, the exact
tag. A green gate, merge, push, or roadmap transition cannot replace that
input. `SB-UX-001`, `TEL-001`, and owner-selected `VAL-001` work may continue;
no participant recruitment is authorized.

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
- The stable-identity `ci --max-new-issues` contract is now implemented under
  `SB-045`; future UX work must preserve its tested current/new-debt semantics
  and must not reintroduce the retired `.slop-audit-cache.json` path.
- Archive/delete candidates still require explicit path-level approval; that
  approval does not prevent additive documentation and product work.

## Next checkpoint

The next local checkpoint is the reviewed `SB-UX-001` implementation plan for
snapshot-tested first-scan information architecture. `TEL-001` is ready behind
that initial finding/outcome boundary. `VAL-001` may accumulate only real
owner-controlled scan-to-rescan receipts when the owner chooses; it has no
target-count gate and cannot establish participant, team, or market-demand
evidence. `REL-001` remains the separate public-authority checkpoint. Do not
lower thresholds, activate rules, invent owner runs, recruit participants, or
infer publish, tag, or deployment authority from local roadmap progress.
