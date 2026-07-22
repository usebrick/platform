# CAL-002 Progressive Quality Authority Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace CAL-002's three-way origin questionnaire with an additive, hash-bound authority workflow that classifies all 119 rules, closes unrequested contextual review truthfully at zero labels, proves three supersessions and nine transferred deterministic claims, and applies one non-admitting runtime policy without treating AI association as quality or authorship authority.

**Architecture:** Preserve every CAL-002 v1 contract and receipt as historical input, then add focused v2 modules for authority, owner state, quality disposition, parity, origin projection, matrix reduction, and application. The v2 reducer consumes the frozen 119-rule catalog plus immutable v1 hashes, produces a complete policy candidate, and activates it through a tiny static runtime provider only after exact owner approval and full verification; quality authority and AI association remain orthogonal throughout.

**Tech Stack:** TypeScript 5.9, Node.js 22/24, Vitest, Ajv 2020 JSON Schema tests, canonical JSON/SHA-256 helpers, package-local `node --import tsx` CLI scripts, pnpm workspaces, Markdown execution control, and the existing SlopBrick scanner/rule registry.

## Global Constraints

- Start from `ae0a4cab1` on `main`; retain the approved design commits `d2fc36676`, `996770a33`, and `ae0a4cab1` and the implemented v1 boundary through `e6c9695ea`.
- Preserve the modified `.superpowers/sdd/progress.md` and untracked `.astro/`, `.playwright-cli/`, `TODO.md`, `docs/execution/evidence/artifacts/`, `pet-runs/`, and `src/` paths. Never stage them wholesale.
- Keep `.slopbrick/calibration/cal-002/origin-state.json` byte-identical, mode `0600`, 256 bytes, and SHA-256 `07997204f63f9a03c16601f953ef078f1caaa8db7f7f8fca9ba4a73f3c6270fd`.
- Do not resume or overwrite the v1 `classify-origin` state. The new owner artifact is `cal-002-authority-state-v2` and must bind `priorStateSha256` to the exact v1 state.
- Preserve the locked catalog at 119 rows and SHA-256 `d6d17e252b71e4918375c526c5c209a7550cb089a12f9d82281bb99883a1f506`.
- Preserve frozen CAL-001 and CAL-002 v1 evidence. Add v2 schemas and reducers; do not reinterpret or rewrite a v1 receipt.
- SlopBrick analyzes software quality across all code. AI association is provenance and prioritization metadata, never authorship proof and never sufficient finding, score, gate, repair, or default-on authority.
- The exact whole-catalog projection is 47 starting quality + 26 transferred quality + 4 blocked quality + 3 superseded + 7 retired + 32 research-origin = 119.
- Only `evidence-ready` rows may create deterministic or blinded assignments. The four blocked rows remain disabled and assignment-ineligible in this closeout.
- Unselected contextual/statistical rows close with `measurementStatus: 'not-requested-owner-capacity'`, zero labels, no Wilson interval, and `runtimeOutcome: 'quality-candidate-default-off'`.
- The complete 32-rule contextual/statistical workload would be 1,920 initial labels and 6,400 at maximum expansion. It is not required for closeout.
- Any optional owner cohort is selected only after reach analysis, contains at most four rule IDs, starts at 30 findings plus 30 controls per rule (240 labels for four), and expands to at most 100 per arm (800 labels for four).
- The repository owner is the only tester. Do not introduce local pilots, external participants, or a second reviewer requirement.
- Statistical evidence can never produce `default-on`. Origin evidence can never produce quality authority.
- Explicit diagnostic opt-in may make advisory, unmeasured, or research-origin findings visible; it must never make those rows score- or gate-eligible. Blocked, superseded, and retired rows are never runnable.
- Keep raw source, snippets, absolute paths, repository identities, and personal identity out of durable receipts. Use only `reviewerAuthority: 'repository-owner'` and `admitted: false`.
- Use one scanner worker and `--maxWorkers=1 --minWorkers=1` for focused Vitest runs. Run recursive gates serially.
- Keep `@usebrick/core`, its schemas, `STRUCTURE_SCHEMA_VERSION`, package versions, release state, public package, live website, score formulas, and gate thresholds unchanged.
- Do not push, tag, publish, deploy, recruit participants, acquire external data, refresh a debt baseline, or authorize a release under this plan.

---

## Locked File and Interface Map

### Additive CAL-002 v2 control plane

- `packages/slopbrick/src/calibration/cal-002/contracts-v2.ts` — v2 versions, closed vocabularies, artifact types, and strict validators; imports v1 hash/canonical helpers without changing v1 types.
- `packages/slopbrick/src/calibration/cal-002/authority.ts` — explicit metadata for 47 starting quality rows, exact 40 approved owner rows, generated 32 research holds, and complete 119-row authority projection.
- `packages/slopbrick/src/calibration/cal-002/authority-session.ts` — proposal, private state, immutable approval receipt, prior-v1-state binding, and one closed batch decision.
- `packages/slopbrick/src/calibration/cal-002/quality-disposition.ts` — readiness-gated cohort selection, optional delegation to v1 blinded sampling, and zero-label or measured contextual disposition.
- `packages/slopbrick/src/calibration/cal-002/supersession.ts` — parity case receipts and exact three-row supersession verification.
- `packages/slopbrick/src/calibration/cal-002/oracles-v2.ts` — combines the frozen 32-row v1 deterministic receipt with nine transferred deterministic/standards rows.
- `packages/slopbrick/src/calibration/cal-002/origin-v2.ts` — projects only the 32 research-origin rows and binds historical internal-origin evidence without quality authority.
- `packages/slopbrick/src/calibration/cal-002/matrix-v2.ts` — fail-closed 119-row merge over authority, oracle, quality, origin, and parity receipts.
- `packages/slopbrick/src/calibration/cal-002/application-v2.ts` — v2 matrix approval, generated policy, and application receipt.
- `packages/slopbrick/src/calibration/cal-002/artifact-io.ts` — adds validator-injected private canonical state/receipt primitives while retaining all v1 wrappers.
- `packages/slopbrick/scripts/cal/cal-002.ts` — adds `classify-authority`, `quality-closeout`, `plan-quality-cohort`, `reduce-oracles-v2`, `verify-supersession`, `verify-origin-v2`, `matrix-v2`, `approve-matrix-v2`, and `apply-v2`; v1 `classify-origin` exits with migration guidance.

### Additive local schemas

- `packages/slopbrick/src/calibration/cal-002/schemas/cal-002-authority-proposal-v2.schema.json`
- `packages/slopbrick/src/calibration/cal-002/schemas/cal-002-authority-state-v2.schema.json`
- `packages/slopbrick/src/calibration/cal-002/schemas/cal-002-authority-receipt-v2.schema.json`
- `packages/slopbrick/src/calibration/cal-002/schemas/cal-002-quality-disposition-v2.schema.json`
- `packages/slopbrick/src/calibration/cal-002/schemas/cal-002-parity-receipt-v2.schema.json`
- `packages/slopbrick/src/calibration/cal-002/schemas/cal-002-supersession-receipt-v2.schema.json`
- `packages/slopbrick/src/calibration/cal-002/schemas/cal-002-oracle-receipt-v2.schema.json`
- `packages/slopbrick/src/calibration/cal-002/schemas/cal-002-origin-receipt-v2.schema.json`
- `packages/slopbrick/src/calibration/cal-002/schemas/cal-002-final-matrix-v2.schema.json`
- `packages/slopbrick/src/calibration/cal-002/schemas/cal-002-matrix-approval-v2.schema.json`
- `packages/slopbrick/src/calibration/cal-002/schemas/slopbrick-rule-evidence-policy-v2.schema.json`
- `packages/slopbrick/src/calibration/cal-002/schemas/cal-002-application-receipt-v2.schema.json`
- `packages/slopbrick/src/calibration/cal-002/schemas/index.json`

### Rule and doctrine work

- `packages/slopbrick/src/rules/security/sql-construction.ts` — receives canonical `WITH` query coverage.
- `packages/slopbrick/src/rules/ai/console-debug-storm.ts` — receives five-in-thirty-line clustering while retaining test/logger/logging-utility guards.
- `packages/slopbrick/src/rules/ai/any-density.ts` — retains declaration-ratio semantics and quality-only wording; line-density coverage is explicitly rejected.
- `packages/slopbrick/tests/calibration/fixtures/cal-002-parity-sql.ts`, `cal-002-parity-console.ts`, and `cal-002-parity-any.ts` — conflict-free path-free parity cases for the three replacement decisions.
- `packages/slopbrick/tests/calibration/fixtures/cal-002-transfer-oracle-types.ts` — shared closed fixture and real-source-control contracts.
- `packages/slopbrick/tests/calibration/fixtures/cal-002-transfer-oracle-cpp-rust.ts`, `cal-002-transfer-oracle-dead.ts`, and `cal-002-transfer-oracle-security.ts` — conflict-free positive, negative, adversarial, and five fixed-slot cases for the nine transfers.
- `packages/slopbrick/tests/calibration/fixtures/cal-002-transfer-oracle-cases.ts` — canonical aggregate over the three fixture groups, created only after their branches are integrated.
- `packages/slopbrick/tests/helpers/public-rule-copy.ts` — TypeScript-AST extraction of `description`, `message`, and `advice` strings.
- `packages/slopbrick/tests/rules/quality-authority-copy.test.ts` — doctrine guard over all 73 quality rows, `RULE_HINTS`, and generated catalog copy.
- Normalize public copy in these currently failing quality files: `src/rules/ai/any-density.ts`, `src/rules/ai/console-debug-storm.ts`, `src/rules/dead/dead-branch.ts`, `src/rules/dead/unreachable.ts`, `src/rules/dead/unused-import.ts`, `src/rules/dead/unused-local.ts`, `src/rules/dead/unused-parameter.ts`, `src/rules/dup/identical-block.ts`, `src/rules/java/lost-stack-trace.ts`, `src/rules/logic/heaps-deviation.ts`, `src/rules/logic/math-variable-name-entropy.ts`, `src/rules/logic/zipf-slope-anomaly.ts`, `src/rules/product/terminology-drift.ts`, `src/rules/typo/math-button-label-uniformity.ts`, `src/rules/typo/placeholder-text.ts`, and `src/rules/visual/arbitrary-escape.ts`, all beneath `packages/slopbrick/`.
- `packages/slopbrick/src/snippet/data.ts` — quality-only hints for the 73 current quality rows; AI association remains separate metadata.

### Runtime policy support and atomic binding

- `packages/slopbrick/src/rules/current-evidence-policy.ts` — pure v2 validation and accessors over an injected artifact.
- `packages/slopbrick/src/rules/current-evidence-policy-runtime.ts` — one static provider; first committed as inactive legacy fallback, then atomically bound to generated JSON.
- `packages/slopbrick/src/rules/current-evidence-policy.json` — generated complete 119-row applied policy, created only at the atomic application gate.
- `packages/slopbrick/src/rules/registry.ts` — enforces runnable policy before creating contexts.
- `packages/slopbrick/src/cli/effective-issues.ts` — keeps visibility separate from score eligibility.
- `packages/slopbrick/src/rules/signal-strength.ts`, `packages/slopbrick/src/rules/explanation.ts`, `packages/slopbrick/src/cli/explain.ts`, `packages/slopbrick/src/cli/commands/calibration.ts`, `packages/slopbrick/src/cli/commands/rules.ts`, `packages/slopbrick/src/cli/scan.ts`, `packages/slopbrick/src/engine/worker.ts`, `packages/slopbrick/src/types/first-scan.ts`, `packages/slopbrick/src/report/first-scan.ts`, `packages/slopbrick/src/report/first-scan-pretty.ts`, `packages/slopbrick/src/report/pretty.ts`, `packages/slopbrick/src/report/markdown.ts`, `packages/slopbrick/src/report/html/sections.ts`, `packages/slopbrick/src/report/html/utils.ts`, `packages/slopbrick/src/report/sarif.ts`, `packages/slopbrick/src/mcp/patterns.ts`, and `packages/slopbrick/scripts/generate-rule-catalog.ts` — consume one policy/provenance projection while preserving legacy metrics separately.

### Control plane, evidence, and current documentation

- Initial reconciliation: `ROADMAP.md`, `docs/execution/index.json`, `docs/execution/STATUS.md`, `docs/execution/CHANGELOG.md`, `docs/execution/plans/CAL-002-complete-calibration.md`, `docs/execution/plans/SB-UX-001-first-scan.md`, and `docs/execution/evidence/CAL-002-complete-calibration.md`.
- Immutable v2 artifacts: exact JSON files under `docs/execution/evidence/artifacts/cal-002/`; stage named files individually because the parent path is currently user-owned/untracked.
- Final current-doc reconciliation: `README.md`, `ROADMAP.md`, `CONTRIBUTING.md`, `docs/ARCHITECTURE.md`, `docs/calibration/README.md`, `docs/maths.md`, `docs/methodology.md`, `docs/rules.md`, `packages/slopbrick/README.md`, `packages/slopbrick/CHANGELOG.md`, `packages/slopbrick/CONTRIBUTING.md`, `packages/slopbrick/EXAMPLES.md`, `packages/slopbrick/ROADMAP.md`, `packages/slopbrick/docs/MCP.md`, `packages/slopbrick/docs/architecture.md`, `packages/slopbrick/docs/calibration/README.md`, `packages/slopbrick/docs/language-support-matrix.md`, `packages/slopbrick/docs/rule-catalog.md`, `packages/slopbrick/docs/scoring-explained.md`, `packages/slopbrick/docs/scoring-runbook.md`, `packages/website/docs/blog/lifecycle-narrative.md`, and the execution files named above plus `VAL-001`, `TEL-001`, and SB-UX evidence.

## Parallel Execution Topology

Use `superpowers:using-git-worktrees` before the first parallel wave. Every worker receives a fresh worktree/branch, one task or one explicitly named half-task, the approved spec, this plan, exact allowed paths, focused test command, and a prohibition on editing execution state, private owner state, or another worker's files. The coordinator reviews diffs and test receipts, merges one wave, runs the wave integration gate, and only then starts dependent work.

| Wave | Concurrent workers | Merge barrier |
| --- | --- | --- |
| 0 — shared foundation | Tasks 1–5 sequentially | Authority, state, disposition, and supersession contracts are green before fan-out. |
| 1 — parity | Task 6 SQL, Task 7 console, Task 8 `any` in three worktrees | Merge all three; run all parity/native suites and typecheck. Separate fixture files prevent write conflicts. |
| 2 — deterministic evidence | Task 9 C++/Rust and Task 10 dead-code in two worktrees | Merge both; Task 11 then adds security cases and the combined 41-row reducer against integrated fixtures. |
| 3 — doctrine/control | Task 12 public-copy guard and Task 13 origin-v2 in two worktrees | Merge both; run copy, origin, schema, CLI, and typecheck gates before the matrix reducer. |
| 4 — reduction | Task 14 sequentially | Complete v2 matrix/application contracts are the evidence-execution input. |
| 5 — immutable evidence | Evidence generation and both owner decisions sequentially | Proposal, parity, oracle, origin, quality, matrix, and approval hashes must be produced from one integrated commit graph. |
| 6 — runtime integration | Policy foundation first; then scanner/scoring, reports/MCP, and explain/catalog surfaces in three worktrees | Merge all runtime slices; run focused parity plus package typecheck/build. |
| 7 — final docs | Product docs, package technical docs, and execution-control docs in three non-overlapping worktrees | Merge, regenerate the catalog, run all doc validators, then make one truthful closeout commit. |

Never parallelize an interactive owner prompt, writes beneath `.slopbrick/calibration/cal-002/`, immutable artifact generation, matrix approval, policy application, recursive full-suite gate, self-scan, or final execution-index revision. Those operations share state or establish ordered hashes.

---

### Task 1: Reconcile the execution control plane to the approved amendment

**Files:**
- Modify: `ROADMAP.md`
- Modify: `docs/execution/index.json`
- Modify: `docs/execution/STATUS.md`
- Modify: `docs/execution/CHANGELOG.md`
- Modify: `docs/execution/plans/CAL-002-complete-calibration.md`
- Modify: `docs/execution/plans/SB-UX-001-first-scan.md`
- Modify: `docs/execution/evidence/CAL-002-complete-calibration.md`

**Interfaces:**
- Consumes: implementation boundary `e6c9695ea`, approved amendment `d2fc36676`, taxonomy corrections `996770a33` and `ae0a4cab1`, and execution revision 26.
- Produces: execution revision 27 with the same WIP `2/2`, CAL-002 still `in_progress`, and next action bound to the v2 authority contract tests.

- [ ] **Step 1: Record the current hashes and protected state before editing docs**

```bash
git status --short --branch
git log -6 --oneline
stat -f '%Lp %z' .slopbrick/calibration/cal-002/origin-state.json
shasum -a 256 .slopbrick/calibration/cal-002/origin-state.json
```

Expected: `main` includes `ae0a4cab1`; the protected state reports `600 256` and the locked SHA-256; unrelated dirty paths remain visible.

- [ ] **Step 2: Write revision 27 current truth**

Use this exact execution-index transition:

```json
{
  "revision": 27,
  "updatedAt": "2026-07-19",
  "cal002Status": "in_progress",
  "cal002NextAction": {
    "text": "Red-test the additive CAL-002 v2 authority taxonomy and exact 119-row projection.",
    "verify": "corepack pnpm --filter slopbrick exec vitest run tests/calibration/cal-002-authority.test.ts tests/calibration/cal-002-contracts-v2.test.ts --maxWorkers=1 --minWorkers=1",
    "evidencePath": "docs/execution/evidence/CAL-002-complete-calibration.md"
  }
}
```

In prose, record that v1 implementation is checkpointed through `e6c9695ea`, the old questionnaire is paused after one historical hold, the approved replacement uses 26/4/3/7 owner rows and a 119-row projection, no runtime policy changed, and local application remains separate from release.

- [ ] **Step 3: Validate the documentation transition**

Run:

```bash
corepack pnpm plans:validate
node --test scripts/validate-execution-docs.test.mjs
git diff --check
git diff -- ROADMAP.md docs/execution/index.json docs/execution/STATUS.md docs/execution/CHANGELOG.md docs/execution/plans/CAL-002-complete-calibration.md docs/execution/plans/SB-UX-001-first-scan.md docs/execution/evidence/CAL-002-complete-calibration.md
```

Expected: plan and execution validators pass; revision 27 agrees across current control-plane files; no code, artifact, state, admission, or release claim appears.

- [ ] **Step 4: Commit only the revision-27 reconciliation**

```bash
git add ROADMAP.md docs/execution/index.json docs/execution/STATUS.md docs/execution/CHANGELOG.md docs/execution/plans/CAL-002-complete-calibration.md docs/execution/plans/SB-UX-001-first-scan.md docs/execution/evidence/CAL-002-complete-calibration.md
git diff --cached --name-only
git commit -m "docs(calibration): reconcile progressive authority plan"
```

Expected: exactly seven named files are staged; protected dirty paths remain unstaged.

### Task 2: Define v2 vocabularies and the exact 119-row authority projection

**Files:**
- Create: `packages/slopbrick/src/calibration/cal-002/contracts-v2.ts`
- Create: `packages/slopbrick/src/calibration/cal-002/authority.ts`
- Create: `packages/slopbrick/src/calibration/cal-002/schemas/cal-002-authority-proposal-v2.schema.json`
- Create: `packages/slopbrick/src/calibration/cal-002/schemas/cal-002-authority-state-v2.schema.json`
- Create: `packages/slopbrick/src/calibration/cal-002/schemas/cal-002-authority-receipt-v2.schema.json`
- Modify: `packages/slopbrick/src/calibration/cal-002/schemas/index.json`
- Create: `packages/slopbrick/tests/calibration/cal-002-contracts-v2.test.ts`
- Create: `packages/slopbrick/tests/calibration/cal-002-authority.test.ts`

**Interfaces:**
- Consumes: `CAL002_LOCKED_RULE_IDS`, `CAL002_LOCKED_RULE_CATALOG_SHA256`, `CAL002_DETERMINISTIC_RULE_IDS`, `CAL002_CONTEXTUAL_RULE_IDS`, `CAL002_STATISTICAL_RULE_IDS`, and `canonicalArtifact` from `contracts.ts`.
- Produces: `CAL002AuthorityRowV2`, `CAL002AuthorityProposalV2`, `authorityMetadataForRuleId(ruleId)`, `buildCAL002AuthorityProposalV2(catalog, priorStateSha256)`, and strict `validateCAL002Authority*V2` functions.

- [ ] **Step 1: Write red vocabulary and exact-count tests**

```ts
import { describe, expect, it } from 'vitest';
import { buildCatalogFixture } from './helpers/cal-002-fixtures';
import {
  CAL002_OWNER_AUTHORITY_ROWS,
  buildCAL002AuthorityProposalV2,
} from '../../src/calibration/cal-002/authority';

describe('CAL-002 v2 authority', () => {
  it('locks the approved 26/4/3/7 batch and complete 119 projection', () => {
    const proposal = buildCAL002AuthorityProposalV2(
      buildCatalogFixture(),
      '07997204f63f9a03c16601f953ef078f1caaa8db7f7f8fca9ba4a73f3c6270fd',
    ).proposal;
    expect(CAL002_OWNER_AUTHORITY_ROWS).toHaveLength(40);
    expect(proposal.counts).toEqual({
      total: 119, startingQuality: 47, transferred: 26, blocked: 4,
      superseded: 3, retired: 7, researchOrigin: 32,
    });
    expect(new Set(proposal.rows.map((row) => row.ruleId)).size).toBe(119);
    expect(proposal.rows.filter((row) => row.assignmentEligible).every(
      (row) => row.readiness === 'evidence-ready',
    )).toBe(true);
    expect(proposal.admitted).toBe(false);
    expect(proposal.applied).toBe(false);
  });

  it('keeps AI association orthogonal to quality authority', () => {
    const proposal = buildCAL002AuthorityProposalV2(buildCatalogFixture(), 'a'.repeat(64)).proposal;
    const any = proposal.rows.find((row) => row.ruleId === 'ai/any-density')!;
    expect(any).toMatchObject({
      qualityDomain: 'type-safety', claimClass: 'contextual-heuristic',
      destination: 'quality', readiness: 'evidence-ready',
    });
    expect(any.aiAssociation.claimCeiling).toBe('association-only');
    expect(any.aiAssociation).not.toHaveProperty('qualityAuthority');
  });

  it('does not derive authority from category, path, aiSpecific, or legacy lift', () => {
    const mutatedCatalog = mutateCatalogMetadata(buildCatalogFixture(), 'ai/any-density', {
      category: 'security', aiSpecific: false,
    });
    expect(authorityMetadataForRuleId('ai/any-density')).toMatchObject({
        qualityDomain: 'type-safety', claimClass: 'contextual-heuristic',
    });
    expect(() => buildCAL002AuthorityProposalV2(mutatedCatalog, 'a'.repeat(64)))
      .toThrow(/catalog.*drift/i);
  });

  it('accepts only bounded association metadata and never promotes authority', () => {
    const proposal = buildCAL002AuthorityProposalV2(buildCatalogFixture(), 'a'.repeat(64)).proposal;
    const association = proposal.rows.find((row) => row.ruleId === 'ai/any-density')!.aiAssociation;
    expect(Number.isFinite(association.lift)).toBe(true);
    expect(association.lift).toBeGreaterThanOrEqual(0);
    expect(association.claimCeiling).toBe('association-only');
    expect(() => validateCAL002AIAssociationV2({ ...association, lift: Number.NaN }))
      .toThrow(/lift/i);
    expect(() => validateCAL002AIAssociationV2({ ...association, lift: -0.01 }))
      .toThrow(/lift/i);
  });
});
```

- [ ] **Step 2: Run the focused tests and confirm red**

Run:

```bash
corepack pnpm --filter slopbrick exec vitest run tests/calibration/cal-002-contracts-v2.test.ts tests/calibration/cal-002-authority.test.ts --maxWorkers=1 --minWorkers=1
```

Expected: FAIL because `contracts-v2.ts` and `authority.ts` do not exist.

- [ ] **Step 3: Add the closed v2 contracts**

```ts
export const CAL002_PROTOCOL_VERSION_V2 = 'CAL-002-v2' as const;
export const CAL002_AUTHORITY_PROPOSAL_VERSION = 'cal-002-authority-proposal-v2' as const;
export const CAL002_AUTHORITY_STATE_VERSION = 'cal-002-authority-state-v2' as const;
export const CAL002_AUTHORITY_RECEIPT_VERSION = 'cal-002-authority-receipt-v2' as const;

export type CAL002QualityDomain =
  | 'security' | 'accessibility' | 'correctness' | 'reliability'
  | 'performance' | 'maintainability' | 'documentation-quality'
  | 'type-safety' | 'resource-safety' | 'test-confidence'
  | 'architecture-consistency' | 'observability'
  | 'design-system-coherence' | 'completeness' | 'none';

export type CAL002ClaimClass =
  | 'language-or-security-contract' | 'accessibility-standard'
  | 'repository-contract' | 'deterministic-syntax-or-dataflow'
  | 'contextual-heuristic' | 'statistical-review-signal'
  | 'no-valid-quality-claim';

export type CAL002Readiness =
  | 'evidence-ready' | 'repair-required' | 'project-contract-required'
  | 'parity-required' | 'research-only' | 'obsolete';

export type CAL002RuntimeOutcomeV2 =
  | 'default-on' | 'quality-advisory' | 'quality-candidate-default-off'
  | 'default-off' | 'insufficient-evidence' | 'superseded' | 'retired';

export interface CAL002AIAssociationV2 {
  readonly source: 'cal-001-internal-origin' | 'legacy-signal-strength' | 'none-recorded';
  readonly claimCeiling: 'association-only' | 'none';
  readonly evidenceSha256?: string;
  readonly lift?: number;
  readonly measuredAt?: string;
  readonly protocol?: string;
}

export interface CAL002AuthorityRowV2 {
  readonly ruleId: string;
  readonly sourceClass: 'starting-quality' | 'owner-batch' | 'research-origin';
  readonly destination: 'quality' | 'research-origin' | 'superseded' | 'retired';
  readonly action: 'preserve' | 'transfer' | 'block' | 'supersede' | 'retire' | 'hold';
  readonly qualityDomain: CAL002QualityDomain;
  readonly claimClass: CAL002ClaimClass;
  readonly readiness: CAL002Readiness;
  readonly evidenceClass?: 'deterministic-or-standards' | 'contextual-quality' | 'statistical-review-utility';
  readonly assignmentEligible: boolean;
  readonly replacementRuleId?: string;
  readonly reasonCode: string;
  readonly aiAssociation: CAL002AIAssociationV2;
}

export interface CAL002AuthorityProposalV2 {
  readonly version: typeof CAL002_AUTHORITY_PROPOSAL_VERSION;
  readonly protocolVersion: typeof CAL002_PROTOCOL_VERSION_V2;
  readonly catalogSha256: typeof CAL002_LOCKED_RULE_CATALOG_SHA256;
  readonly priorStateSha256: string;
  readonly rows: readonly CAL002AuthorityRowV2[];
  readonly counts: {
    readonly total: 119;
    readonly startingQuality: 47;
    readonly transferred: 26;
    readonly blocked: 4;
    readonly superseded: 3;
    readonly retired: 7;
    readonly researchOrigin: 32;
  };
  readonly admitted: false;
  readonly applied: false;
}

export interface CAL002AuthorityProposalResultV2 {
  readonly proposal: CAL002AuthorityProposalV2;
  readonly proposalJson: string;
  readonly proposalSha256: string;
}
```

Implement strict validators with exact keys, canonical rule-ID order, closed enums, lowercase SHA-256 fields, `admitted: false`, and `applied: false`. When present, `aiAssociation.lift` must be finite and non-negative; association metadata is copied only from its named evidence source and cannot alter domain, claim class, readiness, assignment eligibility, destination, or runtime authority. Mirror each invariant in the three v2 JSON Schemas and register exact filenames/versions in `schemas/index.json`.

- [ ] **Step 4: Encode all 47 starting quality rows explicitly**

Use this complete metadata map; evidence class comes from the three frozen v1 ID arrays and is asserted rather than inferred from category or path:

```ts
export const CAL002_STARTING_QUALITY_METADATA = {
  'context/import-path-mismatch': ['architecture-consistency', 'repository-contract'],
  'cs/async-without-await': ['correctness', 'language-or-security-contract'],
  'cs/empty-catch-block': ['reliability', 'deterministic-syntax-or-dataflow'],
  'cs/sql-string-interpolation': ['security', 'language-or-security-contract'],
  'docs/broken-link': ['documentation-quality', 'repository-contract'],
  'docs/stale-function-reference': ['documentation-quality', 'repository-contract'],
  'docs/stale-package-reference': ['documentation-quality', 'repository-contract'],
  'dup/identical-block': ['maintainability', 'deterministic-syntax-or-dataflow'],
  'java/lost-stack-trace': ['reliability', 'language-or-security-contract'],
  'java/sql-string-concat': ['security', 'language-or-security-contract'],
  'java/thread-sleep-in-loop': ['performance', 'deterministic-syntax-or-dataflow'],
  'kt/coroutine-cancellation-missing': ['reliability', 'language-or-security-contract'],
  'kt/force-unwrap': ['type-safety', 'language-or-security-contract'],
  'kt/global-coroutine-scope': ['reliability', 'language-or-security-contract'],
  'kt/string-template-injection': ['security', 'language-or-security-contract'],
  'logic/key-prop-missing': ['correctness', 'repository-contract'],
  'perf/cls-image': ['performance', 'repository-contract'],
  'php/empty-catch': ['reliability', 'deterministic-syntax-or-dataflow'],
  'php/sql-injection': ['security', 'language-or-security-contract'],
  'rb/exception-swallowing': ['reliability', 'deterministic-syntax-or-dataflow'],
  'rb/sql-string-concat': ['security', 'language-or-security-contract'],
  'security/eval': ['security', 'language-or-security-contract'],
  'security/exposed-env-var': ['security', 'repository-contract'],
  'security/localstorage-token': ['security', 'language-or-security-contract'],
  'security/missing-auth-check': ['security', 'repository-contract'],
  'security/public-admin-route': ['security', 'repository-contract'],
  'security/target-blank-no-noopener': ['security', 'language-or-security-contract'],
  'security/unsafe-html-render': ['security', 'language-or-security-contract'],
  'typo/placeholder-text': ['documentation-quality', 'repository-contract'],
  'wcag/focus-appearance': ['accessibility', 'accessibility-standard'],
  'wcag/focus-obscured': ['accessibility', 'accessibility-standard'],
  'wcag/missing-alt': ['accessibility', 'accessibility-standard'],
  'component/multiple-components-per-file': ['maintainability', 'contextual-heuristic'],
  'java/suspicious-implementation': ['correctness', 'contextual-heuristic'],
  'layout/gap-monopoly': ['design-system-coherence', 'contextual-heuristic'],
  'layout/spacing-grid': ['design-system-coherence', 'contextual-heuristic'],
  'logic/boundary-violation': ['architecture-consistency', 'contextual-heuristic'],
  'perf/css-bloat': ['performance', 'contextual-heuristic'],
  'product/terminology-drift': ['architecture-consistency', 'contextual-heuristic'],
  'rb/n-plus-one-query': ['performance', 'contextual-heuristic'],
  'visual/inline-style-dominance': ['design-system-coherence', 'contextual-heuristic'],
  'visual/radius-scale-violation': ['design-system-coherence', 'contextual-heuristic'],
  'visual/spacing-scale-violation': ['design-system-coherence', 'contextual-heuristic'],
  'logic/heaps-deviation': ['maintainability', 'statistical-review-signal'],
  'logic/math-variable-name-entropy': ['maintainability', 'statistical-review-signal'],
  'logic/zipf-slope-anomaly': ['maintainability', 'statistical-review-signal'],
  'typo/math-button-label-uniformity': ['design-system-coherence', 'statistical-review-signal'],
} as const satisfies Record<string, readonly [CAL002QualityDomain, CAL002ClaimClass]>;
```

- [ ] **Step 5: Encode the exact 40 owner rows and generate only the 32 research holds**

```ts
export const CAL002_OWNER_AUTHORITY_ROWS = [
  ['cpp/c-style-cast','transfer','quality','maintainability','language-or-security-contract','evidence-ready','deterministic-or-standards'],
  ['cpp/raw-new-delete','transfer','quality','resource-safety','language-or-security-contract','evidence-ready','deterministic-or-standards'],
  ['dead/unreachable','transfer','quality','correctness','deterministic-syntax-or-dataflow','evidence-ready','deterministic-or-standards'],
  ['dead/unused-import','transfer','quality','maintainability','deterministic-syntax-or-dataflow','evidence-ready','deterministic-or-standards'],
  ['dead/unused-local','transfer','quality','maintainability','deterministic-syntax-or-dataflow','evidence-ready','deterministic-or-standards'],
  ['dead/unused-parameter','transfer','quality','maintainability','deterministic-syntax-or-dataflow','evidence-ready','deterministic-or-standards'],
  ['rust/todo-macro','transfer','quality','completeness','language-or-security-contract','evidence-ready','deterministic-or-standards'],
  ['security/hardcoded-secret','transfer','quality','security','language-or-security-contract','evidence-ready','deterministic-or-standards'],
  ['security/sql-construction','transfer','quality','security','language-or-security-contract','evidence-ready','deterministic-or-standards'],
  ['ai/any-density','transfer','quality','type-safety','contextual-heuristic','evidence-ready','contextual-quality'],
  ['ai/console-debug-storm','transfer','quality','observability','contextual-heuristic','evidence-ready','contextual-quality'],
  ['ai/fetch-default-overuse','transfer','quality','architecture-consistency','contextual-heuristic','evidence-ready','contextual-quality'],
  ['ai/state-default-overuse','transfer','quality','maintainability','contextual-heuristic','evidence-ready','contextual-quality'],
  ['ai/tailwind-color-overuse','transfer','quality','design-system-coherence','contextual-heuristic','evidence-ready','contextual-quality'],
  ['component/giant-component','transfer','quality','maintainability','contextual-heuristic','evidence-ready','contextual-quality'],
  ['cpp/magic-numbers','transfer','quality','maintainability','contextual-heuristic','evidence-ready','contextual-quality'],
  ['cpp/printf-debug','transfer','quality','observability','contextual-heuristic','evidence-ready','contextual-quality'],
  ['dead/dead-branch','transfer','quality','correctness','contextual-heuristic','evidence-ready','contextual-quality'],
  ['logic/reactive-hook-soup','transfer','quality','maintainability','contextual-heuristic','evidence-ready','contextual-quality'],
  ['logic/zombie-state','transfer','quality','maintainability','contextual-heuristic','evidence-ready','contextual-quality'],
  ['rust/stringly-typed','transfer','quality','type-safety','contextual-heuristic','evidence-ready','contextual-quality'],
  ['rust/unwrap-in-production','transfer','quality','reliability','contextual-heuristic','evidence-ready','contextual-quality'],
  ['security/dangerous-cors','transfer','quality','security','contextual-heuristic','evidence-ready','contextual-quality'],
  ['security/fail-open-auth','transfer','quality','security','contextual-heuristic','evidence-ready','contextual-quality'],
  ['test/duplicate-setup','transfer','quality','test-confidence','contextual-heuristic','evidence-ready','contextual-quality'],
  ['visual/arbitrary-escape','transfer','quality','design-system-coherence','contextual-heuristic','evidence-ready','contextual-quality'],
  ['logic/ghost-defensive','block','quality','maintainability','contextual-heuristic','repair-required',undefined],
  ['logic/optimistic-no-rollback','block','quality','correctness','contextual-heuristic','repair-required',undefined],
  ['product/ux-pattern-fragmentation','block','quality','architecture-consistency','contextual-heuristic','project-contract-required',undefined],
  ['test/weak-assertion','block','quality','test-confidence','deterministic-syntax-or-dataflow','repair-required',undefined],
  ['logic/math-any-density','supersede','superseded','type-safety','contextual-heuristic','parity-required',undefined],
  ['logic/math-console-log-storm','supersede','superseded','observability','contextual-heuristic','parity-required',undefined],
  ['db/sql-concat','supersede','superseded','security','language-or-security-contract','parity-required',undefined],
  ['ai/renyi-profile','retire','retired','none','no-valid-quality-claim','obsolete',undefined],
  ['component/shadcn-prop-mismatch','retire','retired','none','no-valid-quality-claim','obsolete',undefined],
  ['layout/math-element-uniformity','retire','retired','none','no-valid-quality-claim','obsolete',undefined],
  ['logic/math-gini-class-usage','retire','retired','none','no-valid-quality-claim','obsolete',undefined],
  ['rust/unused-pub-fn','retire','retired','none','no-valid-quality-claim','obsolete',undefined],
  ['test/fake-placeholder','retire','retired','none','no-valid-quality-claim','obsolete',undefined],
  ['visual/naturalness-anomaly','retire','retired','none','no-valid-quality-claim','obsolete',undefined],
] as const;

export const CAL002_SUPERSESSION_REPLACEMENTS = {
  'logic/math-any-density': 'ai/any-density',
  'logic/math-console-log-storm': 'ai/console-debug-storm',
  'db/sql-concat': 'security/sql-construction',
} as const;

export const CAL002_SPECIAL_AUTHORITY_REASONS = {
  'logic/ghost-defensive': 'type-aware-proof-required',
  'logic/optimistic-no-rollback': 'reconciliation-path-required',
  'product/ux-pattern-fragmentation': 'project-wide-contract-required',
  'test/weak-assertion': 'deterministic-contextual-split-required',
  'logic/math-any-density': 'canonical-any-rule-parity-required',
  'logic/math-console-log-storm': 'canonical-console-rule-parity-required',
  'db/sql-concat': 'canonical-sql-rule-parity-required',
  'ai/renyi-profile': 'identifier-frequency-method-not-validated',
  'component/shadcn-prop-mismatch': 'library-contract-not-resolved',
  'layout/math-element-uniformity': 'element-count-not-quality-claim',
  'logic/math-gini-class-usage': 'concentration-not-quality-defect',
  'rust/unused-pub-fn': 'whole-crate-reach-not-observed',
  'test/fake-placeholder': 'fixture-values-not-quality-defect',
  'visual/naturalness-anomaly': 'identifier-diversity-threshold-not-validated',
} as const;
```

Assign `standards-or-contract-quality-claim` to the nine deterministic transfers and `contextual-defect-quality-claim` to the 17 contextual transfers. Use the exact special reason map for blocked/superseded/retired rows, set `assignmentEligible` only for evidence-ready deterministic/contextual/statistical quality rows, and derive research holds strictly as locked IDs minus the explicit 47 and 40. Every generated hold uses `reasonCode: 'auto-held-research-origin'`, `destination: 'research-origin'`, `action: 'hold'`, `qualityDomain: 'none'`, `claimClass: 'no-valid-quality-claim'`, `readiness: 'research-only'`, and `assignmentEligible: false`.

- [ ] **Step 6: Run focused tests and commit**

```bash
corepack pnpm --filter slopbrick exec vitest run tests/calibration/cal-002-contracts-v2.test.ts tests/calibration/cal-002-authority.test.ts --maxWorkers=1 --minWorkers=1
corepack pnpm --filter slopbrick typecheck
git diff --check
git add packages/slopbrick/src/calibration/cal-002/contracts-v2.ts packages/slopbrick/src/calibration/cal-002/authority.ts packages/slopbrick/src/calibration/cal-002/schemas/cal-002-authority-proposal-v2.schema.json packages/slopbrick/src/calibration/cal-002/schemas/cal-002-authority-state-v2.schema.json packages/slopbrick/src/calibration/cal-002/schemas/cal-002-authority-receipt-v2.schema.json packages/slopbrick/src/calibration/cal-002/schemas/index.json packages/slopbrick/tests/calibration/cal-002-contracts-v2.test.ts packages/slopbrick/tests/calibration/cal-002-authority.test.ts
git commit -m "feat(slopbrick): define progressive quality authority"
```

Expected: focused tests and typecheck pass; schemas and handwritten validators agree on adversarial unknown/missing fields; commit contains only the named v2 contract slice.

### Task 3: Add immutable owner batch approval and retire the v1 prompt path

**Files:**
- Create: `packages/slopbrick/src/calibration/cal-002/authority-session.ts`
- Modify: `packages/slopbrick/src/calibration/cal-002/artifact-io.ts`
- Modify: `packages/slopbrick/scripts/cal/cal-002.ts`
- Create: `packages/slopbrick/tests/calibration/cal-002-authority-session.test.ts`
- Modify: `packages/slopbrick/tests/calibration/cal-002-cli.test.ts`

**Interfaces:**
- Consumes: `buildCAL002AuthorityProposalV2`, the exact canonical v1 state bytes, and validator-injected canonical artifact I/O.
- Produces: `startCAL002AuthoritySessionV2`, `decideCAL002AuthoritySessionV2`, `completeCAL002AuthoritySessionV2`, `readPrivateCanonicalArtifact`, `writePrivateCanonicalState`, and `writeImmutableCanonicalReceipt`.

- [ ] **Step 1: Write red state, immutability, and CLI migration tests**

```ts
it('binds a new approval to the exact prior state without rewriting it', async () => {
  const priorBytes = await readFile(priorPath);
  const priorSha256 = createHash('sha256').update(priorBytes).digest('hex');
  const pending = startCAL002AuthoritySessionV2({ proposal, priorStateSha256: priorSha256 });
  const approved = decideCAL002AuthoritySessionV2(pending, 'approved');
  const result = completeCAL002AuthoritySessionV2({ proposal, state: approved });
  expect(result.receipt).toMatchObject({
    proposalSha256: canonicalArtifact(proposal).sha256,
    priorStateSha256,
    reviewerAuthority: 'repository-owner',
    decision: 'approved', admitted: false, applied: false,
  });
  expect(await readFile(priorPath)).toEqual(priorBytes);
});

it('refuses the v1 questionnaire with deterministic migration guidance', async () => {
  const run = await runCli(['classify-origin', '--state', priorPath]);
  expect(run.exitCode).toBe(2);
  expect(run.stderr).toContain('classify-authority');
  expect(run.stderr).toContain('v1 state remains immutable');
  expect(await sha256File(priorPath)).toBe(priorSha256);
});
```

Also assert state/receipt mode `0600`, symlink rejection, safe-root containment, exact canonical bytes, idempotent same-receipt writes, rejection of a different receipt at the same path, and failure when `priorStateSha256` does not match the supplied v1 bytes.

- [ ] **Step 2: Run focused tests and confirm red**

```bash
corepack pnpm --filter slopbrick exec vitest run tests/calibration/cal-002-authority-session.test.ts tests/calibration/cal-002-cli.test.ts --maxWorkers=1 --minWorkers=1
```

Expected: FAIL because the v2 session API and `classify-authority` command are absent.

- [ ] **Step 3: Add validator-injected private artifact primitives without changing v1 wrappers**

```ts
export async function readPrivateCanonicalArtifact<T>(input: ArtifactLocation & {
  readonly label: string;
  readonly assertValue: (value: unknown) => asserts value is T;
}): Promise<T> {
  const path = await resolveArtifactPath(input, false);
  const metadata = await lstat(path);
  if ((metadata.mode & 0o777) !== 0o600) throw new Error(`${input.label} must have private mode 0600`);
  const value = await readCanonicalArtifact(input);
  input.assertValue(value);
  return value;
}

export async function writePrivateCanonicalState<T>(input: ArtifactLocation & {
  readonly label: string;
  readonly value: T;
  readonly assertValue: (value: unknown) => asserts value is T;
}): Promise<void> {
  input.assertValue(input.value);
  await writePrivateValueAtomically(input); // existing lock, 0600 temp, fsync, rename, directory fsync
}

export async function writeImmutableCanonicalReceipt<T>(input: ArtifactLocation & {
  readonly label: string;
  readonly value: T;
  readonly assertValue: (value: unknown) => asserts value is T;
}): Promise<void> {
  input.assertValue(input.value);
  await writePrivateValueExclusively(input); // wx; identical is idempotent; different is rejected
}
```

Refactor `readReviewState`, `readReviewReceipt`, `writeReviewState`, and `writeImmutableReceipt` to delegate to these primitives. Their signatures and serialized behavior must remain unchanged.

- [ ] **Step 4: Implement the closed batch state machine**

```ts
export interface CAL002AuthorityStateV2 {
  readonly version: 'cal-002-authority-state-v2';
  readonly protocolVersion: 'CAL-002-v2';
  readonly catalogSha256: typeof CAL002_LOCKED_RULE_CATALOG_SHA256;
  readonly proposalSha256: string;
  readonly priorStateSha256: string;
  readonly revision: 2;
  readonly reviewerAuthority: 'repository-owner';
  readonly decision: 'pending' | 'approved' | 'rejected';
  readonly admitted: false;
  readonly applied: false;
}

export interface CAL002AuthorityReceiptV2 extends Omit<CAL002AuthorityStateV2, 'version' | 'decision'> {
  readonly version: 'cal-002-authority-receipt-v2';
  readonly decision: 'approved';
  readonly rows: readonly CAL002AuthorityRowV2[];
  readonly authorityRowsSha256: string;
}

export function decideCAL002AuthoritySessionV2(
  state: CAL002AuthorityStateV2,
  decision: 'approved' | 'rejected',
): CAL002AuthorityStateV2 {
  if (state.decision !== 'pending') throw new TypeError('CAL-002 authority decision is already closed');
  return { ...state, decision };
}
```

`completeCAL002AuthoritySessionV2` accepts only `approved`, verifies proposal/state hashes and the exact 40-row batch, and copies the canonical 119-row proposal projection into the receipt with `authorityRowsSha256`. Rejection closes the private state but emits no approval receipt. Every later reducer reads authority rows from this receipt and rechecks their canonical hash.

- [ ] **Step 5: Add the `classify-authority` command and disable v1 continuation**

```text
Usage: cal:complete classify-authority \
  --catalog <catalog-v1.json> \
  --prior-state <origin-state-v1.json> \
  --proposal-out <authority-proposal-v2.json> \
  --state-out <authority-state-v2.json> \
  --receipt-out <authority-receipt-v2.json>

1 approve the exact 26 transfer / 4 blocked / 3 supersede / 7 retire batch
2 reject the exact batch and leave runtime policy unchanged
```

Choice `1` writes the proposal, new private state, and immutable receipt. Choice `2` writes only a rejected private v2 state and exits `2`. `classify-origin` always exits `2` before reading prompts, names `classify-authority`, and states that the v1 file remains immutable.

- [ ] **Step 6: Run focused tests, verify the real v1 file remained unchanged, and commit**

```bash
corepack pnpm --filter slopbrick exec vitest run tests/calibration/cal-002-authority-session.test.ts tests/calibration/cal-002-cli.test.ts tests/calibration/cal-002-review-session.test.ts --maxWorkers=1 --minWorkers=1
corepack pnpm --filter slopbrick typecheck
test "$(stat -f '%Lp %z' .slopbrick/calibration/cal-002/origin-state.json)" = "600 256"
test "$(shasum -a 256 .slopbrick/calibration/cal-002/origin-state.json | awk '{print $1}')" = "07997204f63f9a03c16601f953ef078f1caaa8db7f7f8fca9ba4a73f3c6270fd"
git diff --check
git add packages/slopbrick/src/calibration/cal-002/authority-session.ts packages/slopbrick/src/calibration/cal-002/artifact-io.ts packages/slopbrick/scripts/cal/cal-002.ts packages/slopbrick/tests/calibration/cal-002-authority-session.test.ts packages/slopbrick/tests/calibration/cal-002-cli.test.ts
git commit -m "feat(slopbrick): add authority batch approval"
```

Expected: v2 and v1 artifact-I/O tests pass, the real v1 state hash/mode/size are unchanged, and no local owner state is staged.

### Task 4: Add readiness-gated cohort planning and zero-label quality closeout

**Files:**
- Create: `packages/slopbrick/src/calibration/cal-002/quality-disposition.ts`
- Create: `packages/slopbrick/src/calibration/cal-002/schemas/cal-002-quality-disposition-v2.schema.json`
- Modify: `packages/slopbrick/src/calibration/cal-002/schemas/index.json`
- Modify: `packages/slopbrick/scripts/cal/cal-002.ts`
- Create: `packages/slopbrick/tests/calibration/cal-002-quality-disposition.test.ts`
- Modify: `packages/slopbrick/tests/calibration/cal-002-cli.test.ts`

**Interfaces:**
- Consumes: an approved `CAL002AuthorityReceiptV2`, optional v1 `CAL002QualityMetricsRow` values for selected IDs, and optional per-rule reach rows.
- Produces: `planCAL002QualityCohortV2(input)`, `buildCAL002QualityDispositionV2(input)`, and a 32-row `CAL002QualityDispositionV2`.

- [ ] **Step 1: Write red zero-label and readiness tests**

```ts
it('closes all 32 contextual/statistical candidates without inventing labels', () => {
  const result = buildCAL002QualityDispositionV2({
    authorityReceipt: approvedAuthorityReceipt(),
    selectedMetrics: [],
    implementationCommitSha: 'b'.repeat(40),
  });
  expect(result.disposition.rows).toHaveLength(32);
  expect(result.disposition.rows.every((row) =>
    row.measurementStatus === 'not-requested-owner-capacity'
    && row.runtimeOutcome === 'quality-candidate-default-off'
    && row.sampleCounts.findings === 0
    && row.sampleCounts.controls === 0
    && row.sampleCounts.cannotDetermine === 0
    && row.uncertainty === undefined
    && row.enabledByDefault === false
    && row.scoreEligible === false
    && row.gateEligible === false
    && row.repairSafety === 'no-safe-repair'
  )).toBe(true);
});

it.each(['logic/ghost-defensive', 'product/ux-pattern-fragmentation', 'test/weak-assertion'])(
  'rejects assignment for non-ready %s',
  (ruleId) => expect(() => planCAL002QualityCohortV2({
    authorityReceipt: approvedAuthorityReceipt(),
    reach: [{ ruleId, findings: 100, controls: 100, familyCount: 5 }],
    selectedRuleIds: [ruleId],
  })).toThrow(/not evidence-ready/i),
);
```

Add cases for more than four selected IDs, duplicate IDs, missing 30/30 reach, fewer than five control families, selected statistical `default-on`, metrics for an unselected row, nonzero labels on an unrequested row, and Wilson fields on zero-label rows.

- [ ] **Step 2: Run focused tests and confirm red**

```bash
corepack pnpm --filter slopbrick exec vitest run tests/calibration/cal-002-quality-disposition.test.ts tests/calibration/cal-002-quality-sampling.test.ts tests/calibration/cal-002-quality-metrics.test.ts tests/calibration/cal-002-cli.test.ts --maxWorkers=1 --minWorkers=1
```

Expected: FAIL because the v2 disposition reducer and commands are absent; v1 sampling/metrics tests remain green.

- [ ] **Step 3: Implement the exact 32-row disposition contract**

```ts
export type CAL002MeasurementStatusV2 =
  | 'measured' | 'not-requested-owner-capacity';

export interface CAL002QualityDispositionRowV2 {
  readonly ruleId: string;
  readonly evidenceClass: 'contextual-quality' | 'statistical-review-utility';
  readonly measurementStatus: CAL002MeasurementStatusV2;
  readonly sampleCounts: { readonly findings: number; readonly controls: number; readonly cannotDetermine: number };
  readonly uncertainty?: { readonly findingUseful: CAL002Interval; readonly controlUseful: CAL002Interval };
  readonly runtimeOutcome: 'default-on' | 'default-off' | 'quality-advisory' | 'insufficient-evidence' | 'quality-candidate-default-off';
  readonly enabledByDefault: boolean;
  readonly scoreEligible: boolean;
  readonly gateEligible: boolean;
  readonly repairSafety: 'finding-bound-only' | 'no-safe-repair';
  readonly metricsRowSha256?: string;
}

function unmeasuredRow(row: CAL002AuthorityRowV2): CAL002QualityDispositionRowV2 {
  return {
    ruleId: row.ruleId,
    evidenceClass: row.evidenceClass as 'contextual-quality' | 'statistical-review-utility',
    measurementStatus: 'not-requested-owner-capacity',
    sampleCounts: { findings: 0, controls: 0, cannotDetermine: 0 },
    runtimeOutcome: 'quality-candidate-default-off',
    enabledByDefault: false,
    scoreEligible: false,
    gateEligible: false,
    repairSafety: 'no-safe-repair',
  };
}
```

The measured projection delegates outcome calculation to `reduceCAL002QualityEvidence`; it rejects `default-on` for statistical rows, makes `quality-advisory` disabled/score-neutral/gate-neutral, and stores only the canonical metrics-row hash.

- [ ] **Step 4: Implement bounded reach-qualified cohort planning**

```ts
export function planCAL002QualityCohortV2(input: {
  readonly authorityReceipt: CAL002AuthorityReceiptV2;
  readonly reach: readonly { readonly ruleId: string; readonly findings: number; readonly controls: number; readonly familyCount: number }[];
  readonly selectedRuleIds: readonly string[];
}): { readonly selectedRuleIds: readonly string[]; readonly initialLabels: number; readonly maximumLabels: number } {
  if (new Set(input.selectedRuleIds).size !== input.selectedRuleIds.length) throw new TypeError('selected rule IDs must be unique');
  if (input.selectedRuleIds.length > 4) throw new TypeError('owner cohort is limited to four rules');
  for (const ruleId of input.selectedRuleIds) {
    const authority = requireAuthorityRow(input.authorityReceipt, ruleId);
    if (authority.readiness !== 'evidence-ready' || !authority.assignmentEligible) throw new TypeError(`${ruleId} is not evidence-ready`);
    const reach = input.reach.find((row) => row.ruleId === ruleId);
    if (!reach || reach.findings < 30 || reach.controls < 30 || reach.familyCount < 5) throw new TypeError(`${ruleId} lacks 30/30 reach and five control families`);
  }
  return { selectedRuleIds: [...input.selectedRuleIds].sort(), initialLabels: input.selectedRuleIds.length * 60, maximumLabels: input.selectedRuleIds.length * 200 };
}
```

- [ ] **Step 5: Add `quality-closeout` and `plan-quality-cohort` CLI commands**

```bash
corepack pnpm --filter slopbrick cal:complete -- quality-closeout \
  --authority docs/execution/evidence/artifacts/cal-002/authority-receipt-v2.json \
  --out docs/execution/evidence/artifacts/cal-002/quality-disposition-v2.json

corepack pnpm --filter slopbrick cal:complete -- plan-quality-cohort \
  --authority docs/execution/evidence/artifacts/cal-002/authority-receipt-v2.json \
  --reach .slopbrick/calibration/cal-002/quality-reach-v2.json \
  --select <rule-id> --select <rule-id> \
  --out .slopbrick/calibration/cal-002/quality-cohort-v2.json
```

The first command takes no label input and emits 32 zero-label rows. The second is optional, private, accepts zero to four repeated `--select` flags, and never changes policy or the already written zero-label receipt.

- [ ] **Step 6: Run focused tests and commit**

```bash
corepack pnpm --filter slopbrick exec vitest run tests/calibration/cal-002-quality-disposition.test.ts tests/calibration/cal-002-quality-sampling.test.ts tests/calibration/cal-002-quality-metrics.test.ts tests/calibration/cal-002-cli.test.ts --maxWorkers=1 --minWorkers=1
corepack pnpm --filter slopbrick typecheck
git diff --check
git add packages/slopbrick/src/calibration/cal-002/quality-disposition.ts packages/slopbrick/src/calibration/cal-002/schemas/cal-002-quality-disposition-v2.schema.json packages/slopbrick/src/calibration/cal-002/schemas/index.json packages/slopbrick/scripts/cal/cal-002.ts packages/slopbrick/tests/calibration/cal-002-quality-disposition.test.ts packages/slopbrick/tests/calibration/cal-002-cli.test.ts
git commit -m "feat(slopbrick): support zero-label quality closeout"
```

Expected: v2 and v1 quality tests pass; no assignment is possible for blocked rows; no private reach/cohort state is staged.

### Task 5: Define parity and supersession receipts before rule migration

**Files:**
- Create: `packages/slopbrick/src/calibration/cal-002/supersession.ts`
- Create: `packages/slopbrick/src/calibration/cal-002/schemas/cal-002-parity-receipt-v2.schema.json`
- Create: `packages/slopbrick/src/calibration/cal-002/schemas/cal-002-supersession-receipt-v2.schema.json`
- Modify: `packages/slopbrick/src/calibration/cal-002/schemas/index.json`
- Create: `packages/slopbrick/tests/calibration/cal-002-supersession.test.ts`

**Interfaces:**
- Consumes: approved authority receipt plus one parity receipt for each of the three `parity-required` rows.
- Produces: `buildCAL002ParityReceiptV2(input)` and `buildCAL002SupersessionReceiptV2(authorityReceipt, parityReceipts)`.

- [ ] **Step 1: Write red completeness and semantic-disposition tests**

```ts
it('requires all three approved replacement dispositions', () => {
  const receipt = buildCAL002SupersessionReceiptV2(
    approvedAuthorityReceipt(),
    [sqlParity(), consoleParity(), anyParity()],
  ).receipt;
  expect(receipt.rows).toEqual([
    expect.objectContaining({
      ruleId: 'db/sql-concat', replacementRuleId: 'security/sql-construction',
      uniqueCoverageDisposition: 'ported',
    }),
    expect.objectContaining({
      ruleId: 'logic/math-any-density', replacementRuleId: 'ai/any-density',
      uniqueCoverageDisposition: 'rejected-as-false-positive',
    }),
    expect.objectContaining({
      ruleId: 'logic/math-console-log-storm', replacementRuleId: 'ai/console-debug-storm',
      uniqueCoverageDisposition: 'ported',
    }),
  ]);
  expect(receipt.rows.every((row) => /^[a-f0-9]{64}$/.test(row.parityReceiptSha256))).toBe(true);
  expect(receipt.rows.every((row) => /^[a-f0-9]{40}$/.test(row.migrationCommitSha))).toBe(true);
});
```

Add failures for a missing/duplicate receipt, swapped replacement, failed parity case, unknown case ID, mismatched migration commit, `split-to-new-rule` without `splitRuleId`, and any receipt whose authority hash differs.

- [ ] **Step 2: Run focused tests and confirm red**

```bash
corepack pnpm --filter slopbrick exec vitest run tests/calibration/cal-002-supersession.test.ts tests/calibration/cal-002-contracts-v2.test.ts --maxWorkers=1 --minWorkers=1
```

Expected: FAIL because parity/supersession contracts do not exist.

- [ ] **Step 3: Implement exact parity and supersession types**

```ts
export interface CAL002ParityCaseResultV2 {
  readonly caseId: string;
  readonly sourceSha256: string;
  readonly expectedReplacementObservation: 'finding' | 'no-finding';
  readonly observedReplacementObservation: 'finding' | 'no-finding';
}

export interface CAL002ParityReceiptV2 {
  readonly version: 'cal-002-parity-receipt-v2';
  readonly protocolVersion: 'CAL-002-v2';
  readonly authorityReceiptSha256: string;
  readonly ruleId: 'db/sql-concat' | 'logic/math-any-density' | 'logic/math-console-log-storm';
  readonly replacementRuleId: 'security/sql-construction' | 'ai/any-density' | 'ai/console-debug-storm';
  readonly migrationCommitSha: string;
  readonly uniqueCoverageDisposition: 'ported' | 'rejected-as-false-positive' | 'split-to-new-rule';
  readonly splitRuleId?: string;
  readonly reasonCode: 'with-query-coverage-ported' | 'line-denominator-not-type-bearing' | 'window-clustering-ported-with-guards';
  readonly caseResults: readonly CAL002ParityCaseResultV2[];
  readonly status: 'passed';
  readonly admitted: false;
}

export interface CAL002SupersessionRowV2 {
  readonly ruleId: CAL002ParityReceiptV2['ruleId'];
  readonly replacementRuleId: CAL002ParityReceiptV2['replacementRuleId'];
  readonly parityReceiptSha256: string;
  readonly migrationCommitSha: string;
  readonly uniqueCoverageDisposition: CAL002ParityReceiptV2['uniqueCoverageDisposition'];
  readonly splitRuleId?: string;
}
```

The parity builder requires at least one positive semantic case and one guarded negative case, exact observed/expected equality, canonical case-ID order, and the fixed old/replacement/reason mapping. The supersession builder requires exactly three canonical rows and binds the approved authority receipt hash.

- [ ] **Step 4: Mirror exact invariants in JSON Schemas and commit**

```bash
corepack pnpm --filter slopbrick exec vitest run tests/calibration/cal-002-supersession.test.ts tests/calibration/cal-002-contracts-v2.test.ts --maxWorkers=1 --minWorkers=1
corepack pnpm --filter slopbrick typecheck
git diff --check
git add packages/slopbrick/src/calibration/cal-002/supersession.ts packages/slopbrick/src/calibration/cal-002/schemas/cal-002-parity-receipt-v2.schema.json packages/slopbrick/src/calibration/cal-002/schemas/cal-002-supersession-receipt-v2.schema.json packages/slopbrick/src/calibration/cal-002/schemas/index.json packages/slopbrick/tests/calibration/cal-002-supersession.test.ts
git commit -m "feat(slopbrick): require supersession parity"
```

Expected: handwritten and schema validators reject every incomplete supersession shape; no rule implementation changes in this contract commit.

### Task 6: Port `WITH` SQL coverage into the canonical security rule

**Files:**
- Modify: `packages/slopbrick/src/rules/security/sql-construction.ts`
- Modify: `packages/slopbrick/tests/rules/sql-construction.test.ts`
- Create: `packages/slopbrick/tests/calibration/fixtures/cal-002-parity-sql.ts`
- Create: `packages/slopbrick/tests/calibration/cal-002-sql-parity.test.ts`

**Interfaces:**
- Consumes: `buildCAL002ParityReceiptV2` and the old `db/sql-concat` behavior only as test comparison.
- Produces: canonical `security/sql-construction` coverage for interpolated `WITH ... SELECT|INSERT|UPDATE|DELETE` statements and exported `CAL002_SQL_PARITY_CASES`.

- [ ] **Step 1: Write the red canonical and parity tests**

```ts
it('flags interpolated CTE queries through the canonical rule', async () => {
  const issues = await runRule(
    'const q = `WITH active AS (SELECT * FROM users WHERE id = ${userId}) SELECT * FROM active`;',
  );
  expect(issues.map((issue) => issue.ruleId)).toEqual(['security/sql-construction']);
});

it('keeps parameterized CTE queries negative', async () => {
  expect(await runRule(
    'client.query("WITH active AS (SELECT * FROM users WHERE id = $1) SELECT * FROM active", [userId]);',
  )).toEqual([]);
});

it('accounts for db/sql-concat unique WITH coverage', async () => {
  const observations = await executeSqlParityCases(CAL002_SQL_PARITY_CASES);
  expect(observations).toEqual([
    expect.objectContaining({ caseId: 'sql-with-template-ported', observedReplacementObservation: 'finding' }),
    expect.objectContaining({ caseId: 'sql-with-parameterized-guard', observedReplacementObservation: 'no-finding' }),
    expect.objectContaining({ caseId: 'sql-with-comment-guard', observedReplacementObservation: 'no-finding' }),
  ]);
});
```

- [ ] **Step 2: Run the SQL tests and confirm red**

```bash
corepack pnpm --filter slopbrick exec vitest run tests/rules/sql-construction.test.ts tests/calibration/cal-002-sql-parity.test.ts --maxWorkers=1 --minWorkers=1
```

Expected: FAIL because the canonical start matcher excludes `WITH` and the parity fixture is absent.

- [ ] **Step 3: Port CTE prefix handling without broad prose matching**

```ts
const DIRECT_SQL_START_RE = /^(?:SELECT\b[\s\S]*\bFROM\b|INSERT\s+INTO\b|UPDATE\s+\S+\s+SET\b|DELETE\s+FROM\b|REPLACE\s+INTO\b|TRUNCATE(?:\s+TABLE)?\s+\S+\b|MERGE\s+INTO\b)/i;
const CTE_SQL_START_RE = /^WITH\b[\s\S]*?\)\s*(?:,\s*[A-Za-z_][\w$]*\s+AS\s*\([\s\S]*?\)\s*)*(?:SELECT\b[\s\S]*\bFROM\b|INSERT\s+INTO\b|UPDATE\s+\S+\s+SET\b|DELETE\s+FROM\b)/i;

function startsSqlStatement(content: string): boolean {
  const withoutLeadingComments = content.replace(/^\s*(?:--[^\n]*\n\s*)*/u, '');
  return DIRECT_SQL_START_RE.test(withoutLeadingComments) || CTE_SQL_START_RE.test(withoutLeadingComments);
}
```

Replace the direct regex call with `startsSqlStatement(token.content)`. Keep lexical string-token extraction and interpolation/concatenation checks unchanged.

- [ ] **Step 4: Add exact path-free parity fixtures**

```ts
export const CAL002_SQL_PARITY_CASES = [
  {
    caseId: 'sql-with-template-ported',
    source: 'const q = `WITH active AS (SELECT * FROM users WHERE id = ${userId}) SELECT * FROM active`;',
    virtualPath: 'src/query.ts',
    expectedReplacementObservation: 'finding',
  },
  {
    caseId: 'sql-with-parameterized-guard',
    source: 'client.query("WITH active AS (SELECT * FROM users WHERE id = $1) SELECT * FROM active", [userId]);',
    virtualPath: 'src/query.ts',
    expectedReplacementObservation: 'no-finding',
  },
  {
    caseId: 'sql-with-comment-guard',
    source: '// const q = `WITH active AS (SELECT * FROM users WHERE id = ${userId}) SELECT * FROM active`;',
    virtualPath: 'src/query.ts',
    expectedReplacementObservation: 'no-finding',
  },
] as const;
```

The durable parity reducer stores only `caseId`, source SHA-256, expected/observed result, migration commit, and authority hash; it never stores `source` or `virtualPath`.

- [ ] **Step 5: Run focused tests and commit the migration**

```bash
corepack pnpm --filter slopbrick exec vitest run tests/rules/sql-construction.test.ts tests/rules/db/sql-concat.test.ts tests/calibration/cal-002-sql-parity.test.ts tests/calibration/cal-002-supersession.test.ts --maxWorkers=1 --minWorkers=1
corepack pnpm --filter slopbrick typecheck
git diff --check
git add packages/slopbrick/src/rules/security/sql-construction.ts packages/slopbrick/tests/rules/sql-construction.test.ts packages/slopbrick/tests/calibration/fixtures/cal-002-parity-sql.ts packages/slopbrick/tests/calibration/cal-002-sql-parity.test.ts
git commit -m "fix(slopbrick): port SQL CTE coverage"
```

Expected: canonical/legacy/parity tests pass. Record this commit SHA later as the SQL `migrationCommitSha`; do not mark the old rule superseded yet.

### Task 7: Port five-in-thirty debug clustering with canonical guards

**Files:**
- Modify: `packages/slopbrick/src/rules/ai/console-debug-storm.ts`
- Modify: `packages/slopbrick/tests/rules/ai/console-debug-storm.test.ts`
- Create: `packages/slopbrick/tests/calibration/fixtures/cal-002-parity-console.ts`
- Create: `packages/slopbrick/tests/calibration/cal-002-console-parity.test.ts`

**Interfaces:**
- Consumes: the fixed old behavior `logic/math-console-log-storm` only as parity context.
- Produces: canonical five-`console.log` clustering within a 30-line inclusive window, while preserving minimum file size, test-file, logging-utility, and structured-logger guards.

- [ ] **Step 1: Write red cluster and guard tests**

```ts
it('flags five console.log calls inside thirty lines in a production-sized file', async () => {
  const source = buildPaddedSource([
    'console.log("a")', 'console.log("b")', 'console.log("c")',
    'console.log("d")', 'console.log("e")',
  ]);
  expect((await runRule(source)).map((issue) => issue.ruleId)).toEqual(['ai/console-debug-storm']);
});

it('does not port clustering through canonical guards', async () => {
  const clustered = buildPaddedSource(fiveClusteredLogs());
  expect(await runRule(clustered, 'service.test.ts')).toEqual([]);
  expect(await runRule(clustered, 'logger.ts')).toEqual([]);
  expect(await runRule(`import pino from 'pino';\n${clustered}`)).toEqual([]);
  expect(await runRule(buildPaddedSource(fiveLogsSeparatedBy(31)))).toEqual([]);
});
```

- [ ] **Step 2: Run console tests and confirm red**

```bash
corepack pnpm --filter slopbrick exec vitest run tests/rules/ai/console-debug-storm.test.ts tests/calibration/cal-002-console-parity.test.ts --maxWorkers=1 --minWorkers=1
```

Expected: FAIL because five clustered calls are below the current total threshold of ten.

- [ ] **Step 3: Add one deterministic window helper and preserve all guards**

```ts
const CLUSTER_WINDOW_LINES = 30;
const CLUSTER_MIN_CALLS = 5;
const CONSOLE_LOG_RE = /\bconsole\s*\.\s*log\s*\(/g;

function maxCallsInInclusiveWindow(lines: readonly number[], windowSize: number): number {
  let start = 0;
  let maximum = 0;
  for (let end = 0; end < lines.length; end += 1) {
    while (lines[end]! - lines[start]! > windowSize) start += 1;
    maximum = Math.max(maximum, end - start + 1);
  }
  return maximum;
}

  const consoleLogLines = [...source.matchAll(CONSOLE_LOG_RE)]
  .map((match) => source.slice(0, match.index ?? 0).split('\n').length)
  .sort((left, right) => left - right);
const clusteredLogs = maxCallsInInclusiveWindow(consoleLogLines, CLUSTER_WINDOW_LINES);
if (totalDebug < MIN_CONSOLE_CALLS && clusteredLogs < CLUSTER_MIN_CALLS) return [];
```

Run file-path, logging-utility, minimum-size, and structured-logger guards before computing the result. The message states observed debug concentration and review action only; it does not mention AI, models, humans, or authorship.

- [ ] **Step 4: Add complete cluster parity fixtures**

```ts
export const CAL002_CONSOLE_PARITY_CASES = [
  { caseId: 'console-five-in-thirty-ported', source: buildProductionSized(fiveClusteredLogs()), virtualPath: 'src/service.ts', expectedReplacementObservation: 'finding' },
  { caseId: 'console-window-spread-guard', source: buildProductionSized(fiveLogsSeparatedBy(31)), virtualPath: 'src/service.ts', expectedReplacementObservation: 'no-finding' },
  { caseId: 'console-test-file-guard', source: buildProductionSized(fiveClusteredLogs()), virtualPath: 'src/service.test.ts', expectedReplacementObservation: 'no-finding' },
  { caseId: 'console-logger-file-guard', source: buildProductionSized(fiveClusteredLogs()), virtualPath: 'src/logger.ts', expectedReplacementObservation: 'no-finding' },
  { caseId: 'console-structured-logger-guard', source: `import pino from 'pino';\n${buildProductionSized(fiveClusteredLogs())}`, virtualPath: 'src/service.ts', expectedReplacementObservation: 'no-finding' },
] as const;
```

- [ ] **Step 5: Run focused tests and commit the migration**

```bash
corepack pnpm --filter slopbrick exec vitest run tests/rules/ai/console-debug-storm.test.ts tests/rules/math-console-log-storm.test.ts tests/calibration/cal-002-console-parity.test.ts tests/calibration/cal-002-supersession.test.ts --maxWorkers=1 --minWorkers=1
corepack pnpm --filter slopbrick typecheck
git diff --check
git add packages/slopbrick/src/rules/ai/console-debug-storm.ts packages/slopbrick/tests/rules/ai/console-debug-storm.test.ts packages/slopbrick/tests/calibration/fixtures/cal-002-parity-console.ts packages/slopbrick/tests/calibration/cal-002-console-parity.test.ts
git commit -m "fix(slopbrick): port debug clustering coverage"
```

Expected: canonical guards and old unique behavior are accounted for. Record this commit SHA later as the console `migrationCommitSha`; the old ID remains runnable until atomic policy application.

### Task 8: Reject line-density `any` coverage and retain declaration-ratio semantics

**Files:**
- Modify: `packages/slopbrick/src/rules/ai/any-density.ts`
- Modify: `packages/slopbrick/tests/rules/ai/any-density.test.ts`
- Create: `packages/slopbrick/tests/calibration/fixtures/cal-002-parity-any.ts`
- Create: `packages/slopbrick/tests/calibration/cal-002-any-parity.test.ts`

**Interfaces:**
- Consumes: old `logic/math-any-density` only to demonstrate its line-count denominator is not a type-bearing denominator.
- Produces: a passed parity receipt with `uniqueCoverageDisposition: 'rejected-as-false-positive'` and `reasonCode: 'line-denominator-not-type-bearing'`; canonical detection remains declaration-ratio based.

- [ ] **Step 1: Write red semantic-disposition tests**

```ts
it('does not elevate line density when type-bearing declaration ratio is low', async () => {
  const source = [
    ...Array.from({ length: 6 }, (_, i) => `const escape${i}: any = input${i};`),
    ...Array.from({ length: 30 }, (_, i) => `const typed${i}: number = ${i};`),
  ].join('\n');
  expect(await runCanonical(source)).toEqual([]);
  expect(await runLegacyLineDensity(source)).toHaveLength(1);
});

it('retains declaration-bearing any forms the line-only rule misses', async () => {
  const source = [
    'const a = input as any;', 'const b = output as any;',
    'const c = parse<any>(raw);', 'const d = read<any>(raw);',
    'const e: any = raw;', 'const typed: string = "ok";',
  ].join('\n');
  expect(await runCanonical(source)).toHaveLength(1);
});
```

Assert the canonical description, message, and advice describe weakened type checking and precise types only; they contain none of `AI`, `LLM`, `model`, `human`, `authorship`, or `fingerprint`.

- [ ] **Step 2: Run `any` tests and confirm red**

```bash
corepack pnpm --filter slopbrick exec vitest run tests/rules/ai/any-density.test.ts tests/calibration/cal-002-any-parity.test.ts --maxWorkers=1 --minWorkers=1
```

Expected: FAIL on missing parity fixtures and current provenance-framed description.

- [ ] **Step 3: Keep the detector and replace only its public quality framing**

```ts
description: 'A high share of TypeScript declarations use `any`, weakening static type checks.',

message:
  `\`any\` appears in ${(ratio * 100).toFixed(0)}% of type-bearing declarations ` +
  `(${anyCount} \`any\` uses / ${declCount} declarations). Review whether each escape hatch is necessary.`,

advice:
  'Replace `any` with a precise type, `unknown` plus narrowing, or a documented boundary type. Keep an escape hatch only when the surrounding contract cannot be represented safely.',
```

Do not copy the old per-line denominator, lower the `0.30` threshold, or claim authorship. Keep `aiSpecific` as legacy metadata until the v2 policy layer exposes separate `aiAssociation`.

- [ ] **Step 4: Add exact rejection fixtures**

```ts
export const CAL002_ANY_PARITY_CASES = [
  { caseId: 'any-line-density-rejected', source: lowDeclarationRatioWithSixColonAny(), virtualPath: 'src/types.ts', expectedReplacementObservation: 'no-finding' },
  { caseId: 'any-declaration-ratio-retained', source: highDeclarationRatioAcrossAnnotationAssertionAndGeneric(), virtualPath: 'src/types.ts', expectedReplacementObservation: 'finding' },
  { caseId: 'any-non-typescript-guard', source: lowDeclarationRatioWithSixColonAny(), virtualPath: 'src/types.js', expectedReplacementObservation: 'no-finding' },
] as const;
```

The parity test proves the first case is old-rule-only, records that reach as rejected false-positive coverage, and proves the canonical rule retains its own type-bearing reach.

- [ ] **Step 5: Run focused tests and commit the semantic disposition**

```bash
corepack pnpm --filter slopbrick exec vitest run tests/rules/ai/any-density.test.ts tests/calibration/cal-002-any-parity.test.ts tests/calibration/cal-002-supersession.test.ts --maxWorkers=1 --minWorkers=1
corepack pnpm --filter slopbrick typecheck
git diff --check
git add packages/slopbrick/src/rules/ai/any-density.ts packages/slopbrick/tests/rules/ai/any-density.test.ts packages/slopbrick/tests/calibration/fixtures/cal-002-parity-any.ts packages/slopbrick/tests/calibration/cal-002-any-parity.test.ts
git commit -m "fix(slopbrick): reject line-based any density"
```

Expected: canonical behavior is declaration-ratio based, line-only reach is explicitly rejected, and this commit becomes the `migrationCommitSha` for the supersession receipt.

### Task 9: Add C++ and Rust transferred deterministic oracle cases

**Files:**
- Create: `packages/slopbrick/tests/calibration/fixtures/cal-002-transfer-oracle-types.ts`
- Create: `packages/slopbrick/tests/calibration/fixtures/cal-002-transfer-oracle-cpp-rust.ts`
- Create: `packages/slopbrick/tests/calibration/cal-002-transfer-oracles-cpp-rust.test.ts`
- Modify: `packages/slopbrick/tests/rules/cpp/cpp-rules.test.ts`
- Modify: `packages/slopbrick/tests/rules/rust/todo-macro.test.ts`

**Interfaces:**
- Consumes: actual `facts.v2` rule execution and the existing `CAL002OracleAuthority`, `CAL002OracleExecution`, and observation types.
- Produces: a shared `CAL002TransferredOracleFixture` contract and complete fixtures for `cpp/c-style-cast`, `cpp/raw-new-delete`, and `rust/todo-macro`.

- [ ] **Step 1: Write red fixture-completeness and behavior tests**

```ts
it.each(CAL002_CPP_RUST_TRANSFER_ORACLES)('$ruleId has closed oracle coverage', async (fixture) => {
  expect(fixture.positiveCases.length).toBeGreaterThan(0);
  expect(fixture.negativeCases.length).toBeGreaterThan(0);
  expect(fixture.adversarialCases.length).toBeGreaterThan(0);
  expect(fixture.controls.map((row) => row.familyId)).toEqual([
    'alternate-syntax', 'baseline', 'comment-adjacent', 'near-miss', 'regression-safe',
  ]);
  for (const testCase of fixture.positiveCases) {
    expect(await observeTransferOracle(fixture.ruleId, testCase)).toBe('finding');
  }
  for (const testCase of [...fixture.negativeCases, ...fixture.adversarialCases, ...fixture.controls]) {
    expect(await observeTransferOracle(fixture.ruleId, testCase)).toBe('no-finding');
  }
});
```

Add a fixture validator test rejecting source in a durable projection, absolute virtual paths, duplicate case IDs, duplicate control-slot IDs, fewer than five controls, and a mismatched language extension.

- [ ] **Step 2: Run focused tests and confirm red**

```bash
corepack pnpm --filter slopbrick exec vitest run tests/calibration/cal-002-transfer-oracles-cpp-rust.test.ts tests/rules/cpp/cpp-rules.test.ts tests/rules/rust/todo-macro.test.ts --maxWorkers=1 --minWorkers=1
```

Expected: FAIL because the transfer fixture contract and cases do not exist.

- [ ] **Step 3: Define the reusable fixture type and canonical five-slot helper**

```ts
export type CAL002TransferredOracleRuleId =
  | 'cpp/c-style-cast' | 'cpp/raw-new-delete' | 'rust/todo-macro'
  | 'dead/unreachable' | 'dead/unused-import' | 'dead/unused-local'
  | 'dead/unused-parameter' | 'security/hardcoded-secret' | 'security/sql-construction';

export interface CAL002TransferOracleCase {
  readonly caseId: string;
  readonly virtualPath: string;
  readonly source: string;
}

export interface CAL002TransferredOracleFixture {
  readonly ruleId: CAL002TransferredOracleRuleId;
  readonly authority: CAL002OracleAuthority;
  readonly reference: string;
  readonly execution: CAL002OracleExecution;
  readonly positiveCases: readonly CAL002TransferOracleCase[];
  readonly negativeCases: readonly CAL002TransferOracleCase[];
  readonly adversarialCases: readonly CAL002TransferOracleCase[];
  readonly controls: readonly [
    CAL002TransferOracleCase & { readonly familyId: 'alternate-syntax' },
    CAL002TransferOracleCase & { readonly familyId: 'baseline' },
    CAL002TransferOracleCase & { readonly familyId: 'comment-adjacent' },
    CAL002TransferOracleCase & { readonly familyId: 'near-miss' },
    CAL002TransferOracleCase & { readonly familyId: 'regression-safe' },
  ];
}
```

`durableTransferOracleCase(case)` returns only case ID, expected/observed result, and `sha256(source)`; source and virtual path never cross that boundary.

- [ ] **Step 4: Add the three complete fixtures**

```ts
export const CAL002_CPP_RUST_TRANSFER_ORACLES: readonly CAL002TransferredOracleFixture[] = [
  {
    ruleId: 'cpp/c-style-cast',
    authority: 'language-contract',
    reference: 'C++ Core Guidelines ES.49',
    execution: sourceText('src/oracle.cpp'),
    positiveCases: [{ caseId: 'cpp-c-cast-int', virtualPath: 'src/oracle.cpp', source: 'int y = (int)x;' }],
    negativeCases: [{ caseId: 'cpp-c-cast-named', virtualPath: 'src/oracle.cpp', source: 'int y = static_cast<int>(x);' }],
    adversarialCases: [
      { caseId: 'cpp-c-cast-void-discard', virtualPath: 'src/oracle.cpp', source: '(void)computeValue();' },
      { caseId: 'cpp-c-cast-control-flow', virtualPath: 'src/oracle.cpp', source: 'if (x) { work(); }' },
    ],
    controls: fiveControls('src/oracle.cpp', [
      'auto y = static_cast<long>(x);', 'auto y = dynamic_cast<Node*>(base);',
      '// int y = (int)x;\nauto y = x;', 'auto y = int{x};', 'auto y = static_cast<MyClass*>(base);',
    ]),
  },
  {
    ruleId: 'cpp/raw-new-delete',
    authority: 'language-contract',
    reference: 'C++ Core Guidelines R.11 and R.20',
    execution: sourceText('src/oracle.cpp'),
    positiveCases: [{ caseId: 'cpp-two-new-delete-pairs', virtualPath: 'src/oracle.cpp', source: 'void f(){ Foo* a=new Foo(); Bar* b=new Bar(); delete a; delete b; }' }],
    negativeCases: [{ caseId: 'cpp-smart-pointers', virtualPath: 'src/oracle.cpp', source: 'void f(){ auto a=std::make_unique<Foo>(); auto b=std::make_unique<Bar>(); }' }],
    adversarialCases: [{ caseId: 'cpp-array-allocation', virtualPath: 'src/oracle.cpp', source: 'void f(){ int* xs=new int[10]; delete[] xs; }' }],
    controls: fiveControls('src/oracle.cpp', [
      'auto a=std::make_shared<Foo>();', 'Foo value{};', '// Foo* a=new Foo(); delete a;\nFoo value{};',
      'void* p=allocate(); release(p);', 'std::vector<Foo> values(2);',
    ]),
  },
  {
    ruleId: 'rust/todo-macro',
    authority: 'language-contract',
    reference: 'Rust standard library todo! macro contract',
    execution: sourceText('src/oracle.rs'),
    positiveCases: [{ caseId: 'rust-production-todo', virtualPath: 'src/oracle.rs', source: 'fn load() -> i32 { todo!("load") }' }],
    negativeCases: [{ caseId: 'rust-implemented-body', virtualPath: 'src/oracle.rs', source: 'fn load() -> i32 { 42 }' }],
    adversarialCases: [
      { caseId: 'rust-test-todo', virtualPath: 'src/oracle.rs', source: '#[test]\nfn pending_case(){ todo!() }' },
      { caseId: 'rust-macro-definition', virtualPath: 'src/oracle.rs', source: 'macro_rules! deferred { () => { todo!() } }' },
    ],
    controls: fiveControls('src/oracle.rs', [
      'fn load()->Result<i32,Error>{ Err(Error::Pending) }', 'fn load()->i32{ 42 }',
      '// todo!()\nfn load()->i32{ 42 }', 'fn todo_count()->usize{ 0 }', 'unimplemented_feature();',
    ]),
  },
];
```

Use these helpers so control identity/order is executable rather than implied:

```ts
const CONTROL_FAMILIES = [
  'alternate-syntax', 'baseline', 'comment-adjacent', 'near-miss', 'regression-safe',
] as const;

export function sourceText(virtualSourcePath: string): CAL002OracleExecution {
  return { mode: 'source-text', context: { virtualSourcePath } };
}

export function fiveControls(
  virtualPath: string,
  sources: readonly [string, string, string, string, string],
): CAL002TransferredOracleFixture['controls'] {
  return CONTROL_FAMILIES.map((familyId, index) => ({
    caseId: `control-${familyId}`,
    familyId,
    virtualPath,
    source: sources[index]!,
  })) as CAL002TransferredOracleFixture['controls'];
}
```

- [ ] **Step 5: Strengthen existing rule tests and commit**

Add the same positive/negative/adversarial behaviors to the native rule suites so oracle truth cannot diverge from rule regression truth.

```bash
corepack pnpm --filter slopbrick exec vitest run tests/calibration/cal-002-transfer-oracles-cpp-rust.test.ts tests/rules/cpp/cpp-rules.test.ts tests/rules/rust/todo-macro.test.ts --maxWorkers=1 --minWorkers=1
corepack pnpm --filter slopbrick typecheck
git diff --check
git add packages/slopbrick/tests/calibration/fixtures/cal-002-transfer-oracle-types.ts packages/slopbrick/tests/calibration/fixtures/cal-002-transfer-oracle-cpp-rust.ts packages/slopbrick/tests/calibration/cal-002-transfer-oracles-cpp-rust.test.ts packages/slopbrick/tests/rules/cpp/cpp-rules.test.ts packages/slopbrick/tests/rules/rust/todo-macro.test.ts
git commit -m "test(calibration): prove C++ and Rust transfers"
```

Expected: three transferred rows have closed mutation and five fixed control slots; no detector or policy is activated by this test commit.

### Task 10: Add dead-code and unused-binding transferred oracle cases

**Files:**
- Create: `packages/slopbrick/tests/calibration/fixtures/cal-002-transfer-oracle-dead.ts`
- Create: `packages/slopbrick/tests/calibration/cal-002-transfer-oracles-dead.test.ts`
- Modify: `packages/slopbrick/tests/rules/dead/unreachable.test.ts`
- Modify: `packages/slopbrick/tests/rules/dead/unused-import.test.ts`
- Modify: `packages/slopbrick/tests/rules/dead/unused-local.test.ts`
- Modify: `packages/slopbrick/tests/rules/dead/unused-parameter.test.ts`

**Interfaces:**
- Consumes: `CAL002TransferredOracleFixture`, `fiveControls`, and real parse/facts execution.
- Produces: complete fixtures for `dead/unreachable`, `dead/unused-import`, `dead/unused-local`, and `dead/unused-parameter`.

- [ ] **Step 1: Write red exact-behavior tests**

```ts
it.each(CAL002_DEAD_TRANSFER_ORACLES)('$ruleId agrees with its declared oracle', async (fixture) => {
  const positives = await observeAll(fixture.ruleId, fixture.positiveCases);
  const negatives = await observeAll(fixture.ruleId, [
    ...fixture.negativeCases, ...fixture.adversarialCases, ...fixture.controls,
  ]);
  expect(positives).toEqual(fixture.positiveCases.map(() => 'finding'));
  expect(negatives).toEqual([
    ...fixture.negativeCases, ...fixture.adversarialCases, ...fixture.controls,
  ].map(() => 'no-finding'));
});
```

Also assert exactly four unique rule IDs, the five fixed control slots in canonical order per rule, and no module-top-level `const` case is claimed as a positive for `unused-local`.

- [ ] **Step 2: Run focused tests and confirm red**

```bash
corepack pnpm --filter slopbrick exec vitest run tests/calibration/cal-002-transfer-oracles-dead.test.ts tests/rules/dead/unreachable.test.ts tests/rules/dead/unused-import.test.ts tests/rules/dead/unused-local.test.ts tests/rules/dead/unused-parameter.test.ts --maxWorkers=1 --minWorkers=1
```

Expected: FAIL because the four transfer fixtures are absent.

- [ ] **Step 3: Add the four exact fixtures**

```ts
export const CAL002_DEAD_TRANSFER_ORACLES: readonly CAL002TransferredOracleFixture[] = [
  fixture('dead/unreachable', 'repository-contract', 'facts.v2 same-block control-flow contract',
    positive('function f(){ return 1; cleanup(); }'),
    negative('function f(ok){ if(ok) return 1; return compute(); }'),
    adversarial('function f(){ try { work(); } finally { cleanup(); } }'),
    ['function f(){ throw new Error("x"); }', 'function f(){ return compute(); }', '// return; cleanup();\nfunction f(){ cleanup(); }', 'function f(){ if(false){ cleanup(); } }', 'function f(){ for(;;){ break; } cleanup(); }']),
  fixture('dead/unused-import', 'repository-contract', 'facts.v2 binding reference contract',
    positive('import { parse } from "./parse";\nexport const value = 1;'),
    negative('import { parse } from "./parse";\nexport const value = parse("1");'),
    adversarial('import type { Parser } from "./parse";\nexport type Config = Parser;'),
    ['import "./side-effect";', 'import * as api from "./api";\napi.run();', '// import { parse } from "./parse";\nexport const value=1;', 'import React from "react";\nexport const view=<div/>;', 'import { type Parser } from "./parse";\nexport type Config=Parser;']),
  fixture('dead/unused-local', 'repository-contract', 'facts.v2 local binding reference contract',
    positive('function f(){ const stale = compute(); return 1; }'),
    negative('function f(){ const value = compute(); return value; }'),
    adversarial('const moduleRegistration = register();\nexport function f(){ return 1; }'),
    ['function f(){ const _ignored=compute(); return 1; }', 'function f(){ let value=1; return value; }', '// const stale=compute();\nfunction f(){ return 1; }', 'const exported=1; export { exported };', 'function f(){ class Local{}; return new Local(); }']),
  fixture('dead/unused-parameter', 'repository-contract', 'facts.v2 parameter reference contract',
    positive('function add(value, stale){ return value + 1; }'),
    negative('function add(value){ return value + 1; }'),
    adversarial('function callback(_event){ return true; }'),
    ['function View(props){ return <Child {...props}/>; }', 'function f(value){ return String(value); }', '// function f(stale){}\nfunction f(value){ return value; }', 'function f(_unused){ return 1; }', 'const f = ({value}) => value;']),
] as const;
```

Use deterministic helpers with these exact semantics:

```ts
const sourceCase = (kind: 'positive' | 'negative' | 'adversarial', source: string, index = 0) => ({
  caseId: `${kind}-${index + 1}`,
  virtualPath: 'src/oracle.tsx',
  source,
});
const positive = (source: string) => [sourceCase('positive', source)];
const negative = (source: string) => [sourceCase('negative', source)];
const adversarial = (source: string) => [sourceCase('adversarial', source)];
const fixture = (
  ruleId: CAL002TransferredOracleRuleId,
  authority: CAL002OracleAuthority,
  reference: string,
  positiveCases: readonly CAL002TransferOracleCase[],
  negativeCases: readonly CAL002TransferOracleCase[],
  adversarialCases: readonly CAL002TransferOracleCase[],
  controlSources: readonly [string, string, string, string, string],
): CAL002TransferredOracleFixture => ({
  ruleId, authority, reference, execution: sourceText('src/oracle.tsx'),
  positiveCases, negativeCases, adversarialCases,
  controls: fiveControls('src/oracle.tsx', controlSources),
});
```

Keep each source case path-free in durable output.

- [ ] **Step 4: Add native regression cases and commit**

```bash
corepack pnpm --filter slopbrick exec vitest run tests/calibration/cal-002-transfer-oracles-dead.test.ts tests/rules/dead/unreachable.test.ts tests/rules/dead/unused-import.test.ts tests/rules/dead/unused-local.test.ts tests/rules/dead/unused-parameter.test.ts --maxWorkers=1 --minWorkers=1
corepack pnpm --filter slopbrick typecheck
git diff --check
git add packages/slopbrick/tests/calibration/fixtures/cal-002-transfer-oracle-dead.ts packages/slopbrick/tests/calibration/cal-002-transfer-oracles-dead.test.ts packages/slopbrick/tests/rules/dead/unreachable.test.ts packages/slopbrick/tests/rules/dead/unused-import.test.ts packages/slopbrick/tests/rules/dead/unused-local.test.ts packages/slopbrick/tests/rules/dead/unused-parameter.test.ts
git commit -m "test(calibration): prove dead-code transfers"
```

Expected: all four detectors agree with their declared scope and guards; this remains evidence preparation, not activation.

### Task 11: Add security transfer oracles and the combined 41-row oracle receipt

**Files:**
- Create: `packages/slopbrick/tests/calibration/fixtures/cal-002-transfer-oracle-security.ts`
- Create: `packages/slopbrick/tests/calibration/fixtures/cal-002-transfer-oracle-cases.ts`
- Create: `packages/slopbrick/src/calibration/cal-002/oracles-v2.ts`
- Create: `packages/slopbrick/src/calibration/cal-002/schemas/cal-002-oracle-receipt-v2.schema.json`
- Modify: `packages/slopbrick/src/calibration/cal-002/schemas/index.json`
- Create: `packages/slopbrick/tests/calibration/cal-002-transfer-oracles-security.test.ts`
- Create: `packages/slopbrick/tests/calibration/cal-002-oracles-v2.test.ts`
- Modify: `packages/slopbrick/tests/rules/security.test.ts`
- Modify: `packages/slopbrick/tests/rules/sql-construction.test.ts`

**Interfaces:**
- Consumes: the frozen 32-row `CAL002OracleReceipt`, all nine transfer fixtures, and actual rule observations.
- Produces: `CAL002_TRANSFER_ORACLE_CASES`, `buildCAL002OracleReceiptV2(input)`, and a canonical 41-row v2 oracle receipt.

- [ ] **Step 1: Write red security and combined-receipt tests**

```ts
it('proves both transferred security contracts', async () => {
  for (const fixture of CAL002_SECURITY_TRANSFER_ORACLES) {
    expect(await observeAll(fixture.ruleId, fixture.positiveCases)).toEqual(
      fixture.positiveCases.map(() => 'finding'),
    );
    expect(await observeAll(fixture.ruleId, [
      ...fixture.negativeCases, ...fixture.adversarialCases, ...fixture.controls,
    ])).toEqual([
      ...fixture.negativeCases, ...fixture.adversarialCases, ...fixture.controls,
    ].map(() => 'no-finding'));
  }
});

it('combines 32 frozen starting rows with exactly nine transferred rows', () => {
  const result = buildCAL002OracleReceiptV2({
    authorityReceipt: approvedAuthorityReceipt(),
    startingOracleReceipt: passedStartingOracleReceipt(),
    transferredFixtures: CAL002_TRANSFER_ORACLE_CASES,
    observations: executeAllTransferCases(),
    implementationCommitSha: 'c'.repeat(40),
  });
  expect(result.receipt.rows).toHaveLength(41);
  expect(result.receipt.counts).toEqual({ starting: 32, transferred: 9, passed: 41, failed: 0 });
  expect(result.receipt.rows.filter((row) => row.transferred).map((row) => row.ruleId)).toHaveLength(9);
  expect(JSON.stringify(result.receipt)).not.toContain('source');
  expect(JSON.stringify(result.receipt)).not.toContain('virtualPath');
});
```

Add failures for a failed oracle, missing transfer, unknown authority row, fewer than five protocol slots, a source hash mismatch, a v1 receipt with other than exactly 32 starting deterministic rows, and any transfer not marked evidence-ready.

- [ ] **Step 2: Run security/combined tests and confirm red**

```bash
corepack pnpm --filter slopbrick exec vitest run tests/calibration/cal-002-transfer-oracles-security.test.ts tests/calibration/cal-002-oracles-v2.test.ts tests/rules/security.test.ts tests/rules/sql-construction.test.ts --maxWorkers=1 --minWorkers=1
```

Expected: FAIL because security fixtures and v2 oracle reducer are absent.

- [ ] **Step 3: Add complete security fixtures**

```ts
export const CAL002_SECURITY_TRANSFER_ORACLES: readonly CAL002TransferredOracleFixture[] = [
  fixture('security/hardcoded-secret', 'security-contract', 'OWASP Secrets Management and CWE-798',
    positive('const accessKey = "AKIAIOSFODNN7EXAMPLE";'),
    negative('const accessKey = process.env.AWS_ACCESS_KEY_ID;'),
    adversarial('const accessKey = "example-access-key";'),
    ['const token=process.env.TOKEN;', 'const label="token";', '// const token="ghp_abcdefghijklmnopqrstuvwxyz123456";\nconst ok=true;', 'const password="test";', 'const config={ secretRef:"vault://service/key" };']),
  fixture('security/sql-construction', 'security-contract', 'OWASP SQL Injection Prevention',
    positive('const q = `SELECT * FROM users WHERE id = ${userId}`;'),
    negative('client.query("SELECT * FROM users WHERE id = $1", [userId]);'),
    adversarial('const prose = "Update every call site before merging";'),
    ['connection.execute("SELECT * FROM users WHERE id = ?",[id]);', 'prisma.user.findUnique({where:{id}});', '// const q=`SELECT * FROM users WHERE id=${id}`;\nconst ok=true;', 'knex("users").where("id",id);', 'const q="SELECT * FROM users WHERE active=true";']),
] as const;
```

Re-export the three group arrays as one canonical rule-ID-sorted `CAL002_TRANSFER_ORACLE_CASES` and assert its IDs exactly equal the nine deterministic transfer IDs from authority.

- [ ] **Step 4: Implement the v2 receipt reducer**

```ts
export interface CAL002OracleReceiptV2 {
  readonly version: 'cal-002-oracle-receipt-v2';
  readonly protocolVersion: 'CAL-002-v2';
  readonly authorityReceiptSha256: string;
  readonly startingOracleReceiptSha256: string;
  readonly implementationCommitSha: string;
  readonly rows: readonly CAL002OracleReceiptRowV2[];
  readonly counts: { readonly starting: 32; readonly transferred: 9; readonly passed: number; readonly failed: number };
  readonly admitted: false;
}

export interface CAL002RealSourceControlV2 {
  readonly controlId: string;
  readonly familyId: string;
  readonly contentSha256: string;
  readonly sourceBindingReceiptSha256: string;
  readonly observed: 'no-finding';
}

export function buildCAL002OracleReceiptV2(input: BuildCAL002OracleReceiptV2Input): CAL002OracleReceiptV2Result {
  const starting = verifyFrozenStartingReceipt(input.startingOracleReceipt);
  const transferred = reduceTransferredFixtures(input.authorityReceipt, input.transferredFixtures, input.observations);
  const rows = [...starting, ...transferred].sort(byRuleId);
  if (rows.length !== 41 || new Set(rows.map((row) => row.ruleId)).size !== 41) {
    throw new TypeError('CAL-002 v2 oracle receipt must contain 32 starting and 9 transferred rows');
  }
  return canonicalOracleReceipt(rows, input);
}
```

Every row stores declaration/reference, case result hashes, five fixed control-slot/hash results, transfer flag, `passed|failed`, and failure codes; it stores no source text or path.

In addition to fixture mutation controls, require five source-bound controls assigned to the exact `alternate-syntax`, `baseline`, `comment-adjacent`, `near-miss`, and `regression-safe` slots for each deterministic row. These are protocol slots, not claims about semantic source families. Accept them only through the existing Corpus v1 source-binding adapter, recompute each content hash before scanning, and derive `controlId` as `sha256(ruleId + '\0' + familyId + '\0' + contentSha256)`. Store only the `CAL002RealSourceControlV2` fields above. If a row lacks five reachable source-bound controls, emit `failed` with `real-source-control-shortage`; never substitute a fixture or infer a pass.

- [ ] **Step 5: Run focused tests and commit**

```bash
corepack pnpm --filter slopbrick exec vitest run tests/calibration/cal-002-transfer-oracles-cpp-rust.test.ts tests/calibration/cal-002-transfer-oracles-dead.test.ts tests/calibration/cal-002-transfer-oracles-security.test.ts tests/calibration/cal-002-oracles-v2.test.ts tests/calibration/cal-002-oracles.test.ts tests/rules/security.test.ts tests/rules/sql-construction.test.ts --maxWorkers=1 --minWorkers=1
corepack pnpm --filter slopbrick typecheck
git diff --check
git add packages/slopbrick/tests/calibration/fixtures/cal-002-transfer-oracle-security.ts packages/slopbrick/tests/calibration/fixtures/cal-002-transfer-oracle-cases.ts packages/slopbrick/src/calibration/cal-002/oracles-v2.ts packages/slopbrick/src/calibration/cal-002/schemas/cal-002-oracle-receipt-v2.schema.json packages/slopbrick/src/calibration/cal-002/schemas/index.json packages/slopbrick/tests/calibration/cal-002-transfer-oracles-security.test.ts packages/slopbrick/tests/calibration/cal-002-oracles-v2.test.ts packages/slopbrick/tests/rules/security.test.ts packages/slopbrick/tests/rules/sql-construction.test.ts
git commit -m "test(calibration): prove security transfers"
```

Expected: all 41 deterministic rows can produce one strict, path-free, non-admitting v2 receipt; a failed row remains representable but can never become default-on.

### Task 12: Enforce quality-only public copy across all 73 active quality rows

**Files:**
- Create: `packages/slopbrick/tests/helpers/public-rule-copy.ts`
- Create: `packages/slopbrick/tests/rules/quality-authority-copy.test.ts`
- Modify: `packages/slopbrick/src/snippet/data.ts`
- Modify: `packages/slopbrick/src/rules/ai/any-density.ts`
- Modify: `packages/slopbrick/src/rules/ai/console-debug-storm.ts`
- Modify: `packages/slopbrick/src/rules/dead/dead-branch.ts`
- Modify: `packages/slopbrick/src/rules/dead/unreachable.ts`
- Modify: `packages/slopbrick/src/rules/dead/unused-import.ts`
- Modify: `packages/slopbrick/src/rules/dead/unused-local.ts`
- Modify: `packages/slopbrick/src/rules/dead/unused-parameter.ts`
- Modify: `packages/slopbrick/src/rules/dup/identical-block.ts`
- Modify: `packages/slopbrick/src/rules/java/lost-stack-trace.ts`
- Modify: `packages/slopbrick/src/rules/logic/heaps-deviation.ts`
- Modify: `packages/slopbrick/src/rules/logic/math-variable-name-entropy.ts`
- Modify: `packages/slopbrick/src/rules/logic/zipf-slope-anomaly.ts`
- Modify: `packages/slopbrick/src/rules/product/terminology-drift.ts`
- Modify: `packages/slopbrick/src/rules/typo/math-button-label-uniformity.ts`
- Modify: `packages/slopbrick/src/rules/typo/placeholder-text.ts`
- Modify: `packages/slopbrick/src/rules/visual/arbitrary-escape.ts`
- Modify: `packages/slopbrick/tests/rules/ai/any-density.test.ts`
- Modify: `packages/slopbrick/tests/rules/ai/console-debug-storm.test.ts`
- Modify: `packages/slopbrick/tests/rules/dead/dead-branch.test.ts`
- Modify: `packages/slopbrick/tests/rules/dead/unreachable.test.ts`
- Modify: `packages/slopbrick/tests/rules/dead/unused-import.test.ts`
- Modify: `packages/slopbrick/tests/rules/dead/unused-local.test.ts`
- Modify: `packages/slopbrick/tests/rules/dead/unused-parameter.test.ts`
- Modify: `packages/slopbrick/tests/rules/dup/identical-block.test.ts`
- Modify: `packages/slopbrick/tests/rules/java/lost-stack-trace.test.ts`
- Modify: `packages/slopbrick/tests/rules/heaps-deviation.test.ts`
- Modify: `packages/slopbrick/tests/rules/product/terminology-drift.test.ts`
- Modify: `packages/slopbrick/tests/rules/typo/placeholder-text.test.ts`
- Modify: `packages/slopbrick/tests/rules/arbitrary-escape.test.ts`
- Modify: `packages/slopbrick/tests/generated-docs-truth.test.ts`
- Modify: `packages/slopbrick/docs/rule-catalog.md` through its generator only.

**Interfaces:**
- Consumes: the exact authority proposal; selects only 47 `starting-quality` plus 26 `transfer` rows.
- Produces: `collectPublicRuleCopy(ruleId, sourceRoot)`, `assertQualityCopy(text, location)`, and a generated-doc guard that prevents provenance claims from returning.

- [ ] **Step 1: Add a TypeScript-AST public-copy extractor**

```ts
import ts from 'typescript';

const PUBLIC_PROPERTY_NAMES = new Set(['description', 'message', 'advice']);

export function collectPublicProperties(filePath: string): readonly { location: string; text: string }[] {
  const sourceText = readFileSync(filePath, 'utf8');
  const source = ts.createSourceFile(filePath, sourceText, ts.ScriptTarget.Latest, true);
  const rows: { location: string; text: string }[] = [];
  const visit = (node: ts.Node): void => {
    if (ts.isPropertyAssignment(node) && PUBLIC_PROPERTY_NAMES.has(node.name.getText(source))) {
      rows.push({
        location: `${filePath}:${source.getLineAndCharacterOfPosition(node.getStart(source)).line + 1}`,
        text: node.initializer.getText(source),
      });
    }
    ts.forEachChild(node, visit);
  };
  visit(source);
  return rows;
}
```

Map a rule ID to exactly one source file by parsing `id: '<rule-id>'` property assignments beneath `src/rules`; reject zero or multiple files.

- [ ] **Step 2: Write the red doctrine test**

```ts
const PROVENANCE_FRAMING =
  /\bAI\b|\bLLM\b|\bauthorship\b|\bfingerprint\b|\bhuman[- ](?:written|generated|authored|code)\b|\bmodel(?:s)?\s+(?:added|generated|authored|wrote|left|defaults?|sprinkles?)\b/iu;

it('keeps all 73 quality-facing strings about observable quality only', () => {
  const qualityIds = proposal.rows
    .filter((row) => row.sourceClass === 'starting-quality' || row.action === 'transfer')
    .map((row) => row.ruleId)
    .sort();
  expect(qualityIds).toHaveLength(73);
  for (const ruleId of qualityIds) {
    const rule = builtinRules.find((candidate) => candidate.id === ruleId)!;
    expect(rule.description, `${ruleId} description`).not.toMatch(PROVENANCE_FRAMING);
    expect(RULE_HINTS[ruleId] ?? '', `${ruleId} hint`).not.toMatch(PROVENANCE_FRAMING);
    for (const copy of collectPublicRuleCopy(ruleId, RULE_SOURCE_ROOT)) {
      expect(copy.text, copy.location).not.toMatch(PROVENANCE_FRAMING);
    }
    expect(generatedCatalogRow(ruleId), `${ruleId} generated catalog`).not.toMatch(PROVENANCE_FRAMING);
  }
});
```

The AST scope intentionally excludes comments and research references. Comments may preserve clearly historical context, but no `description`, emitted `message`, emitted `advice`, hint, or generated current catalog row may assert AI/human causation or authorship.

- [ ] **Step 3: Run the copy guard and capture the exact red file list**

```bash
corepack pnpm --filter slopbrick exec vitest run tests/rules/quality-authority-copy.test.ts tests/generated-docs-truth.test.ts --maxWorkers=1 --minWorkers=1
```

Expected: FAIL on the 16 named rule source files and any matching hint/catalog string; the failure reports property and source line, not source content in a durable receipt.

- [ ] **Step 4: Normalize each failing public string to observable scope**

Apply these wording contracts consistently:

```ts
const examples = {
  'dead/unreachable': {
    description: 'Statement is unreachable after an unconditional return, throw, break, or continue.',
    advice: 'Remove the unreachable statement or move it before the unconditional terminator when that ordering is intended.',
  },
  'java/lost-stack-trace': {
    description: 'A replacement exception omits the caught exception as its cause, losing the original stack trace.',
    advice: 'Pass the caught exception as the cause when constructing the replacement exception.',
  },
  'product/terminology-drift': {
    description: 'Semantically similar component names use inconsistent domain terms; choose one project term or document distinct meanings.',
  },
  'logic/math-variable-name-entropy': {
    description: 'Identifier vocabulary has low Shannon entropy and may overuse generic names; treat this as review-only.',
  },
  'logic/zipf-slope-anomaly': {
    description: 'Identifier rank-frequency slope differs from the historical baseline; treat this as review-only.',
  },
  'typo/math-button-label-uniformity': {
    description: 'Button-label lengths have unusually low variance; review whether labels communicate distinct actions.',
  },
  'typo/placeholder-text': {
    description: 'User-facing text contains a known placeholder or unfinished-copy marker.',
  },
  'visual/arbitrary-escape': {
    description: 'Repeated arbitrary Tailwind values may bypass the project token system; review intentional exceptions.',
  },
} as const;
```

For the remaining named files, preserve the actual detector, severity, advice safety, references, and legacy `aiSpecific` bit while removing provenance causal language from public fields. Update `RULE_HINTS` to the same concern/action ceiling; do not edit category/path metadata to simulate the v2 policy.

- [ ] **Step 5: Regenerate current catalog copy and run all affected rule suites**

```bash
corepack pnpm --filter slopbrick generate:rules:catalog
corepack pnpm --filter slopbrick exec vitest run tests/rules/quality-authority-copy.test.ts tests/generated-docs-truth.test.ts tests/rules/ai/any-density.test.ts tests/rules/ai/console-debug-storm.test.ts tests/rules/dead tests/rules/cpp/cpp-rules.test.ts tests/rules/rust/todo-macro.test.ts tests/rules/security.test.ts tests/rules/sql-construction.test.ts --maxWorkers=1 --minWorkers=1
corepack pnpm --filter slopbrick typecheck
git diff --check
```

Expected: doctrine guard, generated-doc truth, affected native rule tests, and typecheck pass; no detector count or runtime policy changed.

- [ ] **Step 6: Commit only copy doctrine and its guard**

```bash
git add packages/slopbrick/tests/helpers/public-rule-copy.ts packages/slopbrick/tests/rules/quality-authority-copy.test.ts packages/slopbrick/src/snippet/data.ts packages/slopbrick/src/rules/ai/any-density.ts packages/slopbrick/src/rules/ai/console-debug-storm.ts packages/slopbrick/src/rules/dead/dead-branch.ts packages/slopbrick/src/rules/dead/unreachable.ts packages/slopbrick/src/rules/dead/unused-import.ts packages/slopbrick/src/rules/dead/unused-local.ts packages/slopbrick/src/rules/dead/unused-parameter.ts packages/slopbrick/src/rules/dup/identical-block.ts packages/slopbrick/src/rules/java/lost-stack-trace.ts packages/slopbrick/src/rules/logic/heaps-deviation.ts packages/slopbrick/src/rules/logic/math-variable-name-entropy.ts packages/slopbrick/src/rules/logic/zipf-slope-anomaly.ts packages/slopbrick/src/rules/product/terminology-drift.ts packages/slopbrick/src/rules/typo/math-button-label-uniformity.ts packages/slopbrick/src/rules/typo/placeholder-text.ts packages/slopbrick/src/rules/visual/arbitrary-escape.ts packages/slopbrick/docs/rule-catalog.md
git add packages/slopbrick/tests/rules/ai/any-density.test.ts packages/slopbrick/tests/rules/ai/console-debug-storm.test.ts packages/slopbrick/tests/rules/dead/dead-branch.test.ts packages/slopbrick/tests/rules/dead/unreachable.test.ts packages/slopbrick/tests/rules/dead/unused-import.test.ts packages/slopbrick/tests/rules/dead/unused-local.test.ts packages/slopbrick/tests/rules/dead/unused-parameter.test.ts packages/slopbrick/tests/rules/dup/identical-block.test.ts packages/slopbrick/tests/rules/java/lost-stack-trace.test.ts packages/slopbrick/tests/rules/heaps-deviation.test.ts packages/slopbrick/tests/rules/product/terminology-drift.test.ts packages/slopbrick/tests/rules/typo/placeholder-text.test.ts packages/slopbrick/tests/rules/arbitrary-escape.test.ts packages/slopbrick/tests/generated-docs-truth.test.ts
git diff --cached --name-only
git commit -m "docs(slopbrick): separate quality copy from provenance"
```

Expected: review the staged list before commit and unstage any test file not directly changed by the red copy assertions; protected workspace paths remain unstaged.

### Task 13: Project only the 32 research-origin rows into v2 evidence

**Files:**
- Create: `packages/slopbrick/src/calibration/cal-002/origin-v2.ts`
- Create: `packages/slopbrick/src/calibration/cal-002/schemas/cal-002-origin-receipt-v2.schema.json`
- Modify: `packages/slopbrick/src/calibration/cal-002/schemas/index.json`
- Modify: `packages/slopbrick/scripts/cal/cal-002.ts`
- Create: `packages/slopbrick/tests/calibration/cal-002-origin-v2.test.ts`
- Modify: `packages/slopbrick/tests/calibration/cal-002-cli.test.ts`

**Interfaces:**
- Consumes: approved authority receipt, `CAL002OriginGoverningHashes`, and `assessCAL002CAL001Reuse` from the v1 origin module.
- Produces: `buildCAL002OriginReceiptV2(input)` and `verify-origin-v2`, accounting for exactly 32 `research-only` rows rather than forcing all 72 former origin rows through v1 semantics.

- [ ] **Step 1: Write red exact-scope and non-elevation tests**

```ts
it('accounts for only the 32 research-origin holds', () => {
  const result = buildCAL002OriginReceiptV2({
    authorityReceipt: approvedAuthorityReceipt(),
    governingHashes: matchingGoverningHashes(),
    expectedGoverningHashes: matchingGoverningHashes(),
    originImplementationCommitSha: 'd'.repeat(40),
  });
  expect(result.receipt.rows).toHaveLength(32);
  expect(result.receipt.rows.every((row) =>
    row.destination === 'research-origin'
    && row.claimCeiling === 'internal-origin-association'
    && row.runtimeOutcome === 'default-off'
    && row.enabledByDefault === false
    && row.scoreEligible === false
    && row.gateEligible === false
    && row.runnableByExplicitOptIn === true
    && row.admitted === false
  )).toBe(true);
  expect(result.receipt.rows.some((row) => row.ruleId === 'ai/any-density')).toBe(false);
});
```

Add failures for a quality/blocked/superseded/retired row in the receipt, a missing research row, hash drift without completed one-worker rerun evidence, `default-on`, score/gate eligibility, authorship claim fields, and `admitted: true`.

- [ ] **Step 2: Run focused tests and confirm red**

```bash
corepack pnpm --filter slopbrick exec vitest run tests/calibration/cal-002-origin-v2.test.ts tests/calibration/cal-002-origin.test.ts tests/calibration/cal-002-cli.test.ts --maxWorkers=1 --minWorkers=1
```

Expected: FAIL because v2 origin projection and command are absent; v1 origin tests remain green.

- [ ] **Step 3: Implement the closed 32-row receipt**

```ts
export interface CAL002OriginRowV2 {
  readonly ruleId: string;
  readonly destination: 'research-origin';
  readonly evidenceStatus: 'reused' | 'rerun-completed';
  readonly claimCeiling: 'internal-origin-association';
  readonly runtimeOutcome: 'default-off';
  readonly enabledByDefault: false;
  readonly scoreEligible: false;
  readonly gateEligible: false;
  readonly runnableByExplicitOptIn: true;
  readonly evidenceSha256: string;
  readonly admitted: false;
}

export interface CAL002OriginReceiptV2 {
  readonly version: 'cal-002-origin-receipt-v2';
  readonly protocolVersion: 'CAL-002-v2';
  readonly authorityReceiptSha256: string;
  readonly originImplementationCommitSha: string;
  readonly status: 'reused' | 'rerun-completed';
  readonly governingHashes: CAL002OriginGoverningHashes;
  readonly rows: readonly CAL002OriginRowV2[];
  readonly admitted: false;
}
```

Derive the IDs only from authority rows with `destination: 'research-origin'` and `readiness: 'research-only'`; require exactly 32 canonical IDs. Reuse the v1 governing-hash assessment but do not consume v1 owner decision rows.

- [ ] **Step 4: Add `verify-origin-v2`**

```bash
corepack pnpm --filter slopbrick cal:complete -- verify-origin-v2 \
  --authority docs/execution/evidence/artifacts/cal-002/authority-receipt-v2.json \
  --corpus-root /Users/cheng/corpus-expansion/v10.3 \
  --out docs/execution/evidence/artifacts/cal-002/origin-receipt-v2.json
```

The command either verifies exact frozen governing hashes or performs the existing prescribed one-worker rerun. A hash mismatch without complete rerun evidence exits `2` and creates no receipt.

- [ ] **Step 5: Run focused tests and commit**

```bash
corepack pnpm --filter slopbrick exec vitest run tests/calibration/cal-002-origin-v2.test.ts tests/calibration/cal-002-origin.test.ts tests/calibration/cal-002-cli.test.ts --maxWorkers=1 --minWorkers=1
corepack pnpm --filter slopbrick typecheck
git diff --check
git add packages/slopbrick/src/calibration/cal-002/origin-v2.ts packages/slopbrick/src/calibration/cal-002/schemas/cal-002-origin-receipt-v2.schema.json packages/slopbrick/src/calibration/cal-002/schemas/index.json packages/slopbrick/scripts/cal/cal-002.ts packages/slopbrick/tests/calibration/cal-002-origin-v2.test.ts packages/slopbrick/tests/calibration/cal-002-cli.test.ts
git commit -m "feat(slopbrick): isolate research origin evidence"
```

Expected: exactly 32 research rows are represented, and no v1 state or v1 receipt is rewritten.

### Task 14: Build the fail-closed v2 matrix, approval, and policy projection

**Integrated:** main range `d7b11b70e..c13ce8f47`. Final independent review
returned `SPEC APPROVED` and `CODE QUALITY APPROVED` with no findings. The
expanded Task 13/14 gate passes 198/198 on exact Node 22.22.3 and 24.15.0;
the bounded Node 24 full suite passes 4,485 tests with 15 skipped.

**Files:**
- Modify: `docs/superpowers/plans/2026-07-19-cal-002-progressive-quality-authority.md`
- Create: `packages/slopbrick/src/calibration/cal-002/matrix-v2.ts`
- Create: `packages/slopbrick/src/calibration/cal-002/application-v2.ts`
- Modify: `packages/slopbrick/src/calibration/cal-002/artifact-io.ts`
- Modify: `packages/slopbrick/src/calibration/cal-002/oracles-v2.ts`
- Create: `packages/slopbrick/src/calibration/cal-002/schemas/cal-002-final-matrix-v2.schema.json`
- Create: `packages/slopbrick/src/calibration/cal-002/schemas/cal-002-matrix-approval-v2.schema.json`
- Create: `packages/slopbrick/src/calibration/cal-002/schemas/slopbrick-rule-evidence-policy-v2.schema.json`
- Create: `packages/slopbrick/src/calibration/cal-002/schemas/cal-002-application-receipt-v2.schema.json`
- Modify: `packages/slopbrick/src/calibration/cal-002/schemas/cal-002-oracle-receipt-v2.schema.json`
- Modify: `packages/slopbrick/src/calibration/cal-002/schemas/cal-002-origin-receipt-v2.schema.json`
- Modify: `packages/slopbrick/src/calibration/cal-002/schemas/index.json`
- Modify: `packages/slopbrick/scripts/cal/cal-002.ts`
- Create: `packages/slopbrick/tests/calibration/cal-002-matrix-v2.test.ts`
- Create: `packages/slopbrick/tests/calibration/cal-002-application-v2.test.ts`
- Create: `packages/slopbrick/tests/calibration/cal-002-artifact-io.test.ts`
- Modify: `packages/slopbrick/tests/calibration/cal-002-authority-session.test.ts`
- Modify: `packages/slopbrick/tests/calibration/cal-002-cli.test.ts`
- Modify: `packages/slopbrick/tests/calibration/cal-002-contracts.test.ts`
- Modify: `packages/slopbrick/tests/calibration/cal-002-oracles-v2.test.ts`
- Modify for full-suite qualification: `packages/slopbrick/tests/calibration/v103-admission-context.test.ts`
- Modify for full-suite qualification: `packages/slopbrick/tests/engine/pool.test.ts`

**Interfaces:**
- Consumes: approved authority, 41-row oracle, 32-row quality disposition, 32-row origin, and three-row supersession receipts.
- Produces: `buildCAL002FinalMatrixV2`, `buildCAL002MatrixApprovalV2`, `projectCAL002PolicyCandidateV2`, and `buildCAL002AppliedPolicyV2`.

- [x] **Step 1: Write the red 119-row merge tests**

```ts
it('reduces every authority class exactly once', () => {
  const result = buildCAL002FinalMatrixV2(completeInputs());
  expect(result.matrix.rows).toHaveLength(119);
  expect(new Set(result.matrix.rows.map((row) => row.ruleId)).size).toBe(119);
  expect(result.matrix.projectionCounts).toEqual({
    startingQuality: 47, transferred: 26, blocked: 4,
    superseded: 3, retired: 7, researchOrigin: 32,
  });
  expect(row(result, 'logic/ghost-defensive')).toMatchObject({
    readiness: 'repair-required', runtimeOutcome: 'default-off',
    runnableByExplicitOptIn: false, scoreEligible: false, gateEligible: false,
  });
  expect(row(result, 'ai/any-density')).toMatchObject({
    measurementStatus: 'not-requested-owner-capacity',
    runtimeOutcome: 'quality-candidate-default-off',
  });
  expect(row(result, 'logic/math-any-density')).toMatchObject({
    runtimeOutcome: 'superseded', replacementRuleId: 'ai/any-density',
  });
});
```

Add adversarial cases for each acceptance rejection: missing/duplicate row; quality row with `qualityDomain: none`; evidence for a non-ready row; unmeasured row with labels/Wilson fields; statistical default-on; AI association elevation; incomplete supersession; retired/superseded runnable; origin scoring; projection disagreement; stale catalog/authority/evidence hashes; and `admitted: true`.

- [x] **Step 2: Write the red runtime-effect projection tests**

```ts
it.each([
  ['default-on', true, true, true, true],
  ['quality-advisory', false, true, false, false],
  ['quality-candidate-default-off', false, true, false, false],
  ['blocked-quality-candidate', false, false, false, false],
  ['internal-origin-association', false, true, false, false],
  ['superseded', false, false, false, false],
  ['retired', false, false, false, false],
] as const)('%s has exact runtime effects', (state, enabled, optIn, score, gate) => {
  const policyRow = policyFixtureFor(state);
  expect([policyRow.enabledByDefault, policyRow.runnableByExplicitOptIn, policyRow.scoreEligible, policyRow.gateEligible])
    .toEqual([enabled, optIn, score, gate]);
});
```

Also assert explicit opt-in never changes score/gate eligibility and policy JSON contains no copied `precision`, `recall`, `fpRate`, `ratio`, `verdict`, source text, path, repository ID, or reviewer identity.

- [x] **Step 3: Run matrix/application tests and confirm red**

```bash
corepack pnpm --filter slopbrick exec vitest run tests/calibration/cal-002-matrix-v2.test.ts tests/calibration/cal-002-application-v2.test.ts tests/calibration/cal-002-cli.test.ts --maxWorkers=1 --minWorkers=1
```

Expected: FAIL because v2 matrix/application modules and commands are absent.

- [x] **Step 4: Implement the final row and deterministic reducer table**

```ts
export interface CAL002FinalRowV2 {
  readonly ruleId: string;
  readonly destination: 'quality' | 'research-origin' | 'superseded' | 'retired';
  readonly qualityDomain: CAL002QualityDomain;
  readonly claimClass: CAL002ClaimClass;
  readonly readiness: CAL002Readiness;
  readonly evidenceClass?: CAL002EvidenceClass;
  readonly measurementStatus: 'oracle-verified' | 'measured' | 'not-requested-owner-capacity' | 'not-applicable' | 'unavailable';
  readonly runtimeOutcome: CAL002RuntimeOutcomeV2;
  readonly enabledByDefault: boolean;
  readonly runnableByExplicitOptIn: boolean;
  readonly scoreEligible: boolean;
  readonly gateEligible: boolean;
  readonly repairSafety: 'finding-bound-only' | 'no-safe-repair' | 'not-applicable';
  readonly provenance: CAL002PolicyProvenanceV2;
  readonly evidenceSha256: string;
  readonly replacementRuleId?: string;
  readonly aiAssociation: CAL002AIAssociationV2;
  readonly admitted: false;
}

export interface CAL002FinalMatrixV2 {
  readonly version: 'cal-002-final-matrix-v2';
  readonly protocolVersion: 'CAL-002-v2';
  readonly catalogSha256: typeof CAL002_LOCKED_RULE_CATALOG_SHA256;
  readonly authorityReceiptSha256: string;
  readonly oracleReceiptSha256: string;
  readonly qualityDispositionSha256: string;
  readonly originReceiptSha256: string;
  readonly supersessionReceiptSha256: string;
  readonly reducerImplementationCommitSha: string;
  readonly rows: readonly CAL002FinalRowV2[];
  readonly projectionCounts: {
    readonly startingQuality: 47; readonly transferred: 26; readonly blocked: 4;
    readonly superseded: 3; readonly retired: 7; readonly researchOrigin: 32;
  };
  readonly outcomeCounts: Readonly<Record<CAL002RuntimeOutcomeV2, number>>;
  readonly admitted: false;
  readonly applied: false;
}

export type CAL002PolicyProvenanceV2 =
  | 'deterministic-finding-evidence' | 'current-quality-calibrated'
  | 'current-quality-advisory' | 'quality-candidate-unmeasured'
  | 'blocked-quality-candidate' | 'internal-origin-association'
  | 'current-quality-failed-claim-bar' | 'insufficient-evidence'
  | 'superseded-policy' | 'retired-policy';
```

Reducer mapping is closed:

```ts
if (authority.readiness === 'repair-required' || authority.readiness === 'project-contract-required') return blockedRow(authority);
if (authority.destination === 'superseded') return supersededRow(authority, requireParity(ruleId));
if (authority.destination === 'retired') return retiredRow(authority);
if (authority.destination === 'research-origin') return originRow(authority, requireOrigin(ruleId));
if (authority.evidenceClass === 'deterministic-or-standards') return oracleRow(authority, requireOracle(ruleId));
return qualityDispositionRow(authority, requireQualityDisposition(ruleId));
```

An oracle pass emits default-on, scoring/gating, and finding-bound-only repair. An oracle failure emits default-off, explicit diagnostic only, no score/gate, and no safe repair. Contextual outcome comes only from quality disposition. Statistical rows reject default-on.

- [x] **Step 5: Implement matrix approval and applied policy contracts**

```ts
export interface SlopbrickRuleEvidencePolicyRowV2 {
  readonly ruleId: string;
  readonly qualityDomain: CAL002QualityDomain;
  readonly claimClass: CAL002ClaimClass;
  readonly readiness: CAL002Readiness;
  readonly runtimeOutcome: CAL002RuntimeOutcomeV2;
  readonly enabledByDefault: boolean;
  readonly runnableByExplicitOptIn: boolean;
  readonly scoreEligible: boolean;
  readonly gateEligible: boolean;
  readonly repairSafety: CAL002FinalRowV2['repairSafety'];
  readonly provenance: CAL002PolicyProvenanceV2;
  readonly replacementRuleId?: string;
  readonly aiAssociation: CAL002AIAssociationV2;
}

export interface SlopbrickRuleEvidencePolicyBaseV2 {
  readonly version: 'slopbrick-rule-evidence-policy-v2';
  readonly protocolVersion: 'CAL-002-v2';
  readonly catalogSha256: typeof CAL002_LOCKED_RULE_CATALOG_SHA256;
  readonly finalMatrixSha256: string;
  readonly policyRowsSha256: string;
  readonly rows: readonly SlopbrickRuleEvidencePolicyRowV2[];
  readonly admitted: false;
}

export type SlopbrickRuleEvidencePolicyV2 =
  | (SlopbrickRuleEvidencePolicyBaseV2 & {
      readonly applied: false;
      readonly matrixApprovalSha256?: never;
      readonly applicationImplementationCommitSha?: never;
    })
  | (SlopbrickRuleEvidencePolicyBaseV2 & {
      readonly applied: true;
      readonly matrixApprovalSha256: string;
      readonly applicationImplementationCommitSha: string;
    });

export interface CAL002MatrixApprovalV2 {
  readonly version: 'cal-002-matrix-approval-v2';
  readonly protocolVersion: 'CAL-002-v2';
  readonly catalogSha256: typeof CAL002_LOCKED_RULE_CATALOG_SHA256;
  readonly finalMatrixSha256: string;
  readonly approvalCommitSha: string;
  readonly reviewerAuthority: 'repository-owner';
  readonly decision: 'approved';
  readonly admitted: false;
  readonly applied: false;
}

export interface CAL002ApplicationReceiptV2 {
  readonly version: 'cal-002-application-receipt-v2';
  readonly protocolVersion: 'CAL-002-v2';
  readonly catalogSha256: typeof CAL002_LOCKED_RULE_CATALOG_SHA256;
  readonly finalMatrixSha256: string;
  readonly matrixApprovalSha256: string;
  readonly policyRowsSha256: string;
  readonly policySha256: string;
  readonly applicationImplementationCommitSha: string;
  readonly admitted: false;
  readonly applied: true;
}
```

`projectCAL002PolicyCandidateV2(matrix)` emits `applied: false` with no approval/application fields. `buildCAL002AppliedPolicyV2` requires an exact approved matrix receipt and application commit, preserves the candidate `policyRowsSha256`, emits `applied: true`, and creates `cal-002-application-receipt-v2`. Treat `SlopbrickRuleEvidencePolicyV2` as a discriminated union in implementation/schema: `applied: false` forbids approval/application fields; `applied: true` requires both. Both forms cover 119 canonical rows. Final paired publication writes and verifies the receipt first, then publishes the policy as the commit marker. Rollback may remove only the exact receipt the current locked writer proved it created.

- [x] **Step 6: Add v2 CLI commands**

```text
reduce-parity-v2 --authority --rule-id --migration-commit-ref --out
reduce-oracles-v2 --authority --catalog --corpus-root --source-binding-receipt-sha --starting-out --out
verify-supersession --authority --sql-parity --console-parity --any-parity --out
matrix-v2 --authority --oracles --quality-disposition --origin --supersession --out
approve-matrix-v2 --matrix --out
apply-v2 --matrix [--approval] --implementation-commit-ref --out --receipt-out [--dry-run]
```

`approve-matrix-v2` accepts exactly `1 approve this exact 119-row matrix SHA` or `2 reject and name the failed row`. `apply-v2 --dry-run` writes only an unapplied candidate. Final apply requires approval, publishes the receipt first, and publishes the applied policy commit marker last under both destination session locks.

- [x] **Step 7: Run focused/v1 regression tests and commit**

```bash
corepack pnpm --filter slopbrick exec vitest run tests/calibration/cal-002-matrix-v2.test.ts tests/calibration/cal-002-application-v2.test.ts tests/calibration/cal-002-cli.test.ts tests/calibration/cal-002-matrix.test.ts tests/calibration/cal-002-application.test.ts --maxWorkers=1 --minWorkers=1
corepack pnpm --filter slopbrick typecheck
git diff --check
git add packages/slopbrick/src/calibration/cal-002/matrix-v2.ts packages/slopbrick/src/calibration/cal-002/application-v2.ts packages/slopbrick/src/calibration/cal-002/schemas/cal-002-final-matrix-v2.schema.json packages/slopbrick/src/calibration/cal-002/schemas/cal-002-matrix-approval-v2.schema.json packages/slopbrick/src/calibration/cal-002/schemas/slopbrick-rule-evidence-policy-v2.schema.json packages/slopbrick/src/calibration/cal-002/schemas/cal-002-application-receipt-v2.schema.json packages/slopbrick/src/calibration/cal-002/schemas/index.json packages/slopbrick/scripts/cal/cal-002.ts packages/slopbrick/tests/calibration/cal-002-matrix-v2.test.ts packages/slopbrick/tests/calibration/cal-002-application-v2.test.ts packages/slopbrick/tests/calibration/cal-002-cli.test.ts
git commit -m "feat(slopbrick): reduce progressive evidence policy"
```

Expected: v2 and v1 reducers pass independently; no policy file is written to `src/rules` in this implementation task.

Independent review expanded the authorized correction scope. The final
Task 14 range staged only this complete implementation and qualification set:

```bash
git add \
  docs/superpowers/plans/2026-07-19-cal-002-progressive-quality-authority.md \
  packages/slopbrick/scripts/cal/cal-002.ts \
  packages/slopbrick/src/calibration/cal-002/application-v2.ts \
  packages/slopbrick/src/calibration/cal-002/artifact-io.ts \
  packages/slopbrick/src/calibration/cal-002/matrix-v2.ts \
  packages/slopbrick/src/calibration/cal-002/oracles-v2.ts \
  packages/slopbrick/src/calibration/cal-002/schemas/cal-002-application-receipt-v2.schema.json \
  packages/slopbrick/src/calibration/cal-002/schemas/cal-002-final-matrix-v2.schema.json \
  packages/slopbrick/src/calibration/cal-002/schemas/cal-002-matrix-approval-v2.schema.json \
  packages/slopbrick/src/calibration/cal-002/schemas/cal-002-oracle-receipt-v2.schema.json \
  packages/slopbrick/src/calibration/cal-002/schemas/cal-002-origin-receipt-v2.schema.json \
  packages/slopbrick/src/calibration/cal-002/schemas/index.json \
  packages/slopbrick/src/calibration/cal-002/schemas/slopbrick-rule-evidence-policy-v2.schema.json \
  packages/slopbrick/tests/calibration/cal-002-application-v2.test.ts \
  packages/slopbrick/tests/calibration/cal-002-artifact-io.test.ts \
  packages/slopbrick/tests/calibration/cal-002-authority-session.test.ts \
  packages/slopbrick/tests/calibration/cal-002-cli.test.ts \
  packages/slopbrick/tests/calibration/cal-002-contracts.test.ts \
  packages/slopbrick/tests/calibration/cal-002-matrix-v2.test.ts \
  packages/slopbrick/tests/calibration/cal-002-oracles-v2.test.ts \
  packages/slopbrick/tests/calibration/v103-admission-context.test.ts \
  packages/slopbrick/tests/engine/pool.test.ts
```

The commits from `d7b11b70e` through `48f979648` close provenance, fsync,
schema registration, exact fixture controls, failed-control preservation,
observation enums, identifier syntax, and failure uniqueness. `c13ce8f47`
stabilizes only the two full-suite qualification harnesses.

### Task 15: Generate immutable evidence and obtain exact owner approvals

**Files:**
- Create or replace canonically: `docs/execution/evidence/artifacts/cal-002/catalog.json`
- Create: `docs/execution/evidence/artifacts/cal-002/authority-proposal-v2.json`
- Create privately, never stage: `.slopbrick/calibration/cal-002/authority-state-v2.json`
- Create: `docs/execution/evidence/artifacts/cal-002/authority-receipt-v2.json`
- Create: `docs/execution/evidence/artifacts/cal-002/quality-disposition-v2.json`
- Create: `docs/execution/evidence/artifacts/cal-002/parity-db-sql-concat-v2.json`
- Create: `docs/execution/evidence/artifacts/cal-002/parity-logic-math-console-log-storm-v2.json`
- Create: `docs/execution/evidence/artifacts/cal-002/parity-logic-math-any-density-v2.json`
- Create: `docs/execution/evidence/artifacts/cal-002/supersession-receipt-v2.json`
- Create: `docs/execution/evidence/artifacts/cal-002/oracle-receipt-v1.json`
- Create: `docs/execution/evidence/artifacts/cal-002/oracle-receipt-v2.json`
- Create: `docs/execution/evidence/artifacts/cal-002/origin-receipt-v2.json`
- Create: `docs/execution/evidence/artifacts/cal-002/final-matrix-v2.json`
- Create after approval: `docs/execution/evidence/artifacts/cal-002/matrix-approval-v2.json`
- Create after approval: `docs/execution/evidence/artifacts/cal-002/evidence-manifest-v1.json`
- Modify: `docs/execution/evidence/CAL-002-complete-calibration.md`
- Modify: `packages/slopbrick/scripts/cal/cal-002.ts`
- Modify: `packages/slopbrick/src/calibration/cal-002/artifact-io.ts`
- Create: `packages/slopbrick/src/calibration/cal-002/evidence-manifest.ts`
- Create: `packages/slopbrick/src/calibration/cal-002/schemas/cal-002-evidence-manifest-v1.schema.json`
- Modify: `packages/slopbrick/src/calibration/cal-002/schemas/index.json`
- Create: `packages/slopbrick/tests/calibration/cal-002-evidence-manifest.test.ts`
- Modify: `packages/slopbrick/CHANGELOG.md`

**Interfaces:**
- Consumes: one integrated commit graph through Task 14, exact local Corpus v1 source binding, the protected v1 owner state, and two closed repository-owner decisions.
- Produces: immutable, canonical, non-admitting evidence, one approved 119-row matrix, and one artifact-set root over the 13 primary JSON artifacts; does not write runtime policy.

- [x] **Step 1: Recheck integrated state and frozen inputs**

```bash
git status --short --branch
corepack pnpm --filter slopbrick exec vitest run tests/calibration/cal-002-contracts-v2.test.ts tests/calibration/cal-002-authority.test.ts tests/calibration/cal-002-authority-session.test.ts tests/calibration/cal-002-quality-disposition.test.ts tests/calibration/cal-002-supersession.test.ts tests/calibration/cal-002-oracles-v2.test.ts tests/calibration/cal-002-origin-v2.test.ts tests/calibration/cal-002-matrix-v2.test.ts tests/calibration/cal-002-application-v2.test.ts --maxWorkers=1 --minWorkers=1
test "$(stat -f '%Lp %z' .slopbrick/calibration/cal-002/origin-state.json)" = "600 256"
test "$(shasum -a 256 .slopbrick/calibration/cal-002/origin-state.json | awk '{print $1}')" = "07997204f63f9a03c16601f953ef078f1caaa8db7f7f8fca9ba4a73f3c6270fd"
```

Expected: focused implementation tests pass; protected v1 state is exact; only known user-owned dirty paths remain outside committed implementation.

- [x] **Step 2: Regenerate and verify the frozen v1 catalog projection**

```bash
corepack pnpm --filter slopbrick cal:complete -- catalog \
  --cal001-matrix /private/tmp/cal-001-v1-decision-matrix-2026-07-17.json \
  --out docs/execution/evidence/artifacts/cal-002/catalog.json
```

Expected: counts `119/47/72/40`, catalog SHA-256
`d6d17e252b71e4918375c526c5c209a7550cb089a12f9d82281bb99883a1f506`,
canonical file SHA-256
`6faeed123ee1414cc5a8ead873178e43fb23d46cab985d3254acbe9e3cf0e4d5`,
mode 0600, 23,377 bytes, `admitted: false`, and `applied: false`.

- [x] **Step 3: Run the one closed authority batch decision**

```bash
corepack pnpm --filter slopbrick cal:complete -- classify-authority \
  --catalog docs/execution/evidence/artifacts/cal-002/catalog.json \
  --prior-state .slopbrick/calibration/cal-002/origin-state.json \
  --proposal-out docs/execution/evidence/artifacts/cal-002/authority-proposal-v2.json \
  --state-out .slopbrick/calibration/cal-002/authority-state-v2.json \
  --receipt-out docs/execution/evidence/artifacts/cal-002/authority-receipt-v2.json
```

The owner receives exactly:

```text
1 approve the exact 26 transfer / 4 blocked / 3 supersede / 7 retire batch
2 reject the exact batch and leave runtime policy unchanged
```

Require the complete literal decision line, not merely `1` or `2`. On the
rejection line, stop this task. On the approval line, verify the receipt binds
the proposal, catalog, and protected prior-state SHA; then re-hash the v1 file
and require byte identity.

- [x] **Step 4: Emit the zero-label contextual/statistical disposition**

```bash
corepack pnpm --filter slopbrick cal:complete -- quality-closeout \
  --authority docs/execution/evidence/artifacts/cal-002/authority-receipt-v2.json \
  --out docs/execution/evidence/artifacts/cal-002/quality-disposition-v2.json
```

Expected: exactly 32 rows, all `not-requested-owner-capacity`, all counts zero, no uncertainty, all `quality-candidate-default-off`, and no selected cohort. This does not prevent a later separately approved four-rule cohort.

- [x] **Step 5: Execute and bind the three parity dispositions**

```bash
corepack pnpm --filter slopbrick cal:complete -- reduce-parity-v2 \
  --authority docs/execution/evidence/artifacts/cal-002/authority-receipt-v2.json \
  --rule-id db/sql-concat \
  --migration-commit-ref ':/port SQL CTE coverage' \
  --out docs/execution/evidence/artifacts/cal-002/parity-db-sql-concat-v2.json
corepack pnpm --filter slopbrick cal:complete -- reduce-parity-v2 \
  --authority docs/execution/evidence/artifacts/cal-002/authority-receipt-v2.json \
  --rule-id logic/math-console-log-storm \
  --migration-commit-ref ':/port debug clustering coverage' \
  --out docs/execution/evidence/artifacts/cal-002/parity-logic-math-console-log-storm-v2.json
corepack pnpm --filter slopbrick cal:complete -- reduce-parity-v2 \
  --authority docs/execution/evidence/artifacts/cal-002/authority-receipt-v2.json \
  --rule-id logic/math-any-density \
  --migration-commit-ref ':/reject line-based any density' \
  --out docs/execution/evidence/artifacts/cal-002/parity-logic-math-any-density-v2.json
corepack pnpm --filter slopbrick cal:complete -- verify-supersession \
  --authority docs/execution/evidence/artifacts/cal-002/authority-receipt-v2.json \
  --sql-parity docs/execution/evidence/artifacts/cal-002/parity-db-sql-concat-v2.json \
  --console-parity docs/execution/evidence/artifacts/cal-002/parity-logic-math-console-log-storm-v2.json \
  --any-parity docs/execution/evidence/artifacts/cal-002/parity-logic-math-any-density-v2.json \
  --out docs/execution/evidence/artifacts/cal-002/supersession-receipt-v2.json
```

Expected: SQL and console are `ported`; line-density `any` is `rejected-as-false-positive`; every receipt binds an actual migration commit and passed cases.

- [x] **Step 6: Execute all deterministic oracles and fixed source-bound control slots**

```bash
corepack pnpm --filter slopbrick cal:complete -- reduce-oracles-v2 \
  --catalog docs/execution/evidence/artifacts/cal-002/catalog.json \
  --authority docs/execution/evidence/artifacts/cal-002/authority-receipt-v2.json \
  --corpus-root /Users/cheng/corpus-expansion/v10.3 \
  --source-binding-receipt-sha 47bd66907ec2efa67da718e0cfb38458151ca84d3cdedc941488fe4b001475ac \
  --starting-out docs/execution/evidence/artifacts/cal-002/oracle-receipt-v1.json \
  --out docs/execution/evidence/artifacts/cal-002/oracle-receipt-v2.json
```

Expected: 32 starting + 9 transferred = 41 explicit rows. Oracle or real-source-control failures remain completed `failed` rows and later reduce to default-off; source shortages are named `real-source-control-shortage`; no source/path appears in either receipt.

- [x] **Step 7: Verify the exact 32-row research-origin receipt**

```bash
corepack pnpm --filter slopbrick cal:complete -- verify-origin-v2 \
  --authority docs/execution/evidence/artifacts/cal-002/authority-receipt-v2.json \
  --corpus-root /Users/cheng/corpus-expansion/v10.3 \
  --out docs/execution/evidence/artifacts/cal-002/origin-receipt-v2.json
```

Expected: exact reuse or completed one-worker rerun, 32 research-only rows, all default-off/score-neutral/gate-neutral, `admitted: false`.

- [x] **Step 8: Build and adversarially verify the complete matrix**

```bash
corepack pnpm --filter slopbrick cal:complete -- matrix-v2 \
  --authority docs/execution/evidence/artifacts/cal-002/authority-receipt-v2.json \
  --oracles docs/execution/evidence/artifacts/cal-002/oracle-receipt-v2.json \
  --quality-disposition docs/execution/evidence/artifacts/cal-002/quality-disposition-v2.json \
  --origin docs/execution/evidence/artifacts/cal-002/origin-receipt-v2.json \
  --supersession docs/execution/evidence/artifacts/cal-002/supersession-receipt-v2.json \
  --out docs/execution/evidence/artifacts/cal-002/final-matrix-v2.json
corepack pnpm --filter slopbrick exec vitest run tests/calibration/cal-002-matrix-v2.test.ts tests/calibration/cal-002-application-v2.test.ts --maxWorkers=1 --minWorkers=1
```

Expected: 119 canonical unique rows, exact 47/26/4/3/7/32 projection, no authority elevation from AI association, `applied: false`, `admitted: false`.

- [x] **Step 9: Obtain the exact matrix decision**

```bash
corepack pnpm --filter slopbrick cal:complete -- approve-matrix-v2 \
  --matrix docs/execution/evidence/artifacts/cal-002/final-matrix-v2.json \
  --out docs/execution/evidence/artifacts/cal-002/matrix-approval-v2.json
```

Present the matrix SHA, counts by runtime outcome and provenance, every failed/shortage oracle, all 32 unmeasured rows, four blocked rows, three replacements, and seven retirements. The owner receives exactly:

```text
1 approve this exact 119-row matrix SHA
2 reject and name the failed row
```

Require the complete literal decision line, not merely `1` or `2`. On the
rejection line, stop before runtime integration. On the approval line, record
the literal choice, then reduce the machine-readable leaf hashes to one
manifest root in the CAL-002 evidence ledger. Approval still authorizes no
push, tag, publish, deploy, or release action.

- [x] **Step 10: Build one canonical evidence-manifest root**

```bash
corepack pnpm --filter slopbrick cal:complete -- manifest-v2 \
  --artifact-dir docs/execution/evidence/artifacts/cal-002 \
  --out docs/execution/evidence/artifacts/cal-002/evidence-manifest-v1.json
```

Expected: exactly 13 sorted leaf entries bind canonical artifact name, byte
count, and file SHA-256. `evidenceRootSha256` is the single human-facing
evidence root over the closed manifest body. The manifest remains
`admitted: false` and `applied: false`; the manifest does not include itself.

- [x] **Step 11: Commit only named immutable evidence**

```bash
git add docs/execution/evidence/CAL-002-complete-calibration.md docs/execution/evidence/artifacts/cal-002/evidence-manifest-v1.json docs/superpowers/plans/2026-07-19-cal-002-progressive-quality-authority.md packages/slopbrick/CHANGELOG.md packages/slopbrick/scripts/cal/cal-002.ts packages/slopbrick/src/calibration/cal-002/artifact-io.ts packages/slopbrick/src/calibration/cal-002/evidence-manifest.ts packages/slopbrick/src/calibration/cal-002/schemas/cal-002-evidence-manifest-v1.schema.json packages/slopbrick/src/calibration/cal-002/schemas/index.json packages/slopbrick/tests/calibration/cal-002-evidence-manifest.test.ts
git diff --cached --name-only
git commit -m "feat(calibration): add evidence manifest root"
```

Expected: `.slopbrick` and unrelated artifact-directory contents remain unstaged. Evidence commit `6a85e4346` contains the ledger plus 13 primary JSON artifacts; this additive follow-up adds the manifest contract and artifact. Human documentation repeats only the manifest root, matrix approval identity, source binding, and generating commit—not every leaf hash.

Completed: primary evidence is checkpointed at `6a85e4346`; the manifest
contract and artifact are checkpointed at `80acf1ada`. The single human-facing
evidence root is
`53ab07e7fd5dbbd09f595c87c255a636f3fb902abe7ec0cbfe923a5392198f8a`.

### Task 16: Add pure current-policy accessors behind an inactive provider

**Files:**
- Create: `packages/slopbrick/src/rules/current-evidence-policy.ts`
- Create: `packages/slopbrick/src/rules/current-evidence-policy-runtime.ts`
- Create: `packages/slopbrick/tests/helpers/current-evidence-policy-v2.ts`
- Create: `packages/slopbrick/tests/rules/current-evidence-policy.test.ts`

**Interfaces:**
- Consumes: `SlopbrickRuleEvidencePolicyV2` and its strict validator.
- Produces: `createCurrentEvidencePolicyAccessors(raw)`, `getCurrentRulePolicy`, `getCurrentDefaultOffRules`, `isRuleRunnable`, `isRuleScoreEligible`, `getRuleEvidenceProvenance`, and an inactive `getCurrentEvidencePolicyAccessors()` provider returning `undefined`.

- [x] **Step 1: Write red accessor truth-table tests**

```ts
it('separates explicit visibility from score authority', () => {
  const policy = createCurrentEvidencePolicyAccessors(appliedPolicyFixture());
  expect(policy.isRuleRunnable('quality/unmeasured', { 'quality/unmeasured': 'low' })).toBe(true);
  expect(policy.isRuleScoreEligible('quality/unmeasured')).toBe(false);
  expect(policy.isRuleRunnable('origin/research', { 'origin/research': 'low' })).toBe(true);
  expect(policy.isRuleScoreEligible('origin/research')).toBe(false);
  expect(policy.isRuleRunnable('quality/blocked', { 'quality/blocked': 'high' })).toBe(false);
  expect(policy.isRuleRunnable('quality/superseded', { 'quality/superseded': 'high' })).toBe(false);
});

it('fails closed on malformed, partial, admitted, or unapplied policy', () => {
  for (const artifact of [missingRow(), duplicateRow(), admittedPolicy(), unappliedPolicy(), staleCatalogPolicy()]) {
    expect(() => createCurrentEvidencePolicyAccessors(artifact)).toThrow();
  }
});
```

- [x] **Step 2: Run the focused test and confirm red**

```bash
corepack pnpm --filter slopbrick exec vitest run tests/rules/current-evidence-policy.test.ts --maxWorkers=1 --minWorkers=1
```

Expected: FAIL because accessors/provider do not exist.

- [x] **Step 3: Implement pure validated accessors**

```ts
export interface CurrentEvidencePolicyAccessors {
  readonly policy: SlopbrickRuleEvidencePolicyV2;
  getCurrentRulePolicy(ruleId: string): SlopbrickRuleEvidencePolicyRowV2 | undefined;
  getCurrentDefaultOffRules(): ReadonlySet<string>;
  isRuleRunnable(ruleId: string, configuredRules: Readonly<Record<string, string>>): boolean;
  isRuleScoreEligible(ruleId: string): boolean | undefined;
  getRuleEvidenceProvenance(ruleId: string): CAL002PolicyProvenanceV2 | undefined;
}

export function createCurrentEvidencePolicyAccessors(raw: unknown): CurrentEvidencePolicyAccessors {
  assertAppliedCompleteCurrentPolicyV2(raw);
  const rows = new Map(raw.rows.map((row) => [row.ruleId, row]));
  return {
    policy: raw,
    getCurrentRulePolicy: (ruleId) => rows.get(ruleId),
    getCurrentDefaultOffRules: () => new Set(raw.rows.filter((row) => !row.enabledByDefault).map((row) => row.ruleId)),
    isRuleRunnable: (ruleId, configured) => {
      const row = rows.get(ruleId);
      if (!row) return true;
      if (configured[ruleId] === 'off') return false;
      return row.enabledByDefault || (row.runnableByExplicitOptIn && Object.hasOwn(configured, ruleId));
    },
    isRuleScoreEligible: (ruleId) => rows.get(ruleId)?.scoreEligible,
    getRuleEvidenceProvenance: (ruleId) => rows.get(ruleId)?.provenance,
  };
}
```

- [x] **Step 4: Add the inactive provider**

```ts
import type { CurrentEvidencePolicyAccessors } from './current-evidence-policy.js';

export function getCurrentEvidencePolicyAccessors(): CurrentEvidencePolicyAccessors | undefined {
  return undefined;
}
```

This file deliberately preserves legacy runtime behavior until Task 20 atomically imports the approved generated JSON. It is not a partial policy artifact.

Add `approvedCurrentPolicyFixture()` in `tests/helpers/current-evidence-policy-v2.ts`. It reads the committed Task 15 matrix/approval, calls `buildCAL002AppliedPolicyV2` with a fixed test-only 40-character commit SHA, and returns validated accessors. Later runtime tests mock only `getCurrentEvidencePolicyAccessors()` to return this exact approved row projection, so activation behavior is exercised before the static provider changes.

- [x] **Step 5: Run tests and commit the dormant foundation**

```bash
corepack pnpm --filter slopbrick exec vitest run tests/rules/current-evidence-policy.test.ts --maxWorkers=1 --minWorkers=1
corepack pnpm --filter slopbrick typecheck
git diff --check
git add packages/slopbrick/src/rules/current-evidence-policy.ts packages/slopbrick/src/rules/current-evidence-policy-runtime.ts packages/slopbrick/tests/helpers/current-evidence-policy-v2.ts packages/slopbrick/tests/rules/current-evidence-policy.test.ts
git commit -m "feat(slopbrick): prepare current policy accessors"
```

Expected: pure truth-table tests pass and scanner behavior remains byte-for-byte legacy because the provider is inactive.

**Checkpoint (2026-07-22):** Complete through `417ca5668`, after the clean-
install AJV dependency correction at `3c1572f89`. The red/green sequence spans
`e43eb959d` through `417ca5668`; it closes the truth table, exact approved-
projection binding, stale/generic projection rejection, and caller-mutation boundary.
The implementation snapshots and freezes validated policy state; the
production provider still returns `undefined`. The focused contract passes
7/7 on exact Node 22.22.3 and 24.15.0 with SlopBrick typecheck on both; the
recursive test, typecheck, and build gates pass, including 4,496 SlopBrick
tests with 15 intentional skips. Two independent final reviews returned 99/100
and 100/100 with no findings. No policy was applied or activated, and no
admission, push, tag, publish, deploy, or release authority was exercised.

### Task 17: Integrate runnable and score authority into scanner paths

**Parallel wave:** Run concurrently with Tasks 18 and 19 after Task 16. This worker may edit only the files named below.

**Files:**
- Modify: `packages/slopbrick/src/rules/registry.ts`
- Modify: `packages/slopbrick/src/cli/effective-issues.ts`
- Modify: `packages/slopbrick/src/cli/scan.ts`
- Modify: `packages/slopbrick/src/engine/worker.ts`
- Modify: `packages/slopbrick/tests/rules/registry.test.ts`
- Modify: `packages/slopbrick/tests/cli/score-authority.test.ts`
- Modify: `packages/slopbrick/tests/cli/score-contract-matrix.e2e.test.ts`
- Modify: `packages/slopbrick/tests/cli/watch-normalization.test.ts`
- Modify: `packages/slopbrick/tests/cli/scan-completion.test.ts`
- Modify: `packages/slopbrick/tests/engine/score-contract-matrix.test.ts`
- Modify: `packages/slopbrick/tests/engine/composite-cluster.test.ts`
- Modify: `packages/slopbrick/tests/engine/composite-weights.test.ts`

**Interfaces:**
- Consumes: `getCurrentEvidencePolicyAccessors()` and exact approved-policy test helper from Task 16.
- Produces: policy-aware `RuleRegistry.createContexts`, `effectiveIssuesForScore`, display normalization, worker composite input, watch parity, and legacy fallback for rule IDs absent from current policy.

- [x] **Step 1: Write red runtime authority tests against the approved matrix**

```ts
vi.mock('../../src/rules/current-evidence-policy-runtime', () => ({
  getCurrentEvidencePolicyAccessors: () => approvedCurrentPolicyFixture(),
}));

it('allows explicit diagnostics without score elevation', () => {
  const issue = makeIssue('ai/any-density');
  const config = makeConfig({ rules: { 'ai/any-density': 'medium' } });
  expect(registry.createContexts(config, 'src/a.ts', cwd).some(({ rule }) => rule.id === issue.ruleId)).toBe(true);
  expect(effectiveIssuesForScore([issue], config)).toEqual([]);
});

it.each(['logic/ghost-defensive', 'logic/math-any-density', 'ai/renyi-profile'])(
  'never instantiates non-runnable %s despite explicit severity',
  (ruleId) => {
    const config = makeConfig({ rules: { [ruleId]: 'high' } });
    expect(registry.createContexts(config, 'src/a.ts', cwd).some(({ rule }) => rule.id === ruleId)).toBe(false);
  },
);
```

Add a default-on score case, explicit `off`, research-origin visible/non-scoring case, failed-oracle visible/non-scoring case, unknown-rule legacy fallback, cached issue normalization, worker composite exclusion, and watch/scan equality.

- [x] **Step 2: Run focused tests and confirm red**

```bash
corepack pnpm --filter slopbrick exec vitest run tests/rules/registry.test.ts tests/cli/score-authority.test.ts tests/cli/score-contract-matrix.e2e.test.ts tests/cli/watch-normalization.test.ts tests/cli/scan-completion.test.ts tests/engine/score-contract-matrix.test.ts tests/engine/composite-cluster.test.ts tests/engine/composite-weights.test.ts --maxWorkers=1 --minWorkers=1
```

Expected: FAIL because scanner paths still use only legacy default-off behavior and explicit override can still score.

- [x] **Step 3: Filter rule contexts through current runnable authority**

```ts
const currentPolicy = getCurrentEvidencePolicyAccessors();
return this.getRules()
  .filter((rule) => currentPolicy?.isRuleRunnable(rule.id, config.rules) ?? true)
  .map((rule) => ({ rule, context: rule.create(context) }));
```

No current provider means exact legacy behavior. A current row is runnable only when default-on or explicitly configured and `runnableByExplicitOptIn`; blocked/superseded/retired rows remain excluded even with explicit severity.

- [x] **Step 4: Make score eligibility non-overridable**

```ts
export function effectiveIssuesForScore(issues: readonly Issue[], config: Pick<ResolvedConfig, 'rules'>): Issue[] {
  const current = getCurrentEvidencePolicyAccessors();
  const legacyDefaultOff = getDefaultOffRules();
  const userOverrides = new Set(Object.keys(config.rules));
  return issues.filter((issue) => {
    if (issue.severity === ('off' as Issue['severity']) || config.rules[issue.ruleId] === 'off') return false;
    const currentEligibility = current?.isRuleScoreEligible(issue.ruleId);
    if (currentEligibility !== undefined) return currentEligibility;
    return !(legacyDefaultOff.has(issue.ruleId) && !userOverrides.has(issue.ruleId));
  });
}
```

Update audit marking to use current `enabledByDefault`/runnable state first and legacy defaults only for IDs absent from policy. Filter worker composite candidates through this same effective set; do not duplicate policy logic in worker code.

- [x] **Step 5: Run focused scanner tests and commit the isolated worker slice**

```bash
corepack pnpm --filter slopbrick exec vitest run tests/rules/current-evidence-policy.test.ts tests/rules/registry.test.ts tests/cli/score-authority.test.ts tests/cli/score-contract-matrix.e2e.test.ts tests/cli/watch-normalization.test.ts tests/cli/scan-completion.test.ts tests/engine/score-contract-matrix.test.ts tests/engine/composite-cluster.test.ts tests/engine/composite-weights.test.ts --maxWorkers=1 --minWorkers=1
corepack pnpm --filter slopbrick typecheck
git diff --check
git add packages/slopbrick/src/rules/registry.ts packages/slopbrick/src/cli/effective-issues.ts packages/slopbrick/src/cli/scan.ts packages/slopbrick/src/engine/worker.ts packages/slopbrick/tests/rules/registry.test.ts packages/slopbrick/tests/cli/score-authority.test.ts packages/slopbrick/tests/cli/score-contract-matrix.e2e.test.ts packages/slopbrick/tests/cli/watch-normalization.test.ts packages/slopbrick/tests/cli/scan-completion.test.ts packages/slopbrick/tests/engine/score-contract-matrix.test.ts packages/slopbrick/tests/engine/composite-cluster.test.ts packages/slopbrick/tests/engine/composite-weights.test.ts
git commit -m "feat(slopbrick): enforce current runtime authority"
```

Expected: approved-policy mock proves exact run/score semantics; inactive production provider keeps the main runtime unchanged until Task 20.

**Checkpoint (2026-07-22):** Complete through `61dc8f803`; the separate
orchestration diagnosis is `36137d740`. Registry context creation now enforces current
runnable authority before a rule can instantiate; the canonical effective-
issue selector makes current score ineligibility non-overridable while
preserving explicit `off` and unknown-ID legacy behavior; scan and watch share
the same audit normalization; and worker Bayesian/composite inputs consume
only score-effective findings. Exact approved-policy tests cover default-on,
unmeasured quality, research-origin, blocked, superseded, retired, explicit-
off, unknown, cached/watch, and composite cases. The approved matrix contains
zero failed-oracle rows, so no fabricated current failed row is claimed. The
production provider still returns `undefined`, leaving production scanner
behavior unchanged until Task 20. Review corrections preserve exact dormant-
provider composite behavior, apply explicit `off` to active-policy synthetic
findings, and route the project-level identical-block coordinator through
current authority. The nine-file focused gate passes 188/188 on
exact Node 22.22.3 and 24.15.0 with SlopBrick typecheck on both; recursive
tests pass Core 285, Engine 60, Website 54, and SlopBrick 4,511 with 15
intentional skips; recursive typecheck and build pass. Two independent final
re-reviews returned 100/100 with no remaining findings. No policy was applied
or activated, and no admission, push, tag, publish, deploy, or release authority
was exercised.

### Task 18: Project current policy provenance across first-scan and reports

**Parallel wave:** Run concurrently with Tasks 17 and 19 after Task 16. This worker may edit only the files named below.

**Files:**
- Modify: `packages/slopbrick/src/types/first-scan.ts`
- Modify: `packages/slopbrick/src/report/first-scan.ts`
- Modify: `packages/slopbrick/src/report/first-scan-pretty.ts`
- Modify: `packages/slopbrick/src/report/pretty.ts`
- Modify: `packages/slopbrick/src/report/markdown.ts`
- Modify: `packages/slopbrick/src/report/html/sections.ts`
- Modify: `packages/slopbrick/src/report/html/utils.ts`
- Modify: `packages/slopbrick/src/report/sarif.ts`
- Modify: `packages/slopbrick/tests/report/first-scan.test.ts`
- Modify: `packages/slopbrick/tests/report/renderer-contract.test.ts`
- Modify: `packages/slopbrick/tests/report/renderer-lanes.test.ts`
- Modify: `packages/slopbrick/tests/report/json.test.ts`
- Modify: `packages/slopbrick/tests/report/sarif.test.ts`
- Modify: `packages/slopbrick/tests/report/markdown.test.ts`
- Modify: `packages/slopbrick/tests/report/html.test.ts`
- Modify: `packages/slopbrick/tests/cli/first-scan-pipeline.test.ts`

**Interfaces:**
- Consumes: current policy provider plus separate `Issue.evidence` and historical `signalStrength` data.
- Produces: one `FirstScanFindingEvidence` contract shared by terminal, JSON, HTML, Markdown, SARIF, and first-scan recommendation ranking.

- [x] **Step 1: Write red provenance and renderer-parity tests**

```ts
expect(projectFinding(unmeasuredIssue).evidence).toMatchObject({
  tier: 'quality-candidate-unmeasured',
  policyVersion: 'slopbrick-rule-evidence-policy-v2',
  qualityDomain: 'type-safety',
  claimClass: 'contextual-heuristic',
  scoreEligible: false,
  admitted: false,
});
expect(projectFinding(originIssue).evidence.claim).toContain('association only');
expect(projectFinding(originIssue).evidence.claim).not.toMatch(/authorship|AI-generated|human-written/i);
expect(sarifResult.properties.slopbrickEvidence).toEqual(jsonFinding.evidence);
```

Add deterministic-current, current-quality-calibrated, advisory, failed, insufficient, research-origin, and no-current-row legacy cases. Assert advisory/unmeasured/origin actions never claim a safe repair and evidence ordering never promotes legacy precision over current policy.

- [x] **Step 2: Run report tests and confirm red**

```bash
corepack pnpm --filter slopbrick exec vitest run tests/report/first-scan.test.ts tests/report/renderer-contract.test.ts tests/report/renderer-lanes.test.ts tests/report/json.test.ts tests/report/sarif.test.ts tests/report/markdown.test.ts tests/report/html.test.ts tests/cli/first-scan-pipeline.test.ts --maxWorkers=1 --minWorkers=1
```

Expected: FAIL because `FirstScanEvidenceTier` still compresses current and legacy into `calibrated`.

- [x] **Step 3: Expand the evidence contract without copying legacy metrics into policy**

```ts
export type FirstScanEvidenceTier =
  | 'deterministic' | 'current-quality-calibrated'
  | 'current-quality-advisory' | 'quality-candidate-unmeasured'
  | 'current-quality-failed' | 'internal-origin-association'
  | 'insufficient-evidence' | 'legacy-calibrated' | 'advisory';

export interface FirstScanFindingEvidence {
  tier: FirstScanEvidenceTier;
  claim: string;
  sourceSpan: 'exact' | 'omitted' | 'absent';
  policyVersion?: 'slopbrick-rule-evidence-policy-v2';
  qualityDomain?: CAL002QualityDomain;
  claimClass?: CAL002ClaimClass;
  readiness?: CAL002Readiness;
  scoreEligible?: boolean;
  admitted?: false;
  legacyMetrics?: {
    verdict: NonNullable<Issue['signalStrength']>['verdict'];
    precision: number;
    lastCalibratedAt: string;
  };
}
```

Rule-authored exact evidence remains highest precedence for source-span truth, while current policy supplies authority/provenance. Historical point estimates live only in `legacyMetrics` and are labeled historical.

Use this exact recommendation order from strongest to weakest: `deterministic`, `current-quality-calibrated`, `current-quality-advisory`, `quality-candidate-unmeasured`, `current-quality-failed`, `insufficient-evidence`, `internal-origin-association`, `legacy-calibrated`, `advisory`. Severity/location ordering remains the existing tie-breaker; no historical precision field may reorder a current-policy tier.

- [x] **Step 4: Use one policy-to-copy mapping across renderers**

```ts
const CURRENT_POLICY_CLAIMS: Record<CAL002PolicyProvenanceV2, string> = {
  'deterministic-finding-evidence': 'Current deterministic quality evidence.',
  'current-quality-calibrated': 'Current owner-reviewed quality evidence.',
  'current-quality-advisory': 'Review utility only; disabled and score-neutral.',
  'quality-candidate-unmeasured': 'Accepted quality concern; owner measurement was not requested.',
  'blocked-quality-candidate': 'Quality candidate blocked before evidence and not runnable.',
  'internal-origin-association': 'Internal origin association only; not quality or authorship evidence.',
  'current-quality-failed-claim-bar': 'Current quality claim bar was not met; diagnostic only.',
  'insufficient-evidence': 'Current evidence is insufficient; diagnostic only.',
  'superseded-policy': 'Historical rule replaced by the named canonical rule.',
  'retired-policy': 'Historical rule retired from current diagnostics.',
};
```

Pretty, full terminal, Markdown, HTML, JSON, and SARIF use the same projected object/copy. Non-runnable rows normally emit no finding; explanation surfaces handle their tombstones.

- [x] **Step 5: Run focused report tests and commit the isolated worker slice**

```bash
corepack pnpm --filter slopbrick exec vitest run tests/report/first-scan.test.ts tests/report/renderer-contract.test.ts tests/report/renderer-lanes.test.ts tests/report/json.test.ts tests/report/sarif.test.ts tests/report/markdown.test.ts tests/report/html.test.ts tests/cli/first-scan-pipeline.test.ts --maxWorkers=1 --minWorkers=1
corepack pnpm --filter slopbrick typecheck
git diff --check
git add packages/slopbrick/src/types/first-scan.ts packages/slopbrick/src/report/first-scan.ts packages/slopbrick/src/report/first-scan-pretty.ts packages/slopbrick/src/report/pretty.ts packages/slopbrick/src/report/markdown.ts packages/slopbrick/src/report/html/sections.ts packages/slopbrick/src/report/html/utils.ts packages/slopbrick/src/report/sarif.ts packages/slopbrick/tests/report/first-scan.test.ts packages/slopbrick/tests/report/renderer-contract.test.ts packages/slopbrick/tests/report/renderer-lanes.test.ts packages/slopbrick/tests/report/json.test.ts packages/slopbrick/tests/report/sarif.test.ts packages/slopbrick/tests/report/markdown.test.ts packages/slopbrick/tests/report/html.test.ts packages/slopbrick/tests/cli/first-scan-pipeline.test.ts
git commit -m "feat(slopbrick): expose current evidence provenance"
```

Expected: every renderer agrees byte-for-byte on machine evidence fields and uses source-faithful non-authorship language.

**Completion receipt (revision 40):** Task 18 is implementation-checkpointed
through `be1be85b8`; the security review is `e17f736e5`. Review corrections
made matching fail closed across file/message collisions, preserved
absolute-path parity, kept deprecated v1 metrics explicitly historical,
carried the weakest grouped source-span state, filtered non-runnable tombstones
from baseline deltas, and limited safe-repair language to finding-bound
deterministic or current-quality-calibrated evidence. The exact eight-file gate
passes 123/123 on Node 22.22.3 and 24.15.0 with SlopBrick typecheck on both.
Recursive tests pass Core 285, Engine 60, Website 54, and SlopBrick 4,530 with
15 intentional skips; recursive typecheck and build pass. Targeted report
coverage records 84.55% statements/lines, 77.27% branches, and 97.77%
functions. Two independent final re-reviews returned 99/100 with no remaining
findings. The production provider remains `undefined`; no policy was applied
or activated, and no admission, push, tag, publish, deploy, or release
authority was exercised.

### Task 19: Separate current policy from historical metrics in explain, MCP, and catalog surfaces

**Parallel wave:** Run concurrently with Tasks 17 and 18 after Task 16. This worker may edit only the files named below.

**Files:**
- Modify: `packages/slopbrick/src/rules/signal-strength.ts`
- Modify: `packages/slopbrick/src/rules/explanation.ts`
- Modify: `packages/slopbrick/src/cli/explain.ts`
- Modify: `packages/slopbrick/src/cli/commands/calibration.ts`
- Modify: `packages/slopbrick/src/cli/commands/rules.ts`
- Modify: `packages/slopbrick/src/mcp/tools.ts`
- Modify: `packages/slopbrick/scripts/generate-rule-catalog.ts`
- Modify: `packages/slopbrick/tests/explain.test.ts`
- Modify: `packages/slopbrick/tests/snapshots/explain-math-default-font.txt`
- Modify: `packages/slopbrick/tests/signal-strength-contract.test.ts`
- Modify: `packages/slopbrick/tests/mcp/patterns.test.ts`
- Modify: `packages/slopbrick/tests/generated-docs-truth.test.ts`

**Interfaces:**
- Consumes: current policy provider and immutable legacy `signal-strength.json`.
- Produces: current configuration/evidence explanation, separate historical metrics projection, MCP parity, and generator options `--policy <path>` plus `--check`.

- [ ] **Step 1: Write red current-versus-historical tests**

```ts
expect(explainRule('ai/any-density')).toMatchObject({
  currentPolicy: {
    runtimeOutcome: 'quality-candidate-default-off',
    enabledByDefault: false,
    runnableByExplicitOptIn: true,
    scoreEligible: false,
    provenance: 'quality-candidate-unmeasured',
  },
  historicalMetrics: expect.objectContaining({ status: 'historical-point-estimate-only' }),
});
expect(JSON.stringify(explainRule('ai/any-density').currentPolicy)).not.toMatch(/precision|recall|fpRate|ratio|verdict/);
expect(mcpExplanation.currentPolicy).toEqual(cliExplanation.currentPolicy);
```

Generator tests use `--policy /private/tmp/cal-002-policy-fixture-v2.json`, built during the test from the approved matrix and deleted in teardown, and assert columns `runtimeOutcome`, `enabledByDefault`, `runnableByExplicitOptIn`, `scoreEligible`, `evidenceProvenance`, `qualityDomain`, `claimClass`, `admitted`, and separately labeled `historicalVerdict`.

- [ ] **Step 2: Run explain/MCP/catalog tests and confirm red**

```bash
corepack pnpm --filter slopbrick exec vitest run tests/explain.test.ts tests/signal-strength-contract.test.ts tests/mcp/patterns.test.ts tests/generated-docs-truth.test.ts --maxWorkers=1 --minWorkers=1
```

Expected: FAIL because explanation and generated catalog expose only historical signal data/current static metadata.

- [ ] **Step 3: Add a two-layer explanation contract**

```ts
export interface RuleExplanation {
  // existing identity/pattern/remediation fields remain
  currentPolicy: {
    status: 'applied' | 'unavailable';
    runtimeOutcome?: CAL002RuntimeOutcomeV2;
    enabledByDefault?: boolean;
    runnableByExplicitOptIn?: boolean;
    scoreEligible?: boolean;
    gateEligible?: boolean;
    qualityDomain?: CAL002QualityDomain;
    claimClass?: CAL002ClaimClass;
    provenance?: CAL002PolicyProvenanceV2;
    replacementRuleId?: string;
    admitted?: false;
  };
  historicalMetrics: RuleCalibrationEvidence;
  configuration: RulePolicy;
}
```

Expand `RulePolicyState` to `'configured-off' | 'configured-severity' | 'current-default-on' | 'current-explicit-diagnostic' | 'current-default-off' | 'current-non-runnable' | 'legacy-default-off' | 'rule-default'`. `describeRulePolicy` uses current defaults/runnability when available and legacy defaults only for unknown rows. CLI and MCP render identical current fields. Calibration/rules commands label v10.1 metrics historical and never call them current quality or authorship truth.

- [ ] **Step 4: Make catalog generation policy-driven and drift-failing**

```ts
interface GenerateRuleCatalogOptions {
  readonly policyPath?: string;
  readonly check: boolean;
}

const currentPolicy = options.policyPath
  ? createCurrentEvidencePolicyAccessors(readCanonicalJson(options.policyPath))
  : getCurrentEvidencePolicyAccessors();
```

When current policy is unavailable, preserve the existing generated document exactly. When supplied/active, require the locked catalog hash and 119 rows, generate current columns from policy only, place legacy verdict in its own historical column, and make `--check` fail on policy/catalog/doc disagreement.

- [ ] **Step 5: Run focused tests and commit the isolated worker slice**

```bash
corepack pnpm --filter slopbrick exec vitest run tests/explain.test.ts tests/signal-strength-contract.test.ts tests/mcp/patterns.test.ts tests/generated-docs-truth.test.ts --maxWorkers=1 --minWorkers=1
corepack pnpm --filter slopbrick typecheck
git diff --check
git add packages/slopbrick/src/rules/signal-strength.ts packages/slopbrick/src/rules/explanation.ts packages/slopbrick/src/cli/explain.ts packages/slopbrick/src/cli/commands/calibration.ts packages/slopbrick/src/cli/commands/rules.ts packages/slopbrick/src/mcp/tools.ts packages/slopbrick/scripts/generate-rule-catalog.ts packages/slopbrick/tests/explain.test.ts packages/slopbrick/tests/snapshots/explain-math-default-font.txt packages/slopbrick/tests/signal-strength-contract.test.ts packages/slopbrick/tests/mcp/patterns.test.ts packages/slopbrick/tests/generated-docs-truth.test.ts
git commit -m "feat(slopbrick): separate current and historical evidence"
```

Expected: explain, MCP, and generated-doc tests pass against the approved policy fixture; `signal-strength.json` remains byte-identical.

### Runtime wave integration barrier

After Tasks 17–19 return, the coordinator reviews each diff and focused receipt, cherry-picks all three commits, then runs:

```bash
corepack pnpm --filter slopbrick exec vitest run tests/rules/current-evidence-policy.test.ts tests/rules/registry.test.ts tests/cli/score-authority.test.ts tests/cli/score-contract-matrix.e2e.test.ts tests/cli/watch-normalization.test.ts tests/cli/scan-completion.test.ts tests/engine/score-contract-matrix.test.ts tests/engine/composite-cluster.test.ts tests/engine/composite-weights.test.ts tests/report/first-scan.test.ts tests/report/renderer-contract.test.ts tests/report/renderer-lanes.test.ts tests/report/json.test.ts tests/report/sarif.test.ts tests/report/markdown.test.ts tests/report/html.test.ts tests/cli/first-scan-pipeline.test.ts tests/explain.test.ts tests/signal-strength-contract.test.ts tests/mcp/patterns.test.ts tests/generated-docs-truth.test.ts --maxWorkers=1 --minWorkers=1
corepack pnpm --filter slopbrick typecheck
corepack pnpm --filter slopbrick build
git diff --check
```

Expected: all three surfaces agree on the approved policy fixture and inactive production provider; no merge conflict exists because worker file sets are disjoint.

### Task 20: Activate the approved policy atomically after full verification

**Files:**
- Create: `packages/slopbrick/src/rules/current-evidence-policy.json`
- Modify: `packages/slopbrick/src/rules/current-evidence-policy-runtime.ts`
- Modify by generator: `packages/slopbrick/docs/rule-catalog.md`
- Create: `docs/execution/evidence/artifacts/cal-002/application-receipt-v2.json`

**Interfaces:**
- Consumes: approved final matrix/approval and integrated runtime implementation HEAD after Tasks 16–19.
- Produces: one statically bundled, applied, 119-row policy plus immutable application receipt; this is local application only.

- [ ] **Step 1: Reverify frozen state and historical metrics before generation**

```bash
shasum -a 256 .slopbrick/calibration/cal-002/origin-state.json packages/slopbrick/src/rules/signal-strength.json > /private/tmp/cal-002-pre-application-hashes.txt
git status --short --branch
corepack pnpm --filter slopbrick typecheck
corepack pnpm --filter slopbrick build
```

Expected: integrated runtime support builds with inactive provider; protected state is still the locked hash; record the current historical signal table hash without changing it.

- [ ] **Step 2: Generate the applied policy and immutable receipt**

```bash
corepack pnpm --filter slopbrick cal:complete -- apply-v2 \
  --matrix docs/execution/evidence/artifacts/cal-002/final-matrix-v2.json \
  --approval docs/execution/evidence/artifacts/cal-002/matrix-approval-v2.json \
  --implementation-commit-ref HEAD \
  --out packages/slopbrick/src/rules/current-evidence-policy.json \
  --receipt-out docs/execution/evidence/artifacts/cal-002/application-receipt-v2.json
```

Expected: applied policy has 119 canonical rows, exact matrix/catalog/approval hashes, `policyRowsSha256` equal to the approved candidate, `applied: true`, and `admitted: false`. Receipt re-reads the destination and binds its SHA before success.

- [ ] **Step 3: Bind the static provider and regenerate catalog truth**

```ts
import policyData from './current-evidence-policy.json' with { type: 'json' };
import {
  createCurrentEvidencePolicyAccessors,
  type CurrentEvidencePolicyAccessors,
} from './current-evidence-policy.js';

const CURRENT_POLICY = createCurrentEvidencePolicyAccessors(policyData);

export function getCurrentEvidencePolicyAccessors(): CurrentEvidencePolicyAccessors {
  return CURRENT_POLICY;
}
```

Then run:

```bash
corepack pnpm --filter slopbrick generate:rules:catalog -- --policy packages/slopbrick/src/rules/current-evidence-policy.json
corepack pnpm --filter slopbrick generate:rules:catalog -- --policy packages/slopbrick/src/rules/current-evidence-policy.json --check
```

Expected: generated catalog current columns match the applied policy; legacy metrics remain separately labeled and byte-identical.

- [ ] **Step 4: Run the complete focused CAL-002 and runtime matrix**

```bash
corepack pnpm --filter slopbrick exec vitest run \
  tests/calibration/cal-002-contracts.test.ts \
  tests/calibration/cal-002-catalog.test.ts \
  tests/calibration/cal-002-oracles.test.ts \
  tests/calibration/cal-002-quality-sampling.test.ts \
  tests/calibration/cal-002-review-session.test.ts \
  tests/calibration/cal-002-quality-metrics.test.ts \
  tests/calibration/cal-002-origin.test.ts \
  tests/calibration/cal-002-matrix.test.ts \
  tests/calibration/cal-002-application.test.ts \
  tests/calibration/cal-002-contracts-v2.test.ts \
  tests/calibration/cal-002-authority.test.ts \
  tests/calibration/cal-002-authority-session.test.ts \
  tests/calibration/cal-002-quality-disposition.test.ts \
  tests/calibration/cal-002-supersession.test.ts \
  tests/calibration/cal-002-sql-parity.test.ts \
  tests/calibration/cal-002-console-parity.test.ts \
  tests/calibration/cal-002-any-parity.test.ts \
  tests/calibration/cal-002-transfer-oracles-cpp-rust.test.ts \
  tests/calibration/cal-002-transfer-oracles-dead.test.ts \
  tests/calibration/cal-002-transfer-oracles-security.test.ts \
  tests/calibration/cal-002-oracles-v2.test.ts \
  tests/calibration/cal-002-origin-v2.test.ts \
  tests/calibration/cal-002-matrix-v2.test.ts \
  tests/calibration/cal-002-application-v2.test.ts \
  tests/calibration/cal-002-cli.test.ts \
  tests/rules/current-evidence-policy.test.ts \
  tests/rules/quality-authority-copy.test.ts \
  tests/rules/registry.test.ts \
  tests/cli/score-authority.test.ts \
  tests/cli/score-contract-matrix.e2e.test.ts \
  tests/cli/watch-normalization.test.ts \
  tests/cli/scan-completion.test.ts \
  tests/engine/score-contract-matrix.test.ts \
  tests/engine/composite-cluster.test.ts \
  tests/engine/composite-weights.test.ts \
  tests/report/first-scan.test.ts \
  tests/report/renderer-contract.test.ts \
  tests/report/renderer-lanes.test.ts \
  tests/report/json.test.ts \
  tests/report/sarif.test.ts \
  tests/report/markdown.test.ts \
  tests/report/html.test.ts \
  tests/cli/first-scan-pipeline.test.ts \
  tests/explain.test.ts \
  tests/signal-strength-contract.test.ts \
  tests/mcp/patterns.test.ts \
  tests/generated-docs-truth.test.ts \
  --maxWorkers=1 --minWorkers=1
```

Expected: every v1, v2, runtime, report, MCP, copy, and generator test passes with the real static policy, not a mock.

- [ ] **Step 5: Run package, recursive, build, and bundle gates serially**

```bash
SLOPBRICK_VITEST_WORKERS=1 corepack pnpm --filter slopbrick test
corepack pnpm -r typecheck
SLOPBRICK_VITEST_WORKERS=1 corepack pnpm -r test
corepack pnpm -r build
corepack pnpm --filter slopbrick exec vitest run tests/integration/dist-bundle-paths.test.ts tests/integration/packaged-worker.test.ts --maxWorkers=1 --minWorkers=1
```

Expected: every command exits `0`; record observed counts instead of copying historical counts. Any failure stops application and invokes `superpowers:systematic-debugging`; do not weaken policy or tests to force green.

- [ ] **Step 6: Run the package-local self-scan with no baseline mutation**

```bash
shasum -a 256 packages/slopbrick/.slopbrick/baseline.json 2>/dev/null || true
corepack pnpm --filter slopbrick exec -- node ./bin/slopbrick.js scan --workspace . --threads 1 --no-telemetry --no-color
shasum -a 256 packages/slopbrick/.slopbrick/baseline.json 2>/dev/null || true
```

Expected: scan completes all selected files with no parse, timeout, crash, or internal failures; current policy provenance is visible; unmeasured/advisory/origin diagnostics remain score-neutral; blocked/superseded/retired rules do not run; baseline is absent or byte-identical. A configured gate failure stops the commit and is reported truthfully.

- [ ] **Step 7: Run the final owner comprehension decision**

Present the ANSI-free first screen plus one example each of default-on quality, unmeasured opt-in/non-scoring, research-origin opt-in/non-scoring, superseded tombstone, and historical-metric separation. The owner receives exactly:

```text
1 the finding, provenance, score, and action boundaries are understandable; apply this exact policy locally
2 one or more boundaries are unclear; leave the candidate uncommitted and name the failed surface
```

On `2`, stop with the candidate unstaged and open a bounded correction. On `1`, continue without inferring push, publish, deploy, admission, or release authority.

- [ ] **Step 8: Recheck immutable hashes and commit the atomic local application**

```bash
shasum -a 256 .slopbrick/calibration/cal-002/origin-state.json packages/slopbrick/src/rules/signal-strength.json
diff -u /private/tmp/cal-002-pre-application-hashes.txt <(shasum -a 256 .slopbrick/calibration/cal-002/origin-state.json packages/slopbrick/src/rules/signal-strength.json)
git add packages/slopbrick/src/rules/current-evidence-policy.json packages/slopbrick/src/rules/current-evidence-policy-runtime.ts packages/slopbrick/docs/rule-catalog.md docs/execution/evidence/artifacts/cal-002/application-receipt-v2.json
git diff --cached --name-only
git diff --cached --check
git commit -m "feat(slopbrick): apply progressive evidence policy"
```

Expected: protected v1 state and historical signal metrics are byte-identical; exactly four application files are committed; local runtime policy is now active and still non-admitting.

### Task 21: Project later observed CAL-002 closeout facts into already-aligned current docs

**Sequencing boundary:** The approved positioning and documentation convergence
plan at
[`2026-07-19-usebrick-coherence-docs.md`](./2026-07-19-usebrick-coherence-docs.md)
lands before CAL-002 closeout. That plan owns the three documentation groups,
UseBrick doctrine, dated market note, execution revision 28, and their
cross-surface integration. Do not recreate or override its file map here.

**Interfaces:**
- Consumes: only the committed Task 20 policy/application artifacts, observed
  full-gate and self-scan outputs, explicit owner decisions, and the integrated
  coherence-doc checkpoint.
- Produces: a later factual projection of observed CAL application hashes, gate
  results, statuses, and receipts into already-aligned current documents.
- Does not predeclare: closeout status, WIP transition, next execution revision,
  self-scan counts, hashes, owner choices, or release authority.

- [ ] **Step 1: Wait for both prerequisites**

Begin only after the coherence documentation checkpoint is integrated and Task
20 has committed its application receipt. Revision 28 belongs to the strategy
pass; CAL closeout must use the next truthful execution revision available at
that later time.

- [ ] **Step 2: Build one observed closeout packet**

Read, do not infer, the exact values from committed artifacts and fresh command
output:

```text
matrix, policy, and application SHA-256 values
applied and admitted values
focused, recursive, generated-doc, MCP, and self-scan gate results
self-scan selected/analyzed/failure counts and exit status
owner comprehension or no-decision state
working-tree and protected-path state
release and deployment authorization state
```

Missing or failed evidence stays missing or failed. Historical v10.1 evidence
remains historical, v10.3 admission remains independently stated, and no
protected owner state or immutable evidence is rewritten.

- [ ] **Step 3: Update facts without reopening strategy**

Update only current documents that already carry the affected CAL-002 facts.
Change only observed application hashes, gate results, plan/status transitions,
and receipt links. Do not change the approved UseBrick position, dated market
model, buyer hypothesis, capability hierarchy, package versions, historical
plans/evidence, generated artifacts, or release boundary.

- [ ] **Step 4: Derive status from evidence**

Mark CAL-002 or a dependent plan `done` only if its own acceptance criteria and
fresh gates pass. Otherwise retain the truthful non-terminal status and next
action. Recompute implementation WIP from actual `in_progress` plans; do not
copy the obsolete predeclared `0/2` closeout.

- [ ] **Step 5: Validate the factual projection**

```bash
corepack pnpm plans:validate
node --test scripts/validate-execution-docs.test.mjs
corepack pnpm --filter slopbrick generate:rules:catalog -- --policy packages/slopbrick/src/rules/current-evidence-policy.json --check
corepack pnpm --filter slopbrick exec vitest run tests/generated-docs-truth.test.ts tests/rules/quality-authority-copy.test.ts tests/mcp/docs.test.ts --maxWorkers=1 --minWorkers=1
git diff --check
git status --short
```

Expected: validators and applicable observed gates pass or their failures are
recorded truthfully; the diff contains only current factual closeout fields and
receipts. No push, tag, GitHub Release, npm publication, website deployment,
public release, historical rewrite, or protected-path change is authorized.

---

## Final Verification Matrix

| Contract | Required proof |
| --- | --- |
| Catalog identity | 119 unique current IDs and locked catalog SHA-256. |
| Owner authority | Exact 26 transfer / 4 blocked / 3 supersede / 7 retire batch; v2 receipt binds byte-identical v1 state. |
| Whole-catalog projection | Exact 47 / 26 / 4 / 3 / 7 / 32 categories totaling 119. |
| Quality semantics | Every runnable or repairable quality row has explicit domain/claim class; AI association cannot select either. |
| Assignment eligibility | Only evidence-ready rows; blocked/research/superseded/retired rows reject assignments. |
| Zero-label honesty | 32 rows, zero labels, no Wilson interval, `not-requested-owner-capacity`, default-off and score/gate neutral. |
| Optional cohort bound | Reach first, at most four IDs, 60 initial and 200 maximum labels per selected rule. |
| Deterministic evidence | Exactly 41 evidence-ready oracle rows: 32 starting plus nine transferred. The nine transfers have positive/negative/adversarial fixtures and five fixed source-bound protocol slots; failures close default-off. |
| Supersession | Three exact replacement/parity/migration/disposition rows; SQL/console ported and line-density `any` rejected as false-positive coverage. |
| Origin boundary | Exactly 32 research-only rows, internal association only, default-off, non-scoring, non-admitting. |
| Runtime effects | Default-on quality may score/gate; explicit advisory/unmeasured/failed/insufficient/origin diagnostics never score; blocked/superseded/retired never run. |
| Projection parity | Scanner, watch, worker composites, file/project scores, gates, first-scan, terminal, JSON, Markdown, HTML, SARIF, MCP, explain, and generated catalog agree. |
| Historical preservation | v1 state, frozen CAL-001/CAL-002 v1 artifacts, and `signal-strength.json` remain byte-identical. |
| Privacy/non-admission | Durable receipts contain no raw source/path/repository/personal identity and all state `admitted: false`. |
| Verification | Focused v1/v2/runtime suites, package test, recursive typecheck/test/build, bundle tests, self-scan, owner comprehension, docs validators. |
| Release boundary | Local applied policy is reported separately from push, tag, GitHub Release, npm publish, website deploy, or public authorization. |

## Execution Handoff

The recommended execution mode is **parallel worktree waves**: use `superpowers:using-git-worktrees`, `superpowers:dispatching-parallel-agents`, and `superpowers:subagent-driven-development`; dispatch every worker in a wave together, review each result, then cross-test and merge at the barrier. The fallback is **inline execution** with `superpowers:executing-plans`, preserving the same task order and owner checkpoints without concurrency.
