import { describe, it, expect } from 'vitest';
import { rbSqlStringConcatRule } from '../../../src/rules/rb/sql-string-concat';
import { rbExceptionSwallowingRule } from '../../../src/rules/rb/exception-swallowing';
import { rbNPlusOneQueryRule } from '../../../src/rules/rb/n-plus-one-query';
import type { ScanFacts, RuleContext } from '../../../src/types';

const CTX: RuleContext = {} as RuleContext;

function makeFacts(source: string): ScanFacts {
  return {
    filePath: '/test.rb',
    v2: { _source: source } as any,
  } as unknown as ScanFacts;
}

describe('rb/sql-string-concat', () => {
  it('flags a SQL string with #{} interpolation', () => {
    const issues = rbSqlStringConcatRule.analyze(CTX, makeFacts(`
def find_user(id)
  User.where("SELECT * FROM users WHERE id = #{id}")
end
`.trim()));
    expect(issues.length).toBeGreaterThan(0);
  });

  it('does not flag a parameterized query', () => {
    const issues = rbSqlStringConcatRule.analyze(CTX, makeFacts(`
def find_user(id)
  User.where(id: id)
end
`.trim()));
    expect(issues.length).toBe(0);
  });
});

describe('rb/exception-swallowing', () => {
  it('flags an empty rescue block', () => {
    const issues = rbExceptionSwallowingRule.analyze(CTX, makeFacts(`
begin
  do_work
rescue
end
`.trim()));
    expect(issues.length).toBeGreaterThan(0);
  });

  it('flags rescue; nil', () => {
    const issues = rbExceptionSwallowingRule.analyze(CTX, makeFacts(`
begin
  do_work
rescue
  nil
end
`.trim()));
    expect(issues.length).toBeGreaterThan(0);
  });
});

describe('rb/n-plus-one-query', () => {
  it('flags .each calling association without eager loading', () => {
    const issues = rbNPlusOneQueryRule.analyze(CTX, makeFacts(`
parents.each do |parent|
  parent.children.each do |child|
    puts child.name
  end
end
`.trim()));
    expect(issues.length).toBeGreaterThan(0);
  });

  it('does not flag with .includes', () => {
    const issues = rbNPlusOneQueryRule.analyze(CTX, makeFacts(`
parents.includes(:children).each do |parent|
  parent.children.each do |child|
    puts child.name
  end
end
`.trim()));
    expect(issues.length).toBe(0);
  });
});
