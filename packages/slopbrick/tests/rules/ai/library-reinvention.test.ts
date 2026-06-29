import { describe, expect, it } from 'vitest';
import { writeFileSync, mkdtempSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { parseFile } from '@usebrick/engine';
import { extractFacts } from '../../../src/engine/visitor';
import { aiLibraryReinventionRule } from '../../../src/rules/ai/library-reinvention';
import type { Issue, ResolvedConfig, RuleContext } from '../../../src/types';

function makeConfig(overrides?: Partial<ResolvedConfig>): ResolvedConfig {
  return {
    include: [],
    exclude: [],
    rules: {},
    frameworkMultipliers: {},
    ruleConfig: {},
    arbitraryValueAllowlist: [],
    wcag: { targetSizeExemptSelectors: [] },
    thresholds: { meanSlop: 0, p90Slop: 0, individualSlopThreshold: 0 },
    ...overrides,
  };
}

async function runRule(source: string, fileName = 'Component.tsx'): Promise<Issue[]> {
  const dir = mkdtempSync(join(tmpdir(), 'slopbrick-library-reinvention-test-'));
  try {
    const filePath = join(dir, fileName);
    writeFileSync(filePath, source);
    const { ast, source: parsedSource } = await parseFile(filePath);
    const facts = extractFacts(filePath, ast, parsedSource);
    const context: RuleContext = { config: makeConfig(), filePath, cwd: dir };
    const ruleContext = aiLibraryReinventionRule.create(context);
    return aiLibraryReinventionRule.analyze(ruleContext, facts);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

// Note: CANONICAL_LIBRARIES includes react-hook-form, @radix-ui, shadcn, etc.
// Negative tests must NOT include any of those imports (would short-circuit
// via hasCanonical, returning [] before pattern counting).

describe('ai/library-reinvention', () => {
  it('flags file reinventing >=2 patterns (date picker + form validation) without canonical lib', async () => {
    const source = [
      `const html = '<input type="date">';`,
      `const email: string = "";`,
      `if (!email) errors.email = "required";`,
      `if (!name)  errors.name  = "required";`,
    ].join('\n');
    const issues = await runRule(source);
    expect(issues.some(i => i.ruleId === 'ai/library-reinvention')).toBe(true);
  });

  it('does not flag file that imports a canonical library (shadcn)', async () => {
    const source = [
      `import { useForm } from 'react-hook-form';`,
      `const html = '<input type="date">';`,
      `const email: string = "";`,
      `if (!email) errors.email = "required";`,
      `if (!name)  errors.name  = "required";`,
    ].join('\n');
    const issues = await runRule(source);
    expect(issues.filter(i => i.ruleId === 'ai/library-reinvention')).toEqual([]);
  });

  it('does not flag file below MIN_PATTERNS=2 (only date picker, no canonical lib)', async () => {
    const source = [
      `const html = '<input type="date">';`,
    ].join('\n');
    const issues = await runRule(source);
    expect(issues.filter(i => i.ruleId === 'ai/library-reinvention')).toEqual([]);
  });
});
