# AGENTS.md

> How AI agents should work with `@usebrick/core`.

Apply silently. Do not restate unless the user asks for project rules.

---

## What this package is

`@usebrick/core` is the **stable contract** every usebrick.dev tool depends on. It defines the `.slopbrick/` structure schema and provides loaders, savers, validators, and a freshness check.

- `slopbrick` writes these artifacts
- `stackpick`, `gir`, and any future usebrick.dev tool reads them
- Both sides depend on this package for the schema

> **v0.15.0+:** Renamed from "Repository Memory Platform" to **"Repository
> Structure Platform"**. The on-disk artifact `.slopbrick/memory.md` is
> `.slopbrick/structure.md`. Types: `MemoryFile` → `StructureFile`,
> `MemoryCategory` → `StructureCategory`, `MemoryPattern` → `StructurePattern`.
> Functions: `loadMemory` / `saveMemory` → `loadStructure` / `saveStructure`.
> Schema version constant: `MEMORY_SCHEMA_VERSION` (value `'2'`) →
> `STRUCTURE_SCHEMA_VERSION` (value `'3'`).

## What this package is NOT

- Not a feature of `slopbrick`. core lives in its own repo, on its own release cadence.
- Not the source of detection logic. slopbrick owns the rules; core owns the schema.
- Not opinionated about the scanner's output beyond the schema. The `InventoryFile` interface is the minimum surface; tools can add fields without touching core, but they must bump `STRUCTURE_SCHEMA_VERSION` when they do.

## Project layout

| Path | Purpose |
|------|---------|
| `src/structure-types.ts` | TypeScript types + JSON validators (`isInventoryFile`, etc.) — was `memory-types.ts` in v0.14.5 |
| `src/structure.ts` | Path helpers + atomic write + loaders/savers + freshness check — was `memory.ts` in v0.14.5 |
| `src/verdicts.ts` | `Verdict` enum, `VERDICTS` constant, `isDefaultOff()` — the calibration taxonomy |
| `src/index.ts` | Public facade — re-exports for library consumers |
| `tests/structure-types.test.ts` | Validator unit tests |
| `tests/structure.test.ts` | Loader/saver/freshness integration tests |
| `schemas/v1/*.json` | Canonical JSON Schemas (the cross-language API contract) |
| `scripts/codegen-types.ts` | JSON Schema → TypeScript codegen (v0.15.0) |

## Conventions for new schema fields

1. **Bump `STRUCTURE_SCHEMA_VERSION`** to a new string before adding/removing fields.
2. **Update `isXFile` validators** to recognize the new shape.
3. **Update tests** in `tests/structure-types.test.ts` for both old and new shapes.
4. **Never delete a field without bumping the version** — old binaries on new files will silently misread. Instead, mark fields as `@deprecated` in JSDoc and remove at the next major version.
5. **Keep `inventory.json` and `constitution.json` as the only public schema**. The cache file is internal; if you add cache metadata that callers need, promote it into a new top-level file and bump the version.
6. **Add new fields as optional with defaults.** Never add a required field to an existing schema.

## Conventions for new I/O operations

1. **Pure functions preferred** — `loadInventory` is synchronous (it's a small JSON read). Async wrappers (`loadInventoryAsync`) belong in the consumer, not here.
2. **Atomic writes** — always go through `writeJsonAtomic()`. Don't write `.json` files directly.
3. **Null on missing/malformed/mismatched** — loaders return `null`, never throw. Callers (slopbrick) decide whether to rebuild or error.
4. **Tests must cover: missing file, malformed JSON, version mismatch, valid round-trip, validator edge cases.**

## Quality gates

```bash
pnpm typecheck
pnpm build
pnpm test
```

- TypeScript is strict (`noUncheckedIndexedAccess: true`).
- All exports have explicit return types.
- **Zero runtime dependencies.** This package is the foundation; dependency drift breaks every consumer.
- **Public API is the contract.** Any change to a type, validator, or loader signature is a breaking change → major version bump.
- **Schema codegen sync** — the TypeScript types in `src/structure-types.ts` are codegen'd from `schemas/v1/*.json` by `scripts/codegen-types.ts`. CI fails if the schemas and types drift out of sync. Run `pnpm codegen` after any schema change.

## Release cadence

- `@usebrick/core` follows semver.
- `slopbrick` and `@usebrick/engine` are the consumers today. Future tools (`@usebrick/stackpick`, `@usebrick/gir`) will join.
- When a consumer needs a new field, core ships a minor version (backward compatible) or major version (schema break) on the same day.

## License

[MIT](./LICENSE)
