# AGENTS.md

> How AI agents should work with `@usebrick/core`.

Apply silently. Do not restate unless the user asks for project rules.

---

## What this package is

`@usebrick/core` is the private, workspace-only contract layer for repository
artifacts and calibration evidence. SlopBrick writes the current `.slopbrick/`
artifacts; the package is also the technical base for the planned MemoryBrick
substrate. Future product names do not imply shipped packages.

> Historical naming used “Repository Memory” and `memory.md`. The current
> agent-readable artifact is `.slopbrick/structure.md`, and the current artifact
> version is `STRUCTURE_SCHEMA_VERSION = '5'`.

## What this package is NOT

- Not independently published. It lives in this monorepo and changes with its
  consumers.
- Not the source of detection logic. slopbrick owns the rules; core owns the schema.
- Not permission to add undeclared fields. Persisted producers must match the
  schemas and validators.

## Project layout

| Path | Purpose |
|------|---------|
| `src/generated/` | TypeScript types generated from JSON Schemas |
| `src/structure-types.ts` | Schema version + cache-entry type; validators are re-exported |
| `src/validators.ts` | Runtime validators (`isInventoryFile`, etc.) |
| `src/structure.ts` | Path helpers + atomic write + loaders/savers + freshness check — was `memory.ts` in v0.14.5 |
| `src/verdicts.ts` | `Verdict` enum, `VERDICTS` constant, `isDefaultOff()` — the calibration taxonomy |
| `src/index.ts` | Public facade — re-exports for library consumers |
| `tests/structure-types.test.ts` | Validator unit tests |
| `tests/structure.test.ts` | Loader/saver/freshness integration tests |
| `schemas/v1/index.json` | Machine-readable schema inventory |
| `schemas/v1/*.schema.json` | Repository and calibration JSON Schemas |
| `scripts/codegen-types.ts` | JSON Schema → TypeScript codegen (v0.15.0) |

## Conventions for new schema fields

1. Add backward-compatible fields as **optional with defaults**.
2. Update the schema, generated types, validator, and contract tests together.
3. Update `schemas/v1/index.json` when adding a schema.
4. Bump `STRUCTURE_SCHEMA_VERSION` only for a breaking artifact change such
   as removing/renaming a field or changing required shape.
5. Never add a required field to an existing schema version.
6. Keep `.slopbrick/cache.json` internal. The canonical repository snapshots
   are three JSON files (`inventory`, `constitution`, `health`) plus the
   derived `structure.md`. A bounded legacy/local `structure.json` run log can
   also exist, but it does not implement `structure.schema.json`; that schema
   is the structured projection contract.

## Conventions for new I/O operations

1. **Pure functions preferred** — `loadInventory` is synchronous (it's a small JSON read). Async wrappers (`loadInventoryAsync`) belong in the consumer, not here.
2. **Atomic writes** — always go through `writeJsonAtomic()`. Don't write `.json` files directly.
3. **Null on missing/malformed/mismatched** — loaders return `null`, never throw. Callers (slopbrick) decide whether to rebuild or error.
4. **Tests must cover: missing file, malformed JSON, version mismatch, valid round-trip, validator edge cases.**

## Quality gates

```bash
corepack pnpm --filter @usebrick/core typecheck
corepack pnpm --filter @usebrick/core test:contract
corepack pnpm --filter @usebrick/core validate:schema
corepack pnpm --filter @usebrick/core build
```

- TypeScript is strict (`noUncheckedIndexedAccess: true`).
- All exports have explicit return types.
- **Keep runtime dependencies minimal and reviewed.** `zod` is currently used
  for the signal-strength contract; adding another dependency affects every
  workspace consumer.
- **Public API is a contract.** Classify compatibility before choosing a
  version bump; additive optional schema fields are not automatically major.
- **Schema codegen sync** — generated TypeScript peers live in
  `src/generated/` and are produced from `schemas/v1/*.json` by
  `scripts/codegen-types.ts`; `src/structure-types.ts` is the hand-maintained
  public validator/type surface. CI fails if generated peers drift. Run
  `pnpm codegen` after any schema change.

## Release status

`@usebrick/core` is private and is not published to npm. `slopbrick` and
`@usebrick/engine` are its current workspace consumers. If publication is
approved later, use the repository's reviewed GitHub Release/OIDC path; never
publish locally.

Current priorities and active work live in the root
[`ROADMAP.md`](../../ROADMAP.md) and [`docs/execution/`](../../docs/execution/).

## License

[MIT](../../LICENSE)
