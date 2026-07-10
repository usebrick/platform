# Calibration

> **Current execution guide:** [`v0.45.0-continuation-plan.md`](./v0.45.0-continuation-plan.md). The absolute-path corpus/file-list commands below describe the historical v10.2 workflow and must not be used for release decisions. v10.3 will replace them with a provenance-backed manifest, complete file accounting, and denominator-aware metrics.

Per-rule precision, recall, FPR, and lift calibration against
the positive (AI-generated) and negative (real human) corpora.

## Calibration corpus

The calibration corpus lives in two places:

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

## v10.2 plan

See **`v10.2-plan.md`** (this directory) for the full plan,
including the corpus-gap discovery and the revised phases.
