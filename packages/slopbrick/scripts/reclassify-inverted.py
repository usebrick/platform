#!/usr/bin/env python3
"""Reclassify INVERTED rules as code-hygiene (aiSpecific: false).

The 21 INVERTED rules all detect real code-hygiene issues (mixed import
conventions, multiple components per file, etc.) that happen to be more
common in human-written code than in AI-generated code. They are not AI
detectors. This script updates each rule's `aiSpecific: true` to
`aiSpecific: false`.

Run from packages/slopbrick:
    python3 scripts/reclassify-inverted.py
"""
import re
from pathlib import Path

INVERTED_RULE_IDS = [
    "logic/boundary-violation",
    "typo/math-button-label-uniformity",
    "component/multiple-components-per-file",
    "context/import-path-mismatch",
    "logic/key-prop-missing",
    "logic/math-variable-name-entropy",
    "security/public-admin-route",
    "security/unsafe-html-render",
    "db/missing-not-null",
    "docs/broken-link",
    "docs/expired-code-example",
    "docs/stale-package-reference",
    "product/terminology-drift",
    "security/exposed-env-var",
    "layout/gap-monopoly",
    "visual/spacing-scale-violation",
    "visual/inline-style-dominance",
    "wcag/dragging-movements",
    "logic/heaps-deviation",
    "logic/ks-distribution-shift",
    "logic/zipf-slope-anomaly",
]

RULES_DIR = Path("src/rules")


def rule_id_from_filename(filename: str) -> str:
    """Convert kebab-case filename to ruleId, e.g. boundary-violation -> logic/boundary-violation."""
    return f"logic/{filename.replace('.ts', '')}"


def find_rule_file(category: str, name: str) -> Path | None:
    candidates = list(RULES_DIR.glob(f"{category}/{name}.ts"))
    if candidates:
        return candidates[0]
    return None


def update_rule_file(path: Path, new_ai_specific: bool) -> bool:
    """Update the aiSpecific field in a rule file. Returns True if changed."""
    content = path.read_text()
    if "aiSpecific:" in content:
        # Replace existing aiSpecific: <bool>
        new_content = re.sub(
            r"(\baiSpecific:\s*)(true|false)",
            rf"\g<1>{str(new_ai_specific).lower()}",
            content,
            count=1,
        )
    else:
        # Insert aiSpecific after category: 'xxx',
        new_content = re.sub(
            r"(category:\s*['\"][^'\"]+['\"],\n)",
            rf"\g<1>  aiSpecific: {str(new_ai_specific).lower()},\n",
            content,
            count=1,
        )
    if new_content == content:
        return False
    path.write_text(new_content)
    return True


def main():
    changed = []
    skipped = []
    for rule_id in INVERTED_RULE_IDS:
        category, name = rule_id.split("/", 1)
        path = find_rule_file(category, name)
        if not path:
            skipped.append((rule_id, "file not found"))
            continue
        if update_rule_file(path, new_ai_specific=False):
            changed.append(rule_id)
        else:
            skipped.append((rule_id, "no change"))
    print(f"Updated {len(changed)} rules: aiSpecific: true -> false")
    for rid in changed:
        print(f"  {rid}")
    if skipped:
        print(f"\nSkipped {len(skipped)} rules:")
        for rid, reason in skipped:
            print(f"  {rid}: {reason}")


if __name__ == "__main__":
    main()
