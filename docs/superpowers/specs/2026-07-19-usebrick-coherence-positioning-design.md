# UseBrick coherence positioning and documentation convergence

**Date:** 2026-07-19
**Status:** approved
**Approved:** 2026-07-19 by repository-owner implementation instruction
**Authority:** repository-owner market review and documentation instruction

## Reason for existence

UseBrick's current documentation is close to the intended product direction,
but it still distributes strategy across SlopBrick, brick names, old phase
plans, calibration claims, and website copy. This design defines one durable
position and one bounded reconciliation method without rewriting historical
evidence or documenting unshipped behavior as current.

## Decision

> **UseBrick is the coherence and verification layer for agent-built
> software.**

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

- Finish the evidence-led first scan and current CAL-002 authority program.
- Align local website source, package claims, telemetry language, and release
  facts; do not infer deployment authorization.
- Stop expanding rule count unless an observed user problem requires it.
- Move `GTM-001` from dormant protocol to a ready, consent-safe plan for 10–20
  observed external sessions. A documentation change authorizes planning, not
  contacting, scheduling, or recording a participant.
- Measure useful finding, action, rescan, and return behavior. Do not convert
  participant observations into calibration labels or source authority.

### Next: 31–90 days

- Prove one narrow LockBrick new-debt gate in the existing CLI.
- Implement privacy-safe outcome events after the first-scan contract.
- Benchmark MemoryBrick against native agent context across multiple agents.
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
