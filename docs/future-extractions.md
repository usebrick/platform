# Future package extractions

When the platform grows, some modules currently in `packages/core/` may deserve their own workspace package. This document tracks the candidates and the threshold for extraction.

> **v0.15.0+:** The "Repository Memory" naming is gone. Types and functions
> are now `Structure*` (`MemoryFile` → `StructureFile`, `loadMemory` →
> `loadStructure`, etc.). The on-disk artifact `.slopbrick/memory.md` is
> `.slopbrick/structure.md`. The schema version constant is
> `STRUCTURE_SCHEMA_VERSION` (was `MEMORY_SCHEMA_VERSION`).

## `packages/structure/` (or `packages/repository-structure/`)

**Currently lives in:** `packages/core/src/structure-types.ts` + `packages/core/src/structure.ts` (renamed from `memory-types.ts` + `memory.ts` in v0.15.0)

**What it would contain:** the full Repository Structure read/write/validate surface — `loadInventory`, `saveInventory`, `loadConstitution`, `saveConstitution`, `readCache`, `writeCacheFromInventory`, `isInventoryFresh`, `invalidateFile`, all `isXFile` validators, the `STRUCTURE_SCHEMA_VERSION` constant.

**Extract when ANY of these is true:**
- A second shipped consumer needs the structure surface but not the complete
  schema/type package (which would show structure-as-engine has become a real
  boundary)
- The structure module's surface stabilizes (no new functions in 6+ months) — at that point it deserves its own versioning
- A Python or Go consumer of the schemas wants to read `.slopbrick/inventory.json` without pulling in the full `@usebrick/core` package (split it via exports)

**Don't extract while:**
- Only `slopbrick` consumes the structure surface — keeping it in `core` is fine
- The schema is still being designed (extracting adds a publish coordination step that slows iteration)

## `packages/contracts/`

**Currently lives in:** `packages/core/schemas/v1/*.json` (the JSON Schemas) + types in `packages/core/src/structure-types.ts`

**What it would contain:** all cross-language contract artifacts — JSON Schemas, generated TypeScript interfaces, MCP request/response models, future Protobuf/gRPC specs.

**Extract when:**
- An approved non-TypeScript consumer needs the schemas — at that point,
  `contracts/` can become the language-agnostic spec and `core/` the TypeScript
  implementation
- The schemas stop evolving at the same cadence as the implementation (they're frozen while `core/` keeps adding internal helpers)

**Don't extract while:**
- Only TypeScript consumes the schemas — keeping them in `core/` keeps the iteration loop tight
- Schema changes are still happening in lock-step with TypeScript changes

## Decision boundary for future packages

An extraction is a possibility, not roadmap status. It requires its own ADR,
versioning/ownership contract, at least two real consumers, and evidence that a
package boundary reduces coupling. The root [roadmap](../ROADMAP.md) and
[execution index](execution/index.json) decide sequencing.

If an extraction is approved, reusable libraries use the scoped
`@usebrick/*` namespace. `slopbrick` remains the shipped unscoped CLI. There is
no approved umbrella CLI or independent StackPick/GIR/MCP package today.

## When NOT to extract

Premature splitting hurts more than it helps. Resist the urge to extract when:
- There's only one consumer (no API contract pressure)
- The interface is still being designed (changes churn more in isolation)
- The two pieces share test fixtures, corpus, or AST visitors (now you have to coordinate changes)
- You can't articulate a clean versioning story (would extracting force semver coordination you don't want?)

## Status

| Surface | Current state | Earliest valid extraction trigger |
|---------|---------------|-----------------------------------|
| `@usebrick/core` | Private workspace contract package | A public cross-language consumer and a reviewed schema/versioning ADR |
| `@usebrick/engine` | Private pure scanning package | A second shipped runtime needs the stable pure API independently of SlopBrick |
| `slopbrick` | Published CLI and embedded MCP server | Keep together while one release lifecycle and one owner are simpler |
| MemoryBrick | Read-only product direction | M0 proves provenance/freshness value and two consumers need a stable API |
| LockBrick | Planned paid workflow | Team pilots prove a separately versioned policy engine is needed |
| Standalone MCP | Not approved | Multiple clients need an independent lifecycle and the boundary has no CLI-internal assumptions |
