# MEM-001 Slice B local qualification

- **Status:** Locally qualified; uncommitted and unshipped
- **Date:** 2026-07-24
- **Branch:** `codex/mem-001-adr`
- **Base commit:** `a0c29dd37dc024425336c03f98b1c6aa360c191a`
- **Owner authority:**
  [`MEM-001-slice-b-owner-decision.json`](./MEM-001-slice-b-owner-decision.json)
- **Active contract:**
  [`memorybrick-m0-acceptance.md`](../../decisions/memorybrick-m0-acceptance.md)

## Outcome

The owner-authorized Slice B boundary is implemented and locally qualified:

- Engine compiles exactly `repo.command`, `repo.package-manager`,
  `repo.package-manifest`, and `repo.runtime-node` declared facts from Slice
  A's defensive parsed byte copies.
- Every fact has grammar-checked ASCII values and exact source ID, registered
  path, and JSON-pointer evidence. Unknown fields, unrecognized scripts, and
  script bodies never become facts.
- Equal values merge deterministically. Different valid values become a
  visible conflict and are absent from assertions, so Slice C cannot select
  them through the assertion path.
- Named bytewise/tuple comparators order semantic arrays; RFC 8785 governs
  canonical object-property order. Repeated compilation is byte-stable and
  returns a recursively frozen ordinary-object projection.
- The projection exposes only the three Slice B digest fields: exact source
  content, pinned registry, and projection SHA-256. Rendered-text SHA-256
  remains Slice C.
- Executable arithmetic pins the semantic maximum at 135 candidates and the
  conservative projection bound at 235,370 bytes, below the 262,144-byte cap.

This is only the private fact-compiler/projection checkpoint. It is not a
preview renderer, exact-vector harness, filesystem adapter, public API,
release, or product-efficacy claim.

## Requirement evidence

| Requirement | Local proof |
| --- | --- |
| `M0-F01` | Positive and negative extraction cases prove that the predicate set is exactly the four accepted families. Package-manifest package-manager/scripts fields, unknown fields, unknown script slots, and script bodies are absent from the projection. |
| `M0-F02` | Table-driven cases cover each recognized parent/leaf failure, package-manager/package-name/node-range ASCII grammars, adjacent-invalid node ranges, declared authority, and exact source/path/pointer evidence. Equal package names remain separate path-scoped facts rather than an invented policy error. |
| `M0-F03` | Equal runtime values merge two canonically ordered evidence rows. Different values produce one canonically ordered conflict, no assertion for that key, and therefore no selectable assertion before Slice C exists. |
| `M0-D01` | Every semantic `.sort` call names its comparator; static checks reject default and locale sorting. Shuffled source registration order produces an equal projection, canonical object insertion order is irrelevant, and focused tests pass under `C` and `de_DE.UTF-8` locales. |
| `M0-D02` | Frozen caller arrays and byte snapshots remain unchanged. Repeated and shuffled runs are structurally equal, canonical strings are byte-identical, and every projection object/array is recursively frozen. |
| `M0-H01` | Independent tests reconstruct source-content SHA-256 from the exact supplied bytes, registry SHA-256 from the documented domain/NUL/JCS preimage, and projection SHA-256 from the projection without its digest. An enumerable-field walk allows only those three Slice B names. |
| `M0-L01` | Static arithmetic proves `7 + 64*2 = 135` and `282 - 6 + 44,201 + 190,891 + 2 = 235,370 < 262,144`. An admitted 65-source constructor emits exactly 135 evidence-backed candidates and remains below the projection cap. Exact-vector result size remains Slice C. |

## Red-to-green record

All three focused Slice B suites were added before the compiler existed. The
first run failed during collection because `memory-m0-compiler.ts` was absent.
After implementation, 31/31 focused tests passed. The original 488-line module
was then split into 68-line canonicalization, 233-line projection, and 228-line
compiler responsibilities without changing behavior.

No red/green commit was created because owner authority explicitly excludes
commit, push, merge, release, publication, and deployment.

## Qualification

| Gate | Result |
| --- | --- |
| Node 22.22.3 Slice B focused tests under `LC_ALL=C` | 3 files, 31/31 passed |
| Node 24.15.0 Slice B focused tests under `LC_ALL=de_DE.UTF-8` | 3 files, 31/31 passed |
| Node 22.22.3 Engine typecheck | passed |
| Node 24.15.0 Engine typecheck | passed |
| Full Engine tests | 10 files, 140/140 passed |
| Engine build | passed |
| Full Core tests | 36 files, 288/288 passed |
| Core typecheck, contract freshness, schema validation, and build | passed |
| Public package facades, export maps, Structure v5, and CLI commands | unchanged |
| `git diff --check` | passed |

## Advisory review

One independent read-only advisory review returned **APPROVE**. It reran the
31 focused tests and Engine typecheck and reported no reproducible blocker for
`M0-F01` through the Slice B portion of `M0-L01`.

Its residuals remain non-blocking:

1. a generated maximum-width projection could strengthen the already
   executable conservative arithmetic proof;
2. actual preview exclusion for conflicted keys belongs to Slice C and is not
   claimed here; and
3. the test source statically rejects locale sorting while the two-locale
   execution proof is recorded by the controller rather than spawned inside
   the test process.

The reviewer also noted an extra duplicate-package-name rejection. The
controller removed that unlisted private policy, added the path-scoped equal-
name case, and reran every affected gate green. This narrows behavior to the
active descriptive-fact contract and does not require another review round.

## Boundary and next decision

Slices A and B are locally qualified together in the uncommitted worktree.
Slice C remains unauthorized. The next owner disposition may authorize Slice
C, revise Slice B through a named requirement and reproducible failure, or
hold `MEM-001` at this private local boundary.

No commit, push, merge, release, publication, deployment, filesystem
acquisition, source-code parsing, preview/vector integration, or live
experiment occurred.
