# SlopBrick Evidence-Led First Scan Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the default SlopBrick scan immediately explain repository health, the strongest three actions, each finding's evidence and repair boundary, and truthful current/new/resolved/unchanged state on rescan.

**Architecture:** Add one optional, versioned `firstScan` projection to `ProjectReport`. Build it after scan validity is known from the existing effective finding set, fixed five-area taxonomy, canonical Repository Health inputs, signal metadata, finding-bound repair proof, and the existing config-bound debt baseline. Keep detector output, score math, gate decisions, and legacy report fields unchanged. The default pretty CLI renders only the bounded first screen; `--full` appends the existing detailed report with five-area finding annotations. JSON and SARIF receive additive machine fields.

**Tech Stack:** TypeScript, Node.js 22/24, Vitest, Chalk, existing SlopBrick scan/report/baseline modules, Markdown execution control, and `corepack pnpm` workspace gates.

## Global Constraints

- Begin implementation only from execution-index revision 24, where this reviewed plan is recorded and `SB-UX-001` remains `ready`.
- On the first implementation commit, move `SB-UX-001` to `in_progress`; this consumes the second and final implementation WIP slot alongside `VAL-001`.
- Preserve every detector firing, severity, `aiSpecific` value, score formula, threshold, gate decision, rule default, CAL-001 row, corpus artifact, and admission state. This slice projects existing truth; it does not recalibrate or activate anything.
- Treat `calibrated` as measured rule-level support with date, verdict, and precision, not current v10.3 admission, authorship proof, or a quality verdict. Current v10.3 admission remains zero.
- Never call advice or an unbound fix safe. A repair is finding-bound only when its `slopbrick-fix-binding-v1` rule, file, line, and column match the current issue; the apply layer still revalidates its source hash. Otherwise render manual review with the explicit statement that no safe bounded repair is available.
- Keep `ProjectReport.firstScan` optional. Legacy/programmatic reports without it must retain their current renderer and wire behavior.
- Keep exported first-scan types self-contained inside SlopBrick. Do not leak an import of the private `@usebrick/core` package through the generated public declaration; derive the calibration verdict type from `Issue['signalStrength']`.
- Keep `@usebrick/core`, all Core JSON Schemas, `STRUCTURE_SCHEMA_VERSION`, package dependencies, score-contract version, and public package version unchanged. The workspace remains the unreleased `slopbrick@0.45.0` candidate.
- Extend `slopbrick-debt-baseline-v1` additively. Continue accepting revision-1 ID-only baselines; write revision 2 with bounded snapshots. Never refresh, replace, or accept a baseline automatically. `scan --baseline` remains the only write authority.
- Baseline snapshots may store stable identity, rule/category/severity/polarity, repository-relative path, line, and column. They must not store source text, finding messages, advice, evidence snippets, absolute paths, repository identity, or secrets.
- Default-off findings remain machine-auditable in `issues` but are excluded from first-scan areas, actions, deltas, and human actionable output.
- Incomplete and not-applicable scans must not expose a headline, dimensions, recommendations, or comparable baseline counts. Preserve their existing fail-closed gate semantics.
- Do not add a network call, hosted dashboard, visual-regression service, participant workflow, telemetry event, auto-fix, new CLI flag, tag, GitHub Release, npm publication, or website deployment.
- Use `corepack pnpm`; run Vitest with `--maxWorkers=1 --minWorkers=1`; run the final recursive gates serially.
- Preserve the user-owned untracked paths `.astro/`, `.playwright-cli/`, `TODO.md`, `pet-runs/`, and `src/`. Stage only task-owned files.
- A Git push is only a source-control checkpoint. It cannot imply package release, deployment, corpus admission, or public-claim approval.

---

## Locked Product Contract

### Five exhaustive areas

Use this exact `Record<Category, FirstScanAreaId>` mapping so every current category appears once:

```ts
export const FIRST_SCAN_AREA_BY_CATEGORY: Record<Category, FirstScanAreaId> = {
  visual: 'visual-slop',
  typo: 'visual-slop',
  layout: 'visual-slop',
  component: 'frontend-implementation',
  context: 'frontend-implementation',
  perf: 'frontend-implementation',
  logic: 'code-and-logic',
  test: 'code-and-logic',
  db: 'code-and-logic',
  docs: 'code-and-logic',
  i18n: 'code-and-logic',
  arch: 'repository-coherence',
  ai: 'repository-coherence',
  product: 'repository-coherence',
  wcag: 'accessibility-and-resilience',
  security: 'accessibility-and-resilience',
};
```

Render the areas in this fixed order and with these exact labels:

```ts
export const FIRST_SCAN_AREAS = [
  { id: 'visual-slop', label: 'Visual Slop' },
  { id: 'frontend-implementation', label: 'Frontend Implementation' },
  { id: 'code-and-logic', label: 'Code and Logic' },
  { id: 'repository-coherence', label: 'Repository Coherence' },
  { id: 'accessibility-and-resilience', label: 'Accessibility and Resilience' },
] as const;
```

### Evidence tiers

Apply the following pure precedence to each active finding:

1. `deterministic` when `issue.evidence` exists. Both `exact` and `omitted` are rule-authored matched-source-span evidence; omission only withholds an oversized snippet.
2. `calibrated` when no finding evidence exists and `issue.signalStrength` exists. Include its verdict, precision, and `lastCalibratedAt`, and use the claim text `Measured rule behavior; not proof of authorship.`
3. `advisory` otherwise, with the claim text `Review guidance only; no rule-authored span or rule metrics are attached.`

Evidence tier is explanatory metadata only. It must not alter scoring, suppression, severity, rule polarity, or gating.

### Repair boundary

Project one action per finding with this precedence:

1. `apply-finding-bound-fix` plus `repairSafety: 'finding-bound'` only when at least one `fix`/`fixes` member has a `slopbrick-fix-binding-v1` whose rule, file, line, and column match the issue. Source SHA validation remains the apply layer's authority.
2. `manual-review` plus `repairSafety: 'no-safe-repair'` when advice, a fix hint, an unbound fix, a location, or a message can guide review. The rendered label must end with `No safe bounded repair is available.`
3. `none` plus `repairSafety: 'no-safe-repair'` only when no review target can be identified. The rendered label must be `No safe next action is available from this finding.`

Never render an unbound suggestion as runnable remediation.

### Recommendation order

Group active findings by `ruleId`, then sort groups by this deterministic tuple:

1. highest severity: `high`, `medium`, `low`;
2. evidence confidence: `deterministic`, `calibrated`, `advisory`;
3. calibrated precision descending, with no precision treated as `-1`;
4. affected file count descending, with project-wide scope ranked above file scope;
5. repair safety: `finding-bound`, `no-safe-repair`;
6. `ruleId` ascending as the stable tie-breaker.

Aggregate groups conservatively: use the highest severity, the weakest evidence tier present, and `finding-bound` repair safety only when every grouped finding has a matching binding. Choose the representative finding by severity, then repository-relative path, line, and column. Return at most three groups. Do not promote a finding merely because it is new; show `new`, `unchanged`, `mixed`, or `current` as context without changing this approved ranking contract.

### Headline

The bounded first screen has exactly one score headline:

```text
Repository Health 92.4/100
```

Copy its four canonical inputs from `scoreExplanation.repositoryHealth.inputs` without recomputing the score:

- AI Slop cleanliness, weight 0.40;
- Engineering hygiene, weight 0.30;
- Security, weight 0.20;
- Test quality, weight 0.10.

The existing AI Slop Score gate remains a separately labeled policy result. Do not present Repository Health itself as the CI gate.

### Rescan delta

Use the existing stable finding identity and current config hash. Comparable revision-2 baselines provide named new, unchanged, and resolved findings. Revision-1 ID-only baselines still provide exact counts; if resolved details cannot be named, state `Resolved details unavailable from the legacy baseline; refresh only with an explicit scan --baseline after review.` Missing, invalid, and config-mismatched baselines are distinct and claim no delta.

---

## File Map

### New product-code files

- `packages/slopbrick/src/types/first-scan.ts` — public additive first-scan, evidence, action, area, headline, and delta types.
- `packages/slopbrick/src/report/finding-identity.ts` — shared stable identity and repository-relative location helpers extracted with the first projection so the report layer never imports a CLI module.
- `packages/slopbrick/src/report/finding-delta.ts` — pure active-finding snapshot and config-bound delta computation.
- `packages/slopbrick/src/report/first-scan.ts` — pure five-area/evidence/action/headline/recommendation projection.
- `packages/slopbrick/src/report/first-scan-pretty.ts` — bounded width-aware terminal renderer and full five-area detail renderer.

### New tests

- `packages/slopbrick/tests/report/first-scan.test.ts` — pure projection, owner red-state snapshots, ranking, validity, width, colorless, and screen-reader-order contracts.
- `packages/slopbrick/tests/cli/first-scan-pipeline.test.ts` — real scan attachment, baseline lifecycle, unchanged/new/resolved, mismatch, and no-auto-refresh integration.

### Existing product code to modify

- `packages/slopbrick/src/types/index.ts`
- `packages/slopbrick/src/types/project-report.ts`
- `packages/slopbrick/src/types/baseline.ts`
- `packages/slopbrick/src/cli/report/debt-baseline.ts`
- `packages/slopbrick/src/cli/report/finalizeReport.ts`
- `packages/slopbrick/src/report/pretty.ts`
- `packages/slopbrick/src/report/json.ts`
- `packages/slopbrick/src/report/sarif.ts`

### Existing tests to modify

- `packages/slopbrick/tests/cli/new-debt-gate.test.ts`
- `packages/slopbrick/tests/cli/output-ux.test.ts`
- `packages/slopbrick/tests/report/json.test.ts`
- `packages/slopbrick/tests/report/sarif.test.ts`
- `packages/slopbrick/tests/report/renderer-contract.test.ts`
- `packages/slopbrick/tests/report/whole-project-parity.test.ts`

### Documentation and control plane to modify at implementation close

- `README.md`
- `ROADMAP.md`
- `packages/slopbrick/README.md`
- `packages/slopbrick/CHANGELOG.md`
- `docs/execution/index.json`
- `docs/execution/STATUS.md`
- `docs/execution/CHANGELOG.md`
- `docs/execution/plans/SB-UX-001-first-scan.md`
- `docs/execution/plans/TEL-001-local-outcomes.md`
- `docs/execution/evidence/SB-UX-001-first-scan.md`

---

## Task 1: Enter the implementation lane before touching product code

**Files:**
- Modify: `docs/execution/index.json`
- Modify: `docs/execution/STATUS.md`
- Modify: `docs/execution/CHANGELOG.md`
- Modify: `docs/execution/plans/SB-UX-001-first-scan.md`
- Modify: `ROADMAP.md`

**Interfaces:**
- Consumes execution-index revision 24, this reviewed plan, `specs/PLAN-AUDIT_LATEST.md`, and `specs/IMPACT_LATEST.md`.
- Produces revision 25 with `SB-UX-001: in_progress`, implementation WIP `2/2`, and no other status transition.

- [ ] **Step 1: Update the indexed state**

Set `revision` to `25`. Change only `SB-UX-001.status` from `ready` to `in_progress`. Set its next action to:

```json
{
  "text": "Write the red first-scan projection tests for the owner-observed calibrated, no-safe-repair, and unchanged-rescan states.",
  "verify": "corepack pnpm --filter slopbrick exec vitest run tests/report/first-scan.test.ts --maxWorkers=1 --minWorkers=1",
  "evidencePath": "docs/execution/evidence/SB-UX-001-first-scan.md"
}
```

Keep `TEL-001` ready and `VAL-001` in progress. Add this implementation-plan path to `SB-UX-001.evidence`.

- [ ] **Step 2: Reconcile human projections**

Update `ROADMAP.md`, `STATUS.md`, the bounded SB-UX plan, and a new append-only changelog revision 25 so they all state:

- the detailed implementation plan is approved and execution has started;
- `SB-UX-001` and `VAL-001` consume the two implementation slots;
- the first code action is the failing projection test;
- no score, rule, baseline, source, release, or public artifact changed.

- [ ] **Step 3: Validate the control plane**

Run:

```bash
corepack pnpm plans:validate
node --test scripts/validate-execution-docs.test.mjs
git diff --check
```

Expected: 16 plans valid, implementation WIP `2/2`, all execution-doc tests pass, and no whitespace errors.

- [ ] **Step 4: Commit the execution transition**

```bash
git add ROADMAP.md docs/execution/index.json docs/execution/STATUS.md docs/execution/CHANGELOG.md docs/execution/plans/SB-UX-001-first-scan.md
git commit -m "docs(execution): start first-scan UX"
```

---

## Task 2: Red-test and add the typed first-scan projection

**Files:**
- Create: `packages/slopbrick/tests/report/first-scan.test.ts`
- Create: `packages/slopbrick/src/types/first-scan.ts`
- Create: `packages/slopbrick/src/report/finding-identity.ts`
- Create: `packages/slopbrick/src/report/first-scan.ts`
- Modify: `packages/slopbrick/src/types/index.ts`
- Modify: `packages/slopbrick/src/types/project-report.ts`
- Modify: `packages/slopbrick/src/cli/report/debt-baseline.ts`

**Interfaces:**
- Produces `projectFirstScan(report, options): FirstScanExperience`.
- Adds optional `firstScan?: FirstScanExperience` to `ProjectReport`.
- Makes no detector, score, or persistence call.

- [ ] **Step 1: Write the failing contract tests**

Create fixtures for all 16 categories, an exact-evidence issue, a measured owner issue, an unknown advisory issue, a finding-bound fix, and an unbound/manual-review issue. Assert:

```ts
expect(FIRST_SCAN_AREA_BY_CATEGORY).toEqual({
  visual: 'visual-slop', typo: 'visual-slop', layout: 'visual-slop',
  component: 'frontend-implementation', context: 'frontend-implementation', perf: 'frontend-implementation',
  logic: 'code-and-logic', test: 'code-and-logic', db: 'code-and-logic', docs: 'code-and-logic', i18n: 'code-and-logic',
  arch: 'repository-coherence', ai: 'repository-coherence', product: 'repository-coherence',
  wcag: 'accessibility-and-resilience', security: 'accessibility-and-resilience',
});

expect(byRule.get('typo/placeholder-text')?.evidence.tier).toBe('deterministic');
expect(byRule.get('logic/zipf-slope-anomaly')?.evidence).toMatchObject({
  tier: 'calibrated',
  claim: 'Measured rule behavior; not proof of authorship.',
});
expect(byRule.get('custom/review-only')?.evidence.tier).toBe('advisory');
expect(byRule.get('logic/zipf-slope-anomaly')?.action).toMatchObject({
  kind: 'manual-review',
  repairSafety: 'no-safe-repair',
});
expect(result.recommendedActions).toHaveLength(3);
expect(result.areas.map(({ id }) => id)).toEqual(FIRST_SCAN_AREAS.map(({ id }) => id));
```

Also assert that suppressed `severity: 'off'` issues are absent, the input report is not mutated, recommendation ties end in `ruleId` order, and a complete zero-finding report returns all five zero-count areas and zero recommendations.

- [ ] **Step 2: Run the focused test and confirm red**

```bash
corepack pnpm --filter slopbrick exec vitest run tests/report/first-scan.test.ts --maxWorkers=1 --minWorkers=1
```

Expected: FAIL because `src/report/first-scan.ts`, `src/report/finding-identity.ts`, and `src/types/first-scan.ts` do not exist.

- [ ] **Step 3: Add the exact public type surface**

Define and export these discriminants in `src/types/first-scan.ts`:

```ts
export type FirstScanAreaId =
  | 'visual-slop'
  | 'frontend-implementation'
  | 'code-and-logic'
  | 'repository-coherence'
  | 'accessibility-and-resilience';

export type FirstScanEvidenceTier = 'deterministic' | 'calibrated' | 'advisory';
export type FirstScanFindingChange = 'current' | 'new' | 'unchanged';
export type FirstScanActionChange = FirstScanFindingChange | 'mixed';
export type FirstScanRepairSafety = 'finding-bound' | 'no-safe-repair';
export type FirstScanActionKind = 'apply-finding-bound-fix' | 'manual-review' | 'none';
export type FirstScanStatus = 'complete' | 'incomplete' | 'not-applicable';
export type FirstScanContextKind =
  | 'project-wide'
  | 'application'
  | 'rule-implementation'
  | 'test-fixture'
  | 'generated-schema'
  | 'documentation-example'
  | 'demo-marketing'
  | 'unknown';
```

Define `FirstScanFinding`, `FirstScanRecommendedAction`, `FirstScanAreaSummary`, `FirstScanHeadline`, `FirstScanFindingDelta`, and `FirstScanExperience`. Use this top-level shape:

```ts
export interface FirstScanFindingEvidence {
  tier: FirstScanEvidenceTier;
  claim: string;
  sourceSpan: 'exact' | 'omitted' | 'absent';
  calibration?: {
    verdict: NonNullable<Issue['signalStrength']>['verdict'];
    precision: number;
    lastCalibratedAt: string;
  };
}

export interface FirstScanFindingAction {
  kind: FirstScanActionKind;
  repairSafety: FirstScanRepairSafety;
  label: string;
}

export interface FirstScanFinding {
  identity: string;
  ruleId: string;
  area: FirstScanAreaId;
  severity: Severity;
  aiSpecific: boolean;
  location: {
    filePath?: string;
    line: number;
    column: number;
    context: FirstScanContextKind;
    contextLabel: string;
  };
  why: string;
  evidence: FirstScanFindingEvidence;
  change: FirstScanFindingChange;
  action: FirstScanFindingAction;
}

export interface FirstScanHeadlineDimension {
  axis: 'aiSlopCleanliness' | 'engineeringHygiene' | 'security' | 'testQuality';
  label: string;
  value: number;
  weight: number;
  weightedAmount: number;
}

export interface FirstScanHeadline {
  label: 'Repository Health';
  value: number;
  direction: 'higher-is-better';
  dimensions: FirstScanHeadlineDimension[];
}

export interface FirstScanAreaSummary {
  id: FirstScanAreaId;
  label: string;
  findingCount: number;
  severity: { high: number; medium: number; low: number };
}

export interface FirstScanRecommendedAction {
  rank: 1 | 2 | 3;
  ruleId: string;
  area: FirstScanAreaId;
  severity: Severity;
  evidence: FirstScanFindingEvidence;
  change: FirstScanActionChange;
  reach: {
    kind: 'project-wide' | 'multi-file' | 'single-file';
    findingCount: number;
    affectedFileCount: number;
  };
  representativeLocation: FirstScanFinding['location'];
  why: string;
  action: FirstScanFindingAction;
  findingIds: string[];
}

export interface FirstScanResolvedFinding {
  identity: string;
  ruleId: string;
  area: FirstScanAreaId;
  severity: Severity;
  aiSpecific: boolean;
  filePath?: string;
  line: number;
  column: number;
}

export interface FirstScanFindingDelta {
  kind: 'slopbrick-finding-delta-v1';
  status: 'not-evaluated' | 'unavailable' | 'incompatible' | 'compared';
  reason?:
    | 'incomplete-scan'
    | 'no-files-analyzed'
    | 'missing-baseline'
    | 'invalid-baseline'
    | 'config-mismatch';
  baselineRevision?: number;
  currentCount: number;
  baselineCount?: number;
  newCount?: number;
  unchangedCount?: number;
  resolvedCount?: number;
  resolvedDetails?: 'available' | 'legacy-unavailable';
  resolved?: FirstScanResolvedFinding[];
  summary: string;
}

export interface FirstScanExperience {
  kind: 'slopbrick-first-scan-v1';
  status: FirstScanStatus;
  headline: FirstScanHeadline | null;
  areas: FirstScanAreaSummary[];
  findings: FirstScanFinding[];
  recommendedActions: FirstScanRecommendedAction[];
  delta: FirstScanFindingDelta;
}
```

`FirstScanHeadline.dimensions` must carry `axis`, `label`, `value`, `weight`, and `weightedAmount`. `FirstScanFinding` must carry stable `identity`, `ruleId`, area, severity, polarity, repository-relative location and context, `why`, typed evidence, change, and action. Recommendations must carry rank, grouped finding IDs, affected-file count, reach, representative location, and the same evidence/action boundary. Import `Issue` and `Severity` from local type modules; do not export an `@usebrick/core` import from this public type file.

Export the file from `types/index.ts`, import the type in `project-report.ts`, and add:

```ts
/** Additive evidence-led projection for the default scan-to-rescan UX. */
firstScan?: FirstScanExperience;
```

- [ ] **Step 4: Extract stable identity and implement the pure projector**

Move the current `findingLocation` and `findingIdentity` implementation from `cli/report/debt-baseline.ts` into `report/finding-identity.ts` before importing it from the projector. Export the location helper as `repositoryRelativeFindingLocation(issue, cwd)` and preserve the canonical JSON fields and SHA-256 bytes exactly. Re-export `findingIdentity` from `debt-baseline.ts` for compatibility and keep `collectFindingIds` there. Freeze the existing `/workspace/src/A.tsx`, `visual/arbitrary-escape`, line `4`, column `1`, `Layout arbitrary value 'p-[13px]'` fixture at identity `d3d60674df286693c4022f5443e67841b487ed8bd3c5ebd857c4373e9ca63f17`.

In `src/report/first-scan.ts`:

- export the locked category map and area order;
- filter active findings once;
- classify evidence and action using the locked precedence;
- use `classifyFindingContext` for scope labels;
- retain active findings in their original `report.issues` order;
- copy canonical headline inputs instead of recalculating Repository Health;
- group recommendations by rule and apply the exact tuple sort;
- return at most three recommendations;
- return `headline: null`, no recommendations, and `delta.status: 'not-evaluated'` for incomplete/not-applicable scans.

Use this callable boundary so baseline work can land additively in Task 3:

```ts
export interface ProjectFirstScanOptions {
  cwd: string;
  configHash: string;
  baselineState?: 'missing' | 'invalid' | 'loaded';
  baseline?: DebtBaseline;
}

export function projectFirstScan(
  report: ProjectReport,
  options: ProjectFirstScanOptions,
): FirstScanExperience;
```

- [ ] **Step 5: Run focused tests and typecheck**

```bash
corepack pnpm --filter slopbrick exec vitest run tests/report/first-scan.test.ts --maxWorkers=1 --minWorkers=1
corepack pnpm --filter slopbrick typecheck
```

Expected: first-scan projection tests and package typecheck pass.

- [ ] **Step 6: Commit the typed projection**

```bash
git add packages/slopbrick/src/types/first-scan.ts packages/slopbrick/src/types/index.ts packages/slopbrick/src/types/project-report.ts packages/slopbrick/src/report/finding-identity.ts packages/slopbrick/src/report/first-scan.ts packages/slopbrick/src/cli/report/debt-baseline.ts packages/slopbrick/tests/report/first-scan.test.ts
git commit -m "feat(slopbrick): project first-scan actions"
```

---

## Task 3: Make the durable baseline name new, unchanged, and resolved findings

**Files:**
- Create: `packages/slopbrick/src/report/finding-delta.ts`
- Modify: `packages/slopbrick/src/types/baseline.ts`
- Modify: `packages/slopbrick/src/cli/report/debt-baseline.ts`
- Modify: `packages/slopbrick/src/report/first-scan.ts`
- Modify: `packages/slopbrick/tests/cli/new-debt-gate.test.ts`
- Modify: `packages/slopbrick/tests/report/first-scan.test.ts`

**Interfaces:**
- Preserves the existing identity hash inputs and `evaluateNewDebt` result semantics.
- Adds optional `finding_snapshots` to the same baseline kind.
- Writes baseline revision 2; accepts revisions 1 and 2.

- [ ] **Step 1: Add failing delta and compatibility tests**

Add tests proving:

```ts
expect(compareFindingBaseline(current, baseline, cwd, 'config-a')).toMatchObject({
  status: 'compared',
  newCount: 1,
  unchangedCount: 1,
  resolvedCount: 1,
  resolvedDetails: 'available',
});

expect(compareFindingBaseline(current, baseline, cwd, 'config-b')).toMatchObject({
  status: 'incompatible',
  reason: 'config-mismatch',
});
```

Also write a literal revision-1 baseline without `finding_snapshots`, load it successfully, and assert exact counts plus `resolvedDetails: 'legacy-unavailable'`. Assert that malformed optional snapshots produce `loadDebtBaselineState(projectPath).status === 'invalid'`, while a missing file produces `missing`.

- [ ] **Step 2: Confirm the focused red state**

```bash
corepack pnpm --filter slopbrick exec vitest run tests/cli/new-debt-gate.test.ts tests/report/first-scan.test.ts --maxWorkers=1 --minWorkers=1
```

Expected: FAIL because snapshot, load-state, and comparison contracts are absent.

- [ ] **Step 3: Freeze the shared identity contract before extending persistence**

Use the `repositoryRelativeFindingLocation` and `findingIdentity` helpers extracted in Task 2. Preserve this canonical identity exactly:

```ts
JSON.stringify({
  ruleId: issue.ruleId,
  category: issue.category,
  filePath: repositoryRelativeFindingLocation(issue, cwd),
  line: issue.line,
  column: issue.column,
  message: issue.message,
});
```

Continue excluding severity. Keep the compatibility re-exports from `cli/report/debt-baseline.ts`. Add a new-debt assertion that the pre-extraction expected SHA remains unchanged for a frozen issue fixture before adding snapshot fields.

- [ ] **Step 4: Add bounded revision-2 snapshots**

Add this optional shape to `DebtBaseline`:

```ts
export interface DebtBaselineFindingSnapshot {
  identity: string;
  ruleId: string;
  category: Category;
  severity: Severity;
  aiSpecific: boolean;
  filePath?: string;
  line: number;
  column: number;
}

export interface DebtBaseline {
  kind: 'slopbrick-debt-baseline-v1';
  version: string;
  config_hash: string;
  git_head: string;
  baseline_created: string;
  baseline_revision: number;
  finding_ids: string[];
  finding_snapshots?: DebtBaselineFindingSnapshot[];
}
```

Build snapshots from active findings only, normalize paths relative to `cwd`, omit the snapshot path if normalization would escape the workspace, deduplicate by identity, sort by identity, derive `finding_ids` from the same list, and write `baseline_revision: 2`. Validate every optional field on load. Revision 1 remains valid without snapshots. Revision 2 requires snapshots whose unique identity set exactly equals `finding_ids`; reject absolute, escaping, or malformed snapshot paths.

- [ ] **Step 5: Add explicit baseline load state and pure delta**

Keep `loadDebtBaseline(projectPath): DebtBaseline | undefined` as a compatibility wrapper. Add:

```ts
export type DebtBaselineLoadState =
  | { status: 'missing' }
  | { status: 'invalid' }
  | { status: 'loaded'; baseline: DebtBaseline };

export function loadDebtBaselineState(projectPath: string): DebtBaselineLoadState;
```

In `src/report/finding-delta.ts`, implement `compareFindingBaseline` with statuses `unavailable`, `incompatible`, and `compared`. Compare sets only after config hashes match. Current findings receive `new` or `unchanged`; missing/invalid/incompatible comparisons leave them `current`. Return resolved snapshots when revision-2 details exist and only the exact resolved count for revision 1.

Refactor `evaluateNewDebt` to consume the same comparison result while preserving its current fail-closed messages, counts, `failed` values, and `slopbrick-new-debt-v1` shape.

- [ ] **Step 6: Thread the delta into `projectFirstScan`**

Map load state to these exact first-scan states:

- missing -> `unavailable` / `missing-baseline`;
- invalid -> `unavailable` / `invalid-baseline`;
- config mismatch -> `incompatible` / `config-mismatch`;
- compatible -> `compared` with new/resolved/unchanged counts.

Do not mark the baseline refreshed or compatible merely because the current invocation includes `--baseline`; persistence still happens later and only by explicit CLI authority.

- [ ] **Step 7: Run focused tests and commit**

```bash
corepack pnpm --filter slopbrick exec vitest run tests/cli/new-debt-gate.test.ts tests/report/first-scan.test.ts --maxWorkers=1 --minWorkers=1
corepack pnpm --filter slopbrick typecheck
git add packages/slopbrick/src/types/baseline.ts packages/slopbrick/src/report/finding-delta.ts packages/slopbrick/src/report/first-scan.ts packages/slopbrick/src/cli/report/debt-baseline.ts packages/slopbrick/tests/cli/new-debt-gate.test.ts packages/slopbrick/tests/report/first-scan.test.ts
git commit -m "feat(slopbrick): explain finding deltas"
```

Expected: focused tests and typecheck pass; no identity or new-debt regression.

---

## Task 4: Attach the projection to every real scan without mutating baselines

**Files:**
- Create: `packages/slopbrick/tests/cli/first-scan-pipeline.test.ts`
- Modify: `packages/slopbrick/src/cli/report/finalizeReport.ts`
- Modify: `packages/slopbrick/tests/cli/new-debt-gate.test.ts`

**Interfaces:**
- `runScan()` returns `report.firstScan` for complete, incomplete, and not-applicable outcomes.
- Complete scans read the debt baseline once.
- Only existing `program.ts` `options.baseline` code writes it.

- [ ] **Step 1: Write the real-pipeline red tests**

Use a temporary workspace and one-worker scans to prove this lifecycle:

1. first complete scan: `firstScan.status === 'complete'`, delta missing, five areas present;
2. explicit test-side `saveDebtBaseline(workspace, buildDebtBaseline(first.report, workspace, hashConfig(first.config), 'unknown'))` establishes a reviewed baseline;
3. identical scan: all active findings unchanged and zero new/resolved;
4. add one fixture file and remove one baseline fixture file: nonzero new and resolved counts;
5. change only the config hash: delta incompatible and no counts claimed;
6. ordinary scans leave the baseline file bytes and mtime unchanged;
7. partial and empty scans return no headline or actions and do not evaluate a delta.

- [ ] **Step 2: Confirm red**

```bash
corepack pnpm --filter slopbrick exec vitest run tests/cli/first-scan-pipeline.test.ts --maxWorkers=1 --minWorkers=1
```

Expected: FAIL because `finalizeReport` does not attach `firstScan`.

- [ ] **Step 3: Load once and project after validity metadata**

In `finalizeReport.ts`, immediately after `Object.assign(report, scanMetadata)`:

```ts
const configHash = hashConfig(config);
const debtBaselineState = validScan
  ? loadDebtBaselineState(cwd)
  : { status: 'missing' as const };

report.firstScan = projectFirstScan(report, {
  cwd,
  configHash,
  baselineState: debtBaselineState.status,
  ...(debtBaselineState.status === 'loaded'
    ? { baseline: debtBaselineState.baseline }
    : {}),
});
```

Reuse `debtBaselineState.baseline` for `evaluateNewDebt` when the max-new-issues gate is present. Do not call the loader a second time. Do not move or duplicate the baseline-save block in `program.ts`.

- [ ] **Step 4: Run pipeline, gate, completion, and type tests**

```bash
corepack pnpm --filter slopbrick exec vitest run tests/cli/first-scan-pipeline.test.ts tests/cli/new-debt-gate.test.ts tests/cli/scan-completion.test.ts --maxWorkers=1 --minWorkers=1
corepack pnpm --filter slopbrick typecheck
```

Expected: all focused tests and typecheck pass.

- [ ] **Step 5: Commit the pipeline attachment**

```bash
git add packages/slopbrick/src/cli/report/finalizeReport.ts packages/slopbrick/tests/cli/first-scan-pipeline.test.ts packages/slopbrick/tests/cli/new-debt-gate.test.ts
git commit -m "feat(slopbrick): attach first-scan report"
```

---

## Task 5: Replace the default terminal wall with the bounded first screen

**Files:**
- Create: `packages/slopbrick/src/report/first-scan-pretty.ts`
- Modify: `packages/slopbrick/src/report/pretty.ts`
- Modify: `packages/slopbrick/tests/report/first-scan.test.ts`
- Modify: `packages/slopbrick/tests/report/renderer-contract.test.ts`
- Modify: `packages/slopbrick/tests/report/whole-project-parity.test.ts`
- Modify: `packages/slopbrick/tests/cli/output-ux.test.ts`

**Interfaces:**
- A report with `firstScan` and `full: false` renders only the bounded first screen plus a `--full` instruction.
- `full: true` appends the legacy score/accounting sections and a complete five-area finding feed.
- A legacy report without `firstScan` uses the existing renderer unchanged.

- [ ] **Step 1: Add the owner-red-state snapshots before rendering code**

Create inline snapshots for:

- `logic/zipf-slope-anomaly` and `logic/heaps-deviation` as calibrated Code and Logic review targets;
- explicit `No safe bounded repair is available.` wording;
- missing/config-mismatched baseline with no invented delta;
- unchanged rescan;
- one new, one unchanged, and one resolved finding;
- complete zero-finding output;
- incomplete and not-applicable output with no score/action;
- four candidate rule groups truncated to three recommendations.

The complete owner-state snapshot must begin in this order:

```text
Repository Health
Scan status
Policy gate
Dimensions
Areas
Recommended actions
Rescan comparison
```

- [ ] **Step 2: Confirm renderer red**

```bash
corepack pnpm --filter slopbrick exec vitest run tests/report/first-scan.test.ts tests/report/renderer-contract.test.ts --maxWorkers=1 --minWorkers=1
```

Expected: FAIL because the bounded formatter and integration do not exist.

- [ ] **Step 3: Implement width-aware semantic text rendering**

Export:

```ts
export interface FirstScanPrettyOptions {
  columns?: number;
  gateDecision?: GateDecision;
  meanSlop?: number;
  aiSlopScore?: number;
}

export function formatFirstScanPretty(
  firstScan: FirstScanExperience,
  options: FirstScanPrettyOptions = {},
): string;
```

Use `columns ?? (process.stdout.isTTY ? process.stdout.columns : 100) ?? 100`, clamp to `[32, 120]`, wrap prose to the remaining indentation width, and hard-break overlong tokens so a 40-column test has no semantic line wider than 40 after ANSI stripping. Never use color, indentation, or a glyph as the only carrier of status. Every colored status must also contain a word such as `complete`, `passed`, `calibrated`, `manual review`, `new`, or `unchanged`.

Render no more than three recommendations. Each must show rank, area, evidence tier, reach, change, why, and action. Show all five area counts even when zero. End compact output with:

```text
Run again after a change to compare findings. Use --full for every score and finding.
```

- [ ] **Step 4: Integrate compact and full modes without breaking legacy reports**

Refactor the current body of `formatPretty` into a private detailed-report helper. Apply this dispatch:

```ts
if (!report.firstScan) return formatLegacyDetailedReport(report, options);

const firstScreen = formatFirstScanPretty(report.firstScan, {
  gateDecision: report.gateDecision,
  meanSlop: report.thresholds?.meanSlop,
  aiSlopScore: report.aiSlopScore,
});

if (options.full !== true || report.firstScan.status !== 'complete') {
  return firstScreen;
}

return `${firstScreen}\n\nFull report\n\n${formatDetailedReport(report, options)}`;
```

When `firstScan` exists, replace the final AI/engineering detail lanes with fixed-order five-area sections. Every full finding row must state evidence tier, location/context, why, change, and action; exact evidence snippets remain bounded and secret-redacted by the existing helper. Keep old AI/engineering lanes only for legacy reports without `firstScan`.

- [ ] **Step 5: Prove narrow, colorless, and screen-reader-oriented behavior**

Add tests that:

- call the formatter with `columns: 40`, strip ANSI, and assert every nonempty line is at most 40 characters;
- assert the semantic heading order shown above;
- assert `high`, `calibrated`, `manual review`, `unchanged`, and `no safe bounded repair` appear as text;
- assert compact output contains no detailed fourth action or legacy category table;
- assert `--full` contains the `Full report` marker and every active finding;
- extend the existing CLI `--no-color` run to require `Repository Health`, five areas, and no ANSI.

- [ ] **Step 6: Run human-renderer regressions**

```bash
corepack pnpm --filter slopbrick exec vitest run tests/report/first-scan.test.ts tests/report/renderer-contract.test.ts tests/report/renderer-lanes.test.ts tests/report/whole-project-parity.test.ts tests/report/v0.14.5i-ux.test.ts tests/cli/output-ux.test.ts --maxWorkers=1 --minWorkers=1
corepack pnpm --filter slopbrick typecheck
```

Expected: all focused tests and typecheck pass. Legacy fixtures retain their old lane contract; real scans use the new bounded projection.

- [ ] **Step 7: Commit the terminal UX**

```bash
git add packages/slopbrick/src/report/first-scan-pretty.ts packages/slopbrick/src/report/pretty.ts packages/slopbrick/tests/report/first-scan.test.ts packages/slopbrick/tests/report/renderer-contract.test.ts packages/slopbrick/tests/report/whole-project-parity.test.ts packages/slopbrick/tests/cli/output-ux.test.ts
git commit -m "feat(slopbrick): render actionable first scan"
```

---

## Task 6: Add additive JSON and SARIF first-scan contracts

**Files:**
- Modify: `packages/slopbrick/src/report/json.ts`
- Modify: `packages/slopbrick/src/report/sarif.ts`
- Modify: `packages/slopbrick/tests/report/json.test.ts`
- Modify: `packages/slopbrick/tests/report/sarif.test.ts`
- Modify: `packages/slopbrick/tests/report/renderer-contract.test.ts`
- Modify: `packages/slopbrick/tests/report/whole-project-parity.test.ts`

**Interfaces:**
- Complete/incomplete JSON includes optional `firstScan`; not-applicable JSON includes the score-free first-scan status explicitly.
- SARIF driver properties include a bounded first-scan summary.
- Active SARIF results include their first-scan area/evidence/change/action projection.
- Existing SARIF fingerprints, rules, evidence, levels, and score validity remain unchanged.

- [ ] **Step 1: Write machine-contract red tests**

Assert JSON contains the full typed projection and still preserves the existing `issues`, score precision, `scoreContract`, and `scoreBriefs`. For incomplete/not-applicable JSON, assert:

```ts
expect(parsed.firstScan).toMatchObject({ status: expectedStatus, headline: null });
expect(parsed.firstScan.recommendedActions).toEqual([]);
expect(parsed).not.toHaveProperty('repositoryHealth');
```

Assert SARIF driver properties contain only the bounded summary:

```ts
expect(driver.properties.firstScan).toMatchObject({
  kind: 'slopbrick-first-scan-v1',
  status: 'complete',
  headline: { label: 'Repository Health' },
  recommendationCount: 3,
  delta: { status: 'compared' },
});
```

Assert each active result has nested properties for `area`, `evidenceTier`, `change`, `actionKind`, and `repairSafety`, while a default-off result has no actionable first-scan projection. Assert `primaryLocationLineHash` remains byte-identical to the frozen expected value.

- [ ] **Step 2: Confirm machine red**

```bash
corepack pnpm --filter slopbrick exec vitest run tests/report/json.test.ts tests/report/sarif.test.ts tests/report/renderer-contract.test.ts --maxWorkers=1 --minWorkers=1
```

Expected: FAIL because not-applicable JSON and SARIF do not project first-scan metadata.

- [ ] **Step 3: Extend JSON additively**

Complete and incomplete JSON already spread `ProjectReport`; retain that path. Add `firstScan` to the not-applicable envelope only when present. Do not put headline values back into incomplete or not-applicable output through the nested projection.

- [ ] **Step 4: Extend SARIF without changing fingerprints**

Pair current SARIF results with `report.firstScan.findings` through the projector's guaranteed active-issue order; default-off issues do not advance the first-scan cursor. Before attaching metadata, require matching `ruleId`, line, and column and omit the additive projection on any mismatch. Do not guess a workspace root or recompute identity from an unknown cwd. Add optional nested first-scan result properties. Add a driver summary containing status, headline, five area counts, recommendation count, and delta summary; do not duplicate all findings at driver level. Resolved details may remain in the delta summary because no current SARIF result exists for a resolved finding.

Keep `buildFingerprint` unchanged. Keep all existing source-byte-region, help URI, rule metadata, score, gate, and evidence logic unchanged.

- [ ] **Step 5: Run machine and parity regressions**

```bash
corepack pnpm --filter slopbrick exec vitest run tests/report/json.test.ts tests/report/sarif.test.ts tests/report/renderer-contract.test.ts tests/report/whole-project-parity.test.ts tests/cli/large-json-output.test.ts --maxWorkers=1 --minWorkers=1
corepack pnpm --filter slopbrick typecheck
```

Expected: all tests and typecheck pass; large JSON remains parseable and ANSI-free.

- [ ] **Step 6: Commit machine compatibility**

```bash
git add packages/slopbrick/src/report/json.ts packages/slopbrick/src/report/sarif.ts packages/slopbrick/tests/report/json.test.ts packages/slopbrick/tests/report/sarif.test.ts packages/slopbrick/tests/report/renderer-contract.test.ts packages/slopbrick/tests/report/whole-project-parity.test.ts
git commit -m "feat(slopbrick): expose first-scan contract"
```

---

## Task 7: Prove the real CLI scan-to-rescan journey

**Files:**
- Modify: `packages/slopbrick/tests/cli/first-scan-pipeline.test.ts`
- Modify: `packages/slopbrick/tests/cli/output-ux.test.ts`
- Modify: `packages/slopbrick/tests/cli/scan-completion.test.ts`

**Interfaces:**
- Proves the package-local CLI, not only pure formatters.
- Uses temporary workspaces; never refreshes the repository's own baseline.

- [ ] **Step 1: Add a subprocess walkthrough fixture**

Create a temporary project with deterministic active findings covering exact evidence and review-only evidence. Run the package-local bin with:

```ts
['scan', '--workspace', workspace, '--threads', '1', '--no-telemetry', '--no-color']
```

If Commander routes `scan` implicitly in the current test helper, preserve the established invocation shape there. Assert exit semantics remain the existing gate decision, stdout begins with the bounded Repository Health screen, recommendations are at most three, and stderr does not contain a baseline-save message.

- [ ] **Step 2: Prove explicit baseline and unchanged rescan**

Run once with `--baseline` in the temporary workspace, record the baseline bytes, then run unchanged without `--baseline`. Assert:

- the second output says `unchanged` and shows exact counts;
- baseline bytes and mtime are unchanged by the second run;
- no source file changed;
- `--full` exposes every active finding and the five-area annotations;
- `--format json` parses and carries the same delta counts;
- `--format sarif` parses and carries the same status and per-result metadata.

- [ ] **Step 3: Prove incomplete output remains score-free**

Reuse the existing partial-scan fixture and assert the first-scan section says `incomplete`, contains accounting and retry guidance, and contains no Repository Health numeric value, dimension, recommendation, or passing policy claim.

- [ ] **Step 4: Run the end-to-end focused matrix**

```bash
corepack pnpm --filter slopbrick exec vitest run tests/cli/first-scan-pipeline.test.ts tests/cli/output-ux.test.ts tests/cli/scan-completion.test.ts tests/cli/gate-decision-contract.test.ts tests/cli/new-debt-gate.test.ts --maxWorkers=1 --minWorkers=1
```

Expected: all focused CLI tests pass with one worker.

- [ ] **Step 5: Commit end-to-end proof**

```bash
git add packages/slopbrick/tests/cli/first-scan-pipeline.test.ts packages/slopbrick/tests/cli/output-ux.test.ts packages/slopbrick/tests/cli/scan-completion.test.ts
git commit -m "test(slopbrick): prove first-scan journey"
```

---

## Task 8: Document the contract and close SB-UX-001 truthfully

**Files:**
- Modify: `README.md`
- Modify: `ROADMAP.md`
- Modify: `packages/slopbrick/README.md`
- Modify: `packages/slopbrick/CHANGELOG.md`
- Modify: `docs/execution/index.json`
- Modify: `docs/execution/STATUS.md`
- Modify: `docs/execution/CHANGELOG.md`
- Modify: `docs/execution/plans/SB-UX-001-first-scan.md`
- Modify: `docs/execution/plans/TEL-001-local-outcomes.md`
- Create: `docs/execution/evidence/SB-UX-001-first-scan.md`

**Interfaces:**
- Produces execution-index revision 26 only after all implementation and verification gates pass.
- Moves `SB-UX-001` from `in_progress` to `done` and releases one WIP slot.
- Leaves `TEL-001` ready as the next implementation priority and `VAL-001` active.

- [ ] **Step 1: Update user documentation**

Document in both READMEs:

- default `scan` is a bounded first screen with one Repository Health headline, five areas, and at most three actions;
- `--full` exposes all scores and findings;
- evidence labels mean deterministic finding evidence, measured rule behavior, or advisory review—not proof of authorship;
- only finding-bound repairs are called safe;
- `scan --baseline` is an explicit reviewed checkpoint, ordinary rescans never refresh it, and compatible rescans show new/resolved/unchanged;
- JSON and SARIF expose the additive `firstScan` contract.

Add a `0.45.0` changelog entry under the existing unreleased heading. Do not add a release date or claim publication.

- [ ] **Step 2: Write the evidence receipt from actual outputs**

Create `docs/execution/evidence/SB-UX-001-first-scan.md` with:

- exact implementation commit range from `git log --format=%H`;
- type contract and five-area mapping;
- owner-red-state snapshot disposition;
- focused test commands and exact pass counts;
- recursive gate commands and outcomes;
- package-local self-scan command, selected/analyzed/failure counts, action count, baseline state, score, gate, and exit;
- proof that no repository baseline was refreshed;
- proof that no score, threshold, rule, CAL-001 row, corpus admission, tag, release, publish, or deploy changed.

Record only command output observed during this task. Do not use prospective hashes or invented counts.

- [ ] **Step 3: Run focused product gates**

```bash
corepack pnpm --filter slopbrick exec vitest run \
  tests/report/first-scan.test.ts \
  tests/report/json.test.ts \
  tests/report/sarif.test.ts \
  tests/report/renderer-contract.test.ts \
  tests/report/renderer-lanes.test.ts \
  tests/report/whole-project-parity.test.ts \
  tests/cli/first-scan-pipeline.test.ts \
  tests/cli/output-ux.test.ts \
  tests/cli/scan-completion.test.ts \
  tests/cli/gate-decision-contract.test.ts \
  tests/cli/new-debt-gate.test.ts \
  --maxWorkers=1 --minWorkers=1
corepack pnpm --filter slopbrick typecheck
```

Expected: all focused tests and typecheck pass.

- [ ] **Step 4: Run the package and recursive release-equivalent gates serially**

```bash
SLOPBRICK_VITEST_WORKERS=1 corepack pnpm --filter slopbrick test
corepack pnpm -r lint
corepack pnpm -r typecheck
SLOPBRICK_VITEST_WORKERS=1 corepack pnpm -r test
corepack pnpm -r build
```

Expected: every source-level gate passes. If a known host-sensitive test fails, isolate and record it honestly; do not call the gate green until the source contract is proved in the supported environment.

- [ ] **Step 5: Run the mandated package-local self-scan without baseline mutation**

Before and after the scan, hash `.slopbrick/cache/debt-baseline.json` if it exists. Then run:

```bash
corepack pnpm --filter slopbrick exec -- node ./bin/slopbrick.js scan --workspace . --threads 1 --no-telemetry --no-color
```

Expected: complete scan, bounded first screen, no more than three recommendations, explicit compatible/missing/incompatible baseline state, and an unchanged baseline hash. The configured policy exit may pass or fail based on the unchanged detector truth; record it rather than changing policy.

- [ ] **Step 6: Run the owner comprehension checkpoint**

Present the exact ANSI-free first screen from Step 5 to the repository owner. Ask only whether the first recommended action is identifiable and whether its evidence/repair boundary is understandable. Record the owner's literal disposition in the SB-UX evidence receipt. Add a new `VAL-001` row only if the owner chooses to treat this as another owner-controlled walkthrough; do not infer a row, a fix, or usefulness from test output.

If the owner cannot identify the recommendation or does not respond, keep `SB-UX-001` `in_progress`, record the open acceptance gate, and do not execute the status-close step. No participant or target-count requirement is introduced.

- [ ] **Step 7: Close the execution control plane**

Only after Steps 3–6 are green, set revision `26`, mark `SB-UX-001` done, add the evidence receipt and this detailed plan to its evidence, and set its next action to preserve the contract while handing the typed outcome boundary to `TEL-001`. Update `TEL-001` next action to model the first-scan finding/action/change fields without source or repository identity.

Update `ROADMAP.md`, `STATUS.md`, the two plan files, and append changelog revision 26. State implementation WIP `1/2` with only `VAL-001` active and `TEL-001` ready next. Do not mark `VAL-001` done: one no-fix row still does not satisfy its repeated useful fix/rescan exit gate.

- [ ] **Step 8: Validate docs and repository diff**

```bash
corepack pnpm plans:validate
node --test scripts/validate-execution-docs.test.mjs
git diff --check
git status --short
```

Expected: 16 plans valid, all execution-doc tests pass, no whitespace errors, and only task-owned tracked changes plus the preserved user-owned untracked paths.

- [ ] **Step 9: Commit the closeout**

```bash
git add README.md ROADMAP.md packages/slopbrick/README.md packages/slopbrick/CHANGELOG.md docs/execution/index.json docs/execution/STATUS.md docs/execution/CHANGELOG.md docs/execution/plans/SB-UX-001-first-scan.md docs/execution/plans/TEL-001-local-outcomes.md docs/execution/evidence/SB-UX-001-first-scan.md
git commit -m "docs(slopbrick): close first-scan UX"
```

---

## Final Verification Matrix

| Contract | Proof |
| --- | --- |
| Five exhaustive areas | `Record<Category, FirstScanAreaId>` compile check plus all-category unit fixture |
| One transparent headline | Snapshot copies canonical Repository Health inputs and separately labels AI Slop policy |
| Evidence honesty | Exact/omitted -> deterministic; measured metadata -> calibrated with non-authorship claim; absent -> advisory |
| Safe action boundary | Only bound fixes are finding-bound; owner statistical findings say no safe bounded repair |
| Three-action limit | Four-group fixture deterministically emits exactly three |
| Full report retained | Default compact output points to `--full`; full mode contains every active finding |
| New/resolved/unchanged | Revision-2 baseline integration plus revision-1 fallback tests |
| No auto-refresh | Baseline byte hash and mtime unchanged across ordinary scans |
| Invalid scan safety | Incomplete/not-applicable snapshots contain no headline, recommendation, comparison count, or passing score claim |
| JSON compatibility | Existing fields preserved; optional `firstScan` added; invalid scans remain score-free |
| SARIF compatibility | Existing fingerprints/levels/evidence preserved; additive driver/result properties only |
| Narrow terminal | ANSI-stripped 40-column snapshot has no over-width semantic line |
| Colorless output | Real `--no-color` subprocess has no ANSI and retains textual status labels |
| Screen-reader orientation | Heading order and every status/action are expressed in words, never color/glyph alone |
| Owner comprehension | Owner explicitly identifies the first recommendation and understands its evidence/repair boundary from the real self-scan first screen |
| Detector truth unchanged | Full tests, self-scan receipt, and no rule/score/config corpus diff |
| Release boundary | No tag, GitHub Release, npm publish, or website deployment |

## Rollback Boundaries

Rollback in reverse commit order:

1. Revert terminal and machine presentation while retaining optional typed projection if comprehension regresses.
2. Revert pipeline attachment while retaining revision-2 baseline reader compatibility if a scan lifecycle regression appears.
3. Revert revision-2 baseline writes but keep revision-1 reads; never delete a user's baseline.
4. Revert the optional public type only if no produced report contains it.

At every boundary, leave detector findings, score math, gate semantics, rule state, corpus evidence, and public release state unchanged.
