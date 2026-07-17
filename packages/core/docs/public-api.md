# `@usebrick/core` public contract

`@usebrick/core` is private to this workspace. “Public” here means exported to
other workspace packages, not published on npm. The exact TypeScript surface is
[`src/index.ts`](../src/index.ts); the exact cross-language schema inventory is
[`schemas/v1/index.json`](../schemas/v1/index.json).

## Repository artifact API

The package exports generated types for:

- `RepositoryStructureInventory`
- `RepositoryStructureConstitution`
- `RepositoryStructureHealth`
- `RepositoryStructureStructuredProjection`
- the generated `Pattern`, `Component`, and `Category` shapes

It also exports runtime validators, path helpers, loaders, and atomic savers for
the three persisted JSON artifacts:

```text
<project-root>/.slopbrick/
├── inventory.json
├── constitution.json
├── health.json
├── structure.md       # derived Markdown; written by SlopBrick
└── structure.json     # bounded legacy/local run history; not a repository schema instance
```

`loadInventory`, `loadConstitution`, and `loadHealth` return `null` for a
missing, malformed, or version-mismatched file. Their matching save functions
write atomically. `STRUCTURE_SCHEMA_VERSION` is currently `'5'`.

`.slopbrick/cache.json` is an internal mtime/hash freshness cache exposed only
to workspace consumers through `readCache`, `writeCacheFromInventory`,
`isInventoryFresh`, and `invalidateFile`. It is distinct from SlopBrick's
root-level `.slopbrick-cache.json` incremental scan cache and is not a public
schema.

The repository schemas are:

| Schema | Runtime artifact |
|---|---|
| `inventory.schema.json` | `.slopbrick/inventory.json` |
| `constitution.schema.json` | `.slopbrick/constitution.json` |
| `health.schema.json` | `.slopbrick/health.json` |
| `structure.schema.json` | structured JSON projection; it does not describe the legacy/local `structure.json` run log |

The user-facing `health.json` carries four headline scores:
`aiSlopScore` (lower is cleaner), `engineeringHygiene`, `security`, and
`repositoryHealth` (the latter three are higher-is-better). Empty or
not-applicable scans use a score-free report envelope rather than fabricating a
score-bearing health artifact.

## Calibration API

The package also exports generated types, validators, hash/identity helpers,
and semantic verifiers for the v10.3 calibration and admission contract family.
The schema index is authoritative; this document intentionally does not freeze
the changing list of calibration exports.

A schema-valid artifact is not automatically admitted evidence. Callers must
also run the matching semantic verifier where one exists, preserve the
content-addressed bindings, and obey the release eligibility rules documented
in the current calibration plan.

## Verdict and signal-strength API

- `VERDICTS`, `Verdict`, and `isDefaultOff()` define the closed calibration
  verdict taxonomy.
- `signalStrengthSchema` and `SignalStrengthEntry` validate the shipped signal
  table.

## Compatibility rules

- Additive artifact fields must be optional and have defaults.
- Removing or renaming a field, or changing required shape, requires a breaking
  schema-version decision and migration.
- Schema, generated types, runtime validators, index, and tests change in one
  reviewed unit.
- Do not import internal modules from another package. Import from
  `@usebrick/core` and treat [`src/index.ts`](../src/index.ts) as the TypeScript
  boundary.

See the root [roadmap](../../../ROADMAP.md) and [execution
ledger](../../../docs/execution/README.md) for current product and delivery
status.
