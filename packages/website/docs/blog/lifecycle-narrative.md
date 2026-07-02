---
title: "The four-stage code quality lifecycle: why 'detect and fix' isn't enough"
description: "Most code quality tools stop at detection. Some go to detect + fix. Neither is a lifecycle. Here's the four-stage model that actually compounds — Define, Detect, Prevent, Repair — and the v0.20.0 evidence it works."
date: 2026-07-01
author: dystx (with Kimi Code CLI)
tags: [lifecycle, code-quality, ai-coding, detect-fix-verify]
---

# The four-stage code quality lifecycle

Most code quality tools stop at detection. Some go to *detect + fix*. A handful promise *detect + fix + verify*. All three are **point solutions** — they answer the question "is there a problem right now?" but not "is the codebase getting structurally healthier over time?"

The difference between a point solution and a lifecycle is the difference between a smoke detector and a fire department. A smoke detector tells you there's smoke. A fire department has people, trucks, codes, and a chain of command. The smoke detector is necessary; it's just not sufficient.

The usebrick platform is built around a four-stage lifecycle: **Define, Detect, Prevent, Repair**. Each stage has a dedicated product, each product has a dedicated contract, and the lifecycle compounds — every Detect finding makes the Define more precise, every Repair makes the Prevent cheaper. This post walks through the lifecycle, explains why each stage matters, and shows what the v0.20.0 release proves about the model.

## The four stages

### 1. Define — the intended structure

The first stage is the one most tools skip, and the one that determines whether the other three can work at all. **Define** is the act of declaring what the codebase *should* look like, in a form a machine can read.

In slopbrick, the Define stage lives in the **Constitution** — a versioned allow-list + deny-list of patterns, identifiers, and architectural decisions. The Constitution is a JSON file in `.slopbrick/constitution.json`. It is the only authoritative source for "what's allowed in this codebase" and it's the input to every other stage.

Why this matters: without a declared intent, detection is just *pattern matching against the language*. `useState` is fine in React, but not in a server component. `SELECT *` is fine in a one-off script, but not in a query layer. Without Define, the tool has no way to know which is which — it just fires rules and produces noise.

### 2. Detect — the actual structure

**Detect** is the scanner. It reads the codebase, fingerprints it, and compares it to the Define. In slopbrick, this is the CLI (`slopbrick scan`), the 117 rules across 16 categories, the 4-score model (visual, typo, wcag, layout), and the signal-strength calibration that tells you which rules actually fire reliably in real codebases.

The Detect stage is the most visible part of any code quality tool. It's also the easiest to copy. Every competitor has a scanner. The moat is not in the scanner; the moat is in the calibration — knowing which of your 117 rules actually work (recall/FP ratio ≥ 1.5×) and which are inverted (TP=0, vacuous).

### 3. Prevent — the structural immune system

**Prevent** is the stage that turns findings into structural rules. Once you know a class of violation exists, you block its reintroduction. In slopbrick, this is the **LockBrick** product (planned) and the pre-commit + CI integration. The `dup/identical-block` rule is a working example: it detects near-duplicate code blocks, and the Prevent stage turns that detection into a CI gate that fails the build if a new duplicate is introduced.

Most tools stop at Detect. Some go to Detect + Repair. The Prevent stage is what makes the lifecycle *compound*: every Prevent rule means a Detect finding never reappears. Over 18 months, the codebase gets structurally healthier even if the team never actively repairs anything.

### 4. Repair — the migrator

**Repair** is the stage that closes the loop on existing violations. Once you've detected 10,000 `useState` calls in server components, you don't want to fix them by hand. **MendBrick** (planned) is the auto-migrator — it takes a Detect finding, applies a defined transformation, and verifies the result still type-checks and still passes the Detect stage.

Repair is also the stage where the lifecycle gets tested. A repair that introduces a new violation is worse than no repair. The verification step (run Detect after Repair, compare scores) is what makes Repair trustworthy.

## Why the lifecycle compounds

The four stages are not a sequence — they're a cycle. Detect findings inform Define (a rule that fires 90% false positives should be retired, or the Define should be tightened so the rule fires less). Repair outcomes inform Prevent (a class of violations that's expensive to repair should be Prevented earlier). Define changes inform Detect (a new architectural decision in the Constitution should produce new detection rules).

This is why "detect and fix" is a point solution and a lifecycle is a moat. A point solution answers today's question. A lifecycle makes tomorrow's question easier than today's. The v0.20.0 release is the latest evidence this works.

## What v0.20.0 proves

v0.20.0 shipped three changes that are each impossible in a "detect and fix" model and natural in a four-stage lifecycle:

**R-INVERTED: retiring `docs/expired-code-example`.** The v0.18.9 v8.5 calibration showed this rule was INVERTED — TP=0, vacuous. A detect-and-fix tool would leave the rule in the registry, because the rule "works" (it runs, it fires, it produces output). A four-stage lifecycle retires the rule. The Define stage (the rule no longer matches the intended structure) overrides the Detect stage (the rule still fires on some patterns). v0.20.0 removes the rule, updates the `DOC_RULE_WEIGHTS` sum (14 → 10), and the registry drops from 112 to 117 rules (net +5 after adding 6 Java rules). The lifecycle is self-correcting.

**R9 chronic-offender refactor: −114 net lines of test duplication.** This is the Repair stage in the codebase itself. `tests/cli.test.ts` and `tests/engine/structure.test.ts` had 6 and 7 copies respectively of the per-describe temp-dir boilerplate. The Repair stage hoists the pattern to file scope and removes the duplicates. A detect-and-fix tool would have flagged the duplication (and slopbrick's `dup/identical-block` rule *can* flag it) but wouldn't have *fixed* it. The lifecycle does.

**6 new Java rules, shipped DORMANT.** This is the Detect stage being honest about its own calibration. The rules (`java/system-out-println`, `java/empty-catch-block`, `java/arraylist-vs-linkedlist`, `java/legacy-date-api`, `java/raw-type-overuse`, `java/string-concat-loop`) are real rules with real RULE_HINTS and real signal-strength entries. They're marked `defaultOff: true` because the v9 Java corpus build (the calibration step) hasn't happened yet. A detect-and-fix tool would either ship the rules as default-on (and flood users with false positives until the corpus is built) or not ship them at all (and lose the head start). A four-stage lifecycle ships the rules dormant, calibrates them against the corpus, and flips `defaultOff: false` only when the signal-strength verdict is OK or better.

These three changes are not features. They are evidence that the lifecycle is operating.

## The four products

| Stage | Product | Status |
|-------|---------|--------|
| Define | **PickBrick** (the Constitution) | planned |
| Detect | **SlopBrick** (the scanner) | shipped as `slopbrick@0.20.0` on npm |
| Prevent | **LockBrick** (the CI gate) | planned |
| Repair | **MendBrick** (the migrator) | planned |

Three of the four products are still planned. That's honest. The Detect stage is the one that's productionized today, and it's the one the rest of the lifecycle depends on. The Constitution format that PickBrick will use is already shipping inside slopbrick (every `.slopbrick/constitution.json` is a Define artifact), so the v0.21+ roadmap is mostly about widening what already exists, not inventing new contracts.

## The moat

The lifecycle is the durable advantage, not any single rule or any single product. A competitor can copy the 117 rules. They can copy the 4-score model. They can copy the OIDC trusted publishing and the changesets release flow. What they can't copy — easily, quickly, or completely — is the *calibration discipline* that comes from running the lifecycle against a real corpus for 18 months.

The calibration is the moat. It's also the part that doesn't fit on a marketing page. v0.20.0's R-INVERTED removal is a one-line change in the CHANGELOG, but it represents a rule that lived in the registry for 3 versions, fired on thousands of codebases, and was retired only because the v0.18.9 v8.5 calibration showed it was vacuous. The discipline to retire a rule that "works" because the data says it's wrong is what makes the lifecycle compound.

If you're evaluating code quality tools, ask three questions:

1. **Can you retire a rule that fires but is inverted?** Most tools can't — the rule is "working" by the tool's own metrics. The lifecycle forces the answer.
2. **Can you ship a rule dormant until the corpus says it's ready?** Most tools ship everything default-on and let the user deal with the noise. The lifecycle gates on calibration.
3. **Can the Repair stage verify itself by re-running Detect?** Most tools trust the repair's own test suite, which doesn't catch regressions in unrelated rules. The lifecycle uses Detect as the verifier.

If the tool you're using answers "no" to all three, you're using a point solution, not a lifecycle. The four-stage model is harder to build and slower to ship. It's also the only thing that gets structurally healthier over time.

## What's next

- v0.21 (planned): the first changesets-driven release; Kotlin + Swift detection rules (DORMANT until corpus); `dup/identical-block` v2 with token shingling + MinHash + LSH banding.
- v0.22 (planned): C++ detection; LockBrick CI gate spec; the first controlled-eval harness for `slop_suggest_with_structure` (proving agents actually conform, not just that rules are calibrated).
- Long-term: PickBrick (Define) and MendBrick (Repair) as standalone products. The contracts already exist inside slopbrick; the products are mostly packaging.

The lifecycle is the answer to "why is this more than a linter?" If you've ever watched a linter's findings pile up across releases — same warnings, same violations, same noise — the answer is that detection alone is a treadmill. The four-stage model is a compounding investment.
