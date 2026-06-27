# slopbrick v0.14.5d — Repository Memory ships

> **AI agents forget your architecture. Every session starts fresh.**
> Today we're shipping the fix: `.slopbrick/memory.md`, the artifact
> your codebase writes for the next agent.

This is the post for the v0.14.5d release of
[slopbrick](https://github.com/usebrick/platform). v0.14.5d is the
release that makes slopbrick not just a linter but a **memory layer**
for AI-coded projects.

## The problem

Your AI agent doesn't remember your architecture. It writes code that
duplicates `zustand` with `redux`, opens a fourth modal system next to
the three you already have, drops a hardcoded `sk-...` key into a
client bundle, ships a test that asserts `expect(x).toBeDefined()`,
and never checks what the project already uses before inventing
something new.

The drift isn't the agent's fault. **The agent doesn't know your
conventions** because the conventions aren't in any context the agent
can read.

CLAUDE.md is a partial fix: a static file the agent reads once per
session. But it has to be hand-maintained, doesn't reflect what's
actually in the codebase, and goes stale the first time someone
refactors.

## What we shipped

`slopbrick scan` now writes four atomic artifacts to `.slopbrick/`:

```text
.slopbrick/
├── inventory.json     # detected patterns + component fingerprints
├── constitution.json  # declared stack (mirrors slopbrick.config.mjs)
├── health.json        # slopIndex + per-severity issue counts
└── memory.md          # agent-readable markdown summary
```

The next time Claude Code, Cursor, or Copilot calls
`slop_suggest_with_memory`, it reads `memory.md` from disk instead of
re-parsing the AST. **100–1000× faster** on the agent integration, and
the agent's first suggestion matches what the project already uses,
not what the LLM trained on.

```bash
$ npx slopbrick scan              # ~10s on a 200-file project
Repository Coherence:  86 / 100
  ├─ Architecture:   92.0
  ├─ Pattern (inv): 88.0
  ├─ Constitution: 100.0
  └─ AI Debt:        78.0

$ cat .slopbrick/memory.md        # what the next agent reads
# slopbrick memory
Generated: 2026-06-27T18:00:00Z

## Detected patterns (canonical, use these)
### State management
- **zustand** (12 files, 1 import)
### Data fetching
- **@tanstack/react-query** (8 files, 1 import)

## DO NOT CREATE
- redux (forbidden)
- @mui/ (any package under this scope)
```

## Constitution vs dominant-pattern detection

slopbrick makes a sharp distinction that other tools blur:

| Concept | What it is | Where it lives |
|---|---|---|
| **Constitution** (declared) | What *should* be. The team wrote it in `slopbrick.config.mjs`. | `constitution.json` |
| **Detected patterns** (observed) | What *is*. The scan extracted it from the actual imports. | `inventory.json` |
| **Health** (gap) | How much the codebase deviates from the Constitution. | `health.json` |

The interesting case is when the **Constitution says one thing but
the codebase does another**. That's the drift — the real signal
slopbrick catches. If you declared `zustand` but 40% of new files
import `redux`, the Constitution drift score is non-zero and
`slopbrick ci` exits 1.

This is *not* "the LLM's fault" detection. It's *not* "this file was
written by an AI" detection. It's **"your codebase is drifting from
the rules you set"** detection, which is the thing that actually
matters for engineering managers.

## Why this isn't CLAUDE.md

CLAUDE.md, .cursorrules, and .github/copilot-instructions.md all try
to solve the same problem: tell the agent about your project. They
fail for three reasons:

1. **Stale on contact.** The first time someone refactors, the
   rules file goes out of date. There's no enforcement loop.
2. **Hand-maintained.** The team has to write and rewrite the rules
   file. Nobody does.
3. **Agent doesn't enforce it.** The agent reads CLAUDE.md once at
   session start, then forgets.

slopbrick is different because:

1. **Generated, not hand-written.** `slopbrick scan` extracts the
   patterns from the actual codebase. Refactors update the inventory
   on the next scan.
2. **Enforced by the same tool that detects.** `slopbrick drift`
   exits 1 on any Constitution violation. `slopbrick ci` is a CI
   gate. `slopbrick lock` is a pre-commit hook. The agent's output is
   checked by the same tool that wrote the rules.
3. **Updates on every scan.** When the team adds a new package to
   the Constitution, the next scan enforces it. When the codebase
   drifts, the next scan catches it.

## The calibration story

Every detection rule ships with a measured **Precision / Recall /
False Positive Rate** on a labeled corpus:

- **184,115 human-written files** (neg) — 39 production repos
  (mui, supabase, antd, storybook, refine, heroui, …) + 144k from
  the v6 neg corpus
- **237,066 AI-generated files** (pos) — 50 existing repos + 100
  NEW shallow-cloned vibe-coded repos (Claude Code, Cursor, Lovable,
  Bolt, gpt-pilot, v0, BloopAI, tldraw) + 8 AI agent frameworks
  (PraisonAI, agno, autogen, crewAI)

That's the v7 corpus. The v0.14.5d calibration run is in progress
(right now, on the order of 12–20 hours for a full re-scan of
~420k files). The numbers will land in `src/rules/signal-strength.json`
when it finishes.

The headline from v6 calibration: **13 USEFUL, 6 OK, 9 NOISY, 0
INVERTED, 12 DORMANT, 24 HYGIENE**. We expect v7 to be cleaner because
the labeled positive set is now 100× larger and includes a much
wider variety of AI tools (not just Claude 3.5).

## What's next

This is the release that closes the **UNDERSTAND** loop. The next
release will close the **PREVENT** loop:

```bash
slopbrick watch      # file-watch, flags violations as you write
slopbrick lock       # installs pre-commit hook (already in v0.14.5d)
slopbrick ci         # CI gate (already in v0.14.5d)
```

After that, we're publishing the schemas (`@usebrick/core`) so other
tools — PickBrick for declaring rules at project-init, MendBrick for
repairing drift in legacy codebases, third-party agent integrations
— can read the same `.slopbrick/memory.md` instead of re-implementing
the pattern detection.

## Try it

```bash
npm install -D slopbrick
npx slopbrick scan
cat .slopbrick/memory.md
```

Or just add the MCP server and let your agent call
`slop_suggest_with_memory` on the next session:

```bash
npx slopbrick mcp
```

The first call is the moment the agent realizes what your codebase
already uses. That's the whole point.
