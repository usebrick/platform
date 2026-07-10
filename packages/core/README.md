# `@usebrick/core` — Repository Structure Platform spec + reader/writer

**The contract every usebrick.dev tool depends on. The moat of the platform.**

> **v0.15.0+:** Renamed from "Repository Memory Platform" to **"Repository
> Structure Platform"**. The on-disk artifact `.slopbrick/memory.md` is now
> `.slopbrick/structure.md`. Types: `MemoryFile` → `StructureFile`,
> `MemoryCategory` → `StructureCategory`, `MemoryPattern` → `StructurePattern`.
> Functions: `loadMemory` / `saveMemory` → `loadStructure` / `saveStructure`.
> Schema version constant: `MEMORY_SCHEMA_VERSION` (value `'2'`) →
> `STRUCTURE_SCHEMA_VERSION` (value `'3'`). The legacy `slopIndex` field is
> replaced by 4 independent scores (`aiQuality` / `engineeringHygiene` /
> `security` / `repositoryHealth`).

`@usebrick/core` is:

1. **TypeScript types** — `InventoryFile`, `ConstitutionFile`, `StructureFile` (was `MemoryFile`), `HealthFile`
2. **Validators** — `isInventoryFile`, `isConstitutionFile`, etc. refuse silently malformed or version-mismatched files.
3. **Loaders/savers** — `loadInventory`/`saveInventory`, `loadConstitution`/`saveConstitution`, `loadStructure`/`saveStructure`, atomic `.tmp + rename` writes, freshness check.
4. **Canonical JSON Schemas** — under `schemas/`. The single source of truth that every tool in the platform must conform to.
5. **Verdict taxonomy** — `Verdict` enum (`USEFUL` / `OK` / `NOISY` / `INVERTED` / `HYGIENE` / `DORMANT`), `isDefaultOff()`, `VERDICTS` constant. The single source of truth for the calibration pipeline.

## The schemas — `packages/core/schemas/v1/`

These JSON Schema files define the **Repository Structure Platform** and its
versioned calibration-evidence contract:

| Schema | Purpose | Produced by | Consumed by |
|--------|---------|-------------|-------------|
| [`v1/inventory.schema.json`](./schemas/v1/inventory.schema.json) | Detected patterns + component fingerprints | `slopbrick scan` | `slopbrick`, `stackpick`, `gir`, `mcp` |
| [`v1/constitution.schema.json`](./schemas/v1/constitution.schema.json) | Declared project constitution | `slopbrick scan` (auto from config) | `slopbrick drift`, `stackpick`, `gir`, `mcp` |
| [`v1/structure.schema.json`](./schemas/v1/structure.schema.json) | Structured JSON projection of the agent-readable summary (the derived `.slopbrick/structure.md` rendering is not JSON input) | `slopbrick scan` (auto-renders) | `slop_suggest_with_structure` MCP tool (was `slop_suggest_with_memory`) |
| [`v1/health.schema.json`](./schemas/v1/health.schema.json) | Per-scan health snapshot — 4-score model | `slopbrick scan` | website dashboards, CI integrations |
| [`v1/calibration-corpus-manifest.schema.json`](./schemas/v1/calibration-corpus-manifest.schema.json) | Immutable v10.3 repository/file provenance manifest | reviewed corpus preparation | calibration selection and verifier |

The calibration corpus manifest is a two-part contract: validate the JSON
Schema **and** call `isCalibrationCorpusManifestV103` before selection or
calibration. The semantic verifier enforces canonical source IDs and
cross-record family/cluster/split leakage rules which JSON Schema cannot
express alone.

### Versioned schema URLs

Each schema is published under a versioned URL:

```
https://usebrick.dev/schemas/v1/inventory.schema.json
https://usebrick.dev/schemas/v1/constitution.schema.json
https://usebrick.dev/schemas/v1/structure.schema.json
https://usebrick.dev/schemas/v1/health.schema.json
https://usebrick.dev/schemas/v1/calibration-corpus-manifest.schema.json
```

The version directory (`v1/`, future `v2/`, ...) is the **contract version**. Older tools keep reading `v1/` even after `v2/` ships — that's the whole point of versioning. New tools can opt into `v2/` when ready.

**When to add `v2/`:** when you need to remove a field, rename a field, or change a `required` array. Adding new optional fields with defaults stays in `v1/`. Backward-compatible changes never bump the schema version.

**Why JSON Schema, not just TypeScript types?** JSON Schema is the lingua franca for cross-language validation. Future tools in other languages (Python for `stackpick` data analysis, Go for a CI binary, Rust for a fast indexer) can validate inventory.json / constitution.json without needing TypeScript. The schemas become the platform's API contract — every tool speaks the same language.

### v0.15.0 schema codegen

The TypeScript types in `packages/core/src/structure-types.ts` are **codegen'd** from the JSON Schemas by `packages/core/scripts/codegen-types.ts`. The generated types are the public API. CI runs the codegen and fails if the schemas and types drift out of sync.

## Why this is private for now

`@usebrick/core` is marked `private: true` in `package.json` and is **not published to npm** in this initial release. The reason:

- The schema is `version: '3'` (was `'2'` in v0.14.5) but the underlying data model is still settling. Repository Structure needs at least two consumers (`slopbrick` for write, `stackpick` or `gir` for read) before the schema is "earned."
- Publishing `@usebrick/core` to npm forces you to maintain semver on every schema tweak. Keeping it internal means you can iterate freely.
- The schemas-as-moat argument only holds if the schemas are stable. Premature publication locks in a shape you might want to change.

**When to publish `@usebrick/core`:** after at least one non-slopbrick tool has shipped and is reading the schemas in production. Not before.

## What's next

For now the monorepo is enough — `@usebrick/core` lives at `packages/core/` and `slopbrick` + `@usebrick/engine` consume it as workspace deps. When the schema stabilizes:

1. Remove `"private": true` from `packages/core/package.json`
2. Add `"publishConfig": { "access": "public" }`
3. `pnpm publish --filter @usebrick/core` from the monorepo root

The schemas stay backward-compatible (we never delete fields, only add them with defaults) so existing consumers don't break when you bump `STRUCTURE_SCHEMA_VERSION`.

## Stability promise

Anything exported from `@usebrick/core/src/index.ts` is the contract. Anything in `src/` but not re-exported is internal. Bumping `STRUCTURE_SCHEMA_VERSION` means a breaking change — bump the package's major version when you do.

## License

[MIT](./LICENSE)
