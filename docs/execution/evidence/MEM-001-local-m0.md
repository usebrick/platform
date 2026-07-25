# MEM-001 Slice A local qualification

- **Status:** Locally qualified; uncommitted and unshipped
- **Date:** 2026-07-24
- **Branch:** `codex/mem-001-adr`
- **Base commit:** `a0c29dd37dc024425336c03f98b1c6aa360c191a`
- **Owner authority:** [`MEM-001-owner-decision.json`](./MEM-001-owner-decision.json)
- **Active contract:** [`memorybrick-m0-acceptance.md`](../../decisions/memorybrick-m0-acceptance.md)

## Outcome

The owner-authorized Slice A boundary is implemented and locally qualified:

- Core owns a private `memory-m0-v2` profile, trusted request types, and the
  exact recursively frozen registry-v2 constant.
- Engine owns a package-private, synchronous admission and parser boundary for
  trusted registrations containing untrusted package-JSON bytes.
- Admission enforces one root, no more than 64 package manifests, unique
  lexical paths, per-source and aggregate byte caps, and defensive byte copies
  before parsing.
- Parsing uses fatal UTF-8, rejects a BOM, malformed or trailing JSON,
  non-object roots, duplicate decoded member names, non-finite numbers, and
  unpaired surrogates. It is iterative and bounded to depth 32 and 16,384
  tokens.

This is only the private profile/parser checkpoint. It is not a Memory
compiler, projection, preview, benchmark result, filesystem adapter, public
API, release, or product-efficacy claim.

## Requirement evidence

| Requirement | Local proof |
| --- | --- |
| `M0-S01` | Structure remains v5. Core and Engine package export maps, SlopBrick package/bin and CLI-command sources, and all current public entrypoints are unchanged from the base commit. The private M0 modules are absent from package facades and build entrypoints. |
| `M0-S02` | The three Engine M0 modules import only one another and contain no filesystem, network, process, console, provider, credential, persistence, telemetry, Lock, Mend, or source-parser dependency. |
| `M0-I01` | Focused cases cover missing root, duplicate paths, one root, 64 admitted package manifests, and rejection of the 65th package manifest. |
| `M0-I02` | Focused cases cover 262,144/262,145 source bytes and 4,194,304/4,194,305 aggregate bytes. All registrations and caps are validated before `copySources` runs. |
| `M0-I03` | Table-driven cases cover each permitted initial character, scoped paths, 64/65-byte segments, 256/257-byte complete paths, and forbidden uppercase, leading dot/dash, traversal, slash, backslash, and non-ASCII forms. |
| `M0-P01` | Focused cases cover valid objects, BOM, malformed/truncated UTF-8, non-object roots, escaped and nested duplicate keys, prototype-like names, malformed/trailing JSON, number grammar, and surrogate handling. |
| `M0-P02` | The parser uses an explicit frame stack. Focused cases admit depth 32 and reject 33, consume token 16,384 without a token-limit error, and reject before token 16,385. The same cases pass on Node 22 and 24. |

## Red-to-green record

The focused tests were written before their implementations:

1. Core first failed because `src/memory-m0.ts` did not exist, then passed
   after the private profile, types, and pinned registry were added.
2. Engine admission first failed because `src/memory-m0.ts` did not exist,
   then passed after bounded registration validation and defensive copying.
3. Parser coverage first failed because `parseMemoryM0Request` did not exist,
   then passed after fatal decoding, tokenization, and the iterative parser
   were added.

No red/green commit was created because the owner decision explicitly excludes
commit, push, merge, release, publication, and deployment.

## Qualification

| Gate | Result |
| --- | --- |
| Node 22.22.3 Core focused tests | 1 file, 3/3 passed |
| Node 22.22.3 Engine focused tests | 2 files, 49/49 passed |
| Node 22.22.3 Core and Engine typechecks | passed |
| Node 24.15.0 Core focused tests | 1 file, 3/3 passed |
| Node 24.15.0 Engine focused tests | 2 files, 49/49 passed |
| Node 24.15.0 Core and Engine typechecks | passed |
| Full Core tests | 36 files, 288/288 passed |
| Core contract freshness and schema validation | passed |
| Core build | passed |
| Full Engine tests | 7 files, 109/109 passed |
| Engine typecheck and build | passed |
| Public-surface base diff | unchanged |
| `git diff --check` | passed |

The runtime-specific focused suites were launched through the exact Node binary
paths rather than a login shell or package-manager shim, so the recorded Node
22 and 24 results are runtime-specific evidence.

## Advisory review

One independent read-only adversarial review returned **APPROVE**. It found no
critical, high, medium, or low issue and no reproducible violation of
`M0-S01` through `M0-P02`.

Three non-blocking residuals were recorded:

1. focused export tests snapshot Core more directly than Engine or SlopBrick;
   the controller separately proved those public surfaces unchanged against
   the base commit;
2. returned private byte copies remain mutable `Uint8Array` values, so Slice B
   must not treat them as runtime-immutable; and
3. the token test's largest successful object has 16,381 tokens, while the
   even 16,384 cap is exercised as a grammar failure before token 16,385.

None is a Slice A contract failure. Under the accepted stopping rule, advisory
future hardening does not reopen or widen the qualified slice.

## Boundary and next decision

Slice B and Slice C remain unauthorized. The next owner decision is one of:

1. accept and authorize Slice B (`M0-F01` through `M0-L01`);
2. revise Slice A using a named requirement and reproducible failure; or
3. hold `MEM-001` at this locally qualified, uncommitted boundary.

No commit, push, merge, release, publication, deployment, filesystem
acquisition, source-code parsing, or live experiment occurred.
