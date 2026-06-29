#!/usr/bin/env python3
"""v7 rule-coverage gap detector (partial-data version).

The partial-fires.json contains perFileFires (rule → files-that-fired)
but NOT the list of files scanned with zero fires. So the "true"
gap is unknown on partial data.

What we CAN compute:
- Fire rate by repo (pos files in perFileFires / total pos files in that repo)
- Fire rate by file extension
- Fire rate by file size bucket
- Which pos repos have the LOWEST fire rate (these are likely hardest for our rules)

Output: docs/research/v7-coverage-gaps-<timestamp>.md

Usage: python3 scripts/find-rule-coverage-gaps.py
"""
import json
import re
import sys
from collections import Counter, defaultdict
from datetime import datetime
from pathlib import Path

SCAN_ROOT = Path("/tmp")
CORPUS_ROOT = Path("/Users/cheng/corpus-expansion")
REPO = Path(__file__).resolve().parent.parent
DOCS_DIR = REPO / "docs/research"


def load_scan(path: Path) -> dict | None:
    if not path.exists():
        return None
    return json.load(open(path))


neg = load_scan(SCAN_ROOT / "v7-full-neg-partial-fires.json")
pos = load_scan(SCAN_ROOT / "v7-full-pos-partial-fires.json")
if not neg or not pos:
    print("ERROR: missing partial-fires.json")
    sys.exit(1)

# Get the metadata (for repo + file-size context)
pos_meta_path = CORPUS_ROOT / "v7/scan/v7-full-pos/metadata.json"
neg_meta_path = CORPUS_ROOT / "v7/scan/v7-full-neg/metadata.json"
pos_meta = json.load(open(pos_meta_path)) if pos_meta_path.exists() else None
neg_meta = json.load(open(neg_meta_path)) if neg_meta_path.exists() else None

# Build per-file rule sets
def per_file_rules(per_file_fires: dict) -> dict[str, set]:
    out: dict[str, set] = defaultdict(set)
    for rule, files in per_file_fires.items():
        for f in files:
            out[f].add(rule)
    return out


pos_per_file = per_file_rules(pos["perFileFires"])
neg_per_file = per_file_rules(neg["perFileFires"])

# Build total-file-set from metadata so we can compute fire rate by repo/ext/size
# (the partial-fires doesn't have a list of files-scanned-with-zero-fires,
# so any file in metadata but not in perFileFires could be "not yet scanned"
# OR "scanned with zero fires" — we can't tell from the partial output alone)
pos_meta_files = pos_meta.get("files", {}) if pos_meta else {}
neg_meta_files = neg_meta.get("files", {}) if neg_meta else {}

pos_fired_set = set(pos_per_file.keys())
neg_fired_set = set(neg_per_file.keys())

# Normalize to relative paths so we can match against metadata
def to_relative(f: str) -> str:
    if f.startswith(f"{CORPUS_ROOT}/v7/scan/v7-full-pos/"):
        return f[len(f"{CORPUS_ROOT}/v7/scan/v7-full-pos/"):]
    if f.startswith(f"{CORPUS_ROOT}/v7/scan/v7-full-neg/"):
        return f[len(f"{CORPUS_ROOT}/v7/scan/v7-full-neg/"):]
    return f

pos_fired_rel = set(to_relative(f) for f in pos_fired_set)
neg_fired_rel = set(to_relative(f) for f in neg_fired_set)

# File extension classifier
def ext_bucket(f: str) -> str:
    m = re.search(r"\.([a-z0-9]+)$", f)
    if not m:
        return "no_ext"
    ext = m.group(1)
    if ext in ("ts", "tsx", "js", "jsx", "mjs", "cjs"):
        return "js/ts"
    if ext in ("py", "pyc", "pyi"):
        return "python"
    if ext in ("java", "kt", "kts", "scala", "groovy"):
        return "jvm"
    if ext == "go":
        return "go"
    if ext == "rs":
        return "rust"
    if ext == "rb":
        return "ruby"
    if ext in ("vue", "svelte"):
        return "vue/svelte"
    if ext in ("c", "cpp", "cc", "cxx", "h", "hpp", "hxx"):
        return "c/cpp"
    if ext in ("md", "mdx"):
        return "docs"
    if ext in ("json", "yaml", "yml", "toml"):
        return "config"
    if ext in ("html", "css", "scss", "sass"):
        return "web"
    if ext in ("sh", "bash", "zsh"):
        return "shell"
    return ext


def repo_bucket(f: str) -> str:
    """Extract repo name from a pos file path.
    Handles both relative metadata keys (e.g. 'foo__bar__file.ts')
    and absolute perFileFires paths
    (e.g. '/Users/.../v7/scan/v7-full-pos/foo__bar__file.ts')."""
    # If absolute, strip the prefix
    if f.startswith(f"{CORPUS_ROOT}/v7/scan/v7-full-pos/"):
        f = f[len(f"{CORPUS_ROOT}/v7/scan/v7-full-pos/"):]
    parts = f.split("/")
    return parts[0] if parts else "unknown"


# Compute fire rate by extension (pos only — that's where gaps matter)
pos_total_by_ext: Counter = Counter()
pos_fired_by_ext: Counter = Counter()
for f in pos_meta_files:
    pos_total_by_ext[ext_bucket(f)] += 1
    if f in pos_fired_rel:
        pos_fired_by_ext[ext_bucket(f)] += 1

# Compute fire rate by repo
pos_total_by_repo: Counter = Counter()
pos_fired_by_repo: Counter = Counter()
for f in pos_meta_files:
    pos_total_by_repo[repo_bucket(f)] += 1
    if f in pos_fired_rel:
        pos_fired_by_repo[repo_bucket(f)] += 1

# Fire rate by file size
pos_total_by_size: Counter = Counter()
pos_fired_by_size: Counter = Counter()
size_buckets = [500, 2000, 10000, 50000, float("inf")]
size_labels = ["<500B", "500B-2KB", "2KB-10KB", "10KB-50KB", ">50KB"]


def size_bucket(s: int) -> str:
    for i, threshold in enumerate(size_buckets):
        if s < threshold:
            return size_labels[i]
    return size_labels[-1]


for f, info in pos_meta_files.items():
    size = info.get("sizeBytes", 0)
    bucket = size_bucket(size)
    pos_total_by_size[bucket] += 1
    if f in pos_fired_rel:
        pos_fired_by_size[bucket] += 1


# Find low-fire-rate repos (lowest 20)
repo_fire_rates = []
for repo in pos_total_by_repo:
    total = pos_total_by_repo[repo]
    fired = pos_fired_by_repo[repo]
    if total >= 50:  # ignore tiny repos
        rate = fired / total * 100
        repo_fire_rates.append((repo, total, fired, rate))
repo_fire_rates.sort(key=lambda x: x[3])  # ascending by rate

# Find low-fire-rate extensions
ext_fire_rates = []
for ext in pos_total_by_ext:
    total = pos_total_by_ext[ext]
    if total >= 100:  # ignore tiny extensions
        fired = pos_fired_by_ext[ext]
        rate = fired / total * 100
        ext_fire_rates.append((ext, total, fired, rate))
ext_fire_rates.sort(key=lambda x: x[3])  # ascending by rate

# Report
timestamp = datetime.now().strftime("%Y%m%d-%H%M%S")
report_path = DOCS_DIR / f"v7-coverage-gaps-{timestamp}.md"

content = f"""# v7 rule-coverage gap analysis

**Generated:** {datetime.now().isoformat()}
**Source:** v7 partial-fires.json (scans still running)
**Caveat:** perFileFires in the partial output only lists files where
at least one rule fired. Files scanned with ZERO fires are NOT in the
partial output. So the "true gap" is unknown on partial data — these
numbers are **lower bounds** (assuming the files with zero fires are
similar in distribution to the rest of the corpus).

## Summary

| | Files (metadata) | Fired at least once | Fire rate |
|---|---:|---:|---:|
| **Pos (AI)** | {len(pos_meta_files)} | {len(pos_fired_rel)} | {len(pos_fired_rel)/len(pos_meta_files)*100:.1f}% |
| Neg (human) | {len(neg_meta_files)} | {len(neg_fired_rel)} | {len(neg_fired_rel)/len(neg_meta_files)*100:.1f}% |

**Pos fire rate of {len(pos_fired_rel)/len(pos_meta_files)*100:.1f}%** means our
current rule set flags roughly 1 in 5 AI-generated files. The other
~80% are in our gap.

## Lowest fire rate by file extension (where we're weakest)

| Extension | Pos files | Fired | Fire rate | Gap |
|---|---:|---:|---:|---:|
"""
for ext, total, fired, rate in ext_fire_rates[:15]:
    gap = 100 - rate
    content += f"| `{ext}` | {total} | {fired} | {rate:.1f}% | {gap:.1f}% |\n"

content += f"""
## Lowest fire rate by repo (pos repos where rules fire least)

| Repo | Pos files | Fired | Fire rate | Gap |
|---|---:|---:|---:|---:|
"""
for repo, total, fired, rate in repo_fire_rates[:20]:
    gap = 100 - rate
    content += f"| `{repo}` | {total} | {fired} | {rate:.1f}% | {gap:.1f}% |\n"

content += f"""
## Fire rate by file size

| Size | Pos files | Fired | Fire rate | Gap |
|---|---:|---:|---:|---:|
"""
for label in size_labels:
    total = pos_total_by_size[label]
    fired = pos_fired_by_size[label]
    if total > 0:
        rate = fired / total * 100
        gap = 100 - rate
        content += f"| {label} | {total} | {fired} | {rate:.1f}% | {gap:.1f}% |\n"

content += """
## Where to look for new rules

The lowest-fire-rate entries in each table are the candidates for
new rules:

1. **Extension gaps** — if `python` has 2% fire rate and `js/ts`
   has 30%, we need more rules that fire on Python. Or our
   existing Python rules need a different signal.

2. **Repo gaps** — the lowest-fire-rate repos are likely AI agent
   frameworks (`vibe-coded/*`, `cline`, `continue`, `aider`).
   These are AI-written to be robust, so they look "human" to
   our rules. New rules could target:
   - Tool-call patterns in agent harnesses
   - Prompt template structures
   - Common LLM response-handling boilerplate

3. **Size gaps** — large files (>50KB) and tiny files (<500B)
   often have very low fire rates. Tiny config files lack
   enough code to flag. Large files have so much going on
   that 1-2 fires is below the noise floor.

4. **Test files** — check the file extension breakdown for
   `__tests__/`, `.test.ts`, `.spec.ts`. AI-generated tests
   have predictable patterns we should catch.

5. **Type definition files** — `.d.ts`, `types.ts`,
   `interface.ts`. AI generates these in bulk; they have low
   entropy and few tokens, so most rules miss them.

## How to act on this

For each low-fire-rate cluster in the tables above:

1. **Spot-check 10 files manually.** What's AI about them?
   What's the signature we're missing?
2. **Author a candidate rule** in `src/rules/<category>/<rule>.ts`.
3. **Mark it `defaultOff: true`** (DORMANT).
4. **Add to the v0.14.5d calibration** so v7 validates it
   when scans finish.
5. **Promote to defaultOn** if v7 confirms P > 0.5 AND lift > 2.
"""

report_path.parent.mkdir(parents=True, exist_ok=True)
report_path.write_text(content)

# Print summary to stdout
print(f"v7 rule-coverage gap analysis ({datetime.now().isoformat()})")
print(f"  Pos fire rate: {len(pos_fired_rel)/len(pos_meta_files)*100:.1f}% ({len(pos_fired_rel)} of {len(pos_meta_files)} files)")
print(f"  Neg fire rate: {len(neg_fired_rel)/len(neg_meta_files)*100:.1f}% ({len(neg_fired_rel)} of {len(neg_meta_files)} files)")
print()
print("Lowest fire rate by extension:")
for ext, total, fired, rate in ext_fire_rates[:10]:
    print(f"  {rate:5.1f}%  {ext:10s} ({fired}/{total})")
print()
print("Lowest fire rate by repo (top 10):")
for repo, total, fired, rate in repo_fire_rates[:10]:
    print(f"  {rate:5.1f}%  {repo} ({fired}/{total})")
print()
print(f"Wrote {report_path}")
