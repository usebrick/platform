# v0.18.0 Plan — Dead-Code Detection + 95-Rule Recalibration

> **Status:** Planning. Not started. Owner: maintainer.
> **Target release:** v0.18.0 (next minor, after v0.17.x)
> **Created:** 2026-06-30, after the v0.17.3 review surfaced the gap.

This plan addresses two related concerns:

1. **Slopbrick doesn't currently detect the kind of dead code that AI tools leave behind** when they refactor. The 95 rules have one narrow `logic/zombie-state` rule that catches unread `useState` bindings (4.86× lift AI vs human). They don't catch the broader categories: dead exports, dead functions, dead types, dead props, dead config, dead migrations.

2. **The 95-rule catalog is starting to be a large number**, and the calibration data reveals that 27 of them are `DORMANT` (never fire in the corpus) and 35 have `recall: 0`. These are calibration debt that erodes user trust when users see "0 issues" in a long list of `defaultOff` rules.

Both are real, both are large, both can be done as a single coordinated release.

---

## Part 1 — What slopbrick currently catches for "AI left code behind"

| Rule | What it catches | What it misses |
|---|---|---|
| `logic/zombie-state` | `useState` declared+set but never read (v6: 4.86× lift AI vs human) | function-level dead code, dead exports, dead imports, dead branches, dead props |
| `test/duplicate-setup` | Repeated test scaffolding | n/a |
| `context/import-path-mismatch` | Imports that don't resolve | dead exports (imports with no callers) |
| `product/terminology-drift` | 3+ semantically-similar names | n/a |

**The gap.** The categories of dead code that AI reworks and leaves behind:

- **Dead exports** — `function helper()` declared and never imported anywhere after a refactor
- **Dead functions** — non-export helpers defined but never called
- **Dead branches** — `if (false) {...}` after a feature flag was removed
- **Dead props** — `<Component prop={x} />` where the prop was removed from the component
- **Dead config** — entries in `package.json`, `tsconfig.json`, `vitest.config.ts`, `tailwind.config.js` no longer referenced
- **Dead types** — interfaces/types declared but never imported (orphan types)
- **Dead migrations** — `migrations/0001_init.sql` superseded by 0002

The existing `logic/zombie-state` only catches one narrow pattern. AI tools systematically leave all these forms behind.

---

## Part 2 — 95 rules: recalibration audit data

From `packages/slopbrick/src/rules/signal-strength.json` as of 2026-06-30:

| Verdict | Count | defaultOff? | Meaning |
|---|---|---|---|
| USEFUL | 32 | all ON | High precision + high lift |
| OK | 6 | all ON | Moderate signal |
| HYGIENE | 24 | 1 OFF (`security/public-admin-route`) | Non-AI code-quality |
| NOISY | 5 | all OFF | Fires on both classes |
| INVERTED | 1 | OFF | Fires more on negative class |
| DORMANT | 27 | all OFF | **Never fires** |
| **Total** | **95** | | |

**Key observations**:
- **27 DORMANT rules** (28% of the catalog) — have `recall: 0` AND `fpRate: 0` in the calibration corpus
- **35 rules with `recall: 0`** (broader set, includes USEFUL rules like `perf/halstead-anomaly` that haven't fired in 6+ months)
- **5 NOISY rules** — actively harmful (auto-suppressed to protect CI gate integrity, but they show up in the count)
- **Last calibration: 2026-06-25 to 2026-06-30** — very recent. The data is fresh; the issue is the rules themselves, not stale data.

---

# Recalibration Plan: 4-phase approach

## Phase 1 — Audit (no code changes)

**Goal**: For each of the 27 DORMANT + 8 USEFUL-with-recall-0 = 35 zero-recall rules, determine the disposition: **delete | fix | keep-with-corpus**.

**Steps**:
1. Run `slopbrick scan` against the current 5-corpus calibration set (comfyui, fastchat, elevenlabs-js, elevenlabs-python, chatglm). Tag the calibration run with the rule set as of v0.17.3.
2. For each of the 35 zero-recall rules, classify:
   - **Type A — never-fires because the rule is broken**: a typo, a wrong AST pattern, a regex that never matches. **Fix the rule** (low cost, immediate value).
   - **Type B — never-fires because the corpus doesn't exercise the pattern**: e.g. `db/missing-fk-index` against 5 frontend-heavy corpora. **Add 1+ corpus fixture** (medium cost) OR **delete the rule** if the corpus isn't worth maintaining.
   - **Type C — never-fires because the pattern is rare in real code**: e.g. `arch/astro-island-leak` against non-Astro code. **Mark for corpus expansion** (deferred; not a v0.18.0 priority).
   - **Type D — rule is correct but should be INVERTED/HYGIENE, not USEFUL**: e.g. `perf/halstead-anomaly` is `recall: 0` with `USEFUL` verdict — clearly miscalibrated. **Reclassify**.
3. Output: a CSV at `docs/research/rule-audit-v0.18.0.csv` with one row per zero-recall rule: `rule_id | current_verdict | current_recall | current_fpr | disposition | rationale | action`.

**Acceptance criteria**:
- All 35 zero-recall rules have a documented disposition
- Disposition breakdown: X Type A (fix), Y Type B (corpus or delete), Z Type C (deferred), W Type D (reclassify)

**Quality gates**: the CSV is the only output of this phase. No code changes.

**Risks**: misclassifying a high-signal rule as "never fires" (the corpus might just be wrong). Mitigation: the disposition is reviewed by a human who knows the rule's intent, not just the numbers.

**Rollback**: trivial (no code changed).

---

## Phase 2 — Reclassify + Delete (mechanical, ~50 rules)

**Goal**: Apply the dispositions from Phase 1. No new logic, just reclassification + deletion.

**Steps**:
1. **Delete rules** classified as Type A-broken or Type B-not-worth-keeping. Expect ~15-25 rules removed.
2. **Reclassify** USEFUL→HYGIENE or USEFUL→DORMANT for the miscalibrated ones (Type D). Adjust `defaultOff` to match.
3. Update `RULE_HINTS` in `src/snippet/data.ts` to match (the codegen assertion `RULE_HINTS.length === 95` will need to become `<= 95`).
4. Update `signal-strength.json` to remove deleted rules + change verdicts.
5. Update AGENTS.md "95 rules" claim → the new count.
6. Update website Hero eyebrow + live-terminal.ts: "95 rules" → new count.
7. Update `packages/slopbrick/README.md` rule count.

**Acceptance criteria**:
- `pnpm test` passes (the rule registry auto-asserts at build time)
- `slopbrick scan` runs cleanly with no removed rules referenced
- AGENTS.md, README, Hero, live-terminal all show the new count
- `signal-strength.json` is internally consistent (every rule referenced in `RULE_HINTS` is in `signal-strength.json` and vice versa)

**Quality gates**:
- `pnpm -r typecheck` — clean
- `pnpm -r test` — all pass
- `slopbrick scan` runs without rule-lookup errors

**Risks**:
- Removing a rule that downstream consumers depend on (none expected — the rules are advisory, not part of the public API)
- Mismatch between `RULE_HINTS` and `signal-strength.json` (the auto-generation should catch this, but verify)
- Documentation drift (already mitigated by the AGENTS.md / README / Hero update)

**Rollback**: `git revert`. The Phase 2 commit should be a single atomic commit so revert is one step.

---

## Phase 3 — Add dead-code detection rules

**Goal**: Close the gap on AI-left-behind dead code. Add 3-5 new rules covering the high-value patterns.

**Proposed new rules** (priority-ordered):

1. **`logic/dead-export`** (priority: P0)
   - Detects: exported functions/classes/types that have zero importers in the codebase + zero in any `node_modules` declaration
   - Why: AI refactors often leave the old function exported "just in case" — the codebase grows linearly with no one calling it
   - Algorithmic: walk `ExportNamedDeclaration` / `ExportDefaultDeclaration`, check if the exported name appears in any `ImportSpecifier` / `ImportDefaultSpecifier` / `ImportNamespaceSpecifier` across the codebase
   - Severity: low (false positive risk on `public API` exports — but we can scope to "not in any node_modules index.d.ts")

2. **`logic/dead-function`** (priority: P0)
   - Detects: non-exported functions defined but never called within the same file
   - Why: dead code at the local scope; the easiest kind of "AI forgot" to find
   - Algorithmic: walk `FunctionDeclaration` / `VariableDeclarator` with `ArrowFunctionExpression`, check if the identifier appears in any call site in the same file
   - Severity: low

3. **`logic/dead-type`** (priority: P1)
   - Detects: `interface`/`type alias` declared but never referenced (not exported, not extended, not used in a function signature)
   - Why: AI often adds types speculatively ("I might need this later") and never uses them
   - Algorithmic: walk `TSInterfaceDeclaration` / `TSTypeAliasDeclaration`, check if the name appears anywhere else in the file
   - Severity: low

4. **`logic/dead-prop`** (priority: P2)
   - Detects: `<Component prop={value} />` where `prop` is not in the component's props interface
   - Why: TypeScript catches this in strict mode, but most codebases run with `noImplicitAny: false` or use `React.ComponentProps<typeof Component>`
   - Algorithmic: requires type-aware analysis (TypeScript Compiler API); higher cost
   - Severity: low

5. **`product/orphan-config`** (priority: P2)
   - Detects: keys in `package.json` `dependencies` / `devDependencies` that aren't imported anywhere in the source (excluding type imports)
   - Why: AI adds libraries then refactors them out
   - Algorithmic: parse `package.json`, check each dependency name against `ImportSpecifier` in source
   - Severity: low

**Steps**:
1. For each new rule, create `src/rules/logic/dead-{name}.ts` with the analysis function + a test file `src/rules/logic/dead-{name}.test.ts`
2. Add an entry to `signal-strength.json` with `verdict: "OK"` and an initial recall of 0.0 (the calibration pipeline will fill in after we run the v0.18.0 calibration pass)
3. Add an entry to `RULE_HINTS` in `src/snippet/data.ts`
4. Run the new rules against the corpus to measure baseline recall/FPR
5. Update the docs (CHANGELOG, AGENTS.md, website)

**Acceptance criteria**:
- Each new rule has at least 1 test case that fires + 1 test case that doesn't
- Each new rule's baseline is in `signal-strength.json`
- `pnpm -r test` passes
- A real `slopbrick scan` against the platform's own source surfaces some real dead code (proves the rule works end-to-end)

**Quality gates**:
- `pnpm -r typecheck` — clean
- `pnpm -r test` — pass
- Manual: `slopbrick scan` against `packages/slopbrick/src/` shows at least 3 hits on real dead code (sanity check that the rules aren't no-ops)

**Risks**:
- High false-positive rate on dead-export (public APIs look like dead exports) — **mitigation**: only flag if NOT referenced from any `index.ts` / `package.json` `main`/`exports` field. Cross-check against `package.json#exports`.
- Dead-function false positives on `React.FC` props callbacks that we can't statically see — **mitigation**: conservative threshold, mark as "medium" severity, not "fail"
- Type analysis cost for `dead-prop` — **mitigation**: defer that rule to a later release; the other 4 are pure AST analysis

**Rollback**: each rule is its own file + its own signal-strength.json entry + its own test. Per-rule revert is `git revert <commit> -- <rule-file>` + manual signal-strength.json edit.

---

## Phase 4 — Recalibration pass (run the pipeline, update signal-strength.json)

**Goal**: With rules deleted (Phase 2) and added (Phase 3), re-run the calibration pipeline against the corpus + 5 new corpus dirs (comfyui, fastchat, elevenlabs-js, elevenlabs-python, chatglm) to get fresh `recall`, `fpRate`, `precision`, `verdict` for every rule.

**Steps**:
1. Verify the 5 corpus dirs are still in `/Users/cheng/corpus-expansion/` (they were moved there in v0.17.1; verified present as of 2026-06-30)
2. Run `pnpm bench:scan` against each corpus, record per-rule hit counts
3. Run the labeled-set calibration: for each rule, count true positives (rule fires AND labeled AI), false positives (rule fires AND labeled human), true negatives (rule doesn't fire AND labeled human), false negatives (rule doesn't fire AND labeled AI). Compute recall = TP/(TP+FN), fpRate = FP/(FP+TN).
4. Update `signal-strength.json` with fresh numbers
5. For any rule whose recall dropped below 0.05 with fpRate > 0.1, reclassify to `NOISY` + `defaultOff: true`
6. For any rule whose recall is 0 across the full corpus, mark as `DORMANT` (it'll surface again in the next audit)
7. Re-run `slopbrick scan --brief` against the platform itself as the smoke test

**Acceptance criteria**:
- Every rule in `signal-strength.json` has a `lastCalibratedAt` timestamp from this run
- The bench:scan output shows reasonable distribution of issue types per corpus (not all 0s, not all 1000s)
- A "calibration report" markdown file is written to `docs/research/calibration-2026-07.md` summarizing: rules removed, rules added, rules reclassified, top/bottom 5 rules by recall

**Quality gates**:
- `pnpm bench:scan` exits 0
- `slopbrick scan` against the platform source returns aiQuality in the same ballpark as v0.17.3 (no >5-point regressions on the platform's own code)
- The new dead-code rules (Phase 3) each fire at least 1 time on the platform's own source

**Risks**:
- Corpus exhaustion — running out of labeled data for some categories. **Mitigation**: skip the affected rule, mark as "deferred" in the report
- Calibration reveals a rule is over-reporting (high FP rate). **Mitigation**: reclassify to NOISY + defaultOff, accept the false-positive cost
- `signal-strength.json` gets a different value for `lastCalibratedAt` per rule, creating drift. **Mitigation**: use a single `calibrationDate` constant for the whole batch

**Rollback**: `git revert`. The signal-strength.json is the only runtime-impacting artifact; revert to the previous values.

---

# Sequencing

| Phase | Effort | Risk | Independent PR? |
|---|---|---|---|
| 1. Audit (spreadsheet) | 1 day | Low (no code change) | yes — docs only |
| 2. Reclassify + delete | 1 day | Medium (removes rules) | yes — atomic commit |
| 3. Add dead-code rules | 3-4 days | Medium (new code paths) | yes — 1 commit per rule (5 commits) |
| 4. Recalibration | 1-2 days | High (touches calibration) | yes — atomic commit |

**Recommended PR sequence** (8 PRs, atomic each):
1. **PR 1: Audit** — `docs/research/rule-audit-v0.18.0.csv` only. No code change.
2. **PR 2: Delete + reclassify** — apply Phase 2 decisions. ~15-25 rules removed, ~5-10 reclassified. Version bump to 0.18.0.
3. **PRs 3a-3e: New rules** — one PR per new rule (5 PRs). Each adds 1 rule + 1 test + signal-strength.json entry. Easier to revert if a rule is bad.
4. **PR 4: Recalibration** — refresh `signal-strength.json`, write calibration report. The big "this is the v0.18.0 release" PR.

**Total: 8 PRs over 2 weeks** (sequentially — Phase 1 must finish before Phase 2 can start, Phase 4 must run after Phase 2 and 3).

---

# Acceptance criteria for the whole plan

- [ ] All 35 zero-recall rules have a documented disposition in the audit spreadsheet
- [ ] The 95-rule count drops to a more honest number (target: 60-75 rules) after the delete + add cycle
- [ ] 3-5 new dead-code rules ship, each with tests
- [ ] Every rule has fresh calibration data (lastCalibratedAt within the last 2 weeks)
- [ ] Calibration report markdown is written and reviewed
- [ ] `slopbrick scan` against the platform's own source runs cleanly and shows no >5-point regression vs v0.17.3
- [ ] `pnpm -r test` passes (871/871 baseline, +new rule tests)
- [ ] Documentation is consistent: AGENTS.md, README, Hero, live-terminal all show the new rule count
- [ ] v0.18.0 is published to npm with a CHANGELOG entry summarizing what was added, removed, and reclassified

---

# Risks summary (across all phases)

| Risk | Severity | Mitigation |
|---|---|---|
| Removing a high-signal rule by misclassification | High | Phase 1 produces a spreadsheet for human review; Phase 2 only applies spreadsheet-approved decisions |
| New dead-code rules over-report (high FP) | Medium | Start with `verdict: "OK"` and `defaultOff: true` until calibration proves them |
| Calibration runs on stale corpus | Medium | Refresh corpus in `corpus-expansion/` before Phase 4 |
| v0.18.0 breaks downstream consumers' rule names | Low | The 95-rule set is an internal implementation detail; no external API exposure |

---

# Open questions

1. **What threshold counts as "too many rules"?** My target is 60-75 rules after the cycle. Do you have a specific number in mind?
2. **Should the audit spreadsheet be public or operator-only?** The disposition data could be useful to the community (which rules work, which don't), but it might also reveal that a category of rules is unreliable (embarrassing).
3. **New dead-code rules: ship in v0.18.0 or hold for a v0.18.1?** The `dead-export` + `dead-function` pair feels high-value and well-bounded. I could ship those in v0.18.0 and hold the type/config ones for v0.18.1.

---

# Start with Phase 1

Phase 1 is the lowest-risk way to validate the plan: no code changes, just produce the CSV. Reviewing the dispositions together before any rules are touched is the right gate.
