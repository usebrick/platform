# Task 2B mutating authority-rebuild adapter report

**Date:** 2026-07-15
**Boundary:** candidate-aware, fixture-scale library adapter

## Result

The adapter now composes the existing prebuilt authority publisher, strict
byte-backed loader, and indexed tool-authority resolver without weakening any
of their contracts. Before the first mutation it resolves the fixed
`admission-static-ledgers-v1` / `authority:overlap` receipt and compares its
snapshot with the static generation. The caller cannot substitute hash-only
receipt metadata for that indexed chain.

At the publisher's `complete` phase, before journal cleanup, the adapter
reopens the selected proposal, input generation, static generation, current
pointer, source generations, declared artifact bytes, source proposals,
independent-review approvals, and candidate semantic-authority sidecars. It
compares every reopened object and raw byte to the publication graph. A second
reopen after successful publication is defense in depth. Verification failures
at the complete boundary remain recoverable publication failures; post-return
verification failures carry the publication result and diagnostic errors.

`verificationSha256` is intentionally a graph-byte proof only. The returned
tool-authority identity is separate, and the complete overlap-generation and
envelope/resource join remains owned by the runtime admission context. This
adapter proof is not a complete authority snapshot or a candidate-readiness
verdict.

Recovery uses the same preflight and verification path. A recoverable fault
fixture proves that the adapter can resume the publisher and return only after
the reopened graph matches the original graph. A mismatched indexed receipt
fails before `authority/current.json` is created.

Focused coverage is **5 files / 53 tests**: adapter (7), publication/recovery
(15), loader (10), graph (16), and overlap join (5). The adapter package
typecheck and build pass. The post-change package-wide one-worker gate is
recorded in the continuation plan at **317 files / 5 skipped; 3,627 tests
passed / 9 skipped**.

The package-local self-scan was also rerun with the required explicit local
binary. It analyzed 235 files with no parse, timeout, crash, or internal
failures, found 157 active low/medium diagnostics, and reported AI Slop Score
17.3 against the configured 15 threshold. Security was 100/100 with zero
security findings. The result is a truthful diagnostic (the existing baseline
was rejected for a config-hash mismatch); it is not being replaced by a new
baseline or presented as release evidence. The dominant findings are the
existing compression/Zipf/Heaps signals in repetitive authority code, with
one compression signal on this adapter. A follow-up review must decide whether
to refactor those patterns or adjust the calibrated rule policy before a
release gate is claimed.

## Explicit limits

- This is a library boundary, not a CLI, corpus replay, repository acquisition,
  label promotion, release, publish, or deployment operation.
- The adapter verifies the static generation's indexed tool-authority chain;
  the runtime admission context remains the boundary that opens and joins the
  complete overlap generation and envelope tree.
- Reopens are sequential and fail closed, but there is no cross-object atomic
  snapshot under concurrent writers yet.
- The existing publisher still materializes proposal and input-generation
  finals directly before later transaction-owned promotions. Fully staging
  those paths is a separate hardening slice.
- No corpus or readiness counts changed: the census remains 329/329 reviewed
  sources, 452,382 quarantined/unrepresented units, zero candidate/eligible
  units, and blockers `static_authority_unavailable` and
  `witness_authority_unavailable`.
