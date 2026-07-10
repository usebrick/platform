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
- CLI advertised-flag tranche: `40b2de70f` normalizes Commander option keys for
  `--threads`, `--diff`, `--refresh-snippets`, `--security-only`, `--full`,
  `--verbose`, and `--no-color`; adds security-only worker coverage and full-over-
  brief behavior. Typecheck and scan-completion 13/13 pass; CI/diff/UX focused
  suite 63/63 pass. Built-binary smoke covered JSON, security-only, verbose,
  full+brief, and watch SIGINT. The complete subprocess flag/command audit is
  still open; scan-side security/default-off changes are now included in the
  score tranche commits.
- CLI invalid-config smoke: `d268d629b` wraps config import/syntax failures in
  `ConfigValidationError`, restoring documented exit code 2 and actionable file
  context. Scan-completion suite is now 14/14; built-binary malformed-config
  smoke confirms the error path.
- Packaged CLI display/performance smoke: `f612ba0a0` proves subprocess
  normalization for `--threads`, `--verbose`, `--brief --full`, and
  `--no-color`; scan-completion is now 15/15.
- Refresh-snippets forwarding: `27dd71568` passes the opt-in flag as an
  explicit persistence input (the previous finalize call dropped it) and adds
  an initialized-AGENTS packaged subprocess regression; scan-completion is
  now 16/16.
- Output/telemetry subprocess smoke: `380ca1701` covers `--json <path>`,
  `--html <path>`, and `--no-telemetry` (no flywheel telemetry file); the
  scan-completion suite is now 17/17.
- Score provenance tranche: `9e1bf8d97` adds optional `scoreBasis` through
  report, health, JSON, Markdown, SARIF, MCP, and engine persistence; focused
  metrics/scan/SARIF/structure/core checks pass. `b0c169701` applies the same
  effective finding set before scoring and uses analysed files as the exposure
  denominator. Full public score and golden renderer parity remain open.
- HTML score provenance follow-up `fbc6da3dd` adds `scoreBasis` to the HTML
  report and passes its 12-test focused suite.
- Website truth follow-up `1f0d80ee9` replaces the stale 503-rule and ~150 kB
  claims with the published v0.43.0 facts (103 rules; downloaded tarball
  1,130,295 bytes). Full route/accessibility/deployment verification remains
  open.
- Documentation truth follow-up `7d3b102c6` updates root/package release status
  to published v0.43.0 versus unreleased v0.44.0, removes remaining hard-coded
  local calibration paths, and replaces the stale 24-category tree claim.
- Website interaction follow-up `597ffa422` fixes the live-terminal
  `structure.json`/`structure.md` mismatch and replaces timing-only assertions
  with command-completion state. Astro build/typecheck, 35 unit tests, and all
  9 Playwright/axe tests pass locally.
- CLI contract closeout: `27dd71568`, `380ca1701`, `ebcdd8865`, and
  `2c46c2466` complete refresh/output/no-telemetry/source-help/CI-forwarding
  coverage; `scan-completion` is 17/17 and CI threshold tests are 12/12. The
  remaining CLI gap is a dedicated source/CJS/ESM/tarball parity matrix.
- Follow-up test reconciliation: `2c46c2466` and `b5c94065b` align CI and
  integration fixtures with the raw AI-slop threshold and effective-file
  denominator. Focused pool, structural-clone, watch, category-separation,
  CLI-threshold, and CI suites pass in isolation; the concurrent all-suite run
  hit resource/timing limits (notably calibration workers), so it is not green
  evidence and must not be represented as such.
- Calibration path portability: `021fc7af7` removes the shared runtime's
  machine-specific corpus fallback in favor of `SLOPBRICK_CORPUS_DIR` or a
  repository-local `corpus/` directory; custom-path calibration remains green.
- Calibration stale-output hardening `73dc5238d` prevents prior chunk JSON from
  being reused after timeout/crash and records malformed reports as skipped
  errors; calibrator/merge focused tests pass 15/15.
- CLI command smoke closeout: packaged-worker (4/4) and pack-consumer (2/2)
  contracts plus CLI/CI/watch/MCP/config smoke are green; CLI-04 is now marked
  complete in the continuation ledger. The all-suite run itself remains
  non-green under concurrent calibration-resource load.
- SCORE-05 denominator gate is now complete in the ledger: analysed-file
  exposure and `scoreBasis` provenance are present in every listed renderer,
  including HTML via `fbc6da3dd`; SCORE-01/02 public semantics and golden
  renderer parity remain open.
- Full `tests/cli.test.ts` rerun after the raw-threshold fixture corrections:
  62/62 pass. This closes the previously stale empty-health and hygiene-only
  threshold expectations without claiming the concurrent all-suite run green.
- Public performance-claim cleanup `00610bbf4` removes the unsupported fixed
  100–1000× speed-up statement from root/package READMEs and points readers to
  repository-specific measurement.
- Website documentation cleanup `c037eb42e` removes stale Lenis/GSAP claims
  from the root package map; the actual site uses native browser APIs plus its
  WebGL shader.
- Fresh packaged self-scan after rebuilding `dist` (2026-07-10): 328 requested,
  328 analysed, 0 parse failures, exit 0; AI Slop 6.9267, Engineering Hygiene
  99.5793, Security 100, Repository Health 95.7. JSON includes `scoreBasis`
  (denominator 328, effective issue set, 195 suppressed issues) and stderr is
  clean. This is UX evidence, not calibration or release evidence.
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
- MCP response contract: `fa4ea80e1` restores `compositeScore` fields promised
  by `slop_scan_file`; full MCP suite 62/62 passes. Dart visitor routing:
  `894ef1670` adds Aqueduct/Conduit `router.route` coverage with approval.
- SCORE-04 directionality: `1daa779bc` inverts raw aiSlopScore before
  repository-health aggregation; `28b3f8ae7` aligns JSON/MCP briefs. Focused
  score, maintenance, MCP, and report tests pass; independent review approved.
- Website version truth is aligned to published npm `0.43.0`; local `0.44.0`
  remains unreleased. The live-terminal change was included in the concurrent
  score commit and is pending a source-level website review.
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

- Score-direction follow-up `1d04106fa` clarifies raw AI Slop semantics in
  telemetry and terminal briefs (`lower is better`); score/maintenance/report/
  MCP focused tests pass 48/48 with package TypeScript validation.
- MCP transport follow-up `ad5536dd4` flushes pending asynchronous JSON-RPC
  responses before server completion; server/pattern/suggest tests pass 53/53.
  CLI↔MCP golden parity remains open.
- Generated language matrix `9354344cb` records extension, parser path, rules,
  defaults, fixtures, and calibration eligibility; deterministic `--check`
  passes. Experimental languages remain default-off and release-ineligible.
- CLI filter surface follow-up `7635d2678` adds repeatable
  `--include-rule`/`--exclude-rule` options and normalizes scan/watch callback
  typing; CLI-03 is now backed by both option and worker-propagation commits.
- MCP documentation follow-up `0d89b3abf` reconciles the guide with the seven
  canonical tools, current request/response fields, removed legacy tools, and
  structure.md terminology; automated registry drift generation remains open.
- Architecture-doc truth note `ea9c13528` labels the long historical design
  record and points current work to the v0.44 continuation plan, seven-tool MCP
  guide, support matrix, and actual website implementation.
- Calibration controls tranche `d126df6f8` exposes bounded chunk timeout and
  repeatable rule filters, routes parserless language extensions, and reports
  skipped chunks in Markdown. Calibration evidence remains diagnostic until
  provenance and coverage gates pass.
