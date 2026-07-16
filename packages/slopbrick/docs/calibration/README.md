# Calibration

> **Current execution guide:** [`v0.45.0-continuation-plan.md`](./v0.45.0-continuation-plan.md). The absolute-path corpus/file-list commands below describe the historical v10.2 workflow and must not be used for release decisions. v10.3 replaces them with a provenance-backed manifest, complete file accounting, and denominator-aware metrics; admission and calibration remain gated.

The v10.3 release-source boundary is available through the manifest-aware
`cal:materialize` command. It only emits a local checkout map after validating
the manifest, checksum-pinned archive, root prefix, and every declared file:

```bash
slopbrick cal:materialize \
  --manifest <corpus-manifest.json> \
  --expected-manifest-sha256 <64-lowercase-hex> \
  --run-id <id> \
  --cache <absolute-directory> \
  --out <new-checkout-map.json> \
  --network deny
```

This command does not admit corpus files, train a model, or publish a release.

### Bounded smoke-input diagnostic

When the owner-supplied v10.3 authority bundle is available, the bounded
100-positive/100-negative smoke input can be materialized through the explicit
manifest boundary. The command reads only the canonical, root-relative paths
named by the manifest; it does not discover repositories, infer labels, pull
network data, or promote authority:

```bash
corepack pnpm --filter slopbrick run cal:admission:smoke-input \
  --root <project-root> \
  --manifest <root-relative-smoke-input-manifest.json>
```

The package-local alias runs the built admission entrypoint; use it after the
package has been built. The generic entrypoint is equivalent when the command
name must be explicit:

```bash
corepack pnpm --filter slopbrick run cal:admission \
  admission:smoke-input \
  --root <project-root> \
  --manifest <root-relative-smoke-input-manifest.json>
```

The output is always diagnostic-only (`diagnosticOnly=true`,
`authorityEligible=false`, `ready=false`). A successful result is therefore an
input-generation bundle for review and downstream gates, not an admission
manifest or calibration/release authorization. Missing, non-canonical,
root-escaping, incomplete, or graph-inconsistent inputs exit with code `2`
before the output directory is changed. The manifest must contain exactly two
source entries, the canonical admission record/overlap streams, the normalizer
registry, and complete source-generation semantic graphs including independent
review approval bytes.

For a legacy v10.3.0/v10.3.1 manifest, the next local control-plane steps
are selection, no-clobber run initialization, scanning, and verification. Every
input is checksum-pinned; admission-backed v10.3.2 sources remain reserved
until the provenance authority is complete:

```bash
slopbrick cal:select \
  --manifest <corpus-manifest.json> \
  --expected-manifest-sha256 <64-lowercase-hex> \
  --seed <frozen-seed> --out <new-run-directory>
slopbrick cal:init \
  --run <run-directory> --draft <run-manifest-draft.json> \
  --checkout-map <checkout-map.json> \
  --registry <registry.json> --signal-table <signal-table.json> \
  --config <calibration-config.json>
slopbrick cal:scan --run <run-directory> --checkout-map <checkout-map.json> \
  --registry <registry.json> --signal-table <signal-table.json> \
  --config <calibration-config.json>
slopbrick cal:verify --run <run-directory> --checkout-map <checkout-map.json> \
  --registry <registry.json> --signal-table <signal-table.json> \
  --config <calibration-config.json>
slopbrick cal:report --run <run-directory> --checkout-map <checkout-map.json> \
  --registry <registry.json> --signal-table <signal-table.json> \
  --config <calibration-config.json>
```

`cal:init` writes a path-free `run-manifest.json` and refuses to overwrite an
existing run. `cal:verify` validates the frozen selection, checkout binding,
observations, failures, coverage, and hashes. It does not produce rule metrics
or admit corpus labels. `cal:report` repeats that scan verification before
writing deterministic, path-free `rule-metrics.json`, `language-metrics.json`,
`report.md`, and `logs/report.jsonl` status artifacts. Until an
admission-backed eligible cohort and denominator-aware metrics producer exist,
all four are marked `status: unavailable` with an explicit reason; no numeric
metric or corpus-eligibility claim is fabricated. It exits 1 for this
diagnostic-only result and refuses to overwrite any existing derived artifact.

The historical `calibration-empirical.json` merger is not a v10.3 authority
artifact: it remains diagnostic-only until its inputs are bound to the v10.3
manifest, coverage gates, and versioned metric schema.

Per-rule precision, recall, FPR, and lift calibration against the positive
(AI-generated) and negative (real human) corpora remains planned; the current
`cal:report` command writes unavailable status receipts until those authority
inputs and the versioned metrics producer exist.

## Calibration corpus

> **Historical v10.2 layout — not current v10.3 authority.** The paths and
> counts below are retained for reproducibility of the archived workflow only.
> Current v10.3 review covers 317 pinned checkouts and 452,382 selected units,
> all still quarantine-only (`verified_ai=0`, `verified_human=0`); the declared
> AI-positive/human-negative polarity is not yet admitted truth.

The historical calibration corpus lived in two places:

1. **`$SLOPBRICK_CORPUS_ROOT/`** — 91 positive + 39 negative
   project subdirectories. ~1.13M files total.

2. **`$SLOPBRICK_BASELINE_ROOT/extracted/`** — flat file
   structure, ~58k files.

## Filelists

Pre-built filelists used by the `calibrate` subcommand live at:

```
$SLOPBRICK_CORPUS_ROOT/filelists/pos-all-files.txt
$SLOPBRICK_CORPUS_ROOT/filelists/neg-all-files.txt
```

Each line is one absolute file path. **`#` comments are stripped.**

Build with `bash "$SLOPBRICK_CORPUS_ROOT/build-filelists-v2.sh"`.

**Important:** these filelists were built on 2026-06-25 with a
narrow extension filter (`*.ts *.tsx *.js *.jsx *.py *.go *.sql`).
They cover only **~206k of the 1.13M corpus files (18%)**. The
remainder (Java, C#, Rust, Swift, C++, Kotlin, Ruby, PHP) is
**invisible to calibration**. See
`v10.2-plan.md#phase-8` for the fix.

## Calibration history

| Version | Date | Files | Notes |
|---------|------|-------|-------|
| v0.44.0 (unreleased) | 2026-07-09 | — | trust restoration; v10.3 calibration remains gated |
| v0.10.1 | 2026-07-04 | 581k | Last full calib |
| v8.5 | 2026-07-01 | 546k | TS/JS focused |

## Quick reference

```bash
# Run calibration on the pre-built filelists (v10.2 corpus)
slopbrick calibrate \
  --positive-list "$SLOPBRICK_CORPUS_ROOT/filelists/pos-all-files.txt" \
  --negative-list "$SLOPBRICK_CORPUS_ROOT/filelists/neg-all-files.txt" \
  --output /tmp/cal-results/v10.2-empirical.md

# Smaller subset calibration (fast, for sanity)
slopbrick calibrate \
  --positive-list "$SLOPBRICK_CORPUS_ROOT/filelists/pos-all-files.txt" \
  --negative-list "$SLOPBRICK_CORPUS_ROOT/filelists/neg-all-files.txt" \
  --positive-limit 3000 \
  --negative-limit 3000 \
  --output /tmp/cal-results/v10.2-3k.md

# Smoke test (~16s, 25 rules)
slopbrick calibrate \
  --positive-list "$SLOPBRICK_CORPUS_ROOT/filelists/pos-all-files.txt" \
  --negative-list "$SLOPBRICK_CORPUS_ROOT/filelists/neg-all-files.txt" \
  --positive-limit 50 \
  --negative-limit 50 \
  --output /tmp/cal-results/smoke.md
```

## Historical v10.2 diagnostic context

The commands above are retained only to reproduce historical diagnostics. Do
not use their 18%-coverage output for a release decision, rule calibration, or
label admission. The current source of truth is the v10.3 admission plan and
the v0.45 continuation plan.

See **`v10.2-plan.md`** (this directory) for the archived plan and its corpus-
gap discovery. It is superseded by the current gated plans.
