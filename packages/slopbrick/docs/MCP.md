# slopbrick MCP server

> **For AI agents.** The MCP server is how Claude Code, Cursor,
> Copilot, and Continue consume slopbrick. Skip this doc if you're
> only running `slopbrick scan` from the CLI.

The slopbrick Model Context Protocol (MCP) server speaks JSON-RPC
2.0 over stdio. Start it with `slopbrick mcp` and connect your AI
agent to it. The server exposes **10 tools** that let the agent
query the codebase for AI-slop patterns, get remediation advice,
and check the Constitution before writing new code.

## Quick start

### Claude Code

```bash
# Add slopbrick to your MCP servers
claude mcp add slopbrick -- npx slopbrick mcp

# Or in .mcp.json
{
  "mcpServers": {
    "slopbrick": {
      "command": "npx",
      "args": ["slopbrick", "mcp"]
    }
  }
}
```

### Cursor

In Cursor → Settings → Features → Model Context Protocol:

```json
{
  "mcpServers": {
    "slopbrick": {
      "command": "npx",
      "args": ["slopbrick", "mcp"]
    }
  }
}
```

### Continue

In `~/.continue/config.json`:

```json
{
  "experimental": {
    "modelContextProtocolServers": [
      { "command": "npx", "args": ["slopbrick", "mcp"] }
    ]
  }
}
```

### Other MCP clients

slopbrick implements [MCP 2024-11-05](https://modelcontextprotocol.io/specification/2024-11-05).
Any MCP-aware client works. The server speaks newline-delimited
JSON-RPC 2.0 over stdio.

## The 10 tools

### Tier 1 — Core (call these first)

#### `slop_scan_file`

Scan a single file, return issues + per-category scores.

**Input:**
- `filePath` (string, required) — path to the file
- `content` (string, optional) — file content; if omitted, read from disk
- `category` (string, optional) — filter to one category

**Output:**
```json
{
  "filePath": "src/Card.tsx",
  "componentCount": 1,
  "issues": [
    {
      "ruleId": "ai/compression-profile",
      "category": "ai",
      "severity": "high",
      "line": 12,
      "column": 5,
      "message": "repetitive token pattern"
    }
  ],
  "categoryScores": {
    "ai": 5,
    "visual": 0,
    "logic": 0
  }
}
```

**When to use:** before the agent writes a file in a project with
slopbrick configured, to check what patterns are in use.

#### `slop_explain_rule`

Return rule metadata + rationale + advice.

**Input:**
- `ruleId` (string, required) — e.g. `"ai/compression-profile"`

**Output:**
```json
{
  "ruleId": "ai/compression-profile",
  "category": "ai",
  "aiSpecific": true,
  "defaultSeverity": "high",
  "defaultOff": false,
  "calibration": {
    "precision": 0.85,
    "recall": 0.72,
    "fpr": 0.03
  },
  "rationale": "LLM-generated code reuses the same handful of identifier names...",
  "references": ["Hindle et al., ICSE 2012, 'On the Naturalness of Software'"],
  "advice": "Rewrite the file with more identifier diversity. Or add a comment explaining the repetition."
}
```

**When to use:** when the agent fires a rule and wants to know
*why* and what to do about it.

#### `slop_list_rules`

List all registered rules, with optional category filter.

**Input:**
- `category` (string, optional) — e.g. `"ai"`, `"visual"`
- `defaultOnOnly` (boolean, optional) — exclude `defaultOff` rules

**Output:**
```json
{
  "total": 80,
  "byCategory": {
    "ai": 8,
    "visual": 6,
    "logic": 5,
    "boundary": 12
  },
  "rules": [
    { "id": "ai/compression-profile", "defaultOff": false },
    { "id": "ai/segment-surprisal-cv", "defaultOff": false }
  ]
}
```

**When to use:** to discover what rules exist before scanning.

### Tier 2 — High-value (call when writing new code)

#### `slop_suggest`

Get the project's `doNotCreate` list + patterns to follow.

**Input:** none (reads `.slopbrick/constitution.json` + `.slopbrick/structure.md`)

**Output:**
```json
{
  "doNotCreate": [
    {
      "category": "modal",
      "reason": "constitution declares react-modal as canonical",
      "blockList": ["reakit", "react-aria-modal", "reach-ui-modal"]
    },
    {
      "category": "state",
      "blockList": ["redux", "mobx", "zustand"],
      "canonical": "jotai"
    }
  ],
  "patterns": {
    "modal": "react-modal (declarative, accessible)",
    "state": "jotai (atom-based, smallest API)"
  },
  "summary": "1 modal system, 1 state library, 1 fetch library declared. 3 unique patterns detected in code."
}
```

**When to use:** **the most important tool**. Agents should call
this before writing any new file. It tells the agent what
NOT to create (the block list) and what TO use (the canonical
patterns).

#### `slop_suggest_with_structure`

Fast-path version of `slop_suggest` that reads from
`.slopbrick/structure.md` (the pre-computed artifact, was `memory.md` in v0.14.5)
instead of re-parsing the AST. **100-1000× faster** than `slop_suggest` on
large codebases. **Use this one in production.**

> **v0.15.0 breaking change:** Renamed from `slop_suggest_with_memory` to
> `slop_suggest_with_structure`. The on-disk artifact `.slopbrick/memory.md`
> is now `.slopbrick/structure.md`. Any MCP client calling the old name
> breaks.

**Input:** none

**Output:** same as `slop_suggest`.

**When to use:** same as `slop_suggest`. Always prefer this version
if `.slopbrick/structure.md` exists. Run `slopbrick scan` once to
generate it, then `slop_suggest_with_structure` works on every agent
call.

#### `slop_check_constitution`

Check a file or proposed change against the project Constitution.

**Input:**
- `filePath` (string, required)
- `content` (string, optional)

**Output:**
```json
{
  "compliant": true,
  "violations": [],
  "summary": "All imports map to the declared canonical stack."
}
```

**When to use:** when the agent is about to add a new import or
use a new library. Catches "introducing a second state lib" before
it lands.

### Tier 3 — Cross-file (call for architecture questions)

#### `slop_architecture_score`

Get the Architecture Consistency score + breakdown.

**Input:** none (reads `.slopbrick/inventory.json`)

**Output:**
```json
{
  "score": 92,
  "axes": {
    "modal": { "unique": 1, "canonical": "react-modal", "offenders": [] },
    "state": { "unique": 1, "canonical": "jotai", "offenders": [] },
    "fetch": { "unique": 2, "canonical": null, "offenders": ["fetch", "axios"] }
  },
  "summary": "1 modal system, 1 state lib, 2 fetch libs (inconsistent)."
}
```

**When to use:** the user asks "is this codebase consistent?" or
"should I refactor before adding a new feature?"

#### `slop_business_logic_score`

Score the project's business-logic coherence — duplicate logic,
missing validation, etc.

**Input:** none

**Output:**
```json
{
  "score": 75,
  "issues": [
    { "ruleId": "logic/duplicate-business-logic", "severity": "high", "count": 3 },
    { "ruleId": "logic/missing-input-validation", "severity": "medium", "count": 5 }
  ]
}
```

**When to use:** before a refactor or to assess codebase health
for a new team member.

#### `slop_governance`

Get the project's governance state — Constitution declared,
structure.md generated, defaultOff rules.

**Input:** none

**Output:**
```json
{
  "constitution": {
    "declared": true,
    "path": ".slopbrick/constitution.json",
    "categories": ["modal", "state", "fetch"]
  },
  "structure": {
    "generated": true,
    "path": ".slopbrick/structure.md",
    "updated": "2026-06-26T22:00:00Z",
    "stale": false
  },
  "calibration": {
    "totalRules": 80,
    "defaultOn": 60,
    "defaultOff": 20,
    "lastCalibration": "v7"
  }
}
```

**When to use:** to check if the project is set up correctly
before doing any work.

#### `slop_find_similar`

Find similar files (by structure + pattern density) to a given
file. Useful for "where else do I do X?"

**Input:**
- `filePath` (string, required)
- `topK` (integer, optional, default 5)

**Output:**
```json
{
  "results": [
    {
      "filePath": "src/Button.tsx",
      "similarity": 0.92,
      "sharedPatterns": ["react-component", "tailwind-styles", "useState-once"]
    }
  ]
}
```

**When to use:** the agent is about to add a new file and wants
to know "what's the closest pattern to follow?"

## Typical agent flow

```
1. slop_governance          — check the project is set up
2. slop_suggest_with_structure  — get the doNotCreate list (always)
3. slop_scan_file           — scan a draft before writing
4. slop_explain_rule        — for each issue, understand why
5. (fix the file)
6. slop_check_constitution  — final check before saving
```

## Troubleshooting

### "MCP server fails to start"

The server requires `npx` to be in PATH. If running in a container,
ensure Node.js is installed. The server needs read access to
`.slopbrick/constitution.json` and `.slopbrick/structure.md` in the
project root.

### "Tool returns no results"

- `slop_suggest` requires `.slopbrick/constitution.json` to exist.
  Run `slopbrick init` first.
- `slop_suggest_with_structure` requires `.slopbrick/structure.md` to
  exist. Run `slopbrick scan` first.
- `slop_scan_file` requires the file to be parseable by slopbrick.
  Check the file extension is supported (`.ts`, `.tsx`, `.js`,
  `.jsx`, `.vue`, `.svelte`, `.astro`, `.html`).

### "Tool returns too many false positives"

Check the rule's `defaultOff` flag — if a rule is marked
`defaultOff: true` in `signal-strength.json` but is firing
nonetheless, the project's `slopbrick.config.mjs` is overriding
the default. Look at `rules: { ... }` in the config.

## References

- [MCP specification](https://modelcontextprotocol.io/specification/2024-11-05)
- [Anthropic's MCP guide for Claude Code](https://docs.anthropic.com/en/docs/agents-and-tools/mcp)
- [slopbrick source](src/mcp/server.ts)
