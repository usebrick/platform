# Corpus Source-Use Routing and Owner Validation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Route Corpus v1 sources to evidence-appropriate uses, preserve every current Mendeley and CAL-001 hash, replace near-term participant pilots with owner-only validation, and converge all active documentation on that truth.

**Architecture:** Add a pure SlopBrick source-policy module and a closed source registry, then make the existing Mendeley adapter prove that `calibration_evaluation` is permitted before candidate projection. Keep candidate rows and receipts byte-identical. Model source authority, integrity, rights, usefulness review, rule application, and redistribution as separate decisions; park GTM-001 while retaining its protocol as dormant history.

**Tech Stack:** TypeScript, Node.js 22/24 workspace policy, Vitest, canonical JSON/SHA-256 helpers already used by Corpus v1, Markdown execution plans, JSON execution index, and existing `corepack pnpm` quality gates.

## Global Constraints

- Preserve the current candidate manifest, leakage plan, source-binding receipt, smoke manifest/receipt, eligible manifest/receipt, CAL-001 smoke/holdout receipts, and CAL-001 decision-matrix hashes exactly.
- Keep `@usebrick/core` unchanged; add no schema, generated type, dependency, or package-version change.
- Keep Mendeley `publisher_attested`, `verified`, and `internal_analysis`; do not claim witnessed authorship, quality ground truth, public redistribution, or v10.3 gold admission.
- No source acquisition, network fetch, upload, publication, deployment, tag, push, or remote mutation.
- No threshold, score, default-state, or rule-activation change.
- No participant recruitment, consent collection, scheduling, or invented pilot evidence.
- Preserve completed CORPUS-001 and CAL-001 evidence, v10.3 evidence, old handoffs, historical plans, and historical changelog entries byte-for-byte.
- Update every active document that states current source, calibration, validation-owner, dependency, or next-action truth.
- Preserve unrelated `.astro/`, `.playwright-cli/`, `TODO.md`, `pet-runs/`, and `src/` paths.
- Use `corepack pnpm`; stage only task-owned files.

---

## File map

### New source-policy files

- `packages/slopbrick/src/calibration/corpus-v1/source-policy.ts` — pure source-state types, permitted-use derivation, claim ceiling, and fail-closed use assertion.
- `packages/slopbrick/src/calibration/corpus-v1/source-registry.ts` — closed reviewed registry for Mendeley and currently non-executable source dispositions.
- `packages/slopbrick/tests/calibration/corpus-v1-source-policy.test.ts` — policy matrix, registry, ordering, and fail-closed tests.

### Existing code files

- `packages/slopbrick/src/calibration/corpus-v1/inventory.ts` — attach the reviewed Mendeley disposition without changing existing inventory fields.
- `packages/slopbrick/src/calibration/corpus-v1/manifest.ts` — require `calibration_evaluation` before candidate bytes are projected.
- `packages/slopbrick/tests/calibration/corpus-v1-inventory.test.ts` — verify the Mendeley inventory exposes the reviewed disposition.
- `packages/slopbrick/tests/calibration/corpus-v1-manifest.test.ts` — existing regression suite exercised unchanged to prove the permitted Mendeley route preserves current candidate behavior.

### New execution-control files

- `docs/execution/plans/CORPUS-002-source-use-routing.md` — bounded implementation contract for the source router.
- `docs/execution/plans/VAL-001-owner-validation.md` — owner-only scan/usefulness/fix/rescan validation contract.
- `docs/execution/evidence/CORPUS-002-source-disposition.md` — completed source-routing receipt.
- `docs/execution/evidence/VAL-001-owner-validation.md` — honest empty owner-validation ledger that becomes evidence only when the owner records a real run.

### Execution authority to modify

- `docs/execution/index.json`
- `docs/execution/STATUS.md`
- `docs/execution/CHANGELOG.md`
- `docs/execution/plans/CORPUS-DEC-001-admission-contract.md`
- `docs/execution/plans/CORPUS-001-v1-seed.md`
- `docs/execution/plans/CAL-001-heldout-calibration.md`
- `docs/execution/plans/GTM-001-vibecoder-pilots.md`
- `docs/execution/plans/SB-UX-001-first-scan.md`
- `docs/execution/plans/TEL-001-local-outcomes.md`
- `docs/execution/plans/LOCK-001-new-debt-gate.md`
- `docs/execution/plans/ENT-001-demand-gate.md`
- `docs/execution/plans/SB-045-trust-release.md`
- `docs/execution/plans/DOC-PRUNE-001-approved-cleanup.md`
- `docs/research/vibecoder-pilots.md`

### Current product and package docs to modify

- `README.md`
- `ROADMAP.md`
- `docs/ARCHITECTURE.md`
- `docs/methodology.md`
- `docs/calibration/README.md`
- `docs/decisions/corpus-v1-admission.md`
- `packages/slopbrick/README.md`
- `packages/slopbrick/CHANGELOG.md`
- `packages/slopbrick/docs/calibration/README.md`
- `packages/slopbrick/docs/calibration/v0.45.0-continuation-plan.md`
- `packages/slopbrick/docs/calibration/rule-quality-review.md`
- `packages/slopbrick/docs/calibration/rules-literature-and-recommendations.md`

---

### Task 1: Enter CORPUS-002 and VAL-001 in the execution control plane

**Files:**
- Create: `docs/execution/plans/CORPUS-002-source-use-routing.md`
- Create: `docs/execution/plans/VAL-001-owner-validation.md`
- Create: `docs/execution/evidence/VAL-001-owner-validation.md`
- Modify: `docs/execution/index.json`
- Modify: `docs/execution/STATUS.md`
- Modify: `docs/execution/CHANGELOG.md`
- Modify: `docs/execution/plans/GTM-001-vibecoder-pilots.md`
- Modify: `docs/execution/plans/SB-UX-001-first-scan.md`
- Modify: `docs/execution/plans/TEL-001-local-outcomes.md`
- Modify: `docs/execution/plans/LOCK-001-new-debt-gate.md`
- Modify: `docs/execution/plans/ENT-001-demand-gate.md`
- Modify: `docs/execution/plans/SB-045-trust-release.md`
- Modify: `docs/execution/plans/DOC-PRUNE-001-approved-cleanup.md`
- Modify: `docs/research/vibecoder-pilots.md`

**Interfaces:**
- Consumes: accepted design `docs/superpowers/specs/2026-07-18-corpus-source-use-routing-design.md`, completed `CORPUS-001`, and completed `CAL-001`.
- Produces: indexed `CORPUS-002` in progress, indexed `VAL-001` ready, parked `GTM-001`, and no active dependency on `GTM-001`.

- [x] **Step 1: Create the CORPUS-002 bounded plan**

Write `docs/execution/plans/CORPUS-002-source-use-routing.md` with all validator-required headings and this exact contract:

```markdown
# CORPUS-002 — Route Corpus v1 sources by evidence and permitted use

- **Status:** `in_progress`
- **Priority:** 3
- **Track / lane:** implementation / corpus
- **Owner:** calibration maintainers
- **Updated:** 2026-07-18

## Outcome

Derive deterministic permitted uses from source authority, integrity, and rights without changing the current Mendeley or CAL-001 artifacts.

## Current truth

Mendeley v1 is already verified for publisher-attested internal origin analysis and calibration evaluation. It is not witnessed authorship, redistribution approval, quality ground truth, or v10.3 gold evidence.

## Scope

- Pure source-use policy and closed source registry in SlopBrick.
- Mendeley policy preflight before candidate projection.
- Exact preservation of all frozen Corpus v1 and CAL-001 hashes.
- Current-documentation convergence.

## Non-goals

- New source acquisition or adapters beyond reviewed registry dispositions.
- Core schema changes, redistribution, threshold changes, or rule activation.
- Mutation of v10.3 or completed evidence.

## Dependencies

- `requires`: `CORPUS-001`
- `benefitsFrom`: `CAL-001`

## Acceptance criteria

- Every registered source has one deterministic disposition and claim ceiling.
- Only verified publisher-attested or witnessed internal sources permit calibration evaluation.
- Mendeley and CAL-001 hashes remain unchanged.
- Active docs separate source use, redistribution, usefulness review, and rule application.

## Execution steps

1. Red-test the source policy matrix and registry.
2. Implement the pure policy and closed registry.
3. Route Mendeley through the policy without changing artifacts.
4. Converge active documentation and preserve historical evidence.
5. Run focused and recursive verification and record the receipt.

## Verification

Run focused Corpus v1 tests, opt-in real-source hash checks, execution-doc validation, recursive lint/typecheck/test/build, and `git diff --check`.

## Evidence destination

`docs/execution/evidence/CORPUS-002-source-disposition.md`

## Rollback

Remove the router and registry, restore direct Mendeley preflight, and retain all frozen evidence unchanged.

## Next action

Write the failing source-policy matrix test and prove the requested-use router does not yet exist.
```

- [x] **Step 2: Create the owner-only validation plan and honest empty ledger**

Write `docs/execution/plans/VAL-001-owner-validation.md` with this exact contract:

```markdown
# VAL-001 — Validate the scan-to-rescan loop with the repository owner

- **Status:** `ready`
- **Priority:** 13
- **Track / lane:** implementation / validation
- **Owner:** repository owner
- **Updated:** 2026-07-18

## Outcome

Record deterministic owner-run scan-to-finding-to-fix-to-rescan walkthroughs and explicit usefulness decisions without participant or market-demand claims.

## Current truth

The repository owner is the only current product tester. CAL-001 measured origin association but did not evaluate usefulness or apply rule changes. No owner walkthrough is recorded yet.

## Scope

- Owner-controlled repositories or deterministic fixtures only.
- First useful finding, comprehension, chosen action, fix, and rescan receipts.
- Explicit owner disposition for CAL-001 rows marked `owner-review-required`.

## Non-goals

- Participant recruitment, consent, scheduling, identity collection, or synthetic sessions.
- Claims about market demand, team usability, conversion, or willingness to pay.
- Automatic threshold, default-state, score, admission, publish, or release changes.

## Dependencies

- `requires`: `CAL-001`
- `benefitsFrom`: `CORPUS-002`

## Acceptance criteria

- Every recorded run is performed by the repository owner against an identified local repository or fixture.
- Every row binds scan and rescan receipts plus an explicit usefulness decision.
- Missing evidence remains blank rather than inferred.
- Product decisions remain separate from source labels and origin metrics.

## Execution steps

1. Select one owner-controlled repository or deterministic fixture.
2. Run the documented local scan and record its receipt.
3. Record the first finding considered useful or explicitly record that none was useful.
4. Apply or decline one bounded fix and record the reason.
5. Rescan and record the outcome.
6. Repeat only when the owner chooses another fixture; do not invent a target count.

## Verification

Check every ledger row for a real scan receipt, explicit owner decision, optional fix receipt, and rescan receipt. Reject synthetic or participant-derived rows.

## Evidence destination

`docs/execution/evidence/VAL-001-owner-validation.md`

## Rollback

Remove an invalid ledger row while retaining the underlying scan receipts; do not reinterpret it as participant or demand evidence.

## Next action

Run the first real owner-controlled scan walkthrough and record it only after the owner performs it.
```

Write `docs/execution/evidence/VAL-001-owner-validation.md` with:

```markdown
# VAL-001 owner-validation ledger

**Status:** ready; no owner walkthrough recorded
**Owner:** repository owner
**Participants:** none

This ledger is intentionally empty until the repository owner performs a real local scan, identifies a finding, records whether it is useful, applies or declines a fix, and rescans. It is not participant research, market-demand evidence, team validation, or calibration-label evidence.

| Run | Repository/fixture ID | Scan receipt | First useful finding | Owner decision | Fix receipt | Rescan receipt |
| --- | --- | --- | --- | --- | --- | --- |

No row may be added from a synthetic or inferred session.
```

- [x] **Step 3: Update the execution index atomically**

Set revision `19`, keep `updatedAt` `2026-07-18`, and apply these exact transitions:

```text
CORPUS-002: priority 3, status in_progress, requires CORPUS-001, benefitsFrom CAL-001
VAL-001: priority 13, status ready, requires CAL-001, benefitsFrom CORPUS-002
GTM-001: priority 14, status parked, no active next action or external gate
SB-UX-001 benefitsFrom: [VAL-001]
TEL-001 benefitsFrom: [VAL-001]
LOCK-001 benefitsFrom: [MEM-001, VAL-001]
ENT-001 requires: [LOCK-001]
ENT-001 externalGates: [future-external-demand-evidence]
```

Set CORPUS-002's next action to the focused policy test. Set VAL-001's next action to the first real owner walkthrough. Set GTM-001's next action to preserving the parked protocol unless the owner later authorizes external participant research.

- [x] **Step 4: Converge dependent execution plans and dormant pilot docs**

Apply these exact semantic changes:

```text
GTM-001: status parked; protocol retained; no recruitment planned.
SB-UX-001: replace the fixed five-participant gate with owner-run walkthroughs selected by the owner, with no invented target count.
TEL-001: benefit from owner validation rather than participant research.
LOCK-001: benefit from owner validation; future team adoption remains unproven.
ENT-001: remove GTM dependency; require future external-demand evidence.
SB-045 and DOC-PRUNE-001: remove statements that GTM recruitment is parallel work.
docs/research/vibecoder-pilots.md: mark template parked with zero sessions and no recruitment authorization.
```

- [x] **Step 5: Update STATUS and append revision 19**

`STATUS.md` must show implementation WIP `1/2` with `CORPUS-002`, company WIP `0/1`, GTM parked, VAL ready, and no participant recruitment next action. Add a revision 19 entry at the top of `docs/execution/CHANGELOG.md` stating that the owner approved source routing and sole-tester validation, no source bytes or completed evidence changed, and no participant or remote action occurred.

- [x] **Step 6: Run execution-doc validation**

Run:

```bash
corepack pnpm plans:validate
git diff --check
```

Expected: `execution docs valid: 15 plans, implementation 1/2, company 0/1`; `git diff --check` exits 0.

- [x] **Step 7: Commit the execution transition**

```bash
git add docs/execution/index.json docs/execution/STATUS.md docs/execution/CHANGELOG.md docs/execution/plans/CORPUS-002-source-use-routing.md docs/execution/plans/VAL-001-owner-validation.md docs/execution/evidence/VAL-001-owner-validation.md docs/execution/plans/GTM-001-vibecoder-pilots.md docs/execution/plans/SB-UX-001-first-scan.md docs/execution/plans/TEL-001-local-outcomes.md docs/execution/plans/LOCK-001-new-debt-gate.md docs/execution/plans/ENT-001-demand-gate.md docs/execution/plans/SB-045-trust-release.md docs/execution/plans/DOC-PRUNE-001-approved-cleanup.md docs/research/vibecoder-pilots.md
git commit -m "docs(execution): start source-use routing"
```

---

### Task 2: Add the pure source-use policy with a red-green cycle

**Files:**
- Create: `packages/slopbrick/src/calibration/corpus-v1/source-policy.ts`
- Create: `packages/slopbrick/tests/calibration/corpus-v1-source-policy.test.ts`

**Interfaces:**
- Consumes: no runtime dependencies beyond TypeScript built-ins.
- Produces: `deriveCorpusV1SourceDisposition(input)` and `assertCorpusV1SourceUse(disposition, requestedUse)` plus exported authority, integrity, rights, use, claim-ceiling, input, and disposition types.

- [x] **Step 1: Write the failing policy test**

Create `packages/slopbrick/tests/calibration/corpus-v1-source-policy.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import {
  assertCorpusV1SourceUse,
  deriveCorpusV1SourceDisposition,
  type CorpusV1SourcePolicyInput,
} from '../../src/calibration/corpus-v1/source-policy';

const source = (overrides: Partial<CorpusV1SourcePolicyInput> = {}): CorpusV1SourcePolicyInput => ({
  sourceId: 'fixture-source',
  authorityTier: 'publisher_attested',
  integrityStatus: 'verified',
  rightsDisposition: 'internal_analysis',
  ...overrides,
});

describe('Corpus v1 source-use policy', () => {
  it.each([
    ['witnessed', ['calibration_evaluation', 'origin_measurement'], 'witnessed-origin'],
    ['publisher_attested', ['calibration_evaluation', 'origin_measurement'], 'publisher-attested-origin'],
    ['repo_self_attested', ['ecological_validation'], 'repository-self-attested-ecology'],
    ['exposure_proxy', ['sensitivity_analysis'], 'exposure-proxy-sensitivity'],
    ['unknown', ['prevalence_analysis'], 'unlabeled-prevalence'],
  ] as const)('routes %s evidence deterministically', (authorityTier, permittedUses, claimCeiling) => {
    expect(deriveCorpusV1SourceDisposition(source({ authorityTier }))).toEqual({
      ...source({ authorityTier }),
      permittedUses,
      claimCeiling,
    });
  });

  it.each(['pending', 'quarantined'] as const)('denies executable use for %s integrity', (integrityStatus) => {
    expect(deriveCorpusV1SourceDisposition(source({ integrityStatus }))).toMatchObject({
      permittedUses: [],
      claimCeiling: 'no-executable-use',
    });
  });

  it('denies executable use for reference-only rights', () => {
    expect(deriveCorpusV1SourceDisposition(source({ rightsDisposition: 'reference_only' }))).toMatchObject({
      permittedUses: [],
      claimCeiling: 'no-executable-use',
    });
  });

  it('adds redistribution only to verified witnessed or publisher-attested sources with explicit approval', () => {
    expect(deriveCorpusV1SourceDisposition(source({ rightsDisposition: 'redistribution_approved' })).permittedUses)
      .toEqual(['calibration_evaluation', 'origin_measurement', 'redistribution']);
    expect(deriveCorpusV1SourceDisposition(source({
      authorityTier: 'repo_self_attested',
      rightsDisposition: 'redistribution_approved',
    })).permittedUses).toEqual(['ecological_validation']);
  });

  it('fails closed when a requested use is not permitted', () => {
    const disposition = deriveCorpusV1SourceDisposition(source({ authorityTier: 'unknown' }));
    expect(() => assertCorpusV1SourceUse(disposition, 'calibration_evaluation'))
      .toThrow('fixture-source does not permit calibration_evaluation');
  });

  it('rejects an empty source ID', () => {
    expect(() => deriveCorpusV1SourceDisposition(source({ sourceId: '' })))
      .toThrow('Corpus v1 sourceId must be a non-empty string');
  });
});
```

- [x] **Step 2: Run the focused test and verify red**

Run:

```bash
corepack pnpm --filter slopbrick exec vitest run tests/calibration/corpus-v1-source-policy.test.ts --maxWorkers=1 --minWorkers=1
```

Expected: FAIL because `source-policy.ts` does not exist.

- [x] **Step 3: Implement the pure policy**

Create `packages/slopbrick/src/calibration/corpus-v1/source-policy.ts`:

```ts
export type CorpusV1AuthorityTier =
  | 'witnessed'
  | 'publisher_attested'
  | 'repo_self_attested'
  | 'exposure_proxy'
  | 'unknown';

export type CorpusV1IntegrityStatus = 'verified' | 'pending' | 'quarantined';
export type CorpusV1RightsDisposition = 'internal_analysis' | 'reference_only' | 'redistribution_approved';
export type CorpusV1PermittedUse =
  | 'calibration_evaluation'
  | 'ecological_validation'
  | 'origin_measurement'
  | 'prevalence_analysis'
  | 'redistribution'
  | 'sensitivity_analysis';
export type CorpusV1ClaimCeiling =
  | 'witnessed-origin'
  | 'publisher-attested-origin'
  | 'repository-self-attested-ecology'
  | 'exposure-proxy-sensitivity'
  | 'unlabeled-prevalence'
  | 'no-executable-use';

export interface CorpusV1SourcePolicyInput {
  readonly sourceId: string;
  readonly authorityTier: CorpusV1AuthorityTier;
  readonly integrityStatus: CorpusV1IntegrityStatus;
  readonly rightsDisposition: CorpusV1RightsDisposition;
}

export interface CorpusV1SourceDisposition extends CorpusV1SourcePolicyInput {
  readonly permittedUses: readonly CorpusV1PermittedUse[];
  readonly claimCeiling: CorpusV1ClaimCeiling;
}

function executableUses(authorityTier: CorpusV1AuthorityTier): readonly CorpusV1PermittedUse[] {
  switch (authorityTier) {
    case 'witnessed':
    case 'publisher_attested':
      return ['calibration_evaluation', 'origin_measurement'];
    case 'repo_self_attested':
      return ['ecological_validation'];
    case 'exposure_proxy':
      return ['sensitivity_analysis'];
    case 'unknown':
      return ['prevalence_analysis'];
  }
}

function claimCeiling(authorityTier: CorpusV1AuthorityTier): Exclude<CorpusV1ClaimCeiling, 'no-executable-use'> {
  switch (authorityTier) {
    case 'witnessed': return 'witnessed-origin';
    case 'publisher_attested': return 'publisher-attested-origin';
    case 'repo_self_attested': return 'repository-self-attested-ecology';
    case 'exposure_proxy': return 'exposure-proxy-sensitivity';
    case 'unknown': return 'unlabeled-prevalence';
  }
}

export function deriveCorpusV1SourceDisposition(input: CorpusV1SourcePolicyInput): CorpusV1SourceDisposition {
  if (input.sourceId.length === 0) throw new TypeError('Corpus v1 sourceId must be a non-empty string');
  if (input.integrityStatus !== 'verified' || input.rightsDisposition === 'reference_only') {
    return { ...input, permittedUses: [], claimCeiling: 'no-executable-use' };
  }
  const permittedUses = [...executableUses(input.authorityTier)];
  if (
    input.rightsDisposition === 'redistribution_approved'
    && (input.authorityTier === 'witnessed' || input.authorityTier === 'publisher_attested')
  ) permittedUses.push('redistribution');
  permittedUses.sort();
  return { ...input, permittedUses, claimCeiling: claimCeiling(input.authorityTier) };
}

export function assertCorpusV1SourceUse(
  disposition: CorpusV1SourceDisposition,
  requestedUse: CorpusV1PermittedUse,
): void {
  if (!disposition.permittedUses.includes(requestedUse)) {
    throw new Error(`${disposition.sourceId} does not permit ${requestedUse}`);
  }
}
```

- [x] **Step 4: Run focused tests and typecheck**

```bash
corepack pnpm --filter slopbrick exec vitest run tests/calibration/corpus-v1-source-policy.test.ts --maxWorkers=1 --minWorkers=1
corepack pnpm --filter slopbrick typecheck
```

Expected: focused test PASS; typecheck exits 0.

- [x] **Step 5: Commit the policy**

```bash
git add packages/slopbrick/src/calibration/corpus-v1/source-policy.ts packages/slopbrick/tests/calibration/corpus-v1-source-policy.test.ts
git commit -m "feat(calibration): add source-use policy"
```

---

### Task 3: Add the closed registry and route Mendeley without hash drift

**Files:**
- Create: `packages/slopbrick/src/calibration/corpus-v1/source-registry.ts`
- Modify: `packages/slopbrick/tests/calibration/corpus-v1-source-policy.test.ts`
- Modify: `packages/slopbrick/src/calibration/corpus-v1/inventory.ts`
- Modify: `packages/slopbrick/src/calibration/corpus-v1/manifest.ts`
- Modify: `packages/slopbrick/tests/calibration/corpus-v1-inventory.test.ts`

**Interfaces:**
- Consumes: `deriveCorpusV1SourceDisposition`, `assertCorpusV1SourceUse`, and `CorpusV1SourceDisposition` from Task 2.
- Produces: `corpusV1SourceDisposition(sourceId)` and `sourceDisposition` on `MendeleyCorpusV1Inventory`; candidate row and receipt shapes remain unchanged.

- [x] **Step 1: Add failing registry and Mendeley expectations**

Extend `corpus-v1-source-policy.test.ts`:

```ts
import { corpusV1SourceDisposition } from '../../src/calibration/corpus-v1/source-registry';

it('registers the reviewed Mendeley source for internal calibration evaluation', () => {
  expect(corpusV1SourceDisposition('humanvsai-code-dataset-mendeley-v1')).toEqual({
    sourceId: 'humanvsai-code-dataset-mendeley-v1',
    authorityTier: 'publisher_attested',
    integrityStatus: 'verified',
    rightsDisposition: 'internal_analysis',
    permittedUses: ['calibration_evaluation', 'origin_measurement'],
    claimCeiling: 'publisher-attested-origin',
  });
});

it('keeps reviewed but incomplete sources non-executable', () => {
  expect(corpusV1SourceDisposition('formai-v1-gpt35-smoke-v1').permittedUses).toEqual([]);
  expect(corpusV1SourceDisposition('ossforge-humanvsaicode-hf-v1').permittedUses).toEqual([]);
  expect(corpusV1SourceDisposition('humaneval-gpt5-smoke-v1').permittedUses).toEqual([]);
});

it('rejects an unregistered source', () => {
  expect(() => corpusV1SourceDisposition('unregistered-source'))
    .toThrow('Corpus v1 source is not registered: unregistered-source');
});
```

Extend the portable inventory expectation with the exact `sourceDisposition` object above.

- [x] **Step 2: Run focused tests and verify red**

```bash
corepack pnpm --filter slopbrick exec vitest run tests/calibration/corpus-v1-source-policy.test.ts tests/calibration/corpus-v1-inventory.test.ts --maxWorkers=1 --minWorkers=1
```

Expected: FAIL because the registry and inventory disposition do not exist.

- [x] **Step 3: Implement the closed registry**

Create `source-registry.ts`:

```ts
import {
  deriveCorpusV1SourceDisposition,
  type CorpusV1SourceDisposition,
  type CorpusV1SourcePolicyInput,
} from './source-policy';

const SOURCE_POLICIES = {
  'humanvsai-code-dataset-mendeley-v1': {
    sourceId: 'humanvsai-code-dataset-mendeley-v1',
    authorityTier: 'publisher_attested',
    integrityStatus: 'verified',
    rightsDisposition: 'internal_analysis',
  },
  'formai-v1-gpt35-smoke-v1': {
    sourceId: 'formai-v1-gpt35-smoke-v1',
    authorityTier: 'repo_self_attested',
    integrityStatus: 'pending',
    rightsDisposition: 'internal_analysis',
  },
  'ossforge-humanvsaicode-hf-v1': {
    sourceId: 'ossforge-humanvsaicode-hf-v1',
    authorityTier: 'publisher_attested',
    integrityStatus: 'pending',
    rightsDisposition: 'reference_only',
  },
  'humaneval-gpt5-smoke-v1': {
    sourceId: 'humaneval-gpt5-smoke-v1',
    authorityTier: 'witnessed',
    integrityStatus: 'pending',
    rightsDisposition: 'reference_only',
  },
} as const satisfies Readonly<Record<string, CorpusV1SourcePolicyInput>>;

export function corpusV1SourceDisposition(sourceId: string): CorpusV1SourceDisposition {
  const policy = SOURCE_POLICIES[sourceId as keyof typeof SOURCE_POLICIES];
  if (policy === undefined) throw new Error(`Corpus v1 source is not registered: ${sourceId}`);
  return deriveCorpusV1SourceDisposition(policy);
}
```

- [x] **Step 4: Attach and enforce the Mendeley disposition**

In `inventory.ts`, import `CorpusV1SourceDisposition` and `corpusV1SourceDisposition`, add:

```ts
readonly sourceDisposition: CorpusV1SourceDisposition;
```

to `MendeleyCorpusV1Inventory`, derive the disposition after the pinned source identity checks, require its authority and rights to match the existing literals, and return it without changing any existing field.

In `manifest.ts`, import `assertCorpusV1SourceUse` and call:

```ts
assertCorpusV1SourceUse(inventory.sourceDisposition, 'calibration_evaluation');
```

immediately after `inventoryMendeleyCorpusV1(input)` and before resolving or reading projected unit bytes. Do not add policy fields to candidate rows, manifest headers, or receipts.

- [x] **Step 5: Run portable and real-source hash tests**

```bash
corepack pnpm --filter slopbrick exec vitest run tests/calibration/corpus-v1-source-policy.test.ts tests/calibration/corpus-v1-inventory.test.ts tests/calibration/corpus-v1-manifest.test.ts tests/calibration/corpus-v1-plan.test.ts tests/calibration/corpus-v1-source-binding.test.ts tests/calibration/corpus-v1-smoke.test.ts tests/calibration/corpus-v1-eligible.test.ts --maxWorkers=1 --minWorkers=1
SLOPBRICK_CORPUS_V1_ROOT=/Users/cheng/corpus-expansion/v10.3 corepack pnpm --filter slopbrick exec vitest run tests/calibration/corpus-v1-inventory.test.ts tests/calibration/corpus-v1-manifest.test.ts tests/calibration/corpus-v1-plan.test.ts tests/calibration/corpus-v1-source-binding.test.ts tests/calibration/corpus-v1-smoke.test.ts tests/calibration/corpus-v1-eligible.test.ts --maxWorkers=1 --minWorkers=1
corepack pnpm --filter slopbrick typecheck
```

Expected: all focused tests pass; real outputs retain the frozen hashes in `calibration-inputs.ts`; typecheck exits 0.

- [x] **Step 6: Commit the registry and Mendeley route**

```bash
git add packages/slopbrick/src/calibration/corpus-v1/source-registry.ts packages/slopbrick/src/calibration/corpus-v1/inventory.ts packages/slopbrick/src/calibration/corpus-v1/manifest.ts packages/slopbrick/tests/calibration/corpus-v1-source-policy.test.ts packages/slopbrick/tests/calibration/corpus-v1-inventory.test.ts
git commit -m "feat(calibration): route Corpus v1 source use"
```

---

### Task 4: Converge all active product, calibration, and package documentation

**Files:**
- Modify every file listed under “Current product and package docs to modify”.
- Modify: `docs/execution/plans/CORPUS-DEC-001-admission-contract.md`
- Modify: `docs/execution/plans/CORPUS-001-v1-seed.md`
- Modify: `docs/execution/plans/CAL-001-heldout-calibration.md`

**Interfaces:**
- Consumes: CORPUS-002 policy names and source dispositions from Tasks 2-3.
- Produces: one current source/calibration/validation narrative with historical artifacts left intact.

- [ ] **Step 1: Establish the canonical current wording**

Use this paragraph, adapted only for surrounding grammar, in the root/package current-state docs:

```markdown
Corpus v1 currently uses the pinned Mendeley HumanVSAI_CodeDataset v1 for publisher-attested internal origin analysis and calibration evaluation. Its 5,000 AI / 5,000 Human labels are publisher claims bound to exact local bytes, family-safe splits, and collision checks; they are not witnessed authorship or quality labels. The source is not approved for public redistribution, and its use does not admit v10.3 data or activate a rule.
```

Use this validation paragraph wherever current pilot work was previously described:

```markdown
The repository owner is the only current product tester. Near-term validation uses deterministic owner-run scan-to-finding-to-fix-to-rescan walkthroughs under VAL-001. No participant recruitment or five-pilot gate is active; future team and market-demand evidence remains unproven.
```

- [ ] **Step 2: Update roadmap and root current-state docs**

In `ROADMAP.md`:

- Replace the current five-vibecoder-pilot outcome and exit gate with VAL-001 owner walkthroughs.
- Keep vibecoders as the entry point and main door.
- Keep future LockBrick/team and enterprise demand gates explicitly future and unproven.
- Change scanner-trust wording from participant pilots to owner validation plus deterministic precision evidence.

In `README.md`, `docs/ARCHITECTURE.md`, `docs/methodology.md`, and `docs/calibration/README.md`, add the canonical source paragraph and distinguish:

```text
source permitted use != v10.3 gold admission
source permitted use != redistribution approval
source permitted use != usefulness review
source permitted use != rule application
```

- [ ] **Step 3: Update the Corpus v1 ADR and completed plan summaries**

In `docs/decisions/corpus-v1-admission.md`, add a “Source use is not rule admission” section with the four inequalities above and point to CORPUS-002. Do not change the pinned source hashes or allowed-claims block.

In `CORPUS-DEC-001`, `CORPUS-001`, and `CAL-001` plan summaries, replace overloaded `non-admitting` prose with precise statements about v10.3, redistribution, usefulness, and `applied: false`. Keep statuses and completed evidence unchanged.

- [ ] **Step 4: Update package docs and additive changelog**

Apply the canonical source paragraph to `packages/slopbrick/README.md` and `packages/slopbrick/docs/calibration/README.md`. Add an unreleased `0.45.0` changelog bullet stating that evidence-tiered source routing was added without changing current Corpus v1/CAL hashes or rule defaults.

Mark `v0.45.0-continuation-plan.md` as historical/superseded for scheduling, pointing to `docs/execution/index.json`, `STATUS.md`, CORPUS-002, and VAL-001. Update the supersession headers in `rule-quality-review.md` and `rules-literature-and-recommendations.md` so they no longer present v10.3 admission as the active prerequisite for current internal Corpus v1 analysis. Preserve all dated bodies and historical verdicts.

- [ ] **Step 5: Run active-doc stale-truth searches**

Run:

```bash
rg -n -i "recruit the first five|five vibecoder|first real scheduled pilot|Start GTM-001|GTM-001.*ready" README.md ROADMAP.md docs/execution docs/calibration docs/methodology.md docs/ARCHITECTURE.md packages/slopbrick/README.md packages/slopbrick/docs/calibration/README.md
rg -n -i "non-admitting|v10\.3|publisher_attested|publisher-attested|participant" README.md ROADMAP.md docs packages/slopbrick/README.md packages/slopbrick/docs --glob '*.md'
```

Expected: the first command returns no active-current claim. Review every second-command hit; each must agree with current authority or be inside a clearly historical, frozen, parked, or research-only section.

- [ ] **Step 6: Validate docs and commit convergence**

```bash
corepack pnpm plans:validate
git diff --check
git add README.md ROADMAP.md docs/ARCHITECTURE.md docs/methodology.md docs/calibration/README.md docs/decisions/corpus-v1-admission.md docs/execution/plans/CORPUS-DEC-001-admission-contract.md docs/execution/plans/CORPUS-001-v1-seed.md docs/execution/plans/CAL-001-heldout-calibration.md packages/slopbrick/README.md packages/slopbrick/CHANGELOG.md packages/slopbrick/docs/calibration/README.md packages/slopbrick/docs/calibration/v0.45.0-continuation-plan.md packages/slopbrick/docs/calibration/rule-quality-review.md packages/slopbrick/docs/calibration/rules-literature-and-recommendations.md
git commit -m "docs: converge source and validation truth"
```

Expected: plan validation and whitespace checks pass; only current docs are committed.

---

### Task 5: Verify the complete change and close CORPUS-002

**Files:**
- Create: `docs/execution/evidence/CORPUS-002-source-disposition.md`
- Modify: `docs/execution/plans/CORPUS-002-source-use-routing.md`
- Modify: `docs/execution/index.json`
- Modify: `docs/execution/STATUS.md`
- Modify: `docs/execution/CHANGELOG.md`

**Interfaces:**
- Consumes: completed policy, registry, Mendeley route, active-doc convergence, and unchanged frozen hashes.
- Produces: CORPUS-002 done at execution revision 20, VAL-001 ready, and a final verification receipt.

- [ ] **Step 1: Run focused Corpus v1 verification**

```bash
corepack pnpm --filter slopbrick exec vitest run tests/calibration/corpus-v1-source-policy.test.ts tests/calibration/corpus-v1-inventory.test.ts tests/calibration/corpus-v1-manifest.test.ts tests/calibration/corpus-v1-plan.test.ts tests/calibration/corpus-v1-source-binding.test.ts tests/calibration/corpus-v1-smoke.test.ts tests/calibration/corpus-v1-eligible.test.ts tests/calibration/corpus-v1-calibration-smoke.test.ts tests/calibration/corpus-v1-calibration-holdout.test.ts tests/calibration/corpus-v1-calibration-decisions.test.ts --maxWorkers=1 --minWorkers=1
SLOPBRICK_CORPUS_V1_ROOT=/Users/cheng/corpus-expansion/v10.3 corepack pnpm --filter slopbrick exec vitest run tests/calibration/corpus-v1-inventory.test.ts tests/calibration/corpus-v1-manifest.test.ts tests/calibration/corpus-v1-plan.test.ts tests/calibration/corpus-v1-source-binding.test.ts tests/calibration/corpus-v1-smoke.test.ts tests/calibration/corpus-v1-eligible.test.ts --maxWorkers=1 --minWorkers=1
```

Expected: all focused tests pass and the Mendeley hashes equal `CAL001_FROZEN_INPUT_HASHES`.

- [ ] **Step 2: Run repository-wide gates**

Run serially:

```bash
corepack pnpm plans:validate
corepack pnpm -r lint
corepack pnpm -r typecheck
corepack pnpm -r test
corepack pnpm -r build
git diff --check
```

Expected: every command exits 0; build may emit only the existing non-fatal Zod declaration-bundling warnings; no tracked generated-file drift remains.

- [ ] **Step 3: Write the CORPUS-002 evidence receipt**

Create `docs/execution/evidence/CORPUS-002-source-disposition.md` with:

```markdown
# CORPUS-002 source-use routing receipt

**Recorded:** 2026-07-18
**Disposition:** complete

## Source routing

| Source | Authority | Integrity | Rights | Permitted executable use |
| --- | --- | --- | --- | --- |
| Mendeley HumanVSAI v1 | publisher_attested | verified | internal_analysis | origin_measurement, calibration_evaluation |
| FormAI v1 bounded projection | repo_self_attested | pending | internal_analysis | none |
| OSSForge HumanVsAICode | publisher_attested | pending | reference_only | none |
| Controlled HumanEval GPT-5 | witnessed | pending | reference_only | none |

## Frozen artifact preservation

| Artifact | SHA-256 |
| --- | --- |
| CAL-001 protocol | `d78ceb22bd2d3a2bc91676d93facd7003af6c1b8351fdf773139a138bd1f1528` |
| Candidate manifest | `c15d3cbc95f251b5a0514da14b3f8a90e26124fbfb7db5ce342a873635b383ac` |
| Leakage plan | `9c4638526e9a4161d3e74f70197f0b25717439e6bd477bef98664a03c9a9219c` |
| Source-binding receipt | `47bd66907ec2efa67da718e0cfb38458151ca84d3cdedc941488fe4b001475ac` |
| Eligible manifest | `286134799c7f75837a7c292f0d18721d8da9263c25c041eef0ac4734801b52d8` |
| Eligible receipt | `9f5274f57ed4adf9d1c1ef55205493e9a833abc86cb8e1ca2b332cd8c72d28ba` |
| Smoke manifest | `bdbcd43279077fa760ae3c99da05b953c38134022fa34626b69a6b6400be00de` |
| Smoke receipt | `ccd74f7b9db49adc802c042df0d7b732d8284d2bbfc4e6ec39e6a1c001c60830` |

Run the focused real-source command before writing the receipt. Report its exact observed test-file and test counts, then confirm that it reproduced all eight values without source mutation.

## Verification

Report the exact observed focused-test result, recursive lint/typecheck/test/build exits, plan-validation result, known build warnings, and `git diff --check` result. State explicitly that no source acquisition, redistribution, rule-state change, participant research, publish, deploy, tag, push, or remote mutation occurred.
```

Write only observed results in the receipt; do not copy these planning instructions into the evidence file.

- [ ] **Step 4: Complete CORPUS-002 in execution authority**

Set CORPUS-002 plan status to `done`, index revision to `20`, CORPUS-002 status to `done`, and its next action to handing the completed source disposition to VAL-001 without changing rule state. Keep VAL-001 `ready`, GTM-001 `parked`, implementation WIP `0/2`, and company WIP `0/1`. Update STATUS consistently and prepend revision 20 to the execution changelog.

- [ ] **Step 5: Revalidate final execution docs and staged scope**

```bash
corepack pnpm plans:validate
git diff --check
git status --short --untracked-files=all
```

Expected: `execution docs valid: 15 plans, implementation 0/2, company 0/1`; only CORPUS-002 completion/evidence files are tracked changes; unrelated untracked files are untouched.

- [ ] **Step 6: Commit completion**

```bash
git add docs/execution/evidence/CORPUS-002-source-disposition.md docs/execution/plans/CORPUS-002-source-use-routing.md docs/execution/index.json docs/execution/STATUS.md docs/execution/CHANGELOG.md
git commit -m "docs(execution): complete source-use routing"
```

- [ ] **Step 7: Review the final commit range**

```bash
git log --oneline fb9729b0c..HEAD
git diff --stat fb9729b0c..HEAD
git diff --check fb9729b0c..HEAD
```

Expected: design-plan, execution transition, source-policy, Mendeley-route, documentation-convergence, and completion commits only; final diff check exits 0.
