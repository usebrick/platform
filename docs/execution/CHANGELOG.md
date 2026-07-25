# Execution planning changelog

This is an append-only history of roadmap and plan-control changes. Product
release notes remain in package changelogs.

## Revision 74 — 2026-07-25

### Local checkpoint authority

- Recorded the trusted owner's option `1` as authorization for exactly one
  local Conventional Commit containing the already qualified private MEM-001
  Slices A-C implementation, tests, decisions, receipts, and synchronized
  documentation.
- Bound that authority to base commit
  `a0c29dd37dc024425336c03f98b1c6aa360c191a` and the Revision 73 Slice C
  receipt. The containing commit is the local checkpoint; no self-referential
  commit SHA is embedded in its own content.
- Updated mutable roadmap, architecture, status, plan, product, and repository
  documentation from the pre-commit `uncommitted` state to the locally
  checkpointed, unshipped state. Historical Slice A/B/C decision records remain
  unchanged and retain their original narrower authority.

### Boundary

- This decision does not authorize push, merge, tag, release, publication,
  deployment, public API/schema/CLI expansion, filesystem acquisition,
  source-code parsing, durable Memory, live agents, or broader efficacy and
  market claims.

## Revision 73 — 2026-07-25

### Slice C implementation and correction

- Added one package-private, value-only Memory M0 renderer in Engine: one
  target-independent 2,048-byte complete-row selection, bounded descriptive
  Codex/Claude/Copilot previews, omission sidecars, rendered-text byte counts
  and SHA-256, and recursively frozen output.
- Added one Engine test-only harness over exactly the committed
  3-fixture/9-task/27-cell vector. No caller-authored suite evaluator, public
  facade, export-map entry, schema, command, package, or durable store was
  added.
- Reproduced the first targeted review's caller-freeze defect with a failing
  regression, then cloned every selected assertion/key/evidence and omitted key
  before freezing returned values. Two fresh blind reviews returned PASS at
  96/100 and 98/100 with no must-fix or should-fix finding; scores remain
  advisory.

### Local qualification

- Passed the 10/10 focused Slice C matrix and Engine typecheck on Node
  22.22.3/`C` and Node 24.15.0/`de_DE.UTF-8`; current package suites passed at
  Core 288/288, Website 54/54, and Engine 150/150.
- Independently reconstructed all three exact artifacts and all 27 reducer
  cells; preserved artifact JCS SHA-256
  `874e1b8bf3b671f63f01dd9d1d3009e6e79c7f004e07901e92a8f57f7d521506`
  and result JCS SHA-256
  `5aedb337d082714eb070535806f154a7b5a80b45fe0468739c2a830f7319eafc`.
- Passed recursive typecheck/build and a 303/303 package-local no-telemetry
  self-scan without creating a baseline. The complete SlopBrick suite had an
  earlier 4,603-pass/18-skip run; post-correction aggregates exposed rotating
  unrelated publication, watch-poll, and performance timing assertions, each
  passing alone. The final one-worker aggregate and isolated timings are
  recorded without changing unrelated scanner code.

### Control-plane closeout

- Marked `MEM-001` `done` and synchronized the ADR, acceptance contract,
  roadmap, architecture, root/package documentation, extraction boundary,
  positioning impact, TEL handoff, status, execution index, and Slice C
  receipt to the complete private M0 boundary.
- Classified the result only as deterministic local fixture conformance.
  MemoryBrick remains planned and unshipped; filesystem/source adapters,
  durable Memory, live agents, efficacy or market claims, commit, push, merge,
  release, publication, and deployment remain separately gated.

## Revision 72 — 2026-07-25

### Authority

- Recorded the trusted owner's explicit `continue` instruction as **Accept
  Slice C** for `MEM-001` after the green Slice B receipt.
- Cleared `OWNER-MEM-M0-SLICE-C-DECISION` through
  `docs/execution/evidence/MEM-001-slice-c-owner-decision.json` before Slice C
  product-code changes.

### Authorized implementation boundary

- Authorized only `M0-R01` through `M0-C01` plus the cross-slice `M0-S02`,
  `M0-H01`, and `M0-L01` checks: one target-independent bounded selection,
  three value-only descriptive previews, and one private harness over the
  committed 3-fixture/9-task/27-cell vector.
- Authorized red-first focused tests, Node 22/24 validation, recursive
  workspace qualification, independent golden reconstruction, package-local
  self-scan, one advisory review, and a separate Slice C receipt.
- Kept filesystem acquisition, source-code parsing, providers, persistence,
  native-file writing, arbitrary-suite evaluation, public APIs/commands/
  schemas, commit, push, merge, release, publication, and deployment
  unauthorized.

### Next action

- Implement the smallest exact Slice C surface, qualify it locally, record its
  evidence, and stop before integration or public action.

## Revision 71 — 2026-07-24

### Slice B implementation

- Added package-private canonicalization, fact compilation, and immutable
  projection modules inside Engine without changing Structure v5, package
  facades, export maps, schemas, CLI commands, or releases.
- Implemented exactly four declared package fact families with ASCII grammar
  checks, exact JSON-pointer evidence, deterministic equal-value merge,
  conflict-only ambiguity, named semantic comparators, recursive freezing, and
  the three authorized Slice B SHA-256 preimages.
- Added 31 focused tests covering extraction, recognized-field failures,
  grammar boundaries, evidence, conflicts, shuffled/repeated runs, JCS,
  digest reconstruction, the exact 135-candidate constructor, and the
  235,370-byte conservative projection proof.

### Qualification and review

- Passed all 31 focused tests under exact Node 22.22.3 with `LC_ALL=C` and
  Node 24.15.0 with `LC_ALL=de_DE.UTF-8`, plus Engine typecheck on both
  runtimes.
- Passed full Engine 140/140 and Core 288/288 tests, both package typechecks
  and builds, Core contract/schema freshness, public-surface checks, and
  `git diff --check`.
- One independent read-only advisory review returned **APPROVE** with no
  blocker. The controller removed its one noted unlisted behavior—duplicate
  package-name rejection—and reran all affected gates green.
- Recorded the complete local, uncommitted proof in
  `docs/execution/evidence/MEM-001-local-m0-slice-b.md`.

### Boundary and next action

- Marked `MEM-001` `ready` behind
  `OWNER-MEM-M0-SLICE-C-DECISION`; implementation WIP returns to `0/2`.
- Slice C, commit, push, merge, release, publication, deployment, filesystem
  acquisition, source-code parsing, providers, persistence, and live
  experiments remain unauthorized.

## Revision 70 — 2026-07-24

### Authority

- Recorded the owner's explicit `authorized slice b` instruction as **Accept
  Slice B** for `MEM-001` after the green Slice A receipt.
- Cleared `OWNER-MEM-M0-SLICE-B-DECISION` through
  `docs/execution/evidence/MEM-001-slice-b-owner-decision.json` before Slice B
  product-code changes.

### Authorized implementation boundary

- Authorized only `M0-F01` through `M0-L01`: extraction of four declared
  package fact families, exact evidence and ASCII grammars, deterministic
  equal-value merge and visible conflict preservation, named comparators,
  immutable projection, three documented Slice B hash preimages, and bound
  drift assertions.
- Authorized focused failing tests, local Node 22/24 validation, one advisory
  review, and a separate Slice B receipt.
- Kept Slice C, filesystem acquisition, source-code parsing, providers,
  persistence, outbound telemetry, public exports/commands/schemas, commit,
  push, merge, release, publication, and deployment unauthorized.

### Next action

- Implement the smallest exact Slice B surface, qualify it locally, record its
  evidence, and stop before Slice C.

## Revision 69 — 2026-07-24

### Authority

- Recorded the trusted owner's `1` selection as **Accept Slice A** for
  `MEM-001` after Revision 68 validation.
- Cleared `OWNER-MEM-M0-DECISION` through
  `docs/execution/evidence/MEM-001-owner-decision.json` before any product-code
  change.

### Authorized implementation boundary

- Authorized only `M0-S01` through `M0-P02`: private Core profile/types and
  module-owned registry, plus pure Engine registration validation, defensive
  byte copying, and bounded package-JSON parsing.
- Authorized focused tests, local Node 22/24 validation, one advisory review,
  and a local Slice A evidence receipt.
- Kept Slice B, Slice C, filesystem acquisition, source-code parsing, live
  providers, persistence, outbound telemetry, commit, push, merge, release,
  publication, and deployment unauthorized.

### Slice A implementation

- Added the private Core `memory-m0-v2` profile, trusted request types, and
  exact recursively frozen registry-v2 constant without changing Structure
  v5, package exports, public entrypoints, or CLI commands.
- Added a package-private pure Engine boundary for root/package-manifest
  registration, lexical path and count checks, per-source and aggregate byte
  admission, defensive byte copying, fatal UTF-8, BOM rejection, and iterative
  duplicate-key-rejecting JSON parsing.
- Split tokenizer, iterative parser, and admission responsibilities into small
  modules and added 3 focused Core tests plus 49 focused Engine tests covering
  every Slice A requirement and adjacent bounds.

### Qualification and review

- Passed the focused Core 3/3 and Engine 49/49 suites and both package
  typechecks on exact Node 22.22.3 and 24.15.0 binaries.
- Passed the current full Core suite at 288/288 and full Engine suite at
  109/109, Core contract freshness and schema validation, both package builds,
  the public-surface base-diff check, and `git diff --check`.
- One independent read-only adversarial review returned **APPROVE** with no
  blocking finding under the four-part requirement rule. Three residual
  evidence/immutability notes remain advisory and are recorded in the local
  receipt rather than widening Slice A.
- Recorded the complete local, uncommitted qualification at
  `docs/execution/evidence/MEM-001-local-m0.md`.

### Next action

- Preserve the locally qualified Slice A boundary and await an explicit owner
  disposition to authorize Slice B, revise Slice A through a reproducible
  named-requirement failure, or hold `MEM-001`.
- Keep commit, push, merge, release, publication, deployment, filesystem
  acquisition, source-code parsing, and live experiments unauthorized.

## Revision 68 — 2026-07-24

### Authority

- Recorded the owner's option 1 selection as authority to replace MEM-001's
  repeated generic review-score loop with a focused executable process.
- This authority covers one documentation/process reset, full affected-doc
  convergence, local validation, and a stop for the next owner decision. It
  does not authorize product implementation, review, commit, push, merge,
  release, publication, deployment, source-code parsing, filesystem
  acquisition, or a live experiment.

### Focused contract

- Added `memorybrick-m0-acceptance.md` as the sole active human-readable
  behavioral contract: 20 stable requirement IDs, an executable verification
  for every row, and ownership by one of three implementation slices.
- Kept the ADR as scope/rationale and retained registry v2 plus the exact
  3-fixture/9-task/27-cell vector as fixed test data.
- Reclassified the Revision 67 compiler, renderer, benchmark, and research
  documents as historical design references. They remain readable evidence but
  cannot add unlisted requirements or override the focused matrix.
- Narrowed the private trust boundary to trusted UseBrick request containers
  holding untrusted repository JSON bytes. Public `unknown`, hostile
  `Proxy`/accessor/cross-realm, caller-authored registry, and arbitrary-suite
  admission contracts are no longer M0 requirements.

### Execution and review reset

- Split later implementation into Slice A profile/parser, Slice B
  compiler/projection, and Slice C previews/exact-vector integration. Each
  starts from focused failing tests and receives its own checkpoint.
- Retired the two-reviewer `94/100` AND-gate. Reviewer scores are advisory. A
  finding blocks only when it names an active requirement, supplies a
  reproducible failing input/test/proof, demonstrates an in-scope consequence,
  proposes the smallest correction, and is reproduced by the controller.
- Made `OWNER-MEM-M0-DECISION` the only pre-implementation authority after
  Revision 68 validation. The next owner choice is **Accept** Slice A,
  **Revise** the focused matrix, or **Hold** MEM-001.

### Boundary

- The deterministic package-fact, conflict, preview-warning, exact-vector, and
  fixture-conformance outcomes remain proposed. Structure v5, public APIs,
  package exports, commands, and product code are unchanged.

### Validation

- `corepack pnpm plans:validate` passed: 18 plans, implementation WIP `1/2`,
  company WIP `0/1`.
- `corepack pnpm exec node --test scripts/validate-execution-docs.test.mjs`
  passed all 21 tests, and `corepack pnpm positioning:validate` passed all 12
  positioning tests.
- The execution index, registry v2, and benchmark vector v2 parsed as JSON; the
  focused matrix contained exactly 20 unique requirement IDs spanning slices
  A/B/C; and all 139 local targets across 18 changed Markdown files resolved.
- `git diff --check` and the changed-file trailing-whitespace scan passed.

## Revision 67 — 2026-07-24

### Authority

- Recorded the owner's `continue` instruction as **Revise** authority for one
  bounded documentation-only correction of the complete Revision 66
  four-must/four-should union, local validation, and one new freeze.
- This authority includes no implementation, another review, source-code
  parser, filesystem adapter, live experiment, commit, push, merge, release,
  deployment, or publication. **Accept** remains unavailable.

### Complete must-fix closure

- Replaced unbounded caller-controlled `Reflect.ownKeys` exact-shape admission
  with fixed expected-field descriptor views. Captured intrinsics inspect only
  named own descriptors; expected fields must be enumerable data descriptors;
  ordinary reads, spread, iteration, and own-key enumeration are forbidden;
  arbitrarily many extra string/symbol/accessor properties are inert.
- Capped a source array from its intrinsic own length data descriptor before
  requesting any numeric index descriptor. Every visited index must be an own
  enumerable data descriptor and only `descriptor.value` is consumed, so holes
  and indexed accessors fail without invocation.
- Replaced the malformed manifest-path ABNF with explicit lowercase/digit
  terminals, required grouping, a 63-byte continuation, exact regex
  equivalence, and 14–256-byte whole-path bounds. Required vectors cover each
  initial class plus segment/path adjacent boundaries and forbidden forms.
- Removed unreachable public `assertion-limit` and `projection-limit` results
  and their fictitious first-overflow vectors. Exact executable proofs establish
  `7 + 64*2 = 135` candidates and a deliberately conservative 235,370-byte JCS
  projection, 26,774 bytes below the unchanged 262,144-byte defensive ceiling.

### Complete should-fix closure

- Defined prototype-safe bounded JSON objects as private maps with
  duplicate-before-insert and exact intrinsic `has`/`get` extraction.
  `__proto__`, `constructor`, `prototype`, and polluted ambient prototypes have
  no inherited or prototype-setting behavior.
- Closed the exact inspection order and phase-local exception attribution.
  Caller-container reflection maps to `invalid-input`; registry admission is
  reference identity only and maps mismatch to `invalid-registry`; no
  caller-authored registry tree is traversed.
- Made conflict and payload-budget omission visible in every preview with the
  fixed text-only warning `Facts may be omitted for conflict or payload budget.
  This preview may be incomplete.` Exact omission sidecars remain unchanged.
- Required base64url alphabet/remainder/unused-bit validation, arithmetic
  decoded lengths, and per-field plus saturating aggregate decoded caps before
  any decoded-buffer allocation. Re-encoding equality remains a post-decode
  assertion; native ClaimKey markers use the same preflight.
- Applied the same reachability audit to the exact benchmark and removed its
  impossible `result-limit` invalid reason. The fixed 14,570-byte conservative
  result envelope remains a mandatory executable drift proof under the
  unchanged 131,072-byte defensive ceiling.

### Exact vector and documentation convergence

- Updated only the nine expected preview texts, byte counts, and text hashes in
  the pinned vector. Its new identity is 103,296 raw bytes at
  `08eef8255613d7e84614ff49a221debb6834da4fd3cf1dc07f360dc243569dde`
  and 61,257 JCS bytes at
  `85e113094aef6f7612373b1c3ef7e17e7346ecefdef3078a2cc2dc4f72ca234b`;
  expected-artifact JCS is 43,112 bytes. The registry domain hash, source and
  projection values/hashes, selections, exact omission sidecars, tasks, native
  markers, 27 cells, 9,144-byte golden result, and golden hash remain unchanged.
- Recomputed empty wrappers at 451/452/453 bytes and maximum previews at
  2,499/2,500/2,501 bytes, all below 4,096.
- Synchronized the ADR, compiler, renderer, benchmark, vector, research report,
  MEM-001 plan, roadmap, root README, architecture, extraction boundary,
  SlopBrick package/Repository Structure docs, website lifecycle note,
  positioning impact, execution status, and execution index. Historical review
  packets and their exact hashes/counts remain unchanged as history.
- Added primary-source grounding from ECMAScript's `Reflect.ownKeys` and
  `Object.getOwnPropertyDescriptor` algorithms, RFC 5234 precedence/grouping,
  and RFC 4648 canonical unused-bit rules.

### Validation and freeze

- Passed plan validation at implementation WIP `1/2` and company WIP `0/1`, all
  21 execution-document tests, all 12 positioning tests, JSON parsing,
  changed-document local-link checks, `git diff --check`, and the trailing-
  whitespace scan.
- Independently reconstructed every source fact, conflict, projection/hash,
  target-independent selection, omission, preview byte/hash, native marker,
  27-cell reduction, and unchanged golden result from the committed vector.
  Canonical base64url preflight, exact path admission, vector/JCS identities,
  135/235,370/14,570 proofs, and 451/452/453 wrappers all match the contracts.
- Froze one corrected documentation packet after final ledger synchronization.
  No implementation/package test, reviewer verdict, or public/git action is
  claimed.

## Revision 66 — 2026-07-24

### Authority and review integrity

- Recorded the owner's `start again` instruction as authority for exactly one
  fresh blind dual review over the frozen Revision 65 packet. It authorized no
  correction, implementation, filesystem adapter, source-code parser, live
  experiment, commit, push, merge, release, deployment, or publication.
- Both reviewers independently matched branch `codex/mem-001-adr`, base
  `a0c29dd37dc024425336c03f98b1c6aa360c191a`, all 20 regular non-link files,
  495,458 total bytes, and packet fingerprint
  `2b541eb69ec2e99da337a93ed7101f0a9dcec488abcf7b2b287251700a550d0d`
  before and after review. The controller independently reproduced the same
  post-review identity before recording this revision.

### Review result

- Reviewer A scored 80/100 with two must-fix and three should-fix findings.
  Reviewer B scored 84/100 with three must-fix and three should-fix findings.
  Both returned `REQUEST CHANGES`; the strict 94-plus/zero-must-fix AND gate
  failed.
- Both independently passed plan validation, all 21 execution-document tests,
  all 12 positioning tests, JSON parsing, `git diff --check`, and whitespace
  checks. Both independently reproduced the exact raw/JCS/vector/registry,
  projection/render, native-marker, 3/9/27 reducer, golden-result, wrapper, and
  14,570-byte preflight evidence. Mechanical and artifact consistency does not
  establish contract readiness.
- Controller probes independently reproduced an accessor-backed dense array
  satisfying the written key/prototype conditions, a 100,003-own-key record
  that forces complete `Reflect.ownKeys` materialization, the malformed path
  grammar, and the exact 135-row semantic maximum below attempted row 257.

### Reconciled findings

- Reconciled four must-fix domains: remove unbounded caller-controlled
  `Reflect.ownKeys` enumeration before applicable caps; require and consume
  own enumerable data descriptors for every admitted array index without
  invoking accessors; correct the manifest-path grammar so the normative
  contract admits its exact vector; and make every required candidate/projection
  limit and first-overflow vector reachable, or remove/retune the unreachable
  errors and obligations with an exact proof.
- Reconciled four should-fix domains: define prototype-safe bounded-JSON object
  materialization and own-member lookup for `__proto__`, `constructor`, and
  related names; close phase-local reflective-operation order and exception
  attribution; make payload-budget omission visible through deterministic text
  or a required consumer presentation contract; and check canonical base64url
  decoded lengths and aggregate caps before decoded-buffer allocation.
- Neither reviewer reported a consideration. A lower-severity duplicate about
  unreachable `assertion-limit` was subsumed by the stricter combined limit
  domain.

### Authority

- **Accept** and implementation remain unavailable. Authority returns to the
  owner: **Revise** may authorize one bounded documentation-only correction of
  the complete Revision 66 union, local validation, and one new packet freeze;
  **Hold** parks MEM-001. Another review is not automatic.
- This revision records review outcome only. The six Revision 65 proposal
  artifacts, including the exact vector and registry, remain byte-unchanged.
  No schema, compiler, renderer, benchmark harness, product code, git/public,
  release, or deployment action was taken.

## Revision 65 — 2026-07-24

### Authority

- Recorded the owner's option 1 choice after Revision 64's failed 77/78 blind
  review. It authorizes exactly one documentation-only correction of the
  complete five-must-fix, four-should-fix, one-consideration union, followed by
  local validation and one newly frozen packet.
- It does not authorize another reviewer pair, schema/compiler implementation,
  static source parsing, filesystem acquisition, live clients/providers,
  commit, push, merge, release, deployment, publication, or any other public
  action. A review requires a fresh owner choice after freeze; **Accept** remains
  unavailable.

### Research-backed scope correction

- Reproduced the decisive totality failure: exact local `typescript@5.9.3` on
  Node 24.15.0 throws `RangeError` for a valid 1,409-byte source containing 700
  nested parentheses under the default stack, while the same bytes return zero
  diagnostics under `--stack_size=8192`. The official TypeScript Compiler API
  describes AST construction but supplies no M0-compatible host-stack/resource
  guarantee.
- Removed JavaScript/TypeScript/static-module extraction from M0 rather than
  masking host-dependent behavior with exception mapping. The active source
  surface is now root/package-manifest JSON only, parsed by one iterative
  duplicate-key-rejecting algorithm with exact byte, depth, and token caps.
- Consulted official Node `util.types` documentation, the TypeScript Compiler
  API, RFC 8785, RFC 8259, WHATWG Encoding, RFC 4648, and CommonMark. Separated
  RFC 8785 object-property order from named semantic comparators and replaced
  the previous NFC/Unicode-version surface with strict ASCII semantic grammars.

### Complete finding closure

- Closed all five must-fix domains: compiler phase 3 checks intrinsic source
  count before any element traversal; static parsing is removed; every source,
  evidence, value, key, and benchmark order binds to a named comparator or
  explicit enum; registration and predicate-specific ClaimKey grammars are
  complete; and only one reviewed exact 3-fixture/9-task/27-cell vector can
  produce a claim-bearing benchmark result.
- Closed all four should-fix domains: successful projection graphs are
  recursively readonly/frozen with module-private `WeakSet` capability
  membership; the benchmark has one synchronous pure entry point and snapshots
  the entire input; a streaming conservative JCS preflight precedes result-cell
  allocation and valid/invalid result shapes are disjoint; and exact
  proxy/record/array/byte-view, bounded JSON, and recognized parent/leaf tables
  close runtime behavior.
- Resolved the NFC consideration by allowing only exact 7-bit ASCII semantic
  IDs, paths, keys, pointers, values, and labels. Ignored source JSON may contain
  other valid UTF-8, but no host normalization/category data enters an M0 result.

### Exact vector and evidence boundary

- Added `memorybrick-m0-benchmark-vector-v2.json`: 102,801 reviewed raw bytes,
  three fixed fixtures, three tasks per fixture, three targets per task,
  non-empty required/forbidden/native evidence, all four predicates, both
  conflict and payload-budget negative controls, and complete expected
  projection/renderer values for every fixture.
- Bound the evaluator to exact vector bytes, exact registry domain hash, strict
  base64url/native marker evidence, a 131,072-byte conservative result
  preflight, and one golden 27-cell result. Mutated or implementation-authored
  suites can return only `invalid`, never `pass` or `fail`.
- Kept the claim narrow: a pass is deterministic fixture conformance, not agent
  efficacy, real-repository value, market validation, owner acceptance,
  implementation authority, or release evidence.

### Documentation convergence

- Synchronized the ADR, compiler, renderer, benchmark, registry, exact vector,
  research report, MEM-001 plan, roadmap, root README, architecture, future
  extraction boundary, package README/Repository Structure guide, website
  lifecycle note, positioning impact, execution status, and execution index.
- Preserved all historical failed-review records as history; current authority
  comes only from Revision 65's active six-artifact proposal and live execution
  control plane.

### Validation and freeze

- Passed `corepack pnpm plans:validate` with 18 plans at implementation WIP
  `1/2` and company WIP `0/1`; all 21 execution-document tests and all 12
  positioning tests passed. JSON parsing, local-link checks, `git diff --check`,
  and the changed-document trailing-whitespace scan are green.
- Independently recomputed the exact registry/vector/JCS/golden hashes and
  counts. The vector is 102,801 raw bytes, 60,762 JCS bytes, 6,949 JSON tokens,
  depth 10, and 42,617 expected-artifact JCS bytes, all within the pinned caps.
- Independently reconstructed every source fact, conflict, projection hash,
  target-independent selection, omission, preview byte count/text hash, native
  marker, 27-cell reducer result, and the 14,570-byte conservative result
  preflight. Empty wrapper bytes remain 396/397/398 and maximum preview bytes
  remain 2,444/2,445/2,446.
- Froze one corrected documentation packet after final ledger synchronization.
  No implementation or package test is claimed because no product code exists
  in this slice. No reviewer verdict is claimed and no public/git action was
  taken.

## Revision 64 — 2026-07-23

### Authority and review integrity

- Recorded the owner's `start` instruction as authority for exactly one fresh
  blind dual review over the frozen Revision 63 packet. It authorized no
  correction, implementation, filesystem adapter, live experiment, commit,
  push, merge, release, or deployment.
- Both reviewers independently matched base
  `a0c29dd37dc024425336c03f98b1c6aa360c191a`, all 17 regular non-link files,
  393,385 total bytes, and packet fingerprint
  `733f91a89c01ea0ab7970b05beb5b9f3f2d39b75863e43b572ab39e78573c4fc`
  before and after review. The controller independently reproduced the same
  post-review identity before recording this revision.

### Review result

- Reviewer A scored 77/100 with four must-fix findings, four should-fix
  findings, and one consideration. Reviewer B scored 78/100 with four
  must-fix findings, four should-fix findings, and one consideration. Both
  returned `REQUEST CHANGES`, so the strict 94-plus/zero-must-fix AND gate
  failed.
- Both independently passed plan validation, all 21 execution-document tests,
  all 12 positioning tests, JSON parsing, `git diff --check`, and packet
  identity checks. Mechanical green does not establish contract readiness.
- A controller-side read-only probe reproduced the parser blocker: exact
  `typescript@5.9.3` on Node 24.15.0 threw `RangeError` for a valid 1,409-byte
  source with 700 nested parentheses under the default stack, while the same
  bytes returned zero diagnostics with `--stack_size=8192`. A second probe
  confirmed that allowed U+E000 and U+10000 strings reverse order between
  JavaScript's default UTF-16 comparison and the contract's UTF-8 tuple order.

### Reconciled findings

- Reconciled five must-fix domains: enforce the source-count cap before any
  unbounded element traversal and publish the resulting phase precedence; make
  static-module parsing total and host-independent through an exact bounded
  syntax admission rule or remove it from M0; bind every source, evidence,
  value, identifier, and benchmark sort to named executable comparators; define
  complete registration-path and predicate-specific `ClaimKey` subject/slot
  grammars; and prevent a vacuous benchmark pass with a reviewed normative
  fixture/task inventory or equivalent closed non-vacuity requirements.
- Reconciled four should-fix domains: make the branded projection recursively
  immutable or define a closed renderer failure; define one synchronous pure
  benchmark entrypoint and a complete immutable input snapshot; specify the
  exact result-preflight equation and discriminated valid/invalid result
  variants; and close runtime object/array/byte-view plus recognized JSON
  container and top-level TypeScript AST edge states with executable tables.
- Recorded one consideration: pin NFC normalization data and version-skew
  vectors as explicitly as the Unicode 17.0.0 General_Category table.

### Authority

- **Accept** remains unavailable. Authority returns to the owner: a new trusted
  **Revise** may authorize one bounded correction of the complete Revision 64
  finding union and define a later review, while **Hold** parks MEM-001. No
  correction or review is automatic.
- This revision records review outcome only. The five normative Revision 63
  artifacts and supporting research remain byte-unchanged. No schema,
  compiler, renderer, benchmark harness, product code, commit, push, merge,
  release, or deployment is added.

## Revision 63 — 2026-07-23

### Authority

- Recorded the owner's new trusted **Revise** after Revision 62's failed 84/81
  review. This authority covers one research-backed correction of the complete
  finding union, local documentation validation, and one packet freeze.
- It does not authorize a reviewer pair, schema/compiler implementation,
  filesystem adapter, live client/provider experiment, commit, push, merge,
  release, or deployment. A later review requires a fresh owner instruction;
  **Accept** remains unavailable until the strict review gate passes.

### Research-backed scope correction

- Consulted official Node filesystem and Node-API documentation, POSIX
  `openat`, Linux `openat2`, Windows `CreateFile`, RFC 8785 and RFC 4648,
  WHATWG Encoding, Unicode UAX 9/UTS 55, CommonMark, and the TypeScript Compiler
  API. The sources show that race-resistant component-relative acquisition is
  a platform/native subsystem, not one portable Node adapter contract.
- Removed filesystem discovery, root/handle acquisition, stable double reads,
  physical identity, alias policy, and fixture-file rebinding from M0. The pure
  compiler now stops at explicit registrations beside attached non-shared byte
  arrays and privately copies admitted bytes. A future acquisition adapter
  requires its own plan, ADR, supported-platform matrix, and review.

### Finding closure

- Split compiler `source-limit` into globally ordered source-count,
  per-source-byte, and aggregate-byte subphases with exact attribution. All
  parsing completes before semantic validation; all semantic validation
  completes before candidate-limit return.
- Replaced benchmark file references with in-memory source/native bytes and
  removed unreachable path, capture, content, and render invalid variants.
  Bounded suite admission now maps every malformed/cap failure to one
  `suite-invalid` result with zero counts; later execution is phase-major.
- Added claim-key subject, slot, per-key JCS, aggregate key-reference,
  aggregate key-byte, suite-source-byte, suite-native-byte, and native-context
  caps before corresponding JCS/base64/set/copy allocation.
- Made renderer input an in-process compiler-branded projection and narrowed
  revalidation to intrinsic invariants. Every fact field and source path is
  labelled untrusted, each JCS row is inside a fenced code block, and exact
  wrapper bytes were remeasured at 396/397/398.
- Pinned Unicode 17.0.0 and rejected semantic-string categories
  `Cc|Cf|Zl|Zp`, covering CR/LF, U+2028/U+2029, BOM, bidi controls, and other
  format controls without host-Unicode drift.
- Synchronized the ADR, compiler, renderer, benchmark, registry, MEM-001 plan,
  roadmap/architecture/package descriptions, status, and execution index. The
  plan no longer assigns malformed-byte rejection to a removed adapter.

### Validation and freeze

- Passed `corepack pnpm plans:validate` with 18 plans at implementation WIP
  `1/2` and company WIP `0/1`; all 21 execution-document tests and all 12
  positioning tests passed. Both JSON documents parse, `git diff --check`
  passes, and the normative/research trailing-whitespace scan is clean.
- Independently measured empty wrapper bytes at 396/397/398 and maximum
  wrapper-plus-payload bytes at 12,684/12,685/12,686, all below 16,384.
- Froze the corrected documentation packet for a possible later review. No
  review verdict is claimed, and the five normative artifacts remain
  unimplemented.

## Revision 62 — 2026-07-23

### Review result

- Recorded the exactly one Revision 61 dual-blind review pair authorized by the
  owner's trusted **Revise**. Both reviewers independently matched base
  `a0c29dd37dc024425336c03f98b1c6aa360c191a`, all 16 regular non-link files,
  301,871 total bytes, and aggregate fingerprint
  `091682f931781e3cd3d413df768a232f30c51934ae5739f369f8eca22ed29f31`
  before and after review.
- Reviewer A scored 84/100 with five must-fix findings. Reviewer B scored
  81/100 with six. Both returned `REQUEST CHANGES`, so the strict
  94-plus/zero-must-fix AND gate failed.
- Both independently passed plan validation, all 21 execution-document tests,
  all 12 positioning tests, JSON parsing, `git diff --check`, and Memory-M0
  whitespace checks. Mechanical green does not replace contract acceptance.

### Reconciled findings

- Reconciled seven must-fix domains: ordered compiler/snapshot `source-limit`
  co-failure and first/second-pass precedence; an executable fd-relative
  snapshot backend and root/handle contract; physical `(dev,ino)` uniqueness
  across logical paths and fixture roles; exact physical-fixture-to-logical-
  registration rebinding plus exhaustive component-error mapping and removal
  of unreachable benchmark `render`; per-key and aggregate key-byte caps before
  JCS/base64/set expansion; envelope/limit/semantic validation phases with
  phase-major fixture traversal and bounded invalid counts; and correction of
  the plan's malformed-byte ownership contradiction.
- Reconciled three should-fix domains: warn that every rendered fact field and
  path—not values alone—is untrusted; reject or deterministically escape
  U+2028/U+2029 and formatting controls that break the one-line claim; and
  limit renderer revalidation claims to intrinsic projection invariants or a
  branded compiler result.
- Recorded one consideration: pin a Unicode property/version and consider bidi
  and HTML-significant path-character hardening after the blocking line/control
  behavior is closed.
- Both reviewers agreed that fatal UTF-8/BOM/NFC handling, pinned TypeScript
  extraction, segment-safe workspace provenance, the local-only/non-efficacy
  authority boundary, and the no-implementation gate are closed.

### Authority

- **Accept** remains unavailable. Implementation, live experiments, and public
  actions remain unauthorized. Authority returns to the owner: a new trusted
  **Revise** may authorize one bounded correction and define a later review;
  **Hold** parks MEM-001. No correction or review is automatic.
- This revision records review outcome only. The five normative Revision 61
  artifacts remain byte-unchanged from the reviewed packet. No schema,
  compiler, renderer, fixture harness, product code, commit, push, merge,
  release, or deployment is added.

## Revision 61 — 2026-07-23

### Authority

- Recorded the owner's trusted **Revise** choice after Revision 60. It
  authorizes one bounded correction of the complete reconciled review finding
  set and exactly one fresh dual-blind review over identical frozen bytes.
- The correction must close all six blocking domains: static-module byte
  decoding and exact literal extraction; total compiler, snapshot, and renderer
  error precedence and attribution; segment-safe workspace classification with
  complete provenance; truthful rendered-literal safety boundaries; benchmark
  key/result resource bounds; and exact reducer equations plus malformed-suite
  count semantics.
- It also applies both actionable should-fixes: forbidden exposure evaluates
  rendered preview keys rather than omission metadata, and mutable review
  scores/status remain in execution authority rather than durable product
  descriptions. The successful local-only and no-efficacy scope reset remains
  invariant.

### Boundary

- This authority covers documentation, the proposed pinned registry, local
  validation, packet freezing, and one review pair only. It does not authorize
  schema/compiler implementation, a live agent or provider experiment, a
  commit, push, merge, release, deployment, or public claim.
- **Accept** remains unavailable until both fresh reviewers score at least
  94/100 with zero must-fix findings. The review result does not itself
  authorize implementation; a separate trusted owner **Accept** would still be
  required.

### Changed

- Replaced implicit source-text handling with one BOM-rejecting fatal UTF-8
  path, no normalization or replacement decoding, pinned TypeScript parser
  inputs, cooked module-specifier values, and complete raw-token evidence.
- Defined total compiler and snapshot error phases, attribution, and triggers;
  removed unreachable compiler variants. Reduced the renderer to its two
  caller-triggerable errors and made their precedence exact.
- Made workspace matching segment-safe (`N` or `N + "/"`) and attached both
  module-token and matching manifest-name evidence to every workspace row.
- Replaced categorical rendered-literal safety claims with tighter literal
  grammars, exact 352/353/354-byte wrappers, a repository-controlled-data
  warning, one-line JCS rows, and an explicit no-secret-classifier boundary.
- Added reachable per-task, native-context, aggregate key-reference, and final
  result caps. The suite now allows 3–10 fixtures, 32 tasks, and 27–96 cells;
  the aggregate key-reference cap is 3,072 and the benchmark result cap is
  1,048,576 bytes.
- Defined the reducer's exact per-cell equations and per-cell summary sums,
  malformed-suite count behavior, invalid precedence, pre-expansion result
  upper bound, and preview-only forbidden-exposure rule.
- Removed mutable review scores/revision state from README, roadmap,
  architecture, positioning, and package-facing descriptions. Those durable
  surfaces point to execution authority for current state.

### Audit evidence

- The required self-audit found and corrected four pre-review inconsistencies:
  an unreachable 12-fixture cap, an unreachable 8,192 aggregate-key cap, a
  `required` set/number mismatch, and result-limit evaluation ahead of its
  declared invalid precedence.
- Registry invariants now prove 128 = 1 + 64 + 63 sources, 96 = 32 × 3 cells,
  3 × 10 <= 32 minimum class tasks, a reachable 3,072 aggregate cap below the
  3,968 per-item maximum, and 354 + 12,288 = 12,642 rendered bytes below the
  16,384 cap.
- Plan validation, all 21 execution-document tests, all 12 positioning tests,
  JSON parsing, Memory-M0 local-link closure, whitespace checks, and
  `git diff --check` pass. No product source, schema, dependency, or release
  artifact changes in this correction.

## Revision 60 — 2026-07-23

### Review result

- Recorded the one Revision 59 dual-blind review authorized by the owner's
  trusted **Revise**. Both reviewers independently matched the frozen base
  `a0c29dd37dc024425336c03f98b1c6aa360c191a`, 16-file, 286,602-byte packet and
  aggregate fingerprint
  `79e233df78a67568d0e4e8008792a6efedb169eb73efa39c2b59cdac180baac9`
  before reporting; the fingerprint matched again after both reports.
- Reviewer A scored 86/100 with five must-fix findings. Reviewer B scored
  88/100 with four. Both returned `REQUEST CHANGES`, so the strict
  94-plus/zero-must-fix AND-gate failed.
- Reconciled six blocking domains: fatal static-module byte decoding and exact
  literal extraction; total validation/error precedence and attribution;
  segment-safe workspace classification plus provenance; truthful treatment of
  rendered source-controlled literals; bounded benchmark key/result expansion;
  and exact summary equations plus malformed-suite count semantics.
- Recorded three non-blocking follow-ups: define forbidden exposure as preview
  text rather than omission metadata, keep mutable review state in execution
  authority, and preserve the successful local-only/non-efficacy scope reset.
- Updated current status surfaces to report the failed gate. The five Revision
  59 normative artifacts remain byte-unchanged from the reviewed packet.

### Authority

- **Accept** remains unavailable. Implementation and live experiments remain
  unauthorized. Authority returns to the owner: a new trusted **Revise** may
  authorize one bounded correction and define a future review; **Hold** parks
  MEM-001. No correction or second review is automatic.
- This revision records review outcome only. It adds no schema, compiler,
  renderer, fixture harness, product code, commit, push, merge, release, or
  deployment.

## Revision 59 — 2026-07-23

### Changed

- Recorded the owner's trusted **Revise** choice to **Simplify M0** after
  Revision 58's failed 76/72 dual review. The authority covers one local-only
  scope reset and exactly one fresh dual-blind review; it covers neither
  implementation nor a live experiment.
- Replaced the eleven-annex live-run proposal with an ADR, local compiler
  contract, deterministic renderer contract, offline fixture benchmark, and
  pinned registry v2. Removed the foundations, publication, evaluation,
  isolation, transmission, run, conformance, and accounting annexes from
  current authority.
- Reduced M0 to explicit stable source bytes -> bounded current
  `observed|declared` facts -> target-labelled additive previews -> synthetic
  deterministic fact-coverage cells. Structure v5 remains unchanged.
- Removed every provider/client invocation, credential, prompt/response,
  process runner, model grader, preflight, retry, journal, private artifact,
  cost/timing account, retention control, deletion receipt, and live-run owner
  gate from MEM-001. Any such work now requires a separate future plan and ADR.
- Addressed the Revision 58 finding union by eliminating the removed machinery
  and retaining exact local safeguards: four enumerated hash preimages; no
  hash-derived IDs; stable no-follow source reads; explicit provenance and
  conflicts; fixed source/value/projection/render/fixture/task/cell caps; and
  a closed deterministic `pass|fail|invalid` coverage reducer.
- Synchronized README, roadmap, architecture, package docs, extraction guidance,
  positioning impact, TEL handoff, MEM-001, status, and execution index revision
  59. **Accept** remains unavailable pending one fresh strict dual pass.

### Boundary

- Offline fixture coverage is technical-feasibility evidence, not agent
  efficacy, real-repository improvement, market validation, or a shipping claim.
- This revision changes documentation and the proposed registry only. It adds
  no schema, compiler, renderer, fixture harness, product code, provider call,
  commit, push, release, or deployment.

## Revision 58 — 2026-07-23

### Changed

- Recorded the one owner-authorized dual-blind review of the frozen Revision 57
  packet. Reviewer A scored 76/100 with nine must-fix findings; Reviewer B
  scored 72/100 with eight. Both returned `REQUEST CHANGES`, so the strict
  94-plus/zero-must-fix AND-gate failed.
- Bound both reports to base commit
  `a0c29dd37dc024425336c03f98b1c6aa360c191a` and the same 24-file,
  445,373-byte packet fingerprint
  `cdb85ceb316cc5113674ef2dee40d2bea9fde64a9f9f64165655ffc387e36243`.
  The fingerprint matched before both reviews and again after both reports.
- Reconciled thirteen blocking domains: complete executable hash/identifier
  discovery, preimages, ordering, profiles, and cycle rejection; profile-bound
  applicable output identity with canonical slot/path allocation; first-missing
  semantics; crash-safe pre-egress/output journaling; deterministic preflight
  outcomes; producer-independent blind grading and trace binding; comparator
  normalization for operational coordinate identity; total native sentinel
  materialization; non-circular manifest/authorization lifecycle sinks;
  retry-time deletion reproof; authoritative final fixture-state inventory;
  hard cardinality and byte limits; repository-safe private commitments; and
  provider-policy/account snapshot freshness.
- Returned authority to the owner. A new trusted **Revise** may authorize one
  bounded correction and define a later review; **Hold** parks M0. **Accept** is
  unavailable because neither reviewer passed and both reported must-fixes.

### Evidence

- Both reviewers independently reran plan validation, all 21 execution-document
  tests, all 12 positioning tests, `git diff --check`, JSON/link/file-hygiene
  checks, annex limits, shared-type ownership, `ContractRef` closure, and
  `PrivateOutputRef` kind coverage. The mechanical gates passed.
- This revision records review and authority state only. It changes no normative
  annex, pinned registry byte, schema, compiler, runner, product code, provider
  state, release, or deployment.

### Review boundary

- No automatic rework or second review is authorized after this failure.
- Implementation remains behind `OWNER-MEM-M0-DECISION`; live calls remain
  behind the later exact-manifest `OWNER-MEM-M0-RUN` decision.

## Revision 57 — 2026-07-23

### Changed

- Recorded the owner's new trusted **Revise** after Revision 56's failed 80/84
  dual review. It authorizes one comprehensive correction and one fresh
  parallel dual-blind review over identical frozen bytes; it authorizes neither
  implementation nor live client calls.
- Added the normative deterministic-foundations annex: canonical structural
  diff/apply, machine-checkable hash-preimage closure, collision-free typed
  output slots and reconstructable observed indexes, the exact 27-preflight/81-assignment
  progress machine, and exhaustive path identity/lifecycle partition rules.
- Reworked conformance so comparator patches carry replayable values, native
  token/bundle hashes have explicit preimages, fake-endpoint qualification binds
  complete roots, and the grader independently derives typed command/test/
  architecture outcomes from pinned raw evidence.
- Bound output refs to exact kind/coordinate/sequence/slot/order, retained the
  full plan in the capsule plus hash-chained progress deltas, and made recovery
  derive first-missing evidence only from the reconstructed index.
- Closed physical/hard-link aliasing, directory/file identity, exhaustive
  bundle/fixture/broker/output inventory, first-failure stop and not-attempted
  deletion states, retry semantics, split usage semantic/parser/grammar
  identities, and a retained-control owner-disposition deadline.
- Synchronized ADR, roadmap, architecture, package docs, plan, status, index,
  and authority language. **Accept** remains unavailable until both fresh
  reviewers score at least 94 with zero must-fix findings. Fingerprint and
  verdict remain pending final gates.

## Revision 56 — 2026-07-23

### Changed

- Recorded the one owner-authorized fresh dual-blind review of Revision 55.
  Reviewer A scored 80/100 with six must-fix findings; Reviewer B scored 84/100
  with four must-fix and two should-fix findings. Both returned
  `REQUEST CHANGES`, so the strict 94-plus/zero-must-fix AND gate failed.
- Reconciled seven blocking domains: producer-independent grader evidence and
  collision-free output identity; canonical comparator diff and observed-patch
  hashes; exact native-materialization hash preimages; reconstructable
  fake-endpoint patches; a complete progress-journal transition grammar; a
  closed output-index contract; and exhaustive private-path identity,
  partition, set-digest, directory, interruption, and deletion states.
- Retained fake-endpoint reconstruction as must-fix under the strict union rule:
  one reviewer found its patch values/policy reconstruction incomplete even
  though the other considered that prior domain closed.
- Recorded two should-fix findings: artifact-bundle physical paths must be
  unique and non-aliasing, and usage parsing needs distinct semantic, grammar,
  and executable bindings.
- Recorded two non-blocking considerations without applying them: add a
  machine-readable inventory for every hash preimage, and define a later owner
  disposition deadline for retained controls.

### Evidence

- Both reviewers independently recomputed the same 22-file packet fingerprint
  before and after review:
  `7d18ae54dfd9b2e2a53ec1197d0c5a01fff86e9120311a864de4e7109d34d705`
  from base `a0c29dd37dc024425336c03f98b1c6aa360c191a`.
- Plan validation, all 21 execution-ledger tests, all 12 positioning tests,
  JSON parsing, 197/197 local links, ten-annex line limits, registry bytes/domain
  digest, secret scan, and `git diff --check` passed on the frozen packet.
- Reviewers made no edits, provider calls, network calls, or delegated reviews.
  The main process independently confirmed the post-review fingerprint before
  recording this state revision.

### Review boundary

- Review authority has returned to the owner. No correction or follow-up review
  is automatic. A new **Revise** may authorize another bounded correction;
  **Hold** parks M0. **Accept** is unavailable.
- Implementation remains behind `OWNER-MEM-M0-DECISION`; live calls remain
  behind the later exact-manifest `OWNER-MEM-M0-RUN` decision.

## Revision 55 — 2026-07-23

### Changed

- Recorded the owner's new trusted **Revise** decision, authorizing one bounded
  correction of the reconciled findings and exactly one fresh dual-blind review
  over identical frozen bytes.
- Closed all five must-fix domains in the proposed contracts: deterministic
  outcome grading; exact comparator digest preimages; typed fake-endpoint
  substitution; reconstructable closure after run-root loss; and exhaustive
  identity-safe deletion covering mappings, controls, and qualification probes.
- Closed all five should-fix findings: resource-use terminology no longer
  implies monetary cost; native sentinel materialization is byte-bound;
  review-packet identity has one deterministic fingerprint; the Node
  predecessor-open sequence is exact; and repeated score chronology is removed
  from roadmap, architecture, and package-facing documentation.
- Preserved the strict review gate: both fresh reviewers must score 94/100 or
  higher with zero must-fix findings. Failure returns authority to the owner;
  no retry is automatic.

### Evidence

- The bounded rework changes only the proposed ADR, annexes, plan, and authority
  documentation. It adds no shipped schema, compiler, runner, product code,
  provider call, release, publication, or deployment.
- Structure v5 and the pinned registry bytes remain unchanged. The registry is
  exactly 1,648 bytes and its declared domain hash remains
  `1cc340d0f063950f59d3220d2c0463c6396cf29737c3a2dd618c4ace4dd91765`.
- Plan validation reports 18 valid plans at implementation WIP `1/2` and
  company WIP `0/1`; all 21 execution-ledger tests and all 12 positioning tests
  pass.
- Both JSON files parse; all 197 local references across the 20 changed
  Markdown files resolve; all 22 packet files are regular non-link files with
  final LF and no CR bytes; the ten normative annexes remain at or below 300
  lines; secret, dependency-change, whitespace, authority-consistency, and
  contract-closure checks pass.
- The fresh dual-blind result is recorded only after both reviewers complete
  against the frozen packet fingerprint.

### Review boundary

- A dual pass makes owner **Accept** available; it does not itself authorize
  implementation.
- Live calls remain behind the later exact-manifest `OWNER-MEM-M0-RUN` gate.

## Revision 54 — 2026-07-23

### Changed

- Recorded the owner-authorized additional dual-blind review's two independent
  84/100 `REQUEST CHANGES` verdicts. The strict 94-plus/zero-must-fix AND-gate
  failed.
- Reconciled five distinct must-fix domains: deterministic outcome-grader
  derivation; exact condition-comparator digest preimages; typed fake-endpoint
  substitution and receipt binding; reconstructable closure after run-root
  loss; and exhaustive identity-safe deletion covering mappings, controls, and
  qualification probes.
- Returned review authority to the owner. A new **Revise** may authorize a
  bounded correction cycle and later fresh dual review; **Hold** parks M0.
  **Accept** remains unavailable.

### Evidence

- Both reviewers read the same frozen 22-file revision-53 packet independently
  and made no edits or provider calls.
- The reports independently converged on unrecoverable closure and deletion.
  One also found the missing grader derivation; the other found missing digest
  preimages and fake-endpoint substitution semantics.
- This revision records review state only. It changes no normative annex,
  registry byte, schema, compiler, runner, product code, provider state, or
  release state.

### Review boundary

- No automatic rework or additional review is authorized after this failure.
- Implementation remains behind `OWNER-MEM-M0-DECISION`; live calls remain
  behind the later exact-manifest `OWNER-MEM-M0-RUN` decision.

## Revision 53 — 2026-07-23

### Changed

- Recorded the owner's trusted user-role **Revise** decision after the prior
  review cycle was exhausted.
- Bounded that authority to exactly one additional fresh dual-blind review over
  identical frozen bytes. The pass gate remains both reviewers at 94/100 or
  higher with zero must-fix findings.
- Made failure handling explicit: if either reviewer misses the gate, review
  authority returns to the owner for a new Revise or Hold; no follow-up round is
  automatic.
- Preserved every later boundary. Revise does not authorize owner Accept,
  implementation, live provider calls, commit, push, merge, release, publish,
  or deployment.

### Evidence

- This revision changes only authority and execution-control documentation. It
  adds no schema, compiler, runner, product code, provider call, or release.
- On the revision-53 bytes, plan validation passes with 18 plans at
  implementation WIP `1/2` and company WIP `0/1`; all 21 execution-document
  tests and all 12 positioning tests pass.
- Both JSON files parse; all 195 local references across the 20 changed
  Markdown files resolve; all 22 packet files pass whitespace and final-LF
  checks; the ten normative annexes stay at or below 300 lines; the authority,
  round-5 closure, registry-digest, and diff gates pass.

### Review boundary

- Two fresh reviewers receive the same frozen 22-file packet and remain blind
  to each other's report.
- A dual pass makes the proposal eligible for a separate owner Accept decision;
  it does not itself authorize implementation or the later live benchmark.

## Revision 52 — 2026-07-23

### Changed

- Recorded final review round 5's 88/100 and 82/100 `REQUEST CHANGES`
  verdicts. The authorized reopened cycle is exhausted; no round 6, owner
  acceptance, implementation, or live-run authority is implied.
- Made every potentially incomplete recovery-cost scalar an `AccountedUInt` so
  wall time, requests, tools, tokens, and context bytes can remain unknown
  without invented zeroes; budget recovery uses the same typed evidence.
- Made the completion-token parameter the sole bounded dynamic model parameter,
  with provenance over the manifest limit and every contiguous prior usage
  receipt. Unknown usage or zero remaining tokens blocks egress.
- Bound deletion to the manifest/path-review target set, preserved that complete
  set across retries, defined exact terminal status derivation, and required
  sequential no-follow verification of every predecessor control file and hash.
- Corrected the plan so fake-endpoint client/runner conformance,
  preregistration, and the exact manifest precede `OWNER-MEM-M0-RUN`; only that
  later Accept permits live preflights or scored calls.
- Corrected stale status/roadmap/ADR language. The next authority choice is
  **Revise** to authorize another fresh dual review or **Hold** to park M0;
  **Accept** remains unavailable before a later dual pass.

### Evidence

- This revision changes documentation and the execution-index JSON only. It
  adds no schema, compiler, runner, product code, provider call, release, or
  deployment; the pinned registry remains unchanged.
- Execution-plan validation passes with 18 plans at implementation WIP `1/2`
  and company WIP `0/1`; all 21 execution-document tests and all 12 positioning
  tests pass.
- Both JSON files parse; all 20 changed Markdown links resolve; all 22 changed
  files pass whitespace checks; every annex stays at or below 300 lines; the six
  round-5 rework contracts and revision-52 authority markers pass; `git diff
  --check` passes; and the 1,648-byte registry pin remains exact.

### Review boundary

- The post-cycle bytes must pass documentation, link, JSON, digest, whitespace,
  line-limit, and authority-consistency gates before an owner choice is requested.
- A Revise may authorize a newly bounded dual-review cycle. It does not itself
  authorize implementation or live calls. Hold parks M0 without changing the
  rest of the roadmap.

## Revision 51 — 2026-07-23

### Changed

- Recorded fresh review round 4's independent 86/100 and 89/100 `REQUEST
  CHANGES` verdicts. The proposal remains non-owner-ready and no implementation
  or live-run authority is claimed.
- Replaced repository-visible task and assignment identifiers with keyed opaque
  aliases in a distinct `RepositoryBenchmarkReceipt`; raw IDs and private
  receipt references remain owner-private.
- Added per-preflight/per-attempt budget receipts that enforce monotonic wall,
  provider completion-token, and broker tool-call limits. Exceeded or unproved
  limits are invalid and retain cost/safety evidence without entering uplift.
- Added byte-for-byte post-credential-injection integrity, permitting only one
  policy-named credential header before the immutable TLS-bound request buffer.
- Replaced the single deletion key with append-only predecessor-bound attempt
  keys and made uncertain control publication an explicit owner incident.
- Added typed host-backend capabilities for namespace, mount, credential,
  complete-trace, control, and clock enforcement; corrected stale review labels.

### Evidence

- This revision changes documentation and the execution-index JSON only; the
  pinned registry bytes remain unchanged. It adds no schema, compiler, runner, product code,
  provider call, repository telemetry, release, or deployment.
- Execution-plan validation passes with 18 plans at implementation WIP `1/2`
  and company WIP `0/1`; all 21 execution-document tests and all 12 positioning
  tests pass.
- Both changed JSON files parse; all 20 changed Markdown files resolve local
  links; all 22 changed files pass whitespace checks; every normative annex is
  at or below 300 lines; `git diff --check` passes; and the registry remains
  exactly 1,648 bytes with its pinned domain-separated digest.

### Review boundary

- Round 5 is the final reopened-cycle review. After documentation, link, JSON,
  digest, whitespace, and consistency gates pass on frozen bytes, two fresh
  blind reviewers must each score at least 94 with zero must-fix findings.
- Only a dual pass may produce an owner-decision candidate. A later trusted-
  session owner Accept would authorize implementation only; live calls remain
  separately gated by `OWNER-MEM-M0-RUN` over the exact private manifest.

## Revision 50 — 2026-07-23

### Changed

- Recorded that fresh review round 3 failed. One formal report scored 82/100
  and summarized its pair as 82/86; a separate formal report scored 86/100 and
  disclosed that one nested reviewer was interrupted. This is failed evidence,
  not a clean dual-review result or owner-readiness claim.
- Added normative experiment-conformance and accounting/closure annexes, making
  ten annexes total. Every bank task's native/memory/on-demand expansions are
  compared before eligibility; only tasks whose three client comparators pass
  may enter the draw, and the selected nine receipts enter the private manifest.
- Bound typed native sentinels, exact namespace destinations/CWD, mount and
  counter templates, a non-exportable trusted-session capability, and
  wall/monotonic/boot expiry checks. Hidden request retry or replay is invalid.
- Added versioned inbound response parsing, subvalue/composite provenance,
  exact metadata generators, provider usage formulas, unanswered billable-
  request accounting, and closed seven-kind safety-event derivation.
- Made closure total over every completed, invalid, suppressed, aborted, and
  not-run assignment, with offline recovery receipts and typed unknown costs.
  The exact manifest and raw evidence stay private; only redacted run and
  sanitized benchmark JSON receipts may enter the repository.
- Removed every conditional-unlink claim from Node control publication, added
  seed claim before seed generation, made closure/deletion create-once, and put
  local deletion evidence in a separate private control leaf outside the
  deleted run root. Every declared compile limit now has an exact error code.

### Evidence

- Execution-plan validation passes with 18 plans at implementation WIP `1/2`
  and company WIP `0/1`; all 21 execution-document tests and all 12 positioning
  tests pass.
- All ten normative annexes remain at or below 300 lines. JSON parsing, local
  links across all 20 changed Markdown files, tracked/untracked whitespace,
  `git diff --check`, current-review-state scans, and the registry's exact
  1,648-byte pinned digest pass.

### Review boundary

- The proposal remains `Proposed`. Round 4 may run only after the ten-annex
  packet passes the documentation, link, JSON, digest, whitespace, and
  consistency gates. Two fresh reviewers must each score at least 94 with zero
  must-fix findings on identical frozen bytes before an owner disposition.
- No schema/product implementation, provider call, commit, push, release,
  publication, deployment, outreach, or public claim is authorized.

## Revision 49 — 2026-07-23

### Changed

- Recorded fresh review round 2's independent 78/100 and 82/100 `REQUEST
  CHANGES` verdicts. No owner-readiness or implementation authority is claimed.
- Added an eighth normative vendor-transmission annex. Its closed request-state
  grammar covers all request sequences, exact wire framing/cardinality,
  fixed/dynamic preimages, model-requested tool-path provenance, and a fresh
  manifest/authorization expiry check before every egress.
- Separated the condition-invariant native open set from explicit treatment
  overlays and bound both generated treatment conditions into eligibility,
  preflight, attempt, trace, and benchmark evidence.
- Replaced the unnecessary reusable-cache, hard-link tree, and native-helper
  publication design with public Node `fs` direct exclusive creation for only
  seed/start controls. Generated bytes live only in a fresh private run bundle;
  partial or uncertain control files permanently poison their key.
- Bound exact host/backend artifacts, stable invocation aliases to fresh
  per-invocation realizations, strict redirect-free TLS/IP/pin policy, complete
  prompt/completion/total-token costs, deterministic array ordering, and total
  compile-error precedence.
- Bound every preflight to a fresh environment, every provider response and
  tool result to a coordinate-specific private output, and later-request
  provenance to exact prior response/tool-call, operation, path/command, and
  before/after source evidence.

### Evidence

- Execution-plan validation passes with 18 plans at implementation WIP `1/2`
  and company WIP `0/1`; all 21 execution-document tests and all 12 positioning
  tests pass.
- The ADR and eight normative annexes are each at or below the 300-line circuit
  breaker. JSON parsing, links across all 18 changed Markdown files, tracked and
  untracked M0 whitespace, `git diff --check`, stale-contract scans, and the
  registry's exact 1,648-byte pinned digest pass.

### Review boundary

- The proposal remains `Proposed`. Blind round 3 may run only after the revised
  eight-annex packet validates. Both reviewers must pass the same bytes at 94 or
  higher with zero must-fix findings before an owner disposition is requested.
- No schema/product implementation, live provider call, push, release,
  publication, deployment, outreach, or public claim is authorized.

## Revision 48 — 2026-07-23

### Changed

- Recorded the owner's explicit reopening of one fresh dual-review cycle for
  `MEM-001` and fresh round 1's independent 86/100 and 83/100 `REQUEST CHANGES`
  verdicts. No owner-readiness or implementation authority is claimed.
- Added a seventh normative isolation/transmission annex with closed fixture,
  alias, UID, namespace, filesystem, process, network, trace, broker,
  transmitted-boundary, attempt-environment, and adversarial-receipt schemas.
- Required every scored attempt and retry to use a new byte-identical fixture,
  HOME/config and output roots, namespaces, client/broker sessions, and
  counters while preserving all prior-attempt artifacts, safety, and cost.
- Expanded the vendor boundary to every plaintext request field, including
  default/system prompts, tool schemas, model parameters, metadata, and
  telemetry. A local gateway must attest the exact pre-credential request
  before broker injection and TLS egress; opaque or bypassing clients are
  unsupported.
- Replaced generic isolation artifacts with typed semantic and exact-file
  references, completed digest identities and stable source-failure codes,
  hardened publication around pinned descriptor-relative anchors, and added
  exact authorization-expiry and preservation-state rules.
- Made the reducer total over all 81 scheduled cells, nullable and
  denominator-explicit when inconclusive, and accountable for every retry's
  safety and cost. Reordered execution so compiler, renderers, materializer,
  and runner qualify before task eligibility, seed, draw, and run authorization.

### Evidence

- Execution-plan validation passes with 18 plans at implementation WIP `1/2`
  and company WIP `0/1`; all 21 execution-document tests and all 12 positioning
  tests pass.
- All eight M0 ADR/annex Markdown files remain below the 300-line circuit
  breaker. Changed-document local links, JSON parsing, `git diff --check`, and
  the registry's exact 1,648-byte pinned digest also pass.

### Review boundary

- The proposal remains `Proposed`. Blind round 2 may run only after this
  bounded rework validates; both reviewers must score at least 94 with zero
  must-fix findings before an owner disposition is requested.
- The existing implementation and live-run gates remain separate. No schema,
  product code, provider call, push, release, publication, deployment,
  outreach, or public claim is authorized by this documentation revision.

## Revision 47 — 2026-07-22

### Changed

- Explicitly started `MEM-001` as a decision-only implementation slice and
  moved implementation WIP from `0/2` to `1/2`.
- Proposed one short M0 ADR with six separate normative data, publication,
  client/rendering, evaluation/authorization, run-artifact, and
  benchmark/reducer annexes plus one exact pinned registry.
- Proposed no new canonical Memory store or package. M0 adds a strict
  `memory-m0-v1` companion schema while leaving every Structure v5 document
  valid, and writes only when the caller explicitly selects disposable output.
- Closed M0 to current `observed|declared` assertions from root/package
  manifests and statically parsed modules. Claim slots preserve legitimate
  multi-value facts; exact referential invariants, canonical bytes, two source
  passes, and no prior-projection input make the projection reproducible.
- Replaced an unavailable directory no-replace primitive with the repository's
  qualified private-tree plus atomic hard-link reference pattern.
- Split authority into two manual gates: one trusted-session owner decision for
  implementation and one later exact-manifest decision for live clients. JSON
  receipts are audit records and cannot authenticate the owner.
- Defined exhaustive client-native context manifests; fixed rendering templates
  and budgets; noncircular additive challenges; one deterministic on-demand
  command; process-separated credential/tool/network confinement; strict
  manifest/start/attempt/benchmark schemas; an outcome-blind task draw; 81
  valid assignments; and explicit inconclusive/insufficient-failure outcomes.
- Recorded that final independent review round 5 rejected the prior draft at
  84/100 and 87/100. Post-review rework closes dynamic native-source tracing,
  artifact resolution and exact invocation mounts, provider/account snapshots,
  filesystem qualification, the frozen task bank and eligibility receipt,
  single-publication seed and start controls, exact assignment preimages,
  retry safety accounting, and deterministic reduction. The reworked bytes
  have not yet received a newly authorized independent review.

### Evidence

- The ADR and each normative annex remain independently below the 300-line
  documentation circuit breaker.
- Current official Codex, Claude Code, and GitHub Copilot documentation was
  rechecked for the proposed additive instruction surfaces; documentation is
  treated as discovery evidence rather than runtime conformance proof.
- Final review round 5 returned 84/100 and 87/100, both `REQUEST CHANGES`; no
  owner-readiness or independent pass is claimed for the post-review rework.
- Execution-plan validation passes with 18 plans at implementation WIP `1/2`
  and company WIP `0/1`; all 21 execution-document tests and all 12
  positioning checks pass.

### Boundary

- The ADR remains `Proposed`; it does not authorize schema code, a compiler,
  a Memory package/store, native instruction-file mutation, benchmark claims,
  Lock enforcement, telemetry transport, release, push, publication,
  deployment, or outreach.
- The exhausted five-round review cycle cannot be silently extended. Explicit
  authority must reopen one fresh dual review, and both reviewers must pass
  before asking the owner to choose `Accept`, `Revise`, or `Hold` for an exact
  proposal checkpoint. A later implementation Accept cannot authorize the
  separately gated live benchmark.

## Revision 46 — 2026-07-22

### Changed

- Marked `TEL-001` `done` and reduced implementation WIP from `1/2` to `0/2`.
- Closed the versioned local outcome-event contract at implementation
  checkpoint `be2a784f5`: four closed event families, explicit local
  read/append/export/delete operations, no normal-scan writer, and no outcome
  transport.
- Cleared `MEM-001`'s completed TEL dependency while retaining `MEM-001` as
  `draft`; no Memory ADR, implementation, package, or benchmark was started.
- Updated the roadmap, TEL/MEM plans, status, package privacy documentation,
  and durable TEL evidence receipt to the qualified contract.

### Evidence

- Final review round 5/5 returned independent scores of 98/100 and 98/100,
  both `PASS`, with no must-fix or should-fix finding.
- The focused outcome/beacon matrix passes 30 tests with one
  platform-conditional skip; the packed-consumer suite passes all 9 tests and
  rebuilt ESM/CJS probes expose the complete outcome API.
- Recursive lint, typecheck, tests, and build pass. SlopBrick reports 392
  passed files plus 5 skipped and 4,603 passed tests plus 18 skipped; Core,
  Website, and Engine report 285, 54, and 60 passing tests respectively.
- The fresh package-local self-scan completes at 99.94/100 with four current
  medium deterministic findings, policy gate pass, and no durable baseline or
  outcome directory created.
- Post-closeout plan validation reports 18 valid plans, implementation WIP
  `0/2`, and company WIP `0/1`; positioning validation remains 12/12.

### Boundary

- This revision adds no hosted ingestion, automatic outcome collection,
  calibration label, source/admission authority, rule-state change, Memory
  implementation, release, push, publication, deployment, or outreach.
- `REL-001`, the high-severity dependency audit, `GTM-001`, and exact
  stale-path approval remain separate gates.

## Revision 45 — 2026-07-22

### Changed

- Moved `TEL-001` from `ready` to `in_progress`, consuming one of two
  implementation WIP slots.
- Kept its first slice bounded to a versioned local outcome-event contract for
  useful, declined-no-safe-fix, unchanged-rescan, and bounded-return states.
- Repaired the CAL-002 catalog test fallback so macOS temporary directories are
  canonicalized before they are passed to the production symlink guard.

### Evidence

- The isolated TEL worktree passes recursive lint and typecheck.
- The recursive build passes. The complete CAL-002 CLI file passes 56 tests
  with 2 intentional skips after the test-fixture repair.
- The production external-source validator remains unchanged and continues to
  reject paths with symbolic-link ancestors.

### Boundary

- This revision starts local TEL execution; it does not add an event writer,
  outbound reporting, hosted ingestion, user tracking, calibration authority,
  or public release authority.
- The CAL-002 repair changes test-fixture construction only. No scanner,
  scoring, policy, schema, admission, or runtime security behavior changes.

## Revision 44 — 2026-07-22

### Changed

- Closed `SB-UX-001` after all eight tasks and the current owner-comprehension
  checkpoint completed. The owner confirmed that the current bounded first
  screen is good enough and that its deterministic, manual-review, and
  no-safe-bounded-repair boundary is understandable.
- Marked `SB-UX-001` `done`, reduced implementation WIP from `1/2` to `0/2`,
  and made `TEL-001` the next ready implementation plan.
- Preserved `LOCK-001` as `draft` while clearing its completed SB-UX dependency.
  `MEM-001` remains `draft` and still waits for `TEL-001`.
- Updated the roadmap, execution status/index, SB-UX/TEL/Lock plans, detailed
  implementation plan, current impact/audit projections, and the evidence
  receipt without changing scanner behavior.

### Evidence

- The exact 11-file first-scan matrix passes 267/267 tests and SlopBrick
  typecheck passes.
- The SlopBrick package suite passes 4,580 tests with 15 intentional skips;
  recursive Core, Website, Engine, and SlopBrick lint, typecheck, test, and
  build gates pass.
- The package-local no-baseline self-scan analyzes 296/296 selected files with
  zero failures, reports one deterministic manual-review recommendation, passes
  its policy gate at Repository Health 99.94/100, and leaves the durable debt
  baseline missing before and after.
- The owner accepted the exact current ANSI-free first screen after the
  comprehension boundary was explained. No additional `VAL-001` walkthrough
  row or usefulness claim was inferred.
- The 17-file closeout checkpoint is
  `cfd52e9b4a7070223b556bea6b0ca99e2065911d`.

### Boundary

- This closeout changes documentation, evidence, and plan-control state only.
  It does not extract the duplicate block, change a score, threshold, rule,
  policy, calibration row, baseline, package version, or telemetry runtime.
- External sessions remain zero and outreach remains unauthorized. No merge,
  push, tag, GitHub Release, npm publication, website deployment, or public-
  release authority is inferred.

## Revision 43 — 2026-07-22

### Changed

- Adopted the owner-approved account-wide thesis: **UseBrick keeps AI-generated
  software coherent** as one repository-owned quality, coherence, and
  verification product.
- Kept SlopBrick central as the shipped AI-slop scanner, current CLI, free
  local front door, and acquisition surface. Memory is repository intelligence,
  Lock is the first paid new-debt hypothesis, Mend is deterministic repair,
  Pick/StackPick is policy setup, GIR is future Mend logic, BRICK Cloud is
  delayed, and Render remains Labs-only.
- Defined the coherence graph—not rule count, one score, or a memory store—as
  the moat hypothesis. Separated repository intelligence from privacy-safe,
  opt-in global outcome intelligence and made approved local policy final.
- Retained the branded Slop Index as a future shareable acquisition/reporting
  concept without adding a fifth shipped score, command, field, or formula.
- Reconciled all affected plan priorities with the execution index and updated
  `SB-UX-001` from its stale red-test action to the remaining Task 8 docs,
  gates, no-baseline self-scan, and owner-comprehension closeout.
- Corrected implementation WIP to `1/2`: CAL-002 is done and only
  `SB-UX-001` remains active.
- Recorded that a 2026-07-22 read-only live-site check resolved the older copy-
  drift observation while leaving deployed SHA and future deployment authority
  unresolved.

### Evidence

- Execution-plan validation passes with 18 indexed plans, implementation WIP
  `1/2`, and company WIP `0/1`; the combined execution and positioning
  validator suite passes 33/33.
- The generated 119-rule catalog is in sync, and the focused SlopBrick
  documentation/MCP suite passes 22/22.
- Website unit tests pass 54/54, Astro typecheck reports zero diagnostics, and
  the four-route static build completes successfully.
- These are documentation-convergence gates, not the remaining SB-UX Task 8
  focused first-scan matrix, recursive gate, package-local self-scan, or owner-
  comprehension evidence.

### Boundary

- This revision changes strategy, documentation, plan metadata, and their
  validators only. It does not change scanner behavior, current scores,
  thresholds, rule state, calibration, telemetry runtime, or package versions.
- External sessions remain zero and outreach remains unauthorized. No push,
  tag, GitHub Release, npm publication, website deployment, or public-release
  authority is inferred.

## Revision 42 — 2026-07-22

### Changed

- Recorded the owner-approved CAL-002 Task 20 local application at the single
  human-facing checkpoint `bd47dbd7e` and linked its machine-verifiable
  application receipt.
- Bound the exact 119-row policy into the static runtime provider while keeping
  every row non-admitting. The 41 evidence-ready quality rows are default-on;
  32 unmeasured quality candidates and 32 research-origin rows remain
  default-off and score/gate neutral; 4 blocked, 3 superseded, and 7 retired
  rows remain non-runnable.
- Closed `CAL-002` and reduced implementation WIP to `1/2`, with
  `SB-UX-001` retaining the active first-scan lane. Current provenance now
  hands off to that plan without adding a release dependency.
- Kept detailed matrix, approval, policy, and receipt SHA-256 identities
  machine-only under the owner-selected one-checkpoint documentation
  convention.

### Evidence

- The active candidate matrix passes 183/183; inactive support verification
  passes 361/361; the full SlopBrick suite passes 4,580 with 15 intentional
  skips; recursive Core, Engine, Website, and SlopBrick tests, lint, typecheck,
  and build pass.
- The package-local self-scan completes 296/296 files with zero failures,
  scores 99.94/100, reports four current medium deterministic findings, passes
  its policy gate, and creates no baseline.
- Fresh final review returned 100/100 with no findings. The focused security
  matrix passes 46/46, with no reportable security finding at confidence 8/10
  or higher.
- Task 21 closeout validation reports 18 plans valid at implementation WIP
  `1/2` and company WIP `0/1`; all 20 execution-doc tests pass, the generated
  119-rule catalog is in sync, and the focused documentation/MCP matrix passes
  209/209.

### Boundary

- The applied policy remains `admitted: false`; CAL-001 and all frozen evidence
  remain unchanged.
- The high dependency advisories remain a separate `REL-001` public-release
  blocker.
- No push, tag, admission, publication, deployment, or release authority is
  claimed by this local application or documentation closeout.

## Revision 41 — 2026-07-22

### Changed

- Recorded CAL-002 Task 19 at the single human-facing implementation
  checkpoint `52af3e272`. Explain, CLI, MCP, and generated-catalog surfaces now
  separate current policy from frozen v10.1 historical metrics.
- Bound the exact 119 identities to independent runnable, score, and gate
  projections. Repository configuration and invocation provenance stay
  distinct through main and v10.3 workers, with repository `off` taking
  precedence.
- Routed direct documentation scans, strict docs exit, secondary CLI
  diagnostics, persistence, and flywheel input through current authority.
  Score and gate projections may diverge; durable history removes only
  immutable policy-ineligible IDs, while temporary config filtering remains
  in memory and reversible.
- Advanced CAL-002 to Task 20 Steps 1–6: generate and fully qualify the exact
  local application candidate, then stop at the explicit owner comprehension
  gate before activation.
- Adopted the owner-selected documentation convention: one aggregate evidence
  root or implementation checkpoint SHA per bounded human-facing checkpoint;
  leaf SHA-256 and audit-payload identities remain machine-only.
- Added the current high-severity dependency audit as a separate `REL-001`
  release blocker without treating it as a Task 19 behavior failure.

### Evidence

- The exact 35-file Task 19 matrix passes 637/637 on Node 22.22.3 and 24.15.0.
- Recursive tests pass Core 285, Engine 60, Website 54, and SlopBrick 4,580
  with 15 intentional skips; recursive lint, typecheck, and build pass.
- The package-local self-scan scores 99.81/100, reports 13 active medium
  findings, auto-suppresses 803 policy-ineligible findings, and passes its
  policy gate.
- Two fresh independent final reviews returned 98/100 with zero findings.
- The dependency audit reports high transitive advisories in
  `brace-expansion` and `svgo`, plus one moderate Astro advisory. No package or
  lockfile mutation was made in this checkpoint.

### Boundary

- The production provider still returns `undefined`; current policy remains
  dormant, `applied: false`, and `admitted: false`.
- No activation, admission, baseline refresh, push, tag, publish, deploy, or
  release authority is claimed. Public actions remain separately controlled
  by `REL-001`.

## Revision 40 — 2026-07-22

### Changed

- Recorded the CAL-002 Task 18 implementation checkpoint through `be1be85b8`
  and its security review at `e17f736e5`.
- Added one current-policy evidence projection shared by first-scan, terminal,
  JSON, Markdown, HTML, and SARIF while preserving rule-authored source spans
  and explicitly historical legacy metrics as separate fields.
- Made renderer association fail closed on the complete finding identity,
  including file and message, while preserving safe absolute-path parity.
- Kept grouped recommendation source-span truth conservative and safe-repair
  claims limited to finding-bound deterministic or current-quality-calibrated
  evidence.
- Removed blocked, superseded, and retired tombstones consistently from
  findings, recommendations, and baseline deltas.
- Advanced CAL-002 to Task 19: separate current policy from historical metrics
  in explain, MCP, and generated catalog surfaces.

### Evidence

- The exact eight-file Task 18 gate passes 123/123 on Node 22.22.3 and 24.15.0
  with SlopBrick typecheck on both runtimes.
- The recursive test gate passes Core 285, Engine 60, Website 54, and SlopBrick
  4,530 tests with 15 intentional skips; recursive typecheck and build pass.
- The targeted seven-module report run records 84.55% statements/lines, 77.27%
  branches, and 97.77% functions.
- The Task 18 security review reports no finding at confidence 8/10 or higher.
- Two independent final re-reviews returned 99/100 with no remaining findings.

### Boundary

- `CAL-002` remains `in_progress`; implementation WIP remains `2/2` and
  company WIP remains `0/1`.
- The one Task 15 evidence root remains the only aggregate hash used for its
  human-facing evidence set. Leaf SHA-256 bindings stay machine-only.
- The production provider remains `undefined`; the matrix and approval remain
  `applied: false`, and all evidence remains `admitted: false`.
- No runtime activation, push, tag, publish, deployment, or release is
  authorized by this revision.

## Revision 39 — 2026-07-22

### Changed

- Recorded the CAL-002 Task 17 implementation checkpoint through `61dc8f803`;
  the separate orchestration diagnosis is `36137d740`.
- Routed policy-known runnable authority through registry context creation, so
  blocked, superseded, and retired rules cannot instantiate even when a
  severity override requests them.
- Routed current score authority through the canonical effective-issue
  selector and worker Bayesian/composite inputs. Explicitly permitted
  diagnostics can remain visible, but score-ineligible findings cannot affect
  scoring or synthetic-composite chaining.
- Preserved explicit `off`, unknown-rule legacy fallback, shared scan/watch
  normalization, and the inactive production provider. Production scanner
  behavior therefore remains unchanged.
- Closed the independent-review gaps around dormant-provider composite
  fallback, explicit-off filtering of active-policy synthetic findings, and
  current-policy parity for the project-level identical-block coordinator.
- Advanced CAL-002 to Task 18: project current policy provenance through one
  first-scan evidence contract shared by terminal, JSON, Markdown, HTML, and
  SARIF.

### Evidence

- The exact nine-file Task 17 gate passes 188/188 on Node 22.22.3 and 24.15.0
  with SlopBrick typecheck on both runtimes.
- The recursive test gate passes Core 285, Engine 60, Website 54, and SlopBrick
  4,511 tests with 15 intentional skips; recursive typecheck and build pass.
- The post-correction targeted authority coverage run passes 141/141; the
  canonical score selector is fully covered, including its branches.
- The Task 17 security review reports no finding at confidence 8/10 or higher.
- Two independent final re-reviews returned 100/100 with no remaining
  findings.

### Boundary

- `CAL-002` remains `in_progress`; implementation WIP remains `2/2` and
  company WIP remains `0/1`.
- The one Task 15 evidence root remains the only aggregate hash repeated in
  human-facing authority docs. Leaf identities remain machine-only.
- The matrix and approval remain `applied: false`; all evidence remains
  `admitted: false`. No runtime activation, push, tag, publish, deployment, or
  release is recorded or authorized.

## Revision 38 — 2026-07-22

### Changed

- Recorded the CAL-002 Task 16 implementation checkpoint through `417ca5668`,
  after the clean-install schema-test dependency correction at `3c1572f89`.
- Added pure, fail-closed current-policy accessors that require a complete
  applied policy matching the exact owner-approved Task 15 projection, detach
  and freeze validated state, keep blocked/superseded/retired rows non-runnable,
  and separate explicit diagnostic visibility from score authority.
- Kept the production provider returning `undefined`; no registry, CLI, watch,
  worker, score, baseline, or report path consumes current policy in production.
- Kept the single Task 15 evidence root as the human-facing aggregate. Exact
  matrix, approval, and row identities remain machine-only bindings.
- Advanced CAL-002 to Task 17: integrate runnable and score authority through
  exact approved-policy mocks while the production provider remains inactive.

### Evidence

- The focused current-policy contract passes 7/7 on exact Node 22.22.3 and
  24.15.0 with SlopBrick typecheck on both runtimes.
- The recursive test gate passes Core 285, Engine 60, Website 54, and SlopBrick
  4,496 tests with 15 intentional skips; recursive typecheck and build pass.
- Two independent final reviews returned 99/100 and 100/100 with no findings.

### Boundary

- `CAL-002` remains `in_progress`; implementation WIP remains `2/2` and
  company WIP remains `0/1`.
- The matrix and approval remain `applied: false`; all evidence remains
  `admitted: false`. No runtime activation, push, tag, publish, deployment, or
  release is recorded or authorized.

## Revision 37 — 2026-07-22

### Changed

- Recorded both exact Task 15 owner decisions: the 26 transfer / 4 blocked / 3
  supersede / 7 retire authority batch and the exact 119-row matrix are
  approved.
- Recorded the primary immutable-evidence checkpoint at `6a85e4346`: all 41
  deterministic rows passed, 32 quality candidates remain deliberately
  unmeasured and score/gate-ineligible, and all 32 research-origin rows remain
  default-off and non-admitting.
- Recorded the additive evidence-manifest checkpoint at `80acf1ada`. Human-
  facing authority documents now cite one Task 15 evidence root while the
  manifest retains the exact sorted name, byte count, and file identity of all
  13 primary artifacts.
- Advanced CAL-002 to Task 16: pure validated current-policy accessors behind
  an inactive provider. Runtime scanner binding remains outside this slice.

### Evidence

- The integrated nine-file Task 15 preflight passes 122/122 on exact Node
  22.22.3 and 24.15.0.
- The deterministic reducer completed 41/41 rows with zero failed or source-
  shortage rows; the matrix/application adversarial gate passes 43/43.
- The final manifest and artifact-I/O focused gate passes 18/18 on both exact
  Node runtimes, with SlopBrick typecheck green on both.
- The single evidence root is
  `53ab07e7fd5dbbd09f595c87c255a636f3fb902abe7ec0cbfe923a5392198f8a`.
- Controller self-audit corrected fresh-checkout file-mode portability before
  checkpoint. Two rounds of independent reviewer attempts stalled and were
  closed, so no independent manifest-review approval is claimed.

### Boundary

- `CAL-002` remains `in_progress`; implementation WIP remains `2/2` and
  company WIP remains `0/1`.
- The matrix and approval remain `applied: false`; all evidence remains
  `admitted: false`. No runtime activation, push, tag, publish, deployment, or
  release is recorded or authorized.

## Revision 36 — 2026-07-20

### Changed

- Recorded Task 14 integration from `d7b11b70e` through `c13ce8f47`: the
  closed 119-row matrix reducer, approval and application contracts, six CLI
  commands, four new schemas, schema-registry hardening, and immutable receipt
  publication are now on main.
- Recorded exactly 41 evidence-ready deterministic rows: 32 starting plus nine
  transferred. Each row requires the five fixed protocol slots
  `alternate-syntax`, `baseline`, `comment-adjacent`, `near-miss`, and
  `regression-safe`; those slots are not semantic source families.
- Recorded top-level and per-control binding to frozen Corpus v1 source receipt
  SHA-256 `47bd66907ec2efa67da718e0cfb38458151ca84d3cdedc941488fe4b001475ac`.
  Durable receipts contain no raw source or path.
- Recorded receipt-first, policy-commit-marker-last paired publication with
  immutable destinations, shared session locks, fsync, and proof-limited
  rollback. Task 14 exercises only temporary fixtures and does not apply the
  proposed policy.
- Advanced CAL-002 to Task 15 Steps 1–3: integrated preflight, exact catalog
  replay, and presentation of the closed 26 transfer / 4 blocked / 3
  supersede / 7 retire authority batch for an explicit owner choice.

### Evidence

- Task 14 commit range: `d7b11b70e..c13ce8f47`.
- The expanded 13-file Task 13/14 gate passes 198/198 on exact Node 22.22.3
  and 24.15.0, with SlopBrick typecheck on both runtimes.
- The bounded Node 24 full suite passes 383 files with 5 skipped and 4,485
  tests with 15 skipped using `--maxWorkers=4 --minWorkers=1`.
- Independent final review returned `SPEC APPROVED` and
  `CODE QUALITY APPROVED`, with no Critical, Important, or Minor findings.
- The protected owner-state input remains mode 0600, 256 bytes, and SHA-256
  `07997204f63f9a03c16601f953ef078f1caaa8db7f7f8fca9ba4a73f3c6270fd`.

### Boundary

- `CAL-002` remains `in_progress`; implementation WIP remains `2/2` and
  company WIP remains `0/1`.
- The proposed policy remains `applied: false` and `admitted: false`. No Task
  15 owner decision, policy application, admission, push, tag, publish,
  deployment, or release is recorded or authorized.

## Revision 35 — 2026-07-20

### Changed

- Recorded CAL-002 Task 13 as integrated on main at `e956f7900` and
  `366246e5d`, with protected lock hardening at `8c8760783`. The originating
  sidecar commits `34bf81fe1` and `fa5d452c5` are provenance only.
- Task 13 projects exactly 32 canonical `research-only` origin rows. It binds
  frozen governing and replay identities, consumes no v1 owner-decision row,
  stores no raw source or path, and gives every row `runtimeOutcome: default-off`,
  `enabledByDefault: false`, `runnableByExplicitOptIn: true`,
  `scoreEligible: false`, `gateEligible: false`, and `admitted: false`. Task 13
  created no application artifact and did not apply policy; the proposed policy
  remains `applied: false`.
- Recorded independent specification and code-quality approval of the
  lock/session-lock alias hardening with no remaining findings.
- Advanced the next bounded action to Task 14: red-test/build the fail-closed
  exact 119-row v2 matrix, approval, and policy projection in `matrix-v2.ts`
  and `application-v2.ts`, four schemas, and CLI tests. Task 14 does not write
  a policy file under `src/rules`, consume an owner decision, create a durable
  receipt, apply policy, admit evidence, or perform a release action.

### Evidence

- `e956f7900`
- `366246e5d`
- `8c8760783`
- The revision-35 three-file one-worker gate passes 76/76 on exact Node
  22.22.3 and 24.15.0, with SlopBrick typecheck on both runtimes.
- On main, the protected owner-state assertion verified mode 0600, 256 bytes,
  and SHA-256
  `07997204f63f9a03c16601f953ef078f1caaa8db7f7f8fca9ba4a73f3c6270fd`.
- Revision 34's four-file 213/213 receipt remains preserved and reproducible.
- This checkpoint grants no authority to write runtime policy, admit evidence,
  push, tag, publish, deploy, or release. Remote state is outside this receipt.

## Revision 34 — 2026-07-20

### Changed

- Recorded CAL-002 progressive authority Task 12 as integrated at
  `473ceafc3` from originating implementation `5adba9714` after two independent
  final approvals.
- Added the fail-closed TypeScript-AST public-copy doctrine across exactly 73
  active quality rows, including descriptions, emitted messages and advice,
  `RULE_HINTS`, and the generated 119-row catalog. Current quality-facing copy
  no longer asserts AI/human causation or authorship; legacy provenance remains
  available in its separate historical boundary.
- Closed the pre-existing quality-disposition, parity, and supersession receipt
  schemas at `dd8360fba`, `b5bd09090`, and `66251c9fa` so malformed open shapes
  fail validation without creating or applying any receipt.
- Advanced the next bounded action to Task 13's exact 32-row research-origin
  v2 evidence projection and verifier.

### Evidence

- `473ceafc3`
- `dd8360fba`
- `b5bd09090`
- `66251c9fa`
- `docs/superpowers/plans/2026-07-19-cal-002-progressive-quality-authority.md`
- `docs/execution/evidence/CAL-002-complete-calibration.md`
- The revision-34 bounded gate runs exactly four named tests and passes 213/213
  on exact Node 22.22.3 and 24.15.0, with SlopBrick typecheck on both runtimes.
- The generated 119-row catalog replays identically on both runtimes at
  SHA-256
  `9bc6ede48b7df38d0b0e71be32691c3eebb9258817a95916752e442c7e771efd`.
- Protected owner state remains mode 0600, 256 bytes, and SHA-256
  `07997204f63f9a03c16601f953ef078f1caaa8db7f7f8fca9ba4a73f3c6270fd`.
- This checkpoint grants no authority to apply policy, admit evidence, push,
  tag, publish, deploy, or release. Remote state is outside this receipt.

## Revision 33 — 2026-07-19

### Changed

- Recorded CAL-002 progressive authority Task 11 as implementation-
  checkpointed at `651f52d78` after controller adversarial audit. Two
  independent reviewers stalled and were closed, so no external approval is
  claimed.
- Added complete security transfer fixtures for `security/hardcoded-secret`
  and `security/sql-construction`, closing the canonical nine-transfer set.
- Added the strict canonical 32-starting + 9-transferred = 41-row v2 oracle
  reducer and schema. It revalidates authority, frozen v1 evidence, hashes,
  Corpus v1 source binding, five control families, non-admission, and source/
  path exclusion; a failed row cannot become default-on.
- Recorded the narrow comment-mask correction exposed by the approved
  hardcoded-secret control. It preserves issue lines and does not change
  activation, policy, or admission.
- Advanced the next bounded action to Task 12's exact 73-row quality-only
  public-copy doctrine and generated-catalog guard.

### Evidence

- `651f52d78`
- `docs/superpowers/plans/2026-07-19-cal-002-progressive-quality-authority.md`
- `docs/execution/evidence/CAL-002-complete-calibration.md`
- The exact integrated Task 11 matrix plus signal-strength guardrails passes
  134/134 on Node 22.22.3 and 24.15.0 with SlopBrick typecheck on both.
- The scoped commit self-scan passed at AI Slop Score 4.2/100, Engineering
  Hygiene 100/100, and Security 100/100; its one low compression-profile
  diagnostic is informational and non-admitting.
- Protected owner state remains mode 0600, 256 bytes, and SHA-256
  `07997204f63f9a03c16601f953ef078f1caaa8db7f7f8fca9ba4a73f3c6270fd`.
- No durable oracle receipt, current-policy application, owner run, admission,
  push, tag, publish, deploy, or release was produced.

## Revision 32 — 2026-07-19

### Changed

- Recorded CAL-002 progressive authority Task 10 as implementation-
  checkpointed at `aeef2915a` after controller adversarial audit. Its
  independent reviewer stalled and was closed, so no external approval is
  claimed.
- Added complete real-execution transfer fixtures for `dead/unreachable`,
  `dead/unused-import`, `dead/unused-local`, and `dead/unused-parameter`, with
  exact positive, negative, adversarial, and five-family controls.
- Recorded the narrow classic React/JSX runtime guard exposed by the approved
  unused-import control. It requires the exact default name/source and actual
  JSX and does not change activation, default state, policy, or admission.
- Advanced the next bounded action to Task 11's two security transfers and
  combined exact 41-row v2 oracle receipt.

### Evidence

- `aeef2915a`
- `docs/superpowers/plans/2026-07-19-cal-002-progressive-quality-authority.md`
- `docs/execution/evidence/CAL-002-complete-calibration.md`
- The exact Task 10 matrix passes 50/50 on Node 22.22.3 and 24.15.0 with
  SlopBrick typecheck on both; 45 broader visitor assertions and signal-
  strength guardrails pass.
- Protected owner state remains mode 0600, 256 bytes, and SHA-256
  `07997204f63f9a03c16601f953ef078f1caaa8db7f7f8fca9ba4a73f3c6270fd`.
- No durable transfer-oracle receipt, current-policy application, owner run,
  admission, push, tag, publish, deploy, or release was produced.

## Revision 31 — 2026-07-19

### Changed

- Recorded CAL-002 progressive authority Task 9 as implementation-
  checkpointed at `33ea0d732` after controller adversarial audit. The
  independent reviewer stalled and was closed, so no external approval is
  claimed.
- Added the reusable nine-ID transferred-oracle fixture contract, canonical
  five-family control order, normalized language-path and unique-identity
  guards, and source-free/path-free durable case projection.
- Recorded complete positive, negative, adversarial, and five-family cases for
  `cpp/c-style-cast`, `cpp/raw-new-delete`, and `rust/todo-macro` through real
  parser/facts/rule execution.
- Recorded the bounded `cpp/c-style-cast` comment-masking correction exposed by
  the approved comment-adjacent control. It preserves source offsets and does
  not change rule activation, default state, policy, admission, or release.
- Advanced the next bounded action to Task 10's four dead-code and unused-
  binding transfer fixtures and native controls.

### Evidence

- `33ea0d732`
- `docs/superpowers/plans/2026-07-19-cal-002-progressive-quality-authority.md`
- `docs/execution/evidence/CAL-002-complete-calibration.md`
- The exact Task 9 matrix passes 53/53 on Node 22.22.3 and 24.15.0 with
  SlopBrick typecheck on both runtimes; signal-strength guardrails also pass.
- Protected owner state remains mode 0600, 256 bytes, and SHA-256
  `07997204f63f9a03c16601f953ef078f1caaa8db7f7f8fca9ba4a73f3c6270fd`.
- No durable transfer-oracle receipt, current-policy application, owner run,
  admission, push, tag, publish, deploy, or release was produced.

## Revision 30 — 2026-07-19

### Changed

- Recorded CAL-002 progressive authority Tasks 1–8 as implementation-
  checkpointed and independently approved through `e8e62b779`.
- Recorded Task 6's bounded linear SQL CTE parser and canonical parity fixture
  after corrections for pathological backtracking, broad prose, terminal
  `SELECT` without `FROM`, multiple CTEs, and all four approved terminal DML
  forms.
- Recorded Task 7's five-`console.log` clustering in a true 30-line inclusive
  span after its physical-line boundary correction, while retaining the
  production-sized exact 10/9 total-debug behavior and canonical guards.
- Recorded Task 8's unchanged declaration-ratio detector and threshold,
  explicit rejection of the old line denominator, retained annotation/
  assertion/generic reach, and quality-only public framing.
- Advanced the next bounded action to Task 9's shared transfer-oracle fixture
  contract and complete C++/Rust deterministic cases.
- Preserved active `SB-UX-001` and `CAL-002` at implementation WIP `2/2`.
  The workspace rule implementations changed as specified, but no default
  state, score, baseline, current policy, owner state, application, admission,
  release, deployment, tag, publish, or push changed.

### Evidence

- `docs/superpowers/plans/2026-07-19-cal-002-progressive-quality-authority.md`
- `docs/execution/plans/CAL-002-complete-calibration.md`
- `docs/execution/evidence/CAL-002-complete-calibration.md`
- Task 6 passes 31 focused tests, Task 7 passes 21, and Task 8 passes 17. The
  integrated Tasks 6–8 matrix passes 51/51 on exact Node 22.22.3 and 24.15.0
  with SlopBrick typecheck on both runtimes.
- The parity receipts produced in tests use synthetic valid commit SHAs; no
  durable actual-commit parity or supersession receipt was written, and the
  old rule IDs remain runnable pending a later atomic policy application.

## Revision 29 — 2026-07-19

### Changed

- Recorded CAL-002 progressive authority Tasks 1–5 as implementation-
  checkpointed and independently approved through `67a777c27`.
- Recorded Task 4's exact 32-row zero-label quality disposition and optional
  readiness-gated private cohort planner. The disposition is non-admitting,
  keeps every row disabled/score-neutral/gate-neutral, and does not claim a
  safe repair.
- Recorded Task 5's fixed SQL, console, and `any` parity cases, required fields
  for independent future migration commits, and exact three-row non-admitting
  supersession contract. The rule migrations remain Tasks 6–8.
- Advanced the next bounded action to the parallel-safe Tasks 6–8 parity wave:
  SQL CTE coverage, console five-in-thirty clustering guards, and declaration-
  ratio `any` density without the rejected line-based heuristic.
- Preserved active `SB-UX-001` and `CAL-002` at implementation WIP `2/2`.
  No protected owner workflow was run and no authority proposal, private
  cohort, quality receipt, parity receipt, supersession receipt, runtime
  policy, application, admission, or release state was created.

### Evidence

- `docs/superpowers/plans/2026-07-19-cal-002-progressive-quality-authority.md`
- `docs/execution/plans/CAL-002-complete-calibration.md`
- `docs/execution/evidence/CAL-002-complete-calibration.md`
- Task 4's final focused matrix passes 92/92 on exact Node 22.22.3 and 24.15.0
  with typecheck on both; the integrated Task 4 + Task 5 matrix passes 101/101
  on both runtimes with typecheck on both.
- This implementation checkpoint changes no live owner state, runtime policy,
  package version, rule activation, score, source, baseline, admission,
  release, deployment, tag, publish, push, or acquired data.

## Revision 28 — 2026-07-19

### Changed

- Approved UseBrick as the sole customer-facing coherence and verification
  product, with one repository-owned contract shared by developers, coding
  agents, and CI. SlopBrick remains the shipped npm package, current CLI, free
  local scanner, and acquisition surface; Memory, Lock, Mend, and Render Labs
  remain bounded capabilities rather than separate products or packages.
- Added one dated market-positioning note that separates observed evidence
  from assumptions and scenarios. Cross-study seat and spend arithmetic is not
  a measured UseBrick market, forecast, or product-demand claim.
- Moved `GTM-001` from `parked` to `ready` for planning 10–20 consent-safe
  observed external sessions. Completed sessions remain **0** and outreach is
  `false`; the next action prepares a participant profile, script, consent
  text, and redacted receipt without contacting or scheduling anyone.
- Added draft `LABS-001` to compare source-only work with rendered/runtime
  evidence using fixed defects, blind scoring, equal model/time budgets,
  incremental detection and false-positive measures, and an explicit stop
  decision.
- Preserved active `SB-UX-001` and `CAL-002` at implementation WIP `2/2` and
  company WIP at `0/1`. Ready and draft plans consume no WIP.
- Recorded CAL-002 progressive authority Tasks 1–3 as implementation-
  checkpointed and independently approved through `5f5a1c554`. The next
  bounded action is Task 4's exact 32-row zero-label quality disposition and
  optional readiness-gated cohort plan. No protected owner workflow was run,
  and no runtime policy, application, admission, or release state changed.

### Evidence

- `docs/superpowers/specs/2026-07-19-usebrick-coherence-positioning-design.md`
- `docs/research/usebrick-market-positioning-2026-07-19.md`
- `docs/superpowers/plans/2026-07-19-usebrick-coherence-docs.md`
- `docs/superpowers/plans/2026-07-19-cal-002-progressive-quality-authority.md`
- `docs/execution/plans/GTM-001-vibecoder-pilots.md`
- `docs/execution/plans/LABS-001-rendered-evidence-benchmark.md`
- This strategy and execution-document revision changes no runtime code,
  package version, rule, score, source, baseline, calibration application,
  admission, historical evidence, or protected owner state. It authorizes no
  outreach, participant data, push, tag, GitHub Release, npm publication,
  website deployment, or public release.

## Revision 27 — 2026-07-19

### Changed

- Reconciled the execution control plane to the approved additive CAL-002 v2
  authority amendment. The v1 implementation boundary remains checkpointed
  through `e6c9695ea`, and the old three-way origin questionnaire is paused
  after one historical hold.
- Locked the whole-catalog projection at 47 starting quality + 26 transferred
  quality + 4 blocked quality + 3 superseded + 7 retired + 32 research-origin
  rows = 119. The owner-row transition is exactly `26/4/3/7`; blocked rows
  remain assignment-ineligible.
- Kept `CAL-002` `in_progress`, implementation WIP at `2/2`, and the proposed
  policy `applied: false` and `admitted: false`. Local application remains
  distinct from push, tag, publish, deploy, and release authority.

### Evidence

- `docs/execution/plans/CAL-002-complete-calibration.md`
- `docs/execution/evidence/CAL-002-complete-calibration.md`
- This documentation-only reconciliation changed no runtime policy, frozen
  evidence artifact, owner state, rule, score, source, baseline, admission,
  release, deployment, tag, publish, push, or acquired data.

## Revision 26 — 2026-07-18

### Changed

- Entered `CAL-002` from the approved complete-calibration design and detailed
  plan. It is active beside `SB-UX-001` to resolve separate quality and origin
  evidence lanes, then apply one reviewed non-admitting 119-row policy
  atomically and expose current-versus-legacy first-scan provenance.
- Returned `VAL-001` to `ready` while retaining `VAL-001-RUN-001`. `SB-UX-001`
  remains active with CAL-002 as its evidence-provenance closeout gate;
  `TEL-001` remains ready. Implementation WIP remains exactly `2/2`:
  `SB-UX-001` and `CAL-002`.
- Kept `REL-001` and every public release boundary unchanged. No rule, score,
  source, baseline, admission, release, deployment, tag, publish, push, or
  acquired data changed in this revision.

### Evidence

- `docs/superpowers/specs/2026-07-18-complete-calibration-program-design.md`
- `docs/superpowers/plans/2026-07-18-complete-calibration-program.md`
- `docs/execution/plans/CAL-002-complete-calibration.md`
- `docs/execution/evidence/CAL-002-complete-calibration.md`
- This control-plane revision creates no calibration implementation, policy
  application, or red/green test evidence; the next action is the red CAL-002
  catalog and local-schema contract tests.

## Revision 25 — 2026-07-18

### Changed

- Approved execution of the reviewed `SB-UX-001` detailed implementation plan
  and moved it from `ready` to `in_progress` in the second implementation WIP
  slot. `VAL-001` remains `in_progress` in the first slot; `TEL-001` remains
  ready.
- Set the first code action to the failing first-scan projection tests for the
  owner-observed calibrated, no-safe-repair, and unchanged-rescan states.
- Reconciled the roadmap, status snapshot, bounded plan, and execution index at
  revision 25. No score, rule, baseline, source, release, or public artifact
  changed.

### Evidence

- `docs/execution/plans/SB-UX-001-first-scan.md`
- `specs/PLAN-AUDIT_LATEST.md`
- `specs/IMPACT_LATEST.md`
- This execution transition changes documentation only; no product code or
  TDD red/green evidence is required at this checkpoint.

## Revision 24 — 2026-07-18

### Changed

- Prepared the reviewed eight-task `SB-UX-001` TDD implementation plan around
  one additive first-scan projection, five exhaustive areas, a single
  Repository Health headline, no more than three rule-grouped actions, and a
  backward-compatible new/resolved/unchanged baseline delta.
- Locked evidence labels to finding-level deterministic evidence, measured
  rule behavior with an explicit non-authorship claim, and advisory review.
  Only finding-bound fixes may be described as safe; the owner-observed
  Heaps/Zipf state must say that no safe bounded repair is available.
- Kept `SB-UX-001` `ready` and implementation WIP at `1/2`. Product-code
  execution starts only when Task 1 moves it to `in_progress`; `TEL-001`
  remains ready behind the typed first-scan boundary.

### Evidence

- `docs/superpowers/plans/2026-07-18-slopbrick-first-scan-experience.md`
- `specs/PLAN-AUDIT_LATEST.md`
- `specs/IMPACT_LATEST.md`
- This planning checkpoint changes no product code, report bytes, baseline,
  score, threshold, rule state, CAL-001 row, corpus state, release decision, or
  public artifact.

## Revision 23 — 2026-07-18

### Changed

- Started `VAL-001` with the first real repository-owner walkthrough and moved
  it from `ready` to `in_progress`, consuming one of two implementation WIP
  slots.
- Recorded `VAL-001-RUN-001` against the package-local v0.45 candidate: both
  full scans completed 270/270 files with zero runtime failures, 11 active
  medium hygiene findings, 690 audit-only suppressed findings, AI Slop Score
  `0.0`, and exit `0`.
- Preserved the owner's explicit `useful` decision while recording that the
  file-level Heaps/Zipf evidence exposed no safe bounded repair. No source edit
  was made, and the repeated scan reproduced every decision-bearing outcome.
- Routed the observed `useful + no safe action + unchanged rescan` states into
  the ready `SB-UX-001` and `TEL-001` contracts without starting either plan.

### Evidence

- `docs/execution/evidence/VAL-001-owner-validation.md`
- The target source SHA-256 remained
  `58d6fc3f02edd1b36b4edb322672752c8438586588b9b4e21b6b91d0e648bdcc`.
- The stale local score baseline was rejected for a config-hash mismatch and
  was not refreshed. No CAL-001 row, threshold, default state, score formula,
  corpus admission, participant state, release decision, or public artifact
  changed.

## Revision 22 — 2026-07-18

### Changed

- Split completed local SlopBrick qualification from public release authority:
  `SB-045` now ends at the local go/no-go packet, while new `REL-001` owns the
  independent npm and website dispositions.
- Removed the false scheduler dependency on a public decision. `SB-UX-001` and
  `TEL-001` retain their `SB-045` requirement, which is now satisfied, and move
  to `ready`; priority keeps first-scan UX ahead of the outcome-event contract.
- Kept `VAL-001` ready for real owner-selected runs and `GTM-001` parked with no
  participant recruitment or target-count gate.
- Recorded the completed recovery integration at
  `11769b3a6d88faa94b16e8a3de96536a8bbc5ca6`: `main` and `origin/main`
  converged after the installed pre-push gate, without a tag, GitHub Release,
  npm publish, or website deployment.
- Corrected the current status risk entry for `ci --max-new-issues`; `SB-045`
  implemented its stable-identity new-debt contract, so it is no longer an
  advertised silent no-op.

### Status transitions

- `SB-045`: `waiting_external` -> `done` (local qualification complete).
- `REL-001`: added as `waiting_external` (explicit npm and website owner
  dispositions only; no WIP consumed).
- `SB-UX-001`: `draft` -> `ready` (next local implementation plan).
- `TEL-001`: `draft` -> `ready` (ordered after the first UX contract).

### Evidence

- `docs/superpowers/specs/2026-07-18-release-boundary-split-design.md`
- `docs/execution/evidence/SB-045-release-qualification.md`
- `docs/execution/evidence/REL-001-public-claim-disposition.md`
- JSON parsing, the 16-plan control-plane validator, all 20 validator tests,
  explicit transition/self-dependency assertions, and `git diff --check`
  passed with implementation WIP `0/2` and company WIP `0/1`.
- This planning revision changes no product code and authorizes no tag, GitHub
  Release, npm publish, website deployment, participant action, or rule-state
  change.

## Revision 21 — 2026-07-18

### Changed

- Hardened the CORPUS-002 requested-use assertion so it rederives the canonical
  disposition and rejects malformed runtime enums plus duplicated, reordered,
  narrowed, or manually widened permitted-use arrays.
- Expanded the pure-policy matrix to exercise every authority, integrity,
  rights, and requested-use combination and to prove deterministic canonical
  output.
- Closed final current-document drift: the roadmap now treats CORPUS-002 as
  completed; SB-045 and DOC-PRUNE-001 no longer call it parallel work; MEND-001
  uses owner-controlled validation instead of pilot users or repositories; and
  the future LockBrick evidence path is owner-validation named.

### Evidence

- The review-first policy run reproduced five failures against the original
  assertion. After hardening, the policy file passed 22/22 tests.
- Portable Corpus v1 verification passed 10 files and 65 tests with 6 explicit
  real-source skips; opt-in real-source verification passed 6 files and 41
  tests with no source mutation and unchanged frozen hashes.
- Final recursive lint, typecheck, test, and build gates passed. The package
  test totals were Core 285, Website 47, Engine 60, and SlopBrick 3,852 passed
  with 15 explicit SlopBrick opt-in skips; the build emitted only the existing
  non-fatal Zod declaration-bundling warnings.
- No source acquisition, redistribution, participant action, rule-state
  change, publish, deployment, tag, push, or remote mutation occurred.

## Revision 20 — 2026-07-18

### Changed

- Completed CORPUS-002 with a pure source-use policy, closed source registry,
  inventory disposition, and fail-closed manifest preflight.
- Routed the verified Mendeley source to internal origin measurement and
  calibration evaluation while keeping FormAI, OSSForge, and controlled
  HumanEval non-executable under their current dispositions.
- Preserved all eight frozen Corpus v1/CAL-001 artifact hashes and kept source
  use separate from redistribution, v10.3 admission, usefulness review, and
  rule application.
- Converged current roadmap, architecture, methodology, package, calibration,
  and execution documentation on the owner-only validation path. VAL-001 stays
  ready; GTM-001 stays parked.

### Evidence

- `docs/execution/evidence/CORPUS-002-source-disposition.md`
- Portable Corpus v1 verification passed 10 files and 57 tests with 6 explicit
  real-source skips; the opt-in real-source verification passed 6 files and 41
  tests and reproduced all frozen hashes.
- Recursive lint, typecheck, test, and build gates passed. The package test
  totals were Core 285, Website 47, Engine 60, and SlopBrick 3,844 passed with
  15 explicit SlopBrick opt-in skips.
- No source acquisition, redistribution, participant action, rule-state
  change, publish, deployment, tag, push, or remote mutation occurred.

## Revision 19 — 2026-07-18

### Changed

- Started CORPUS-002 to route reviewed Corpus v1 sources by authority,
  integrity, rights, and permitted use without changing source bytes or any
  completed Corpus v1/CAL-001 evidence.
- Added VAL-001 as an owner-only scan-to-rescan validation contract with an
  intentionally empty ledger; the repository owner is the only current tester.
- Parked GTM-001 and removed it from active implementation dependencies. Its
  consent-safe protocol remains dormant with zero sessions and no recruitment
  authorization.
- Kept future team and enterprise demand explicitly unproven; owner testing
  cannot satisfy `future-external-demand-evidence`.

### Evidence

- `docs/superpowers/specs/2026-07-18-corpus-source-use-routing-design.md`
- `docs/execution/plans/CORPUS-002-source-use-routing.md`
- `docs/execution/plans/VAL-001-owner-validation.md`
- `docs/execution/evidence/VAL-001-owner-validation.md`
- No source acquisition, participant action, rule-state change, publish,
  deployment, tag, push, or remote mutation occurred.

## Revision 18 — 2026-07-18

### Changed

- Reran the current checkout's recursive lint, typecheck, full test, and build
  gates; all passed with no tracked generated-file drift.
- Rechecked the live site read-only; it remains the published v0.43.0 artifact
  with the previously recorded rule-count and privacy-copy contradictions.
- Refreshed the canonical snapshot and SB-045 plan so the current green run is
  separated from the older host-sensitive qualification receipt.

### Evidence

- `docs/execution/STATUS.md`
- `docs/execution/plans/SB-045-trust-release.md`
- `docs/execution/index.json`
- No publish, deployment, tag, push, admission, or remote mutation occurred.

## Revision 17 — 2026-07-17

### Changed

- Reran the current checkout's recursive lint, typecheck, full test, and build
  gates after the CAL-001 holdout and decision-matrix slice; all passed.
- Updated the canonical status snapshot so the current gate state is not
  confused with the older SB-045 host-sensitive qualification receipt.

### Evidence

- `docs/execution/STATUS.md`
- `docs/execution/index.json`
- No publish, deployment, tag, push, admission, or remote mutation occurred.

## Revision 16 — 2026-07-17

### Changed

- Completed the bounded CAL-001 decision boundary with a deterministic matrix
  covering all 119 registry rules: 72 AI-specific rows remain `default-off`
  and 47 non-AI rows remain `quality-only`.
- Recorded 40 AI-specific rows as `owner-review-required` because the matrix
  does not silently change current shipped policy; the output is
  `applied: false` and `admitted: false`.
- Marked CAL-001 `done` for this protocol while leaving independent
  usefulness review, threshold changes, default-state changes, and admission
  as a new owner-reviewed follow-up boundary.

### Evidence

- `docs/execution/evidence/CAL-001-calibration-decision-matrix.md`
- `docs/execution/plans/CAL-001-heldout-calibration.md`
- `docs/execution/index.json`
- No publish, deployment, tag, push, admission, or remote mutation occurred.

## Revision 15 — 2026-07-17

### Changed

- Executed the frozen CAL-001 Corpus v1 holdout at
  `45d2dd038107d3d1d7731192126bf0d48dd6f84b` with one worker across all
  10,000 eligible source-bound rows: 7,970 train, 991 validation, and 1,039
  test.
- Recorded 10,000/10,000 successful scans with zero parse, timeout, scanner,
  exact cross-label, normalized cross-label, or family-split leakage failures.
- Kept the result diagnostic-only with binary scanner output measured as-is;
  no threshold was fitted or selected, no rule was activated, and usefulness
  and admission remain unevaluated.
- Kept CAL-001 `in_progress` for the per-rule confound review and bounded
  non-admitting decision matrix.

### Evidence

- `docs/execution/evidence/CAL-001-calibration-holdout-receipt.md`
- `docs/execution/plans/CAL-001-heldout-calibration.md`
- `docs/execution/index.json`
- No publish, deployment, tag, push, admission, or remote mutation occurred.

## Revision 14 — 2026-07-17

### Changed

- Added the deterministic CAL-001 100-positive/100-negative one-worker smoke
  adapter and package runner without admitting data, tuning thresholds, or
  activating rules.
- Recorded the source-bound scanner receipt and path-free metrics: 200/200
  selected files succeeded, the catalog contained 119 rules, and the receipt
  remains `admitted: false`.
- Bound the smoke evidence to the frozen protocol, Corpus v1 manifests,
  source-binding receipt, eligible projection, implementation commit, and
  repeated byte-identical output hashes.
- Moved CAL-001 to `in_progress` for the full frozen holdout evaluation while
  keeping GTM-001 `ready` until a real pilot is scheduled.

### Evidence

- `docs/execution/evidence/CAL-001-calibration-smoke-receipt.md`
- `docs/execution/plans/CAL-001-heldout-calibration.md`
- `docs/execution/index.json`
- No threshold, default state, admission, publish, deployment, or remote
  mutation occurred.

## Revision 13 — 2026-07-17

### Changed

- Created and froze the `CAL-001-v1` leakage-safe calibration protocol at
  `docs/execution/evidence/CAL-001-protocol.md`.
- Bound the protocol to the verified Corpus v1 candidate, source-binding,
  family-safe split, eligible projection, and non-admitting smoke receipts.
- Registered the required train/validation/test boundary, per-rule metrics,
  confound and leakage report, separate origin/usefulness tables, and the
  admission-matrix contract before any calibration run.
- Moved CAL-001 from `draft` to `ready`; no calibration smoke, heldout
  evaluation, rule activation, admission decision, publish, deployment, or
  remote mutation occurred.

### Evidence

- `docs/execution/evidence/CAL-001-protocol.md`
- `docs/execution/plans/CAL-001-heldout-calibration.md`
- `docs/execution/index.json`
- No calibration result or new admission claim was created.

## Revision 12 — 2026-07-17

### Changed

- Moved `SB-045` from `in_progress` to `waiting_external` after a read-only
  live-site check confirmed the remaining claim drift. The exact resume input
  is now an owner decision to deploy a named reviewed SHA or to keep the live
  v0.43 site unchanged while v0.45 remains local-only.
- Created the consent-safe `GTM-001` pilot protocol and blank outcome table at
  `docs/research/vibecoder-pilots.md`. It records zero sessions, forbids raw
  source and identity collection by default, and keeps participant behavior
  separate from calibration evidence.
- Kept GTM-001 `ready` until the first pilot is actually scheduled; no
  participant recruitment, external message, publish, deployment, or remote
  mutation occurred.

### Evidence

- `docs/execution/plans/SB-045-trust-release.md`
- `docs/execution/plans/GTM-001-vibecoder-pilots.md`
- `docs/research/vibecoder-pilots.md`
- No tag, push, release, publish, deployment, admission, or remote mutation
  occurred.

## Revision 11 — 2026-07-17

### Changed

- Resolved the SB-045 self-scan no-go without changing the score threshold or
  claiming current v10.3 calibration: `ai/compression-profile` is now
  explicitly default-off/opt-in because the current admitted v10.3 evidence
  set is zero. Historical calibration metadata remains diagnostic-only.
- Added the red/green signal-strength contract and updated synthetic score
  fixtures to opt in explicitly when they are testing the calibration signal.
- Regenerated the local website product facts so the candidate's
  `defaultOffCount` is 37 and the compression signal is represented as
  default-off in the artifact-derived metadata.
- Re-ran the exact package-local self-scan: 263/263 files analyzed, zero
  runtime failures, zero active AI-specific signals, 11 non-AI hygiene
  findings, 671 audit-only suppressed findings, AI Slop Score `0.0 <= 15`,
  and process exit `0`.
- Recorded the serialized full-package receipt at 350 files and 3,822 tests
  passed with 5 files and 15 tests skipped. Recursive typecheck/build pass;
  the recursive test command retains seven host-sensitive failures in beacon,
  special-mode, and sandboxed packed-install cases, all isolated from the
  green package receipt.
- Packed Node 22/24 diagnostic passed against tarball SHA-256
  `a1289b32f42e6b1018661918ea866f88f2d5757c1a769c34b96eb596fcb7555e`.

### Evidence

- `docs/execution/evidence/SB-045-gate-decision.md`
- `docs/execution/evidence/SB-045-release-qualification.md`
- No tag, push, release, publish, deployment, admission, or remote mutation
  occurred.

## Revision 10 — 2026-07-17

### Changed

- Completed the SB-045 trust-release implementation checkpoint at
  `aa2bb36328da0434a6fea7a1fba24552de9c78af`: one typed gate decision now
  drives report projections and scan exit, incomplete scans fail closed, and
  fix/dry-run/heatmap paths cannot bypass the decision.
- Bound automated fixes to finding identity and source/target snapshots, with
  explicit stale/ambiguous/unbound skip reasons and no gated opportunistic
  file-wide codemods.
- Implemented the durable finding-identity debt baseline and tested
  `ci --max-new-issues` against current-versus-new debt, including fail-closed
  missing/config-mismatched baseline behavior.
- Completed the current release qualification: recursive typecheck, tests,
  build, RAM-safe package tests, and packed Node 22/24 diagnostic are green.
  The package-local self-scan is complete but remains a no-go at
  `18.831558603262913 > 15`.

### Evidence

- `docs/execution/evidence/SB-045-gate-decision.md`
- `docs/execution/evidence/SB-045-release-qualification.md`
- No tag, push, release, publish, deployment, admission, or remote mutation
  occurred.

## Revision 9 — 2026-07-17

### Changed

- Completed the bounded post-smoke eligible local projection and its
  independent cross-label leak audit.
- The pinned source retained 5,000 positive and 5,000 negative eligible rows,
  with 7,970 train, 991 validation, and 1,039 test rows; quarantine and
  unresolved exact/normalized cross-label counts were zero.
- The eligible manifest SHA-256 is
  `286134799c7f75837a7c292f0d18721d8da9263c25c041eef0ac4734801b52d8`; the
  projection receipt SHA-256 is
  `9f5274f57ed4adf9d1c1ef55205493e9a833abc86cb8e1ca2b332cd8c72d28ba`.
- The receipt records one worker, 10,000 candidate rows read, 10,000 eligible
  rows projected, 6,195,562 accounted bytes, and an 11,406-byte maximum unit.
  Corpus v1 remains source-attested, internal-analysis, and non-admitting.

### Evidence

- `packages/slopbrick/src/calibration/corpus-v1/eligible.ts`
- `packages/slopbrick/tests/calibration/corpus-v1-eligible.test.ts`
- `docs/execution/evidence/CORPUS-001-seed-receipt.md`
- No corpus source byte, admission record, remote repository, release, publish,
  deployment, or archive state changed.

## Revision 8 — 2026-07-17

### Changed

- Added the non-admitting Corpus v1 smoke builder and red-first contract test.
- The builder selects exactly 100 unique exact-content eligible units per
  publisher-declared polarity using the versioned hash-ranked policy
  `corpus-v1-smoke-hash-rank-v1`; same-label exact duplicates use the
  lexicographically smallest eligible source record as the counting owner.
- The pinned source produced a deterministic 200-row smoke with 159 train, 17
  validation, and 24 test rows. The manifest SHA-256 is
  `bdbcd43279077fa760ae3c99da05b953c38134022fa34626b69a6b6400be00de`; the
  receipt SHA-256 is
  `ccd74f7b9db49adc802c042df0d7b732d8284d2bbfc4e6ec39e6a1c001c60830`.
- The receipt binds the source-binding receipt, candidate-manifest hash, and
  leakage-plan hash, and explicitly remains `publisher_attested`,
  `internal_analysis`, and `admitted: false`.

### Evidence

- `packages/slopbrick/src/calibration/corpus-v1/smoke.ts`
- `packages/slopbrick/tests/calibration/corpus-v1-smoke.test.ts`
- `docs/execution/evidence/CORPUS-001-seed-receipt.md`
- No corpus source byte, admission record, remote repository, release, publish,
  deployment, or archive state changed.

## Revision 7 — 2026-07-17

### Changed

- Parsed the pinned publisher CSV directly with strict multiline/quote/UTF-8
  handling and reconciled all 10,000 rows one-to-one with the projection.
- Bound each publisher row's ordinal, deterministic record ID, problem, AI or
  Human polarity, language, source claim, byte count, and both content hashes.
- Frozen row-binding SHA-256
  `86b46373ba0cae5149a722777eeff537b27c7a8d43fd8259fa8c197ea1bd300c`
  and receipt SHA-256
  `47bd66907ec2efa67da718e0cfb38458151ca84d3cdedc941488fe4b001475ac`
  were reproduced across independent reads.
- Advanced `CORPUS-001` to the deterministic 100-positive/100-negative smoke.

### Evidence

- `packages/slopbrick/src/calibration/corpus-v1/source-binding.ts`
- `packages/slopbrick/tests/calibration/corpus-v1-source-binding.test.ts`
- `docs/execution/evidence/CORPUS-001-seed-receipt.md`
- No corpus source byte, admission record, remote repository, release, publish,
  deployment, or archive state changed.

## Revision 6 — 2026-07-17

### Changed

- Quarantined exact and normalized cross-label collision groups before split
  assignment and propagated quarantine to every member of an affected family.
- Kept each family and same-label exact/normalized duplicate group inside one
  deterministic, versioned 80/10/10 hash bucket.
- Verified the 10,000-row candidate plan with zero exact and zero normalized
  cross-label collision rows: 7,970 train, 991 validation, 1,039 test, and zero
  quarantine rows. Canonical plan SHA-256:
  `9c4638526e9a4161d3e74f70197f0b25717439e6bd477bef98664a03c9a9219c`.
- Advanced `CORPUS-001` to raw CSV row binding. Publisher label/source columns
  must reconcile to every projection row before the 100/100 smoke.

### Evidence

- `packages/slopbrick/src/calibration/corpus-v1/plan.ts`
- `packages/slopbrick/tests/calibration/corpus-v1-plan.test.ts`
- `docs/execution/evidence/CORPUS-001-seed-receipt.md`
- No corpus source byte, admission record, remote repository, release, publish,
  deployment, or archive state changed.

## Revision 5 — 2026-07-17

### Changed

- Rehashed all 10,000 pinned Mendeley projection units through one-file-at-a-
  time reads and emitted deterministic candidate rows with content and
  normalized hashes, family keys, source authority, license evidence, and
  `internal_analysis` rights disposition.
- Verified 5,000 positive and 5,000 negative candidate rows with zero local
  integrity quarantines; two real-source projections produced manifest
  SHA-256 `c15d3cbc95f251b5a0514da14b3f8a90e26124fbfb7db5ce342a873635b383ac`.
- Kept every row at `split: unassigned` and candidate-only. Cross-label
  collision quarantine, family-safe splits, smoke receipts, admission, raw CSV
  row binding, and calibration remain open.

### Evidence

- `packages/slopbrick/src/calibration/corpus-v1/manifest.ts`
- `packages/slopbrick/tests/calibration/corpus-v1-manifest.test.ts`
- `docs/execution/evidence/CORPUS-001-seed-receipt.md`
- No corpus source byte, remote repository, release, publish, deployment, or
  archive state changed.

## Revision 4 — 2026-07-17

### Changed

- Verified the bounded, read-only Corpus v1 inventory against the pinned local
  Mendeley projection: 10,000 rows and regular files, split 5,000 publisher-
  declared AI positives and 5,000 publisher-declared Human negatives.
- Kept the result at `publisher_attested` / `internal_analysis`: it is not
  witnessed authorship, a quality label, redistribution approval, leakage
  proof, or corpus admission.
- Advanced `CORPUS-001` to the deterministic manifest-projection checkpoint;
  per-unit rehashing, normalized collision checks, family-aware splits, smoke
  receipts, and admission remain open.

### Evidence

- `packages/slopbrick/src/calibration/corpus-v1/inventory.ts`
- `packages/slopbrick/tests/calibration/corpus-v1-inventory.test.ts`
- `docs/execution/evidence/CORPUS-001-seed-receipt.md`
- No source corpus bytes, remote repository, release, publish, deployment, or
  archive state changed.

## Revision 3 — 2026-07-17

### Changed

- Completed the additive documentation control plane and reconciled current
  roadmap, package, generated CLI/MCP, calibration, public-artifact, website,
  and workflow claims without publishing or deploying them.
- Pinned public v0.43 facts to a verified npm release receipt while keeping the
  unreleased v0.45 workspace candidate visibly separate.
- Accepted the Corpus v1 admission decision as an internal-analysis contract:
  publisher-attested origin labels are not witnessed authorship, quality, gold
  labels, or redistribution permission.
- Isolated the exact nineteen-path stale-document inventory in
  `DOC-PRUNE-001`; no listed path was moved or deleted without owner approval.
- Hardened deployment ordering and privileged `workflow_run` handling, and
  hardened plan/archive validation against hollow sections and symlinked or
  non-regular archive targets.

### Status transitions

- `PLAT-001`: `in_progress` -> `done` (canonical authority and current-truth
  reconciliation implemented and reviewed).
- `CORPUS-DEC-001`: `ready` -> `done` (admission ADR accepted).
- `CORPUS-001`: `draft` -> `in_progress` (bounded read-only inventory test is
  now the active corpus action).
- `DOC-PRUNE-001`: added as `waiting_external` (exact path approval only; it
  does not block the active implementation or company lanes).

### Evidence

- `packages/website/src/data/published-release-receipt.json`
- `docs/decisions/corpus-v1-admission.md`
- `scripts/validate-execution-docs.test.mjs`
- `.github/workflows/deploy-website.yml`
- `packages/website/tests/a11y/live-terminal.spec.ts`
- No release, publish, deployment, branch push, corpus deletion, archive
  migration, or other remote mutation occurred.

## Revision 2 — 2026-07-17

### Changed

- Started `SB-045` in the second available implementation slot after claim,
  generated-document, public-artifact, website, and workflow reconciliation
  produced release-relevant work.
- Hardened the planning validator around exact plan indexing, required plan
  sections, status agreement, external-wait metadata, canonical paths, and
  cryptographic archive receipts.
- Recorded the live website drift and the inert `ci --max-new-issues` option as
  explicit work rather than silently treating either surface as correct.

### Status transitions

- `SB-045`: `ready` -> `in_progress` (artifact/claim reconciliation started;
  the typed gate-decision red test remains the next action).
- `PLAT-001`: remains `in_progress` pending final review and the separately
  approval-gated archive decision.

### Evidence

- `scripts/validate-execution-docs.test.mjs`
- `packages/website/src/data/published-release-receipt.json`
- `docs/execution/STATUS.md`
- No release, publish, deployment, corpus deletion, archive migration, or
  remote mutation occurred.

## Revision 1 — 2026-07-17

### Added

- One repository-level roadmap, machine-readable execution index, current
  status snapshot, bounded plan directory, and recoverable archive contract.
- Separate plans for the Corpus v1 admission decision, seed construction, and
  later calibration so corpus work can advance without pretending evidence is
  already admitted.
- A company track for five vibecoder scan-to-rescan pilots.

### Changed

- Positioned vibecoders as the main entry, SlopBrick as the front door,
  MemoryBrick as the substrate, LockBrick as the first paid team product, and
  MendBrick as later deterministic repair.
- Folded PickBrick into `usebrick init` and policy authoring.
- Re-scoped v0.45 as a trust/reliability release with no new rules.
- Added WIP limits of two implementation plans and one company plan.
- Replaced project-wide blocker language with lane-local waiting and a
  preserve/replace/continue rule that never fabricates evidence.

### Status transitions

- `PLAT-001`: `draft` -> `in_progress` (central control-plane implementation
  started; this revision).
- `SB-045`: `draft` -> `ready` (candidate scope and next red test are bounded;
  `docs/execution/plans/SB-045-trust-release.md`).
- `CORPUS-DEC-001`: `draft` -> `ready` (local evidence decision is executable;
  `docs/execution/plans/CORPUS-DEC-001-admission-contract.md`).
- `GTM-001`: `draft` -> `ready` (five-pilot protocol is bounded;
  `docs/execution/plans/GTM-001-vibecoder-pilots.md`).

### Superseded or archived

- Declared the new authority hierarchy. No legacy file was moved or deleted in
  this additive revision; archive actions remain separately approval-gated.

### Evidence

- `docs/superpowers/specs/2026-07-17-roadmap-consolidation-design.md`
- `docs/execution/STATUS.md`
- No release, publish, deployment, corpus deletion, or remote mutation
  occurred.
