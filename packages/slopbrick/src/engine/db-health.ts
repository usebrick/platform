// Database Health — Phase 8 (target 0.8.0).
//
// Static-only analysis of SQL / Prisma / Drizzle schema files.
// v1 ships 6 rules (Postgres-only, via pgsql-parser):
//   - db/missing-fk-index       (weight 5) — REFERENCES without index
//   - db/duplicate-index        (weight 4) — same column-list twice
//   - db/missing-not-null       (weight 4) — required columns without NOT NULL
//   - db/enum-sprawl            (weight 1) — CREATE TYPE ENUM with > 12 values
//   - db/naming-inconsistency   (weight 1) — snake_case / camelCase mixing
//   - db/sql-concat             (weight 5) — template literal SQL queries
//
// Two rules deferred to Phase 8.1 (v2 — needs live DB):
//   - db/dead-column
//   - db/dead-table
//
// Score formula: clamp(0, 100, 100 - (issueWeight / scannedFiles) * 5)
//
// Categorical bands:
//   80-100 low, 60-79 medium, 40-59 high, 0-39 critical

import { readFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { globby } from 'globby';
import { parse as parseSql, loadModule as loadSqlModule } from 'pgsql-parser';
import type { ResolvedConfig, DbFinding, Issue, Rule } from '../types';
import { duplicateIndexRule } from '../rules/db/duplicate-index';
import { enumSprawlRule } from '../rules/db/enum-sprawl';
import { missingFkIndexRule, moduleReady as fkModuleReady } from '../rules/db/missing-fk-index';
import { missingNotNullRule, moduleReady as notNullModuleReady } from '../rules/db/missing-not-null';
import { namingInconsistencyRule, moduleReady as namingModuleReady } from '../rules/db/naming-inconsistency';
import { sqlConcatRule } from '../rules/db/sql-concat';

// pgsql-parser is backed by a WASM module (libpg-query). It must be
// loaded once before the first parse call. Loading is idempotent and
// safe across the same Node process.
let moduleLoaded: Promise<void> | null = null;
function ensureSqlModule(): Promise<void> {
  if (!moduleLoaded) moduleLoaded = loadSqlModule();
  return moduleLoaded;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

export const DB_RULE_WEIGHTS: Record<DbFinding['ruleId'], number> = {
  'db/missing-fk-index': 5,
  'db/duplicate-index': 4,
  'db/missing-not-null': 4,
  'db/enum-sprawl': 1,
  'db/naming-inconsistency': 1,
  'db/sql-concat': 5,
} as const;

export const DB_FRESHNESS_THRESHOLDS = {
  low: 80,
  medium: 60,
  high: 40,
} as const;

// ---------------------------------------------------------------------------
// SQL AST helpers (pgsql-parser is built on libpg_query — see
// docs/research/phase-8-db-health-internet-2026.md)
// ---------------------------------------------------------------------------

interface ParsedSql {
  raw: string;
  filePath: string;
  statements: Array<{
    type:
      | 'CreateStmt'
      | 'CreateTableAsStmt'
      | 'IndexStmt'
      | 'AlterTableStmt'
      | 'DropStmt'
      | 'CreateEnumStmt'
      | 'Other';
    ast: any;
  }>;
}

async function parseSqlFile(filePath: string): Promise<ParsedSql | null> {
  let raw: string;
  try {
    raw = readFileSync(filePath, 'utf-8');
  } catch {
    return null;
  }
  let result: any;
  try {
    await ensureSqlModule();
    result = await parseSql(raw);
  } catch (err) {
    // Parse error — skip; the scanner's existing parseErrors field
    // already captures this.
    return null;
  }
  const stmts: ParsedSql['statements'] = [];
  for (const wrapper of result.stmts ?? []) {
    const inner = wrapper.stmt ?? {};
    const type = Object.keys(inner)[0] ?? 'Other';
    stmts.push({ type: type as never, ast: inner[type] });
  }
  return { raw, filePath, statements: stmts };
}

// ---------------------------------------------------------------------------
// Per-rule detection (SQL)
// ---------------------------------------------------------------------------

/** Required columns (heuristic: the schema author should mark these NOT NULL). */
const REQUIRED_COLUMN_HEURISTIC = /^(id|user_?id|order_?id|product_?id|tenant_?id|customer_?id|email|created_?at|updated_?at|deleted_?at|expires_?at|status|uuid|slug|handle|key|name)$/i;

/**
 * `db/missing-fk-index` — `REFERENCES table(col)` declared in a
 * `CREATE TABLE ... ( col TYPE REFERENCES ... )` without a matching
 * `CREATE INDEX ... ON table (col)`.
 */
function detectMissingFkIndexes(
  parsed: ParsedSql,
  fkColumnsByTable: Map<string, Set<string>>,
  indexColumnsByTable: Map<string, Set<string>>,
  relPath: string,
): DbFinding[] {
  const findings: DbFinding[] = [];
  for (const stmt of parsed.statements) {
    if (stmt.type !== 'CreateStmt') continue;
    const cs = stmt.ast;
    if (!cs?.relation?.relname || !Array.isArray(cs.tableElts)) continue;
    const tableName = cs.relation.relname;
    for (const elt of cs.tableElts) {
      const cd = elt.ColumnDef;
      if (!cd) continue;
      const colName = cd.colname;
      if (!Array.isArray(cd.constraints)) continue;
      for (const con of cd.constraints) {
        const c = con.Constraint;
        if (!c) continue;
        // FOREIGN KEY or REFERENCES — postgres AST uses 'CONSTR_FOREIGN'
        // plus a `pk_attrs` (foreign key columns) or `references` (table.column).
        const isFk =
          c.contype === 'CONSTR_FOREIGN' ||
          (Array.isArray(c.fk_attrs) && c.fk_attrs.length > 0) ||
          c.pktable?.relation?.relname;
        if (!isFk) continue;
        // Track FK columns by table
        if (!fkColumnsByTable.has(tableName)) fkColumnsByTable.set(tableName, new Set());
        fkColumnsByTable.get(tableName)!.add(colName);
      }
    }
  }
  // Compare FK vs index sets after collecting all CREATE TABLE statements
  for (const [table, fkCols] of fkColumnsByTable) {
    const idxCols = indexColumnsByTable.get(table) ?? new Set();
    for (const fk of fkCols) {
      if (!idxCols.has(fk)) {
        findings.push({
          ruleId: 'db/missing-fk-index',
          severity: 'high',
          dbFile: relPath,
          line: 1,
          column: 1,
          table,
          columnName: fk,
          message: `Foreign key column \`${table}.${fk}\` has no matching index.`,
          advice: `Add \`CREATE INDEX ON ${table} (${fk});\`. Without an index, deletes on the parent table perform a sequential scan. After adding, use \`CREATE INDEX CONCURRENTLY\` (per Squawk's require-concurrent-index-creation rule) for production.`,
        });
      }
    }
  }
  return findings;
}

/**
 * `db/duplicate-index` — same column-list declared in two `CREATE INDEX` statements.
 */
function detectDuplicateIndexes(parsed: ParsedSql, relPath: string): DbFinding[] {
  const findings: DbFinding[] = [];
  const seen = new Map<string, { indexName: string; file: string }>();
  for (const stmt of parsed.statements) {
    if (stmt.type !== 'IndexStmt') continue;
    const idx = stmt.ast;
    const idxName: string = idx.idxname ?? '?';
    // `idxParams` may contain IndexElem entries with name (column) or expression
    const cols: string[] = (idx.indexParams ?? []).map((p: any) => p.IndexElem?.name ?? '?').sort();
    const key = cols.join(',');
    if (key === '') continue;
    if (seen.has(key)) {
      const prev = seen.get(key)!;
      findings.push({
        ruleId: 'db/duplicate-index',
        severity: 'high',
        dbFile: relPath,
        line: 1,
        column: 1,
        table: idx.relation?.relname,
        message: `Index \`${idxName}\` duplicates \`${prev.indexName}\` on the same column list (${cols.join(', ')}).`,
        advice: `Drop one of the two indexes — extra indexes slow writes without benefit.`,
      });
    } else {
      seen.set(key, { indexName: idxName, file: relPath });
    }
  }
  return findings;
}

/**
 * `db/missing-not-null` — column matches a "required" name pattern (id, email,
 * created_at, etc.) and is declared without `NOT NULL`. PRIMARY KEY columns
 * count as NOT NULL (Postgres semantics).
 */
function detectMissingNotNull(parsed: ParsedSql, relPath: string): DbFinding[] {
  const findings: DbFinding[] = [];
  for (const stmt of parsed.statements) {
    if (stmt.type !== 'CreateStmt') continue;
    const cs = stmt.ast;
    const tableName = cs?.relation?.relname;
    if (!tableName || !Array.isArray(cs.tableElts)) continue;
    for (const elt of cs.tableElts) {
      const cd = elt.ColumnDef;
      if (!cd) continue;
      if (!REQUIRED_COLUMN_HEURISTIC.test(cd.colname)) continue;
      // Check if any constraint sets NOT NULL or PRIMARY KEY.
      const hasNotNull = (cd.constraints ?? []).some((c: any) => {
        const con = c.Constraint;
        return (
          con?.contype === 'CONSTR_NOTNULL' || con?.contype === 'CONSTR_PRIMARY'
        );
      });
      if (hasNotNull) continue;
      findings.push({
        ruleId: 'db/missing-not-null',
        severity: 'high',
        dbFile: relPath,
        line: 1,
        column: 1,
        table: tableName,
        columnName: cd.colname,
        message: `Required column \`${tableName}.${cd.colname}\` is missing \`NOT NULL\`.`,
        advice: `Add \`NOT NULL\` (or \`PRIMARY KEY\`). Optional identifiers are a common AI-generated SQL smell that leads to silent NULL inserts in production.`,
      });
    }
  }
  return findings;
}

/**
 * `db/enum-sprawl` — `CREATE TYPE ... AS ENUM (...)` with > 12 values.
 */
function detectEnumSprawl(parsed: ParsedSql, relPath: string): DbFinding[] {
  const findings: DbFinding[] = [];
  for (const stmt of parsed.statements) {
    if (stmt.type !== 'CreateEnumStmt') continue;
    const en = stmt.ast;
    const vals: string[] = (en.vals ?? []).map((v: any) => v.String?.sval ?? '?');
    if (vals.length > 12) {
      findings.push({
        ruleId: 'db/enum-sprawl',
        severity: 'low',
        dbFile: relPath,
        line: 1,
        column: 1,
        message: `Enum \`${en.typeName?.names?.map((n: any) => n.String?.sval).join('.')}\` has ${vals.length} values (recommended max: 12).`,
        advice: `Consider a lookup table. Enums with many values are brittle to extend and hard to localize.`,
      });
    }
  }
  return findings;
}

/**
 * `db/naming-inconsistency` — within a single file, snake_case and
 * camelCase identifiers mix.
 */
function detectNamingInconsistency(parsed: ParsedSql, relPath: string): DbFinding[] {
  const findings: DbFinding[] = [];
  let snakeCount = 0;
  let camelCount = 0;
  const identifiers = new Set<string>();
  function walk(node: any): void {
    if (!node || typeof node !== 'object') return;
    if (Array.isArray(node)) {
      for (const item of node) walk(item);
      return;
    }
    // Postgres string scalar values
    if (node.String?.sval && typeof node.String.sval === 'string') {
      const s = node.String.sval;
      if (/^[a-z_][a-z0-9_]*$/.test(s)) snakeCount++;
      else if (/^[a-z][A-Za-z0-9]*$/.test(s)) camelCount++;
    }
    // ColumnDef / relation names
    if (typeof node.colname === 'string') identifiers.add(node.colname);
    if (typeof node.relname === 'string') identifiers.add(node.relname);
    for (const k of Object.keys(node)) walk(node[k]);
  }
  walk(parsed.statements);
  // Only flag when BOTH styles appear AND both have non-trivial counts.
  if (snakeCount >= 2 && camelCount >= 2) {
    findings.push({
      ruleId: 'db/naming-inconsistency',
      severity: 'low',
      dbFile: relPath,
      line: 1,
      column: 1,
      message: `Mixed identifier styles: ${snakeCount} snake_case vs ${camelCount} camelCase.`,
      advice: `Standardize on snake_case (Postgres convention) or document the deviation.`,
    });
  }
  return findings;
}

/**
 * `db/sql-concat` — template-literal SQL queries inside TS/TSX/JS files.
 * Heuristic: any backtick-delimited string that starts with SELECT,
 * INSERT, UPDATE, DELETE, or WITH and contains a `${...}` interpolation.
 */
function detectSqlConcatInTs(source: string, relPath: string): DbFinding[] {
  const findings: DbFinding[] = [];
  // Match template literals containing SQL keywords + an interpolation.
  const re = /`((?:SELECT|INSERT\s+INTO|UPDATE|DELETE\s+FROM|WITH)\b[^`]*\$\{[^}]+\}[^`]*)`/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(source)) !== null) {
    const full = m[0] ?? '';
    const line = source.slice(0, m.index).split('\n').length;
    findings.push({
      ruleId: 'db/sql-concat',
      severity: 'high',
      dbFile: relPath,
      line,
      column: 1,
      message: `Template-literal SQL query with \`\${...}\` interpolation — string concatenation is a SQL injection vector and a common AI-generated smell.`,
      advice: `Use parameterized queries (\`db.query('SELECT ... WHERE id = $1', [id])\`) or an ORM.`,
    });
  }
  return findings;
}

// ---------------------------------------------------------------------------
// Top-level entry point
// ---------------------------------------------------------------------------

export interface BuildDbHealthOptions {
  maxFiles?: number;
}

export interface BuildDbHealthResult {
  dbHealth: number;
  dbDrift: 'low' | 'medium' | 'high' | 'critical';
  scannedSqlFiles: number;
  scannedTsFiles: number;
  findings: DbFinding[];
  byRule: Record<DbFinding['ruleId'], number>;
}

/**
 * Walk the project's SQL + TS files, run all 6 rules, and compute
 * the dbHealth score. Static-only — no live DB connection.
 */
export async function buildDbHealth(
  cwd: string,
  _config: ResolvedConfig,
  options: BuildDbHealthOptions = {},
): Promise<BuildDbHealthResult> {
  const maxFiles = options.maxFiles ?? 500;
  // Pre-load the SQL WASM module so the per-file parse calls are fast.
  await ensureSqlModule();
  // SQL files
  const sqlFiles = await globby(['**/*.sql'], {
    cwd,
    ignore: ['**/node_modules/**', '**/.next/**', '**/dist/**', '**/.git/**'],
    absolute: true,
  });
  // TS files (for SQL concat detection)
  const tsFiles = await globby(
    ['src/**/*.ts', 'src/**/*.tsx', 'lib/**/*.ts', 'app/**/*.ts'],
    {
      cwd,
      ignore: ['**/node_modules/**', '**/.next/**', '**/dist/**', '**/*.test.ts'],
      absolute: true,
    },
  );

  // Phase 1: parse all SQL files and collect FK + index columns
  const fkColumnsByTable = new Map<string, Set<string>>();
  const indexColumnsByTable = new Map<string, Set<string>>();
  interface ParsedFile {
    relPath: string;
    parsed: ParsedSql;
  }
  const parsedFiles: ParsedFile[] = [];
  for (const abs of sqlFiles.slice(0, maxFiles)) {
    const parsed = await parseSqlFile(abs);
    if (!parsed) continue;
    const relPath = relative(cwd, abs);
    parsedFiles.push({ relPath, parsed });
    // First pass: collect indexes
    for (const stmt of parsed.statements) {
      if (stmt.type !== 'IndexStmt') continue;
      const tableName = stmt.ast.relation?.relname;
      if (!tableName) continue;
      if (!indexColumnsByTable.has(tableName)) indexColumnsByTable.set(tableName, new Set());
      for (const p of stmt.ast.indexParams ?? []) {
        if (p.IndexElem?.name) indexColumnsByTable.get(tableName)!.add(p.IndexElem.name);
      }
    }
  }

  // Phase 2: run SQL rules (v0.17.0: call first-class Rule objects)
  const findings: DbFinding[] = [];
  const dbRulesById: Record<DbFinding['ruleId'], Rule> = {
    'db/missing-fk-index': missingFkIndexRule,
    'db/duplicate-index': duplicateIndexRule,
    'db/missing-not-null': missingNotNullRule,
    'db/enum-sprawl': enumSprawlRule,
    'db/naming-inconsistency': namingInconsistencyRule,
    'db/sql-concat': sqlConcatRule,
  };
  // Ensure pgsql-parser WASM is loaded before any rule analyzes a SQL file.
  await Promise.all([
    fkModuleReady,
    notNullModuleReady,
    namingModuleReady,
  ]);
  for (const { relPath, parsed } of parsedFiles) {
    const context = { config: _config, filePath: relPath, cwd };
    const facts = { filePath: relPath, v2: { _source: parsed.raw } as any };
    for (const ruleId of ['db/missing-fk-index', 'db/duplicate-index', 'db/missing-not-null', 'db/enum-sprawl', 'db/naming-inconsistency'] as const) {
      const rule = dbRulesById[ruleId];
      const ruleContext = rule.create(context);
      const issues: Issue[] = rule.analyze(ruleContext, facts);
      for (const issue of issues) {
        findings.push({
          ruleId: issue.ruleId as DbFinding['ruleId'],
          severity: issue.severity,
          dbFile: relPath,
          line: issue.line,
          column: issue.column,
          message: issue.message,
          advice: issue.advice ?? '',
          table: issue.extras?.table as string | undefined,
          columnName: issue.extras?.columnName as string | undefined,
        });
      }
    }
  }

  // Phase 3: TS files for SQL concat
  for (const abs of tsFiles.slice(0, maxFiles)) {
    let source: string;
    try {
      source = readFileSync(abs, 'utf-8');
    } catch {
      continue;
    }
    const relPath = relative(cwd, abs);
    const context = { config: _config, filePath: relPath, cwd };
    const facts = { filePath: relPath, v2: { _source: source } as any };
    const ruleContext = sqlConcatRule.create(context);
    const issues: Issue[] = sqlConcatRule.analyze(ruleContext, facts);
    for (const issue of issues) {
      findings.push({
        ruleId: 'db/sql-concat',
        severity: issue.severity,
        dbFile: relPath,
        line: issue.line,
        column: issue.column,
        message: issue.message,
        advice: issue.advice ?? '',
      });
    }
  }

  // Score
  const byRule: Record<DbFinding['ruleId'], number> = {
    'db/missing-fk-index': 0,
    'db/duplicate-index': 0,
    'db/missing-not-null': 0,
    'db/enum-sprawl': 0,
    'db/naming-inconsistency': 0,
    'db/sql-concat': 0,
  };
  let weight = 0;
  for (const f of findings) {
    byRule[f.ruleId] = (byRule[f.ruleId] ?? 0) + 1;
    weight += DB_RULE_WEIGHTS[f.ruleId];
  }
  const totalScanned = sqlFiles.length + tsFiles.length;
  // Normalize: ~5 points deducted per finding per 100 scanned files.
  const penalty = totalScanned > 0 ? (weight / totalScanned) * 5 : 0;
  const dbHealth = Math.max(0, Math.min(100, Math.round(100 - penalty)));
  let dbDrift: 'low' | 'medium' | 'high' | 'critical' = 'low';
  if (dbHealth < DB_FRESHNESS_THRESHOLDS.high) dbDrift = 'critical';
  else if (dbHealth < DB_FRESHNESS_THRESHOLDS.medium) dbDrift = 'high';
  else if (dbHealth < DB_FRESHNESS_THRESHOLDS.low) dbDrift = 'medium';

  return {
    dbHealth,
    dbDrift,
    scannedSqlFiles: sqlFiles.length,
    scannedTsFiles: tsFiles.length,
    findings,
    byRule,
  };
}
