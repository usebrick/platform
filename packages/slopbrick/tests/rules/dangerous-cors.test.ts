import { describe, expect, it } from 'vitest';
import { writeFileSync, mkdtempSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { parseFile } from '../../src/engine/parser';
import { extractFacts } from '../../src/engine/visitor';
import { dangerousCorsRule } from '../../src/rules/security/dangerous-cors';
import type { Issue, ResolvedConfig, RuleContext } from '../../src/types';

function makeConfig(overrides?: Partial<ResolvedConfig>): ResolvedConfig {
  return {
    include: [],
    exclude: [],
    rules: {},
    frameworkMultipliers: {},
    ruleConfig: {},
    arbitraryValueAllowlist: [],
    wcag: { targetSizeExemptSelectors: [] },
    thresholds: {
      meanSlop: 0,
      p90Slop: 0,
      individualSlopThreshold: 0,
    },
    ...overrides,
  };
}

async function runRule(source: string, fileName = 'server.ts'): Promise<Issue[]> {
  const dir = mkdtempSync(join(tmpdir(), 'slopbrick-dangerous-cors-test-'));
  try {
    const filePath = join(dir, fileName);
    writeFileSync(filePath, source);
    const { ast, source: parsedSource } = await parseFile(filePath);
    const facts = extractFacts(filePath, ast, parsedSource);
    const context: RuleContext = { config: makeConfig(), filePath, cwd: dir };
    const ruleContext = dangerousCorsRule.create(context);
    return dangerousCorsRule.analyze(ruleContext, facts);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

describe('security/dangerous-cors', () => {
  it('flags Access-Control-Allow-Origin: *', async () => {
    const issues = await runRule(
      `res.setHeader('Access-Control-Allow-Origin', '*');`,
    );
    expect(issues.length).toBeGreaterThanOrEqual(1);
    expect(issues[0].ruleId).toBe('security/dangerous-cors');
  });

  it("flags cors({ origin: '*' })", async () => {
    const issues = await runRule(
      `app.use(cors({ origin: '*' }));`,
    );
    expect(issues.length).toBeGreaterThanOrEqual(1);
  });

  it('flags cors({ origin: true }) (reflective wildcard)', async () => {
    const issues = await runRule(
      `app.use(cors({ origin: true }));`,
    );
    expect(issues.length).toBeGreaterThanOrEqual(1);
  });

  it('flags dynamic origin from variable', async () => {
    const issues = await runRule(
      `app.use(cors({ origin: someUnrestrictedVar }));`,
    );
    expect(issues.length).toBeGreaterThanOrEqual(1);
  });

  it('does not flag cors({ origin: "https://example.com" })', async () => {
    const issues = await runRule(
      `app.use(cors({ origin: "https://example.com" }));`,
    );
    expect(issues).toHaveLength(0);
  });

  it('does not flag cors({ origin: allowedOrigins }) (whitelisted name)', async () => {
    const issues = await runRule(
      `app.use(cors({ origin: allowedOrigins }));`,
    );
    expect(issues).toHaveLength(0);
  });

  it('does not flag non-CORS code', async () => {
    const issues = await runRule(
      `const x = 1; console.log(x);`,
    );
    expect(issues).toHaveLength(0);
  });
});
