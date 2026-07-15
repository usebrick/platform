# Independent review — Task 2B authority publication/recovery

Date: 2026-07-15

## Verdict

**APPROVE for the bounded fixture-scale publication/recovery scope** after the
hardening commits `ec85d754c` and `1b7b1bee1`. The original `da15142fc` alone
was request-changes because it trusted complete/promoted phases, did not bind
direct plans to the fixed topology, and bypassed lock-only validation; those
findings are covered by the hardened implementation and regression tests.

## Re-review evidence

- Focused authority/loader/validator/planner suite: 4 files / 38 tests.
- SlopBrick one-worker TypeScript check: green.
- Full SlopBrick one-worker package gate: 313 files / 3,596 tests passed,
  5 files / 9 tests skipped (2 GiB heap cap).
- Custom create and replace smoke: complete, with old/new CAS generations
  preserved.
- Tamper probes: complete current, promoted source, staged static, graph bytes,
  fixed-topology paths, stale create, lock nonce, unsupported phase, and
  transaction-only orphan all fail closed.
- Lock-only and orphan-complete cleanup are explicit and journal-scoped.

## Residual non-blocking boundaries

Source-proposal bytes/materialization and indexed tool-receipt/snapshot
membership remain deferred by the prebuilt graph contract. The module header,
continuation plan, and SDD report state that `complete` is local byte
publication only and not corpus-admission readiness. Immutable-root/rename
TOCTOU remains a documented P2 hardening item for a future platform-specific
primitive; it is outside this bounded fixture gate.
