# SB-045 — SlopBrick v0.45 release qualification

**Snapshot:** 2026-07-17
**Candidate:** `slopbrick@0.45.0` (unreleased)
**Implementation checkpoint:** `aa2bb36328da0434a6fea7a1fba24552de9c78af`
**Decision:** **NO-GO for release/publish**

The implementation and runtime qualification gates are green. The candidate
is not release-ready because its package-local self-scan completes truthfully
but fails the configured AI-slop policy. No threshold, rule activation, or
calibration claim was changed to make the result pass.

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
| Recursive tests | `corepack pnpm -r test` | pass: Core 35/285, Website 11/47, Engine 5/60, SlopBrick 350/3821; 5 SlopBrick files and 15 tests intentionally skipped |
| Recursive build | `corepack pnpm -r build` | pass: all four packages; known non-fatal Zod declaration-export warnings during SlopBrick bundling |
| RAM-safe package receipt | `corepack pnpm --filter slopbrick exec vitest run --testTimeout=60000 --maxWorkers=1 --minWorkers=1` | pass: 350 files, 3,821 tests; 5 files and 15 tests skipped |

### Packed Node 22/24 diagnostic

```text
corepack pnpm --filter slopbrick exec node scripts/test-packed-runtime-matrix.mjs \
  --expected-commit-sha aa2bb36328da0434a6fea7a1fba24552de9c78af \
  --manifest-builder-behavior-sha256 1a70c53dc0f950594a7c5c283423be58a233af3e93c5bb3052c94510f1c54a96 \
  --diagnostic-only
```

Result: `ok: true`, Node majors `[22, 24]`, `receiptsWritten: false`.

- Tarball SHA-256:
  `560d1641dd26642423bee5531ffaaa4340ab0c3e92665fd76650b038301efc9f`
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

Result: **exit 1, policy failure after successful completion**.

- `263` files selected and successfully analyzed; `0` parse, timeout, crash,
  or internal failures.
- `187` active issues; `495` default-off/inverted/noisy findings retained as
  audit-only evidence.
- AI Slop Score: `18.831558603262913`; configured threshold: `15`.
- Typed decision: `Gate decision: fail (thresholds: meanSlop)`.
- The prior score baseline was rejected for `config_hash` mismatch and was not
  used as release evidence.

This is a complete, reproducible scan with a no-go policy outcome. The next
action is to review or remediate the active signal burden with evidence; it is
not to lower the threshold or call the candidate published.

## Scope boundary

The current worktree still contains unrelated/user-owned untracked paths
(`.astro/`, `.playwright-cli/`, `TODO.md`, `pet-runs/`, and `src/`). They were
not staged or modified by this slice. No tag, push, GitHub release, npm
publish, website deployment, corpus admission, or outbound report was made.
