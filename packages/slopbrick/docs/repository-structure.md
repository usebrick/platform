# The `.slopbrick/` repository artifact contract

SlopBrick can persist a repository-owned summary after a scan. The canonical
snapshot surface is **three JSON artifacts plus one derived Markdown
artifact**:

```text
<project-root>/.slopbrick/
├── inventory.json
├── constitution.json
├── health.json
└── structure.md
```

A bounded legacy/local `.slopbrick/structure.json` run-history log may also be
present. It is not a fourth canonical snapshot and does not implement core's
`structure.schema.json`; that schema defines a structured JSON projection,
while SlopBrick's agent-facing projection is the Markdown `structure.md`.

These artifacts are the first implementation layer of the planned repository-
intelligence capability. SlopBrick is the current producer and scanner/front
door; future Memory and Lock work must build on this contract rather than
create a second repository-memory format. Generated context remains a
projection: approved local policy and cited repository sources are authoritative.

## What each artifact means

### `inventory.json`: observed repository reality

Schema: [`inventory.schema.json`](../../core/schemas/v1/inventory.schema.json)

The inventory records scan identity/accounting, detected implementation
patterns, and component fingerprints. It is generated from code and should not
be hand-edited into policy.

### `constitution.json`: declared repository intent

Schema:
[`constitution.schema.json`](../../core/schemas/v1/constitution.schema.json)

The constitution is the machine-readable projection of declared canonical
choices and forbidden dependencies from `slopbrick.config.mjs`. It answers
what the repository intends, while the inventory answers what the scanner
observed.

### `health.json`: current scan health

Schema: [`health.schema.json`](../../core/schemas/v1/health.schema.json)

The health snapshot carries issue counts, scan/accounting status, and the four
headline scores when applicable:

- `aiSlopScore` — lower is cleaner;
- `engineeringHygiene` — higher is better;
- `security` — higher is better;
- `repositoryHealth` — higher is better.

Check `completionStatus` and `scoreValidity` before consuming numbers. Only a
valid complete scan is safe for CI gating. A partial artifact can retain
diagnostic/compatibility numerics but must not be treated as complete-project
evidence. Empty or not-applicable reports do not establish score-bearing
release evidence.

### `structure.md`: agent-readable projection

Renderer:
[`renderStructureMarkdown()`](../src/engine/structure-md.ts)

`structure.md` renders the inventory and constitution into concise Markdown:
detected patterns, canonical components, declared policy, and the do-not-create
list. It is presentation, not the authoritative structured store.

The bundled `slop_suggest_with_structure` MCP tool can read this artifact as a
fast path and fall back to a scan when it is missing. Other AI clients do not
automatically discover the file; configure the MCP server or reference it from
that client's repository instructions.

## Writing behavior

Repository artifact persistence is controlled by
`slopbrick.config.mjs#projectMemory` and is enabled unless explicitly set to
`false`.

The scan pipeline derives and writes, in order:

1. `inventory.json`;
2. `constitution.json`;
3. `structure.md`;
4. `health.json`.

Core JSON savers use temp-file-plus-rename writes. The Markdown renderer has a
separate writer; do not claim that all four files form a transactional snapshot
or that every filesystem gives identical crash guarantees.

Artifact-persistence failure is isolated from the completed scan report and is
reported as a warning. Consumers must therefore handle missing or stale files,
not assume that a successful scan exit proves every optional artifact write.

## Reading behavior

Workspace packages read the JSON artifacts through `@usebrick/core`:

```ts
import {
  loadConstitution,
  loadHealth,
  loadInventory,
} from '@usebrick/core';

const inventory = loadInventory(workspace);
const constitution = loadConstitution(workspace);
const health = loadHealth(workspace);
```

Each loader returns `null` for a missing, malformed, or version-mismatched
file. That is the graceful-degradation contract.

`structure.md` is not exposed through a public `slopbrick/internals` import.
Use the supported CLI/MCP surfaces:

```bash
slopbrick memory --workspace <path>
slopbrick memory --workspace <path> --regenerate
slopbrick mcp
```

The command is currently named `memory`; the artifact is `structure.md`.
Documentation must reflect that runtime reality until a separately reviewed
command rename ships.

## Caches are not public artifacts

Do not confuse the public artifacts with implementation caches:

- `.slopbrick/cache.json` is the core freshness cache;
- `.slopbrick-cache.json` is SlopBrick's root-level incremental-scan cache;
- `.slopbrick/cache/` can also contain internal parser/registry data.

All are disposable implementation details with shapes separate from the public
schemas.

## Local history is separate

- `.slopbrick/structure.json` is the bounded legacy/local run-history log and
  follows `projectMemory`.
- `.slopbrick/flywheel/scans.jsonl` is the richer telemetry/flywheel history
  used by trend and drift features and follows `telemetry` / `--no-telemetry`.

Neither is the `structure.schema.json` projection, and neither should be
presented as a canonical repository snapshot.

## Versioning

The current repository artifact version is
`STRUCTURE_SCHEMA_VERSION = '5'`.

- Additive fields must be optional and have defaults.
- Removing/renaming a field or changing required shape is breaking and needs a
  version/migration decision.
- Schema, generated types, validators, and tests change together.
- [`packages/core/schemas/v1/index.json`](../../core/schemas/v1/index.json) is
  the schema inventory.

## Relationship to product roadmap

Today:

- SlopBrick writes and uses these artifacts.
- MCP exposes repository-aware suggestions and checks.
- current CLI/pre-commit/CI commands provide early prevention primitives.

Current unreleased candidate:

- the private Memory M0 proves only four declared facts and bounded previews;
- `ci --lock-new-debt` applies reviewed repository `allowedImports` policy to
  exact new import findings, with owned expiring waivers and fail-closed scan
  semantics; and
- one strict `mend.importRewrites` entry can repair that exact finding through
  a parser-owned exact-span plan shared by config-aware preview/apply paths,
  staged atomic publication, failed-staging no-mutation, clean rescan, no-op
  replay, and byte-identical internal rollback. Revision 81 accepts and closes
  the Revision 80 corrected local proof as MEND 1.

Planned:

- broader Memory provenance, freshness, scoped context, and agent adapters;
- additional Mend repairs only under a separate plan and owner authorization,
  with each new family proving trusted, deterministic, reversible behavior.

The accepted [`MEM-001` M0 ADR](../../../docs/decisions/memorybrick-m0.md)
keeps this artifact contract unchanged. Revision 68's focused
[requirement-to-test contract](../../../docs/decisions/memorybrick-m0-acceptance.md)
is the sole active behavioral authority; pinned
[registry v2](../../../docs/decisions/memorybrick-m0-registry-v2.json) and the
exact [benchmark vector
v2](../../../docs/decisions/memorybrick-m0-benchmark-vector-v2.json) remain
fixed test data. M0 accepts trusted internal registrations containing untrusted
root/package JSON bytes, compiles four declared fact families, returns frozen
in-memory values, and warns when previews may omit facts. It defines no public
hostile-host-object contract, static-module parser, filesystem discovery, live
client/provider, credential, persistence, retention, or deletion concern. The
numeric reviewer-score gate is retired; Revision 69 locally qualifies the
private Slice A profile/parser implementation, Revision 70 authorized private
Slice B compiler/projection work, Revision 71 records that slice's green local
receipt, Revision 72 authorized Slice C, and Revision 73 records the complete
private M0 local receipt. Revision 74 records one owner-authorized local
checkpoint commit; all three slices remain unshipped.
Any filesystem adapter, source parser, durable store, or live experiment needs
separate authority.

See the root [roadmap](../../../ROADMAP.md) and [execution
ledger](../../../docs/execution/README.md) for actual milestone status.
