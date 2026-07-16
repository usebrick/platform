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
const sourcePath = resolve(packageRoot, 'src', 'index.ts');
const tsxPath = resolve(packageRoot, 'tests', 'helpers', 'tsx-runner.cjs');
const tempDirs: string[] = [];

interface PackageManifest {
  type: string;
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

interface CommandResult {
  exitCode: number;
  stdout: string;
  stderr: string;
}

function runCommand(command: string, args: string[]): Promise<CommandResult> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: packageRoot,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let stdout = '';
    let stderr = '';
    const timeout = setTimeout(() => child.kill(), 15_000);

    child.stdout.on('data', (chunk) => { stdout += chunk; });
    child.stderr.on('data', (chunk) => { stderr += chunk; });
    child.on('error', reject);
    child.on('close', (code) => {
      clearTimeout(timeout);
      resolve({ exitCode: code ?? -1, stdout, stderr });
    });
  });
}

function scanArgs(workspace: string): string[] {
  return ['scan', '--workspace', workspace, '--threads', '1', '--json', '--no-telemetry'];
}

function runPackagedScan(workspace: string): Promise<CommandResult> {
  return runCommand(process.execPath, [binPath, ...scanArgs(workspace)]);
}

function runSourceScan(workspace: string): Promise<CommandResult> {
  return runCommand(tsxPath, [sourcePath, ...scanArgs(workspace)]);
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

    expect(manifest.type).toBe('module');
    expect(manifest.main).toBe('./dist/index.cjs');
    expect(manifest.module).toBe('./dist/index.js');
    expect(entryPoint.import).toBe('./dist/index.js');
    expect(entryPoint.require).toBe('./dist/index.cjs');

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
    expect(existsSync(resolve(packageRoot, 'dist', 'engine', 'worker.cjs'))).toBe(true);

    const esm = await import(pathToFileURL(packageArtifact(entryPoint.import)).href);
    expect(esm).toHaveProperty('scanProject');

    const commonjs = createRequire(packagePath)(packageArtifact(entryPoint.require)) as Record<string, unknown>;
    expect(commonjs).toHaveProperty('scanProject');
  });

  it('keeps source and built help output in parity', async () => {
    const [source, built] = await Promise.all([
      runCommand(tsxPath, [sourcePath, '--help']),
      runCommand(process.execPath, [binPath, '--help']),
    ]);

    expect(source.exitCode, source.stderr).toBe(0);
    expect(built.exitCode, built.stderr).toBe(0);
    expect(source.stderr).toBe(built.stderr);
    expect(source.stdout).toBe(built.stdout);
  });

  it('scans a multi-file workspace through the source CLI worker', async () => {
    const workspace = createWorkspace();
    const { exitCode, stdout, stderr } = await runSourceScan(workspace);

    expect(exitCode, stderr).toBe(0);
    expect(stderr).not.toMatch(/worker.*(?:start|parse)|cannot find module/i);
    const report = JSON.parse(stdout);
    expect(report.fileCount).toBe(4);
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
