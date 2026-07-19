# Impact Assessment — UseBrick coherence positioning

## Target

Converge every current strategy, execution, package, and website documentation
surface on UseBrick as the sole coherence and verification product, with
SlopBrick as the shipped acquisition surface and the other brick names as
internal capability boundaries.

The governing design is
`docs/superpowers/specs/2026-07-19-usebrick-coherence-positioning-design.md`.
This dedicated impact file does not replace `specs/IMPACT_LATEST.md`, which
currently owns the active SB-UX-001 shared-report impact map.

## Dependents

The blast radius is cross-cutting and includes more than thirty current files:

| Surface | Direct dependents |
| --- | --- |
| Strategy authority | `README.md`, `ROADMAP.md`, `docs/ARCHITECTURE.md`, `docs/future-extractions.md` |
| Execution control | `docs/execution/index.json`, `STATUS.md`, changelog, and GTM/MEM/LOCK/MEND/ENT/TEL/VAL/SB-UX/REL plans |
| Package truth | SlopBrick README, roadmap, examples, contribution, architecture, MCP, scoring, calibration, language, and generated-doc boundaries |
| Website truth | Base metadata, hero, trust strip, product ladder, comparison, CTA, docs route, lifecycle narrative, and product-fact projection |
| Market provenance | One new dated `docs/research/` note containing sources, assumptions, scenarios, and explicit uncertainty |

Historical execution evidence, archived plans, released-package receipts, and
frozen calibration artifacts are referenced dependents but not edit targets.

## Affected plans

This repository has no `specs/release-plan.yaml`; the canonical execution index
maps the affected work:

- `SB-UX-001`: acquisition loop and first useful finding.
- `CAL-002`: current evidence/provenance truth consumed by final docs.
- `VAL-001`: owner-only validation remains distinct from market evidence.
- `GTM-001`: changes from dormant protocol to ready external-session plan;
  execution remains separately authorized and consent-bound.
- `TEL-001`: outcome measures become the privacy-safe scan-to-rescan contract.
- `MEM-001`: cross-agent repository-owned context benchmark.
- `LOCK-001`: first paid workflow hypothesis and new-debt enforcement proof.
- `MEND-001`: remains gated on trusted deterministic repair.
- `ENT-001`: remains gated on repeated paid-team demand.
- `REL-001`: npm and website authority remains unchanged.

## Test coverage

- `scripts/validate-execution-docs.test.mjs` and `pnpm plans:validate` cover
  execution-index/status/plan agreement.
- `packages/slopbrick/tests/generated-docs-truth.test.ts` covers generated and
  current package-document facts when present in the integrated CAL-002 wave.
- `packages/slopbrick/tests/mcp/docs.test.ts` covers documented MCP parity.
- Website unit route/data contracts cover source/data consistency.
- Website typecheck and build cover Astro component and data projections.
- Existing language-support and runtime-policy tests protect generated facts
  referenced by the website.

Gaps to close in the implementation plan:

- phrase-level assertions for sole-product versus capability language;
- explicit checks that current command examples remain `slopbrick`;
- an execution-doc assertion for GTM planned/zero-completed-session truth; and
- link validation for the dated research note and canonical roadmap.

## Risk: High

The change crosses product strategy, current release facts, planned product
status, research claims, execution dependencies, and public website source.
The primary failure mode is not a compile error; it is contradictory truth or
an accidental shipped/release/market-demand claim.

## Recommended action

Proceed with one approved doctrine and three disjoint documentation worktrees.
Keep volatile evidence in the dated research note, current state in execution
authority, and durable positioning in the roadmap. Integrate with phrase,
link, plan, package-doc, website, build, and diff gates. Do not rewrite
historical evidence or infer live deployment from a local website build.
