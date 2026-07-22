# Security review: CAL-002 Task 18 report provenance

- **Reviewed:** 2026-07-22
- **Merge base:** `c219ae352`
- **Reviewed checkpoint:** `be1be85b8`
- **Scope:** Task 18 first-scan evidence projection, terminal/JSON/Markdown/HTML/
  SARIF parity, stable finding matching, tombstone filtering, tests, and review
  corrections
- **Verdict:** PASS

## Scope and trust boundaries

Task 18 projects the inactive current-policy provider into one shared report
contract. Rule-authored source evidence remains separate from policy
provenance, and legacy signal metrics remain nested and explicitly historical.
The production provider still returns `undefined`, so production scans retain
legacy behavior until a separately reviewed activation task.

Renderer matching fails closed unless rule, category-derived area, severity,
AI-specific flag, file, line, column, message, and canonical finding identity
agree. Absolute issue paths can recover a repository root only by matching a
normalized, non-absolute, non-traversing projected suffix; the inference is a
pure string operation and grants no filesystem authority. Cross-file and
same-location message collisions therefore cannot inherit another finding's
policy evidence.

Blocked, superseded, and retired tombstones are removed before finding,
recommendation, and baseline-delta projection. Safe-repair language is limited
to deterministic or current-quality-calibrated findings with a finding-bound
repair. HTML policy copy passes through the existing escaping boundary, while
JSON and SARIF carry the same structured evidence object without parsing prose.

The change introduces no new filesystem read or write, network request,
process execution, database operation, credential, deserialization, or
publication path. Existing SARIF source-byte reads are unchanged; Task 18 only
adds fail-closed evidence association to their output.

## Vulnerability assessment

| Category | Result | Rationale |
| --- | --- | --- |
| SQL injection | Clear | No query construction or database sink. |
| XSS / template injection | Clear | New HTML evidence text is escaped before interpolation. |
| SSRF | Clear | No network client or user-controlled URL. |
| Command injection | Clear | No process or shell execution. |
| Authentication / authorization bypass | Clear | The projection cannot activate policy; non-runnable tombstones are removed consistently from every owner-facing count. |
| Unsafe deserialization | Clear | Task 18 accepts typed report objects and the validated Task 16 accessor boundary; it adds no parser. |
| Path traversal | Clear | Repository-root inference rejects absolute and parent-traversing projected paths, requires an exact normalized suffix, and performs no I/O. |
| IDOR | Clear | No user/resource authorization lookup. |
| Weak cryptography / secrets exposure | Clear | Existing finding identities remain comparison-only; no new secret, credential, or human-facing leaf-hash surface is introduced. |
| NoSQL injection | Clear | No NoSQL query or sink. |

## Findings

No reportable findings at confidence 8/10 or higher. No unresolved HIGH
finding exists.

## Verification

- Exact Task 18 eight-file focused gate: 123/123 on Node 22.22.3 and 24.15.0.
- SlopBrick typecheck: pass on Node 22.22.3 and 24.15.0.
- Recursive tests: Core 285, Engine 60, Website 54, and SlopBrick 4,530 passed
  with 15 intentional skips.
- Recursive typecheck and build: pass.
- Post-correction targeted report coverage: 123/123 tests; 84.55% statements
  and lines, 77.27% branches, and 97.77% functions across the seven selected
  report modules. The first-scan projection reaches 92.25% statements/lines,
  86.55% branches, and 100% functions.
- Independent final re-reviews: 99/100 and 99/100, no remaining findings.
- `git diff --check`: pass.

## Residual boundary

The production provider remains inactive. Task 18 proves report semantics
through the exact approved-policy test helper but does not apply the matrix,
activate runtime authority, admit evidence, or authorize a push, tag, publish,
deployment, or release. Task 19 remains the explain/MCP/catalog separation
slice, and Task 20 remains the separate activation and security-review boundary.
