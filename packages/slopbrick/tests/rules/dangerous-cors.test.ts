import { describe, expect, it } from 'vitest';
import { writeFileSync, mkdtempSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { parseFile } from '@usebrick/engine';
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
  it('flags a response wildcard header set by res.setHeader', async () => {
    const issues = await runRule(
      `res.setHeader('Access-Control-Allow-Origin', '*');`,
    );
    expect(issues).toHaveLength(1);
    expect(issues[0]).toMatchObject({
      ruleId: 'security/dangerous-cors',
      line: 1,
    });
  });

  it('flags a multiline res.setHeader call at its call site', async () => {
    const issues = await runRule(`
      function handler(res) {
        res.setHeader(
          'Access-Control-Allow-Origin',
          '*',
        );
      }
    `);
    expect(issues).toHaveLength(1);
    expect(issues[0]?.line).toBe(3);
    expect(issues[0]?.column).toBe(9);
  });

  it('does not trust a naming-only header binding', async () => {
    const issues = await runRule(
      `const headers = { 'Access-Control-Allow-Origin': '*' };`,
    );
    expect(issues).toHaveLength(0);
  });

  it('matches header names case-insensitively', async () => {
    const issues = await runRule(
      `new Headers({ 'access-control-allow-origin': '*' });`,
    );
    expect(issues).toHaveLength(1);
  });

  it('flags a wildcard passed to new Headers', async () => {
    const issues = await runRule(
      `const headers = new Headers({ 'Access-Control-Allow-Origin': '*' });`,
    );
    expect(issues).toHaveLength(1);
  });

  it('flags header options on fetch, Request, and Response APIs', async () => {
    const issues = await runRule(`
      fetch('/api', { headers: { 'Access-Control-Allow-Origin': '*' } });
      new Request('/api', { headers: { 'Access-Control-Allow-Origin': '*' } });
      new Response('ok', { headers: { 'Access-Control-Allow-Origin': '*' } });
    `);
    expect(issues).toHaveLength(3);
  });

  it('emits one finding per configuration without duplicate traversal', async () => {
    const issues = await runRule(`
      new Headers({ 'Access-Control-Allow-Origin': '*' });
      new Response('ok', { headers: { 'Access-Control-Allow-Origin': '*' } });
    `);
    expect(issues).toHaveLength(2);
    expect(new Set(issues.map((issue) => `${issue.line}:${issue.column}`)).size).toBe(2);
  });

  it("flags cors({ origin: '*' })", async () => {
    const issues = await runRule(
      `app.use(cors({ origin: '*' }));`,
    );
    expect(issues).toHaveLength(1);
  });

  it('flags cors({ origin: true }) (reflective wildcard)', async () => {
    const issues = await runRule(
      `app.use(cors({ origin: true }));`,
    );
    expect(issues).toHaveLength(1);
    expect(issues[0]?.message).toContain('Reflective');
    expect(issues[0]?.message).not.toContain('CSRF');
  });

  it('abstains from dynamic, false, and null origins', async () => {
    const issues = await runRule(
      `
        app.use(cors({ origin: someUnrestrictedVar }));
        app.use(cors({ origin: false }));
        app.use(cors({ origin: null }));
      `,
    );
    expect(issues).toHaveLength(0);
  });

  it('does not flag cors({ origin: "https://example.com" })', async () => {
    const issues = await runRule(
      `app.use(cors({ origin: "https://example.com" }));`,
    );
    expect(issues).toHaveLength(0);
  });

  it('does not flag source text in strings, comments, templates, JSX, or regexes', async () => {
    const issues = await runRule(`
      // res.setHeader('Access-Control-Allow-Origin', '*');
      const text = "cors({ origin: '*' })";
      const template = \`res.setHeader('Access-Control-Allow-Origin', '*')\`;
      const pattern = /res\\.setHeader\\('Access-Control-Allow-Origin', '\\*'\\)/;
      const view = <div title="cors({ origin: '*' })">Access-Control-Allow-Origin: *</div>;
    `, 'server.tsx');
    expect(issues).toHaveLength(0);
  });

  it('does not flag non-cors calls or response-like objects', async () => {
    const issues = await runRule(
      `
        app.use(notCors({ origin: '*' }));
        response.setHeader('Access-Control-Allow-Origin', '*');
        res.setHeader('X-Example', '*');
        const docs = { 'Access-Control-Allow-Origin': '*' };
      `,
    );
    expect(issues).toHaveLength(0);
  });

  it('does not treat documentation headers as executable CORS options', async () => {
    const issues = await runRule(
      `const docs = { headers: { 'Access-Control-Allow-Origin': '*' } };`,
    );
    expect(issues).toHaveLength(0);
  });

  it('does not scan Astro display metadata as source code', async () => {
    const issues = await runRule(`
      ---
      const rules = [{
        id: 'security/dangerous-cors',
        shape: 'cors({ origin: true }) or origin: "*" with credentials',
      }];
      ---
      <p>{rules[0].shape}</p>
    `, 'RulesShowcase.astro');
    expect(issues).toHaveLength(0);
  });

  it('does not flag non-CORS code', async () => {
    const issues = await runRule(
      `const x = 1; console.log(x);`,
    );
    expect(issues).toHaveLength(0);
  });
});
