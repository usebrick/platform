import { describe, expect, it } from 'vitest';
import { mkdtempSync, mkdirSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

import { loadConfig } from '../../src/config';
import { runScan } from '../../src/cli/scan';
import { handleToolCall } from '../../src/mcp/tools';
import { buildRuleCalibrationEvidence } from '../../src/rules/explanation';
import { getSignalStrength } from '../../src/rules/signal-strength';

function makeWorkspace(): string {
  const dir = mkdtempSync(join(tmpdir(), 'slopbrick-cli-mcp-parity-'));
  mkdirSync(join(dir, 'src'), { recursive: true });
  writeFileSync(
    join(dir, 'slopbrick.config.cjs'),
    [
      "module.exports = {",
      "  include: ['src/**/*.tsx'],",
      "  framework: 'react',",
      '  telemetry: false,',
      "  rules: {",
      "    'logic/math-console-log-storm': 'low',",
      "    'dup/near-duplicate': 'off',",
      "    'security/public-admin-route': 'off',",
      '  },',
      '};',
      '',
    ].join('\n'),
  );
  writeFileSync(
    join(dir, 'src', 'example.tsx'),
    [
      'export function Example() {',
      "  console.log('a');",
      "  console.log('b');",
      "  console.log('c');",
      "  console.log('d');",
      "  console.log('e');",
      '  return <div />;',
      '}',
      '',
    ].join('\n'),
  );
  return dir;
}

describe('CLI and MCP single-file scan parity', () => {
  it('uses the same workspace config and returns the same findings and composite score', async () => {
    const dir = makeWorkspace();
    try {
      const config = await loadConfig(dir);
      const cli = await runScan({ workspace: dir, quiet: true }, ['src/example.tsx']);
      const mcp = await handleToolCall(
        'slop_scan_file',
        { path: 'src/example.tsx' },
        { cwd: dir, rules: [], config },
      );

      expect(mcp.isError).toBeFalsy();
      const payload = JSON.parse(mcp.content[0]!.text) as {
        filePath: string;
        componentCount: number;
        parseError?: string;
        compositeScore?: unknown;
        issues: Array<Record<string, unknown>>;
      };
      const cliResult = cli.results.find((result) => result.filePath.endsWith('/src/example.tsx'))!;

      // The MCP boundary binds existing files to their realpath to close a
      // symlink TOCTOU race; the CLI retains the workspace's lexical path.
      // Compare canonical paths so this platform-specific spelling difference
      // cannot obscure a genuine finding/config divergence.
      expect(payload.filePath).toBe(realpathSync(cliResult.filePath));
      expect(payload.componentCount).toBe(cliResult.componentCount);
      expect(payload.parseError).toBe(cliResult.parseError);
      expect(payload.compositeScore).toEqual(cliResult.compositeScore);
      expect(payload.issues).toEqual(cliResult.issues.map((issue) => ({
        ruleId: issue.ruleId,
        category: issue.category,
        severity: issue.severity,
        aiSpecific: issue.aiSpecific,
        calibration: buildRuleCalibrationEvidence(getSignalStrength(issue.ruleId)),
        line: issue.line,
        column: issue.column,
        message: issue.message,
        advice: issue.advice,
        whyItFired: {
          summary: issue.message,
          location: { line: issue.line, column: issue.column },
          facts: issue.extras ?? null,
        },
      })));
      expect(payload.issues).toEqual(expect.arrayContaining([
        expect.objectContaining({ ruleId: 'logic/math-console-log-storm', severity: 'low' }),
      ]));
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
