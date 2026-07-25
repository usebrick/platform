import { describe, expect, it } from 'vitest';

import { formatAdvice } from '../../src/report/advice';
import type { ProjectReport } from '../../src/types';

describe('repair advice', () => {
  it('marks an exact module-specifier repair as executable rather than legacy GIR work', () => {
    const report = {
      categoryScores: { arch: 1 },
      issues: [{
        ruleId: 'context/import-path-mismatch',
        category: 'arch',
        severity: 'medium',
        aiSpecific: false,
        filePath: '/workspace/src/Button.tsx',
        message: 'Import violates repository policy.',
        line: 1,
        column: 24,
        fix: {
          kind: 'module-specifier',
          description: 'Rewrite the exact repository-owned import.',
          targetFile: '/workspace/src/Button.tsx',
          oldValue: '@/legacy/Button',
          newValue: '@/components/ui/Button',
        },
      }],
    } as ProjectReport;

    const advice = formatAdvice(report);
    expect(advice).toContain('• /workspace/src/Button.tsx:1:24 — context/import-path-mismatch');
    expect(advice).not.toContain('[GIR]');
  });
});
