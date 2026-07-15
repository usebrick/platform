#!/usr/bin/env node

/**
 * Read-only production dependency audit using npm's current bulk advisory
 * endpoint.  `pnpm audit` still targets the retired `/security/audits`
 * endpoint in the supported pnpm versions, so the release gate calls this
 * small adapter instead of treating an endpoint 410 as a clean audit.
 */

import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { pathToFileURL } from 'node:url';
import process from 'node:process';

const BULK_ENDPOINT = 'https://registry.npmjs.org/-/npm/v1/security/advisories/bulk';
const WORKSPACE_NAMES = new Set(['usebrick-platform', '@usebrick/core', '@usebrick/engine', 'slopbrick', '@usebrick/website']);
const SEVERITY = Object.freeze({ info: 0, low: 1, moderate: 2, high: 3, critical: 4 });

function stableVersions(values) {
  return [...new Set(values)].sort();
}

function addDependency(payload, name, version) {
  if (typeof name !== 'string' || name.length === 0 || typeof version !== 'string') return;
  if (WORKSPACE_NAMES.has(name) || /^(?:link:|workspace:|file:|git(?:\+|:))/u.test(version)) return;
  if (!/^[0-9]+\.[0-9]+\.[0-9]+(?:[-+][0-9A-Za-z.-]+)?$/u.test(version)) return;
  (payload[name] ??= []).push(version);
}

function walkDependencies(dependencies, payload, seen) {
  if (!dependencies || typeof dependencies !== 'object' || Array.isArray(dependencies)) return;
  for (const [name, dependency] of Object.entries(dependencies)) {
    if (!dependency || typeof dependency !== 'object' || Array.isArray(dependency)) continue;
    const version = dependency.version;
    addDependency(payload, name, version);
    // pnpm's JSON tree can contain the same physical package at several
    // paths.  The object identity guard prevents pathological duplicate
    // traversal while retaining distinct versions in the payload.
    if (seen.has(dependency)) continue;
    seen.add(dependency);
    walkDependencies(dependency.dependencies, payload, seen);
    walkDependencies(dependency.optionalDependencies, payload, seen);
  }
}

/** Convert `pnpm list --prod --depth Infinity --json` into npm bulk input. */
export function buildBulkPayload(tree) {
  if (!Array.isArray(tree)) throw new Error('pnpm dependency tree must be an array');
  const payload = {};
  const seen = new WeakSet();
  for (const workspace of tree) {
    if (!workspace || typeof workspace !== 'object' || Array.isArray(workspace)) continue;
    walkDependencies(workspace.dependencies, payload, seen);
    walkDependencies(workspace.optionalDependencies, payload, seen);
  }
  return Object.fromEntries(Object.entries(payload)
    .map(([name, versions]) => [name, stableVersions(versions)])
    .sort(([left], [right]) => left.localeCompare(right)));
}

export function severityAtLeast(severity, threshold) {
  return (SEVERITY[severity] ?? -1) >= (SEVERITY[threshold] ?? SEVERITY.high);
}

function dependencyTree() {
  const output = execFileSync('corepack', ['pnpm', 'list', '-r', '--prod', '--depth', 'Infinity', '--json'], {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'inherit'],
    maxBuffer: 32 * 1024 * 1024,
  });
  try {
    return JSON.parse(output);
  } catch (error) {
    throw new Error(`pnpm dependency tree was not valid JSON: ${error instanceof Error ? error.message : String(error)}`);
  }
}

function parseThreshold(argv) {
  const index = argv.indexOf('--audit-level');
  if (index < 0) return 'high';
  const value = argv[index + 1];
  if (!(value in SEVERITY)) throw new Error('--audit-level must be info, low, moderate, high, or critical');
  return value;
}

function advisoryRows(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('npm bulk advisory response must be an object');
  const rows = [];
  for (const [packageName, advisories] of Object.entries(value)) {
    if (!Array.isArray(advisories)) throw new Error(`npm bulk advisory entry for ${packageName} is not an array`);
    for (const advisory of advisories) {
      if (!advisory || typeof advisory !== 'object' || Array.isArray(advisory)) continue;
      rows.push({
        package: packageName,
        id: advisory.id ?? null,
        severity: advisory.severity ?? null,
        title: advisory.title ?? null,
        url: advisory.url ?? null,
        vulnerableVersions: advisory.vulnerable_versions ?? null,
      });
    }
  }
  return rows.sort((left, right) => `${left.package}\u0000${left.id ?? ''}`.localeCompare(`${right.package}\u0000${right.id ?? ''}`));
}

export async function runAudit({ fetchImpl = globalThis.fetch, tree = dependencyTree(), threshold = 'high' } = {}) {
  if (typeof fetchImpl !== 'function') throw new Error('fetch is unavailable; use Node 22 or newer');
  const payload = buildBulkPayload(tree);
  const payloadBytes = Buffer.from(JSON.stringify(payload), 'utf8');
  const response = await fetchImpl(BULK_ENDPOINT, {
    method: 'POST',
    headers: { 'content-type': 'application/json', accept: 'application/json' },
    body: payloadBytes,
  });
  const bodyText = await response.text();
  if (!response.ok) throw new Error(`npm bulk advisory endpoint returned HTTP ${response.status}: ${bodyText.slice(0, 500)}`);
  let body;
  try { body = JSON.parse(bodyText); } catch (error) { throw new Error(`npm bulk advisory response was not JSON: ${error instanceof Error ? error.message : String(error)}`); }
  const advisories = advisoryRows(body);
  const result = {
    endpoint: BULK_ENDPOINT,
    threshold,
    packageCount: Object.keys(payload).length,
    payloadSha256: createHash('sha256').update(payloadBytes).digest('hex'),
    advisoryCount: advisories.length,
    advisories,
  };
  return { ...result, failingAdvisories: advisories.filter((advisory) => severityAtLeast(advisory.severity, threshold)) };
}

const invokedPath = process.argv[1] ? pathToFileURL(process.argv[1]).href : null;
if (invokedPath === import.meta.url) {
  try {
    const threshold = parseThreshold(process.argv.slice(2));
    const result = await runAudit({ threshold });
    process.stdout.write(`${JSON.stringify(result)}\n`);
    process.exitCode = result.failingAdvisories.length === 0 ? 0 : 1;
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 2;
  }
}
