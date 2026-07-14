# Task 2B Core rich pre-witness slice report

Status: **DONE**

Implementation commit: `286741d152cdf7b829ee45670b493bfe8a54eb65`

## Verification

- RED: `corepack pnpm --filter @usebrick/core exec vitest run tests/calibration-admission-pre-witness-bundle-contract.test.ts --maxWorkers=1 --minWorkers=1` — failed before implementation because the new valid fixture was not present (`ENOENT`); the focused suite reported 9 failing tests.
- GREEN: the same focused command — 9/9 tests passed.
- `corepack pnpm --filter @usebrick/core codegen` — passed.
- `corepack pnpm --filter @usebrick/core test:contract` — passed (`codegen is fresh`, after the implementation commit).
- `corepack pnpm --filter @usebrick/core validate:schema` — passed (`Schema fixtures validated successfully`).
- `corepack pnpm --filter @usebrick/core typecheck` — passed.
- `corepack pnpm --filter @usebrick/core test` — passed (29 files, 216 tests).
- `git diff --check` — passed.

## Files changed

- Added the strict v1 bundle schema, generated peer, pure validator/type exports, and schema index/fixture allow-list entries.
- Added valid and invalid schema fixtures plus focused contract mutations covering exact keys/version, canonical self-hash, witness policy order/expansion, stable IDs, component guards, record-stream path, and witness/search/review contamination.
- Updated the schema contract expected index and deterministic codegen for the exact two-policy tuple and bounded profile array.

## Concerns

- The validator intentionally wraps existing Core guards and adds stricter pre-witness partition checks; it does not construct runtime context or perform I/O.
- The initial RED run was a fixture-setup failure (`ENOENT`) rather than a semantic assertion failure; all focused semantic mutations are green after the fixture and implementation were added.
- Unrelated pre-existing untracked paths (`.astro/`, `TODO.md`, `src/`) were left untouched.
