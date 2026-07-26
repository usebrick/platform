# MEND-001 repair proof — exact import rewrite

- **Date started:** 2026-07-26
- **Branch:** `codex/lock-001-new-debt`
- **Workspace candidate:** unreleased `slopbrick@0.45.0`
- **Disposition:** locally qualified; explicit owner accept/revise/hold pending

## Owner decision

The owner selected option 1 after reviewing the completed `LOCK-001` receipt:
accept the bounded local import-policy gate as useful and evaluate one exact,
repository-owned import rewrite. This authorizes local implementation and
verification only.

## Frozen repair boundary

- Authority comes from an exact `mend.importRewrites` source-to-target entry in
  repository config.
- The source must be the exact module specifier in an exact
  `context/import-path-mismatch` finding.
- The target must already satisfy repository `allowedImports` policy.
- The edit may replace only that parser-evidenced module-specifier span.
- Preview and apply must share one planner; dry-run never writes.
- A rescan must remove the intended finding, a second run must be a no-op, and
  rollback must restore the original bytes exactly.

No prefix inference, package discovery, dependency installation, import-binding
change, file move, arbitrary refactor, team claim, release, or public action is
authorized.

## Implementation evidence

The implementation stayed inside the existing SlopBrick config, rule, fix,
report, and CLI boundaries. It adds no dependency, schema, package, exported
umbrella command, network path, or outbound data.

| Contract | RED | GREEN / correction |
| --- | --- | --- |
| Strict exact config | `406942f33`, `00ca4abde` | `88b52b420`, `8d2860dd4` |
| Finding-bound suggestion | `fe4dca1db` | `50d75574f` |
| Exact span and rollback | `73cf77330`, `da06ad7e4` | `286664d85`, `7d29c04a4` |
| Shared preview/apply and binding | `4fda60b5a`, `b5347feb0` | `1e925a6d5`, `eddedf722` |
| Unsafe literal rejection | `86a9e5673` | `0099cc50a` |
| CLI rescan/no-op loop | `728deffb4` | covered by the existing integrated path |
| Executable, statically auditable advice | `d1d196b0a`, `91d4d2642` | `445a02544`, `facab95ff` |

The pure planner resolves only the evidenced module-specifier span, rejects
overlap and stale bytes, applies edits in descending offset order, and binds
before/after SHA-256 values to an internal rollback receipt. Apply rechecks the
current bytes before writing; rollback rejects the wrong file, a modified
post-repair file, or corrupt original bytes before restoration.

### Local qualification

- Focused MEND/config/fix/rule/report/CLI and documentation-authority matrix:
  240/240 PASS with one worker on Node 24.15.0 and again on the supported Node
  22.22.3 floor.
- Recursive workspace typecheck: PASS on Node 24.15.0.
- Recursive workspace test: PASS — Core 289, Engine 150, Website 54, and
  SlopBrick 4,637 passed with 18 intentional SlopBrick skips.
- Recursive workspace build: PASS.
- Package-local no-telemetry self-scan: 308/308 selected files analyzed, zero
  parse/timeout/crash/internal failures, valid scores, AI Slop 0.0, Repository
  Health 99.94, and a passing policy gate.
- Production high-severity dependency audit: PASS with no known
  vulnerabilities; no dependency or lockfile changed in this slice.
- Diff audit: no new dependency, secret, network/auth surface, unsafe cast,
  ignored diagnostic, or unrelated workspace mutation.

The first recursive test attempt exposed a quality-authority/public-copy
integration defect. That failure was reproduced and corrected by the final
RED/GREEN pair above; only the later captured green run qualifies this receipt.

## Owner-controlled scenario

The CLI test creates a temporary CRLF TypeScript workspace with exactly one
disallowed import and one repository-authored mapping. It proves:

1. `scan --fix --dry-run` prints the exact one-line patch and leaves bytes
   unchanged;
2. `scan --fix` changes only the module-specifier bytes;
3. JSON rescan contains no `context/import-path-mismatch` finding; and
4. a second `scan --fix` applies zero fixes and preserves the repaired bytes.

Separate pure-transformer tests prove duplicate old text outside the import is
untouched and rollback restores the original CRLF bytes byte-for-byte. The CLI
does not yet expose rollback as a public command.

## Remaining boundary

Push, merge, tag, npm publication, website deployment, broader Mend repairs,
team usefulness, demand, and pricing remain unapproved and unproven. The owner
must now choose accept, revise with a reproducible issue, or hold; technical
qualification alone does not close the plan.
