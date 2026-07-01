import { describe, it, expect } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from 'node:fs';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

import {
  runDocsScan,
  formatDocsReport,
  docsExitCode,
  type DocsScanResult,
} from '../../src/cli/docs';

const execFileAsync = promisify(execFile);
const BIN = join(process.cwd(), 'bin', 'slopbrick.js');

function freshDir(): string {
  return mkdtempSync(join(tmpdir(), 'slopbrick-docs-'));
}

function writeFile(dir: string, rel: string, content: string): string {
  const full = join(dir, rel);
  mkdirSync(join(full, '..'), { recursive: true });
  writeFileSync(full, content, 'utf-8');
  return full;
}

function stubResult(): DocsScanResult {
  return {
    result: {
      docFreshness: 95,
      docDrift: 'low',
      scannedDocFiles: 1,
      scannedSourceFiles: 10,
      findings: [],
      byRule: {
        'docs/stale-package-reference': 0,
        'docs/stale-function-reference': 0,
        'dup/identical-block': 0,
        'docs/broken-link': 0,
      },
    },
    scan: {} as never,
  };
}

describe('docsExitCode', () => {
  it('returns 0 in low/medium drift regardless of --strict', () => {
    const r = stubResult();
    r.result.docDrift = 'low';
    expect(docsExitCode(r, { strict: true })).toBe(0);
    expect(docsExitCode(r, { strict: false })).toBe(0);
    r.result.docDrift = 'medium';
    expect(docsExitCode(r, { strict: true })).toBe(0);
  });

  it('returns 1 in high drift with --strict', () => {
    const r = stubResult();
    r.result.docDrift = 'high';
    expect(docsExitCode(r, { strict: true })).toBe(1);
    expect(docsExitCode(r, { strict: false })).toBe(0);
  });

  it('returns 1 in critical drift with --strict', () => {
    const r = stubResult();
    r.result.docDrift = 'critical';
    expect(docsExitCode(r, { strict: true })).toBe(1);
  });
});

describe('formatDocsReport', () => {
  it('pretty output includes score, drift band, and per-rule counts', () => {
    const r = stubResult();
    const out = formatDocsReport(r);
    expect(out).toMatch(/Documentation Freshness:\s*95\/100/);
    expect(out).toMatch(/docDrift:\s*low/);
    expect(out).toMatch(/docs\/stale-package-reference/);
    expect(out).toMatch(/docs\/stale-function-reference/);
    expect(out).toMatch(/dup\/identical-block/);
    expect(out).toMatch(/docs\/broken-link/);
  });

  it('JSON output has all required fields', () => {
    const r = stubResult();
    const json = JSON.parse(formatDocsReport(r, { json: true })) as Record<string, unknown>;
    expect(json.docFreshness).toBe(95);
    expect(json.docDrift).toBe('low');
    expect(json.scannedDocFiles).toBe(1);
    expect(Array.isArray(json.byRule)).toBe(false);
    expect((json.byRule as Record<string, number>)['docs/stale-package-reference']).toBe(0);
  });

  it('markdown output has table + findings section', () => {
    const r = stubResult();
    const md = formatDocsReport(r, { markdown: true });
    expect(md).toMatch(/^## Documentation Freshness:/m);
    expect(md).toMatch(/^\| Rule \| Count \| Weight \|$/m);
  });
});

describe('slopbrick docs (CLI)', () => {
  it('end-to-end via binary on a tiny fixture', async () => {
    const dir = freshDir();
    try {
      writeFile(dir, 'package.json', JSON.stringify({ name: 'x', dependencies: { zod: '*' } }));
      writeFile(dir, 'README.md', `# Project\n\nA clean README.\n`);
      const { stdout, exitCode } = await execFileAsync('node', [BIN, 'docs'], { cwd: dir })
        .then((r) => ({ exitCode: 0, stdout: r.stdout, stderr: r.stderr }))
        .catch((err: { code?: number; stdout?: string; stderr?: string }) => ({
          exitCode: err.code ?? 1,
          stdout: err.stdout ?? '',
          stderr: err.stderr ?? '',
        }));
      expect(stdout).toMatch(/Documentation Freshness:/);
      expect(stdout).toMatch(/docDrift:/);
      // Exit 0 — informational
      expect(exitCode).toBe(0);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  }, 60000);

  it('emits valid JSON with --format json', async () => {
    const dir = freshDir();
    try {
      writeFile(dir, 'package.json', JSON.stringify({ name: 'x', dependencies: { zod: '*' } }));
      writeFile(dir, 'README.md', `# Project\n\nA clean README.\n`);
      const { stdout } = await execFileAsync('node', [BIN, 'docs', '--format', 'json'], { cwd: dir })
        .then((r) => ({ exitCode: 0, stdout: r.stdout, stderr: r.stderr }))
        .catch((err: { code?: number; stdout?: string; stderr?: string }) => ({
          exitCode: err.code ?? 1,
          stdout: err.stdout ?? '',
          stderr: err.stderr ?? '',
        }));
      const parsed = JSON.parse(stdout) as {
        docFreshness: number;
        docDrift: string;
        scannedDocFiles: number;
        byRule: Record<string, number>;
        findings: unknown[];
      };
      expect(parsed.docFreshness).toBeGreaterThanOrEqual(0);
      expect(parsed.docFreshness).toBeLessThanOrEqual(100);
      expect(['low', 'medium', 'high', 'critical']).toContain(parsed.docDrift);
      expect(typeof parsed.scannedDocFiles).toBe('number');
      expect(Array.isArray(parsed.findings)).toBe(true);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  }, 60000);

  it('exits 1 on high drift with --strict', async () => {
    const dir = freshDir();
    try {
      writeFile(dir, 'package.json', JSON.stringify({ name: 'x', dependencies: { zod: '*' } }));
      // Lots of stale-package references → high drift
      const lines = ['# Badges'];
      for (let i = 0; i < 25; i++) {
        lines.push(`\n- install with \`npm install stale${i}\` to use.`);
      }
      writeFile(dir, 'README.md', lines.join('\n'));
      const { exitCode } = await execFileAsync('node', [BIN, 'docs', '--strict'], { cwd: dir })
        .then((r) => ({ exitCode: 0, stdout: r.stdout, stderr: r.stderr }))
        .catch((err: { code?: number; stdout?: string; stderr?: string }) => ({
          exitCode: err.code ?? 1,
          stdout: err.stdout ?? '',
          stderr: err.stderr ?? '',
        }));
      // Should fail (high drift, --strict set)
      expect(exitCode).toBe(1);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  }, 60000);
});
