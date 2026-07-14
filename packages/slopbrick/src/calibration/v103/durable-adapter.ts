import { createHash } from 'node:crypto';
import { readCompletedAttempt, writeAttempt } from './attempt-store';
import { SyntheticResumeError, type SyntheticChunkAdapter, type SyntheticScanResult } from './bisection';
import { isV103RuleEvidenceList } from './rule-evidence';

function chunkId(ids: readonly string[]): string {
  return createHash('sha256').update(JSON.stringify(ids), 'utf8').digest('hex');
}

function validResult(value: unknown): value is SyntheticScanResult {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false;
  const result = value as Record<string, unknown>;
  if (result.kind === 'success') return (Object.keys(result).length === 2 || Object.keys(result).length === 3) && Number.isSafeInteger(result.findingsCount) && (result.findingsCount as number) >= 0 && (result.ruleEvidence === undefined || isV103RuleEvidenceList(result.ruleEvidence));
  if (result.kind === 'excluded') return Object.keys(result).length === 2 && typeof result.exclusionReason === 'string' && result.exclusionReason.length > 0;
  return (result.kind === 'parse_failure' || result.kind === 'timeout' || result.kind === 'crash') && Object.keys(result).length === 1;
}

function decode(ids: readonly string[], records: unknown[]): Readonly<Record<string, SyntheticScanResult>> {
  if (records.length !== ids.length) throw new Error('Completed attempt records are corrupt');
  const result: Record<string, SyntheticScanResult> = {};
  for (const record of records) {
    if (typeof record !== 'object' || record === null || Array.isArray(record)) throw new Error('Completed attempt records are corrupt');
    const entry = record as Record<string, unknown>;
    if (Object.keys(entry).length !== 2 || typeof entry.fileId !== 'string' || !ids.includes(entry.fileId) || result[entry.fileId] || !validResult(entry.result)) throw new Error('Completed attempt records are corrupt');
    result[entry.fileId] = entry.result;
  }
  if (Object.keys(result).length !== ids.length) throw new Error('Completed attempt records are corrupt');
  return result;
}

/** Wraps an adapter with no-clobber, exact-input-hash attempt replay. */
export function durableSyntheticAdapter(options: {
  readonly directory: string;
  readonly runId: string;
  readonly inputHash: string;
  readonly initialTimeoutMs: number;
  readonly adapter: SyntheticChunkAdapter;
}): SyntheticChunkAdapter {
  return async (ids, timeoutMs) => {
    const key = { runId: options.runId, chunkId: chunkId(ids), attempt: timeoutMs === options.initialTimeoutMs ? 1 : 2, inputHash: options.inputHash };
    try {
      return decode(ids, (await readCompletedAttempt(options.directory, key)).records);
    } catch (error) {
      if (error instanceof Error && error.message === 'Completed attempt missing') {
        // A missing attempt is the only read failure that permits fresh work.
      } else {
        const message = error instanceof Error ? error.message : 'Completed attempt unreadable';
        throw new SyntheticResumeError(message);
      }
    }
    const result = await options.adapter(ids, timeoutMs);
    try {
      await writeAttempt(options.directory, { ...key, records: ids.map((fileId) => ({ fileId, result: result[fileId] })) });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unable to persist completed attempt';
      throw new SyntheticResumeError(message);
    }
    return result;
  };
}
