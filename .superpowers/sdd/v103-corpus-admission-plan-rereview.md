# v10.3 corpus source-admission plan — independent rereview

**Date:** 2026-07-11
**Plan:** `packages/slopbrick/docs/calibration/v10.3-corpus-source-admission-plan.md`
**Verdict:** **CHANGES_REQUIRED**

The revised plan materially closes the earlier witness-feasibility,
provider-version, family-accounting, canary-capacity, disposition-conservation,
and M1–M4 findings. It is not yet executable because the following contract
defects remain.

## Findings

1. **Reviewer decisions have cyclic identities.** `decisionId` hashes
   `hiddenPeerDecisionIds`, while each blind decision must reference the other
   decision ID. Neither can be finalized independently. Move peer linkage to a
   separate post-decision blindness receipt.

2. **The verified-context trust boundary is not implementable.** Core owns
   `deriveAdmissionDisposition`, while SlopBrick allegedly creates an
   uncastable runtime brand; Core exposes no brand-finalization authority and
   the plan also references an undefined `verifyAdmissionContext`. Give one
   package explicit ownership and define runtime enforcement.

3. **Immutable HTTPS evidence is not reproducibly available offline.** Its
   locator contains only a remote URL; the offline reader has no schema-bound
   cache/materialization locator. `toolReceiptSha256` is opaque and absent from
   the verified context. Add proof-carrying offline payload and tool-receipt
   bindings.

4. **The exact-overlap authority is not fully derivable or scale-safe.**
   Universe rows bind only declared polarity while `crossPolarity` depends on
   an unpersisted proposed label; the builder receives only a universe summary,
   not its record stream. One JSON `edges` array can grow quadratically and no
   real-scale resource acceptance proves the 452,382-unit run feasible.

5. **Release-asset dependency order is impossible.** Admission Task 1 claims
   to reuse `ReleaseArchiveMaterialization` and `MaterializationReceiptV1`, but
   those contracts are not implemented and the release plan is gated only
   before admission Task 9. Land the shared Core owner first or make the
   relevant release tasks explicit admission prerequisites.

6. **The first composed census lacks required source reviews.** The composed
   register has 12 original entries plus 317 repository material sources, but
   Task 4 creates reviews only for the 12 originals. Every one of the 329
   entries must be represented without fabricating eligibility.

7. **`historical_inference` trusts forgeable Git dates for gold human
   provenance.** Require independent pre-cutoff temporal evidence such as a
   timestamped archive or registry release; otherwise keep the route
   sensitivity-only.

8. **Census CAS recovery is underspecified.** The transaction omits temporary
   paths and an initial/no-current state, initial creation is not explicitly
   lock-protected, and successful transaction/lock deletion plus directory
   fsync ordering is absent.

9. **Several persisted authorities lack schemas.** `policy-v1.json`, witness
   policy, search receipts, tool receipts, blindness receipts, and witness
   review receipts are persisted or hash-trusted but absent from the Core
   schema task.

10. **Task 0 over-couples unrelated tools.** Missing jq, BSD `du`, Python, or
    pyarrow blocks Core and TypeScript tasks that do not use them. Split tool
    profiles by TypeScript/Core, Git acquisition, shell evidence, and Droid
    Python work.

11. **Acquisition is only partially bounded.** The prose promises a 5-GiB
    transfer cap while the schema can enforce only materialized bytes. Git
    environment isolation and redirect/private-network protections are also
    weaker than the release-asset downloader boundary.

12. **Verification gates are incomplete.** The overlap task omits
    typecheck/build/lint, the manifest task changes Core without Core codegen
    and schema/contract gates, and final verification omits the repository-wide
    recursive gates required by `AGENTS.md`.

13. **The implementation remains horizontally sliced.** Roughly twenty
    contracts land before an executable end-to-end slice, and census fixtures
    depend on authorities introduced only later. Re-slice into independently
    runnable contract → authority → census increments.

## Acceptance for the next rereview

Every finding above must be closed in the operative interfaces, dependencies,
tasks, failure tests, and verification commands—not only in a closure table.
No implementation, corpus acquisition, manifest, selection, or calibration run
may start before a fresh plan audit returns READY.
