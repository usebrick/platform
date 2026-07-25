# Memory M0 Revision 67 benchmark design reference

> Historical status: this records the frozen Revision 67 design. Revision 68
> replaced it as active authority with the focused
> [acceptance contract](./memorybrick-m0-acceptance.md). Details below are
> reference material and cannot add an unlisted M0 requirement.

This document defined one synchronous, pure, non-admitting conformance
benchmark over one pinned exact vector. It does not measure agent quality,
invoke an agent, or admit a general caller-authored suite.

## 1. One claim-bearing vector

The only M0 bytes that can produce a claim-bearing `pass` or `fail` are the
committed bytes of
[`memorybrick-m0-benchmark-vector-v2.json`](./memorybrick-m0-benchmark-vector-v2.json):

| Property | Exact value |
| --- | --- |
| raw file bytes | 103,296 |
| raw file SHA-256 | `08eef8255613d7e84614ff49a221debb6834da4fd3cf1dc07f360dc243569dde` |
| JCS bytes | 61,257 |
| JCS SHA-256 | `85e113094aef6f7612373b1c3ef7e17e7346ecefdef3078a2cc2dc4f72ca234b` |
| registry domain hash | `ebc0204fc3298ede39e74d847d674f203d9754b1c9f1d862d52f9a03a3bbca99` |
| expected-artifact JCS bytes | 43,112 |
| expected-result JCS bytes | 9,144 |
| expected-result JCS SHA-256 | `5aedb337d082714eb070535806f154a7b5a80b45fe0468739c2a830f7319eafc` |

The raw-file hash binds indentation, final LF, fixture bytes, task keys, native
evidence, requirements, complete expected projections/render results, and the
golden reducer result. Any byte difference returns `suite-invalid`; it cannot
produce a new benchmark claim. The registry domain hash must also equal the
value recomputed from the exact module-owned registry under the compiler contract.

This is intentionally a pinned normative vector rather than an
implementation-owned test suite. Its result proves only that one implementation
matches the pinned proposed M0 compiler/renderer behavior on these committed
cases.
It is not product-market evidence and does not admit a rule, release, customer
claim, or external corpus result.

## 2. Exact pinned inventory and non-vacuity

The vector contains exactly these fixtures in `asciiCompare` order:

| Fixture | Sources | Tasks | Required control |
| --- | ---: | ---: | --- |
| `runtime-conflict` | 2 | 3 | conflicting root/package Node ranges omit `repo.runtime-node` |
| `single-app` | 1 | 3 | ordinary root facts cover all four predicate families across tasks |
| `workspace-budget` | 13 | 3 | the 2,048-byte selection budget omits later package facts |

Every fixture has exactly the task classes `architecture`, `build`, and `test`
in that declared order. Every task has exactly two required keys and one
non-empty forbidden key. Every fixture has exactly one reviewed native context
for each target in `codex`, `claude`, `copilot` order. Every native context has
one non-empty positive evidence key. Across the exact suite:

- all four registry predicates occur in required keys;
- 3 fixtures, 9 tasks, and 27 task-target cells are mandatory;
- the conflict omission must be observed;
- the payload-budget omission must be observed;
- every fixture has one complete pinned expected projection and `renderAll`
  value, including facts, evidence, conflicts, selection, omissions, selected
  keys, exact preview text, product hashes, and byte counts;
- no required-key array, forbidden-key array, native evidence array, fixture,
  task class, or target may be empty or absent; and
- fixture IDs, task IDs, registrations, source bytes, keys, and native bytes
  must equal the pinned vector.

These invariants are checked even after the raw hash check. A broken evaluator
therefore cannot treat possession of the hash as permission to skip semantic
validation.

## 3. Public entry point and immutable snapshot

```ts
type BenchmarkInvalidReason =
  | "suite-invalid"
  | "native-evidence"
  | "compile"
  | "determinism";

type TaskClass = "architecture" | "build" | "test";

type BenchmarkCell = Readonly<{
  fixtureId: string;
  taskId: string;
  class: TaskClass;
  target: RenderTarget;
  required: number;
  nativeCovered: number;
  memoryCovered: number;
  nativeMissing: readonly ClaimKey[];
  memoryMissing: readonly ClaimKey[];
  forbiddenExposed: readonly ClaimKey[];
  improved: boolean;
}>;

type BenchmarkSummary = Readonly<{
  cells: 27;
  improvedCells: number;
  improvedTargets: readonly RenderTarget[];
  nativeCovered: number;
  memoryCovered: number;
  forbiddenExposed: number;
}>;

type OfflineBenchmarkInvalid = Readonly<{
  profile: "memory-m0-offline-benchmark-v2";
  registryProfile: "memory-m0-registry-v2";
  fixtures: 0;
  tasks: 0;
  cells: readonly [];
  summary: null;
  result: "invalid";
  invalidReason: BenchmarkInvalidReason;
}>;

type OfflineBenchmarkValid = Readonly<{
  profile: "memory-m0-offline-benchmark-v2";
  registryProfile: "memory-m0-registry-v2";
  fixtures: 3;
  tasks: 9;
  cells: readonly BenchmarkCell[];
  summary: BenchmarkSummary;
  result: "pass" | "fail";
  invalidReason: null;
}>;

type OfflineBenchmarkResult =
  | OfflineBenchmarkInvalid
  | OfflineBenchmarkValid;

function evaluateMemoryM0Vector(vectorBytes: unknown): OfflineBenchmarkResult;
```

Inside the pinned vector, `expectedArtifacts` is exactly three rows in
fixture order:

```ts
type ExpectedFixtureArtifacts = Readonly<{
  fixtureId: string;
  projection: MemoryProjectionM0;
  renderAll: RenderAllResult;
}>;
```

These are complete serialized expectations, not capable compiler results.

The entry point is synchronous and pure. It receives no filesystem path,
fixture directory, registry override, callback, provider, model, client,
environment, clock, random source, or network capability. It uses the exact
registry constant linked by the compiler contract.

`vectorBytes` must satisfy the compiler contract's exact byte-view predicate.
The evaluator checks `byteLength <= maxBenchmarkVectorBytes` before copying,
copies the bytes once into a private fixed `Uint8Array`, and does not inspect
caller memory again. It then fatal-decodes and parses the private copy with the
iterative duplicate-key-rejecting bounded JSON algorithm. The complete parsed
vector, decoded source/native byte arrays, tasks, keys, requirements, expected
projections/render results, and golden reducer result are copied from the
parser's prototype-safe maps into implementation-owned ordinary data
records/arrays and recursively frozen before execution. No caller-owned mutable
value survives admission.

The returned invalid or valid result, including every nested key and array, is
also recursively frozen.

## 4. Closed vector admission

Admission is globally phase-major. The first failing phase returns the exact
small invalid result from section 8.

### Phase 1: `suite-invalid`

1. validate the exact byte view without invoking caller code;
2. reject byte length zero or greater than 131,072;
3. copy once, require exactly 103,296 bytes, and require the exact raw SHA-256;
4. reject BOM or malformed UTF-8 and parse bounded JSON with duplicate-key
   rejection;
5. require the exact top-level and nested parsed-map member sets, profiles,
   primitive types, array density, and declared enum order; unknown members,
   including `__proto__`, `constructor`, and `prototype`, are rejected without
   prototype lookup or mutation;
6. preflight every base64url field before decoded-buffer allocation: require
   ASCII alphabet `A-Z a-z 0-9 - _` with no padding or whitespace; reject length
   remainder 1 modulo 4; compute decoded length as
   `3*floor(n/4) + {0,1,2}` for remainders `{0,2,3}` with checked arithmetic;
   require zero canonical unused bits (low four bits for remainder 2, low two
   bits for remainder 3); and apply the per-field and saturating aggregate
   decoded-byte caps before allocating or decoding. After decode, re-encoding
   must reproduce the exact input;
7. apply every registry and compiler cap before retaining, sorting, encoding,
   set insertion, or aggregate allocation;
8. validate every registration and every predicate-specific `ClaimKey` against
   the compiler contract, binding manifest subjects to that fixture's exact
   registrations;
9. require exact `requirements`, fixture IDs, source/task/native counts, task
   IDs (`<fixtureId>.<class>`), class order, target order, non-empty controls,
   predicate coverage, conflict fixture, payload-budget fixture,
   `requiresExactArtifacts:true`, and one expected-artifact row per fixture;
   and
10. recompute the registry domain hash and require the exact vector value.

Aggregate suite caps are checked from the calculated decoded lengths with
saturating safe-integer addition before decoded-buffer copy/allocation: one
source at most 262,144 bytes; one native context at most 4,096; source bytes at
most 8,388,608; native bytes at most 36,864; key references at most 256; key JCS
bytes at most 65,536; fixtures 3; tasks 9; cells 27. Source count is checked
before any source element traversal inside each fixture, using the same staged
compiler rule.

All IDs, paths, classes, targets, keys, and evidence lists are ordered only by
the named comparators in the compiler contract or the explicit enum arrays.
Default `.sort()`, locale collation, insertion order, and host path order are
forbidden.

### Phase 2: `native-evidence`

Each native byte payload is exactly one or more LF-terminated records with no
other bytes:

```text
USEBRICK_MEMORY_M0_NATIVE_EVIDENCE_V2 <base64url(UTF8(JCS(ClaimKey)))>\n
```

The marker prefix and one ASCII space are literal. Before decoding a marker key,
the same arithmetic/canonical-bit preflight must prove its decoded length is at
most `maxClaimKeyBytes` (512); only then may a key buffer be allocated. CR,
missing final LF, empty lines, prose, duplicate keys, non-canonical base64url,
malformed JCS, an unregistered key, or a marker/evidence-sidecar mismatch is
`native-evidence`. Decoded marker keys must be in `claimKeyCompare` order and
must equal the frozen `evidence` sidecar one-for-one. Markers are pinned
positive evidence only; prose is never inferred into a key.

### Phase 3: `compile`

Compile fixtures in fixture order with the exact frozen registry and decoded
source registrations/bytes. The benchmark does not interleave one fixture's
compiler phases with another fixture: each call follows the compiler contract's
own global precedence before the next fixture begins. Any non-success result or
escaped synchronous exception is `compile`. Successful projections must retain
the compiler's private capability and recursive frozen state.

### Phase 4: `determinism`

For every fixture, call `compileMemoryM0` twice over independent private copies,
then call `renderAll` twice over the two capable projections. Require equal JCS
projection bytes, equal projection hashes, equal selection JCS, equal rendered
bytes, equal selected/omitted keys, exact target order, recursive frozen state,
and the exact conflict/payload controls. Any difference, intrinsic failure, or
escaped synchronous exception is `determinism`.

After repeated-run equality passes, compare the first computed projection and
complete `renderAll` JCS byte-for-byte with that fixture's frozen
`expectedArtifacts` row. The expected projection is plain pinned data and
never receives private capability membership or enters the renderer. Record one
internal `artifactsConform` boolean across all three fixtures. A deterministic
artifact mismatch is a valid conformance `fail`, not `determinism`; it can never
produce `pass`.

## 5. Exact result bound

Before allocating result cells or their sets, the evaluator performs a
streaming JCS byte count of this exact conservative valid-result envelope:

For every actual task-target cell, emit its actual fixture ID, task ID, class,
and target; set `required`, `nativeCovered`, and `memoryCovered` to that task's
required-key count; set both `nativeMissing` and `memoryMissing` to the complete
required-key array; set `forbiddenExposed` to the complete forbidden-key array;
and set `improved` to `false`. For the summary, use:

```text
cells            = 27
improvedCells    = 27
improvedTargets  = ["codex","claude","copilot"]
nativeCovered    = sum(requiredKeys.length across all 27 cells)
memoryCovered    = sum(requiredKeys.length across all 27 cells)
forbiddenExposed = sum(forbiddenKeys.length across all 27 cells)
```

Wrap those conceptual cells and summary in the valid result object with
`fixtures:3`, `tasks:9`, `result:"fail"`, and `invalidReason:null`. Count exact
RFC 8785 UTF-8 bytes without building the conceptual cells, arrays, sets, or a
combined JCS string. All actual cell arrays are subsets of these counted arrays
and all actual counts are bounded by the counted maxima, so this is an upper
bound for the admitted exact vector.

For the exact pinned vector, this conservative envelope is exactly 14,570 JCS
bytes, 116,502 bytes below `maxBenchmarkResultBytes` (131,072). Because the
public evaluator admits only these exact vector bytes and all actual arrays are
subsets of the counted arrays, `result-limit` would be an unreachable public
error. It is therefore not part of `BenchmarkInvalidReason`. The 14,570-byte
calculation and inequality are mandatory executable drift guards and run before
result materialization; a mismatch is an implementation/vector defect requiring
review, not a caller-authored benchmark result. No oversized valid-result
object or combined JCS string is allocated.

## 6. Deterministic cell reduction

After preflight, reduce cells in fixture order, task-class order, then target
order. Within every key array use `claimKeyCompare`.

For a task `Q`, native evidence set `N`, and renderer selected-key set `M`:

```text
required          = |Q.requiredKeys|
nativeCovered     = |Q.requiredKeys ∩ N|
memoryCovered     = |Q.requiredKeys ∩ M|
nativeMissing     = Q.requiredKeys - N
memoryMissing     = Q.requiredKeys - M
forbiddenExposed  = Q.forbiddenKeys ∩ M
improved          = memoryCovered > nativeCovered
                    AND |memoryMissing| < |nativeMissing|
                    AND |forbiddenExposed| = 0
```

Set membership uses complete validated ClaimKey tuples, not joined strings or
hashes. Native contexts are baseline evidence only and are never concatenated
with renderer output. Forbidden exposure checks renderer-selected keys; an
omitted conflict or payload-budget key is not exposed.

The summary is the exact sum over 27 cells. `improvedTargets` contains a target
only when all nine cells for that target are improved. A valid result is
eligible for `pass` only when all 27 cells are improved, all three targets are
improved, `forbiddenExposed` is zero, and both required omission controls were
observed. Section 7 adds exact artifact and reducer-golden equality. If artifact
conformance, coverage/control criteria, or golden equality fails after a
complete deterministic run, the valid result is `fail`.

## 7. Golden equality

When `artifactsConform` and the coverage/control criteria pass, construct a
provisional valid result with `result:"pass"`. That provisional result must
have exactly 9,144 JCS bytes and SHA-256
`5aedb337d082714eb070535806f154a7b5a80b45fe0468739c2a830f7319eafc`,
and its JCS must byte-equal `expectedResult` from the admitted vector. The
reviewed golden result is:

```text
fixtures=3
tasks=9
cells=27
improvedCells=27
improvedTargets=codex,claude,copilot
nativeCovered=9
memoryCovered=54
forbiddenExposed=0
result=pass
```

If artifact conformance or the criteria fail, or the provisional pass candidate
differs from the golden, return the same computed cells/summary with
`result:"fail"` and
`invalidReason:null`. A repeated-run byte difference, intrinsic invariant
failure, or exception remains `determinism`. This keeps valid `fail` reachable
without allowing a non-golden pass and detects changes to compiler extraction,
ordering, selection, omission, or reduction semantics.

## 8. Exact invalid result and precedence

Every invalid phase returns exactly:

```json
{
  "profile": "memory-m0-offline-benchmark-v2",
  "registryProfile": "memory-m0-registry-v2",
  "fixtures": 0,
  "tasks": 0,
  "cells": [],
  "summary": null,
  "result": "invalid",
  "invalidReason": "<first phase reason>"
}
```

No fixture ID, partial count, partial cell, stack, exception text, source text,
or prior result escapes. Phase precedence is:

```text
suite-invalid
native-evidence
compile
determinism
```

The valid and invalid branches are discriminated by both `result` and
`invalidReason`; a valid result can never carry an invalid reason or null
summary, and an invalid result can never carry non-zero counts or cells.

## 9. Required implementation tests

Tests must independently recompute the raw/JCS/registry/golden hashes and
counts from committed artifacts. They must also independently construct and
byte-compare all three expected projections and complete `renderAll` values.
They must cover exact success plus mutations
of every top-level/nested field; every caller-reachable cap at limit and first
overflow; exact dominated candidate/projection/result-bound proofs; proxy,
cross-realm, subclass, Buffer, shared/resizable/detached/wrong byte views;
duplicate JSON keys; malformed UTF-8/base64url/JCS; wrong profiles/order/counts;
empty or missing controls; unbound manifest subjects; unknown predicates;
native marker/sidecar disagreement; compile failure; repeated-run mismatch;
conflict and payload omissions; exact result-envelope recomputation; expected
projection/render or reducer-golden mismatch returning valid `fail`; invalid
precedence crossings; recursive input/output freezing; and
absence of filesystem, process, environment, client, provider, model, clock,
random, credential, or network access.

Mutation tests are conformance tests only. Because their raw bytes differ from
the reviewed hash, the public entry point must return `suite-invalid`; internal
admission units may inject the already-reviewed private snapshot solely to
reach later branch tests. No internal injection API is exported.
