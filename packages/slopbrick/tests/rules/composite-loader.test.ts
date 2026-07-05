// v0.42.0 (Sprint 3, §3b.7): tests for the composite loader at
// `src/rules/composite-loader.ts`. Verifies readComposites,
// compositeToRule, loadCompositesInto, and discoverAndLoad.
//
// The composite-loader sits in a separate file from
// `src/rules/registry-loader.ts` (shadcn-registry snapshot loader);
// the two have non-overlapping responsibilities and shouldn't
// merge.

import { describe, expect, it } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

import { RuleRegistry } from '../../src/rules/registry';
import {
  COMPOSITES_FILE,
  readComposites,
  compositeToRule,
  loadCompositesInto,
  discoverAndLoad,
  writeComposites,
} from '../../src/rules/composite-loader';
import type { CompositeRule, CompositeRuleEntry, ScanFacts } from '../../src/types';

function freshDir(): string {
  return mkdtempSync(join(tmpdir(), 'slopbrick-composite-loader-'));
}

function makeScanFacts(fired: ReadonlyArray<string>): ScanFacts {
  return {
    compositeFireSet: new Set(fired),
  } as unknown as ScanFacts;
}

function makeRule<C = unknown>(
  id: string,
  ruleIds: ReadonlyArray<string>,
  minMatch: number,
): CompositeRule<C> {
  return {
    id,
    category: 'ai',
    severity: 'medium',
    aiSpecific: true,
    description: `Composite ${id}`,
    defaultOff: true,
    ruleIds: [...ruleIds],
    minMatch,
    create: () => ({}) as C,
    analyze: (): never[] => [],
  };
}

describe('readComposites', () => {
  it('returns [] when composites.json is missing', () => {
    const dir = freshDir();
    try {
      expect(readComposites(dir)).toEqual([]);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('reads a valid composites.json', () => {
    const dir = freshDir();
    try {
      const entries: CompositeRuleEntry[] = [
        {
          id: 'composite/abc123',
          ruleIds: ['ai/x', 'ai/y'],
          minMatch: 2,
          severity: 'medium',
          defaultOff: true,
          description: 'test composite',
          calibration: { recall: 0.8, FP: 0, precision: 1, F1: 0.89, nFiles: 40 },
          provenance: {
            seed: 'auto-cluster',
            discoveredAt: '2026-07-05T00:00:00.000Z',
            nFiles: 100,
            members: 2,
            npmi: 0.7,
            fisherP: 1e-6,
          },
        },
      ];
      writeFileSync(
        join(dir, COMPOSITES_FILE),
        JSON.stringify(entries),
        'utf-8',
      );
      const result = readComposites(dir);
      expect(result).toEqual(entries);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('returns [] on malformed JSON', () => {
    const dir = freshDir();
    try {
      writeFileSync(join(dir, COMPOSITES_FILE), '{ not json', 'utf-8');
      expect(readComposites(dir)).toEqual([]);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('returns [] when the file is not an array', () => {
    const dir = freshDir();
    try {
      writeFileSync(join(dir, COMPOSITES_FILE), JSON.stringify({}), 'utf-8');
      expect(readComposites(dir)).toEqual([]);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe('compositeToRule', () => {
  it('emits an Issue only when at least minMatch members fired', () => {
    const rule = compositeToRule(makeRule('comp1', ['r1', 'r2', 'r3'], 2));
    expect(rule.id).toBe('comp1');

    // 0 fired → no issue
    expect(rule.analyze({}, makeScanFacts([]))).toEqual([]);
    // 1 fired → still no issue (below threshold)
    expect(rule.analyze({}, makeScanFacts(['r1']))).toEqual([]);
    // 2 fired → issue emitted
    const two = rule.analyze({}, makeScanFacts(['r1', 'r2']));
    expect(two.length).toBe(1);
    expect(two[0]!.ruleId).toBe('comp1');
    expect(two[0]!.message).toContain('2 of 3');
    // 3 fired → issue emitted
    expect(rule.analyze({}, makeScanFacts(['r1', 'r2', 'r3'])).length).toBe(1);
  });

  it('is a no-op when facts.compositeFireSet is undefined', () => {
    const rule = compositeToRule(makeRule('comp1', ['r1', 'r2'], 1));
    // No compositeFireSet on the facts object — should return [].
    expect(rule.analyze({}, {} as unknown as ScanFacts)).toEqual([]);
  });

  it('tags the rule with compositeRuleIds + compositeMinMatch', () => {
    const rule = compositeToRule(makeRule('comp1', ['a', 'b'], 2));
    expect(rule.compositeRuleIds).toEqual(['a', 'b']);
    expect(rule.compositeMinMatch).toBe(2);
  });
});

describe('loadCompositesInto', () => {
  it('registers and replaces composites (idempotent across calls)', () => {
    const registry = new RuleRegistry();
    loadCompositesInto(registry, [makeRule('composite/comp1', ['a'], 1)]);
    loadCompositesInto(registry, [makeRule('composite/comp1', ['a'], 1)]);
    expect(registry.has('composite/comp1')).toBe(true);

    // Re-load with a different composite — clears the previous one.
    loadCompositesInto(registry, [makeRule('composite/comp2', ['a'], 1)]);
    expect(registry.has('composite/comp1')).toBe(false);
    expect(registry.has('composite/comp2')).toBe(true);
  });

  it('returns the number of composites registered', () => {
    const registry = new RuleRegistry();
    const added = loadCompositesInto(registry, [
      makeRule('composite/comp1', ['a'], 1),
      makeRule('composite/comp2', ['a', 'b'], 2),
    ]);
    expect(added).toBe(2);
  });
});

describe('discoverAndLoad', () => {
  it('merges auto-discovered + user-declared composites', () => {
    const dir = freshDir();
    try {
      mkdirSync(dir, { recursive: true });
      const auto: CompositeRuleEntry[] = [
        {
          id: 'composite/auto1',
          ruleIds: ['r1', 'r2'],
          minMatch: 2,
          severity: 'low',
          defaultOff: true,
          description: 'auto composite',
          calibration: { recall: 0.5, FP: 0, precision: 1, F1: 0.67, nFiles: 10 },
          provenance: {
            seed: 'auto-cluster',
            discoveredAt: '2026-07-05T00:00:00.000Z',
            nFiles: 100,
            members: 2,
            npmi: 0.5,
            fisherP: 0.001,
          },
        },
      ];
      writeFileSync(join(dir, COMPOSITES_FILE), JSON.stringify(auto), 'utf-8');
      const registry = new RuleRegistry();
      const added = discoverAndLoad(registry, dir, [
        makeRule('user1', ['r3'], 1),
      ]);
      expect(added).toBe(2);
      expect(registry.has('composite/auto1')).toBe(true);
      expect(registry.has('user1')).toBe(true);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe('writeComposites', () => {
  it('writes the JSON atomically to disk', () => {
    const dir = freshDir();
    try {
      const entries: CompositeRuleEntry[] = [
        {
          id: 'composite/test1',
          ruleIds: ['a'],
          minMatch: 1,
          severity: 'low',
          defaultOff: true,
          description: 'test',
          calibration: { recall: 0.5, FP: 0.5, precision: 0.5, F1: 0.5, nFiles: 1 },
          provenance: {
            seed: 'auto-cluster',
            discoveredAt: '2026-07-05T00:00:00.000Z',
            nFiles: 1,
            members: 1,
            npmi: 0,
            fisherP: 1,
          },
        },
      ];
      writeComposites(dir, entries);
      const round = readComposites(dir);
      expect(round).toEqual(entries);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
