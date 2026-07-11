# v10.3 release materialization Task 4B review

Date: 2026-07-11

## Verdict

**APPROVE.** Task 4B is complete at commit
`6ce6259da8306ac8030a84745b39e50f12177f1f` (tree
`cfcafd2d3e7240f490122fcf98f1d74bfdb2e920`) against the frozen release
materialization plan SHA-256
`08d30d9dca5b177764c5c631d98d570d75b2702a556438eaf8c10dadf292c26f`.

This approval covers the raw ZIP/container validator, bounded owned entry
streams, CRC/SHA checks, deterministic materialization inventory/receipt, and
stable reference codec. It does not approve extraction, filesystem
publication/reuse, corpus admission, calibration, packaging, or release.

## Reviewed implementation

- `src/calibration/v103/safe-zip.ts`
  - classic EOCD and ZIP64-v1 raw authority with exact central/local crosscheck;
  - printable ASCII relative paths, normalized collision and implicit-parent
    inventory, accepted host/type/flag/method/extra-field policy;
  - signed data descriptors and exact contiguous archive ranges;
  - BigInt-safe entry, path, compressed, uncompressed, and ratio ceilings;
  - borrowed positional reader lifetime with balanced yauzl `ref`/`unref` on
    success and initialization failure;
  - owned stored/deflate streams with raw/output accounting, exact inflater
    consumption, CRC32, SHA-256, and per-file/aggregate budget enforcement.
- `src/calibration/v103/materialization-receipt.ts`
  - path-free versioned receipt/reference shapes;
  - reserved-control-path rejection, exact path/count/file/byte ceilings, and
    incremental fail-closed retention;
  - sorted canonical entries with inferred parents, deduplication, and
    file/directory collision rejection;
  - exact one-LF canonical bytes and golden inventory/receipt/reference hashes;
  - accessor/proxy/typed-array snapshots that do not leak hostile getter or
    revoked-proxy exceptions.
- exact dependencies:
  - runtime `yauzl@3.4.0 -> pend@1.2.0`;
  - development `yazl@3.3.1 -> buffer-crc32@1.0.0`,
    `@types/yauzl@3.4.0`, and `@types/yazl@3.3.1`.

## Verification evidence

- Task 4B tests: safe ZIP 30/30 and receipt/reference 44/44.
- Combined Task 3/4A/4B boundary: trusted POSIX cache 43/43, safe ZIP 30/30,
  artifact acquisition 184/184, and receipt/reference 44/44; **301/301 pass**.
- Direct strict TypeScript compile of the three new test/helper files: pass.
- `corepack pnpm --filter slopbrick typecheck`: pass.
- `corepack pnpm --filter slopbrick build`: pass, retaining only the already
  known non-fatal Zod/Rollup declaration warnings.
- `corepack pnpm install --frozen-lockfile`: pass and already up to date.
- `git diff --check`: pass.
- Independent receipt review: APPROVE after reserved-descendant, sparse-array,
  and pre-retention budget corrections.
- Independent full specification review: APPROVE after exhaustive raw/yauzl
  field mutations, explicit low-memory inventory-budget tests, and a valid
  short-output deflate regression.
- Independent archive/filesystem security review: APPROVE with no remaining
  finding after yauzl initialization-ref cleanup and hostile accessor/proxy
  snapshot corrections; reviewer reran the 74 direct Task 4B tests.

Final SHA-256 values:

- safe ZIP source:
  `73bef44eba05eaac5d9d0bdae9b1b701e6a763c6bcefc406fbdfc98fcbdfe54e`;
- receipt source:
  `67ed6ea0f9e4f1e0b6cdb3c2b9697b5f0060e3939a7c79d882835ff3891d22d2`;
- safe ZIP tests:
  `cae9a20cf745327ab0c5bef5b2c66edb3713ef060f02a32119599ed390adc3cf`;
- receipt tests:
  `7bd451fffec0a2394d510e11dd301571b216ab8fe035236a5ca351715dcb9b7c`;
- independent ZIP fixture helper:
  `3ba6c38d3bcce9df49d48a97d6ce39f481ffb5aaabeb68562d4d82599869a125`;
- package manifest:
  `936298464bc417a3d8e77f5361e8923ef27a7edd58268bd438979b663aea95a5`;
- lockfile:
  `75dcc6554f17f873166c7d90961c33038e8602b4eb1d9b548601c9ea0cd006eb`.

## Staged self-scan incident and correction

The first Task 4B commit attempt exposed a real scanner defect: identical
staged file hashes scored 13.061 and then 17.773 thirteen seconds later. The
first run appended itself to the flywheel, crossed the three-run threshold,
and promoted `ai/compression-profile`; the hook loaded that new local state.

The prerequisite fix is commit
`efb069b902c1bc52e4bfa82462dc97458228a3eb`. Non-empty `--staged` and
`--changed` scans now ignore flywheel tuning and do not write telemetry,
project memory, baselines, incremental/AST caches, or snippets. Sequential
in-process duplication state is reset, and `runScan()` calls are serialized
while the cross-file rules remain process-scoped. The focused scanner suites
passed 240/240 and independent rereview approved the corrected diff.

On the exact Task 4B staged bytes, the rebuilt hook then repeated the same
13.061 score, analyzed 2/2 with zero parse failures, passed the `<= 15` gate,
and left the aggregate hash of every existing `.slopbrick` file unchanged at
`4b52530a94352cfccb233ab5f1808b3042fac49305418b4cf40f93866f0bb222`.
The repeated baseline-migration warning and irrelevant visual-axis score remain
open Gate 2 UX defects; this scoped pass is not whole-project release evidence.

## Open gates and next task

- Production audit remains red at 17 pre-existing advisories (3 low,
  10 moderate, 4 high); the complete graph remains red at 20 (4 low,
  11 moderate, 4 high, 1 critical). No advisory path traverses the exact ZIP
  dependency delta. The separate dependency-remediation tranche remains
  mandatory before packed Task 6 evidence.
- Task 4C must now implement private extraction trees, modes, bottom-up sync,
  receipt-last publication, hard-link-if-absent stable references, complete
  winner reuse verification, descriptor/path identity revalidation, cleanup,
  race, and crash-injection tests.
- The external corpus stays read-only and non-canonical. No source, label,
  register, selection, run, signal/verdict, remote, tag, publication, or
  deployment changed in Task 4B.
