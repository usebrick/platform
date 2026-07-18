# ADR: Corpus v1 admission contract

- **Status:** Accepted
- **Date:** 2026-07-17
- **Decision owner:** Usebrick calibration maintainers
- **Plan:** `CORPUS-DEC-001`
- **Supersedes for new work:** directory-polarity v5 labels and the unbounded
  v10.3 authority workflow; it does not rewrite their historical evidence

## Context

SlopBrick needs a reproducible corpus for two different questions:

1. **Origin association:** does a signal differ between source-labeled AI and
   human code?
2. **Rule utility:** does a finding identify a concrete implementation problem
   that a developer finds useful and can fix?

Those questions must not share a hidden label. AI-origin code is not
automatically bad, and human-origin code is not automatically good.

The legacy v5 lists contain 224,903 paths under `positive` and 227,479 under
`negative`, but their only label source is directory membership. They lack
immutable origins, rights decisions, content hashes, family keys, and splits;
they remain inventory, not labeled Corpus v1 evidence.

The local Mendeley `HumanVSAI_CodeDataset` version 1 candidate is materially
stronger. Its pinned audit records a 2,251,807-byte archive with SHA-256
`c6cb156a8fa627c9228b7798ea7d25be9327a4d1f72f40b16ddae3e6d807e0c4`,
a 10,000-row CSV with SHA-256
`7f38972cbbd3f7f26988e77e3b9e8fce2fa92fb8bbc30911a51dc93cded4b192`,
5,000 rows labeled AI, 5,000 labeled Human, and dataset metadata declaring CC
BY 4.0. The publisher attributes AI rows to ChatGPT-3.5 or ChatGPT-4 and human
rows to CodeNet. These are publisher attestations, not independently witnessed
row-level authorship.

## Decision

### 1. Labels and authority

Corpus v1 uses AI as the positive class and human as the negative class only
when an immutable source explicitly supplies that label.

| Tier | Meaning | Fit/evaluation use |
| --- | --- | --- |
| `publisher_attested` | A versioned dataset publisher supplies the origin label and immutable source bytes can be bound | Allowed for the bounded internal seed and reported as publisher-attested |
| `repo_self_attested` | An owner-controlled repository statement says the application itself was AI-built | Ecological validation; fitting requires a later reviewed protocol |
| `witnessed` | Generation or human-submission evidence is bound to the exact unit | Highest-confidence origin evaluation when available |
| `exposure_proxy` | Topics, agent files, tool use, or a pre-LLM date indicate exposure/era only | Sensitivity analysis only; label is `none` |
| `unknown` | No adequate origin statement exists | Unlabeled prevalence analysis only |

Repository age, topics, agent configuration, commit velocity, style, perceived
quality, and directory names never create an AI or human label. A pre-Copilot
snapshot is a temporal proxy, not human ground truth.

### 2. First admitted source boundary

The first Corpus v1 build may admit the pinned Mendeley v1 rows for **internal
analysis** at authority tier `publisher_attested` after the builder verifies:

- the exact archive and CSV hashes above;
- the publisher label and source columns without remapping by path;
- a recorded dataset-version/DOI reference bound to version 1;
- per-unit content and normalized-content hashes;
- `problem_id` family grouping;
- deterministic family-level splits; and
- exact and normalized cross-label collision quarantine.

The article's reference to an unavailable v2 does not silently upgrade or
invalidate v1. Corpus v1 cites the checked v1 bytes and limits claims to the v1
publisher metadata.

This ADR does not authorize republishing source rows. The source record stores
the declared license and evidence, while `rightsDisposition` remains
`internal_analysis` until a separate redistribution review accepts the
upstream chain. Reference-only sources never enter a shipped byte bundle.

### 3. Unit manifest

Every admitted unit records at least:

```text
corpusVersion · unitId · sourceId · sourceVersion · sourceUri
sourceArchiveSha256 · sourceRecordId · contentSha256 · normalizedSha256
label · authorityTier · authorityEvidenceRef · language · familyKey · split
licenseId · licenseEvidenceRef · rightsDisposition · byteCount
```

`unitId` is derived deterministically from source version and record identity.
`familyKey` is `sourceId + problem_id` for the first source. Related rows and
all cross-variant implementations of one problem stay in one split.

The split is deterministic from the family-key hash: 80% train, 10%
validation, and 10% test. Re-running with identical source bytes and builder
version must produce identical manifests and receipt hashes.

### 4. Collision and leakage policy

- Exact or normalized content appearing in both labels is quarantined from
  both classes until adjudicated.
- Same-label duplicates collapse to one family record or remain in one split.
- Prompt/problem siblings never cross splits.
- Source families cannot straddle train, validation, and test.
- The smoke receipt reports raw, eligible, deduplicated, quarantined, and
  admitted counts separately.

### 5. Smallest executable gate

The first executable build is a deterministic **100 positive / 100 negative**
smoke from eligible Mendeley v1 families. It runs twice with one worker and a
fixed builder version. Both runs must produce the same manifest and receipt
SHA-256 values and zero unresolved cross-label collisions.

Only after that smoke passes may the builder project the remaining eligible
publisher-labeled rows. Raw source size is never an admission count.

### 6. Other local sources

- **OSS-forge HumanVsAICode:** remains quarantine/reference-only for now. Its
  pinned payload is large and useful, but upstream per-row rights, family
  leakage, and origin-attestation boundaries need a smaller separate review.
- **FormAI v1:** may support positive-class sensitivity analysis using its
  repository-wide GPT-3.5 claim, but it does not supply the matched
  publisher-attested human-negative seed required here.
- **Legacy v5 and repository clones:** remain unlabeled inventory unless each
  source gains immutable origin, rights, and label evidence under this ADR.
- **New GitHub repositories:** owner statements can form an ecological cohort;
  ordinary recent repositories and pre-LLM snapshots remain unlabeled proxies.

Failure of one source quarantines that source and continues with another
eligible source or a smaller honest corpus. It does not stop independent
SlopBrick, website, MemoryBrick, or owner-validation work.

## Allowed claims

After the smoke passes, documentation may say:

> Evaluated on a reproducible 100/100 smoke from the publisher-labeled
> HumanVSAI_CodeDataset v1, with family-level splits and collision checks.

It may not say "authorship proven," "human-written ground truth," "gold
corpus," "v10.3 admitted," or imply that origin predicts code quality.
Rule activation still requires the rule-specific acceptance criteria in the
calibration plan; this ADR alone activates no rule or threshold.

## Source use is not rule admission

This ADR authorizes bounded source use at an explicit claim ceiling. It does
not collapse later decisions:

```text
source permitted use != v10.3 gold admission
source permitted use != redistribution approval
source permitted use != usefulness review
source permitted use != rule application
```

`CORPUS-002` implements this separation with a deterministic source policy and
closed registry. The current Mendeley disposition is
`publisher_attested` + `verified` + `internal_analysis`, which permits internal
origin measurement and calibration evaluation. CAL-001 and owner review remain
separate; no source disposition can set a threshold, activate a rule, or claim
finding usefulness.

## Consequences

- Corpus construction can proceed locally without inventing an external
  approver or re-auditing hundreds of thousands of legacy paths.
- The seed is smaller and its authority label is weaker but more honest than
  the prior `verified_ai`/`verified_human` naming.
- Public corpus redistribution remains a separate rights decision.
- Ecological GitHub research can continue in parallel without contaminating
  the fitted origin labels.

## Verification and evidence

The builder plan must cite this ADR and write its receipt to
`docs/execution/evidence/CORPUS-001-seed-receipt.md`. The source facts above are
bound to:

- `/Users/cheng/corpus-expansion/v10.3/review/mendeley-humanvsai-audit-2026-07-14.json`
- `/Users/cheng/corpus-expansion/v10.3/review/v5-provenance-audit.md`

The absolute paths are execution inputs on this machine, not portable corpus
identifiers. Portable receipts store source URIs, versions, hashes, and
repository-relative evidence references.
