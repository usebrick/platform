import { beforeEach, describe, expect, it, vi } from 'vitest';

const getCurrentEvidencePolicyAccessorsMock = vi.hoisted(() => vi.fn());

vi.mock('../../src/rules/current-evidence-policy-runtime', () => ({
  getCurrentEvidencePolicyAccessors: getCurrentEvidencePolicyAccessorsMock,
}));

import { DEFAULT_CONFIG } from '../../src/config';
import { bindExplicitRuleOverrides } from '../../src/config/rule-override-provenance';
import { runProjectRules } from '../../src/rules/project';
import type { FileScanResult, ResolvedConfig } from '../../src/types';

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
});
