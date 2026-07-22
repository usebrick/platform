import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const getCurrentEvidencePolicyAccessorsMock = vi.hoisted(() => vi.fn());

vi.mock('../../src/rules/current-evidence-policy-runtime', () => ({
  getCurrentEvidencePolicyAccessors: getCurrentEvidencePolicyAccessorsMock,
}));

import { DEFAULT_CONFIG } from '../../src/config';
import { aggregateReport } from '../../src/engine/metrics';
import { scanFile } from '../../src/engine/worker';
import { RuleRegistry } from '../../src/rules/registry';
import { createRule } from '../../src/rules/rule';
import { loadCompositesInto } from '../../src/rules/composite-loader';
import { compositeScore } from '@usebrick/engine';
import { loadSignalStrength } from '../../src/rules/signal-strength';
import { approvedCurrentPolicyFixture } from '../helpers/current-evidence-policy-v2';
import type { Category, CompositeRule, Issue, ResolvedConfig, Severity } from '../../src/types';

const tempDirs: string[] = [];

beforeEach(() => {
  getCurrentEvidencePolicyAccessorsMock.mockReset();
  getCurrentEvidencePolicyAccessorsMock.mockReturnValue(undefined);
});

afterEach(() => {
  for (const dir of tempDirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

type AggregateIssue = {
  ruleId: string;
  category: Category;
  severity: Severity;
  aiSpecific: boolean;
};

type AggregateFile = {
  filePath: string;
  issues: AggregateIssue[];
  componentCount?: number;
};

function aggregateFiles(files: readonly AggregateFile[]) {
  return aggregateReport(
    files.map(({ filePath, componentCount = 1 }) => ({
      filePath,
      rawScore: 0,
      componentScore: 0,
      adjustedScore: 0,
      componentCount,
    })),
    files.map(({ filePath, issues }) => ({ filePath, issues })),
    DEFAULT_CONFIG,
    undefined,
    files.length,
  );
}

function aggregate(issues: AggregateIssue[]) {
  return aggregateFiles([{ filePath: 'src/a.ts', issues }]);
}

function cleanFile(filePath: string): AggregateFile {
  return { filePath, issues: [] };
}

function emittedIssue(ruleId: string, aiSpecific: boolean): Issue {
  return {
    ruleId,
    category: 'logic',
    severity: 'medium',
    aiSpecific,
    message: `Finding from ${ruleId}`,
    line: 1,
    column: 1,
  };
}

describe('Gate 1 score-contract category matrix', () => {
  it('uses only score-eligible findings for Bayesian and synthetic composite inputs', async () => {
    getCurrentEvidencePolicyAccessorsMock.mockReturnValue(approvedCurrentPolicyFixture());
    const dir = mkdtempSync(join(tmpdir(), 'slopbrick-score-authority-'));
    tempDirs.push(dir);
    mkdirSync(join(dir, 'src'));
    const filePath = join(dir, 'src', 'a.ts');
    writeFileSync(filePath, 'export const value = 1;\n');

    const eligibleRuleId = 'context/import-path-mismatch';
    const diagnosticRuleId = 'ai/any-density';
    const compositeId = 'composite/policy-score-authority';
    const registry = new RuleRegistry();
    registry.register(createRule({
      id: eligibleRuleId,
      category: 'logic',
      severity: 'medium',
      aiSpecific: false,
      create: () => ({}),
      analyze: () => [emittedIssue(eligibleRuleId, false)],
    }));
    registry.register(createRule({
      id: diagnosticRuleId,
      category: 'logic',
      severity: 'medium',
      aiSpecific: true,
      defaultOff: true,
      create: () => ({}),
      analyze: () => [emittedIssue(diagnosticRuleId, true)],
    }));
    const composite: CompositeRule = {
      id: compositeId,
      category: 'ai',
      severity: 'medium',
      aiSpecific: true,
      defaultOff: false,
      description: 'Policy score-authority test composite',
      ruleIds: [eligibleRuleId, diagnosticRuleId],
      minMatch: 2,
      create: () => ({}),
      analyze: () => [],
    };
    loadCompositesInto(registry, [composite]);
    const config: ResolvedConfig = {
      ...DEFAULT_CONFIG,
      include: ['src/**/*.ts'],
      exclude: [],
      rules: {
        ...DEFAULT_CONFIG.rules,
        [diagnosticRuleId]: 'low',
      },
    };

    const result = await scanFile(filePath, config, registry, dir);
    const emittedRuleIds = result.issues.map((issue) => issue.ruleId);

    expect(emittedRuleIds).toContain(eligibleRuleId);
    expect(emittedRuleIds).toContain(diagnosticRuleId);
    expect(emittedRuleIds).not.toContain(compositeId);
    expect(result.compositeScore).toEqual(compositeScore(
      [eligibleRuleId],
      loadSignalStrength(),
    ));
  });

  it('keeps no-findings scores neutral for empty, tiny, and large analyzed repositories', () => {
    const empty = aggregateFiles([]);
    const tiny = aggregateFiles([cleanFile('src/tiny.ts')]);
    const large = aggregateFiles(
      Array.from({ length: 1024 }, (_, index) => cleanFile(`src/clean-${index}.ts`)),
    );

    const expectedCleanScores = {
      aiSlopScore: 0,
      engineeringHygiene: 100,
      security: 100,
      repositoryHealth: 100,
    };
    expect(empty).toMatchObject(expectedCleanScores);
    expect(tiny).toMatchObject(expectedCleanScores);
    expect(large).toMatchObject(expectedCleanScores);

    // A clean file must not dilute or otherwise change the score of an
    // empty/tiny clean repository when the analyzed population grows.
    for (const field of Object.keys(expectedCleanScores) as Array<keyof typeof expectedCleanScores>) {
      expect(large[field]).toBe(tiny[field]);
      expect(large[field]).toBe(empty[field]);
    }
  });

  it('keeps empty and non-AI backend evidence out of the AI score', () => {
    const empty = aggregateReport([], [], DEFAULT_CONFIG, undefined, 0);
    expect(empty).toMatchObject({
      aiSlopScore: 0,
      engineeringHygiene: 100,
      security: 100,
      repositoryHealth: 100,
    });

    const backend = aggregate([
      { ruleId: 'db/sql-concat', category: 'db', severity: 'high', aiSpecific: false },
    ]);
    expect(backend.aiSlopScore).toBe(0);
    expect(backend.security).toBe(100);
    expect(backend.repositoryHealth).toBe(100);
    expect(backend.categoryScores.db).toBeGreaterThan(0);
  });

  it('keeps a non-AI security finding separate while preserving AI-only evidence', () => {
    const aiOnly = aggregate([
      { ruleId: 'visual/inline-style-dominance', category: 'visual', severity: 'high', aiSpecific: true },
    ]);
    const securityOnly = aggregate([
      { ruleId: 'security/sql-construction', category: 'security', severity: 'high', aiSpecific: false },
    ]);
    const mixed = aggregate([
      { ruleId: 'visual/inline-style-dominance', category: 'visual', severity: 'high', aiSpecific: true },
      { ruleId: 'security/sql-construction', category: 'security', severity: 'high', aiSpecific: false },
    ]);

    expect(securityOnly.aiSlopScore).toBe(0);
    expect(securityOnly.security).toBeLessThan(100);
    expect(securityOnly.repositoryHealth).toBeLessThan(100);
    expect(mixed.aiSlopScore).toBeCloseTo(aiOnly.aiSlopScore, 12);
    expect(mixed.security).toBeLessThan(aiOnly.security);
    expect(mixed.repositoryHealth).toBeLessThan(aiOnly.repositoryHealth);
  });

  it('separates AI-only, hygiene-only, backend-only, and mixed evidence', () => {
    const aiOnly = aggregate([
      { ruleId: 'visual/inline-style-dominance', category: 'visual', severity: 'high', aiSpecific: true },
    ]);
    const hygieneOnly = aggregate([
      { ruleId: 'logic/boundary-violation', category: 'logic', severity: 'high', aiSpecific: false },
    ]);
    const backendOnly = aggregate([
      { ruleId: 'db/sql-concat', category: 'db', severity: 'high', aiSpecific: false },
    ]);
    const mixed = aggregate([
      { ruleId: 'visual/inline-style-dominance', category: 'visual', severity: 'high', aiSpecific: true },
      { ruleId: 'logic/boundary-violation', category: 'logic', severity: 'high', aiSpecific: false },
      { ruleId: 'db/sql-concat', category: 'db', severity: 'high', aiSpecific: false },
    ]);

    expect(aiOnly.aiSlopScore).toBeGreaterThan(0);
    expect(aiOnly.security).toBe(100);

    expect(hygieneOnly.aiSlopScore).toBe(0);
    expect(hygieneOnly.engineeringHygiene).toBeLessThan(100);
    expect(hygieneOnly.security).toBe(100);

    expect(backendOnly.aiSlopScore).toBe(0);
    expect(backendOnly.engineeringHygiene).toBe(100);
    expect(backendOnly.security).toBe(100);
    expect(backendOnly.repositoryHealth).toBe(100);
    expect(backendOnly.categoryScores.db).toBeGreaterThan(0);

    // Mixing non-AI evidence with an AI signal cannot increase the AI score;
    // hygiene evidence lowers the maintainability axis, while backend
    // diagnostics remain outside all four headline scores.
    expect(mixed.aiSlopScore).toBeCloseTo(aiOnly.aiSlopScore, 12);
    expect(mixed.engineeringHygiene).toBeLessThan(aiOnly.engineeringHygiene);
    expect(mixed.engineeringHygiene).toBeLessThan(hygieneOnly.engineeringHygiene);
    expect(mixed.security).toBe(100);
    expect(mixed.repositoryHealth).toBeLessThan(aiOnly.repositoryHealth);
    expect(mixed.repositoryHealth).toBeLessThan(hygieneOnly.repositoryHealth);
    expect(mixed.categoryScores.db).toBeGreaterThan(0);
  });
});
