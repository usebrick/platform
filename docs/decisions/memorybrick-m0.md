# ADR: MemoryBrick M0 deterministic local compilation

- **Status:** Private Slices A-C locally qualified, locally checkpointed, and unshipped — Revision 74
- **Date:** 2026-07-24
- **Plan:** [`MEM-001`](../execution/plans/MEM-001-read-only-m0.md)
- **Active behavioral contract:** [focused acceptance
  matrix](./memorybrick-m0-acceptance.md)
- **Fixed test data:** [registry v2](./memorybrick-m0-registry-v2.json) and
  [benchmark vector v2](./memorybrick-m0-benchmark-vector-v2.json)

## Context

UseBrick needs a small proof that current repository facts can be compiled into
deterministic agent-readable context without introducing a Memory store,
vendor-owned chat history, policy inference, or a separate product.

Earlier M0 proposals mixed that proof with filesystem acquisition, source-code
parsing, live providers, credentials, network/process isolation, model grading,
accounting, retention, deletion, and extensive review machinery. Independent
review found legitimate defects, but the packet grew much faster than the
product premise. Revision 59 removed live execution, Revision 63 removed
filesystem acquisition, Revision 65 removed static-source parsing, and Revision
67 closed the remaining frozen-packet grammar and allocation findings.

Revision 68 changes the process as well as the active authority. It preserves
the useful deterministic contract but replaces broad prose and an uncalibrated
review score with named requirements and executable verification.

## Decision

MemoryBrick M0 is one private, local, read-only capability inside the existing
Core, Engine, and SlopBrick boundaries.

1. **Keep Structure v5 unchanged.** M0 adds no required Repository Structure
   field, public schema, schema-version bump, package, CLI command, or release
   surface.
2. **Trust the internal container, not the repository bytes.** A private
   UseBrick adapter supplies one root registration and up to 64 package
   registrations. The exact JSON bytes are untrusted and copied before parsing.
   Hostile arbitrary JavaScript object admission is not an M0 security promise.
3. **Compile only four declared fact families.** M0 can emit
   `repo.command`, `repo.package-manager`, `repo.package-manifest`, and
   `repo.runtime-node`, each with exact source/path/pointer evidence.
4. **Use one bounded parser.** Package JSON uses fatal UTF-8, rejects a BOM,
   malformed input and duplicate decoded member names, and is bounded by source
   bytes, aggregate bytes, depth, and token count.
5. **Preserve ambiguity instead of inventing authority.** Equal values merge.
   Different valid values become a visible conflict and never enter preview
   selection. Every fact remains `declared`, not approved policy.
6. **Make output deterministic.** Named ASCII/tuple comparators govern semantic
   arrays, RFC 8785 governs canonical JSON object order, inputs are not mutated,
   and successful projections are frozen and byte-stable on Node 22 and 24.
7. **Render previews, never native files.** One target-independent fact
   selection feeds three descriptive labels. Preview text marks repository data
   as untrusted, discloses conflict/payload-budget omission, and preserves
   native instructions as authoritative.
8. **Use the committed vector only as an internal conformance fixture.** The
   test harness loads the exact 3-fixture/9-task/27-cell vector. M0 exposes no
   public caller-authored suite evaluator.
9. **Return values only.** M0 has no filesystem acquisition, network, provider,
   process, credential, persistence, telemetry transport, retention, deletion,
   Lock enforcement, or Mend repair capability.
10. **Claim only fixture conformance.** A green vector says that the local
    implementation matches the focused contract. It does not establish agent
    efficacy, real-repository improvement, market demand, owner acceptance,
    release qualification, or public availability.

## Active authority

The [focused acceptance matrix](./memorybrick-m0-acceptance.md) is the sole
human-readable behavioral specification. Each requirement has a stable ID,
an executable verification, and one implementation slice.

The pinned registry and vector remain exact test data. The Revision 67
[compiler](./memorybrick-m0-contract.md),
[renderer](./memorybrick-m0-rendering.md),
[benchmark](./memorybrick-m0-benchmark.md), and
[research](./memorybrick-m0-research.md) documents remain available as
historical design references. They cannot add an unlisted requirement. When a
detail conflicts, the focused matrix wins.

This ordering deliberately removes these former active obligations:

- public `unknown` admission and hostile `Proxy`/accessor/cross-realm behavior;
- caller-provided registry identity and caller-authored benchmark suites;
- module-private `WeakSet` capability admission as a security boundary;
- public error branches for statically unreachable candidate/projection/result
  limits; and
- numeric reviewer scores as acceptance authority.

The exact vector output remains useful because these removals change private
admission and process, not the four fact families, projection values, preview
text, or 3/9/27 fixture semantics.

## Implementation sequence

Implementation is split into three checkpoints:

1. **Slice A — profile and parser:** private types/registry, trusted request,
   defensive byte copies, registration rules, fatal UTF-8, and bounded JSON.
2. **Slice B — compiler and projection:** four predicates, evidence, grammars,
   comparators, merge/conflict behavior, hashes, and immutable projection.
3. **Slice C — previews and conformance:** selection, three previews, exact
   vector harness, recursive qualification, and package-local self-scan.

Each slice starts with focused failing tests and may not absorb a deferred
surface. The full requirement ownership is in the acceptance matrix.

## Review rule

The former two-reviewer `94/100` AND-gate is retired. Reviewer scores are
advisory.

A finding blocks only when it identifies an active requirement ID, supplies a
reproducible failing input/test/proof, demonstrates an in-scope consequence,
and proposes the smallest correction. The controller reproduces it before
changing work. Findings about future or explicitly excluded behavior remain
advisory or become a separate owner decision.

This converts review from an open-ended search for additional obligations into
verification of an owner-approved bounded contract.

## Package ownership

Under the owner's completed Slice A-C implementation boundary:

- private Core code owns M0 types and the module-owned registry constant;
- package-private Engine code owns bounded parsing, extraction, conflicts,
  projection, selection, and rendering; and
- Engine tests own the test-only exact-vector conformance harness. No Memory
  symbol is added to the public Engine facade or export map.

Slices A-C are locally qualified and locally checkpointed. No public schema,
package export, CLI command, source adapter, `.usebrick/` store, instruction
writer, hosted service, telemetry transport, release, or deployment is
implied. Revision 73 establishes deterministic local fixture conformance only;
Revision 74 carries it into one local commit without widening that claim.

## Consequences

Positive:

- the active contract is small enough to review and implement by slice;
- every blocker must be tied to executable evidence;
- repository bytes remain strictly validated without pretending private host
  objects are an adversarial API boundary;
- exact fixture data and deterministic output survive the reset; and
- future filesystem, source-code, live-agent, Lock, and Mend work remain
  separately governable.

Limitations:

- M0 learns only package manager, Node range, command presence, and package
  names;
- callers remain responsible for how exact bytes were acquired;
- renderer labels do not prove current vendor loading behavior;
- no external usefulness or efficacy is measured; and
- Memory remains unshipped until later implementation and release decisions.

## Research basis

The retained byte-level requirements are grounded in:

1. [RFC 8259 JSON](https://www.rfc-editor.org/rfc/rfc8259.html)
2. [RFC 8785 JSON Canonicalization](https://www.rfc-editor.org/rfc/rfc8785)
3. [WHATWG Encoding](https://encoding.spec.whatwg.org/)
4. [RFC 5234 ABNF](https://www.rfc-editor.org/rfc/rfc5234.html)
5. [CommonMark](https://spec.commonmark.org/current/)

Revision 68's process reset is also consistent with established guidance to
keep review units small and tie each requirement to a defined verification
method:

6. [Google engineering review guidance](https://google.github.io/eng-practices/review/developer/small-cls.html)
7. [NASA requirements and verification guidance](https://www.nasa.gov/reference/system-engineering-handbook-appendix/)
8. [LLM-as-a-judge limitations](https://proceedings.neurips.cc/paper_files/paper/2023/file/91f18a1287b398d378ef22505bf41832-Paper-Datasets_and_Benchmarks.pdf)

These references justify testable boundaries; they do not substitute for the
owner's product decision.

## Acceptance

The owner selected option 1 to replace the repeated broad-review protocol with
this focused executable process. Revision 68 authorized documentation
convergence and validation only. Revision 69 records the trusted owner's
separate **Accept Slice A** decision before product-code changes.

That decision authorized only `M0-S01` through `M0-P02`, focused tests, local
validation, advisory review, and Slice A evidence. Revision 70 separately
authorized only `M0-F01` through `M0-L01` and the equivalent Slice B proof.

Slice A is now implemented and locally qualified in the uncommitted worktree.
The independent advisory review returned **APPROVE** with no reproducible
requirement blocker; the complete gate record is
[`MEM-001-local-m0.md`](../execution/evidence/MEM-001-local-m0.md). Revision
69 authority is exhausted at that boundary. Revision 71 records Slice B's
green implementation, Node 22/24 qualification, independent **APPROVE**, and
separate receipt at
[`MEM-001-local-m0-slice-b.md`](../execution/evidence/MEM-001-local-m0-slice-b.md).
Revision 70 authority is now exhausted too.

Revision 72 separately authorized Slice C. Its red-first renderer and exact-
vector implementation, reproduced caller-freeze defect, smallest correction,
Node 22/24 focused qualification, exact reconstruction, self-scan, and two
fresh blocker-free blind reviews are recorded in
[`MEM-001-local-m0-slice-c.md`](../execution/evidence/MEM-001-local-m0-slice-c.md).
Revision 73 exhausts that authority. Revision 74 separately authorizes one
local checkpoint commit through
[`MEM-001-local-commit-owner-decision.json`](../execution/evidence/MEM-001-local-commit-owner-decision.json).
Every additional git/public action and every deferred Memory capability remain
unauthorized.
