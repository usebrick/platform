# slopbrick

> **AI agents forget your architecture. Every session starts fresh.**
>
> SlopBrick gives your codebase persistent memory — so agents follow your
> patterns instead of reinventing them.

The fix is one command: `npx slopbrick scan` writes
`.slopbrick/{inventory.json, constitution.json, health.json, memory.md}`.
The next time your AI agent writes a file — Claude Code, Cursor,
Copilot, Aider — it reads `.slopbrick/memory.md` instead of re-parsing
the AST. **100–1000× faster** on the agent integration, and the
agent's first suggestion matches what the project already uses, not
what the LLM trained on.

```bash
npm install -D slopbrick
npx slopbrick init        # write .slopbrick/constitution.json
npx slopbrick scan        # write .slopbrick/memory.md
npx slopbrick mcp         # start the MCP server (Claude / Cursor)
```

For the prevention layer:

```bash
slopbrick watch           # re-run scan on every file change
slopbrick lock            # install the Git pre-commit hook
slopbrick ci              # CI gate: exit 1 on constitution violation
```

**This isn't CLAUDE.md.** CLAUDE.md is a static file the agent reads once
per session. `.slopbrick/memory.md` is a generated artifact that updates
on every scan — your repository, encoded for the next agent.

---

## What you get

- **Repository Memory** — the four `.slopbrick/` artifacts (memory,
  inventory, constitution, health) make your codebase queryable by
  any AI agent in O(read file) instead of O(parse AST).
- **LockBrick prevention** — `slopbrick watch` flags violations as you
  write, `slopbrick lock` blocks AI-introduced slop at pre-commit,
  `slopbrick ci` enforces the same in CI.
- **Constitution** — declare your canonical stack (state lib, form
  lib, modal system, API client) once. The agent and the linter
  enforce it together.

**Status:** v0.14.5o (current). See the [CHANGELOG](./CHANGELOG.md) for
the full v0.14 series notes.

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

## The headlines

**`Slop Index`** is the primary headline (0-100, **lower = better**). 70
is the CI gate. Composed of boundary (40%) + context (35%) + visual
(25%).

**`Repository Coherence`** is a secondary view (0-100, **higher = better**)
measuring internal consistency. Same number is in `.slopbrick/health.json`.

For the full math, the 2×2 quadrant, and which one to focus on, see
[`docs/scoring-explained.md`](./docs/scoring-explained.md).

For per-rule precision/recall/FPR (auditable), see
[`src/rules/signal-strength.json`](./src/rules/signal-strength.json).

---

## Example output

```text
$ npx slopbrick scan
Repo is concerning (25/100). The biggest problem is AI patterns — worst file is src/cli/scan.ts. Run `slopbrick scan --why-failing` for the top 5 rules, or `slopbrick scan --suggest` for fixes.

Slop Index:  25 / 100 [CONCERNING]  ↓5 (cleaner)
lower = better · measures AI-slop signatures. The same number in .slopbrick/health.json.
  ├─ boundary:  10  (40%)  — structural integrity
  ├─ context:   50  (35%)  — props / state / imports
  └─ visual:     5  (25%)  — CSS / a11y / layout

Repository Coherence:  60 / 100 [NEEDS WORK] — higher = better · measures internal consistency. This is a secondary view; the Slop Index above is the gate.

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
| Understand the Slop Index vs Coherence | [`docs/scoring-explained.md`](./docs/scoring-explained.md) |
| Connect Claude Code / Cursor / Copilot | [`docs/MCP.md`](./docs/MCP.md) |
| See the 4 `.slopbrick/` artifacts (memory, inventory, ...) | [`docs/repository-memory.md`](./docs/repository-memory.md) |
| See the 80 rules (per-rule descriptions + citations) | [`docs/rule-catalog.md`](./docs/rule-catalog.md) |
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
