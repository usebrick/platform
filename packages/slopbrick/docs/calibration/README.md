# SlopBrick calibration

This directory contains the v10.3 calibration/admission implementation,
evidence, and historical plans. It is not the platform roadmap.

Current company sequencing lives in the root [roadmap](../../../../ROADMAP.md)
and [execution ledger](../../../../docs/execution/README.md). The current
SlopBrick release plan must link to the exact calibration decision/work item it
depends on instead of treating every file in this directory as active.

## Current truth (2026-07-17)

- Positive means **verified AI provenance**.
- Negative means **verified human provenance**.
- Code quality is a separate axis; “sloppy” does not prove AI and “good” does
  not prove human authorship.
- Recent or popular GitHub repositories are unknown/mixed by default, not
  labelled ground truth.
- v10.1's 576,750 analysed files are historical evidence only.
- The local v10.3 review/register has 452,382 registered or quarantined units
  and **zero admitted units**.
- A 10,000-unit HumanVSAI projection (5,000/5,000) is an input candidate, not
  an admitted or rights-cleared production corpus.
- No current v10.3 precision, recall, FPR, lift, or release-calibration claim is
  authorized.

This is a product-truth boundary, not a reason to stop work. Scanner
reliability, UX, self-scan disposition, source-method design, seed-corpus
construction, and vibecoder pilots can proceed in bounded parallel work.

## What counts as admission

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

The central execution plans should maintain these bounded milestones:

1. **Corpus method decision** — freeze label, rights, evidence, source-class,
   overlap, split, and publication semantics.
2. **Seed corpus** — admit and independently review a small balanced cohort
   before scaling.
3. **Smoke cohort** — produce a deterministic 100-positive/100-negative
   diagnostic bundle with complete accounting.
4. **Canary cohort** — scale only after smoke evidence passes.
5. **Metrics run** — compute denominator-aware per-rule metrics against an
   admitted cohort.
6. **Release decision** — promote/default-enable rules only after the release
   gates and human review pass.

Acquiring more public repositories can support discovery or an ecological
unknown/mixed cohort, but it cannot replace label evidence.

## Live technical references

- [`v10.3-corpus-source-admission-plan.md`](./v10.3-corpus-source-admission-plan.md)
  — detailed source/admission protocol.
- [`v0.45.0-continuation-plan.md`](./v0.45.0-continuation-plan.md) — detailed
  release continuation input; the central execution ledger decides its active
  status.
- [`v0.45.0-handoff.md`](./v0.45.0-handoff.md) — recent implementation handoff.
- [`v0.45.0-execution-evidence.md`](./v0.45.0-execution-evidence.md) — dated
  evidence, not evergreen status.
- [`artifact-classification.md`](./artifact-classification.md) — artifact
  authority distinctions.

Documents for v10.2 and older releases are historical reproduction context.
Do not run their absolute-path commands for a current release decision.

## Manifest-aware materialization

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

## Bounded smoke-input diagnostic

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

## Run control plane

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

Until an eligible cohort and metrics producer pass:

- keep unmeasured candidate rules default-off;
- expose historical point estimates as historical, with provenance unavailable
  where that is the truth;
- do not claim AI authorship from a score or finding;
- do not claim v0.45 is calibrated against v10.3;
- continue shipping reliability/UX work only through the normal release gates.

The goal is a smaller trustworthy corpus and rule surface before a larger one.
