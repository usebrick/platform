import { describe, expect, it } from 'vitest';

import { DEFAULT_CONFIG } from '../../src/config';
import { normalizeWatchResult } from '../../src/cli/watch';
import { getDefaultOffRules } from '../../src/rules/signal-strength';
import type { FileScanResult } from '../../src/types';

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
});
