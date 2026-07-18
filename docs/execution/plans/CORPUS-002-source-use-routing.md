# CORPUS-002 — Route Corpus v1 sources by evidence and permitted use

- **Status:** `done`
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

Hand the completed source disposition to VAL-001 without changing rule state.
