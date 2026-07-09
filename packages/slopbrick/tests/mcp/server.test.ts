import { describe, expect, it } from 'vitest';
import { Readable, Writable } from 'node:stream';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

import { runMcpServer } from '../../src/mcp/server';

function tempWorkspace(): string {
  return mkdtempSync(join(tmpdir(), 'slopbrick-mcp-server-'));
}

function collectOutput(): { output: Writable; lines: () => Record<string, unknown>[] } {
  const chunks: string[] = [];
  const output = new Writable({
    write(chunk, _encoding, callback) {
      chunks.push(String(chunk));
      callback();
    },
  });
  return {
    output,
    lines: () => chunks.join('').trim().split('\n').filter(Boolean).map((line) => JSON.parse(line)),
  };
}

describe('MCP server configuration', () => {
  it('loads the workspace config once and applies its constitution to tool calls', async () => {
    const dir = tempWorkspace();
    try {
      mkdirSync(join(dir, 'src'), { recursive: true });
      writeFileSync(join(dir, 'src', 'example.ts'), "import { createStore } from 'redux';\n");
      writeFileSync(
        join(dir, 'slopbrick.config.cjs'),
        "module.exports = { include: ['src/**/*.ts'], constitution: { stateManagement: ['zustand'] } };\n",
      );
      const { output, lines } = collectOutput();
      const input = Readable.from([
        JSON.stringify({
          jsonrpc: '2.0',
          id: 1,
          method: 'tools/call',
          params: { name: 'slop_check_constitution', arguments: { path: 'src/example.ts' } },
        }) + '\n',
      ]);

      await runMcpServer(input, output, dir);

      const result = lines()[0] as { result: { content: Array<{ text: string }> } };
      const payload = JSON.parse(result.result.content[0]!.text) as {
        violationCount: number;
        conventionSource: string;
      };
      expect(payload.violationCount).toBe(1);
      expect(payload.conventionSource).toBe('declared-or-detected');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('propagates invalid workspace configuration instead of serving default-config results', async () => {
    const dir = tempWorkspace();
    try {
      writeFileSync(join(dir, 'slopbrick.config.cjs'), "module.exports = { thresholds: { meanSlop: 'invalid' } };\n");
      const output = new Writable({ write(_chunk, _encoding, callback) { callback(); } });
      await expect(
        runMcpServer(Readable.from([]), output, dir),
      ).rejects.toThrow(/slopbrick\.config\.cjs|thresholds|meanSlop/i);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
