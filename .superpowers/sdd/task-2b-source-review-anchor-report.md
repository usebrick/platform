# Task 2B source-review authority anchor report

## Result

Closed the remaining runtime-context provenance gap without changing Core
schemas or adding a synthetic review hash. `buildVerifiedAdmissionContext`
now resolves every rich-bundle source review through the exact
`review/admission/sources/<sourceId>/current.json` pointer, its Core-validated
hash-named generation, and `source-generation.json`. The runtime checks
canonical UTF-8/no-BOM bytes, contained regular files and symlink ancestors,
current/generation self-hashes and source/path joins, the generation's exact
`sourceReviewSha256`, and the on-disk `source-review.json` receipt (canonical
review JSON plus one final newline, exact byte count, and SHA-256).

The test-only fixture now materializes a minimal Core-valid genesis authority
for all 329 fixture source reviews. Focused mutations cover missing source
authorities, hash/path joins, receipt byte/hash drift, traversal, BOMs, and a
rich-bundle review-reason mutation whose record/stream/bundle/static/current
graph is rehashed while the external source generation remains unchanged.

## Files

- `packages/slopbrick/src/calibration/v103/admission-context.ts`
- `packages/slopbrick/tests/calibration/v103-admission-context-fixture.ts`
- `packages/slopbrick/tests/calibration/v103-admission-context.test.ts`

## Gates

- Focused context + disposition tests: **2 files / 13 tests passed**, one worker
  with `NODE_OPTIONS=--max-old-space-size=2048`.
- `corepack pnpm --filter slopbrick exec tsc --noEmit --pretty false` — passed.
- `corepack pnpm --filter slopbrick build` — passed. The existing non-fatal
  Zod declaration warnings remain.
- `git diff --check` — passed.

No schemas, corpus files, CLI/rebuild paths, package versions, or unrelated
working-tree paths were changed. Runtime intentionally fails closed when a
production bundle has no materialized source-generation authority; production
authority materialization remains a prerequisite before such a corpus can be
treated as ready.
