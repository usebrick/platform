# v10.3 release-materialization Task 4 plan rereview

**Date:** 2026-07-11
**Verdict:** **APPROVE / READY FOR TASK 4A**

## Reason for existence

This artifact records the targeted rereview of release-materialization Task 4
after dependency inspection, primary-source research, read-only compatibility
probes, and adversarial plan review exposed defects in the original
`safe-zip-v1` design. It approves the corrected plan only. It does not approve
Task 4 implementation, external-corpus admission, a calibration result, a
package, a release, push, tag, publication, or deployment.

## Reviewed bytes and scope

- Baseline release plan SHA-256:
  `3c115b75b63544c8fa281fb32532be25ed5d0a71b0afad7571163829668e93c5`
- Final corrected release plan SHA-256:
  `08d30d9dca5b177764c5c631d98d570d75b2702a556438eaf8c10dadf292c26f`
- Reviewed file:
  `packages/slopbrick/docs/calibration/v10.3-release-asset-materialization-plan.md`
- Scope: Task 4 plus the Task 4A/4B/4C execution boundaries and the later gates
  that consume its receipt/reference contract.
- `git diff --check` passed at the final hash.
- Two independent exact-hash rereviews returned `APPROVE`: one full-plan/spec
  pass and one filesystem/archive security pass. The last pre-approval blocker
  was corrected by retaining one verified owning archive `FileHandle` through
  extraction, publication or winner resolution, and final verification; the
  handle is then closed exactly once before a post-close pathname identity
  check.

The corpus-admission plan remains byte-unchanged at
`233ede7262dd408318230f32ab4cc5d2103caf8b5662ae4fb228088531f70e75`.

## Why the baseline was not ready

Review found that the original Task 4 description relied on behaviors that did
not form a complete security or crash-consistency contract:

| Finding | Corrected contract |
| --- | --- |
| Whole-directory `rename` could replace a winner and did not define durable publication. | A private random tree is fully verified and synced first. A canonical reference is published with same-filesystem hard-link-if-absent, the cache directory is synced after every namespace transition, and an `EEXIST` winner is completely reverified. |
| A checked archive pathname could be reopened or its descriptor closed too early. | One no-follow owning descriptor is identity-checked and hashed, borrowed through `RandomAccessReader`, retained through all publication/reuse checks, rehashed and restated immediately before success, closed exactly once, then compared with the pathname identity. |
| Library-decoded names could hide CP437/UTF-8, separator, normalization, or local/central disagreement. | `safe-zip-v1` accepts printable ASCII path bytes only, rejects Unicode-path extras, validates raw central and local names, and applies exact plus ASCII case-fold collision checks to every explicit and implicit prefix. Unicode support requires a separately versioned policy. |
| Central-directory validation alone could miss local-header tricks, gaps, overlaps, descriptor ambiguity, and polyglot bytes. | A bounded raw preflight owns EOCD/ZIP64-v1, central and local records, allowed extras, signed descriptors, contiguous ranges, safe arithmetic, and exact raw/yauzl agreement. |
| Yauzl did not supply the complete desired integrity boundary. | Yauzl supplies bounded central iteration and positional raw ranges only. SlopBrick owns method-0/method-8 decoding, CRC-32, actual sizes, compressed-input consumption, output budgets, and receipt hashing. The broken installed `openReadStreamLowLevelPromise()` path is forbidden; a reviewed callback adapter is required. |
| Path, metadata, receipt, and archive limits were incomplete. | All limits are constants, checked with safe/BigInt arithmetic, and covered at maximum and maximum-plus-one. Exact receipt and stable-reference byte bounds are included. |
| Recursive cleanup could follow a swapped path or delete a concurrent winner. | Cleanup is invocation-owned, postorder, descriptor/identity checked, non-recursive at the API boundary, and never owns the stable reference or published winner. |
| The dependency audit could be summarized as green despite unrelated advisories. | Task 4 may claim only that its exact ZIP delta adds no known advisory. The existing workspace advisories remain a separate release-security blocker and remediation tranche. |

## Frozen `safe-zip-v1` profile

The corrected plan freezes these principal limits and rules:

- `100,000` entries, `32 MiB` per file, `1 GiB` total uncompressed bytes,
  ratio `200:1`, path `4,096` bytes, segment `255` bytes, depth `64`, total
  canonical path bytes `64 MiB`, and extra-field bytes `1,024` per record;
- archive/receipt positional reads in `64 KiB` chunks;
- exact maximum receipt size `146,117,987` bytes and reference size `161`
  bytes;
- methods 0 and 8 only; no encryption, patched/masked/stream flags, unsigned
  descriptors, entry-level ZIP64, comments, leading/trailing bytes, gaps, or
  overlapping ranges;
- exact allowed extra-field grammars for `0x5455` and `0x7875`; and
- local POSIX cache semantics only, mode `0700` directories and `0600` files,
  with eight bounded random-name attempts.

Relaxing any of those rules requires a new policy version; observed corpus
contents cannot silently redefine v1.

## Dependency and audit evidence

The exact Task 4 graph is:

- runtime: `yauzl@3.4.0 -> pend@1.2.0`;
- development: `yazl@3.3.1 -> buffer-crc32@1.0.0`;
- development types: `@types/yauzl@3.4.0` and `@types/yazl@3.3.1`.

All are exact pins and MIT licensed. `corepack pnpm install
--frozen-lockfile` reproduces the graph after the workspace modules were
relinked to the pnpm 9.15.0-compatible store. CVE-2026-31988 affected only
`yauzl@3.2.0` and was fixed in 3.2.1; the pinned 3.4.0 is outside the affected
range.

The 2026-07-11 audit checkpoint is honestly red at workspace scope:

- production: 17 pre-existing advisories (3 low, 10 moderate, 4 high), all
  through the private website's Astro/Vite/esbuild paths;
- complete graph: 20 pre-existing advisories (4 low, 11 moderate, 4 high,
  1 critical), through Astro/Vite/esbuild, YAML, and Vitest paths; and
- no advisory is introduced through the exact ZIP dependency delta.

Task 4 may proceed on the final narrow statement only. Dependency remediation
and proof of the packed release remain mandatory before release Task 6 can be
accepted.

## Read-only external compatibility evidence

The intended EvalPlus archives under
`/Users/cheng/corpus-expansion/v10.3/sources/benchmarks/evalplus/release-v0.1.0/assets/`
were inspected without modifying or admitting them:

- `HumanEvalPlusGT.zip`: SHA-256
  `46433620672e9bd772443be154dc289736921bdbfcdf0397b76dc2dfac8e651a`,
  290,887 bytes, 330 ZIP entries;
- `starcoder_temp_0.0.zip`: SHA-256
  `46194d49945adc6555634244c21fb6c01870169fba468461f488c0509449da78`,
  127,036 bytes, 330 ZIP entries.

Both observed archives use host system 3, methods 0/8, zero general-purpose
flags, printable ASCII paths, no comments, contiguous non-overlapping ranges,
and only the two allowed extra-field IDs. Their observed inventories are
330/333 materialized paths, maximum path length 71 bytes, and total declared
ratios about 2.08/2.09. This is compatibility evidence only: it does not prove
license, label, provenance, review, admission, selection, or promotion.

## Primary-source checks

- PKWARE ZIP Application Note:
  <https://pkware.cachefly.net/webdocs/casestudies/APPNOTE.TXT>
- Yauzl design, raw-name, random-access, lifecycle, and stream API:
  <https://github.com/thejoshwolfe/yauzl>
- Node filesystem flags, `FileHandle`, positional reads, and `sync()`:
  <https://nodejs.org/download/release/latest-v24.x/docs/api/fs.html>
- Node raw-deflate stream and `zlib.bytesWritten`:
  <https://nodejs.org/download/release/latest-v24.x/docs/api/zlib.html>
- Node release schedule (Node 20 EOL; Node 22/24 supported):
  <https://github.com/nodejs/release#release-schedule>
- POSIX link-if-absent semantics:
  <https://pubs.opengroup.org/onlinepubs/9799919799/functions/link.html>
- POSIX rename replacement semantics:
  <https://pubs.opengroup.org/onlinepubs/9799919799/functions/rename.html>
- Unicode normalization and canonical-equivalence requirements supporting the
  intentional ASCII-only v1 boundary:
  <https://www.unicode.org/reports/tr15/>
- CVE-2026-31988 affected/fixed ranges:
  <https://nvd.nist.gov/vuln/detail/CVE-2026-31988>

## Approved execution boundary

Task 4 must execute as three separately reviewed TDD commits:

1. **Task 4A:** extract the already-proven trusted POSIX cache primitives into
   one shared module, retain all Task 3 behavior and 184 acquisition tests, and
   add focused shared-boundary tests.
2. **Task 4B:** land the exact dependency/lockfile delta, raw ZIP validator,
   fixtures, CRC, receipt/reference codecs, and borrowed-reader boundary.
3. **Task 4C:** land extraction, deterministic tree creation, durable
   publication, `EEXIST` reuse, full revalidation, and identity-safe cleanup.

Each slice requires RED evidence before implementation, affected-package gates,
staged checks, independent specification and code/security review, and a scoped
commit. The final Task 4 gate also requires Node 20/22/24 compatibility evidence
for the current `engines` promise, while the release program separately removes
the already-EOL Node 20 promise and proves the supported Node 22/24 policy.

## Final verdict

**APPROVE / READY FOR TASK 4A.** No reviewed plan blocker remains at SHA-256
`08d30d9dca5b177764c5c631d98d570d75b2702a556438eaf8c10dadf292c26f`.
Implementation, audit remediation, corpus admission, calibration, and release
evidence remain open and must not be inferred from this planning verdict.
