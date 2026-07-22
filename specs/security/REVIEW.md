# Security review: CAL-002 Task 17 runtime authority paths

- **Reviewed:** 2026-07-22
- **Merge base:** `6bdb9bbda`
- **Reviewed checkpoint:** `61dc8f803`
- **Scope:** Task 17 registry, score-selector, watch-normalization, worker,
  project coordinator, tests, review corrections, and orchestration diagnosis
- **Verdict:** PASS

## Scope and trust boundaries

Task 17 connects the inactive current-policy provider to three existing
scanner boundaries: rule-context creation, the canonical effective-issue
selector, and worker Bayesian/composite inputs. Tests replace only the
provider with the exact approved Task 15 projection. The production provider
still returns `undefined`, so production scans retain legacy behavior until a
separately reviewed activation task.

When a validated provider is present, policy-known blocked, superseded, and
retired rules fail closed before rule context creation. Policy-known
score-ineligible findings can remain visible when explicit diagnostic use is
permitted, but cannot enter the canonical scoring set, Bayesian inputs, or
synthetic-composite chaining. Explicit `off` remains stronger than policy
eligibility. IDs absent from current policy preserve the existing extension
and legacy fallback.

The change introduces no new filesystem read or write, network request,
process execution, database operation, template rendering, credential,
deserialization, or publication path. It consumes only the validated,
immutable accessor interface established by Task 16.

## Vulnerability assessment

| Category | Result | Rationale |
| --- | --- | --- |
| SQL injection | Clear | No query construction or database sink. |
| XSS / template injection | Clear | No rendered output or HTML/template sink. |
| SSRF | Clear | No network client or user-controlled URL. |
| Command injection | Clear | No process or shell execution. |
| Authentication / authorization bypass | Clear | The policy boundary narrows scanner authority; denied current rows cannot be re-enabled by severity overrides. |
| Unsafe deserialization | Clear | Task 17 accepts no serialized input and uses only Task 16 validated accessors. |
| Path traversal | Clear | No new path construction or filesystem operation. |
| IDOR | Clear | No user/resource authorization lookup. |
| Weak cryptography / secrets exposure | Clear | No new hash, secret, credential, or logging surface. |
| NoSQL injection | Clear | No NoSQL query or sink. |

## Findings

No reportable findings at confidence 8/10 or higher. No unresolved HIGH
finding exists.

## Verification

- Exact Task 17 nine-file focused gate: 188/188 on Node 22.22.3 and 24.15.0.
- SlopBrick typecheck: pass on Node 22.22.3 and 24.15.0.
- Recursive tests: Core 285, Engine 60, Website 54, and SlopBrick 4,511 passed
  with 15 intentional skips.
- Recursive typecheck and build: pass.
- Post-correction targeted authority coverage: 141/141 tests; the canonical
  score selector is 100% covered for statements, branches, functions, and
  lines.
- Independent final re-reviews: 100/100 and 100/100, no remaining findings.
- `git diff --check`: pass.

## Residual boundary

The production provider remains inactive. Task 17 proves behavior through the
exact approved-policy test helper but does not apply the matrix, activate
runtime authority, admit evidence, or authorize a push, tag, publish,
deployment, or release. Task 20 remains the separate activation and security
review boundary.
