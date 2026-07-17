# Calibration artifact classification

> **Historical classification snapshot.** The counts and authority table below
> describe the 2026-07-14 checkout and do not schedule current work. Use the
> platform [roadmap](../../../../ROADMAP.md), [execution index](../../../../docs/execution/index.json),
> [status](../../../../docs/execution/STATUS.md), and current [calibration
> index](./README.md). Retain the dated details as evidence.

**Snapshot:** 2026-07-14 · **Purpose:** reduction/reconciliation gate before
new calibration features

This is a classification record, not a release receipt. It prevents generated
contracts and historical evidence from being mistaken for active implementation
or calibration data.

## Authority at the snapshot date

| Role | Canonical file |
| --- | --- |
| Execution plan at the snapshot date | `v0.45.0-continuation-plan.md` |
| Current evidence ledger | `v0.45.0-execution-evidence.md` |
| Handoff/current override | `v0.45.0-handoff.md` |
| Root mirror | `../../../../docs/calibration/v0.45-continuation.md` |

The plan owns ordering and gates. The evidence file records append-only
verification. The handoff is an inventory plus a pointer to the plan; older
sections are explicitly marked historical/superseded.

## Intentional generated contract tranche

`packages/core/schemas/v1/` currently contains 81 schemas and
`packages/core/src/generated/` contains 81 exact stem peers. `index.json`
references all 81 schemas and every generated file carries the auto-generated
banner. 71 schema/peer pairs are untracked in the current dirty admission
tranche; they are intentional contract work, not disposable duplicates. Keep
each schema, generated peer, index entry, and its fixtures together at the
authorized clean boundary.

Schema fixtures currently contain 81 valid, 80 structural-invalid, and 43
semantic-invalid files. Missing semantic-invalid fixtures are intentional for
contracts whose semantic behavior is covered by runtime tests; specialized
checkout-map, failure, and observation fixtures follow their own contract
tests. A fixture is removable only after its schema/test owner is removed.

The tracked generated observation and health files remain a known dirty
codegen-freshness boundary. They must not be called clean release evidence
until the generated output is committed at an authorized clean boundary.

## Historical and research material

- `v10.2-plan.md` and `master-plan-v0.45.md` are superseded plans; retain as
  frozen historical context and do not use them as the current task ledger.
- `v10.3-corpus-source-admission-plan.md` and
  `v10.3-release-asset-materialization-plan.md` are frozen implementation
  specifications; their checkboxes are not progress evidence.
- `v0.45.0-gate0-evidence.md`, the scanner-hash design, and the ML/rule/literature
  documents are supporting evidence or research, not current authority.
- `src/rules/builtins.ts`, the rule catalog/language matrix, and the MCP
  registry block are generated pairs; regenerate them with their source and
  keep the outputs together. `website/src/data/product-facts.json` is likewise
  a prebuild output paired with its generator.
- `src/engine/corpus-baselines.json` remains a runtime input, but its embedded
  v6 corpus path/statistics are historical provenance debt. Keep behavior
  stable while tracking a future path-portability/admission-boundary decision;
  it is not v10.3 evidence. Research-only model files stay out of release
  authority.
- Ignored `.superpowers/sdd` reports and receipts are audit scratch/evidence;
  retain referenced reports and archive old material only with an explicit
  cleanup decision. They are not package/runtime artifacts.

No file was deleted or moved by this reduction pass. The next cleanup decision
is a separate, reviewable operation after the dirty branch has a clean-bound
receipt.
