# UseBrick roadmap

**Updated:** 2026-07-22
**Execution status:** [docs/execution/STATUS.md](docs/execution/STATUS.md)

## Product thesis

> **UseBrick keeps AI-generated software coherent.**

UseBrick is the repository-owned quality, coherence, and verification layer
for agent-built software. It is one customer-facing product and one contract
shared by developers, coding agents, and CI.

SlopBrick is the free local front door. Memory preserves what the repository
knows and expects. Lock prevents new drift. Mend repairs only trusted findings.

The practical question remains:

> The app works, but is it actually well built?

The measurable loop is **scan -> useful finding -> fix or decline -> rescan ->
protect**. Rule count, authorship claims, and any one score are supporting
surfaces, not the north star.

## Users and market hypothesis

Serious solo developers, founders, and vibe coders are the product-led entry
audience. They should get a useful local result without an account.

The initial paying-buyer hypothesis is AI-native software teams and agencies
with roughly 5–100 developers, especially TypeScript-heavy web teams managing
frequent agent-authored changes and architecture, maintenance, contractual, or
reputational risk.

Neither segment is validated. The repository owner is the only completed
tester. External sessions completed: zero. Market sizing, competitor facts,
and pricing scenarios live in the dated
[research note](docs/research/usebrick-market-positioning-2026-07-19.md).

## Product and capability model

| Product or capability | Role | Sequencing boundary |
| --- | --- | --- |
| **UseBrick** | Repository-owned quality, coherence, and verification contract | Sole customer-facing product |
| **SlopBrick** | Detect and explain visual, frontend, code, and repository slop | Shipped npm package, current CLI, free scanner, and acquisition surface |
| **Memory capability** | Compile observed facts, approved intent, provenance, and freshness into bounded context | Begin read-only; benchmark before adding a store or package |
| **Pick flow** | Initialize the Constitution, approved stack, and policy | Fold into onboarding and policy authoring |
| **Lock capability** | Prevent newly introduced verified drift | First paid workflow hypothesis inside the existing CLI |
| **Mend capability** | Apply narrow deterministic repairs with proof and rollback | Parked until enforcement earns trust |
| **RenderBrick Labs** | Test incremental value from rendered and runtime evidence | Benchmark only; stop if value is not material |
| **Enterprise controls** | Shared policy, approvals, audit, and multi-repository governance | Build only after repeated paid-team demand |

Current commands remain `slopbrick`. A future `usebrick scan`, `check`, `fix`,
or `runtime` surface requires its own implementation and migration decision.

## Retained idea lineage

| Earlier idea | Current role |
| --- | --- |
| `slop-audit` | Became SlopBrick, the open diagnostic wedge |
| StackPick / PickBrick | Became `init`, Constitution setup, and policy authoring |
| MCP Registry Bridge | Remains an agent integration, not the company |
| `slop-lock` | Became the Lock new-debt workflow |
| GIR | Becomes deterministic transformation logic inside Mend |
| BRICK Cloud | Delayed hosted history, approvals, and governance |

UseBrick is not a suite of separately marketed small tools. Brick names define
responsibilities and evidence gates inside one lifecycle.

## Connected system and moat

```text
observe repository and runtime facts
              -> preserve approved intent and rationale
              -> compile fresh bounded agent context
              -> block newly introduced drift
              -> apply narrow reversible repairs
              -> rescan, test, and verify
```

No step is unique by itself. The defensible asset is the **coherence graph**:

1. observed structure, dependencies, patterns, and runtime state;
2. declared architecture, conventions, exceptions, and rationale;
3. provenance, scope, and freshness for every fact;
4. accepted, declined, suppressed, waived, and fixed outcomes;
5. enforcement decisions and new-debt state;
6. repair diffs, tests, rescans, runtime checks, and rollback receipts; and
7. cross-agent benchmark evidence.

The rule catalog is reproducible. Durable value comes from connecting the
catalog to repository intent and verified outcomes.

## SlopBrick product contract

SlopBrick finds low-quality, inconsistent, or context-blind patterns amplified
by AI-assisted development. It does not prove that AI wrote a file.

### First-scan taxonomy

1. Visual Slop.
2. Frontend Implementation.
3. Code and Logic.
4. Repository Coherence.
5. Accessibility and Resilience.

Security remains an orthogonal specialist score and gate. Testing appears in
resilience and engineering-hygiene evidence. The first screen shows at most
three actions and preserves access to the full report.

### Evidence model

- **Deterministic:** exact reproducible evidence. It may gate only when the
  applicable policy authorizes it.
- **Calibrated:** measured association or quality behavior with stated limits.
  It is not authorship proof and stays default-off without current authority.
- **Advisory:** qualitative or model-assisted review. It cannot block unless an
  explicit repository policy turns the concern into a deterministic check.

### Scores and the Slop Index

The memorable **Slop Index** is retained as a future shareable acquisition and
reporting concept. It is not a current command, field, formula, or release
claim.

The current workspace candidate reports `aiSlopScore`,
`engineeringHygiene`, `security`, and `repositoryHealth`. Repository Health is
the bounded first-screen headline; the configured AI Slop policy result remains
separate.

Any future Slop Index must expose its dimensions, evidence quality, trend,
new and removed slop, baseline, and CI threshold. A rename or formula change
requires separate calibration, compatibility, UX, and release approval.

## Two intelligence planes

| Plane | Learns | Boundary |
| --- | --- | --- |
| Repository intelligence | Facts, approved patterns, architecture, exceptions, and rationale for one repository | Repository-owned and local by default |
| Global slop intelligence | Which findings are fixed, declined, suppressed, recurrent, or accepted across opted-in use | Privacy-safe and opt-in; no raw source or repository identity by default |

A global prior may inform confidence. It cannot override an approved local
exception, silently change severity, or become calibration/source authority
without a separate reviewed admission step.

Memory must be structured, provenance-aware, freshness-aware, human-readable,
agent-neutral, and enforceable by Lock. Merely storing Markdown or chat history
is not differentiation.

## Current verified baseline

- Latest verified npm release: `slopbrick@0.43.0`.
- Workspace candidate: unreleased `slopbrick@0.45.0`.
- Published catalog: 103 rules in 22 generated categories.
- Workspace catalog: 119 rules in 27 categories.
- CAL-002: complete at Task 20 checkpoint `bd47dbd7e`.
- Applied policy: 41 default-on quality rows; 32 unmeasured quality candidates
  and 32 research-origin rows default-off; 4 blocked, 3 superseded, and 7
  retired; every row remains non-admitting.
- Corpus v1: source-attested internal evaluation only; not witnessed
  authorship, quality ground truth, redistribution authority, or v10.3 gold.
- Public release and future deployment authority remain under `REL-001`.

Exact tests, receipts, dependency blockers, self-scan results, and working-tree
state belong in [STATUS](docs/execution/STATUS.md), not this roadmap.

## Operating principles

- **Local-first and useful before signup.** The first scan must stand alone.
- **Evidence before confidence.** Keep deterministic, calibrated, and advisory
  findings distinct.
- **Repository truth wins.** Global learning cannot silently override policy.
- **Current debt is not new debt.** Lock must work without a full cleanup.
- **No uncalibrated default-on rules.** Candidate signals stay off until their
  current admission criteria pass.
- **Origin and quality are separate.** AI-positive does not mean bad, and
  human-negative does not mean good.
- **Repairs are deterministic and reversible first.** Mend must rescan, test,
  and roll back.
- **One product, one planning authority.** Strategy lives here; status and
  dependencies live in `docs/execution/index.json`.
- **No implicit public action.** Local qualification, push, release, npm
  publication, and website deployment remain separate authorities.
- **No project-wide blockers.** Continue the highest-priority independent plan
  without inventing labels, evidence, or authorization.

## Now — close the free product loop

1. Preserve completed `TEL-001`: its local, inspectable outcome events cover
   useful finding, action or decline, rescan, return, export, and deletion;
   normal scans and outbound reporting remain separate.
2. Preserve the completed `SB-UX-001` first-screen contract: one transparent
   headline, five areas, at most three actions, truthful evidence/repair
   boundaries, and no ordinary-scan baseline mutation.
3. Preserve `VAL-001` as optional owner-selected product evidence. It has no
   participant target and cannot establish market demand.
4. Keep `GTM-001` limited to profile, script, consent, and empty redacted
   receipt materials. No outreach or collection is authorized.
5. Stop expanding rule count unless an observed problem requires a rule.

## Next — make the scanner repository-aware and enforceable

1. After explicitly starting the still-draft plan and approving its ADR, build
   `MEM-001` as a read-only projection of facts, intent, provenance, and
   freshness. Benchmark it against native context across agents.
2. Prove `LOCK-001` on one deterministic new-debt family in the existing CLI,
   including changed evidence, waivers, and incomplete-scan failure semantics.
3. Run `LABS-001` with fixed defects and blind source-only versus rendered
   evidence scoring. Stop if incremental value is not material.
4. Run external sessions and test pricing only after separate participant
   authorization. Keep every price and buyer claim hypothetical until observed.

## Later — repair and team governance

- Start Mend with a small set of deterministic transformations: token
  replacement, approved-component reuse, forbidden-dependency replacement, or
  another mechanically bounded change with byte-identical rollback.
- Add shared policy, exceptions, approvals, PR receipts, and hosted history
  only when they improve the proven local workflow.
- Add cross-repository context and enterprise controls only after several
  paying teams independently report the same recurring need.

## Business-model hypothesis

- **Free:** local scan, basic MCP, repository artifacts, one baseline, open
  schemas, deterministic rules, and basic Constitution support.
- **Team:** new-debt CI, shared policy, evidence receipts, approvals, exceptions,
  outcome history, and cross-agent adapters. Research range: $19–$29 per active
  contributor with a possible $99–$399 workspace minimum.
- **Enterprise:** self-hosting, SSO/RBAC, audit, policy inheritance, private
  models, retention controls, and multi-repository governance only after demand.

These are packaging and pricing hypotheses, not offers or validated demand.

## Twelve-month decision gates

| Gate | Proceed only when | If the gate fails |
| --- | --- | --- |
| Scanner trust | Owner walkthroughs repeatedly reach a useful finding and rescan; deterministic checks have acceptable precision | Improve SlopBrick; do not widen the suite |
| Outcome intelligence | Events are inspectable, privacy-safe, useful, and explicitly consented for outbound use | Keep outcomes local or disable the path |
| Repository intelligence | Repository-owned context improves predeclared tasks without stale or bloated context | Keep Memory read-only and experimental |
| Team enforcement | Lock prevents verified new debt with acceptable false-block and waiver burden | Keep enforcement in shadow mode |
| Repair | A bounded fix applies, rescans, tests, and rolls back byte-identically | Keep Mend parked |
| Rendered evidence | Blind comparison shows material incremental detection without unacceptable false positives | Stop Render Labs |
| Monetization | Teams repeatedly use Lock and demonstrate willingness to pay | Stay free and product-led |
| Enterprise | Several paying teams independently request the same controls | Do not build enterprise infrastructure |

## Success measures

The north star is **repositories that fix or prevent at least one verified
finding each week**.

Owner-side measures are scan completion, time to first useful finding, action
or decline, rescan, return, confirmed prevention, and waiver rate. Conversion,
willingness to pay, and retention remain future external measures.

Guardrails are incomplete scans, raw-source egress, uncalibrated default-on
rules, unsafe repair, stale memory, false blocks, and claim/evidence drift.

## Non-goals

- Proving that an individual file was written by AI.
- Replacing security scanners, generic linters, PR reviewers, visual-regression
  tools, coding agents, or project management.
- Building a design generator, unrestricted transcript archive, or vector
  database of every file.
- Marketing capability names as separate products or creating packages before
  their architecture and evidence gates pass.
- Treating market scenarios, owner testing, or planned sessions as demand.
- Making push, tag, release, publication, deployment, or outreach implicit.

## Execution authority

- [Execution guide](docs/execution/README.md)
- [Machine-readable plan index](docs/execution/index.json)
- [Current status](docs/execution/STATUS.md)
- [Planning changelog](docs/execution/CHANGELOG.md)
- [Bounded plans](docs/execution/plans/)

Verify strategy and execution consistency with:

```bash
corepack pnpm plans:validate
node --test scripts/validate-positioning-docs.test.mjs
```
