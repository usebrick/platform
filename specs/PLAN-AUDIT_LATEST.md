# Plan Audit — v10.3 corpus admission and immutable release assets

**Date:** 2026-07-11 · **Verdict:** READY TO EXECUTE

## Frozen plans

| Plan | SHA-256 | Role |
| --- | --- | --- |
| `packages/slopbrick/docs/calibration/v10.3-release-asset-materialization-plan.md` | `7a20d89c35dcea0d9255e21d3e9cdadf89404c229a7c2dcb474b6bbacac7cb41` | Owns the additive Core release-archive/materialization contract and implementation Tasks 1-6; Tasks 7-8 are downstream consumers. |
| `packages/slopbrick/docs/calibration/v10.3-corpus-source-admission-plan.md` | `233ede7262dd408318230f32ab4cc5d2103caf8b5662ae4fb228088531f70e75` | Owns provenance admission Tasks 0-11, including the v10.3.2 witness-bound manifest and final in-process consumer authority. |

The independent full-plan review is
`.superpowers/sdd/v103-corpus-admission-plan-final-review.md`. During Task 3
RED/design work, official Node/POSIX/IANA/RFC research exposed a rename-race
and raw-header/deadline gap in the release plan. The focused correction from
release SHA `0115a2c73dcfd0a086c70b1e3fe6519558bf7c34ff4942d97d52c3dfa92c585d`
to the tabled SHA is independently approved in
`.superpowers/sdd/v103-release-task3-plan-rereview.md`. Together they record
**READY TO EXECUTE**. This approves planning only; it does not claim that
implementation, corpus evidence, manifests, smoke, canary, or release gates
already pass.

## Canonical execution order

1. Implement and independently approve release-materialization Tasks 1-6.
   This opens one coordinated, unreleased Core `0.3.0` schema tranche and
   preserves the existing Git path.
2. Execute admission Tasks 0-3B as reviewed vertical TDD slices: durable tool
   and evidence authority, complete register/review authority, scalable exact
   overlap, final context, exact witnesses, and transactional census.
3. Execute admission Tasks 4-8 against the centralized external v10.3 corpus:
   reproduce the honest zero census, audit bounded source batches, acquire only
   after a reviewed deficit, and freeze an independently reviewed 100/100
   witness. AI is positive; human is negative. Quarantine is not a third label.
4. Close admission Task 9A at its single-writer Core-schema point. Adopt and
   verify the Node 22/24 supported-runtime policy before Task 9B freezes its
   implementation commit/tarball. Task 9B alone adds the v10.3.2 manifest
   builder and complete-reference consumer integration, proves that installed
   tarball under Node 22/24, reruns release Task 6, and freezes commit-bound
   prerequisite receipts before any manifest output.
5. Execute release Tasks 7-8 without adding a side manifest or changing frozen
   consumer code. Then execute admission Tasks 10-11 for the deterministic
   100/100 smoke and exact 5,000/5,000 canary.
6. Freeze the post-canary full-run count from all and only `eligible_gold`
   records under the approved method. Review any signal/verdict change in a
   separate reversible commit. Release operations remain separately gated.

## Principles and conventions

| Check | Status | Audit result |
| --- | --- | --- |
| Scope and language | READY | Git-tree material, immutable release archives, proof-carrying evidence, sensitivity, quarantine, and `eligible_gold` are distinct. Materialization never promotes a label. |
| Repository rules | READY | The plans use TypeScript/Node, Core schema/type reuse, `corepack pnpm`, package and recursive gates, scoped commits, dirty-tree preservation, and no unrequested remote mutation. |
| Schema ownership | READY | Release Tasks 1-6 solely own archive/materialization contracts. Admission imports them and owns separate persisted admission authorities. Repository Structure schema/version is unchanged; additive calibration contracts share private Core `0.3.0`. |
| Vertical TDD | READY | Tasks 1A-3B are runnable red-green slices with focused failures, full affected-package gates, independent review, and bounded commit points. High-risk acquisition/publication tasks have their own adversarial suites. |
| Provenance | READY | Generation 0 requires 329 register entries and 329 truthful reviews. Exact bytes, evidence ownership, tool/materialization receipts, temporal observations, reviewer blindness, dispositions, and reasons are conserved and hash-bound. |
| Counts and targets | READY | `1,478,350` raw discovery files are not the calibration population. Material ownership conserves `452,382 = 58,089 + 394,293`. The initial honest census may be 0/0. Smoke is exactly 100 AI + 100 human; canary is exactly 5,000 + 5,000. The full count is frozen only after canary from all eligible gold records. |
| Overlap and leakage | READY | The complete 452,382-plus-new stream supplies authoritative sides to an exact disk-backed join. Hash/near/family/pair/source/split leakage blocks readiness; LSH remains diagnostic. |
| Resource bounds | READY | Heap, RSS, disk, open-file, shard, wall-time, search-node, per-unit, acquisition-round, transfer, and materialized-byte limits are explicit. Stock Git transport bytes are honestly described as not hard-capped. |
| Network and archive security | READY | Network is default-denied. Authorized acquisition constrains exact origins/redirects/DNS addresses, credentials/config/hooks, and archive extraction. ZIP traversal, collisions, symlinks, unsupported modes, bombs, and reuse mutation are tested. |
| Transaction safety | READY | Create/replace CAS, `wx` locks, intended transaction IDs, file/directory fsyncs, immutable generations, projection-last promotion, lock-only recovery, transaction-before-lock cleanup, and unknown-file preservation are operative and fault-injected. |
| Consumer authority | READY | A complete self-hashed current/generation/build-receipt/manifest reference is routing only. Each v10.3.2 validate/materialize/select process reopens the full graph, reconstructs a private WeakSet brand, and rereads current before output or mutation. |
| Compatibility | READY | Legacy v10.3.0/v10.3.1 manifest bytes and flat-path mode remain stable. v10.3.2 requires a non-null admission binding and the complete reference mode; it cannot downgrade to flat-path authority. |
| Packed/runtime proof | READY | Task 9B owns the packed-consumer change and requires all three v10.3.2 commands from the exact clean-installed tarball under Node 22/24 before approval receipts or manifest publication. |
| Reversibility | READY | Immutable history and expected-current CAS preserve prior valid authority. Corpus source bytes are not overwritten; runs are immutable; rule changes and release metadata stay separately reversible. |
| Remote/release boundary | READY | No plan step authorizes push, tag, GitHub release, npm publish, deploy, source-register promotion, or canonical verdict mutation merely because tests pass. |

## Mechanical audit

- Admission TypeScript fences: 13; Bash fences: 35; syntax failures: 0.
- Release TypeScript fences: 4; Bash fences: 14; syntax failures: 0.
- Duplicate TypeScript members/declarations: 0.
- Markdown fence parity and stale synthetic-source/flat-manifest scans: clean.
- `git diff --check`: clean at the frozen hashes.
- Both hashes were stable before and after the independent final reread.

## Implementation evidence still required

These are hard execution gates, not planning gaps:

- [x] Release-materialization Task 1: commit `ca72d0b15`; mutation-proven TDD,
      exact Core schema/codegen/contracts/type/test/build, SlopBrick typecheck,
      and independent specification/code-quality approvals.
- [x] Release-materialization Task 2: commit `704abef0e`; frozen Git bytes and
      IDs, complete release-identity mutation matrix, 16/16 focused boundary
      tests, SlopBrick typecheck, and independent specification/code-quality
      approvals.
- [x] Task 3 plan correction: Node built-ins only, atomic no-overwrite hard-link
      promotion, distinct raw headers, complete per-hop SSRF controls, bounded
      aborts, stable redaction, and targeted independent rereview at release
      SHA `7a20d89c35dcea0d9255e21d3e9cdadf89404c229a7c2dcb474b6bbacac7cb41`.
- [ ] Red tests and reviewed implementation for every remaining scoped task.
- [ ] Exact dependency resolution/audit and adversarial `safe-zip-v1` proof.
- [ ] Full Core schema/codegen/contract/type/test and SlopBrick lint/type/test/build gates at each planned boundary.
- [ ] Truthful 329/329 generation-0 review and byte-backed external evidence.
- [ ] Real 452,382-row overlap/resource receipt and honest reproduced census.
- [ ] Independently reviewed 100/100 witness; bounded acquisition only if its census proves a deficit.
- [ ] Commit-bound Task 9A/9B approvals, exact package tarball, and clean Node 22/24 consumer receipts.
- [ ] Admission-backed manifest round trip, two deterministic smoke runs, exact 10k canary, and post-canary full-count freeze.
- [ ] Statistical/provenance review before any rule verdict or signal change.
- [ ] Separate self-scan UX, installed-hook design, package/release, website, deployment, and live-publication gates.

## Verdict

**READY TO EXECUTE.** Tasks 1-2 are approved; continue with
release-materialization Task 3 and proceed
task-by-task with test-first implementation, a specification reviewer, a code-
quality reviewer, and verification evidence before advancing. Any change to a
frozen plan requires a new hash and targeted rereview. Any implementation
failure that exposes a contract defect reopens planning rather than silently
weakening provenance, security, resource, or readiness rules.
