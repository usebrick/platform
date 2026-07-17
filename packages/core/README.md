# `@usebrick/core` — repository contracts

**The private, workspace-only contract layer shared by the usebrick platform.**

In the product architecture, this package is part of the future
**MemoryBrick substrate**: it defines repository-owned artifacts, provenance,
and calibration contracts. SlopBrick is the shipped scanner and front door;
MemoryBrick, LockBrick, and MendBrick are roadmap layers, not separately
shipped packages today.

> Historical naming used “Repository Memory” and `memory.md`. The current
> agent-readable artifact is `.slopbrick/structure.md`, and the current artifact
> version is `STRUCTURE_SCHEMA_VERSION = '5'`. The health contract exposes four
> headline scores (`aiSlopScore`, `engineeringHygiene`, `security`, and
> `repositoryHealth`).

`@usebrick/core` is:

1. **Generated TypeScript types** — `RepositoryStructureInventory`,
   `RepositoryStructureConstitution`, `RepositoryStructureStructuredProjection`,
   and `RepositoryStructureHealth`
2. **Validators** — `isInventoryFile`, `isConstitutionFile`, etc. refuse silently malformed or version-mismatched files.
3. **Loaders/savers** — `loadInventory`/`saveInventory`,
   `loadConstitution`/`saveConstitution`, `loadHealth`/`saveHealth`, atomic JSON
   writes, and the inventory freshness cache.
4. **Canonical JSON Schemas** — under `schemas/`. The single source of truth that every tool in the platform must conform to.
5. **Verdict taxonomy** — `Verdict` enum (`USEFUL` / `OK` / `NOISY` / `INVERTED` / `HYGIENE` / `DORMANT`), `isDefaultOff()`, `VERDICTS` constant. The single source of truth for the calibration pipeline.

## The contracts — `packages/core/schemas/v1/`

Four schemas define the repository-artifact contract:

| Schema | Purpose | Produced by | Consumed by |
|--------|---------|-------------|-------------|
| [`v1/inventory.schema.json`](./schemas/v1/inventory.schema.json) | Detected patterns + component fingerprints | `slopbrick scan` | SlopBrick and MCP |
| [`v1/constitution.schema.json`](./schemas/v1/constitution.schema.json) | Declared project constitution | `slopbrick scan` (auto from config) | SlopBrick and MCP |
| [`v1/structure.schema.json`](./schemas/v1/structure.schema.json) | Structured JSON projection contract; distinct from the derived `.slopbrick/structure.md` | not persisted by the current scan pipeline | future structured consumers |
| [`v1/health.schema.json`](./schemas/v1/health.schema.json) | Per-scan health snapshot — 4-score model | `slopbrick scan` | website dashboards, CI integrations |

The canonical snapshot surface is **three JSON artifacts** that match this
contract (`inventory.json`, `constitution.json`, and `health.json`) plus the
derived Markdown summary `.slopbrick/structure.md`. `structure.schema.json`
defines a structured JSON projection. A separate bounded legacy/local
`.slopbrick/structure.json` run-history log may also exist; it is owned by the
engine history adapter and is **not** an instance of `structure.schema.json`.

The same directory also contains the larger v10.3 calibration/admission
contract family. [`v1/index.json`](./schemas/v1/index.json) is the machine-
readable inventory; do not maintain a second hand-written list here. Those
schemas are evidence/control-plane contracts, not proof that a corpus has been
admitted or that a release is calibrated.

The calibration corpus manifest is a two-part contract: validate the JSON
Schema **and** call `isCalibrationCorpusManifestV103` before selection or
calibration. The semantic verifier enforces canonical source IDs and
cross-record family/cluster/split leakage rules which JSON Schema cannot
express alone. Excluded records remain countable audit evidence and must carry
an `exclusionReason`; the semantic verifier does not treat them as a data
cohort for split-leakage checks.

Beginning with `@usebrick/core` 0.3.0 and calibration method `v10.3.1`, a
repository may optionally declare an immutable HTTPS `release_archive`
materialization. Its URL, exact byte size, lowercase SHA-256 digest, ZIP
format, archive-relative root prefix, and frozen `safe-zip-v1` extraction
policy are schema-backed. Omitting `materialization` keeps the original Git
tree contract and its source IDs byte-for-byte compatible. Archive-backed
source IDs add the asset digest:

```text
<repositoryId>@<commitSha>+asset-<assetSha256>:<normalizedPath>
```

For a release archive, `rootPrefix` names the verified root inside the archive
and each file's `normalizedPath` is relative to that root. The compact
`sourceId` intentionally adds only the archive-byte digest. The validated
manifest and its hash retain the root and extraction policy; later selection
identity binds the complete materialization.

The local-only checkout map copies only the archive digest and extraction
policy. `@usebrick/core` validates that binding and its identity; it performs
no download, extraction, or other I/O.

### Versioned schema URLs

The repository schemas use versioned IDs:

```
https://usebrick.dev/schemas/v1/inventory.schema.json
https://usebrick.dev/schemas/v1/constitution.schema.json
https://usebrick.dev/schemas/v1/structure.schema.json
https://usebrick.dev/schemas/v1/health.schema.json
```

Calibration schema IDs are listed in `schemas/v1/index.json`.

The version directory (`v1/`, future `v2/`, ...) is the **contract version**. Older tools keep reading `v1/` even after `v2/` ships — that's the whole point of versioning. New tools can opt into `v2/` when ready.

**When to add `v2/`:** when you need to remove a field, rename a field, or change a `required` array. Adding new optional fields with defaults stays in `v1/`. Backward-compatible changes never bump the schema version.

**Why JSON Schema, not just TypeScript types?** JSON Schema is the
cross-language contract. Consumers can validate repository and calibration
artifacts without importing this private TypeScript package.

### Schema codegen

The TypeScript types in `packages/core/src/generated/` are generated from the
JSON Schemas by `packages/core/scripts/codegen-types.ts`.
`src/structure-types.ts` contains the version constant and internal cache-entry
type; it is not the generated artifact model. CI fails when schemas, generated
types, validators, or schema peers drift. Run
`corepack pnpm --filter @usebrick/core test:contract` before a clean commit.

## Why this is private for now

`@usebrick/core` is marked `private: true` in `package.json` and is **not published to npm** in this initial release. The reason:

- The schema is `version: '5'` (was `'2'` in v0.14.5) but the underlying data
  model is still settling. The contract needs a real external consumer before
  publication is earned.
- Publishing `@usebrick/core` to npm forces you to maintain semver on every schema tweak. Keeping it internal means you can iterate freely.
- The schemas-as-moat argument only holds if the schemas are stable. Premature publication locks in a shape you might want to change.

**When to publish `@usebrick/core`:** after at least one non-SlopBrick
consumer ships and reads the schemas in production. Not before.

## Runtime support

Core follows the platform runtime policy: Node.js 22 or 24
(`^22.0.0 || ^24.0.0`).

## Roadmap

For now `slopbrick` and `@usebrick/engine` consume this package as workspace
dependencies. If the package is later made public:

1. Remove `"private": true` from `packages/core/package.json`
2. Add `"publishConfig": { "access": "public" }`
3. Publish only through the reviewed GitHub Release/OIDC workflow when the
   package is no longer private; never run `pnpm publish` or `npm publish`
   locally.

See the [platform roadmap](../../ROADMAP.md) and [execution
ledger](../../docs/execution/README.md) for current status. Optional fields
with defaults are the normal backward-compatible evolution path; breaking
shape changes require a schema-version decision and migration.

## Stability promise

Anything exported from `@usebrick/core/src/index.ts` is the contract. Anything in `src/` but not re-exported is internal. Bumping `STRUCTURE_SCHEMA_VERSION` means a breaking change — bump the package's major version when you do.

## License

[MIT](../../LICENSE)
