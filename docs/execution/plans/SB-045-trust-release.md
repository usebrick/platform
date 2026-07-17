# SB-045 — Qualify the SlopBrick v0.45 trust release

- **Status:** `waiting_external`
- **Priority:** 1
- **Track / lane:** implementation / slopbrick
- **Owner:** SlopBrick maintainers
- **Updated:** 2026-07-18

## Outcome

Produce a truthful v0.45 go/no-go packet in which scan completion, policy
decision, report output, remediation, durable baseline behavior, CLI metadata,
and release claims agree.

## Current truth

The workspace is an unreleased 0.45.0 candidate with 119 rules in 27
categories. Implementation checkpoint `c2d337b7f385963b150a8da5f9e823ccffa51ea5`
passes recursive typecheck and build, the serialized full SlopBrick package
suite, and the packed Node 22/24 diagnostic. The repository-wide serialized
test command has seven host-sensitive failures (beacon listen permissions,
special filesystem mode bits, and sandboxed pnpm-store writes); the affected
package tests pass in the isolated one-worker package receipt. The exact
package-local self-scan completes all 263 selected files with no runtime
failures and now passes at `0.0 <= 15`: the unadmitted
`ai/compression-profile` signal is explicitly default-off/opt-in pending
current v10.3 admitted, leakage-checked evidence. This is a local candidate
qualification pass, not publication authorization. A current 2026-07-18 rerun
of the four root commands (`lint`, `typecheck`, `test`, and `build`) also
passes in this checkout; the seven host-sensitive failures belong to the older
qualification receipt and are not present in this current run. Claim/artifact
reconciliation remains locally aligned for 0.45.0 while the public 0.43
artifact and live-site drift remain separate. The local work is complete; the
plan now waits on an owner decision for the live/public claim boundary.

## Scope

- One typed gate-decision contract shared by renderers and process exit.
- Finding-specific, safe fix plans with correct stale/evidence handling.
- Durable baseline identity and current-versus-new debt behavior.
- A truthful disposition for the advertised but currently inert
  `ci --max-new-issues` option: implement it against stable finding identity or
  remove/deprecate it with migration guidance.
- Version, category, command, artifact, privacy, and website claim alignment.
- Explicit self-scan disposition and RAM-safe full release qualification.
- No new rules.

## Non-goals

- Claiming v10.3 calibration, activating unmeasured rules, or changing scoring
  merely to pass self-scan.
- Publishing, tagging, deploying, or pushing.
- Building the full SlopBrick UX, MemoryBrick, or hosted telemetry.

## Dependencies

- `requires`: none
- `benefitsFrom`: `CORPUS-001`; v0.45 does not wait for it if no new
  calibration claim is made.

## Acceptance criteria

- A single typed decision drives human, JSON/SARIF, summary, and exit behavior.
- Incomplete or failed scans cannot be represented as passing.
- Every suggested automated fix is bound to the actual finding and rejects
  stale or ambiguous evidence.
- Baselines survive the supported local workflow and show new debt separately.
- `ci --max-new-issues` either gates a tested stable-identity delta or is no
  longer advertised; it cannot silently accept an unused value.
- Public/candidate version and rule/category claims are artifact-derived or
  explicitly reconciled.
- Local scan history and outbound opt-in reporting are accurately documented.
- The self-scan result has an evidence-backed accept/fix/defer decision.
- Package typecheck, full tests, build, packed Node 22/24 diagnostic, and
  package-local self-scan complete with recorded commands and hashes.

## Execution steps

1. Red-test a single gate decision across report and exit surfaces -> verify:
   `corepack pnpm --filter slopbrick exec vitest run tests/cli/gate-decision-contract.test.ts --maxWorkers=1 --minWorkers=1`.
2. Add typed finding-to-fix safety contracts -> verify:
   `corepack pnpm --filter slopbrick exec vitest run tests/fix --maxWorkers=1 --minWorkers=1`.
3. Red-test and resolve the inert `ci --max-new-issues` contract, then prove
   durable baseline/new-debt behavior -> verify:
   `corepack pnpm --filter slopbrick exec vitest run tests/baseline --maxWorkers=1 --minWorkers=1`.
4. Reconcile commands, artifacts, versions, categories, and privacy claims ->
   verify: `corepack pnpm --filter slopbrick build`.
5. Decide the self-scan disposition and run the RAM-safe release matrix ->
   verify: recursive typecheck/build, serialized package tests, packed
   Node 22/24 diagnostic, and the exact package-local self-scan; record any
   host-sensitive recursive-test boundary separately.
6. Assemble the go/no-go evidence without publishing -> verify: compare the
   packet against the pre-release checklist in `AGENTS.md`.

## Verification

Use focused one-worker tests while iterating, then run the complete repository
gates and package-local self-scan exactly as documented in `AGENTS.md`.

## Evidence destination

`docs/execution/evidence/SB-045-release-qualification.md`

## Waiting external

- **Exact input:** the repository owner must choose one of these explicit
  dispositions and record it in the execution evidence:

1. authorize deployment of the reviewed local website candidate at a named
   commit/SHA after owner review; or
2. keep the live v0.43 site unchanged and accept that the unreleased v0.45
   candidate remains local-only until a later release decision.

- **Owner:** repository owner / release maintainer.

- **Last verified:** 2026-07-18, read-only `https://usebrick.dev/` check showed
  the published v0.43 artifact and legacy absolute “no telemetry” wording.

- **Evidence:** [`SB-045-release-qualification.md`](../evidence/SB-045-release-qualification.md)
  records the local v0.45 qualification pass; the live-site check is the
  current external-state observation.

- **Resume condition:** a written decision with the selected disposition and,
  for deployment, the exact reviewed commit/SHA. A read-only live-site check
  may then confirm the result; it cannot substitute for authorization.

- **Recheck:** after an owner decision, re-read the live site and compare its
  version, rule count, category count, privacy wording, and deployment SHA
  with the authorized disposition.

- **Parallel safe:** GTM-001 protocol preparation and other local,
  non-publishing work may continue. No publish, tag, push, deployment, or
  remote mutation is implied by this wait.

## Rollback

Revert each contract slice independently. Preserve any new failing fixture as
evidence if it exposed pre-existing drift.

## Next action

Obtain the owner disposition above. Until then, preserve the local
qualification packet and keep publication, tagging, deployment, and push
unauthorized.
