
// v0.42.0: tests for the JSDoc-aware filtering in docs/stale-function-reference.
// Block-comment inline code spans should not be flagged as stale
// function references — the rule's call-context heuristic misfires
// when JSDoc examples include `foo()` literals.
import { describe, it, expect } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { staleFunctionReferenceRule } from '../../src/rules/docs/stale-function-reference';
import type { RuleContext, ScanFacts } from '../../src/types';

function makeCtx(cwd: string, filePath: string): RuleContext {
  return { cwd, filePath, config: {} as RuleContext['config'], framework: '', uiLibraries: [], hasTailwind: false, supportsRsc: false, hotspotIssues: [] };
}

function makeFacts(source: string): ScanFacts {
  return { v2: { _source: source } } as unknown as ScanFacts;
}

describe('docs/stale-function-reference — v0.42.0 inBlockComment filtering', () => {
  it('does not fire for `Foo()` inside a JSDoc block', () => {
    const tmp = mkdtempSync(join(tmpdir(), 'sfr-test-'));
    try {
      const filePath = join(tmp, 'doc.ts');
      writeFileSync(filePath, `
/**
 * Converts any \`CommanderError\` (thrown by the helpers).
 */
const x = 1;
      `);
      const issues = staleFunctionReferenceRule.analyze(
        makeCtx(tmp, filePath),
        makeFacts('CommanderError() — example'),
      );
      // This call uses a synthetic source — the actual scope of the test
      // is that extractInlineCodeSpans now annotates inBlockComment and
      // the rule's first check skips on the flag.
      expect(issues).toEqual([]);
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  });

  it('extractInlineCodeSpans annotates inBlockComment correctly', async () => {
    const { extractInlineCodeSpans } = await import('../../src/engine/doc-freshness');
    const src = `
/**
 * The \`runDriftOverTime\` (in cli/drift.ts).
 */
const real = \`real text\`;
`;
    const spans = extractInlineCodeSpans(src);
    expect(spans.length).toBe(2);
    expect(spans[0]!.inBlockComment).toBe(true);
    expect(spans[1]!.inBlockComment).toBe(false);
  });
});
