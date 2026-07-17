# slopbrick

> **AI agents forget your architecture. Every session starts fresh.**
>
> SlopBrick gives your codebase persistent structure — so agents follow your
> patterns instead of reinventing them.

The fix is one command: `npx slopbrick scan` writes
`.slopbrick/{inventory.json, constitution.json, health.json, structure.md}`.
The next time your AI agent writes a file — Claude Code, Cursor,
Copilot, Aider — it reads `.slopbrick/structure.md` instead of re-parsing
the AST. The cached artifact avoids repeated parsing; actual speed-up depends
on repository size and cache state. The agent's first suggestion matches what
the project already uses, not what the LLM trained on.

```bash
npm install -D slopbrick
npx slopbrick init        # write .slopbrick/constitution.json
npx slopbrick scan        # write .slopbrick/structure.md
npx slopbrick mcp         # start the MCP server (Claude / Cursor)
```

For the prevention layer:

```bash
slopbrick watch           # re-run scan on every file change
slopbrick install         # install the Git pre-commit hook
slopbrick ci              # CI gate: exit 1 on constitution violation
```

**This isn't CLAUDE.md.** CLAUDE.md is a static file the agent reads once
per session. `.slopbrick/structure.md` is a generated artifact that updates
on every scan — your repository, encoded for the next agent.

---

## What you get

- **Repository Structure** — the four `.slopbrick/` artifacts (structure,
  inventory, constitution, health) make your codebase queryable by
  any AI agent in O(read file) instead of O(parse AST).
- **LockBrick prevention** — `slopbrick watch` flags violations as you
  write, `slopbrick install` blocks AI-introduced slop at pre-commit,
  `slopbrick ci` enforces the same in CI.
- **Constitution** — declare your canonical stack (state lib, form
  lib, modal system, API client) once. The agent and the linter
  enforce it together.

**Status:** v0.43.0 is the latest published release; v0.45.0 is an unreleased
admission-bound calibration candidate. The published train has 103 rules in 22
categories and 4 headline scores. Its 576,750-file v10.1 result is historical
evidence, not current v10.3 admission or release evidence; the candidate's
provenance gates remain open. See [CHANGELOG](./CHANGELOG.md) for the full
release notes.

---

## Quick start

```bash
# 1. Install
npm install -D slopbrick

# 2. Initialize (8 quick questions about your stack)
npx slopbrick init

# 3. Scan (writes .slopbrick/ artifacts)
npx slopbrick scan

# 4. Optional: start the MCP server so Claude Code / Cursor can
# consume the artifacts
npx slopbrick mcp
```

That's it. The agent integration is O(read file) for the next session.

For a CI gate, see [`EXAMPLES.md`](./EXAMPLES.md#strict-ci-gate).
For monorepo setup, see [`EXAMPLES.md`](./EXAMPLES.md#monorepo-multi-package).
For every other config question, see [`EXAMPLES.md`](./EXAMPLES.md).

---

## The headlines (4-score model, v0.21.0+)

> **v0.15.0 introduced the 4-score model. v0.21.0 FLIPPED `aiSlopScore`
> to the natural-reading "raw amount of slop" direction
> (0 = clean, 100 = saturated, **lower = cleaner**).** v0.18.0 added
> the 4th score (security). The other three scores stay "higher = better".
> The legacy `slopIndex` field is kept as optional on `ProjectReport`
> for backward compat with existing test fixtures; the v0.14-compat
> removal is tracked separately.

| Score | What it measures | Direction | CI gate? |
|-------|------------------|-----------|----------|
| **`aiSlopScore`** | AI-slop signatures (16 `ai/*` rules). | **lower = cleaner** (raw amount of slop) | **Yes** (`≤ meanSlop` passes; default 30) |
| **`engineeringHygiene`** | Average of 6 category scores: arch, logic, layout, visual, component, test | higher = better | No (informational) |
| **`security`** | AI Security Risk band: low=100, medium=75, high=40, critical=10 | higher = better | No (informational) |
| **`repositoryHealth`** | Weighted average of 8 axes (slopIndex, architectureConsistency, aiSecurityRisk, designTokenViolations, testQuality, businessLogicCoherence, docFreshness, dbHealth). Default weights in `REPOSITORY_HEALTH_WEIGHTS`. | higher = better | No (informational) |

**Score-band messages** (v0.21.0+): every score ships with a one-line
verdict in the pretty output — e.g. `AI Slop Score: 25 → "low amount
of AI slop"`, `Security Risk: low`. The band mapping for aiSlopScore
is **0–9 no slop**, **10–29 low**, **30–49 medium**, **50–69 high**,
**70–100 saturated** (v0.21.0 lower-is-better direction). See
`src/report/pretty.ts`.

The same numbers live in `.slopbrick/health.json`.

`assemblyHealth` (the inverse of `aiSlopScore`) and `totalScore` remain on the
internal `ProjectReport` for compatibility with historical telemetry and
fixtures. They are not canonical scores, never participate in gating, and
human reports do not render an Assembly Health headline. `totalScore` is
omitted from current JSON output; complete-report JSON retains
`assemblyHealth` for wire compatibility.

For the full math, the 4-score quadrant, and which one to focus on, see
[`docs/scoring-explained.md`](./docs/scoring-explained.md).

For per-rule precision/recall/FPR (auditable), see
[`src/rules/signal-strength.json`](./src/rules/signal-strength.json).

---

## Telemetry (opt-in)

Starting in **v0.24.0**, slopbrick can send a single one-shot usage
ping after `slopbrick scan` completes. This is **opt-in** — the
default is OFF — and is intended for self-hosted CI telemetry.

### How to opt in

```bash
# 1. Set the endpoint env var
export SLOPBRICK_TELEMETRY_ENDPOINT="https://your-host.example/ingest"

# 2. Pass the flag on the CLI
slopbrick scan --report-usage
```

Both conditions are required. If either is missing, no request
is sent, no warning is printed, and exit code is unaffected.

### What is sent

A single POST with `Content-Type: application/json` and exactly
**8 fields**:

| Field | Type | Example | Source |
|-------|------|---------|--------|
| `schema_version` | string | `"1"` | constant |
| `slopbrick_version` | string | `"0.42.0"` | `package.json` |
| `scan_id` | string (UUID v4) | `"f47ac10b-…"` | generated per run |
| `file_count` | int | `42` | `results.length` |
| `rule_count` | int | `103` | `builtinRules.length` |
| `duration_ms` | int | `1834` | wall-clock scan time |
| `platform` | string | `"darwin"` | `process.platform` |
| `node_version` | string | `"v24.15.0"` | `process.version` |

### Privacy promise

The payload is **frozen** at exactly 8 fields. We will never send:

- file paths, file hashes, or file contents
- rule ids, rule violations, or rule categories
- user identifiers, IP addresses, or environment variables
- timestamps other than what `process.version` provides indirectly

### Failure mode

The beacon is **fire-and-forget** with a 5-second socket timeout.
Network errors, DNS failures, 4xx/5xx responses, and timeouts are
all silent — `slopbrick scan` exit code is never affected. The
request is also unidirectional: no retries, no follow-up calls.

### Scope

Only `slopbrick scan` fires the beacon. `slopbrick watch`,
`slopbrick ci`, and programmatic `scanProject` calls are
unaffected regardless of the flag or env var.

### Local flywheel

This is separate from the local flywheel. The local flywheel
writes detailed scan results to `.slopbrick/flywheel/scans.jsonl`
and is gated by `--no-telemetry` (default ON, opt-out per-run
or via `config.telemetry = false`). The new beacon is gated by
`--report-usage` + `SLOPBRICK_TELEMETRY_ENDPOINT` (default OFF).

`--no-telemetry` disables only the local flywheel; it does not make a
scan read-only. Repository project-memory artifacts such as
`.slopbrick/inventory.json`, `health.json`, and `structure.md` are still
written. Set `projectMemory: false` in `slopbrick.config.mjs` to disable
those project-memory writes.

See [`docs/research/beacon-design.md`](./docs/research/beacon-design.md)
for the full design doc, threat model, and OPSEC requirements
for the receiver.

---

## Example output

```text
$ npx slopbrick scan --brief
[v0.43.0] auto-suppressed 184 INVERTED/NOISY issue(s) from 18 default-off rule(s).
Memory persisted to .slopbrick/ (0 patterns, 0 components, 537 bytes of structure.md).

Repo is low (25/100). The biggest problem is AI patterns — worst file is packages/slopbrick/src/engine/parser-rust.ts.

  AI Slop Score         25   low  (aiSlopScore)
  Engineering Hygiene  100   excellent  (engineeringHygiene)
  Security             100   excellent  (security)
  Repository Health     57   needs work  (repositoryHealth)

  CI gate: AI Slop Score <= 15 -> fail

  Scanned 593 files, 346 issues. Run with --all for the full report.
1 threshold failed: meanSlop (score 25 > 15)
```

`--brief` (CI/scripts): same headline + threshold + delta in 4 lines.
`--why-failing`: top 5 rules ranked by weighted impact.
`--suggest`: per-rule auto-fix advice.
`--human-only` / `--ai-only`: filter issues by category.

---

## Documentation

| If you want to... | Read this |
|-------------------|-----------|
| Add a new rule (most common contribution) | [`CONTRIBUTING.md`](./CONTRIBUTING.md) |
| Configure for strict CI, monorepo, Python, etc. | [`EXAMPLES.md`](./EXAMPLES.md) |
| Understand the 4-score model (AI Slop Score, Engineering Hygiene, Security, Repository Health) | [`docs/scoring-explained.md`](./docs/scoring-explained.md) |
| Connect Claude Code / Cursor / Copilot | [`docs/MCP.md`](./docs/MCP.md) |
| See the 4 `.slopbrick/` artifacts (structure, inventory, ...) | [`docs/repository-structure.md`](./docs/repository-structure.md) |
| See the current 119-rule workspace catalog (published v0.43.0: 103) | [`docs/rule-catalog.md`](./docs/rule-catalog.md) |
| See language discovery, parsing, rules, and calibration scope | [`docs/language-support-matrix.md`](./docs/language-support-matrix.md) |
| See how the engine works (parser → facts → rules) | [`docs/architecture.md`](./docs/architecture.md) |
| See which frameworks are supported | [`docs/framework-parity-matrix.md`](./docs/framework-parity-matrix.md) |
| See what's changed in each release | [`CHANGELOG.md`](./CHANGELOG.md) |
| See the strategic plan (v0.x → v1.0) | [`ROADMAP.md`](./ROADMAP.md) |
| See research behind the calibration | [`docs/research/`](./docs/research/) |
| Report a security vulnerability | [`SECURITY.md`](./SECURITY.md) |
| Run a CI gate | `slopbrick ci` (see [`EXAMPLES.md`](./EXAMPLES.md#strict-ci-gate)) |

The 19 subcommands are auto-generated from commander and run
`slopbrick --help` to see them.

---

## Installation

```bash
npm install -D slopbrick
```

Requires Node.js 22 or 24 (verified by `slopbrick doctor`). The package ships
ESM + CJS dual builds, TypeScript types, and is published to npm as
`slopbrick`. CI verifies the packed tarball on both supported release lines.

For the MCP server, add to your AI agent's config:

```json
{
  "mcpServers": {
    "slopbrick": { "command": "npx", "args": ["slopbrick", "mcp"] }
  }
}
```

See [`docs/MCP.md`](./docs/MCP.md) for Cursor, Continue, and other
clients.

---

## Contributing

See [`CONTRIBUTING.md`](./CONTRIBUTING.md) — tl;dr: copy
`src/rules/visual/naturalness-anomaly.ts`, edit the `analyze()` body,
add a test in `tests/rules/`, then add a `defaultOff: true` entry to
`src/rules/signal-strength.json`. v0.14.5k's calibration will
validate the rule on the next corpus run.

We follow the [Contributor Covenant](./CODE_OF_CONDUCT.md).

---

## License

[MIT](./LICENSE) © 2026 Brick.dev
