# slopbrick MCP server

> **For AI agents.** The MCP server is how Claude Code, Cursor,
> Copilot, and Continue consume slopbrick. Skip this doc if you're
> only running `slopbrick scan` from the CLI.

The slopbrick Model Context Protocol (MCP) server speaks JSON-RPC
2.0 over stdio. Start it with `slopbrick mcp` and connect your AI
agent to it. The server exposes **7 canonical tools** that let the agent
query the codebase for AI-slop patterns, get remediation advice,
and check the Constitution before writing new code.

<!-- slopbrick:mcp-registry:begin -->
## Runtime registry (generated)

This table is generated from `TOOL_DEFINITIONS`; it currently exposes 7 canonical tools: slop_scan_file, slop_explain_rule, slop_list_rules, slop_suggest, slop_suggest_with_structure, slop_check_constitution, slop_find_similar.

| Tool | Inputs | Runtime description |
| --- | --- | --- |
| `slop_scan_file` | path (required), framework | Scan a single supported source file for configured slop rules. Language support is scoped by the language support matrix: discovery and scanning do not imply a complete language AST or calibrated AI-authorship signal. Returns issues (ruleId, category, severity, aiSpecific, line, column, message, advice, bounded per-rule calibration metadata, bounded whyItFired facts, and optional bounded `whyItFired.evidence` with an exact matched source span and typed matched facts when available; historical calibration estimates explicitly have no admitted v10.3 source/cohort, while unknown rules report calibration as unavailable; unsafe paths, sensitive text, oversized values, source-like text, and details that exceed the deterministic safety budget are omitted with status and omission metadata — this is not a parser dump or authorship/provenance claim), a composite AI-likelihood score (probability + confidenceTier), and a componentCount. The composite score is the Bayesian log-likelihood ratio of all rules that fired, NOT a per-file "Slop Index" — for project-level scores use slop_suggest. |
| `slop_explain_rule` | ruleId (required) | Explain one rule with its pattern, remediation/source path, suppression snippet, evidence category, honest calibration point estimates (confidence intervals are explicitly unavailable when not validated), and static configuration policy. The policy is not a claim about direct-file scan runtime behavior. |
| `slop_list_rules` | category | List all registered rules with their category, severity, and aiSpecific flag. Optional category filter (visual \| logic \| wcag \| security \| perf \| typo \| layout \| component \| arch). |
| `slop_suggest` | maxFiles | **Primary entry point for AI agents.** Returns the project's existing patterns (modals, buttons, api clients, state libs, data-fetching libs), the do-not-create list (forbidden imports + canonical patterns not to duplicate), the declared stack, and (when .slopbrick/health.json exists) a Bayesian composite AI-likelihood score. Call this BEFORE writing new code so the agent reuses existing patterns instead of duplicating them. For per-issue details or per-file hot-spots, use slop_scan_file on each candidate path. |
| `slop_suggest_with_structure` | maxFiles | Fast-path variant of `slop_suggest` that reads `.slopbrick/structure.md` from disk instead of re-scanning the codebase. Requires a prior `slopbrick scan` to have persisted the inventory (100–1000× latency win on the agent integration). If `structure.md` is missing, falls back to `slop_suggest` and annotates the response with `structureHint` so the caller knows to run `slopbrick scan` first. |
| `slop_check_constitution` | path (required) | Check a single file against the project's declared constitution (stateManagement, dataFetching, uiLibrary, forms, styling, routing, plus a forbidden deny-list in slopbrick.config.mjs). Returns the file path, total import + violation counts, the parsed imports, the list of violations (each with import, category, and reason), and a conventionSource indicating whether the constitution was declared, detected, or absent. Use this on a newly-written or modified file before suggesting a PR. |
| `slop_find_similar` | name, hooks, props, limit | Find the most similar existing function/component implementations across the codebase, ranked by Jaccard similarity over the union of (hooks ∪ props ∪ params). Use this BEFORE writing new code so the agent reuses an existing pattern instead of inventing a new one. Returns up to `limit` matches (default 10) with name, file, line, fingerprint (sha256 over signature), hooks, props, params, and similarity in [0, 1]. |

<!-- slopbrick:mcp-registry:end -->

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

## The 7 canonical tools

### Tier 1 — Core (call these first)

#### `slop_scan_file`

Scan a single file, return issues + per-category scores.

**Input:**
- `path` (string, required) — absolute or workspace-relative path
- `framework` (string, optional) — configured framework multiplier

**Output:**
```json
{
  "filePath": "src/Card.tsx",
  "componentCount": 1,
  "compositeScore": { "probability": 0.12, "confidenceTier": "low" },
  "issues": [
    {
      "ruleId": "typo/placeholder-text",
      "category": "typo",
      "severity": "low",
      "aiSpecific": false,
      "line": 1,
      "column": 8,
      "message": "Placeholder text \"TODO\" is a development placeholder.",
      "advice": "Replace with specific, user-facing copy.",
      "calibration": {
        "status": "historical-point-estimate-only",
        "lastCalibratedAt": "2026-07-04T00:00:00Z",
        "recall": 0.0014,
        "falsePositiveRate": 0.0023,
        "precision": 0.4155,
        "lift": 178.13,
        "confidenceLimits": null,
        "provenance": {
          "status": "historical-only",
          "source": null,
          "cohort": null,
          "reason": "The shipped estimate predates v10.3 admission; no validated cohort/source is available."
        }
      },
      "whyItFired": {
        "summary": "Placeholder text \"TODO\" is a development placeholder.",
        "location": { "line": 1, "column": 8 },
        "facts": null,
        "evidence": {
          "kind": "matched-source-span",
          "status": "exact",
          "snippet": "placeholder=\"TODO\"",
          "location": {
            "start": { "line": 1, "column": 8 },
            "end": { "line": 1, "column": 25 }
          },
          "matched": { "field": "placeholder", "key": "placeholder", "value": "TODO" }
        }
      }
    }
  ]
}
```

The optional `whyItFired.evidence` block is bounded matched-span context. If
the producer or MCP safety policy cannot return the source span unchanged, the
wire status is `"omitted"` with a deterministic marker and typed omission
metadata (for example `reason: "unsafe-path"`, `"sensitive"`,
`"source-like"`, `"oversized"`, or `"details-dropped"`). Details that
cannot fit the deterministic safety budget are omitted as a whole. `status:
"exact"` is reserved for a snippet and details returned unchanged. This is
not a parser dump and makes no authorship or provenance claim.

Each finding also carries `aiSpecific` and a bounded top-level `calibration`
projection. Historical point estimates include the validated date and scalar
recall/FPR/precision/lift values, but `provenance.source` and
`provenance.cohort` remain `null` until a v10.3 cohort is admitted. Rules with
no shipped estimate return `calibration.status: "unavailable"`; neither form
is authorship proof or a release-calibration claim.

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
  "severity": "high",
  "pattern": "...",
  "remediation": "See the rule source for the canonical before/after: src/rules/ai/compression-profile.ts",
  "sourcePath": "src/rules/ai/compression-profile.ts",
  "suppressionSnippet": "rules: { \"ai/compression-profile\": \"off\" }  // or set to a lower severity",
  "evidence": {
    "category": "ai-signal",
    "calibration": {
      "status": "historical-point-estimate-only",
      "confidenceLimits": null,
      "confidenceLimitsReason": "No validated confidence interval is available in the shipped calibration contract."
    }
  },
  "configuration": {
    "configuredSeverity": null,
    "defaultOff": false,
    "policyState": "rule-default"
  }
}
```

**When to use:** when the agent fires a rule and wants to know
*why* and what to do about it.

`configuration` describes rule metadata plus the supplied project policy. It
does not state whether a particular `slop_scan_file` invocation executed or
suppressed the rule; inspect that invocation's returned findings for runtime
behavior.

#### `slop_list_rules`

List all registered rules, with optional category filter.

**Input:**
- `category` (string, optional) — filter by category (for example `"ai"` or `"visual"`)

**Output:**
```json
{
  "count": 103,
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

**Input:**
- `maxFiles` (number, optional) — cap the inventory scan; defaults to 200

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
instead of re-parsing the AST. It avoids repeated parsing on subsequent calls;
measure the actual speed-up on the target repository.

> The canonical artifact is `.slopbrick/structure.md`; older `memory.md`
> terminology is historical and should not be used in new integrations.

**Input:**
- `maxFiles` (number, optional) — cap the slow-path fallback scan; defaults to 200

**Output:** same as `slop_suggest`.

**When to use:** same as `slop_suggest`. Always prefer this version
if `.slopbrick/structure.md` exists. Run `slopbrick scan` once to
generate it, then `slop_suggest_with_structure` works on every agent
call.

#### `slop_check_constitution`

Check a file or proposed change against the project Constitution.

**Input:**
- `path` (string, required) — absolute or workspace-relative path

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

The former `slop_architecture_score`, `slop_business_logic_score`, and
`slop_governance` tools were removed from the advertised registry. Their
signals are consolidated into `slop_suggest` and the persisted health report.

#### `slop_find_similar`

Find similar function/component implementations by signature features.
Useful for "where else do I do X?"

**Input:**
- `name` (string, optional) — function/component name
- `hooks` (string array, optional)
- `props` (string array, optional)
- `limit` (integer, optional, default 10; capped at 50)

**Output:**
```json
{
  "matches": [
    {
      "file": "src/Button.tsx",
      "name": "Button",
      "similarity": 0.92,
      "fingerprint": "sha256:...",
      "hooks": ["useState"],
      "props": ["variant"]
    }
  ]
}
```

**When to use:** the agent is about to add a new file and wants
to know "what's the closest pattern to follow?"

## Typical agent flow

```
1. slop_suggest             — check the project is set up and read the declared patterns
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
- [slopbrick source](../src/mcp/server.ts)
