# UseBrick coherence positioning and documentation convergence

**Date:** 2026-07-19
**Account-wide review incorporated:** 2026-07-22
**Status:** approved
**Approved:** 2026-07-19 by repository-owner implementation instruction
**Re-approved:** 2026-07-22 by repository-owner account-wide review instruction
**Authority:** repository-owner market reviews and documentation instructions

## Reason for existence

UseBrick's current documentation is close to the intended product direction,
but it still distributes strategy across SlopBrick, brick names, old phase
plans, calibration claims, and website copy. This design defines one durable
position and one bounded reconciliation method without rewriting historical
evidence or documenting unshipped behavior as current.

## Decision

> **UseBrick keeps AI-generated software coherent.**

The durable category statement is:

> **UseBrick is the repository-owned quality, coherence, and verification
> layer for agent-built software.**

The supporting contract is:

> **One repository-owned contract shared by developers, coding agents, and
> CI.**

UseBrick is the sole customer-facing product. SlopBrick is the shipped npm
package, current CLI, free local scanner, and acquisition surface. The other
brick names describe internal capabilities and roadmap boundaries; they are
not separately marketed products or authorization to create packages.

| Capability | Responsibility | Current claim boundary |
| --- | --- | --- |
| SlopBrick | Observe, detect, explain, and emit repository evidence | Shipped as `slopbrick`; only verified package facts may be called current |
| MemoryBrick | Compile repository-owned facts, intent, provenance, and freshness into bounded agent context | Planned read-only substrate; not a memory SaaS or shipped product |
| LockBrick | Enforce approved policy and prevent verified new drift | Planned first paid team workflow inside the existing CLI before extraction |
| MendBrick | Apply narrow, deterministic, reversible repairs with receipts | Parked until detection and enforcement earn trust |
| RenderBrick Labs | Add rendered/runtime evidence when source inspection is insufficient | Benchmark-only Labs capability; no browser product, package, or incremental-value claim yet |
| Pick flow | Initialize repository policy and approved intent | Part of onboarding and policy authoring, not a product |

Future interface language may describe `usebrick scan`, `explain`, `baseline`,
`check`, `fix`, and `runtime` as one coherent product surface. Current usage
instructions must continue to show the real `slopbrick` commands until a
separate implemented and reviewed CLI decision exists.

## Customer and problem

The initial buyer hypothesis is AI-native software teams and agencies with
roughly 5–100 developers, especially TypeScript-heavy web teams. They combine
frequent agent-authored changes with reputational, contractual, architecture,
and maintenance risk.

Serious solo developers and vibe coders remain the top-of-funnel audience for
the free local scan. They are not presented as the proven core buyer. The
repository owner remains the only completed product tester until external
session evidence exists.

The product loop is:

```text
observe facts and runtime evidence
              -> preserve approved intent and rationale
              -> compile fresh bounded agent context
              -> block newly introduced drift
              -> apply narrow reversible repairs
              -> rescan, test, and verify
```

The measurable adoption loop is **scan -> useful finding -> fix -> rescan ->
protect**. Rule count, an AI-detection claim, or a single score is not the
north star.

## Account-wide product doctrine

The AI-slop scanner and repository-intelligence ideas solve different halves
of one problem. AI slop is the visible failure: generated software becomes
generic, inconsistent, fragile, or architecturally incoherent. Context loss is
one major cause: each agent lacks durable knowledge of what the repository
uses, expects, and has approved.

UseBrick therefore has two intelligence planes:

| Plane | Job | Authority boundary |
| --- | --- | --- |
| Repository intelligence | Preserve observed facts, approved intent, rationale, exceptions, provenance, and freshness | Repository-owned; private facts and policy stay local by default |
| Global slop intelligence | Learn which patterns are useful, noisy, fixed, declined, suppressed, or recurrent | Privacy-safe and opt-in; outcome events never become labels or policy without separate review |

The local contract wins conflicts. A global prior may inform confidence, but it
cannot override an explicit repository exception or silently change a gate.

The retained idea lineage is:

| Earlier name | Durable role |
| --- | --- |
| `slop-audit` | SlopBrick, the free local diagnostic and distribution wedge |
| StackPick / PickBrick | `init`, Constitution setup, and policy authoring |
| MCP Registry Bridge | An integration surface for agents, not the company |
| `slop-lock` | Lock capability and the first paid new-debt workflow |
| GIR | Deterministic transformation engine inside the future Mend capability |
| BRICK Cloud | Delayed hosted history, approvals, and team governance after adoption |

## SlopBrick analysis and score decision

SlopBrick remains explicitly about visual, frontend, code, and repository slop
that AI-assisted development amplifies. It does not claim that an individual
file was written by AI.

The first-scan information architecture remains five areas: Visual Slop,
Frontend Implementation, Code and Logic, Repository Coherence, and
Accessibility and Resilience.

Security remains an orthogonal specialist score and gate. Testing is visible
inside resilience and engineering-hygiene evidence. Neither is hidden inside a
single unexplained number.

Findings use three customer-readable evidence classes:

- **Deterministic:** exact reproducible evidence; eligible for CI only when the
  applicable policy authorizes it.
- **Calibrated:** measured association or quality behavior with stated limits;
  never authorship proof and never default-on without current authority.
- **Advisory:** qualitative or model-assisted review; non-blocking unless an
  explicit repository policy converts the concern into a deterministic check.

The **Slop Index** is retained as a future shareable acquisition and reporting
concept. It is not the current CLI contract. The current workspace candidate
still reports `aiSlopScore`, `engineeringHygiene`, `security`, and
`repositoryHealth`; the first-screen headline remains Repository Health.
Changing the score name or formula requires a separate compatibility,
calibration, UX, and release decision.

## Defensible system

The rule catalog is not the moat. The defensible asset is a coherence graph
that connects observed facts, declared intent, provenance and freshness,
human outcomes, enforcement decisions, repair receipts, runtime evidence, and
cross-agent benchmark results.

The product experience remains one loop: **scan, understand, enforce, and
repair**. Brick names express internal responsibilities, not a suite customers
must purchase or learn separately.

## Positioning boundaries

- Do not position UseBrick as an authorship detector, generic AI reviewer,
  memory database, coding agent, or agent-controlled browser.
- Do not make "more rules" the durable value proposition.
- Keep `AI Slop Score` as a current SlopBrick compatibility and acquisition
  surface while making repository coherence and verification the product
  category.
- Keep origin association, quality authority, and runtime eligibility
  separate in every claim.
- Keep repository-local history separate from outbound reporting; never use
  an undifferentiated "no telemetry" or "no network" claim.
- Keep local qualification, public release, npm publication, and website
  deployment as separate authorities.

## Evidence and market-research boundary

Volatile market facts belong in one dated research note under `docs/research/`.
Durable product and package docs may cite its conclusion but must not repeat
market-size arithmetic, competitor revenue, or current pricing.

The dated note must distinguish observations from hypotheses and correct the
supplied model where the cited source does not support the stated input:

- SlashData estimates 38.4 million professional developers in Q3 2025.
- JetBrains reports 74% adoption of specialist developer AI tools in January
  2026; this replaces the unsupported attribution of 75% adoption to
  SlashData.
- Combining those independent studies yields a directional 28.4 million-seat
  proxy, not a measured UseBrick market.
- At $18–$30 per month, the broad theoretical spend proxy is approximately
  $6.1B–$10.2B annually.
- Applying the same 74% proxy to SlashData's 14.5 million medium-company and
  7.5 million enterprise developers, then an explicit 10%–20% fit assumption,
  yields approximately 1.63–3.26 million seats and $352M–$1.17B annual spend
  capacity. It is a scenario, not a forecast.

The research note must link primary or clearly attributed sources, including
[JetBrains adoption research](https://blog.jetbrains.com/research/2026/04/which-ai-coding-tools-do-developers-actually-use-at-work/),
[Stack Overflow's 2025 survey summary](https://stackoverflow.blog/2025/12/29/developers-remain-willing-but-reluctant-to-use-ai-the-2025-developer-survey-results-are-here/),
[DORA's 2025 report](https://dora.dev/research/2025/dora-report/),
[Gartner's agentic-development outlook](https://www.gartner.com/en/newsroom/press-releases/2026-05-20-gartner-says-the-market-for-enterprise-ai-coding-agents-is-entering-a-new-phase-of-expansion-and-competitive-realignment),
and current official competitor product or pricing pages. Reported private
company revenue remains explicitly attributed reporting, not audited market
proof.

## Roadmap effect

### Now: 0–30 days

- Close the evidence-led first scan against the completed CAL-002 authority
  program.
- Preserve aligned website, package, telemetry, and release facts; do not infer
  deployment or release authority from source changes.
- Implement the privacy-safe local outcome contract after the first-scan type
  boundary, with inspect, export, delete, and explicit outbound consent.
- Stop expanding rule count unless an observed user problem requires it.
- Keep `GTM-001` ready to prepare a consent-safe plan for 10–20 observed
  external sessions. Documentation authorizes materials, not contact,
  scheduling, recording, or collection.
- Measure useful finding, action, rescan, and return behavior. Do not convert
  participant observations into calibration labels or source authority.

### Next: 31–90 days

- Benchmark a small repository-owned Memory projection against native agent
  context across multiple agents.
- Prove one narrow Lock new-debt gate in the existing CLI after scanner trust.
- Run a bounded RenderBrick source-only versus rendered-evidence experiment.
- Test team pricing and workflow value with agencies and AI-native teams;
  document prices as hypotheses until paid evidence exists.

### Later: 3–12 months

- Add shared policy, exceptions, approvals, and pull-request receipts only
  after the local enforcement loop is trusted.
- Add multi-repository context and a small repair set only after their own
  benchmarks and rollback gates.
- Add enterprise controls only when several paying teams independently report
  the same need.

## Documentation architecture

The reconciliation has five projections:

1. **Strategy authority:** `ROADMAP.md`, root `README.md`, architecture, and a
   dated market-research note.
2. **Execution truth:** `docs/execution/index.json`, `STATUS.md`, changelog,
   and the bounded GTM, validation, telemetry, memory, lock, repair, enterprise,
   first-scan, and release plans.
3. **Shipped package truth:** SlopBrick README, contribution, examples,
   architecture, MCP, scoring, language, calibration, and package roadmap
   surfaces. The package roadmap becomes a historical pointer to the root
   roadmap rather than a second planning authority.
4. **Website source:** metadata, hero, product ladder, comparison, trust,
   CTA, docs route, and lifecycle narrative. Source updates do not authorize
   a live deployment.
5. **Historical evidence:** frozen evidence receipts, archived plans, released
   package facts, and superseded design records remain unchanged. Current docs
   link to them with explicit historical status.

## Implementation topology

After written-spec approval, amend the active CAL-002 plan so its final
documentation wave consumes this strategy packet. Execute three disjoint
worktree groups:

- strategy, research, and execution-control documents;
- package and technical documentation;
- website and customer-facing source copy.

The coordinator integrates the groups, resolves only source-of-truth
conflicts, and creates one reviewed documentation checkpoint. Later CAL-002
closeout facts may update the same current documents without changing this
positioning decision.

## Verification

The change is complete only when:

```bash
corepack pnpm plans:validate
node --test scripts/validate-execution-docs.test.mjs
corepack pnpm --filter slopbrick exec vitest run tests/generated-docs-truth.test.ts tests/mcp/docs.test.ts --maxWorkers=1 --minWorkers=1
corepack pnpm --filter @usebrick/website test
corepack pnpm --filter @usebrick/website typecheck
corepack pnpm --filter @usebrick/website build
```

Additional phrase and link checks must prove:

- UseBrick is the sole product and SlopBrick is the shipped front door;
- AI slop remains SlopBrick's acquisition wedge without becoming an authorship
  claim;
- the Slop Index is retained only as a future, separately gated concept;
- repository intelligence and opt-in global outcomes remain separate;
- planned capabilities are never presented as shipped products;
- the current CLI is never documented as `usebrick`;
- owner-only and zero-session truth is not backfilled into external evidence;
- no current page calls historical v10.1 evidence current v10.3 admission;
- local history and outbound reporting remain distinct; and
- no docs commit claims push, tag, publish, deployment, or release authority.

## Non-goals

- Renaming the npm package or CLI.
- Creating MemoryBrick, LockBrick, MendBrick, or RenderBrick packages.
- Contacting participants, sending outreach, setting prices, collecting data,
  or claiming product-market fit.
- Changing scanner behavior, score names, calibration state, telemetry code,
  or runtime policy in this documentation change.
- Rewriting immutable evidence or historical records to match current
  positioning.
