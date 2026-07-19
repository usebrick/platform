# Future package extractions

UseBrick capability names do not imply workspace packages. When the platform
grows, a module currently inside an existing package may deserve extraction,
but only after the global gate below and a surface-specific need are both
satisfied. This document records possibilities, not roadmap authorization.

> **v0.15.0+:** The "Repository Memory" naming is gone. Types and functions
> are now `Structure*` (`MemoryFile` → `StructureFile`, `loadMemory` →
> `loadStructure`, etc.). The on-disk artifact `.slopbrick/memory.md` is
> `.slopbrick/structure.md`. The schema version constant is
> `STRUCTURE_SCHEMA_VERSION` (was `MEMORY_SCHEMA_VERSION`).

## `packages/structure/` (or `packages/repository-structure/`)

**Currently lives in:** `packages/core/src/structure-types.ts` + `packages/core/src/structure.ts` (renamed from `memory-types.ts` + `memory.ts` in v0.15.0)

**What it would contain:** the full Repository Structure read/write/validate surface — `loadInventory`, `saveInventory`, `loadConstitution`, `saveConstitution`, `readCache`, `writeCacheFromInventory`, `isInventoryFresh`, `invalidateFile`, all `isXFile` validators, the `STRUCTURE_SCHEMA_VERSION` constant.

**Consider after the global extraction gate, when:**
- at least two real shipped consumers need the structure surface independently
  of the complete schema/type package; and
- the structure interface has remained stable long enough to support its own
  compatibility and versioning contract.

A future non-TypeScript consumer may justify publishing schema artifacts, but
it does not by itself authorize a TypeScript package split.

**Don't extract while:**
- Only `slopbrick` consumes the structure surface — keeping it in `core` is fine
- The schema is still being designed (extracting adds a publish coordination step that slows iteration)

## `packages/contracts/`

**Currently lives in:** `packages/core/schemas/v1/*.json` (the JSON Schemas) + types in `packages/core/src/structure-types.ts`

**What it would contain:** all cross-language contract artifacts — JSON Schemas, generated TypeScript interfaces, MCP request/response models, future Protobuf/gRPC specs.

**Consider after the global extraction gate, when:**
- at least two real consumers need a language-agnostic contract lifecycle; and
- schema cadence is demonstrably independent from Core implementation cadence.

**Don't extract while:**
- Only TypeScript consumes the schemas — keeping them in `core/` keeps the iteration loop tight
- Schema changes are still happening in lock-step with TypeScript changes

## Global extraction gate

Every extraction requires all of the following before implementation:

1. an approved ADR covering ownership, compatibility, versioning, migration,
   and release lifecycle;
2. at least two real consumers that need the boundary independently;
3. a stable interface supported by contract tests; and
4. evidence that extraction reduces coupling rather than moving coordination
   cost into publishing and semver.

An extraction is a possibility, not roadmap status. The root
[roadmap](../ROADMAP.md) and [execution index](execution/index.json) decide
sequencing.

If an extraction is approved, reusable libraries use the scoped
`@usebrick/*` namespace. `slopbrick` remains the shipped unscoped CLI. There is
no approved umbrella CLI or independent StackPick/GIR/MCP package today. A
future umbrella `usebrick` CLI requires its own implementation, command and
configuration compatibility design, package/name decision, migration plan, and
reviewed release authorization. Capability language such as future `usebrick
scan` is not an implementation decision.

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
| Memory capability | Planned read-only context compiler | M0 beats native agent context, the interface stabilizes, and two consumers need it independently |
| Lock capability | Planned paid-workflow hypothesis inside `slopbrick` | Real use proves a separately versioned policy engine reduces coupling for two consumers |
| Mend capability | Parked narrow reversible repair | Trusted enforcement and rollback proof produce a stable repair contract needed by two consumers |
| RenderBrick Labs | Draft source-only versus rendered-evidence benchmark | Material benchmark value plus two real consumers and an approved runtime boundary ADR |
| Standalone MCP | Not approved | Multiple clients need an independent lifecycle and the boundary has no CLI-internal assumptions |
