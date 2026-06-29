import { describe, expect, it } from 'vitest';
import { writeFileSync, mkdtempSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { parseFile } from '@usebrick/engine';
import { extractFacts } from '../../../src/engine/visitor';
import { sqlConcatRule } from '../../../src/rules/db/sql-concat';
import type { Issue, RuleContext } from '../../../src/types';

async function runRule(source: string, fileName = 'Component.tsx'): Promise<Issue[]> {
  const dir = mkdtempSync(join(tmpdir(), 'slopbrick-sql-concat-'));
  try {
    const filePath = join(dir, fileName);
    writeFileSync(filePath, source);
    const { ast, source: parsedSource } = await parseFile(filePath);
    const facts = extractFacts(filePath, ast, parsedSource);
    const context: RuleContext = {
      config: {} as never,
      filePath,
      cwd: dir,
    };
    const ruleContext = sqlConcatRule.create(context);
    return sqlConcatRule.analyze(ruleContext, facts);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

describe('db/sql-concat', () => {
  it('flags SELECT template literal with interpolation', async () => {
    const issues = await runRule(
      'const q = `SELECT * FROM users WHERE id = ${userId}`;',
    );
    expect(issues.length).toBeGreaterThanOrEqual(1);
    expect(issues[0].ruleId).toBe('db/sql-concat');
  });

  it('flags INSERT INTO template literal with interpolation', async () => {
    const issues = await runRule(
      'const q = `INSERT INTO users (name) VALUES (${name})`;',
    );
    expect(issues.length).toBeGreaterThanOrEqual(1);
  });

  it('does not flag parameterized queries', async () => {
    const issues = await runRule(
      'const q = `SELECT * FROM users WHERE id = $1`;',
    );
    expect(issues).toHaveLength(0);
  });

  it('does not flag non-SQL template literals', async () => {
    const issues = await runRule(
      'const greeting = `Hello, ${name}!`;',
    );
    expect(issues).toHaveLength(0);
  });

  it('returns no findings on empty source', async () => {
    expect(await runRule('')).toHaveLength(0);
  });
});
