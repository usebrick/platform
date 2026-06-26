# AGENTS.md

> How AI agents should work with `@usebrick/core`.

Apply silently. Do not restate unless the user asks for project rules.

---

## What this package is

`@usebrick/core` is the **stable contract** every usebrick.dev tool depends on. It defines the `.slop-audit/` memory schema and provides loaders, savers, validators, and a freshness check.

- `slopbrick` writes these artifacts
- `stackpick`, `gir`, and any future usebrick.dev tool reads them
- Both sides depend on this package for the schema

## What this package is NOT

- Not a feature of `slopbrick`. core lives in its own repo, on its own release cadence.
- Not the source of detection logic. slopbrick owns the rules; core owns the schema.
- Not opinionated about the scanner's output beyond the schema. The `InventoryFile` interface is the minimum surface; tools can add fields without touching core, but they must bump `MEMORY_SCHEMA_VERSION` when they do.

## Project layout

| Path | Purpose |
|------|---------|
| `src/memory-types.ts` | TypeScript types + JSON validators (`isInventoryFile`, etc.) |
| `src/memory.ts` | Path helpers + atomic write + loaders/savers + freshness check |
| `src/index.ts` | Public facade — re-exports for library consumers |
| `tests/memory-types.test.ts` | Validator unit tests |
| `tests/memory.test.ts` | Loader/saver/freshness integration tests |

## Conventions for new schema fields

1. **Bump `MEMORY_SCHEMA_VERSION`** to a new string before adding/removing fields.
2. **Update `isXFile` validators** to recognize the new shape.
3. **Update tests** in `tests/memory-types.test.ts` for both old and new shapes.
4. **Never delete a field without bumping the version** — old binaries on new files will silently misread. Instead, mark fields as `@deprecated` in JSDoc and remove at the next major version.
5. **Keep `inventory.json` and `constitution.json` as the only public schema**. The cache file is internal; if you add cache metadata that callers need, promote it into a new top-level file and bump the version.

## Conventions for new I/O operations

1. **Pure functions preferred** — `loadInventory` is synchronous (it's a small JSON read). Async wrappers (`loadInventoryAsync`) belong in the consumer, not here.
2. **Atomic writes** — always go through `writeJsonAtomic()`. Don't write `.json` files directly.
3. **Null on missing/malformed/mismatched** — loaders return `null`, never throw. Callers (slop-audit) decide whether to rebuild or error.
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

## Release cadence

- `@usebrick/core` follows semver.
- `slopbrick` is the only consumer today. Future tools (`@usebrick/stackpick`, `@usebrick/gir`) will join.
- When slopbrick or any consumer needs a new field, core ships a minor version (backward compatible) or major version (schema break) on the same day.

## License

[MIT](./LICENSE)
