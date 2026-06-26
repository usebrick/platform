import { describe, expect, it } from 'vitest';
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { RuleRegistry } from '../../src/rules/registry';
import { createRule } from '../../src/rules/rule';
import type { Issue, ResolvedConfig, Rule, ScanFacts } from '../../src/types';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const RULES_DIR = path.resolve(__dirname, '../../src/rules');

interface RuleModuleInfo {
  category: string;
  file: string;
  name: string;
  id: string;
}

async function discoverRuleModules(): Promise<RuleModuleInfo[]> {
  const entries = await readdir(RULES_DIR, { withFileTypes: true });
  const categories = entries
    .filter((e) => e.isDirectory())
    .map((e) => e.name)
    .sort();

  const modules: RuleModuleInfo[] = [];
  for (const category of categories) {
    const categoryDir = path.join(RULES_DIR, category);
    const files = (await readdir(categoryDir))
      .filter((f) => f.endsWith('.ts') && !f.endsWith('.test.ts'))
      .sort();

    for (const file of files) {
      const filePath = path.join(categoryDir, file);
      const content = await readFile(filePath, 'utf8');
      const exportMatch = content.match(/export\s+const\s+(\w+Rule)\b/);
      if (!exportMatch) {
        continue;
      }
      const name = exportMatch[1];
      const idMatch = content.match(/id:\s*['"]([^'"]+)['"]/);
      if (!idMatch) {
        throw new Error(`Rule module ${category}/${file} is missing an id field.`);
      }
      modules.push({
        category,
        file: file.replace(/\.ts$/, ''),
        name,
        id: idMatch[1],
      });
    }
  }

  return modules.sort((a, b) => `${a.category}/${a.file}`.localeCompare(`${b.category}/${b.file}`));
}

function makeConfig(): ResolvedConfig {
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
  };
}

describe('RuleRegistry', () => {
  it('registers and retrieves rules', () => {
    const registry = new RuleRegistry();
    const rule = createRule({
      id: 'test/rule',
      category: 'logic',
      severity: 'medium',
      aiSpecific: true,
      create: () => ({}),
      analyze: (): Issue[] => [],
    });
    registry.register(rule);
    expect(registry.getRules().length).toBe(1);
  });

  it('filters by ai and human kind', () => {
    const registry = new RuleRegistry();
    registry.register(
      createRule({ id: 'a', category: 'logic', severity: 'low', aiSpecific: true, create: () => ({}), analyze: () => [] })
    );
    registry.register(
      createRule({ id: 'b', category: 'logic', severity: 'low', aiSpecific: false, create: () => ({}), analyze: () => [] })
    );
    expect(registry.getRules({ kind: 'ai' }).length).toBe(1);
    expect(registry.getRules({ kind: 'human' }).length).toBe(1);
  });

  it('creates rule contexts', () => {
    const registry = new RuleRegistry();
    const rule = createRule({
      id: 'test/rule',
      category: 'logic',
      severity: 'medium',
      aiSpecific: true,
      create: (ctx) => ({ filePath: ctx.filePath }),
      analyze: (): Issue[] => [],
    });
    registry.register(rule);
    const enabled = registry.createContexts(makeConfig(), 'Button.tsx', '/tmp');
    expect(enabled).toHaveLength(1);
    expect(enabled[0].context).toEqual({ filePath: 'Button.tsx' });
  });

  it('loads all built-in rules', async () => {
    const modules = await discoverRuleModules();
    const registry = new RuleRegistry();
    registry.loadBuiltins();
    const actualIds = registry.getRules().map((r) => r.id).sort();
    const expectedIds = modules.map((m) => m.id).sort();
    expect(actualIds).toEqual(expectedIds);
  });
});
