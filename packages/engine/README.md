# @usebrick/engine

The scanning engine extracted from `slopbrick`. Pure parsing and scoring functions are reusable from the CLI, MCP server, and future web IDEs; compatibility adapters that explicitly perform filesystem I/O are called out below.

> **v0.15.0:** Extracted from `slopbrick/src/engine/`. The engine is now its
> own workspace package, consumed by `slopbrick` as a workspace dep. The
> pure-function surface (parser, scoring, LR combiner, structure
> persistence, Bayesian math) is the engine's public API.

## What lives here

Pure functions that:
- read structured inputs (parsed ASTs, signal-strength data, calibration)
- produce structured outputs (LRs, scores, classifications)
- have no filesystem, network, or process side effects

Pure core functions do not perform I/O. The package also retains a small set of
explicit compatibility adapters for existing callers; these are listed in the
API section and are the only filesystem-touching entry points.

## What does NOT live here

CLI orchestration, process control (`process.exit`, `process.argv`), and
stdout/stderr (`console.log`) remain in the slopbrick CLI and MCP server.

## Public API (`packages/engine/src/index.ts`)

- `scanProject(options, io)` — pure scan, takes a `MemoryIO` interface for file I/O
- `loadStructure` / `saveStructure` — structure persistence (was `loadMemory` / `saveMemory` in v0.14.5)
- `loadInventory` / `saveInventory` — pattern inventory persistence
- `loadConstitution` / `saveConstitution` — declared constitution persistence
- `loadHealth` / `saveHealth` — health snapshot persistence
- `computeLikelihoodRatios(ruleIds, corpus)` — LR math
- `bayesianPosterior(firedRuleIds, lrs)` — naive Bayes update
- `parseSource(source, filePath)` — pure AST parsing (no filesystem access)
- `parseFile(filePath, opts?)` — compatibility filesystem adapter with optional AST cache
- `extractSignatures(source, filePath, workspaceDir)` — pure signature extraction
- `findSimilarFunctions(query, options?)` — workspace adapter that reads files before using the pure similarity functions
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
