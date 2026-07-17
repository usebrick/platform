# Usebrick roadmap

**Updated:** 2026-07-17
**Execution status:** [docs/execution/STATUS.md](docs/execution/STATUS.md)

## Product thesis

> **Usebrick keeps AI-generated software coherent.**

Usebrick helps people answer a practical question after an AI-assisted build:
"It works, but is it actually well built?" It then carries the answer from a
local scan into repository memory, team enforcement, and eventually trusted
repair.

## Entry point and customer journey

Vibecoders are the entry point and main door. The shortest useful journey is:

1. run SlopBrick locally without an account;
2. understand one evidenced visual, frontend, code, or repository-coherence
   problem;
3. fix it and rescan;
4. save a repository baseline;
5. adopt new-debt-only CI checks with the team; and
6. add organisation governance only after repeated team demand.

The product-led loop is therefore **scan -> useful finding -> fix -> rescan ->
protect**. A dashboard, hosted account, or complete historical cleanup is not a
prerequisite.

## Product roles

| Product | Role | Sequencing boundary |
| --- | --- | --- |
| **SlopBrick** | Free scanner, acquisition front door, and immediate vibecoder value | Improve trust, evidence, first-run UX, and repository-aware analysis now. |
| **MemoryBrick** | Repository-owned intelligence substrate | Start read-only with provenance, freshness, bounded context, and agent adapters; do not market it as the first standalone product. |
| **Pick flow** | `usebrick init` and policy authoring | Fold into onboarding and policy setup instead of launching another product. |
| **LockBrick** | First paid team product: prevent verified new drift | Pilot a deterministic new-debt gate in the existing CLI before extracting a package. |
| **MendBrick** | Deterministic, reversible repair | Keep parked until detection and enforcement have earned trust. |
| **Enterprise** | Multi-repository governance, audit, and policy inheritance | Build only after several paying teams independently request the same controls. |

## Current verified baseline

SlopBrick is the only shipped product in this hierarchy. The public package and
the unreleased workspace candidate are different artifacts. MemoryBrick,
LockBrick, and MendBrick are product directions, not shipped standalone
products. The precise dated counts, corpus state, self-scan result, release
authorization, and working-tree state live in
[the execution status](docs/execution/STATUS.md), not in this strategy file.

## Operating principles

- **Local-first and useful before signup.** The first scan must provide value
  without a hosted account.
- **Evidence before confidence.** Distinguish deterministic findings,
  calibrated signals, and advisory visual judgement.
- **Repository truth and global learning are separate.** MemoryBrick stores
  local intent and exceptions; opt-in telemetry may improve global priors
  without raw source by default.
- **Current debt is not new debt.** Teams can adopt LockBrick without cleaning
  an entire existing repository first.
- **No uncalibrated default-on rules.** Candidate signals remain off until
  their stated admission criteria are met.
- **Origin and quality are separate axes.** AI-positive does not mean bad, and
  human-negative does not mean good.
- **Repairs are deterministic and reversible first.** Every MendBrick change
  must rescan, run repository checks, and roll back safely.
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
- Qualify the SlopBrick v0.45 trust release without adding new rules: unify
  report and exit decisions, make remediation finding-specific, harden durable
  baselines, settle the self-scan disposition, and produce a truthful go/no-go
  packet.
- Approve a bounded Corpus v1 decision contract, then build a source-attested
  seed and run a reproducible 100-positive/100-negative smoke. Preserve v10.3
  until the replacement has verified evidence.
- Complete five vibecoder scan-to-rescan pilots and identify the first useful
  finding, time-to-value, abandonment point, and CI interest.

### Exit gate

Advance when the planning validator and links pass, v0.45 has green release
gates plus an explicit self-scan decision, the seed smoke has a reproducible
receipt, and five pilot outcomes are recorded. Publishing and deploying remain
separate owner-authorized actions.

## Next — 31 to 90 days

### Outcomes

- Deliver a five-part scan taxonomy, evidence tiers, current-versus-new debt,
  and three prioritized actions in the first-scan/rescan loop.
- Define a local, inspectable, opt-in outcome-event contract with export and
  deletion and no raw source or proprietary repository identifier by default.
- Build MemoryBrick M0 as a read-only projection of observed facts, declared
  policy, provenance, and freshness; benchmark bounded native adapters across
  multiple agents.
- Audit at least 25 owner-attested AI applications plus a matched set of 25
  pre-LLM temporal-proxy snapshots by repository family, capped initially at
  200 eligible files per repository. Keep proxies and ordinary recent
  undisclosed repositories out of human/AI ground-truth fitting unless they
  gain separate source-attested labels.
- Pilot LockBrick's deterministic new-only gate with two teams or design-system
  owners and publish the benchmark and corpus methods.

### Exit gate

Advance when pilots repeatedly reach a useful finding and rescan, MemoryBrick
improves a measured cross-agent task without stale/bloated context, and
LockBrick prevents verified new debt with an acceptable waiver burden.

## Later — 3 to 12 months

- Expand LockBrick only around rules teams trust and are willing to enforce.
- Start MendBrick with a very small set of deterministic transformations whose
  rollback and verification work on pilot repositories.
- Add hosted team history, approvals, and policy ownership only when they make
  the local workflow materially better.
- Add enterprise SSO, audit, policy inheritance, self-hosting, and multi-repo
  context only after repeated paid demand.

## Twelve-month decision gates

| Gate | Proceed only when | If the gate fails |
| --- | --- | --- |
| Scanner trust | Pilots consistently reach a useful evidenced finding, fix, and rescan; deterministic checks have acceptable precision. | Keep improving SlopBrick and do not widen the suite. |
| Repository intelligence | MemoryBrick improves architecture/build/test outcomes across agents and at least two teams maintain the memory in Git. | Keep it read-only and experimental; do not make enforcement depend on it. |
| Team monetization | LockBrick sees repeated weekly use, low false-block/waiver burden, and demonstrated willingness to pay. | Stay product-led and repair precision before hosted expansion. |
| Repair | A bounded fix set applies, rescans, tests, and rolls back reliably on pilot repositories. | Keep MendBrick parked. |
| Enterprise | Several paying teams independently request the same multi-repository controls. | Do not build enterprise infrastructure speculatively. |

## Success measures

The north star is **repositories that fix or prevent at least one verified
finding each week**.

Supporting measures are scan activation, time to first useful finding,
useful-finding rate, fix/rescan rate, weekly retained repositories,
Lock-confirmed preventions, waiver rate, team-pilot conversion, and paid
retention. Guardrails are incomplete scans, raw-source egress, uncalibrated
default-on rules, unsafe repair rollback, and claim/evidence drift.

## Non-goals

- Proving that an individual file was written by AI.
- Replacing security scanners, generic linters, code-review bots, visual
  regression tools, or coding agents.
- Treating all recent GitHub code as human or AI ground truth.
- Building an unrestricted archive of agent conversations or a vector database
  of every file.
- Launching five separately marketed products before the scan-to-protect loop
  works.
- Making release, publish, deploy, or remote mutations implicit in roadmap
  progress.

## Execution authority

- [Execution guide](docs/execution/README.md)
- [Machine-readable plan index](docs/execution/index.json)
- [Current status](docs/execution/STATUS.md)
- [Planning changelog](docs/execution/CHANGELOG.md)
- [Bounded plans](docs/execution/plans/)
- [Recoverable archive policy](docs/archive/README.md)
