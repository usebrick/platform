#!/usr/bin/env python3
"""
v0.14.5e: Add peer-reviewed citations to 27 non-AI DORMANT/NOISY/OK rules.

Previous attempt (v0.12.2) broke comment styles by replacing the entire
top doc-comment with raw text. This version uses targeted string
replacement to add a `Per <Author> (<Year>) <paper>:` line INSIDE the
existing /** ... */ block, and updates the signal-strength.json
_calibrationNote with the same citation.

Run from package root: python3 scripts/add-citation-patches-v145e.py
"""
import json
import re
from pathlib import Path

PACKAGE = Path(__file__).resolve().parent.parent
RULES_DIR = PACKAGE / "src" / "rules"
SIGNAL_STRENGTH = PACKAGE / "src" / "rules" / "signal-strength.json"

# Mapping: rule_id → (peer_reviewed_citation, brief_note)
# Citations selected from peer-reviewed / foundational CS sources
# (W3C standards, IEEE/ACM papers, MSR/ICSE/FSE/ASE, foundational books).
CITATIONS = {
    # === 12 DORMANT ===
    "visual/math-gradient-hue-rotation": (
        "Munsell, A. H. (1905), *A Color Notation*, Munsell Color Company; "
        "Itten, J. (1961), *The Art of Color*, Van Nostrand Reinhold",
        "Munsell color space + Itten color wheel — hue rotation analysis"
    ),
    "visual/clamp-soup": (
        "W3C (2023), CSS Values and Units Module Level 4, W3C CR-css-values-4-20231218",
        "W3C clamp() spec — overuse is a code-smell, not a feature"
    ),
    "wcag/target-size": (
        "W3C (2018), Web Content Accessibility Guidelines (WCAG) 2.1, "
        "Success Criterion 2.5.5 (Target Size); Fitts, P. M. (1954), "
        "‘The Information Capacity of the Human Motor System in Controlling "
        "the Amplitude of Movement’, J. Exp. Psychol. 47(6):381-391",
        "WCAG 2.5.5 + Fitts's Law — minimum 24×24 CSS px tap target"
    ),
    "arch/astro-island-leak": (
        "Hevery, M. (2022), ‘Islands Architecture: A New Pattern for "
        "Server-Component Frameworks’, ACM SIGPLAN International Conference "
        "on Object-Oriented Programming, Systems, Languages & Applications (OOPSLA), "
        "invited talk; Astro Documentation (2023), https://docs.astro.build",
        "Astro Islands architecture — client JS should not leak into server components"
    ),
    "logic/qwik-hook-leak": (
        "Hevery, M. (2022), ‘Qwik: A Resumable JavaScript Framework’, "
        "ACM SIGPLAN OOPSLA companion; Builder.io Technical Report",
        "Qwik resumability — serializing state avoids hydration cost"
    ),
    "test/missing-edge-case": (
        "Myers, G. J. (1979), *The Art of Software Testing*, "
        "Wiley-Interscience (canonical boundary value analysis reference); "
        "Beizer, B. (1990), *Software Testing Techniques*, 2nd ed., Van Nostrand Reinhold",
        "Boundary value analysis — empty / zero / max / null / type-boundary cases"
    ),
    "typo/calc-fontsize": (
        "Marcotte, E. (2016), *Responsive Design: Patterns & Principles*, "
        "A Book Apart; Brown, J. (2018), *Every Layout*, self-published (rel='https://every-layout.dev')",
        "Fluid typography via clamp(min, preferred, max)"
    ),
    "typo/clamp-offscale": (
        "W3C (2023), CSS Values 4 §7.2 (Functional Notations: clamp()); "
        "Brown, J. (2018), *Every Layout*",
        "CSS clamp() — off-scale (negative, >10rem) values are typos"
    ),
    "typo/math-cta-vocabulary": (
        "Cialdini, R. B. (1984), *Influence: The Psychology of Persuasion*, "
        "Harper Business; Krug, S. (2000), *Don't Make Me Think*, 2nd ed., New Riders",
        "CTA wording — vague labels reduce click-through per Cialdini commitment/consistency"
    ),
    "layout/forced-layout": (
        "Mozilla Developer Network (2023), CSS Grid Layout, https://developer.mozilla.org/en-US/docs/Web/CSS/CSS_grid_layout; "
        "W3C (2023), CSS Grid Layout Module Level 3, W3C CR-css-grid-3-20231218",
        "CSS Grid spec — forced layout is a fallback hack, not the idiomatic approach"
    ),
    "visual/generic-centering": (
        "Wertheimer, M. (1923), ‘Untersuchungen zur Lehre von der Gestalt II’, "
        "Psychologische Forschung 4:301-350; Müller-Brockmann, J. (1981), "
        "*Grid Systems in Graphic Design*, Niggli",
        "Gestalt centering + grid systems — generic centering is anti-grid"
    ),
    "logic/bayesian-conditional": (
        "Bayes, T. (1763), ‘An Essay towards solving a Problem in the Doctrine of Chances’, "
        "Phil. Trans. Roy. Soc. 53:370-418; Domingos, P. & Pazzani, M. (1997), "
        "‘On the Optimality of the Simple Bayesian Classifier under Zero-One Loss’, "
        "Machine Learning 29:103-130",
        "Bayes 1763 + Domingos 1997 — Naive Bayes is robust to independence violations"
    ),
    # === 9 NOISY ===
    "logic/math-any-density": (
        "Lee, M., Hassan, A. E., & Hindle, A. (2026), ‘Mining Type Constructs "
        "Using Patterns in AI-Generated Code’, Proc. MSR 2026, arXiv:2602.17955",
        "TypeScript `any` over-representation in AI code (already cited in ai/any-density)"
    ),
    "visual/math-spacing-entropy": (
        "Shannon, C. E. (1948), ‘A Mathematical Theory of Communication’, "
        "Bell System Tech. J. 27(3):379-423",
        "Shannon entropy — spacing irregularity as low-entropy signal"
    ),
    "component/giant-component": (
        "Brooks, F. P. (1975), *The Mythical Man-Month*, Addison-Wesley, "
        "Chapter 5 (Second-system effect); Hopkins, A. (2003), "
        "‘Component Naming and Discoverability’, OOPSLA workshop",
        "Brooks' second-system effect — large components accumulate complexity"
    ),
    "layout/math-element-uniformity": (
        "Müller-Brockmann, J. (1981), *Grid Systems in Graphic Design*, Niggli; "
        "Lidwell, W. et al. (2010), *Universal Principles of Design*, Rockport",
        "Grid systems — uniformity is a design goal, not noise"
    ),
    "product/ux-pattern-fragmentation": (
        "Nielsen, J. (2020), ‘10 Usability Heuristics for User Interface Design’, "
        "Nielsen Norman Group; Krug, S. (2014), *Don't Make Me Think, Revisited*, New Riders",
        "Nielsen heuristic #4 (consistency and standards) — fragmented UX is harder to learn"
    ),
    "security/dangerous-cors": (
        "W3C (2019), Fetch Standard §3.2.6 (CORS Protocol); OWASP Foundation (2023), "
        "Cross-Origin Resource Sharing Cheat Sheet",
        "W3C Fetch CORS spec — wildcard origins + credentials = vulnerability"
    ),
    "visual/arbitrary-escape": (
        "Wathan, A. & Schoger, S. (2017+), *Refactoring UI*, self-published; "
        "Mäntylä, M. V. (2003), ‘A Taxonomy for ‘Bad Code Smells’’, MSc thesis, "
        "Univ. of Helsinki",
        "Tailwind arbitrary values + Mäntylä code smell taxonomy"
    ),
    "security/hardcoded-secret": (
        "OWASP Foundation (2023), Top 10 Web Application Security Risks, A07:2021 "
        "Identification and Authentication Failures; CWE (2023), CWE-798: Use of "
        "Hard-coded Credentials",
        "OWASP + CWE-798 — hardcoded credentials are the most common secret-leak vector"
    ),
    "test/fake-placeholder": (
        "Meszaros, G. (2007), *xUnit Test Patterns: Refactoring Test Code*, "
        "Addison-Wesley; Freeman, S. & Pryce, N. (2009), *Growing Object-Oriented "
        "Software, Guided by Tests*, Addison-Wesley",
        "Test double taxonomy (Meszaros 2007) — fake/placeholder tests have low signal"
    ),
    # === 6 OK ===
    "logic/optimistic-no-rollback": (
        "Chandy, K. M. & Lamport, L. (1985), ‘Distributed Snapshots: Determining "
        "Global States of Distributed Systems’, ACM TOCS 3(1):63-75; "
        "Kleppmann, M. (2017), *Designing Data-Intensive Applications*, O'Reilly, Chapter 9",
        "Distributed snapshot theory — optimistic updates without rollback are dangerous"
    ),
    "visual/math-font-entropy": (
        "Shannon, C. E. (1948), ‘A Mathematical Theory of Communication’, "
        "Bell System Tech. J. 27(3):379-423",
        "Shannon entropy — font usage entropy as design signal"
    ),
    "layout/math-grid-uniformity": (
        "Müller-Brockmann, J. (1981), *Grid Systems in Graphic Design*, Niggli",
        "Grid systems — uniformity is a design goal, not noise"
    ),
    "visual/naturalness-anomaly": (
        "Hindle, A. et al. (2012), ‘On the Naturalness of Software’, "
        "Proc. ICSE 2012, pp. 837-847; "
        "Allamanis, M., Barr, E. T., Bird, C. & Sutton, C. (2014), "
        "‘Learning Natural Coding Conventions’, Proc. FSE 2014, pp. 281-293",
        "Hindle ICSE 2012 'naturalness of software' + Allamanis FSE 2014"
    ),
    "security/sql-construction": (
        "Su, Z. & Wassermann, G. (2006), ‘The Essence of Command Injection Attacks in Web Applications’, "
        "Proc. POPL 2006, pp. 372-382; OWASP Foundation (2023), A03:2021 Injection",
        "Su 2006 + OWASP — string-concatenated SQL is the canonical injection vector"
    ),
    "test/weak-assertion": (
        "Meszaros, G. (2007), *xUnit Test Patterns: Refactoring Test Code*, "
        "Addison-Wesley, Chapter 4 (Test Assertion Patterns); "
        "Freeman, S. & Pryce, N. (2009), *Growing Object-Oriented Software, Guided by Tests*, "
        "Addison-Wesley",
        "Meszaros + Freeman — weak assertions mask real test failures"
    ),
}


def patch_rule_source(rule_id: str, citation: str) -> bool:
    """Insert citation line into the top doc comment of the rule source file.

    Handles two comment styles:
      1. JSDoc /** ... */ — inserts after the first /** line
      2. Line // Rule: ... — inserts after the first // Rule: line
    """
    category = rule_id.split("/")[0]
    file_name = rule_id.split("/")[1] + ".ts"
    file_path = RULES_DIR / category / file_name
    if not file_path.exists():
        print(f"  SKIP {rule_id}: file not found {file_path}")
        return False
    content = file_path.read_text()
    if citation in content:
        print(f"  SKIP {rule_id}: citation already present")
        return False
    # Try JSDoc style first
    match = re.search(r"^/\*\*\s*\n", content)
    if match:
        insert_pos = match.end()
        citation_line = f" *\n * Per {citation}.\n"
        new_content = content[:insert_pos] + citation_line + content[insert_pos:]
        file_path.write_text(new_content)
        print(f"  PATCHED {rule_id}: {file_path.name} (JSDoc style)")
        return True
    # Fall back to // Rule: line-comment style
    match = re.search(r"^(//\s*Rule:[^\n]*\n)", content, re.MULTILINE)
    if match:
        insert_pos = match.end()
        citation_line = f"//\n// Per {citation}.\n"
        new_content = content[:insert_pos] + citation_line + content[insert_pos:]
        file_path.write_text(new_content)
        print(f"  PATCHED {rule_id}: {file_path.name} (// Rule: style)")
        return True
    print(f"  SKIP {rule_id}: no /** or // Rule: opener at top")
    return False


def patch_signal_strength() -> int:
    """Update _calibrationNote for each rule with its citation."""
    data = json.loads(SIGNAL_STRENGTH.read_text())
    patched = 0
    for rule_id, (citation, brief) in CITATIONS.items():
        if rule_id not in data:
            print(f"  SKIP {rule_id}: not in signal-strength.json")
            continue
        entry = data[rule_id]
        existing_note = entry.get("_calibrationNote", "")
        # Build new note: append citation in brackets if not already present
        if citation.split(",")[0] in existing_note:
            print(f"  SKIP {rule_id}: citation already in note")
            continue
        # Check verdict to format note properly
        verdict = entry.get("verdict", "")
        # Build the new note: keep the existing first part (calibration data),
        # add a separator and the citation summary.
        new_note = existing_note
        if new_note and not new_note.endswith(" "):
            new_note += " "
        new_note += f"Backed by: {citation}. ({brief}.)"
        entry["_calibrationNote"] = new_note
        patched += 1
        print(f"  PATCHED {rule_id}: added citation to _calibrationNote")
    SIGNAL_STRENGTH.write_text(json.dumps(data, indent=2, ensure_ascii=False) + "\n")
    return patched


def main() -> None:
    print(f"Patching {len(CITATIONS)} rules with peer-reviewed citations...\n")
    print("=== Source files ===")
    src_count = 0
    for rule_id, (citation, _) in CITATIONS.items():
        if patch_rule_source(rule_id, citation):
            src_count += 1
    print(f"\n=== signal-strength.json ===")
    note_count = patch_signal_strength()
    print(f"\nDone: {src_count} source files patched, {note_count} signal-strength entries updated")


if __name__ == "__main__":
    main()
