# Task 2B symlink-safe prebuilt authority-graph loader

Status: **DONE (bounded filesystem loader; not full Task 2B)**

Implementation commit: `a13444fc3`

## Reason for Existence

Connect the approved pure `validatePrebuiltAdmissionAuthorityGraph` contract
to a narrowly scoped filesystem reader. The reader must accept only caller-
selected authority files, preserve their exact bytes, reject path/symlink
escapes, and fail closed before any future rebuild, recovery, CLI, corpus,
witness, or release operation consumes the graph.

## Scope and files

Implementation:
`packages/slopbrick/src/calibration/v103/admission-authority-rebuild-loader.ts`

Focused tests:
`packages/slopbrick/tests/calibration/v103-admission-authority-rebuild-loader.test.ts`

The public API is `loadPrebuiltAdmissionAuthorityGraph(request)` with the alias
`readPrebuiltAdmissionAuthorityGraph`. The request has exactly:

- `projectRoot`
- `proposalPath`
- `inputGenerationPath`
- optional `priorCurrentPath`

The proposal and input-generation files are caller-selected; the loader does
not discover candidates by listing directories. It always reads the fixed
`review/admission/authority/current.json`, follows its static-generation
pointer to `generation.json`, and resolves each input source through the fixed
`review/admission/sources/<sourceId>/current.json` pointer and its hash-named
generation. Declared receipt maps may be generation-local or admission-root
content-addressed (`evidence-cas/sha256/<prefix>/<sha256>`). The loader reads
only those declared files and leaves unknown files untouched.

## Containment and byte contract

- The project root is normalized before use; a project-root symlink is rejected.
  Caller-selected paths reject NULs, backslashes, empty/traversal components,
  lexical escapes, realpath escapes, and non-contained path roles.
- An `lstat` preflight walks every ancestor and rejects symlink components,
  missing paths, and non-directory ancestors. The final regular-file reopen uses
  `O_RDONLY | O_NOFOLLOW`; a second realpath check rejects an observed
  ancestor/rename change before returning bytes.
- JSON objects require strict UTF-8, no BOM, no extra newline, and exact Core
  canonical JSON bytes. `source-review.json` is canonical JSON plus exactly
  one final LF.
- Input, static, and per-source receipt maps retain raw `Buffer` bytes. The
  loader passes them unchanged to the pure validator, which rechecks complete
  path coverage, duplicate/unsafe paths, byte lengths, SHA-256 values,
  self-hashes, and proposal → input → static → current/prior/source joins.
- Any malformed, missing, unsafe, symlinked, tampered, or race-detected input
  returns `{ ok: false, errors }`; the loader performs no writes, network calls,
  directory discovery, or readiness promotion.

## TDD and verification

RED was established before the loader module existed by the focused test
collection's missing-module failure. GREEN and post-implementation gates:

```text
NODE_OPTIONS=--max-old-space-size=2048 COREPACK_ENABLE_PROJECT_SPEC=0 corepack pnpm --filter slopbrick exec vitest run tests/calibration/v103-admission-authority-rebuild-loader.test.ts --maxWorkers=1 --minWorkers=1
```

Result: **1 file / 7 tests passed**.

```text
COREPACK_ENABLE_PROJECT_SPEC=0 corepack pnpm --filter slopbrick typecheck
```

Result: passed.

```text
COREPACK_ENABLE_PROJECT_SPEC=0 corepack pnpm --filter slopbrick build
```

Result: passed. The existing non-fatal Zod declaration warnings about Zod
symbols in generated declaration bundles remain; they are not loader failures.

The post-commit package-wide SlopBrick run also passed with one worker and a
2 GiB heap cap: **311 files passed / 5 skipped; 3,578 tests passed / 9 skipped**
in 249.28 seconds.

```text
git diff --check
```

Result: passed.

The seven tests cover project-root normalization, valid no-discovery/no-
mutation loading, admission-root CAS artifacts, missing/current-static drift,
traversal plus symlink ancestors/targets, input/static/source artifact-byte
tampering, and BOM/noncanonical object bytes.

## Boundary and deferred work

This report closes only the bounded loader. It does not implement generation
publication/recovery, `rebuild:pre-witness`, `static-authority:recover`, or
`census:preview`; materialize the missing production `sources` subtree; create
static/witness/resource authority; admit corpus records; or publish/release a
package. The ledger remains **98/178** continuation items and **2/76** v10.3
admission items. The read-only corpus state remains **329/329** registered and
reviewed sources, **452,382** quarantined/unrepresented units, zero candidate
units, zero eligible units, with blockers
`static_authority_unavailable` and `witness_authority_unavailable`. No corpus
labels/bytes, manifests, remote refs, package versions, or release state
changed.

P2 follow-ups are to narrow the residual check-then-open TOCTOU window with an
immutable descriptor-relative root/snapshot and to document/enforce the
supported POSIX `O_NOFOLLOW` policy and fallback behavior across platforms.
