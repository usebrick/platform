# Security review: Memory, Lock, and Mend integration

- **Reviewed:** 2026-07-26
- **Reviewed range:** `3be4454a955155f9c60ad168ec2126f69c3614a2..01144639f9d71d43e20030408c51f955db9da417`
- **Scope:** the 65-commit integration range from local `main` through the
  owner-accepted MEND-001 closeout
- **Verdict:** PASS for source integration; npm publication and website
  deployment remain separately controlled by `REL-001`

## Security-sensitive changes reviewed

- repository-authored `allowedImports`, owned expiring Lock waivers, and one
  strict `mend.importRewrites` mapping;
- exact finding identity and self-consistent matched-source evidence;
- durable debt-baseline identity and the fail-closed `ci --lock-new-debt`
  decision path;
- parser-span-bound import preview, apply, and internal rollback;
- same-directory staged publication for Mend apply and rollback;
- calibration overlap relation checks and publication hardening;
- Core validation-facade cleanup, workspace dependency changes, and release
  documentation.

No new authentication, authorization, server, database, browser sink, outbound
telemetry transport, credential, subprocess, dynamic-code, or remote network
surface is introduced by this range.

## Trust-boundary assessment

### Lock

Lock evaluates only exact `context/import-path-mismatch` evidence backed by a
repository-owned `allowedImports` policy and a compatible reviewed baseline.
Built-in defaults, missing or incompatible baselines, no-file scans, and
incomplete scans do not pass enforcement. Waivers require a lowercase
SHA-256 finding identity, owner, reason, and canonical UTC expiry. Human and
machine reports retain policy provenance and redact secret-shaped values.

### Mend

Mend accepts only one exact repository mapping whose target already satisfies
the repository policy. The planner consumes a parser-owned module-source span,
rejects stale, ambiguous, escaped, overlapping, or unsupported input, and
binds before/after bytes by SHA-256. Apply re-reads a regular non-symlink file,
rejects invalid UTF-8 or stale bytes, stages beside the target with
`O_EXCL`/`O_NOFOLLOW` where supported, fsyncs the staged descriptor, rechecks
target device/inode/mode/bytes, and publishes with one rename. Rollback rejects
the wrong file, corrupt original bytes, and modified post-repair bytes.

The final snapshot check and rename cannot be one conditional filesystem
primitive on all supported platforms, so a same-user process racing the target
inside that narrow interval remains an operational residual. It does not
create an attacker-reachable remote path in the current local CLI model and
does not reach the reporting threshold.

### Calibration publication

The overlap publication path remains fixed-layout and root-bounded. Relation
validation binds the index, resource receipt, and ledger to one validated
generation and exact canonical byte receipts. The reviewed changes do not add
source acquisition, directory discovery during recovery, or a network path.

## Vulnerability assessment

| Category | Result | Rationale |
| --- | --- | --- |
| SQL injection | Clear | No database query or SQL sink changed. |
| XSS / template injection | Clear | No browser template sink changed; report fields are serialized or secret-redacted. |
| SSRF | Clear | No new network request or user-controlled URL path exists. |
| Command injection | Clear | No subprocess, shell, `eval`, or dynamic-code sink was added. |
| Authentication / authorization bypass | Clear | No identity or remote permission boundary exists in the changed path. |
| Unsafe deserialization | Clear | Config and receipt inputs are structurally validated; executable repository config remains an existing trusted-local boundary. |
| Path traversal / symlink write | Clear | Mend writes only the exact scanned target, rejects symlinks, stages in the same directory, and rechecks target identity before rename. |
| IDOR | Clear | No API or remotely addressable resource lookup exists. |
| Weak cryptography | Clear | SHA-256 binds integrity/identity; it is not used as an authentication primitive. |
| Secrets exposure | Clear | Diff scan found no credential-shaped value; reports retain existing redaction. |
| Dependency vulnerability | Clear | The high-threshold audit checked 377 production packages with zero advisories. |

## Findings

No unresolved finding reaches confidence 8/10, and no HIGH-severity finding is
present in the reviewed integration range.

Below-threshold residuals retained for future hardening:

- the local staged publisher has an unavoidable narrow identity-check/rename
  race without a platform-specific conditional-rename primitive;
- waiver owner/reason text is repository-authored executable-config data and
  secret-redacted, but is not a separate untrusted remote-input boundary;
- dedicated history scanning with Gitleaks or TruffleHog is not configured;
  the current high-confidence Git regex scan found only intentional test and
  documentation fixtures.

## Verification

- `git diff --check main...HEAD`: PASS.
- Conventional-commit audit over all 65 commits: PASS.
- High-confidence credential-pattern diff scan: PASS, no match.
- Production dependency audit: PASS, 377 packages and zero high-threshold
  advisories.
- MEND-001 focused proof previously captured: 306/306 on Node 22.22.3 and
  Node 24.15.0.
- Current recursive receipt: Core 289, Engine 150, Website 54, and SlopBrick
  4,643 passing with 18 intentional SlopBrick skips; recursive typecheck and
  build pass.

The full recursive gate must be rerun on the exact integration SHA before
source push. A green source-integration review does not authorize a tag,
GitHub Release, npm publication, or website deployment.
