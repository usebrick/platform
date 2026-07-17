import { describe, expect, it } from 'vitest';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { applyFixes } from '../../src/fix';
import { sha256Text } from '../../src/fix/binding';
import type { Issue, ProjectReport, ResolvedConfig } from '../../src/types';

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

function makeReport(issues: Issue[]): ProjectReport {
  return {
    version: '0.6.0',
    generatedAt: '2024-01-01T00:00:00.000Z',
    aiSlopScore: 0,
    engineeringHygiene: 0,
    security: 0,
    repositoryHealth: 0,
    assemblyHealth: 100,
    totalScore: 0,
    categoryScores: {
      visual: 0,
      typo: 0,
      wcag: 0,
      layout: 0,
      component: 0,
      logic: 0,
      arch: 0,
      perf: 0,
      security: 0,
      test: 0,
      docs: 0,
      db: 0,
      ai: 0,
      context: 0,
      product: 0,
      i18n: 0,
    },
    p90Score: 0,
    peakScore: 0,
    boundaryScore: 0,
    contextScore: 0,
    visualScore: 0,
    componentCount: 0,
    fileCount: issues.length,
    thresholds: { meanSlop: 25, p90Slop: 50, individualSlopThreshold: 50 },
    components: [],
    issues,
  };
}

function issue(
  filePath: string,
  targetFile: string,
  line = 1,
  bindingSource = readFileSync(filePath, 'utf-8'),
): Issue {
  const ruleId = 'visual/arbitrary-escape';
  const column = 1;
  return {
    ruleId,
    category: 'visual',
    severity: 'medium',
    aiSpecific: true,
    filePath,
    message: 'Replace an arbitrary spacing token.',
    line,
    column,
    fix: {
      kind: 'replace',
      description: "Replace 'p-[13px]' with 'p-3'",
      targetFile,
      oldValue: 'p-[13px]',
      newValue: 'p-3',
      binding: {
        kind: 'slopbrick-fix-binding-v1',
        ruleId,
        filePath,
        line,
        column,
        sourceSha256: sha256Text(bindingSource),
        targetSha256: sha256Text(readFileSync(targetFile, 'utf-8')),
      },
    },
  };
}

describe('automated fix finding binding', () => {
  it('rejects stale replacement evidence when the old source is gone', async () => {
      const dir = mkdtempSync(join(tmpdir(), 'slopbrick-fix-safety-test-'));
    try {
      const filePath = join(dir, 'Page.tsx');
      const original = 'export function Page() { return <div className="p-[13px]" />; }\n';
      writeFileSync(filePath, 'export function Page() { return <div className="p-[14px]" />; }\n');

      const [result] = await applyFixes(makeReport([issue(filePath, filePath, 1, original)]), makeConfig());

      expect(readFileSync(filePath, 'utf-8')).toContain('p-[14px]');
      expect(result?.applied).toHaveLength(0);
      expect(result?.skipped[0]).toMatchObject({ reason: 'stale-finding' });
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('rejects ambiguous replacement evidence instead of rewriting every match', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'slopbrick-fix-safety-test-'));
    try {
      const filePath = join(dir, 'Page.tsx');
      writeFileSync(
        filePath,
        'export function Page() { return <><div className="p-[13px]" /><div className="p-[13px]" /></>; }\n',
      );

      const [result] = await applyFixes(makeReport([issue(filePath, filePath)]), makeConfig());

      expect(readFileSync(filePath, 'utf-8')).toMatch(/p-\[13px\].*p-\[13px\]/);
      expect(result?.applied).toHaveLength(0);
      expect(result?.skipped[0]).toMatchObject({ reason: 'ambiguous-finding' });
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('rejects a fix whose target file is not the finding file', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'slopbrick-fix-safety-test-'));
    try {
      const findingFile = join(dir, 'Page.tsx');
      const targetFile = join(dir, 'Other.tsx');
      writeFileSync(findingFile, 'export function Page() { return <div />; }\n');
      writeFileSync(targetFile, 'export function Other() { return <div className="p-[13px]" />; }\n');

      const [result] = await applyFixes(makeReport([issue(findingFile, targetFile)]), makeConfig());

      expect(readFileSync(targetFile, 'utf-8')).toContain('p-[13px]');
      expect(result?.applied).toHaveLength(0);
      expect(result?.skipped[0]).toMatchObject({ reason: 'unbound-finding' });
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
