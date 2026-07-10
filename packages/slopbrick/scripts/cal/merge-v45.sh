#!/bin/bash
# v0.45.0 — Combine pos and neg v45 results and produce the
# v10.2a empirical report.
#
# Usage:
#   bash merge-v45.sh
#
# Inputs:
#   - /tmp/cal-results-v45/pos/   (v0.45.0 pos scan, from bg_2)
#   - /tmp/cal-results-v45-neg/neg/   (v0.45.0 neg scan, from bg_1)
#
# Output:
#   - /tmp/cal-results-v45/v10.2a-empirical.md  (final v10.2a report)
#   - /tmp/cal-results-v45/v10.2a-empirical.json  (machine-readable)
#
# This script is the bridge between the parallel scan (bg_1 + bg_2) and
# the merge step. After bg_1 finishes neg, run this to produce the
# final v10.2a report.
set -euo pipefail

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"

POS_DIR="${POS_DIR:-/tmp/cal-results-v45/pos}"
NEG_DIR="${NEG_DIR:-/tmp/cal-results-v45-neg/neg}"
OUT_DIR="${OUT_DIR:-/tmp/cal-results-v45}"
POS_LIST="${POS_LIST:-}"
NEG_LIST="${NEG_LIST:-}"

if [ -z "$POS_LIST" ] || [ -z "$NEG_LIST" ]; then
  echo "ERROR: set POS_LIST and NEG_LIST to the manifest-derived file lists" >&2
  exit 2
fi

if [ ! -d "$POS_DIR" ] || [ -z "$(ls -A $POS_DIR 2>/dev/null)" ]; then
  echo "ERROR: pos dir $POS_DIR is empty or missing" >&2
  exit 1
fi
if [ ! -d "$NEG_DIR" ] || [ -z "$(ls -A $NEG_DIR 2>/dev/null)" ]; then
  echo "ERROR: neg dir $NEG_DIR is empty or missing" >&2
  exit 1
fi

# Create a combined view: a single directory with both pos and neg JSONs
# but renamed so the merge script can find them.
COMBINED="${OUT_DIR}/combined"
rm -rf "$COMBINED"
mkdir -p "$COMBINED/pos" "$COMBINED/neg"

# Copy pos files (preserving original names so the merge script can
# count them properly).
cp "$POS_DIR"/*.json "$COMBINED/pos/" 2>/dev/null || true
cp "$NEG_DIR"/*.json "$COMBINED/neg/" 2>/dev/null || true

POS_COUNT=$(ls "$COMBINED/pos" | wc -l | tr -d ' ')
NEG_COUNT=$(ls "$COMBINED/neg" | wc -l | tr -d ' ')

echo "Combined: $POS_COUNT pos + $NEG_COUNT neg = $((POS_COUNT + NEG_COUNT)) total chunks"
echo ""

# Run merge
node "$SCRIPT_DIR/merge-chunk-results.ts" \
  --output-dir "$COMBINED" \
  --positive-list "$POS_LIST" \
  --negative-list "$NEG_LIST" \
  --chunk-timeout-ms 90000 \
  --markdown-out "${OUT_DIR}/v10.2a-empirical.md"
