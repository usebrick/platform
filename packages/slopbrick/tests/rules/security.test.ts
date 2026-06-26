import { describe, it, expect } from 'vitest';
import { writeFileSync, mkdtempSync, rmSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';

import { parseFile } from '../../src/engine/parser';
import { extractFacts } from '../../src/engine/visitor';
import { hardcodedSecretRule } from '../../src/rules/security/hardcoded-secret';
import { unsafeHtmlRenderRule } from '../../src/rules/security/unsafe-html-render';
import { failOpenAuthRule } from '../../src/rules/security/fail-open-auth';
import { exposedEnvVarRule } from '../../src/rules/security/exposed-env-var';
import { dangerousCorsRule } from '../../src/rules/security/dangerous-cors';
import { missingAuthCheckRule } from '../../src/rules/security/missing-auth-check';
import { sqlConstructionRule } from '../../src/rules/security/sql-construction';
import { publicAdminRouteRule } from '../../src/rules/security/public-admin-route';
import { computeAiSecurityRisk } from '../../src/engine/ai-security-risk';
import type { Issue, ResolvedConfig, RuleContext } from '../../src/types';

function makeConfig(): ResolvedConfig {
  return {
    include: [],
    exclude: [],
    rules: {},
    frameworkMultipliers: {},
    ruleConfig: {},
    arbitraryValueAllowlist: [],
    wcag: { targetSizeExemptSelectors: [] },
    thresholds: { meanSlop: 0, p90Slop: 0, individualSlopThreshold: 0 },
    spacingScale: [],
    radiusScale: [],
  };
}

async function runRule(
  source: string,
  // Accept any Rule<T> — the Context generic differs per rule.
  rule: { create: (ctx: RuleContext) => any; analyze: (ctx: any, facts: any) => Issue[] },
  config: ResolvedConfig,
  fileName = 'Component.tsx',
): Promise<Issue[]> {
  const dir = mkdtempSync(join(tmpdir(), 'slopbrick-security-test-'));
  try {
    const filePath = join(dir, fileName);
    mkdirSync(dirname(filePath), { recursive: true });
    writeFileSync(filePath, source);
    const { ast, source: parsedSource } = await parseFile(filePath);
    const facts = extractFacts(filePath, ast, parsedSource);
    const context: RuleContext = { config, filePath, cwd: dir };
    const ruleContext = rule.create(context);
    return rule.analyze(ruleContext, facts);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

// ---------------------------------------------------------------------------
// hardcoded-secret
// ---------------------------------------------------------------------------

describe('security/hardcoded-secret', () => {
  it('detects OpenAI-style API key (provider pattern)', async () => {
    const issues = await runRule(
      `const genericKey = "sk-proj-abcdef0123456789abcdef0123456789";\n`,
      hardcodedSecretRule,
      makeConfig(),
    );
    expect(issues).toHaveLength(1);
    expect(issues[0].ruleId).toBe('security/hardcoded-secret');
    expect(issues[0].message).toContain('OpenAI');
  });

  it('detects OpenAI key in apiKey identifier (both patterns fire)', async () => {
    // When the identifier is also sensitive-named, both detection
    // paths fire — that's intentional, the issue surfaces once
    // per detection path so developers see all the signals.
    const issues = await runRule(
      `const apiKey = "sk-proj-abcdef0123456789abcdef0123456789";\n`,
      hardcodedSecretRule,
      makeConfig(),
    );
    expect(issues.length).toBeGreaterThanOrEqual(1);
    expect(issues.some((i) => i.message.includes('OpenAI'))).toBe(true);
  });

  it('detects AWS access key ID', async () => {
    const issues = await runRule(
      `const key = "AKIAIOSFODNN7EXAMPLE";\n`,
      hardcodedSecretRule,
      makeConfig(),
    );
    expect(issues.length).toBeGreaterThanOrEqual(1);
    expect(issues.some((i) => i.message.includes('AWS'))).toBe(true);
  });

  it('detects GitHub tokens', async () => {
    const issues = await runRule(
      `process.env.GITHUB_TOKEN = "ghp_abcdefghijklmnopqrstuvwxyz0123456789";\n`,
      hardcodedSecretRule,
      makeConfig(),
    );
    expect(issues.length).toBeGreaterThanOrEqual(1);
    expect(issues.some((i) => i.message.includes('GitHub'))).toBe(true);
  });

  it('detects sensitive-name literals (password, secret, jwt)', async () => {
    const issues = await runRule(
      `const jwtSecret = "my-super-secret-jwt-signing-key-12345";\n`,
      hardcodedSecretRule,
      makeConfig(),
    );
    expect(issues.length).toBeGreaterThanOrEqual(1);
    expect(issues.some((i) => i.message.includes('jwtSecret'))).toBe(true);
  });

  it('does NOT flag short or placeholder values', async () => {
    const issues = await runRule(
      `const password = "changeme";\nconst apiKey = "test";\n`,
      hardcodedSecretRule,
      makeConfig(),
    );
    expect(issues).toHaveLength(0);
  });

  it('does NOT flag sensitive-name with non-sensitive value', async () => {
    const issues = await runRule(
      `const password = "short";\n`,
      hardcodedSecretRule,
      makeConfig(),
    );
    expect(issues).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// unsafe-html-render
// ---------------------------------------------------------------------------

describe('security/unsafe-html-render', () => {
  it('flags dangerouslySetInnerHTML with a variable', async () => {
    const src = `<div dangerouslySetInnerHTML={{ __html: userBio }} />;`;
    const issues = await runRule(src, unsafeHtmlRenderRule, makeConfig());
    expect(issues).toHaveLength(1);
    expect(issues[0].ruleId).toBe('security/unsafe-html-render');
  });

  it('flags dangerouslySetInnerHTML with a template literal', async () => {
    const src = '<div dangerouslySetInnerHTML={{ __html: `<p>${name}</p>` }} />;';
    const issues = await runRule(src, unsafeHtmlRenderRule, makeConfig());
    expect(issues).toHaveLength(1);
  });

  it('does NOT flag dangerouslySetInnerHTML with a static string literal', async () => {
    const src = `<div dangerouslySetInnerHTML={{ __html: "<p>Hello</p>" }} />;`;
    const issues = await runRule(src, unsafeHtmlRenderRule, makeConfig());
    expect(issues).toHaveLength(0);
  });

  it('does NOT flag if the prop is not used', async () => {
    const src = `<div>{userBio}</div>;`;
    const issues = await runRule(src, unsafeHtmlRenderRule, makeConfig());
    expect(issues).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// fail-open-auth
// ---------------------------------------------------------------------------

describe('security/fail-open-auth', () => {
  // Helper: wrap the source in a function so `return` is syntactically
  // valid (the rule scans raw source — the parser doesn't care if
  // the snippet is standalone, but the parser requires valid JS).
  const wrap = (body: string) =>
    `function checkAuth(req, res, next) {\n  ${body}\n  return false;\n}`;

  it('flags NODE_ENV=development auth bypass', async () => {
    const src = wrap(`if (process.env.NODE_ENV === "development") return true;`);
    const issues = await runRule(src, failOpenAuthRule, makeConfig());
    expect(issues).toHaveLength(1);
    expect(issues[0].ruleId).toBe('security/fail-open-auth');
  });

  it('flags NODE_ENV !== production bypass', async () => {
    const src = wrap(`if (process.env.NODE_ENV !== "production") return true;`);
    const issues = await runRule(src, failOpenAuthRule, makeConfig());
    expect(issues).toHaveLength(1);
  });

  it('flags DEV env var bypass', async () => {
    const src = wrap(`if (process.env.DEV) return true;`);
    const issues = await runRule(src, failOpenAuthRule, makeConfig());
    expect(issues).toHaveLength(1);
  });

  it('flags next() bypass shapes', async () => {
    const src = wrap(`if (process.env.NODE_ENV === "development") return next();`);
    const issues = await runRule(src, failOpenAuthRule, makeConfig());
    expect(issues).toHaveLength(1);
  });

  it('does NOT flag legitimate environment-conditional logic that does not return true/next', async () => {
    const src = wrap(`if (process.env.NODE_ENV === "production") logger.info("live");`);
    const issues = await runRule(src, failOpenAuthRule, makeConfig());
    expect(issues).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// exposed-env-var
// ---------------------------------------------------------------------------

describe('security/exposed-env-var', () => {
  it('flags NEXT_PUBLIC_OPENAI_API_KEY reference', async () => {
    const src = `const key = process.env.NEXT_PUBLIC_OPENAI_API_KEY;`;
    const issues = await runRule(src, exposedEnvVarRule, makeConfig());
    expect(issues).toHaveLength(1);
    expect(issues[0].ruleId).toBe('security/exposed-env-var');
    expect(issues[0].message).toContain('NEXT_PUBLIC_OPENAI_API_KEY');
  });

  it('flags VITE_ secret-name reference', async () => {
    const src = `const token = process.env.VITE_STRIPE_TOKEN;`;
    const issues = await runRule(src, exposedEnvVarRule, makeConfig());
    expect(issues).toHaveLength(1);
  });

  it('flags EXPO_PUBLIC_ reference', async () => {
    const src = `const jwt = process.env.EXPO_PUBLIC_JWT_SECRET;`;
    const issues = await runRule(src, exposedEnvVarRule, makeConfig());
    expect(issues).toHaveLength(1);
  });

  it('does NOT flag NEXT_PUBLIC_API_URL (not secret-looking)', async () => {
    const src = `const url = process.env.NEXT_PUBLIC_API_URL;`;
    const issues = await runRule(src, exposedEnvVarRule, makeConfig());
    expect(issues).toHaveLength(0);
  });

  it('does NOT flag server-only OPENAI_API_KEY (no public prefix)', async () => {
    const src = `const key = process.env.OPENAI_API_KEY;`;
    const issues = await runRule(src, exposedEnvVarRule, makeConfig());
    expect(issues).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// dangerous-cors
// ---------------------------------------------------------------------------

describe('security/dangerous-cors', () => {
  it('flags Access-Control-Allow-Origin: *', async () => {
    const src = `res.setHeader('Access-Control-Allow-Origin', '*');`;
    const issues = await runRule(src, dangerousCorsRule, makeConfig());
    expect(issues).toHaveLength(1);
    expect(issues[0].ruleId).toBe('security/dangerous-cors');
  });

  it('flags cors({ origin: "*" })', async () => {
    const src = `app.use(cors({ origin: '*' }));`;
    const issues = await runRule(src, dangerousCorsRule, makeConfig());
    expect(issues).toHaveLength(1);
  });

  it('flags cors({ origin: true }) (reflective wildcard)', async () => {
    const src = `app.use(cors({ origin: true }));`;
    const issues = await runRule(src, dangerousCorsRule, makeConfig());
    expect(issues).toHaveLength(1);
    expect(issues[0].message).toContain('Reflective');
  });

  it('does NOT flag an explicit allowlist', async () => {
    const src = `app.use(cors({ origin: ['https://app.example.com'] }));`;
    const issues = await runRule(src, dangerousCorsRule, makeConfig());
    expect(issues).toHaveLength(0);
  });

  it('does NOT flag the option being absent', async () => {
    const src = `app.use(cors());`;
    const issues = await runRule(src, dangerousCorsRule, makeConfig());
    expect(issues).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// missing-auth-check
// ---------------------------------------------------------------------------

describe('security/missing-auth-check', () => {
  it('flags a Next.js route handler with no auth check', async () => {
    const src = `
      export async function GET(request: Request) {
        const data = await fetch('https://api.example.com/data');
        return Response.json(data);
      }
    `;
    const issues = await runRule(
      src,
      missingAuthCheckRule,
      makeConfig(),
      'app/api/users/route.ts',
    );
    expect(issues).toHaveLength(1);
    expect(issues[0].ruleId).toBe('security/missing-auth-check');
  });

  it('does NOT flag when getServerSession is in the body', async () => {
    const src = `
      export async function GET(request: Request) {
        const session = await getServerSession();
        if (!session) return new Response('Unauthorized', { status: 401 });
        return Response.json({ user: session.user });
      }
    `;
    const issues = await runRule(
      src,
      missingAuthCheckRule,
      makeConfig(),
      'app/api/users/route.ts',
    );
    expect(issues).toHaveLength(0);
  });

  it('does NOT flag a non-route file', async () => {
    const src = `
      export async function GET() { return null; }
    `;
    const issues = await runRule(src, missingAuthCheckRule, makeConfig(), 'components/Button.tsx');
    expect(issues).toHaveLength(0);
  });

  it('does NOT flag an Express route that uses jwt.verify', async () => {
    const src = `
      app.get('/api/data', (req, res) => {
        const payload = jwt.verify(req.token, SECRET);
        return res.json(payload);
      });
    `;
    const issues = await runRule(
      src,
      missingAuthCheckRule,
      makeConfig(),
      'src/routes/data.ts',
    );
    expect(issues).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// aiSecurityRisk scoring
// ---------------------------------------------------------------------------

describe('computeAiSecurityRisk', () => {
  it('returns low for empty input', () => {
    const { risk, findings } = computeAiSecurityRisk([]);
    expect(risk).toBe('low');
    expect(findings).toEqual({ critical: 0, high: 0, medium: 0, low: 0 });
  });

  it('returns medium for a single medium finding', () => {
    const { risk, findings } = computeAiSecurityRisk([
      mkIssue('medium'),
    ]);
    expect(risk).toBe('medium');
    expect(findings.medium).toBe(1);
  });

  it('returns high for a single high finding', () => {
    const { risk } = computeAiSecurityRisk([mkIssue('high')]);
    expect(risk).toBe('high');
  });

  it('returns high for >=3 medium findings', () => {
    const { risk } = computeAiSecurityRisk([
      mkIssue('medium'),
      mkIssue('medium'),
      mkIssue('medium'),
    ]);
    expect(risk).toBe('high');
  });

  it('returns critical for >=3 high findings', () => {
    const { risk } = computeAiSecurityRisk([
      mkIssue('high'),
      mkIssue('high'),
      mkIssue('high'),
    ]);
    expect(risk).toBe('critical');
  });

  it('returns low when there are only low-severity findings', () => {
    const { risk } = computeAiSecurityRisk([
      mkIssue('low'),
      mkIssue('low'),
    ]);
    expect(risk).toBe('low');
  });

  it('a single high outranks three mediums', () => {
    const { risk } = computeAiSecurityRisk([
      mkIssue('medium'),
      mkIssue('medium'),
      mkIssue('medium'),
      mkIssue('high'),
    ]);
    expect(risk).toBe('high');
  });

  it('does not promote to critical based on low-severity findings', () => {
    const { risk } = computeAiSecurityRisk([
      mkIssue('low'),
      mkIssue('low'),
      mkIssue('low'),
      mkIssue('low'),
      mkIssue('low'),
    ]);
    expect(risk).toBe('low');
  });
});

function mkIssue(severity: Issue['severity']): Issue {
  return {
    ruleId: 'security/test',
    category: 'security',
    severity,
    aiSpecific: false,
    message: 'test',
    line: 1,
    column: 1,
    advice: 'test',
  };
}

// ---------------------------------------------------------------------------
// sql-construction
// ---------------------------------------------------------------------------

describe('security/sql-construction', () => {
  it('flags template-literal SQL with interpolation', async () => {
    const issues = await runRule(
      `const q = \`SELECT * FROM users WHERE id = \${userId}\`;`,
      sqlConstructionRule,
      makeConfig(),
    );
    expect(issues).toHaveLength(1);
    expect(issues[0].ruleId).toBe('security/sql-construction');
  });

  it('flags INSERT/UPDATE/DELETE the same way', async () => {
    for (const keyword of ['INSERT INTO', 'UPDATE users SET', 'DELETE FROM', 'REPLACE INTO']) {
      const issues = await runRule(
        `const q = \`${keyword} x = \${val}\`;`,
        sqlConstructionRule,
        makeConfig(),
      );
      expect(issues.length).toBeGreaterThanOrEqual(1);
    }
  });

  it('does NOT flag parameterized queries', async () => {
    const issues = await runRule(
      `const q = \`SELECT * FROM users WHERE id = ?\`;`,
      sqlConstructionRule,
      makeConfig(),
    );
    expect(issues).toHaveLength(0);
  });

  it('does NOT flag SQL keywords outside of a string literal', async () => {
    const issues = await runRule(
      `// remember to use SELECT * FROM carefully\nconst x = 1;`,
      sqlConstructionRule,
      makeConfig(),
    );
    expect(issues).toHaveLength(0);
  });

  it('flags string-concat SQL with +', async () => {
    const issues = await runRule(
      `const q = 'SELECT * FROM users WHERE id = ' + userId;`,
      sqlConstructionRule,
      makeConfig(),
    );
    expect(issues.length).toBeGreaterThanOrEqual(1);
  });
});

// ---------------------------------------------------------------------------
// public-admin-route
// ---------------------------------------------------------------------------

describe('security/public-admin-route', () => {
  it('flags /admin/ route without role check', async () => {
    const src = `
      export async function POST(request: Request) {
        const data = await request.json();
        await db.deleteUser(data.id);
        return Response.json({ ok: true });
      }
    `;
    const issues = await runRule(
      src,
      publicAdminRouteRule,
      makeConfig(),
      'app/api/admin/users/route.ts',
    );
    expect(issues).toHaveLength(1);
    expect(issues[0].ruleId).toBe('security/public-admin-route');
  });

  it('does NOT flag /admin/ route WITH requireRole', async () => {
    const src = `
      export async function POST(request: Request) {
        await requireRole(request, 'admin');
        const data = await request.json();
        await db.deleteUser(data.id);
        return Response.json({ ok: true });
      }
    `;
    const issues = await runRule(
      src,
      publicAdminRouteRule,
      makeConfig(),
      'app/api/admin/users/route.ts',
    );
    expect(issues).toHaveLength(0);
  });

  it('flags /internal/, /debug/, /staff/, /manage/ paths', async () => {
    const src = `
      export async function GET() {
        return Response.json({});
      }
    `;
    for (const path of [
      'app/api/internal/metrics/route.ts',
      'src/routes/debug/cache.ts',
      'app/api/staff/reports/route.ts',
      'src/routes/manage/users.ts',
    ]) {
      const issues = await runRule(src, publicAdminRouteRule, makeConfig(), path);
      expect(issues.length, `expected flag for ${path}`).toBeGreaterThanOrEqual(1);
    }
  });

  it('does NOT flag a normal user route', async () => {
    const src = `
      export async function GET() {
        return Response.json({});
      }
    `;
    const issues = await runRule(
      src,
      publicAdminRouteRule,
      makeConfig(),
      'app/api/users/route.ts',
    );
    expect(issues).toHaveLength(0);
  });
});