# Security review: CAL-002 Task 20 local policy application

- **Reviewed:** 2026-07-22
- **Reviewed checkpoint:** `bd47dbd7e`
- **Scope:** statically bundled 119-row current policy, application receipt,
  runtime provider binding, generated catalog, score/gate effects, and focused
  activation tests
- **Verdict:** PASS for local application; PUBLIC RELEASE BLOCKED separately by
  the dependency audit

## Scope and trust boundaries

Task 20 replaces the deliberately inactive provider with one statically bundled
JSON policy. Module initialization validates the complete object against the
canonical 119 rule IDs, exact approved authority rows, runtime effects, row
binding, matrix/approval binding, `applied: true`, and `admitted: false` before
returning any accessor. Invalid, partial, reordered, stale, or drifted policy
data fails closed during initialization.

The bundled policy is package-controlled build input, not an HTTP, CLI, file,
environment, repository, or network input. Task 20 adds no dynamic policy path,
network client, process execution, database query, authentication boundary,
credential handling, template evaluation, or runtime deserialization of
attacker-controlled bytes.

Repository configuration remains a separate existing input. Explicit
repository `off` remains stronger than policy. Default-off rows require an own
explicit opt-in; the 32 unmeasured quality candidates and 32 research-origin
rows cannot score or gate. The 4 blocked, 3 superseded, and 7 retired rows
cannot run even when configuration requests them. Unknown IDs retain the
existing legacy fallback.

The application receipt contains integrity metadata only. Durable policy and
receipt artifacts contain no raw source, repository path, personal identity,
credential, or admitted corpus unit. SHA-256 is used only for deterministic
integrity binding; human-facing documentation exposes one Task 20 checkpoint
and keeps leaf identities machine-only.

## Vulnerability assessment

| Category | Result | Rationale |
| --- | --- | --- |
| SQL injection | Clear | No query construction or database sink is introduced. Default-on SQL rules are static detectors, not query execution. |
| XSS / template injection | Clear | No browser or server-template interpolation is introduced. |
| SSRF | Clear | No network request or user-controlled URL exists. |
| Command injection | Clear | No shell, process, `eval`, or dynamic-code sink exists. |
| Authentication / authorization bypass | Clear | No application-auth boundary changes. Static policy authority is schema- and owner-binding constrained; repository `off` still wins. |
| Unsafe deserialization | Clear | The package-controlled JSON module is parsed by Node and fully schema/authority validated before access. No untrusted token is deserialized. |
| Path traversal | Clear | No path-derived read or write target is added. |
| IDOR | Clear | No user/resource lookup or API authorization boundary exists. |
| Weak cryptography / secrets exposure | Clear | SHA-256 is integrity-only; no key, token, password, raw source, or personal identity is stored. |
| NoSQL injection | Clear | No NoSQL query or sink exists. |

## Findings

No Task 20 finding reaches the required confidence threshold of 8/10. The
activation changes authority over which existing static rules may run, score,
or gate, but introduce no attacker-controlled source-to-sink path.

The dependency audit independently reports high transitive advisories in
`brace-expansion` and `svgo`, plus one moderate Astro advisory. Dependency
findings are excluded from this diff review and remain public-release blockers
under `REL-001`; Task 20 changes no package or lockfile.

## Verification

- Exact four-file application checkpoint: pass.
- Active candidate matrix: 183/183; inactive support matrix: 361/361.
- Full SlopBrick suite: 4,580 passed with 15 intentional skips.
- Recursive tests: Core 285, Engine 60, Website 54, SlopBrick 4,580; recursive
  lint, typecheck, and build pass.
- Focused application/security matrix: 46/46.
- Package-local self-scan: 296/296 selected and analyzed, zero failures,
  99.94/100, four current medium deterministic findings, policy gate pass, and
  no durable baseline created.
- Fresh independent final review: 100/100 with no findings.
- Protected owner state and frozen historical metrics: unchanged.

## Residual boundary

The current policy is locally `applied: true` and remains `admitted: false`.
This review authorizes no push, tag, corpus admission, npm publication, website
deployment, or public release. The dependency blockers must be resolved and
`REL-001` must receive separate owner authority before public execution.
