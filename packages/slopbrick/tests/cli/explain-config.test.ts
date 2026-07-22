import { afterEach, describe, expect, it, vi } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Command } from 'commander';

import { registerExplain } from '../../src/cli/commands/explain';
import { setLoggerQuiet } from '../../src/engine/logger';

afterEach(() => {
  vi.restoreAllMocks();
});

describe('real CLI explain configuration', () => {
  it('loads the selected repository config before describing an explicit rule override', async () => {
    const workspace = mkdtempSync(join(tmpdir(), 'slopbrick-explain-config-'));
    try {
      writeFileSync(
        join(workspace, 'slopbrick.config.mjs'),
        "export default { rules: { 'component/giant-component': 'off' } };\n",
      );
      const output: string[] = [];
      vi.spyOn(console, 'log').mockImplementation((message) => {
        output.push(String(message));
      });
      setLoggerQuiet(false);

      const program = new Command()
        .name('slopbrick')
        .option('--workspace <path>', 'workspace/project path', process.cwd())
        .exitOverride();
      registerExplain(program);
      await program.parseAsync([
        'node',
        'slopbrick',
        '--workspace',
        workspace,
        'explain',
        'component/giant-component',
      ]);

      expect(output.join('\n')).toContain(
        'Rule status: configured-off (configuration and current-policy projection)',
      );
    } finally {
      rmSync(workspace, { recursive: true, force: true });
    }
  });
});
