import { describe, expect, it } from 'vitest';
import { writeFileSync, mkdtempSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { parseFile } from '@usebrick/engine';
import { extractFacts } from '../../../src/engine/visitor';
import { aiFetchDefaultOveruseRule } from '../../../src/rules/ai/fetch-default-overuse';
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
  const dir = mkdtempSync(join(tmpdir(), 'slopbrick-fetch-default-overuse-test-'));
  try {
    const filePath = join(dir, fileName);
    writeFileSync(filePath, source);
    const { ast, source: parsedSource } = await parseFile(filePath);
    const facts = extractFacts(filePath, ast, parsedSource);
    const context: RuleContext = { config: makeConfig(), filePath, cwd: dir };
    const ruleContext = aiFetchDefaultOveruseRule.create(context);
    return aiFetchDefaultOveruseRule.analyze(ruleContext, facts);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

describe('ai/fetch-default-overuse', () => {
  it('flags >=3 raw fetch() calls without TanStack Query/SWR/axios/ky', async () => {
    const source = [
      `const a = fetch("/api/users").then(r => r.json());`,
      `const b = fetch("/api/posts").then(r => r.json());`,
      `const c = fetch("/api/tags").then(r => r.json());`,
      `const d = fetch("/api/comments").then(r => r.json());`,
    ].join('\n');
    const issues = await runRule(source);
    expect(issues.some(i => i.ruleId === 'ai/fetch-default-overuse')).toBe(true);
  });

  it('does not flag file that imports a canonical fetch lib (axios)', async () => {
    const source = [
      `import axios from 'axios';`,
      `const a = fetch("/api/users");`,
      `const b = fetch("/api/posts");`,
      `const c = fetch("/api/tags");`,
    ].join('\n');
    const issues = await runRule(source);
    expect(issues.filter(i => i.ruleId === 'ai/fetch-default-overuse')).toEqual([]);
  });

  it('does not flag file below MIN_FETCH_CALLS=3 (only 2 fetch() calls)', async () => {
    const source = [
      `const a = fetch("/api/users").then(r => r.json());`,
      `const b = fetch("/api/posts").then(r => r.json());`,
    ].join('\n');
    const issues = await runRule(source);
    expect(issues.filter(i => i.ruleId === 'ai/fetch-default-overuse')).toEqual([]);
  });
});
