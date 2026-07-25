# MEM-001 local M0 Slice C evidence

- **Qualification state:** locally qualified before integration; unshipped
- **Date:** 2026-07-25
- **Plan:** [`MEM-001`](../plans/MEM-001-read-only-m0.md)
- **Authority:** [`Accept Slice C`](./MEM-001-slice-c-owner-decision.json)
- **Requirements:** `M0-S02`, `M0-H01`, `M0-L01`, and `M0-R01` through
  `M0-C01`
- **Base commit:** `a0c29dd37dc024425336c03f98b1c6aa360c191a`

Result classification: `deterministic local fixture conformance`.

## Red checkpoint

Before Slice C product code existed, the one-worker focused command failed in
both new suites because `packages/engine/src/memory-m0-renderer.ts` could not
be resolved:

```bash
corepack pnpm --filter @usebrick/engine exec vitest run \
  tests/memory-m0-renderer.test.ts \
  tests/memory-m0-vector.test.ts \
  --maxWorkers=1 --minWorkers=1
```

The failure was limited to the absent authorized renderer module. No prior
Slice A or Slice B test was changed to manufacture the red state.

## Implementation checkpoint

- Added one package-private value-only renderer with a shared 2,048-byte fact
  selection, complete-row omission, exact descriptive wrappers for Codex,
  Claude, and Copilot labels, 4,096-byte preview drift assertions, rendered
  text byte counts and SHA-256, and recursively frozen return values.
- Added one test-only committed-vector harness. It accepts no caller-authored
  suite, reconstructs all three fixture projections and previews, and reduces
  exactly nine tasks across 27 target cells.
- The first implementation run passed seven of eight focused tests. The only
  remaining failure was this deliberately absent Slice C receipt; all renderer,
  omission, inventory, golden-artifact, reducer, size, import-boundary, and
  public-surface checks were already green.

## Review and correction

The first targeted blind review found one reproducible in-scope defect: the
renderer recursively froze selected assertion, key, and evidence objects that
still belonged to the caller's projection. The controller reproduced the
mutation with a failing `structuredClone` regression test, then fixed the
renderer by cloning every selected assertion, claim key, evidence item, and
omitted key before recursively freezing the returned value.

Two fresh blind reviews over the corrected implementation returned **PASS** at
96/100 and 98/100 with no must-fix or should-fix finding. Their independent
probes confirmed that all three fixture inputs remained unfrozen and
unmodified, no output shared object identity with caller-owned projections,
and every returned output was recursively frozen. Scores are advisory; the
reproduced mutation and its regression test are the controlling evidence.

## Qualification

- Focused renderer/vector suites passed 10/10 under Node 22.22.3 with
  `LC_ALL=C` and 10/10 under Node 24.15.0 with `LC_ALL=de_DE.UTF-8`; Engine
  typecheck passed under both runtimes.
- Current package suites passed at Core 288/288, Website 54/54, and Engine
  150/150. The SlopBrick suite had an earlier complete 4,603-pass/18-skip run;
  no private Memory module is imported by its production or test facade.
- Post-correction recursive typecheck passed. Recursive build passed with only
  the existing Zod declaration-bundling warnings. Public Core/Engine exports,
  package metadata, schema inventory, Structure v5, and CLI surfaces have no
  base diff.
- Independent reconstruction matched all three expected artifacts and all 27
  reducer cells. Artifact JCS SHA-256 was
  `874e1b8bf3b671f63f01dd9d1d3009e6e79c7f004e07901e92a8f57f7d521506`;
  result JCS SHA-256 was
  `5aedb337d082714eb070535806f154a7b5a80b45fe0468739c2a830f7319eafc`.
  The result records 3 fixtures, 9 tasks, 27 improved cells, all three targets,
  9 native-covered requirements, 54 Memory-covered requirements, and zero
  forbidden exposures. Maximum selected fact-row payload was 2,039/2,048
  bytes, maximum preview was 2,492/4,096 bytes, result JCS was 9,144/131,072
  bytes, and the committed vector was 103,296 bytes.
- The package-local no-telemetry self-scan completed 303/303 files, passed
  policy at Repository Health 99.94, and created no durable baseline. Its four
  medium duplicate-block findings predate and sit outside the private MEM-001
  surface.

### Recursive-suite timing note

Post-correction aggregate SlopBrick retries exposed rotating, unrelated timing
assertions under host load rather than a stable functional failure:

- default workers twice timed out the same admission-publication recovery case;
  it passed alone in 11.8 seconds and passed inside the one-worker aggregate in
  14.1 seconds;
- two workers passed that publication case but timed out one 8-second watch
  poll; both matching JSON watch variants passed alone in 4.1 seconds total;
- one worker passed those cases but timed out a different 15-second watch poll
  and exceeded the structural-clone 2-second performance threshold at 2.316
  seconds. They passed immediately in isolation at 1.265 seconds and 0.484
  seconds.

The final one-worker aggregate therefore reported 4,601 passed, 18 skipped,
and those two unrelated timing failures. No aggregate failure names an active
Memory requirement, imports the private Memory modules, or demonstrates an
in-scope consequence. Under the focused acceptance contract's four-part
blocker rule, these timings are recorded qualification caveats, not MEM-001
blockers; no unrelated timeout or scanner code was changed.

## Claim boundary

This receipt can establish only deterministic conformance to the committed
local synthetic fixture vector. It is not evidence of coding-agent efficacy,
real-repository improvement, inferred policy authority, market demand, release
qualification, public availability, or a shipped MemoryBrick product.

The Slice C authority itself authorized or performed no filesystem acquisition,
source-code parsing, provider call, network, credential, persistence, native
instruction-file write, telemetry transport, commit, push, merge, release,
publication, or deployment.

## Post-qualification integration decision

After this qualification receipt, the trusted owner selected option `1` and
authorized exactly one local checkpoint commit through
[`MEM-001-local-commit-owner-decision.json`](./MEM-001-local-commit-owner-decision.json).
That separate decision carries the qualified private implementation, tests,
decisions, receipts, and synchronized documentation into local history only.
It does not authorize push, merge, tag, release, publication, deployment, or
any broader Memory capability or claim.
