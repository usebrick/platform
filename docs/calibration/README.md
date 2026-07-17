# Calibration documentation

This directory is the repository-level entry point for SlopBrick calibration.
It separates current scheduling from frozen protocols and collected evidence.

## Current authority

- The [product roadmap](../../ROADMAP.md) owns outcomes and sequencing.
- The [execution index](../execution/index.json) owns live corpus and
  calibration status, dependencies, and the next executable action.
- [Current status](../execution/STATUS.md) owns mutable counts and release
  readiness facts.
- Bounded current work lives under [`docs/execution/plans/`](../execution/plans/).

The current verified truth is that the v10.3 admission set contains **zero
admitted units**. The historical v10.1 scan of 576,750 files does not prove
current v10.3 corpus admission or candidate-rule calibration.

Corpus reconstruction is local executable work, not an external-authority
blocker. The scheduled sequence first decides and records the replacement corpus
contract, then builds a smaller source-attested v1 corpus with immutable bytes,
label provenance, license evidence, family-aware splits, leakage checks, and a
reproducible receipt. AI is the positive class and human is the negative class;
origin and code quality remain separate measurements.

## Frozen specifications and evidence

- [v10.3 corpus-source admission protocol](../../packages/slopbrick/docs/calibration/v10.3-corpus-source-admission-plan.md)
  — preserved protocol and engineering evidence; not live status authority.
- [v10.3 release-asset materialization protocol](../../packages/slopbrick/docs/calibration/v10.3-release-asset-materialization-plan.md)
  — preserved release-asset contract.
- [v0.45 continuation plan](../../packages/slopbrick/docs/calibration/v0.45.0-continuation-plan.md)
  — frozen historical execution narrative.
- [v0.45 execution evidence](../../packages/slopbrick/docs/calibration/v0.45.0-execution-evidence.md)
  — collected evidence, not a scheduler.
- [v0.45 handoff](../../packages/slopbrick/docs/calibration/v0.45.0-handoff.md)
  — historical context.
- [Package calibration README](../../packages/slopbrick/docs/calibration/README.md)
  — package-owned commands and workflow context.

[`v0.45-continuation.md`](./v0.45-continuation.md) is a compatibility entry
point while the stale-document archive is migrated. It must resolve readers to
the execution authority above; it is not independent calibration evidence.
