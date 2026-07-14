# Task 2B runtime context/disposition report

## Result

Implemented the bounded, byte-backed SlopBrick runtime context/disposition
slice. The factory reads the fixed authority pointer, exact hash-named static
generation, pinned pre-witness bundle, and pinned admission-record JSONL from a
contained local root. It verifies canonical bytes, Core self-hashes and joins,
record-stream hashes, source-review equality, ledger record sets, and overlap
completion before deep-freezing and privately branding the context. Disposition
derivation uses only the private verified record map and fails closed for
unknown IDs or invalid context objects.

## TDD evidence

- RED: before production modules existed, the focused context test failed at
  collection with `Cannot find module '../../src/calibration/v103/admission-context'`.
- GREEN: the focused context and disposition tests pass with one worker and a
  bounded heap: 2 files, 12 tests passed.
- The initial implementation reused a temporary fixture helper exported by the
  context test; the review fix moved that helper into a standalone test module
  so each focused file owns its cleanup and registration.

## Files

- `packages/slopbrick/src/calibration/v103/admission-context.ts`
- `packages/slopbrick/src/calibration/v103/admission-disposition.ts`
- `packages/slopbrick/tests/calibration/v103-admission-context.test.ts`
- `packages/slopbrick/tests/calibration/v103-admission-context-fixture.ts`
- `packages/slopbrick/tests/calibration/v103-admission-disposition.test.ts`

## Gates

- `corepack pnpm --filter slopbrick typecheck` — passed.
- `corepack pnpm --filter slopbrick build` — passed. The existing bundler
  emitted non-fatal zod declaration warnings.
- `git diff --check` — passed.

No changes were made to `v103-admission.ts`, corpus/release artifacts,
package version, or remote refs. Existing unrelated untracked paths (`.astro/`,
`TODO.md`, and `src/`) remain untouched.

## Review-fix closeout — 2026-07-14

The reviewed slice was tightened without adding a filesystem/input seam,
rebuild orchestration, CLI work, corpus writes, or release changes.

- Static-authority resolution now reads only the fixed current pointer, its
  exact hash-named `generation.json`, the exact `pre-witness-bundle.json`, and
  the exact record stream. It requires exactly one metadata receipt for each
  static ledger/bundle role, binds every receipt `sha256` to the corresponding
  static-generation semantic hash, checks canonical projection byte counts,
  and does not read arbitrary `staticGeneration.artifacts` projections.
- Parsed stream record IDs are passed directly to Core privacy, quality, and
  lineage validators; their covered/unresolved partitions must equal that
  exact stream set.
- The private record map now retains each complete canonical record plus its
  canonical JSON/hash. Records are joined to the matching source review and,
  when present, privacy/quality/lineage result fields and reviewer decisions;
  records unresolved by any required ledger are forced to remain quarantined.
  The current Core schema exposes no independent per-record hash beyond the
  stream's canonical-record aggregate, so this slice does not invent a second
  trust field; represented cross-ledger joins fail closed instead.
- Canonical JSON and JSONL readers reject a UTF-8 BOM before decoding, avoiding
  `TextDecoder`'s BOM stripping behavior.
- Overlap admission now requires both completion/limit flags and exactly one
  indexed, successful `authority:overlap` receipt from the frozen static-ledger
  profile whose canonical receipt hash equals `toolReceiptSha256`. Placeholder
  and wrong-action receipts fail closed.
- Focused mutation coverage includes pointer/generation/bundle/stream joins,
  projection-orphan non-discovery, stream bytes/count/set/aggregate/path,
  source-review drift, all three ledger partitions, overlap flags/receipt
  binding, traversal, and malformed inputs. The shared fixture is now in
  `v103-admission-context-fixture.ts`, so disposition no longer imports a test
  file.

### Review-fix gates

- Focused context + disposition: **2 files / 11 tests passed** with one worker
  and bounded heap.
- Disposition file alone: **1 file / 2 tests passed**.
- `corepack pnpm --filter slopbrick typecheck`: passed.
- `corepack pnpm --filter slopbrick build`: passed; existing non-fatal Zod
  declaration warnings remain.
- `git diff --check`: passed.

The implementation fix is committed as `89d6f1d19` (`fix(calibration):
tighten runtime context authority joins`), with the metadata-only static role
anchor follow-up in `da724db75` (`fix(calibration): retain static artifact role
anchors`). This closeout includes the focused mutation and integrity fixes in
the current commit.
