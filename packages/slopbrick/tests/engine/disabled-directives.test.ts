import { describe, it, expect } from 'vitest';
import { writeFileSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { parseFile } from '../../src/engine/parser';
import { extractFacts } from '../../src/engine/visitor';
import { filterByDisabledDirectives } from '../../src/index';
import type { DisabledLintRuleFact, FileScanResult } from '../../src/types';

describe('// slopbrick-disable directive extraction', () => {
  it('extracts line-scope disable directive', async () => {
    const sourceCode = `// slopbrick-disable visual/clamp-soup
export const X = 1;`;
    const dir = mkdtempSync(join(tmpdir(), 'slop-disable-test-'));
    try {
      const fp = join(dir, 'X.ts');
      writeFileSync(fp, sourceCode);
      const { ast, source } = await parseFile(fp);
      const facts = extractFacts(fp, ast, source);
      const disabled = facts.v2.disabledRules;
      expect(disabled.length).toBeGreaterThanOrEqual(1);
      const target = disabled.find((d) => d.ruleId === 'visual/clamp-soup');
      expect(target).toBeDefined();
      expect(target!.scope).toBe('line');
      expect(target!.line).toBe(1);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('extracts next-line scope directive', async () => {
    const sourceCode = `// slopbrick-disable-next-line visual/clamp-soup
export const X = 1;`;
    const dir = mkdtempSync(join(tmpdir(), 'slop-disable-test-'));
    try {
      const fp = join(dir, 'X.ts');
      writeFileSync(fp, sourceCode);
      const { ast, source } = await parseFile(fp);
      const facts = extractFacts(fp, ast, source);
      const target = facts.v2.disabledRules.find(
        (d) => d.ruleId === 'visual/clamp-soup' && d.scope === 'next-line',
      );
      expect(target).toBeDefined();
      expect(target!.line).toBe(2);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('extracts block-scope directive', async () => {
    const sourceCode = `/* slopbrick-disable visual/clamp-soup */
export const X = 1;`;
    const dir = mkdtempSync(join(tmpdir(), 'slop-disable-test-'));
    try {
      const fp = join(dir, 'X.ts');
      writeFileSync(fp, sourceCode);
      const { ast, source } = await parseFile(fp);
      const facts = extractFacts(fp, ast, source);
      const target = facts.v2.disabledRules.find(
        (d) => d.ruleId === 'visual/clamp-soup' && d.scope === 'block',
      );
      expect(target).toBeDefined();
      expect(target!.line).toBe(1);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('parses comma-separated rule lists', async () => {
    const sourceCode = `// slopbrick-disable visual/clamp-soup, typo/calc-raw-px, wcag/target-size
export const X = 1;`;
    const dir = mkdtempSync(join(tmpdir(), 'slop-disable-test-'));
    try {
      const fp = join(dir, 'X.ts');
      writeFileSync(fp, sourceCode);
      const { ast, source } = await parseFile(fp);
      const facts = extractFacts(fp, ast, source);
      const ids = facts.v2.disabledRules.map((d) => d.ruleId);
      expect(ids).toContain('visual/clamp-soup');
      expect(ids).toContain('typo/calc-raw-px');
      expect(ids).toContain('wcag/target-size');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe('filterByDisabledDirectives', () => {
  function makeResult(issues: Array<{ ruleId: string; line: number }>): FileScanResult {
    return {
      filePath: '/x.tsx',
      componentCount: 1,
      issues: issues.map((i, idx) => ({
        ruleId: i.ruleId,
        category: 'visual' as const,
        severity: 'medium' as const,
        aiSpecific: true,
        filePath: '/x.tsx',
        message: 'm',
        line: i.line,
        column: 1,
        _id: idx,
      })),
    };
  }

  function disabledAt(line: number, ruleId: string, scope: 'line' | 'next-line' | 'block' = 'line'): DisabledLintRuleFact {
    return { ruleId, line, column: 1, scope };
  }

  it('drops issues at the disabled line', () => {
    const result = makeResult([
      { ruleId: 'visual/clamp-soup', line: 5 },
      { ruleId: 'visual/clamp-soup', line: 7 },
    ]);
    filterByDisabledDirectives(result, [disabledAt(5, 'visual/clamp-soup')]);
    expect(result.issues.length).toBe(1);
    expect(result.issues[0].line).toBe(7);
  });

  it('drops issues for next-line-scope directives', () => {
    const result = makeResult([{ ruleId: 'visual/clamp-soup', line: 4 }]);
    filterByDisabledDirectives(result, [disabledAt(4, 'visual/clamp-soup', 'next-line')]);
    expect(result.issues.length).toBe(0);
  });

  it('drops all issues at or after block-scope directive', () => {
    const result = makeResult([
      { ruleId: 'visual/clamp-soup', line: 3 },
      { ruleId: 'visual/clamp-soup', line: 10 },
    ]);
    filterByDisabledDirectives(result, [disabledAt(1, 'visual/clamp-soup', 'block')]);
    expect(result.issues.length).toBe(0);
  });

  it('leaves unrelated rule issues alone', () => {
    const result = makeResult([
      { ruleId: 'visual/clamp-soup', line: 5 },
      { ruleId: 'typo/calc-raw-px', line: 5 },
    ]);
    filterByDisabledDirectives(result, [disabledAt(5, 'visual/clamp-soup')]);
    expect(result.issues.length).toBe(1);
    expect(result.issues[0].ruleId).toBe('typo/calc-raw-px');
  });

  it('is a no-op when no directives provided', () => {
    const result = makeResult([{ ruleId: 'visual/clamp-soup', line: 5 }]);
    filterByDisabledDirectives(result, []);
    expect(result.issues.length).toBe(1);
  });
});