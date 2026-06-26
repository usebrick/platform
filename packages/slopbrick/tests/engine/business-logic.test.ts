import { describe, it, expect } from 'vitest';

import {
  analyzeBusinessLogic,
  buildBusinessLogicReport,
  buildBusinessLogicReportFromIssues,
  BUSINESS_LOGIC_WEIGHTS,
  type BusinessLogicIssue,
} from '../../src/engine/business-logic';

describe('BUSINESS_LOGIC_WEIGHTS', () => {
  it('exposes the documented weights', () => {
    expect(BUSINESS_LOGIC_WEIGHTS.pricing).toBe(3);
    expect(BUSINESS_LOGIC_WEIGHTS.validation).toBe(2);
    expect(BUSINESS_LOGIC_WEIGHTS.formatting).toBe(1);
  });
});

describe('analyzeBusinessLogic — pricing rules', () => {
  it('flags Math.round(x * 100) / 100', () => {
    const issues = analyzeBusinessLogic(
      'const c = Math.round(price * 100) / 100;',
      'src/pricing.ts',
    );
    expect(issues.length).toBeGreaterThanOrEqual(1);
    const match = issues.find((i) => i.ruleId === 'business-logic/math-round-cents');
    expect(match).toBeDefined();
    expect(match?.category).toBe('pricing');
    expect(match?.filePath).toBe('src/pricing.ts');
    expect(match?.line).toBe(1);
  });

  it('flags Math.round(x * 100) (missing divide)', () => {
    const issues = analyzeBusinessLogic(
      'const c = Math.round(price * 100);',
      'src/p.ts',
    );
    const match = issues.find((i) => i.ruleId === 'business-logic/math-round-cents');
    expect(match).toBeDefined();
  });

  it('flags a magic rate literal like 0.0825', () => {
    const issues = analyzeBusinessLogic(
      'const taxed = subtotal * 0.0825;',
      'src/tax.ts',
    );
    const match = issues.find((i) => i.ruleId === 'business-logic/magic-rate-decimal');
    expect(match).toBeDefined();
    expect(match?.message).toContain('0.0825');
  });

  it('does not flag 0.5 / 0.25 / 0.1 (common rates)', () => {
    for (const literal of ['0.5', '0.25', '0.1', '0.05', '0.01']) {
      const issues = analyzeBusinessLogic(
        `const x = y * ${literal};`,
        'src/common.ts',
      );
      const match = issues.find((i) => i.ruleId === 'business-logic/magic-rate-decimal');
      expect(match).toBeUndefined();
    }
  });

  it('flags a hardcoded currency symbol adjacent to a price identifier', () => {
    const issues = analyzeBusinessLogic(
      'const label = `$' + '{price} USD`;',
      'src/labels.ts',
    );
    const symbol = issues.find((i) => i.ruleId === 'business-logic/hardcoded-currency-symbol');
    const template = issues.find((i) => i.ruleId === 'business-logic/raw-currency-in-template');
    // At least one of the two pricing rules should fire on this line.
    expect(symbol ?? template).toBeDefined();
  });
});

describe('analyzeBusinessLogic — validation rules', () => {
  it('flags z.string() with no constraint', () => {
    const issues = analyzeBusinessLogic(
      'const schema = z.object({ name: z.string() });',
      'src/form.ts',
    );
    const match = issues.find((i) => i.ruleId === 'business-logic/unconstrained-zod-string');
    expect(match).toBeDefined();
  });

  it('does NOT flag z.string().min(1)', () => {
    const issues = analyzeBusinessLogic(
      'const schema = z.object({ name: z.string().min(1) });',
      'src/form.ts',
    );
    const match = issues.find((i) => i.ruleId === 'business-logic/unconstrained-zod-string');
    expect(match).toBeUndefined();
  });

  it('does NOT flag z.string().email()', () => {
    const issues = analyzeBusinessLogic(
      'const schema = z.object({ email: z.string().email() });',
      'src/form.ts',
    );
    const match = issues.find((i) => i.ruleId === 'business-logic/unconstrained-zod-string');
    expect(match).toBeUndefined();
  });

  it('flags a file with many z.string() calls and no error messages', () => {
    const src = `
const a = z.string();
const b = z.string();
const c = z.string();
export const schema = z.object({ a, b, c });
`;
    const issues = analyzeBusinessLogic(src, 'src/forms/many.ts');
    const match = issues.find((i) => i.ruleId === 'business-logic/missing-error-message');
    expect(match).toBeDefined();
    expect(match?.message).toContain('3');
  });

  it('does NOT flag missing-error-message when required_error is present', () => {
    const src = `
const a = z.string({ required_error: 'a is required' });
const b = z.string();
const c = z.string();
`;
    const issues = analyzeBusinessLogic(src, 'src/forms/ok.ts');
    const match = issues.find((i) => i.ruleId === 'business-logic/missing-error-message');
    expect(match).toBeUndefined();
  });
});

describe('analyzeBusinessLogic — formatting rules', () => {
  it('flags a hardcoded ISO date literal', () => {
    const issues = analyzeBusinessLogic(
      "const start = new Date('2020-01-01');",
      'src/date.ts',
    );
    const match = issues.find((i) => i.ruleId === 'business-logic/hardcoded-iso-date');
    expect(match).toBeDefined();
  });

  it('does NOT flag a hardcoded ISO date in a TODO comment', () => {
    const issues = analyzeBusinessLogic(
      "// TODO: replace new Date('2020-01-01') with config",
      'src/date.ts',
    );
    const match = issues.find((i) => i.ruleId === 'business-logic/hardcoded-iso-date');
    expect(match).toBeUndefined();
  });

  it('flags .toLocaleString() with no options', () => {
    const issues = analyzeBusinessLogic(
      'const s = d.toLocaleString();',
      'src/locale.ts',
    );
    const match = issues.find((i) => i.ruleId === 'business-logic/locale-string-no-options');
    expect(match).toBeDefined();
  });

  it('does NOT flag .toLocaleString(locale, options)', () => {
    const issues = analyzeBusinessLogic(
      "const s = d.toLocaleString('en-US', { dateStyle: 'medium' });",
      'src/locale.ts',
    );
    const match = issues.find((i) => i.ruleId === 'business-logic/locale-string-no-options');
    expect(match).toBeUndefined();
  });

  it('flags raw currency in template when Intl.NumberFormat is absent', () => {
    const src = 'const s = `$' + '{total} USD`;';
    const issues = analyzeBusinessLogic(src, 'src/money.ts');
    const match = issues.find((i) => i.ruleId === 'business-logic/raw-currency-in-template');
    expect(match).toBeDefined();
  });

  it('does NOT flag raw-currency-in-template when file already uses Intl.NumberFormat', () => {
    const src = `
const fmt = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' });
const s = \`\${fmt.format(total)}\`;
`;
    const issues = analyzeBusinessLogic(src, 'src/money.ts');
    const match = issues.find((i) => i.ruleId === 'business-logic/raw-currency-in-template');
    expect(match).toBeUndefined();
  });
});

describe('analyzeBusinessLogic — clean code is silent', () => {
  it('returns no issues for a clean file', () => {
    const src = `
import { z } from 'zod';
const schema = z.object({ email: z.string().email() });
const fmt = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' });
export const formatPrice = (p: number) => fmt.format(p);
export const TAX_RATE = 0.0825;
export const total = (subtotal: number) => subtotal * TAX_RATE;
`;
    const issues = analyzeBusinessLogic(src, 'src/clean.ts');
    expect(issues).toHaveLength(0);
  });
});

describe('analyzeBusinessLogic — sort order', () => {
  it('sorts issues by (line, column)', () => {
    const src = [
      'const a = z.string();',                 // line 1, validation
      'const x = Math.round(p * 100) / 100;',  // line 2, pricing
      "const d = new Date('2020-01-01');",     // line 3, formatting
    ].join('\n');
    const issues = analyzeBusinessLogic(src, 'src/multi.ts');
    expect(issues.length).toBeGreaterThanOrEqual(3);
    for (let i = 1; i < issues.length; i++) {
      const prev = issues[i - 1]!;
      const curr = issues[i]!;
      if (prev.line === curr.line) {
        expect(prev.column).toBeLessThanOrEqual(curr.column);
      } else {
        expect(prev.line).toBeLessThan(curr.line);
      }
    }
  });
});

describe('buildBusinessLogicReportFromIssues — score formula', () => {
  it('returns 100 when there are no issues', () => {
    const report = buildBusinessLogicReportFromIssues([], 100);
    expect(report.score).toBe(100);
    expect(report.weight).toBe(0);
    expect(report.byCategory.pricing).toBe(0);
    expect(report.byCategory.validation).toBe(0);
    expect(report.byCategory.formatting).toBe(0);
    expect(report.scannedFiles).toBe(100);
  });

  it('returns 100 when scannedFiles is 0 (no files = no issues)', () => {
    const report = buildBusinessLogicReportFromIssues([], 0);
    expect(report.score).toBe(100);
    expect(report.scannedFiles).toBe(0);
  });

  it('a single pricing issue in 10 files scores 70', () => {
    const issues: BusinessLogicIssue[] = [
      mkIssue('pricing', 1, 1),
    ];
    const report = buildBusinessLogicReportFromIssues(issues, 10);
    // 100 - (3 / 10) * 100 = 70
    expect(report.score).toBe(70);
    expect(report.weight).toBe(3);
    expect(report.byCategory.pricing).toBe(1);
  });

  it('a single validation issue in 100 files scores 98', () => {
    const issues: BusinessLogicIssue[] = [
      mkIssue('validation', 1, 1),
    ];
    const report = buildBusinessLogicReportFromIssues(issues, 100);
    // 100 - (2 / 100) * 100 = 98
    expect(report.score).toBe(98);
    expect(report.weight).toBe(2);
  });

  it('a single formatting issue in 100 files scores 99', () => {
    const issues: BusinessLogicIssue[] = [
      mkIssue('formatting', 1, 1),
    ];
    const report = buildBusinessLogicReportFromIssues(issues, 100);
    // 100 - (1 / 100) * 100 = 99
    expect(report.score).toBe(99);
  });

  it('mixed categories add up correctly', () => {
    const issues: BusinessLogicIssue[] = [
      mkIssue('pricing', 1, 1),
      mkIssue('pricing', 2, 1),
      mkIssue('validation', 3, 1),
      mkIssue('formatting', 4, 1),
    ];
    const report = buildBusinessLogicReportFromIssues(issues, 10);
    // weight = 3 + 3 + 2 + 1 = 9; score = 100 - 90 = 10
    expect(report.weight).toBe(9);
    expect(report.score).toBe(10);
    expect(report.byCategory.pricing).toBe(2);
    expect(report.byCategory.validation).toBe(1);
    expect(report.byCategory.formatting).toBe(1);
  });

  it('clamps at 0 when the project is drowning in issues', () => {
    const issues: BusinessLogicIssue[] = Array.from({ length: 50 }, (_, i) =>
      mkIssue('pricing', i + 1, 1),
    );
    const report = buildBusinessLogicReportFromIssues(issues, 10);
    // weight = 150; 100 - (150/10)*100 = 100 - 1500 → 0 (clamped)
    expect(report.score).toBe(0);
  });

  it('always scores 100 when weight === scannedFiles (boundary)', () => {
    const issues: BusinessLogicIssue[] = Array.from({ length: 10 }, (_, i) =>
      mkIssue('formatting', i + 1, 1),
    );
    const report = buildBusinessLogicReportFromIssues(issues, 10);
    // weight = 10; 100 - (10/10)*100 = 0
    expect(report.score).toBe(0);
  });

  it('rounds the score to an integer', () => {
    const issues: BusinessLogicIssue[] = [
      mkIssue('pricing', 1, 1),
      mkIssue('pricing', 2, 1),
    ];
    const report = buildBusinessLogicReportFromIssues(issues, 7);
    // weight = 6; 100 - (6/7)*100 = 14.2857 → 14
    expect(report.score).toBe(14);
  });

  it('produces a headline line with the score', () => {
    const report = buildBusinessLogicReportFromIssues([], 100);
    expect(report.headline).toBe('Business Logic Coherence: 100/100');
  });
});

describe('buildBusinessLogicReport', () => {
  it('is an alias for buildBusinessLogicReportFromIssues', () => {
    const issues: BusinessLogicIssue[] = [mkIssue('pricing', 1, 1)];
    const a = buildBusinessLogicReport(issues, 10);
    const b = buildBusinessLogicReportFromIssues(issues, 10);
    expect(a.score).toBe(b.score);
    expect(a.weight).toBe(b.weight);
    expect(a.issues).toBe(b.issues);
  });
});

function mkIssue(
  category: 'pricing' | 'validation' | 'formatting',
  line: number,
  column: number,
): BusinessLogicIssue {
  return {
    category,
    filePath: `src/fake-${line}.ts`,
    line,
    column,
    ruleId: `business-logic/test-${category}`,
    message: 'test',
  };
}