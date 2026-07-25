import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  applyExactImportRewritePlan,
  planExactImportRewrites,
  rollbackExactImportRewrite,
} from '../../src/fix/import-rewrite';
import { applyFixes } from '../../src/fix';
import { sha256Text } from '../../src/fix/binding';
import { formatUnifiedDiff } from '../../src/report/unified-diff';
import type {
  Issue,
  IssueEvidencePosition,
  ProjectReport,
  ResolvedConfig,
} from '../../src/types';

function positionAt(source: string, offset: number): IssueEvidencePosition {
  const before = source.slice(0, offset);
  const previousNewline = source.lastIndexOf('\n', offset - 1);
  return {
    line: before.split('\n').length,
    column: offset - previousNewline,
  };
}

describe('exact import rewrite planner', () => {
  it('changes only the evidenced module span and rolls back byte-identically', () => {
    const workspace = mkdtempSync(join(tmpdir(), 'slopbrick-mend-rewrite-'));
    try {
      const filePath = join(workspace, 'Button.tsx');
      const originalBytes = Buffer.from(
        '\uFEFFconst migrationNote = "@/legacy/Button";\r\n'
          + "import { Button } from '@/legacy/Button';\r\n"
          + 'export const View = () => <Button />;\r\n',
        'utf8',
      );
      writeFileSync(filePath, originalBytes);
      const source = originalBytes.toString('utf8');
      const oldValue = '@/legacy/Button';
      const newValue = '@/components/ui/Button';
      const quotedOffset = source.indexOf(`'${oldValue}'`);
      const startOffset = quotedOffset + 1;
      const endOffset = startOffset + oldValue.length - 1;

      const planned = planExactImportRewrites(source, [{
        oldValue,
        newValue,
        location: {
          start: positionAt(source, startOffset),
          end: positionAt(source, endOffset),
        },
      }]);

      expect(planned.status).toBe('planned');
      if (planned.status !== 'planned') throw new Error(planned.reason);
      expect(planned.plan.after).toContain('const migrationNote = "@/legacy/Button";');
      expect(planned.plan.after).toContain("from '@/components/ui/Button'");
      expect(planned.plan.after).not.toContain("from '@/legacy/Button'");

      const applied = applyExactImportRewritePlan(filePath, planned.plan);
      expect(applied.status).toBe('applied');
      if (applied.status !== 'applied') throw new Error(applied.reason);
      expect(readFileSync(filePath)).toEqual(Buffer.from(planned.plan.after, 'utf8'));

      expect(rollbackExactImportRewrite(filePath, applied.receipt)).toEqual({
        status: 'rolled-back',
      });
      expect(readFileSync(filePath)).toEqual(originalBytes);
    } finally {
      rmSync(workspace, { recursive: true, force: true });
    }
  });

  it('rejects stale, invalid, overlapping, and unsupported evidence', () => {
    const source = "import { Button } from '@/legacy/Button';\n";
    const oldValue = '@/legacy/Button';
    const quotedOffset = source.indexOf(`'${oldValue}'`);
    const startOffset = quotedOffset + 1;
    const endOffset = startOffset + oldValue.length - 1;
    const input = {
      oldValue,
      newValue: '@/components/ui/Button',
      location: {
        start: positionAt(source, startOffset),
        end: positionAt(source, endOffset),
      },
    };

    expect(planExactImportRewrites(source, [{
      ...input,
      oldValue: '@/legacy/Other',
    }])).toEqual({ status: 'rejected', reason: 'stale-finding' });
    expect(planExactImportRewrites(source, [{
      ...input,
      location: {
        start: { line: 9, column: 1 },
        end: { line: 9, column: 2 },
      },
    }])).toEqual({ status: 'rejected', reason: 'invalid-evidence' });
    expect(planExactImportRewrites(source, [input, input])).toEqual({
      status: 'rejected',
      reason: 'ambiguous-finding',
    });
    expect(planExactImportRewrites(source, [{
      ...input,
      newValue: "@/components/ui/'Button",
    }])).toEqual({ status: 'rejected', reason: 'unsupported-source' });
    expect(planExactImportRewrites(source, [{
      ...input,
      newValue: oldValue,
    }])).toEqual({ status: 'rejected', reason: 'already-fixed' });
  });

  it('rejects a corrupted rollback receipt before mutating the repaired file', () => {
    const workspace = mkdtempSync(join(tmpdir(), 'slopbrick-mend-rollback-'));
    try {
      const filePath = join(workspace, 'Button.tsx');
      const source = "import { Button } from '@/legacy/Button';\n";
      writeFileSync(filePath, source, 'utf8');
      const oldValue = '@/legacy/Button';
      const startOffset = source.indexOf(`'${oldValue}'`) + 1;
      const endOffset = startOffset + oldValue.length - 1;
      const planned = planExactImportRewrites(source, [{
        oldValue,
        newValue: '@/components/ui/Button',
        location: {
          start: positionAt(source, startOffset),
          end: positionAt(source, endOffset),
        },
      }]);
      if (planned.status !== 'planned') throw new Error(planned.reason);
      const applied = applyExactImportRewritePlan(filePath, planned.plan);
      if (applied.status !== 'applied') throw new Error(applied.reason);
      const repairedBytes = readFileSync(filePath);

      const result = rollbackExactImportRewrite(filePath, {
        ...applied.receipt,
        originalBytes: Uint8Array.from(Buffer.from('corrupted receipt', 'utf8')),
      });

      expect(result).toEqual({ status: 'rejected', reason: 'receipt-mismatch' });
      expect(readFileSync(filePath)).toEqual(repairedBytes);
    } finally {
      rmSync(workspace, { recursive: true, force: true });
    }
  });

  it('previews and applies the same finding-bound import bytes, then rejects replay', async () => {
    const workspace = mkdtempSync(join(tmpdir(), 'slopbrick-mend-integration-'));
    try {
      const filePath = join(workspace, 'Button.tsx');
      const source = "import { Button } from '@/legacy/Button';\nexport const View = () => <Button />;\n";
      const expected = "import { Button } from '@/components/ui/Button';\nexport const View = () => <Button />;\n";
      writeFileSync(filePath, source, 'utf8');
      const oldValue = '@/legacy/Button';
      const newValue = '@/components/ui/Button';
      const startOffset = source.indexOf(`'${oldValue}'`) + 1;
      const endOffset = startOffset + oldValue.length - 1;
      const location = {
        start: positionAt(source, startOffset),
        end: positionAt(source, endOffset),
      };
      const issue: Issue = {
        ruleId: 'context/import-path-mismatch',
        category: 'arch',
        severity: 'medium',
        aiSpecific: false,
        filePath,
        message: 'Import violates repository policy.',
        line: 1,
        column: 1,
        evidence: {
          kind: 'matched-source-span',
          status: 'exact',
          snippet: oldValue,
          location,
          matched: {
            field: 'import-source',
            key: 'module-specifier',
            value: oldValue,
          },
          details: { policyField: 'allowedImports', allowedPrefixCount: 1 },
        },
        fix: {
          kind: 'module-specifier',
          description: `Rewrite import '${oldValue}' to '${newValue}'`,
          targetFile: filePath,
          oldValue,
          newValue,
          binding: {
            kind: 'slopbrick-fix-binding-v1',
            ruleId: 'context/import-path-mismatch',
            filePath,
            line: 1,
            column: 1,
            sourceSha256: sha256Text(source),
            targetSha256: sha256Text(source),
          },
        },
      };
      const report = { issues: [issue] } as ProjectReport;
      const config = {
        allowedImports: ['@/components/ui/'],
        mend: { importRewrites: { [oldValue]: newValue } },
      } as ResolvedConfig;

      const binding = issue.fix!.binding;
      delete issue.fix!.binding;
      expect(formatUnifiedDiff(report, workspace, config)).toBe('');
      issue.fix!.binding = binding;

      const preview = formatUnifiedDiff(report, workspace, config);
      expect(preview).toContain("-import { Button } from '@/legacy/Button';");
      expect(preview).toContain("+import { Button } from '@/components/ui/Button';");
      expect(readFileSync(filePath, 'utf8')).toBe(source);

      const [applied] = await applyFixes(report, config);
      expect(applied.applied).toHaveLength(1);
      expect(applied.skipped).toHaveLength(0);
      expect(readFileSync(filePath, 'utf8')).toBe(expected);

      const [replayed] = await applyFixes(report, config);
      expect(replayed.applied).toHaveLength(0);
      expect(replayed.skipped).toEqual([
        expect.objectContaining({ reason: 'stale-finding' }),
      ]);
      expect(readFileSync(filePath, 'utf8')).toBe(expected);
    } finally {
      rmSync(workspace, { recursive: true, force: true });
    }
  });
});
