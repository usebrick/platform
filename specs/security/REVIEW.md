# Security review: CAL-002 Task 19 explanation and policy authority

- **Reviewed:** 2026-07-22
- **Merge base:** `a0c920f70`
- **Reviewed checkpoint:** `52af3e272`
- **Scope:** current-versus-historical explanation, generated 119-row catalog,
  repository/invocation provenance, main and v10.3 workers, direct docs and
  secondary diagnostic authority, audit-only accounting, persistence and
  flywheel history, tests, and review corrections
- **Verdict:** PASS for Task 19 code; PUBLIC RELEASE BLOCKED by dependency audit

## Scope and trust boundaries

Task 19 does not activate the approved policy. The production provider still
returns `undefined`, and the generated catalog accepts a policy only through an
explicit local path or injected test provider. Canonical policy validation
requires the exact 119 identities and retains `admitted: false`; historical
v10.1 metrics cannot supply current runnable, score, gate, or quality authority.

Repository rule configuration and invocation includes are carried as separate,
structured values. Main and calibration workers do not construct shell
commands from them, and repository `off` wins before rule execution. Direct
documentation scanning reuses existing bounded filesystem reads and applies
current runnable, score, and gate projections independently.

The only new durable rewrite is the existing local
`.slopbrick/structure.json` history path. Migration removes offense IDs only
when the immutable current policy makes them score-ineligible, is skipped when
project memory is read-only, and cannot erase otherwise eligible history due
to a temporary repository override. Config and flywheel overrides affect only
the in-memory teaching projection. Existing telemetry, report, and repository
memory paths are not widened.

The change adds no network client, database query, authentication boundary,
credential handling, dynamic code evaluation, archive extraction, or public
workflow. Catalog and documentation inputs remain local owner-controlled paths.

## Vulnerability assessment

| Category | Result | Rationale |
| --- | --- | --- |
| SQL injection | Clear | No query construction or database sink is introduced. |
| XSS / template injection | Clear | Task 19 adds structured terminal, Markdown, MCP, and catalog fields; it introduces no unescaped browser interpolation. |
| SSRF | Clear | No new network request or user-controlled URL fetch. |
| Command injection | Clear | Worker provenance is structured data and never enters a shell command. |
| Authentication / authorization bypass | Clear | The inactive provider cannot grant runtime authority; repository `off` remains stronger than invocation opt-in. |
| Unsafe deserialization | Clear | Explicit local policy input passes the existing canonical schema and exact-identity validators. |
| Path traversal | Clear | Existing docs/catalog paths remain local explicit inputs; no new path-derived write target is added. |
| IDOR | Clear | No user/resource authorization lookup. |
| Weak cryptography / secrets exposure | Clear | SHA-256 remains integrity binding only. Human docs expose one checkpoint identifier and keep leaf and audit-payload identities machine-only. |
| NoSQL injection | Clear | No NoSQL query or sink. |

## Findings

No reportable Task 19 code finding exists at confidence 8/10 or higher. Two
fresh independent final reviews returned 98/100 with zero must-fix findings.

The repository dependency audit independently reports three failing high
advisories: two affected `brace-expansion` ranges and one affected `svgo`
range. It also reports one moderate Astro reflected-XSS advisory. These are
public-release blockers under `REL-001`; Task 19 made no package or lockfile
change and does not claim to resolve them.

## Verification

- Exact Task 19 35-file gate: 637/637 on Node 22.22.3 and 24.15.0.
- Reviewer-scoped reruns: 182/182 across 14 files and 212/212 across 15 files.
- Recursive tests: Core 285, Engine 60, Website 54, and SlopBrick 4,580 passed
  with 15 intentional skips.
- Recursive lint, typecheck, and build: pass.
- Package-local self-scan: 99.81/100; 13 active medium findings; 803
  policy-ineligible findings auto-suppressed; policy gate pass.
- High-severity dependency audit: fail; release blocker recorded above.
- `git diff --check`: pass.

## Residual boundary

The production provider remains inactive. Task 19 proves dormant explanation,
catalog, provenance, score/gate, diagnostic, and history semantics without
applying policy, admitting evidence, refreshing a baseline, or authorizing a
push, tag, publish, deployment, or release. Task 20 may generate and qualify an
exact local candidate, but it must stop at the explicit owner comprehension
gate before commit or activation. The dependency audit must be cleared
separately before any public release execution.
