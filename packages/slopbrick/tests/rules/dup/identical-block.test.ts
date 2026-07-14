import { describe, expect, it } from 'vitest';
import {
  collectIdenticalBlockIssues,
  dupIdenticalBlockRule,
  IDENTICAL_BLOCK_MAX_ISSUES_PER_FILE,
} from '../../../src/rules/dup/identical-block';
import type { ScanFacts, RuleContext } from '../../../src/types';

function makeFacts(filePath: string, source: string): ScanFacts {
  return {
    filePath,
    v2: { _source: source },
  } as unknown as ScanFacts;
}

const BLOCK_LINES = [
  'export function calculateTotal(items: Array<{ price: number; quantity: number }>) {',
  '  let total = 0;',
  '  for (const item of items) {',
  '    if (item.price > 0 && item.quantity > 0) {',
  '      total += item.price * item.quantity;',
  '    }',
  '  }',
  '  return total;',
  '}',
  'export function applyDiscount(total: number, rate: number) {',
  '  if (rate <= 0 || rate >= 1) {',
  '    return total;',
  '  }',
  '  const discounted = total * (1 - rate);',
  '  return Math.round(discounted * 100) / 100;',
  '}',
  'export function formatCurrency(amount: number) {',
  '  return `$${amount.toFixed(2)}`;',
  '}',
  'export const result = formatCurrency(calculateTotal([]));',
];
const BLOCK = BLOCK_LINES.join('\n');

const CTX: RuleContext = {} as RuleContext;

describe('dup/identical-block', () => {
  it('is stateless for direct single-file rule calls', () => {
    const first = dupIdenticalBlockRule.analyze(CTX, makeFacts('/a.ts', BLOCK));
    const second = dupIdenticalBlockRule.analyze(CTX, makeFacts('/b.ts', BLOCK));
    expect(first).toEqual([]);
    expect(second).toEqual([]);
  });

  it('emits symmetric findings with deterministic ordering regardless of input order', () => {
    const forward = collectIdenticalBlockIssues([
      { filePath: '/z.ts', source: BLOCK },
      { filePath: '/a.ts', source: BLOCK },
    ]);
    const reverse = collectIdenticalBlockIssues([
      { filePath: '/a.ts', source: BLOCK },
      { filePath: '/z.ts', source: BLOCK },
    ]);

    expect([...forward.entries()]).toEqual([...reverse.entries()]);
    expect(forward.candidateWindows).toBe(2);
    expect(forward.truncated).toBe(false);
    expect(forward.skippedInputs).toBe(0);
    expect(forward.get('/a.ts')).toHaveLength(1);
    expect(forward.get('/z.ts')).toHaveLength(1);
    expect(forward.get('/a.ts')![0]).toMatchObject({
      filePath: '/a.ts',
      line: 1,
      ruleId: 'dup/identical-block',
      aiSpecific: false,
      extras: { evidence: 'exact-normalized-code-sequence' },
    });
    expect(forward.get('/a.ts')![0]!.message).toContain('/z.ts:1');
  });

  it('normalizes comments and whitespace without treating string delimiters as comments', () => {
    const decoratedA = [
      '// file-level comment',
      'export function calculateTotal(items: Array<{ price: number; quantity: number }>) {',
      '  let total = 0; /* inline block */',
      '  for (const item of items) {',
      '    if (item.price > 0 && item.quantity > 0) {',
      '      total += item.price * item.quantity;',
      '    }',
      '  }',
      '  return total;',
      '}',
      'export function applyDiscount(total: number, rate: number) {',
      '  if (rate <= 0 || rate >= 1) { // same code',
      '    return total;',
      '  }',
      '  const discounted = total * (1 - rate);',
      '  return Math.round(discounted * 100) / 100;',
      '}',
      'export function formatCurrency(amount: number) {',
      '  return `$${amount.toFixed(2)} // literal /* marker */`;',
      '}',
      'export const result = formatCurrency(calculateTotal([]));',
      '/* multiline comment',
      ' * this line must not count as code',
      ' */',
    ].join('\n');
    const decoratedB = [
      'export function calculateTotal(items: Array<{ price: number; quantity: number }>) {',
      ' let total = 0;',
      ' for (const item of items) {',
      ' if (item.price > 0 && item.quantity > 0) {',
      ' total += item.price * item.quantity;',
      ' }',
      ' }',
      ' return total;',
      '}',
      'export function applyDiscount(total: number, rate: number) {',
      ' if (rate <= 0 || rate >= 1) {',
      ' return total;',
      ' }',
      ' const discounted = total * (1 - rate);',
      ' return Math.round(discounted * 100) / 100;',
      '}',
      'export function formatCurrency(amount: number) {',
      ' return `$${amount.toFixed(2)} // literal /* marker */`;',
      '}',
      'export const result = formatCurrency(calculateTotal([]));',
    ].join('\n');

    const issues = collectIdenticalBlockIssues([
      { filePath: '/decorated-a.ts', source: decoratedA },
      { filePath: '/decorated-b.ts', source: decoratedB },
    ]);
    expect(issues.get('/decorated-a.ts')).toHaveLength(1);
    expect(issues.get('/decorated-b.ts')).toHaveLength(1);
  });

  it('abstains for unsupported dialects instead of applying a fragile regex lexer', () => {
    const python = Array.from({ length: 20 }, (_, index) => `value_${index} = "/* not a comment */"`).join('\n');
    const issues = collectIdenticalBlockIssues([
      { filePath: '/a.py', source: python },
      { filePath: '/b.py', source: python },
    ]);
    expect(issues.size).toBe(0);
  });

  it('explicitly abstains for extensionless function-only sources without a dialect signal', () => {
    const source = [
      'function shared(value) {',
      ...Array.from({ length: 18 }, (_, index) => `  value += ${index};`),
      '  return value;',
      '}',
    ].join('\n');
    const issues = collectIdenticalBlockIssues([
      { filePath: '/function-only-a', source },
      { filePath: '/function-only-b', source },
    ]);
    expect(issues.size).toBe(0);
  });

  it('isolates malformed parser input and reports the skipped input', () => {
    const issues = collectIdenticalBlockIssues([
      { filePath: '/broken.ts', source: 'export const = ;\n' },
      { filePath: '/good.ts', source: BLOCK },
    ]);
    expect(issues.size).toBe(0);
    expect(issues.skippedInputs).toBe(1);
    expect(issues.candidateWindows).toBe(1);
    expect(issues.truncated).toBe(false);
  });

  it('preserves protected literal, regex, template, and JSX whitespace', () => {
    const suffix = Array.from({ length: 12 }, (_, index) => `void marker${index};`);
    const sourceA = [
      'const literal = "alpha  beta";',
      'const regex = /alpha  beta/;',
      'const template = `alpha  beta`;',
      'const view = (',
      '  <div>',
      '    alpha  beta',
      '  </div>',
      ');',
      ...suffix,
    ].join('\n');
    const sourceB = sourceA.replaceAll('alpha  beta', 'alpha beta');
    const issues = collectIdenticalBlockIssues([
      { filePath: '/whitespace-a.tsx', source: sourceA },
      { filePath: '/whitespace-b.tsx', source: sourceB },
    ]);
    expect(issues.size).toBe(0);
  });

  it('verifies canonical content after a deliberately colliding hash bucket', () => {
    const changed = BLOCK_LINES.map((line, index) => index === 10 ? line.replace('rate <= 0', 'rate < 0') : line).join('\n');
    const issues = collectIdenticalBlockIssues(
      [
        { filePath: '/a.ts', source: BLOCK },
        { filePath: '/b.ts', source: changed },
      ],
      { hash: () => 'forced-collision' },
    );
    expect(issues.size).toBe(0);
  });

  it('merges overlapping windows into one bounded clone region per file', () => {
    const longBlock = Array.from({ length: 80 }, (_, index) => `export const value${index} = ${index};`).join('\n');
    const issues = collectIdenticalBlockIssues([
      { filePath: '/a.ts', source: longBlock },
      { filePath: '/b.ts', source: longBlock },
    ]);
    expect(issues.get('/a.ts')).toHaveLength(1);
    expect(issues.get('/b.ts')).toHaveLength(1);
    expect(issues.get('/a.ts')![0]!.extras?.region).toMatchObject({ startLine: 1, endLine: 80, lineCount: 80 });
  });

  it('keeps two separated verified clone runs as two paired regions', () => {
    const run = Array.from({ length: 20 }, (_, index) => `shared(${index});`).join('\n');
    const sourceA = `${run}\nvoid gapA;\n${run}`;
    const sourceB = `${run}\nvoid gapB;\n${run}`;
    const issues = collectIdenticalBlockIssues([
      { filePath: '/a.ts', source: sourceA },
      { filePath: '/b.ts', source: sourceB },
    ]);
    expect(issues.get('/a.ts')).toHaveLength(2);
    expect(issues.get('/b.ts')).toHaveLength(2);
    expect(issues.get('/a.ts')!.map((issue) => issue.line)).toEqual([1, 22]);
  });

  it('bounds extras for a highly repetitive project and is isolated between runs', () => {
    const repeated = Array.from({ length: 100 }, () => 'void value;').join('\n');
    const inputs = [
      { filePath: '/a.ts', source: repeated },
      { filePath: '/b.ts', source: repeated },
    ];
    const first = collectIdenticalBlockIssues(inputs);
    const second = collectIdenticalBlockIssues(inputs);
    expect(first).toEqual(second);
    expect(first.get('/a.ts')!.length).toBeLessThanOrEqual(IDENTICAL_BLOCK_MAX_ISSUES_PER_FILE);
    expect(first.get('/b.ts')!.length).toBeLessThanOrEqual(IDENTICAL_BLOCK_MAX_ISSUES_PER_FILE);
  });

  it('has maintainability-oriented metadata and no AI-authorship claim', () => {
    expect(dupIdenticalBlockRule.id).toBe('dup/identical-block');
    expect(dupIdenticalBlockRule.category).toBe('logic');
    expect(dupIdenticalBlockRule.severity).toBe('medium');
    expect(dupIdenticalBlockRule.aiSpecific).toBe(false);
    expect(dupIdenticalBlockRule.defaultOff).toBe(true);
    expect(dupIdenticalBlockRule.description).toMatch(/repeated normalized code/i);
  });
});
