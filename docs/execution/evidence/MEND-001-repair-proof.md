# MEND-001 repair proof — exact import rewrite

- **Date started:** 2026-07-26
- **Branch:** `codex/lock-001-new-debt`
- **Workspace candidate:** unreleased `slopbrick@0.45.0`
- **Disposition:** corrected and locally requalified; explicit owner
  accept/revise/hold pending

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
- The edit may replace only the parser-owned module-source literal span after
  exact UTF-8-byte to UTF-16 offset conversion; escaped spellings fail closed.
- Preview and apply must share one planner; dry-run never writes.
- Apply and rollback must publish staged bytes atomically and preserve the
  target mode; a staging failure must leave the current target unchanged.
- Every suggestion-capable CLI path must render with the resolved repository
  config so an authorized module rewrite is neither invented nor omitted.
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
current bytes before publication; rollback rejects the wrong file, a modified
post-repair file, or corrupt original bytes before restoration.

### Adversarial review correction

Revision 79's first qualification was revoked after review. The initial
correction run reproduced 7 failures and 9 passes across the rule, transformer,
and CLI proof files:

1. quoted comments or string-named imports could be selected before the real
   module source, and SWC byte offsets were unsafe to use as JavaScript string
   offsets after non-ASCII text;
2. direct target writes could expose a partially written source on failure;
3. `scan --suggest` and standalone `suggest` could silently omit the exact
   repository-authorized patch because their diff renderer lacked config.

The corrected path carries the parser-owned source span through `facts.v2`,
stages exact bytes beside the target before atomic rename, verifies bytes and
mode after publication, and passes config through scan, suggest, watch, and
shared output rendering. Failure injection against a non-writable parent proves
that failed apply and rollback staging preserve the pre-call target bytes.

### Local qualification

- Focused parser/config/fix/rule/report/CLI and documentation-authority matrix:
  306/306 PASS with one worker on Node 24.15.0 and again on the supported Node
  22.22.3 floor.
- Recursive workspace typecheck: PASS on Node 24.15.0.
- Recursive workspace test: PASS — Core 289, Engine 150, Website 54, and
  SlopBrick 4,643 passed with 18 intentional SlopBrick skips.
- Recursive workspace build: PASS.
- Package-local no-telemetry self-scan: 308/308 selected files analyzed, zero
  parse/timeout/crash/internal failures, valid scores, AI Slop 0.0, Repository
  Health 99.94, and a passing policy gate.
- Production high-severity dependency audit: PASS with no known
  vulnerabilities; no dependency or lockfile changed in this slice.
- Diff audit: no new dependency, secret, network/auth surface, unsafe cast,
  ignored diagnostic, or unrelated workspace mutation.

The earlier quality-authority/public-copy integration defect and the later
three-finding adversarial review are both retained as evidence. Only the
Revision 80 corrected bytes and later captured green runs qualify this receipt.

## Owner-controlled scenario

The CLI test creates a temporary CRLF TypeScript workspace with exactly one
disallowed import and one repository-authored mapping. It proves:

1. `scan --fix --dry-run`, `scan --suggest`, and standalone `suggest` print the
   exact repository-authorized patch and leave bytes unchanged;
2. `scan --fix` changes only the module-specifier bytes;
3. JSON rescan contains no `context/import-path-mismatch` finding; and
4. a second `scan --fix` applies zero fixes and preserves the repaired bytes.

Separate parser and pure-transformer tests prove quoted decoys and non-ASCII
prefixes cannot redirect the edit, duplicate old text outside the import is
untouched, apply/rollback staging failure leaves source intact, file mode is
preserved, and rollback restores the original CRLF bytes byte-for-byte. The CLI
does not expose rollback as a public command.

## Remaining boundary

Push, merge, tag, npm publication, website deployment, broader Mend repairs,
team usefulness, demand, and pricing remain unapproved and unproven. The owner
must now choose accept, revise with a reproducible issue, or hold; technical
qualification alone does not close the plan.
