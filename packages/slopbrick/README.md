# slopbrick

> **AI agents forget your architecture. Every session starts fresh.**
>
> SlopBrick gives your codebase persistent structure — so agents follow your
> patterns instead of reinventing them.

The fix is one command: `npx slopbrick scan` writes
`.slopbrick/{inventory.json, constitution.json, health.json, structure.md}`.
The next time your AI agent writes a file — Claude Code, Cursor,
Copilot, Aider — it reads `.slopbrick/structure.md` instead of re-parsing
the AST. **100–1000× faster** on the agent integration, and the
agent's first suggestion matches what the project already uses, not
what the LLM trained on.

```bash
npm install -D slopbrick
npx slopbrick init        # write .slopbrick/constitution.json
npx slopbrick scan        # write .slopbrick/structure.md
npx slopbrick mcp         # start the MCP server (Claude / Cursor)
```

For the prevention layer:

```bash
slopbrick watch           # re-run scan on every file change
slopbrick lock            # install the Git pre-commit hook
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
  write, `slopbrick lock` blocks AI-introduced slop at pre-commit,
  `slopbrick ci` enforces the same in CI.
- **Constitution** — declare your canonical stack (state lib, form
  lib, modal system, API client) once. The agent and the linter
  enforce it together.

**Status:** v0.38.0 (current). See the [CHANGELOG](./CHANGELOG.md) for
the full release notes.

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

> **v0.15.0 introduced the 4-score model; v0.21.0 FLIPPED `aiSlopScore`
> to the natural-reading "raw amount" direction (0=clean, 100=saturated).**
> The other three scores stay "higher = better". The legacy `slopIndex`
> field is kept as optional on `ProjectReport` for backward compat with
> existing test fixtures and historical telemetry; the v0.14-compat
> removal is tracked separately.

| Score | What it measures | Direction | CI gate? |
|-------|------------------|-----------|----------|
| **`aiSlopScore`** | AI-slop signatures (16 `ai/*` rules). | **lower = cleaner** (raw amount) | **Yes** (`≤ meanSlop: 30` passes) |
| **`engineeringHygiene`** | Average of 6 category scores: arch, logic, layout, visual, component, test | higher = better | No (informational) |
| **`security`** | AI Security Risk band: low=100, medium=67, high=33, critical=0 | higher = better | No (informational) |
| **`repositoryHealth`** (composite) | Weighted: `0.4 × (100 − aiSlopScore) + 0.3 × eng + 0.2 × sec + 0.1 × test` | higher = better (inverts `aiSlopScore` internally) | No (informational) |

**Score-band messages** (v0.21.0+): every score ships with a one-line
verdict in the pretty output — e.g. `AI Slop Score: 25 → "low amount
of slop"`, `Security Risk: 33 → "high risk"`. See `src/report/pretty.ts`.

The same numbers are in `.slopbrick/health.json`.

For the full math, the 2×2 quadrant, and which one to focus on, see
[`docs/scoring-explained.md`](./docs/scoring-explained.md).

For per-rule precision/recall/FPR (auditable), see
[`src/rules/signal-strength.json`](./src/rules/signal-strength.json).

---

## Telemetry (opt-in)

Starting in **v0.24.0**, slopbrick can send a single one-shot usage
ping after `slopbrick scan` completes. This is **opt-in** — the
default is OFF — and is intended for the v9 corpus build script
and self-hosted CI.

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
| `slopbrick_version` | string | `"0.24.0"` | `package.json` |
| `scan_id` | string (UUID v4) | `"f47ac10b-…"` | generated per run |
| `file_count` | int | `42` | `results.length` |
| `rule_count` | int | `95` | `builtinRules.length` |
| `duration_ms` | int | `1834` | wall-clock scan time |
| `platform` | string | `"darwin"` | `process.platform` |
| `node_version` | string | `"v20.11.0"` | `process.version` |

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

See [`docs/research/beacon-design.md`](./docs/research/beacon-design.md)
for the full design doc, threat model, and OPSEC requirements
for the receiver.

---

## Example output

```text
$ npx slopbrick scan
Repo is concerning (25/100). The biggest problem is AI patterns — worst file is src/cli/scan.ts. Run `slopbrick scan --why-failing` for the top 5 rules, or `slopbrick scan --suggest` for fixes.

AI Slop Score:  25 / 100 [HIGH]  ↑5 (worse)
higher = better · measures AI-slop signatures. The same number in .slopbrick/health.json.
  ├─ boundary:  10  (40%)  — structural integrity
  ├─ context:   50  (35%)  — props / state / imports
  └─ visual:     5  (25%)  — CSS / a11y / layout

Engineering Hygiene:  60 / 100 [NEEDS WORK] — higher = better · measures internal consistency. This is a secondary view; the AI Slop Score above is the gate.

Other signals (not the gate):
  Code Hygiene          75/100
  Accessibility        100/100
  Performance          100/100
  Business Logic         0/100
  Security Risk        LOW

✓ 99 INVERTED/NOISY issues correctly suppressed from 24 default-off rules.

Category breakdown (what kind of issue, and how much):
  AI patterns      ████████████████████    167 — signatures of LLM-generated code
  visual style     ████████░░░░░░░░░░░░     70 — colors, spacing, font sizes, layout
  logic patterns   ████████░░░░░░░░░░░░     68 — state, hooks, prop usage
  13 other categories are clean

Next step:
  → `slopbrick scan --rule src/cli/scan.ts` to drill into the worst file (4 issues)
  → `slopbrick scan --suggest` for auto-fix advice
  → `slopbrick scan --baseline` to accept today's scores as the new floor
  → `slopbrick scan --why-failing` for the top 5 issues dragging the score down
```

`--brief` (CI/scripts): same headline + threshold + delta in 4 lines.
`--why-failing`: top 5 rules ranked by weighted impact.
`--suggest`: per-rule auto-fix advice.

---

## Documentation

| If you want to... | Read this |
|-------------------|-----------|
| Add a new rule (most common contribution) | [`CONTRIBUTING.md`](./CONTRIBUTING.md) |
| Configure for strict CI, monorepo, Python, etc. | [`EXAMPLES.md`](./EXAMPLES.md) |
| Understand the 4-score model (AI Slop Score, Engineering Hygiene, Security, Repository Health) | [`docs/scoring-explained.md`](./docs/scoring-explained.md) |
| Connect Claude Code / Cursor / Copilot | [`docs/MCP.md`](./docs/MCP.md) |
| See the 4 `.slopbrick/` artifacts (structure, inventory, ...) | [`docs/repository-structure.md`](./docs/repository-structure.md) |
| See the 103 rules (per-rule descriptions + citations) | [`docs/rule-catalog.md`](./docs/rule-catalog.md) |
| See how the engine works (parser → facts → rules) | [`docs/architecture.md`](./docs/architecture.md) |
| See which frameworks are supported | [`docs/framework-parity-matrix.md`](./docs/framework-parity-matrix.md) |
| See what's changed in each release | [`CHANGELOG.md`](./CHANGELOG.md) |
| See the strategic plan (0.14 → 0.15 → 1.0) | [`ROADMAP.md`](./ROADMAP.md) |
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

Requires Node 18+. The package ships ESM + CJS dual builds, TypeScript
types, and is published to npm as `slopbrick`.

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
