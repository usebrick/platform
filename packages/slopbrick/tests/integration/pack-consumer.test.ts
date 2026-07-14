import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { lstatSync, mkdtempSync, mkdirSync, readdirSync, readFileSync, renameSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { delimiter, dirname, join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { buildRawZipFixture } from '../helpers/zip-fixtures';

const PACKAGE_ROOT = join(__dirname, '..', '..');
const REPO_ROOT = join(PACKAGE_ROOT, '..', '..');

type BuilderIdentity = {
  readonly commitSha: string;
  readonly dirty: boolean;
  readonly statusSha256: string;
  readonly statusEntryCount: number;
};

type PackedArtifact = {
  readonly path: string;
  readonly sha256: string;
  readonly source: 'npm-pack' | 'external';
  readonly command: string;
  readonly packer: {
    readonly node: string;
    readonly npm: string;
    readonly pnpm: string;
  };
};

type Task6ModeInputs = {
  readonly externalTarballPath?: string;
  readonly pairAssertion: boolean;
  readonly receiptDirectoryExplicit: boolean;
  readonly expectedTarballSha256?: string;
  readonly expectedCommitSha?: string;
  readonly expectedDirty?: string;
  readonly expectedStatusSha256?: string;
};

type Task6ExpectedIdentity = {
  readonly tarballSha256: string;
  readonly commitSha: string;
  readonly dirty: boolean;
  readonly statusSha256?: string;
};

type PairReceipt = {
  readonly version: string;
  readonly tarballSha256: string;
  readonly runtimeNode: string;
  readonly result: string;
  readonly builder: BuilderIdentity;
  readonly builderAfterPack: BuilderIdentity;
};

const TASK6_TARBALL_SHA256 = /^[0-9a-f]{64}$/;
const TASK6_COMMIT_SHA256 = /^(?:[0-9a-f]{40}|workspace-uncommitted)$/;

function artifactCommand(source: PackedArtifact['source']): string {
  return source === 'external'
    ? 'prebuilt tarball supplied via SLOPBRICK_TASK6_TARBALL_PATH'
    : 'npm pack --offline --pack-destination <consumer-root>';
}

function validateTask6ModeInputs(inputs: Task6ModeInputs): void {
  const guardedMode = Boolean(inputs.externalTarballPath) || inputs.pairAssertion;
  if (!guardedMode) return;

  const missing: string[] = [];
  if (!inputs.expectedTarballSha256) missing.push('SLOPBRICK_TASK6_EXPECTED_TARBALL_SHA256');
  if (!inputs.expectedCommitSha) missing.push('SLOPBRICK_TASK6_EXPECTED_COMMIT_SHA');
  if (inputs.expectedDirty === undefined) missing.push('SLOPBRICK_TASK6_EXPECTED_DIRTY');
  if (missing.length > 0) {
    throw new Error(`Task 6 external/pair mode requires immutable expectations: ${missing.join(', ')}`);
  }
  if (!TASK6_TARBALL_SHA256.test(inputs.expectedTarballSha256!)) {
    throw new Error('SLOPBRICK_TASK6_EXPECTED_TARBALL_SHA256 must be lowercase 64-hex');
  }
  if (!TASK6_COMMIT_SHA256.test(inputs.expectedCommitSha!)) {
    throw new Error('SLOPBRICK_TASK6_EXPECTED_COMMIT_SHA must be a 40-hex commit or workspace-uncommitted');
  }
  if (inputs.expectedDirty !== 'true' && inputs.expectedDirty !== 'false') {
    throw new Error('SLOPBRICK_TASK6_EXPECTED_DIRTY must be exactly true or false');
  }
  if (inputs.expectedStatusSha256 !== undefined && !TASK6_TARBALL_SHA256.test(inputs.expectedStatusSha256)) {
    throw new Error('SLOPBRICK_TASK6_EXPECTED_STATUS_SHA256 must be lowercase 64-hex');
  }
  if (inputs.pairAssertion && !inputs.receiptDirectoryExplicit) {
    throw new Error('Task 6 pair mode requires an explicit SLOPBRICK_TASK6_RECEIPT_DIR');
  }
}

function task6ModeInputs(): Task6ModeInputs {
  const externalTarballPath = process.env.SLOPBRICK_TASK6_TARBALL_PATH?.trim() || undefined;
  return {
    externalTarballPath,
    pairAssertion: process.env.SLOPBRICK_TASK6_ASSERT_PAIR === '1',
    receiptDirectoryExplicit: Boolean(process.env.SLOPBRICK_TASK6_RECEIPT_DIR?.trim()),
    expectedTarballSha256: process.env.SLOPBRICK_TASK6_EXPECTED_TARBALL_SHA256?.trim() || undefined,
    expectedCommitSha: process.env.SLOPBRICK_TASK6_EXPECTED_COMMIT_SHA?.trim() || undefined,
    expectedDirty: process.env.SLOPBRICK_TASK6_EXPECTED_DIRTY?.trim(),
    expectedStatusSha256: process.env.SLOPBRICK_TASK6_EXPECTED_STATUS_SHA256?.trim() || undefined,
  };
}

function expectedTask6Identity(): Task6ExpectedIdentity | undefined {
  const inputs = task6ModeInputs();
  validateTask6ModeInputs(inputs);
  if (!inputs.externalTarballPath && !inputs.pairAssertion) return undefined;
  return {
    tarballSha256: inputs.expectedTarballSha256!,
    commitSha: inputs.expectedCommitSha!,
    dirty: inputs.expectedDirty === 'true',
    statusSha256: inputs.expectedStatusSha256,
  };
}

function assertBuilderIdentityStable(before: BuilderIdentity, after: BuilderIdentity): void {
  const changed = (Object.keys(before) as Array<keyof BuilderIdentity>)
    .filter((key) => before[key] !== after[key]);
  if (changed.length > 0) {
    throw new Error(`builder identity changed during packing: ${changed.join(', ')}`);
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function requiredString(value: unknown, field: string): string {
  if (typeof value !== 'string' || value.length === 0) throw new Error(`Task 6 receipt ${field} is required`);
  return value;
}

function parseBuilderIdentity(value: unknown, field: string): BuilderIdentity {
  if (!isRecord(value)) throw new Error(`Task 6 receipt ${field} is required`);
  const commitSha = requiredString(value.commitSha, `${field}.commitSha`);
  const statusSha256 = requiredString(value.statusSha256, `${field}.statusSha256`);
  if (!TASK6_COMMIT_SHA256.test(commitSha)) throw new Error(`Task 6 receipt ${field}.commitSha is malformed`);
  if (!TASK6_TARBALL_SHA256.test(statusSha256)) throw new Error(`Task 6 receipt ${field}.statusSha256 is malformed`);
  if (typeof value.dirty !== 'boolean') throw new Error(`Task 6 receipt ${field}.dirty is required`);
  if (!Number.isInteger(value.statusEntryCount) || (value.statusEntryCount as number) < 0) {
    throw new Error(`Task 6 receipt ${field}.statusEntryCount is required`);
  }
  return {
    commitSha,
    dirty: value.dirty,
    statusSha256,
    statusEntryCount: value.statusEntryCount as number,
  };
}

function parsePairReceipt(value: unknown, index: number): PairReceipt {
  if (!isRecord(value)) throw new Error(`Task 6 receipt ${index + 1} is not an object`);
  const runtime = value.runtime;
  if (!isRecord(runtime)) throw new Error(`Task 6 receipt ${index + 1}.runtime is required`);
  const runtimeNode = requiredString(runtime.node, `receipt ${index + 1}.runtime.node`);
  const tarballSha256 = requiredString(value.tarballSha256, `receipt ${index + 1}.tarballSha256`);
  if (!TASK6_TARBALL_SHA256.test(tarballSha256)) throw new Error(`Task 6 receipt ${index + 1}.tarballSha256 is malformed`);
  return {
    version: requiredString(value.version, `receipt ${index + 1}.version`),
    tarballSha256,
    runtimeNode,
    result: requiredString(value.result, `receipt ${index + 1}.result`),
    builder: parseBuilderIdentity(value.builder, `receipt ${index + 1}.builder`),
    builderAfterPack: parseBuilderIdentity(value.builderAfterPack, `receipt ${index + 1}.builderAfterPack`),
  };
}

function assertPairedReceipts(
  values: readonly unknown[],
  expected: Task6ExpectedIdentity,
): void {
  if (values.length !== 2) throw new Error(`Task 6 pair requires exactly two receipts, got ${values.length}`);
  const receipts = values.map(parsePairReceipt);
  const node22 = receipts.filter((receipt) => /^v?22\./.test(receipt.runtimeNode));
  const node24 = receipts.filter((receipt) => /^v?24\./.test(receipt.runtimeNode));
  if (node22.length !== 1 || node24.length !== 1) {
    throw new Error('Task 6 pair requires exactly one Node 22 and one Node 24 receipt');
  }
  for (const receipt of receipts) {
    if (receipt.version !== 'CalibrationPackedConsumerReceiptV1') throw new Error('Task 6 receipt version is unsupported');
    if (receipt.result !== 'pass') throw new Error('Task 6 pair receipt result must be pass');
    assertBuilderIdentityStable(receipt.builder, receipt.builderAfterPack);
    if (receipt.tarballSha256 !== expected.tarballSha256) throw new Error('Task 6 pair tarball identity does not match expected SHA');
    if (receipt.builder.commitSha !== expected.commitSha) throw new Error('Task 6 pair commit identity does not match expected SHA');
    if (receipt.builder.dirty !== expected.dirty) throw new Error('Task 6 pair dirty status does not match expected value');
    if (expected.statusSha256 !== undefined && receipt.builder.statusSha256 !== expected.statusSha256) {
      throw new Error('Task 6 pair status identity does not match expected SHA');
    }
  }
  const [first, second] = receipts;
  if (first.tarballSha256 !== second.tarballSha256) throw new Error('Task 6 pair tarball identities differ');
  if (first.builder.commitSha !== second.builder.commitSha || first.builder.dirty !== second.builder.dirty
    || first.builder.statusSha256 !== second.builder.statusSha256
    || first.builder.statusEntryCount !== second.builder.statusEntryCount) {
    throw new Error('Task 6 pair builder identity/status differs');
  }
}

function npmEnvironment(cache: string): NodeJS.ProcessEnv {
  const { NODE_PATH: _nodePath, ...environment } = process.env;
  return { ...environment, npm_config_cache: cache };
}

function builderIdentity(): BuilderIdentity {
  const revision = spawnSync('git', ['rev-parse', 'HEAD'], { cwd: REPO_ROOT, encoding: 'utf8' });
  const status = spawnSync('git', ['status', '--porcelain=v1', '--untracked-files=all'], { cwd: REPO_ROOT, encoding: 'utf8' });
  const statusBytes = Buffer.from(status.stdout ?? '', 'utf8');
  const statusText = statusBytes.toString('utf8');
  return {
    commitSha: revision.status === 0 && revision.stdout.trim().length > 0 ? revision.stdout.trim() : 'workspace-uncommitted',
    dirty: status.status !== 0 || status.stdout.trim().length > 0,
    statusSha256: createHash('sha256').update(statusBytes).digest('hex'),
    statusEntryCount: statusText.split('\n').filter((line) => line.length > 0).length,
  };
}

function commandVersion(command: string, args: readonly string[]): string {
  const result = spawnSync(command, args, {
    cwd: REPO_ROOT,
    encoding: 'utf8',
    env: { ...process.env, npm_config_offline: 'true' },
  });
  return result.status === 0 ? result.stdout.trim() : 'unknown';
}

function npmPackerNodeVersion(): string {
  const configured = process.env.SLOPBRICK_TASK6_PACKER_NODE;
  if (configured) return configured;
  // `npm pack` is a separate executable and can be backed by a different
  // Node installation than the Vitest process (as in the Node 22/24 matrix).
  // Ask npm which Node it would execute instead of inferring from a shim path.
  return commandVersion('npm', ['exec', '--offline', '--', 'node', '--version']);
}

function packerMetadata(): PackedArtifact['packer'] {
  return {
    node: npmPackerNodeVersion(),
    npm: process.env.SLOPBRICK_TASK6_PACKER_NPM ?? commandVersion('npm', ['--version']),
    pnpm: process.env.SLOPBRICK_TASK6_PACKER_PNPM ?? commandVersion('corepack', ['pnpm', '--version']),
  };
}

function packedArtifact(consumerRoot: string): PackedArtifact {
  const configuredPath = process.env.SLOPBRICK_TASK6_TARBALL_PATH?.trim();
  if (configuredPath) {
    validateTask6ModeInputs(task6ModeInputs());
    const path = resolve(configuredPath);
    expect(lstatSync(path).isFile()).toBe(true);
    return {
      path,
      sha256: createHash('sha256').update(readFileSync(path)).digest('hex'),
      source: 'external',
      command: artifactCommand('external'),
      packer: {
        node: process.env.SLOPBRICK_TASK6_PACKER_NODE ?? 'not-run',
        npm: process.env.SLOPBRICK_TASK6_PACKER_NPM ?? 'not-run',
        pnpm: process.env.SLOPBRICK_TASK6_PACKER_PNPM ?? 'not-run',
      },
    };
  }

  const packed = spawnSync('npm', ['pack', '--offline', '--pack-destination', consumerRoot], {
    cwd: PACKAGE_ROOT,
    encoding: 'utf8',
    env: npmEnvironment(join(consumerRoot, 'npm-cache')),
  });
  expect(packed.status).toBe(0);
  const tarballName = packed.stdout.match(/slopbrick-[^\s]+\.tgz/)?.[0];
  expect(tarballName).toBeTruthy();
  const path = join(consumerRoot, tarballName!);
  return {
    path,
    sha256: createHash('sha256').update(readFileSync(path)).digest('hex'),
    source: 'npm-pack',
    command: artifactCommand('npm-pack'),
    packer: packerMetadata(),
  };
}

function receiptDirectory(): string {
  return process.env.SLOPBRICK_TASK6_RECEIPT_DIR
    ?? join(PACKAGE_ROOT, '..', '..', '.superpowers', 'sdd', 'task-6-receipts');
}

function persistReceipt(receipt: Record<string, unknown>): void {
  const directory = receiptDirectory();
  mkdirSync(directory, { recursive: true });
  const runtime = (receipt.runtime as { readonly node: string }).node;
  const path = join(directory, `task-6-packed-consumer-node-${runtime.replaceAll('.', '-')}.json`);
  writeFileSync(path, `${JSON.stringify(receipt)}\n`);
  expect(JSON.parse(readFileSync(path, 'utf8'))).toEqual(receipt);
}

describe('published consumer contract', () => {
  it('runs on a supported Node.js LTS line', () => {
    const major = Number.parseInt(process.versions.node.split('.')[0] ?? '0', 10);
    expect([22, 24]).toContain(major);
  });

  it('ships self-contained declarations and export targets', () => {
    const pkg = JSON.parse(readFileSync(join(PACKAGE_ROOT, 'package.json'), 'utf8')) as {
      exports: { '.': { import: string; require: string; types: string } };
    };
    const declarations = readFileSync(join(PACKAGE_ROOT, pkg.exports['.'].types), 'utf8');

    // @usebrick/* are private workspace packages and cannot be installed by
    // npm consumers. The dts bundle must inline their public types.
    expect(declarations).not.toMatch(/\b(?:from|import)\s*(?:\(\s*)?['"]@usebrick\//);
    expect(readFileSync(join(PACKAGE_ROOT, pkg.exports['.'].import))).toBeTruthy();
    expect(readFileSync(join(PACKAGE_ROOT, pkg.exports['.'].require))).toBeTruthy();
  });

  it('npm pack contains every declared export target', () => {
    const cache = mkdtempSync(join(tmpdir(), 'slopbrick-npm-cache-'));
    try {
      const result = spawnSync('npm', ['pack', '--dry-run', '--json'], {
        cwd: PACKAGE_ROOT,
        encoding: 'utf8',
        env: npmEnvironment(cache),
      });
      expect(result.status).toBe(0);
      // npm includes the prepack guard's human-readable output before its JSON.
      const jsonStart = result.stdout.indexOf('[');
      expect(jsonStart).toBeGreaterThanOrEqual(0);
      const metadata = JSON.parse(result.stdout.slice(jsonStart)) as Array<{ files: Array<{ path: string }> }>;
      const files = new Set(metadata[0].files.map(({ path }) => path));
      expect(files.has('dist/index.js')).toBe(true);
      expect(files.has('dist/index.cjs')).toBe(true);
      expect(files.has('dist/index.d.ts')).toBe(true);
      expect(files.has('bin/slopbrick.js')).toBe(true);
    } finally {
      rmSync(cache, { recursive: true, force: true });
    }
  });

  it('runs the offline materialize/select/verify flow from packed bytes', () => {
    const consumerRoot = mkdtempSync(join(tmpdir(), 'slopbrick-pack-calibration-'));
    try {
      const builderBeforePack = builderIdentity();
      const artifact = packedArtifact(consumerRoot);
      const builderAfterPack = builderIdentity();
      assertBuilderIdentityStable(builderBeforePack, builderAfterPack);
      const tarballPath = artifact.path;
      const tarballSha256 = artifact.sha256;
      const expectedIdentity = expectedTask6Identity();
      if (expectedIdentity) {
        expect(tarballSha256).toBe(expectedIdentity.tarballSha256);
        expect(builderBeforePack.commitSha).toBe(expectedIdentity.commitSha);
        expect(builderBeforePack.dirty).toBe(expectedIdentity.dirty);
        if (expectedIdentity.statusSha256) expect(builderBeforePack.statusSha256).toBe(expectedIdentity.statusSha256);
      }
      const unpacked = join(consumerRoot, 'unpacked');
      // Keep the consumer project under a path containing whitespace. The
      // installed hook is a POSIX shell script; this catches accidental
      // unquoted path interpolation while still using the exact packed
      // artifact and package-manager-created node_modules tree.
      const project = join(consumerRoot, 'project with spaces');
      mkdirSync(unpacked);
      expect(spawnSync('tar', ['-xzf', tarballPath, '-C', unpacked], { encoding: 'utf8' }).status).toBe(0);
      const packageDirectory = join(unpacked, 'package');
      const packageJson = JSON.parse(readFileSync(join(packageDirectory, 'package.json'), 'utf8')) as {
        readonly name: string;
        readonly version: string;
        readonly bin: string | Record<string, string>;
        readonly scripts: Record<string, string>;
        readonly dependencies: Record<string, string>;
      };
      expect(packageJson.bin).toEqual({ slopbrick: 'bin/slopbrick.js' });
      expect(packageJson.scripts['cal:materialize']).toBe('node dist/calibration/v103/cli.cjs cal:materialize');
      expect(packageJson.dependencies.yauzl).toBeTruthy();
      const declarations = readFileSync(join(packageDirectory, 'dist', 'index.d.ts'), 'utf8');
      expect(declarations).not.toMatch(/\b(?:from|import)\s*(?:\(\s*)?['"]@usebrick\//);
      expect(declarations).toMatch(/RepositoryStructureInventory/);
      expect(declarations).toMatch(/RepositoryStructureConstitution/);
      expect(declarations).toMatch(/RepositoryStructureHealth/);
      expect(readFileSync(join(packageDirectory, 'dist', 'calibration', 'v103', 'cli.cjs'), 'utf8')).not.toContain('../../src/');

      // Install the packed tarball into an otherwise empty project with an
      // explicit content-addressed store. The default store is reused with an
      // explicit prefer-offline policy (or strict offline mode when the
      // caller pre-seeds every dependency). Hoisted linking leaves a real
      // consumer tree (no workspace package/dependency symlinks); the ZIP
      // input below is fully offline and preseeded.
      mkdirSync(project);
      writeFileSync(join(project, 'package.json'), JSON.stringify({ name: 'slopbrick-packed-consumer', private: true }));
      const pnpmStore = process.env.SLOPBRICK_TASK6_PNPM_STORE_DIR?.trim()
        ?? commandVersion('corepack', ['pnpm', 'store', 'path']);
      expect(pnpmStore).not.toBe('unknown');
      const npmCache = join(consumerRoot, 'npm-cache');
      const pnpmVersion = spawnSync('corepack', ['pnpm', '--version'], { cwd: project, encoding: 'utf8', env: npmEnvironment(npmCache) });
      expect(pnpmVersion.status).toBe(0);
      // An external tarball was packed before this consumer process. Preserve
      // its independently supplied packer provenance; only locally packed
      // artifacts derive pnpm from the pack command. The install runtime is
      // recorded separately in `stages.install.pnpmVersion`.
      const receiptPacker = artifact.source === 'external'
        ? artifact.packer
        : { ...artifact.packer, pnpm: pnpmVersion.stdout.trim() };
      // Dependencies are resolved with pnpm's explicit prefer-offline policy:
      // cached bytes are reused, while a first run may fetch a missing public
      // dependency. The packed artifact and all CLI calibration inputs remain
      // strictly offline; callers that preseed every dependency can opt into
      // `SLOPBRICK_TASK6_INSTALL_OFFLINE=1` for a fail-closed install.
      const installOffline = process.env.SLOPBRICK_TASK6_INSTALL_OFFLINE === '1';
      const install = spawnSync('corepack', [
        'pnpm', 'install', ...(installOffline ? ['--offline'] : ['--prefer-offline']),
        '--ignore-scripts', '--config.node-linker=hoisted', '--store-dir', pnpmStore, tarballPath,
      ], {
        cwd: project,
        encoding: 'utf8',
        env: npmEnvironment(npmCache),
        timeout: 120_000,
      });
      if (install.status !== 0) {
        persistReceipt({
          version: 'CalibrationPackedConsumerReceiptV1',
          tarballSha256,
          packer: receiptPacker,
          runtime: { node: process.version, platform: process.platform, arch: process.arch },
          package: { name: packageJson.name, version: packageJson.version },
          builder: builderBeforePack,
          builderAfterPack,
          commands: [artifact.command, `corepack pnpm install ${installOffline ? '--offline' : '--prefer-offline'} --ignore-scripts --config.node-linker=hoisted`],
          networkPolicy: { install: installOffline ? 'offline' : 'prefer-offline', cli: 'local-process-only' },
          stages: { install: {
            installer: 'pnpm',
            pnpmVersion: pnpmVersion.stdout.trim(),
            status: install.status,
            signal: install.signal,
            error: install.error?.code ?? null,
            stdout: install.stdout.trim().slice(-2000),
            stderr: install.stderr.trim().slice(-2000),
          } },
          result: 'blocked',
        });
      }
      expect(install.status).toBe(0);
      const installedPackage = join(project, 'node_modules', 'slopbrick');
      expect(lstatSync(installedPackage).isSymbolicLink()).toBe(false);
      expect(readdirSync(join(project, 'node_modules')).every((entry) => !lstatSync(join(project, 'node_modules', entry)).isSymbolicLink())).toBe(true);
      expect(spawnSync(process.execPath, ['-e', "require.resolve('yauzl')"], { cwd: project, encoding: 'utf8', env: npmEnvironment(npmCache) }).status).toBe(0);

      const esmProbe = spawnSync(process.execPath, ['--input-type=module', '-e', "const pkg = await import('slopbrick'); if (typeof pkg.VERSION !== 'string') process.exit(1);"], {
        cwd: project,
        encoding: 'utf8',
        env: npmEnvironment(npmCache),
      });
      expect(esmProbe.status, esmProbe.stderr).toBe(0);
      const cjsProbe = spawnSync(process.execPath, ['-e', "const pkg = require('slopbrick'); if (typeof pkg.VERSION !== 'string') process.exit(1);"], {
        cwd: project,
        encoding: 'utf8',
        env: npmEnvironment(npmCache),
      });
      expect(cjsProbe.status, cjsProbe.stderr).toBe(0);

      // Verify both package-manager entry points resolve the same installed
      // packed binary. `pnpm install` created the consumer tree above; the
      // generated hook uses the project-local binary directly. Neither probe may
      // download or substitute a registry version.
      const npxProbe = spawnSync('npx', ['--no-install', 'slopbrick', '--help'], {
        cwd: project,
        encoding: 'utf8',
        env: npmEnvironment(npmCache),
      });
      expect(npxProbe.status, `${npxProbe.stdout}\n${npxProbe.stderr}`).toBe(0);
      expect(npxProbe.stdout).toContain('Repository Coherence Scanner');
      const pnpmProbe = spawnSync('corepack', ['pnpm', 'exec', 'slopbrick', '--help'], {
        cwd: project,
        encoding: 'utf8',
        env: npmEnvironment(npmCache),
      });
      expect(pnpmProbe.status, `${pnpmProbe.stdout}\n${pnpmProbe.stderr}`).toBe(0);
      expect(pnpmProbe.stdout).toContain('Repository Coherence Scanner');

      // Install the actual hook from the packed binary, then exercise it via
      // a real git commit. The first commit deliberately removes the local
      // package to prove `--no-install` fails closed instead of fetching a
      // replacement. Restoring the exact package lets the same staged bytes
      // commit successfully through the hook.
      expect(spawnSync('git', ['init', '--quiet'], { cwd: project, encoding: 'utf8' }).status).toBe(0);
      expect(spawnSync('git', ['config', 'user.email', 'packed-hook@example.test'], { cwd: project, encoding: 'utf8' }).status).toBe(0);
      expect(spawnSync('git', ['config', 'user.name', 'Packed Hook'], { cwd: project, encoding: 'utf8' }).status).toBe(0);
      const installHook = spawnSync(process.execPath, [join(installedPackage, 'bin', 'slopbrick.js'), 'install'], {
        cwd: project,
        encoding: 'utf8',
        env: npmEnvironment(npmCache),
      });
      expect(installHook.status, installHook.stderr).toBe(0);
      const hookPath = join(project, '.git', 'hooks', 'pre-commit');
      expect(readFileSync(hookPath, 'utf8')).toContain('./node_modules/.bin/slopbrick --staged');

      // Keep the hook subprocess PATH deliberately free of the developer's
      // global `slopbrick` shim. A tiny private bin directory supplies only
      // node/npm/npx, so missing-local-binary behavior cannot accidentally
      // pass by falling through to a globally installed package.
      const hookTools = join(consumerRoot, 'hook-tools');
      mkdirSync(hookTools);
      const runtimeBin = dirname(process.execPath);
      for (const command of ['node', 'npm', 'npx']) {
        symlinkSync(join(runtimeBin, command), join(hookTools, command));
      }
      const hookEnv = {
        ...npmEnvironment(npmCache),
        npm_config_offline: 'true',
        PATH: [hookTools, '/usr/bin', '/bin', '/usr/sbin', '/sbin'].join(delimiter),
      };

      const hookFixture = join(project, 'hook fixture with spaces.ts');
      writeFileSync(hookFixture, 'export const packedHook = true;\n');
      expect(spawnSync('git', ['add', '--', hookFixture], { cwd: project, encoding: 'utf8' }).status).toBe(0);

      const nodeModules = join(project, 'node_modules');
      const nodeModulesBackup = join(project, 'node_modules-disabled');
      renameSync(nodeModules, nodeModulesBackup);
      const missingBinaryCommit = spawnSync('git', ['commit', '-m', 'missing packed binary'], {
        cwd: project,
        encoding: 'utf8',
        env: hookEnv,
      });
      expect(missingBinaryCommit.status, `${missingBinaryCommit.stdout}\n${missingBinaryCommit.stderr}\nhook=${readFileSync(hookPath, 'utf8')}`).not.toBe(0);
      expect(`${missingBinaryCommit.stdout}\n${missingBinaryCommit.stderr}`).toMatch(/slopbrick|install|not found/i);
      renameSync(nodeModulesBackup, nodeModules);

      const realCommit = spawnSync('git', ['commit', '-m', 'run packed pre-commit hook'], {
        cwd: project,
        encoding: 'utf8',
        env: hookEnv,
      });
      expect(realCommit.status, `${realCommit.stdout}\n${realCommit.stderr}`).toBe(0);
      expect(spawnSync('git', ['rev-parse', '--verify', 'HEAD'], { cwd: project, encoding: 'utf8' }).status).toBe(0);

      const source = 'export const release = true;\n';
      const zip = buildRawZipFixture({ entries: [
        { name: 'pkg/' },
        { name: 'pkg/src/' },
        { name: 'pkg/src/sample.ts', data: Buffer.from(source) },
      ] });
      const archiveSha256 = createHash('sha256').update(zip.bytes).digest('hex');
      const cache = join(project, 'cache');
      mkdirSync(cache, { mode: 0o700 });
      writeFileSync(join(cache, `${archiveSha256}.zip`), zip.bytes, { mode: 0o600 });
      const generatedAt = '2026-07-12T00:00:00Z';
      const commitSha = 'a'.repeat(40);
      const manifest = {
        version: 'v10.3', generatedAt, methodVersion: 'v10.3.1',
        leakageReview: { protocolVersion: 'leakage-v1', reviewedAt: generatedAt, reviewerIds: ['packed-fixture'], noCrossPolarityFamilyOrCluster: true },
        repositories: [{ repositoryId: 'release-repo', familyId: 'release-family', originUrl: 'https://example.test/release-repo', commitSha, acquiredAt: generatedAt, license: 'MIT', materialization: { kind: 'release_archive', assetUrl: 'https://example.test/releases/release.zip', assetSha256: archiveSha256, assetBytes: zip.bytes.byteLength, archiveFormat: 'zip', rootPrefix: 'pkg', extractionPolicy: 'safe-zip-v1' } }],
        files: [{ sourceId: `release-repo@${commitSha}+asset-${archiveSha256}:src/sample.ts`, repositoryId: 'release-repo', familyId: 'release-family', normalizedPath: 'src/sample.ts', contentSha256: createHash('sha256').update(source).digest('hex'), language: 'typescript', stratum: 'production', clusterId: 'release-cluster', label: 'verified_ai', tier: 'gold', split: 'test', evidence: { kind: 'manual_protocol', reference: 'https://example.test/evidence', protocolId: 'packed-fixture' } }],
      };
      const manifestPath = join(project, 'manifest.json');
      const invalidManifestPath = join(project, 'invalid-manifest.json');
      const checkoutMapPath = join(project, 'checkout-map.json');
      const runPath = join(project, 'run');
      writeFileSync(manifestPath, JSON.stringify(manifest));
      writeFileSync(invalidManifestPath, JSON.stringify({ version: 'v10.3', methodVersion: 'v10.3.0' }));
      const manifestSha256 = createHash('sha256').update(readFileSync(manifestPath)).digest('hex');
      const invalidManifestSha256 = createHash('sha256').update(readFileSync(invalidManifestPath)).digest('hex');
      const cli = join(installedPackage, 'dist', 'calibration', 'v103', 'cli.cjs');
      const runCli = (args: readonly string[]) => spawnSync(process.execPath, [cli, ...args], { cwd: project, encoding: 'utf8', env: npmEnvironment(join(consumerRoot, 'npm-cache')) });
      const validCorpus = runCli(['corpus:validate', '--manifest', manifestPath, '--expected-manifest-sha256', manifestSha256]);
      expect(validCorpus.status).toBe(0);
      expect(JSON.parse(validCorpus.stdout)).toMatchObject({ ok: true, stage: 'corpus:validate', repositories: 1, files: 1 });
      const invalidCorpus = runCli(['corpus:validate', '--manifest', invalidManifestPath, '--expected-manifest-sha256', invalidManifestSha256]);
      expect(invalidCorpus.status).toBe(2);
      expect(JSON.parse(invalidCorpus.stdout)).toMatchObject({ ok: false });
      const materialize = runCli(['cal:materialize', '--manifest', manifestPath, '--expected-manifest-sha256', manifestSha256, '--run-id', 'packed-run', '--cache', cache, '--out', checkoutMapPath]);
      expect(materialize.status).toBe(0);
      expect(JSON.parse(materialize.stdout)).toMatchObject({ ok: true, stage: 'materialize', repositories: 1, files: 1 });
      const select = runCli(['select', '--manifest', manifestPath, '--expected-manifest-sha256', manifestSha256, '--seed', 'packed-seed', '--out', runPath]);
      expect(select.status).toBe(0);
      const verify = runCli(['verify', '--run', runPath, '--stage', 'selection']);
      expect(verify.status).toBe(0);
      expect(readFileSync(join(runPath, 'corpus-manifest.json'), 'utf8')).not.toContain(project);
      expect(readFileSync(join(runPath, 'corpus-selection.jsonl'), 'utf8')).not.toContain(project);

      const receipt = {
        version: 'CalibrationPackedConsumerReceiptV1',
        tarballSha256,
        packer: receiptPacker,
        runtime: { node: process.version, platform: process.platform, arch: process.arch },
        package: { name: packageJson.name ?? 'slopbrick', version: packageJson.version ?? 'unknown' },
        builder: builderBeforePack,
        builderAfterPack,
        commands: [artifact.command, `corepack pnpm install ${installOffline ? '--offline' : '--prefer-offline'} --ignore-scripts --config.node-linker=hoisted`, 'node <installed-cli> corpus:validate(valid) (offline)', 'node <installed-cli> corpus:validate(invalid) (offline)', 'node <installed-cli> cal:materialize (offline)', 'node <installed-cli> select (offline)', 'node <installed-cli> verify (offline)'],
        networkPolicy: { install: installOffline ? 'offline' : 'prefer-offline', cli: 'local-process-only' },
        stages: {
          install: { installer: 'pnpm', pnpmVersion: pnpmVersion.stdout.trim(), status: install.status },
          exports: { esmImport: { status: esmProbe.status }, cjsRequire: { status: cjsProbe.status } },
          corpusValidateValid: { status: validCorpus.status },
          corpusValidateInvalid: { status: invalidCorpus.status },
          materialize: { status: materialize.status },
          select: { status: select.status },
          verify: { status: verify.status },
        },
        result: 'pass',
      };
      persistReceipt(receipt);
    } finally {
      rmSync(consumerRoot, { recursive: true, force: true });
    }
  });

  it('requires paired Node receipts to share immutable artifact identity', () => {
    // The second runtime in the matrix sets this flag after the first runtime
    // has persisted its receipt. A standalone package test intentionally has
    // no cross-process pair to compare.
    if (process.env.SLOPBRICK_TASK6_ASSERT_PAIR !== '1') return;

    const expected = expectedTask6Identity();
    if (!expected) throw new Error('Task 6 pair mode did not produce immutable expectations');

    const directory = receiptDirectory();
    const files = readdirSync(directory)
      .filter((file) => file.startsWith('task-6-packed-consumer-node-') && file.endsWith('.json'))
      .sort();
    if (files.length !== 2) throw new Error(`Task 6 pair requires exactly two receipt files, got ${files.length}`);
    const receipts = files.map((file) => JSON.parse(readFileSync(join(directory, file), 'utf8')) as unknown);
    assertPairedReceipts(receipts, expected);
  });
});

describe('Task 6 evidence contracts', () => {
  const identity: BuilderIdentity = {
    commitSha: 'a'.repeat(40),
    dirty: false,
    statusSha256: 'b'.repeat(64),
    statusEntryCount: 0,
  };

  it('rejects a builder identity that changes during packing', () => {
    expect(() => assertBuilderIdentityStable(identity, { ...identity, statusEntryCount: 1 })).toThrow(/changed during packing/);
  });

  it('requires immutable expectations for external and pair evidence', () => {
    expect(() => validateTask6ModeInputs({
      externalTarballPath: '/tmp/slopbrick.tgz',
      pairAssertion: false,
      receiptDirectoryExplicit: false,
    })).toThrow(/SLOPBRICK_TASK6_EXPECTED_TARBALL_SHA256/);

    expect(() => validateTask6ModeInputs({
      pairAssertion: true,
      receiptDirectoryExplicit: false,
      expectedTarballSha256: 'c'.repeat(64),
      expectedCommitSha: identity.commitSha,
      expectedDirty: 'false',
    })).toThrow(/explicit SLOPBRICK_TASK6_RECEIPT_DIR/);

    expect(() => validateTask6ModeInputs({
      externalTarballPath: '/tmp/slopbrick.tgz',
      pairAssertion: true,
      receiptDirectoryExplicit: true,
      expectedTarballSha256: 'c'.repeat(64),
      expectedCommitSha: identity.commitSha,
      expectedDirty: 'false',
    })).not.toThrow();
  });

  it('requires exactly one passing Node 22 and one passing Node 24 receipt with matching full identity', () => {
    const receipt = (node: string, overrides: Record<string, unknown> = {}) => ({
      version: 'CalibrationPackedConsumerReceiptV1',
      tarballSha256: 'c'.repeat(64),
      runtime: { node },
      builder: identity,
      builderAfterPack: identity,
      result: 'pass',
      ...overrides,
    });
    const expectations = {
      tarballSha256: 'c'.repeat(64),
      commitSha: identity.commitSha,
      dirty: false,
    };

    expect(() => assertPairedReceipts([receipt('v22.22.3'), receipt('v24.15.0')], expectations)).not.toThrow();
    expect(() => assertPairedReceipts([receipt('v22.22.3'), receipt('v22.22.4')], expectations)).toThrow(/exactly one Node 22 and one Node 24/);
    expect(() => assertPairedReceipts([receipt('v22.22.3'), receipt('v24.15.0', { result: 'blocked' })], expectations)).toThrow(/result must be pass/);
    expect(() => assertPairedReceipts([receipt('v22.22.3'), receipt('v24.15.0', { builderAfterPack: { ...identity, statusSha256: 'd'.repeat(64) } })], expectations)).toThrow(/builder identity changed/);
  });

  it('labels an external fixture command as external instead of npm pack', () => {
    expect(artifactCommand('external')).toBe('prebuilt tarball supplied via SLOPBRICK_TASK6_TARBALL_PATH');
    expect(artifactCommand('npm-pack')).toContain('npm pack --offline');
  });
});
