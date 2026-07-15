# Plan Audit — v0.45 recovery, v10.3 corpus admission, and immutable release assets

**Date:** 2026-07-15 · **Verdict:** READY TO EXECUTE (gated)

## Frozen plans

| Plan | SHA-256 | Role |
| --- | --- | --- |
| `packages/slopbrick/docs/calibration/v10.3-release-asset-materialization-plan.md` | `2b79466ed466ddb2edbb4251505b0a0b9fddbaa17e64310831c0ab92fdadc87d` | Owns the additive Core release-archive/materialization contract and implementation Tasks 1-6; Tasks 7-8 are downstream consumers. Task 4 is split into independently reviewed 4A/4B/4C slices; its old 2026-07-13 override is explicitly historical and points to the authoritative continuation-plan evidence. |
| `packages/slopbrick/docs/calibration/v10.3-corpus-source-admission-plan.md` | `a5afd7ceaf5e387e0df8d0a965c21f401ae1f5f399d55fd24ee65236771f7c96` | Owns provenance admission Tasks 0-11, including the explicit material-partition contract, acquisition-round ID/hash fields, and the v10.3.2 witness-bound manifest. The latest checkpoint records transaction-owned staging, the Core nested-handoff helper, explicit-input preflight, the CAS boundary audit, allocation-before-row-review, the deterministic allocation preview, the explicit diagnostic-only outer CLI/materializer boundary, the bounded stream/ledger/shard joins, the self-scan output review, the bounded real-corpus allocation replay, the RAM-safe static-ledger adapter, optional stream-receipt/materializer binding, the integrated authority gate/live census result, the final package-wide and recursive quality gates, the risk-scaled verification rule, and the consolidated one-gate verification path; it does not advance real-corpus admission. |
| **Current continuation-plan hash override (2026-07-15)** | `01bc8142fa64b384a97e2a64e28f7b71ad731c4474c4558dcf59540680f50638` | Supersedes the historical continuation-plan hash in the frozen row below after the current corpus/control-plane, CLI-boundary, candidate-context/preview, report-publication, recursive-gate, self-scan, bounded-verification, policy-status UX, live census-preview, adapter review, transaction-owned staging, Core nested-handoff helper, explicit-input preflight, CAS boundary audit, allocation-before-row-review, allocation-preview implementation, diagnostic outer CLI, lock-only recovery, risk-scaled verification, outer materializer stream/shard/ledger binding, self-scan UX/accounting correction, bounded real-corpus allocation replay, RAM-safe static-ledger adapter, stream-receipt/materializer binding, integrated authority gate/live census result, consolidated one-gate verification path, final package-wide quality gate, recursive gate/watch timing closeout, Task 3A deterministic witness/census contract slice, pure witness-review graph, transactional witness publication/recovery, the single CLI-boundary edge-case gate, the final 329-file/3,713-test package gate, current-state documentation reconciliation, the explicit single-gate confirmation policy, the dependency-security adapter correction, and the 2026-07-15 source-byte binding checkpoint. |
| `packages/slopbrick/docs/calibration/v0.45.0-continuation-plan.md` | `aa6244fa87b6904e7b60a099ede68df0b41ef8901801c45a5cdcb9c183491b0d` | Historical frozen continuation-plan bytes; the current contents are superseded by the explicit override row immediately above. |

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

1. Implement and independently approve release-materialization Tasks 1-6.
   The current bytes are bounded-complete, but the clean commit-bound receipt
   prerequisite remains open; this opens one coordinated, unreleased Core
   `0.3.0` schema tranche and preserves the existing Git path.
2. Close the production/development dependency-security remediation tranche,
   independently verify the resulting audit decisions and clean-boundary
   evidence, then rerun the packed prerequisite from the authorized clean
   builder.
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
- `git diff --check`: clean at the current dirty snapshot.
- The continuation-plan hash override was recomputed on 2026-07-15 after the
  candidate-context/preview and recursive-gate checkpoint; any subsequent plan
  edit requires another hash refresh and targeted rereview.

### Current control-plane, CLI, and self-scan audit — 2026-07-15

The latest evidence supersedes older diagnostic counts in the continuation
plan. `/Users/cheng/corpus-expansion/v10.3` contains approximately 3.8 GiB and
the `sources` tree contains **11,127** regular non-`.git` source-tree files. Its
317 pinned checkout records (225 declared AI, 92 declared human) have matching paths and Git heads,
but no verified labels. The 329-entry genesis register/review pair is complete
as a review artifact only. The correct genesis and source-census replays leave
**452,382** units quarantined/unrepresented, **0** candidate, and **0**
eligible; static/witness/source-generation authority and overlap current trees
are absent. `authority:overlap:verify` therefore exits 2 with
`overlap_current_missing`. No source promotion or repository acquisition is
authorized at this boundary.

The required package-local self-scan is a clean runtime execution over
**235/235** files (zero parse/timeout/crash/internal failures) but a policy
failure at AI Slop Score **17.2869** versus meanSlop 15. It reports 157 active
low/medium diagnostics, security 100/100 with zero security findings, hygiene
99.5168, and repository health 92.9403. The config-mismatched baseline was
rejected. The broad compression signal is not authorship evidence until
authoritative v10.3 precision/FPR replay; self-scan UX should distinguish policy
failure from runtime failure and show active-rule breakdown. `--no-telemetry`
still permits project-memory writes when that setting is enabled.

The current admission executable has no parser/dispatch for
`rebuild:pre-witness`, `static-authority:recover`, or `census:preview`, and no
input-generation/static-generation/real-scale receipt flags. The candidate-
aware adapter is library-only and its nested `authority:overlap` selector is
not the outer rebuild authority. The next executable slice must therefore be a
fully materialized, explicitly typed outer transaction/receipt with fixture
coverage; parser-only wiring, empty ledgers, and mislabeled nested receipts are
rejected. Real-corpus replay, further pulls, label promotion, manifest,
release, publish, and deploy remain downstream gates.

### Bounded verification update — 2026-07-15

The planned authority commands are now parser-visible but intentionally
fail-closed: `rebuild:pre-witness` and `static-authority:recover` emit a
structured `authority_cli_unavailable` result before filesystem access because
the fully materialized outer transaction/graph is not implemented. Their CLI
boundary tests pass 10/10. The brief renderer contract tests pass 12/12 and
the SlopBrick package typecheck passes.

The load-sensitive watch failure was a test synchronization race between health
persistence and report rendering. Waiting for the expected report content makes
the complete watch-mode file pass 45/45 serially. This does not alter admission
status. Atomic report-file publication is recorded as a separate hardening
item; the full recursive package gate remains a commit/release checkpoint.

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
      is pinned and adds no known advisory. The historical workspace audit
      baseline was red; the latest bounded dirty-byte migration reports zero
      moderate advisories, but independent review and a clean-bound rerun remain
      required, so neither snapshot is release evidence.
- [ ] Red tests and reviewed implementation for every remaining scoped task.
- [x] Task 4A shared trusted-POSIX-cache refactor: commit `521c0e888`; explicit
      RED, 43 direct plus 184 byte-unchanged acquisition tests (227/227),
      typecheck/build/diff gates, independent specification and code/security
      approvals, and persisted review at
      `.superpowers/sdd/v103-release-task4a-review.md`.
- [x] Task 4B raw ZIP/CRC/receipt/reference proof: commit `6ce6259da`;
      safe ZIP 30/30, receipt 44/44, combined Task 3/4A/4B boundary 301/301,
      strict direct test compile, package typecheck/build/diff, exact dependency
      attribution, independent receipt/specification/security approvals, and
      persisted review at `.superpowers/sdd/v103-release-task4b-review.md`.
- [x] Task 4C adversarial extraction/publication/reuse proof: commit
      `04697806e`, focused matrix 425/425 across Node 20/22/24, with independent
      specification, code-quality, and archive-security approval.
- [ ] Separate remediation and independent review of the historical 17
      production and 20 complete-graph workspace-advisory baseline, including
      the latest zero-moderate dirty-byte result, before a clean release
      boundary. The bounded migration rereview in
      `.superpowers/sdd/dependency-remediation-rereview.md` is independently
      **APPROVE** for the reviewed bytes; its eight input hashes are rebound to
      `5f366143c`, but this mechanical rebind is not a fresh audit or the
      required independent clean-bound release approval.
- [x] Current clean Task 6 Core schema/codegen/contract/type/test and SlopBrick lint/type/test/build gates: detached commit `5f366143c`; recursive clean typecheck, lint, test, and build all pass, including Core 185/185, engine 59/59, website 38/38, and SlopBrick 3,544/9 skipped. Future release boundaries still require their own commit-bound gates.
- [ ] Truthful 329/329 generation-0 review and byte-backed external evidence.
- [x] Reviewed two-phase `evidence:verify` tool authority: immutable intent
      before the read-only replay, receipt after success, CLI round trip, and
      external bound verification plus source-census diagnostic. This does not
      promote any evidence or label; static-ledger and witness authority remain
      open.
- [ ] Real 452,382-row overlap/resource receipt and honest reproduced census.
- [ ] Independently reviewed 100/100 witness; bounded acquisition only if its census proves a deficit.
- [ ] Commit-bound Task 9A/9B approvals and the final `0.45.0` package/tarball boundary remain open. The current `0.44.0` clean Task 6 tarball and Node 22/24 receipts are prerequisite evidence only; they do not substitute for the later Task 9A/9B approval receipt.
- [ ] Admission-backed manifest round trip, two deterministic smoke runs, exact 10k canary, and post-canary full-count freeze.
- [ ] Statistical/provenance review before any rule verdict or signal change.
- [ ] Separate self-scan UX. Commit `efb069b90` closes staged-score drift,
      implicit Git-scoped state writes, sequential duplicate-cache leakage,
      and concurrent in-process isolation with 240/240 focused tests and
      independent approval. Type-only use, not-applicable axes,
      suppressed-count separation, baseline migration, installed-hook design,
      package/release, website, deployment, and live-publication gates remain.

## Latest bounded Task 2B source-review authority-anchor checkpoint — 2026-07-14

The runtime source-review authority anchor is independently approved for this
bounded slice. Implementation commits are `762540ae5` and corrective
`b285cccb3`; the evidence/review record is
`.superpowers/sdd/task-2b-source-review-anchor-report.md`. Focused context and
disposition tests pass **2 files / 14 tests** with one worker and
`NODE_OPTIONS=--max-old-space-size=2048`; SlopBrick typecheck, build, and
`git diff --check` pass. The runtime resolves each rich-bundle source review
through `review/admission/sources/<sourceId>/current.json`, the exact
hash-named generation, and canonical byte/hash receipts, and fails closed on
hostile mutations.

The canonical external admission root
`/Users/cheng/corpus-expansion/v10.3/review/admission` has no `sources` entry:
`test -e .../sources` is false and a recursive `*/review/admission/sources*`
search returns zero paths. This absence is production evidence that the
runtime cannot resolve source-generation authority there; it is not a
readiness signal. The read-only diagnostic remains **329/329** registered/
reviewed sources, **452,382** quarantined/unrepresented units, zero candidate
units, zero eligible units, and blockers `static_authority_unavailable` and
`witness_authority_unavailable`.

This approval does not complete any checkbox or change the canonical
`98/178` continuation and `2/76` admission counts. Task 2B CLI
`rebuild:pre-witness`, `static-authority:recover`, and `census:preview`,
byte-backed rebuild/recovery, census/witness/resource receipts, corpus
admission, and release gates remain open.

## Latest bounded Task 2B prebuilt byte-backed authority-graph checkpoint — 2026-07-14

The pure prebuilt authority-graph validator is independently approved for this
bounded slice only. Implementation commits are `136ad461a`, `383bf4c09`, and
`f115bf7e6`; the implementation report is
`.superpowers/sdd/task-2b-authority-rebuild-graph-report.md`, and the
independent review verdict **APPROVE** is
`.superpowers/sdd/task-2b-authority-rebuild-graph-review.md`.

`validatePrebuiltAdmissionAuthorityGraph` is caller-owned and fail-closed. It
requires the exact top-level wrapper keys for proposal, input generation,
static generation, current pointer, artifact-byte maps, and ordered sources;
`priorCurrent`/`priorCurrentBytes` are an all-or-nothing optional pair. Exact
canonical UTF-8/no-BOM bytes are checked for proposal, input, static, current,
and optional prior current, with self-hashes recomputed. The fixture's raw
canonical receipts are proposal **1,229** bytes
(`696080d630cd6fdcdb29f33910a97e716acf96dfd0b60176d7872e31cd76afbe`), input
**1,454**
(`914a56918097240bb207ca68ccd411476907aa41b9a52161ced425c4f18a86ec`), static
**2,197**
(`12478aa0ececca7014018c5ad8127b8532d98cf16ff3e5cd8997bea4405d697a`), and
current **384**
(`bb8784761a830e5b1bd2ae957061aeca16c835aab3d8f718d5ea6a513b419116`); the full byte/hash ledger and input/static/per-source receipt
maps are preserved in the report.

The validator requires exact input-generation paths
`admission-records.jsonl`, `overlap-universe-records.jsonl`, and
`overlap-universe.json`; static paths `lineage-ledger.json`,
`pre-witness-bundle.json`, `privacy-ledger.json`, and `quality-ledger.json`;
and each source's generation/current, decision ledger, and fixed canonical
`source-review.json` bytes. Core's
`validateCalibrationAdmissionStaticAuthorityGraphV1` proves proposal → input →
static → current/prior joins for source IDs, evidence/artifact hashes, static
anchors, current generation, and create/replace CAS; SlopBrick binds each
source's current/generation/path/proposal/review joins and raw receipt bytes.
Source-proposal bytes are represented only by ID/hash/path references in this
pure slice; their materialization and publication remain deferred.
The focused suite is **13/13**, and SlopBrick typecheck, build, and
`git diff --check` pass.

This does not complete Task 2B or change any checkbox. Filesystem
publication/recovery, CLI (`rebuild:pre-witness`, `static-authority:recover`,
`census:preview`), real receipts/corpus, witness/context authority, corpus
admission, and release remain open. The canonical counts stay `98/178`
continuation and `2/76` admission; the read-only census remains **452,382**
quarantined/unrepresented units, zero candidate/eligible units, with blockers
`static_authority_unavailable` and `witness_authority_unavailable`. No corpus
labels/bytes, manifests, remote refs, package versions, or release state
changed.

## Latest bounded Task 2B symlink-safe prebuilt authority-graph loader checkpoint — 2026-07-15

The filesystem loader is approved for this bounded slice at commit `a13444fc3`;
implementation evidence is
`.superpowers/sdd/task-2b-authority-rebuild-loader-report.md` and the separate
review verdict is
`.superpowers/sdd/task-2b-authority-rebuild-loader-review.md`. It accepts only
the exact caller request (`projectRoot`, `proposalPath`, `inputGenerationPath`,
and optional `priorCurrentPath`), reads the fixed authority current pointer,
current-selected static generation, fixed per-source current pointers, and
declared generation-local or admission-root CAS files. It performs no
directory discovery or mutation.

Project-root normalization is allowed while a root symlink is rejected;
selected paths reject traversal/NUL/backslashes and lexical or realpath escapes.
`lstat` preflight rejects symlink ancestors/targets, final regular-file opens
use `O_NOFOLLOW`, and a post-read realpath check rejects an observed rename or
ancestor change. Strict canonical UTF-8/no-BOM object bytes, exactly-one-LF
source-review bytes, raw receipt maps, and the pure graph validator's
length/hash/join checks are preserved. The focused suite is **1 file / 7
tests**, SlopBrick typecheck/build and `git diff --check` pass, and build retains
only the existing non-fatal Zod declaration warnings.

The post-commit package-wide SlopBrick gate passes with one worker and a 2 GiB
heap cap: **311 files passed / 5 skipped; 3,578 tests passed / 9 skipped** in
249.28 seconds. This refreshes test evidence only; it does not close Task 2B or
the release boundary.

This does not complete Task 2B or change any checkbox. P2 immutable-root/TOCTOU
and cross-platform POSIX `O_NOFOLLOW` policy follow-ups remain open, as do
publication/recovery, CLI, static/witness/resource authority, real corpus
census/admission, and release. The canonical counts remain `98/178` and
`2/76`; the read-only state remains **329/329** registered/reviewed sources,
**452,382** quarantined/unrepresented units, zero candidate/eligible units,
and blockers `static_authority_unavailable` and
`witness_authority_unavailable`. No corpus, remote, package-version, or release
state changed.

## Latest bounded Task 2B indexed tool-authority resolver and CLI checkpoint — 2026-07-15

The post-publication authority boundary is now implemented as a read-only
resolver plus a strict CLI diagnostic. `resolveAdmissionToolAuthorityReceipt`
reopens the fixed current tool-authority index, verifies its immutable parent
chain and every referenced profile/intent/receipt, binds the requested receipt
ID/hash and operation selectors to those exact bytes, and derives a Core-valid
snapshot from current membership. A caller-supplied snapshot is accepted only
when it exactly equals that derived projection; hash-only receipt metadata is
not proof. `tool-authority:resolve` exposes the same boundary with one JSON
result, contained canonical snapshot input, strict SHA-256 selectors, no
mutation, and exit-2 fail-closed errors for stale, forged, mixed, or unsafe
inputs.

The focused resolver/CLI gate is **2 files / 6 tests**. After rebuilding the
package-local CLI, the full bounded SlopBrick gate passes **315 files / 3,602
tests** (5 skipped files / 9 skipped tests) with one worker and a 2 GiB heap
cap; recursive typecheck and build pass with only the existing non-fatal Zod
declaration warnings. The existing publication/recovery, loader, graph, and
planner suites remain green, and `git diff --check` passes. The commit-hook
self-scan is **7.2 / 100**, under the 15 threshold, with two active
compression/Zipf audit-only diagnostics and no security findings. This is not the mutating
`rebuild:pre-witness` or `static-authority:recover` boundary: source
proposal/approval bytes and real static/witness/resource joins remain open.
The canonical ledger remains **98/178** continuation items and **2/76**
admission items; the read-only census remains **329/329** sources reviewed,
**452,382** units quarantined/unrepresented, zero candidate/eligible units,
and blockers `static_authority_unavailable` and
`witness_authority_unavailable`. No corpus, remote, package, release, or
deployment state changed.

## Current execution status

The plan remains **READY TO EXECUTE**, but execution is not release-ready:
release Tasks 1-6 are bounded-complete, and the clean Task 6 prerequisite is
now reproduced against commit `5f366143c` with zero status entries and packed
Node 22/24 receipts. The installed-hook and incremental-cache policies are
verified, the owner-authorized local commit boundary is complete, and the
current continuation ledger is 98/178 checked.
Admission is only 2/76 task items checked; the instructional checkbox example
is excluded. The legacy corpus remains centralized under
`/Users/cheng/corpus-expansion`; the two-source bounded round is persisted as
quarantine-only evidence, while the 12-entry source register is unchanged.
There is still no admission manifest, selection, run, or eligible corpus count;
the corresponding v10.3 inventories were rebuilt with zero missing records.
The immutable acquisition control plane and quarantine-only 329-entry review
composition are persisted externally. A real evidence-verification intent and
successful receipt now join the canonical empty bundle; bound `evidence:verify`
and diagnostic `source:census` both run. The census remains non-ready with
452,382 quarantined/unrepresented units, zero candidate units, zero eligible
units, and blockers `static_authority_unavailable` and
`witness_authority_unavailable`. Task 2B pure contracts are now committed for
privacy, quality, lineage, the corrected provisional witness-free pre-witness
boundary, static-authority contracts/relations, and the approved rich
pre-witness Core contract (`84f787272`, `3996a24d6`, `61b29fd4b`, `7a9791ebf`,
`3fa6f95d5`, `5749b7b82`, `286741d15`, `f828fdaf5`, `1f2f8f6a4`; report/review
evidence: `.superpowers/sdd/task-2b-core-rich-report.md`). The rich schema,
generated peer/index/fixtures, and pure validator are approved; 12 focused
tests and Core 29 files/219 tests are green, and the hostile-input boundary
fails closed. The replay matches raw diagnostic SHA
`de0cd1879d14365b919c09bdd21bd5760a6804a0e3626d87abf37b78ad948857`, and the
external review-artifact validator remains valid. The authority rebuild
lock/transaction Core contract is now also independently approved: commits
`a5d66eba3` and `4318d26eb`, report/review evidence
`.superpowers/sdd/task-2b-authority-contracts-report.md`, focused **6/6**,
and full Core **30 files / 225 tests** are green with codegen, schema
validation, typecheck, `test:contract`, and `git diff --check`. This remains a
bounded Core contract only: SlopBrick byte-backed rebuild/recovery, runtime
context/disposition, CLI, real receipts, corpus, witness, and release gates
remain open. The latest bounded runtime source-review authority anchor is now
also approved at commits `762540ae5` and `b285cccb3` (report/review
`.superpowers/sdd/task-2b-source-review-anchor-report.md`): **2 files / 14
tests** with `NODE_OPTIONS=--max-old-space-size=2048`, SlopBrick typecheck/build,
and `git diff --check` all pass. The external admission root has no
`review/admission/sources` subtree, so source-generation resolution remains
fail-closed there and does not advance readiness. The prebuilt byte-backed
authority graph validator is now also independently approved at commits
`136ad461a`, `383bf4c09`, and `f115bf7e6` (report/review
`.superpowers/sdd/task-2b-authority-rebuild-graph-report.md` and
`.superpowers/sdd/task-2b-authority-rebuild-graph-review.md`): **13/13**
focused tests, SlopBrick typecheck/build, and `git diff --check` pass. It is a
pure fail-closed wrapper over exact top-level/proposal/input/static/current/
optional-prior bytes, input/static/per-source raw receipt maps, and Core
proposal → input → static → current/prior joins; it performs no filesystem,
CLI, corpus, publication, recovery, witness/context, or release I/O. This
bounded validator does not complete Task 2B. The symlink-safe caller-selected
loader at `a13444fc3` is also approved for its bounded read-only boundary:
7/7 focused tests, SlopBrick typecheck/build, and `git diff --check` pass, with
canonical bytes, raw receipt maps, fixed source pointers, `lstat` containment,
`O_NOFOLLOW`, and post-read realpath stability checks. Its P2 immutable-root/
TOCTOU and cross-platform POSIX policy follow-ups remain open. Fixture-scale
filesystem publication/recovery is now implemented and approved at
`da15142fc`, `ec85d754c`, and `1b7b1bee1`; evidence is in
`.superpowers/sdd/task-2b-authority-publication-report.md` and
`.superpowers/sdd/task-2b-authority-publication-review.md`. Its focused gate is
4 files / 38 tests and the final package gate is 313 files / 3,596 tests with
5 / 9 skipped. The publisher remains deliberately prebuilt: source-proposal
bytes and indexed tool-receipt/snapshot membership are deferred, so local
transaction completion does not change the census or readiness blockers. The
next ordered action is source-proposal/approval and indexed tool-receipt
authority, then operation-aware CLI/resource authority, generator/rights/
lineage and real static/witness context, followed by an acquisition-bound
register delta and deterministic census. Do not pull more repositories until
that census proves a measured deficit. The
mechanical dependency rereview rebind is recorded in
`.superpowers/sdd/dependency-remediation-rereview-rebind-2026-07-14.md`; its
independent approval receipt is still required.

### Latest bounded Task 2B source-proposal/approval byte checkpoint — 2026-07-15

The source-byte slice is implemented and evidenced in
`.superpowers/sdd/task-2b-source-proposal-byte-report.md`. The prebuilt graph
validator checks exact proposal/approval object-byte pairs, Core self-hashes,
source/generation/proposal joins, artifact equality, create/replace CAS, and
the fixed independent-review approval path/hash; genesis-quarantine branches
reject approval bytes. The symlink-safe loader exposes an explicit strict mode
that reopens only those declared fixed paths. Publication/recovery requires
proposal bytes for every source, requires approval bytes for independent-review
branches, persists the sibling objects before generation staging, and rejects
recovery when the caller omits the pair.

The focused validator/loader/publication gate is **3 files / 36 tests**; the
package-wide one-worker SlopBrick gate is **315 files / 5 skipped; 3,606 tests
passed / 9 skipped** with a 2 GiB heap cap. Recursive typecheck and build pass;
the existing non-fatal Zod declaration warnings and expected worker-fixture
stderr remain. This is byte/path authority only: the independent-review
fixture is shape-only and does not prove candidate disposition, blind
assignment/decisions/receipt, or materialization authority. Static-generation
overlap/resource receipt joins and the mutating rebuild/recovery CLI remain
open. Census/readiness is unchanged at 329/329 reviewed sources, 452,382
quarantined/unrepresented units, zero candidate/eligible units, and blockers
`static_authority_unavailable` and `witness_authority_unavailable`.

The next required slice is the semantic source-generation graph plus the
static-generation resource join, reusing `verifyOverlapArtifactRelations` for
the latter. Do not promote corpus labels or enable mutating CLI commands until
those joins have byte-backed tests and independent review.

### Latest Task 2B semantic source authority and overlap-join checkpoint — 2026-07-15

The semantic source-generation slice is now byte-backed and persisted. An
explicit semantic authority bundle carries the candidate source-review's blind
assignment, two reviewer decisions, blind-review receipt, and acquired or
genesis materialization authority; its self-hash/canonical bytes are checked
through Core's source-generation graph validator. The fixed
`source-semantic-authority.json` sibling is written no-clobber, reopened by the
strict loader, and rechecked during recovery. Independent-review publication
rejects the shape-only approval fixture.

The static side has a separate pure
`validatePrebuiltAdmissionAuthorityOverlapJoin` gate requiring exact static and
overlap generation bytes, all three envelope object/byte pairs, static-to-
overlap input/generation hash joins, and a complete indexed
`admission-static-ledgers-v1` / `authority:overlap` resolution with exact
snapshot membership. It reuses `verifyOverlapArtifactRelations` only for a
complete envelope set and never treats `primaryOutputSetSha256` as resource
proof. Focused coverage is **4 files / 46 tests**; recursive typecheck/build
and the package-wide one-worker gate pass (**316 files / 5 skipped; 3,616
tests / 9 skipped**, 2 GiB heap cap).

This remains bounded: the overlap join is standalone/read-only and the legacy
prebuilt publisher remains metadata-only until strict integration and
independent review. No corpus, labels, manifest, mutating CLI, package
version, release, or deployment changed. Census/readiness remains **329/329**
reviewed sources, **452,382** quarantined/unrepresented units, zero
candidate/eligible units, blockers `static_authority_unavailable` and
`witness_authority_unavailable`. Next: wire the strict overlap join into the
authority/context boundary, then the mutating CLI, before replaying real
static/witness context.

### Latest Task 2B strict static-overlap join and read-only CLI checkpoint — 2026-07-15

The strict static-overlap/resource join is now wired into the read-only
`authority:overlap:verify` command behind the explicit
`--join-static-authority` flag. Default overlap verification remains unchanged
and read-only; both a project root and its `review/admission` alias are
accepted. The opt-in requires the fixed `admission-static-ledgers-v1`
profile plus invocation-intent, receipt ID/hash, and authority-index SHA-256
selectors. It reopens canonical static current, static-generation,
overlap-generation, and all three overlap-envelope bytes; resolves indexed tool
authority against the static snapshot, binds the static generation hash and
generation number to the current pointer, and invokes
`validatePrebuiltAdmissionAuthorityOverlapJoin`. Selector, byte, snapshot,
resource, and static-to-overlap generation drift fail closed with the
`overlap_static_authority_join:` prefix. Selectors without the opt-in are
rejected, so a default verification cannot be mistaken for the full authority
proof.

Focused strict CLI/overlap coverage is **2 files / 13 tests**. After rebuilding
the package-local CLI, the package-wide one-worker gate passes **316 files / 5
skipped; 3,619 tests passed / 9 skipped** under a 2 GiB heap cap. SlopBrick
typecheck/build and `git diff --check` pass; existing non-fatal Zod declaration
warnings and expected worker-fixture stderr remain. No corpus, labels,
manifest, remote, package, release, publish, or deployment state changed. The
census remains **329/329** reviewed sources, **452,382** quarantined/
unrepresented units, zero candidate/eligible units, blockers
`static_authority_unavailable` and `witness_authority_unavailable`.

This closes only the read-only CLI boundary. The legacy prebuilt publisher is
still metadata-only, and the proof is value/edge-level: declared static
artifact receipts are not opened, hashed, or existence-checked. Runtime
admission context lacks a complete materialized overlap/tool-authority fixture,
and no mutating rebuild/recovery command is enabled. The current read helper
rejects symlink components, but check-then-open race hardening and an atomic
cross-object snapshot remain open. Next: materialize that runtime fixture and
route the context adapter through the same proof, obtain independent review,
then implement the mutating adapter before replaying real static/witness
context or measuring a corpus deficit. Do not pull repositories or promote
labels while the census is blocked.

### Latest Task 2B runtime overlap-authority context checkpoint — 2026-07-15

`buildVerifiedAdmissionContext` now consumes the strict static/overlap proof:
it follows the static generation's selected overlap hash, reads canonical
generation/index/resource/ledger bytes, resolves the indexed
`admission-static-ledgers-v1` / `authority:overlap` receipt, binds every
envelope back to the rich pre-witness bundle, and includes an immutable
overlap-authority proof identity in the branded context and `contextSha256`.

The fixture publishes real core-contract and overlap authority objects and
materializes the hash-named overlap generation/envelopes. Focused context and
disposition coverage is **2 files / 15 tests** (13 + 2), including missing
envelope, resource tamper, and missing authority-index rejection. SlopBrick
typecheck and `git diff --check` pass. The evidence report is
`.superpowers/sdd/task-2b-runtime-overlap-context-report.md`; independent
review remains the approval gate for this slice.

This remains bounded: unrelated static/overlap artifact receipts are not yet
opened by the context, check-then-open and cross-object snapshot hardening
remain open, and the legacy prebuilt publisher remains metadata-tolerant. No
corpus labels/bytes, manifest, repository acquisition, package, remote,
release, publish, or deployment state changed. The census remains **329/329**
reviewed sources, **452,382** quarantined/unrepresented units, zero
candidate/eligible, with blockers `static_authority_unavailable` and
`witness_authority_unavailable`.

Next: finish independent review and recursive gates, then implement the
mutating rebuild/recovery adapter before replaying the real corpus context.

Any implementation failure that exposes a contract defect reopens planning
rather than silently weakening provenance, security, resource, or readiness
rules.

### Latest Task 2B runtime authority-tree hardening checkpoint — 2026-07-15

The independent review findings are resolved in the bounded runtime slice.
Core now preserves the documented raw-byte static artifact receipt contract;
semantic ledger/bundle hashes remain separate and are joined to the rich
bundle. Focused Core/rebuild/loader coverage is **8/8 + 26/26**. The runtime
context reads every artifact declared by the selected input, static, and
overlap generations, rejects orphan/missing leaves, binds the overlap current
pointer to the selected generation, and joins overlap universe/policy/
normalizer hashes back to the rich bundle. Input-generation self-hash, raw
artifact bytes, evidence hash, record stream, exact source set, and aggregate
source proof are included in the immutable context proof.

The fixture now materializes source authorities, input generation/artifacts,
raw static receipts, overlap current/generation/envelopes, and real indexed
tool-authority intent/receipt objects. Focused context/disposition coverage is
**2 files / 15 tests**; recursive gates are green: Core **226/226**, website
**38/38**, engine **59/59**, and SlopBrick **3,620 passed / 9 skipped** across
**316 passed / 5 skipped test files**. Recursive typecheck/build and
`git diff --check` pass. Runtime is
explicitly quarantine-only: `independent_review` source generations fail
closed until the mutating adapter loads and verifies
`source-semantic-authority.json`. No corpus, label, manifest, repository,
remote, package, release, publish, or deployment state changed. Readiness
remains **329/329** reviewed sources, **452,382** quarantined/unrepresented,
zero candidate/eligible, blockers `static_authority_unavailable` and
`witness_authority_unavailable`.

Remaining ordered work is release review, then a mutating rebuild/recovery
adapter with candidate semantic-authority loading and a coherent cross-object
snapshot, followed by real-corpus replay.

### Latest Task 2B candidate-aware mutating authority-rebuild adapter checkpoint — 2026-07-15

The fixture-scale adapter is implemented in
`packages/slopbrick/src/calibration/v103/admission-authority-rebuild-adapter.ts`
and recorded in `.superpowers/sdd/task-2b-runtime-adapter-report.md`. It
resolves the indexed `admission-static-ledgers-v1` /
`authority:overlap` receipt chain and compares its derived snapshot with the
static generation before any authority mutation. It then wraps the existing
publisher/recovery transaction with a strict `complete`-phase reopen before
journal cleanup and a defense-in-depth reopen afterward. The reopened graph
must match every supplied object and raw declared artifact byte, including
candidate semantic-authority sidecars; complete-boundary failures remain
recoverable and post-return failures retain the publication result.

The adapter also runtime-validates the fixed selector shape/values, graph
self-hashes/byte pairs, and replace prior-current evidence before the
publisher can create a lock. Caller-selected read paths are limited to
admission-root-contained prior evidence. Recovery of a journal already at
`complete` invokes the strict adapter hook before cleanup.

Focused coverage is **5 files / 53 tests**. SlopBrick typecheck/build and the
package-wide one-worker gate pass **317 files / 5 skipped; 3,627 tests passed /
9 skipped** under a 2 GiB heap cap. Existing Zod declaration warnings and
expected fixture stderr remain non-fatal. This does not expose a mutating CLI,
replay the corpus, acquire repositories, promote labels, change package or
release state, push remote refs, publish, or deploy. Census/readiness remains
**329/329** reviewed sources, **452,382** quarantined/unrepresented units,
zero candidate/eligible units, blockers `static_authority_unavailable` and
`witness_authority_unavailable`.

The explicit package-local self-scan is recorded as diagnostic evidence only:
235 files analyzed with no parse/timeout/crash/internal failures, AI Slop
Score **17.3** against the configured 15 threshold, 157 active low/medium
diagnostics, and security 100/100 with zero security findings. The prior
baseline was rejected for a config-hash mismatch and no new baseline was
accepted. A refactor or calibrated-policy review is still required before a
passing release self-scan can be claimed.

The live `census:preview` was independently rerun against
`/Users/cheng/corpus-expansion/v10.3` with the indexed context invocation. Its
canonical stdout was non-mutating and returned `ready=false`, 329/329
registered/reviewed sources, 452,382 additive unrepresented units, and the
unchanged `static_authority_unavailable` / `witness_authority_unavailable`
blockers (113,470 bytes; output SHA-256
`95ed5b57a4ccab0bd3eb21aef150088a34632b60f843f0200c204dc65e50ffda`). This is
live diagnostic evidence only; it is not an admission or release receipt.

The adapter is deliberately bounded: runtime context still owns the complete
overlap-generation/envelope join; reopens are sequential rather than one
cross-object atomic snapshot; and the existing publisher's proposal and
input-generation final-path staging remains a separate hardening item. Next
is independent review, then a CLI only after approval, followed by real
static/witness corpus replay.

### Allocation/provenance replay and scan-UX closeout — 2026-07-15

The current v10.3 inventories were consumed once through the bounded
allocation preview after Core validation of **329/329** source reviews. The
replay conserved **452,382** rows (**224,903 declared AI / 227,479 declared
human; 58,089 baseline / 394,293 repository**) with zero duplicates, unknown
repositories, ownership/path/origin/commit/hash mismatches, or stream errors.
It yielded **0 allocated / 452,382 quarantined / 0 unrepresented**. Canonical
stream SHA is `7dfec0cebf6a169cbfa10ba8955f038cb5b6dc74010245a52e1a5cd9b8669097`
and register SHA is `ce40134968cd9f490b29e695b27fb724ce8d4b8ba9a4abf26eb789cc4c4d78de`.
This closes the question of manual review: provenance allocation can cover
the full population without loading it or reading every file, but no label is
promoted because authorship/rights/evidence/source-byte/static/witness
authority is still missing. No new repository pull is justified.

The self-scan accounting/ETA follow-up is closed. Persisted inventory/structure now use
the explicit 240-file selection (matching health/report), and positive
sub-second ETA values render `<1s` rather than `0s`; the diagnostic score and
release gate remain unchanged at 17.6 > 15.

The next authority slice must also preserve the RAM boundary: allocation is
streaming, but the current static-ledger helper is array-based. A
disk-backed JSONL ledger adapter/external-sort path is required before
452,382-row live static authority is attempted.

## Current verification checkpoint — 2026-07-15

One fresh, RAM-capped package gate passed **325 test files / 3,697 tests**
(**5 skipped files / 9 skipped tests**). A fresh recursive typecheck and build
passed for Core, Engine, Website, and SlopBrick; the only build diagnostics
are the known non-fatal Zod declaration warnings. `git diff --check` is clean.
This checkpoint intentionally replaces repeated independent confirmation of
the same edge cases; the focused recovery/publication tests remain the
appropriate coverage for those paths.

The live diagnostic census is unchanged: **329/329** sources reviewed,
**452,382** additive units, **0** candidate/eligible units, and all
**452,382** units quarantined or unrepresented. The blockers remain
`static_authority_unavailable` and `witness_authority_unavailable`. No
corpus, label, manifest, remote, package, release, publish, or deployment
state changed. The remaining work is real authority materialization and the
downstream 100+100 smoke / 5,000+5,000 canary, not another corpus-wide
confirmation.

### Task 3A deterministic witness/census contract checkpoint — 2026-07-15

Commit `f69dd6bc5` adds the Core witness, infeasibility, search-result,
witness-review, and census contracts plus the SlopBrick deterministic witness
projection/search and diagnostic census boundary. Core schema/type/test gates
pass (**32 files / 237 tests**), recursive typecheck/build pass, and the
RAM-capped SlopBrick suite passes **326 files / 3,702 tests** (5 skipped files /
9 skipped tests). The schema contradiction around two byte-identical witness
regenerations was caught and fixed by the focused contract test.

This does not advance the live census: the graph still reports
`static_authority_unavailable` and `witness_authority_unavailable`, all
452,382 units remain quarantined, and no labels, corpus bytes, remote, package,
release, publish, or deployment changed. The review-graph builder and
transactional witness publication remain the next implementation slice; no
additional manual confirmation or full-corpus replay is needed for these edge
cases.

### Task 3B pure witness-review graph checkpoint — 2026-07-15

The local pure builder now emits one Core-valid acyclic witness-review bundle
only after joining a witness search result, two distinct regeneration
intent/receipt pairs, a receipted constraint check, an exact witness blind
assignment, two calibration decisions, and the post-decision blind receipt.
Its focused suite is **3/3** and SlopBrick typecheck is green. Automated
coverage owns the wrong-action, output mismatch, disagreement, and
non-witness-target cases; they no longer require separate human confirmations.
Filesystem publication, completion/routing contracts, and real static/witness
authority remain open, so the live census and release boundary are unchanged.

### Task 3B transactional witness-publication checkpoint — 2026-07-15

The review graph now has one transactional publication owner. Core commit
`d065c191e` adds strict routing-reference, completion, lock, and transaction
schemas plus semantic self-hash and lock/transaction validators. SlopBrick
commit `fc9859a72` (cleanup `d2e04c0e4`) adds the fixed-topology publisher,
durable phase journal, nested handoff/receipt binding, no-clobber publication,
symlink containment, idempotent replay, and nonce/no-live-writer recovery,
including lock-only recovery.

One focused automated gate covers the edge-case matrix: Core **9/9** contract
tests, SlopBrick **6/6** publisher/recovery tests, and **2/2** CLI-boundary
tests. The full RAM-capped SlopBrick gate is **329 test files / 3,713 tests
passed**, with 5 skipped files / 9 skipped tests. It includes a crash after routing promotion to prove recovery preserves
the lock's original CAS state, plus collision, unknown-file preservation, and
root-nonmutation checks. Core and SlopBrick typecheck and `git diff --check`
pass. No second or third human confirmation is required for these cases.

The slice remains diagnostic-only. The real static/witness authority is not
materialized; the live census is unchanged at 329/329 sources, 452,382
additive units, 0 candidate/eligible, all quarantined, with
`static_authority_unavailable` and `witness_authority_unavailable` as the only
blockers. No corpus, label, manifest, remote, package, release, publish, or
deployment state changed. Next is authority materialization followed by the
bounded smoke/canary gates.

### Dependency security adapter checkpoint — 2026-07-15

The prior release instruction `corepack pnpm audit --prod --audit-level high`
is not executable as a trustworthy gate in this checkout: the supported pnpm
versions call npm's retired `/security/audits` endpoint and receive HTTP 410.
The root `scripts/audit-npm-bulk.mjs` adapter now builds a deterministic
production dependency payload and uses npm's current bulk advisory endpoint;
its helper suite is **3/3**, and the live run covers **522** external
production packages with **0** high-or-critical advisories (payload SHA-256
`b3b6b2d1bc72eb886411cc0d450fe4384af5a46b75202e3e74e1e2a7987a34ac`). CI,
release verification, and the main-branch pre-push hook each invoke this one
adapter path. This resolves an obsolete-tooling gate, not the open corpus
authority or release-authorization boundary; no corpus, label, remote,
package, release, publish, or deployment state changed.

### Source-byte binding checkpoint — 2026-07-15

The bounded source-level audit at
`/Users/cheng/corpus-expansion/v10.3/review/source-byte-binding-audit-2026-07-15.json`
resolves all **452,382** selected inventory rows against the centralized
filesystem: **452,382 regular files, 0 missing, 0 non-regular, and 0 recorded-
size mismatches**. It used streaming inventory reads and `lstat`; it did not
load or execute the corpus. This narrows the blocker to provenance/rights and
generation-backed authority, not missing bytes or insufficient repository
volume. No additional public-repository pull is warranted. The remaining
project gate is real static/overlap authority, then the bounded witness
smoke/canary; filesystem/parser/recovery edge cases remain owned by the one
automated confirmation gate.
