#!/usr/bin/env node

/*
 * Host preflight for the subprocess-, socket-, and filesystem-heavy release
 * test gate. This does not skip tests or turn failures green. It tells the
 * caller whether a full result can be interpreted as a product result or is
 * environment-inconclusive.
 */

import { createServer } from 'node:http';
import {
  chmodSync,
  closeSync,
  mkdtempSync,
  openSync,
  rmSync,
  statSync,
  watch,
} from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const REQUIRED = ['loopback', 'descriptorHeadroom', 'specialFileModes'];

function errorText(error) {
  if (error && typeof error === 'object') {
    const code = typeof error.code === 'string' ? `${error.code}: ` : '';
    const message = error instanceof Error ? error.message : String(error);
    return `${code}${message}`;
  }
  return String(error);
}

/**
 * Classify probe results without performing I/O. This is exported so the
 * contract can be tested independently of the host running the suite.
 */
export function classifyCapabilities(probes) {
  const blockers = REQUIRED
    .filter((name) => probes[name]?.ok !== true)
    .map((name) => `${name}: ${probes[name]?.error ?? 'unsupported'}`);
  return blockers.length > 0
    ? { status: 'environment_inconclusive', blockers }
    : { status: 'ready', blockers: [] };
}

export async function probeLoopback() {
  const server = createServer((_request, response) => response.end());
  try {
    await new Promise((resolvePromise, reject) => {
      server.once('error', reject);
      server.listen(0, '127.0.0.1', resolvePromise);
    });
    return { ok: true };
  } catch (error) {
    return { ok: false, error: errorText(error) };
  } finally {
    if (server.listening) {
      await new Promise((resolvePromise) => server.close(() => resolvePromise()));
    }
  }
}

export function probeDescriptorHeadroom() {
  const handles = [];
  const target = process.platform === 'win32' ? 'NUL' : '/dev/null';
  try {
    for (let index = 0; index < 64; index += 1) handles.push(openSync(target, 'r'));
    return { ok: true, opened: handles.length };
  } catch (error) {
    return { ok: false, error: errorText(error), opened: handles.length };
  } finally {
    for (const handle of handles) closeSync(handle);
  }
}

export function probeSpecialFileModes() {
  if (process.platform === 'win32') {
    return { ok: false, error: 'special file modes unsupported on Windows' };
  }
  const directory = mkdtempSync(join(tmpdir(), 'slopbrick-capabilities-'));
  const file = join(directory, 'mode-probe');
  try {
    const handle = openSync(file, 'w', 0o600);
    closeSync(handle);
    chmodSync(file, 0o4600);
    const mode = statSync(file).mode & 0o7777;
    return mode & 0o4000
      ? { ok: true, mode }
      : { ok: false, error: `setuid bit stripped (mode ${mode.toString(8)})`, mode };
  } catch (error) {
    return { ok: false, error: errorText(error) };
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
}

export function probeRecursiveWatch() {
  const directory = mkdtempSync(join(tmpdir(), 'slopbrick-watch-capabilities-'));
  try {
    const watcher = watch(directory, { recursive: true });
    watcher.close();
    return { ok: true };
  } catch (error) {
    return { ok: false, error: errorText(error) };
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
}

export async function probeCapabilities() {
  const loopback = await probeLoopback();
  const descriptorHeadroom = probeDescriptorHeadroom();
  const specialFileModes = probeSpecialFileModes();
  const recursiveWatch = probeRecursiveWatch();
  return {
    schemaVersion: 1,
    ...classifyCapabilities({ loopback, descriptorHeadroom, specialFileModes }),
    probes: { loopback, descriptorHeadroom, specialFileModes, recursiveWatch },
  };
}

async function main() {
  const result = await probeCapabilities();
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  if (process.argv.includes('--require-ready') && result.status !== 'ready') process.exitCode = 2;
}

const entry = process.argv[1] ? pathToFileURL(resolve(process.argv[1])).href : '';
if (entry === import.meta.url || fileURLToPath(import.meta.url) === process.argv[1]) await main();
