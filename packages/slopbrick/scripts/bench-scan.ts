#!/usr/bin/env -S node --import tsx
// R4 regression benchmark for `slopbrick scan`.
//
// Asserts that the 4-score model produces distinct, in-range, stable values
// on a known fixture. Catches the v0.16.0 R3 placeholder bug if it ever
// returns (where all 4 scores read from the same source).
//
// Usage: pnpm bench:scan [fixture-dir]
// Default fixture: packages/slopbrick/tests/fixtures/frameworks (if present)
//                  else the platform repo root.
//
// Exit code: 0 on pass, 1 on any assertion failure.

import { readFileSync, existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { execSync } from 'node:child_process';

// import.meta.dirname is `packages/slopbrick/scripts/`, so `..` lands at the slopbrick package root.
const REPO_ROOT = resolve(import.meta.dirname, '..');
const PLATFORM_ROOT = resolve(REPO_ROOT, '..', '..');
const DEFAULT_FIXTURE = join(REPO_ROOT, 'tests', 'fixtures', 'frameworks');
const FALLBACK_FIXTURE = PLATFORM_ROOT;

interface HealthFile {
  aiQuality: number;
  engineeringHygiene: number;
  security: number;
  repositoryHealth: number;
  issueCounts: { high: number; medium: number; low: number };
  categoryScores: Record<string, number>;
}

interface BenchResult {
  pass: boolean;
  fixture: string;
  scores: { aiQuality: number; engineeringHygiene: number; security: number; repositoryHealth: number };
  issueCounts: { high: number; medium: number; low: number };
  errors: string[];
}

function runScan(cwd: string): void {
  // Use the local slopbrick CLI. We avoid the global install to keep
  // the benchmark reproducible regardless of the user's PATH.
  const bin = join(REPO_ROOT, 'bin', 'slopbrick.js');
  if (!existsSync(bin)) {
    throw new Error(`slopbrick CLI not found at ${bin}. Run \`pnpm build\` first.`);
  }
  execSync(`node ${bin} scan`, { cwd, stdio: 'pipe' });
}

function readHealth(cwd: string): HealthFile {
  const path = join(cwd, '.slopbrick', 'health.json');
  if (!existsSync(path)) {
    throw new Error(`health.json not found at ${path}. Run \`slopbrick scan\` first.`);
  }
  return JSON.parse(readFileSync(path, 'utf-8')) as HealthFile;
}

function bench(fixture: string): BenchResult {
  const errors: string[] = [];

  // 1. Run scan (writes .slopbrick/health.json)
  runScan(fixture);

  // 2. Read the result
  const h1 = readHealth(fixture);

  // 3. Assert structure
  for (const key of ['aiQuality', 'engineeringHygiene', 'security', 'repositoryHealth'] as const) {
    if (typeof h1[key] !== 'number') {
      errors.push(`score ${key} is not a number (got ${typeof h1[key]})`);
    } else if (h1[key] < 0 || h1[key] > 100) {
      errors.push(`score ${key} is out of range [0,100]: ${h1[key]}`);
    } else if (!Number.isFinite(h1[key])) {
      errors.push(`score ${key} is not finite: ${h1[key]}`);
    }
  }

  // 4. Assert distinctness — the v0.16.0 R3 bug had all 4 reading from
  // the same source. On a real fixture with mixed code, the 4 scores
  // should differ by at least 1 point in at least one pair. We skip
  // this check when the fixture has zero issues (a clean fixture
  // correctly produces four 100s).
  const totalIssues = h1.issueCounts.high + h1.issueCounts.medium + h1.issueCounts.low;
  if (totalIssues > 0) {
    const scores = [h1.aiQuality, h1.engineeringHygiene, h1.security, h1.repositoryHealth] as const;
    const unique = new Set(scores);
    if (unique.size === 1) {
      errors.push(`all 4 scores are identical (${scores[0]}) with ${totalIssues} issues — likely the v0.16.0 R3 placeholder bug`);
    }
  }

  // 5. Assert stability — run again and compare within ±2 points
  runScan(fixture);
  const h2 = readHealth(fixture);
  for (const key of ['aiQuality', 'engineeringHygiene', 'security', 'repositoryHealth'] as const) {
    const delta = Math.abs(h1[key] - h2[key]);
    if (delta > 2) {
      errors.push(`score ${key} is unstable across runs: ${h1[key]} → ${h2[key]} (delta ${delta})`);
    }
  }

  // 6. Assert issue counts are non-negative integers
  for (const key of ['high', 'medium', 'low'] as const) {
    if (!Number.isInteger(h1.issueCounts[key]) || h1.issueCounts[key] < 0) {
      errors.push(`issueCounts.${key} is not a non-negative integer: ${h1.issueCounts[key]}`);
    }
  }

  return {
    pass: errors.length === 0,
    fixture,
    scores: {
      aiQuality: h1.aiQuality,
      engineeringHygiene: h1.engineeringHygiene,
      security: h1.security,
      repositoryHealth: h1.repositoryHealth,
    },
    issueCounts: h1.issueCounts,
    errors,
  };
}

function main(): void {
  const argFixture = process.argv[2];
  const fixture = argFixture
    ? resolve(process.cwd(), argFixture)
    : existsSync(DEFAULT_FIXTURE)
      ? DEFAULT_FIXTURE
      : FALLBACK_FIXTURE;

  console.log(`bench:scan fixture = ${fixture}`);
  const result = bench(fixture);

  console.log(`\n  aiQuality           ${result.scores.aiQuality}`);
  console.log(`  engineeringHygiene  ${result.scores.engineeringHygiene}`);
  console.log(`  security            ${result.scores.security}`);
  console.log(`  repositoryHealth    ${result.scores.repositoryHealth}`);
  console.log(`  issues              ${result.issueCounts.high}H / ${result.issueCounts.medium}M / ${result.issueCounts.low}L`);

  if (result.pass) {
    console.log('\n✓ bench:scan PASS');
    process.exit(0);
  } else {
    console.log('\n✗ bench:scan FAIL');
    for (const err of result.errors) {
      console.log(`  - ${err}`);
    }
    process.exit(1);
  }
}

main();
