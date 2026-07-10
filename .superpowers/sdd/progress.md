# SDD progress — SlopBrick packaged worker runtime and self-scan recovery

- Plan: `docs/superpowers/plans/2026-07-09-slopbrick-worker-runtime-and-self-scan.md`
- Base commit: `8086c3f1bc47148a47eb2df973118b6c96911570`
- Worktree note: existing v0.45 files are intentionally dirty and must not be staged by task agents.

| Task | Implementer | Review | Commit | Status |
| --- | --- | --- | --- | --- |
| 1 — packaged worker resolution | `worker_resolution_implementer` | APPROVE | `7927b94b9` | completed |
| 2 — bounded startup failure | `worker_lifecycle_implementer` | APPROVE after final broad re-review | `72c41eecc`, `fa70c0220`, `dc30bc346`, `95be71275`, `1a306d2ba` | completed |
| 3 — package artifact parity | `artifact_contract_implementer` | APPROVE after clean-checkout re-review | `0c9cded18` | completed |

## Scan discovery and release-gate recovery

- Plan: `docs/superpowers/plans/2026-07-09-scan-discovery-release-gates.md`
- Base commit: `4da128b20`
- Execution rule: reconcile the continuation plan, handoff, evidence report, and this ledger after verified implementation; never mark unchecked roadmap gates complete from intent alone.

| Task | Implementer | Review | Commit | Status |
| --- | --- | --- | --- | --- |
| 0 — source/ESM/CommonJS parity | `module_parity_implementer` | APPROVE | `e8b7a2d4f` | completed |
| 1 — config/monorepo discovery | `discovery_implementer` | APPROVE | `83e1d2894` | completed |
| 2 — empty/partial outcomes | `completion_outcome_implementer` | APPROVE | `160e149bc`, `9dbb02afe`, `e388b4a0a` | completed |
| 3 — authoritative CI outcome | `ci_gate_implementer` | APPROVE | `f94805af8`, `f5d87528c`, `0da9150f5` | completed |
| 4 — Dart rule contracts | `dart_contract_implementer` | APPROVE after metadata correction | `158ee8011`, `ea9c7c1d1` | completed |
| 5 — self-scan/evidence/plan reconciliation | `evidence_reconciler` | docs/evidence pass recorded; broader gates remain open | `v0.45.0-execution-evidence.md` | completed |

### Current verified blockers

- Full-suite verification is not green: the rerun exposed structural-clone
  performance at 2,748.9 ms against a 2,000 ms budget, calibration-db corpus
  discovery at 0 against more than 50 expected files, category-separation
  timeout at 60 seconds, and parser-kotlin setup blocked by the local native
  addon/install environment.
- Kotlin/parser setup remains an environment/store mismatch pending a frozen
  reinstall with the repo-pinned pnpm 9; no source defect is asserted yet.
- Both fresh self-scans are complete but exit 1 because `meanSlop` is 25 > 15;
  this is recorded evidence, not a release pass.
- Gate 0 cleanup, remaining score/CLI/MCP/core/engine contracts, v10.3 calibration/provenance,
  and site/operations/release gates remain open.

### Subsequent gate work (2026-07-09)

- Gate 0 containment evidence: `58b5a2202`, `0113440c7` (branch isolation,
  artifact hashes, dirty-tree classification, and explicit no-release decision).
- Gate 0 release train/scope decision recorded in the continuation plan and
  evidence: v0.44.0 trust restoration, no ML, and no public Dart/Ruby/PHP/C#
  claims until their gates pass. G0-04 cleanup remains open.
- SCORE-03 category separation: `0ed1fe300`; 41 focused metrics/category tests
  and package TypeScript validation pass. Full Gate 1 remains open.
- CORE-02 atomic artifact paths: `44db5737a`; core regression tests and
  TypeScript validation pass. Remaining schema/engine/MCP contracts remain open.
- CORE-03/04 schema parity and CI validation: `549d49af5`, tightened for
  RFC3339 year-zero parity in `116c0e621`; AJV fixtures, runtime validators,
  39 core tests, codegen, and direct tsup pass.
- CORE-01 cache namespace separation: `e28f636ee`; core freshness data now
  uses `.slopbrick/cache.json`, isolated from SlopBrick's root incremental
  cache. Core structure and SlopBrick structure tests pass.
- CORE-05/06 structure projection and schema delivery: `fce14364f` plus
  `a26b91a2a`; index/README/API now agree that structure JSON is canonical and
  Markdown is derived, with a backward-compatible type alias. Core 44/44,
  schema fixtures, codegen, and typecheck pass.
- SCORE-05 denominator correction: `7a81a4158` uses analyzed file count for
  score exposure and passes 38 metrics tests; explicit denominator metadata in
  all renderers remains open.
- ENGINE-01 pure boundary: `01aa7a7be` plus docs correction `fc91db6d9` expose
  pure `parseSource` and document filesystem adapters; engine 47/47, typecheck,
  and build pass.
- MCP workspace confinement: `eb7303272` plus TOCTOU correction `77077e31f`;
  MCP patterns 39/39 and slopbrick typecheck pass. Config/result parity and
  protocol-wide MCP contracts remain open.
- ENGINE-02 Louvain normalization and MCP config parity: `060714730`; engine
  48/48 and MCP server/pattern 41/41 pass, with independent approval. The
  shared commit contains exactly the two scoped workstreams.
- Gate 0 cleanup: `b3eed1836` aligns the candidate package/changelog to the
  selected unreleased v0.44.0 trust-restoration train and labels historical
  calibration paths as internal context; C# routing landed in `5e49764c8`.
- C# language routing independently approved: parser/discovery/rule tests 9/9
  across engine and SlopBrick, with package TypeScript validation passing.
- PKG-01/02 package contracts: `640e6124c` makes declarations self-contained
  for npm consumers; `e8b7a2d4f` restores ESM/CJS artifact parity. Pack-consumer
  tests 2/2, package tsc, dts build, and pack dry-run pass.
- Gate 3 chunk accounting: `ce6fb90b3` plus `954ce523a` preserve skipped-chunk
  metadata and reject malformed reports before aggregation. Focused merge,
  calibrator, and UX tests pass (44 total); calibration provenance remains open.
- CLI brief UX: `6fbfa2b11` plus `f45ea9af5` replace the nonexistent `--full`
  hint with the actionable “rerun without --brief” guidance; 41 UX tests and
  package TypeScript validation pass. The full flag/command audit remains open.
- The continuation ledger now records previously reviewed CLI-00/01/05/06,
  CORE-07/08, and Dart contract gates as complete with their evidence commits;
  CLI-03/04, MCP protocol schemas, score invariants, language matrix, and
  release/calibration/site gates remain open.
- Score evidence: `622814466` deduplicates fired rule IDs before Bayesian/LR
  combination; engine 52/52 plus SlopBrick LR/guardrail 30/30 pass. Full
  public score semantics and renderer parity remain open.
- CLI-03 filter parity: `043a0dc35` forwards include/exclude/rule filters to
  workerData; scan-completion 12/12, typecheck, and build pass with independent
  approval. CLI-04 smoke coverage remains open.
- Kotlin native parser environment was repaired by compiling the pinned
  `tree-sitter-kotlin` addon for Node 24; parser-kotlin tests now pass (5/5).
- Post-schema SlopBrick compatibility: invalid synthetic fingerprints were
  corrected in `818207d18`; structure tests pass (37/37). Focused score,
  parser, structural-clone, category-separation, and structure verification
  totals 99 tests passing. DB calibration still cannot run to completion from
  the current external corpus/cache state.

### Recovery tranche evidence (2026-07-09)

- Package-source self-scan: 328 requested, 328 analyzed, 0 failed, 0 skipped;
  exit 1 on `meanSlop`; AI slop 25, hygiene 99.9006, security 100,
  repository health 75.
- Repository self-scan: 388 requested, 388 analyzed, 0 failed, 0 skipped;
  exit 1 on `meanSlop`; AI slop 25, hygiene 99.7989, security 83.3333,
  repository health 75.
- Focused recovery verification: `tsc` and `tsup` passed; six focused test
  files passed with 38 tests; Dart guardrail/contracts subset passed with 17
  tests. Full-suite and broader Gate 0–6 evidence remain open.
- Post-reconciliation Dart metadata follow-up `ea9c7c1d1`: four files and 19
  tests passed, correcting `aiSpecific` drift. The subsequent full-suite run
  exposed the blockers listed above and was stopped; it is not green evidence.
