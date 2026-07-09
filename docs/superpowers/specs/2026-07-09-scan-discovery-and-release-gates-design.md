# Scan discovery and release-gate recovery design

## Status

Approved by the user's instruction to “fix all” after review of the proposed monorepo-discovery direction.

## Problem

SlopBrick now starts and terminates workers safely, but its self-scan scope is false:

- scanning `/Users/cheng/platform` finds only 12 nested Python calibration scripts because the defaults contain `**/*.py` but TypeScript is limited to top-level `src/`, `app/`, `components/`, and `pages/`;
- scanning `/Users/cheng/platform/packages/slopbrick/src`, as required by `AGENTS.md` and the release plan, finds the package config in its parent but resolves that config’s `src/**/*` globs against the already-descended `src/` directory, producing zero files and a misleading clean report;
- machine-readable zero-file scans suppress the warning and still emit headline health scores.

The remaining current release blockers are separate but adjacent: CI threshold evaluation exits before the CI gate runs, four Dart rules lack required hints/signal metadata, and source/build/package surfaces need a common smoke contract.

Fresh full-suite triage also proved the earlier removal of `"type": "module"` was the wrong long-term package boundary: it made the current `.js`/`.mjs` build loadable but caused `tsx src/index.ts --help` to load ESM-only dependencies through CommonJS and fail. Node's package contract is explicit: `.js` is ESM inside a `type: module` package and `.cjs` is always CommonJS. SlopBrick will restore that explicit package type and configure the build extensions to match it.

## Design decisions

### 0. Source, ESM, and CommonJS formats are explicit

`packages/slopbrick/package.json` retains `"type": "module"`. The ESM build uses `.js`; the CommonJS build uses `.cjs`; `exports.import` and `exports.require` point to those exact artifacts. The source CLI, built CLI, and packed CLI must expose the same help/version/scan behavior. Worker resolution checks the emitted `.cjs` and `.js` worker entries and does not construct a worker for the inline scan path.

### 1. Config paths have a stable base

Include and exclude patterns from `slopbrick.config.*` are relative to the directory containing that config. When `--workspace` names a descendant directory, discovery starts at the config directory and then intersects results with the requested workspace subtree. This makes `--workspace packages/slopbrick/src` scan only that package’s `src/` files while still interpreting `src/**/*` correctly.

CLI overrides remain relative to the requested workspace, because the user supplied them for that invocation.

### 2. Monorepo roots expand declared workspaces

When the requested workspace is a detected monorepo root and no root config overrides includes, discovery expands the package roots declared by `pnpm-workspace.yaml`, `package.json#workspaces`, or Nx. It applies the normal default include/exclude contract within each declared package and combines absolute paths deterministically.

This avoids a broad repository-wide `**/*.{ts,...}` glob, which would silently pull fixtures, generated sources, vendored code, and unrelated directories into ordinary scans.

### 3. Zero analyzed files are explicit, not clean

The report records requested/discovered/analyzed/failed counts and a scan status. A zero-file or incomplete scan may still return structured JSON, but it cannot present a clean headline without a prominent `empty` or `partial` status. CI treats empty and partial scans as tool failures, not threshold passes.

### 4. Scan actions return outcomes

The scan action returns a typed outcome to its caller. Only the top CLI boundary selects `process.exitCode`. The `ci` command consumes the report, evaluates its thresholds, then selects the documented exit code. This removes the current early-exit path that makes failing CI thresholds exit zero.

### 5. Generated rule contracts are complete

Every registered rule, including the four new Dart rules, must have a `RULE_HINTS` entry and signal-strength/default-state metadata. Registry generation and guardrail tests remain the source of truth; no test-only bypasses are allowed.

## Boundaries

- Do not change scoring formulas, calibration thresholds, schemas, or rule detection logic in this recovery tranche.
- Do not absorb unrelated dirty calibration or release edits into task commits.
- Do not broaden the default scan to undeclared directories in a monorepo.
- Do not make local publishing or deployment changes.
- Every behavior change follows red-green-refactor and receives an independent task review.

## Verification

The tranche is complete only when:

1. package-local typecheck and build pass;
2. focused discovery, CLI, CI, Dart contract, pool, and packaged-worker tests pass;
3. the documented `packages/slopbrick/src` self-scan analyzes a non-zero, plausible TypeScript file count;
4. the platform-root self-scan analyzes source from every declared TypeScript workspace, reports honest counts/status, and stays within the bounded worker lifecycle;
5. a deliberately failing CI threshold exits non-zero;
6. a clean build’s CJS/ESM entries and worker artifact remain loadable;
7. a final whole-range reviewer finds no Critical or Important issue.
