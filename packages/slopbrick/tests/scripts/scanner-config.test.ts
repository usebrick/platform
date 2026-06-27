/**
 * Tests for the v0.14.5f scanner-config fixes.
 *
 * The v0.14.5d scans hit 264 timeouts (out of ~95k files) and 1 ENOENT
 * race in 4 hours. Both are scanner-config bugs, not rule-quality
 * issues. This file documents the fix as a test so the next v8 corpus
 * re-scan can't regress without a test failure.
 *
 * What's tested:
 * 1. PER_FILE_TIMEOUT_MS is at least 120s (was 60s; the 60s limit was
 *    too aggressive for large generated docs like Alamofire HTML)
 * 2. The scanner's child-process wrapper is the right shape:
 *    `npx tsx` (not raw `node`) + `SLOP_RESULT_PATH` env (no stdout
 *    buffer overrun) + ENOENT-safe unlinkSync in the cleanup path
 *
 * What we can't easily test in a unit (would require killing a real
 * child process and racing it): the actual timeout enforcement and
 * the unlinkSync race. Those are documented behavior — the test
 * asserts the constants are set to non-trivial values that would
 * catch a re-typo.
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const SCANNER_PATH = join(__dirname, '..', '..', 'scripts', 'scan-corpus-robust-v2.ts');

function readScannerSource(): string {
  return readFileSync(SCANNER_PATH, 'utf-8');
}

describe('scanner v0.14.5f config invariants', () => {
  it('PER_FILE_TIMEOUT_MS is at least 120s (v8 corpus needs >60s for big generated docs)', () => {
    const src = readScannerSource();
    // Match the const declaration. The value may use a numeric literal
    // or digit-grouped underscores (e.g. `180_000`); use a capture
    // group that tolerates underscores.
    const match = src.match(/PER_FILE_TIMEOUT_MS\s*=\s*([\d_]+)/);
    expect(match).not.toBeNull();
    const value = parseInt(match![1]!.replace(/_/g, ''), 10);
    expect(value).toBeGreaterThanOrEqual(120_000);
  });

  it('PER_FILE_TIMEOUT_MS is bounded under 10min (a hung child should still be killed)', () => {
    const src = readScannerSource();
    const match = src.match(/PER_FILE_TIMEOUT_MS\s*=\s*([\d_]+)/);
    const value = parseInt(match![1]!.replace(/_/g, ''), 10);
    expect(value).toBeLessThanOrEqual(600_000);
  });

  it('uses `npx tsx` for child workers (not raw `node`, which can\'t import .ts)', () => {
    const src = readScannerSource();
    expect(src).toMatch(/spawn\(['"]npx['"],\s*\[\s*['"]tsx['"]/);
  });

  it('passes SLOP_RESULT_PATH env to the child (file-based output, not stdout buffer)', () => {
    const src = readScannerSource();
    expect(src).toContain('SLOP_RESULT_PATH');
    expect(src).toMatch(/env:\s*\{[^}]*SLOP_RESULT_PATH/);
  });

  it('cleanup unlinkSync is wrapped in try/catch (ENOENT-safe)', () => {
    const src = readScannerSource();
    // The unlinkSync call must be inside a `try { ... } catch { ... }`
    // block. The actual code shape is a single line:
    //   try { unlinkSync(resultPath); } catch { /* already gone */ }
    expect(src).toMatch(/try\s*\{\s*unlinkSync\([^)]+\)\s*;?\s*\}\s*catch/);
  });

  it('captures first 2 lines of worker stderr as a `_stderr` field on success (v0.14.5f soak)', () => {
    const src = readScannerSource();
    expect(src).toContain('_stderr');
  });
});
