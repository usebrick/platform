#!/usr/bin/env python3
"""v0.18.9: merge the v8 Rust-only scan fires into the existing v8 fires.

The v8 50k scans ran BEFORE the .rs parser fix. They scanned the v8
corpus but couldn't parse .rs files (parseWithSwc threw). The v2-build
was wired but buildRustFileRecord got blank-padded source and returned
empty RustFileStructure.

After the parser fix (.rs now uses parseBlankModule + returns original
source), the Rust pipeline works. We re-scan the v8 Rust files
separately and merge the per-rule fires into the existing v8 fires
so the v8.5 calibration has Rust data.

Inputs:
  /tmp/v8-pos-fires.json         - existing v8 pos fires (50k, no Rust)
  /tmp/v8-neg-fires.json         - existing v8 neg fires (50k, no Rust)
  /tmp/v8-rs-pos-fires.json      - new v8 pos Rust fires (7,197 files)
  /tmp/v8-rs-neg-fires.json      - new v8 neg Rust fires (18,738 files)

Output:
  /tmp/v8-pos-fires.json         - merged v8 pos fires (with Rust)
  /tmp/v8-neg-fires.json         - merged v8 neg fires (with Rust)
"""

import json
from pathlib import Path

V8_POS = Path("/tmp/v8-pos-fires.json")
V8_NEG = Path("/tmp/v8-neg-fires.json")
V8_RS_POS = Path("/tmp/v8-rs-pos-fires.json")
V8_RS_NEG = Path("/tmp/v8-rs-neg-fires.json")


def load(p: Path) -> dict:
    if not p.exists():
        sys.exit(f"Missing {p}")
    return json.load(open(p))


def save(p: Path, data: dict) -> None:
    p.write_text(json.dumps(data))


import sys
for p in (V8_POS, V8_NEG, V8_RS_POS, V8_RS_NEG):
    if not p.exists():
        sys.exit(f"Missing {p}")

# Load all four
v8_pos = load(V8_POS)
v8_neg = load(V8_NEG)
rs_pos = load(V8_RS_POS)
rs_neg = load(V8_RS_NEG)

print(f"v8 pos (existing): {v8_pos['files']} files, {v8_pos['issueCount']} issues, {v8_pos['uniqueRules']} rules")
print(f"v8 neg (existing): {v8_neg['files']} files, {v8_neg['issueCount']} issues, {v8_neg['uniqueRules']} rules")
print(f"v8 rs pos (new): {rs_pos['files']} files, {rs_pos['issueCount']} issues, {rs_pos['uniqueRules']} rules")
print(f"v8 rs neg (new): {rs_neg['files']} files, {rs_neg['issueCount']} issues, {rs_neg['uniqueRules']} rules")


def merge(base: dict, rs: dict) -> dict:
    """Merge the Rust fires into the base fires. Same files aren't
    in both (the v8 50k sample was sampled without .rs, and the
    v8-rs-only sample is purely .rs)."""
    merged = {
        "kind": base["kind"],
        "workspace": base["workspace"],
        "files": base["files"] + rs["files"],
        "issueCount": base["issueCount"] + rs["issueCount"],
        "uniqueRules": 0,  # recomputed below
        "fires": {},
        "perFileFires": {},
    }
    seen_rules = set()

    def add_fire(rule: str, file: str):
        seen_rules.add(rule)
        if rule not in merged["perFileFires"]:
            merged["perFileFires"][rule] = set()
        merged["perFileFires"][rule].add(file)
        merged["fires"][rule] = merged["fires"].get(rule, 0) + 1

    # Add from base (perFileFires is a list of file paths)
    for rule, files in base["perFileFires"].items():
        for f in files:
            add_fire(rule, f)

    # Add from rs (perFileFires is a list of file paths)
    for rule, files in rs["perFileFires"].items():
        for f in files:
            add_fire(rule, f)

    merged["uniqueRules"] = len(seen_rules)
    # Convert sets to lists for JSON
    merged["perFileFires"] = {
        k: sorted(v) for k, v in merged["perFileFires"].items()
    }
    return merged


merged_pos = merge(v8_pos, rs_pos)
merged_neg = merge(v8_neg, rs_neg)

print(f"\nMerged pos: {merged_pos['files']} files, {merged_pos['issueCount']} issues, {merged_pos['uniqueRules']} rules")
print(f"Merged neg: {merged_neg['files']} files, {merged_neg['issueCount']} issues, {merged_neg['uniqueRules']} rules")

# Save
save(V8_POS, merged_pos)
save(V8_NEG, merged_neg)
print(f"\nWrote {V8_POS}")
print(f"Wrote {V8_NEG}")
print("Run the v8.5 calibration next: python3 scripts/compute-v85-calibration.py")
