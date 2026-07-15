# SDD progress — SlopBrick packaged worker runtime and self-scan recovery

- Plan: `docs/superpowers/plans/2026-07-09-slopbrick-worker-runtime-and-self-scan.md`
- Base commit: `8086c3f1bc47148a47eb2df973118b6c96911570`
- Worktree note: existing v0.45 files are intentionally dirty and must not be staged by task agents.

| Task | Implementer | Review | Commit | Status |
| --- | --- | --- | --- | --- |
| 1 — packaged worker resolution | `worker_resolution_implementer` | APPROVE | `7927b94b9` | completed |
| 2 — bounded startup failure | `worker_lifecycle_implementer` | APPROVE after final broad re-review | `72c41eecc`, `fa70c0220`, `dc30bc346`, `95be71275`, `1a306d2ba` | completed |
| 3 — package artifact parity | `artifact_contract_implementer` | APPROVE after clean-checkout re-review | `0c9cded18` | completed |

## Scan discovery and release-gate recovery

- Plan: `docs/superpowers/plans/2026-07-09-scan-discovery-release-gates.md`
- Base commit: `4da128b20`
- Execution rule: reconcile the continuation plan, handoff, evidence report, and this ledger after verified implementation; never mark unchecked roadmap gates complete from intent alone.

| Task | Implementer | Review | Commit | Status |
| --- | --- | --- | --- | --- |
| 0 — source/ESM/CommonJS parity | `module_parity_implementer` | APPROVE | `e8b7a2d4f` | completed |
| 1 — config/monorepo discovery | `discovery_implementer` | APPROVE | `83e1d2894` | completed |
| 2 — empty/partial outcomes | `completion_outcome_implementer` | APPROVE | `160e149bc`, `9dbb02afe`, `e388b4a0a` | completed |
| 3 — authoritative CI outcome | `ci_gate_implementer` | APPROVE | `f94805af8`, `f5d87528c`, `0da9150f5` | completed |
| 4 — Dart rule contracts | `dart_contract_implementer` | APPROVE after metadata correction | `158ee8011`, `ea9c7c1d1` | completed |
| 5 — self-scan/evidence/plan reconciliation | `evidence_reconciler` | docs/evidence pass recorded; broader gates remain open | `v0.45.0-execution-evidence.md` | completed |

### Immutable release-asset materialization tranche

| Task | Implementer | Review | Commit | Status |
| --- | --- | --- | --- | --- |
| 5 — manifest-aware release source materialization | `v103_materialize_sources` | APPROVE after path-normalization and adversarial-test fixes | unstaged worktree (`task-5-report.md`, `task-5-review.md`) | completed |
| 6 — resolver/run binding and packed consumer | `v103_resolver_binding` | APPROVE after clean-install/schema/receipt fix wave; final bounded gates green on dirty bytes | unstaged worktree (`task-6-report.md`, `task-6-review.md`, receipts); clean commit-bound rerun pending | bounded-complete |

### Current verification and historical blockers

**Current verification override — 2026-07-13:** the final bounded SlopBrick
suite passes 285 files (5 skipped), 3,316 tests (9 skipped) with one worker
and a 2 GiB heap cap. Core/Engine/Website tests pass 127/127, 59/59, and
37/37; recursive typechecks pass with zero errors; Core schema fixtures
validate; and the fresh SlopBrick build passes. The recursive build remains
blocked by Core codegen freshness detecting uncommitted generated
`packages/core/src/generated/calibration-observation.ts` and
`packages/core/src/generated/health.ts` changes. The final same-tarball Task 6
pair passes 9/9 on Node 22.22.3 and 9/9 on Node 24.15.0 strict offline, bound to tarball SHA
`61d3b9e9c3a8d8d01b19425431f3dca56d395e30b719461f1c0e34ad9c398846`, dirty
status hash `0142d40f2cca9afa8f713d7e5bf4ed9fc1f9e5e6895f73771fa2764e2574fe6f`,
and 179 status entries. The latest locally available built-CLI self-scan
receipts are complete/valid with zero failures/skips and no failed thresholds:
package `.` 208/208 (119 active, 274 suppressed; AI Slop 4.6849; Repository
Health 98.1111) and platform root `../..` 439/439 (212 active, 550 suppressed;
AI Slop 4.3307; Repository Health 94.8741). These dirty-byte diagnostic
receipts are not release evidence; diagnostic usefulness is closed.
Those receipts remain bound to the 179-entry snapshot; the current worktree is
613 status entries with status SHA
`f5b4404c0a72c4b81766767ad93d06687d35a81b45f0538aeb9473cd72e051df` after
the score-contract, provenance, CLI regression, workflow, website accessibility,
v10.3 run-artifact, and current verification slices. The affected score/provenance suite is green at
12 files/234 tests, the whole-project CLI/MCP golden test passes 1/1, and the
strict website Playwright/axe suite passes 13/13 with no serious or critical
violations. Continuation progress is
96/178 checked; admission progress is 2/76 task items checked (the
instructional checkbox example is excluded).

**Task 1B temporal/adjudicator authority checkpoint — 2026-07-13:** Core now
rejects orphan/malformed temporal receipts, maps temporal attestations to
explicit source IDs, and validates dedicated disagreement assignment,
adjudicator decision, and receipt artifacts while preserving the exact-two
blind peer receipt. Optional adjudicator JSONL/hash/ID sections are consumed
by SlopBrick's per-source ledger; prior IDs are normalized from hash order to
canonical peer order. After the reduction refactor Core is green at 19 files/
172 tests, and the bounded SlopBrick admission-review/source-census/temporal
matrix is 30/30 with one
worker. This closes only the named contract slice: the graph remains
diagnostic/fail-closed (`ready=false`, `eligibleUnits=0`), and reduction,
reconciliation, overlap/privacy/witness authorities, corpus admission, and
release gates remain open. After rebuilding Core and SlopBrick from the final
source boundary, the RAM-bounded serial SlopBrick suite is green at 293 files/
3,406 tests with 5 skipped files and 9 skipped tests; the earlier stale Core
source-map failure was an artifact freshness race. The current dirty snapshot
is 624 status entries with SHA-256
`8aeaff54a6612c3ddad819bc52e1c0b8a61cc45ad4edd6480741bcc644ba6c0a`.

**Reduction/reconciliation checkpoint — 2026-07-13:** the dirty-boundary
reduction pass is complete. Seven admission validators now share one pure Core
primitive module (48 repeated guards reduced to seven shared primitives plus
11 specialized wrappers), with four regression tests. Core passes 19 files/
172 tests; schema validation, SlopBrick typecheck, and diff-check pass. The
artifact classification and superseded-section labels are recorded in the
package calibration docs. No files were deleted, moved, or acquired. The
reduction snapshot was 627 status entries with SHA-256
`a0b7502b5dd57367216ba6bfb75c66f4f6b56056b68c5ebe0877bb31b77a0e48`. Task 2A
has since started at a bounded Core contract boundary; its runtime and
recursive gates remain open.

**Task 2A Core overlap-contract checkpoint — 2026-07-14:** the independent
review in `.superpowers/sdd/task-2-contracts-review-final.md` approves the
first four-contract Core slice. The normalizer registry, overlap-universe row
and summary, and frozen overlap-policy schemas have generated peers, index
entries, fixtures, semantic validators, exact rational Jaccard/size helpers,
and canonical stream checks. Review fixes reject registered-unassigned labels,
locator control bytes, omitted/substituted normalizer registries, and the
wrong heap bound; malformed unknown rows now return `ok=false` instead of
throwing. One-worker bounded gates pass: focused 1/6, full Core 20/178,
typecheck, schema validation, and diff-check. This does not implement the
SlopBrick normalizers/universe reader, disk-bounded overlap ledger, resource
receipt, persistence/recovery, CLI, or real-corpus acceptance; no corpus or
remote release state changed.

**Task 2A exact-similarity fixture checkpoint — 2026-07-14:** the independent
review in `.superpowers/sdd/task-2-similarity-review-final.md` approves the
pure fixture slice only. Same-language prefix candidates, global exact-hash
duplicates, integer size filters, exact inclusive rational 0.80 confirmation,
both polarity bindings/sides, explicit AI↔human cross-side derivation, and
duplicate-shingle cardinality are covered by 1 file/8 tests; the Core overlap
contract remains 1 file/6 and SlopBrick typecheck passes. The required
incremental reader, external sort/shards, adjacency/clusters, resource
receipts, persistence/recovery, CLI, and 452,382-unit acceptance remain open;
no corpus or remote release state changed.

**Task 2A external-sort/shard fixture checkpoint — 2026-07-14:** the
independent review in `.superpowers/sdd/task-2-external-sort-review-final.md`
approves the fixture/diagnostic writer only. Canonical duplicate-preserving
JSONL sorting, contained no-clobber `generation_local` shard paths, lowered
shard/open-file/work budget enforcement, incomplete receipts, and unknown-file
preservation pass 1 file/6 tests; SlopBrick typecheck and diff-check pass.
This is not the production spill/merge path: incremental stream verification,
heap/RSS/unit/wall telemetry, Core shard/resource schemas, adjacency/clusters,
checkpoint/recovery, CLI, and 452,382-unit acceptance remain open; no corpus or
remote release state changed.

**Task 2A artifact-contract/runtime checkpoint — 2026-07-14:** the independent
review in `.superpowers/sdd/task-2-artifact-runtime-review-final.md` approves
the nine overlap artifact schemas, generated peers, nine valid/nine invalid
fixtures, and pure semantic validators. Core passes 21 files/181 tests;
focused artifact tests pass 3/3; typecheck, schema validation, and diff-check
pass under one worker and a 2 GiB heap cap. Production incremental overlap,
telemetry, persistence/recovery, publication, CLI, and real-corpus acceptance
remain open; no corpus or remote release state changed.

**Task 2A incremental stream checkpoint — 2026-07-14:** the independent review
in `.superpowers/sdd/task-2-incremental-reader-review-final.md` approves the
single-consumer SlopBrick `AsyncIterable` reader. It incrementally decodes
strict UTF-8, hashes exact bytes, retains only the current line and scalar
counters, requires canonical JSONL/final newline, enforces the 32 MiB
unit/content bound, validates Core row/registry/order/count/status/unresolved/
hash contracts, and fails closed on early consumer termination. A registered-
language `unreadable` row is permitted after the review fix; contradictory
`unsupported` bindings remain rejected. Focused overlap-universe/stream tests
pass 2 files/9 tests, plus SlopBrick typecheck and diff-check. Production
spill/merge, shards, telemetry, persistence/recovery, CLI, and real-corpus
acceptance remain open; no corpus or remote release state changed.

**Task 2A bounded overlap computation checkpoint — 2026-07-14:** the
independent review in `.superpowers/sdd/task-2-overlap-builder-review-final.md`
approves the computation-only builder. Canonical stream hashing and
normalizer/status binding, bounded multi-pass postings/pair merges,
deduplicated candidate pairs, exact/inclusive-near edges, generation-local
edge/adjacency/cluster shards, resource accounting, and output
rehash/schema-checks are covered by 5 files/25 focused tests; SlopBrick
typecheck and diff-check pass. Checkpoint/resume, publication/recovery, CLI,
cross-artifact range/relationship verification, and the real 452,382-row gate
remain open; no corpus or remote release state changed.

**Task 2A SlopBrick normalizer/universe fixture checkpoint — 2026-07-14:**
the independent review in
`.superpowers/sdd/task-2-normalizers-universe-review-final.md` approves the
bounded diagnostic slice only. Strict UTF-8 normalization, explicit
covered/unsupported/unreadable outcomes, runtime implementation/fixture-hash
allow-listing, deterministic full SHA-256 five-token shingles, and canonical
chunked JSONL validation are covered by 2 files/10 tests; SlopBrick typecheck
and diff-check pass. The reader is intentionally in-memory fixture tooling,
not the 452,382-unit production path. Incremental verification, resource
limits, malformed-language fixtures, collision evidence, external sort,
shards, persistence/CLI, and real-corpus acceptance remain open; no corpus or
remote release state changed.

**Task 2A overlap authority publication/CLI checkpoint — 2026-07-14:** the
bounded local authority slice is independently approved. Core's four overlap
authority contracts now have generated peers, semantic validators,
and self-hash helpers; Core is green at 22 files/183 tests. SlopBrick's bounded
local authority stages descriptor and primary leaves before transaction intent,
fsyncs journal/output boundaries, publishes immutable generation trees and the
current pointer with no-clobber/unknown-file checks, and recovers only when
lock/transaction bindings, generation-number chains, complete trees, and the
current pointer prove the same generation. `authority:overlap`,
`authority:overlap:recover`, and `authority:overlap:verify` are wired; the
publication/CLI focus was initially 2 files/14 tests; the follow-on status and
fault evidence is recorded below, with typecheck and diff-check green under
one worker and a 2 GiB heap cap. This remains a bounded fixture/local
authority slice: real 452,382-row acceptance, external tool receipt authority,
full fault/two-writer coverage, checkpoint/resume, cross-artifact relationship
verification, corpus admission, clean recursive gates, commit-bound evidence,
and release remain open. No corpus or remote state changed.

**Task 2A fault/CAS and CLI-E2E update — 2026-07-14:** publication now covers
six recoverable durable hooks (including `cleanup-fsynced`), a
post-completion `lock-unlinked` boundary, and a deterministic two-writer
stale-parent race; the publication test is **20/20** and repeated race checks
remained stable. Contention and post-completion status are explicit. The CLI
test is **5/5** for read-only and contention boundaries plus child-process
publish→verify and library-created pending transaction→CLI recover→verify.
The combined publication/CLI focus is **25/25** and the seven-file overlap
focus is **51/51** under one worker and a 2 GiB heap cap. The post-hardening
full SlopBrick gate is **301 files / 3,462 tests** (5 skipped files / 9 skipped
tests); recursive typecheck is green with zero errors. Recursive build still
stops at the known Core codegen-freshness guard for uncommitted generated
observation/health peers. Real corpus, external tool authority,
checkpoint/resume, admission, clean receipts, and release remain open.

**Task 1A current-source checkpoint — 2026-07-13:** deterministic CAS and
authority recovery hardening now passes SlopBrick typecheck plus four focused
files at `54/54` tests under one worker and a bounded heap, with `git diff
--check` green. The fresh independent re-review approves this bounded Task 1A
slice. Journal-temporary byte checking and materialization-only authority
replay remain lower-priority plan follow-ups; the ledger remains `96/178` and
`2/76`, and Gate 4 remains quarantine-only (`verified_ai=0`, `verified_human=0`)
with no admission manifest/census/run or remote repository acquisition.

**Task 1B bounded register/review/census checkpoint — 2026-07-13:** the
independent superseding review in `.superpowers/sdd/task-1B-review.md` approves
the bounded slice. Core validates the 329-entry generation-0 register and
exact review set, canonical row hashes, aggregate ownership, and explicit
`materialPartition` conservation of `58,089` baseline plus `394,293`
repository units. SlopBrick's non-persisting `source:census` requires the
branded evidence context, emits no source counts/rows for unbranded or invalid
inputs, keeps candidate claims quarantined, and reports final `eligibleUnits=0`.
The CLI's realpath containment rejects symlink escapes, and aggregate rows are
marked non-additive so the 329-row projection cannot double-count the corpus.
Focused Core schema/typecheck/review checks and SlopBrick census/path tests
(`5/5`) pass under bounded resources. Remaining Task 1B authority contracts,
the real corpus census, Gate 4/5, and release gates remain open; the ledger
stays `96/178` and `2/76`.

**Task 1B register-generation authority slice — 2026-07-13:** the fix wave is
independently approved in `.superpowers/sdd/task-1B-register-authority-rereview.md`.
The Core graph now binds delta source-generation hashes to the transaction and
receipt, requires a completed receipt-bearing phase with matching metadata,
synchronizes the schema-contract expected list, and enforces source/register
path roles plus transaction-wide collision checks. Focused authority/review
tests pass `9/9`; the full Core suite passes `138/138`; schema validation,
typecheck, codegen, and diff-check pass. This approves the Core contract only;
runtime publication/recovery and the remaining Task 1B authorities are still
open. The ledger stays `96/178` and `2/76`; Gate 4/5 and release gates remain
open.

**Task 1B register-publication runtime slice — 2026-07-13:** the independent
re-review in `.superpowers/sdd/task-1B-register-publication-rereview.md`
approves the bounded local runtime; the evidence report is
`.superpowers/sdd/task-1B-register-publication-report.md`. The focused
register suite passes `12/12`, the combined acquisition/register/path suite
passes `34/34`, Core passes `138/138`, and SlopBrick typecheck plus diff-check
pass. The runtime journals all durable source/register/receipt boundaries,
revalidates symlink/path and byte/hash/tool bindings, supports lock-only
recovery, exposes the two register CLI commands, and preserves unknown
transaction files. The check-then-rename multi-writer race remains a
documented P2 follow-up under the transaction lock. This is not corpus
admission or release approval: source proposal/approval, blind/temporal,
record/decision, overlap/privacy/lineage, real Gate 4/5, calibration, and
release gates remain open; the ledger remains `96/178` and `2/76`.

**Task 1B Core authority + bounded SlopBrick diagnostic checkpoint —
2026-07-13:** the independent bounded approval is recorded in
`.superpowers/sdd/task-1B-core-authority-rereview.md` with evidence in
`.superpowers/sdd/task-1B-core-authority-report.md`. Strict Core validation
now covers source-generation joins,
independent blind source-review roles and rights evidence, temporal receipt
bindings, record/decision/sample/ledger joins, canonical materialization IDs,
artifact bytes, timestamps/URLs, and SHA-256 reviewer decision references;
generated fixed tuples are concrete. SlopBrick's pure review/census boundary
requires branded verified context, rejects malformed runtime values without
throwing, delegates Core register/review validation, and keeps candidates and
structured inputs quarantined with `eligibleUnits=0`. Codegen/schema validation
and the six Core authority files pass `29/29`; SlopBrick review/census pass
`9/9`; the previously approved register runtime remains `34/34`. The valid
source-register schema fixture is shape-only while exact 329-entry semantic
proof remains in-memory; census representation fields are diagnostic, not
admitted-record counts. Full Task 1B authority, real corpus census, Gate 4/5,
and release remain open; ledger stays `96/178` and `2/76`.

The bullets below preserve the earlier blocker chronology and are historical
snapshots; where their counts, build state, or “pending rerun” wording differ,
the 2026-07-13 override above is authoritative.

**Current-source refresh — 2026-07-13:** the typed finding-evidence/MCP slice is
independently approved. Its final focused run passes 95 tests; the projection
slice adds 44 focused tests plus 28 selected score-explanation/partial tests,
and the per-rule calibration-evidence slice adds 31 SlopBrick tests plus 3
Core contract tests. SlopBrick typecheck, MCP documentation generation, and
diff-check pass. The rebuilt serial SlopBrick suite passes 285 files (5
skipped), 3,316 tests (9 skipped)
under one worker and a 2 GiB heap cap. Fresh built-CLI self-scans are complete
and valid at package 208/208 (119 active, 274 suppressed; AI Slop 4.6849) and
root 439/439 (212 active, 550 suppressed; AI Slop 4.3307); these receipts are
diagnostic-only. The evidence contract does not admit a v10.3 cohort/source.

The explicit `scan --resume` boundary and status-only `cal:report` receipts
are now focused-tested and fail closed. Scanner/feature-schema hash binding
remains intentionally open because no canonical runtime scanner artifact or
v10.3 feature-schema byte set exists; hashing the current source/dist fallback
would create false provenance.

The bounded pure v10.3 metrics reducer is now present and focused-tested 11/11:
it requires explicit eligible AI/human file IDs and a complete rule catalog,
deduplicates file-level fires, and emits deterministic point estimates plus
Wilson 95% intervals. It also emits deterministic equal-weight family-cluster
and language macro point estimates with pooled audit counts, diagnostic F1, and
seeded family-cluster bootstrap percentile intervals for LR+, balanced PPV, and
F1. Admission-backed report wiring remains open.

The Gate 3 deterministic smoke extension now compares two complete 100/100
metric runs byte-equivalently; the focused smoke/metrics/edge matrix passes
21/21 and covers unequal arms, zero-cell behavior, and paths containing
spaces. A follow-on 8/8 slice validates persisted observation/failure/coverage
bytes through AJV and Core runtime validators, snapshots telemetry/flywheel/
baseline/`AGENTS.md` sidecars, and runs the bundled worker through the checkout
boundary with `SLOP_AUDIT_CACHE=0`. The full cross-command slice passes 1/1;
broader worker/checkout production parity remains open.

- The last full recursive gate before the latest renderer/resource edits was
  green at Core 116, engine 59, website 37, and SlopBrick 3,151 tests. A later
  bounded serial SlopBrick rerun after the default-off renderer fix passed 265
  files (5 skipped) and 3,157 tests (9 skipped); the pretty-detail/resource-
  budget edits have focused green tests. Task 6 hardening and a fresh full
  rerun after all current edits remain pending.
- The Task 6 receipts are intentionally marked `dirty: true` because no clean
  builder commit was created. A user-authorized clean commit and commit-bound
  receipt rerun remain required before admission Task 1A or a release claim.
- The historical self-scan snapshot was complete and parseable with
  `scoreValidity=valid` and no failed thresholds (package 204/204; root
  435/435). The current override supersedes it with 208/208 and 439/439.
  Both remain diagnostic rather than release evidence. The stratified manual
  correctness/usefulness review is now closed for diagnostic triage; the
  compression cohort is explicitly not a release/calibration signal, and the
  broader Gate 2/release gates remain open.
- The historical dependency snapshot was green on the then-current dirty bytes
  after the bounded migration: both production and full `pnpm audit
  --audit-level moderate --json` commands returned zero advisories, and the
  website plus recursive typecheck/test/build gates passed at that snapshot.
  The migration, lockfile, and
  Vitest temp-fixture configuration still need independent review and a clean
  commit. The original 17/20 counts remain preserved as historical baseline in
  `.superpowers/sdd/dependency-gate-audit.md`.
- v10.3 corpus provenance/admission, calibration, and site/operations/release
  gates remain open. Self-scan output is now approved for diagnostic triage
  only; its scores remain non-release evidence.
- The external v10.3 review validator passes, but the register remains draft,
  all legacy inventory rows remain intake-only, HumanEval and EvalPlus have
  zero eligible pairs, and no admission manifest/selection/run exists. Do not
  start admission or acquire more sources until the clean Task 6 commit-bound
  receipt gate is authorized and closed.
- Manual self-scan UX review is recorded in
  `.superpowers/sdd/self-scan-ux-audit.md` and the stratified decision in
  `.superpowers/sdd/self-scan-stratified-review-2026-07-13.md`: current JSONs
  are complete/valid, grouped/contextualized output is truthful, and the
  compression/self-hosting caveats are explicit. This closes diagnostic
  usefulness, not release-signal or calibration approval.
- A bounded Markdown renderer fix now uses issue polarity for the AI versus
  Engineering Hygiene buckets while preserving suppressed verdicts. Focused
  renderer suites pass 31/31 and SlopBrick typecheck/build pass; compression
  grouping, self-referential examples, and the remaining Gate 2 UX contract
  are still open.
- A follow-on pretty-renderer TDD slice now separates active findings into
  explicit `AI-specific signals` and `Engineering findings` lanes, hides
  `severity: off`, and explains empty lanes. The new test was red 3/3 before
  implementation; lane tests are green 3/3, the full report suite is green
  160/160, and independent review approved the slice. This closes only the
  wording/grouping presentation sub-item; manual compression/context review
  remains open.
- Dependency remediation also fixed the Vitest 3/Vite 6 temp-file SSR boundary
  in the engine and SlopBrick test configurations without changing production
  loaders; the focused affected suites pass 115/115. This is test-harness
  compatibility evidence, not release authorization.
- A read-only portability audit is recorded in
  `.superpowers/sdd/path-portability-audit.md`: the v10.3 control-plane entry
  is portable, while historical calibration scripts still have local clone or
  binary fallbacks. Gate 3 remains open for those scripts; no corpus authority
  uses them.

### Subsequent gate work (2026-07-09)

- Gate 0 containment evidence: `58b5a2202`, `0113440c7` (branch isolation,
  artifact hashes, dirty-tree classification, and explicit no-release decision).
- Gate 0 release train/scope decision recorded in the continuation plan and
  evidence: v0.44.0 trust restoration, no ML, and no public Dart/Ruby/PHP/C#
  claims until their gates pass. G0-04 cleanup remains open.
- SCORE-03 category separation: `0ed1fe300`; 41 focused metrics/category tests
  and package TypeScript validation pass. Full Gate 1 remains open.
- CORE-02 atomic artifact paths: `44db5737a`; core regression tests and
  TypeScript validation pass. Remaining schema/engine/MCP contracts remain open.
- CORE-03/04 schema parity and CI validation: `549d49af5`, tightened for
  RFC3339 year-zero parity in `116c0e621`; AJV fixtures, runtime validators,
  39 core tests, codegen, and direct tsup pass.
- CORE-01 cache namespace separation: `e28f636ee`; core freshness data now
  uses `.slopbrick/cache.json`, isolated from SlopBrick's root incremental
  cache. Core structure and SlopBrick structure tests pass.
- CORE-05/06 structure projection and schema delivery: `fce14364f` plus
  `a26b91a2a`; index/README/API now agree that structure JSON is canonical and
  Markdown is derived, with a backward-compatible type alias. Core 44/44,
  schema fixtures, codegen, and typecheck pass.
- SCORE-05 denominator correction: `7a81a4158` uses analyzed file count for
  score exposure and passes 38 metrics tests; explicit denominator metadata in
  all renderers remains open.
- ENGINE-01 pure boundary: `01aa7a7be` plus docs correction `fc91db6d9` expose
  pure `parseSource` and document filesystem adapters; engine 47/47, typecheck,
  and build pass.
- MCP workspace confinement: `eb7303272` plus TOCTOU correction `77077e31f`;
  MCP patterns 39/39 and slopbrick typecheck pass. Config/result parity and
  protocol-wide MCP contracts remain open.
- ENGINE-02 Louvain normalization and MCP config parity: `060714730`; engine
  48/48 and MCP server/pattern 41/41 pass, with independent approval. The
  shared commit contains exactly the two scoped workstreams.
- Gate 0 cleanup: `b3eed1836` aligns the candidate package/changelog to the
  selected unreleased v0.44.0 trust-restoration train and labels historical
  calibration paths as internal context; C# routing landed in `5e49764c8`.
- C# language routing independently approved: parser/discovery/rule tests 9/9
  across engine and SlopBrick, with package TypeScript validation passing.
- PKG-01/02 package contracts: `640e6124c` makes declarations self-contained
  for npm consumers; `e8b7a2d4f` restores ESM/CJS artifact parity. Pack-consumer
  tests 2/2, package tsc, dts build, and pack dry-run pass.
- Gate 3 chunk accounting: `ce6fb90b3` plus `954ce523a` preserve skipped-chunk
  metadata and reject malformed reports before aggregation. Focused merge,
  calibrator, and UX tests pass (44 total); calibration provenance remains open.
- CLI brief UX: `6fbfa2b11` plus `f45ea9af5` replace the nonexistent `--full`
  hint with the actionable “rerun without --brief” guidance; 41 UX tests and
  package TypeScript validation pass. The full flag/command audit remains open.
- CLI advertised-flag tranche: `40b2de70f` normalizes Commander option keys for
  `--threads`, `--diff`, `--refresh-snippets`, `--security-only`, `--full`,
  `--verbose`, and `--no-color`; adds security-only worker coverage and full-over-
  brief behavior. Typecheck and scan-completion 13/13 pass; CI/diff/UX focused
  suite 63/63 pass. Built-binary smoke covered JSON, security-only, verbose,
  full+brief, and watch SIGINT. The complete subprocess flag/command audit is
  still open; scan-side security/default-off changes are now included in the
  score tranche commits.
- CLI invalid-config smoke: `d268d629b` wraps config import/syntax failures in
  `ConfigValidationError`, restoring documented exit code 2 and actionable file
  context. Scan-completion suite is now 14/14; built-binary malformed-config
  smoke confirms the error path.
- Packaged CLI display/performance smoke: `f612ba0a0` proves subprocess
  normalization for `--threads`, `--verbose`, `--brief --full`, and
  `--no-color`; scan-completion is now 15/15.
- Refresh-snippets forwarding: `27dd71568` passes the opt-in flag as an
  explicit persistence input (the previous finalize call dropped it) and adds
  an initialized-AGENTS packaged subprocess regression; scan-completion is
  now 16/16.
- Output/telemetry subprocess smoke: `380ca1701` covers `--json <path>`,
  `--html <path>`, and `--no-telemetry` (no flywheel telemetry file); the
  scan-completion suite is now 17/17.
- Score provenance tranche: `9e1bf8d97` adds optional `scoreBasis` through
  report, health, JSON, Markdown, SARIF, MCP, and engine persistence; focused
  metrics/scan/SARIF/structure/core checks pass. `b0c169701` applies the same
  effective finding set before scoring and uses analysed files as the exposure
  denominator. Full public score and golden renderer parity remain open.
- HTML score provenance follow-up `fbc6da3dd` adds `scoreBasis` to the HTML
  report and passes its 12-test focused suite.
- Website truth follow-up `1f0d80ee9` replaces the stale 503-rule and ~150 kB
  claims with the published v0.43.0 facts (103 rules; downloaded tarball
  1,130,295 bytes). Full route/accessibility/deployment verification remains
  open.
- Documentation truth follow-up `7d3b102c6` updates root/package release status
  to published v0.43.0 versus unreleased v0.44.0, removes remaining hard-coded
  local calibration paths, and replaces the stale 24-category tree claim.
- Website interaction follow-up `597ffa422` fixes the live-terminal
  `structure.json`/`structure.md` mismatch and replaces timing-only assertions
  with command-completion state. Astro build/typecheck, 35 unit tests, and all
  9 Playwright/axe tests pass locally.
- CLI contract closeout: `27dd71568`, `380ca1701`, `ebcdd8865`, and
  `2c46c2466` complete refresh/output/no-telemetry/source-help/CI-forwarding
  coverage; `scan-completion` is 17/17 and CI threshold tests are 12/12. The
  remaining CLI gap is a dedicated source/CJS/ESM/tarball parity matrix.
- Follow-up test reconciliation: `2c46c2466` and `b5c94065b` align CI and
  integration fixtures with the raw AI-slop threshold and effective-file
  denominator. Focused pool, structural-clone, watch, category-separation,
  CLI-threshold, and CI suites pass in isolation; the concurrent all-suite run
  hit resource/timing limits (notably calibration workers), so it is not green
  evidence and must not be represented as such.
- Calibration path portability: `021fc7af7` removes the shared runtime's
  machine-specific corpus fallback in favor of `SLOPBRICK_CORPUS_DIR` or a
  repository-local `corpus/` directory; custom-path calibration remains green.
- Calibration stale-output hardening `73dc5238d` prevents prior chunk JSON from
  being reused after timeout/crash and records malformed reports as skipped
  errors; calibrator/merge focused tests pass 15/15.
- CLI command smoke closeout: packaged-worker (4/4) and pack-consumer (2/2)
  contracts plus CLI/CI/watch/MCP/config smoke are green; CLI-04 is now marked
  complete in the continuation ledger. The all-suite run itself remains
  non-green under concurrent calibration-resource load.
- SCORE-05 denominator gate is now complete in the ledger: analysed-file
  exposure and `scoreBasis` provenance are present in every listed renderer,
  including HTML via `fbc6da3dd`; SCORE-01/02 public semantics and golden
  renderer parity remain open.
- Full `tests/cli.test.ts` rerun after the raw-threshold fixture corrections:
  62/62 pass. This closes the previously stale empty-health and hygiene-only
  threshold expectations without claiming the concurrent all-suite run green.
- Public performance-claim cleanup `00610bbf4` removes the unsupported fixed
  100–1000× speed-up statement from root/package READMEs and points readers to
  repository-specific measurement.
- Website documentation cleanup `c037eb42e` removes stale Lenis/GSAP claims
  from the root package map; the actual site uses native browser APIs plus its
  WebGL shader.
- Fresh packaged self-scan after rebuilding `dist` (2026-07-10): 328 requested,
  328 analysed, 0 parse failures, exit 0; AI Slop 6.9267, Engineering Hygiene
  99.5793, Security 100, Repository Health 95.7. JSON includes `scoreBasis`
  (denominator 328, effective issue set, 195 suppressed issues) and stderr is
  clean. This is UX evidence, not calibration or release evidence.
- The continuation ledger now records previously reviewed CLI-00/01/05/06,
  CORE-07/08, and Dart contract gates as complete with their evidence commits;
  CLI-03/04, MCP protocol schemas, score invariants, language matrix, and
  release/calibration/site gates remain open.
- Score evidence: `622814466` deduplicates fired rule IDs before Bayesian/LR
  combination; engine 52/52 plus SlopBrick LR/guardrail 30/30 pass. Full
  public score semantics and renderer parity remain open.
- CLI-03 filter parity: `043a0dc35` forwards include/exclude/rule filters to
  workerData; scan-completion 12/12, typecheck, and build pass with independent
  approval. CLI-04 smoke coverage remains open.
- MCP response contract: `fa4ea80e1` restores `compositeScore` fields promised
  by `slop_scan_file`; full MCP suite 62/62 passes. Dart visitor routing:
  `894ef1670` adds Aqueduct/Conduit `router.route` coverage with approval.
- SCORE-04 directionality: `1daa779bc` inverts raw aiSlopScore before
  repository-health aggregation; `28b3f8ae7` aligns JSON/MCP briefs. Focused
  score, maintenance, MCP, and report tests pass; independent review approved.
- Website version truth is aligned to published npm `0.43.0`; local `0.44.0`
  remains unreleased. The live-terminal change was included in the concurrent
  score commit and is pending a source-level website review.
- Kotlin native parser environment was repaired by compiling the pinned
  `tree-sitter-kotlin` addon for Node 24; parser-kotlin tests now pass (5/5).
- Post-schema SlopBrick compatibility: invalid synthetic fingerprints were
  corrected in `818207d18`; structure tests pass (37/37). Focused score,
  parser, structural-clone, category-separation, and structure verification
  totals 99 tests passing. DB calibration still cannot run to completion from
  the current external corpus/cache state.

### Recovery tranche evidence (2026-07-09)

- Package-source self-scan: 328 requested, 328 analyzed, 0 failed, 0 skipped;
  exit 1 on `meanSlop`; AI slop 25, hygiene 99.9006, security 100,
  repository health 75.
- Repository self-scan: 388 requested, 388 analyzed, 0 failed, 0 skipped;
  exit 1 on `meanSlop`; AI slop 25, hygiene 99.7989, security 83.3333,
  repository health 75.
- Focused recovery verification: `tsc` and `tsup` passed; six focused test
  files passed with 38 tests; Dart guardrail/contracts subset passed with 17
  tests. Full-suite and broader Gate 0–6 evidence remain open.
- Post-reconciliation Dart metadata follow-up `ea9c7c1d1`: four files and 19
  tests passed, correcting `aiSpecific` drift. The subsequent full-suite run
  exposed the blockers listed above and was stopped; it is not green evidence.

- Score-direction follow-up `1d04106fa` clarifies raw AI Slop semantics in
  telemetry and terminal briefs (`lower is better`); score/maintenance/report/
  MCP focused tests pass 48/48 with package TypeScript validation.
- MCP transport follow-up `ad5536dd4` flushes pending asynchronous JSON-RPC
  responses before server completion; server/pattern/suggest tests pass 53/53.
  CLI↔MCP golden parity remains open.
- Generated language matrix `9354344cb` records extension, parser path, rules,
  defaults, fixtures, and calibration eligibility; deterministic `--check`
  passes. Experimental languages remain default-off and release-ineligible.
- CLI filter surface follow-up `7635d2678` adds repeatable
  `--include-rule`/`--exclude-rule` options and normalizes scan/watch callback
  typing; CLI-03 is now backed by both option and worker-propagation commits.
- MCP documentation follow-up `0d89b3abf` reconciles the guide with the seven
  canonical tools, current request/response fields, removed legacy tools, and
  structure.md terminology; `51056e179` now enforces generated registry drift
  with `generate:mcp-docs` and two docs-contract tests.
- Architecture-doc truth note `ea9c13528` labels the long historical design
  record and points current work to the v0.44 continuation plan, seven-tool MCP
  guide, support matrix, and actual website implementation.
- Calibration controls tranche `d126df6f8` exposes bounded chunk timeout and
  repeatable rule filters, routes parserless language extensions, and reports
  skipped chunks in Markdown. Calibration evidence remains diagnostic until
  provenance and coverage gates pass.
- Gate 1 renderer contract `9fb68690c`/`f28db4525`/`9fcb46b33` centralizes
  score semantics, makes MCP/SARIF carry numeric headline scores and basis,
  and separates human-actionable from machine-audit findings. Independent
  review approved the follow-up; report/MCP slice passes 182/182 and package
  TypeScript validation passes.
- Gate 1 worker parity `378543990`/`0914b5e98`/`a1779f989` found and fixed
  worker use of process cwd instead of the requested workspace. Direct/worker
  parity now covers path exclusions, directives, default-off findings, scores,
  and score basis; independent review approved it and scan completion passes
  19/19.
- Gate 1 aggregate-order parity `1376358a7`/`9142cf9bf` found one-ULP drift
  in composite, AI-bucket, and category weighted sums. Canonical evidence
  aggregation fixes it; decimal-weight permutation tests pass 40/40 and an
  independent review approved the scope.
- Gate 1 suppression invariance `769e0f3da` exercises real runScan default-off
  and next-line-disabled findings: all four effective scores and denominators
  remain invariant while audit evidence remains observable. Independent review
  approved it; scan completion passes 21/21.
- Gate 2 accounting `caf41e1e3`/`635838c14` adds backward-compatible,
  exhaustive selected/analyzed/cache/parse/timeout/crash/internal accounting.
  It distinguishes parse from post-parse internal failures and classifies pool
  retry exhaustion; focused pool + scan-completion tests pass 37/37 under
  independent review. Reason-coded discovery exclusions and partial-score UX
  remain open.
- Gate 2 score validity `074ccd1aa`/`fb65d13df`/`5b325332f`/`4d9942745`
  propagates explicit valid/incomplete/not-applicable status through core
  health, renderers, SARIF, MCP, thresholding, and historical memory. Invalid
  scans cannot become threshold/history evidence; core accounting conservation
  is validated. Independent review approved it; scan completion + thresholds
  pass 31/31. Numeric fields remain for wire compatibility and are explicitly
  non-gating until a future wire-format migration.
- Gate 2 pure engine API `a836c9e77`/`87c4d9762`/`d58634c85`/`a2230119a`
  exposes a real Core-verdict → Engine-pure subpath with exact exports,
  executable examples, and fresh isolated artifact-closure testing. The legacy
  root remains adapter-capable; pure docs accurately say host/editor-safe, not
  browser-portable. Independent review approved it; engine tests pass 56/56.
- Gate 2 MCP evidence `d365fc043`/`6b6bbdf8d`/`6048c5011` shares truthful
  CLI/MCP explanations, formatter-safe remediation, static policy (not runtime)
  state, and bounded/redacted why-fired facts. Calibration limits are explicitly
  unavailable rather than invented; independent review approved the global
  2 KiB evidence contract and targeted MCP/explain tests pass 80/80.
- Gate 2 discovery accounting `ff8c1e617` adds exclusive observed-candidate
  selection accounting without inventing ignored/deleted/glob-miss populations.
  It fixes extensionless config-exclude handling and propagates aggregate data
  through health/MCP/SARIF/JSON/terminal; independent review approved it and
  focused SlopBrick/Core contracts pass 49/49 and 24/24.
- Gate 1 canonical Repository Health `b1b25ea09`/`614d43f03`/`3b869688a`/
  `8779c1a49` removes the legacy Phase-12 headline overwrite, aligns scan and
  watch effective score inputs, and documents the published four-axis formula.
  The final suppressed-test/non-default contribution regression is independently
  reconstructed; review approved the complete sequence.
- Gate 2 score transparency `09e7b1b98` adds opt-in `--explain-score` terminal
  and JSON output from exact aggregate inputs, resolved weights, and canonical
  effective evidence. It preserves default JSON and explicitly refuses per-rule
  or Bayesian attribution; independent review approved its 43-test contract.
- Gate 2 output UX `cb8b2b7dd`/`3c9db93ff` centralizes color policy, fixes
  calibration's raw-ANSI bypass, and tests NO_COLOR/FORCE_COLOR/no-color,
  redirected JSON, narrow wrapping, deterministic bytes, and EPIPE handling.
  Independent review approved the 10-test subprocess contract.
- Gate 2 language-claim truth `eb88fae34`/`7c7ad475e`/`37e6bb340` restores
  parserless Dart/Ruby/PHP routing, centralizes manifest-derived matrix/site
  claims, CI drift checks, and the accessible canonical matrix link. Independent
  review approved L9.4; parser/manifest/site checks pass.
- Gate 2 exit codes `be4f5bb3d`/`fe22d2fc8` define and prove clean=0,
  policy/partial=1, usage/config=2, and unexpected=3. Commander, typed scan
  inputs, and bin fault handlers use the same mapping without shipping an
  environment-triggered test seam; independent review approved 12/12 tests.

### Task 1B acquisition-round contract checkpoint — 2026-07-13

The bounded offline Core acquisition-round contract is independently approved
in `.superpowers/sdd/task-1B-acquisition-round-rereview.md`. Core covers the
one/two-source authorization, approved acquisition, source/round receipts,
lock, and recoverable transaction; explicit authorization order, distinct
tool-receipt ID/hash fields, orchestrator projections, URL/IP/peer/cap/nonce,
and staged-state joins are validated. Core passed 17 files/163 tests plus
schema/typecheck/diff-check. This did not perform network acquisition or alter
the corpus; the ledger remains 96/178 and 2/76.

### Historical Task 1B structured record/decision consumption checkpoint — superseded 2026-07-13

> Historical snapshot only. The superseding temporal/adjudicator checkpoint in
> the continuation plan is the current execution state.

The bounded offline structured slice is independently approved in
`.superpowers/sdd/task-1B-structured-records-rereview.md`. SlopBrick consumes
records, samples, blind assignments, decisions, receipts, and source ledgers
as one fail-closed graph. Representation is record-derived, with explicit
unrepresented inventory; orphan bytes, partial/alias-conflicting graphs,
duplicate/cross-source/unledgered objects, missing decision joins, missing
source-rights evidence, and non-canonical decision JSONL rejected. Focused
SlopBrick review/census is 22/22; Core focused authority is 13/13; full Core
is 17 files/165 tests; both typechecks, schema validation, and diff-check pass.
The slice remains non-authoritative (`eligibleUnits=0`). The exact-two receipt
contract rejects a one-decision third-adjudicator bundle until a dedicated
contract exists; evidence-ID resolution against the verified index and
temporal-attestation consumption are deferred. Gate 4 remains quarantine-only.
The current worktree snapshot is 613 status entries with SHA-256
`f5b4404c0a72c4b81766767ad93d06687d35a81b45f0538aeb9473cd72e051df`.

## Latest bounded Task 2A checkpoint — 2026-07-14

The overlap publication boundary now has a cross-envelope relation verifier
for the index, resource receipt, ledger, and generation artifact receipts.
It is exercised by publication, recovery, and read-only verification. The
focused publication/CLI evidence is **29/29** (publication 24/24, CLI 5/5),
the seven-file overlap focus is **55/55**, and the RAM-bounded full SlopBrick
suite is **301 files / 3,466 tests** (5 skipped files / 9 skipped tests).
Core is **22 files / 183 tests**, schema validation and recursive typecheck
pass, and the package build succeeds. The recursive build still stops at the
intentional Core codegen-freshness guard for uncommitted observation/health
peers. This does not advance the real corpus, external tool authority,
admission, clean-builder, release, or deployment gates.

## Task 2B Core rich pre-witness contract checkpoint — 2026-07-14

The subagent implementation and independent re-review approve the final rich
pre-witness Core contract slice. The strict 40-key schema, generated peer,
schema/index/fixture parity, pure validator, self-hash, smoke/canary policy
expansion, stable component arrays, record-stream path/shape, and witness/search
partition rejection are covered by 12 focused tests. Follow-up hostile-input
fixes make malformed policy, undefined nested fields, malformed streams, and
throwing proxies fail closed. Core passes 29 files/219 tests, codegen,
schema validation, typecheck, build, and diff-check. This closes only the
Core rich-bundle contract; authority rebuild, byte-backed context/disposition,
CLI, real corpus, witness authority, and release gates remain open.

- SDD ledger: Task 2B Core rich pre-witness contract: complete; commits
  `286741d15..b6c85ad8f`; review clean.
- SDD ledger: Task 2B authority rebuild contracts: complete; commits
  `a5d66eba3..4318d26eb`; review clean.

### Task 2B runtime source-review authority-anchor checkpoint — 2026-07-14

The bounded runtime source-review anchor is independently approved for this
slice only. Implementation commits `762540ae5` and `b285cccb3` bind every rich
bundle source review to the fixed
`review/admission/sources/<sourceId>/current.json` pointer, exact hash-named
generation, and canonical byte/hash receipt; current-to-generation hash/path
drift and hostile mutations fail closed. Evidence/review:
`.superpowers/sdd/task-2b-source-review-anchor-report.md`.

Focused context/disposition tests pass **2 files / 14 tests** with one worker
and `NODE_OPTIONS=--max-old-space-size=2048`; SlopBrick typecheck, build, and
`git diff --check` pass. The canonical external admission root
`/Users/cheng/corpus-expansion/v10.3/review/admission` has no `sources` entry
(`test -e .../sources` is false; recursive `*/review/admission/sources*`
search returns zero paths), so production runtime resolution remains
fail-closed. The read-only diagnostic remains **329/329** registered/reviewed,
**452,382** quarantined/unrepresented, zero candidate/eligible units, with
blockers `static_authority_unavailable` and `witness_authority_unavailable`.

The ledger remains `98/178` continuation and `2/76` admission items. Task 2B
CLI `rebuild:pre-witness`, `static-authority:recover`, and `census:preview`,
byte-backed rebuild/recovery, census/witness/resource receipts, corpus
admission, and release gates remain open; no corpus or remote/release state
changed.

### Task 2B prebuilt byte-backed authority graph checkpoint — 2026-07-14

The bounded SlopBrick prebuilt graph validator is implemented and independently
approved at commits `136ad461a`, `383bf4c09`, and `f115bf7e6`; evidence is in
`.superpowers/sdd/task-2b-authority-rebuild-graph-report.md` and review is in
`.superpowers/sdd/task-2b-authority-rebuild-graph-review.md`. Focused Vitest is
**13/13**, with SlopBrick typecheck, build, and `git diff --check` green.

The pure fail-closed boundary requires exact top-level keys, canonical
proposal/input/static/current bytes, an all-or-nothing prior-current byte pair,
exact input/static receipt maps, and ordered per-source generation/current/
source-review/artifact maps. Core validates proposal → input → static →
current/prior relation joins; source IDs, paths, hashes, fixed review role, raw
byte sizes, and SHA-256 values are bound. It performs no filesystem, CLI,
corpus, publication, recovery, witness/context, or release I/O.

This remains a bounded prebuilt validator, not full Task 2B. The ledger stays
`98/178` continuation and `2/76` admission; `static_authority_unavailable` and
`witness_authority_unavailable` remain, and filesystem publication/recovery,
CLI, real receipts/corpus, witness/context authority, corpus admission, and
release gates are deferred. No corpus labels/bytes or remote/release state
changed.

### Task 2B symlink-safe prebuilt authority-graph loader checkpoint — 2026-07-15

The bounded filesystem reader is implemented and documented in
`.superpowers/sdd/task-2b-authority-rebuild-loader-report.md` at commit
`a13444fc3`; the review verdict is **APPROVE** in
`.superpowers/sdd/task-2b-authority-rebuild-loader-review.md`. It accepts only
the exact caller request (`projectRoot`, `proposalPath`, `inputGenerationPath`,
and optional `priorCurrentPath`), reads the fixed authority current pointer,
current-selected static generation, fixed per-source current pointers, and
declared generation-local or admission-root CAS receipt files. It performs no
directory discovery or mutation.

The loader normalizes the project root, rejects root symlinks and unsafe path
components, walks selected paths with `lstat`, reopens regular files using
`O_NOFOLLOW`, and checks realpath stability after the read. Strict canonical
UTF-8/no-BOM object bytes, exactly-one-LF source-review bytes, raw receipt maps,
and the existing pure graph validator's hash/length/join checks are preserved.
Focused loader tests pass **1 file / 7 tests**; SlopBrick typecheck, build, and
`git diff --check` pass, with only the existing non-fatal Zod declaration
warnings during build.

The post-commit package-wide SlopBrick run passes with one worker and a 2 GiB
heap cap: **311 files passed / 5 skipped; 3,578 tests passed / 9 skipped** in
249.28 seconds. This is a package-gate refresh, not full Task 2B or release
evidence.

This remains a bounded read-only loader, not full Task 2B. The ledger remains
`98/178` continuation and `2/76` admission; the read-only census remains
**329/329** registered/reviewed sources and **452,382** quarantined/
unrepresented units, zero candidate/eligible units, with blockers
`static_authority_unavailable` and `witness_authority_unavailable`. P2
immutable-root/TOCTOU and cross-platform POSIX `O_NOFOLLOW` policy follow-ups,
publication/recovery, CLI, static/witness/resource authority, corpus admission,
and release gates remain open. No corpus or remote/release state changed.

### Read-only external source-census replay — 2026-07-15

The built package-local CLI was replayed against the v10.3 project root
`/Users/cheng/corpus-expansion/v10.3`; passing the nested `review/admission`
directory is correctly rejected because the CLI expects the project root. The
exact replay exited 0 and wrote a **113,469-byte** receipt with SHA-256
`de0cd1879d14365b919c09bdd21bd5760a6804a0e3626d87abf37b78ad948857` and
evidence-context SHA-256
`9b3f8a4adcbb82ef4d97685be51264a1feb44ebf46584697df93511dad2f3089`.
It confirms **329/329** registered/reviewed sources, **452,382** selected and
unrepresented/quarantined units, **0** represented/candidate/eligible units,
and unchanged blockers `static_authority_unavailable` and
`witness_authority_unavailable`. This is an authority-deficit measurement;
it does not justify pulling more repositories. No corpus or remote state
changed.

### Task 2B pure authority-publication planner checkpoint — 2026-07-15

The fixture-scale pure planner is implemented at commits `3fadffe56`,
`b27ab684f`, and `5feb27aff`. It emits a Core-valid self-hashed lock,
transaction, and fixed `review/admission` path topology from explicit caller
metadata only; it performs no filesystem, discovery, mutation, CLI, corpus, or
release I/O. Replace planning requires an explicit prior input-generation
descriptor and exact parent SHA plus a static parent matching expected current;
create planning requires generation zero without a parent. Full SHA-256
transaction identities include caller-selected recovery nonces, and self-alias
ancestry is rejected. Focused tests pass **6/6**, independent review found no
P0/P1 issues, recursive typecheck passes, and the package-wide SlopBrick run
passes **312 files / 5 skipped; 3,584 tests / 9 skipped** in 284.26 seconds
with one worker and a 2 GiB heap cap. Build passes with the existing non-fatal
Zod declaration warnings. This is a planner-only checkpoint; filesystem
publication/recovery, CLI, authority generation, corpus admission, and release
remain open. No corpus or remote state changed.

### Task 2B fixture-scale authority publication/recovery checkpoint — 2026-07-15

The explicit-byte filesystem publication slice is implemented at `da15142fc`
and hardened after independent adversarial review at `ec85d754c`, with
boundary-fault normalization at `1b7b1bee1`. The
publisher/recovery API is intentionally fixture-scale: it accepts an already
validated graph and planner result, uses only the fixed `review/admission`
topology, and performs no corpus discovery, network, CLI, witness, or remote
I/O.

The implementation now has no-clobber regular-file writes, fsync boundaries,
staged-to-final renames, lock/transaction journals, expected-current CAS, and
last-write current-pointer promotion. Recovery validates lock/transaction
identity and selectors, planner/graph ancestry and source descriptor joins,
state-to-graph/tool joins, exact known bytes at every durable phase, and final
source/current pointers before cleanup. Unknown files in promoted generations
are preserved. Symlink/path substitution, current-pointer TOCTOU, unsupported
`overlap_generation_verified`, forged direct-plan paths, wrong nonces, and
tampered complete/promoted outputs fail closed. Explicitly acknowledged
lock-only journals and orphaned complete transactions are cleanable.

Focused authority/loader/validator/planner tests pass **4 files / 38 tests**;
SlopBrick TypeScript and diff-check pass. The latest package-wide one-worker
run is **313 files / 5 skipped; 3,596 tests / 9 skipped** in 245.32 seconds
with a 2 GiB heap cap. The package self-scan remains 7.2 AI Slop Score against
the 15 threshold; the three compression/Zipf/Heaps findings are default-off
audit diagnostics.

This does not close Task 2B. Source-proposal bytes and indexed tool-receipt
objects/snapshot-membership are intentionally outside this prebuilt graph
contract, so `complete` proves local publication only. The ledger remains
`98/178` continuation and `2/76` admission; the census remains 329/329
registered/reviewed, 452,382 quarantined/unrepresented, zero candidate/
eligible, with `static_authority_unavailable` and
`witness_authority_unavailable`. Next: source-proposal/approval and indexed
tool-receipt authority, operation-aware CLI/resource authority, real
static/witness context, then corpus admission/calibration. No corpus or
remote/release state changed.

### Task 2B indexed tool-authority resolver and read-only CLI checkpoint — 2026-07-15

The bounded next slice adds `resolveAdmissionToolAuthorityReceipt` to the
existing offline publication module and a strict `tool-authority:resolve`
command to `scripts/cal/v103-admission.ts`. The resolver reads the fixed
tool-authority root, current index, immutable parent chain, and every indexed
profile/intent/receipt object. It verifies canonical bytes, reference hashes,
Core profile/action/intent/receipt joins, exact receipt selectors, and derives
the current membership snapshot. An optional supplied snapshot is accepted
only when it is Core-valid and byte-for-byte equal to that derived projection;
hash-only metadata is not accepted as proof.

The CLI is read-only and operation-aware: it requires profile/action/intent,
receipt ID/hash, and authority-index SHA-256 selectors, permits only an
optional contained canonical snapshot path, emits one JSON proof, and returns
exit 2 for stale/mutated/forged selectors or mixed publication/recovery flags.
Focused resolver/CLI coverage is **2 files / 6 tests**; after rebuilding the
package-local CLI, the full bounded SlopBrick gate passes **315 files / 3,602
tests** (5 skipped files / 9 skipped tests) with one worker and a 2 GiB heap
cap. Recursive typecheck and build pass, with only the existing non-fatal Zod
declaration warnings; the existing publication/recovery, loader, graph, and
planner suites remain green and diff-check passes. The commit-hook self-scan is
**7.2 / 100**, under the 15 threshold, with two active compression/Zipf
audit-only diagnostics and no security findings. This does not implement the mutating
`rebuild:pre-witness` or `static-authority:recover` commands and does not
change corpus readiness: **329/329** sources reviewed, **452,382** units
quarantined/unrepresented, zero candidate/eligible, blockers
`static_authority_unavailable` and `witness_authority_unavailable`. Source
proposal/approval bytes and resource/static/witness joins remain next; no
corpus, remote, package, release, or deployment state changed.

### Task 2B source-proposal/approval byte materialization checkpoint — 2026-07-15

The bounded source-byte slice is implemented in the current worktree and
recorded in `.superpowers/sdd/task-2b-source-proposal-byte-report.md`.
Prebuilt graph validation now checks optional source-generation proposal and
approval object/byte pairs, Core self-hashes, source/generation/proposal joins,
artifact equality, create/replace CAS semantics, and the fixed independent-
review approval path/hash. Genesis-quarantine generations reject approval
bytes.

`loadPrebuiltAdmissionAuthorityGraph` has an explicit
`requireSourceProposalBytes` mode that reopens only the declared fixed proposal
path and fixed approval sibling, preserving symlink-safe containment and exact
canonical bytes. Publication/recovery requires proposal bytes for every source
and approval bytes for independent-review branches; it persists and rechecks
those siblings and rejects recovery when the caller omits them. Focused
validator/loader/publication coverage is **3 files / 36 tests**; recursive
typecheck/build and the package-wide one-worker gate pass (**315 files / 5
skipped; 3,606 tests / 9 skipped**, 2 GiB heap cap).

This is byte/path authority only. The independent-review fixture is explicitly
shape-only: candidate source-review disposition, blind assignment, two
reviewer decisions, blind-review receipt, and materialization authority remain
unresolved. Static-generation overlap/resource receipt relations and the
mutating rebuild/recovery CLI remain open. The census remains **329/329**
registered/reviewed, **452,382** quarantined/unrepresented, zero
candidate/eligible, with blockers `static_authority_unavailable` and
`witness_authority_unavailable`; no corpus or remote/release state changed.

Next: implement the semantic source-generation graph and reuse the existing
`verifyOverlapArtifactRelations` proof for the static-generation resource join;
then add the mutating CLI only after both are byte-backed and independently
reviewed.

### Task 2B semantic source authority and overlap-join checkpoint — 2026-07-15

The semantic source-generation slice is now byte-backed. A strict semantic
authority bundle carries the candidate source-review's blind assignment, two
reviewer decisions, blind-review receipt, and acquired or genesis
materialization authority. The bundle is self-hashed, canonical-byte checked,
validated through Core's source-generation graph, persisted beside the source
generation, reopened by the strict loader, and rechecked during publication
recovery. Independent-review publication rejects the earlier shape-only
approval fixture.

The static side now has a separate pure
`validatePrebuiltAdmissionAuthorityOverlapJoin` gate requiring exact static and
overlap generation bytes, all three overlap envelope object/byte pairs,
static-to-overlap input/generation joins, and complete indexed
`admission-static-ledgers-v1` / `authority:overlap` tool authority. It reuses
`verifyOverlapArtifactRelations` only for complete envelopes and does not use
opaque `primaryOutputSetSha256` metadata as resource proof.

Focused coverage is **4 files / 46 tests**; recursive typecheck/build and the
package-wide one-worker SlopBrick gate pass (**316 files / 5 skipped; 3,616
tests / 9 skipped**, 2 GiB heap cap). Existing build warnings and expected
fixture stderr remain non-fatal. The overlap join is intentionally standalone;
the legacy prebuilt publisher is still metadata-only until strict integration
and independent review are complete. No corpus, remote, release, or deployment
state changed. Census remains **329/329** reviewed sources, **452,382**
quarantined/unrepresented units, zero candidate/eligible, blockers
`static_authority_unavailable` and `witness_authority_unavailable`.

Next: wire the same strict overlap join into the byte-backed runtime admission
context with a complete overlap/tool-authority fixture, then add the mutating
CLI only after independent review; only after that replay real static/witness
context against the corpus.

### Task 2B strict static-overlap join and read-only CLI checkpoint — 2026-07-15

The strict static-overlap/resource join is now integrated at the read-only
`authority:overlap:verify` boundary behind the explicit
`--join-static-authority` flag. The default overlap verification path remains
unchanged and read-only; both a project root and its `review/admission` alias
are accepted. The opt-in requires the fixed
`admission-static-ledgers-v1` profile plus invocation-intent, receipt ID/hash,
and authority-index SHA-256 selectors. It reopens canonical static current,
static-generation, overlap-generation, and all three overlap-envelope bytes;
resolves indexed tool authority against the static snapshot, binds the static
generation hash and generation number to the current pointer, and invokes
`validatePrebuiltAdmissionAuthorityOverlapJoin`. Static/overlap generation,
snapshot, envelope, resource, byte, or selector drift fails closed with the
`overlap_static_authority_join:` prefix. Join selectors without the opt-in are
rejected, preventing an apparently successful default verification from being
mistaken for a full authority proof.

Focused strict CLI/overlap coverage is **2 files / 13 tests**. After rebuilding
the package-local CLI, the package-wide one-worker SlopBrick gate passes
**316 files / 5 skipped; 3,619 tests passed / 9 skipped** under a 2 GiB heap
cap. SlopBrick typecheck/build and `git diff --check` pass; only the existing
non-fatal Zod declaration warnings and expected worker-fixture stderr remain.
No corpus, label, manifest, remote, package, release, publish, or deployment
state changed. Census/readiness remains **329/329** reviewed sources,
**452,382** quarantined/unrepresented units, zero candidate/eligible units,
blockers `static_authority_unavailable` and `witness_authority_unavailable`.

This closes only the read-only CLI boundary. The legacy prebuilt publisher is
still metadata-only, and the proof is value/edge-level: declared static
artifact receipts are not opened, hashed, or existence-checked. The runtime
admission context does not yet have a complete materialized overlap/tool-authority fixture, and no mutating rebuild/recovery command is enabled. The
current read helper rejects symlink components, but check-then-open race
hardening and an atomic cross-object snapshot remain open. Next: build that
complete runtime fixture and route the context adapter through this proof,
obtain independent review, then implement the mutating adapter before replaying
real static/witness context or measuring a corpus deficit. Do not pull
repositories or promote labels while the census is blocked.

### Task 2B runtime overlap-authority context checkpoint — 2026-07-15

`buildVerifiedAdmissionContext` now consumes the strict static/overlap proof:
it follows the static generation's selected overlap hash, reads canonical
generation/index/resource/ledger bytes, resolves the indexed
`admission-static-ledgers-v1` / `authority:overlap` receipt, binds every
envelope back to the rich pre-witness bundle, and includes an immutable
overlap-authority proof identity in the branded context and `contextSha256`.

The runtime fixture publishes real core-contract and overlap authority objects
and materializes the hash-named overlap generation/envelopes. Focused context
and disposition coverage is **2 files / 15 tests** (13 + 2), including missing
envelope, resource tamper, and missing authority-index rejection. SlopBrick
typecheck and `git diff --check` pass. The evidence report is
`.superpowers/sdd/task-2b-runtime-overlap-context-report.md`; its independent
review result is pending before the slice is marked approved.

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

### Task 2B runtime authority-tree hardening checkpoint — 2026-07-15

Independent review identified and the implementation addressed the raw-vs-
semantic static receipt contract, incomplete selected-tree verification, and
hash-only input-generation edge. Core now keeps static artifact `sha256` as a
raw-byte receipt while semantic ledger/bundle hashes remain separate; focused
Core/rebuild/loader suites pass **8/8 + 26/26**. Runtime reads every declared
input/static/overlap artifact, rejects orphan/missing leaves, binds the overlap
current pointer, joins overlap universe/policy/normalizer hashes to the rich
bundle, and includes input/source proof hashes in the branded context.

The materialized fixture now contains source authorities, input generation and
artifacts, raw static receipts, overlap current/generation/envelopes, and real
tool-authority intent/receipt objects. Focused context/disposition coverage is
**2 files / 15 tests**; recursive gates are green: Core **226/226**, website
**38/38**, engine **59/59**, and SlopBrick **3,620 passed / 9 skipped** across
**316 passed / 5 skipped test files**. Recursive typecheck/build and
`git diff --check` pass. Runtime is
explicitly quarantine-only: independent-review source generations fail closed
until the mutating adapter loads `source-semantic-authority.json`. No corpus,
remote, release, publish, deployment, or label state changed; census remains
**329/329**, **452,382** quarantined/unrepresented, zero candidate/eligible,
blockers `static_authority_unavailable` and `witness_authority_unavailable`.

Remaining: release review, then the mutating adapter with a coherent snapshot
and candidate semantic-authority loading before real-corpus replay.

### Latest Task 2B candidate-aware mutating authority-rebuild adapter checkpoint — 2026-07-15

The fixture-scale library adapter is implemented in
`packages/slopbrick/src/calibration/v103/admission-authority-rebuild-adapter.ts`
and evidenced by `.superpowers/sdd/task-2b-runtime-adapter-report.md`. It
preflights the indexed `admission-static-ledgers-v1` /
`authority:overlap` tool chain against the static-generation snapshot before
mutation, then wraps publication/recovery with strict complete-boundary and
post-success graph reopens. Every reopened object and raw declared artifact
byte is compared to the supplied graph. Candidate `independent_review`
sources require their persisted semantic-authority sidecar; genesis-quarantine
sources remain sidecar-free. A recovery fault fixture and a mismatched indexed
receipt fixture prove the adapter's recovery/preflight boundaries.

The adapter also runtime-validates the fixed selector shape/values, the
in-memory graph self-hashes/byte pairs, and replace prior-current evidence
before the publisher can create a lock. The only caller-selected read path is
an admission-root-contained prior-current evidence path. Recovery of a journal
already at `complete` now invokes the adapter's strict hook before cleanup.

Focused coverage is **5 files / 53 tests**. SlopBrick typecheck/build and the
package-wide one-worker gate pass **317 files / 5 skipped; 3,627 tests passed /
9 skipped** under a 2 GiB heap cap. Existing Zod declaration warnings and
expected fixture stderr remain non-fatal. This is still a library-only
boundary: no CLI, corpus replay, repository acquisition, label promotion,
package/version, remote, release, publish, or deployment changed. The census
remains **329/329** reviewed sources, **452,382** quarantined/unrepresented
units, zero candidate/eligible, with blockers
`static_authority_unavailable` and `witness_authority_unavailable`.

The required explicit package-local self-scan was rerun as a diagnostic. It
analyzed 235 files with zero parse/timeout/crash/internal failures, but scored
AI Slop **17.3** against the configured 15 threshold (157 active low/medium
diagnostics, security 100/100 with zero security findings). Its previous
baseline was rejected for a config-hash mismatch; no new baseline was
accepted. This is a follow-up refactor/calibration-policy item, not a passing
release self-scan.

Limits remain explicit: the runtime context still owns the complete overlap
generation/envelope join; reopens are sequential rather than one atomic
cross-object snapshot; and the existing publisher still writes proposal and
input-generation finals before later transaction-owned promotions. Independent
review is the next gate, followed by a mutating CLI only after approval, then
real-corpus replay.

### Current control-plane and self-scan audit — 2026-07-15

The fresh read-only audit is now the current handoff truth. The centralized
v10.3 corpus spans about 3.8 GiB; its `sources` tree has **11,127** regular
non-`.git` source-tree files, with **317** pinned checkout records (**225** declared AI and **92**
declared human) whose paths and Git heads match their inventory. This proves
checkout integrity only; no labels are verified. The 329-entry genesis register
and 329 reviews replay deterministically, but all **452,382** selected units
remain quarantined/unrepresented, with zero candidate/eligible units. Static
authority, witness authority, source-generation authority, and overlap current
trees are absent; the correct source census and genesis replay both fail closed
with `static_authority_unavailable` and `witness_authority_unavailable`.

The explicit package-local self-scan analyzed **235/235** files without runtime
failures, but scored **17.2869** against the configured 15 policy threshold:
157 active low/medium findings, security 100/100, hygiene 99.5168, and
repository health 92.9403. The baseline was rejected for a config-hash
mismatch. This is a policy diagnostic, not a passing release scan; the broad
compression signal requires an authoritative v10.3 precision/FPR decision and
must not drive cosmetic source refactors.

The CLI audit found no `rebuild:pre-witness`, `static-authority:recover`, or
`census:preview` parser/dispatch and no documented proposal/static-generation
or real-scale receipt flags. The adapter remains a fixture-scale library
boundary and its nested `authority:overlap` receipt cannot stand in for the
outer rebuild authority. The next implementation must add an explicit,
fully-materialized, fail-closed outer transaction/receipt with fixture tests;
parser-only wiring and placeholder ledgers are out of scope. No corpus labels,
repositories, manifests, package versions, remotes, releases, publishes, or
deployments changed.

### Current bounded verification update — 2026-07-15

The current slice uses risk-scaled verification. The planned
`rebuild:pre-witness` and `static-authority:recover` commands are now strict,
parser-visible, and fail closed with structured `authority_cli_unavailable`
before filesystem access; they do not wire a fixture overlap receipt into the
outer real-corpus rebuild. CLI boundary tests pass **10/10**, brief-renderer
contract tests pass **12/12**, and the SlopBrick package typecheck passes.

The full-load watch failure was a test synchronization race: health persisted
before report rendering, while the test treated health as a render-complete
signal. The watch test now waits for the expected output content and the full
watch-mode file passes **45/45** serially. This does not close admission.
Atomic temp-file report publication remains a separate hardening item; it is
not being expanded into this boundary slice. The prior full package run had
316/321 test files passing with that race as the only remaining failure after
the stale source-map issue was rebuilt; a stable full recursive gate remains a
commit/release checkpoint.

### Current Task 2B bounded slice — 2026-07-15

Candidate-aware runtime context is now exercised with a positive
`independent_review` source and missing/tampered semantic or approval
sidecars (**2/2**). The context validates the canonical source proposal,
approval, blind assignment/decisions/receipt, semantic graph, and exact
generation-local semantic-authority bytes; genesis-quarantine sources remain
sidecar-free and candidate bytes contribute to the source-authority proof.

`census:preview` is implemented as canonical stdout-only, non-persisting
preview and has a 329-source fixture proving canonical output, strict selector
requirements, unknown-option rejection, and no root mutation (**3/3**).
`rebuild:pre-witness` and `static-authority:recover` remain explicit parser
boundaries only: they reject nested/option-leaking invocations and return
structured `authority_cli_unavailable` before filesystem access. The outer
mutating graph materializer and recovery transaction are still open.

Report JSON/HTML/heatmap files now publish through a unique sibling temp file
and rename; watch filtering treats those temps as scanner-owned. Brief output
separates incomplete runtime failure from policy-threshold failure and shows a
bounded active-rule breakdown. The full pretty headline now also shows an
explicit `[POLICY PASS]` or `[POLICY FAIL]` marker beside the absolute slop
band, so a green `LOW` band cannot be mistaken for a passing configured gate.
Renderer UX/contract tests pass 71/71 in the focused pair (the broader
renderer/heatmap slice remains 25/25),
watch-mode passes 45/45 serially, SlopBrick typecheck/build pass with only the
existing non-fatal Zod declaration warnings, and `git diff --check` passes.
The stable recursive workspace gate also passes: Core 226/226, engine 59/59,
website 38/38, and SlopBrick 318 passed / 5 skipped test files with 3,635
passed / 9 skipped tests; recursive typecheck and build are green. Fixture-only
stderr remains non-fatal.

No real-corpus authority, label, repository, manifest, release, publish, or
deployment state changed. The live corpus remains 0 candidate / 0 eligible
with `static_authority_unavailable` and `witness_authority_unavailable`.
