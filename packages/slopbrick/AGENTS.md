# AGENTS.md

> How AI agents should work with `slopbrick`.

Apply this file silently. Do not restate it unless the user asks for project rules.

---

## What this project is

`slopbrick` is a **Repository Constitution Engine for AI Coding Agents**. It scans React, Vue, Svelte, Solid, Qwik, Astro, and HTML files and computes **4 headline scores** (`aiQuality`, `engineeringHygiene`, `security`, `repositoryHealth`) backed by 80+ rules across 13 categories — but the moat is the **Constitution** (the `slopbrick.config.mjs` block that declares your stack), and every other score is a proof that the Constitution is being followed.

**Tier 1 — Headline scores (the 4-score model, v0.16.0+):**

| Score | Shape | Use it for |
|-------|-------|------------|
| **aiQuality** | 0–100 (higher = better) | AI-slop signatures (16 `ai/*` rules) — INVERTED from legacy Slop Index |
| **engineeringHygiene** | 0–100 (higher = better) | Boundary / logic / layout / visual / component / test categories |
| **security** | 0–100 (higher = better) | AI Security Risk (low/medium/high/critical → 100/67/33/0) |
| **repositoryHealth** | 0–100 (higher = better) | Weighted composite: 0.4×aiQ + 0.3×eng + 0.2×sec + 0.1×test |

**Tier 2 — Heuristic (specialised subcommands):**

| Score | Shape | Use it for |
|-------|-------|------------|
| **Test Quality** | 0–100 | AI test smells (weak assertions, duplicate setups, fake placeholders) |
| **Business Logic Coherence** | 0–100 | Pricing precision, validation completeness, locale-agnostic formatting |
| **Documentation Freshness** | 0–100 *(0.8.0)* | Stale READMEs, drift between docs and code |
| **Database Health** | 0–100 *(0.8.0)* | Missing indexes, N+1, soft-delete inconsistencies |

**Tier 3 — Derived (dashboards, 0.9.0):**

| Score | Shape | Use it for |
|-------|-------|------------|
| **Repository Health** | 0–100 | Weighted average of the above |
| **AI Maintenance Cost** | $/month | $ cost of fixing issues, given team velocity |
| **AI Debt band** | A / B / C / D / F | Letter grade |

**It does not detect AI authorship.** It detects code-quality patterns (arbitrary Tailwind values, inline styles, hook soup, missing accessibility, duplicated components, hardcoded secrets, off-scale spacing, constitution violations, architectural drift) that are strongly correlated with AI-generated code — AND that AI agents can fix or avoid with the right signals.

**Primary user is the AI agent.** The core workflow is `slop_suggest`: agents call it before writing code, get the project's `doNotCreate` list, follow the existing patterns, never violate the Constitution. The human-facing CLI is the enforcement layer.

**Industry context (2024–2026):**

- METR July 2025 RCT: experienced open-source devs are **19% slower with AI tools** on real repos.
- CodeRabbit 470-PR study: AI code carries **1.7× more issues per PR** (10.83 vs 6.45).
- GitClear 211M-line analysis: refactoring down 60% (25%→<10%), copy-paste up 48% (8.3%→12.3%) in 3 years.
- Faros AI 2026 (22k devs): PR size +51%, bugs/PR +28%, incidents/PR +3×, code churn +10×.
- Stack Overflow 2025: trust in AI accuracy dropped **40% → 29%**; 66% spend more time debugging AI.
- AWS Kiro outage (Dec 2025): agentic coding tool deleted production, 13-hour outage. "Predictable given unchecked AI permissions."
- Sonar 2025: **$306,000/yr per 1M LoC** of code-level technical debt. The calibration baseline for `slopbrick maintenance-cost` in 0.8.0.

**Strategic positioning:** see [`ROADMAP.md`](./ROADMAP.md) for the 12-phase plan. Current state: Phases 1–12 shipped in v0.9.0 (Slop Index, Constitution, Architecture Consistency, AI Security Risk, Test Quality, Business Logic, Pattern Fragmentation, PR Slop Score, Documentation Freshness, Database Health, AI Maintenance Cost, Product Consistency, Repository Health composite + AI Debt band, MCP tool consolidation). Next milestone is v0.10 (the credibility milestone: per-rule P/R/FPR + peer-reviewed thresholds). v1.0 is the far-horizon stability commitment, at least six months after v0.10, and is not in this release train.

---

## Quick commands

Run everything from `/Users/cheng/BRICK`.

```bash
# Main scan — runs all rules, computes all 5 scores
node bin/slopbrick.js scan

# Score-specific commands
node bin/slopbrick.js architecture   # Architecture Consistency Score
node bin/slopbrick.js security      # AI Security Risk
node bin/slopbrick.js drift         # Constitution violations
node bin/slopbrick.js trend         # AI Slop Score over time (lower = cleaner since v0.21)
node bin/slopbrick.js pr            # PR slop score (single weighted number per PR)

# MCP server (for AI agents like Claude Code / Cursor / Codex)
node bin/slopbrick.js mcp
# Tools exposed: slop_scan_file, slop_explain_rule, slop_list_rules,
#                slop_suggest, slop_check_constitution, slop_architecture_score

# Single-file scan with advice
node bin/slopbrick.js scan --suggest

# Output formats
node bin/slopbrick.js scan --format pretty    # default
node bin/slopbrick.js scan --format json      # machine-readable
node bin/slopbrick.js scan --format sarif     # code-scanning upload
node bin/slopbrick.js scan --format html      # self-contained HTML report

# Update baselines after intentional changes
node bin/slopbrick.js scan --baseline
```

Use `--workspace <path>` to scan a project other than the current directory.

---

## Reading scan output

A typical failing run looks like this:

```text
Scanned 312 files, 501 components, 1381 issues (high: 42, medium: 289, low: 1050)
AI Slop Score:           31 / 100 [LOW]
Architecture Consistency: 82
AI Security Risk:         HIGH  (1 critical, 0 high, 3 medium)
Constitution drift:        2 violations  (1 stateManagement, 1 dataFetching)
Design-token drift:       7 violations  (5 spacing, 2 radius)
(lower AI Slop Score is better since v0.21; higher Architecture Consistency is better)
```

- **AI Slop Score** — the v0.21+ headline score; lower = cleaner (raw amount of slop). Replaces the legacy "Slop Index"
- **Architecture Consistency** — one number for cross-file pattern duplication; higher is better. 100 = one of each, no drift.
- **AI Security Risk** — categorical; a single hardcoded API key outranks everything else. Drives `slopbrick security [--strict]` (exit 1 on high/critical for CI gating).
- **Constitution drift** — list of imports that violate declared constitution in `slopbrick.config.mjs`. Drives `slopbrick drift` (exit 1 on any violation).
- **Design-token drift** — spacing/radius values off the declared scale. Drives `--fix` rewrites.

---

## When you change code

1. Run `pnpm typecheck && pnpm build && pnpm test` before claiming work is done.
2. Run `node bin/slopbrick.js scan` to check if your changes introduced regressions in any of the five scores.
3. If new issues are intentional or false positives, adjust the config (`slopbrick.config.mjs`) or the rule logic — do not delete tests to pass.
4. If you intentionally raised the score (e.g., adding detection rules), re-baseline:
   ```bash
   node bin/slopbrick.js scan --baseline
   ```

**The five scores are independent.** A project can have Slop Index 90 (great code quality) AND AI Security Risk CRITICAL (hardcoded API key). Do not let one score mask another.

## Calibration (v4.1, 2026-06-25)

The rule catalog is calibrated against a balanced 1:1 corpus
lives at `/Users/cheng/corpus-expansion/` (override with the
`SLOPBRICK_CORPUS_DIR` env var). All corpus paths are
centralized in [`src/corpus-paths.ts`](./src/corpus-paths.ts)
— import `POSITIVE_DIR`, `NEGATIVE_DIR`, `FILELISTS_DIR`,
or `filelistPath(name)` rather than hardcoding
`/Users/cheng/corpus-expansion/...`. Python scripts in
`scripts/` mirror the same constant via
`os.environ.get('SLOPBRICK_CORPUS_DIR', '/Users/cheng/corpus-expansion')`.

- **Negative:** 95,467 frontend files (39 production repos: mui 16k, supabase 6.8k, antd 5.5k, storybook 3.5k, react-spectrum 3.3k, refine 6.3k, appsmith 5.5k, heroui 2.1k, …) + 54,980 from `corpus-expansion/negative/baseline/`.
- **Positive:** 76,981 frontend files (50 existing repos + 100 NEW shallow-cloned vibe-coded repos in `corpus-expansion/positive/`).

Per-rule Precision/Recall/FPR is the form engineers actually trust. See:
- [`docs/research/v4-per-rule-pr-fpr.md`](./docs/research/v4-per-rule-pr-fpr.md) — full per-rule P/R/FPR table
- [`docs/research/calibration-report-2026.md`](./docs/research/calibration-report-2026.md) — calibration trajectory (v1 → v5)
- [`docs/research/v0.10-implementation-plan.md`](./docs/research/v0.10-implementation-plan.md) — credibility-milestone roadmap (Phases 1–5 ship v0.10)

The calibration tests are at:
- `tests/integration/calibration-expanded.test.ts` — 27 ratio thresholds + 18 P/R/FPR thresholds
- `tests/integration/calibration-security.test.ts` — multi-language backend rules
- `tests/integration/calibration-db.test.ts` — db/* SQL/ORM rules

All three use cached `fires.json` files under `/tmp/{v4neg-fe,v4pos-fe,corpus-v4neg,corpus-v4pos,corpus-v4db-*}-shards/` for fast (<1s) test runs. Falls back to a fresh scan if the cache is missing.

---

## Fixing issues

Use the rule ID from the issue to find the rule source and tests:

```bash
# Example issue ruleId: visual/inline-style
grep -R "visual/inline-style" src/rules tests/rules
```

Run with `--suggest` to get concrete remediation advice. Prefer fixes that move code toward tokens, components, and semantics rather than silencing the rule.

---

## Adding a new rule

1. Create `src/rules/<category>/<rule-name>.ts`.
2. Export a const ending in `Rule` and a default export:

```ts
import { createRule } from '../rule';

export const myRule = createRule({
  id: 'category/my-rule',
  category: 'visual',
  severity: 'medium',
  aiSpecific: true,
  create: (ctx) => ({ ... }),
  analyze: (facts, ctx) => [...issues],
});

export default myRule;
```

3. Add tests in `tests/rules/<rule-name>.test.ts`.
4. Add a `RULE_HINTS` entry in `src/snippet/data.ts` so the `tests/engine/rule-hints.test.ts` "every builtin has a hint" guard stays green.
5. Regenerate the rule registry:
   ```bash
   pnpm generate:rules
   ```
   This also runs automatically before `pnpm build` and `pnpm test`.

---

## Conventions for new features

- **Reuse `facts.v2`.** The engine already extracts JSX elements, class names, fetch calls, hook usage, etc. Most new rules should be 5–20 line pure functions over `facts.v2`.
- **Reuse the signal table.** `src/config/constitution.ts` exports `CONSTITUTION_SIGNALS` (40 entries). Don't redefine it in a new module.
- **Reuse the duplicate-detection logic.** `src/mcp/patterns.ts` exports `buildPatternInventory`. Architectural-drift detection should compose this, not reimplement it.
- **Add a CLI subcommand** if the feature is user-facing in CI. Tests in `tests/cli/<subcommand>.test.ts`.
- **Add an MCP tool** if AI agents should call it. Tests in `tests/mcp/patterns.test.ts`.
- **Surface the score in `ProjectReport`** if it should appear in `slopbrick scan` output. Tests in `tests/cli.test.ts` for round-trip JSON.

---

## Quality gates

Always run these before finishing work:

```bash
pnpm typecheck
pnpm build
pnpm test
```

- TypeScript is strict. Avoid `any`; prefer `unknown` with narrowing.
- Add explicit return types to exported functions.
- Keep IO and business logic separate.
- Prefer small, focused files.
- When bumping `VERSION` in `src/types.ts`, also bump `package.json` and search fixtures for hardcoded versions. Update `tests/types.test.ts`, `tests/cli.test.ts`, `tests/cache-orphan-tmp.test.ts`, `tests/engine/structure.test.ts` to use the live `VERSION` constant. Don't hardcode `0.5.2`.

---

## Project structure

Top-level `src/` contains only `index.ts` (public facade) and `types.ts` (shared TypeScript types). Everything else lives in a subfolder grouped by concern.

| Path | Purpose |
|------|---------|
| `src/index.ts` | Public facade, re-exports |
| `src/cli/` | Commander wiring + per-command action callbacks |
| `src/cli/program.ts` | All subcommands + global options |
| `src/cli/scan.ts` | Main scan engine (runScan, scanProject, watch, output) |
| `src/cli/drift.ts` | `slopbrick drift` (constitution enforcement) |
| `src/cli/pr.ts` | `slopbrick pr` (PR slop score — single weighted number per PR) |
| `src/cli/init.ts` | `slopbrick init` + `slopbrick doctor` |
| `src/cli/explain.ts` | `slopbrick explain <ruleId>` per-rule printer |
| `src/cli/git.ts` | Git plumbing (head/root/staged/diff/edit-count) |
| `src/cli/installer.ts` | Pre-commit hook install/uninstall |
| `src/cli/tokens.ts` | `slopbrick tokens` DTCG tokens.json ingest |
| `src/engine/` | Parser, worker pool, visitor, scoring, cache, telemetry |
| `src/engine/architecture-score.ts` | Architecture Consistency Score |
| `src/engine/ai-security-risk.ts` | AI Security Risk categorical score |
| `src/engine/trend.ts` | Slop Index trend over time |
| `src/engine/discover.ts` | File enumeration (globby + extension sniffing) |
| `src/engine/cache-incremental.ts` | `--incremental` file-content hash cache |
| `src/engine/flywheel.ts` | Self-tuning loop (autoTuned + hotspotIssues + suggestions) |
| `src/rules/` | Built-in rule modules (auto-discovered) |
| `src/rules/security/` | Tier-1 + Tier-2 security rules |
| `src/rules/visual/spacing-scale-violation.ts` | Design-token drift rule |
| `src/rules/visual/radius-scale-violation.ts` | Design-token drift rule |
| `src/config/` | Config types, defaults, detect, load, init, constitution |
| `src/config/index.ts` | Public config facade (re-exports defaults/load/detect/init/conventions) |
| `src/config/validation.ts` | `validateConfig` + `ConfigValidationError` |
| `src/mcp/` | MCP server (JSON-RPC 2.0 over stdio) |
| `src/mcp/patterns.ts` | Project-wide pattern inventory (used by both MCP and Architecture Score) |
| `src/report/` | Pretty, JSON, SARIF, HTML report generators |
| `src/snippet/` | Agent rule-directive snippets (CLAUDE.md, AGENTS.md, etc.) |
| `src/types.ts` | Shared TypeScript types |
| `scripts/generate-rule-registry.ts` | Auto-discovers rule modules and writes `src/rules/builtins.ts` |
| `tests/` | Vitest tests mirroring `src/` structure |
| `docs/` | Historical research + per-rule documentation |
| `examples/` | Ready-to-use starter configs (`basic/`, `strict/`, `monorepo/`, `ci/`) |
| `corpus/baseline.json` | Default corpus baseline |

---

## Config conventions

- Config file: `slopbrick.config.mjs` in the project root.
- Rules use IDs like `<category>/<name>`.
- Severity can be `'auto'`, `'low'`, `'medium'`, `'high'`, or `'off'`.
- `categoryWeights` multiply category scores.
- `thresholds` define CI gates.
- **`constitution`** (added in 0.6.2) — declares the project's stack: `stateManagement`, `dataFetching`, `uiLibrary`, `forms`, `styling`, `routing`. User declarations always win over auto-detection from `package.json`. Empty arrays mean "we deliberately don't use this category." Optional **`forbidden`** array declares an explicit deny-list of packages (or `@scope/` prefixes) that any PR introducing them must fail.
- **`spacingScale`** + **`radiusScale`** (added in 0.6.3) — token scales for design-token drift detection. Default matches Tailwind.
- **`prScoreThreshold`** (added in 0.7.0) — non-negative integer. `slopbrick pr` exits 1 when the PR introduces more than this many weighted slop points (sum of `SEVERITY_WEIGHTS[issue.severity]` + constitution violations) across the changed files. Default: `20`. Override per invocation with `--threshold <n>`.

---

## Security

- **Never commit `.env`, keys, tokens, or credentials.** Even examples in `docs/` and test fixtures should use placeholder values (`sk-xxx`, `AKIAIOSFODNN7EXAMPLE`).
- Do not run destructive commands (`rm -rf`, `git push --force`, etc.) without explicit user approval.
- Sensitive files are already ignored in `.gitignore`.
- **Git pushes require explicit user confirmation** — per the parent AGENTS.md policy. `git commit` is fine; `git push --force` is not.

---

## License

[MIT](./LICENSE)
