#!/usr/bin/env node

/*
 * Task 9B packed-runtime gate.
 *
 * This command intentionally does not build the package, change package
 * metadata, or create a manifest. Step 3 builds and freezes the exact
 * implementation commit first; this script then packs once and runs the
 * existing consumer contract serially under Node 22 and Node 24. The legacy
 * consumer receipt is treated as diagnostic input only. The two canonical
 * receipts written here use the Core v10.3 contract and contain no temporary
 * paths, host logs, or timestamps.
 */

import { createHash } from 'node:crypto';
import { existsSync, lstatSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { gunzipSync } from 'node:zlib';
import { spawnSync } from 'node:child_process';

import {
  calibrationAdmissionCanonicalJson,
  calibrationAdmissionSha256,
  calibrationPackedRuntimeReceiptSha256,
  isCalibrationPackedRuntimeReceiptV1,
} from '@usebrick/core';

const PACKAGE_VERSION = '0.45.0';
const BUILDER_MEMBER = 'package/dist/calibration/v103/admission.cjs';
const SHA256 = /^[a-f0-9]{64}$/u;
const COMMIT = /^[a-f0-9]{40}$/u;
const REVIEWER = /^[a-z0-9][a-z0-9._:-]{0,127}$/u;
const here = dirname(new URL(import.meta.url).pathname);
const packageRoot = resolve(here, '..');
const repoRoot = resolve(packageRoot, '..', '..');

function fail(message) {
  throw new Error(`packed-runtime matrix: ${message}`);
}

function usage() {
  console.error(`Usage: node scripts/test-packed-runtime-matrix.mjs \\
  --expected-commit-sha <40-hex> \\
  --manifest-builder-behavior-sha256 <64-hex> \\
  --output-dir <directory> \\
  --reviewer-id <id> --reviewer-id <id> \\
  [--tarball <path>] [--builder-member ${BUILDER_MEMBER}] [--diagnostic-only]`);
}

function parseArgs(argv) {
  const values = { reviewers: [], builderMember: BUILDER_MEMBER, diagnosticOnly: false };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--') continue;
    if (arg === '--diagnostic-only') {
      values.diagnosticOnly = true;
      continue;
    }
    if (arg === '--help' || arg === '-h') {
      usage();
      process.exit(0);
    }
    const next = argv[index + 1];
    if (arg === '--expected-commit-sha') values.expectedCommitSha = next;
    else if (arg === '--manifest-builder-behavior-sha256') values.behaviorSha256 = next;
    else if (arg === '--output-dir') values.outputDir = next;
    else if (arg === '--tarball') values.tarball = next;
    else if (arg === '--builder-member') values.builderMember = next;
    else if (arg === '--reviewer-id') values.reviewers.push(next);
    else fail(`unknown argument ${arg}`);
    if (arg.startsWith('--')) index += 1;
    if (next === undefined || next.startsWith('--')) fail(`${arg} requires a value`);
  }
  if (!COMMIT.test(values.expectedCommitSha ?? '')) fail('--expected-commit-sha must be a lowercase 40-hex commit');
  if (!SHA256.test(values.behaviorSha256 ?? '')) fail('--manifest-builder-behavior-sha256 must be lowercase 64-hex');
  if (!values.diagnosticOnly) {
    if (typeof values.outputDir !== 'string' || values.outputDir.length === 0) fail('--output-dir is required');
    if (values.reviewers.length !== 2 || !values.reviewers.every((value) => REVIEWER.test(value))
      || values.reviewers[0] >= values.reviewers[1]) {
      fail('--reviewer-id must be supplied twice as two distinct, sorted lowercase IDs');
    }
  }
  if (typeof values.builderMember !== 'string' || !values.builderMember.startsWith('package/')) fail('--builder-member must be a package-relative tar member');
  return values;
}

function sha256(bytes) {
  return createHash('sha256').update(bytes).digest('hex');
}

function canonicalSha(value) {
  return calibrationAdmissionSha256(value);
}

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: options.cwd ?? repoRoot,
    encoding: 'utf8',
    env: options.env ?? process.env,
    timeout: options.timeout ?? 180_000,
    maxBuffer: 8 * 1024 * 1024,
  });
  if (result.error) fail(`${command} ${args.join(' ')} failed: ${result.error.message}`);
  if (result.status !== 0) {
    const detail = `${result.stdout ?? ''}\n${result.stderr ?? ''}`.trim().slice(-4000);
    fail(`${command} ${args.join(' ')} exited ${result.status ?? 'unknown'}${detail ? `\n${detail}` : ''}`);
  }
  return result;
}

function runtimeNodePath(major) {
  const configured = process.env[`SLOPBRICK_NODE_${major}`]?.trim();
  if (configured) {
    if (!existsSync(configured) || !lstatSync(configured).isFile()) fail(`SLOPBRICK_NODE_${major} is not a regular executable`);
    return { command: configured, prefix: [], env: process.env };
  }
  if (!existsSync('/Users/cheng/.local/bin/mise')) {
    fail(`Node ${major} is not configured; set SLOPBRICK_NODE_${major} to an absolute node binary`);
  }
  return { command: 'mise', prefix: ['exec', `node@${major}`, '--', 'node'], env: process.env };
}

function runRuntime(major, args, options = {}) {
  const runtime = runtimeNodePath(major);
  const env = {
    ...runtime.env,
    ...(options.env ?? {}),
    NODE_OPTIONS: `${runtime.env.NODE_OPTIONS ?? ''} --max-old-space-size=2048`.trim(),
  };
  return run(runtime.command, [...runtime.prefix, ...args], { ...options, env });
}

function runRuntimeTool(major, tool, args, options = {}) {
  const configured = process.env[`SLOPBRICK_NODE_${major}`]?.trim();
  if (configured && tool === 'node') return runRuntime(major, args, options);
  const runtime = runtimeNodePath(major);
  const env = {
    ...runtime.env,
    ...(options.env ?? {}),
    NODE_OPTIONS: `${runtime.env.NODE_OPTIONS ?? ''} --max-old-space-size=2048`.trim(),
  };
  if (configured) env.PATH = `${dirname(configured)}:${env.PATH ?? ''}`;
  if (runtime.command === 'mise') return run(runtime.command, ['exec', `node@${major}`, '--', tool, ...args], { ...options, env });
  return run(tool, args, { ...options, env });
}

function gitStatus() {
  return run('git', ['status', '--porcelain=v1', '--untracked-files=all'], { timeout: 30_000 }).stdout;
}

function assertScopedCheckout(expectedCommitSha) {
  const head = run('git', ['rev-parse', 'HEAD'], { timeout: 30_000 }).stdout.trim();
  if (head !== expectedCommitSha) fail(`HEAD ${head} does not match expected implementation commit ${expectedCommitSha}`);
  const scoped = run('git', ['status', '--porcelain=v1', '--untracked-files=all', '--', 'packages/core', 'packages/slopbrick'], { timeout: 30_000 }).stdout;
  if (scoped.length > 0) fail('Core/SlopBrick paths are dirty; freeze and commit them before emitting receipts');
}

function tarEntries(gzipBytes) {
  let tarBytes;
  try { tarBytes = gunzipSync(gzipBytes); } catch { fail('package tarball is not a valid gzip stream'); }
  const entries = [];
  for (let offset = 0; offset + 512 <= tarBytes.length;) {
    const header = tarBytes.subarray(offset, offset + 512);
    const name = header.subarray(0, 100).toString('utf8').replace(/\0.*$/u, '');
    if (name.length === 0) break;
    const prefix = header.subarray(345, 500).toString('utf8').replace(/\0.*$/u, '');
    const path = prefix.length > 0 ? `${prefix}/${name}` : name;
    const sizeText = header.subarray(124, 136).toString('ascii').replace(/\0.*$/u, '').trim();
    const size = Number.parseInt(sizeText || '0', 8);
    if (!Number.isSafeInteger(size) || size < 0) fail(`package tar member ${path} has an invalid size`);
    const bodyStart = offset + 512;
    const bodyEnd = bodyStart + size;
    if (bodyEnd > tarBytes.length) fail(`package tar member ${path} is truncated`);
    const type = header.subarray(156, 157).toString('ascii') || '0';
    entries.push({ path, type, bytes: Buffer.from(tarBytes.subarray(bodyStart, bodyEnd)) });
    offset = bodyStart + Math.ceil(size / 512) * 512;
  }
  return entries;
}

function uniqueTarMember(entries, memberPath) {
  const matches = entries.filter((entry) => entry.path === memberPath);
  if (matches.length !== 1 || (matches[0].type !== '0' && matches[0].type !== '')) fail(`expected exactly one regular tar member ${memberPath}`);
  return matches[0].bytes;
}

function packOnce() {
  const root = mkdtempSync(join(tmpdir(), 'slopbrick-packed-runtime-pack-'));
  const result = run('npm', ['pack', '--offline', '--pack-destination', root, '--json'], {
    cwd: packageRoot,
    timeout: 180_000,
    env: { ...process.env, npm_config_cache: join(root, 'npm-cache'), npm_config_offline: 'true' },
  });
  const jsonStart = result.stdout.indexOf('[');
  if (jsonStart < 0) fail('npm pack did not emit JSON metadata');
  let metadata;
  try { metadata = JSON.parse(result.stdout.slice(jsonStart)); } catch { fail('npm pack JSON metadata is invalid'); }
  const filename = metadata?.[0]?.filename;
  if (typeof filename !== 'string') fail('npm pack did not return a tarball filename');
  return { root, path: join(root, filename), owned: true };
}

function loadTarball(input) {
  const packed = input.tarball ? { root: undefined, path: resolve(input.tarball), owned: false } : packOnce();
  if (!existsSync(packed.path) || !lstatSync(packed.path).isFile()) fail(`tarball does not exist: ${packed.path}`);
  const bytes = readFileSync(packed.path);
  const entries = tarEntries(bytes);
  const packageJson = JSON.parse(uniqueTarMember(entries, 'package/package.json').toString('utf8'));
  if (packageJson.name !== 'slopbrick' || packageJson.version !== PACKAGE_VERSION) {
    fail(`packed package must be slopbrick@${PACKAGE_VERSION}, got ${packageJson.name}@${packageJson.version}`);
  }
  const behavior = uniqueTarMember(entries, input.builderMember);
  const behaviorSha256 = sha256(behavior);
  if (behaviorSha256 !== input.behaviorSha256) fail(`packed builder member SHA ${behaviorSha256} does not match expected ${input.behaviorSha256}`);
  return { ...packed, bytes, entries, packageJson, tarballSha256: sha256(bytes), behaviorSha256 };
}

function pnpmStorePath() {
  const result = run('corepack', ['pnpm', 'store', 'path'], { timeout: 30_000 });
  const store = result.stdout.trim();
  if (store.length === 0 || !existsSync(store)) fail(`pnpm store is unavailable: ${store}`);
  return store;
}

function receiptFile(receiptDir) {
  const files = readdirSync(receiptDir).filter((file) => file.startsWith('task-6-packed-consumer-node-') && file.endsWith('.json'));
  if (files.length !== 1) fail(`consumer test emitted ${files.length} legacy receipts, expected one`);
  return JSON.parse(readFileSync(join(receiptDir, files[0]), 'utf8'));
}

function runConsumer(major, artifact, expectedCommitSha, store) {
  const root = mkdtempSync(join(tmpdir(), `slopbrick-packed-consumer-node-${major}-`));
  const receiptDir = join(root, 'legacy-receipt');
  mkdirSync(receiptDir, { recursive: true });
  const status = gitStatus();
  const env = {
    ...process.env,
    CI: '1',
    npm_config_offline: 'true',
    SLOPBRICK_VITEST_WORKERS: '1',
    SLOPBRICK_TASK6_TARBALL_PATH: artifact.path,
    SLOPBRICK_TASK6_INSTALL_OFFLINE: '1',
    SLOPBRICK_TASK6_PNPM_STORE_DIR: store,
    SLOPBRICK_TASK6_RECEIPT_DIR: receiptDir,
    SLOPBRICK_TASK6_EXPECTED_TARBALL_SHA256: artifact.tarballSha256,
    SLOPBRICK_TASK6_EXPECTED_COMMIT_SHA: expectedCommitSha,
    SLOPBRICK_TASK6_EXPECTED_DIRTY: String(status.length > 0),
    SLOPBRICK_TASK6_EXPECTED_STATUS_SHA256: sha256(Buffer.from(status, 'utf8')),
  };
  try {
    runRuntimeTool(major, 'corepack', [
      'pnpm', '--filter', 'slopbrick', 'exec', 'vitest', 'run',
      'tests/integration/pack-consumer.test.ts',
      '--maxWorkers=1', '--minWorkers=1', '--no-file-parallelism',
    ], { cwd: repoRoot, env, timeout: 600_000 });
    const legacy = receiptFile(receiptDir);
    if (legacy.result !== 'pass' || legacy.tarballSha256 !== artifact.tarballSha256
      || legacy.package?.version !== PACKAGE_VERSION || legacy.builder?.commitSha !== expectedCommitSha) {
      fail(`Node ${major} consumer receipt is not a passing identity-bound result`);
    }
    return { legacy, diagnostic: { node: legacy.runtime?.node ?? `v${major}`, platform: legacy.runtime?.platform ?? 'unknown' } };
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

function outputProjection(major, artifact, result) {
  const stages = result.legacy.stages ?? {};
  const status = (value) => (value && typeof value.status === 'number' ? value.status : null);
  return {
    version: 'v10.3-packed-runtime-output-v1',
    nodeMajor: major,
    package: { name: result.legacy.package?.name ?? 'slopbrick', version: result.legacy.package?.version ?? PACKAGE_VERSION },
    tarballSha256: artifact.tarballSha256,
    result: result.legacy.result,
    stages: {
      install: status(stages.install),
      esmImport: status(stages.exports?.esmImport),
      cjsRequire: status(stages.exports?.cjsRequire),
      corpusValidateValid: status(stages.corpusValidateValid),
      corpusValidateInvalid: status(stages.corpusValidateInvalid),
      materialize: status(stages.materialize),
      select: status(stages.select),
      verify: status(stages.verify),
    },
  };
}

function receiptFor(major, artifact, result, expectedCommitSha, reviewers, builderMember) {
  const output = outputProjection(major, artifact, result);
  const installProjection = {
    version: 'v10.3-packed-runtime-install-command-v1',
    packageManager: 'pnpm',
    mode: 'offline',
    nodeMajor: major,
    linker: 'hoisted',
    artifact: 'content-addressed-package-tarball',
  };
  const verificationProjection = {
    version: 'v10.3-packed-runtime-verification-command-v1',
    test: 'tests/integration/pack-consumer.test.ts',
    workers: 1,
    nodeMajor: major,
    builderMember,
    network: 'deny',
  };
  const body = {
    version: 'v10.3-packed-runtime-receipt-v1',
    receiptId: `runtime-node-${major}`,
    approvedCommitSha: expectedCommitSha,
    nodeMajor: major,
    packageVersion: PACKAGE_VERSION,
    tarballSha256: artifact.tarballSha256,
    manifestBuilderBehaviorSha256: artifact.behaviorSha256,
    installCommandSha256: canonicalSha(installProjection),
    verificationCommandSha256: canonicalSha(verificationProjection),
    outputSetSha256: canonicalSha(output),
    reviewerIds: reviewers,
    decision: 'approved',
    exitCode: 0,
  };
  const receipt = { ...body, receiptSha256: calibrationPackedRuntimeReceiptSha256(body) };
  if (!isCalibrationPackedRuntimeReceiptV1(receipt)) fail(`generated Node ${major} receipt failed Core validation`);
  return { receipt, output, diagnostic: result.diagnostic };
}

function assertPair(receipts) {
  if (receipts.length !== 2) fail('packed runtime matrix requires exactly two receipts');
  const node22 = receipts.find((value) => value.receipt.nodeMajor === 22);
  const node24 = receipts.find((value) => value.receipt.nodeMajor === 24);
  if (!node22 || !node24) fail('packed runtime matrix requires one Node 22 and one Node 24 receipt');
  for (const value of [node22, node24]) {
    if (value.receipt.tarballSha256 !== node22.receipt.tarballSha256
      || value.receipt.approvedCommitSha !== node22.receipt.approvedCommitSha
      || value.receipt.manifestBuilderBehaviorSha256 !== node22.receipt.manifestBuilderBehaviorSha256
      || value.receipt.packageVersion !== PACKAGE_VERSION || value.receipt.exitCode !== 0) {
      fail('Node 22 and Node 24 receipts are not bound to one release identity');
    }
  }
  if (node22.receipt.receiptId === node24.receipt.receiptId) fail('Node receipts must have distinct IDs');
}

function assertDiagnosticPair(values) {
  if (values.length !== 2 || values[0].major !== 22 || values[1].major !== 24) fail('diagnostic matrix requires Node 22 then Node 24');
  const first = values[0].legacy;
  for (const value of values) {
    if (value.legacy.result !== 'pass' || value.legacy.tarballSha256 !== first.tarballSha256
      || value.legacy.package?.version !== PACKAGE_VERSION || value.legacy.builder?.commitSha !== first.builder?.commitSha) {
      fail('diagnostic consumer pair is not bound to one passing release identity');
    }
  }
}

function writeReceipts(outputDir, values) {
  const targets = values.map(({ receipt }) => join(outputDir, `node-${receipt.nodeMajor}`, 'receipt.json'));
  if (targets.some((target) => existsSync(target))) fail('refusing to overwrite an existing runtime receipt');
  for (const target of targets) mkdirSync(dirname(target), { recursive: true });
  for (const [index, value] of values.entries()) writeFileSync(targets[index], calibrationAdmissionCanonicalJson(value.receipt), { flag: 'wx', mode: 0o600 });
  return targets;
}

function main() {
  const input = parseArgs(process.argv.slice(2));
  assertScopedCheckout(input.expectedCommitSha);
  const artifact = loadTarball(input);
  const store = pnpmStorePath();
  const values = [];
  // Deliberately serial: this gate is a memory-sensitive release boundary.
  for (const major of [22, 24]) {
    const result = runConsumer(major, artifact, input.expectedCommitSha, store);
    values.push(input.diagnosticOnly
      ? { major, ...result }
      : receiptFor(major, artifact, result, input.expectedCommitSha, input.reviewers, input.builderMember));
  }
  if (input.diagnosticOnly) {
    assertDiagnosticPair(values);
    console.log(JSON.stringify({
      ok: true,
      diagnosticOnly: true,
      packageVersion: PACKAGE_VERSION,
      tarballSha256: artifact.tarballSha256,
      manifestBuilderBehaviorSha256: artifact.behaviorSha256,
      nodeMajors: values.map((value) => value.major),
      runtimes: values.map((value) => value.diagnostic),
      receiptsWritten: false,
    }));
    if (artifact.owned) rmSync(artifact.root, { recursive: true, force: true });
    return;
  }
  assertPair(values);
  const outputDir = resolve(input.outputDir);
  const paths = writeReceipts(outputDir, values);
  console.log(JSON.stringify({
    ok: true,
    packageVersion: PACKAGE_VERSION,
    tarballSha256: artifact.tarballSha256,
    manifestBuilderBehaviorSha256: artifact.behaviorSha256,
    receiptPaths: paths,
    nodeMajors: [22, 24],
  }));
  if (artifact.owned) rmSync(artifact.root, { recursive: true, force: true });
}

try {
  main();
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
}
