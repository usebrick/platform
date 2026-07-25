# MEM-001 — Prove deterministic local Memory compilation

- **Status:** `done`
- **Priority:** 9
- **Track / lane:** implementation / memory
- **Owner:** UseBrick platform
- **Updated:** 2026-07-25

## Outcome

Prove that four current package declarations can be compiled from exact
registered JSON bytes into one deterministic immutable repository projection,
rendered as bounded descriptive previews, and checked against one exact
non-vacuous offline conformance vector.

## Current truth

The repository has Structure v5, scanner facts, Constitution input, native
agent instruction files, and a locally qualified private Slice A-C M0 proof:
profile, registry, admission, bounded package-JSON parsing, exact four-fact
compilation, immutable conflict-preserving projection, bounded descriptive
previews, and a test-only exact-vector harness. It has no accepted public
Memory schema, source adapter, durable store, live benchmark, or shipped
Memory surface. MemoryBrick remains a planned internal capability,
not a shipped product or package. It is the repository-intelligence plane of the coherence graph;
separately consented global outcome intelligence remains a different data
boundary.

Revision 68 records the owner's option 1 process reset after repeated broad
review cycles. The generic two-reviewer `94/100` gate is retired. Active M0
authority is now deliberately small:

1. the [M0 ADR](../../decisions/memorybrick-m0.md) for scope and rationale;
2. the focused [requirement-to-test acceptance
   contract](../../decisions/memorybrick-m0-acceptance.md);
3. pinned [registry v2](../../decisions/memorybrick-m0-registry-v2.json); and
4. the exact [benchmark vector
   v2](../../decisions/memorybrick-m0-benchmark-vector-v2.json).

The Revision 67 [compiler](../../decisions/memorybrick-m0-contract.md),
[renderer](../../decisions/memorybrick-m0-rendering.md),
[benchmark](../../decisions/memorybrick-m0-benchmark.md), and
[research](../../decisions/memorybrick-m0-research.md) documents remain
historical design references. They do not add requirements beyond the focused
acceptance contract.

Revision 59 removed the live-provider/run design. Revision 63 removed
filesystem acquisition. Revision 65 removed static source parsing. Revision 67
closed the last frozen packet's concrete grammar, allocation, and hostile-host
object findings. Revision 68 preserves the useful exact-byte, parser,
determinism, rendering, and vector obligations while removing the moving
review-score gate and implementation details that are outside the private M0
trust boundary.

Revision 68 authorized documentation and planning convergence only. Revision
69 records the separate trusted-owner **Accept Slice A** decision, and Revision
70 records the separate **Accept Slice B** decision. Both slices are
implemented, independently reviewed, and locally qualified. Revision 71 closes
Slice B. Revision 72 records the owner's explicit
`continue` instruction as **Accept Slice C** and authorizes only `M0-R01`
through `M0-C01`. Revision 73 records the corrected implementation, local
qualification, and final receipt. All three slice authorities are exhausted;
Revision 74 separately records the owner's option `1` authorization for one
local checkpoint commit. Push, merge, tag, release, publication, deployment,
and all broader capability work remain unauthorized.

## Scope

- A private additive `memory-m0-v2` profile; Structure v5,
  `STRUCTURE_SCHEMA_VERSION`, public exports, and current commands remain
  unchanged.
- A trusted internal request container holding untrusted exact bytes for one
  root `package.json` and zero to 64 lexical package manifests.
- Defensive source-byte copies followed by fatal UTF-8 and one iterative,
  depth/token-bounded, duplicate-key-rejecting JSON parser.
- Exactly four `declared` predicates: `repo.command`,
  `repo.package-manager`, `repo.package-manifest`, and `repo.runtime-node`.
- Exact evidence, ASCII grammars, deterministic comparators, merge/conflict
  behavior, four documented hash preimages, and one frozen projection.
- One target-independent 2,048-byte fact selection and three complete bounded
  descriptive previews labelled Codex, Claude, and Copilot.
- One test-only harness over the committed 3-fixture/9-task/27-cell vector.
- Three implementation slices: A profile/parser, B compiler/projection, and C
  previews/exact-vector integration.
- One reproducible blocker rule tied to named requirements and failing tests or
  mechanical proofs.

## Non-goals

- A public `unknown` admission API, hostile JavaScript `Proxy`/accessor/
  cross-realm contract, caller-authored registry, or arbitrary-suite evaluator.
- JavaScript/TypeScript/static-module parsing, AST facts, import analysis,
  source-code architecture inference, or code-quality predicates.
- Filesystem discovery, root acquisition, secure open, stable snapshot,
  physical identity, alias detection, or native platform code.
- Agent/client invocation, providers, prompts, responses, credentials,
  network, tool use, latency, tokens, cost, or coding-task measurement.
- Run manifests, journals, retries, crash recovery, private output roots,
  retention controls, deletion receipts, or live authorization records.
- Model grading, statistical efficacy, external validation, product-market fit,
  pricing evidence, or public claims.
- A new package, public command, `.usebrick/` store, cache, vector index,
  transcript archive, hosted service, telemetry transport, Lock gate, or Mend
  repair.
- In-place native instruction-file edits or claims that target labels match
  current vendor loading behavior.
- Approved intent, policy inference, historical memory, or automatic policy
  authority.

Every deferred capability requires a future plan, ADR, and explicit owner
authority. MEM-001 acceptance cannot authorize one implicitly.

## Dependencies

- `requires`: `SB-UX-001`, `TEL-001`
- `externalGates`: none; the Slice A, Slice B, and Slice C owner gates were
  satisfied by Revisions 69, 70, and 72
- `benefitsFrom`: `CORPUS-001`

The dependencies are complete. The trusted owner's **Accept Slice A** decision
is recorded in `docs/execution/evidence/MEM-001-owner-decision.json`, and local
qualification is recorded in `docs/execution/evidence/MEM-001-local-m0.md`.
Slice A, Slice B, and Slice C authority is exhausted. Their separate local
receipts establish only deterministic fixture conformance. They do not
authorize deferred capability or remote/public actions. Revision 74 separately
authorizes only the one local checkpoint commit that carries this plan.

## Acceptance criteria

### Decision gate

- Revision 68 makes the focused acceptance contract the sole active behavioral
  specification and preserves the registry/vector as fixed test data.
- Every active requirement has a stable ID, one executable verification, and
  one of the three bounded implementation slices.
- The former `94/100` dual-review gate is explicitly retired.
- A review item can block only after the controller reproduces a violation of
  a named active requirement through a failing input, test, or proof.
- Revision 67's detailed documents remain readable history but cannot silently
  widen implementation.
- Documentation, JSON, link, execution-ledger, and positioning validation pass.
- The trusted owner **Accept Slice A** decision is recorded before Slice A
  changes product code.
- The trusted owner **Accept Slice B** decision is recorded before Slice B
  changes product code.
- The trusted owner **Accept Slice C** decision is recorded before Slice C
  changes product code.

### Later implementation gate

- **Slice A:** `M0-S01` through `M0-P02` pass on Node 22 and 24 with private
  Core/profile and pure Engine parser changes only.
- **Slice B:** `M0-F01` through `M0-L01` pass on Node 22 and 24 with exact
  compiler/projection behavior and no I/O expansion.
- **Slice C:** `M0-R01` through `M0-C01` pass, the exact vector reconstructs
  independently, recursive typecheck/test/build are green, and the
  package-local self-scan completes without changing a durable baseline.
- Each slice starts with failing focused tests, ends with a separate local
  checkpoint/evidence entry, and cannot absorb deferred scope.
- Reviewer output is advisory unless it meets the four-part blocker rule in
  the acceptance contract and the controller reproduces it.
- Final evidence calls the outcome deterministic fixture conformance only; it
  does not claim agent efficacy, real-repository improvement, market demand,
  release qualification, or public availability.

## Execution steps

1. Revision 68 records the owner-selected process reset, adds the focused
   acceptance contract, demotes Revision 67 detail to history, synchronizes all
   planning/product documentation, validates, and stops.
2. Record the trusted owner's **Accept Slice A** decision before product code.
3. **Complete:** execute Slice A with red tests, focused gates, controller
   verification, one targeted advisory review, and a local evidence checkpoint.
4. **Complete:** execute the owner-authorized Slice B under the same bounded
   sequence and record its separate local receipt.
5. **Complete:** execute owner-authorized Slice C, reproduce and correct the
   caller-freeze review defect, run focused Node 22/24 and package/workspace
   qualification, independently reconstruct the vector, complete the
   package-local self-scan, and record the final local receipt.
6. **Complete:** record the owner's option `1` integration disposition and
   create exactly one local checkpoint commit. Stop before push, merge, tag,
   release, publication, or deployment; none is automatic.

## Verification

During the Revision 68 decision-only reset:

```bash
corepack pnpm plans:validate
corepack pnpm exec node --test scripts/validate-execution-docs.test.mjs
corepack pnpm positioning:validate
node -e 'JSON.parse(require("node:fs").readFileSync("docs/execution/index.json"))'
node -e 'JSON.parse(require("node:fs").readFileSync("docs/decisions/memorybrick-m0-registry-v2.json"))'
node -e 'JSON.parse(require("node:fs").readFileSync("docs/decisions/memorybrick-m0-benchmark-vector-v2.json"))'
git diff --check
! rg -n '[[:blank:]]+$' docs/decisions/memorybrick-m0* docs/execution
```

No package implementation test is claimed by Revision 68 because no product
code is authorized or changed.

Slice A passed its focused Core 3/3 and Engine 49/49 tests plus Core/Engine
typechecks on Node 22.22.3 and 24.15.0. Full current package gates passed at
Core 288/288 and Engine 109/109, with both builds, Core contract freshness,
Core schema validation, and public-surface base-diff checks green.

Slice B passed 31/31 focused tests under Node 22.22.3/`C` and Node
24.15.0/`de_DE.UTF-8`, Engine typecheck on both runtimes, the current full
Engine suite at 140/140, and one independent advisory review with no blocker.

Slice C passed 10/10 focused tests and Engine typecheck on both Node
22.22.3/`C` and Node 24.15.0/`de_DE.UTF-8`, plus the current Engine suite at
150/150. Independent reconstruction matched all three expected artifacts and
all 27 reducer cells; two fresh blind reviewers returned PASS with no blocker.
Recursive typecheck and build passed, and the package-local no-telemetry
self-scan completed 303/303 files without creating a baseline. The complete
SlopBrick suite previously passed 4,603 tests with 18 skips; post-correction
aggregate reruns exposed rotating unrelated publication, watch-poll, and
performance timing assertions, each passing alone. The exact timing evidence
and final 4,601-pass/18-skip aggregate are preserved in the Slice C receipt;
no unrelated scanner code was changed.

The combined private M0 is locally checkpointed under the Revision 74 owner
decision and remains unpushed, unmerged, and unshipped.

## Evidence destination

- Decision and scope: `docs/decisions/memorybrick-m0.md`
- Active acceptance contract:
  `docs/decisions/memorybrick-m0-acceptance.md`
- Fixed registry: `docs/decisions/memorybrick-m0-registry-v2.json`
- Fixed vector: `docs/decisions/memorybrick-m0-benchmark-vector-v2.json`
- Revision 67 historical references:
  `docs/decisions/memorybrick-m0-{contract,rendering,benchmark,research}.md`
- Owner decision audit:
  `docs/execution/evidence/MEM-001-owner-decision.json`
- Local Slice A implementation proof:
  `docs/execution/evidence/MEM-001-local-m0.md`
- Slice B owner decision:
  `docs/execution/evidence/MEM-001-slice-b-owner-decision.json`
- Local Slice B implementation proof:
  `docs/execution/evidence/MEM-001-local-m0-slice-b.md`
- Slice C owner decision:
  `docs/execution/evidence/MEM-001-slice-c-owner-decision.json`
- Local Slice C implementation proof:
  `docs/execution/evidence/MEM-001-local-m0-slice-c.md`
- Local checkpoint owner decision:
  `docs/execution/evidence/MEM-001-local-commit-owner-decision.json`

There is no live manifest, private run, provider receipt, deletion receipt, or
model benchmark destination.

## Rollback

To roll back the current Slice A-C work, remove only the private profile,
registry, admission/parser, canonicalization, compiler, projection, renderer,
exact-vector test harness, focused tests, and local evidence.
Structure v5 and native instruction files remain valid and unchanged. Rollback
has no user data or run artifacts to delete.

## Next action

Preserve the owner-authorized local MEM-001 checkpoint and return to the owner
before any push, merge, tag, release, publication, deployment, filesystem
acquisition, source-code parsing, durable Memory, or live experiment.
