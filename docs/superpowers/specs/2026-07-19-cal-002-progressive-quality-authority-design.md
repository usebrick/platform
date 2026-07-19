# CAL-002 progressive quality authority design amendment

- **Status:** written specification approved by the repository owner on
  2026-07-19
- **Date:** 2026-07-19
- **Repository:** `usebrick/platform`
- **Amends:** `2026-07-18-complete-calibration-program-design.md`
- **Current implementation boundary:** CAL-002 through `e6c9695ea`
- **Implementation authority:** none until the replacement detailed plan is
  reviewed and approved
- **Preserves:** frozen CAL-001 evidence, current CAL-002 receipts, non-admission,
  local-only owner authority, release separation, and user-owned paths

## Decision

Adopt **progressive quality authority** for CAL-002.

> SlopBrick analyzes software quality across all code. AI association is
> provenance and prioritization metadata, never authorship proof and never
> sufficient finding, score, or gate authority.

The forty unresolved owner-review rows are not one homogeneous origin-rule
set. Source and standards review supports four different actions:

| Action | Count | Meaning |
| --- | ---: | --- |
| Transfer now | 26 | The current concern has a defensible quality claim: 9 use deterministic or standards evidence and 17 use contextual review. |
| Repair or bind a project contract first | 4 | The intended concern may be useful, but the current detector, scope, or advice cannot support sampling. |
| Supersede after parity | 3 | A canonical replacement exists, but removal waits for explicit unique-coverage disposition and a parity receipt. |
| Retire the current rule | 7 | The current implementation has no defensible quality claim or requires a fundamentally new detector. |

Transfer is semantic classification, not activation. Every transferred row
remains governed by claim-matched evidence and the atomic application gate.
No row becomes default-on merely because this design calls it quality-related.

## Why the approved CAL-002 design needs an amendment

The CAL-002 v1 owner prompt can record only `hold-origin-default-off`,
`transfer-to-quality`, or `retire`. It cannot distinguish a valid but
unmeasured quality candidate from a sampled failure, a detector that needs
repair from one that needs repository-wide context, or retirement from
parity-bound replacement.

That missing vocabulary became material during the first owner decision. The
local state now contains one durable `ai/any-density` hold under the v1 prompt.
Continuing the forty-row questionnaire would encode known semantic problems as
generic holds or retirements and would create avoidable labeling work.

The approved matrix also changes the workload. CAL-002 begins with 15
contextual or statistical quality rows. Transferring all 17 contextual rows in
this amendment would create 32 manually reviewed rules:

- initial 30 findings plus 30 controls: `32 * 60 = 1,920` labels;
- maximum 100 findings plus 100 controls: `32 * 200 = 6,400` labels; and
- a bounded four-rule cohort: 240 initial labels, 800 at maximum expansion.

The repository owner is the only tester. CAL-002 therefore needs a truthful
zero-label classification closeout and optional later measurement cohorts.
Unrequested measurement is not failed or insufficient evidence; it is a
separate state.

## Scope and whole-catalog effect

This amendment classifies all forty CAL-001 owner-review-required rows. It does
not silently rewrite the other 79 catalog rows.

After the approved forty-row classification, the 119 current IDs project as:

| Catalog state | Count | Authority |
| --- | ---: | --- |
| Starting quality rows | 47 | Existing CAL-002 quality classification; still subject to claim-matched evidence. |
| Newly transferred quality rows | 26 | This amendment; 9 deterministic/standards and 17 contextual. |
| Repair or project-contract required | 4 | Disabled and assignment-ineligible until a reviewed repair changes readiness. |
| Parity-bound supersessions | 3 | Historical IDs retained until replacement parity is proven. |
| Retired current rules | 7 | Tombstoned for explainability and removed from runnable policy. |
| Existing research-origin holds | 32 | Default-off, score-neutral, gate-neutral, and not quality-endorsed. |

The counts total 119. A rule may remain in the catalog for historical
explainability without being an active SlopBrick quality rule. Before atomic
application, every rule runnable as a quality diagnostic and every repairable
quality row must have a quality domain and claim class. A research-origin hold
may remain only audit-only and default-off; it cannot be presented as a quality
finding.

## Orthogonal classification model

CAL-002 v2 separates facts that v1 currently compresses into lane and outcome.
Field names may be implemented as additive local-schema fields, but their
semantics are fixed by this design.

### 1. Quality domain

`qualityDomain` states the user-relevant concern independently of category or
AI association. The initial vocabulary is:

- `security`
- `accessibility`
- `correctness`
- `reliability`
- `performance`
- `maintainability`
- `documentation-quality`
- `type-safety`
- `resource-safety`
- `test-confidence`
- `architecture-consistency`
- `observability`
- `design-system-coherence`
- `completeness`
- `none`

One primary domain is required. Optional secondary facets may explain a
cross-cutting concern, but cannot change evidence or runtime authority.
`qualityDomain: none` is valid only for research-origin or retired current
implementations.

### 2. Claim class

`claimClass` states what the implementation can legitimately claim:

- `language-or-security-contract`
- `accessibility-standard`
- `repository-contract`
- `deterministic-syntax-or-dataflow`
- `contextual-heuristic`
- `statistical-review-signal`
- `no-valid-quality-claim`

Paths, category names, `aiSpecific`, legacy lift, and source polarity cannot
select or elevate this field. A detector whose message exceeds its observable
scope fails the class even when the underlying concern is real.

### 3. Readiness

`readiness` controls what work is legal next:

- `evidence-ready` — claim and detector are coherent enough for their declared
  evidence path;
- `repair-required` — implementation, message, or advice must change before
  assignment or evidence generation;
- `project-contract-required` — a repository-level index or declared contract
  is required before the claim can be evaluated;
- `parity-required` — a replacement exists, but supersession is incomplete;
- `research-only` — retained only for non-admitting origin analysis and never
  eligible for quality evidence; and
- `obsolete` — the current rule cannot enter current quality evidence.

Only `evidence-ready` rows may generate deterministic or blinded quality
evidence. Readiness changes require a reviewed implementation commit and a new
bound artifact; no CLI choice can waive the prerequisite.

### 4. Runtime outcome

`runtimeOutcome` is emitted by the reducer/application layer, not inferred from
classification alone:

- `default-on`
- `quality-advisory`
- `quality-candidate-default-off`
- `default-off`
- `insufficient-evidence`
- `superseded`
- `retired`

`quality-candidate-default-off` means the quality concern was accepted but
owner measurement was not requested. It is distinct from a measured failure
and from `insufficient-evidence`. It is disabled, score-neutral, gate-neutral,
and carries no safe-repair claim.

### Independent AI association metadata

`aiAssociation` preserves current or historical source, lift, measurement
date, protocol, and claim ceiling when available. It does not choose
`qualityDomain`, `claimClass`, `readiness`, or `runtimeOutcome`. It cannot make
a rule default-on, score-eligible, gate-eligible, or an authorship detector.
Legacy origin metrics remain in a historical namespace and cannot satisfy
current quality evidence.

## Approved forty-row matrix

### Transfer now: deterministic or standards evidence (9)

These rows have a defensible contract-backed or deterministic quality claim.
They become `evidence-ready`; they do not become default-on until their exact
positive, negative, adversarial, and five-family control oracles pass.

| Rule | Quality domain | Claim class | Why this path is defensible |
| --- | --- | --- | --- |
| `cpp/c-style-cast` | type-safety | language-or-security-contract | C++ guidance directly discourages C-style casts; comment, macro, and generated-code controls still test detector fit. |
| `cpp/raw-new-delete` | resource-safety | language-or-security-contract | Naked allocation/deletion has a direct resource-management contract; ownership and placement-new cases require controls. |
| `dead/unreachable` | correctness | deterministic-syntax-or-dataflow | Provably unreachable statements have compiler/linter analogues; control-flow edge cases remain implementation evidence. |
| `dead/unused-import` | maintainability | deterministic-syntax-or-dataflow | Unused-binding semantics are testable, including type-only and side-effect imports. |
| `dead/unused-local` | maintainability | deterministic-syntax-or-dataflow | Function-local unread bindings are testable without an owner usefulness label. |
| `dead/unused-parameter` | maintainability | deterministic-syntax-or-dataflow | Unread parameters are testable with callback, interface, override, and underscore controls. |
| `rust/todo-macro` | completeness | language-or-security-contract | A production `todo!()` or `unimplemented!()` path is explicitly incomplete; test and intentional-stub exclusions are required. |
| `security/hardcoded-secret` | security | language-or-security-contract | Secret material in source has a direct security basis; examples, comments, placeholders, and previews require adversarial controls. |
| `security/sql-construction` | security | language-or-security-contract | Parameterization is the contract; safe dynamic identifiers and query-builder cases require negative controls. |

### Transfer now: contextual quality evidence (17)

These rows express real quality concerns, but threshold or context determines
usefulness. They become `evidence-ready` quality candidates. Unless the owner
later selects them for blinded measurement, they close as
`quality-candidate-default-off` with no labels.

| Rule | Quality domain | Claim class | Evidence ceiling |
| --- | --- | --- | --- |
| `ai/any-density` | type-safety | contextual-heuristic | Dense `any` can weaken type checking; per-file count alone is only a review trigger. |
| `ai/console-debug-storm` | observability | contextual-heuristic | Debug noise can be actionable after excluding tests and structured logging. |
| `ai/fetch-default-overuse` | architecture-consistency | contextual-heuristic | Repeated direct fetches can reveal missing shared reliability policy, but direct fetch is valid. |
| `ai/state-default-overuse` | maintainability | contextual-heuristic | Many state cells can indicate duplicated or contradictory state, not a universal defect. |
| `ai/tailwind-color-overuse` | design-system-coherence | contextual-heuristic | Default palette use is meaningful only against tokens and product intent. |
| `component/giant-component` | maintainability | contextual-heuristic | Size and branching are review triggers, not deterministic responsibility violations. |
| `cpp/magic-numbers` | maintainability | contextual-heuristic | Named constants may improve intent; many domain literals are appropriate. |
| `cpp/printf-debug` | observability | contextual-heuristic | Debug output can be noise, while deliberate console output remains valid. |
| `dead/dead-branch` | correctness | contextual-heuristic | Literal dead branches are decidable, but the detector also reaches legitimate infinite loops. |
| `logic/reactive-hook-soup` | maintainability | contextual-heuristic | Unnecessary effects can be harmful; multiple effects can also represent valid external synchronization. |
| `logic/zombie-state` | maintainability | contextual-heuristic | Unread state resembles dead storage, but callback and analysis visibility affect certainty. |
| `rust/stringly-typed` | type-safety | contextual-heuristic | Existing enums can make strings suspicious; semantic compatibility requires review. |
| `rust/unwrap-in-production` | reliability | contextual-heuristic | `unwrap` is a restriction concern selected case by case, not a universal defect. |
| `security/dangerous-cors` | security | contextual-heuristic | Wildcard or reflective CORS can be dangerous; public credential-free APIs can intentionally permit it. |
| `security/fail-open-auth` | security | contextual-heuristic | Fail-open behavior is unsafe when auth-critical; current syntax alone may not prove that context. |
| `test/duplicate-setup` | test-confidence | contextual-heuristic | Duplicate setup can be a smell, while local repetition can be clearer than abstraction. |
| `visual/arbitrary-escape` | design-system-coherence | contextual-heuristic | Repeated arbitrary values can reveal missing tokens; intentional arbitrary values remain supported. |

### Repair or project contract first (4)

These concerns are not eligible for sampling. A repair may later produce a new
`evidence-ready` revision, but CAL-002 can close them default-off without
speculative implementation.

| Rule | Quality domain | Claim class | Readiness | Required correction |
| --- | --- | --- | --- | --- |
| `logic/ghost-defensive` | maintainability | contextual-heuristic | repair-required | Add type-aware proof or narrow the message; current facts cannot establish that guarded cases are impossible, and the advice can contradict the observation. |
| `logic/optimistic-no-rollback` | correctness | contextual-heuristic | repair-required | Model a real reconciliation/rollback path and replace the no-op `set(prev => prev)` advice; current citations do not validate the detector. |
| `product/ux-pattern-fragmentation` | architecture-consistency | contextual-heuristic | project-contract-required | Implement project-wide indexing and bind it to a declared UX/component contract; file-local name counts cannot support a codebase-wide claim. |
| `test/weak-assertion` | test-confidence | deterministic-syntax-or-dataflow | repair-required | Split a deterministic no-assertion/tautology core from contextual assertion-specificity review; do not classify legitimate matchers broadly as weak. |

### Supersede only after parity (3)

Supersession is not retirement by another name. Each row remains unresolved
until a canonical replacement accounts for unique behavior and the parity
artifact is reviewed.

| Rule | Replacement | Quality domain | Claim class | Unique-coverage requirement |
| --- | --- | --- | --- | --- |
| `logic/math-any-density` | `ai/any-density` | type-safety | contextual-heuristic | Compare construct reach and retain only useful unique cases; resolve threshold/documentation drift. |
| `logic/math-console-log-storm` | `ai/console-debug-storm` | observability | contextual-heuristic | Decide whether window clustering adds useful coverage after test/logger guards. |
| `db/sql-concat` | `security/sql-construction` | security | language-or-security-contract | Port or explicitly reject the unique `WITH` query coverage before removal. |

A supersession record requires all of:

- `replacementRuleId`;
- `parityReceiptSha256`;
- `migrationCommitSha`; and
- `uniqueCoverageDisposition`, one of `ported`, `rejected-as-false-positive`,
  or `split-to-new-rule` with the new rule ID.

Until all fields validate, the old ID cannot emit `superseded`, cannot be
removed from compatibility metadata, and cannot silently delegate to the
replacement. Once applied, it is non-runnable and non-scoreable, with a
tombstone pointing to the replacement.

### Retire the current rule (7)

These rows receive `qualityDomain: none`,
`claimClass: no-valid-quality-claim`, `readiness: obsolete`, and final
`runtimeOutcome: retired`. Retirement preserves a reasoned tombstone but no
local opt-in as an endorsed diagnostic.

| Rule | Why the current rule retires |
| --- | --- |
| `ai/renyi-profile` | The cited QA/RAG token-logprob hallucination method does not validate identifier-frequency classification in source files. |
| `component/shadcn-prop-mismatch` | The detector does not resolve a shadcn import, installed version, or registry schema, so it cannot prove a prop mismatch. A future library-contract detector would be new work. |
| `layout/math-element-uniformity` | Similar element counts do not establish a quality defect or validated origin signal, and the documented severity does not match runtime behavior. |
| `logic/math-gini-class-usage` | Gini mathematics measures concentration but does not make class repetition defective; repetition can be intentional design-system coherence. |
| `rust/unused-pub-fn` | No in-file reference cannot establish that a public API is unused by other modules or consumers. A future whole-crate detector would be new work. |
| `test/fake-placeholder` | Stable fixtures, sentinel values, and reserved example domains are often intentional and do not establish weak tests. |
| `visual/naturalness-anomaly` | The cited natural-code research does not validate a human-versus-LLM identifier-diversity threshold, and the documented and enforced thresholds differ. |

## Owner-state revision and immutability

The existing private `cal-002-origin-state-v1` file remains byte-identical. Its
recorded `ai/any-density` hold is historical evidence of a choice made under
the old prompt, not the approved final classification.

The amended workflow creates a new versioned classification state. It must:

1. bind the current catalog and protocol hashes;
2. bind `priorStateSha256` to the exact v1 state when one exists;
3. store the approved forty-row batch as a new revision rather than editing v1;
4. record `reviewerAuthority: repository-owner` without personal identity;
5. keep raw source, snippets, absolute paths, and repository identities out of
   durable receipts; and
6. emit a canonical immutable receipt with `admitted: false`.

The classification destination vocabulary is `quality`, `research-origin`,
`superseded`, or `retired`. Quality rows additionally carry quality domain,
claim class, readiness, and evidence class. Repair and project-contract rows
use destination `quality` but remain assignment-ineligible. Superseded rows
carry the replacement contract. Retired rows carry a bounded obsolete reason.

The existing 32 auto-held origin rows remain `research-origin`. The new batch
supersedes the prior `ai/any-density` hold explicitly through the prior-state
hash; it must never make the old choice disappear from history.

## Measurement and reducer behavior

### Zero-label closeout

Classification approval may complete without contextual labels. Every
unselected contextual or statistical quality row emits:

- `measurementStatus: not-requested-owner-capacity`;
- `runtimeOutcome: quality-candidate-default-off`;
- zero finding/control/cannot-determine counts;
- no Wilson interval;
- no current precision, recall, usefulness, or repair claim; and
- disabled, score-neutral, gate-neutral runtime effects.

This state is not `failed`, `unavailable`, or `insufficient-evidence`. Those
terms imply an attempted or impossible measurement. No owner label may be
inferred from the classification batch, source polarity, path, detector fire,
or an earlier origin decision.

### Optional progressive cohort

After classification closure, the owner may select an independently
checkpointed cohort. Reach analysis runs before selection. A useful candidate
cohort may include security, type-safety, and maintainability concerns, but the
exact four IDs are not fixed by this design because source reach and matched
controls must be measured first.

Selected rows retain the existing deterministic sampling, blinded locator,
per-rule exclusion, matched-strata, family-reach, replay, closed-label, Wilson,
and 30/30-to-100/100 expansion controls. A cohort can stop between rules. Its
completion is evidence enrichment, not a prerequisite for classification,
roadmap planning, documentation truth, or local policy closeout.

### Runtime authority table

| State | Enabled by default | Score/gate eligible | Runnable by explicit diagnostic opt-in | Provenance |
| --- | --- | --- | --- | --- |
| Oracle-passed deterministic/standards | yes | yes | yes | current deterministic quality evidence |
| Wilson-passed contextual | yes | yes | yes | current quality-calibrated evidence |
| Review-utility-only contextual/statistical | no | no | yes | current quality advisory |
| Unmeasured quality candidate | no | no | yes | accepted quality claim, measurement not requested |
| Repair/project-contract required | no | no | no | blocked quality candidate |
| Research-origin hold | no | no | yes, audit-only | internal origin association, non-admitted |
| Superseded | no | no | no | replacement tombstone |
| Retired | no | no | no | retirement tombstone |

Statistical evidence can never produce `default-on`. Origin evidence can never
produce quality authority. An oracle failure remains a completed default-off
result; it cannot be repaired by changing a threshold inside the evidence run.

## Atomic application boundary

This design and its classification receipt do not mutate runtime policy. The
application layer continues to fail closed and may write current policy only
when the exact catalog, classification revision, evidence receipts, parity
receipts, matrix approval, generated policy, implementation commits, and
application receipt bind the same reviewed identities.

The complete 119-row matrix must reject:

- missing or duplicate rows;
- a quality row without a valid quality domain and claim class;
- evidence for a non-`evidence-ready` row;
- unmeasured rows represented as sampled failures or successes;
- supersession without parity and unique-coverage disposition;
- retired rows that remain runnable;
- any outcome elevated by AI association or legacy metrics;
- partial policy writes or projection disagreement; and
- any `admitted: true` artifact.

The effective issue set and provenance must agree across file scores, project
aggregation, gate inputs, human output, JSON, SARIF, MCP, watch mode, generated
catalogs, and first-scan projections. Local application remains separate from
push, tag, GitHub Release, npm publication, website deployment, or public claim
authorization.

## Implementation sequence after written-spec approval

1. Write a superseding CAL-002 TDD plan that maps every affected contract,
   test, command, artifact, and documentation file while retaining the v1 plan
   as historical context.
2. Add red protocol tests for the four dimensions, exact 26/4/3/7 matrix,
   assignment eligibility, zero-label closeout, supersession completeness,
   prior-state immutability, and runtime neutrality.
3. Implement additive v2 contracts and a migration reader that preserves the
   v1 state hash and cannot overwrite the original file.
4. Produce bounded parity commits and receipts for the three replacements.
5. Repair the four blocked rules in separate slices or leave them explicitly
   blocked and default-off; CAL-002 closure does not require speculative fixes.
6. Add and run deterministic evidence for the nine transferred contract rows;
   any failed row remains default-off.
7. Generate the exact forty-row classification artifact and obtain one closed
   owner batch approval bound to its hash.
8. Build and review the complete non-admitting 119-row matrix with contextual
   candidates truthfully unmeasured unless the owner separately selected them.
9. Optionally execute a reach-qualified four-rule owner cohort.
10. Apply atomically only after matrix approval and all gates, then reconcile
    roadmap, status, execution index, active plan, changelog, evidence ledger,
    rule docs, report contracts, and first-scan provenance in one reviewed
    documentation/application sequence.

Each implementation phase is a bounded commit. The current private owner state
and unrelated dirty paths remain unstaged. No push, tag, publish, deploy, or
release action is implied.

## Verification and acceptance criteria

The amended implementation is acceptable only when all of the following hold:

- the forty owner rows appear exactly once with counts 26 transfer, 4 blocked,
  3 parity-bound supersessions, and 7 retirements;
- the full projection is exactly 119 rows: 47 starting quality, 26 transfers,
  4 blocked, 3 superseded, 7 retired, and 32 research-origin holds;
- every runnable or repairable quality row has an explicit domain and claim
  class independent of AI association;
- repair and project-contract rows cannot generate assignments;
- an unmeasured quality candidate closes with zero labels and cannot affect
  default enablement, scores, gates, or repairs;
- sampled inconclusive evidence remains distinguishable from unrequested
  measurement;
- every supersession binds replacement, parity receipt, migration commit, and
  unique-coverage disposition;
- retired and superseded rows are non-runnable but remain explainable;
- the v1 `ai/any-density` choice remains byte-identical and the v2 receipt
  binds its hash;
- no historical origin metric, publisher polarity, category, or path can
  elevate quality authority;
- all durable artifacts remain canonical, hash-bound, privacy-preserving, and
  explicitly `admitted: false`;
- focused, adversarial, recursive, build, self-scan, and projection-parity
  gates pass before application; and
- branch state, dirty state, evidence state, reviewer verdict, admission, and
  release authority are reported separately.

## Alternatives rejected

### Transfer all forty immediately

This maximizes apparent coverage but launders invalid scope, duplicate
semantics, unsafe advice, and unsupported statistics into the quality lane. It
also consumes owner labels on defects that source inspection already exposes.

### Hold all forty as origin rules

This minimizes protocol work but keeps security, correctness, type-safety, and
maintainability concerns coupled to weak authorship framing. It leaves product
value stranded behind origin evidence that cannot authorize a quality claim.

### Require all contextual labels before matrix closure

The existing reducer is safe, but owner time is still finite. Requiring up to
6,400 labels confuses measurement enrichment with semantic classification and
blocks unrelated roadmap progress. A precise unmeasured state is more honest
than fabricated completeness.

## Research basis

This design is grounded in the current SlopBrick implementations and tests,
the CAL-002 v1 contracts, and claim-matched primary guidance:

- [ISO/IEC 25010:2023 product quality model](https://www.iso.org/standard/78176.html)
- [SARIF 2.1.0](https://docs.oasis-open.org/sarif/sarif/v2.1.0/os/sarif-v2.1.0-os.html)
- [NIST static analyzer overview](https://www.nist.gov/publications/static-analyzers-seat-belts-your-code)
- [OWASP SQL Injection Prevention](https://cheatsheetseries.owasp.org/cheatsheets/SQL_Injection_Prevention_Cheat_Sheet.html)
- [OWASP Secrets Management](https://cheatsheetseries.owasp.org/cheatsheets/Secrets_Management_Cheat_Sheet.html)
- [MITRE CWE-636: Not Failing Securely](https://cwe.mitre.org/data/definitions/636.html)
- [C++ Core Guidelines](https://isocpp.github.io/CppCoreGuidelines/CppCoreGuidelines)
- [TypeScript `unknown` and `any`](https://www.typescriptlang.org/docs/handbook/release-notes/typescript-3-0.html)
- [Rust Clippy lint selection](https://doc.rust-lang.org/clippy/index.html)
- [React: You Might Not Need an Effect](https://react.dev/learn/you-might-not-need-an-effect)
- [Testing Library guiding principles](https://testing-library.com/docs/guiding-principles/)
- [Vitest asynchronous assertion guidance](https://vitest.dev/guide/learn/async)

These sources establish concern semantics and evidence ceilings. They do not
substitute for detector-specific controls, owner review, or runtime admission.

## Non-goals

- No external pilot, participant recruitment, hosted review, or second tester.
- No authorship verdict, human-versus-AI source claim, or source-polarity
  substitution for quality labels.
- No runtime rule, threshold, score, gate, repair, baseline, or source change
  from this design document.
- No deletion or rewrite of frozen CAL-001, CAL-002 v1, or private owner state.
- No breaking `@usebrick/core` schema change without separate approval.
- No push, tag, publish, deploy, release, or public product claim.

## Next gate

Review the superseding detailed TDD amendment produced by the writing-plans
workflow. Do not resume the v1 owner questionnaire or implement protocol
changes before that plan is approved.
