# Final adversarial audit — v10.3 corpus source-admission plan

**Date:** 2026-07-11 (Europe/Lisbon)
**Verdict:** **READY TO EXECUTE**

The revised plan closes every finding from the original review and independent
rereview in operative contracts, task ownership, executable interfaces,
failure tests, and quality gates. No Critical, Important, Minor, or rereview
blocker remains on the frozen bytes below.

This verdict approves the **plan** for implementation. It does not claim that
the implementation, external corpus evidence, 100/100 witness, manifest,
smoke, or canary gates already exist or pass.

## Frozen review inputs

| Input | Lines | SHA-256 |
| --- | ---: | --- |
| `packages/slopbrick/docs/calibration/v10.3-corpus-source-admission-plan.md` | 8,271 | `233ede7262dd408318230f32ab4cc5d2103caf8b5662ae4fb228088531f70e75` |
| `.superpowers/sdd/v103-corpus-admission-plan-review.md` | 495 | `ad40b5d4ac87f0b50bf5c1334780b70276de96814d3dc094464a93c40f04e1b8` |
| `.superpowers/sdd/v103-corpus-admission-plan-rereview.md` | 88 | `289c797e04318ec93df83d59bb50872eae9ae777832c2960233bd2c78c2110f8` |
| `packages/slopbrick/docs/calibration/v10.3-release-asset-materialization-plan.md` | 920 | `0115a2c73dcfd0a086c70b1e3fe6519558bf7c34ff4942d97d52c3dfa92c585d` |

The admission and release hashes were checked before and after the final read
and remained byte-identical.

### Targeted frozen-input rereview

After the initial READY verdict, release-plan line 702 was corrected from the
nonexistent `review/evalplus-asset-audit.json` path to the existing immutable
input `review/evalplus-v0.1.0-audit.json`. The corrected target exists and was
verified read-only; the obsolete path is absent. The complete current 920-line
release plan and its repository diff were reread, and both plan files were
rehash-bracketed at the SHAs above. This path-only correction does not change
release/admission ownership, Task 6 -> Task 9B -> release Task 7 sequencing,
the in-process manifest-consumer boundary, any C/I/M closure, or RR1-RR13.

## Findings

None.

Two defects discovered during the final hash-bracket were corrected and then
re-audited before this verdict:

1. Task 6 now treats `historical-human-batch-1` only as reusable adapter code
   and invokes `source:audit-node` once per exact existing `repositoryId`, with
   duplicate rejection and one singular per-leaf proposal
   (admission lines 6427-6474).
2. Task 9B now owns the v10.3.2 manifest-consumer integration before the
   implementation commit/tarball/receipt freeze. A complete self-hashed
   current/generation/build-receipt/manifest reference is revalidated and
   privately branded inside each `corpus:validate`, `materialize`, and `select`
   process (admission lines 7405-7417 and 7678-7815). Release Task 6 reserves
   the branch and reruns the exact final consumer suite, while release Task 7
   passes the complete reference to all three consumers (release lines
   585-606, 643-680, and 731-800).

## Original review closure — C1-C6

| Finding | Status | Operative closure |
| --- | --- | --- |
| C1 proof-carrying evidence | Closed | Evidence index/payload/CAS/materialization contracts and non-duplicating byte ownership are defined in lines 1562-2093; SlopBrick-only WeakSet branding and authoritative context rebuilding are in 2094-2699; Tasks 1A/2B require deletion, substitution, network, cast, clone, and cross-module failures (5123-5292, 5556-5683). |
| C2 exact feasible cohort | Closed | Exact witness/certificate/search/review contracts are in 2394-2527 and 3386-3578; census distinguishes `countReady` from reviewed `ready` in 3995-4219; Task 3A and Tasks 8/11 test impossible marginals, exact witnesses, independent regeneration, and review (5684-5756, 6663-6897, 8021-8089). |
| C3 complete scalable overlap | Closed | The persisted 452,382+new row stream, bound sides, rational threshold-complete disk join, bounded shards, checkpoints, and real-byte resource receipt are specified in 3034-3578 and 3667-3748; Tasks 2A and 4 own stream mutation, dense-cluster, resume, and real-corpus acceptance (5427-5555, 6048-6093). |
| C4 aggregate/material double count | Closed | The composed register gives every candidate one material owner and freezes `452382 = 58089 + 394293` while keeping 1,478,350 discovery rows separate (627-670, 1134-1561, 3501-3510); Tasks 1B/4 require conservation and promotion invariance (5293-5426, 5880-6158). |
| C5 lossless release-asset mapping | Closed | Release Tasks 1-6 are the sole owner and prerequisite (168-192); admission imports the full archive/root/receipt shape (1290-1500, 1768-1810); Task 9B performs no-invention and offline byte round trips (6955-8002). Release Tasks 7-8 consume only the approved admission manifest. |
| C6 provider revision exception | Closed | `provider_not_exposed` carries exact product/provider/model/date/evidence/two blinded decisions (2700-2869), is rechecked by the AI predicate (3612-3642), and is explicitly mutation-tested/no-grandfathered in Tasks 1B/4/5 (5293-5426, 5880-6347). |

## Original review closure — I1-I9 and M1-M4

| Finding | Status | Operative closure |
| --- | --- | --- |
| I1 paired family census | Closed | Per-label counts, polarity set, pair IDs, and paired/unpaired status are present in the census and lineage contracts (3339-3478, 3995-4045), with pair/family fixtures in Tasks 1B-3A. |
| I2 census writer races | Closed | Stable intended transaction IDs, `wx` locks, create/replace CAS, complete temp/history/fsync phases, transaction-before-lock cleanup, lock-only recovery, and exhaustive fault tests are in 701-728, 3767-3994, and Task 3B (5757-5879). |
| I3 durable ledgers | Closed | Normalizer, universe, sharded overlap, resource, privacy, quality, and lineage authorities are Core-schema-backed in 3034-3578 and owned by Tasks 2A-2B with set/hash/resource mutations. |
| I4 missing manifest builder | Closed | Task 9A defines terminal dependency receipts; Task 9B defines prerequisite publication, private verification, lossless builder, manifest/build-receipt/generation/current publication, recovery, complete consumer reference, packed tests, and offline round trip (6898-8002). |
| I5 Node baseline | Closed | The plan keeps Node `>=20`/node18 compilation for Tasks 1-8, forbids unshipped APIs, and defers exact packed Node 22/24 proof to Task 9B (24-39, 88-110, 6955-8002). |
| I6 unsafe raw Git acquisition | Closed | Section 9 defines schema-valid authorization, exact-origin/address-pinned Git and HTTPS capabilities, isolated config/credentials/hooks/filters, no shell interpolation, hard materialized/release transfer bounds, and honest unbounded Git transport; Task 7 owns adversarial tests (4353-5035, 6488-6662). |
| I7 ten-source canary minimum | Closed | The census reports `minimumSourceCheckoutsPerPolarity: 10` and capacity deficits (4108-4134); Section 8.2, acquisition planning, and Task 11 enforce the derived minimum (4296-4340, 4353-4380, 8021-8089). |
| I8 reviewer roles and blindness | Closed | Structured assignments, decisions, post-decision receipts, role/evidence matching, adjudication, and target/result partitioning are in 987-1069 and 2870-2962; Tasks 1B/3A/8 mutate the complete acyclic graph. |
| I9 conservation matrix | Closed | Every disposition/label cell carries record and unique-unit counts; material-source rows reconcile globally; reasons remain non-partition diagnostics (3995-4234), with accounting/property tests in Tasks 1B/3A. |
| M1 LPcode wording | Closed | The plan consistently records 4,272 raw names and 4,275 `(language, file_name)` pairs, including the exact language partition (292-306, 6209-6239). |
| M2 GitHub license nuance | Closed | View/fork permission is distinguished from redistribution/derivative-bundle authority and framed as a conservative project control, not a legal conclusion (332-347). |
| M3 Magic8Ball/PPT Master | Closed | They are separate ranking rows with separate registered/legacy-leaf status and replacement requirements (389-397). |
| M4 reproducible tools | Closed | Exact host/tool observations, BSD `du`, diagnostic-only shell tools, direct `-B` Python, and profile-scoped failures are operative in 88-167 and Tasks 0/5/6. |

## Independent rereview closure — RR1-RR13

| Finding | Status | Operative closure |
| --- | --- | --- |
| RR1 cyclic decisions | Closed | Assignment -> independent decisions -> blind receipt; witness -> review receipt; no backward ID edges (987-1133, 2870-2962, Tasks 1B/3A/8). |
| RR2 context ownership | Closed | Core owns durable pure validation; SlopBrick owns private symbol+WeakSet factories and disposition/consumer authority (2094-2699, 7678-7815). |
| RR3 offline payload | Closed | In-place materialization references, otherwise-unowned HTTPS CAS, and explicitly ineligible local references are a closed union; actual bytes and tool receipts are reverified offline (1562-2093). |
| RR4 scalable overlap | Closed | Complete stream/side binding, bounded shard families, exact adjacency/components, deterministic resume, and mandatory real-byte 452,382-row resource acceptance are operative (3034-3578, Tasks 2A/4). |
| RR5 release ownership/order | Closed | Release Tasks 1-6 precede admission Core edits; Task 9B alone adds and packs the full-reference in-process consumers, reruns Task 6, and freezes approvals; release Tasks 7-8 are downstream and cannot create a side manifest or alter consumer code (168-192, 6955-8002; release 543-816). |
| RR6 all 329 reviews | Closed | Initial register/review equality is mandatory, truthful empty-decision quarantine is explicit, later deltas add review+entry atomically, and historical review adapters fan out per existing repository ID (55-64, 627-646, 5293-5426, 5880-6158, 6427-6474). |
| RR7 temporal evidence | Closed | Gold needs externally observed exact pre-cutoff bytes, complete Git graph, and two independent blinded provenance reviewers; Git timestamps alone remain sensitivity-only (1070-1133, 3643-3666, Tasks 1B/6). |
| RR8 census recovery | Closed | First creation and replacement cover lock-only windows, all temps/history/promotions/fsyncs, unknown-file preservation, and intended-ID `--from-lock` recovery (3767-3994, Task 3B). |
| RR9 missing schemas | Closed | Every persisted policy, receipt, assignment, source/input/static/overlap/witness/census/acquisition/prerequisite/manifest lock, transaction, completion, generation, and current authority is assigned to a Core schema task (Tasks 1A-3B/9A/9B). |
| RR10 task-scoped tools | Closed | Twelve exact profiles/actions and closed capability/resource/network surfaces are frozen in 111-167; tasks pass exact profile flags and test cross-profile replay. |
| RR11 honest acquisition bounds | Closed | HTTP/release limits are hard, stock Git transfer is explicitly unbounded, and DNS/address/redirect/proxy/credential/config isolation is fail-closed (4398-5007, Task 7). |
| RR12 complete gates | Closed | Every code slice has Core schema/codegen/contracts/type/tests, SlopBrick lint/type/full test/build, recursive gates where required, and diff-check; the final handoff gate is in 8094-8191. |
| RR13 vertical execution | Closed | Tasks 1A, 1B, 2A, 2B, 3A, and 3B each produce a runnable vertical result with red/green proof, full gates, review, and bounded commit (5123-5879). |

## High-risk execution audit

| Area | Result |
| --- | --- |
| Task 0 / 1A boundary | Release Tasks 1-6 and the coordinated Core `0.3.0` tranche precede admission changes; tool probes are diagnostic until schema-valid profile receipts exist. Failures are profile-scoped rather than globally over-coupled. |
| Evidence and byte ownership | Evidence bytes are never duplicated when a verified materialization already owns them. CAS completion, envelope, acquisition generation, and private evidence-context branding form an acyclic, recoverable graph. |
| Nested publication and recovery | Every parent has an exact slot set and intent-authority companion where needed. Generic handoffs are transient; only witness/prerequisite/manifest completions embed addressable immutable twins. Lock-only windows and transaction-before-lock cleanup are fault-tested. |
| SlopBrick authority brands | Evidence, final context, ready census, manifest prerequisites, and manifest consumers use module-private WeakSets. Serialized/cast/cloned/cross-process objects cannot transfer authority; each mutating process reconstructs its brand. |
| 329 reviews and historical fan-out | Generation 0 is exactly 329/329. Existing-leaf remediation preserves the count; Task 6 invokes a shared historical adapter once per exact registered repository ID and emits per-leaf proposals only. |
| Temporal evidence | External exact-byte observation and two independent provenance reviews are required for historical gold; Git history alone cannot promote. |
| Overlap and resource safety | The gold method is threshold-complete and integer-exact; LSH remains diagnostic. All unbounded relations spill to bounded shards, and a real-byte resource receipt is mandatory. |
| Git/release acquisition | No raw shell authority, checkout filters, submodules, LFS, hooks, inherited credentials, redirects, or private-network fallback. Git network-byte limits are not fabricated. |
| Witness publication | Search computation and publication receipts are distinct; bundle/completion references are hash-derived and census-pinned; routing projections cannot authorize a witness. |
| Task 9 / RR5 manifest boundary | Prerequisite requests, completions, current refs, immutable bundles, build receipts, generation/current publication, packed Node 22/24 proof, and consumer integration all freeze against the same implementation commit. Each release consumer reopens the complete graph in-process. |
| Final gates and vertical slices | Tasks 1A-3B are independently runnable vertical increments. Tasks 7/9A/9B and the final handoff include recursive gates; Task 9B also tests the exact installed tarball and all three v10.3.2 consumers. |

## Plan-quality and preflight lenses

- **Clarity:** ownership, dependencies, files, commands, transaction phases,
  failure exits, and commit boundaries are explicit enough to implement
  without inventing authority.
- **Verification:** each vertical slice starts with red behavioral/contract
  tests, contains mutation and crash tests proportional to risk, and ends with
  focused plus full gates.
- **Completeness:** source admission, witness publication, prerequisite trust,
  manifest publication, consumer reconstruction, recovery, and downstream
  release sequencing are all covered.
- **Context and alternatives:** the plan preserves the honest 0/0 baseline,
  separates fact from inference, retains LSH and sensitivity cohorts only as
  diagnostics, and states explicit stop conditions instead of relaxing gates.
- **Security:** path containment, no-follow handling, SSRF/DNS rebinding,
  credentials/config/hooks, archive bombs, secrets/PII, and unknown-file
  preservation are covered.
- **Performance:** the 452,382-row authority has hard heap/RSS/disk/open-file/
  shard/wall bounds and a mandatory real-distribution receipt.
- **Migration and compatibility:** Core uses one unreleased `0.3.0` tranche;
  `admissionBinding` is additive; legacy v10.3.0/v10.3.1 bytes and flat-path
  behavior remain stable, while v10.3.2 cannot downgrade to legacy mode.
- **Reversibility:** immutable generations, expected-current CAS, prior
  history, no-clobber promotion, explicit recovery, and transaction-before-
  lock cleanup preserve the last valid authority.

## Mechanical validation of the frozen documents

- TypeScript fenced blocks: admission 13, release 4, syntax errors 0.
- Bash fenced blocks: admission 35, release 14, `bash -n` errors 0.
- Duplicate TypeScript interface/type members: 0.
- Duplicate TypeScript declarations across each document: 0.
- Markdown fence parity: even for all four inputs.
- `TODO`/`TBD`/`FIXME`/placeholder scan: no hits.
- Stale flat witness/manifest path and synthetic source-ID scan: no hits.
- `git diff --check` on all reviewed files: clean.
- Final rehash: exactly matches the frozen SHA-256 table above.

## Final verdict

**READY TO EXECUTE.** All C1-C6, I1-I9, M1-M4, and RR1-RR13 are closed in
operative interfaces, tasks, tests, commands, and gates. Implementation must
still proceed task-by-task and may claim completion only after the plan's own
external evidence, recovery, packed-runtime, witness, manifest, smoke, and
canary gates actually pass.
