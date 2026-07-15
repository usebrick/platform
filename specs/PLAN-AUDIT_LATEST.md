# Plan Audit — v0.45 recovery, v10.3 corpus admission, and immutable release assets

**Date:** 2026-07-14 · **Verdict:** READY TO EXECUTE (gated)

## Frozen plans

| Plan | SHA-256 | Role |
| --- | --- | --- |
| `packages/slopbrick/docs/calibration/v10.3-release-asset-materialization-plan.md` | `2b79466ed466ddb2edbb4251505b0a0b9fddbaa17e64310831c0ab92fdadc87d` | Owns the additive Core release-archive/materialization contract and implementation Tasks 1-6; Tasks 7-8 are downstream consumers. Task 4 is split into independently reviewed 4A/4B/4C slices; its old 2026-07-13 override is explicitly historical and points to the authoritative continuation-plan evidence. |
| `packages/slopbrick/docs/calibration/v10.3-corpus-source-admission-plan.md` | `b39e6579aa5f13548c6a3a98b2273b97013b5fc7b878e5b5818cb980fe9a7d8c` | Owns provenance admission Tasks 0-11, including the explicit material-partition contract, acquisition-round ID/hash fields, and the v10.3.2 witness-bound manifest. |
| `packages/slopbrick/docs/calibration/v0.45.0-continuation-plan.md` | `f748284c8de12a537a3c59488178b07e3951699e0cf04618ea9affd2f72a78b0` | Current recovery/release gate order and evidence authority; live Task 1A and bounded Task 1B checkpoints record the approved census, register-authority Core contract, register-publication runtime, Core/SlopBrick diagnostic slice, acquisition-round contract, structured record/decision consumption, temporal/adjudicator authority, completed dirty-boundary reduction pass, the independently approved Task 2A Core overlap-contract, SlopBrick normalizer/universe, exact-similarity, external-sort fixture, artifact-contract/runtime, incremental-stream, bounded-overlap-computation, approved overlap-authority publication/CLI slice, bounded fault/CAS matrix, CLI E2E, selected-generation and envelope-relation verification, terminal checkpoint/resume and sidecar-integrity recovery validation, recursive typecheck/build boundary, scope-control and clean-boundary audit, migration-scoped website accessibility verification, score/property and valid-report accounting including unknown-count `n/a`, HTML finding-evidence parity, workspace-binary self-scan correction with threshold parity, dependency audit, DB/docs validity, website dev-data generation, workflow pnpm pinning, stronger schema/type freshness checks, the live 307-file/3,544-test package-gate correction plus repository-polarity and normalized-summary hardening, the health-wire/heatmap/doctor validity matrix, the latest disposable 227-file/531-issue self-scan refresh and brief-output UX review, the 2026-07-14 scope correction/implementation freeze, the post-gate authority-runtime consolidation target, the current-state pointer, the external corpus review-artifact refresh, the recursive build-boundary refresh, the synthetic clean-snapshot build diagnostic, the live-site/documentation truth refresh including measured-versus-unmeasured rule claim correction, the current dirty same-tarball consumer diagnostic, the current 460-file/757-entry diff census refresh, the MCP no-trailing-newline transport correction, the current corpus authority audit refresh, the read-only 329-entry genesis composition diagnostic with deterministic blocker counts and receipt, the built-CLI 45/45 partial-watch validity matrix with all-five-field stream/file assertions and explicit skip semantics, the latest synthetic clean-snapshot consumer, recursive typecheck, full JSON genesis diagnostic, live-diff census/hash correction, current AAX30H clean-snapshot packed-consumer pair, reproducible genesis/typecheck/packer evidence, corrected v3 external-packer provenance receipts, historical website demo-label corrections, the current runnable-versus-planned admission CLI boundary, the reproducible disposable Python/pyarrow bootstrap setup, the staged beacon/large-output boundary review, the independent corpus deficit/acquisition decision audit, the live package-local self-scan/dead-code cleanup review, the row-versus-content overlap audit showing 3,522 cross-polarity hashes with a recursive-canonical diagnostic receipt, the owner-authorized local commit plus two-source bounded quarantine acquisition, static audits, proposals, and cumulative round receipt, the deterministic 10,000-file quarantine projection verification, the immutable acquisition generation-0/1 plus diagnostic evidence-bundle checkpoint, the reviewed two-phase evidence-verification authority plus bound source-census checkpoint, the bounded full Core/engine/website/SlopBrick verification closeout, the superseding clean Task 6 boundary plus dependency rereview rebind, the committed Task 2B privacy, quality, lineage, corrected provisional witness-free pre-witness boundary, four-contract static-authority Core, static-authority relation sub-slices, approved rich pre-witness Core contract (`286741d15`, `f828fdaf5`, `1f2f8f6a4`; report/review `.superpowers/sdd/task-2b-core-rich-report.md`), approved authority rebuild lock/transaction Core contract (`a5d66eba3`, `4318d26eb`; report/review `.superpowers/sdd/task-2b-authority-contracts-report.md`), approved runtime source-review authority anchor (`762540ae5`, `b285cccb3`; report/review `.superpowers/sdd/task-2b-source-review-anchor-report.md`), approved pure prebuilt authority graph validator (`136ad461a`, `383bf4c09`, `f115bf7e6`; report/review `.superpowers/sdd/task-2b-authority-rebuild-graph-report.md`), approved symlink-safe prebuilt authority-graph loader (`a13444fc3`; report/review `.superpowers/sdd/task-2b-authority-rebuild-loader-report.md`), and pure authority-publication planner (`3fadffe56`, `b27ab684f`, `5feb27aff`; report/review `.superpowers/sdd/task-2b-authority-publication-plan-report.md` and `.superpowers/sdd/task-2b-authority-publication-plan-review.md`) plus the exact 2026-07-15 read-only source-census replay and corrected project-root invocation (`de0cd1879d14365b919c09bdd21bd5760a6804a0e3626d87abf37b78ad948857`). |

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
- Current plan hashes were recomputed on 2026-07-14; any subsequent plan edit
  requires another hash refresh and targeted rereview.

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
TOCTOU and cross-platform POSIX policy follow-ups remain open. The next
ordered action is fixture-scale filesystem publication/recovery using the
approved pure authority-publication planner at `3fadffe56`, `b27ab684f`, and
`5feb27aff`, then generator/rights/lineage evidence, followed by an
acquisition-bound register delta and deterministic census. Do not pull more
repositories until that census proves a measured deficit. The
mechanical dependency rereview rebind is recorded in
`.superpowers/sdd/dependency-remediation-rereview-rebind-2026-07-14.md`; its
independent approval receipt is still required.

Any implementation failure that exposes a contract defect reopens planning
rather than silently weakening provenance, security, resource, or readiness
rules.
