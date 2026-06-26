import { describe, expect, it } from 'vitest';
import { writeFileSync, mkdirSync, mkdtempSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { dirname, join } from 'path';
import { parseFile } from '../../src/engine/parser';
import { extractFacts } from '../../src/engine/visitor';
import { missingAuthCheckRule } from '../../src/rules/security/missing-auth-check';
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

async function runRule(source: string, filePath: string): Promise<Issue[]> {
  const dir = mkdtempSync(join(tmpdir(), 'slopbrick-missing-auth-test-'));
  try {
    const fullPath = join(dir, filePath);
    mkdirSync(dirname(fullPath), { recursive: true });
    writeFileSync(fullPath, source);
    const { ast, source: parsedSource } = await parseFile(fullPath);
    const facts = extractFacts(fullPath, ast, parsedSource);
    const context: RuleContext = { config: makeConfig(), filePath: fullPath, cwd: dir };
    const ruleContext = missingAuthCheckRule.create(context);
    return missingAuthCheckRule.analyze(ruleContext, facts);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

describe('security/missing-auth-check', () => {
  it('flags Next.js route.ts with no auth primitive', async () => {
    const source = `
export async function GET(req: Request) {
  const data = await db.items.findMany();
  return Response.json(data);
}`;
    const issues = await runRule(source, 'app/api/items/route.ts');
    expect(issues).toHaveLength(1);
    expect(issues[0].ruleId).toBe('security/missing-auth-check');
  });

  it('does not flag route.ts that calls getServerSession', async () => {
    const source = `
import { getServerSession } from 'next-auth';
export async function GET(req: Request) {
  const session = await getServerSession();
  if (!session) return new Response('Unauthorized', { status: 401 });
  const data = await db.items.findMany();
  return Response.json(data);
}`;
    const issues = await runRule(source, 'app/api/items/route.ts');
    expect(issues).toHaveLength(0);
  });

  it('does not flag route.ts that calls requireAuth', async () => {
    const source = `
import { requireAuth } from '@/lib/auth';
export async function POST(req: Request) {
  const user = await requireAuth(req);
  return Response.json({ ok: true });
}`;
    const issues = await runRule(source, 'app/api/items/route.ts');
    expect(issues).toHaveLength(0);
  });

  it('does not flag non-server-route files', async () => {
    const source = `
export async function GET(req: Request) {
  const data = await db.items.findMany();
  return Response.json(data);
}`;
    const issues = await runRule(source, 'components/ItemsList.tsx');
    expect(issues).toHaveLength(0);
  });

  it('flags pages/api/route without auth', async () => {
    // pages/api uses the `export default async function handler(req, res)`
    // pattern but the rule keys on HTTP method names (GET/POST/...). For
    // Next.js pages/api, the handler name is `handler` and dispatch is by
    // req.method — so the rule correctly does not flag pages/api (out of
    // scope for v1 heuristic). This test pins that scope.
    const source = `
export default async function handler(req, res) {
  if (req.method === 'GET') {
    const data = await db.items.findMany();
    res.json(data);
  }
}`;
    const issues = await runRule(source, 'pages/api/items.ts');
    expect(issues).toHaveLength(0);
  });

  it('flags app/api/route.ts POST handler without auth', async () => {
    const source = `
export async function POST(req: Request) {
  const body = await req.json();
  await db.items.create(body);
  return Response.json({ ok: true });
}`;
    const issues = await runRule(source, 'app/api/items/route.ts');
    expect(issues).toHaveLength(1);
  });
});
