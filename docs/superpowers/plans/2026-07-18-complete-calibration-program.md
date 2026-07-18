# Complete SlopBrick Calibration Program Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give every current SlopBrick rule one claim-matched, owner-reviewed policy disposition while preserving non-admission, separating quality usefulness from origin association, and showing exact evidence provenance in the first-scan experience.

**Architecture:** Implement `CAL-002-v1` entirely inside SlopBrick. Build a hash-bound 119-rule catalog, resolve origin-lane ownership, collect deterministic or blinded quality evidence, reduce both lanes independently, and merge them through one fail-closed matrix/application gate. Ship one additive current-policy artifact beside the unchanged historical signal-strength data; the scanner uses it for defaults, score eligibility, and provenance while retaining explicit local opt-in.

**Tech Stack:** TypeScript, Node.js 22/24, Vitest, Ajv 2020 in tests, Commander-free package-local scripts, canonical JSON/SHA-256 helpers, existing Corpus v1 source adapters, Markdown execution control, and `corepack pnpm` workspace gates.

## Global Constraints

- Start from design commit `1def91feb1b436305c49b924141220d6ca106c8d` and execution-index revision 25.
- Checkpoint the completed SB-UX documentation before changing calibration state. Never stage `.superpowers/sdd/progress.md` or user-owned untracked paths.
- Move `VAL-001` from `in_progress` to `ready`, create umbrella `CAL-002` as `in_progress`, and keep `SB-UX-001` `in_progress`; implementation WIP remains exactly `2/2`.
- Keep the current 119-rule catalog as the frozen application target. Catalog drift aborts every reuse, merge, and apply operation.
- Keep quality usefulness and origin association in separate lanes, labels, denominators, metrics, and claim ceilings.
- Treat Corpus v1 publisher polarity as internal origin evidence only. It is not witnessed authorship, code-quality ground truth, public redistribution authority, or production admission.
- Keep every remaining origin rule default-off. No origin metric can enable a rule under `CAL-002-v1`.
- A transferred origin row enters quality only through an explicit owner decision and quality evidence; it never belongs to both lane denominators.
- Use exactly four quality-review labels: `actionable-defect`, `useful-no-safe-fix`, `not-useful`, and `cannot-determine`.
- Begin contextual/statistical review at 30 finding and 30 matched-control items per rule. Expand an inconclusive rule to at most 100 items per arm.
- Exclude `cannot-determine` from binary denominators and report it separately.
- `quality-advisory` findings may remain visible, but they cannot affect scores or gates and cannot claim a safe repair.
- `default-off`, `insufficient-evidence`, `retired`, and non-admitted origin rows remain audit-only unless a user explicitly opts in. Explicit opt-in does not upgrade evidence provenance.
- Add current provenance; never overwrite or relabel historical signal-strength metrics as current.
- Keep `@usebrick/core`, Core schemas, `STRUCTURE_SCHEMA_VERSION`, package versions, score formulas, thresholds, and release state unchanged.
- Keep raw source, source snippets, absolute paths, repository identities, and reviewer identity out of durable receipts. Use only `reviewerAuthority: 'repository-owner'`.
- Local review state lives under `.slopbrick/calibration/cal-002/`; immutable path-free receipts live under `docs/execution/evidence/artifacts/cal-002/`.
- Every writer uses exclusive creation or atomic rename. Failed verification leaves the shipped policy artifact byte-identical.
- Use one worker for source scanning and `--maxWorkers=1 --minWorkers=1` for focused Vitest runs. Run final recursive gates serially.
- Do not acquire network data, recruit participants, refresh a score/debt baseline, push, tag, publish, or deploy under this plan.

---

## Locked Evidence and Policy Contract

### Quality evidence classes

The starting 47 quality rules are partitioned exactly once:

```ts
export const CAL002_STATISTICAL_RULE_IDS = [
  'logic/heaps-deviation',
  'logic/math-variable-name-entropy',
  'logic/zipf-slope-anomaly',
  'typo/math-button-label-uniformity',
] as const;

export const CAL002_CONTEXTUAL_RULE_IDS = [
  'component/multiple-components-per-file',
  'java/suspicious-implementation',
  'layout/gap-monopoly',
  'layout/spacing-grid',
  'logic/boundary-violation',
  'perf/css-bloat',
  'product/terminology-drift',
  'rb/n-plus-one-query',
  'visual/inline-style-dominance',
  'visual/radius-scale-violation',
  'visual/spacing-scale-violation',
] as const;
```

The remaining 32 starting quality IDs are `deterministic-or-standards`. A catalog test computes that remainder and asserts counts `{ deterministic: 32, contextual: 11, statistical: 4 }`; no rule may be inferred from its path at runtime.

The exact deterministic/standards set is:

```ts
export const CAL002_DETERMINISTIC_RULE_IDS = [
  'context/import-path-mismatch',
  'cs/async-without-await',
  'cs/empty-catch-block',
  'cs/sql-string-interpolation',
  'docs/broken-link',
  'docs/stale-function-reference',
  'docs/stale-package-reference',
  'dup/identical-block',
  'java/lost-stack-trace',
  'java/sql-string-concat',
  'java/thread-sleep-in-loop',
  'kt/coroutine-cancellation-missing',
  'kt/force-unwrap',
  'kt/global-coroutine-scope',
  'kt/string-template-injection',
  'logic/key-prop-missing',
  'perf/cls-image',
  'php/empty-catch',
  'php/sql-injection',
  'rb/exception-swallowing',
  'rb/sql-string-concat',
  'security/eval',
  'security/exposed-env-var',
  'security/localstorage-token',
  'security/missing-auth-check',
  'security/public-admin-route',
  'security/target-blank-no-noopener',
  'security/unsafe-html-render',
  'typo/placeholder-text',
  'wcag/focus-appearance',
  'wcag/focus-obscured',
  'wcag/missing-alt',
] as const;
```

An owner transfer from origin must choose one closed reason:

```ts
export type CAL002TransferReason =
  | 'standards-or-contract-quality-claim'
  | 'contextual-defect-quality-claim'
  | 'statistical-review-utility-claim';
```

The reason deterministically selects the destination evidence class.

### Adaptive review reducer

For each contextual/statistical rule and each arm:

```ts
const useful = actionableDefect + usefulNoSafeFix;
const determinate = useful + notUseful;
const determinateFloor = Math.ceil(requested * 0.8);
```

Use a two-sided 95% Wilson interval. At 30/30, expand when either arm has fewer than 24 determinate labels or when the result is not terminal. At 100/100, unresolved evidence becomes `insufficient-evidence`.

Define the review-utility bar as both `findingUseful.lower >= 0.50` and `findingUseful.lower > controlUseful.upper`. A rule is control-dominated when `findingUseful.upper <= controlUseful.lower`. This makes the matched-control arm decision-bearing rather than decorative.

Terminal outcomes are:

| Evidence class | Condition | Outcome |
| --- | --- | --- |
| deterministic/standards | Every declared positive/negative oracle passes, at least five path-free real-source controls from five families pass, and no adversarial case fails | `default-on` |
| deterministic/standards | Any positive, negative, standards, or adversarial oracle fails | `default-off` |
| contextual | Finding useful-rate Wilson lower bound >= 0.70 and matched-control useful-rate upper bound <= 0.30 | `default-on` |
| contextual | Finding useful-rate Wilson upper bound < 0.50 or the rule is control-dominated | `default-off` |
| contextual | Review-utility bar passes but the default-on bar still misses after the final round | `quality-advisory` |
| statistical | Review-utility bar passes | `quality-advisory` |
| statistical | Finding useful-rate Wilson upper bound < 0.50 or the rule is control-dominated | `default-off` |
| any quality class | Required reach, determinate count, or final certainty is unavailable | `insufficient-evidence` |

`retired` is only an explicit owner disposition for a duplicate/obsolete rule. No statistical rule can become `default-on` under this protocol.

### Runtime effects

| Matrix outcome | Enabled by default | Score/gate eligible | First-scan provenance |
| --- | --- | --- | --- |
| `default-on` with deterministic evidence | yes | yes | deterministic finding evidence, with current policy version |
| `default-on` with contextual evidence | yes | yes | current quality-calibrated |
| `quality-advisory` | yes | no | advisory review utility |
| origin `default-off` | no | only after explicit local opt-in | internal origin-calibrated, non-admitted |
| quality `default-off` | no | only after explicit local opt-in | current quality result with failed claim bar |
| `insufficient-evidence` | no | only after explicit local opt-in | insufficient evidence |
| `retired` | no | no | retired policy |
| no applied CAL-002 row | preserve legacy behavior | preserve legacy behavior | legacy-calibrated or advisory |

---

## File Map

### Calibration implementation

- `packages/slopbrick/src/calibration/cal-002/contracts.ts` — version constants, shared discriminated unions, validators, and canonical identities.
- `packages/slopbrick/src/calibration/cal-002/catalog.ts` — exact 119-rule projection, evidence-class partition, and CAL-001 row reconciliation.
- `packages/slopbrick/src/calibration/cal-002/oracles.ts` — deterministic/standards declarations and oracle receipt reducer.
- `packages/slopbrick/src/calibration/cal-002/quality-sampling.ts` — path-free observations, hash ranking, matched controls, blinding, and expansion.
- `packages/slopbrick/src/calibration/cal-002/review-session.ts` — pure resumable state machine and immutable review receipt.
- `packages/slopbrick/src/calibration/cal-002/quality-metrics.ts` — Wilson intervals, determinate accounting, adaptive decisions, and quality outcomes.
- `packages/slopbrick/src/calibration/cal-002/origin.ts` — CAL-001 hash gate, owner lane decisions, reuse/rerun disposition, and origin receipt.
- `packages/slopbrick/src/calibration/cal-002/matrix.ts` — exact-coverage lane merge and non-admitting final matrix.
- `packages/slopbrick/src/calibration/cal-002/application.ts` — dry-run projection, artifact generation, catalog drift checks, and atomic apply receipt.
- `packages/slopbrick/src/calibration/cal-002/artifact-io.ts` — canonical reads, private atomic state writes, exclusive immutable writes, and path-safety checks.
- `packages/slopbrick/src/calibration/cal-002/schemas/*.schema.json` — SlopBrick-local JSON Schemas for catalog, assignment, review, metrics, origin, matrix, and policy artifacts.
- `packages/slopbrick/src/calibration/cal-002/schemas/index.json` — exact local schema registry.
- `packages/slopbrick/scripts/cal/cal-002.ts` — package-local `catalog`, `classify-origin`, `reduce-oracles`, `prepare-quality`, `review-quality`, `reduce-quality`, `verify-origin`, `matrix`, `approve-matrix`, and `apply` dispatcher.
- `packages/slopbrick/package.json` — `cal:complete` script invoking the dispatcher through `node --import tsx`.

### Runtime policy and product integration

- `packages/slopbrick/src/rules/current-evidence-policy.json` — generated, complete, applied 119-row policy/provenance artifact.
- `packages/slopbrick/src/rules/current-evidence-policy.ts` — static import, strict validation, default/score/provenance accessors.
- `packages/slopbrick/src/rules/signal-strength.ts` — legacy metrics unchanged; applied current defaults override only policy selection.
- `packages/slopbrick/src/rules/explanation.ts` — current/legacy evidence and claim-ceiling explanation.
- `packages/slopbrick/src/cli/explain.ts` — render current policy and historical metrics as separate evidence layers.
- `packages/slopbrick/src/cli/commands/calibration.ts` — label the existing v10 table historical/internal and add current policy outcome.
- `packages/slopbrick/src/cli/commands/rules.ts` — label signal-strength columns historical and expose current policy without conflation.
- `packages/slopbrick/src/cli/effective-issues.ts` — visible advisory versus score-bearing projection.
- `packages/slopbrick/src/cli/scan.ts` — current policy attachment and truthful suppression copy.
- `packages/slopbrick/src/engine/worker.ts` — exclude default-off origin rows from composite scoring unless explicitly enabled.
- `packages/slopbrick/src/types/first-scan.ts` — expanded evidence provenance discriminants.
- `packages/slopbrick/src/report/first-scan.ts` — policy-backed finding provenance and ranking.
- `packages/slopbrick/src/report/first-scan-pretty.ts` — exact provenance/date/claim-ceiling rendering.
- `packages/slopbrick/src/report/pretty.ts` — preserve the same provenance in full terminal detail.
- `packages/slopbrick/src/report/markdown.ts` — replace unqualified calibration labels.
- `packages/slopbrick/src/report/html/sections.ts` — render current versus legacy provenance.
- `packages/slopbrick/src/report/html/utils.ts` — policy-aware evidence badges.
- `packages/slopbrick/src/report/sarif.ts` — additive provenance fields on first-scan result properties.
- `packages/slopbrick/scripts/generate-rule-catalog.ts` — generate current policy columns while retaining explicitly historical signal metrics.

### Tests

- `packages/slopbrick/tests/calibration/cal-002-contracts.test.ts`
- `packages/slopbrick/tests/calibration/cal-002-catalog.test.ts`
- `packages/slopbrick/tests/calibration/cal-002-oracles.test.ts`
- `packages/slopbrick/tests/calibration/cal-002-quality-sampling.test.ts`
- `packages/slopbrick/tests/calibration/cal-002-review-session.test.ts`
- `packages/slopbrick/tests/calibration/cal-002-quality-metrics.test.ts`
- `packages/slopbrick/tests/calibration/cal-002-origin.test.ts`
- `packages/slopbrick/tests/calibration/cal-002-matrix.test.ts`
- `packages/slopbrick/tests/calibration/cal-002-application.test.ts`
- `packages/slopbrick/tests/calibration/cal-002-cli.test.ts`
- `packages/slopbrick/tests/rules/current-evidence-policy.test.ts`
- `packages/slopbrick/tests/generated-docs-truth.test.ts`
- Existing first-scan, renderer, scan-accounting, signal-strength, explanation, composite-scoring, and dist-bundle tests listed in Task 11.

### Control plane and evidence

- `ROADMAP.md`
- `README.md`
- `CONTRIBUTING.md`
- `docs/ARCHITECTURE.md`
- `docs/calibration/README.md`
- `docs/maths.md`
- `docs/methodology.md`
- `docs/rules.md`
- `packages/slopbrick/README.md`
- `packages/slopbrick/CHANGELOG.md`
- `packages/slopbrick/CONTRIBUTING.md`
- `packages/slopbrick/EXAMPLES.md`
- `packages/slopbrick/ROADMAP.md`
- `packages/slopbrick/docs/MCP.md`
- `packages/slopbrick/docs/architecture.md`
- `packages/slopbrick/docs/calibration/README.md`
- `packages/slopbrick/docs/language-support-matrix.md`
- `packages/slopbrick/docs/rule-catalog.md`
- `packages/slopbrick/docs/scoring-explained.md`
- `packages/slopbrick/docs/scoring-runbook.md`
- `packages/website/docs/blog/lifecycle-narrative.md`
- `docs/execution/index.json`
- `docs/execution/STATUS.md`
- `docs/execution/CHANGELOG.md`
- `docs/execution/plans/CAL-002-complete-calibration.md`
- `docs/execution/plans/SB-UX-001-first-scan.md`
- `docs/execution/plans/VAL-001-owner-validation.md`
- `docs/execution/plans/TEL-001-local-outcomes.md`
- `docs/execution/evidence/CAL-002-complete-calibration.md`
- `docs/execution/evidence/SB-UX-001-first-scan.md`
- `docs/execution/evidence/artifacts/cal-002/*.json`

---

### Task 1: Checkpoint the completed SB-UX documentation boundary

**Files:**
- Modify: `README.md`
- Modify: `packages/slopbrick/README.md`
- Modify: `packages/slopbrick/CHANGELOG.md`
- Create: `docs/execution/evidence/SB-UX-001-first-scan.md`

**Interfaces:**
- Consumes product implementation through `8e81ef252ce384e889891ca64c487f742e4d3cd1` and the already captured owner checkpoint.
- Produces one documentation-only commit without changing revision 25 or closing `SB-UX-001`.

- [ ] **Step 1: Reconfirm the pending documentation scope**

```bash
git diff -- README.md packages/slopbrick/README.md packages/slopbrick/CHANGELOG.md
git status --short docs/execution/evidence/SB-UX-001-first-scan.md .superpowers/sdd/progress.md
```

Expected: only the three tracked SB-UX documentation changes plus the untracked SB-UX evidence receipt are selected; `.superpowers/sdd/progress.md` remains excluded.

- [ ] **Step 2: Verify the captured evidence**

```bash
rg -q "Candidate HEAD.*8e81ef252" docs/execution/evidence/SB-UX-001-first-scan.md
rg -q "275 / 275" docs/execution/evidence/SB-UX-001-first-scan.md
rg -q "Disposition: `PARTIAL`" docs/execution/evidence/SB-UX-001-first-scan.md
git diff --check
```

Expected: all checks pass; the receipt does not claim SB-UX completion, rule calibration, release, or deployment.

- [ ] **Step 3: Commit only the checkpoint files**

```bash
git add README.md packages/slopbrick/README.md packages/slopbrick/CHANGELOG.md docs/execution/evidence/SB-UX-001-first-scan.md
git diff --cached --name-only
git commit -m "docs(slopbrick): checkpoint first-scan review"
```

Expected staged paths: exactly the four listed files.

### Task 2: Enter CAL-002 in the canonical execution control plane

**Files:**
- Create: `docs/execution/plans/CAL-002-complete-calibration.md`
- Create: `docs/execution/evidence/CAL-002-complete-calibration.md`
- Modify: `ROADMAP.md`
- Modify: `docs/execution/index.json`
- Modify: `docs/execution/STATUS.md`
- Modify: `docs/execution/CHANGELOG.md`
- Modify: `docs/execution/plans/SB-UX-001-first-scan.md`
- Modify: `docs/execution/plans/VAL-001-owner-validation.md`
- Modify: `docs/execution/plans/TEL-001-local-outcomes.md`

**Interfaces:**
- Consumes revision 25 and approved design `1def91feb`.
- Produces revision 26 with active WIP `SB-UX-001` plus `CAL-002`, and `VAL-001: ready`.

- [ ] **Step 1: Add the bounded CAL-002 plan**

Use all validator-required headings. Lock this state header and outcome:

```markdown
# CAL-002 — Complete claim-matched rule calibration

- **Status:** `in_progress`
- **Priority:** 7
- **Track / lane:** implementation / calibration
- **Owner:** calibration maintainers and repository owner
- **Updated:** 2026-07-18

## Outcome

Resolve every current rule through separate quality and origin evidence lanes,
apply one reviewed non-admitting 119-row policy atomically, and expose precise
current-versus-legacy provenance in the first-scan contract.
```

Set `requires: CAL-001`, `benefitsFrom: SB-UX-001`, evidence destination `docs/execution/evidence/CAL-002-complete-calibration.md`, and next action to red-test the local CAL-002 contracts.

- [ ] **Step 2: Update the index atomically**

Set revision `26`; insert CAL-002 after SB-UX with priority 7; increment the old priorities 7–15 to 8–16. Set:

```json
{
  "id": "CAL-002",
  "title": "Complete claim-matched rule calibration",
  "track": "implementation",
  "lane": "calibration",
  "horizon": "next",
  "status": "in_progress",
  "priority": 7,
  "path": "docs/execution/plans/CAL-002-complete-calibration.md",
  "dependencies": {
    "requires": ["CAL-001"],
    "externalGates": [],
    "benefitsFrom": ["SB-UX-001"],
    "conflictsWith": []
  },
  "nextAction": {
    "text": "Write the red CAL-002 catalog and local-schema contract tests.",
    "verify": "corepack pnpm --filter slopbrick exec vitest run tests/calibration/cal-002-contracts.test.ts tests/calibration/cal-002-catalog.test.ts --maxWorkers=1 --minWorkers=1",
    "evidencePath": "docs/execution/evidence/CAL-002-complete-calibration.md"
  },
  "evidence": [
    "docs/superpowers/specs/2026-07-18-complete-calibration-program-design.md",
    "docs/superpowers/plans/2026-07-18-complete-calibration-program.md"
  ]
}
```

Change `VAL-001.status` to `ready`. Add CAL-002 to `SB-UX-001.dependencies.benefitsFrom`; do not add an unmet `requires` edge to an active plan. Keep TEL-001 ready.

- [ ] **Step 3: Reconcile human-readable projections**

Update ROADMAP, STATUS, the three affected plans, and append changelog revision 26 with these exact facts:

- CAL-002 starts from the approved design and detailed plan;
- VAL-001 returns to ready while retaining RUN-001;
- SB-UX-001 stays active with CAL-002 as its evidence-provenance closeout gate;
- WIP remains `2/2`: SB-UX-001 and CAL-002;
- REL-001 and every release boundary remain unchanged;
- no rule, score, source, baseline, admission, release, or deployment changes in this revision.

- [ ] **Step 4: Validate and commit the control plane**

```bash
corepack pnpm plans:validate
node --test scripts/validate-execution-docs.test.mjs
git diff --check
git add ROADMAP.md docs/execution/index.json docs/execution/STATUS.md docs/execution/CHANGELOG.md docs/execution/plans/CAL-002-complete-calibration.md docs/execution/plans/SB-UX-001-first-scan.md docs/execution/plans/VAL-001-owner-validation.md docs/execution/plans/TEL-001-local-outcomes.md docs/execution/evidence/CAL-002-complete-calibration.md
git commit -m "docs(execution): start complete calibration"
```

Expected: 17 indexed plans, all validator tests pass, and implementation WIP is `2/2`.

### Task 3: Define versioned local contracts and freeze the 119-rule catalog

**Files:**
- Create: `packages/slopbrick/src/calibration/cal-002/contracts.ts`
- Create: `packages/slopbrick/src/calibration/cal-002/catalog.ts`
- Create: `packages/slopbrick/src/calibration/cal-002/schemas/index.json`
- Create: `packages/slopbrick/src/calibration/cal-002/schemas/cal-002-catalog.schema.json`
- Create: `packages/slopbrick/src/calibration/cal-002/schemas/cal-002-assignment.schema.json`
- Create: `packages/slopbrick/src/calibration/cal-002/schemas/cal-002-review-receipt.schema.json`
- Create: `packages/slopbrick/src/calibration/cal-002/schemas/cal-002-quality-metrics.schema.json`
- Create: `packages/slopbrick/src/calibration/cal-002/schemas/cal-002-origin-receipt.schema.json`
- Create: `packages/slopbrick/src/calibration/cal-002/schemas/cal-002-final-matrix.schema.json`
- Create: `packages/slopbrick/src/calibration/cal-002/schemas/cal-002-matrix-approval.schema.json`
- Create: `packages/slopbrick/src/calibration/cal-002/schemas/slopbrick-rule-evidence-policy.schema.json`
- Create: `packages/slopbrick/tests/calibration/cal-002-contracts.test.ts`
- Create: `packages/slopbrick/tests/calibration/cal-002-catalog.test.ts`

**Interfaces:**
- Produces `buildCAL002Catalog(input): CAL002CatalogResult` and strict validators for every later artifact.
- Consumes `RuleRegistry`, effective legacy defaults, and the exact CAL-001 matrix rows supplied by the caller.

- [ ] **Step 1: Write red schema and catalog tests**

Assert exact version strings, schema registry coverage, rejection of extra properties, and catalog counts:

```ts
expect(result.catalog).toMatchObject({
  version: 'cal-002-catalog-v1',
  protocolVersion: 'CAL-002-v1',
  counts: {
    total: 119,
    startingQuality: 47,
    startingOrigin: 72,
    ownerReviewRequired: 40,
    deterministic: 32,
    contextual: 11,
    statistical: 4,
  },
  admitted: false,
  applied: false,
});
expect(new Set(result.catalog.rows.map((row) => row.ruleId)).size).toBe(119);
expect(() => buildCAL002Catalog(driftedInput)).toThrow(/CAL-001.*catalog/i);
```

Use Ajv 2020 to compile every schema named in the local index and validate one complete fixture plus one additional-property rejection per schema.

- [ ] **Step 2: Run tests and confirm red**

```bash
corepack pnpm --filter slopbrick exec vitest run tests/calibration/cal-002-contracts.test.ts tests/calibration/cal-002-catalog.test.ts --maxWorkers=1 --minWorkers=1
```

Expected: FAIL because the CAL-002 modules and local schemas do not exist.

- [ ] **Step 3: Add shared discriminants and validators**

Define these exact unions in `contracts.ts`:

```ts
export const CAL002_PROTOCOL_VERSION = 'CAL-002-v1' as const;
export type CAL002Lane = 'quality' | 'origin';
export type CAL002EvidenceClass = 'deterministic-or-standards' | 'contextual-quality' | 'statistical-review-utility';
export type CAL002ReviewLabel = 'actionable-defect' | 'useful-no-safe-fix' | 'not-useful' | 'cannot-determine';
export type CAL002OriginDisposition = 'hold-origin-default-off' | 'transfer-to-quality' | 'retire';
export type CAL002PolicyOutcome = 'default-on' | 'default-off' | 'quality-advisory' | 'insufficient-evidence' | 'retired';
export type CAL002ClaimCeiling =
  | 'deterministic-defect'
  | 'quality-usefulness'
  | 'review-target-utility'
  | 'internal-origin-association'
  | 'insufficient-evidence'
  | 'retired';
```

Implement `assertSha256`, `assertCommitSha`, unique-row checks, exact-key checks, and `canonicalArtifact(value)` using the existing `canonicalJson`/`canonicalSha256` helpers. Validators return `{ ok, errors }` and never coerce values.

- [ ] **Step 4: Implement the catalog projection**

Use this callable boundary:

```ts
export interface BuildCAL002CatalogInput {
  rules: readonly Pick<Rule, 'id' | 'category' | 'aiSpecific' | 'defaultOff'>[];
  effectiveDefaultOffRuleIds: ReadonlySet<string>;
  cal001Rows: readonly CAL001DecisionRow[];
  cal001MatrixSha256: string;
}

export function buildCAL002Catalog(input: BuildCAL002CatalogInput): CAL002CatalogResult;
```

Sort by `ruleId`; require exact ID and `aiSpecific` agreement across registry and CAL-001; derive `existingDefaultOff` from source or effective legacy policy; assign the locked evidence class only to starting quality rows; preserve CAL-001 owner-review state; and bind `ruleCatalogSha256`, `cal001MatrixSha256`, `admitted: false`, and `applied: false`.

- [ ] **Step 5: Run focused tests and typecheck**

```bash
corepack pnpm --filter slopbrick exec vitest run tests/calibration/cal-002-contracts.test.ts tests/calibration/cal-002-catalog.test.ts --maxWorkers=1 --minWorkers=1
corepack pnpm --filter slopbrick typecheck
```

Expected: both files pass and the package typecheck is green.

- [ ] **Step 6: Commit the frozen contract**

```bash
git add packages/slopbrick/src/calibration/cal-002 packages/slopbrick/tests/calibration/cal-002-contracts.test.ts packages/slopbrick/tests/calibration/cal-002-catalog.test.ts
git commit -m "feat(slopbrick): freeze CAL-002 contracts"
```

### Task 4: Prove deterministic and standards evidence without corpus labels

**Files:**
- Create: `packages/slopbrick/src/calibration/cal-002/oracles.ts`
- Create: `packages/slopbrick/tests/calibration/cal-002-oracles.test.ts`
- Create: `packages/slopbrick/tests/calibration/fixtures/cal-002-oracle-cases.ts`

**Interfaces:**
- Produces `buildCAL002OracleReceipt(input): CAL002OracleReceiptResult` for the exact final quality-lane deterministic/standards set: the frozen 32 starting rows plus any owner-transferred origin rows assigned to this evidence class.
- Consumes explicit positive/negative mutation pairs, standards/contract references, and path-free real-source control results.

- [ ] **Step 1: Write red exact-coverage and failure tests**

Use a table-driven fixture with this shape:

```ts
export interface CAL002OracleDeclaration {
  ruleId: string;
  authority: 'language-contract' | 'security-contract' | 'wcag-22' | 'repository-contract';
  reference: string;
  positiveCaseIds: readonly string[];
  negativeCaseIds: readonly string[];
}
```

Assert every starting deterministic catalog row has one declaration, every declaration has at least one positive and one negative mutation case, every observed case matches its expectation, and each rule has at least five verified source controls covering five distinct family IDs. Add a transferred-row fixture and assert that a transfer is rejected until its declaration/cases/controls exist. Assert a single unexpected fire forces `default-off` and that source polarity never appears in the receipt.

- [ ] **Step 2: Run the focused test and confirm red**

```bash
corepack pnpm --filter slopbrick exec vitest run tests/calibration/cal-002-oracles.test.ts --maxWorkers=1 --minWorkers=1
```

Expected: FAIL because `oracles.ts` and the case registry do not exist.

- [ ] **Step 3: Add explicit oracle declarations and mutation pairs**

Build the starting deterministic ID set as the 47 starting quality IDs minus the locked 11 contextual and 4 statistical IDs, and assert it equals the locked 32-ID list. For each resulting ID, add one declaration and focused positive/negative sources derived from its current rule contract. Export the registry as `Record<CAL002DeterministicRuleId, CAL002OracleDeclaration>` so omissions and extras fail at compile time. Keep sources only in test fixtures; durable results contain case IDs and source hashes, never source text.

After owner lane decisions exist, compute the final deterministic set as `startingDeterministicIds + transferredIds(reason === 'standards-or-contract-quality-claim')`. A transferred row is not quality-complete until its declaration, mutation pairs, and five-family controls have been added and committed; it cannot silently fall back to contextual review or origin evidence.

The reducer input is:

```ts
export interface BuildCAL002OracleReceiptInput {
  catalogSha256: string;
  implementationCommitSha: string;
  declarations: readonly CAL002OracleDeclaration[];
  caseResults: readonly {
    ruleId: string;
    caseId: string;
    expected: 'finding' | 'no-finding';
    observed: 'finding' | 'no-finding';
    sourceSha256: string;
  }[];
  sourceControls: readonly {
    ruleId: string;
    unitId: string;
    familyId: string;
    contentSha256: string;
    observed: 'no-finding';
  }[];
}
```

- [ ] **Step 4: Implement the fail-closed oracle receipt**

Return one sorted row per final quality-lane deterministic rule with `pass` only when declaration coverage, mutation expectations, reference authority, and five-family controls for that same rule all pass. Bind every input hash and keep `admitted: false`.

- [ ] **Step 5: Run tests and commit**

```bash
corepack pnpm --filter slopbrick exec vitest run tests/calibration/cal-002-oracles.test.ts --maxWorkers=1 --minWorkers=1
corepack pnpm --filter slopbrick typecheck
git add packages/slopbrick/src/calibration/cal-002/oracles.ts packages/slopbrick/tests/calibration/cal-002-oracles.test.ts packages/slopbrick/tests/calibration/fixtures/cal-002-oracle-cases.ts
git commit -m "test(slopbrick): bind deterministic rule oracles"
```

Expected: oracle tests and typecheck pass; no production rule source changes.

### Task 5: Select deterministic blinded finding/control samples

**Files:**
- Create: `packages/slopbrick/src/calibration/cal-002/quality-sampling.ts`
- Create: `packages/slopbrick/tests/calibration/cal-002-quality-sampling.test.ts`

**Interfaces:**
- Produces `buildCAL002QualityAssignment(input): CAL002QualityAssignmentResult`.
- Consumes path-free source-bound scan observations and lane decisions; emits a private role assignment plus a blinded batch.

- [ ] **Step 1: Write red selection, matching, and privacy tests**

Assert byte-identical replay under input reordering, distinct review IDs, 30/30 initial selection per rule, 100/100 cumulative final cap per rule, five-family reach, language/size matching, no duplicate unit across either arm for the same rule, no source path, and no arm/role field in the blinded batch:

```ts
expect(first).toEqual(second);
for (const ruleId of reviewableRuleIds) {
  expect(first.assignment.rows.filter((row) => row.ruleId === ruleId && row.role === 'finding')).toHaveLength(30);
  expect(first.assignment.rows.filter((row) => row.ruleId === ruleId && row.role === 'control')).toHaveLength(30);
}
expect(JSON.stringify(first.blindedBatch)).not.toMatch(/finding|control|\/Users\//);
expect(new Set(first.assignment.rows.map((row) => row.reviewId)).size).toBe(first.assignment.rows.length);
```

- [ ] **Step 2: Run the focused test and confirm red**

```bash
corepack pnpm --filter slopbrick exec vitest run tests/calibration/cal-002-quality-sampling.test.ts --maxWorkers=1 --minWorkers=1
```

Expected: FAIL because `quality-sampling.ts` does not exist.

- [ ] **Step 3: Implement path-free observations and rank keys**

Use:

```ts
export interface CAL002QualityObservation {
  unitId: string;
  familyId: string;
  language: string;
  byteCount: number;
  contentSha256: string;
  findings: readonly {
    ruleId: string;
    line: number;
    column: number;
    messageSha256: string;
  }[];
}

function selectionKey(ruleId: string, role: 'finding' | 'control', unitId: string): string {
  return createHash('sha256')
    .update(`CAL-002-v1\0${ruleId}\0${role}\0${unitId}`, 'utf8')
    .digest('hex');
}
```

Bucket bytes by `Math.floor(Math.log2(Math.max(1, byteCount)))`. Greedily match controls by language then byte bucket, maximize distinct families, and use the rank key as the final tie-breaker. Record shortages instead of duplicating rows.

The source adapter must call `assertCorpusV1SourceUse(disposition, 'calibration_evaluation')` before reading a candidate byte. Missing or widened permission fails before scan execution.

- [ ] **Step 4: Blind presentation order without a self-referential hash**

First compute `selectionManifestSha256` over canonical selected rows without `reviewId`. Derive each `reviewId` from `CAL-002-v1`, that manifest SHA, `ruleId`, and `unitId`; never include role. Derive a separate presentation key from the manifest SHA and review ID, then sort the blinded batch by that key. The blinded row may contain rule prompt, source identity hash, line-window locator, and evidence class, but not role, source label, repository identity, path, or raw source. Source context is resolved transiently by the terminal adapter.

- [ ] **Step 5: Run tests and commit**

```bash
corepack pnpm --filter slopbrick exec vitest run tests/calibration/cal-002-quality-sampling.test.ts --maxWorkers=1 --minWorkers=1
corepack pnpm --filter slopbrick typecheck
git add packages/slopbrick/src/calibration/cal-002/quality-sampling.ts packages/slopbrick/tests/calibration/cal-002-quality-sampling.test.ts
git commit -m "feat(slopbrick): select blinded quality evidence"
```

### Task 6: Add resumable closed-label owner review and private artifact I/O

**Files:**
- Create: `packages/slopbrick/src/calibration/cal-002/review-session.ts`
- Create: `packages/slopbrick/src/calibration/cal-002/artifact-io.ts`
- Create: `packages/slopbrick/scripts/cal/cal-002.ts`
- Create: `packages/slopbrick/tests/calibration/cal-002-review-session.test.ts`
- Create: `packages/slopbrick/tests/calibration/cal-002-cli.test.ts`
- Modify: `packages/slopbrick/package.json`

**Interfaces:**
- Produces pure `startCAL002Review`, `recordCAL002Review`, and `completeCAL002Review` functions plus terminal command `cal:complete review-quality`.
- Local state is resumable; final receipt is immutable, canonical, path-free, and authority-bound.

- [ ] **Step 1: Write red state-machine and subprocess tests**

Assert duplicate labels are idempotent, conflicting relabels fail, unknown labels fail, resume selects the first unlabeled row, completed receipts cannot be overwritten, and input/output receipts contain no displayed source:

```ts
expect(recordCAL002Review(state, id, 'not-useful')).toEqual(
  recordCAL002Review(state, id, 'not-useful'),
);
expect(() => recordCAL002Review(done, id, 'actionable-defect')).toThrow(/completed|conflict/i);
expect(JSON.stringify(receipt)).not.toContain('const secret');
expect(receipt.reviewerAuthority).toBe('repository-owner');
```

The CLI test pipes `3\nq\n`, then resumes and pipes `2\n`; assert canonical state advances once and no free-form label is accepted.

- [ ] **Step 2: Run tests and confirm red**

```bash
corepack pnpm --filter slopbrick exec vitest run tests/calibration/cal-002-review-session.test.ts tests/calibration/cal-002-cli.test.ts --maxWorkers=1 --minWorkers=1
```

Expected: FAIL because review and dispatcher modules do not exist.

- [ ] **Step 3: Implement the pure session reducer**

Use this boundary:

```ts
export function startCAL002Review(input: {
  assignmentSha256: string;
  blindedBatchSha256: string;
  reviewIds: readonly string[];
}): CAL002ReviewState;

export function recordCAL002Review(
  state: CAL002ReviewState,
  reviewId: string,
  label: CAL002ReviewLabel,
): CAL002ReviewState;

export function completeCAL002Review(input: {
  state: CAL002ReviewState;
  reviewerAuthority: 'repository-owner';
  implementationCommitSha: string;
}): CAL002ReviewReceiptResult;
```

Sort labels by review ID in the receipt. Bind assignment, batch, state, catalog, implementation, and protocol hashes. Record `admitted: false`.

- [ ] **Step 4: Implement safe local I/O and terminal keys**

`artifact-io.ts` must reject symlinks, non-canonical JSON, unsafe output paths, duplicate writes, and mode-widened state. Write local state to a sibling temporary file with mode `0o600`, `fsync`, then rename. Write immutable receipts with `flag: 'wx'`.

Terminal keys are exact:

```text
1 actionable-defect
2 useful-no-safe-fix
3 not-useful
4 cannot-determine
q save and quit
```

Any other input reprints the closed menu without mutating state. Display transient source context only after verifying content SHA-256 against the selected observation.

- [ ] **Step 5: Add the package script**

```json
"cal:complete": "node --import tsx scripts/cal/cal-002.ts"
```

The dispatcher returns one JSON object on stdout and actionable errors on stderr with exit code 2. It performs no network access.

- [ ] **Step 6: Run tests and commit**

```bash
corepack pnpm --filter slopbrick exec vitest run tests/calibration/cal-002-review-session.test.ts tests/calibration/cal-002-cli.test.ts --maxWorkers=1 --minWorkers=1
corepack pnpm --filter slopbrick typecheck
git add packages/slopbrick/src/calibration/cal-002/review-session.ts packages/slopbrick/src/calibration/cal-002/artifact-io.ts packages/slopbrick/scripts/cal/cal-002.ts packages/slopbrick/tests/calibration/cal-002-review-session.test.ts packages/slopbrick/tests/calibration/cal-002-cli.test.ts packages/slopbrick/package.json
git commit -m "feat(slopbrick): add resumable calibration review"
```

### Task 7: Reduce quality evidence and trigger bounded expansion

**Files:**
- Create: `packages/slopbrick/src/calibration/cal-002/quality-metrics.ts`
- Create: `packages/slopbrick/tests/calibration/cal-002-quality-metrics.test.ts`

**Interfaces:**
- Produces `reduceCAL002QualityEvidence(input): CAL002QualityMetricsResult`.
- Consumes assignment, review receipt, oracle receipt, and catalog; emits per-rule outcome plus explicit expansion requests.

- [ ] **Step 1: Write red interval and outcome tests**

Cover all four labels, 30-to-100 expansion, determinate floors, exact threshold edges, statistical no-default-on, control-dominated failure, review-utility non-overlap, shortages, and deterministic oracle failure. Freeze known Wilson values to six decimal places.

```ts
expect(wilson95(30, 30)).toEqual({ lower: 0.886486, upper: 1 });
expect(wilson95(0, 30)).toEqual({ lower: 0, upper: 0.113514 });
expect(statistical.outcome).toBe('quality-advisory');
expect(inconclusive.nextRound).toEqual({ findings: 100, controls: 100 });
expect(finalUncertain.outcome).toBe('insufficient-evidence');
```

- [ ] **Step 2: Run the focused test and confirm red**

```bash
corepack pnpm --filter slopbrick exec vitest run tests/calibration/cal-002-quality-metrics.test.ts --maxWorkers=1 --minWorkers=1
```

Expected: FAIL because `quality-metrics.ts` does not exist.

- [ ] **Step 3: Implement Wilson intervals**

```ts
export function wilson95(successes: number, total: number): CAL002Interval {
  if (!Number.isInteger(successes) || !Number.isInteger(total) || successes < 0 || total < 1 || successes > total) {
    throw new RangeError('Wilson inputs must satisfy 0 <= successes <= total');
  }
  const z = 1.959963984540054;
  const p = successes / total;
  const denominator = 1 + (z * z) / total;
  const center = (p + (z * z) / (2 * total)) / denominator;
  const margin = (z / denominator) * Math.sqrt((p * (1 - p) / total) + (z * z) / (4 * total * total));
  return { lower: round6(Math.max(0, center - margin)), upper: round6(Math.min(1, center + margin)) };
}
```

- [ ] **Step 4: Implement exact reducer precedence**

Validate assignment/review hash bindings before unblinding. Count labels by arm, exclude cannot-determine from binary intervals, apply the locked table in order, and return sorted `expansionRequests`. A transferred row uses its owner-selected evidence class. Every result records sample counts, uncertainty, claim ceiling, repair safety, rationale code, and `admitted: false`.

- [ ] **Step 5: Run tests and commit**

```bash
corepack pnpm --filter slopbrick exec vitest run tests/calibration/cal-002-quality-metrics.test.ts --maxWorkers=1 --minWorkers=1
corepack pnpm --filter slopbrick typecheck
git add packages/slopbrick/src/calibration/cal-002/quality-metrics.ts packages/slopbrick/tests/calibration/cal-002-quality-metrics.test.ts
git commit -m "feat(slopbrick): reduce quality evidence"
```

### Task 8: Resolve origin ownership and exact CAL-001 reuse

**Files:**
- Create: `packages/slopbrick/src/calibration/cal-002/origin.ts`
- Create: `packages/slopbrick/tests/calibration/cal-002-origin.test.ts`
- Modify: `packages/slopbrick/scripts/cal/cal-002.ts`
- Modify: `packages/slopbrick/tests/calibration/cal-002-cli.test.ts`

**Interfaces:**
- Produces owner lane-decision receipt and `buildCAL002OriginReceipt(input)`.
- Reuses CAL-001 only when all governing hashes match; otherwise emits `rerun-required` and the existing one-worker runner command.

- [ ] **Step 1: Write red owner-decision and hash-gate tests**

Assert the 32 already-off origin rows auto-resolve to hold, exactly 40 rows require a closed owner decision, transfer requires one transfer reason, retirement requires `duplicate-or-obsolete`, and no origin row can become default-on.

Assert each mismatch independently forces rerun for protocol, source, split, scanner commit, config, catalog, holdout receipt, metrics, and reducer hashes.

```ts
expect(reuse.status).toBe('reused');
expect({ ...hashes, configSha256: 'f'.repeat(64) }).not.toEqual(hashes);
expect(buildCAL002OriginReceipt(drifted).status).toBe('rerun-required');
expect(result.rows.every((row) => row.outcome !== 'default-on')).toBe(true);
```

- [ ] **Step 2: Run tests and confirm red**

```bash
corepack pnpm --filter slopbrick exec vitest run tests/calibration/cal-002-origin.test.ts tests/calibration/cal-002-cli.test.ts --maxWorkers=1 --minWorkers=1
```

Expected: FAIL because origin commands are not implemented.

- [ ] **Step 3: Implement closed origin decisions**

Terminal choices are:

```text
1 hold-origin-default-off
2 transfer-to-quality
3 retire
q save and quit
```

Choice 2 opens a second closed menu for the three transfer reasons. Choice 3 records fixed reason `duplicate-or-obsolete`. State and receipt semantics match Task 6.

- [ ] **Step 4: Implement the exact governing-hash gate**

```ts
export interface CAL002OriginGoverningHashes {
  protocolSha256: string;
  sourceBindingReceiptSha256: string;
  splitPlanSha256: string;
  scannerCommitSha: string;
  configSha256: string;
  catalogSha256: string;
  holdoutReceiptSha256: string;
  metricsSha256: string;
  cal001MatrixSha256: string;
  reducerSha256: string;
}
```

Require exact equality with the frozen CAL-001 identities. Missing local artifacts are a mismatch, not inferred reuse. On rerun, call the existing `cal:corpus:v1-holdout` and `cal:corpus:v1-decisions` boundaries with one worker and compare the canonical hashes before producing a CAL-002 origin receipt.

- [ ] **Step 5: Run tests and commit**

```bash
corepack pnpm --filter slopbrick exec vitest run tests/calibration/cal-002-origin.test.ts tests/calibration/cal-002-cli.test.ts --maxWorkers=1 --minWorkers=1
corepack pnpm --filter slopbrick typecheck
git add packages/slopbrick/src/calibration/cal-002/origin.ts packages/slopbrick/scripts/cal/cal-002.ts packages/slopbrick/tests/calibration/cal-002-origin.test.ts packages/slopbrick/tests/calibration/cal-002-cli.test.ts
git commit -m "feat(slopbrick): gate origin evidence reuse"
```

### Task 9: Merge and dry-run one non-admitting 119-row policy

**Files:**
- Create: `packages/slopbrick/src/calibration/cal-002/matrix.ts`
- Create: `packages/slopbrick/src/calibration/cal-002/application.ts`
- Create: `packages/slopbrick/tests/calibration/cal-002-matrix.test.ts`
- Create: `packages/slopbrick/tests/calibration/cal-002-application.test.ts`
- Modify: `packages/slopbrick/scripts/cal/cal-002.ts`
- Modify: `packages/slopbrick/tests/calibration/cal-002-cli.test.ts`

**Interfaces:**
- Produces `buildCAL002FinalMatrix(input)` and `buildCAL002PolicyArtifact(input)`.
- Rejects missing, duplicate, cross-lane, catalog-drifted, admitted, partially reviewed, or provenance-overwriting input.

- [ ] **Step 1: Write red merge and application tests**

Assert exact 119-row coverage, 40 owner rows resolved, one lane per rule, no origin default-on, all fields separated, deterministic dry-run bytes, no mutation during dry-run, and zero writes after any validation failure.

```ts
expect(matrix.counts.total).toBe(119);
expect(matrix.rows.every((row) => row.admitted === false)).toBe(true);
expect(matrix.applied).toBe(false);
expect(policy.rows).toHaveLength(119);
expect(policy.admitted).toBe(false);
expect(JSON.stringify(policy)).not.toContain('legacyMetrics');
```

- [ ] **Step 2: Run tests and confirm red**

```bash
corepack pnpm --filter slopbrick exec vitest run tests/calibration/cal-002-matrix.test.ts tests/calibration/cal-002-application.test.ts tests/calibration/cal-002-cli.test.ts --maxWorkers=1 --minWorkers=1
```

Expected: FAIL because matrix and application modules do not exist.

- [ ] **Step 3: Implement the final row contract**

Every row contains these independent fields:

```ts
export interface CAL002FinalRow {
  ruleId: string;
  lane: CAL002Lane;
  priorAiSpecific: boolean;
  transferred: boolean;
  evidenceClass?: CAL002EvidenceClass;
  measurementStatus: 'measured' | 'oracle-verified' | 'unavailable';
  claimCeiling: CAL002ClaimCeiling;
  authority: 'standards-contract' | 'repository-owner' | 'publisher-attested-internal';
  sampleCounts: { findings: number; controls: number; cannotDetermine: number };
  uncertainty?: { findingUseful: CAL002Interval; controlUseful: CAL002Interval };
  usefulness: 'passed' | 'failed' | 'advisory' | 'not-applicable' | 'insufficient';
  outcome: CAL002PolicyOutcome;
  enabledByDefault: boolean;
  scoreEligibleByDefault: boolean;
  repairSafety: 'finding-bound-only' | 'no-safe-repair' | 'not-applicable';
  evidenceSha256: string;
  admitted: false;
}
```

Set matrix `applied: false` until the application receipt is produced. Hash sorted rows and bind every lane artifact.

- [ ] **Step 4: Implement policy generation and dry-run parity**

Generate one static JSON policy with version `slopbrick-rule-evidence-policy-v1`, all 119 rows, matrix/catalog hashes, `applied: true`, and `admitted: false`. It contains current policy/provenance only and no copied historical precision, recall, FPR, ratio, or verdict.

`cal:complete apply --dry-run` writes only a proposed artifact path supplied by the caller. Final apply requires an immutable `cal-002-matrix-approval-v1` receipt whose matrix SHA matches the supplied matrix and whose disposition is `approved`. It uses atomic rename to the requested destination. Re-reading the destination must reproduce the proposed canonical hash before emitting the apply receipt.

- [ ] **Step 5: Run tests and commit**

```bash
corepack pnpm --filter slopbrick exec vitest run tests/calibration/cal-002-matrix.test.ts tests/calibration/cal-002-application.test.ts tests/calibration/cal-002-cli.test.ts --maxWorkers=1 --minWorkers=1
corepack pnpm --filter slopbrick typecheck
git add packages/slopbrick/src/calibration/cal-002/matrix.ts packages/slopbrick/src/calibration/cal-002/application.ts packages/slopbrick/scripts/cal/cal-002.ts packages/slopbrick/tests/calibration/cal-002-matrix.test.ts packages/slopbrick/tests/calibration/cal-002-application.test.ts packages/slopbrick/tests/calibration/cal-002-cli.test.ts
git commit -m "feat(slopbrick): build atomic calibration policy"
```

### Task 10: Execute the owner evidence program and approve the exact matrix

**Files:**
- Create: `docs/execution/evidence/artifacts/cal-002/catalog.json`
- Create: `docs/execution/evidence/artifacts/cal-002/lane-decisions.json`
- Create: `docs/execution/evidence/artifacts/cal-002/oracle-receipt.json`
- Create: `docs/execution/evidence/artifacts/cal-002/quality-assignment-initial.json`
- Create: `docs/execution/evidence/artifacts/cal-002/quality-reviews-initial.json`
- Create: `docs/execution/evidence/artifacts/cal-002/quality-reduction-initial.json`
- Create when requested: `docs/execution/evidence/artifacts/cal-002/quality-assignment-final.json`
- Create when requested: `docs/execution/evidence/artifacts/cal-002/quality-reviews-final.json`
- Create: `docs/execution/evidence/artifacts/cal-002/quality-metrics.json`
- Create: `docs/execution/evidence/artifacts/cal-002/origin-receipt.json`
- Create: `docs/execution/evidence/artifacts/cal-002/final-matrix.json`
- Create after approval: `docs/execution/evidence/artifacts/cal-002/matrix-approval.json`
- Modify: `docs/execution/evidence/CAL-002-complete-calibration.md`

**Interfaces:**
- Consumes only verified local source bytes, the owner terminal, and the completed CAL-002 implementation.
- Produces immutable path-free evidence and one exact matrix SHA for a closed owner decision.

- [ ] **Step 1: Generate and verify the current catalog**

```bash
corepack pnpm --filter slopbrick cal:complete -- catalog \
  --cal001-matrix /private/tmp/cal-001-v1-decision-matrix-2026-07-17.json \
  --out docs/execution/evidence/artifacts/cal-002/catalog.json
```

If the historical matrix file is absent, regenerate it through the recorded CAL-001 holdout/decision commands first. Expected catalog counts are 119/47/72/40 and `admitted: false`.

- [ ] **Step 2: Complete all 40 closed origin decisions**

```bash
corepack pnpm --filter slopbrick cal:complete -- classify-origin \
  --catalog docs/execution/evidence/artifacts/cal-002/catalog.json \
  --state .slopbrick/calibration/cal-002/origin-state.json \
  --out docs/execution/evidence/artifacts/cal-002/lane-decisions.json
```

Resume the same command until all 40 owner-required rows have one disposition. The other 32 origin rows auto-hold. Expected: 72 origin rows accounted for and zero unresolved owner rows.

- [ ] **Step 3: Run deterministic oracles and source controls**

Compute the exact final deterministic quality set from the lane decisions. For every transferred standards/contract row, first add its typed declaration plus positive/negative mutation pairs to `cal-002-oracle-cases.ts`, add a red exact-row test, run it red, implement the cases, and commit that bounded test-evidence change as `test(slopbrick): bind transferred rule oracles`. If no row transfers to this class, record that zero-row disposition in the CAL-002 evidence log and do not create an empty commit.

Run the complete oracle suite and emit its receipt through the dispatcher. Expected: all 32 starting rules plus every transferred deterministic rule record pass/fail explicitly; a failed row remains a completed `default-off` disposition.

```bash
corepack pnpm --filter slopbrick exec vitest run tests/calibration/cal-002-oracles.test.ts --maxWorkers=1 --minWorkers=1
corepack pnpm --filter slopbrick cal:complete -- reduce-oracles \
  --catalog docs/execution/evidence/artifacts/cal-002/catalog.json \
  --lane-decisions docs/execution/evidence/artifacts/cal-002/lane-decisions.json \
  --out docs/execution/evidence/artifacts/cal-002/oracle-receipt.json
```

- [ ] **Step 4: Prepare source-bound initial quality batches**

```bash
corepack pnpm --filter slopbrick cal:complete -- prepare-quality \
  --corpus-root /Users/cheng/corpus-expansion/v10.3 \
  --catalog docs/execution/evidence/artifacts/cal-002/catalog.json \
  --lane-decisions docs/execution/evidence/artifacts/cal-002/lane-decisions.json \
  --round initial \
  --out docs/execution/evidence/artifacts/cal-002/quality-assignment-initial.json
```

Expected: 30/30 per contextual/statistical quality rule when source reach permits; shortages are explicit. The command uses one scanner worker and persists no raw source.

- [ ] **Step 5: Complete the resumable initial owner review**

```bash
corepack pnpm --filter slopbrick cal:complete -- review-quality \
  --corpus-root /Users/cheng/corpus-expansion/v10.3 \
  --assignment docs/execution/evidence/artifacts/cal-002/quality-assignment-initial.json \
  --state .slopbrick/calibration/cal-002/quality-state.json \
  --out docs/execution/evidence/artifacts/cal-002/quality-reviews-initial.json
```

Expected starting workload: 900 closed decisions for the 15 initial contextual/statistical rules, plus 60 for each transferred contextual/statistical row. At most 40 rows can transfer, so the initial owner-review ceiling is 3,300 labels. The command may be stopped with `q` and resumed without losing or duplicating a label.

- [ ] **Step 6: Reduce and complete only requested expansions**

```bash
corepack pnpm --filter slopbrick cal:complete -- reduce-quality \
  --catalog docs/execution/evidence/artifacts/cal-002/catalog.json \
  --lane-decisions docs/execution/evidence/artifacts/cal-002/lane-decisions.json \
  --oracles docs/execution/evidence/artifacts/cal-002/oracle-receipt.json \
  --assignment docs/execution/evidence/artifacts/cal-002/quality-assignment-initial.json \
  --reviews docs/execution/evidence/artifacts/cal-002/quality-reviews-initial.json \
  --round initial \
  --out docs/execution/evidence/artifacts/cal-002/quality-reduction-initial.json
```

If expansion requests exist, select only 70 additional finding and 70 additional control rows for each requested rule so the cumulative cap is 100/100, then run:

```bash
corepack pnpm --filter slopbrick cal:complete -- prepare-quality \
  --corpus-root /Users/cheng/corpus-expansion/v10.3 \
  --catalog docs/execution/evidence/artifacts/cal-002/catalog.json \
  --lane-decisions docs/execution/evidence/artifacts/cal-002/lane-decisions.json \
  --round final \
  --expansion docs/execution/evidence/artifacts/cal-002/quality-reduction-initial.json \
  --prior-assignment docs/execution/evidence/artifacts/cal-002/quality-assignment-initial.json \
  --out docs/execution/evidence/artifacts/cal-002/quality-assignment-final.json
corepack pnpm --filter slopbrick cal:complete -- review-quality \
  --corpus-root /Users/cheng/corpus-expansion/v10.3 \
  --assignment docs/execution/evidence/artifacts/cal-002/quality-assignment-final.json \
  --state .slopbrick/calibration/cal-002/quality-state-final.json \
  --out docs/execution/evidence/artifacts/cal-002/quality-reviews-final.json
corepack pnpm --filter slopbrick cal:complete -- reduce-quality \
  --round final \
  --catalog docs/execution/evidence/artifacts/cal-002/catalog.json \
  --lane-decisions docs/execution/evidence/artifacts/cal-002/lane-decisions.json \
  --oracles docs/execution/evidence/artifacts/cal-002/oracle-receipt.json \
  --initial-assignment docs/execution/evidence/artifacts/cal-002/quality-assignment-initial.json \
  --initial-reviews docs/execution/evidence/artifacts/cal-002/quality-reviews-initial.json \
  --initial-reduction docs/execution/evidence/artifacts/cal-002/quality-reduction-initial.json \
  --final-assignment docs/execution/evidence/artifacts/cal-002/quality-assignment-final.json \
  --final-reviews docs/execution/evidence/artifacts/cal-002/quality-reviews-final.json \
  --out docs/execution/evidence/artifacts/cal-002/quality-metrics.json
```

If no expansion exists, run the same final reducer without the two `--final-*` arguments. The expansion ceiling is 140 additional labels per requested rule; the absolute all-transfer/all-expansion ceiling is 11,000 quality labels, and actual work is lower whenever rows remain in origin, retire, resolve at 30/30, or lack source reach. Stop only when every quality row has a terminal outcome or explicit insufficient evidence.

- [ ] **Step 7: Verify or rerun origin evidence**

```bash
corepack pnpm --filter slopbrick cal:complete -- verify-origin \
  --corpus-root /Users/cheng/corpus-expansion/v10.3 \
  --catalog docs/execution/evidence/artifacts/cal-002/catalog.json \
  --lane-decisions docs/execution/evidence/artifacts/cal-002/lane-decisions.json \
  --out docs/execution/evidence/artifacts/cal-002/origin-receipt.json
```

Expected: exact CAL-001 reuse or a completed deterministic one-worker rerun; all origin outcomes remain default-off/retired and `admitted: false`.

- [ ] **Step 8: Generate and adversarially verify the final matrix**

```bash
corepack pnpm --filter slopbrick cal:complete -- matrix \
  --catalog docs/execution/evidence/artifacts/cal-002/catalog.json \
  --lane-decisions docs/execution/evidence/artifacts/cal-002/lane-decisions.json \
  --quality-metrics docs/execution/evidence/artifacts/cal-002/quality-metrics.json \
  --origin-receipt docs/execution/evidence/artifacts/cal-002/origin-receipt.json \
  --out docs/execution/evidence/artifacts/cal-002/final-matrix.json
corepack pnpm --filter slopbrick exec vitest run tests/calibration/cal-002-matrix.test.ts tests/calibration/cal-002-application.test.ts --maxWorkers=1 --minWorkers=1
```

Expected: 119 unique rows, all 40 owner rows resolved, no cross-lane duplicates, no origin default-on, `applied: false`, and `admitted: false`.

- [ ] **Step 9: Obtain the closed owner matrix disposition**

Present the exact matrix SHA, counts by outcome/lane, every transfer, every default-state change, and every insufficient row by running:

```bash
corepack pnpm --filter slopbrick cal:complete -- approve-matrix \
  --matrix docs/execution/evidence/artifacts/cal-002/final-matrix.json \
  --out docs/execution/evidence/artifacts/cal-002/matrix-approval.json
```

The terminal accepts exactly:

```text
1 approve this exact matrix SHA for application
2 reject this matrix SHA and return to the named evidence row
```

Choice 1 writes a canonical `cal-002-matrix-approval-v1` receipt bound to the matrix SHA and `reviewerAuthority: repository-owner`. Choice 2 exits without creating that receipt. Do not execute Task 11 on choice 2 or without the approval receipt. Record the literal choice and exact SHA in `docs/execution/evidence/CAL-002-complete-calibration.md`.

- [ ] **Step 10: Commit immutable evidence only after approval**

```bash
git add docs/execution/evidence/CAL-002-complete-calibration.md docs/execution/evidence/artifacts/cal-002
git commit -m "data(calibration): record complete evidence matrix"
```

### Task 11: Prepare the approved policy candidate and exact first-scan provenance

**Files:**
- Create: `packages/slopbrick/src/rules/current-evidence-policy.json`
- Create: `packages/slopbrick/src/rules/current-evidence-policy.ts`
- Create: `packages/slopbrick/tests/rules/current-evidence-policy.test.ts`
- Modify: `packages/slopbrick/src/rules/signal-strength.ts`
- Modify: `packages/slopbrick/src/rules/explanation.ts`
- Modify: `packages/slopbrick/src/cli/explain.ts`
- Modify: `packages/slopbrick/src/cli/commands/calibration.ts`
- Modify: `packages/slopbrick/src/cli/commands/rules.ts`
- Modify: `packages/slopbrick/src/cli/effective-issues.ts`
- Modify: `packages/slopbrick/src/cli/scan.ts`
- Modify: `packages/slopbrick/src/engine/worker.ts`
- Modify: `packages/slopbrick/src/types/first-scan.ts`
- Modify: `packages/slopbrick/src/report/first-scan.ts`
- Modify: `packages/slopbrick/src/report/first-scan-pretty.ts`
- Modify: `packages/slopbrick/src/report/pretty.ts`
- Modify: `packages/slopbrick/src/report/markdown.ts`
- Modify: `packages/slopbrick/src/report/html/sections.ts`
- Modify: `packages/slopbrick/src/report/html/utils.ts`
- Modify: `packages/slopbrick/src/report/sarif.ts`
- Modify: `packages/slopbrick/scripts/generate-rule-catalog.ts`
- Modify: `packages/slopbrick/tests/generated-docs-truth.test.ts`
- Modify: existing tests named below
- Create: `docs/execution/evidence/artifacts/cal-002/application-receipt.json`

**Interfaces:**
- Produces static accessors `getCurrentRulePolicy`, `getRuleEvidenceProvenance`, `getCurrentDefaultOffRules`, and `isAdvisoryOnlyRule`.
- Preserves legacy signal metrics as a separate read-only layer.

- [ ] **Step 1: Write red runtime policy tests**

Assert 119 exact rows, catalog/matrix hash binding, no metric-copy fields, default-off origin, visible/non-scoring advisory, legacy fallback, explicit opt-in behavior, composite filtering, generated-catalog policy truth, and bundled static JSON availability.

```ts
expect(policy.rows).toHaveLength(119);
expect(policy.admitted).toBe(false);
expect(getCurrentDefaultOffRules()).toContain(originRuleId);
expect(isAdvisoryOnlyRule(advisoryRuleId)).toBe(true);
expect(effectiveIssuesForScore([advisoryIssue], config)).toEqual([]);
expect(JSON.stringify(policy)).not.toMatch(/precision|recall|fpRate|ratio|verdict/);
```

- [ ] **Step 2: Run focused tests and confirm red**

```bash
corepack pnpm --filter slopbrick exec vitest run tests/rules/current-evidence-policy.test.ts tests/report/first-scan.test.ts tests/report/renderer-contract.test.ts --maxWorkers=1 --minWorkers=1
```

Expected: FAIL because current policy/provenance is not wired.

- [ ] **Step 3: Dry-run and apply the approved matrix**

```bash
corepack pnpm --filter slopbrick cal:complete -- apply \
  --matrix docs/execution/evidence/artifacts/cal-002/final-matrix.json \
  --dry-run \
  --out /private/tmp/current-evidence-policy.proposed.json
corepack pnpm --filter slopbrick cal:complete -- apply \
  --matrix docs/execution/evidence/artifacts/cal-002/final-matrix.json \
  --approval docs/execution/evidence/artifacts/cal-002/matrix-approval.json \
  --out packages/slopbrick/src/rules/current-evidence-policy.json \
  --receipt-out docs/execution/evidence/artifacts/cal-002/application-receipt.json
```

Expected: proposed and applied canonical policy hashes match; the approval receipt and application receipt bind the same matrix SHA and remain `admitted: false`.

- [ ] **Step 4: Add strict current-policy accessors**

Static-import the generated JSON so tsup bundles it. Reject any invalid, unapplied, admitted, incomplete, duplicate, or drifted artifact at module load. `getCurrentDefaultOffRules()` uses `enabledByDefault`; legacy signal defaults are used only when no valid applied row exists.

- [ ] **Step 5: Separate visibility from score eligibility**

Keep `quality-advisory` findings active for first-scan display. Exclude them in `effectiveIssuesForScore`, `scoreFile`, aggregate issue groups, and gate inputs. Default-off findings remain severity `off` unless explicitly configured. Filter worker composite inputs through current default policy unless that rule has an explicit non-off config override.

- [ ] **Step 6: Replace unqualified calibrated provenance**

Use these first-scan discriminants:

```ts
export type FirstScanEvidenceTier =
  | 'deterministic'
  | 'current-quality-calibrated'
  | 'internal-origin-calibrated'
  | 'legacy-calibrated'
  | 'advisory'
  | 'insufficient-evidence';
```

Attach `policyVersion`, `evidenceDate`, `claimCeiling`, `admitted: false`, and optional `legacyMetrics` as separate nested fields. Deterministic `Issue.evidence` remains highest precedence. Current quality evidence outranks advisory/legacy. Internal origin evidence never says quality or authorship. Statistical/advisory rows always say no safe bounded repair.

- [ ] **Step 7: Update pretty, JSON, SARIF, explanation, and compatibility tests**

Modify:

```text
packages/slopbrick/tests/report/first-scan.test.ts
packages/slopbrick/tests/report/renderer-contract.test.ts
packages/slopbrick/tests/report/json.test.ts
packages/slopbrick/tests/report/sarif.test.ts
packages/slopbrick/tests/report/markdown.test.ts
packages/slopbrick/tests/report/html.test.ts
packages/slopbrick/tests/cli/first-scan-pipeline.test.ts
packages/slopbrick/tests/cli/scan-completion.test.ts
packages/slopbrick/tests/explain.test.ts
packages/slopbrick/tests/snapshots/explain-math-default-font.txt
packages/slopbrick/tests/signal-strength.test.ts
packages/slopbrick/tests/integration/calibration.test.ts
packages/slopbrick/tests/integration/calibration-expanded.test.ts
packages/slopbrick/tests/engine/lr-combiner.test.ts
packages/slopbrick/tests/engine/signal-strength-guardrails.test.ts
packages/slopbrick/tests/signal-strength-contract.test.ts
packages/slopbrick/tests/integration/dist-bundle-paths.test.ts
packages/slopbrick/tests/generated-docs-truth.test.ts
```

Assert exact current/legacy language, no authorship claim, advisory non-scoring, origin default-off, historical metrics unchanged byte-for-byte, JSON/SARIF additive fields, and CJS/ESM bundle parity.

Update `generate-rule-catalog.ts` to read `current-evidence-policy.json` as the current default/claim source and `signal-strength.json` only as explicitly labeled legacy metrics. The generated table must expose `policyClass`, `enabledByDefault`, `evidenceTier`, `claimCeiling`, `admitted`, and a separately labeled legacy verdict; it must never infer current defaults from a legacy verdict. `--check` must fail on policy/catalog hash drift.

- [ ] **Step 8: Run focused gates and retain the uncommitted application candidate**

```bash
corepack pnpm --filter slopbrick exec vitest run \
  tests/rules/current-evidence-policy.test.ts \
  tests/report/first-scan.test.ts \
  tests/report/renderer-contract.test.ts \
  tests/report/json.test.ts \
  tests/report/sarif.test.ts \
  tests/report/markdown.test.ts \
  tests/report/html.test.ts \
  tests/cli/first-scan-pipeline.test.ts \
  tests/cli/scan-completion.test.ts \
  tests/explain.test.ts \
  tests/signal-strength.test.ts \
  tests/integration/calibration.test.ts \
  tests/integration/calibration-expanded.test.ts \
  tests/engine/lr-combiner.test.ts \
  tests/engine/signal-strength-guardrails.test.ts \
  tests/signal-strength-contract.test.ts \
  tests/generated-docs-truth.test.ts \
  --maxWorkers=1 --minWorkers=1
corepack pnpm --filter slopbrick generate:rules:catalog
corepack pnpm --filter slopbrick generate:rules:catalog -- --check
corepack pnpm --filter slopbrick typecheck
corepack pnpm --filter slopbrick build
corepack pnpm --filter slopbrick exec vitest run tests/integration/dist-bundle-paths.test.ts --maxWorkers=1 --minWorkers=1
git diff --check
git status --short
```

Expected: focused tests, typecheck, build, and bundled-path test pass. Keep the candidate and runtime integration uncommitted until Task 12 proves the recursive, self-scan, and owner-comprehension gates. Do not stage unrelated paths.

### Task 12: Verify, self-scan, commit application, reconcile all docs, and close CAL-002 plus SB-UX

**Files:**
- Modify: `README.md`
- Modify: `ROADMAP.md`
- Modify: `CONTRIBUTING.md`
- Modify: `docs/ARCHITECTURE.md`
- Modify: `docs/calibration/README.md`
- Modify: `docs/maths.md`
- Modify: `docs/methodology.md`
- Modify: `docs/rules.md`
- Modify: `packages/slopbrick/README.md`
- Modify: `packages/slopbrick/CHANGELOG.md`
- Modify: `packages/slopbrick/CONTRIBUTING.md`
- Modify: `packages/slopbrick/EXAMPLES.md`
- Modify: `packages/slopbrick/ROADMAP.md`
- Modify: `packages/slopbrick/docs/MCP.md`
- Modify: `packages/slopbrick/docs/architecture.md`
- Modify: `packages/slopbrick/docs/calibration/README.md`
- Modify: `packages/slopbrick/docs/language-support-matrix.md`
- Modify: `packages/slopbrick/docs/rule-catalog.md`
- Modify: `packages/slopbrick/docs/scoring-explained.md`
- Modify: `packages/slopbrick/docs/scoring-runbook.md`
- Modify: `packages/website/docs/blog/lifecycle-narrative.md`
- Modify: `docs/execution/index.json`
- Modify: `docs/execution/STATUS.md`
- Modify: `docs/execution/CHANGELOG.md`
- Modify: `docs/execution/plans/CAL-002-complete-calibration.md`
- Modify: `docs/execution/plans/SB-UX-001-first-scan.md`
- Modify: `docs/execution/plans/VAL-001-owner-validation.md`
- Modify: `docs/execution/plans/TEL-001-local-outcomes.md`
- Modify: `docs/execution/evidence/CAL-002-complete-calibration.md`
- Modify: `docs/execution/evidence/SB-UX-001-first-scan.md`

**Interfaces:**
- Produces execution revision 27 only after all code, evidence, matrix approval, application, and self-scan gates pass.
- Moves CAL-002 and SB-UX-001 to done, leaves VAL-001 and TEL-001 ready, and hands the typed outcome boundary to TEL-001.

- [ ] **Step 1: Run the complete focused CAL-002 matrix**

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
  tests/calibration/cal-002-cli.test.ts \
  tests/rules/current-evidence-policy.test.ts \
  --maxWorkers=1 --minWorkers=1
```

Expected: all CAL-002 focused tests pass with one worker.

- [ ] **Step 2: Run package and recursive gates serially**

```bash
SLOPBRICK_VITEST_WORKERS=1 corepack pnpm --filter slopbrick test
corepack pnpm -r lint
corepack pnpm -r typecheck
SLOPBRICK_VITEST_WORKERS=1 corepack pnpm -r test
corepack pnpm -r build
```

Expected: every gate exits 0. Record observed test counts; do not reuse historical counts.

- [ ] **Step 3: Prove frozen CAL-001 and historical metrics are unchanged**

Compare all eight frozen Corpus v1/CAL-001 hashes, the CAL-001 holdout and matrix identities, and the pre-Task-11 SHA-256 of `signal-strength.json`. Expected: every value is byte-identical; CAL-002 adds policy/provenance without rewriting history.

- [ ] **Step 4: Run the package-local self-scan without baseline mutation**

Hash the package-local debt baseline before and after, then run:

```bash
corepack pnpm --filter slopbrick exec -- node ./bin/slopbrick.js scan --workspace . --threads 1 --no-telemetry --no-color
```

Expected: complete scan; current/legacy provenance is explicit; origin-default-off findings are audit-only; quality advisory findings are visible but score/gate neutral; no baseline is created or changed. Record actual counts and exit.

- [ ] **Step 5: Run the final owner comprehension gate**

Present the exact ANSI-free first screen. The owner chooses:

```text
1 provenance and action boundary are understandable; close CAL-002 and SB-UX-001
2 boundary is not understandable; keep both active and name the failed displayed row
```

On choice 2, stop the closeout and open a focused correction; do not change evidence labels to force acceptance.

- [ ] **Step 6: Commit the verified atomic policy application**

Review the exact staged scope, then checkpoint the approved matrix, generated policy, runtime integration, tests, and application receipt together:

```bash
git add packages/slopbrick/src/rules/current-evidence-policy.json packages/slopbrick/src/rules/current-evidence-policy.ts packages/slopbrick/src/rules/signal-strength.ts packages/slopbrick/src/rules/explanation.ts packages/slopbrick/src/cli/explain.ts packages/slopbrick/src/cli/commands/calibration.ts packages/slopbrick/src/cli/commands/rules.ts packages/slopbrick/src/cli/effective-issues.ts packages/slopbrick/src/cli/scan.ts packages/slopbrick/src/engine/worker.ts packages/slopbrick/src/types/first-scan.ts packages/slopbrick/src/report/first-scan.ts packages/slopbrick/src/report/first-scan-pretty.ts packages/slopbrick/src/report/pretty.ts packages/slopbrick/src/report/markdown.ts packages/slopbrick/src/report/html/sections.ts packages/slopbrick/src/report/html/utils.ts packages/slopbrick/src/report/sarif.ts packages/slopbrick/scripts/generate-rule-catalog.ts packages/slopbrick/tests/generated-docs-truth.test.ts packages/slopbrick/tests/rules/current-evidence-policy.test.ts packages/slopbrick/tests/report/first-scan.test.ts packages/slopbrick/tests/report/renderer-contract.test.ts packages/slopbrick/tests/report/json.test.ts packages/slopbrick/tests/report/sarif.test.ts packages/slopbrick/tests/report/markdown.test.ts packages/slopbrick/tests/report/html.test.ts packages/slopbrick/tests/cli/first-scan-pipeline.test.ts packages/slopbrick/tests/cli/scan-completion.test.ts packages/slopbrick/tests/explain.test.ts packages/slopbrick/tests/snapshots/explain-math-default-font.txt packages/slopbrick/tests/signal-strength.test.ts packages/slopbrick/tests/integration/calibration.test.ts packages/slopbrick/tests/integration/calibration-expanded.test.ts packages/slopbrick/tests/engine/lr-combiner.test.ts packages/slopbrick/tests/engine/signal-strength-guardrails.test.ts packages/slopbrick/tests/signal-strength-contract.test.ts packages/slopbrick/tests/integration/dist-bundle-paths.test.ts docs/execution/evidence/artifacts/cal-002/application-receipt.json
git diff --cached --name-only
git diff --cached --check
git commit -m "feat(slopbrick): apply current evidence policy"
```

Expected: only the named application files are staged; the commit lands only after Steps 1–5 are green.

- [ ] **Step 7: Update all current product and execution documentation**

Document current policy outcomes, evidence classes, explicit non-admission, quality-advisory score neutrality, origin default-off behavior, legacy-metric preservation, matrix/application hashes, owner disposition, exact verification results, and self-scan receipt.

Apply the documentation contract by surface:

- `README.md`, `docs/ARCHITECTURE.md`, package README/architecture, MCP, scoring, and language-support docs describe the current runtime behavior and link to the immutable CAL-002 receipt.
- `docs/calibration/README.md`, `docs/methodology.md`, `docs/maths.md`, and `docs/rules.md` distinguish current CAL-002 evidence from v1-v10.1 historical origin metrics. Preserve historical numbers, but label them historical wherever they remain visible.
- `CONTRIBUTING.md` and the package contribution/example docs direct new rules to the current evidence-policy workflow, not direct edits to legacy signal-strength defaults.
- Replace `packages/slopbrick/ROADMAP.md` with a concise archived-roadmap notice and canonical link to root `ROADMAP.md`; do not maintain two live roadmaps.
- Regenerate `packages/slopbrick/docs/rule-catalog.md` from the applied policy. Do not hand-edit generated policy columns.
- Mark `packages/website/docs/blog/lifecycle-narrative.md` as a historical narrative and replace any unqualified current counts or calibration claims with current links.
- Do not rewrite historical execution plans, immutable evidence, dated experiment reports, or research papers. Their navigation pages must state that they are historical and non-authoritative.

Set index revision `27`, CAL-002 `done`, SB-UX-001 `done`, VAL-001 `ready`, and TEL-001 `ready`; implementation WIP becomes `0/2`. Keep REL-001 unchanged. Set TEL-001 as the next local implementation plan and make it consume the typed current evidence/outcome boundary without identity or source text.

- [ ] **Step 8: Validate canonical docs and staged scope**

```bash
corepack pnpm --filter slopbrick generate:rules:catalog -- --check
corepack pnpm --filter slopbrick exec vitest run tests/generated-docs-truth.test.ts --maxWorkers=1 --minWorkers=1
corepack pnpm plans:validate
node --test scripts/validate-execution-docs.test.mjs
rg -n -i "reliable AI detector|source of truth.*signal-strength|calibrated against.*AI-generated|precision.*genuinely AI-generated" \
  README.md CONTRIBUTING.md ROADMAP.md docs/ARCHITECTURE.md docs/calibration/README.md docs/maths.md docs/methodology.md docs/rules.md \
  packages/slopbrick/README.md packages/slopbrick/CONTRIBUTING.md packages/slopbrick/EXAMPLES.md packages/slopbrick/ROADMAP.md \
  packages/slopbrick/docs/MCP.md packages/slopbrick/docs/architecture.md packages/slopbrick/docs/calibration/README.md \
  packages/slopbrick/docs/language-support-matrix.md packages/slopbrick/docs/rule-catalog.md packages/slopbrick/docs/scoring-explained.md \
  packages/slopbrick/docs/scoring-runbook.md packages/website/docs/blog/lifecycle-narrative.md
git diff --check
git status --short
```

Expected: catalog check, documentation truth test, 17-plan validation, and all execution-doc tests pass; every targeted `rg` match is either removed or enclosed by an explicit historical/non-authoritative label; revision 27 agrees everywhere; WIP is `0/2`; and user-owned paths remain unstaged.

- [ ] **Step 9: Commit the truthful closeout**

```bash
git add README.md ROADMAP.md CONTRIBUTING.md docs/ARCHITECTURE.md docs/calibration/README.md docs/maths.md docs/methodology.md docs/rules.md packages/slopbrick/README.md packages/slopbrick/CHANGELOG.md packages/slopbrick/CONTRIBUTING.md packages/slopbrick/EXAMPLES.md packages/slopbrick/ROADMAP.md packages/slopbrick/docs/MCP.md packages/slopbrick/docs/architecture.md packages/slopbrick/docs/calibration/README.md packages/slopbrick/docs/language-support-matrix.md packages/slopbrick/docs/rule-catalog.md packages/slopbrick/docs/scoring-explained.md packages/slopbrick/docs/scoring-runbook.md packages/website/docs/blog/lifecycle-narrative.md docs/execution/index.json docs/execution/STATUS.md docs/execution/CHANGELOG.md docs/execution/plans/CAL-002-complete-calibration.md docs/execution/plans/SB-UX-001-first-scan.md docs/execution/plans/VAL-001-owner-validation.md docs/execution/plans/TEL-001-local-outcomes.md docs/execution/evidence/CAL-002-complete-calibration.md docs/execution/evidence/SB-UX-001-first-scan.md
git commit -m "docs(calibration): close complete evidence program"
```

---

## Final Verification Matrix

| Contract | Proof |
| --- | --- |
| Exact catalog | 119 unique current registry IDs; exact CAL-001/catalog hash agreement |
| Lane separation | One lane per rule; every transfer has closed reason and no dual denominator |
| Deterministic evidence | 32 explicit oracle declarations, mutation pairs, references, and five-family controls |
| Contextual evidence | Blinded 30/30 review with bounded 100/100 expansion and Wilson uncertainty |
| Statistical honesty | Review utility only; never defect precision, authorship, default-on, or safe repair |
| Review integrity | Four labels, authority-bound receipt, resume/idempotence, no raw source/path/identity |
| Origin honesty | Exact hash reuse or one-worker rerun; publisher polarity remains internal and non-admitted |
| Owner rows | All 40 prior owner-review-required rows have explicit dispositions |
| Matrix completeness | 119 unique final rows; no missing, duplicate, cross-lane, or conflicting policy |
| Atomic application | Dry-run/apply parity, exact approved matrix SHA, exclusive/atomic write, apply receipt |
| Legacy preservation | Historical signal-strength bytes and CAL-001 artifacts unchanged |
| Current provenance | Deterministic/current quality/internal origin/legacy/advisory/insufficient labels are distinct |
| Advisory safety | Visible in first scan, excluded from scores/gates, no safe-repair claim |
| Runtime policy | Origin default-off by default; explicit local opt-in does not upgrade provenance |
| Packaging | Static JSON bundled in CJS/ESM; package-local binary test passes |
| Baseline safety | Ordinary self-scan does not create or refresh score/debt baselines |
| Control-plane truth | Revision 27, CAL-002 and SB-UX done, VAL/TEL ready, WIP 0/2 |
| Release boundary | No push, tag, GitHub Release, npm publish, or website deployment |

## Rollback Boundaries

Rollback in reverse checkpoint order:

1. Revert documentation closeout and restore CAL-002/SB-UX to active if the owner comprehension receipt is invalid.
2. Revert runtime policy wiring and the generated policy artifact together; legacy signal-strength behavior remains available and unchanged.
3. Revert application while preserving immutable catalog, lane, review, quality, origin, and matrix evidence.
4. Re-run only a failed evidence row when its bound source/catalog/config hash changes; never rewrite an immutable completed receipt.
5. Revert CAL-002 implementation modules task-by-task without deleting CAL-001 evidence or SB-UX checkpoint documentation.

No rollback path deletes owner decisions, changes historical metrics, admits Corpus v1, refreshes a baseline, or implies release authority.
