# MemoryBrick M0 focused acceptance contract

- **Status:** Private Slices A-C locally qualified, locally checkpointed, and unshipped — Revision 74
- **Applies to:** `MEM-001`
- **Profile:** `memory-m0-v2`

## Authority

This is the only active human-readable behavioral contract for MemoryBrick M0.
The [M0 ADR](./memorybrick-m0.md) supplies scope and rationale. The pinned
[registry v2](./memorybrick-m0-registry-v2.json) and exact [benchmark vector
v2](./memorybrick-m0-benchmark-vector-v2.json) are fixed test data.

The Revision 67 compiler, renderer, benchmark, and research documents remain
available as historical design references. They do not add requirements to
this matrix. If a historical detail conflicts with this contract, this
contract wins. Implementation is not required to reproduce behavior that has
no requirement ID below.

## M0 outcome

Given a trusted internal list of registrations containing untrusted exact
root/package-manifest JSON bytes, M0 deterministically produces:

1. four families of current `declared` repository facts with evidence;
2. one immutable projection that preserves conflicts;
3. three bounded descriptive previews labelled Codex, Claude, and Copilot; and
4. one test-only result over the committed 3-fixture/9-task/27-cell vector.

M0 does not acquire the bytes, infer approved intent, invoke an agent, edit an
instruction file, persist memory, enforce policy, or claim agent efficacy.

## Trust boundary

Repository JSON bytes and strings derived from them are untrusted. The private
TypeScript request container, module-owned registry, and committed vector
loader are trusted UseBrick internals.

M0 exposes no public `unknown` admission API, caller-authored registry, or
caller-authored benchmark suite. It therefore makes no security promise about
hostile JavaScript `Proxy` objects, accessor properties, cross-realm objects,
subclassed typed arrays, or a process compromised before module import. The
implementation copies each admitted source byte range before parsing and never
mutates caller-owned values. Repository-byte validation remains strict.

## Requirement-to-test matrix

| ID | Requirement | Executable verification | Slice |
| --- | --- | --- | --- |
| `M0-S01` | M0 is private and additive: Structure v5, `STRUCTURE_SCHEMA_VERSION`, public CLI commands, and package exports remain unchanged. | API/export snapshot plus Core version assertion. | A |
| `M0-S02` | M0 has no filesystem discovery, source-code parser, network, provider, process, credential, telemetry transport, persistence, native-file writer, Lock gate, or Mend repair dependency. | Import-graph deny-list and side-effect sentinel test. | A, C |
| `M0-I01` | One request contains exactly one registered `package.json` root and zero to 64 lexical package-manifest registrations; duplicate paths fail. | Adjacent count, duplicate, missing-root, and 64/65 package cases. | A |
| `M0-I02` | One source is at most 262,144 bytes and all source bytes total at most 4,194,304; caps are checked before copying or parsing the overflowing source. | Exact-limit and first-overflow allocation/traversal probes. | A |
| `M0-I03` | Package-manifest paths match `(?:[a-z0-9_@][a-z0-9._@-]{0,63}/)+package\.json`, use 1–64-byte segments, and are at most 256 ASCII bytes. | Table-driven valid and adjacent-invalid path cases. | A |
| `M0-P01` | Sources use fatal UTF-8, reject a BOM, require one JSON object root, reject duplicate decoded member names, and reject malformed/trailing JSON without replacement decoding. | Parser fixtures for malformed UTF-8, BOM, duplicates, root type, and trailing input. | A |
| `M0-P02` | Parsing is iterative and bounded to depth 32 and 16,384 tokens. | Depth/token exact-limit and first-overflow tests on Node 22 and 24. | A |
| `M0-F01` | Extraction emits only `repo.command`, `repo.package-manager`, `repo.package-manifest`, and `repo.runtime-node`; unknown fields and script bodies never become facts. | Positive/negative extraction table and predicate-set equality. | B |
| `M0-F02` | Every emitted fact is `declared`, grammar-valid ASCII, and carries source path plus JSON-pointer evidence to exact supplied bytes. | Per-predicate grammar/evidence fixtures and non-ASCII negatives. | B |
| `M0-F03` | Equal values for one claim key merge deterministically; differing valid values produce a visible conflict and are never selected for previews. | Equal-value, conflict, and selected-key assertions. | B |
| `M0-D01` | All semantic arrays use named ASCII/tuple comparators; RFC 8785 governs only canonical JSON object-property order. Locale and default JavaScript sorting are not used. | Shuffled-input/property-order determinism tests under two locales. | B |
| `M0-D02` | Compilation does not mutate inputs and repeated runs produce structurally equal frozen projections and byte-identical canonical output. | Deep-freeze/mutation sentinels plus repeated-run byte comparison on Node 22 and 24. | B |
| `M0-H01` | Product values expose only source-content, registry, projection, and rendered-text SHA-256 fields, each over one documented byte preimage. | Preimage reconstruction and digest-field allow-list test. | B, C |
| `M0-L01` | Admitted semantics produce at most 135 candidates; projection JCS remains below 262,144 bytes; the exact vector result remains below 131,072 bytes. These are drift assertions, not public overflow branches. | Executable bound constructors and static arithmetic assertions. | B, C |
| `M0-R01` | One target-independent selection with at most 2,048 fact-row bytes feeds all three labels; every complete preview is at most 4,096 bytes and no row is truncated. | Boundary selection and byte-count tests for all labels. | C |
| `M0-R02` | Every preview identifies facts as untrusted descriptive data, warns that conflict or payload budget may omit facts, and says native instructions remain authoritative. | Exact wrapper/golden-text assertions. | C |
| `M0-R03` | Rendering returns values only and never reads or writes native instruction files. | Filesystem sentinel and import-graph deny-list test. | C |
| `M0-B01` | The test-only harness runs only the committed registry/vector constants: exactly 3 fixtures, 9 tasks, and 27 cells. It has no public arbitrary-suite evaluator. | Fixture identity/inventory test plus export snapshot. | C |
| `M0-B02` | The vector exercises all four predicates, required/forbidden/native evidence, conflict omission, payload-budget omission, and complete expected projection/preview values. | Coverage inventory and independent golden reconstruction. | C |
| `M0-C01` | A green result is described only as deterministic local fixture conformance, never agent efficacy, real-repository value, market validation, policy authority, or release qualification. | Evidence-text allow/deny assertion. | C |

## Three implementation slices

### Slice A — profile and bounded package JSON parser

- Add private Core types and the module-owned registry constant without a
  public schema or export change.
- Add the trusted internal request shape, defensive byte copies, registration
  checks, fatal UTF-8, and bounded duplicate-key-rejecting parser.
- Red tests first for `M0-S01` through `M0-P02`; then focused Core/Engine tests
  and typecheck on Node 22 and 24.

### Slice B — fact compiler and immutable projection

- Implement only the four predicates, evidence, grammar validation,
  comparator order, merge/conflict behavior, hashes, and frozen projection.
- Red tests first for `M0-F01` through `M0-L01`; then focused Engine tests and
  typecheck on Node 22 and 24.

### Slice C — previews and exact conformance harness

- Implement target-independent selection, three value-only previews, and the
  internal exact-vector harness.
- Red tests first for `M0-R01` through `M0-C01`; then focused package tests,
  recursive workspace typecheck/test/build, and the package-local self-scan.

Each slice receives its own implementation checkpoint and evidence. A slice
may not silently widen another slice or activate a deferred capability.

## Review and stopping rule

The former two-reviewer `94/100` score gate is retired. Reviewer scores are
advisory and never authorize or block work by themselves.

A review item is blocking only when it includes all four of:

1. one requirement ID from this matrix;
2. a reproducible failing input, test, or mechanical proof;
3. an in-scope consequence; and
4. the smallest correction that restores the named requirement.

The controller must reproduce the failure before changing the contract or
implementation. Style preferences, speculative future requirements, and
findings about explicitly deferred surfaces remain advisory. If a genuine
finding requires scope expansion, stop the slice and return that expansion to
the owner instead of absorbing it into M0.

## Decision boundary

Revision 68 authorized the process reset and documentation convergence only.
Revision 69 records the trusted owner's **Accept Slice A** decision and
Revision 70 records the separate **Accept Slice B** decision. Those decisions
authorized only their named requirements, focused tests, local validation,
advisory review, and separate evidence.

Slice A is now implemented and locally qualified in the uncommitted worktree;
its receipt is
[`MEM-001-local-m0.md`](../execution/evidence/MEM-001-local-m0.md). This
completion exhausts the Revision 69 implementation authority and does not
by itself authorize Slice B.

Slice B is now implemented and locally qualified; its receipt is
[`MEM-001-local-m0-slice-b.md`](../execution/evidence/MEM-001-local-m0-slice-b.md).
Revision 71 exhausts the Revision 70 boundary.

Revision 72 records the owner's explicit `continue` instruction as **Accept
Slice C**, authorizing only `M0-R01` through `M0-C01`, local qualification,
advisory review, and a separate receipt. The existing git, release, public,
filesystem, source-parser, provider, and persistence gates remain unchanged.

Slice C is now implemented and locally qualified; its receipt is
[`MEM-001-local-m0-slice-c.md`](../execution/evidence/MEM-001-local-m0-slice-c.md).
Revision 73 exhausts the Revision 72 boundary. The result is deterministic
local fixture conformance only. Revision 74 separately authorizes one local
checkpoint commit and no claim expansion. Every additional git, release,
public, filesystem, source-parser, provider, persistence, durable-Memory, and
live-agent action remains separately gated.
