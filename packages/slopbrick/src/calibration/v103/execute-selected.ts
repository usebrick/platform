import type { SelectionRecord } from './selection';
import { executeSyntheticBisection, type SyntheticChunkAdapter, type SyntheticScanResult } from './bisection';
import { materializeV103Scan } from './scan-run';

export async function executeSelectedV103(
  runId: string,
  records: readonly SelectionRecord[],
  options: { readonly chunkSize: number; readonly timeoutMs: number; readonly retryTimeoutMs: number; readonly scan: (record: SelectionRecord, timeoutMs: number) => Promise<SyntheticScanResult> },
) {
  const selected = records.filter((record) => record.status === 'selected');
  const byId = new Map(selected.map((record) => [record.fileId, record]));
  const adapter: SyntheticChunkAdapter = async (ids, timeoutMs) => Object.fromEntries(await Promise.all(ids.map(async (fileId) => {
    const record = byId.get(fileId);
    if (!record) return [fileId, { kind: 'crash' as const }];
    try { return [fileId, await options.scan(record, timeoutMs)] as const; } catch { return [fileId, { kind: 'crash' as const }] as const; }
  })));
  const outcomes = await executeSyntheticBisection(selected.map((record) => record.fileId), options, adapter);
  return materializeV103Scan(runId, records, outcomes);
}
