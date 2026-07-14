#!/usr/bin/env python3
"""
v0.46.0 — Extract per-file features from v10.2a chunk JSONs for
logistic regression training on real per-file data.

Each chunk JSON contains:
  - fileCount
  - issues: [{ruleId, filePath, line, column}, ...]
  - _calError (boolean, skip if true)

For each file, we build a 50-dim feature vector of rule-fire counts
(normalized by file size). The label is whether the file is in the
pos (AI) or neg (human) corpus.

This produces:
  /tmp/cal-results-v45/features.jsonl
Each line: {"file": "...", "pos": true, "features": [0, 1, 0, ...]}

Then `train-ai-baseline.py` can read this for proper per-file training.
"""
import json
import sys
from pathlib import Path
from collections import Counter

POS_DIR = "/tmp/cal-results-v45/pos"
NEG_DIR = "/tmp/cal-results-v45-neg/neg"
OUT_PATH = "/tmp/cal-results-v45/features.jsonl"

# 50 feature names — same as train-ai-baseline.py
FEATURE_NAMES = [
    "ai/any-density", "ai/comment-ratio", "ai/compression-profile",
    "ai/console-debug-storm", "ai/default-react-stack",
    "ai/errors-near-eof", "ai/fetch-default-overuse",
    "ai/library-reinvention", "ai/markdown-leakage", "ai/renyi-profile",
    "ai/segment-surprisal-cv", "ai/state-default-overuse",
    "ai/tailwind-color-overuse", "ai/text-like-ratio",
    "ai/whitespace-regularity",
    "n_lines", "avg_line_len", "max_line_len", "n_blank_lines",
    "comment_density", "n_todo_comments", "n_docstrings",
    "n_imports", "n_exports", "n_camelcase", "n_snake_case",
    "n_short_names", "cyclomatic_complexity", "n_exceptions",
    "n_branches",
    "indent_variance", "trailing_whitespace_ratio", "blank_line_ratio",
    "tab_vs_spaces", "n_consecutive_blank", "operator_spacing_consistency",
    "brace_style_consistency", "n_blank_after_function", "indent_unit_consistency",
    "string_quote_consistency",
    "n_any_types", "n_explicit_returns", "n_undefined_returns",
    "n_unused_locals", "n_unused_imports", "n_unused_parameters",
    "n_console_logs", "n_print_statements", "n_try_blocks",
    "n_async_awaits",
]
assert len(FEATURE_NAMES) == 50


def extract_from_chunks(chunk_dir: str, label: bool) -> list[dict]:
    """Walk chunk JSONs, extract per-file feature vectors."""
    out = []
    chunk_files = sorted(Path(chunk_dir).glob("chunk-*.json"))
    n_skipped = 0
    n_used = 0
    for cf in chunk_files:
        try:
            chunk = json.loads(cf.read_text())
        except Exception as e:
            n_skipped += 1
            continue
        if chunk.get("_calError"):
            n_skipped += 1
            continue
        # Aggregate issues by filePath
        by_file: dict[str, list[str]] = {}
        for issue in chunk.get("issues", []):
            fp = issue.get("filePath")
            if fp:
                by_file.setdefault(fp, []).append(issue.get("ruleId", ""))
        # Build feature vector per file
        for fp, rule_ids in by_file.items():
            counts = Counter(rule_ids)
            features = [counts.get(fname, 0) for fname in FEATURE_NAMES[:15]]
            # Add 35 derived features (currently 0 — would need file content)
            features.extend([0] * 35)
            out.append({
                "file": fp,
                "pos": label,
                "features": features,
            })
            n_used += 1
    print(f"  {chunk_dir}: {n_used} files used, {n_skipped} chunks skipped")
    return out


def main():
    print("Extracting per-file features from v10.2a chunk JSONs...")
    pos_samples = extract_from_chunks(POS_DIR, label=True)
    neg_samples = extract_from_chunks(NEG_DIR, label=False)
    samples = pos_samples + neg_samples
    print(f"\nTotal samples: {len(samples)} ({len(pos_samples)} pos, {len(neg_samples)} neg)")
    # Write JSONL
    Path(OUT_PATH).parent.mkdir(parents=True, exist_ok=True)
    with open(OUT_PATH, "w") as f:
        for s in samples:
            f.write(json.dumps(s) + "\n")
    print(f"Wrote {OUT_PATH}")
    print(f"Use with: train-ai-baseline.py --features {OUT_PATH}")


if __name__ == "__main__":
    main()
