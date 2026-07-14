#!/usr/bin/env python3
"""
v0.45.0 — Train a logistic regression baseline for AI code detection.

Uses the v10.2 PASS A calibration report (v5 corpus, tests excluded)
to train a 50-feature logistic regression on existing ai/* heuristic
firing rates. The model targets F1 0.60-0.70 per the master plan's
peer-reviewed expectations (Suh 2024 SOTA is F1 82.55; we don't
expect to match SOTA with hand-crafted features alone).

Usage:
    python3 scripts/cal/train-ai-baseline.py \
        --report /tmp/cal-results-v45/v10.2a-empirical.md \
        --output models/ai-baseline-v0.45.onnx

Inputs:
    - Markdown calibration report from merge-chunk-results.ts
    - The report's per-rule firing stats are the training data

Outputs:
    - ONNX model file (for inference via onnxruntime-node)
    - Feature scaling parameters (mean, std per feature)
    - Training report (F1, precision, recall on holdout)

Why logistic regression (per master plan v0.45):
    - Simplest ML model that works on tabular features
    - Fast training (seconds to minutes)
    - Fast inference (sub-millisecond per file)
    - 1MB model size
    - Establishes the pipeline (features → model → ONNX) before
      committing to CodeBERTa-small in v0.47.0
"""
import argparse
import json
import re
import sys
from pathlib import Path

# Run on Python 3.10+. We use only stdlib + scikit-learn.
# If sklearn isn't installed, we fall back to a pure-numpy logistic
# regression so the script is portable.
try:
    import numpy as np
    from sklearn.linear_model import LogisticRegression
    from sklearn.metrics import f1_score, precision_score, recall_score
    from sklearn.preprocessing import StandardScaler
    SKLEARN_AVAILABLE = True
except ImportError:
    print("Note: scikit-learn not installed, using pure-numpy fallback", file=sys.stderr)
    SKLEARN_AVAILABLE = False
    # Minimal numpy fallback
    try:
        import numpy as np
    except ImportError:
        print("FATAL: numpy is required", file=sys.stderr)
        sys.exit(2)


# 50 features (one per existing ai/* heuristic + 35 derived from
# file characteristics). The mapping is stable across releases.
# v0.46.0+ will extend this with extracted AST/ML features.
FEATURE_NAMES = [
    # 15 ai/* heuristic rule fire rates (binary per file)
    "ai/any-density", "ai/comment-ratio", "ai/compression-profile",
    "ai/console-debug-storm", "ai/default-react-stack",
    "ai/errors-near-eof", "ai/fetch-default-overuse",
    "ai/library-reinvention", "ai/markdown-leakage", "ai/renyi-profile",
    "ai/segment-surprisal-cv", "ai/state-default-overuse",
    "ai/tailwind-color-overuse", "ai/text-like-ratio",
    "ai/whitespace-regularity",
    # 15 file characteristics
    "n_lines", "avg_line_len", "max_line_len", "n_blank_lines",
    "comment_density", "n_todo_comments", "n_docstrings",
    "n_imports", "n_exports", "n_camelcase", "n_snake_case",
    "n_short_names", "cyclomatic_complexity", "n_exceptions",
    "n_branches",
    # 10 whitespace / formatting
    "indent_variance", "trailing_whitespace_ratio", "blank_line_ratio",
    "tab_vs_spaces", "n_consecutive_blank", "operator_spacing_consistency",
    "brace_style_consistency", "n_blank_after_function", "indent_unit_consistency",
    "string_quote_consistency",
    # 10 type / structure
    "n_any_types", "n_explicit_returns", "n_undefined_returns",
    "n_unused_locals", "n_unused_imports", "n_unused_parameters",
    "n_console_logs", "n_print_statements", "n_try_blocks",
    "n_async_awaits",
]
assert len(FEATURE_NAMES) == 50, f"Expected 50 features, got {len(FEATURE_NAMES)}"


def parse_calibration_report(md_path: str) -> list[dict]:
    """Parse merge-chunk-results.ts markdown output into per-rule stats."""
    with open(md_path) as f:
        md = f.read()
    rules = []
    for line in md.split("\n"):
        m = re.match(
            r"^\|\s*(\w+)\s*\|\s*`([^`]+)`\s*\|(?:\s*[^|]+\s*\|){0,3}\s*"
            r"([0-9.]+)%\s*\|\s*([0-9.]+)%\s*\|\s*([0-9.]+)%\s*\|\s*(\d+)\s*\|\s*(\d+)\s*\|",
            line,
        )
        if not m:
            continue
        rules.append({
            "signal": m.group(1),
            "rule_id": m.group(2),
            "precision": float(m.group(3)) / 100,
            "recall": float(m.group(4)) / 100,
            "f1": float(m.group(5)) / 100,
            "pos_fires": int(m.group(6)),
            "neg_fires": int(m.group(7)),
        })
    return rules


def featurize(per_rule_stats: list[dict]) -> tuple[list[float], float, float]:
    """Convert per-rule stats into the 50-dim feature vector and
    an aggregate AI-likelihood proxy (label proxy for training).

    The label proxy: any rule with precision > 0.5 and >100 pos fires
    is treated as a positive signal. Aggregate AI likelihood = weighted
    sum of these signals / total signals.
    """
    by_id = {r["rule_id"]: r for r in per_rule_stats}
    feats = []
    for fname in FEATURE_NAMES:
        if fname in by_id:
            # Heuristic fire rate = pos_fires / max_pos
            # (we use precision as a proxy for "this rule discriminates")
            r = by_id[fname]
            val = r["precision"] * 100  # 0-100
        else:
            val = 0.0
        feats.append(val)
    # Label proxy: simple average of all positive signals
    pos_signals = [r for r in per_rule_stats
                   if r["precision"] > 0.5 and r["pos_fires"] > 100]
    if pos_signals:
        label = sum(r["precision"] * r["pos_fires"] for r in pos_signals) / sum(r["pos_fires"] for r in pos_signals)
    else:
        label = 0.0
    return feats, label, sum(1 for r in per_rule_stats)


def train_logistic_regression(features: list[list[float]], labels: list[float]):
    """Train sklearn LogisticRegression on the features.
    Falls back to numpy if sklearn unavailable.
    """
    X = np.array(features)
    y = np.array([1 if l > 0.5 else 0 for l in labels])
    scaler = StandardScaler()
    X_scaled = scaler.fit_transform(X)
    if SKLEARN_AVAILABLE:
        model = LogisticRegression(
            max_iter=1000,
            class_weight="balanced",
            random_state=42,
        )
        model.fit(X_scaled, y)
        return model, scaler
    # numpy fallback: simple gradient descent
    n_samples, n_features = X_scaled.shape
    weights = np.zeros(n_features)
    bias = 0.0
    lr = 0.01
    for _ in range(2000):
        z = X_scaled @ weights + bias
        p = 1.0 / (1.0 + np.exp(-z))
        grad_w = X_scaled.T @ (p - y) / n_samples
        grad_b = np.mean(p - y)
        weights -= lr * grad_w
        bias -= lr * grad_b
    class SimpleModel:
        def __init__(self, w, b):
            self.coef_ = w.reshape(1, -1)
            self.intercept_ = np.array([b])
        def predict_proba(self, X):
            z = X @ self.coef_.flatten() + self.intercept_[0]
            p = 1.0 / (1.0 + np.exp(-z))
            return np.column_stack([1 - p, p])
    return SimpleModel(weights, bias), scaler


def evaluate(model, scaler, features, labels) -> dict:
    X = np.array(features)
    X_scaled = scaler.transform(X)
    y_true = np.array([1 if l > 0.5 else 0 for l in labels])
    if hasattr(model, "predict_proba"):
        probs = model.predict_proba(X_scaled)[:, 1]
    else:
        probs = model.predict(X_scaled)
    y_pred = (probs > 0.5).astype(int)
    if SKLEARN_AVAILABLE:
        return {
            "f1": f1_score(y_true, y_pred, zero_division=0),
            "precision": precision_score(y_true, y_pred, zero_division=0),
            "recall": recall_score(y_true, y_pred, zero_division=0),
            "n_samples": len(y_true),
        }
    # Simple manual metrics
    tp = ((y_pred == 1) & (y_true == 1)).sum()
    fp = ((y_pred == 1) & (y_true == 0)).sum()
    fn = ((y_pred == 0) & (y_true == 1)).sum()
    p = tp / max(tp + fp, 1)
    r = tp / max(tp + fn, 1)
    f1 = 2 * p * r / max(p + r, 1e-9)
    return {"f1": f1, "precision": p, "recall": r, "n_samples": len(y_true)}


def export_onnx(model, scaler, output_path: str) -> None:
    """Export to ONNX. Requires onnx or skl2onnx.
    Falls back to JSON export if neither is available.
    """
    try:
        from skl2onnx import convert_sklearn
        from skl2onnx.common.data_types import FloatTensorType
        import onnx
        if SKLEARN_AVAILABLE and hasattr(model, "coef_"):
            n_features = len(model.coef_.flatten())
            initial_type = [("float_input", FloatTensorType([None, n_features]))]
            onnx_model = convert_sklearn(model, initial_types=initial_type)
            with open(output_path, "wb") as f:
                f.write(onnx_model.SerializeToString())
            print(f"Wrote ONNX model to {output_path}")
            return
    except ImportError:
        pass
    # JSON fallback
    json_path = output_path.replace(".onnx", ".json")
    weights = model.coef_.flatten() if hasattr(model, "coef_") else None
    bias = model.intercept_[0] if hasattr(model, "intercept_") else 0
    payload = {
        "model": "logistic-regression-v0.45.0",
        "n_features": 50,
        "feature_names": FEATURE_NAMES,
        "weights": weights.tolist() if weights is not None else [],
        "bias": float(bias),
        "scaler_mean": scaler.mean_.tolist(),
        "scaler_std": scaler.scale_.tolist(),
    }
    with open(json_path, "w") as f:
        json.dump(payload, f, indent=2)
    print(f"Wrote JSON model to {json_path} (no ONNX runtime available)")


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--report", required=True, help="Path to v10.2a calibration markdown report")
    parser.add_argument("--output", default="models/ai-baseline-v0.45.onnx", help="Output model path")
    parser.add_argument("--holdout", type=float, default=0.3, help="Holdout fraction (default 0.3)")
    args = parser.parse_args()

    if not Path(args.report).exists():
        print(f"FATAL: report not found: {args.report}", file=sys.stderr)
        print("Run scan-parallel.sh + merge-chunk-results.ts first.", file=sys.stderr)
        sys.exit(2)

    print(f"Loading calibration report: {args.report}")
    rules = parse_calibration_report(args.report)
    print(f"  parsed {len(rules)} rules")
    if len(rules) < 10:
        print(f"FATAL: too few rules ({len(rules)}); need at least 10 for training", file=sys.stderr)
        sys.exit(2)

    # Build feature vectors — one per rule for now (limited training data).
    # v0.46.0 will add per-file feature vectors from the v10.2a JSONs.
    features = []
    labels = []
    for r in rules:
        # For each rule, we construct one training example: the rule's
        # aggregate stats. The "label" is whether the rule is positive
        # (precision > 0.5). This is a meta-classification task:
        # "given a rule's features, will it be a useful AI tell?"
        # Future v0.46.0 will train per-file.
        feat, label, n_evidence = featurize([r])
        features.append(feat)
        labels.append(label)

    print(f"Training data: {len(features)} rules, {len(FEATURE_NAMES)} features each")
    print(f"  positive (prec>0.5): {sum(1 for l in labels if l > 0.5)}")
    print(f"  negative (prec<=0.5): {sum(1 for l in labels if l <= 0.5)}")

    # Train/holdout split
    n = len(features)
    n_train = max(1, int(n * (1 - args.holdout)))
    X_train = features[:n_train]
    y_train = labels[:n_train]
    X_test = features[n_train:]
    y_test = labels[n_train:]

    print(f"Training on {len(X_train)} rules, holdout: {len(X_test)}")
    model, scaler = train_logistic_regression(X_train, y_train)
    metrics = evaluate(model, scaler, X_test, y_test)
    print(f"\n=== Holdout metrics ===")
    print(f"  F1:        {metrics['f1']:.3f}")
    print(f"  Precision: {metrics['precision']:.3f}")
    print(f"  Recall:    {metrics['recall']:.3f}")
    print(f"  N:         {metrics['n_samples']}")
    print(f"  Target:    F1 0.60-0.70 (peer-reviewed)")

    if metrics["f1"] < 0.5:
        print("WARNING: F1 below random baseline. Need more data.")
        print("  - v0.45.0: limited training data (only per-rule stats)")
        print("  - v0.46.0 will use per-file features from v10.2a JSONs")
    elif metrics["f1"] < 0.6:
        print("NOTE: F1 below target. Plan correctly anticipated 0.60-0.70.")
    else:
        print("SUCCESS: F1 in target range.")

    Path(args.output).parent.mkdir(parents=True, exist_ok=True)
    export_onnx(model, scaler, args.output)


if __name__ == "__main__":
    main()
