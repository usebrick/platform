import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { assertDistBuilt, cleanupTempDir, createTmpDir, run } from '../helpers/cli';

describe('typed gate decision contract', () => {
  const dirs: string[] = [];
  beforeAll(assertDistBuilt);
  afterEach(() => { while (dirs.length) cleanupTempDir(dirs.pop()!); });

  function failingWorkspace(): string {
    const dir = createTmpDir();
    dirs.push(dir);
    mkdirSync(join(dir, 'src'));
    writeFileSync(join(dir, 'src', 'noisy.tsx'), `
      export function Component() {
        console.log('a'); console.log('b'); console.log('c');
        console.log('d'); console.log('e'); console.log('f');
        return <div />;
      }
    `);
    writeFileSync(
      join(dir, 'slopbrick.config.cjs'),
      'module.exports = { thresholds: { meanSlop: 0, p90Slop: 0, individualSlopThreshold: 0 } };\n',
    );
    return dir;
  }

  it('uses one typed decision for human, JSON, SARIF, and process exit', async () => {
    const dir = failingWorkspace();
    const common = ['--workspace', dir, '--threads', '1', '--no-telemetry', '--no-color'];

    const pretty = await run([...common, '--format', 'pretty']);
    expect(pretty.exitCode).toBe(1);
    expect(pretty.stdout).toContain('Gate decision: fail');

    const json = await run([...common, '--format', 'json']);
    expect(json.exitCode).toBe(1);
    const jsonReport = JSON.parse(json.stdout) as {
      gateDecision?: { kind: string; status: string; exitCode: number };
    };
    expect(jsonReport.gateDecision).toMatchObject({
      kind: 'slopbrick-gate-decision-v1',
      status: 'failed',
      exitCode: 1,
    });
    expect(jsonReport.gateDecision?.summary).toContain('Gate decision: fail');

    const sarif = await run([...common, '--format', 'sarif']);
    expect(sarif.exitCode).toBe(1);
    const sarifReport = JSON.parse(sarif.stdout) as {
      runs: Array<{ tool: { driver: { properties?: { gateDecision?: unknown } } } }>;
    };
    expect(sarifReport.runs[0]?.tool.driver.properties?.gateDecision).toEqual(jsonReport.gateDecision);

    const dryRunFix = await run([...common, '--fix', '--dry-run', '--format', 'json']);
    expect(dryRunFix.exitCode).toBe(1);
    expect(dryRunFix.stdout).toContain('--dry-run: skipping apply step');
  });
});
