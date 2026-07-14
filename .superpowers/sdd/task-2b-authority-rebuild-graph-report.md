# Task 2B prebuilt authority graph validator

Status: **DONE (pure byte-backed validator slice)**

## Scope

Added `validatePrebuiltAdmissionAuthorityGraph` in
`packages/slopbrick/src/calibration/v103/admission-authority-rebuild.ts`.
The boundary is computation-only: it accepts the Core proposal/input/static/
current graph, exact canonical UTF-8 bytes, and per-source generation/current/
source-review/artifact bytes. It reuses Core validators/hash helpers for
self-hashes and proposal → input → static → current joins, binds each source
generation to its input/proposal references and current pointer, requires the
fixed `source-review.json` role, verifies every artifact receipt against its
caller-supplied bytes, rejects BOM/noncanonical/invalid UTF-8, and enforces
contained safe relative paths. No filesystem, CLI, corpus, schema, or release
code was added.

## TDD / verification

- RED: focused Vitest collection failed because the requested production module
  was absent (`Cannot find module .../admission-authority-rebuild`).
- GREEN: `corepack pnpm --filter slopbrick exec vitest run tests/calibration/v103-admission-authority-rebuild.test.ts --maxWorkers=1 --minWorkers=1` — **7/7 tests passed**.
- `corepack pnpm --filter slopbrick typecheck` — passed.
- `git diff --check` — passed.

Focused tests cover valid canonical bytes, top-level/source BOM and newline
rejection, malformed source artifact bytes, source current/hash/path drift,
proposal/input/static/current join drift, fixed-role/path substitutions, and
duplicate/extra-key source wrappers.
