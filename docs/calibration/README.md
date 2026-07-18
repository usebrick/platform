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

Corpus v1 currently uses the pinned Mendeley `HumanVSAI_CodeDataset` v1 for
publisher-attested internal origin analysis and calibration evaluation. Its
5,000 AI / 5,000 Human labels are publisher claims bound to exact local bytes,
family-safe splits, and collision checks; they are not witnessed authorship or
quality labels. The source is not approved for public redistribution, and its
use does not admit v10.3 data or activate a rule.

The historical v10.1 scan of 576,750 files is not current v10.3 evidence, and
the v10.3 admission set still contains **zero admitted units**. That does not
block the reviewed Mendeley use. Keep these decisions separate:

```text
source permitted use != v10.3 gold admission
source permitted use != redistribution approval
source permitted use != usefulness review
source permitted use != rule application
```

[`CORPUS-002`](../execution/plans/CORPUS-002-source-use-routing.md) owns the
deterministic source router. [`VAL-001`](../execution/plans/VAL-001-owner-validation.md)
owns real repository-owner usefulness walkthroughs. The owner is the only
current product tester; no participant recruitment or fixed pilot gate is
active.

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
