import { spawn } from 'node:child_process';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

const binPath = resolve(__dirname, '..', '..', 'bin', 'slopbrick.js');
const tempDirs: string[] = [];

function runPackagedScan(workspace: string): Promise<{
  exitCode: number;
  stdout: string;
  stderr: string;
}> {
  return new Promise((resolve, reject) => {
    const child = spawn(
      process.execPath,
      [binPath, 'scan', '--workspace', workspace, '--threads', '1', '--json', '--no-telemetry'],
      { stdio: ['ignore', 'pipe', 'pipe'] },
    );
    let stdout = '';
    let stderr = '';
    const timeout = setTimeout(() => child.kill(), 5_000);

    child.stdout.on('data', (chunk) => { stdout += chunk; });
    child.stderr.on('data', (chunk) => { stderr += chunk; });
    child.on('error', reject);
    child.on('close', (code) => {
      clearTimeout(timeout);
      resolve({ exitCode: code ?? -1, stdout, stderr });
    });
  });
}

function createWorkspace(): string {
  const workspace = mkdtempSync(join(tmpdir(), 'slopbrick-packaged-worker-'));
  tempDirs.push(workspace);
  const sourceDir = join(workspace, 'src');
  mkdirSync(sourceDir, { recursive: true });

  for (const name of ['alpha', 'bravo', 'charlie', 'delta']) {
    writeFileSync(
      join(sourceDir, `${name}.ts`),
      `export const ${name} = '${name}';\n`,
    );
  }

  return workspace;
}

afterEach(() => {
  for (const directory of tempDirs.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

describe('packaged default worker', () => {
  it('scans a multi-file workspace through the built CLI', async () => {
    const workspace = createWorkspace();
    const { exitCode, stdout, stderr } = await runPackagedScan(workspace);

    expect(exitCode).toBe(0);
    expect(stderr).not.toMatch(/worker.*(?:start|parse)|cannot find module/i);
    const report = JSON.parse(stdout);
    expect(report.fileCount).toBe(4);
  });
});
