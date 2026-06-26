# Future package extractions

When the platform grows, some modules currently in `packages/core/` may deserve their own workspace package. This document tracks the candidates and the threshold for extraction.

## `packages/memory/` (or `packages/repository-memory/`)

**Currently lives in:** `packages/core/src/memory-types.ts` + `packages/core/src/memory.ts`

**What it would contain:** the full Repository Memory read/write/validate surface — `loadInventory`, `saveInventory`, `loadConstitution`, `saveConstitution`, `readCache`, `writeCacheFromInventory`, `isInventoryFresh`, `invalidateFile`, all `isXFile` validators, the `MEMORY_SCHEMA_VERSION` constant.

**Extract when ANY of these is true:**
- A second consumer (stackpick or gir) needs the memory surface but NOT the schema types (impossible today; would signal schemas-as-spec maturing into memory-as-engine)
- The memory module's surface stabilizes (no new functions in 6+ months) — at that point it deserves its own versioning
- A Python or Go consumer of the schemas wants to read `.slopbrick/inventory.json` without pulling in the full `@usebrick/core` package (split it via exports)

**Don't extract while:**
- Only `slopbrick` consumes the memory surface — keeping it in `core` is fine
- The schema is still being designed (extracting adds a publish coordination step that slows iteration)

## `packages/contracts/`

**Currently lives in:** `packages/core/schemas/v1/*.json` (the JSON Schemas) + types in `packages/core/src/memory-types.ts`

**What it would contain:** all cross-language contract artifacts — JSON Schemas, generated TypeScript interfaces, MCP request/response models, future Protobuf/gRPC specs.

**Extract when:**
- A non-TypeScript consumer needs the schemas (Python stackpick analyzer, Go CI binary) — at that point, `contracts/` becomes the language-agnostic spec, `core/` becomes the TypeScript implementation
- The schemas stop evolving at the same cadence as the implementation (they're frozen while `core/` keeps adding internal helpers)

**Don't extract while:**
- Only TypeScript consumes the schemas — keeping them in `core/` keeps the iteration loop tight
- Schema changes are still happening in lock-step with TypeScript changes

## Naming convention for future packages

When these extractions happen:

- Use **scoped `@usebrick/`** names: `@usebrick/memory`, `@usebrick/contracts`. The scope is for **libraries**, not the CLI.
- The CLI stays unscoped: `slopbrick` (the flagship) + future `usebrick` (the umbrella for `scan`/`memory`/`mcp`/`doctor` subcommands).
- The CLI binary keeps the unscoped name (`slopbrick`) but the package can be either.

## When NOT to extract

Premature splitting hurts more than it helps. Resist the urge to extract when:
- There's only one consumer (no API contract pressure)
- The interface is still being designed (changes churn more in isolation)
- The two pieces share test fixtures, corpus, or AST visitors (now you have to coordinate changes)
- You can't articulate a clean versioning story (would extracting force semver coordination you don't want?)

## Status

| Package | State | Trigger for extraction |
|---------|-------|------------------------|
| `@usebrick/core` | Monolithic (types + memory + JSON Schemas all in one) | Split into `core` + `memory` + `contracts` when a second language or second consumer appears |
| `slopbrick` | CLI in monorepo | Stable; no extraction planned |
| Future `stackpick` / `gir` / `mcp` / `cli` | Add as siblings when ready | Each becomes its own workspace package, all consuming `@usebrick/core` |
