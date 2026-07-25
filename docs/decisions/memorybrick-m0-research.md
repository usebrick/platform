# MemoryBrick M0 Revision 67 historical research report

**Date:** 2026-07-24
**Status:** Historical supporting research; superseded as active process
authority by the Revision 68 focused
[acceptance contract](./memorybrick-m0-acceptance.md)
**Decision authority:** [`memorybrick-m0.md`](./memorybrick-m0.md)
**Execution authority:** [`MEM-001`](../execution/plans/MEM-001-read-only-m0.md)

## Executive conclusion

Revision 64 correctly rejected the earlier MemoryBrick M0 proposal. Revision
65 removed its unbounded static-parser surface and pinned an exact package-only
compiler/vector, but Revision 66 review then falsified four remaining safety or
correctness claims: external exact-shape checks required unbounded own-key
materialization, array indexes could still be accessors, the path ABNF did not
mean what its examples required, and two public compiler limits were impossible
under the admitted semantics. Four additional clarity/resource findings covered
parsed-member safety, reflection attribution, invisible payload omissions, and
base64url allocation order.

The strongest correction is further scope reduction:

```text
exact root/package-manifest JSON bytes
                  ↓
     bounded iterative JSON parser
                  ↓
 four declared package-fact predicates
                  ↓
 recursively immutable projection capability
                  ↓
 one target-independent bounded selection
                  ↓
 three deterministic descriptive previews
                  ↓
 one pinned exact 3/9/27 conformance vector
```

Static JavaScript/TypeScript parsing is removed from M0. All semantic IDs,
paths, values, and renderer-controlled strings are strict ASCII, eliminating an
ambient Unicode normalization/version dependency. Every order is bound to a
named comparator. Every successful projection is recursively frozen and
requires private in-process capability membership. The benchmark accepts one
raw-hash-pinned normative vector, not an implementation-authored suite.

Revision 67 retains Revision 65's scope reduction and closes the complete
Revision 66 four-must/four-should union. It does not authorize implementation or
claim that MemoryBrick helps a real agent or developer.

## 1. Research question

The question is deliberately narrow:

> Can UseBrick deterministically compile a few current package declarations
> into bounded, identical agent-labelled previews, and can an implementation
> prove conformance against one non-vacuous offline vector?

M0 does not need to prove filesystem security, source-code architecture
inference, model performance, client integration, telemetry, policy
enforcement, repair, or product-market fit. Every additional capability makes
the result harder to interpret. A passing M0 should mean only that one small
pure transformation is technically closed and reproducible.

## 2. Evidence and source policy

The correction used primary standards, official runtime/compiler material,
the current repository contracts, and direct local probes:

- Node's official `util.types` documentation for proxy detection;
- ECMAScript's normative `Reflect.ownKeys` and
  `Object.getOwnPropertyDescriptor` algorithms for whole-key-list versus
  one-named-descriptor behavior;
- the official TypeScript Compiler API material for documented parser entry
  points;
- RFC 5234 for ABNF repetition and operator precedence;
- RFC 8785 for canonical JSON property ordering;
- RFC 8259 and WHATWG Encoding for JSON/UTF-8 boundaries;
- RFC 4648 for strict base64url evidence markers; and
- CommonMark for the fenced preview structure.

Architectural conclusions are identified as UseBrick decisions. For example,
the TypeScript material documents `createSourceFile`; it does not promise the
total host-stack/resource behavior M0 would need. Removing that parser is an
inference from the missing contract plus reproduced behavior, not a quotation
from TypeScript.

No market source can establish technical totality, and no technical source can
establish product usefulness. Those evidence domains remain separate.

## Revision 66 falsification and selected correction

The dual review and independent controller probes established the following:

- `Reflect.ownKeys` invokes `[[OwnPropertyKeys]]` and then
  `CreateArrayFromList`, so rejecting every extra key necessarily materializes
  the complete caller-controlled key list before any field-level cap;
- an Array can have an own enumerable accessor at an admitted index, so key
  density alone does not make element consumption callback-free;
- RFC 5234 repetition binds more tightly than concatenation or alternation, so
  the ungrouped segment rule applied its repetition only to the final
  alternative and also referenced an undefined `LOWER` symbol;
- one root emits at most seven candidates and each of 64 package manifests at
  most two, making attempted candidate 257 impossible; and
- a conservative serialization proof gives a 235,370-byte maximum projection,
  below the 262,144-byte registry ceiling.

The selected design does not pretend JavaScript can cheaply prove absence of
arbitrary extra properties. External objects are admitted through a fixed,
ordered descriptor view: inspect only expected own data descriptors, cap array
length before numeric index descriptors, consume descriptor values, and never
enumerate keys or perform ordinary property reads. Extra properties are inert.
Already bounded JSON is different: parser-owned maps can safely reject unknown
member sets because source bytes and tokens are capped before materialization.

Impossible compiler and benchmark result errors are removed from their public
unions. Their existing registry numbers remain executable drift proofs. This is
more honest than manufacturing first-overflow vectors no admitted input can
reach.

## 3. Reproduced parser-stack failure

The Revision 64 review supplied a valid TypeScript source consisting of:

```text
const x=<700 opening parentheses>0<700 closing parentheses>
```

The file was 1,409 bytes, well below the proposed source-byte cap. On Node
24.15.0 with the exact local `typescript@5.9.3`:

- the default process raised `RangeError: Maximum call stack size exceeded`;
- the same source under `--stack_size=8192` returned zero diagnostics.

The input was not malformed and did not approach the byte limit. Changing only
the host process stack changed the parser outcome. Catching `RangeError` could
make the public function return an error, but it would not define the work or
memory bound and would preserve host-condition-dependent admission.

Three remedies were considered:

1. **Catch and map parser exceptions.** Rejected because it closes an exception
   channel, not the total resource contract.
2. **Run parsing in a worker/subprocess.** Potentially valid later, but requires
   a runtime/version contract, termination, serialization, startup, and
   resource-governance design larger than M0.
3. **Remove static modules from M0.** Selected. Root/package JSON is sufficient
   to test the repository-owned projection premise with one iterative bounded
   parser.

Any future code extractor needs a separate ADR with an admitted grammar or
isolation model, exact work caps, supported runtime matrix, and adversarial
failure tests.

## 4. Why source count must precede index inspection

An array cap does not bound work if an implementation inspects every index
before checking length. A source array with 66 entries must fail at source
count without requesting index 65's descriptor, regardless of what that index
would contain. Otherwise the stated cap becomes an attribution hint rather than
an admission boundary.

The corrected compiler uses this order:

1. inspect only the top-level expected data descriptors and source-array kind;
2. require exact identity with the module-owned registry constant;
3. read only the intrinsic own array-length descriptor and require 1–65;
4. only then inspect numeric index data descriptors, registrations, and byte views;
5. validate registrations;
6. enforce per-source bytes;
7. enforce aggregate bytes;
8. reject empty sources;
9. privately copy;
10. fatal-decode and bounded-parse all sources;
11. validate and count all predicate semantics within the exact 135 maximum;
12. group/materialize only after confirming the static 235,370-byte proof.

This makes both work and error precedence testable. Top-level and registry
failures still win over count; count wins over every source-index failure.

## 5. One bounded parser

M0 source JSON is decoded with WHATWG fatal UTF-8 semantics. BOM, replacement
decoding, malformed sequences, overlong forms, surrogate encodings, truncation,
and out-of-range code points fail rather than being repaired.

The JSON parser is iterative, represents objects as private `Map` values,
rejects duplicate decoded keys before insertion, and has explicit depth and
token caps. Extraction uses exact own map membership rather than inherited
property lookup, so `__proto__`, `constructor`, `prototype`, and polluted
ambient prototypes cannot alter meaning:

- depth 32 is accepted and 33 is rejected before another stack entry;
- token 16,384 is accepted and 16,385 is rejected before retaining another
  token/member/element;
- duplicate keys, trailing input, invalid numbers, unpaired surrogates, and a
  non-object root fail; and
- parser allocations stop after the relevant byte/depth/token cap fails.

This avoids inheriting ambient `JSON.parse` recursion behavior and makes the
single active parser's resource contract reviewable.

## 6. Bounded external runtime admission

Structural TypeScript types alone do not exclude proxies, getters, subclasses,
cross-realm values, sparse arrays, shared memory, or Node `Buffer`. The public
entry points therefore receive `unknown` and apply explicit Node 22/24 runtime
predicates through captured intrinsics.

The contract calls `node:util.types.isProxy` first, classifies the container,
checks its exact current-realm prototype, and requests only contract-named own
descriptors. Expected record fields and numeric array indexes must be enumerable
data descriptors; the implementation consumes `descriptor.value` and never
uses property reads, spread, destructuring, `in`, iteration, or own-key
enumeration. Array length is read from its intrinsic own data descriptor and
capped before any index descriptor. Missing fields, holes, and indexed
accessors fail; arbitrary named/symbol/accessor extras are never observed.

This changes the promise from “reject every extra key” to the enforceable
promise “extras cannot affect work or meaning.” ECMAScript specifies that
`Reflect.ownKeys` creates an array from the complete own-key list, while
`Object.getOwnPropertyDescriptor` asks for one named own property. The latter is
the bounded primitive M0 needs.

Buffer, subclasses, cross-realm views, resizable/shared/detached buffers,
DataView, and other typed arrays are rejected. Every allowed reflective step
has an exact order and phase-local result; inspection exceptions in caller input
map to `invalid-input`, while registry admission is constant identity only and
maps mismatch to `invalid-registry`. These predicates create a bounded
no-callback snapshot boundary without claiming a general JavaScript object
sandbox.

## 7. Complete registrations and ClaimKey grammars

M0 admits exactly:

| Source kind | Path | Extractor | Derived source ID |
| --- | --- | --- | --- |
| root | `package.json` | `package-json-root-v2` | `root-package-json` |
| package | exact ASCII package-manifest path | `package-manifest-v2` | `package-manifest/<path>` |

There is exactly one root, at most 64 packages, and no duplicate path or
derived source ID. Paths are lexical identifiers; they make no physical-file
claim.

The package path grammar uses explicit RFC 5234 grouping and local terminal
definitions:

```text
lower         = %x61-7A
digit         = %x30-39
segment       = (lower / digit / "_" / "@")
                *63(lower / digit / "." / "_" / "@" / "-")
manifest-path = segment *("/" segment) "/package.json"
```

Its equivalent regex is
`(?:[a-z0-9_@][a-z0-9._@-]{0,63}/)+package\.json`, plus the 256-byte whole-path
cap. This admits the exact vector's package paths while rejecting leading dot,
dash, slash, uppercase, empty, `.`/`..`, and backslash forms.

Each predicate has a complete key grammar:

| Predicate | Subject | Scope | Slot |
| --- | --- | --- | --- |
| `repo.command` | `repository` | `repository` | `build`, `test`, `lint`, or `typecheck` |
| `repo.package-manager` | `repository` | `repository` | `singleton` |
| `repo.package-manifest` | an exact fixture registration path | `repository` | `singleton` |
| `repo.runtime-node` | `repository` | `repository` | `singleton` |

Manifest subjects must bind to a registration in the same compilation/fixture.
Component and complete-JCS byte caps apply before sorting, set insertion,
base64url encoding, or rendering. This prevents a syntactically tuple-shaped
but semantically unbound key from entering the compiler or benchmark.

## 8. Parent/leaf decision table

Recognized fields have exact missing-versus-invalid behavior:

- a missing `/packageManager` emits no row; a present non-string or
  grammar-invalid value fails;
- missing `/engines` or missing `/engines/node` inside an object emits no row;
  a present non-object parent or invalid leaf fails;
- missing `/scripts` or a recognized command slot emits no command row; a
  present non-object parent or non-string recognized leaf fails; and
- missing `/name` emits no manifest row; a present non-string or invalid name
  fails.

Unknown object members and unrecognized script slots are parsed but ignored.
Package-level `/packageManager` and `/scripts` are outside that extractor and
ignored regardless of type. Script bodies are validated as strings only when
recognized, then discarded; command values are boolean presence facts.

Root and package Node ranges share one singleton key. Equal ranges merge their
evidence. Different valid ranges create a visible conflict and no assertion.
This provides the benchmark's negative conflict control.

## 9. Why every order is named

“Sort canonically” is incomplete when different domains use different
canonical rules. RFC 8785 orders JSON object property names by raw unescaped
UTF-16 code units. JavaScript's default array sort also compares UTF-16 string
units. A bytewise UTF-8 order is different for some non-ASCII strings: for
example, U+10000 begins with UTF-16 surrogate `D800`, which sorts before U+E000,
while UTF-8 for U+E000 begins `EE` and sorts before U+10000's `F0`.

M0 resolves the ambiguity in two ways:

1. semantic identifiers/paths/values are closed ASCII; and
2. each domain names its comparator:
   `asciiCompare`, `claimKeyCompare`, `sourceCompare`, `evidenceCompare`, or
   `valueCompare`, with explicit enum arrays for source kind, task class,
   target, and omission reason.

JCS remains responsible only for JSON object-property ordering and exact JSON
bytes. No active semantic array uses locale, default `.sort()`, insertion
order, filesystem order, or host collation.

## 10. Why ASCII replaces NFC pinning

Revision 64 asked for an explicit normalization-data version if NFC remained a
semantic requirement. Pinning Unicode data would be possible, but would add a
large maintenance surface for four package predicates that do not need
non-ASCII output.

The corrected design instead requires every emitted semantic string to satisfy
an exact 7-bit ASCII grammar. Non-ASCII may occur in ignored JSON fields, but
it cannot reach a key, value, evidence path, pointer, renderer label, task, or
native marker. The contract therefore makes no NFC or Unicode-category claim
and cannot drift with a host Unicode-data update.

This is scope removal, not a claim that Unicode is unsafe or unimportant. A
future user-facing name predicate would need its own normalization, confusable,
display, and version policy.

## 11. Recursively immutable compiler capability

Readonly TypeScript annotations do not prevent runtime mutation, and a shallow
freeze leaves nested evidence/key/value arrays mutable. Passing a merely
branded structural object to the renderer would let a caller cast or fabricate
data after validation.

On compiler success, M0 therefore:

1. materializes only ordinary closed objects/arrays;
2. recursively freezes every nested value;
3. verifies `Object.isFrozen` recursively;
4. records the root in a module-private `WeakSet`; and
5. returns an opaque type whose unique symbol is type-only and never serialized.

The renderer requires both the opaque type and private membership. A spread,
deserialization, cast, or lookalike object cannot gain membership. A mutation
cannot alter a successful projection in place. This is a narrow in-process
capability, not a hash-based trust claim.

## 12. Renderer boundary and exact budgets

Selection is target-independent. Assertions sort by registry priority
descending and then `claimKeyCompare`. Conflicts are always omitted. Complete
one-line JCS rows are selected while their combined bytes fit 2,048; a row is
never truncated. Omission reasons use explicit order `conflict`, then
`payload-budget`, then key order.

The same selected rows render for `codex`, `claude`, and `copilot`; only the
descriptive first-line label and resulting byte/hash differ. Every preview now
states that facts may be omitted for conflict or payload budget and that the
preview may be incomplete. Exact empty wrapper sizes are 451, 452, and 453
bytes. Maximum previews are therefore 2,499, 2,500, and 2,501 bytes, below the
4,096-byte cap. The exact sidecar remains machine-readable, but omission is no
longer invisible to a text-only consumer.

Rows sit inside a CommonMark fenced code block after a warning that all fields
and paths are untrusted repository data. This preserves display structure. It
does not detect secrets, establish semantic safety, or authorize execution.

## 13. Why one exact vector is necessary

A generic benchmark API allows the implementation or caller to choose an
empty, trivial, or self-fulfilling suite. Even strong minimum-count prose can
leave the actual fixture/task matrix implementation-owned. A passing result
would then say more about suite construction than about the reviewed contract.

Revision 65 introduced one normative vector with exact raw bytes and hash;
Revision 67 updates only its nine preview expectations for the visible omission
warning and re-pins the complete artifact. Only
those bytes can return `pass` or `fail`; all mutations return `suite-invalid`.
The vector contains:

- `runtime-conflict`: root and package manifests declare incompatible valid
  Node ranges, so the runtime key must be conflict-omitted;
- `single-app`: one ordinary root exercises package manager, runtime, command,
  and manifest facts; and
- `workspace-budget`: root plus twelve packages forces deterministic
  payload-budget omissions, including the forbidden late package key.

Each fixture has architecture/build/test tasks and codex/claude/copilot native
contexts: 3 fixtures, 9 tasks, 27 cells. Every task has two required and one
forbidden key. Every native context contains one exact positive package-manager
marker. All four predicates occur in required keys.

Coverage keys alone are insufficient for conformance: a deterministic compiler
could preserve selected keys while emitting the wrong values, evidence,
conflicts, order, omission sidecars, wrapper text, byte counts, or hashes. The
vector therefore also embeds the complete expected projection and `renderAll`
value for every fixture. A pass requires byte-identical JCS for those full
artifacts. The expected values are plain reviewed data and never gain the
compiler's private capability.

The reviewed golden summary is:

| Metric | Exact value |
| --- | ---: |
| cells | 27 |
| improved cells | 27 |
| improved targets | 3 |
| native required-key coverage | 9 |
| memory required-key coverage | 54 |
| forbidden selected keys | 0 |

This is conformance evidence only. Because humans designed the fixtures and
expected output together, it cannot establish generalization or product value.

## 14. Complete benchmark snapshot and entry point

The benchmark exports one synchronous pure function:

```ts
evaluateMemoryM0Vector(vectorBytes: unknown): OfflineBenchmarkResult
```

The evaluator validates the exact current-realm fixed non-shared byte view,
checks the byte cap, copies it, requires exact size/hash, fatal-decodes,
bounded-parses into prototype-safe maps, validates every exact nested member set
and aggregate cap, strict-decodes base64url, binds keys to registrations, and
recursively freezes the entire suite—including complete expected
compiler/renderer artifacts—before execution.

Base64url validation is allocation-safe rather than “decode then check.” It
first validates alphabet/padding/length remainder, computes decoded length with
checked arithmetic, validates the final sextet's unused bits, and applies
per-field plus saturating aggregate decoded-byte caps. Only then may it allocate
and decode. Exact re-encoding remains a post-decode assertion. Native marker
keys use the same preflight against the 512-byte ClaimKey cap.

There is no public general-suite overload, fixture directory, callback,
filesystem path, registry override, client, model, clock, or network input.
Internal tests may inject a reviewed private snapshot to reach later failure
branches, but no injection API is exported and no mutated bytes can emit a
claim-bearing result.

## 15. Native evidence is exact, positive, and bounded

Native context is not parsed as natural language. It contains only exact
LF-terminated records:

```text
USEBRICK_MEMORY_M0_NATIVE_EVIDENCE_V2 <base64url(UTF8(JCS(ClaimKey)))>\n
```

Strict pre-allocation canonical base64url, key grammar/binding, key order, and
one-for-one sidecar equality are required. Prose, CR, missing LF, empty records,
duplicate keys, malformed JCS, or an unregistered key fail `native-evidence`.
This avoids claiming that the benchmark can infer facts from arbitrary vendor
instruction files.

## 16. Exact result preflight and discriminated union

A result byte cap is ineffective if the implementation allocates oversized
cells and only then serializes them. Revision 65 introduced a streaming preflight
over a conservative conceptual valid result:

- use every actual cell's admitted IDs/class/target;
- include complete required-key arrays in both missing arrays;
- include the complete forbidden-key array;
- use maximum covered counts and `improved:false`;
- include all targets in the summary and maximum aggregate counts; and
- count exact RFC 8785 UTF-8 without allocating cells, sets, arrays, or one
  combined JCS string.

Every actual key array is a subset and every actual number is at most the
counted maximum. The exact conservative bound is 14,570 bytes, 116,502 below
the 131,072-byte registry ceiling. Because only one exact vector is admitted,
no caller can make that branch overflow; `result-limit` is removed from the
public invalid union. The calculation remains a mandatory pre-materialization
drift proof.

Valid and invalid results are disjoint:

- valid: `result` is `pass|fail`, `invalidReason` is null, summary is non-null,
  and counts are exact 3/9/27;
- invalid: `result` is `invalid`, reason is non-null, summary is null, and
  fixtures/tasks/cells are exactly 0/0/empty.

After execution, all computed projections and complete `renderAll` values must
byte-equal the reviewed expectations. After reduction, a provisional pass must
also byte-equal the 9,144-byte golden result. A complete deterministic run that
misses artifact, coverage/control, or golden equality returns valid `fail`;
only repeated-run drift, intrinsic invariant failure, or an exception is
`determinism`. This keeps `fail` reachable without permitting a non-golden pass.

## 17. Finding-by-finding closure

| Revision 64 item | Closure |
| --- | --- |
| Must: source count before traversal | Thirteen compiler phases place intrinsic length before density/elements and require precedence vectors. |
| Must: total static parser | Static modules and TypeScript are removed; iterative bounded JSON is the only parser. |
| Must: named sorts | Five named comparators plus explicit enum orders cover compiler, renderer, and benchmark. |
| Must: registration and key grammar | Exact source map plus predicate-specific subject/scope/slot/binding table. |
| Must: non-vacuous benchmark | One exact 3/9/27 vector with required negative controls and complete expected compiler/renderer outputs; no public generic suite. |
| Should: recursive immutability | Recursive readonly/freeze plus private `WeakSet` capability. |
| Should: one pure benchmark snapshot | One synchronous entry point privately snapshots/freezes the complete vector. |
| Should: result preflight/union | Streaming conservative JCS upper bound and discriminated valid/invalid shapes. |
| Should: runtime/JSON edges | Exact proxy/record/array/byte-view predicates, bounded parser, and parent/leaf table. |
| Consider: NFC data version | Active semantic strings are strict ASCII; no normalization data remains. |

No must-fix or should-fix is deferred. The consideration is resolved through a
smaller semantic alphabet rather than an implicit host dependency.

Revision 67 also closes every Revision 66 item:

| Revision 66 item | Revision 67 closure |
| --- | --- |
| Must: unbounded own-key admission | External records use fixed expected-field descriptors; no caller own-key list is requested or materialized, and extras are inert. |
| Must: accessor-backed array indexes | Length is capped first; every admitted index must be an own enumerable data descriptor and only its descriptor value is consumed. |
| Must: malformed manifest-path grammar | Explicit RFC 5234 terminals/grouping, exact regex equivalence, and boundary vectors replace the ambiguous rule. |
| Must: unreachable candidate/projection errors | Public errors and first-overflow vectors are removed; exact 135-candidate and 235,370-byte executable proofs guard registry drift. |
| Should: prototype-safe parser members | Private maps, duplicate-before-insert, and exact `has`/`get` make prototype-shaped names inert. |
| Should: reflection attribution | Captured intrinsic order and phase-local `invalid-input`/`invalid-registry` mapping are normative and trace-tested. |
| Should: omission presentation | Every preview text now warns about both conflict and payload-budget omission; exact sidecars remain. |
| Should: pre-allocation base64url caps | Arithmetic decoded lengths, canonical pad-bit checks, and per-field/aggregate caps precede allocation. |

The related exact-vector benchmark `result-limit` branch was also removed after
the same reachability audit proved its fixed conservative envelope is 14,570
bytes. No review item is deferred.

## 18. Implementation sequence if later accepted

Acceptance has not occurred. If two fresh independent reviewers pass identical
frozen bytes at the required threshold and the owner then separately chooses
**Accept**, implementation should proceed in bounded test-first slices:

1. Core private registry constant, bounded descriptor guards, ASCII/key/path
   validators, named comparators, JCS/hash utilities, and closed result types.
2. Compiler phases 1–9 with adversarial precedence and input-copy tests.
3. Iterative fatal JSON parsing plus all parent/leaf predicate validation.
4. Candidate grouping, conflicts, hashes, recursive freeze, and private
   capability tests.
5. Target-independent selection and exact renderer bytes/sidecars.
6. Exact vector parser/snapshot, native marker validation, preflight, reducer,
   and golden equality.
7. Full recursive workspace gates and a fresh review of implementation evidence.

No slice may add static modules, filesystem discovery, public package schemas,
native-file writes, live clients, telemetry, Lock, Mend, release, or deployment
without new authority.

## 19. Review checklist for the next authorized pair

The next pair should verify packet identity first, then independently attempt
to falsify:

- source-count precedence with huge/sparse/proxy/accessor arrays;
- fixed descriptor-operation traces, inert extras, data-only indexes, and every
  phase-local reflection-exception mapping;
- depth/token/source exact fit and first overflow plus exact
  candidate/projection/result static-bound proofs;
- prototype-shaped parsed names and polluted ambient prototypes;
- path ABNF/regex equivalence and every initial/segment/whole-path boundary;
- every parent/leaf missing versus invalid edge;
- complete registration and manifest-subject binding;
- non-ASCII rejection and absence of active NFC/Unicode-version semantics;
- UTF-16/JCS versus semantic comparator separation;
- recursive frozen state and inability to fabricate `WeakSet` membership;
- conflict and payload-budget partitions plus visible generic omission warning;
- base64url decoded-length/pad-bit/cap rejection before allocation;
- raw vector, registry, JCS, and golden hash recomputation;
- exact 3/9/27 inventory and non-empty controls;
- native marker/sidecar equality;
- conservative preflight math and no preflight allocation of conceptual cells;
- valid/invalid union disjointness and global invalid precedence; and
- the absence of filesystem, process, provider, model, credential, or network
  capabilities.

They should also preserve the evidence boundary: a passing vector is not agent
efficacy, real-repository validation, owner acceptance, implementation
authority, or release evidence.

## 20. Rejected or deferred alternatives

### Reintroduce filesystem capture

Deferred. Byte acquisition and physical identity remain separate capability
questions with platform-specific security semantics.

### Add source-code parsing back for broader usefulness

Rejected for M0. Breadth is not useful if the parser totality claim is false.
The four package predicates are enough to test the projection architecture.

### Permit caller-authored vectors with minimum counts

Rejected. Counts alone do not bind task quality, negative controls, fixture
content, or the golden output.

### Trust TypeScript readonly types without runtime freeze

Rejected. Runtime consumers and casts can mutate structural objects. The
renderer needs an actual immutable capability boundary.

### Pin Unicode data and retain non-ASCII semantic strings

Deferred. It adds maintenance and review cost that current package predicates
do not require.

### Add more digests for every intermediate value

Rejected. M0 keeps source, registry, projection, render, and normative-vector
bindings only where they close a specific deterministic boundary. Hashes do
not prove provenance, authority, freshness, usefulness, or safety.

## 21. Final assessment

Revision 67 is materially more defensible than the reviewed Revision 65 packet.
It retains the package-only scope while replacing impossible external
exact-shape promises with bounded descriptor views, closing parser/path/decode
edges, making omission visible, and separating reachable errors from static
drift proofs.

The proposal passed local documentation/artifact validation and is frozen under
the owner's bounded Revision 67 correction authority. It is not accepted,
implemented, reviewed at this revision, or release-qualified. Another review
requires a new owner choice; **Hold** remains available.

## References

1. Node.js. [`util.types.isProxy`](https://nodejs.org/api/util.html#utiltypesisproxyvalue).
2. Ecma International. [`Reflect.ownKeys`](https://tc39.es/ecma262/2024/multipage/reflection.html#sec-reflect.ownkeys).
3. Ecma International. [`Object.getOwnPropertyDescriptor`](https://tc39.es/ecma262/2024/multipage/fundamental-objects.html#sec-object.getownpropertydescriptor).
4. Microsoft TypeScript. [Using the Compiler API](https://github.com/microsoft/TypeScript/wiki/Using-the-Compiler-API).
5. RFC Editor. [RFC 5234: Augmented BNF for Syntax Specifications](https://www.rfc-editor.org/rfc/rfc5234.html#section-3.10).
6. RFC Editor. [RFC 8785: JSON Canonicalization Scheme](https://www.rfc-editor.org/rfc/rfc8785).
7. RFC Editor. [RFC 8259: The JavaScript Object Notation Data Interchange Format](https://www.rfc-editor.org/rfc/rfc8259).
8. WHATWG. [Encoding Standard](https://encoding.spec.whatwg.org/).
9. RFC Editor. [RFC 4648: Base-N Encodings](https://www.rfc-editor.org/rfc/rfc4648.html#section-3.5).
10. CommonMark. [Current specification](https://spec.commonmark.org/current/).
