# Beacon Design (v0.24.0, Workstream C)

> **Status:** shipped in `slopbrick` v0.24.0. Locked payload.
> Breaking changes to the wire format require a major version bump.

This document describes the opt-in network beacon that ships in
v0.24.0. The beacon is a single one-shot POST at the end of
`slopbrick scan`, gated by `--report-usage` (CLI flag, default
OFF) AND `SLOPBRICK_TELEMETRY_ENDPOINT` (env var). Its purpose
is to give the v9 corpus build script and self-hosted CI a
visibility signal into how slopbrick is used — without
collecting anything that could be considered personal data.

This is NOT the local flywheel. The local flywheel writes
detailed scan results to `.slopbrick/flywheel/scans.jsonl` and
is gated by `--no-telemetry`. The beacon is a separate, opt-in
mechanism with a different threat model.

---

## Payload schema (locked)

The wire payload is exactly **8 fields**. No optional fields, no
extensible envelope, no nested objects. Adding a field is a
breaking change for v9-corpus receivers and requires a major
version bump of slopbrick.

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "$id": "https://usebrick.dev/schemas/beacon/v1.json",
  "title": "slopbrick beacon payload (schema_version 1)",
  "type": "object",
  "additionalProperties": false,
  "required": [
    "schema_version",
    "slopbrick_version",
    "scan_id",
    "file_count",
    "rule_count",
    "duration_ms",
    "platform",
    "node_version"
  ],
  "properties": {
    "schema_version": {
      "type": "string",
      "const": "1",
      "description": "Wire-format version. Bumped on any breaking change."
    },
    "slopbrick_version": {
      "type": "string",
      "description": "slopbrick package version (e.g. '0.24.0')."
    },
    "scan_id": {
      "type": "string",
      "format": "uuid",
      "description": "UUID v4 generated at the top of runScan. Used for receiver-side dedup; not cryptographic."
    },
    "file_count": {
      "type": "integer",
      "minimum": 0,
      "description": "Files that ran through the worker pool (excludes incremental-cache skips)."
    },
    "rule_count": {
      "type": "integer",
      "minimum": 1,
      "description": "Registered rules for this run (builtin count, or 1 when --rule <id> is in effect)."
    },
    "duration_ms": {
      "type": "integer",
      "minimum": 0,
      "description": "Wall-clock scan duration in milliseconds (runScan entry → return)."
    },
    "platform": {
      "type": "string",
      "enum": ["aix", "darwin", "freebsd", "linux", "openbsd", "sunos", "win32", "cygwin", "netbsd", "haiku"],
      "description": "Node.js process.platform value."
    },
    "node_version": {
      "type": "string",
      "description": "Node.js process.version (e.g. 'v20.11.0')."
    }
  }
}
```

---

## Threat model

### What we send (deliberately)

The 8 fields above are the **only** information we transmit.
They answer the question "how is slopbrick used in aggregate"
without identifying the user, the project, or the host:

- `slopbrick_version` — what version of the tool is in use
- `scan_id` — random UUID; correlates with local flywheel rows
  without leaving the host
- `file_count` / `rule_count` / `duration_ms` — usage volume
  signals (how big are scans, how many rules fire)
- `platform` / `node_version` — runtime distribution

### What we will NEVER send (rejection criteria)

These are non-negotiable. Any PR that tries to add one of these
fields to the wire payload is rejected, regardless of opt-in
status:

- **File paths** (absolute, relative, or hashed)
- **File contents** (or hashes of file contents)
- **Rule ids** (or categories, or severity counts)
- **Rule violations** (count or detail)
- **User identifiers** (IP address, user ID, hostname)
- **Environment variables** (other than what `process.version` provides)
- **Timestamps** beyond the implicit "now" of the POST
- **Project names**, repo URLs, or git remotes
- **Error messages** (even from the scan itself)
- **Configuration values** (anything from `slopbrick.config.mjs`)

The opt-in flag does not change the rejection criteria. Even
when the user says "send everything," the wire format stays at
8 fields.

### Adversaries we defend against

1. **Passive network observers.** The 8-field payload contains
   no user-identifying data, so even a complete network capture
   reveals nothing about who scanned what.
2. **Compromised receiver.** Because no paths / no rule ids are
   sent, a compromised receiver cannot reconstruct the user's
   project or pinpoint which code they ran the scan on.
3. **Cross-scan correlation.** `scan_id` is a per-run UUID v4.
   No persistent identifier is sent, so cross-scan correlation
   requires the receiver to correlate by `(slopbrick_version,
   platform, node_version, file_count, rule_count)` — which is
   not unique enough to identify a user.
4. **Side-channel timing.** The request is fire-and-forget; the
   response body is drained and ignored. The client does not
   leak scan duration into the request.

### Adversaries we explicitly do NOT defend against

1. **The user themselves revealing information.** If a user
   shares a `scan_id` they received, that is on them.
2. **Compromise of the user's machine.** At that point the
   attacker has everything anyway.
3. **DNS poisoning of `SLOPBRICK_TELEMETRY_ENDPOINT`.** We
   document that the endpoint MUST be TLS (`https://`). We do
   not pin the certificate (which would break self-hosted
   operators with private CAs).

---

## Opt-in story

The beacon is **double-gated**. Both must be true:

| Condition | Default | How to enable |
|-----------|---------|---------------|
| CLI flag `--report-usage` | OFF | `slopbrick scan --report-usage` |
| Env var `SLOPBRICK_TELEMETRY_ENDPOINT` | unset | `export SLOPBRICK_TELEMETRY_ENDPOINT="https://..."` |

If either is missing or empty:

- No request is sent
- No warning is printed
- Exit code is unaffected
- No error message appears anywhere

The `BeaconEmitter.shouldFire()` method is the single source of
truth for this gate. Both the CLI layer and the tests route
through it.

### Scope restriction

The beacon fires from `slopbrick scan` only. The following
flows do NOT fire, even if both gates are true:

- `slopbrick watch` — re-runs scan on every change; firing on
  every change would be a flood.
- `slopbrick ci` — CI exit code is the contract; any network
  side-effect could mask real failures.
- Programmatic `scanProject()` (library API) — library users
  never opted in to network side-effects.
- `slopbrick init`, `slopbrick doctor`, etc. — these don't
  produce a "scan completed" event.

This is enforced in `program.ts` by checking
`command.name() === 'scan'` before constructing the emitter.

---

## Process for v9 corpus receivers

A v9 corpus receiver is any HTTP endpoint that accepts the
8-field POST and aggregates the data. Recommended receiver
contract:

### Required

- Accept `POST` with `Content-Type: application/json`
- Return 2xx within 5 seconds (the client timeout is 5s)
- Treat the body as opaque JSON; ignore unknown fields for
  forward compatibility
- Dedupe by `(scan_id)` — it is unique per scan
- Reject (4xx) any payload where `schema_version` is not `"1"`,
  to surface clients running old formats

### Recommended

- Aggregate `file_count` / `rule_count` / `duration_ms` by
  `(slopbrick_version, platform)` per day
- Compute p50/p95/p99 of `duration_ms` by `rule_count`
- Discard `node_version` after bucketing (e.g. `v20` vs `v22`)

### Forbidden at the receiver

- Do NOT log full payloads — they may eventually contain
  fields we add in v2+
- Do NOT correlate `scan_id` across hosts — it is intentionally
  not a stable user identifier
- Do NOT publicly expose per-host breakdowns

---

## OPSEC for the endpoint host

The endpoint operator (us, in the v9 corpus case; or the
self-hosted CI owner) is responsible for:

### TLS

- **TLS-only.** Reject plaintext HTTP at the load balancer.
  The endpoint URL MUST start with `https://`.
- Modern TLS (TLS 1.3 preferred, 1.2 minimum).
- HSTS preload eligible.

### No third-party trackers

- Do NOT embed any third-party analytics JS, pixel, or beacon
  on any "view this payload" admin page.
- Do NOT send the payload data to any external service
  (Datadog, Sentry, Mixpanel, etc.) — the aggregate counts
  are sensitive enough to leak usage patterns.

### Retention policy

- Raw payloads: retain for **≤ 30 days** for debugging,
  then aggregate + discard.
- Aggregates by `(slopbrick_version, platform, day)`: retain
  indefinitely (these contain no per-user signal).

### Access control

- The POST endpoint MUST require an auth header (we
  recommend `Authorization: Bearer <token>` set as a
  supplementary env var, `SLOPBRICK_TELEMETRY_TOKEN`, not
  shipped in this design doc — see v0.25 followup).
- Admin access to the receiver dashboard MUST require SSO.

### Logging

- Log only `status_code`, `slopbrick_version`, `platform`,
  `schema_version`. Do NOT log the body.
- Log retention: 30 days.

---

## What ships in v0.24.0 vs followups

### Ships in v0.24.0

- The 8-field payload, locked
- `--report-usage` flag (root commander, fires only on `scan`)
- `SLOPBRICK_TELEMETRY_ENDPOINT` env var (no auth yet)
- `BeaconEmitter` + `sendBeacon` transport with 5s timeout
- Fire-and-forget semantics; silent failure
- Tests: 5 endpoint tests + 4 emitter tests (9 total)
- This design doc

### Tracked for followups

- **`SLOPBRICK_TELEMETRY_TOKEN`** — bearer auth, so the
  receiver can verify the POST actually came from a slopbrick
  client (and not an attacker spamming the endpoint). Deferred
  to v0.25 because it requires receiver-side changes too.
- **`schema_version: "2"`** with bucketed `node_version` (to
  reduce cardinality). Not planned; the current `node_version`
  is coarse enough.
- **Per-receiver aggregation scripts.** Currently a manual SQL
  query on the receiver side.

---

## Open questions

None at ship time. All scope, opt-in, payload, failure-mode,
and OPSEC questions were resolved in Workstream C design review.