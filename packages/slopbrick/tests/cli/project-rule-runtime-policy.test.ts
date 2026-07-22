import { beforeEach, describe, expect, it, vi } from 'vitest';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const getCurrentEvidencePolicyAccessorsMock = vi.hoisted(() => vi.fn());

vi.mock('../../src/rules/current-evidence-policy-runtime', () => ({
  getCurrentEvidencePolicyAccessors: getCurrentEvidencePolicyAccessorsMock,
}));

import { DEFAULT_CONFIG } from '../../src/config';
import { runScan } from '../../src/cli/scan';
import { bindExplicitRuleOverrides } from '../../src/config/rule-override-provenance';
import { runProjectRules } from '../../src/rules/project';
import type { FileScanResult, ResolvedConfig } from '../../src/types';
import { approvedCurrentPolicyFixture } from '../helpers/current-evidence-policy-v2';

const GAP_RULE_ID = 'layout/gap-monopoly';

function makeConfig(
  explicitRules: ResolvedConfig['rules'] | undefined,
): ResolvedConfig {
  return bindExplicitRuleOverrides({
    ...DEFAULT_CONFIG,
    rules: {
      ...DEFAULT_CONFIG.rules,
      ...explicitRules,
    },
  }, explicitRules);
}

function gapResults(): FileScanResult[] {
  return ['src/a.tsx', 'src/b.tsx'].map((filePath) => ({
    filePath,
    componentCount: 1,
    issues: [],
    gapValues: ['gap-4'],
    styleSources: [],
    elementTags: [],
    unmatchedStringLiterals: [],
  }));
}

describe('project-rule current-policy execution', () => {
  beforeEach(() => {
    getCurrentEvidencePolicyAccessorsMock.mockReset();
  });

  it('requires repository opt-in provenance instead of treating a merged default severity as opt-in', () => {
    const isRuleRunnable = vi.fn((ruleId: string, overrides: Readonly<Record<string, string>>) =>
      ruleId !== GAP_RULE_ID
      || (Object.hasOwn(overrides, ruleId) && overrides[ruleId] !== 'off'));
    getCurrentEvidencePolicyAccessorsMock.mockReturnValue({ isRuleRunnable });

    const inherited = makeConfig(undefined);
    expect(inherited.rules[GAP_RULE_ID]).toBe('medium');
    expect(runProjectRules(gapResults(), inherited)).not.toEqual(expect.arrayContaining([
      expect.objectContaining({ ruleId: GAP_RULE_ID }),
    ]));

    const explicit = makeConfig({ [GAP_RULE_ID]: 'medium' });
    expect(runProjectRules(gapResults(), explicit)).toEqual(expect.arrayContaining([
      expect.objectContaining({ ruleId: GAP_RULE_ID, severity: 'medium' }),
    ]));
  });

  it.each([
    ['--rule', { rule: 'component/giant-component' }],
    ['--include-rule', { includeRules: ['component/giant-component'] }],
  ] as const)('treats %s as an audit-only diagnostic opt-in while explicit off still wins', async (_flag, ruleOptions) => {
    getCurrentEvidencePolicyAccessorsMock.mockReturnValue(approvedCurrentPolicyFixture());
    const workspace = mkdtempSync(join(tmpdir(), 'slopbrick-diagnostic-opt-in-'));
    try {
      mkdirSync(join(workspace, 'src'));
      writeFileSync(join(workspace, 'src', 'Giant.tsx'), [
        'export function Giant() {',
        ...Array.from({ length: 205 }, (_, index) => `  const value${index} = ${index};`),
        '  return <div>{value0}</div>;',
        '}',
        '',
      ].join('\n'));

      const diagnostic = await runScan({
        workspace,
        quiet: true,
        telemetry: false,
        ...ruleOptions,
      });
      expect(diagnostic.report.issues).toEqual(expect.arrayContaining([
        expect.objectContaining({
          ruleId: 'component/giant-component',
          severity: 'off',
        }),
      ]));
      expect(diagnostic.report.aiSlopScore).toBe(0);
      expect(diagnostic.report.repositoryHealth).toBe(100);

      writeFileSync(
        join(workspace, 'slopbrick.config.mjs'),
        "export default { rules: { 'component/giant-component': 'off' } };\n",
      );
      const explicitlyOff = await runScan({
        workspace,
        quiet: true,
        telemetry: false,
        ...ruleOptions,
      });
      expect(explicitlyOff.report.issues).not.toEqual(expect.arrayContaining([
        expect.objectContaining({ ruleId: 'component/giant-component' }),
      ]));
    } finally {
      rmSync(workspace, { recursive: true, force: true });
    }
  });
});
