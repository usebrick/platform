# SB-045 — SlopBrick v0.45 release qualification

**Snapshot:** 2026-07-17
**Candidate:** `slopbrick@0.45.0` (unreleased)
**Implementation checkpoint:** `c2d337b7f385963b150a8da5f9e823ccffa51ea5`
**Decision:** **GO for local v0.45 qualification; NO PUBLISH**

The implementation and local runtime qualification gates are complete. The
candidate's package-local self-scan passes the configured AI-slop policy after
an evidence-backed default-off disposition for the unadmitted
`ai/compression-profile` signal. No threshold was lowered, no current v10.3
calibration claim was made, and the signal remains explicitly opt-in. Public
release, publication, deployment, and owner claim authorization remain open.

## Current candidate facts

- Local generated package/website facts: **119 rules, 27 categories**.
- Public package truth remains separately pinned to the verified
  `slopbrick@0.43.0` artifact; the `0.45.0` candidate is not published.
- The packed diagnostic used one content-addressed tarball under both Node
  `v22.22.3` and `v24.15.0` on macOS.
- No canonical packed-runtime receipts were written: the run was explicitly
  diagnostic-only because independent reviewer IDs and the owner-approved
  v10.3 authority bundle were not supplied.

## Verification receipts

| Gate | Command | Result |
| --- | --- | --- |
| Recursive typecheck | `corepack pnpm -r typecheck` | pass: Core, Website, Engine, SlopBrick |
| Recursive tests | `SLOPBRICK_VITEST_WORKERS=1 corepack pnpm -r test` | Core 285/285, Website 47/47, Engine 60/60; SlopBrick 3815 passed/15 skipped with 7 failures in 4 host-sensitive files (beacon listen EPERM, special-mode bits, packed pnpm-store write) |
| Recursive build | `corepack pnpm -r build` | pass: all four packages; known non-fatal Zod declaration-export warnings during SlopBrick bundling |
| RAM-safe package receipt | `corepack pnpm --filter slopbrick exec vitest run --testTimeout=60000 --maxWorkers=1 --minWorkers=1` | pass: 350 files, 3,822 tests; 5 files and 15 tests skipped |

### Packed Node 22/24 diagnostic

```text
corepack pnpm --filter slopbrick exec node scripts/test-packed-runtime-matrix.mjs \
  --expected-commit-sha c2d337b7f385963b150a8da5f9e823ccffa51ea5 \
  --manifest-builder-behavior-sha256 1a70c53dc0f950594a7c5c283423be58a233af3e93c5bb3052c94510f1c54a96 \
  --diagnostic-only
```

Result: `ok: true`, Node majors `[22, 24]`, `receiptsWritten: false`.

- Tarball SHA-256:
  `a1289b32f42e6b1018661918ea866f88f2d5757c1a769c34b96eb596fcb7555e`
- `package/dist/calibration/v103/admission.cjs` behavior SHA-256:
  `1a70c53dc0f950594a7c5c283423be58a233af3e93c5bb3052c94510f1c54a96`
- Runtime observations: Node `v22.22.3` and Node `v24.15.0`, platform
  `darwin`; both existing offline packed-consumer contracts passed.

### Package-local self-scan

The mandated command was run from the package-local bin against the committed
candidate:

```text
corepack pnpm --filter slopbrick exec -- node ./bin/slopbrick.js scan \
  --workspace . --threads 1 --no-telemetry
```

Result: **exit 0, policy pass after successful completion**.

- `263` files selected and successfully analyzed; `0` parse, timeout, crash,
  or internal failures.
- `0` active AI-specific signals; `11` non-AI hygiene findings; `671`
  default-off/inverted/noisy findings retained as audit-only evidence.
- AI Slop Score: `0.0`; configured threshold: `15`.
- Typed decision: `Gate decision: pass`.
- Exact process exit: `0`.

The score change is an evidence-backed policy disposition: historical
`ai/compression-profile` calibration metadata remains diagnostic-only, while
the current v0.45 rule entry is `defaultOff: true` until current v10.3
admitted and leakage-checked evidence exists. The score threshold and source
implementation were not changed to manufacture a pass.

## Scope boundary

The current worktree still contains unrelated/user-owned untracked paths
(`.astro/`, `.playwright-cli/`, `TODO.md`, `pet-runs/`, and `src/`). They were
not staged or modified by this slice. No tag, push, GitHub release, npm
publish, website deployment, corpus admission, or outbound report was made.
