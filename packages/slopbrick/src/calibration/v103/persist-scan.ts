import { access, constants, rename, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { canonicalJson } from './canonical';

async function absent(path: string): Promise<void> { try { await access(path, constants.F_OK); throw new Error('Refusing to overwrite existing scan artifacts'); } catch (error) { if (error instanceof Error && error.message === 'Refusing to overwrite existing scan artifacts') throw error; } }
async function writeNew(path: string, content: string): Promise<void> { const temp = `${path}.${randomUUID()}.tmp`; try { await writeFile(temp, content, { encoding: 'utf8', flag: 'wx' }); await rename(temp, path); } finally { /* rename publishes atomically; abandoned temps are unique and harmless */ } }

export async function persistV103ScanArtifacts(directory: string, evidence: { readonly observations: readonly Record<string, unknown>[]; readonly failures: readonly Record<string, unknown>[]; readonly coverage: Record<string, unknown> }): Promise<void> {
  const paths = ['observations.jsonl', 'failures.jsonl', 'coverage.json'].map((name) => join(directory, name));
  await Promise.all(paths.map(absent));
  await Promise.all([
    writeNew(paths[0]!, evidence.observations.map(canonicalJson).join('\n') + (evidence.observations.length ? '\n' : '')),
    writeNew(paths[1]!, evidence.failures.map(canonicalJson).join('\n') + (evidence.failures.length ? '\n' : '')),
    writeNew(paths[2]!, `${canonicalJson(evidence.coverage)}\n`),
  ]);
}
