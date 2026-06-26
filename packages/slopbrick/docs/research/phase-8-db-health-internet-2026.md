# Phase 8 — Database Intelligence: Internet Research (June 2026)

Pre-implementation landscape scan of the static-analysis market for SQL/Prisma/Drizzle. Sources cited inline `[^N^]`. Time-window: 2024-Q1 → 2026-Q2.

---

## Per-tool summary

| Tool | What it catches | Maintenance (2026) | Verdict for slopbrick v1 |
|---|---|---|---|
| **`pgsql-parser` (npm)**[^1^] | Round-trips SQL ↔ AST via libpg_query; PG 13–17, WASM build, ~3 MB install | Active; `@pgsql/parser` & `@libpg-query/parser` re-published monthly[^2^] | **Adopt.** Real PG parser, not a regex. |
| **Squawk**[^3^][^4^] | Migration safety: concurrent index creation, lock-heavy DDL, bigint-over-int, NOT VALID, prefer-identity, `ban-drop-column` | Active (v2.58.0), Rust core | **Differentiate.** Migration safety ≠ schema quality. Link to their rules in advice. |
| **SlowQL**[^5^] | 282 rules: missing-index, full-scan, table/column reference validation, SQL injection, privilege, naming | Newer entrant | **Monitor.** Closest direct competitor. Differentiate on Prisma/Drizzle coverage. |
| **SQLFluff**[^6^][^7^] | Style + multi-dialect lint. Strong on style, weak on perf. | Active, large community | **Out of scope.** Multi-dialect complexity tax. `DO/PL` blocks unparsed (issue #5488). |
| **pg-index-health** (Java)[^8^] | Live-DB: missing/duplicate/unused indexes, dead columns, bloated tables, FK coverage | Active, JDBC required | **Out of scope v1.** Reaffirms static-only positioning. |
| **prisma-lint** (loop-payments)[^9^] | Naming, `@id`/`@unique` consistency, `@@map`/`@map` patterns | Active, production since 2021 | **Complement, don't compete.** Per-file rule matching vs. our schema-wide stats. |
| **`eslint-plugin-drizzle`**[^10^] | **Only two rules**: `enforce-delete-with-where`, `enforce-update-with-where` | Official, Drizzle team | **Massive gap.** No FK-index, no NOT NULL, no dead-column, no ENUM coverage. **This is our wedge.** |
| **Prisma VS Code extension**[^11^] | Syntax, formatting, jump-to-def; minimal semantic linting | Active | Not a competitor — IDE-only. |
| **`pganalyze Index Advisor 3.0`**[^12^] | Workload-aware missing-index suggestions from `pg_stat_statements` | Commercial SaaS | Phase 8.1 territory (live DB). |

## 5 actionable findings for v1

1. **Adopt `pgsql-parser` — the choice is vindicated.** libpg_query is the *actual* PostgreSQL parser shipped as WASM, with multi-version selection (PG 13–17)[^1^][^2^]. The 3 MB install cost is the only real argument against, and a one-time cost at the gateway entry is acceptable.

2. **The Drizzle ESLint plugin has only 2 rules** — `enforce-delete-with-where` and `enforce-update-with-where`[^10^]. This is the clearest signal that *static schema-quality analysis for Drizzle is an open market*. Marketing copy for `slopbrick db` should lead with this.

3. **Squawk owns migration safety; we own schema quality — don't fight them.** Squawk's ruleset[^4^] is *operational* (DDL-time concerns). Our 8 rules are *structural* (what's wrong with the schema). The `advice` field on our issues should link to the relevant Squawk rule where the two intersect (e.g., our `db/missing-fk-index` advice can say "after adding, use `CREATE INDEX CONCURRENTLY` per Squawk rule X").

4. **AI-generated SQL has a documented failure pattern matching our rule list.** A 2025 case study[^13^] describes a silent logic error in AI-written SQL that went undetected for 3 weeks and skewed quarterly revenue by 11.7%; broader industry reporting[^14^] puts 2025 AI-SQL-driven data-leak growth at +40%. The two most-cited failure modes — `missing NOT NULL` and `string-concat template literals` — are precisely two of our eight rules. Validates the v1 scope.

5. **Postgres-only is still the right v1 scope — and getting more right over time.** "It's 2026, Just Use Postgres" is a current narrative[^15^] with substantial traction. Multi-dialect SQL linters (SQLFluff) pay a heavy complexity tax for limited additional value in the AI-built-app segment[^6^][^7^]. Defer MySQL/SQLite to v2 (8.1) as the plan already does.

## Verdict for the plan

The plan is **well-scoped and the dependency choice is correct**. One small addition: in the `db/missing-fk-index` advice string, cross-link to Squawk's `require-concurrent-index-creation` rule — gives users a second-tool action without building the rule ourselves.

---

## Sources

[^1^]: pgsql-parser (npm) — https://www.npmjs.com/package/pgsql-parser
[^2^]: @libpg-query/parser (npm) — https://www.npmjs.com/package/@libpg-query/parser
[^3^]: Squawk home — https://squawkhq.com/
[^4^]: Squawk GitHub — https://github.com/sbdchd/squawk
[^5^]: SlowQL GitHub — https://github.com/slowql/slowql
[^6^]: SQLFluff dialect reference — https://docs.sqlfluff.com/en/stable/reference/dialects.html
[^7^]: SQLFluff issue #5488 — https://github.com/sqlfluff/sqlfluff/issues/5488
[^8^]: pg-index-health (Java) — https://github.com/mfaulther/pg-index-health
[^9^]: prisma-lint (loop-payments) — https://github.com/loop-payments/prisma-lint
[^10^]: Drizzle ESLint plugin — https://orm.drizzle.team/docs/eslint-plugin
[^11^]: Prisma VS Code extension — https://marketplace.visualstudio.com/items?itemName=Prisma.prisma
[^12^]: pganalyze Index Advisor 3.0 — https://pganalyze.com/blog/index-advisor-v3
[^13^]: "I trusted AI to write my SQL for 6 months" (Medium, 2025) — https://medium.com/write-a-catalyst/i-trusted-ai-to-write-my-sql-for-6-months-heres-what-silently-broke-45c9d220606a
[^14^]: "AI生成SQL的安全风险与测试框架" (CSDN, 2025) — https://blog.csdn.net/2501_94261392/article/details/157173182
[^15^]: "It's 2026, Just Use Postgres" (Tiger Data, 2026) — https://www.tigerdata.com/blog/its-2026-just-use-postgres
