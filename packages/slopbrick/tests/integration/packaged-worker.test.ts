import { spawn } from 'node:child_process';
import { existsSync, mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';

const binPath = resolve(__dirname, '..', '..', 'bin', 'slopbrick.js');
const packagePath = resolve(__dirname, '..', '..', 'package.json');
const packageRoot = resolve(__dirname, '..', '..');
const tempDirs: string[] = [];

interface PackageManifest {
  bin: { slopbrick: string };
  main: string;
  module: string;
  types: string;
  exports: {
    '.': {
      types: string;
      import: string;
      require: string;
    };
  };
}

function readPackageManifest(): PackageManifest {
  return JSON.parse(readFileSync(packagePath, 'utf8')) as PackageManifest;
}

function packageArtifact(path: string): string {
  return resolve(packageRoot, path);
}

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
  it('keeps declared artifacts, entry points, and the default worker resolvable', async () => {
    const manifest = readPackageManifest();
    const entryPoint = manifest.exports['.'];

    expect(manifest.main).toBe('./dist/index.js');
    expect(manifest.module).toBe('./dist/index.mjs');
    expect(entryPoint.import).toBe('./dist/index.mjs');
    expect(entryPoint.require).toBe('./dist/index.js');

    for (const artifact of [
      manifest.bin.slopbrick,
      manifest.main,
      manifest.module,
      manifest.types,
      entryPoint.types,
      entryPoint.import,
      entryPoint.require,
    ]) {
      expect(existsSync(packageArtifact(artifact)), `missing declared artifact: ${artifact}`).toBe(true);
    }

    expect(existsSync(resolve(packageRoot, 'dist', 'engine', 'worker.js'))).toBe(true);

    const esm = await import(pathToFileURL(packageArtifact(entryPoint.import)).href);
    expect(esm).toHaveProperty('scanProject');

    const commonjs = createRequire(packagePath)(packageArtifact(entryPoint.require)) as Record<string, unknown>;
    expect(commonjs).toHaveProperty('scanProject');
  });

  it('scans a multi-file workspace through the built CLI', async () => {
    const workspace = createWorkspace();
    const { exitCode, stdout, stderr } = await runPackagedScan(workspace);

    expect(exitCode).toBe(0);
    expect(stderr).not.toMatch(/worker.*(?:start|parse)|cannot find module/i);
    const report = JSON.parse(stdout);
    expect(report.fileCount).toBe(4);
  });
});
