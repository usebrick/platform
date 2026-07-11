# Plan Audit — v10.3 corpus admission and immutable release assets

**Date:** 2026-07-11 · **Verdict:** READY TO EXECUTE

## Frozen plans

| Plan | SHA-256 | Role |
| --- | --- | --- |
| `packages/slopbrick/docs/calibration/v10.3-release-asset-materialization-plan.md` | `08d30d9dca5b177764c5c631d98d570d75b2702a556438eaf8c10dadf292c26f` | Owns the additive Core release-archive/materialization contract and implementation Tasks 1-6; Tasks 7-8 are downstream consumers. Task 4 is split into independently reviewed 4A/4B/4C slices. |
| `packages/slopbrick/docs/calibration/v10.3-corpus-source-admission-plan.md` | `233ede7262dd408318230f32ab4cc5d2103caf8b5662ae4fb228088531f70e75` | Owns provenance admission Tasks 0-11, including the v10.3.2 witness-bound manifest and final in-process consumer authority. |

The independent full-plan review is
`.superpowers/sdd/v103-corpus-admission-plan-final-review.md`. During Task 3
RED/design work, official Node/POSIX/IANA/RFC research exposed a rename-race
and raw-header/deadline gap in the release plan. The focused correction from
release SHA `0115a2c73dcfd0a086c70b1e3fe6519558bf7c34ff4942d97d52c3dfa92c585d`
to `7a20d89c35dcea0d9255e21d3e9cdadf89404c229a7c2dcb474b6bbacac7cb41`
is independently approved in
`.superpowers/sdd/v103-release-task3-plan-rereview.md`. Together they record
**READY TO EXECUTE**. Follow-on Task 3 security review then tightened that
candidate to IPv4-only/POSIX-only fail-closed acquisition with a private
canonical cache authority, an honest cooperative filesystem deadline, explicit
TLS/parser limits, and a 5-GiB ceiling. Those deltas are independently approved
in `.superpowers/sdd/v103-release-task3-ipv4-plan-rereview.md` and
`.superpowers/sdd/v103-release-task3-cache-plan-rereview.md`; the table contains
their final candidate SHA. This approves planning only; it does not claim that
implementation, corpus evidence, manifests, smoke, canary, or release gates
already pass.

Task 4 dependency inspection and adversarial rereview then found that the
baseline ZIP plan did not yet define raw local/central validation, descriptor
lifetime, complete resource caps, durable no-replace tree publication, or
identity-safe cleanup precisely enough to implement. The corrected Task 4
contract is independently approved at the table's final release SHA and is
recorded in `.superpowers/sdd/v103-release-task4-plan-rereview.md`. It freezes
an ASCII-only `safe-zip-v1` raw grammar, descriptor-bound reads and rechecks,
owned inflate/CRC/receipt verification, and local-POSIX reference publication.
It also records the existing dependency advisories as a separate release gate;
the planning verdict does not call the workspace audit clean.

## Canonical execution order

1. Implement and independently approve release-materialization Tasks 1-5.
   This opens one coordinated, unreleased Core `0.3.0` schema tranche and
   preserves the existing Git path.
2. Close the production/development dependency-security remediation tranche,
   independently verify the resulting audit decisions, then implement and
   approve release Task 6's packed prerequisite.
3. Execute admission Tasks 0-3B as reviewed vertical TDD slices: durable tool
   and evidence authority, complete register/review authority, scalable exact
   overlap, final context, exact witnesses, and transactional census.
4. Execute admission Tasks 4-8 against the centralized external v10.3 corpus:
   reproduce the honest zero census, audit bounded source batches, acquire only
   after a reviewed deficit, and freeze an independently reviewed 100/100
   witness. AI is positive; human is negative. Quarantine is not a third label.
5. Close admission Task 9A at its single-writer Core-schema point. Adopt and
   verify the Node 22/24 supported-runtime policy before Task 9B freezes its
   implementation commit/tarball. Task 9B alone adds the v10.3.2 manifest
   builder and complete-reference consumer integration, proves that installed
   tarball under Node 22/24, reruns release Task 6, and freezes commit-bound
   prerequisite receipts before any manifest output.
6. Execute release Tasks 7-8 without adding a side manifest or changing frozen
   consumer code. Then execute admission Tasks 10-11 for the deterministic
   100/100 smoke and exact 5,000/5,000 canary.
7. Freeze the post-canary full-run count from all and only `eligible_gold`
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
| Archive materialization | READY | `safe-zip-v1` has a raw comment-free EOCD/ZIP64-v1/local/central grammar, ASCII-only paths, exact type/flag/extra-field rules, BigInt-safe limits, owned inflate/CRC checks, deterministic receipts, descriptor lifetime, durable local-POSIX publication/reuse, and identity-safe cleanup. Unicode, Windows reparse points, unsigned descriptors, entry ZIP64, hostile same-euid defense, and network/distributed cache filesystems require later policy versions. |
| Transaction safety | READY | Create/replace CAS, `wx` locks, intended transaction IDs, file/directory fsyncs, immutable generations, projection-last promotion, lock-only recovery, transaction-before-lock cleanup, and unknown-file preservation are operative and fault-injected. |
| Consumer authority | READY | A complete self-hashed current/generation/build-receipt/manifest reference is routing only. Each v10.3.2 validate/materialize/select process reopens the full graph, reconstructs a private WeakSet brand, and rereads current before output or mutation. |
| Compatibility | READY | Legacy v10.3.0/v10.3.1 manifest bytes and flat-path mode remain stable. v10.3.2 requires a non-null admission binding and the complete reference mode; it cannot downgrade to flat-path authority. |
| Packed/runtime proof | READY | Task 9B owns the packed-consumer change and requires all three v10.3.2 commands from the exact clean-installed tarball under Node 22/24 before approval receipts or manifest publication. |
| Reversibility | READY | Immutable history and expected-current CAS preserve prior valid authority. Corpus source bytes are not overwritten; runs are immutable; rule changes and release metadata stay separately reversible. |
| Remote/release boundary | READY | No plan step authorizes push, tag, GitHub release, npm publish, deploy, source-register promotion, or canonical verdict mutation merely because tests pass. |

## Mechanical audit

- Admission executable fences: 13 TypeScript and 3 Bash; 19 total fenced
  blocks; prior syntax failures: 0.
- Release executable fences: 9 TypeScript and 17 Bash; 35 total fenced blocks;
  prior syntax failures: 0.
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
      aborts, stable redaction, IPv4-only/POSIX-only fail-closed execution,
      private canonical cache authority, explicit TLS/parser/size ceilings, and
      targeted independent rereview at final release SHA
      `3c115b75b63544c8fa281fb32532be25ed5d0a71b0afad7571163829668e93c5`.
- [x] Release-materialization Task 3: commit `14998b539`; mutation-proven
      default-denied bounded HTTPS acquisition, final 184/184 focused and
      200/200 combined boundary tests, SlopBrick typecheck, staged gate, and
      independent specification plus OWASP A01-A10 approvals.
- [x] Task 4 plan correction: exact dependency inspection, primary-source
      research, read-only intended-asset compatibility probes, raw ZIP and
      POSIX publication contract, two independent exact-hash approvals, and
      persisted rereview at final release SHA
      `08d30d9dca5b177764c5c631d98d570d75b2702a556438eaf8c10dadf292c26f`.
- [x] Exact Task 4 dependency resolution and audit attribution: the ZIP delta
      is pinned and adds no known advisory; the workspace audit remains red and
      is not release evidence.
- [ ] Red tests and reviewed implementation for every remaining scoped task.
- [x] Task 4A shared trusted-POSIX-cache refactor: commit `521c0e888`; explicit
      RED, 43 direct plus 184 byte-unchanged acquisition tests (227/227),
      typecheck/build/diff gates, independent specification and code/security
      approvals, and persisted review at
      `.superpowers/sdd/v103-release-task4a-review.md`.
- [ ] Task 4B raw ZIP/CRC/receipt/reference proof and Task 4C adversarial
      extraction/publication/reuse proof.
- [ ] Separate remediation and independent review of the 17 production and 20
      complete-graph workspace advisories before packed Task 6 evidence.
- [ ] Full Core schema/codegen/contract/type/test and SlopBrick lint/type/test/build gates at each planned boundary.
- [ ] Truthful 329/329 generation-0 review and byte-backed external evidence.
- [ ] Real 452,382-row overlap/resource receipt and honest reproduced census.
- [ ] Independently reviewed 100/100 witness; bounded acquisition only if its census proves a deficit.
- [ ] Commit-bound Task 9A/9B approvals, exact package tarball, and clean Node 22/24 consumer receipts.
- [ ] Admission-backed manifest round trip, two deterministic smoke runs, exact 10k canary, and post-canary full-count freeze.
- [ ] Statistical/provenance review before any rule verdict or signal change.
- [ ] Separate self-scan UX (including staged-score determinism, type-only use,
      not-applicable axes, suppressed-count separation, state writes, and
      baseline migration), installed-hook design, package/release, website,
      deployment, and live-publication gates.

## Verdict

**READY TO EXECUTE.** Tasks 1-3 and Task 4A are approved; continue with
release-materialization Task 4B and proceed
task-by-task with test-first implementation, a specification reviewer, a code-
quality reviewer, and verification evidence before advancing. Any change to a
frozen plan requires a new hash and targeted rereview. Any implementation
failure that exposes a contract defect reopens planning rather than silently
weakening provenance, security, resource, or readiness rules.
