import { afterEach, describe, expect, it } from 'vitest';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { persistV103ScanArtifacts } from '../../src/calibration/v103/persist-scan';
const dirs: string[] = []; afterEach(() => { while (dirs.length) rmSync(dirs.pop()!, { recursive: true, force: true }); });
describe('v10.3 scan artifact persistence', () => {
  it('writes canonical new artifacts and refuses overwrite', async () => {
    const directory = mkdtempSync(join(tmpdir(), 'v103-output-')); dirs.push(directory);
    const evidence = { observations: [{ b: 2, a: 1 }], failures: [], coverage: { b: 2, a: 1 } };
    await persistV103ScanArtifacts(directory, evidence);
    expect(readFileSync(join(directory, 'observations.jsonl'), 'utf8')).toBe('{"a":1,"b":2}\n');
    await expect(persistV103ScanArtifacts(directory, evidence)).rejects.toThrow('Refusing');
    expect(readFileSync(join(directory, 'coverage.json'), 'utf8')).toBe('{"a":1,"b":2}\n');
  });
  it('does not publish a partial set when an output exists', async () => {
    const directory = mkdtempSync(join(tmpdir(), 'v103-output-')); dirs.push(directory); writeFileSync(join(directory, 'failures.jsonl'), 'old');
    await expect(persistV103ScanArtifacts(directory, { observations: [], failures: [], coverage: {} })).rejects.toThrow();
    expect(() => readFileSync(join(directory, 'observations.jsonl'))).toThrow();
  });
});
