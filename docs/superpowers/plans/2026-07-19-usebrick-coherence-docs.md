# UseBrick coherence documentation implementation plan

> **Completed historical implementation plan.** The original convergence was
> integrated at `d4197d692`. Its worktree commands, unchecked boxes, revision
> numbers, and expected counts below preserve the execution handoff and are no
> longer instructions to run. The owner-approved 2026-07-22 account-wide
> extension is codified in the [current positioning
> design](../specs/2026-07-19-usebrick-coherence-positioning-design.md),
> [root roadmap](../../../ROADMAP.md), [dated market
> research](../../research/usebrick-market-positioning-2026-07-19.md), and
> execution-index revision 43. That extension keeps AI slop central, retains
> the future Slop Index boundary, separates the two intelligence planes, and
> defines the coherence graph as the moat hypothesis.

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reconcile every current strategy, execution, package, and website documentation surface around UseBrick as the sole coherence-and-verification product without changing shipped behavior, historical evidence, or release authority.

**Architecture:** Keep durable positioning in the root roadmap and architecture, volatile market evidence in one dated research note, live work state in the execution control plane, shipped behavior in SlopBrick documentation, and customer copy in the local website source. Execute three disjoint worktree groups from the same approved-plan commit, then integrate and run one cross-surface truth gate. CAL-002 closeout remains a later factual projection; this pass changes doctrine and sequencing only.

**Tech Stack:** Markdown, JSON, Astro 7, TypeScript, Vitest, Node test runner, pnpm workspaces, Git worktrees.

## Global Constraints

- UseBrick is the sole customer-facing product and the coherence and verification layer for agent-built software.
- SlopBrick remains the shipped npm package, current CLI, free local scanner, and acquisition surface.
- MemoryBrick, LockBrick, and MendBrick are internal capability and sequencing names, not separately marketed products or package authorization.
- RenderBrick Labs is a benchmark-only rendered/runtime evidence experiment, not a browser product, package, or proven capability.
- Current commands remain `slopbrick`; `usebrick scan|explain|baseline|check|fix|runtime` may appear only as a clearly future interface hypothesis.
- The initial buyer hypothesis is AI-native software teams and agencies with roughly 5–100 developers; serious solo developers remain top-of-funnel, not a proven buyer segment.
- `GTM-001` becomes ready for planning 10–20 consent-safe observed external sessions; this docs change does not authorize outreach, contact, scheduling, data collection, or participant claims.
- The owner remains the only completed tester and the external-session count remains zero.
- Volatile adoption, pricing, revenue, and market-size claims appear only in `docs/research/usebrick-market-positioning-2026-07-19.md` and are labeled observations, assumptions, or scenarios.
- Historical plans, evidence receipts, released artifacts, and frozen calibration files remain unchanged.
- The workspace remains unreleased `slopbrick@0.45.0`; the verified public package remains `slopbrick@0.43.0`; v10.1 evidence remains historical and v10.3 admission remains zero.
- Local scan history and opt-in outbound reporting remain distinct; no absolute `no telemetry` or `no network` claim is permitted.
- A local website build does not authorize push, tag, GitHub Release, npm publication, website deployment, or public release.
- Preserve all unrelated/user-owned dirty paths and the protected `.slopbrick/calibration/cal-002/origin-state.json` byte-for-byte.

---

## File ownership map

### Group A — strategy, research, and execution authority

- Modify: `docs/superpowers/specs/2026-07-19-usebrick-coherence-positioning-design.md`
- Modify: `README.md`
- Modify: `ROADMAP.md`
- Modify: `docs/ARCHITECTURE.md`
- Modify: `docs/future-extractions.md`
- Create: `docs/research/usebrick-market-positioning-2026-07-19.md`
- Modify: `docs/execution/index.json`
- Modify: `docs/execution/STATUS.md`
- Modify: `docs/execution/CHANGELOG.md`
- Modify: `docs/execution/plans/GTM-001-vibecoder-pilots.md`
- Modify: `docs/execution/plans/SB-UX-001-first-scan.md`
- Modify: `docs/execution/plans/VAL-001-owner-validation.md`
- Modify: `docs/execution/plans/TEL-001-local-outcomes.md`
- Modify: `docs/execution/plans/MEM-001-read-only-m0.md`
- Modify: `docs/execution/plans/LOCK-001-new-debt-gate.md`
- Modify: `docs/execution/plans/MEND-001-repair-proof.md`
- Modify: `docs/execution/plans/ENT-001-demand-gate.md`
- Modify: `docs/execution/plans/REL-001-public-release-boundary.md`
- Create: `docs/execution/plans/LABS-001-rendered-evidence-benchmark.md`
- Modify: `docs/superpowers/plans/2026-07-19-cal-002-progressive-quality-authority.md`

### Group B — package and technical documentation

- Modify: `CONTRIBUTING.md`
- Modify: `docs/calibration/README.md`
- Modify: `docs/maths.md`
- Modify: `docs/methodology.md`
- Modify: `docs/rules.md`
- Modify: `packages/slopbrick/README.md`
- Modify: `packages/slopbrick/CHANGELOG.md`
- Modify: `packages/slopbrick/CONTRIBUTING.md`
- Modify: `packages/slopbrick/EXAMPLES.md`
- Replace with canonical pointer: `packages/slopbrick/ROADMAP.md`
- Modify: `packages/slopbrick/docs/MCP.md`
- Modify: `packages/slopbrick/docs/architecture.md`
- Modify: `packages/slopbrick/docs/calibration/README.md`
- Modify: `packages/slopbrick/docs/language-support-matrix.md`
- Verify only: `packages/slopbrick/docs/rule-catalog.md`
- Modify: `packages/slopbrick/docs/scoring-explained.md`
- Modify: `packages/slopbrick/docs/scoring-runbook.md`
- Modify tests: `packages/slopbrick/tests/generated-docs-truth.test.ts`
- Modify tests: `packages/slopbrick/tests/mcp/docs.test.ts`

### Group C — website and customer-facing source

- Modify: `packages/website/package.json`
- Modify: `packages/website/src/layouts/Base.astro`
- Modify: `packages/website/src/components/Hero.astro`
- Modify: `packages/website/src/components/Tools.astro`
- Modify: `packages/website/src/components/Compare.astro`
- Modify: `packages/website/src/components/TrustStrip.astro`
- Modify: `packages/website/src/components/CTASection.astro`
- Modify: `packages/website/src/components/Calibration.astro`
- Modify: `packages/website/src/pages/docs/index.astro`
- Modify: `packages/website/docs/blog/lifecycle-narrative.md`
- Modify tests: `packages/website/tests/unit/route-contract.test.ts`
- Modify tests: `packages/website/tests/unit/trust-strip.test.ts`
- Modify tests: `packages/website/tests/unit/dev-data-contract.test.ts`

### Coordinator-only integration

- Create: `scripts/validate-positioning-docs.test.mjs`
- Modify: `package.json`

---

### Task 1: Approve and bind the doctrine in strategy and research authority

**Files:** Group A files listed above.

**Interfaces:**
- Consumes: the owner-supplied market review and `docs/superpowers/specs/2026-07-19-usebrick-coherence-positioning-design.md`.
- Produces: one approved durable position, one dated research source, execution revision 28, ready-but-not-active external validation, and a draft Labs benchmark.

- [ ] **Step 1: Create an isolated Group A worktree from the plan commit**

```bash
git worktree add .worktrees/usebrick-coherence-strategy -b codex/usebrick-coherence-strategy <PLAN_COMMIT>
```

Expected: the worktree is clean and contains no user-owned dirty paths.

- [ ] **Step 2: Mark the design approved without expanding its non-goals**

Change the spec status from `written-spec review` to `approved`, add the approving owner instruction date, and retain every existing non-goal. Do not rewrite the supplied market review into the design file.

- [ ] **Step 3: Write the dated market note with explicit evidence classes**

Create `docs/research/usebrick-market-positioning-2026-07-19.md` with these sections:

```markdown
# UseBrick market positioning research — 2026-07-19

## Decision supported
UseBrick should compete as the repository-owned coherence and verification layer for agent-built software; SlopBrick is the acquisition surface.

## Observed market evidence
## Directional market model
## Competitive implications
## Initial customer hypothesis
## Pricing hypothesis
## Evidence still missing
## Sources
```

The note must show these calculations and labels exactly:

```text
38.4m professional developers × 74% specialist AI-tool adoption = 28.4m directional seats
28.4m × $18–$30/month × 12 = approximately $6.1B–$10.2B annual spend proxy
(14.5m medium + 7.5m large) × 74% × 10%–20% fit = 1.63m–3.26m serviceable seats
1.63m–3.26m × $18–$30/month × 12 = approximately $352M–$1.17B annual capacity scenario
```

State that cross-study multiplication is a scenario, not a measured category TAM or forecast. Link the primary/official sources named in the approved design; attribute private-company revenue to the reporting outlet.

- [ ] **Step 4: Rewrite durable product hierarchy and architecture**

In `README.md`, `ROADMAP.md`, and `docs/ARCHITECTURE.md`:

```text
UseBrick = sole customer-facing product and repository-owned contract
SlopBrick = Observe / detect / explain / emit evidence; shipped today
Memory capability = compile facts + intent + provenance + freshness; planned
Lock capability = prevent newly introduced verified drift; planned
Mend capability = narrow reversible repair with receipts; parked
Render Labs = source-only versus rendered-evidence benchmark; draft
```

Replace `Product model`/`Product roles` language with `Product and capability model`. Replace vibecoders as the main buyer with the two-part boundary: solo developers are the free entry audience; AI-native teams/agencies of 5–100 are the initial buyer hypothesis. Preserve every current package, corpus, telemetry, and release fact.

- [ ] **Step 5: Tighten package-extraction boundaries**

Update `docs/future-extractions.md` so no brick name implies a package. Add rows for Mend and Render Labs, and require an approved ADR, at least two real consumers, a stable interface, and reduced coupling before any extraction. State that a future umbrella `usebrick` CLI needs its own implementation and migration decision.

- [ ] **Step 6: Redesign GTM-001 as ready but non-active**

Set `GTM-001` to:

```yaml
status: ready
horizon: now
track: company
session_target: 10-20 observed sessions
completed_sessions: 0
outreach_authorized: false
```

The plan must target AI-native teams and agencies with 5–100 developers, record consent before observation, separate product outcomes from calibration/source labels, and measure:

```text
scan completion
first useful finding
action taken or declined
rescan completion
return within the observation window
team/workflow and willingness-to-pay signal
```

The next action is to prepare the participant profile, script, consent text, and redacted receipt template. It must not contact or schedule anyone.

- [ ] **Step 7: Reconcile dependent execution plans**

Apply these bounded changes without changing current code status:

```text
SB-UX-001: optimize the free first scan for the scan-to-protect adoption loop.
VAL-001: owner validation remains product evidence, never market evidence.
TEL-001: model privacy-safe useful/action/rescan/return outcomes; outbound remains opt-in.
MEM-001: benchmark repository-owned context against native agent context across agents.
LOCK-001: narrow new-debt gate is the first paid workflow hypothesis inside the current CLI.
MEND-001: remain parked pending trusted enforcement and deterministic rollback proof.
ENT-001: remain parked until several paying teams report the same governance need.
REL-001: local docs/website source changes are not deployment or publication authority.
```

- [ ] **Step 8: Add the bounded Labs plan**

Create `LABS-001-rendered-evidence-benchmark.md` with status `draft`, implementation/labs track, next horizon, and these experiment arms:

```text
A: source-only agent
B: source + Playwright/Chrome screenshots and runtime evidence
C: existing visual-testing baseline where available
```

Require fixed defects, blind scoring, same model/time budget, incremental detection and false-positive measures, and a stop decision if rendered evidence adds no material value. Forbid building a Chromium fork, standalone browser, package, or customer claim in the plan.

- [ ] **Step 9: Update execution index, status, and changelog atomically**

Set index revision to 28 and preserve current implementation WIP `2/2` with `SB-UX-001` and `CAL-002` active. Company WIP remains `0/1`: ready is not active. Add `LABS-001` as draft and update GTM title/status/horizon/next action. Prepend a changelog entry that states strategy approval, zero external sessions, no outreach, no runtime change, and no release/deployment authority.

- [ ] **Step 10: Amend CAL-002 Task 21 without claiming closeout**

Replace Task 21's outdated three-group file map with a reference to this plan. State that this market-positioning pass lands before CAL closeout, while Task 21 later updates only observed CAL application hashes, gate results, statuses, and receipts in the already-aligned current docs.

- [ ] **Step 11: Validate and commit Group A**

```bash
corepack pnpm plans:validate
node --test scripts/validate-execution-docs.test.mjs
rg -n "written-spec review|GTM-001.*parked|vibecoders are the entry point and main door|first paid team product|standalone products" README.md ROADMAP.md docs/ARCHITECTURE.md docs/future-extractions.md docs/execution/index.json docs/execution/STATUS.md docs/execution/plans
git diff --check
git status --short
git add README.md ROADMAP.md docs/ARCHITECTURE.md docs/future-extractions.md docs/research/usebrick-market-positioning-2026-07-19.md docs/execution/index.json docs/execution/STATUS.md docs/execution/CHANGELOG.md docs/execution/plans/GTM-001-vibecoder-pilots.md docs/execution/plans/SB-UX-001-first-scan.md docs/execution/plans/VAL-001-owner-validation.md docs/execution/plans/TEL-001-local-outcomes.md docs/execution/plans/MEM-001-read-only-m0.md docs/execution/plans/LOCK-001-new-debt-gate.md docs/execution/plans/MEND-001-repair-proof.md docs/execution/plans/ENT-001-demand-gate.md docs/execution/plans/REL-001-public-release-boundary.md docs/execution/plans/LABS-001-rendered-evidence-benchmark.md docs/superpowers/specs/2026-07-19-usebrick-coherence-positioning-design.md docs/superpowers/plans/2026-07-19-cal-002-progressive-quality-authority.md
git commit -m "docs(strategy): align UseBrick coherence roadmap"
```

Expected: both validators pass; any `rg` match is historical or explicitly negated; exactly Group A files are committed.

### Task 2: Reconcile package and technical documentation

**Files:** Group B files listed above.

**Interfaces:**
- Consumes: the approved hierarchy and unchanged current SlopBrick CLI/package contract.
- Produces: truthful SlopBrick-first usage docs that point to one platform roadmap and never market internal capabilities as products.

- [ ] **Step 1: Create an isolated Group B worktree from the plan commit**

```bash
git worktree add .worktrees/usebrick-coherence-package -b codex/usebrick-coherence-package <PLAN_COMMIT>
```

- [ ] **Step 2: Add failing package-doc assertions**

Extend `generated-docs-truth.test.ts` and `mcp/docs.test.ts` with assertions that current docs:

```ts
expect(rootReadme).toContain('UseBrick is the coherence and verification layer');
expect(packageReadme).toContain('SlopBrick is the shipped scanner and CLI');
expect(packageReadme).not.toMatch(/\busebrick (scan|init|ci|mcp)\b/);
expect(packageRoadmap).toContain('../../ROADMAP.md');
expect(mcpDocs).toContain('repository-owned evidence');
```

Run the focused tests and confirm at least the new positioning assertions fail before editing docs.

- [ ] **Step 3: Update root technical doctrine**

Update `CONTRIBUTING.md`, `docs/calibration/README.md`, `docs/maths.md`, `docs/methodology.md`, and `docs/rules.md` only where product/claim boundaries are current. Preserve equations, historical dataset titles, source citations, frozen measurements, and rule semantics. Add cross-links to the root roadmap and dated market note instead of duplicating market numbers.

- [ ] **Step 4: Update SlopBrick usage and contributor surfaces**

In the SlopBrick README, examples, contribution guide, architecture, MCP, scoring, calibration, language, and runbook docs:

```text
SlopBrick is the shipped local scanner, CLI, and embedded MCP server.
UseBrick is the wider repository-owned coherence contract.
Current examples use npx slopbrick ... only.
Memory/Lock/Mend are capability names and sequencing boundaries, not shipped products/packages.
AI association is not quality or authorship authority.
Local history differs from opt-in outbound usage reporting.
Historical v10.1 evidence is not current v10.3 admission.
```

Do not edit the generated rule catalog by hand.

- [ ] **Step 5: Replace the package roadmap with an archival pointer**

Replace `packages/slopbrick/ROADMAP.md` with a short document containing:

```markdown
# SlopBrick roadmap archive

SlopBrick is the shipped scanner and acquisition surface inside UseBrick. Active product direction lives in the root [UseBrick roadmap](../../ROADMAP.md), and live sequencing lives in the [execution index](../../docs/execution/index.json).

This file no longer acts as a planning authority. Historical package plans and changelog entries remain evidence of earlier decisions.
```

- [ ] **Step 6: Record the unreleased docs change**

Add an `Unreleased`/workspace-candidate CHANGELOG bullet that describes positioning and documentation only. Do not create a version header, release date, or public-release claim.

- [ ] **Step 7: Run the package documentation gate and commit**

```bash
corepack pnpm --filter slopbrick generate:rules:catalog -- --check
corepack pnpm --filter slopbrick exec vitest run tests/generated-docs-truth.test.ts tests/mcp/docs.test.ts --maxWorkers=1 --minWorkers=1
rg -n "\busebrick (scan|init|ci|mcp|explain|baseline|check|fix|runtime)\b|first paid team product|standalone product" CONTRIBUTING.md docs/calibration/README.md docs/maths.md docs/methodology.md docs/rules.md packages/slopbrick
git diff --check
git status --short
git add CONTRIBUTING.md docs/calibration/README.md docs/maths.md docs/methodology.md docs/rules.md packages/slopbrick/README.md packages/slopbrick/CHANGELOG.md packages/slopbrick/CONTRIBUTING.md packages/slopbrick/EXAMPLES.md packages/slopbrick/ROADMAP.md packages/slopbrick/docs/MCP.md packages/slopbrick/docs/architecture.md packages/slopbrick/docs/calibration/README.md packages/slopbrick/docs/language-support-matrix.md packages/slopbrick/docs/scoring-explained.md packages/slopbrick/docs/scoring-runbook.md packages/slopbrick/tests/generated-docs-truth.test.ts packages/slopbrick/tests/mcp/docs.test.ts
git commit -m "docs(slopbrick): align coherence front door"
```

Expected: generated catalog remains unchanged, focused tests pass, and exactly Group B files are committed.

### Task 3: Reconcile local website product copy

**Files:** Group C files listed above.

**Interfaces:**
- Consumes: verified `product-facts.json`, published receipt, approved hierarchy, and current SlopBrick command boundary.
- Produces: a locally buildable UseBrick website source whose hero sells coherence and whose install path remains truthful.

- [ ] **Step 1: Create an isolated Group C worktree from the plan commit**

```bash
git worktree add .worktrees/usebrick-coherence-website -b codex/usebrick-coherence-website <PLAN_COMMIT>
```

- [ ] **Step 2: Write failing website copy contracts**

Extend the three unit tests to require:

```ts
expect(homeSource).toContain('Your agents can write code');
expect(homeSource).toContain('UseBrick keeps the system coherent');
expect(toolsSource).toContain('capabilities, not separate products');
expect(toolsSource).toContain('Render Labs');
expect(homeSource).not.toContain('free front door for vibecoders');
expect(homeSource).not.toContain('first paid team layer');
expect(homeSource).not.toMatch(/\busebrick (scan|init|ci|mcp)\b/);
expect(trustSource).toContain('outbound reporting off by default');
```

Run `corepack pnpm --filter @usebrick/website test` and confirm the new assertions fail before copy changes.

- [ ] **Step 3: Rewrite metadata and hero around the sole product**

Use this exact hierarchy:

```text
Eyebrow: UseBrick coherence and verification
Hero: Your agents can write code. UseBrick keeps the system coherent.
Support: One repository-owned contract shared by developers, coding agents, and CI.
Install CTA: npm install -g slopbrick
Boundary: SlopBrick is the shipped local scanner and current CLI.
```

Keep current published/candidate facts sourced from `product-facts.json`; remove market-size and competitor claims from the homepage.

- [ ] **Step 4: Replace the product ladder with a capability loop**

Show SlopBrick as shipped and Memory, Lock, Mend, and Render Labs as planned capability stages:

```text
Observe -> Preserve intent -> Compile context -> Prevent drift -> Repair -> Verify runtime
```

Use status labels (`SHIPPED`, `PLANNED`, `PARKED`, `LABS`) and the phrase `capabilities, not separate products`. Do not imply that paid enforcement, repair, or rendered evidence ships.

- [ ] **Step 5: Reconcile trust, comparison, calibration, CTA, and docs route**

Preserve exact current version/rule facts. Change absolute network/telemetry copy to `local scan history on by default; outbound reporting off by default and endpoint-gated`. Reframe the comparison around shared repository truth, new-debt protection, and cross-agent evidence. Keep historical scan and v10.1 examples visibly historical. Keep every current command as `slopbrick`.

- [ ] **Step 6: Archive the lifecycle narrative's obsolete packaging claims**

Add a historical banner and replace standalone-product claims with current capability boundaries. Preserve dated historical release prose where needed, but explicitly defer current authority to the root roadmap and execution index.

- [ ] **Step 7: Update website package metadata**

Change the private package description only; do not bump its version. Describe it as the UseBrick coherence product site with SlopBrick-first onboarding and verified facts.

- [ ] **Step 8: Run website gates and commit**

```bash
corepack pnpm --filter @usebrick/website test
corepack pnpm --filter @usebrick/website typecheck
corepack pnpm --filter @usebrick/website build
rg -n "free front door for vibecoders|first paid team layer|standalone product|\busebrick (scan|init|ci|mcp)\b|no telemetry" packages/website/src packages/website/docs/blog/lifecycle-narrative.md
git diff --check
git status --short
git add packages/website/package.json packages/website/src/layouts/Base.astro packages/website/src/components/Hero.astro packages/website/src/components/Tools.astro packages/website/src/components/Compare.astro packages/website/src/components/TrustStrip.astro packages/website/src/components/CTASection.astro packages/website/src/components/Calibration.astro packages/website/src/pages/docs/index.astro packages/website/docs/blog/lifecycle-narrative.md packages/website/tests/unit/route-contract.test.ts packages/website/tests/unit/trust-strip.test.ts packages/website/tests/unit/dev-data-contract.test.ts
git commit -m "docs(website): position UseBrick coherence layer"
```

Expected: unit tests, Astro check, and production build pass; any grep match is historical/negated; exactly Group C files are committed. No deployment occurs.

### Task 4: Integrate and enforce cross-document truth

**Files:** coordinator-only integration files plus the three group commits.

**Interfaces:**
- Consumes: approved Group A, B, and C commits based on the same plan commit.
- Produces: one integrated local documentation checkpoint and a reusable cross-surface validator.

- [ ] **Step 1: Review each group before integration**

For each branch, inspect:

```bash
git log -1 --oneline <BRANCH>
git diff --stat <PLAN_COMMIT>..<BRANCH>
git diff --check <PLAN_COMMIT>..<BRANCH>
```

Reject any group that edits historical evidence, generated catalog, runtime policy, package versions, or files owned by another group.

- [ ] **Step 2: Integrate without preserving worker commit topology**

```bash
git cherry-pick -n codex/usebrick-coherence-strategy
git cherry-pick -n codex/usebrick-coherence-package
git cherry-pick -n codex/usebrick-coherence-website
git diff --cached --name-only
```

Expected: the staged set equals Groups A, B, and C with no protected or unrelated paths.

- [ ] **Step 3: Add a cross-surface Node test**

Create `scripts/validate-positioning-docs.test.mjs` using `node:test`, `node:assert/strict`, and `readFileSync`. It must load the root roadmap/readme, execution index/status/GTM plan, SlopBrick README/roadmap, website Base/Hero/Tools/Trust/CTA/docs route, and dated research note. Assert:

```js
assert.match(roadmap, /UseBrick is the coherence and verification layer/);
assert.match(rootReadme, /sole customer-facing product/);
assert.equal(index.plans.find(({ id }) => id === 'GTM-001').status, 'ready');
assert.match(gtmPlan, /10[–-]20/);
assert.match(gtmPlan, /zero completed sessions/i);
assert.match(packageReadme, /SlopBrick is the shipped scanner and CLI/);
assert.match(packageRoadmap, /root.*roadmap/i);
assert.match(hero, /Your agents can write code/);
assert.match(tools, /capabilities, not separate products/);
assert.match(trust, /outbound reporting off by default/i);
assert.match(research, /scenario, not a forecast/i);
```

Also concatenate current command docs and fail on `/\busebrick\s+(scan|init|ci|mcp)\b/`. Do not scan historical evidence or archived research.

- [ ] **Step 4: Register the validator**

Add this root script without changing package versions or dependencies:

```json
"positioning:validate": "node --test scripts/validate-positioning-docs.test.mjs"
```

- [ ] **Step 5: Run the global documentation gate**

```bash
corepack pnpm positioning:validate
corepack pnpm plans:validate
node --test scripts/validate-execution-docs.test.mjs
corepack pnpm --filter slopbrick generate:rules:catalog -- --check
corepack pnpm --filter slopbrick exec vitest run tests/generated-docs-truth.test.ts tests/mcp/docs.test.ts --maxWorkers=1 --minWorkers=1
corepack pnpm --filter @usebrick/website test
corepack pnpm --filter @usebrick/website typecheck
corepack pnpm --filter @usebrick/website build
git diff --cached --check
git status --short
```

Expected: every command passes; protected/user-owned paths remain unstaged; no runtime, release, publish, or deployment command has run.

- [ ] **Step 6: Review the rendered website locally**

Start the built preview only if a free local port is available, capture desktop and mobile screenshots of `/` and `/docs`, and verify the hero, capability statuses, install command, telemetry boundary, and historical calibration labels. This is local evidence only and does not authorize deployment.

- [ ] **Step 7: Commit the integrated checkpoint**

```bash
git add package.json scripts/validate-positioning-docs.test.mjs
git diff --cached --name-only
git commit -m "docs(platform): converge UseBrick product truth"
```

Expected: one integrated documentation commit contains all three reviewed groups plus the validator, with no historical evidence rewrite or public mutation.

---

## Self-review record

- Spec coverage: sole-product hierarchy, buyer hypothesis, GTM readiness, market provenance, package truth, Render Labs, telemetry, current CLI, historical evidence, and release boundaries each map to an explicit task.
- Placeholder scan: no implementation placeholders remain; angle-bracket tokens are command-time commit/branch substitutions defined by the coordinator.
- Interface consistency: all three groups consume the same plan commit and have disjoint write sets; only the coordinator modifies `package.json` and creates the global validator.
- Deferred facts: final CAL-002 hashes, application state, gates, self-scan results, and closeout statuses remain in CAL Task 21 and are not invented by this pass.

## Execution handoff

Execute with three parallel isolated worktrees and coordinator review. This is the already-approved mode for the current roadmap execution; no additional execution-choice prompt is required.
