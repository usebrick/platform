import { describe, expect, it } from 'vitest';
import { writeFileSync, mkdtempSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { parseFile } from '@usebrick/engine';
import { extractFacts } from '../../../src/engine/visitor';
import { aiTailwindColorOveruseRule } from '../../../src/rules/ai/tailwind-color-overuse';
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
  const dir = mkdtempSync(join(tmpdir(), 'slopbrick-tailwind-color-test-'));
  try {
    const filePath = join(dir, fileName);
    writeFileSync(filePath, source);
    const { ast, source: parsedSource } = await parseFile(filePath);
    const facts = extractFacts(filePath, ast, parsedSource);
    const context: RuleContext = { config: makeConfig(), filePath, cwd: dir };
    const ruleContext = aiTailwindColorOveruseRule.create(context);
    return aiTailwindColorOveruseRule.analyze(ruleContext, facts);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

describe('ai/tailwind-color-overuse', () => {
  it('flags TSX file with ≥3 default Tailwind palette classes', async () => {
    const source = [
      'export function Card() {',
      '  return (',
      '    <div className="bg-blue-500 rounded-lg shadow-md p-4 text-lg">',
      '      Hello',
      '    </div>',
      '  );',
      '}',
    ].join('\n');
    const issues = await runRule(source);
    expect(issues.length).toBeGreaterThanOrEqual(1);
    expect(issues[0].ruleId).toBe('ai/tailwind-color-overuse');
    expect(issues[0].aiSpecific).toBe(true);
  });

  it('does not flag when only custom / non-default Tailwind classes are used', async () => {
    const source = [
      'export function Card() {',
      '  return (',
      '    <div className="bg-brand-500 text-ink rounded-card shadow-soft p-stack">',
      '      Hello',
      '    </div>',
      '  );',
      '}',
    ].join('\n');
    const issues = await runRule(source);
    expect(issues).toHaveLength(0);
  });

  it('does not flag non-frontend file extensions (e.g. .py)', async () => {
    const source = [
      'def card():',
      '    return """',
      '    <div className="bg-blue-500 rounded-lg shadow-md p-4 text-lg">',
      '      Hello',
      '    </div>',
      '    """',
    ].join('\n');
    const issues = await runRule(source, 'script.py');
    expect(issues).toHaveLength(0);
  });
});
