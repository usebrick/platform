# Impact Assessment — SlopBrick evidence-led first scan

## Target

Add optional `ProjectReport.firstScan` and thread it through the existing SlopBrick report finalization, durable debt baseline, default pretty output, JSON, and SARIF boundaries. The proposal is specified in `docs/superpowers/plans/2026-07-18-slopbrick-first-scan-experience.md`.

## Dependents (66 TypeScript files)

The target is a shared report API, so the blast radius is broader than the five new modules:

| Surface | Files containing the symbol | Direct consumers |
| --- | ---: | --- |
| `ProjectReport` | 63 | scan assembly/finalization, threshold/report readers, engine structure/telemetry, fixers, every renderer, and report/CLI tests |
| `formatPretty` | 16 | `renderOutput`, threshold report conversion, health/score goldens, finding-context, lane, score-message, offender, UX, and parity tests |
| `DebtBaseline` | 6 | init, scan program baseline writes, finalization, baseline I/O, public baseline types, and new-debt tests |
| `formatJson` | 14 | report command, patterns, output dispatch, health/completion/golden/parity tests, and report JSON contracts |
| `formatSarif` | 8 | output dispatch, health/score/golden/parity tests, renderer contract, and SARIF tests |
| `finalizeReport` | 4 | scan orchestration, final report persistence, pretty-report typing, and CLI integration tests |

The highest-risk fan-out is the optional public report type plus default terminal behavior. The baseline extension is lower fan-in but persistence-sensitive because existing revision-1 files must continue to load and `ci --max-new-issues` must remain fail-closed.

## Affected Stories

No `specs/release-plan.yaml` exists. The declared execution authority maps the impact as follows:

- `SB-UX-001` — direct owner: five areas, evidence labels, one headline, three actions, and scan-to-rescan delta.
- `TEL-001` — downstream consumer: will model the typed finding/action/change boundary after SB-UX lands; this slice emits no telemetry.
- `LOCK-001` — downstream dependency: relies on stable new-debt semantics; identity and fail-closed baseline behavior must not regress.
- `VAL-001` — acceptance input and gate: RUN-001 supplies the useful/no-safe-repair/unchanged red state, and a real owner comprehension check closes the UX story.
- `SB-045` — completed trust boundary: unified gate decisions, finding-bound fixes, and durable baseline semantics must remain unchanged.
- `REL-001` — unaffected authority boundary: implementation, merge, or push does not authorize npm release or website deployment.

## Test Coverage

### Existing coverage to preserve

- `tests/cli/new-debt-gate.test.ts` — stable finding identity, suppressed exclusion, missing baseline, real pipeline gate.
- `tests/cli/scan-completion.test.ts` — complete, incomplete, empty, score-free invalid output, and CLI option interaction.
- `tests/cli/output-ux.test.ts` — no-color, redirected JSON, narrow rule descriptions, and stream behavior.
- `tests/report/renderer-contract.test.ts` — cross-format score validity, evidence, accounting, and gate parity.
- `tests/report/renderer-lanes.test.ts` — legacy AI/engineering lane compatibility.
- `tests/report/json.test.ts` — score precision, not-applicable envelope, and score-contract metadata.
- `tests/report/sarif.test.ts` — SARIF rules/results, source regions, evidence, and stable fingerprints.
- `tests/report/whole-project-parity.test.ts` — human/machine finding-set and score parity.
- `tests/report/v0.14.5i-ux.test.ts` — detailed report ordering, bounded repeated findings, and full/brief behavior.

### New coverage required before implementation

- `tests/report/first-scan.test.ts` — all-category mapping, evidence/action classification, conservative grouping/ranking, validity, owner-state snapshots, width, no-color, and semantic heading order.
- `tests/cli/first-scan-pipeline.test.ts` — real report attachment, revision-1/2 baselines, unchanged/new/resolved, config mismatch, and byte/mtime proof against auto-refresh.
- Additive JSON/SARIF assertions — score-free invalid projections, driver summary, per-result metadata, default-off exclusion, and unchanged SARIF fingerprints.
- Real package-local CLI fixture — compact default, `--full`, explicit baseline, unchanged rescan, machine formats, and incomplete output.

### Known gaps intentionally outside this slice

- No hosted/dashboard rendering.
- No telemetry outcome event; `TEL-001` follows the typed boundary.
- No new repair implementation; existing apply-time SHA verification remains authoritative.
- No current v10.3 calibration admission; evidence labels cannot claim it.

## Risk: High

The change touches a shared public interface and default report path with more than ten callers, plus a persisted baseline used by CI. Risk is controlled by making the report field optional, preserving legacy fallback behavior, freezing identity bytes, accepting revision-1 baselines, adding only machine-format fields, and gating completion on the full one-worker matrix and owner comprehension.

## Recommended action

Proceed test-first in the frozen task order. Enter `SB-UX-001` into WIP before code; land the pure projection and identity boundary first; extend baseline comparison without automatic writes; attach it to real scans; then change human and machine presentation. Do not close the story until focused/package/recursive gates, the mandated self-scan, baseline non-mutation proof, and the owner comprehension checkpoint all pass.
