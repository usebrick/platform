# Task 2B Core authority rebuild contracts report

Status: **DONE**

Implementation commit: `6f4b0942b` (amended below to include this report)

## Scope

Added only the Core authority rebuild lock/transaction contracts: strict v1
schemas and generated peers, schema index and fixture allow-list updates, pure
self-hash/shape validators plus lock-to-transaction identity joins, public
exports, focused contract tests, and valid/invalid schema fixtures. No
SlopBrick runtime, CLI, rebuild orchestration, corpus, I/O, or release work was
added. Pre-existing unrelated untracked `.astro/`, `TODO.md`, and `src/` paths
were left untouched.

## TDD evidence

- RED: `corepack pnpm --filter @usebrick/core exec vitest run tests/calibration-admission-authority-rebuild-contract.test.ts --maxWorkers=1 --minWorkers=1` — failed before implementation (4 tests failed: missing hash API and absent lock/transaction schemas/fixtures).
- GREEN: `NODE_OPTIONS=--max-old-space-size=4096 corepack pnpm --filter @usebrick/core exec vitest run tests/calibration-admission-authority-rebuild-contract.test.ts --maxWorkers=1 --minWorkers=1` — 4/4 tests passed.

## Verification

- `corepack pnpm --filter @usebrick/core codegen` — passed.
- `corepack pnpm --filter @usebrick/core validate:schema` — passed (`Schema fixtures validated successfully`).
- `corepack pnpm --filter @usebrick/core typecheck` — passed.
- `NODE_OPTIONS=--max-old-space-size=4096 corepack pnpm --filter @usebrick/core test -- --maxWorkers=1 --minWorkers=1` — passed (30 files, 223 tests).
- `corepack pnpm --filter @usebrick/core test:contract` — passed (`codegen is fresh`) after commit.
- `git diff --check` — passed.

## Contract coverage

Focused tests cover exact keys and versions, malformed operation/state tags,
extra keys, unsafe/traversal paths, sorted/unique source-directory identity,
fixed final current path, self-hash mutation, all lock/transaction handoff
identity joins, and strict AJV validation of both fixtures.

