# MEND-001 — Prove the first deterministic reversible repair

- **Status:** `in_progress`
- **Priority:** 11
- **Track / lane:** implementation / mend
- **Owner:** UseBrick platform
- **Updated:** 2026-07-26

## Outcome

Prove one narrow repair can transform an already trusted deterministic finding,
rescan cleanly, pass repository checks, remain idempotent, and roll back
without collateral edits.

## Current truth

The Mend capability is not shipped, and arbitrary AI refactoring is outside the
product boundary. On 2026-07-26 the owner selected option 1: accept the bounded
`LOCK-001` workflow as locally useful and evaluate one exact repository-owned
import rewrite. This satisfies only the local resume gate. Team usefulness,
demand, pricing, and release remain separate and unproven.

The exact implementation and local technical qualification are now complete.
`MEND-001` remains `in_progress` because the final acceptance criterion is an
explicit owner disposition over the resulting receipt. Until then the proof
may be inspected but not widened into another mapping family, command, package,
or product claim.

The earlier GIR proposal survives only as deterministic transformation logic
inside this capability. It does not authorize a separate migrator product or
arbitrary model-driven refactoring.

## Scope

- Add one optional repository-owned `mend.importRewrites` map from an exact
  current module specifier to one exact replacement module specifier.
- Emit a repair only for an exact `context/import-path-mismatch` finding when
  its complete source string has a configured mapping and the replacement
  already matches repository `allowedImports` policy.
- Change only the parser-evidenced module-specifier span. Reuse the existing
  finding/source-snapshot binding and one pure rewrite planner for preview and
  apply.
- Prove strict config rejection, stale/ambiguous/unsupported rejection,
  dry-run/apply parity, no mutation during dry-run, idempotent rescan,
  repository checks, and byte-identical rollback.
- Run on fixtures and one owner-controlled local scenario; do not infer a
  replacement from an allowed prefix.

## Non-goals

- General autonomous refactoring, multi-file architectural migrations,
  model-only fixes, or repairs without repository test verification.
- Prefix, glob, package-name, or model-inferred replacements; import-binding
  changes; file moves; dependency installation; or target discovery.
- A standalone Mend package, a new public `usebrick` command, or widening
  existing generic token replacement semantics.

## Dependencies

- `requires`: `LOCK-001`
- `benefitsFrom`: `CAL-001`
- Resume gate: satisfied locally on 2026-07-26 when the owner selected option 1
  and the exact import-rewrite proof. This is not external or team evidence.

## Acceptance criteria

- Preconditions reject ambiguous, stale, already-fixed, or unsupported code.
- Dry-run shows the exact bounded edit and never mutates.
- Apply is deterministic and a second apply is a no-op.
- Rescan removes only the intended finding and repository checks pass.
- Rollback restores byte-identical original files.
- The repository owner explicitly accepts or rejects the repair; rejected
  repairs remain evidence without becoming participant or demand claims.

## Execution steps

1. **Complete:** record the accepted exact repair and start boundary ->
   Revision 78, this plan, and the evidence receipt agree.
2. **Complete:** red-test strict `mend.importRewrites` config admission -> the
   config rejects absent authority, multiple mappings, disallowed targets, and
   unsafe literal forms.
3. **Complete:** red-test and implement the exact finding-bound span
   transformer -> dry-run/apply parity, stale and ambiguous rejection,
   source-snapshot authority, and byte-for-byte rollback pass.
4. **Complete:** exercise the existing CLI -> dry-run leaves bytes unchanged,
   apply changes only the selected span, rescan removes the intended finding,
   and a second apply is a no-op.
5. **Pending owner:** accept, revise with a named reproducible issue, or hold
   the locally qualified proof without widening Mend.

## Verification

The local proof passes fixture hashes, dry-run/apply parity, idempotence,
rescan, repository tests, and byte-identical rollback. The final captured
commands and counts live in the evidence receipt; local qualification is not
release or team-use evidence.

## Evidence destination

`docs/execution/evidence/MEND-001-repair-proof.md`

## Rollback

Use the stored pre-edit bytes to restore affected files, then rerun the same
repository checks and scan.

## Next action

Review the completed local receipt and choose one disposition: accept and close
this exact proof, revise with a named reproducible defect, or hold it as local
evidence. Do not start another repair family before that decision.
