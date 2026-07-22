import { beforeEach, describe, expect, it, vi } from 'vitest';

const getCurrentEvidencePolicyAccessorsMock = vi.hoisted(() => vi.fn());

vi.mock('../../src/rules/current-evidence-policy-runtime', () => ({
  getCurrentEvidencePolicyAccessors: getCurrentEvidencePolicyAccessorsMock,
}));

import { projectSecurityIssuesByPolicy } from '../../src/cli/commands/security';
import { approvedCurrentPolicyFixture } from '../helpers/current-evidence-policy-v2';
import type { Issue } from '../../src/types';

beforeEach(() => {
  getCurrentEvidencePolicyAccessorsMock.mockReset();
  getCurrentEvidencePolicyAccessorsMock.mockReturnValue(approvedCurrentPolicyFixture());
});

function securityIssue(ruleId: string): Issue {
  return {
    ruleId,
    category: 'security',
    severity: 'high',
    aiSpecific: true,
    message: `${ruleId} fixture`,
    line: 1,
    column: 1,
  };
}

describe('security command policy authority', () => {
  it('keeps diagnostics visible while excluding them from risk and strict-gate inputs', () => {
    const projection = projectSecurityIssuesByPolicy([
      securityIssue('security/dangerous-cors'),
      securityIssue('security/eval'),
      { ...securityIssue('plugin/configured-off'), severity: 'off' as Issue['severity'] },
    ], {
      rules: {
        'security/dangerous-cors': 'high',
        'plugin/configured-off': 'off',
      },
    });

    expect(projection.visible.map(({ ruleId }) => ruleId)).toEqual([
      'security/dangerous-cors',
      'security/eval',
      'plugin/configured-off',
    ]);
    expect(projection.score.map(({ ruleId }) => ruleId)).toEqual(['security/eval']);
    expect(projection.gate.map(({ ruleId }) => ruleId)).toEqual(['security/eval']);
  });
});
