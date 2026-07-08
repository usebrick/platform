import { describe, it, expect } from 'vitest';
import { phpSqlInjectionRule } from '../../../src/rules/php/sql-injection';
import { phpEmptyCatchRule } from '../../../src/rules/php/empty-catch';
import type { ScanFacts, RuleContext } from '../../../src/types';

const CTX: RuleContext = {} as RuleContext;

function makeFacts(source: string): ScanFacts {
  return {
    filePath: '/test.php',
    v2: { _source: source } as any,
  } as unknown as ScanFacts;
}

describe('php/sql-injection', () => {
  it('flags a SQL string with .$_GET concat', () => {
    const issues = phpSqlInjectionRule.analyze(CTX, makeFacts(`
<?php
$sql = "SELECT * FROM users WHERE id = " . $_GET['id'];
$pdo->query($sql);
`.trim()));
    expect(issues.length).toBeGreaterThan(0);
  });

  it('does not flag a PDO prepared statement', () => {
    const issues = phpSqlInjectionRule.analyze(CTX, makeFacts(`
<?php
$stmt = $pdo->prepare("SELECT * FROM users WHERE id = ?");
$stmt->execute([$_GET['id']]);
`.trim()));
    expect(issues.length).toBe(0);
  });
});

describe('php/empty-catch', () => {
  it('flags an empty catch block', () => {
    const issues = phpEmptyCatchRule.analyze(CTX, makeFacts(`
<?php
try { doStuff(); } catch (Exception $e) { }
`.trim()));
    expect(issues.length).toBeGreaterThan(0);
  });

  it('flags a bare throw', () => {
    const issues = phpEmptyCatchRule.analyze(CTX, makeFacts(`
<?php
try { doStuff(); } catch (Exception $e) { throw; }
`.trim()));
    expect(issues.length).toBeGreaterThan(0);
  });

  it('does not flag a catch with logging', () => {
    const issues = phpEmptyCatchRule.analyze(CTX, makeFacts(`
<?php
try { doStuff(); } catch (Exception $e) { error_log($e->getMessage()); }
`.trim()));
    expect(issues.length).toBe(0);
  });
});
