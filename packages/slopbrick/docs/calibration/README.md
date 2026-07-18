# SlopBrick calibration

This directory contains Corpus v1, CAL-001, v10.3 calibration/admission
implementation, evidence, and historical plans. It is not the platform
roadmap.

Current company sequencing lives in the root [roadmap](../../../../ROADMAP.md)
and [execution ledger](../../../../docs/execution/README.md). The current
SlopBrick release plan must link to the exact calibration decision/work item it
depends on instead of treating every file in this directory as active.

## Current truth (2026-07-18)

Corpus v1 currently uses the pinned Mendeley `HumanVSAI_CodeDataset` v1 for
publisher-attested internal origin analysis and calibration evaluation. Its
5,000 AI / 5,000 Human labels are publisher claims bound to exact local bytes,
family-safe splits, and collision checks; they are not witnessed authorship or
quality labels. The source is not approved for public redistribution, and its
use does not admit v10.3 data or activate a rule.

- Code quality is a separate axis; “sloppy” does not prove AI and “good” does
  not prove human authorship.
- Recent or popular repositories are `unknown` by default, not labeled ground
  truth.
- v10.1's 576,750 analyzed files are historical evidence only.
- The local v10.3 review/register has 452,382 registered or quarantined units
  and **zero admitted units**.
- CAL-001 completed the 10,000-row evaluation and recorded all 119 decisions
  with `applied: false` and `admitted: false`.
- The repository owner is the only current product tester. VAL-001 is owner-
  only; GTM-001 is parked with zero sessions and no recruitment authorization.

```text
source permitted use != v10.3 gold admission
source permitted use != redistribution approval
source permitted use != usefulness review
source permitted use != rule application
```

### Reviewed source dispositions

| Source | Authority | Integrity | Rights | Current executable use |
| --- | --- | --- | --- | --- |
| Mendeley HumanVSAI v1 | `publisher_attested` | `verified` | `internal_analysis` | origin measurement, calibration evaluation |
| FormAI v1 bounded projection | `repo_self_attested` | `pending` | `internal_analysis` | none |
| OSSForge HumanVsAICode | `publisher_attested` | `pending` | `reference_only` | none |
| Controlled HumanEval GPT-5 | `witnessed` | `pending` | `reference_only` | none |

## What counts as admission

This section governs a v10.3 gold/production admission claim. It does not
revoke a source's narrower permitted internal use.

A file becomes an eligible calibration unit only after the approved process
binds at least:

1. source and immutable revision/materialization;
2. label evidence and label method;
3. rights/licensing and redistribution/use constraints;
4. normalized code-unit identity;
5. privacy/secret handling;
6. exact and near-overlap accounting;
7. family/pair/cluster-safe split assignment;
8. independent review/adjudication where required;
9. complete denominator and failure accounting;
10. the versioned manifest, checkout, tool, and run identities.

Schema validation alone is insufficient. A registered, downloaded, scanned,
or quarantined file is not automatically represented or eligible.

## Current execution sequence

The central execution plans maintain these bounded milestones:

1. **Completed CORPUS-002 source routing** — derive permitted use from
   authority, integrity, and rights; unknown or manually widened dispositions
   fail closed.
2. **Artifact preservation** — reproduce candidate, leakage, source-binding,
   smoke, eligible, holdout, and decision-matrix hashes exactly.
3. **Completed CAL-001 evaluation** — retain origin metrics and decisions with
   `applied: false` and `admitted: false`.
4. **VAL-001 owner validation** — record only real owner-run usefulness,
   fix, and rescan receipts, with no target count.
5. **Future source adapters** — add one bounded adapter and evidence review per
   source; pending registry rows do not authorize acquisition or execution.
6. **Release/rule decisions** — require separate owner authorization and normal
   gates; source labels never activate a rule by implication.

## Current and historical technical references

- [`CORPUS-002`](../../../../docs/execution/plans/CORPUS-002-source-use-routing.md)
  — completed deterministic source-use routing contract.
- [`VAL-001`](../../../../docs/execution/plans/VAL-001-owner-validation.md) —
  owner-only usefulness validation contract.
- [`v10.3-corpus-source-admission-plan.md`](./v10.3-corpus-source-admission-plan.md)
  — historical detailed source/admission protocol, not a Corpus v1 prerequisite.
- [`v0.45.0-continuation-plan.md`](./v0.45.0-continuation-plan.md) — superseded
  scheduling record retained as implementation history.
- [`v0.45.0-handoff.md`](./v0.45.0-handoff.md) — historical implementation handoff.
- [`v0.45.0-execution-evidence.md`](./v0.45.0-execution-evidence.md) — dated
  evidence, not evergreen status.
- [`artifact-classification.md`](./artifact-classification.md) — artifact
  authority distinctions.

Documents for v10.2 and older releases are historical reproduction context.
Do not run their absolute-path commands for a current release decision.

## Historical v10.3 manifest-aware materialization

The release-source boundary validates a manifest and checksum-pinned
materialization before it writes a local checkout map:

```bash
corepack pnpm --filter slopbrick run cal:materialize -- \
  --manifest <corpus-manifest.json> \
  --expected-manifest-sha256 <64-lowercase-hex> \
  --run-id <id> \
  --cache <absolute-local-directory> \
  --out <new-checkout-map.json> \
  --network deny
```

This does not label, admit, train, calibrate, or publish anything. The checkout
map is local-only; canonical artifacts bind its hash rather than publishing
machine-specific paths.

## Historical v10.3 bounded smoke-input diagnostic

After the approved owner/reviewer inputs exist, build the diagnostic smoke
input through the explicit manifest boundary:

```bash
corepack pnpm --filter slopbrick run cal:admission:smoke-input -- \
  --root <project-root> \
  --manifest <root-relative-smoke-input-manifest.json>
```

The output remains `diagnosticOnly=true`, `authorityEligible=false`, and
`ready=false`. Success proves deterministic input construction, not corpus
admission or release authorization.

## Historical v10.3 run control plane

For an eligible manifest generation, the local sequence is selection,
no-clobber initialization, scan, verification, and report:

```bash
corepack pnpm --filter slopbrick run cal:select -- \
  --manifest <corpus-manifest.json> \
  --expected-manifest-sha256 <64-lowercase-hex> \
  --seed <frozen-seed> \
  --out <new-run-directory>

corepack pnpm --filter slopbrick run cal:init -- \
  --run <run-directory> \
  --draft <run-manifest-draft.json> \
  --checkout-map <checkout-map.json> \
  --registry <registry.json> \
  --signal-table <signal-table.json> \
  --config <calibration-config.json>

corepack pnpm --filter slopbrick run cal:scan -- \
  --run <run-directory> \
  --checkout-map <checkout-map.json> \
  --registry <registry.json> \
  --signal-table <signal-table.json> \
  --config <calibration-config.json>

corepack pnpm --filter slopbrick run cal:verify -- \
  --run <run-directory> \
  --checkout-map <checkout-map.json> \
  --registry <registry.json> \
  --signal-table <signal-table.json> \
  --config <calibration-config.json>

corepack pnpm --filter slopbrick run cal:report -- \
  --run <run-directory> \
  --checkout-map <checkout-map.json> \
  --registry <registry.json> \
  --signal-table <signal-table.json> \
  --config <calibration-config.json>
```

Each stage must preserve no-clobber, checksum, accounting, and path-free
canonical output guarantees. Diagnostic/unavailable report receipts must not
be rewritten as numeric metrics.

## Release interpretation

The current Mendeley cohort and CAL-001 metrics path have passed their bounded
internal checks. That does not activate rules or authorize release:

- keep unmeasured candidate rules default-off;
- expose historical point estimates as historical, with provenance unavailable
  where that is the truth;
- do not claim AI authorship from a score or finding;
- do not claim v0.45 is calibrated against v10.3;
- keep CAL-001 decisions unapplied until explicit owner usefulness review;
- continue shipping reliability/UX work only through the normal release gates.

The goal is a smaller trustworthy corpus and rule surface before a larger one.
