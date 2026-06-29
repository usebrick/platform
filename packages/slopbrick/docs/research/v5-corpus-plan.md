# v5 corpus expansion — multi-arm calibration plan (2026-06-26)

**Date:** 2026-06-26
**Status:** Plan — pending execution
**Authoritative scope:** Adds three new corpus arms for rules shipped since v4 (docs/*, db/*, maintenance-cost) and re-tests INVERTED rules on Python.
**Horizon:** Closes the calibration gap so the v0.10 credibility moat extends to every shipped rule. v1.0 stability commitment is preserved — no new scores, only re-calibrated weights.

---

## Why v5 is needed

The v4 corpus (2026-06-25, 101,156 neg + 105,563 pos = 0.96:1) calibrated the 45 v0.9.x-era rules, **but only the frontend arm (TS/TSX/JS/JSX)**. Since then, three new rule families shipped without calibration:

| Rule family | File types | v4 corpus has any? | Risk if shipped uncalibrated |
|---|---|---|---|
| `docs/stale-package-reference`, `docs/stale-function-reference`, `docs/expired-code-example`, `docs/broken-link` | `.md`, `.mdx` | ❌ zero | False positives on README cross-refs; user disables rule in a week |
| `db/missing-fk-index`, `db/duplicate-index`, `db/dead-column`, `db/dead-table`, `db/naming-inconsistency`, `db/enum-sprawl`, `db/missing-not-null`, `db/sql-concat` | `.sql`, Drizzle/Prisma `.ts` | ⚠️ Drizzle `.ts` partly covered; SQL zero | Same — unverified precision will get disabled |
| `maintenance-cost` (categorical + `monthlyUSD`) | meta-score | n/a — but weights are heuristic, not labeled-outcome-fitted | Manager trust collapse on first mis-call |
| `slop_governance` / Repository Health composite | meta-score | n/a | Same |

Additionally, 11 INVERTED rules on the JS arm (`component/multiple-components-per-file`, `context/import-path-mismatch`, etc.) might be language-specific. Python has different conventions (single file per module is normal; relative imports are idiomatic). Re-testing INVERTED rules on a Python arm costs nothing and could yield new USEFUL rules.

---

## v5 targets (delta from v4)

**Insight (2026-06-26):** the v4 corpus already contains substantial SQL and Python arms that were not extracted per-rule. **354 neg + 977 pos `.sql` files** and **4,774 neg + 23,900 pos `.py` files** already exist under `/Users/cheng/corpus-expansion/`. Only the markdown arm needs new cloning. This shrinks v5 from "140k new files" to "60k new files (markdown only)."

| Arm | Files | Source strategy | Status |
|-----|------:|-----------------|--------|
| **markdown** (neg) | 30,000 | Docusaurus/Mintlify/Vitepress/Nextra/MkDocs repos, public docs sites, popular open-source READMEs | **only new arm to clone** |
| **markdown** (pos) | 30,000 | v0/Lovable/Cursor-generated docs from vibe-coded apps, plus the `docs/` dirs of the 100 positive repos already cloned in v4 | **extract from v4 + clone** |
| **SQL+ORM** (neg) | 354 (existing in v4) + supplement | Already in v4 (discourse, postgres, etc.); supplement with drizzle/prisma clones | **extract from v4** |
| **SQL+ORM** (pos) | 977 (existing in v4) + supplement | Already in v4 | **extract from v4** |
| **Python** (neg) | 4,774 (existing in v4) | Already in v4 | **extract from v4** |
| **Python** (pos) | 23,900 (existing in v4) | Already in v4 | **extract from v4** |
| **Total v5 corpus** | ~60k new + ~206k carried from v4 = **~266k files** | 4 arms: TS/JS (v4), MD (new), SQL (existing), Python (existing) | |

**Time savings:** by reusing v4's existing SQL/Python arms, we save the clone time (~30 min) and the scan time for those arms (the data is already cached). The only new clone cost is markdown (~30 min for ~30k files).

### Existing v4 file counts (verified 2026-06-26)

| Extension | Neg | Pos | Total |
|-----------|----:|----:|------:|
| `.ts` | (in v4) | (in v4) | ~145,000 |
| `.tsx` | (in v4) | (in v4) | ~46,000 |
| `.js` | (in v4) | (in v4) | ~6,700 |
| `.jsx` | (in v4) | (in v4) | ~170 |
| **`.py`** | **4,774** | **23,900** | **28,674** |
| **`.sql`** | **354** | **977** | **1,331** |
| `.md` / `.mdx` | 0 | 0 | 0 (need to clone) |
| `.go` | (in v4) | (in v4) | ~620 |

### Cross-arm rule transferability test

The v5 plan also runs **all 62 existing rules on the new arms** (Python + SQL + markdown) to test whether JS-frontend rules transfer to other languages:

- **Python arm:** 62 rules scanned against 4,774 neg + 23,900 pos. Tests whether the 11 INVERTED rules (`component/multiple-components-per-file`, `context/import-path-mismatch`, etc.) are language-specific. May yield new USEFUL rules in Python-native contexts.
- **SQL arm:** 62 rules scanned against 354 neg + 977 pos. Most rules should be DORMANT (they look for JSX/CSS patterns), but `db/*` rules will fire — this is the calibration target.
- **Markdown arm:** 62 rules scanned against the new 30k+30k. `docs/*` rules will fire; everything else mostly DORMANT.
- **Re-test INVERTED JS rules on Python:** if e.g. `component/multiple-components-per-file` becomes USEFUL on Python (where single-file-per-module is idiomatic, so the rule inverted in JS context might be normal in Python), it can be re-enabled per-arm.

**Scan budget:** existing v4 cache + new markdown scan (~10 min) + Python/SQL re-scan with new rules (~5 min each) = **~25 min total**.

---

## Markdown arm

### Negative sources (production-grade docs, human-written)

| Repo | Notes |
|------|-------|
| `facebook/docusaurus` | Meta's docs framework, exhaustive examples |
| `withastro/docs` | Astro documentation site |

---

## Markdown arm

### Negative sources (production-grade docs, human-written)

| Repo | Notes |
|------|-------|
| `facebook/docusaurus` | Meta's docs framework, exhaustive examples |
| `withastro/docs` | Astro documentation site |
| `vitejs/vite` | Main project repo with extensive docs/ |
| `vuejs/docs` | Vue 3 docs |
| `nuxt/docs` | Nuxt 3 docs |
| `sveltejs/svelte` | Svelte 5 docs |
| `tailwindlabs/tailwindcss.com` | Tailwind site source |
| `shadcn-ui/ui` | shadcn registry READMEs |
| `microsoft/TypeScript-Website` | TS official site |
| `nodejs/node` | Node.js docs |
| `python/cpython` | Python docs (also for cross-arm) |
| `django/django` | Django docs |
| `kubernetes/website` | K8s docs |
| `grafana/grafana` | Grafana docs |
| `supabase/supabase` | Supabase docs (mix of neg + positive SQL) |

Cap at 2,000 `.md`/`.mdx` files per repo.

### Positive sources (AI-generated docs)

1. **Existing v4 positive repos** — most of the 100 vibe-coded repos have generated READMEs. Extract `.md` files from `/Users/cheng/corpus-expansion/positive/vibe-coded/{name}/README.md` and `/docs/**/*.md`.
2. **Mintlify AI demos** — `mintlify/agentok`, `mintlify/examples` if findable.
3. **Lovable app docs** — search GitHub for `lovable` topic, take README + docs from each.

Cap at 2,000 files per source.

---

## SQL+ORM arm

### Negative sources (production schemas)

| Repo | File types |
|------|-----------|
| `supabase/supabase` | `supabase/migrations/*.sql` |
| `prisma/prisma` | `prisma/*.prisma` |
| `prisma/prisma-examples` | `prisma/*.prisma` + `*.sql` |
| `drizzle-orm/drizzle-orm` | `*.ts` (schema) + examples |
| `drizzle-team/drizzle-kit-mirror` | mirror if available |
| `typeorm/typeorm` | sample schemas |
| `sequelize/sequelize` | test fixtures |
| `kysely/kysely` | example schemas |
| `postgres/postgres` | regression test SQL |
| `sqldef/sqldef` | test SQL fixtures |
| `sqitchers/sqitch` | migration examples |

### Positive sources (vibe-coded schemas)

1. Extract `prisma/schema.prisma` and `drizzle/*.ts` from the 100 existing v4 positive repos.
2. Search GitHub for `topic:prisma topic:ai-generated`, `topic:drizzle topic:ai-generated`.

---

## Python arm

### Negative sources

| Repo | Domain |
|------|--------|
| `django/django` | web framework |
| `pallets/flask` | microframework |
| `tiangolo/fastapi` | async framework |
| `encode/django-rest-framework` | DRF |
| `sqlalchemy/sqlalchemy` | ORM |
| `pytest-dev/pytest` | test framework |
| `pydantic/pydantic` | data validation |
| `psf/requests` | HTTP client |
| `python/mypy` | type checker |
| `scikit-learn/scikit-learn` | ML |
| `pandas-dev/pandas` | data analysis |
| `numpy/numpy` | numerical |
| `apache/airflow` | workflow |
| `celery/celery` | task queue |
| `redis/redis-py` | redis client |
| `encode/httpx` | async HTTP |
| `Textualize/rich` | terminal UI |
| `pypa/pip` | package manager |
| `tox-dev/tox` | test automation |

Cap at 2,000 `.py` files per repo.

### Positive sources

1. **Promptless-generated backends** — search GitHub for repos tagged `promptless`, `cursor-built`, `claude-built`.
2. **Existing v4 vibe-coded repos with Python backends** — extract `*.py` from any FastAPI/Flask/Django backend in the 100 positive repos.
3. **Aider polyglot benchmarks** — Aider publishes Python samples at https://aider.chat/docs/leaderboards/ if findable.

---

## Scan + calibrate workflow

```bash
# 1. Set up v5 corpus structure
mkdir -p /Users/cheng/corpus-expansion/v5/{markdown,sql,python}/{neg,pos}
mkdir -p /Users/cheng/corpus-expansion/v5/filelists

# 2. Clone repos in parallel (xargs -P 8 git clone --depth 1)
cd /Users/cheng/corpus-expansion/v5/markdown/neg && \
  for r in facebook/docusaurus withastro/docs vitejs/vite vuejs/docs; do
    gh repo clone "$r" "$(basename $r)" &
  done; wait

# 3. Build per-arm filelists
cd /Users/cheng/corpus-expansion
for arm in markdown sql python; do
  find v5/$arm/neg -type f \( -name "*.md" -o -name "*.mdx" -o -name "*.sql" -o -name "*.prisma" -o -name "*.py" \) | sort -u > filelists/v5-${arm}-neg-files.txt
  find v5/$arm/pos -type f \( -name "*.md" -o -name "*.mdx" -o -name "*.sql" -o -name "*.prisma" -o -name "*.py" \) | sort -u > filelists/v5-${arm}-pos-files.txt
done

# 4. Parallel scan (4 workers per arm)
SLOP_AUDIT_CHUNK=300 python3 scan-corpus-parallel.py v5-markdown-neg v5-markdown-neg 4
SLOP_AUDIT_CHUNK=300 python3 scan-corpus-parallel.py v5-markdown-pos v5-markdown-pos 4
SLOP_AUDIT_CHUNK=300 python3 scan-corpus-parallel.py v5-sql-neg      v5-sql-neg      4
SLOP_AUDIT_CHUNK=300 python3 scan-corpus-parallel.py v5-sql-pos      v5-sql-pos      4
SLOP_AUDIT_CHUNK=300 python3 scan-corpus-parallel.py v5-python-neg   v5-python-neg   4
SLOP_AUDIT_CHUNK=300 python3 scan-corpus-parallel.py v5-python-pos   v5-python-pos   4

# 5. Compute per-arm per-rule P/R/FPR
python3 compute-v5-per-rule.py \
  --neg-fires /tmp/v5-markdown-neg-fires.txt \
  --pos-fires /tmp/v5-markdown-pos-fires.txt \
  --n-neg 30000 --n-pos 30000 \
  --arm markdown \
  --out docs/research/v5-per-rule-pr-fpr.md

# 6. Update signal-strength.json with new verdicts
# (defaults: USEFUL → enabled; OK/NOISY/INVERTED → defaultOff: true)

# 7. Update tests/integration/calibration-*.test.ts RATIO_THRESHOLDS
# (split per-arm test files so the frontend arm doesn't gate the others)

# 8. Update docs/research/calibration-report-2026.md with v5 numbers
```

**Time budget:** ~30 min clone (parallel) + ~30 min scan (parallel) + ~10 min compute = **~70 min end-to-end**.

---

## Verdict logic (carried from v4)

| Verdict | Criteria |
|---------|----------|
| **USEFUL** | P ≥ 50% AND lift ≥ 2 |
| **OK** | P ≥ 30% AND lift ≥ 1.5 |
| **NOISY** | everything else |
| **INVERTED** | lift < 1.0 |
| **DORMANT** | 0 fires on both corpora |

USEFUL rules ship enabled; OK rules ship enabled with a "lower confidence" annotation; NOISY + INVERTED + DORMANT ship with `defaultOff: true`.

---

## Calibration test files (to add)

- `tests/integration/calibration-markdown.test.ts` — gates `docs/*` rules
- `tests/integration/calibration-sql.test.ts` — gates `db/*` rules
- `tests/integration/calibration-python.test.ts` — gates Python-native rules + re-tests INVERTED frontend rules
- `tests/integration/calibration-expanded.test.ts` — existing v4 frontend (unchanged)

This keeps the v0.10 credibility moat intact (per-arm thresholds, not a global "the rule works on TS/JSX" claim) while extending it to the new arms.

---

## Risk register

| Risk | Mitigation |
|------|------------|
| 100k markdown files impossible to source | Fall back to 50/50 split per arm (15k neg + 15k pos markdown, 10k+10k SQL+ORM, 10k+10k Python). Document trade-off. |
| Pos corpus polluted by humans editing AI output | Sample 50 files, manual label verification; if > 20% mislabeled, drop the source. |
| INVERTED JS rules re-test as INVERTED on Python | Confirms language-specificity; add a note to v5-per-rule-pr-fpr.md and keep `defaultOff: true`. |
| `docs/*` rules have low precision on production READMEs (because they reference packages/functions that genuinely exist but are out of date) | Acceptable — the rule's value IS the false alarm (catches rot). Document as "high-recall, lower-precision; use as a hint not a gate." |
| v5 corpus work consumes time that could go to ROADMAP Phase 9 (Product Consistency) | Phase 9 is small-scope (terminology + UX pattern fragmentation). Run v5 scans in parallel; continue Phase 9 in foreground. |

---

## Cross-references

- `docs/research/v4-corpus-50-50-plan.md` — v3 → v4 expansion (the pattern this plan follows)
- `docs/research/v4-per-rule-pr-fpr.md` — v4 per-rule table (the format this plan extends)
- `docs/research/calibration-report-2026.md` — calibration trajectory v1 → v5
- `docs/research/labeled-dataset-protocol.md` — labeled-outcome data for composite score weights (Phase 12 partial)
