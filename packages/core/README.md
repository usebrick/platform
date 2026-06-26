# `@usebrick/core` — Repository Memory Platform spec + reader/writer

**The contract every usebrick.dev tool depends on. The moat of the platform.**

`@usebrick/core` is:

1. **TypeScript types** — `InventoryFile`, `ConstitutionFile`, `MemoryPattern`, `ComponentFingerprint`, etc.
2. **Validators** — `isInventoryFile`, `isConstitutionFile`, etc. refuse silently malformed or version-mismatched files.
3. **Loaders/savers** — `loadInventory`/`saveInventory`, `loadConstitution`/`saveConstitution`, atomic `.tmp + rename` writes, freshness check.
4. **Canonical JSON Schemas** — under `schemas/`. The single source of truth that every tool in the platform must conform to.

## The schemas — `packages/core/schemas/v1/`

These four JSON Schema files define the **Repository Memory Platform**:

| Schema | Purpose | Produced by | Consumed by |
|--------|---------|-------------|-------------|
| [`v1/inventory.schema.json`](./schemas/v1/inventory.schema.json) | Detected patterns + component fingerprints | `slopbrick scan` | `slopbrick`, `stackpick`, `gir`, `mcp` |
| [`v1/constitution.schema.json`](./schemas/v1/constitution.schema.json) | Declared project constitution | `slopbrick scan` (auto from config) | `slopbrick drift`, `stackpick`, `gir`, `mcp` |
| [`v1/memory.schema.json`](./schemas/v1/memory.schema.json) | Agent-readable markdown summary | `slopbrick scan` (auto-renders) | `slop_suggest_with_memory` MCP tool |
| [`v1/health.schema.json`](./schemas/v1/health.schema.json) | Per-scan health snapshot | `slopbrick scan` | website dashboards, CI integrations |

### Versioned schema URLs

Each schema is published under a versioned URL:

```
https://usebrick.dev/schemas/v1/inventory.schema.json
https://usebrick.dev/schemas/v1/constitution.schema.json
https://usebrick.dev/schemas/v1/memory.schema.json
https://usebrick.dev/schemas/v1/health.schema.json
```

The version directory (`v1/`, future `v2/`, ...) is the **contract version**. Older tools keep reading `v1/` even after `v2/` ships — that's the whole point of versioning. New tools can opt into `v2/` when ready.

**When to add `v2/`:** when you need to remove a field, rename a field, or change a `required` array. Adding new optional fields with defaults stays in `v1/`. Backward-compatible changes never bump the schema version.

**Why JSON Schema, not just TypeScript types?** JSON Schema is the lingua franca for cross-language validation. Future tools in other languages (Python for `stackpick` data analysis, Go for a CI binary, Rust for a fast indexer) can validate inventory.json / constitution.json without needing TypeScript. The schemas become the platform's API contract — every tool speaks the same language.

## Why this is private for now

`@usebrick/core` is marked `private: true` in `package.json` and is **not published to npm** in this initial release. The reason:

- The schema is `version: '2'` but the underlying data model is still settling. Repository Memory needs at least two consumers (`slopbrick` for write, `stackpick` or `gir` for read) before the schema is "earned."
- Publishing `@usebrick/core` to npm forces you to maintain semver on every schema tweak. Keeping it internal means you can iterate freely.
- The schemas-as-moat argument only holds if the schemas are stable. Premature publication locks in a shape you might want to change.

**When to publish `@usebrick/core`:** after at least one non-slopbrick tool has shipped and is reading the schemas in production. Not before.

## What's next

For now the monorepo is enough — `@usebrick/core` lives at `packages/core/` and `slopbrick` consumes it as a workspace dep. When the schema stabilizes:

1. Remove `"private": true` from `packages/core/package.json`
2. Add `"publishConfig": { "access": "public" }`
3. `pnpm publish --filter @usebrick/core` from the monorepo root

The schemas stay backward-compatible (we never delete fields, only add them with defaults) so existing consumers don't break when you bump `MEMORY_SCHEMA_VERSION`.

## Stability promise

Anything exported from `@usebrick/core/src/index.ts` is the contract. Anything in `src/` but not re-exported is internal. Bumping `MEMORY_SCHEMA_VERSION` means a breaking change — bump the package's major version when you do.

## License

[MIT](./LICENSE)
