# Memory M0 Revision 67 compiler design reference

> Historical status: this records the frozen Revision 67 design. Revision 68
> replaced it as active authority with the focused
> [acceptance contract](./memorybrick-m0-acceptance.md). Details below are
> reference material and cannot add an unlisted M0 requirement.

This document defined one synchronous, bounded compiler over explicit
caller-owned bytes in Revision 67. Rendering and the one claim-bearing offline
vector were defined separately.

M0 does **not** define filesystem discovery, repository traversal, path
resolution, static-module parsing, or secure file opening. A future source
adapter or code extractor requires a separate ADR, capability boundary, and
review.

## 1. Bounded types, runtime values, and canonical order

```ts
type Authority = "declared";
type SourceKind = "root-package-json" | "package-manifest";
type JsonPrimitive = null | boolean | number | string;
type ParsedJsonValue =
  | JsonPrimitive
  | ParsedJsonValue[]
  | ReadonlyMap<string, ParsedJsonValue>;
type DeclaredValue = true | string;
type Sha256 = string; // exactly 64 lowercase hexadecimal characters
type ManifestPath = string;
type SourceId = string;
type PredicateId = string;
type ClaimKey = readonly [
  predicateId: PredicateId,
  subject: string,
  scope: "repository",
  slot: string,
];
```

Every identifier, registration path, emitted string, key component, JSON
pointer, and renderer-controlled label in M0 is 7-bit ASCII. Source JSON may
contain other valid UTF-8 text, but no such text is emitted unless it satisfies
one of the exact ASCII grammars below. M0 therefore has no Unicode
normalization or host-Unicode-version dependency.

`package.json` is the only root path. A package-manifest path is:

```text
lower         = %x61-7A
digit         = %x30-39
segment       = (lower / digit / "_" / "@")
                *63(lower / digit / "." / "_" / "@" / "-")
manifest-path = segment *("/" segment) "/package.json"
```

Each segment is 1–64 bytes, the complete path is 14–256 bytes, matching is
case-sensitive, and at least one segment precedes `/package.json`. Empty, `.`,
and `..` segments, backslash, percent decoding, NUL, drive prefixes, and a
leading slash are impossible under this grammar. Paths are lexical identifiers
only; they do not prove that a physical file exists. The exact equivalent
regular expression is
`(?:[a-z0-9_@][a-z0-9._@-]{0,63}/)+package\.json`, additionally bounded to
256 ASCII bytes for the complete path. Parentheses are normative: RFC 5234
repetition binds more tightly than concatenation and alternation.

Predicate and extractor IDs are 1–128 ASCII bytes matching
`[a-z0-9][a-z0-9._/-]*`. A complete `ClaimKey` is valid only if it matches one
row in the exact key table in section 5. Its subject is at most
`maxClaimKeySubjectBytes`, its slot is at most `maxClaimKeySlotBytes`, and
`UTF8(JCS(key))` is at most `maxClaimKeyBytes`. These checks occur before a key
is retained, sorted, encoded, inserted into a set, or rendered.

JCS means RFC 8785 canonical JSON encoded as UTF-8. JCS object-property sorting
uses RFC 8785 unsigned UTF-16 code-unit order over raw unescaped property names.
All M0 field names are ASCII. M0 defines these additional named comparators:

1. `asciiCompare(a,b)` compares unsigned ASCII bytes lexicographically;
2. `claimKeyCompare` compares the four `ClaimKey` components in tuple order
   using `asciiCompare`;
3. `sourceCompare` compares derived source ID, then manifest path, using
   `asciiCompare`;
4. `evidenceCompare` compares source ID, source path, then JSON pointer using
   `asciiCompare`;
5. `valueCompare` compares complete UTF-8 JCS bytes lexicographically; and
6. enum orders are the declared array order in the registry or contract, never
   host insertion order.

Every later phrase such as “sort by ID/path/key/value” invokes these named
comparators. Locale, default JavaScript `.sort()`, filesystem case rules, and
host collation are forbidden.

### Bounded external admission

The public entry point receives `unknown`. Input admission is defined for Node
22 and 24. The implementation captures the required Node/ECMAScript intrinsics
once and never resolves them through caller-controlled properties. It performs
only these reflective operations, in this order for each external container:

1. `node:util.types.isProxy` before any other inspection;
2. primitive/null and intrinsic `Array.isArray` classification;
3. intrinsic `Object.getPrototypeOf`; and
4. intrinsic `Object.getOwnPropertyDescriptor` for each contract-named field or
   admitted array index in the exact order named by the active phase.

M0 assumes those supported-realm intrinsics have not been replaced before the
module is evaluated; it is not a sandbox for a process already compromised
before import. Capturing them prevents later caller mutation from changing an
in-flight admission. Hardening a pre-compromised realm is outside this M0.

A **bounded record view** is a non-null, non-array, non-proxy object whose
prototype is exactly the current realm's `Object.prototype`. The implementation
requests only the fixed expected own-property descriptors. Every expected
property must be an own enumerable data descriptor, and the implementation
consumes `descriptor.value`; it never performs ordinary property reads,
destructuring, spread, `in`, or own-key enumeration. Missing, inherited, or
accessor-backed expected fields are invalid. Extra string or symbol properties
are outside the view, are never observed, and cannot affect admission—even when
they are accessors or when there are arbitrarily many of them.

A **bounded dense array view** is a non-proxy current-realm Array with prototype
exactly `Array.prototype`. The intrinsic own descriptor for `length` must be the
ordinary non-enumerable data descriptor holding a safe non-negative integer.
The applicable length cap is checked before any index descriptor. The
implementation then requests descriptors for `0` through `length - 1` in
numeric order, requires each to be an own enumerable data descriptor, and
consumes only `descriptor.value`. A hole or accessor-backed index is invalid.
Named and symbol extras are never enumerated or observed.

This deliberately does not promise rejection of extra external properties.
JavaScript provides no bounded operation that can both prove their absence and
avoid materializing the complete caller-controlled own-key list. Exact shape
rejection remains available for already byte/token-bounded parsed JSON, whose
members are controlled by the parser rather than by caller object traps.

Every allowed reflective operation is inside its named admission phase. A
synchronous inspection exception maps to that phase's closed error and cannot
escape: top-level, source-array, source-record, registration, and byte-view
inspection map to `invalid-input`; the registry phase performs identity
comparison only and maps mismatch to `invalid-registry`. No source ID is
attributed before registration validation.

An **exact byte view** uses this fixed intrinsic order: proxy test;
`ArrayBuffer.isView`; exact `Uint8Array.prototype` comparison; captured typed-
array `buffer`, `byteOffset`, and `byteLength` getters; exact current-realm
`ArrayBuffer.prototype` comparison; captured `ArrayBuffer.prototype.resizable`
getter; and a zero-length intrinsic `DataView` construction to prove the buffer
is attached. The observed offset/length must describe a fixed-length range in
that attached, non-resizable, non-shared backing buffer. `Buffer`, subclasses,
cross-realm views, resizable buffers, detached buffers, `SharedArrayBuffer`,
`DataView`, and other typed arrays are invalid. Any intrinsic throw maps to the
active phase's `invalid-input`; admission invokes no caller getter or callback.

Numbers admitted from JSON are finite IEEE-754 binary64 values. Counts are safe
non-negative integers produced by the implementation, never caller-authored
result fields.

## 2. Fatal UTF-8 and bounded JSON

Every source byte view follows one decoding algorithm:

1. reject byte prefix `EF BB BF`; a UTF-8 BOM is not stripped;
2. decode using WHATWG “UTF-8 decode without BOM or fail”; and
3. preserve the decoded scalar sequence exactly without normalization or
   replacement decoding.

BOM or malformed, overlong, surrogate, truncated, or out-of-range UTF-8 is
`parse-failed`.

`bounded-json-v2` is an iterative duplicate-key-rejecting JSON parser. It uses
an explicit stack and represents every parsed object as a module-private
`Map<string, ParsedJsonValue>`, never as an ordinary prototype-bearing object. Before
inserting a decoded member name, it invokes the captured intrinsic
`Map.prototype.has`; a duplicate fails, otherwise the captured intrinsic
`Map.prototype.set` stores the value. Extractors use only captured intrinsic
`Map.prototype.has`/`get` for exact recognized names. Therefore `__proto__`,
`constructor`, `prototype`, and ambient `Object.prototype` pollution are
ordinary unknown names with no inherited or prototype-setting behavior. The
parser uses an explicit stack and these rules:

- increment depth on each object or array open; reject before depth 33;
- count `{`, `}`, `[`, `]`, `:`, `,`, and every string, number, `true`,
  `false`, or `null` token; reject before token 16,385;
- reject duplicate object keys after JSON escape decoding at every depth;
- reject trailing tokens, invalid JSON grammar, non-finite numbers, unpaired
  surrogates, and a non-object root; and
- allocate no parser stack entry, decoded key, array element, or object member
  after its depth/token/source-byte cap has failed.

The source-byte, depth, and token caps bound parser work and memory. No ambient
`JSON.parse` recursion or implementation call-stack limit is part of the
contract.

## 3. Exact registry and caps

The accepted registry is the one module-owned, recursively frozen constant
materialized from the exact object in
[`memorybrick-m0-registry-v2.json`](./memorybrick-m0-registry-v2.json). Its JCS
value—not file indentation—is the registry-hash input. Unknown keys, reordered
arrays, duplicate IDs, changed constants, parser-profile changes, or added
extractors are invalid. `MemoryM0Registry` denotes the type inhabited only by
that constant. At the public boundary, `input.registry` must be reference-equal
to it; no caller-authored registry container is traversed. The artifact's exact
shape, values, order, recursive frozen state, and domain hash are independently
asserted at module initialization and in conformance tests. A future registry
change requires a new reviewed profile rather than runtime duck typing.

| Cap | Value |
| --- | ---: |
| sources / package manifests | 65 / 64 |
| one source / all compilation source bytes | 262,144 / 4,194,304 |
| JSON depth / JSON tokens | 32 / 16,384 |
| defensive candidate ceiling / one value / defensive projection ceiling | 256 / 256 / 262,144 |
| key subject / slot / JCS key bytes | 256 / 16 / 512 |
| fact-row payload / rendered context | 2,048 / 4,096 bytes |
| fixtures / tasks / cells | 3 / 9 / 27 |
| task keys / native keys | 8 / 8 |
| one native context / suite source / suite native bytes | 4,096 / 8,388,608 / 36,864 |
| suite key references / suite key JCS bytes | 256 / 65,536 |
| benchmark vector / benchmark result | 131,072 / 131,072 bytes |

Extractor and predicate arrays sort by ID with `asciiCompare` and are
duplicate-free. `SourceKind` array order is `root-package-json`, then
`package-manifest`. Priorities are integers 0–1,000. Registry grammar names
select only algorithms written in this contract; they are not executable
expressions.

The two defensive ceilings are statically dominated by the admitted semantics,
not caller-reachable error branches. One root can emit at most seven candidates
(package manager, runtime, four commands, and name); each of 64 packages can
emit only runtime and name. The exact maximum is therefore:

```text
7 + (64 * 2) = 135 candidates < maxAssertions 256
```

The final projection also has a mechanical conservative JCS bound. An empty-
array projection envelope including all fixed fields and hashes is 282 bytes. A
source row is at most 679 bytes, so 65 rows plus array punctuation are 44,201
bytes. Treating every candidate as a separate maximum assertion deliberately
overcounts grouping and conflicts: one such row is at most 1,413 bytes (512-byte
key JCS, 256-byte value JCS, one 591-byte evidence object, and 54 fixed bytes),
so 135 rows plus punctuation are 190,891 bytes. Replacing the envelope's three
empty arrays gives:

```text
282 - 6 + 44,201 + 190,891 + 2 = 235,370 bytes
235,370 < maxProjectionBytes 262,144 (margin 26,774)
```

A grouped assertion backed by `k` candidates is at most `821 + 592k` bytes,
which is no more than `1,413k` for `k >= 1`. A conflict backed by `k >= 2`
candidates is at most `556 + 872k` bytes, also no more than `1,413k`. Splitting
objects across the assertion and conflict arrays adds fewer separators than the
135-item conservative assertion array. The bound therefore covers every
admitted grouping. Both formulas are required executable
conformance proofs and registry-drift guards. If extractors, fields, or grammars
change, a new ADR must recompute the bounds or introduce reachable errors; M0
does not expose impossible `assertion-limit` or `projection-limit` results.

## 4. Pure input, staged admission, and registrations

```ts
type SourceRegistration = Readonly<{
  kind: SourceKind;
  path: ManifestPath;
  extractorId: string;
}>;
type RegisteredSource = Readonly<{
  registration: SourceRegistration;
  bytes: Uint8Array;
}>;
type CompilationInput = Readonly<{
  profile: "memory-m0-compilation-input-v2";
  registry: MemoryM0Registry;
  sources: readonly RegisteredSource[];
}>;
```

The compiler has no filesystem, environment, clock, random, process, cache, or
network access. It derives, but never accepts, source IDs:

| Kind | Exact registration | Derived source ID |
| --- | --- | --- |
| root | `package.json`, `package-json-root-v2` | `root-package-json` |
| package | `manifest-path`, `package-manifest-v2` | `package-manifest/<path>` |

There is exactly one root and at most 64 package manifests. Registration paths
and derived IDs are unique. Canonical source order is `sourceCompare`.

`compileMemoryM0(input: unknown): CompileResult` is synchronous and uses this
global phase order. A phase completes before the next begins; the first failing
phase wins.

| Phase | Error | Exact work and attribution |
| ---: | --- | --- |
| 1 | `invalid-input` | Admit the top-level bounded record view; read expected descriptors in order `profile`, `registry`, `sources`; validate profile and only the non-proxy current-realm Array kind/prototype of `sources`. Extra properties are unobserved. Do not inspect length, element descriptors, or values; `sourceId:null`. |
| 2 | `invalid-registry` | Require the captured `registry` descriptor value to be reference-equal to the module-owned pinned registry constant. Perform no registry reflection; `null`. |
| 3 | `invalid-input` or `source-limit` | Read only the intrinsic own `sources.length` descriptor. Inspection/descriptor/integer failure is `invalid-input`; reject a valid length unless 1–65 as `source-limit`. No source index is visited; `null`. |
| 4 | `invalid-input` | Within the bounded array, inspect index descriptors in numeric order, then each source record's `registration`, `bytes` descriptors and each registration's `kind`, `path`, `extractorId` descriptors in that order. Require own enumerable data descriptors, primitive field types, and exact byte views; consume descriptor values only. Extra properties are unobserved; `null`. |
| 5 | `invalid-registration` | Validate kind/path/extractor mapping, exactly one root, package count, and lexical path/ID uniqueness; `null`. |
| 6 | `source-limit` | In canonical source order, reject the first `byteLength > maxSourceBytes`; that source ID. |
| 7 | `source-limit` | Saturating checked sum of canonical source byte lengths; reject immediately on aggregate excess; `null`. |
| 8 | `source-empty` | Reject the first zero-byte source in canonical order; that source ID. |
| 9 | — | Copy every admitted byte view once in canonical order into private fixed `Uint8Array` values. |
| 10 | `parse-failed` | Fatal-decode and bounded-parse every copied source; first canonical source failure. All sources parse before phase 11. |
| 11 | `predicate-violation` | Validate every recognized parent/leaf field, emitted grammar, key, value, evidence pointer, and duplicate package name while counting in canonical source/pointer order; first canonical source failure. The semantic maximum is 135. |
| 12 | — | Materialize/group the validated candidates, streaming-measure final JCS before allocating a combined encoding, and confirm the two statically dominated registry ceilings. A violated proof is an implementation/registry defect, not a caller-induced result. |

This staging deliberately checks source count before traversing source
elements. An over-count array therefore returns `source-limit` without
requesting the descriptor for index 65, even if that index is sparse,
accessor-backed, malformed, or otherwise invalid. Top-level expected fields and
exact registry identity still precede source count. Once the count is admitted,
all remaining external descriptor traversal is fixed and bounded.

Because byte views are fixed, non-shared, proxy-free, and copied synchronously
without invoking caller code, no caller mutation can interleave between cap
validation and the private snapshot. The compiler never mutates caller values.

## 5. Exact extraction, key grammar, and conflicts

```ts
type Evidence = Readonly<{
  sourceId: SourceId;
  sourcePath: ManifestPath;
  pointer: string;
}>;
type Assertion = Readonly<{
  key: ClaimKey;
  authority: Authority;
  value: DeclaredValue;
  evidence: readonly Evidence[];
}>;
type ConflictVariant = Readonly<{
  value: string;
  evidence: readonly Evidence[];
}>;
type Conflict = Readonly<{
  key: ClaimKey;
  authority: Authority;
  variants: readonly ConflictVariant[];
}>;
```

Evidence pointers are only the fixed ASCII RFC 6901 pointers named below.
Evidence arrays use `evidenceCompare` and are duplicate-free.

### ClaimKey grammar

| Predicate | Subject | Scope | Slot | Fixture-key binding |
| --- | --- | --- | --- | --- |
| `repo.command` | exactly `repository` | exactly `repository` | exactly `build`, `test`, `lint`, or `typecheck` | fixed key; the command may be absent |
| `repo.package-manager` | exactly `repository` | exactly `repository` | exactly `singleton` | fixed key |
| `repo.package-manifest` | exact root or package path registered in that compilation/fixture | exactly `repository` | exactly `singleton` | subject must bind to one fixture registration |
| `repo.runtime-node` | exactly `repository` | exactly `repository` | exactly `singleton` | fixed key |

No other subject, scope, slot, delimiter, escaping form, case variant, or
unbound manifest path is registry-valid. This table is used identically by the
compiler, benchmark tasks, and native-evidence validator.

### Recognized JSON fields

| Source kind | Parent/leaf state | Result |
| --- | --- | --- |
| root | missing `/packageManager` | no row |
| root | present `/packageManager` not string or outside package-manager grammar | `predicate-violation` |
| root/package | missing `/engines` or missing `/engines/node` in an object | no runtime row |
| root/package | present `/engines` not object, or present `/engines/node` not string/grammar-valid | `predicate-violation` |
| root | missing `/scripts` or a recognized slot | no command row for that slot |
| root | present `/scripts` not object, or recognized slot present and not string | `predicate-violation` |
| root/package | missing `/name` | no manifest row |
| root/package | present `/name` not string or outside package-name grammar | `predicate-violation` |

Unknown JSON members and unrecognized script slots are parsed but ignored.
Package-manifest `/packageManager` and `/scripts` fields are outside that
extractor and ignored regardless of type. Script bodies are never emitted.

| Predicate | Exact emitted row |
| --- | --- |
| `repo.package-manager` | Root `/packageManager`; key `[id,"repository","repository","singleton"]`; value `<manager>@<version>`; evidence `/packageManager`. |
| `repo.runtime-node` | Every root/package `/engines/node`; one repository singleton key; value is the exact valid node range; evidence `/engines/node`. Equal values merge; differing values form a visible conflict. |
| `repo.command` | Own root `/scripts/{build,test,lint,typecheck}` string fields; subject `repository`, slot is the script name, value `true`, evidence the exact slot pointer. The body is not retained. |
| `repo.package-manifest` | Root/package `/name`; subject is that source's exact registered manifest path, singleton slot, value the package name, evidence `/name`. |

A package-manager value is `<manager>@<version>`, where manager matches
`[a-z0-9][a-z0-9._-]{0,31}` and version matches
`[0-9A-Za-z][0-9A-Za-z._+-]{0,95}`. A package name is 1–214 ASCII bytes
matching `(?:@[a-z0-9][a-z0-9._-]{0,63}/)?[a-z0-9][a-z0-9._-]{0,127}`.
Package names are unique across emitted manifest rows; the second occurrence in
canonical source order is `predicate-violation`.

Before a candidate row is counted or retained, `UTF8(JCS(value))` must be at
most `maxValueBytes` (256). The closed grammars above keep all current values
within that cap, but the check remains mandatory and precedes sorting,
grouping, projection allocation, or rendering.

The node-range grammar uses ASCII only; `SP` is byte `20`:

```text
range      = group *(1*SP "||" 1*SP group)
group      = comparator *(1*SP comparator) / version 1*SP "-" 1*SP version
comparator = [operator] version
operator   = "<=" / ">=" / "<" / ">" / "=" / "~" / "^"
version    = ["v"] component *("." component) ["-" suffix] ["+" suffix]
component  = 1*DIGIT / "x" / "X" / "*"
suffix     = 1*(ALPHA / DIGIT / "." / "-")
```

`version` has one to three components. Leading/trailing space, tab, slash,
colon, a fourth component, non-ASCII, or any other byte is rejected. The range
is at most 128 bytes. Multi-byte operators are recognized before their
one-byte prefixes.

Candidate rows use canonical source order and then fixed pointer order:
`/packageManager`, `/engines/node`, `/scripts/build`, `/scripts/test`,
`/scripts/lint`, `/scripts/typecheck`, `/name`. After all semantics and the
135-candidate proof pass, rows group by exact `ClaimKey`; values group with
`valueCompare`. One value produces one assertion with merged evidence. Two or
more values produce one conflict and no assertion. Assertions and conflicts
use `claimKeyCompare`; variants use `valueCompare`. A conflicted key is never
also asserted.

## 6. Immutable projection, capability, and hashes

```ts
type SourceEvidence = Readonly<{
  sourceId: SourceId;
  kind: SourceKind;
  path: ManifestPath;
  bytes: number;
  contentSha256: Sha256;
}>;
type MemoryProjectionM0 = Readonly<{
  profile: "memory-m0-v2";
  registryProfile: "memory-m0-registry-v2";
  registrySha256: Sha256;
  sources: readonly SourceEvidence[];
  assertions: readonly Assertion[];
  conflicts: readonly Conflict[];
  projectionSha256: Sha256;
}>;
declare const compiledMemoryM0: unique symbol;
type CompiledMemoryProjectionM0 = MemoryProjectionM0 & {
  readonly [compiledMemoryM0]: true;
};
```

On success the compiler recursively freezes every object and array in the
projection, verifies that every `Object.isFrozen` check succeeds, and registers
the root object in a module-private `WeakSet`. The unique-symbol member is a
type-level capability and is not enumerable or serialized. The renderer
requires both the opaque type and private `WeakSet` membership. Deserialization,
object spread, mutation, or a TypeScript cast cannot create membership. The
projection contains no byte view, mutable collection, getter, or prototype
outside ordinary frozen records and arrays.

M0 produces exactly four cryptographic field kinds:

| Field | Exact preimage |
| --- | --- |
| `SourceEvidence.contentSha256` | exact private source-byte copy |
| `registrySha256` | `UTF8("memory-m0-registry-v2") || NUL || JCS(registry)` |
| `projectionSha256` | `UTF8("memory-m0-projection-v2") || NUL || JCS(projection without projectionSha256)` |
| `RenderedContext.textSha256` | exact rendered UTF-8 bytes |

All use SHA-256. No other `sha256`, `*Sha256`, or digest-derived ID is present
in enumerable result types. Hash dependencies are acyclic: source/registry,
then projection, then rendering.

## 7. Total result

```ts
type CompileError =
  | "invalid-input"
  | "invalid-registry"
  | "invalid-registration"
  | "source-limit"
  | "source-empty"
  | "parse-failed"
  | "predicate-violation";
type CompileResult =
  | Readonly<{ ok: true; projection: CompiledMemoryProjectionM0 }>
  | Readonly<{ ok: false; error: CompileError; sourceId: SourceId | null }>;
```

Every listed error has a reachable required vector. The admission procedure
catches and maps every synchronous runtime inspection failure according to the
phase table. The iterative JSON parser has explicit byte/depth/token bounds.
The candidate/projection proofs have required exact executable tests rather
than fictitious first-overflow input vectors. Exceptions, logs, partial
projections, and artifacts are not outputs. Byte-identical admitted inputs
return byte-identical JCS or the same closed error.

## 8. Explicitly deferred work

M0 callers may obtain bytes from committed constants, an IDE buffer, a future
local adapter, or another separately authorized source. This contract neither
discovers nor opens those sources and does not infer physical identity from a
lexical path.

Static JavaScript/TypeScript extraction is also deferred. The demonstrated
`typescript@5.9.3` parser result depends on process stack conditions for small
valid nested input, while the official compiler API defines AST construction
but no M0-compatible total resource contract. Any future code extractor must
define its own admitted grammar/work limits, process/isolation decision,
supported runtimes, and failure tests.

## 9. Required vectors

Tests cover every runtime predicate; proxies; cross-realm/subclass/Buffer,
shared/resizable/detached/wrong byte views; huge and sparse source arrays;
accessor-backed expected fields and array indexes; arbitrarily many inert extra
string/symbol/accessor properties; and every adjacent/non-adjacent phase
crossing. In particular, source count wins before index 65's descriptor is
requested, while top-level expected-field and registry failures still precede
count. Operation-trace vectors assert the exact reflection order, consumed
descriptor values, non-observation of extras, and phase-local exception result.

Parser vectors cover exact depth 32/33, token 16,384/16,385, duplicate escaped
keys, `__proto__`/`constructor`/`prototype`, polluted ambient prototypes,
trailing data, invalid numbers, non-object roots, BOM, malformed/overlong UTF-8,
and unpaired surrogates. Path vectors cover every allowed initial character,
64/65-byte segments, 256/257-byte complete paths, uppercase/dot/dash-leading,
empty, `.`, `..`, leading-slash, and backslash cases. Extraction vectors cover
every recognized parent/leaf state, all four predicates, exact path and key
grammars, absent commands, runtime merge/conflict, duplicate package names,
fixed pointer order, all named comparators, ASCII rejection, exact 135-candidate
and 235,370-byte proofs, four hash preimages, fifth-field rejection, deep
freezing, private capability membership, input immutability, and repeated byte
equality.

No vector performs filesystem discovery, path resolution, static-module
parsing, process launch, agent/client invocation, provider access, credential
access, or network I/O.
