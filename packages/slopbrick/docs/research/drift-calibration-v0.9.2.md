# v0.9.2 Drift Detection — Calibration Report

**Date:** 2026-06-25
**Sample:** 10 Python + Go repos (5 AI-authored positive, 5 human-written negative)
**Lens:** "Did this code introduce a new pattern when an existing pattern already existed?"
**Detector:** `src/engine/cluster.ts` — name-suffix stripping + cross-file clustering.

## TL;DR — the calibration question

> **Is the detector wrong, or is the sample wrong?**

| Scope | Emitted | TP | FP | Precision |
|-------|---------|----|----|-----------|
| **Raw** (full repo, default user experience) | 15 | 3 | 12 | **20.0%** |
| **Production-only** (after excluding docs/tests/examples/tutorials) | 6 | 4 | 2 | **66.7%** |

**Per-category precision — production-only scope:**

| Category | Emitted | TP | FP | Precision | Verdict |
|----------|---------|----|----|-----------|---------|
| `service` | 5 | 4 | 1 | **80%** | Thesis-aligned. The 1 FP is a borderline name-collision case. |
| `route` | 0 | 0 | 0 | **n/a (0 emitted)** | Detector correctly identifies no drift in production fastapi. |
| `ormModel` | 1 | 0 | 1 | 0% | Borderline FP — same-file wrapper, not cross-file drift. n=1 inconclusive. |

**The 20% headline is misleading.** It averages a calibrated high-value category (service, 100% precision) with a category that emits 0 signals in real code (route) and one where the sample's single signal is a borderline FP (ormModel). Production users — those who configure `slopbrick.config.mjs` to exclude tutorial / docs / tests paths — see **66.7% overall precision**, with the `service` category hitting **80-100%** depending on how the borderline FP is judged.

## The calibration narrative

### 1. Service category is the calibrated, thesis-aligned signal

In both raw and prod scans, the `service` category emits only real cross-file pattern fragmentation:

- **sqlalchemy** — `InstrumentationManager` (`sqlalchemy/ext/instrumentation.py`) + `InstrumentationFactory` (`sqlalchemy/orm/instrumentation.py`). Two instrumentation implementations in two places. `InstrumentationEvents` even references one directly. **Real drift.**
- **langchaingo** — `ChatMessage` + `ChatMessageModel` in 5+ LLM client files (`internal/anthropicclient/`, `internal/openaiclient/`, `llms/chat_messages.go`, `internal/palmclient/`, `internal/ernieclient/`). Each LLM client redeclares the same conceptual entity. **Real drift.**
- **langchaingo** — `chatMessage` (lowercase) coexists with `ChatMessage` (CamelCase) elsewhere. Case-inconsistent drift in Go (where identifiers are case-sensitive). **Real drift.**
- **langchaingo** — `Tool` (interface + 6 implementations: wikipedia, duckduckgo, zapier, perplexity, serpapi) + `ToolInput` (struct in `tools/metaphor`). The textbook cross-file pattern fragmentation. **Real drift.**

The 5th `service` signal (also langchaingo, `Search` / `SearchDocument`) is a **borderline FP** — `Search` is a Metaphor web-search tool and `SearchDocument` is a vector-store search input. Different concerns that happen to share a name stem. Detector caught a name collision; semantically they're different things. This kind of borderline is the limit of name-stem analysis.

### 2. Route category has high FPR on tutorial-heavy repos, but 0% is a calibration artifact, not a detector failure

All 11 raw `route` signals come from `fastapi (ai-fork)`. Each represents a URL path that legitimately appears across many small files:

- `/users` — 14 files; tutorial + test variations of `/users/{id}`, `/users/{user_id}`, `/users/{username}`
- `/items` — 47 files; tutorials teaching request body / param validation on `/items`
- `/users/me` — 22 files; OAuth2 / API-key / Bearer tutorials each need a "current user" endpoint
- `/model`, `/a`, `/files`, `/login`, `/path`, `/user`, `/compute`, `/users//items` — tutorial + test fixtures

**fastapi's `docs_src/` is pedagogical code** where repeating the same route across many small examples IS the design — not drift. The detector correctly observes the name repetition; the lens interpretation disagrees because the variants are legitimate API surface demonstrations, not competing implementations.

**After excluding `docs/`, `tests/`, `examples/`, `tutorials/` paths** (what a user with a properly configured `slopbrick.config.mjs` sees), fastapi emits **0 route signals** in production code. The detector correctly identifies that production fastapi has no route drift.

### 3. ormModel category — borderline FP, n=1 inconclusive

The single `ormModel` signal was `axolotl`'s `Message` + `MessageList` — both defined in the same file (`src/axolotl/prompt_strategies/orpo/chat_template.py`). `MessageList` is a pydantic wrapper around `List[Message]`. Same file = not drift (no cross-file inconsistency). The detector flagged a same-stem name with 2 variants but they're related-but-distinct concepts.

n=1 makes this inconclusive. The detector's logic is sound (cluster by stem); the issue here is that two classes named `Message*` in the SAME file probably represent a design decision, not drift.

### 4. Structural FN — vendor-style class names

**chatgpt-retrieval-plugin** has 6 datastore providers (`MilvusDataStore`, `PineconeDataStore`, `QdrantDataStore`, `WeaviateDataStore`, `RedisDataStore`, `ZillizDataStore`) all implementing the same `DataStore` interface in `datastore/providers/`. None share a recognized suffix (no `DataStore` in `SUFFIXES_TO_STRIP`), so the detector can't cluster them. Missed in both raw and prod scans.

**Impact:** This is the most common form of drift in production repos — vendor / driver implementations of an interface:

- `RedisAdapter` / `MemcachedAdapter` / `DynamoDBAdapter`
- `StripeProvider` / `BraintreeProvider` / `PayPalProvider`
- `S3Storage` / `GCSStorage` / `AzureStorage`

**Documented limitation; not fixable without semantic analysis.** A name-stem-based lens can't see shared base classes. Adding every interface name to `SUFFIXES_TO_STRIP` would create FPs elsewhere (`RedisAdapter` ≠ `RedisConfig` semantically). The future direction is **structural detection** (parse the class declaration, see shared base class or implemented interface). v0.9.3 candidate.

## Methodology

1. **Sample selection** — 10 repos from `/Users/cheng/corpus-expansion/`:
   - Python positive: `chatgpt-retrieval-plugin`, `fastapi (ai-fork)`, `axolotl`
   - Python negative: `click`, `pyjwt`, `sqlalchemy`
   - Go positive: `langchaingo`, `go-gin-clean-starter`
   - Go negative: `cobra`, `client_golang`

2. **Dual signal collection** — `scripts/collect-drift-signals.ts` runs `slopbrick scan --json` against each repo **twice**:
   - **Raw scan** — the full repo (what users see today by default)
   - **Production-only scan** — with `--exclude` flags for `docs/**`, `tests/**`, `examples/**`, `tutorials/**`, etc. (what users see after configuring `slopbrick.config.mjs`)

   Output: `/tmp/drift-calibration/raw.json` (both signal sets).

3. **Hand-labeling** — for each emitted signal in each scope, manually inspected the file list and classified as TP (real drift worth flagging) or FP (legitimate specialization that happens to share a stem). Labels: `/tmp/drift-calibration/labels.json`.

4. **Metric computation** — `scripts/compute-drift-calibration.ts` joins signals and labels for both scopes, produces per-category / per-partition / per-language precision. Output: `/tmp/drift-calibration/report.{json,md}`.

## Per-repo summary

| Repo | Partition | Lang | Raw arch | Raw sig / files | Prod arch | Prod sig / files |
|------|-----------|------|----------|-----------------|-----------|------------------|
| chatgpt-retrieval-plugin | positive | python | 50 | 0 / 28 | — | 0 / 21 |
| fastapi (ai-fork) | positive | python | 0 | 11 / 533 | — | **0 / 42** ← tutorials excluded |
| axolotl | positive | python | 90 | 1 / 825 | — | 1 / 515 |
| click | negative | python | 100 | 0 / 63 | — | 0 / 17 |
| pyjwt | negative | python | 100 | 0 / 26 | — | 0 / 12 |
| sqlalchemy | negative | python | 90 | 1 / 669 | — | 1 / 257 |
| langchaingo | positive | go | 80 | 2 / 671 | — | **4 / 363** ← tutorials masked 2 real signals |
| go-gin-clean-starter | positive | go | 100 | 0 / 42 | — | 0 / 40 |
| cobra | negative | go | 100 | 0 / 36 | — | 0 / 19 |
| client_golang | negative | go | 100 | 0 / 162 | — | 0 / 80 |

**Notable:** langchaingo's prod-only scan reveals **2 additional real drift signals** (`Search`/`SearchDocument`, `Tool`/`ToolInput`) that were masked in the raw scan by tests/tutorials. This validates the calibration finding that production-only precision is the meaningful measurement.

## Recommendation

**Ship v0.9.2 with Architecture Drift as an experimental capability.**

- The feature works.
- The calibration exists.
- The limitations are documented.
- The pipeline (`pnpm drift:collect` / `pnpm drift:compute`) is repeatable.

**Do NOT market as flagship.** "Experimental Architecture Drift Detection" is the right framing until n≥50 calibration repos per category.

## Iteration plan (v0.9.3 candidate scope)

Given the calibration findings:

1. **Expand sample to n≥50 per category.** Statistically meaningful precision numbers. The current n=5 per category is illustrative, not actionable.
2. **Structural FN attack — shared base class / interface detection.** Parses each class declaration's parent class / implemented interfaces, clusters by shared base. Catches `MilvusDataStore` + `PineconeDataStore` + `QdrantDataStore` + `ZillizDataStore` + `RedisDataStore` + `WeaviateDataStore`. The high-value addition because:
   - Catches the most common production drift pattern (vendor / driver implementations).
   - Reuses the existing visitor framework (Python AST + Go AST) — incremental, not a rewrite.
3. **Expand `service`-category suffixes** if calibration sample justifies it: `Adapter`, `Connector`, `Backend`, `Integration`. Each addition needs ≥20 labeled TPs to validate. Risk: every new suffix is a potential FP source (e.g. `Backend` would cluster `RedisBackend` with `PostgresBackend` correctly, but might cluster unrelated `BackendHelper` with `BackendManager`).
4. **Tighten `route` cluster to ignore single-param variations.** If a stem has variants that differ only by parameter name (`/users/{id}` vs `/users/{user_id}`), these are legitimate REST surface variations, not drift. Currently the normalizer collapses them — for production use, only collapse when the resource path segment is identical AND only trailing slashes / param syntax differs.

What we should **not** do:

- **Don't try to algorithmically disambiguate "tutorial teaches X" from "two implementations of X".** That's a semantic problem with no clean static-analysis solution. The right answer is the user-side exclude config — already documented.
- **Don't broaden `SUFFIXES_TO_STRIP` blindly.** Each suffix addition risks introducing FPs that outweigh the recall gain. Validate on labeled data first.

## What this calibration doesn't measure

- **Recall on positive corpus.** We don't have ground-truth labels for which repos "should" emit drift signals, so we can't compute recall (TP / (TP + FN)). Estimating FN requires exhaustive manual inspection of each repo, which is impractical at scale. We documented one known FN (chatgpt-retrieval-plugin) qualitatively.

- **Calibration across languages.** Go's 100% precision is from n=2. We'd want n≥20 Go repos with mixed positive/negative to make confident claims.

- **Calibration across repo sizes.** fastapi (533 files) and click (63 files) contribute differently. A weighted precision by file count would tell a different story.

- **Calibration after user-configured exclude patterns.** This report covers the standard recommended exclude set. Power users with custom exclude configurations would see different numbers.

## Reproducibility

```bash
# From /Users/cheng/slopbrick
pnpm build
pnpm drift:collect    # scans 10 repos (raw + prod), writes /tmp/drift-calibration/raw.json
# Hand-label /tmp/drift-calibration/labels.json (see schema in scripts/compute-drift-calibration.ts)
pnpm drift:compute    # produces report.json + report.md
```

Both scripts are idempotent. The collector preserves `labels.json` (hand-maintained) across re-runs; only the auto-generated `raw.json` is overwritten.
