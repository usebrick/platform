import { describe, expect, it } from 'vitest';
import { writeFileSync, mkdtempSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { parseFile } from '../../src/engine/parser';
import { extractFacts } from '../../src/engine/visitor';
import { sqlConstructionRule } from '../../src/rules/security/sql-construction';
import type { Issue, ResolvedConfig, RuleContext } from '../../src/types';

function makeConfig(overrides?: Partial<ResolvedConfig>): ResolvedConfig {
  return {
    include: [],
    exclude: [],
    rules: {},
    frameworkMultipliers: {},
    ruleConfig: {},
    arbitraryValueAllowlist: [],
    wcag: { targetSizeExemptSelectors: [] },
    thresholds: {
      meanSlop: 0,
      p90Slop: 0,
      individualSlopThreshold: 0,
    },
    ...overrides,
  };
}

async function runRule(source: string, fileName = 'db.ts'): Promise<Issue[]> {
  const dir = mkdtempSync(join(tmpdir(), 'slopbrick-sql-construction-test-'));
  try {
    const filePath = join(dir, fileName);
    writeFileSync(filePath, source);
    const { ast, source: parsedSource } = await parseFile(filePath);
    const facts = extractFacts(filePath, ast, parsedSource);
    const context: RuleContext = { config: makeConfig(), filePath, cwd: dir };
    const ruleContext = sqlConstructionRule.create(context);
    return sqlConstructionRule.analyze(ruleContext, facts);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

describe('security/sql-construction', () => {
  it('fires on template-literal SQL with ${} interpolation', async () => {
    const issues = await runRule(
      `const q = \`SELECT * FROM users WHERE id = \${userId}\`;`,
    );
    expect(issues.length).toBeGreaterThanOrEqual(1);
    expect(issues[0]?.ruleId).toBe('security/sql-construction');
    expect(issues[0]?.severity).toBe('high');
    expect(issues[0]?.aiSpecific).toBe(true);
  });

  it('fires on string-concatenated SQL with +', async () => {
    const issues = await runRule(
      `const q = 'SELECT * FROM users WHERE id = ' + userId;`,
    );
    expect(issues.length).toBeGreaterThanOrEqual(1);
    expect(issues[0]?.ruleId).toBe('security/sql-construction');
  });

  it('fires on every DML verb boundary (INSERT/UPDATE/DELETE/REPLACE/TRUNCATE/MERGE)', async () => {
    const source = [
      `const a = \`INSERT INTO t VALUES (\${x})\`;`,
      `const b = \`UPDATE t SET col = \${x}\`;`,
      `const c = \`DELETE FROM t WHERE id = \${x}\`;`,
      `const d = \`REPLACE INTO t VALUES (\${x})\`;`,
      `const e = \`TRUNCATE t\`;`,
      `const f = \`MERGE INTO t USING s ON \${x}\`;`,
    ].join('\n');
    const issues = await runRule(source);
    // At least 5 of the 6 must fire (TRUNCATE has no interpolation, so it
    // is template-literal-only without `${}` — it does not match either
    // branch). All others include interpolation and must fire.
    expect(issues.length).toBeGreaterThanOrEqual(5);
    expect(issues.every((i) => i.ruleId === 'security/sql-construction')).toBe(true);
  });

  it('does NOT fire on parameterized queries with placeholders', async () => {
    const issues = await runRule(
      `client.query("SELECT * FROM users WHERE id = $1", [userId]);`,
    );
    expect(issues).toHaveLength(0);
  });

  it('does NOT fire on parameterized queries with ? placeholders (mysql2)', async () => {
    const issues = await runRule(
      `connection.execute("SELECT * FROM users WHERE id = ?", [userId]);`,
    );
    expect(issues).toHaveLength(0);
  });

  it('does NOT fire on Prisma ORM calls (no SQL keyword at string start)', async () => {
    const issues = await runRule(
      `const user = await prisma.user.findUnique({ where: { id: userId } });`,
    );
    expect(issues).toHaveLength(0);
  });

  it('does NOT fire on Knex query-builder chains', async () => {
    const issues = await runRule(
      `const rows = await knex('users').where('id', userId).select('*');`,
    );
    expect(issues).toHaveLength(0);
  });

  it('counts multiple SQL-construction violations in one file', async () => {
    // Mix template-literal interpolation with string-concat so the two
    // detection branches both fire. Each violation must be its own issue.
    const source = [
      `const a = \`SELECT * FROM users WHERE id = \${userId}\`;`,
      `const b = 'UPDATE accounts SET balance = ' + amount;`,
      `const c = 'DELETE FROM sessions WHERE token = ' + token;`,
    ].join('\n');
    const issues = await runRule(source);
    expect(issues).toHaveLength(3);
    expect(issues.every((i) => i.ruleId === 'security/sql-construction')).toBe(true);
  });

  it('does not flag SQL strings with no interpolation (static constants)', async () => {
    const issues = await runRule(
      `const q = 'SELECT * FROM users WHERE active = true';`,
    );
    expect(issues).toHaveLength(0);
  });

  it('does not flag non-SQL code that happens to contain "SELECT"', async () => {
    const issues = await runRule(
      `const choices = ['apples', 'pears', 'select ripe fruit'];`,
    );
    expect(issues).toHaveLength(0);
  });
});