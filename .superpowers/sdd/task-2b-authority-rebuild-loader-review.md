# Task 2B symlink-safe prebuilt authority-graph loader review

Verdict: **APPROVE (bounded filesystem loader only)**

## Reason for Existence

Record the gate that separates caller-selected filesystem reads from the pure
authority-graph validator. The loader may be used as a future rebuild/recovery
input boundary only when exact paths, contained regular files, canonical bytes,
raw receipt maps, and the validator's relation joins all remain enforced.

## Reviewed boundary

Implementation commit: `a13444fc3`

Reviewed:

- `packages/slopbrick/src/calibration/v103/admission-authority-rebuild-loader.ts`
- `packages/slopbrick/tests/calibration/v103-admission-authority-rebuild-loader.test.ts`
- existing pure validator `admission-authority-rebuild.ts` and its fixture

The loader is read-only and caller-selected. It does not list or discover
authority candidates, mutate files, publish/recover a generation, call a
network, alter corpus labels, or expose readiness.

## Review findings

The exact request-key check permits only `projectRoot`, `proposalPath`,
`inputGenerationPath`, and optional `priorCurrentPath`. Proposal/input paths
are lexically and realpath-contained under `review/admission`; the authority
current path is fixed; static and source paths come only from validated current
pointers and source references. Generation-local and admission-root CAS receipt
paths are separately constrained, including the four-part SHA-256 CAS layout.

The project root is normalized but cannot be a symlink. Every selected path is
preflighted with `lstat`, rejecting symlink ancestors/targets, missing nodes,
and non-directory ancestors. A final `O_RDONLY | O_NOFOLLOW` reopen rejects a
leaf swap, and the second realpath check rejects an observed rename/ancestor
change. The implementation therefore has an explicit bounded symlink/TOCTOU
policy rather than treating a lexical `join` as containment proof.

The byte boundary is fail-closed: strict UTF-8 rejects BOMs and malformed
bytes; ordinary objects must equal Core canonical JSON with no extra newline;
`source-review.json` must be canonical JSON with exactly one final LF. Raw
input/static/source artifact bytes are retained and delegated to the existing
pure validator, which checks complete maps, lengths, hashes, self-hashes, and
cross-generation/source joins. Unknown files are not removed or rewritten.

## Evidence

The focused loader command passes **1 file / 7 tests**:

```text
NODE_OPTIONS=--max-old-space-size=2048 COREPACK_ENABLE_PROJECT_SPEC=0 corepack pnpm --filter slopbrick exec vitest run tests/calibration/v103-admission-authority-rebuild-loader.test.ts --maxWorkers=1 --minWorkers=1
```

The matrix covers normalization, valid no-discovery/no-mutation loading, CAS
artifacts, missing and pointer drift, traversal, symlink target/ancestor
rejection, raw artifact tampering, BOM, and noncanonical bytes. SlopBrick
typecheck and build pass; build emits only the existing non-fatal Zod generated-
declaration warnings. The post-commit package-wide SlopBrick gate passes with
one worker: **311 files passed / 5 skipped; 3,578 tests passed / 9 skipped** in
249.28 seconds. `git diff --check` passes.

## Verdict and remaining gates

**APPROVE** for the bounded loader. This does not approve full Task 2B or any
corpus/release claim. The canonical ledger remains **98/178** continuation and
**2/76** admission items. The external v10.3 root still has no materialized
`review/admission/sources` authority; the read-only state remains **329/329**
registered/reviewed sources, **452,382** quarantined/unrepresented units, zero
candidate units, zero eligible units, and blockers
`static_authority_unavailable` and `witness_authority_unavailable`.

Publication/recovery transactions, CLI commands, static/witness/resource
authority, real corpus census/admission, and release/deployment remain open.
P2 follow-ups are immutable descriptor-relative root/snapshot handling for the
residual check-then-open TOCTOU window and a documented/enforced cross-platform
POSIX `O_NOFOLLOW` policy. No corpus, remote, package-version, or release state
changed.
