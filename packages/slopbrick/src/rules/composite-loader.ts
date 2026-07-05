// v0.42.0 (Sprint 3, §3b.4): loader that merges empirical-composite
// entries into a `RuleRegistry` so the engine can fire composites
// alongside built-in rules.
//
// Note: this is separate from `src/rules/registry-loader.ts` (the
// shadcn-registry snapshot loader); the two operate on disjoint
// domains — composites live in `composites.json` next to
// `signal-strength.json`, while the shadcn registry lives in
// `.slopbrick/cache/registry-snapshot.json`.
//
// Reads two sources, in order:
//   1. `<cwd>/composites.json` — auto-discovered composites from the
//      last `slopbrick composite discover` run.
//   2. `slopbrick.config.mjs#compositeRules` (user-declared) — when
//      a user runs `slopbrick composite enable <id>`, the config
//      gets that entry. The `CompositeRule<Context>` shape
//      parallels `Rule<Context>`.
//
// Each composite becomes a `Rule` whose `analyze()` reads the running
// fire-set from `facts.compositeFireSet?: Set<string>` and emits an
// `Issue` iff at least `minMatch` members fired on this file.

import { existsSync, readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import type {
  CompositeRule,
  CompositeRuleEntry,
  Issue,
  Rule,
  ScanFacts,
} from '../types';
import type { CompositeAsRule, RuleRegistry } from './registry';

/** Path of the auto-discovered composites ledger. */
export const COMPOSITES_FILE = 'composites.json';

export function compositesPath(cwd: string): string {
  return join(cwd, COMPOSITES_FILE);
}

/** Read composites.json from disk. Returns [] on missing/malformed. */
export function readComposites(cwd: string): CompositeRuleEntry[] {
  const path = compositesPath(cwd);
  if (!existsSync(path)) return [];
  try {
    const raw = JSON.parse(readFileSync(path, 'utf-8')) as unknown;
    if (!Array.isArray(raw)) return [];
    return raw.filter(isCompositeRuleEntry);
  } catch {
    return [];
  }
}

function isCompositeRuleEntry(value: unknown): value is CompositeRuleEntry {
  if (!value || typeof value !== 'object') return false;
  const v = value as Record<string, unknown>;
  return (
    typeof v.id === 'string' &&
    Array.isArray(v.ruleIds) &&
    typeof v.minMatch === 'number'
  );
}

/** Materialize a composite into a `Rule`. */
export function compositeToRule(
  composite: CompositeRule<unknown>,
): CompositeAsRule {
  const rule: Rule = {
    id: composite.id,
    category: composite.category,
    severity: composite.severity,
    aiSpecific: composite.aiSpecific,
    description: composite.description,
    create: () => ({}),
    analyze: (_ctx, facts: ScanFacts): Issue[] => {
      const factsWithFires = facts as ScanFacts & {
        compositeFireSet?: ReadonlySet<string>;
      };
      const fired = factsWithFires.compositeFireSet;
      const ids = fired ?? new Set<string>();
      let n = 0;
      for (const m of composite.ruleIds) if (ids.has(m)) n++;
      if (n < composite.minMatch) return [];
      return [
        {
          ruleId: composite.id,
          category: composite.category,
          severity: composite.severity,
          aiSpecific: composite.aiSpecific,
          message:
            `Composite rule "${composite.id}" fired: ${n} of ` +
            `${composite.ruleIds.length} member rules fired on this file ` +
            `(threshold: ${composite.minMatch}).`,
          line: 1,
          column: 1,
        },
      ];
    },
  };
  return Object.assign(rule, {
    compositeRuleIds: composite.ruleIds,
    compositeMinMatch: composite.minMatch,
  });
}

/** Merge composites into a registry. Idempotent. */
export function loadCompositesInto(
  registry: RuleRegistry,
  composites: ReadonlyArray<CompositeRule<unknown>>,
): number {
  // Clear any previously-registered composites first.
  // collect IDs to avoid mutating-during-iteration hazards with `removeWhere`.
  const previousCompositeIds = registry
    .all()
    .filter((r) => r.id.startsWith('composite/'))
    .map((r) => r.id);
  if (previousCompositeIds.length > 0) {
    registry.removeWhere((r) => previousCompositeIds.includes(r.id));
  }
  let added = 0;
  for (const c of composites) {
    try {
      registry.register(compositeToRule(c));
      added++;
    } catch (err) {
      if (process.env.SLOP_AUDIT_DEBUG === '1') {
        console.error(
          `[composite-loader] failed to register ${c.id}: ${(err as Error).message}`,
        );
      }
    }
  }
  return added;
}

/** Discover + load composites from disk (auto + user-declared). */
export function discoverAndLoad(
  registry: RuleRegistry,
  cwd: string,
  userDeclared: ReadonlyArray<CompositeRule<unknown>> = [],
): number {
  const auto = readComposites(cwd);
  // Convert auto ClusterRuleEntry → CompositeRule so downstream works uniformly.
  const autoAsRules: CompositeRule<unknown>[] = auto.map(
    (e): CompositeRule<unknown> => ({
      id: e.id,
      category: 'ai',
      severity: e.severity,
      aiSpecific: true,
      description: e.description,
      defaultOff: e.defaultOff,
      ruleIds: e.ruleIds,
      minMatch: e.minMatch,
      create: () => ({}),
      analyze: () => [],
    }),
  );
  return loadCompositesInto(registry, [...autoAsRules, ...userDeclared]);
}

/** Write composites.json atomically (tmp + rename). */
export function writeComposites(
  cwd: string,
  entries: ReadonlyArray<CompositeRuleEntry>,
): void {
  const path = compositesPath(cwd);
  mkdirSync(dirname(path), { recursive: true });
  const tmp = `${path}.tmp`;
  writeFileSync(tmp, JSON.stringify(entries, null, 2), 'utf-8');
  const fs = require('node:fs') as typeof import('node:fs');
  fs.renameSync(tmp, path);
}
