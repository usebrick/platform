import { beforeEach, describe, expect, it, vi } from 'vitest';

const getCurrentEvidencePolicyAccessorsMock = vi.hoisted(() => vi.fn());

vi.mock('../../src/rules/current-evidence-policy-runtime', () => ({
  getCurrentEvidencePolicyAccessors: getCurrentEvidencePolicyAccessorsMock,
}));

import { DEFAULT_CONFIG } from '../../src/config';
import { normalizeWatchResult } from '../../src/cli/watch';
import { getDefaultOffRules } from '../../src/rules/signal-strength';
import { approvedCurrentPolicyFixture } from '../helpers/current-evidence-policy-v2';
import type { FileScanResult } from '../../src/types';

beforeEach(() => {
  getCurrentEvidencePolicyAccessorsMock.mockReset();
  getCurrentEvidencePolicyAccessorsMock.mockReturnValue(undefined);
});

describe('watch result normalization', () => {
  it('retains default-off audit evidence while applying directive and score normalization', () => {
    const defaultOffRule = [...getDefaultOffRules()][0]!;
    const result = {
      filePath: '/workspace/src/a.ts',
      issues: [
        {
          ruleId: 'logic/math-console-log-storm',
          category: 'logic', severity: 'high', aiSpecific: false,
          message: 'disabled at this line', filePath: '/workspace/src/a.ts', line: 4, column: 1,
        },
        {
          ruleId: defaultOffRule,
          category: 'logic', severity: 'medium', aiSpecific: true,
          message: 'default-off audit evidence', filePath: '/workspace/src/a.ts', line: 8, column: 1,
        },
        {
          ruleId: 'logic/active-evidence',
          category: 'logic', severity: 'medium', aiSpecific: false,
          message: 'effective evidence', filePath: '/workspace/src/a.ts', line: 9, column: 1,
        },
      ],
      facts: { v2: { disabledRules: [{
        ruleId: 'logic/math-console-log-storm', scope: 'line', line: 4,
      }] } },
    } as unknown as FileScanResult;

    normalizeWatchResult(result, DEFAULT_CONFIG, {});

    expect(result.issues).toEqual([
      expect.objectContaining({ ruleId: defaultOffRule, severity: 'off' }),
      expect.objectContaining({ ruleId: 'logic/active-evidence', severity: 'medium' }),
    ]);
    expect(result.facts?.v2.disabledRules).toEqual([
      expect.objectContaining({ ruleId: 'logic/math-console-log-storm', line: 4 }),
    ]);
  });

  it('matches current-policy runnable authority while retaining denied findings for audit', () => {
    getCurrentEvidencePolicyAccessorsMock.mockReturnValue(approvedCurrentPolicyFixture());
    const result = {
      filePath: '/workspace/src/a.ts',
      issues: [
        {
          ruleId: 'logic/ghost-defensive',
          category: 'logic', severity: 'high', aiSpecific: true,
          message: 'blocked current-policy evidence', filePath: '/workspace/src/a.ts', line: 4, column: 1,
        },
        {
          ruleId: 'ai/any-density',
          category: 'logic', severity: 'low', aiSpecific: true,
          message: 'explicit diagnostic evidence', filePath: '/workspace/src/a.ts', line: 8, column: 1,
        },
      ],
    } as unknown as FileScanResult;
    const config = {
      ...DEFAULT_CONFIG,
      rules: {
        ...DEFAULT_CONFIG.rules,
        'logic/ghost-defensive': 'high' as const,
        'ai/any-density': 'low' as const,
      },
    };

    normalizeWatchResult(result, config, {});

    expect(result.issues).toEqual([
      expect.objectContaining({ ruleId: 'logic/ghost-defensive', severity: 'off' }),
      expect.objectContaining({ ruleId: 'ai/any-density', severity: 'low' }),
    ]);
  });
});
