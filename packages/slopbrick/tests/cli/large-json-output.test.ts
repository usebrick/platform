import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, beforeAll, describe, expect, it } from 'vitest';

import {
  assertDistBuilt,
  cleanupTempDir,
  createTmpDir,
  run,
} from '../helpers/cli';

describe('large JSON scan output', () => {
  const dirs: string[] = [];

  beforeAll(assertDistBuilt);
  afterEach(() => {
    while (dirs.length > 0) cleanupTempDir(dirs.pop()!);
  });

  it('flushes more than 128 KiB of JSON before returning a policy-failure exit code', async () => {
    const dir = createTmpDir();
    dirs.push(dir);
    const srcDir = join(dir, 'src');
    mkdirSync(srcDir);

    const cleanFileCount = 320;
    const pathPadding = 'x'.repeat(180);
    for (let index = 0; index < cleanFileCount; index += 1) {
      const suffix = String(index).padStart(4, '0');
      writeFileSync(
        join(srcDir, `clean-${suffix}-${pathPadding}.ts`),
        `export const value${suffix} = ${index};\n`,
      );
    }
    writeFileSync(
      join(srcDir, 'noisy.tsx'),
      `export function Component() {
        console.log('a'); console.log('b'); console.log('c');
        console.log('d'); console.log('e'); console.log('f');
        return <div />;
      }\n`,
    );
    writeFileSync(
      join(dir, 'slopbrick.config.cjs'),
      'module.exports = { thresholds: { meanSlop: 0, p90Slop: 0, individualSlopThreshold: 0 } };\n',
    );

    const result = await run([
      'scan',
      '--workspace', dir,
      '--threads', '1',
      '--no-telemetry',
      '--json',
    ], dir);

    expect(result.exitCode).toBe(1);
    expect(Buffer.byteLength(result.stdout, 'utf8')).toBeGreaterThan(128 * 1024);
    const report = JSON.parse(result.stdout) as {
      fileCount: number;
      completionStatus: string;
      scoreValidity: string;
      scoreBriefs: Record<string, string>;
    };
    expect(report).toMatchObject({
      fileCount: cleanFileCount + 1,
      completionStatus: 'complete',
      scoreValidity: 'valid',
    });
    expect(report.scoreBriefs).toHaveProperty('repositoryHealth');
  }, 60_000);
});
