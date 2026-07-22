# UseBrick roadmap

**Updated:** 2026-07-22
**Execution status:** [docs/execution/STATUS.md](docs/execution/STATUS.md)

## Product thesis

> **UseBrick is the coherence and verification layer for agent-built
> software.**

UseBrick is the sole customer-facing product: one repository-owned contract
shared by developers, coding agents, and CI. It helps people answer a practical
question after an agent-assisted build—"It works, but is it actually well
built?"—then carries verified repository truth through an adoption loop of
**scan -> useful finding -> fix -> rescan -> protect**.

## Entry point and customer journey

Serious solo developers and vibe coders are the free local-scan entry audience.
They are not the proven core buyer. The initial buyer hypothesis is AI-native
software teams and agencies with roughly 5–100 developers, especially teams
managing frequent agent-authored changes and architecture, maintenance,
contractual, or reputational risk.

The shortest useful journey is:

1. run SlopBrick locally without an account;
2. understand one evidenced visual, frontend, code, or repository-coherence
   problem;
3. fix it and rescan;
4. save a repository baseline;
5. adopt new-debt-only CI checks with the team; and
6. add organisation governance only after repeated team demand.

The product-led loop does not require a dashboard, hosted account, or complete
historical cleanup. Rule count, AI-origin association, and a single score are
supporting evidence surfaces, not the north star.

## Product and capability model

| Product or capability | Role | Sequencing boundary |
| --- | --- | --- |
| **UseBrick** | Coherence and verification product; repository-owned contract | Sole customer-facing product. |
| **SlopBrick** | Observe, detect, explain, and emit repository evidence | Shipped npm package, current CLI, free local scanner, and acquisition surface. |
| **Memory capability** | Compile facts, approved intent, provenance, and freshness into bounded agent context | Start read-only and benchmark against native agent context; no package or new store before an ADR. |
| **Pick flow** | Initialize repository policy and approved intent | Fold into onboarding and policy authoring; current commands remain `slopbrick`. |
| **Lock capability** | Prevent newly introduced verified drift | First paid-workflow hypothesis inside the current CLI; earn external team evidence before extraction. |
| **Mend capability** | Apply narrow, deterministic, reversible repairs with receipts | Keep parked until enforcement trust and rollback proof exist. |
| **RenderBrick Labs** | Test whether rendered/runtime evidence adds value beyond source inspection | Draft benchmark only; stop if incremental value is not material. |
| **Enterprise controls** | Shared policy, approvals, audit, and multi-repository governance | Build only after several paying teams independently report the same need. |

## Current verified baseline

SlopBrick is the only shipped capability in this hierarchy and the current
front door to UseBrick. The public package and the unreleased workspace
candidate are different artifacts. Memory, Lock, Mend, and Render Labs are
capability and sequencing names, not shipped products or package authority.
The precise dated counts, corpus state, self-scan result, release
authorization, and working-tree state live in
[the execution status](docs/execution/STATUS.md), not in this strategy file.

Corpus v1 currently uses the pinned Mendeley `HumanVSAI_CodeDataset` v1 for
publisher-attested internal origin analysis and calibration evaluation. Its
5,000 AI / 5,000 Human labels are publisher claims bound to exact local bytes,
family-safe splits, and collision checks; they are not witnessed authorship or
quality labels. The source is not approved for public redistribution, and its
use does not admit v10.3 data or activate a rule.

The repository owner is the only completed product tester. `VAL-001` preserves
its first owner-run self-scan and unchanged rescan as recorded evidence, then
returns to ready while active `CAL-002` completes the separate claim-matched
calibration and provenance program. `GTM-001` is ready for planning 10–20
consent-safe observed external sessions. Completed sessions remain zero, and
this roadmap does not authorize outreach, contact, scheduling, recording, or
data collection.

Volatile adoption, pricing, competitor, and market-size observations live only
in the dated
[market-positioning research note](docs/research/usebrick-market-positioning-2026-07-19.md).
Its scenarios are not measured UseBrick demand or forecasts.

The frozen CAL-002 v1 implementation boundary remains checkpointed through
`e6c9695ea`; its old three-way origin questionnaire is paused after one
historical hold. Progressive authority Tasks 1–8 remain implementation-
checkpointed and independently approved through `e8e62b779`; Tasks 9–11 are
implementation-checkpointed through `651f52d78` after controller adversarial
audit, with no external approval claimed because their independent reviewers
stalled. Task 12 is integrated at `473ceafc3` after two independent final
approvals. Together these tasks preserve the locked 119-rule projection—47
starting quality + 26 transferred quality + 4 blocked quality + 3 superseded +
7 retired + 32 research-origin rows—add the reviewed immutable owner-batch
path, close all 32 quality rows without labels, freeze the supersession and
transfer-oracle contracts, and implement the canonical SQL, console, and
`any` semantics while the old IDs remain runnable. Task 12's fail-closed
TypeScript-AST doctrine keeps current public copy for exactly 73 active quality
rows free of origin, causation, and authorship claims across descriptions,
emitted messages and advice, `RULE_HINTS`, and the generated 119-row catalog.
The catalog is deterministic at SHA-256
`9bc6ede48b7df38d0b0e71be32691c3eebb9258817a95916752e442c7e771efd`.

The quality-disposition, parity, and supersession receipt schemas were closed
at `dd8360fba`, `b5bd09090`, and `66251c9fa`. Task 13 is integrated on main at
`e956f7900`, `366246e5d`, and lock hardening `8c8760783`; originating sidecar
`34bf81fe1` / `fa5d452c5` is provenance only.

Task 13 projects exactly 32 canonical `research-only` origin rows, binds frozen
governing and replay identities, consumes no v1 owner-decision rows, and stores
no raw source or path. Every row remains default-off, explicit-opt-in,
score-neutral, gate-neutral, and non-admitting.

Task 14 is integrated on main from `d7b11b70e` through `c13ce8f47`. It closes
the fail-closed 119-row matrix, approval, unapplied/applied policy, application
receipt, six CLI commands, strict schemas, and immutable publication contracts.

The reducer independently checks all 41 evidence-ready deterministic rows—32
starting plus nine transferred—against five fixed control slots:
`alternate-syntax`, `baseline`, `comment-adjacent`, `near-miss`, and
`regression-safe`. These are protocol slots, not semantic source families.

Task 14 binds the top-level and per-control frozen Corpus v1 receipt SHA
`47bd66907ec2efa67da718e0cfb38458151ca84d3cdedc941488fe4b001475ac` and
keeps durable receipts free of source text and paths. Application publication
is receipt-first and policy-commit-marker-last, with proof-limited rollback.

Its expanded Task 13/14 gate passes 198/198 on exact Node 22.22.3 and 24.15.0
with SlopBrick typecheck on both. The bounded Node 24 full suite passes 4,485
tests with 15 skipped; independent final review reports no findings.

Task 15 is checkpointed at `6a85e4346`, with the additive single-root manifest
contract at `80acf1ada`. The owner approved the exact `26/4/3/7` authority batch
and exact 119-row matrix. All 41 deterministic rows passed, all 32 unmeasured
quality candidates remain score- and gate-ineligible, and all 32 research-
origin rows remain default-off and non-admitting.

The one human-facing Task 15 evidence root is
`53ab07e7fd5dbbd09f595c87c255a636f3fb902abe7ec0cbfe923a5392198f8a`;
its manifest binds the exact 13 primary artifacts without repeating each leaf
hash in roadmap prose. The matrix and approval remain `applied: false` and
`admitted: false`.

Task 16 is implementation-checkpointed through `417ca5668`, with the clean-
install schema-test dependency correction at `3c1572f89`. The pure accessors
fail closed unless a complete applied policy matches the exact approved Task 15
projection, detach and freeze the validated state, keep blocked, superseded,
and retired rows non-runnable, and separate explicit diagnostic visibility
from score eligibility. Unknown IDs retain the legacy fallback. The production
provider still returns `undefined`, so scanner behavior remains unchanged.

The focused Task 16 contract passes 7/7 on exact Node 22.22.3 and 24.15.0 with
SlopBrick typecheck on both. The recursive gates are green, including 4,496
passing SlopBrick tests with 15 intentional skips, and two independent final
reviews returned 99/100 and 100/100 with no findings.

The next bounded slice is Task 17: integrate runnable and score authority into
scanner paths using the exact approved-policy test helper while the production
provider remains inactive. Task 17 may prove runtime semantics through mocks;
it cannot activate the policy. Local application remains separate from push,
tag, publish, deploy, and release authority.

The local SlopBrick v0.45 qualification contract is complete under `SB-045`.
Public npm release and website deployment remain separate owner decisions under
`REL-001`; neither decision blocks local first-scan or outcome-contract work.

## Operating principles

- **Local-first and useful before signup.** The first scan must provide value
  without a hosted account.
- **Evidence before confidence.** Distinguish deterministic findings,
  calibrated signals, and advisory visual judgement.
- **Repository truth and global learning are separate.** The Memory capability
  compiles local intent and exceptions; opt-in outbound reporting may improve
  global priors without raw source by default.
- **Current debt is not new debt.** Teams can adopt the Lock capability without
  cleaning an entire existing repository first.
- **No uncalibrated default-on rules.** Candidate signals remain off until
  their stated admission criteria are met.
- **Origin and quality are separate axes.** AI-positive does not mean bad, and
  human-negative does not mean good.
- **Evidence tier controls use, not existence.** Verified publisher-attested
  data can support bounded internal origin evaluation without becoming v10.3
  gold evidence, redistribution-approved bytes, usefulness proof, or an
  applied rule decision.
- **Repairs are deterministic and reversible first.** Every Mend-capability
  change must rescan, run repository checks, and roll back safely.
- **One source of planning truth.** Strategy belongs here; live state and
  dependencies belong in `docs/execution/index.json`.
- **No project-wide blockers.** If an input is unavailable or a method proves
  invalid, preserve the evidence, replace that path with the smallest truthful
  alternative, and continue the highest-priority independent plan. Never
  fabricate provenance, labels, passing gates, or authority to make progress
  appear green.

## Now — 0 to 30 days

### Outcomes

- Maintain the completed documentation control plane and execute only
  explicitly approved stale-path cleanup without slowing product work.
- Preserve the completed SlopBrick v0.45 local qualification: unified report
  and exit decisions, finding-specific remediation, durable baselines, an
  explicit self-scan disposition, and a truthful local go/no-go packet. Keep
  public release and deployment authority isolated under `REL-001`.
- Preserve the completed CORPUS-002 source-use routing around the verified
  Mendeley seed and keep every frozen Corpus v1 and CAL-001 hash reproducible
  without changing rule state or v10.3.
- Start active `CAL-002` beside `SB-UX-001`: complete separate quality and
  origin evidence lanes, beginning with the additive v2 authority taxonomy and
  exact 119-row projection. Keep CAL-001 and CAL-002 v1 evidence frozen,
  preserve `applied: false` and `admitted: false`, and make first-scan
  provenance distinguish current from legacy calibration.
- Keep `VAL-001` ready with RUN-001 preserved. Future owner walkthroughs stay
  optional, owner-selected evidence with no participant or target-count gate.
- Align local website source, package claims, telemetry language, and release
  facts without inferring a live deployment, publication, or public release.
- Stop expanding rule count unless an observed user problem requires it.
- Keep `GTM-001` ready to prepare a participant profile, session script,
  consent text, and redacted receipt template for 10–20 observed external
  sessions. Completed sessions remain zero; no outreach, contact, scheduling,
  recording, or data collection is authorized.

### Exit gate

The local gate is satisfied: planning validation passes, v0.45 has green local
qualification gates plus an explicit self-scan decision, and the completed
CORPUS-002 receipt preserves the seed, smoke, holdout, and decision-matrix
receipts. Begin the Next-horizon local work without waiting for `REL-001`.
Owner validation has begun and may accumulate only when the owner chooses;
the first no-fix row does not satisfy the repeated fix-loop exit gate. No
participant count is a release or source-use gate. Publishing and deploying
remain separate owner-authorized actions. `GTM-001` readiness authorizes
planning artifacts only, not participant action.

## Next — 31 to 90 days

### Outcomes

- Continue `SB-UX-001`: deliver a five-part scan taxonomy, evidence tiers,
  current-versus-new debt, and three prioritized actions in the
  first-scan/rescan loop. Its reviewed TDD implementation plan, READY audit,
  and shared-report impact map are approved. It remains active with `CAL-002`
  as its evidence-provenance closeout gate; CAL-002 does not add an unmet
  `requires` edge. Revision 38 grants no authority to alter default state,
  score, baseline, source, admission, release, deployment, or published
  artifacts; remote state is outside its receipt.
- Continue active `CAL-002` from the approved amendment: Tasks 1–15 remain
  checkpointed as recorded above, and Task 16 is implementation-checkpointed
  through `417ca5668`. Run Task 17 only: integrate runnable and score authority
  through exact approved-policy mocks while the production provider remains
  inactive. Do not write or apply policy, admit evidence, or take a release
  action.
  `VAL-001` and `TEL-001` remain ready; `REL-001` remains the unchanged
  separate public-authority boundary.
- Follow with `TEL-001`: define a local, inspectable, opt-in outcome-event
  contract for useful finding, action or decline, rescan, and return outcomes,
  with export and deletion and no raw source or proprietary repository
  identifier by default.
- Build the Memory M0 capability as a read-only projection of observed facts,
  declared policy, provenance, and freshness; benchmark repository-owned
  context against native context across multiple agents.
- Add a source-specific adapter only when its immutable evidence, rights, and
  requested use pass the closed source policy. Keep pending FormAI, OSSForge,
  and HumanEval dispositions non-executable until their own bounded changes
  close; keep proxies and ordinary recent repositories out of origin fitting.
- Validate the Lock capability's deterministic new-only gate as the first paid
  workflow hypothesis inside the current CLI on owner-controlled repositories
  or fixtures. Keep team adoption and willingness-to-pay claims open until
  external evidence exists.
- Run `LABS-001` as a bounded source-only versus rendered/runtime-evidence
  benchmark with fixed defects and blind scoring. Stop if rendered evidence
  adds no material incremental value.
- Test team pricing and workflow value with AI-native teams and agencies only
  after separate participant authorization; keep every price a hypothesis
  until paid evidence exists.

### Exit gate

Advance when owner-run receipts repeatedly reach a useful finding and rescan,
the Memory capability improves a measured cross-agent task without
stale/bloated context, and the Lock capability prevents verified new debt with
an acceptable waiver burden.
These owner receipts do not satisfy future team or market-demand gates.

## Later — 3 to 12 months

- Expand the Lock capability only around rules teams trust and are willing to
  enforce.
- Start the Mend capability with a very small set of deterministic
  transformations whose
  rollback and verification work on owner-controlled validation repositories.
- Add hosted team history, approvals, and policy ownership only when they make
  the local workflow materially better.
- Add enterprise SSO, audit, policy inheritance, self-hosting, and multi-repo
  context only after repeated paid demand.

## Twelve-month decision gates

| Gate | Proceed only when | If the gate fails |
| --- | --- | --- |
| Scanner trust | Owner-run walkthroughs reach a useful evidenced finding, fix, and rescan; deterministic checks have acceptable precision. | Keep improving SlopBrick and do not widen the suite. |
| Repository intelligence | Repository-owned context improves architecture/build/test outcomes across agents and at least two teams maintain it in Git. | Keep it read-only and experimental; do not make enforcement depend on it. |
| Team monetization | The Lock workflow sees repeated weekly use, low false-block/waiver burden, and demonstrated willingness to pay. | Stay product-led and repair precision before hosted expansion. |
| Repair | A bounded fix set applies, rescans, tests, and rolls back reliably on owner-controlled validation repositories. | Keep the Mend capability parked. |
| Rendered evidence | Blind comparison shows material incremental defect detection without unacceptable false positives. | Stop the Labs path; do not build a browser or make a customer claim. |
| Enterprise | Several paying teams independently request the same multi-repository controls. | Do not build enterprise infrastructure speculatively. |

## Success measures

The north star is **repositories that fix or prevent at least one verified
finding each week**.

Supporting owner-side measures are scan completion, time to first useful
finding, action taken or declined, rescan completion, return within the
observation window, confirmed new-debt preventions, and waiver rate. Future
external measures include team/workflow fit, willingness-to-pay signals,
conversion, and paid retention only after real external evidence exists.
Guardrails are incomplete scans, raw-source egress, uncalibrated default-on
rules, unsafe repair rollback, and claim/evidence drift.

## Non-goals

- Proving that an individual file was written by AI.
- Replacing security scanners, generic linters, code-review bots, visual
  regression tools, or coding agents.
- Treating all recent GitHub code as human or AI ground truth.
- Building an unrestricted archive of agent conversations or a vector database
  of every file.
- Marketing capability names as separate products or creating packages before
  their architecture and evidence gates pass.
- Making release, publish, deploy, or remote mutations implicit in roadmap
  progress.

## Execution authority

- [Execution guide](docs/execution/README.md)
- [Machine-readable plan index](docs/execution/index.json)
- [Current status](docs/execution/STATUS.md)
- [Planning changelog](docs/execution/CHANGELOG.md)
- [Bounded plans](docs/execution/plans/)
- [Recoverable archive policy](docs/archive/README.md)
