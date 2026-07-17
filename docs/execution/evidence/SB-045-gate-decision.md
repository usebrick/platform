# SB-045 — Gate decision and remediation safety receipt

**Snapshot:** 2026-07-17
**Implementation checkpoint:** `aa2bb36328da0434a6fea7a1fba24552de9c78af`
**Status:** implementation contract green; release decision remains open

This receipt records the bounded trust-release implementation. It is not a
publish or admission approval.

## Contracts implemented

- `evaluateGateDecision()` is the typed source for the human summary, JSON
  report, Markdown/SARIF projections, and scan process exit. Incomplete scans
  and ordinary empty selections are `not-evaluated`; only an intentional empty
  Git selection may use exit `0`.
- `--fix`, `--dry-run`, and `--heatmap` preserve the same gate exit decision;
  a successful fix cannot turn a failed source scan into a pass.
- Fix suggestions carry `slopbrick-fix-binding-v1` identity: rule, file,
  finding location, and source/target SHA-256 snapshots. Missing, stale,
  cross-file, invalid, and ambiguous suggestions are skipped with a typed
  reason. Gated fix application no longer runs opportunistic file-wide visual
  codemods.
- `scan --baseline` writes a separate durable finding-identity baseline under
  `.slopbrick/cache/debt-baseline.json`. `ci --max-new-issues` compares the
  stable identity set, excludes suppressed findings, and fails closed when the
  baseline is missing or its config identity does not match.

## Contract proof

The focused red-first tests proved the report/exit relationship, durable
new-debt delta, CI wiring, stale/ambiguous fix rejection, and bound unified
diff behavior. The final committed package receipt is:

```text
corepack pnpm --filter slopbrick exec vitest run --testTimeout=60000 \
  --maxWorkers=1 --minWorkers=1
Test Files  350 passed | 5 skipped (355)
Tests       3821 passed | 15 skipped (3836)
```

The repository-wide typecheck, test, and build receipts are recorded in
`SB-045-release-qualification.md`. No release, publish, deployment, or
remote mutation was made.
