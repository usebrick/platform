# Security review: CAL-002 Task 16 current-policy accessors

- **Reviewed:** 2026-07-22
- **Merge base:** `940e838d7`
- **Reviewed checkpoint:** `14c184b36`
- **Scope:** Task 16 source, tests, dependency declaration, and revision-38
  documentation
- **Verdict:** PASS

## Scope and trust boundaries

The production change adds two TypeScript modules. One accepts an unknown
policy value, passes it through the existing strict policy validator, requires
the complete applied form, verifies the exact owner-approved projection, then
copies and freezes the validated policy before exposing read-only accessors.
The other is an inactive provider that always returns `undefined`.

The reviewed production path performs no filesystem, network, shell, process,
database, template, authentication, or deserialization operation. The only new
file reads and `JSON.parse` calls are in a test helper, use repository-owned
constant paths and filenames, and are excluded from production risk under the
security-review test-file rule. The embedded SHA-256 values are public artifact
identities, not credentials or secret material.

## Vulnerability assessment

| Category | Result | Rationale |
| --- | --- | --- |
| SQL injection | Clear | No query construction or database sink. |
| XSS / template injection | Clear | No rendered output or HTML/template sink. |
| SSRF | Clear | No network client or user-controlled URL. |
| Command injection | Clear | No process or shell execution. |
| Authentication / authorization bypass | Clear | No identity or authorization boundary. Policy authority fails closed before accessors are created. |
| Unsafe deserialization | Clear | Production accepts an unknown object only through strict structural and exact-identity validation. Test-only JSON input uses fixed repository artifacts. |
| Path traversal | Clear | Production performs no path operation; test-only paths are constants. |
| IDOR | Clear | No object lookup across a user authorization boundary. |
| Weak cryptography / secrets exposure | Clear | SHA-256 is used only for deterministic identity binding; no secrets are introduced or logged. |
| NoSQL injection | Clear | No NoSQL query or sink. |

## Findings

No reportable findings at confidence 8/10 or higher. No unresolved HIGH finding
exists.

## Verification

- Focused Task 16 tests: 7/7 on Node 22.22.3 and 24.15.0.
- Focused source coverage: 100% statements, branches, functions, and lines for
  both current-policy modules.
- SlopBrick typecheck: pass on Node 22.22.3 and 24.15.0.
- Recursive test, typecheck, and build gates: pass.
- Independent final reviews: 99/100 and 100/100, zero findings.

## Residual boundary

The production provider remains inactive. Task 17 may connect registry, CLI,
watch, and worker behavior only through exact approved-policy mocks. Any later
activation of the provider is a separate security and release review boundary.
