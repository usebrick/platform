# Adversarial review — v10.3 corpus source-admission plan

**Reviewed:** 2026-07-11 (Europe/Lisbon)
**Plan:** `packages/slopbrick/docs/calibration/v10.3-corpus-source-admission-plan.md`
**Verdict:** **CHANGES_REQUIRED**

The plan is directionally strong. It correctly centralizes raw bytes under one
corpus root, treats legacy polarity as an intake declaration rather than a
label, preserves `AI -> verified_ai` as positive and
`human -> verified_human` as negative, blocks unauthorized acquisition and
publication, requires an honest zero census first, and separates admission
from later manifest/scan/calibration work. Most source counts and pinned-source
research are also correct.

It is not ready to execute as a fail-closed admission authority. Six critical
contract gaps can currently produce a false eligible/readiness result or a
manifest that cannot be derived losslessly. These are design corrections, not
requests to relax the evidence standard.

## Scope and evidence inspected

- the entire 1,994-line admission plan;
- `.superpowers/sdd/v045-execution-reconciliation.md`;
- `docs/calibration/v0.45-continuation.md`;
- `packages/slopbrick/docs/calibration/v10.3-release-asset-materialization-plan.md`;
- the current external v10.3 source register, legacy inventories, controlled
  HumanEval/EvalPlus evidence, candidate rankings, and present source trees;
- the current dedup tokenizer, MinHash/LSH implementation, SlopBrick build
  configuration, and package runtime declaration;
- the plan's pinned official HumanEval, LPcode, BigCodeBench, DroidCollection,
  Monize, Magic8Ball, ProgramsGeneratedByChatGPT, Hugging Face, and GitHub
  licensing references.

This was a read-only/static audit. No corpus code was executed, no source was
acquired, no upload/push/publish was attempted, and no plan or implementation
file was changed.

## Critical findings

### C1 — The verifier has hashes of claimed evidence, but no proof-carrying evidence input

**Evidence**

- `AdmissionEvidenceRef` contains only a URL or local ID plus an unexplained
  SHA-256 (plan lines 471-481).
- Admission decisions contain arbitrary `evidenceSha256` strings, with no
  reference to a canonical evidence object (lines 628-640).
- A record embeds its own `audits.* = pass` values (lines 574-583).
- `deriveAdmissionDisposition` receives only source, record, and decisions
  (lines 1274-1278). It receives no evidence index, materialization receipt,
  overlap/privacy ledger, family graph, pair graph, or split assignment.
- `AdmissionCensusInput` similarly has no immutable evidence index or
  materialization receipt set (lines 1346-1353).

Consequently, a syntactically valid record can cite an arbitrary HTTPS URL and
hash, declare all audits passed, obtain two agreeing decisions, and leave the
generic verifier with nothing from which to recompute those facts. This
contradicts the stated rule that the generic verifier derives eligibility from
bound evidence (lines 103-121).

**Exact correction**

1. Add schema-backed `CalibrationAdmissionEvidenceIndexV1` and
   `CalibrationAdmissionEvidenceReceiptV1` contracts. Every item needs a stable
   `evidenceId`, evidence kind, immutable URL or explicitly ineligible local
   source, exact byte count, media type, SHA-256, acquisition/verification
   method, and a receipt binding the bytes actually checked.
2. Replace bare decision `evidenceSha256` values with sorted, unique
   `evidenceIds`. Require every source, rights, authorship, model-revision, and
   reviewer claim to resolve to an index item and verified receipt.
3. Replace the disposition API with a validated context, for example:

   ```ts
   interface VerifiedAdmissionContextV1 {
     evidenceIndex: CalibrationAdmissionEvidenceIndexV1;
     evidenceReceipts: readonly CalibrationAdmissionEvidenceReceiptV1[];
     materializationReceipts: readonly MaterializationReceiptV1[];
     overlapLedger: AdmissionOverlapLedgerV1;
     privacyLedger: AdmissionPrivacyLedgerV1;
     familyPairSplitLedger: AdmissionLineageLedgerV1;
   }

   deriveAdmissionDisposition(source, record, decisions, context)
   ```

4. Treat record-level `audits` as claimed adapter observations only. Derive
   authoritative pass/fail values from the verified context and reject any
   mismatch.
5. Add deletion, substitution, unreachable-ID, wrong-byte-count, wrong-hash,
   self-declared-pass, and stale-receipt mutation tests. An evidence hash that
   cannot be resolved and revalidated must yield `review_incomplete` or the
   relevant specific blocker, never eligibility.

### C2 — `smoke.ready` and `canary.ready` can be true without a feasible exact cohort

**Evidence**

- The census shape contains marginal totals by source, language, and family,
  but no joint per-cluster language/source/family/pair membership and no exact
  selected-ID witness (lines 875-961).
- The census explicitly does not balance, sample, or select files
  (lines 994-1004).
- Readiness nevertheless applies simultaneous count, language, source, family,
  cluster, and pair constraints (lines 1018-1036 and 1060-1080).
- Task 8 asks a reviewer to inspect “the exact 200 candidate IDs,” but no step
  or interface produces those IDs (lines 1848-1857).

Passing marginal totals does not prove that one exact 100/100 or 5,000/5,000
subset satisfies all constraints simultaneously. For example, language floors
and family counts can each pass in aggregate while all units in one required
language belong to an over-cap source/family, leaving no feasible joint subset.

**Exact correction**

1. Add a deterministic `AdmissionCohortWitnessV1` artifact for each gate. It
   must bind the census/input hashes, policy ID, seed/tie-break policy, and the
   exact unique record/content-cluster IDs, with label, language, source
   checkout, family, pair group, and split for every selected unit.
2. Implement and test one deterministic feasibility/selection authority that
   constructs the witness or returns an infeasibility certificate. Freeze its
   algorithm/version and stable tie-breaking before seeing calibration
   outcomes.
3. Make `ready` mean “a complete witness was generated and independently
   reverified,” not “marginal totals look sufficient.” Alternatively rename the
   current field to `countReady` and keep actual `ready = false` until the
   separate witness exists.
4. Add adversarial tests where every marginal total passes but no feasible
   exact cohort exists, plus exact 100/100 and 5,000/5,000 witness mutation
   tests.

### C3 — The promised global near-overlap gate is probabilistic, incomplete, and not scale-safe

**Evidence**

- The policy promises exact/near clustering globally across the legacy
  inventory and every new candidate (plan lines 786-799).
- Task 3 accepts only admission-record descriptors (lines 1434-1488), while
  Task 4 explicitly permits hundreds of thousands of legacy candidates to
  remain only as `unrepresentedCandidateUnits` (lines 1562-1573). Those units
  therefore cannot participate in Task 3's near-overlap input.
- Task 3 says to reuse current MinHash/LSH for candidate discovery
  (lines 1511-1520). The current implementation documents only about a 0.92
  candidate probability at Jaccard 0.80
  (`packages/slopbrick/src/engine/dedup/lsh.ts`, lines 16-35). Approximately 8%
  of true threshold pairs can therefore be missed before exact verification.
- The current LSH implementation retains all signatures, 32 maps, and all
  candidate pairs in memory (same file, lines 89-145). The current tokenizer
  is a deliberately naive JS-style comment stripper, not a reviewed
  multi-language normalizer (`dedup/tokenize.ts`, lines 36-63).

Exact Jaccard verification eliminates LSH false positives, not LSH false
negatives. A probabilistically missed cross-polarity edge can therefore pass a
hard gold gate. The implementation also lacks a credible bounded plan for
452,382 legacy records plus new sources.

**Exact correction**

1. Define a global overlap-universe artifact whose set hash covers every
   registered candidate unit—not only normalized admission records. Store exact
   content hashes and versioned normalized-shingle fingerprints for all
   452,382 selected legacy entries and every new candidate. Report covered,
   unsupported, and unreadable counts. Any unresolved candidate capable of
   colliding with a proposed gold unit must keep global overlap coverage
   incomplete and readiness false.
2. Use deterministic, threshold-complete candidate generation for the gold
   authority, such as a reviewed prefix-filter/inverted-index exact set-similarity
   join followed by exact Jaccard. Keep LSH only as a diagnostic accelerator, or
   explicitly downgrade any LSH-only result to non-gold.
3. Freeze normalizer/tokenizer versions per supported language. A language
   without a correct normalizer must produce
   `language_normalizer_unsupported`, as the prose already requires.
4. Specify a disk-backed/external-sort or bounded persistent index, limits for
   pathological common shingles and candidate-pair expansion, checkpoint and
   resume receipts, and byte-identical rerun tests at representative scale.
5. Bind coverage counts, universe hash, normalizer versions, algorithm config,
   and all unresolved IDs into the schema-backed ledger and census.

### C4 — The source census model double-counts aggregate and leaf populations

**Evidence**

- The register contains both `legacy-ai-slop-baseline` (5,809 + 52,280 =
  58,089 files) and `legacy-v5-inventory` (452,382 selected records) as top-level
  source entries.
- The 452,382 inventory already contains those exact 58,089 baseline records:
  5,809 positive and 52,280 negative rows have `repositoryId: null`; the
  remaining 394,293 rows map to repository inventories.
- The plan requires exactly one additive-looking census source row for every
  register entry and enforces
  `sourceInventoryCandidateUnits = admissionRecords + unrepresentedCandidateUnits`
  per row (lines 964-976).

Without aggregate-versus-leaf semantics, global candidate counts can include
the 58,089 baseline units twice. The same problem recurs when the 317 legacy
repositories are promoted into top-level source entries while
`legacy-v5-inventory` remains a top-level aggregate.

**Exact correction**

1. Give every register entry a required kind such as
   `aggregate_inventory | material_source`, and declare whether it contributes
   to additive global counts.
2. Give every candidate exactly one `materialSourceId`; aggregates may report
   coverage but must never add their child units again.
3. Freeze and test the current partition explicitly:

   ```text
   452,382 selected coverage
     = 58,089 baseline material units
     + 394,293 repository-mapped material units
   ```

   Keep the 1,478,350 declared raw-arm population as a separate open discovery
   population, not an additive reviewed-record count.
4. Add invariants that no candidate ID belongs to two material populations,
   child sums reconcile to each aggregate, and adding a promoted repository
   source cannot change the global population count.

### C5 — Admission cannot map release assets losslessly into the frozen manifest contract

**Evidence**

- Admission `release_archive_set.assets` contains URL, bytes, digest, and
  extraction policy, but omits `archiveFormat` and `rootPrefix` (admission plan
  lines 377-388).
- Its record locator contains only `assetSha256` and `normalizedPath`
  (lines 489-501).
- The release-asset plan's exact `ReleaseArchiveMaterialization` requires
  `{kind, assetUrl, assetSha256, assetBytes, archiveFormat, rootPrefix,
  extractionPolicy}` (release plan lines 74-87), and identity/checkout behavior
  depends on the root prefix.

The promised later one-asset-to-one-`release_archive` mapping (admission plan
lines 439-443) cannot reconstruct omitted `rootPrefix` or distinguish whether
the locator path is archive-root-relative or materialized-root-relative.

**Exact correction**

1. Reuse/import the exact `ReleaseArchiveMaterialization` shape for each asset;
   do not define a lossy admission copy.
2. Add a stable `materializationId` (and manifest `repositoryId` mapping) per
   asset. Make `release_archive_file` reference that ID and define its path as
   relative to the reviewed `rootPrefix`.
3. Require per-asset rights/license scope when assets in a set can have
   different terms. Do not let one repository-level rights object silently
   cover heterogeneous assets.
4. Add a round-trip test: source review + admission record -> Core corpus
   manifest -> checkout map -> resolved bytes, with no invented/defaulted field
   and with wrong/missing root-prefix failures.

### C6 — `provider_not_exposed` is a self-asserted exception to model-revision evidence

**Evidence**

- Both authorship variants allow the bare discriminant
  `{status: 'provider_not_exposed'}` (lines 508-544).
- Prose says it is allowed only for a hosted proprietary service and forbidden
  when a pinnable revision exists (lines 728-744), but neither the contract nor
  disposition input carries evidence from which that determination can be
  checked.

This makes the strict AI route depend on an unverified assertion. It is
especially material to the current controlled GPT-5 records, which identify a
model alias but do not carry a model revision.

**Exact correction**

1. Replace the bare variant with a reviewed object containing at least the
   hosted service/product identifier, exact provider/model alias used,
   generation date, immutable official evidence ID for the provider's exposed
   versioning contract at that date, and the reviewer decision ID that accepted
   “no pinnable revision.”
2. Require the evidence-index verifier to prove that the exception is bound and
   reviewer-approved; forbid it for sources whose cited evidence publishes a
   commit/revision.
3. Missing or unresolvable exception evidence must derive
   `generator_revision_missing`.
4. Preserve the controlled cohort's current quarantine until this exception is
   independently approved; do not grandfather its existing model string.

## Important findings

### I1 — The family census schema contradicts approved paired cross-polarity families

`CensusFamilyRow` permits only one `label` (lines 904-909), while the policy
explicitly allows one family to contain a complete approved human/AI
transformation pair (lines 775-785). Replace the single label with per-label
record/unique-unit counts, `polaritySet`, sorted pair-group IDs, and an explicit
`pairedCrossPolarity` disposition. Add a valid paired-family fixture and an
unpaired cross-polarity failure fixture.

### I2 — Census replacement is not protected against concurrent writers

The compare-and-swap/history/transaction prose (lines 859-870) handles a crash
between two renames, but it defines no transaction schema, exclusive writer
lock, or directory-fsync sequence. Two writers can both validate the same
expected hash and race to replace the pair.

Add a schema-backed transaction receipt with frozen phases, acquire a sibling
lock with `wx` before checking the expected hash, fsync temporary files and
parent directories, and release only after the JSON/sidecar pair verifies.
Test two simultaneous writers, death after every phase, stale locks under an
explicit recovery policy, occupied history with same/different bytes, and
idempotent recovery.

### I3 — Durable overlap/privacy authorities are TypeScript-only, not Core schemas

Task 1 adds four Core schemas (lines 1244-1261), but Task 3's overlap and
privacy ledgers exist only as inline interfaces (lines 1434-1499), even though
the census persists and trusts their hashes. Add JSON Schemas, generated types,
runtime semantic validators, index entries, and valid/invalid/mutation fixtures
for both ledgers (and the lineage ledger required by C1). Verify exact input-set
coverage, canonical self-hash omission, no missing/extra record IDs, sorted
edges/results, finite bounded Jaccard values, and ledger/payload hash agreement.

### I4 — Task 9 names a manifest builder that no task defines

Task 9 requires a quarantined-first builder (lines 1873-1887), but there is no
file list, interface, command, algorithm, or test for census/admission-to-Core
manifest conversion. The plan then ends the admission tranche before smoke
(lines 1975-1994).

Either make Task 9 a pure handoff and link a separate reviewed implementation
plan, or add a dedicated builder task with exact input/output contracts,
materialization mapping, witness consumption, no-folder-discovery behavior,
schema validation, canonical IDs/hashes, and adversarial tests. It must depend
on C5 and on approved completion evidence for release-asset materialization,
score/wire validity, run initialization, and post-scan verification. Those
dependencies are currently open in the reconciliation; prose alone must not
allow the task to start.

### I5 — The declared Node 22/24 stack is not an executable current baseline

The plan declares Node 22/24 built-ins (line 24), while the current package
advertises Node `>=20`, uses `@types/node` 20, and tsup targets Node 18. The
reconciliation also records Node policy application as open. Add a Task 0 hard
dependency on the Node-runtime-policy tranche and require green Node 22 and 24
matrices before admission code uses those built-ins. Otherwise constrain this
plan to the current shipped target and move Node 22/24 adoption outside it.

### I6 — The raw Git acquisition recipe is not a validated security boundary

The policy correctly requires a reviewed census and explicit owner
authorization before acquisition. However, the shell recipe (lines 1157-1197)
parses an unvalidated JSON object and interpolates `sourceId` and `licensePath`
into filesystem paths; it does not enforce an HTTPS origin, a 40-hex commit,
safe slugs/relative paths, destination containment, or a lowercase digest. It
also inherits system/global Git configuration, including hooks and checkout
filter drivers.

Replace the recipe as authority with a tested acquisition CLI and a schema for
`approved-acquisition.json`. Validate the complete object before mutation;
require safe slug/path grammar, containment, HTTPS origin, exact commit/digest,
declared limits, and no unknown keys. Run Git with isolated system/global
configuration and disabled hooks/interactive credential prompts, do not
initialize submodules/LFS, reject symlinks/special files, and use a unique
no-clobber temporary destination plus canonical receipt. Keep the explicit
authorization gate unchanged. No acquisition should occur while this plan is
being corrected.

### I7 — The canary policy silently requires at least ten source checkouts per polarity

Exactly 5,000 units with a maximum of 500 from one source checkout
(lines 1060-1075) mathematically requires at least ten source checkouts per
polarity, which is stricter than the stated five-family floor and far beyond
the currently plausible admitted set. Add this derived minimum to census
gate failures and acquisition planning:

```text
minimumSourceCheckouts = ceil(5000 / 500) = 10 per polarity
```

Report source-cap capacity and deficit explicitly after smoke. The two-source
per-round limit is safe, but several independently authorized/reviewed rounds
may be required; the plan must not imply that one bounded pull can make the
canary feasible.

### I8 — Reviewer identity/role binding is prose-only at source level

`source-review.json` stores only a tuple of reviewer IDs (line 427), while the
required roles and independence rules appear later in prose (lines 1223-1238).
A tuple schema alone does not prove distinct IDs, role coverage, blindness, or
that the rights reviewer approved the exact evidence set. Store structured,
distinct reviewer decision IDs with role, reviewed evidence IDs, decision hash,
and any adjudication link. Enforce independence and rights-role coverage in the
semantic validator.

### I9 — Disposition and census arithmetic needs a complete conservation table

`mixed` and `quarantined` do not say whether they are record or unique-unit
counts, while eligible sections report both. Add explicit record and unique
counts for every disposition/label and invariants that:

- admission records partition exactly once across all derived dispositions;
- unique content never exceeds its record count;
- by-source record totals reconcile to the global non-aggregate totals;
- rejection reasons may be multi-valued and therefore are not asserted to sum
  to rejected records;
- source blockers count sources only and never inflate record counts.

## Minor findings

### M1 — Correct the LPcode distinct-name statement

The 34,168-row and 17,084/17,084 label counts are correct. The local Task 1
files contain **4,272 distinct raw `file_name` strings**, or **4,275 distinct
`(language, file_name)` pairs** (Python 1,936; Java 1,495; C 458; C++ 386).
Plan lines 143-148 and 1657-1663 currently call 4,275 “distinct `file_name`
values” or “base names.” Use the precise pair wording and retain the four-above-
README per-language reconciliation as a blocker.

### M2 — Preserve the full GitHub no-license nuance

The cited GitHub guidance does say default copyright applies without a
license and prohibits general reproduction/distribution/derivative works. The
same official guidance also says public-repository users may view and fork
under GitHub's Terms of Service. Add that sentence and explain that view/fork
permission is not a dataset redistribution or derivative-bundle license. The
plan's conservative denial remains a project admission control, not a legal
conclusion; lines 127-131 already make the latter distinction well.

### M3 — Split the “PPT Master / Magic8Ball” ranking row

`magic8ball` is a top-level register source; `positive-vibe-coded--ppt-master`
is currently only a legacy repository candidate. Combining them at rank 7
(line 235) obscures which source ID and inventory would be reviewed. Split the
row or mark PPT Master explicitly as an unregistered future candidate with a
required register-promotion step.

### M4 — Make tool and command prerequisites reproducible

Record and verify versions/paths for `git`, `jq`, `shasum`, `du`, Python, and
`pyarrow`, plus platform assumptions for `du -k` and shell arithmetic. For the
controlled HumanEval audit, use the exact already-proven direct test invocation
from the review environment rather than relying on module discovery for a
hyphenated filename (plan lines 1647-1652). Add `-B` or
`PYTHONDONTWRITEBYTECODE=1` so a static audit does not add cache files.

## Verified facts and research assessment

| Item | Audit result |
| --- | --- |
| Source register | 12 IDs; Task 4 lists all 12 exactly. |
| Legacy selected inventory | 224,903 declared AI + 227,479 declared human = 452,382 records. These remain declarations, not eligible labels. |
| Controlled HumanEval | 100/100 candidates, 8 unsafe pair groups, conditional 92/92 content-safe upper bound, zero eligible. |
| EvalPlus | 164/164 audited, zero eligible; its current hardening rereview is approved, artifact-scoped. |
| Current admission/manifests | No admission directory/census and no manifest, selection, or run files. The plan correctly begins at zero. |
| Monize | Pinned commit and AGPL hash agree; the legacy inventory has 1,772 selected records and 1,772 unique selected content hashes. |
| ProgramsGeneratedByChatGPT | 22 initial files and 16 corrected counterparts; the plan's distinction is correct. |
| BigCodeBench | Current pinned checkout is 772 KiB and lacks the generated-sample release asset. |
| DroidCollection | Five local Parquet shards; declared split total 1,058,248; four modes and nine languages; pinned card has no `license` metadata field. |
| LPcode | 34,168 Task 1 rows, four languages, balanced Task 1 labels, and both human/LLM fields per row. The label is not authorship. Only the distinct-name wording needs M1. |

The internet-research section is mostly well grounded in pinned official
primary sources, and it correctly labels project-chosen thresholds and
historical-authorship reasoning as inferences rather than internet-proven
facts. No additional repository pull is justified before the deterministic
zero census and source preflights. The material corrections are the GitHub
license nuance in M2 and proof for the `provider_not_exposed` policy exception
in C6.

## Dependency correction

The safe execution order after this review is:

1. Resolve C1-C6 and I1-I5 in the written contract before implementing Task 1.
2. Land or explicitly defer the Node 22/24 runtime-policy dependency.
3. Implement schema-backed evidence, lineage, overlap/privacy, and census
   contracts with TDD.
4. Reproduce the honest 0/0 census with aggregate/leaf conservation and full
   overlap-coverage status.
5. Execute already-present source preflights only; do not pull more data yet.
6. If the reviewed census still has count/diversity deficits, request explicit
   owner authorization for one bounded acquisition round through the hardened
   acquisition path.
7. Generate and independently verify the exact 100/100 witness before claiming
   `smoke.ready`.
8. Complete and approve release-asset materialization, score/wire closure,
   run-init, and post-scan verification before the manifest/smoke handoff.
9. After the smoke passes twice, plan capacity for at least ten source
   checkouts per polarity and generate an exact 5,000/5,000 witness before the
   canary.

## READY criteria for the revised plan

The plan can be re-reviewed as **READY** only when it contains exact, testable
corrections for all Critical findings and the Important contract/dependency
findings above. In particular, a revised plan must demonstrate these three
properties in its interfaces—not only in prose:

1. every eligible fact resolves to immutable checked evidence;
2. every global overlap claim covers the complete declared candidate universe
   with a threshold-complete method or blocks readiness;
3. every `ready: true` value is accompanied by a reverified exact cohort
   witness satisfying all joint constraints.
