# @usebrick/core — Public API

The `@usebrick/core` package is the **cross-language contract** for the Repository Structure Platform. Its public surface is small and stable.

## Exports

The package's `index.ts` re-exports from three internal modules:

- `./structure-types` — TypeScript types and runtime validators
- `./structure` — file loaders/savers and path helpers
- `./verdicts` — the closed verdict taxonomy
- `./signal-strength-schema` — the Zod schema for calibration data

### Types

- `StructureCategory` — the closed set of categories tracked in the inventory (`stateManagement | dataFetching | uiLibrary | styling | forms | routing | modal | button | api | service | route | ormModel`)
- `StructurePattern` — a single detected pattern (category, canonical name, imports, fileCount)
- `ComponentFingerprint` — a single component's fingerprint (name, files, hash, hooks, props, line range)
- `InventoryFile` — the shape of `.slop-audit/inventory.json` (auto-generated from `schemas/v1/inventory.schema.json`)
- `ConstitutionFile` — the shape of `.slop-audit/constitution.json`
- `FileMtimeEntry` — a per-file mtime + hash entry for the cache (NOT part of the public schema — internal to the freshness check)
- `HealthFile` — the shape of `.slopbrick/health.json` (per-scan health snapshot; the headline `slopIndex`, per-category scores, issue counts)

### Runtime validators

Every public type has an `is<Type>(value): value is Type` runtime predicate. Mismatched or malformed JSON returns `false` (loaders return `null` rather than throw, so consumers degrade gracefully):

- `isStructurePattern`
- `isComponentFingerprint`
- `isInventoryFile`
- `isConstitutionFile`
- `isFileMtimeEntry`
- `isHealthFile`

### Loaders, savers, and freshness

- `INVENTORY_FILENAME`, `CONSTITUTION_FILENAME`, `CACHE_FILENAME`, `HEALTH_FILENAME` — the canonical file names
- `inventoryPath(root)`, `constitutionPath(root)`, `cachePath(root)`, `healthPath(root)` — root-anchored absolute paths
- `loadInventory(root)`, `saveInventory(root, file)` / `loadConstitution(root)`, `saveConstitution(root, file)` / `loadHealth(root)`, `saveHealth(root, file)` — read/write each artifact; loaders return `null` on version mismatch or malformed JSON
- `readCache(root)`, `writeCacheFromInventory(root, inventory)` — the cache file (`.slop-audit/cache.json`); NOT a public schema, internal to the freshness check
- `isInventoryFresh(root, inventory)` — true iff every file in the inventory's component list has the same mtime + hash as the cache
- `invalidateFile(root, file)` — drop a file from the cache (used by file-watcher integrations)
- `writeJsonAtomic(path, data)` — write JSON safely (write-to-temp + rename)

### Verdicts (v0.15.0+)

- `VERDICTS` — `['USEFUL', 'OK', 'NOISY', 'INVERTED', 'HYGIENE', 'DORMANT']` as a `readonly` tuple (the closed set)
- `Verdict` — TypeScript union type inferred from `VERDICTS`
- `isDefaultOff(verdict)` — property test: does this verdict ship opt-out? Returns `true` for `NOISY`, `INVERTED`, `DORMANT`

### Schemas (v0.15.0+)

- `signalStrengthSchema` — Zod schema for `signal-strength.json` (slopbrick's calibration data). Validates recall/fpRate/precision in [0, 1], `lastCalibratedAt` is an ISO 8601 datetime, `verdict` is in `VERDICTS`, and `defaultOff` is an optional boolean override.
- `SignalStrengthEntry` — TypeScript type inferred from the Zod schema (`z.infer<typeof signalStrengthSchema>[string]`)

### Constants

- `STRUCTURE_SCHEMA_VERSION` — the current schema version (`'3'`). Bump on breaking change.

## On-disk layout

```
<project-root>/
├── .slop-audit/
│   ├── inventory.json     # machine-readable pattern + component inventory
│   ├── constitution.json  # machine-readable declared constitution
│   └── cache.json         # per-file mtime + hash (internal, NOT a public schema)
└── .slopbrick/
    └── health.json        # machine-readable per-scan health snapshot
```

Note: the directory is `.slop-audit/`, not `.slopbrick/`. The `.slopbrick/` directory is reserved for the headline `health.json` snapshot (v0.15.0 — was `.slop-audit/health.json` in v0.14.x).

## Stability guarantees

- **Adding a new field** to an existing schema is allowed without a version bump if the field is optional with a default. The validator and the schema file must both be updated.
- **Removing or renaming a field** is a breaking change; bump `STRUCTURE_SCHEMA_VERSION` and the consuming package's major version.
- **Adding a new `Verdict`** is a breaking change; extend `VERDICTS` and bump the consuming package's major version.
- **Zod schema changes** to `signalStrengthSchema` are validated at module load time inside slopbrick; a parse failure throws a contract violation, which means the calibration JSON must be regenerated.

## Cross-language consumers

The JSON Schemas in `schemas/v1/*.json` are the source of truth for non-TypeScript consumers. Python (a future `stackpick` analyzer), Go (a future CI binary), or any other language should generate their types from these schemas, not from the TypeScript types.

| Schema | Artifact | Source file |
|--------|----------|-------------|
| `inventory.schema.json`  | `.slop-audit/inventory.json`    | slopbrick scan |
| `constitution.schema.json` | `.slop-audit/constitution.json` | `slopbrick init` |
| `health.schema.json`     | `.slopbrick/health.json`        | slopbrick scan |
| `structure.schema.json`  | the agent-readable markdown summary (rendered from inventory + constitution) | slopbrick scan |
