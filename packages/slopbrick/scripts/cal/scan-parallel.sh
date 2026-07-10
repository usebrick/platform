#!/bin/bash
# v0.10.2 (Phase 9): parallel chunk scan via xargs.
#
# Bypasses the calibrator's `runScan()` loop (which has a known hang
# after the first chunk when scanning 100k+ files). Splits one or two
# pre-built filelists into chunks and runs them in parallel via
# xargs -P. Each chunk writes its own JSON to <output-dir>/{pos,neg}/.
#
# A separate TS merge script (merge-chunk-results.ts) reads all
# per-chunk JSONs and produces the same calibration report that
# `slopbrick calibrate` would write.
#
# Usage:
#   ./scan-parallel.sh --positive <list> --negative <list> \
#                      [--chunk-size 600] [--parallelism 4] \
#                      [--chunk-timeout-ms 90000] \
#                      [--output-dir /tmp/cal-chunks] \
#                      [--no-split] [--skip-existing]
#
#   --no-split:        skip the split step; reuse existing chunk-*
#                      files in <output-dir>/{pos,neg}/. Lets a
#                      partially-completed run resume without
#                      re-splitting the filelists.
#   --skip-existing:   skip chunks that already have a non-empty
#                      .json file. Used together with --no-split to
#                      resume after a kill/timeout.
set -euo pipefail

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"

POS_LIST=""
NEG_LIST=""
CHUNK_SIZE=600
PARALLELISM=4
CHUNK_TIMEOUT_MS=90000
OUTPUT_DIR="/tmp/cal-chunks"
SLOPBRICK_BIN="node ${SCRIPT_DIR}/../../bin/slopbrick.js"
NO_SPLIT=0
SKIP_EXISTING=0

while [[ $# -gt 0 ]]; do
  case "$1" in
    --positive)         POS_LIST="$2"; shift 2 ;;
    --negative)         NEG_LIST="$2"; shift 2 ;;
    --chunk-size)       CHUNK_SIZE="$2"; shift 2 ;;
    --parallelism)      PARALLELISM="$2"; shift 2 ;;
    --chunk-timeout-ms) CHUNK_TIMEOUT_MS="$2"; shift 2 ;;
    --output-dir)       OUTPUT_DIR="$2"; shift 2 ;;
    --slopbrick-bin)    SLOPBRICK_BIN="$2"; shift 2 ;;
    --no-split)         NO_SPLIT=1; shift ;;
    --skip-existing)    SKIP_EXISTING=1; shift ;;
    -h|--help)
      sed -n '2,28p' "$0"
      exit 0
      ;;
    *) echo "unknown arg: $1" >&2; exit 2 ;;
  esac
done

if [[ -z "$POS_LIST" && -z "$NEG_LIST" ]]; then
  echo "error: at least one of --positive / --negative is required" >&2
  exit 2
fi

mkdir -p "$OUTPUT_DIR/pos" "$OUTPUT_DIR/neg"

# Scan a single chunk: $1 = chunk-file (one path per line),
# $2 = output JSON path.
scan_one() {
  local chunk_file="$1"
  local out_json="$2"
  # --skip-existing: if the JSON already exists and is non-empty,
  # treat it as already-scanned and skip.
  if [[ "$SKIP_EXISTING" -eq 1 && -s "$out_json" ]]; then
    return 0
  fi
  local tmp_json="${out_json}.tmp"
  local files=()
  while IFS= read -r f; do
    files+=("$f")
  done < "$chunk_file"
  if [[ ${#files[@]} -eq 0 ]]; then
    printf '{"fileCount":0,"issues":[]}' > "$out_json"
    return 0
  fi
  # Portable timeout: background the slopbrick scan and kill it
  # after CHUNK_TIMEOUT_MS. macOS lacks GNU `timeout`.
  $SLOPBRICK_BIN scan "${files[@]}" \
      --json "$tmp_json" --no-telemetry --quiet &
  local pid=$!
  local elapsed=0
  while kill -0 "$pid" 2>/dev/null; do
    if [[ $elapsed -ge $CHUNK_TIMEOUT_MS ]]; then
      kill -9 "$pid" 2>/dev/null || true
      wait "$pid" 2>/dev/null || true
      local rc=124
      printf '{"fileCount":0,"issues":[],"_calError":true,"_calExitCode":%d,"_firstFile":"%s"}' "$rc" "${files[0]}" > "$out_json"
      return 0
    fi
    sleep 1
    elapsed=$((elapsed + 1000))
  done
  wait "$pid" 2>/dev/null
  local rc=$?
  # Match calibrator.ts behavior: non-zero exit is fine if the JSON
  # was still written (threshold violation case). Only treat as a
  # real failure when the JSON file is missing/empty.
  if [[ ! -s "$tmp_json" ]]; then
    printf '{"fileCount":0,"issues":[],"_calError":true,"_calExitCode":%d}' "$rc" > "$out_json"
    return 0
  fi
  mv "$tmp_json" "$out_json"
}

export -f scan_one
export SLOPBRICK_BIN CHUNK_TIMEOUT_MS SKIP_EXISTING

# Split filelists into chunk files. BSD/macOS `split` doesn't accept
# GNU's `--numeric-suffixes`; use the BSD `-d` flag instead.
split_chunked() {
  local src="$1"
  local outdir="$2"
  if [[ ! -s "$src" ]]; then
    echo "warn: empty or missing filelist: $src" >&2
    return 0
  fi
  rm -f "$outdir"/chunk-* "$outdir"/chunk-*.json
  split -l "$CHUNK_SIZE" -d -a 4 \
        "$src" "$outdir/chunk-"
  local n
  n=$(ls "$outdir"/chunk-* 2>/dev/null | wc -l | tr -d ' ')
  echo "  split $src -> $n chunks (size $CHUNK_SIZE)"
}

# --no-split: if the polarity already has chunk files, skip the
# split step. Used to resume a killed run.
should_split() {
  local outdir="$1"
  if [[ "$NO_SPLIT" -eq 1 ]]; then
    local existing
    existing=$(ls "$outdir"/chunk-* 2>/dev/null | grep -v '\.json$' | wc -l | tr -d ' ')
    if [[ "$existing" -gt 0 ]]; then
      echo "  reusing $existing existing chunks in $outdir (--no-split)"
      return 1
    fi
  fi
  return 0
}

if [[ -n "$POS_LIST" ]]; then
  echo "=== Preparing positive chunks ==="
  if should_split "$OUTPUT_DIR/pos"; then split_chunked "$POS_LIST" "$OUTPUT_DIR/pos"; fi
fi
if [[ -n "$NEG_LIST" ]]; then
  echo "=== Preparing negative chunks ==="
  if should_split "$OUTPUT_DIR/neg"; then split_chunked "$NEG_LIST" "$OUTPUT_DIR/neg"; fi
fi

# Run scan_one in parallel over all chunks for one polarity.
run_polarity() {
  local outdir="$OUTPUT_DIR/$1"
  local count
  count=$(ls "$outdir"/chunk-* 2>/dev/null | grep -v '\.json$' | wc -l | tr -d ' ')
  if [[ "$count" -eq 0 ]]; then return 0; fi
  echo "=== Scanning $count $1 chunks with parallelism=$PARALLELISM (timeout=${CHUNK_TIMEOUT_MS}ms) ==="
  # Build a temp list of "chunk|jsonpath" pairs (one per line). BSD
  # xargs splits on whitespace by default, which is fine because
  # our chunk paths have no spaces.
  local pairlist="$outdir/_pairs.txt"
  : > "$pairlist"
  for chunk in "$outdir"/chunk-*; do
    case "$chunk" in
      *"_pairs.txt") continue ;;
    esac
    if [[ -f "$chunk" && ! "$chunk" == *.json ]]; then
      printf '%s|%s\n' "$chunk" "$chunk.json" >> "$pairlist"
    fi
  done
  # Each line is "chunk|jsonpath". Use bash explicitly (not /bin/sh)
  # because scan_one uses bash-4-style features.
  xargs -n 1 -P "$PARALLELISM" -I {} \
    /bin/bash -c 'IFS="|" read -r cf oj <<< "$1"; scan_one "$cf" "$oj"' _ {} \
    < "$pairlist"
  rm -f "$pairlist"
  local ok
  ok=$(ls "$outdir"/chunk-*.json 2>/dev/null | wc -l | tr -d ' ')
  echo "  $1: $ok JSON files written to $outdir"
}

if [[ -n "$POS_LIST" ]]; then run_polarity "pos"; fi
if [[ -n "$NEG_LIST" ]]; then run_polarity "neg"; fi

echo ""
echo "Done. Next: run scripts/cal/merge-chunk-results.ts --output-dir $OUTPUT_DIR"
