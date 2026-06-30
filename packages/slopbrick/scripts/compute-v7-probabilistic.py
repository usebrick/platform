#!/usr/bin/env python3
"""v7 probabilistic AI detection — multi-bucket, not binary.

The user asked for "a way to probabilistic AI by date and coding
and general practices" — i.e., instead of a binary AI/human label
per file, compute a probability score based on multiple evidence
buckets:

  Bucket 1: Date — recent files in a 2025-2026 project are more
            likely AI-era. We use lastCommitDate as a prior
            (NOT as evidence — the rule fires are the evidence).
            Date is a P(A) prior, P(H) = 1 - P(A).

  Bucket 2: Coding — rule fires from peer-reviewed AI-detector
            rules (e.g., markdown-leakage, any-density, comment-
            ratio, whitespace-regularity, text-like-ratio, errors-
            near-eof). Each rule contributes Bayesian log-LR.

  Bucket 3: General practices — code-hygiene and structural rules
            that fire on patterns common in AI code (low cyclomatic
            complexity variance, low spacing entropy, etc.). These
            are NOT AI-specific; they're evidence of how the code
            was written.

Output: per-file P(AI | evidence) using naive Bayes over the
evidence buckets. Files with P(AI) > 0.7 are flagged "likely AI";
0.4-0.7 "uncertain"; < 0.4 "likely human".

This complements the binary verdict per-rule. It's the foundation
for a "slop_suggest"-style call that says "this file is 87% likely
to be AI-generated" instead of "rule X fired."
"""
import json
import os
import re
import sys
from collections import Counter, defaultdict
from pathlib import Path
from datetime import datetime

# v0.18.2 PR-1k: see src/corpus-paths.ts (TS sibling).
CORPUS_ROOT = Path(os.environ.get("SLOPBRICK_CORPUS_DIR", "/Users/cheng/corpus-expansion"))
SCAN_ROOT = Path("/tmp")
REPO = Path(__file__).resolve().parent.parent
RULE_DIR = REPO / "src/rules"

# AI-detector rules (peer-reviewed signals) — use Bayesian LR
AI_DETECTOR_RULES = {
    "ai/markdown-leakage",
    "ai/comment-ratio",
    "ai/whitespace-regularity",
    "ai/text-like-ratio",
    "ai/errors-near-eof",
    "ai/any-density",
    # Existing AI signals from v0.12.2 calibration
    "logic/ghost-defensive",
    "logic/zombie-state",
    "logic/math-console-log-storm",
    "logic/math-gini-class-usage",
    "logic/reactive-hook-soup",
    "logic/optimistic-no-rollback",
    "test/weak-assertion",
    "test/duplicate-setup",
    "visual/math-rounded-entropy",
    "visual/math-default-font",
    "visual/math-color-cluster",
    "visual/math-font-entropy",
    "component/shadcn-prop-mismatch",
    "perf/halstead-anomaly",
    "perf/css-bloat",
    "security/fail-open-auth",
    "security/missing-auth-check",
    "security/hardcoded-secret",
    "wcag/focus-appearance",
    "wcag/focus-obscured",
}

# Code-hygiene / general-practice rules — NOT AI-specific, but their
# fire patterns are characteristic of how AI code is structured
GENERAL_PRACTICE_RULES = {
    "visual/math-spacing-entropy",
    "visual/math-gradient-hue-rotation",
    "visual/clamp-soup",
    "visual/inline-style-dominance",
    "visual/arbitrary-escape",
    "layout/math-grid-uniformity",
    "layout/math-element-uniformity",
    "component/giant-component",
    "typo/math-cta-vocabulary",
    "typo/math-button-label-uniformity",
}


def load_scan(path: Path) -> dict:
    if not path.exists():
        sys.exit(f"Missing scan output: {path}")
    return json.load(open(path))


def load_metadata(path: Path) -> dict:
    if path.exists():
        return json.load(open(path))
    return {"files": {}}


def date_to_prob_ai(date_str: str, ref_date: str = "2026-06-27") -> float:
    """P(AI | commit date) as a soft prior. Recent files are more
    likely AI; very old files are more likely human. Saturates so
    we never hit 0 or 1 (always leaves room for evidence to flip
    the conclusion).

    Sigmoid: P(AI | date) = 1 / (1 + exp(-k * (date - midpoint)))
    where midpoint = 2024-01-01 (ChatGPT release was Nov 2022, but
    widespread AI-coding-agent adoption started mid-2023, so a
    midpoint of 2024-01-01 is reasonable).

    k = 0.0025 per day → ~6 month transition window.
    """
    if not date_str or date_str == "unknown":
        return 0.5  # no info
    try:
        d = datetime.strptime(date_str, "%Y-%m-%d")
    except ValueError:
        return 0.5
    midpoint = datetime(2024, 1, 1)
    days = (d - midpoint).days
    k = 0.0025
    import math
    p = 1.0 / (1.0 + math.exp(-k * days))
    return max(0.05, min(0.95, p))  # clamp to [0.05, 0.95]


def compute_log_lr(pos_per_file: set, neg_per_file: set, n_pos: int, n_neg: int) -> float:
    """Bayesian log-likelihood ratio for a single rule fire set.
    P(fire | AI) / P(fire | human), with Haldane smoothing.
    """
    tp = len(pos_per_file)
    fp = len(neg_per_file)
    # Haldane smoothing
    p_fire_ai = (tp + 0.5) / (n_pos + 1)
    p_fire_human = (fp + 0.5) / (n_neg + 1)
    import math
    return math.log(p_fire_ai / p_fire_human)


def main():
    # Load v7 scan outputs (use the v7 directories)
    NEG = load_scan(SCAN_ROOT / "v7-full-neg-perfile-fires.json")
    POS = load_scan(SCAN_ROOT / "v7-pure-pos-perfile-fires.json")
    neg_meta = load_metadata(CORPUS_ROOT / "v7/scan/v7-full-neg/metadata.json")
    pos_meta = load_metadata(CORPUS_ROOT / "v7/scan/v7-pure-pos/metadata.json")

    neg_per_file = NEG.get("perFileFires", {})
    pos_per_file = POS.get("perFileFires", {})
    n_neg = NEG.get("files", 0)
    n_pos = POS.get("files", 0)

    # Build a per-file score for neg and pos sides
    def score_arm(per_file: dict, meta: dict, n_total: int, ref_arm: str) -> list:
        out = []
        files_meta = meta.get("files", {})
        for symlink, rules_fired in per_file.items():
            if not isinstance(rules_fired, set):
                rules_fired = set(rules_fired) if isinstance(rules_fired, list) else set()
            file_info = files_meta.get(symlink, {})
            date_str = file_info.get("lastCommitDate", "unknown")

            # Date prior
            p_ai_date = date_to_prob_ai(date_str)
            log_prior = __import__("math").log(p_ai_date / (1 - p_ai_date))

            # Coding evidence: AI-detector rule fires
            log_lrs_coding = 0.0
            n_coding_fires = 0
            for rule in AI_DETECTOR_RULES:
                if rule in per_file and symlink in per_file[rule]:
                    n_coding_fires += 1
                    log_lrs_coding += compute_log_lr(
                        pos_per_file.get(rule, set()),
                        neg_per_file.get(rule, set()),
                        n_pos, n_neg,
                    )

            # General-practice evidence
            log_lrs_practice = 0.0
            n_practice_fires = 0
            for rule in GENERAL_PRACTICE_RULES:
                if rule in per_file and symlink in per_file[rule]:
                    n_practice_fires += 1
                    log_lrs_practice += compute_log_lr(
                        pos_per_file.get(rule, set()),
                        neg_per_file.get(rule, set()),
                        n_pos, n_neg,
                    )

            log_posterior = log_prior + log_lrs_coding + log_lrs_practice
            import math
            p_posterior = 1.0 / (1.0 + math.exp(-log_posterior))

            out.append({
                "symlink": symlink,
                "lastCommitDate": date_str,
                "p_ai_date": round(p_ai_date, 3),
                "n_coding_fires": n_coding_fires,
                "n_practice_fires": n_practice_fires,
                "log_lrs_coding": round(log_lrs_coding, 3),
                "log_lrs_practice": round(log_lrs_practice, 3),
                "p_ai_posterior": round(p_posterior, 3),
                "bucket": (
                    "likely_ai" if p_posterior >= 0.7
                    else "uncertain" if p_posterior >= 0.4
                    else "likely_human"
                ),
            })
        return out

    print("Scoring neg files...")
    neg_scores = score_arm(neg_per_file, neg_meta, n_neg, "neg")
    print("Scoring pos files...")
    pos_scores = score_arm(pos_per_file, pos_meta, n_pos, "pos")

    # Bucket distribution
    all_scores = neg_scores + pos_scores
    bucket_counts = Counter(s["bucket"] for s in all_scores)
    print(f"\nProbabilistic AI bucket distribution ({len(all_scores)} files):")
    for b in ["likely_ai", "uncertain", "likely_human"]:
        print(f"  {b}: {bucket_counts[b]}")
    print(f"  total: {len(all_scores)}")

    # Per-bucket breakdown by arm
    print("\nBucket by arm:")
    for arm, scores in [("neg", neg_scores), ("pos", pos_scores)]:
        c = Counter(s["bucket"] for s in scores)
        n = len(scores)
        if n == 0:
            print(f"  {arm}: 0 files")
            continue
        print(f"  {arm}: {n} total")
        for b in ["likely_ai", "uncertain", "likely_human"]:
            pct = c[b] / n * 100
            print(f"    {b}: {c[b]} ({pct:.1f}%)")

    # Save detailed report
    out_path = REPO / "docs/research/v7-probabilistic-scores.json"
    out_path.write_text(json.dumps({
        "version": "v7",
        "generatedAt": datetime.utcnow().isoformat() + "Z",
        "method": "naive_bayes_over_3_buckets",
        "buckets": {
            "date": "logistic prior based on lastCommitDate, midpoint 2024-01-01",
            "coding": "AI-detector rules (peer-reviewed signals)",
            "general_practice": "code-hygiene / structural rules",
        },
        "n_neg": n_neg,
        "n_pos": n_pos,
        "bucket_distribution": dict(bucket_counts),
        "by_arm": {
            "neg": {b: sum(1 for s in neg_scores if s["bucket"] == b) for b in ["likely_ai", "uncertain", "likely_human"]},
            "pos": {b: sum(1 for s in pos_scores if s["bucket"] == b) for b in ["likely_ai", "uncertain", "likely_human"]},
        },
        "samples": {
            "neg_likely_ai": [s for s in neg_scores if s["bucket"] == "likely_ai"][:10],
            "pos_likely_human": [s for s in pos_scores if s["bucket"] == "likely_human"][:10],
        },
    }, indent=2))
    print(f"\nWrote {out_path}")


if __name__ == "__main__":
    main()
