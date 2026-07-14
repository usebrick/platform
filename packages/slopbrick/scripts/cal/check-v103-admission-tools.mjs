#!/usr/bin/env node

/**
 * Task 0 bootstrap probes for the v10.3 admission program.
 *
 * This file intentionally remains a small, dependency-free JavaScript
 * executable.  It only probes local tool behavior and the SlopBrick build
 * target.  It does not import candidate bytes, create an authority receipt,
 * or contain a network client.
 */

import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, isAbsolute, relative, resolve, sep } from 'node:path';

export const NODE_API_FLOOR = 20;
export const EXPECTED_BUILD_TARGET = 'node18';
export const EXPECTED_PYTHON_VERSION = '3.14.4';
export const EXPECTED_PYARROW_VERSION = '25.0.0';
// No machine-specific corpus path is part of the bootstrap contract. A caller
// may provide reviewed roots explicitly, but every `--candidate-path` remains
// fail-closed even when no root was configured.
export const DEFAULT_CANDIDATE_BYTE_ROOTS = Object.freeze([]);

const MIN_COREPACK = Object.freeze({ major: 0, minor: 30, patch: 0 });
const MIN_PNPM = Object.freeze({ major: 9, minor: 0, patch: 0 });
const MIN_GIT = Object.freeze({ major: 2, minor: 30, patch: 0 });
const SCRIPT_DIRECTORY = dirname(fileURLToPath(import.meta.url));
const PACKAGE_ROOT = resolve(SCRIPT_DIRECTORY, '../..');
const REPOSITORY_ROOT = resolve(PACKAGE_ROOT, '../..');
const PYTHON_PROBE_CODE = 'import sys, pyarrow; print(f"{sys.version_info.major}.{sys.version_info.minor}.{sys.version_info.micro}"); print(pyarrow.__version__)';
const NODE_API_PROBE_CODE = [
  "const fs = require('node:fs');",
  "const fsp = require('node:fs/promises');",
  "if (typeof globalThis.structuredClone !== 'function' || typeof Array.prototype.findLast !== 'function') process.exit(21);",
  "const path = require('node:path');",
  "const os = require('node:os');",
  "const main = async () => { const dir = await fsp.mkdtemp(path.join(os.tmpdir(), 'slopbrick-v103-api-')); const handle = await fsp.open(dir, 'r'); await handle.sync(); await handle.close(); await fsp.rm(dir, { recursive: true, force: true }); if (typeof fs.statSync !== 'function') process.exit(22); console.log('ok'); };",
  'main().catch(() => process.exit(23));',
].join(' ');

/** @typedef {{ readonly status: number | null; readonly stdout: string; readonly stderr: string; readonly error?: string }} CommandResult */
/** @typedef {(command: string, args: readonly string[], options?: { readonly cwd?: string; readonly env?: NodeJS.ProcessEnv }) => CommandResult} CommandRunner */

/** @typedef {{ readonly status: 'pass' | 'fail' | 'diagnostic'; readonly detail: string; readonly authorityContribution: false; readonly version?: string; readonly executable?: string }} ProbeCheck */

/**
 * @typedef {{
 *   readonly kind: 'admission-tool-bootstrap-diagnostic';
 *   readonly schemaVersion: 'v10.3-admission-bootstrap-diagnostic-v1';
 *   readonly profileId: 'admission-core-contract-v1';
 *   readonly ready: boolean;
 *   readonly authorityEligible: false;
 *   readonly checks: Readonly<Record<string, ProbeCheck>>;
 *   readonly diagnosticOnly: readonly string[];
 *   readonly network: { readonly policy: 'denied'; readonly clientSurface: 'none' };
 *   readonly candidateBytes: { readonly accessed: false; readonly rejectedPaths: number };
 * }} BootstrapDiagnostic
 */

export function defaultCommandRunner(command, args, options = {}) {
  const result = spawnSync(command, [...args], {
    cwd: options.cwd,
    env: options.env,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
    shell: false,
  });
  return {
    status: result.status,
    stdout: typeof result.stdout === 'string' ? result.stdout : '',
    stderr: typeof result.stderr === 'string' ? result.stderr : '',
    ...(result.error ? { error: result.error.message } : {}),
  };
}

function parseVersion(text) {
  const match = String(text).match(/(?:^|[^0-9])([0-9]+)\.([0-9]+)(?:\.([0-9]+))?/u);
  if (!match) return undefined;
  return {
    major: Number(match[1]),
    minor: Number(match[2]),
    patch: Number(match[3] ?? 0),
    text: `${match[1]}.${match[2]}.${match[3] ?? '0'}`,
  };
}

function compareVersions(left, right) {
  for (const key of ['major', 'minor', 'patch']) {
    if (left[key] !== right[key]) return left[key] > right[key] ? 1 : -1;
  }
  return 0;
}

export function evaluateVersion(output, minimum) {
  const version = parseVersion(output);
  if (!version) return { ok: false, reason: 'version-missing' };
  if (compareVersions(version, minimum) < 0) {
    return { ok: false, reason: 'version-floor', version: version.text, minimum: `${minimum.major}.${minimum.minor}.${minimum.patch}` };
  }
  return { ok: true, version: version.text, major: version.major, minor: version.minor, patch: version.patch };
}

export function evaluateNodeVersion(versionOutput) {
  if (versionOutput === undefined || versionOutput === null || String(versionOutput).trim() === '') {
    return { ok: false, reason: 'missing-node' };
  }
  const version = parseVersion(versionOutput);
  if (!version) return { ok: false, reason: 'invalid-node-version' };
  if (version.major < NODE_API_FLOOR) {
    return { ok: false, reason: 'node-api-floor', version: version.text, minimumMajor: NODE_API_FLOOR };
  }
  return { ok: true, version: version.text, major: version.major, minor: version.minor, patch: version.patch };
}

export function evaluateNodeApiProbe(output) {
  if (String(output).trim() === 'ok') return { ok: true };
  return { ok: false, reason: 'node-api-probe', output: String(output).trim().slice(0, 160) };
}

export function evaluateBuildTarget(source) {
  const target = String(source).match(/\btarget\s*:\s*['"]([^'"]+)['"]/u)?.[1];
  if (target !== EXPECTED_BUILD_TARGET) {
    return { ok: false, reason: 'build-target', target, expected: EXPECTED_BUILD_TARGET };
  }
  return { ok: true, target };
}

function pathWithin(path, root) {
  const absolutePath = resolve(path);
  const absoluteRoot = resolve(root);
  const child = relative(absoluteRoot, absolutePath);
  return child === '' || (child !== '..' && !child.startsWith(`..${sep}`) && !isAbsolute(child));
}

/**
 * Reject paths before any filesystem operation can inspect them. Candidate
 * paths are caller-declared byte inputs, so absence of a configured root is
 * fail-closed rather than permission to read an arbitrary machine path.
 */
export function assertNoCandidateBytePaths(paths, roots = DEFAULT_CANDIDATE_BYTE_ROOTS) {
  for (const candidatePath of paths ?? []) {
    if (typeof candidatePath !== 'string' || candidatePath.length === 0) {
      throw new Error('candidate-byte path must be a non-empty string');
    }
    if (roots.length === 0 || roots.some((root) => pathWithin(candidatePath, root))) {
      throw new Error(`Refusing candidate-byte path: ${candidatePath}`);
    }
  }
}

/**
 * Keep the bootstrap process offline by construction.  The source scan is
 * intentionally import-line based so this function does not turn its own
 * diagnostic vocabulary into a false positive.
 */
export function assertNoNetworkClientSurface(source) {
  const text = String(source);
  const importPattern = /^\s*(?:import\s+.*?\s+from\s+|import\s*)['"]node:(?:http|https|net|tls|dns|dgram)(?:\/[^'"]*)?['"]/mu;
  const requirePattern = /\brequire\(\s*['"]node:(?:http|https|net|tls|dns|dgram)(?:\/[^'"]*)?['"]\s*\)/u;
  const callPattern = /^\s*(?:globalThis\.)?(?:fetch|XMLHttpRequest|WebSocket)\s*\(/mu;
  if (importPattern.test(text) || requirePattern.test(text) || callPattern.test(text)) {
    throw new Error('network client surface detected in admission bootstrap');
  }
}

function offlineEnvironment() {
  const env = { ...process.env, COREPACK_ENABLE_NETWORK: '0', npm_config_offline: 'true', PYTHONDONTWRITEBYTECODE: '1' };
  for (const name of ['HTTP_PROXY', 'HTTPS_PROXY', 'ALL_PROXY', 'http_proxy', 'https_proxy', 'all_proxy', 'NO_PROXY', 'no_proxy', 'GIT_ASKPASS', 'SSH_ASKPASS', 'GIT_CONFIG_GLOBAL', 'GIT_CONFIG_SYSTEM']) {
    delete env[name];
  }
  return env;
}

function commandDetail(result) {
  if (result.status === 0) return result.stdout.trim();
  const detail = result.error ?? (result.stderr.trim() || `exit ${String(result.status)}`);
  return detail.slice(0, 240);
}

function failedCheck(detail, executable) {
  return { status: 'fail', detail, authorityContribution: false, ...(executable ? { executable } : {}) };
}

function passedCheck(detail, version, executable) {
  return { status: 'pass', detail, authorityContribution: false, ...(version ? { version } : {}), ...(executable ? { executable } : {}) };
}

function diagnosticCheck(detail, executable) {
  return { status: 'diagnostic', detail, authorityContribution: false, ...(executable ? { executable } : {}) };
}

function parsePythonPyarrowOutput(output) {
  const lines = String(output).trim().split(/\r?\n/u).map((line) => line.trim()).filter(Boolean);
  return { python: lines[0], pyarrow: lines[1] };
}

function checkCommandVersion(runner, command, args, minimum, label, options) {
  const result = runner(command, args, options);
  const evaluated = result.status === 0 ? evaluateVersion(result.stdout, minimum) : { ok: false, reason: commandDetail(result) };
  if (!evaluated.ok) return failedCheck(`${label}: ${evaluated.reason}`, command);
  return passedCheck(`${label}: ${evaluated.version}`, evaluated.version, command);
}

/**
 * Run all Task 0 checks.  `runner`, version strings, and build source are
 * injectable so tests can exercise missing/wrong tools without touching the
 * host or the corpus.  No command is invoked with a candidate-byte path.
 */
export function runBootstrapProbes(options = {}) {
  const runner = options.runner ?? defaultCommandRunner;
  const packageRoot = options.packageRoot ?? PACKAGE_ROOT;
  const repoRoot = options.repoRoot ?? REPOSITORY_ROOT;
  const corepackCommand = options.corepackCommand ?? 'corepack';
  const gitCommand = options.gitCommand ?? '/usr/bin/git';
  // Keep the bootstrap portable: callers may pin a reviewed interpreter via
  // V103_ADMISSION_PYTHON, otherwise resolve the host's `python3`.  Never
  // guess a developer-specific corpus path here; that would turn a diagnostic
  // probe into an implicit machine dependency.
  const pythonCommand = options.pythonCommand ?? process.env.V103_ADMISSION_PYTHON ?? 'python3';
  assertNoCandidateBytePaths(options.candidatePaths ?? [], options.candidateByteRoots ?? DEFAULT_CANDIDATE_BYTE_ROOTS);

  const env = offlineEnvironment();
  const commandOptions = { cwd: repoRoot, env };
  const nodeVersion = evaluateNodeVersion(options.nodeVersion ?? process.version);
  const nodeApiOutput = options.nodeApiProbe ?? runner(process.execPath, ['-e', NODE_API_PROBE_CODE], commandOptions).stdout;
  const nodeApi = evaluateNodeApiProbe(nodeApiOutput);

  const checks = {
    node: nodeVersion.ok
      ? passedCheck(`Node ${nodeVersion.version}`, nodeVersion.version, process.execPath)
      : failedCheck(`Node: ${nodeVersion.reason}`, process.execPath),
    nodeApi: nodeApi.ok
      ? passedCheck('Node API behavioral probe: ok', undefined, process.execPath)
      : failedCheck(`Node API: ${nodeApi.reason}`, process.execPath),
    corepack: checkCommandVersion(runner, corepackCommand, ['--version'], MIN_COREPACK, 'Corepack', commandOptions),
    pnpm: checkCommandVersion(runner, corepackCommand, ['pnpm', '--version'], MIN_PNPM, 'Corepack pnpm', commandOptions),
    git: checkCommandVersion(runner, gitCommand, ['--version'], MIN_GIT, 'Git', commandOptions),
    gitReadOnlyBehavior: failedCheck('Git read-only behavior probe was not run', gitCommand),
    pythonPyarrow: failedCheck('Python/pyarrow probe was not run', pythonCommand),
    buildTarget: failedCheck('build target source was not inspected', undefined),
    du: diagnosticCheck('not probed', '/usr/bin/du'),
    jq: diagnosticCheck('not probed', '/usr/bin/jq'),
    shasum: diagnosticCheck('not probed', '/usr/bin/shasum'),
  };

  const gitBehavior = runner(gitCommand, ['-C', repoRoot, 'rev-parse', '--is-inside-work-tree'], commandOptions);
  checks.gitReadOnlyBehavior = gitBehavior.status === 0 && gitBehavior.stdout.trim() === 'true'
    ? passedCheck('Git rev-parse read-only behavior: true', undefined, gitCommand)
    : failedCheck(`Git read-only behavior: ${commandDetail(gitBehavior)}`, gitCommand);

  const pythonResult = runner(pythonCommand, ['-B', '-c', PYTHON_PROBE_CODE], commandOptions);
  const pythonVersions = parsePythonPyarrowOutput(pythonResult.stdout);
  checks.pythonPyarrow = pythonResult.status === 0 && pythonVersions.python === EXPECTED_PYTHON_VERSION && pythonVersions.pyarrow === EXPECTED_PYARROW_VERSION
    ? passedCheck(`Python ${pythonVersions.python}; pyarrow ${pythonVersions.pyarrow}`, `${pythonVersions.python}/${pythonVersions.pyarrow}`, pythonCommand)
    : failedCheck(`Python/pyarrow: expected ${EXPECTED_PYTHON_VERSION}/${EXPECTED_PYARROW_VERSION}, got ${pythonVersions.python ?? 'missing'}/${pythonVersions.pyarrow ?? 'missing'}`, pythonCommand);

  let buildSource;
  try {
    buildSource = options.buildTargetSource ?? readFileSync(resolve(packageRoot, 'tsup.config.ts'), 'utf8');
    const buildTarget = evaluateBuildTarget(buildSource);
    checks.buildTarget = buildTarget.ok
      ? passedCheck(`tsup target: ${buildTarget.target}`)
      : failedCheck(`tsup target: ${buildTarget.reason}`);
  } catch (error) {
    checks.buildTarget = failedCheck(`build target: ${error instanceof Error ? error.message : 'read failed'}`);
  }

  for (const [name, command, args] of [
    ['du', '/usr/bin/du', ['-k', packageRoot]],
    ['jq', '/usr/bin/jq', ['--version']],
    ['shasum', '/usr/bin/shasum', ['--version']],
  ]) {
    const result = runner(command, args, commandOptions);
    checks[name] = diagnosticCheck(result.status === 0 ? `${command}: ${commandDetail(result)}` : `${command}: unavailable (${commandDetail(result)})`, command);
  }

  return buildBootstrapDiagnostic({ checks, rejectedPaths: options.candidatePaths?.length ?? 0 });
}

/** @param {{ readonly checks?: Readonly<Record<string, ProbeCheck>>; readonly rejectedPaths?: number }} options */
export function buildBootstrapDiagnostic(options = {}) {
  const checks = options.checks ?? {};
  const diagnosticOnly = Object.keys(checks).filter((name) => checks[name]?.status === 'diagnostic').sort();
  const authoritativeChecks = Object.values(checks).filter((check) => check.status !== 'diagnostic');
  const ready = authoritativeChecks.length > 0 && authoritativeChecks.every((check) => check.status === 'pass');
  /** @type {BootstrapDiagnostic} */
  return {
    kind: 'admission-tool-bootstrap-diagnostic',
    schemaVersion: 'v10.3-admission-bootstrap-diagnostic-v1',
    profileId: 'admission-core-contract-v1',
    ready,
    authorityEligible: false,
    checks,
    diagnosticOnly,
    network: { policy: 'denied', clientSurface: 'none' },
    candidateBytes: { accessed: false, rejectedPaths: options.rejectedPaths ?? 0 },
  };
}

function parseCli(argv) {
  const values = { candidatePaths: [] };
  for (let index = 0; index < argv.length; index += 1) {
    const flag = argv[index];
    if (flag === '--json') continue;
    if (flag === '--candidate-path') {
      const value = argv[index + 1];
      if (!value) throw new Error('--candidate-path requires a value');
      values.candidatePaths.push(value);
      index += 1;
      continue;
    }
    const key = { '--python': 'pythonCommand', '--git': 'gitCommand', '--corepack': 'corepackCommand', '--package-root': 'packageRoot', '--repo-root': 'repoRoot' }[flag];
    if (!key) throw new Error(`Unknown option: ${flag}`);
    const value = argv[index + 1];
    if (!value || value.startsWith('--')) throw new Error(`${flag} requires a value`);
    values[key] = value;
    index += 1;
  }
  assertNoCandidateBytePaths(values.candidatePaths);
  return values;
}

export function main(argv = process.argv.slice(2)) {
  try {
    const diagnostic = runBootstrapProbes(parseCli(argv));
    process.stdout.write(`${JSON.stringify(diagnostic)}\n`);
    return diagnostic.ready ? 0 : 1;
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    return 2;
  }
}

const invokedPath = process.argv[1] ? resolve(process.argv[1]) : '';
if (invokedPath === fileURLToPath(import.meta.url)) process.exitCode = main();
