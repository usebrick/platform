# @usebrick/engine

The pure scanning engine extracted from `slopbrick`. No I/O, no `console.log`, no `process.exit`. Reusable from the CLI, the MCP server, and future web IDEs.

> **v0.15.0:** Extracted from `slopbrick/src/engine/`. The engine is now its
> own workspace package, consumed by `slopbrick` as a workspace dep. The
> pure-function surface (parser, scoring, LR combiner, structure
> persistence, Bayesian math) is the engine's public API.

## What lives here

Pure functions that:
- read structured inputs (parsed ASTs, signal-strength data, calibration)
- produce structured outputs (LRs, scores, classifications)
- have no filesystem, network, or process side effects

## What does NOT live here

Anything that touches the filesystem (`fs.readFile`, `fs.writeFile`), the process (`process.exit`, `process.argv`), or stdout/stderr (`console.log`). Those concerns live in the slopbrick CLI and MCP server.

## Public API (`packages/engine/src/index.ts`)

- `scanProject(options, io)` — pure scan, takes a `MemoryIO` interface for file I/O
- `loadStructure` / `saveStructure` — structure persistence (was `loadMemory` / `saveMemory` in v0.14.5)
- `loadInventory` / `saveInventory` — pattern inventory persistence
- `loadConstitution` / `saveConstitution` — declared constitution persistence
- `loadHealth` / `saveHealth` — health snapshot persistence
- `computeLikelihoodRatios(ruleIds, corpus)` — LR math
- `bayesianPosterior(firedRuleIds, lrs)` — naive Bayes update
- `parseFile(filePath, content)` — AST parsing
- 30+ more exports

## Build dependency

`slopbrick` imports `@usebrick/engine` (instead of `src/engine/`). The build order is:
1. `@usebrick/core` (no deps)
2. `@usebrick/engine` (deps: `@usebrick/core`)
3. `slopbrick` (deps: `@usebrick/core`, `@usebrick/engine`)

## Status

v0.15.0: **shipped** (B.1–B.8 complete). The pure scanning logic lives here; the CLI-side I/O adapters and command modules stay in `slopbrick/`.

## License

[MIT](../../LICENSE)
