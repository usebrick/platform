import type { SelectionRecord } from './selection';
import { executeSyntheticBisection, type SyntheticChunkAdapter, type SyntheticScanResult } from './bisection';
import { durableSyntheticAdapter } from './durable-adapter';
import { materializeV103Scan } from './scan-run';

export async function executeSelectedV103(
  runId: string,
  records: readonly SelectionRecord[],
  options: {
    readonly chunkSize: number;
    readonly timeoutMs: number;
    readonly retryTimeoutMs: number;
    readonly scan: (record: SelectionRecord, timeoutMs: number) => Promise<SyntheticScanResult>;
    readonly durability?: { readonly directory: string; readonly inputHash: string };
    /** Maximum number of file scans in flight for one bounded chunk. */
    readonly workerCount?: number;
  },
) {
  const workerCount = options.workerCount ?? 1;
  if (!Number.isSafeInteger(workerCount) || workerCount < 1) throw new Error('workerCount must be a positive safe integer');
  const selected = records.filter((record) => record.status === 'selected');
  const byId = new Map(selected.map((record) => [record.fileId, record]));
  const adapter: SyntheticChunkAdapter = async (ids, timeoutMs) => {
    const results: SyntheticScanResult[] = new Array(ids.length);
    let next = 0;
    const runWorker = async (): Promise<void> => {
      // This worker claims the next unprocessed item until the chunk is
      // exhausted; each worker exits through the bounds check below.
      for (;;) {
        const index = next++;
        if (index >= ids.length) return;
        const fileId = ids[index]!;
        const record = byId.get(fileId);
        if (!record) {
          results[index] = { kind: 'crash' };
          continue;
        }
        try { results[index] = await options.scan(record, timeoutMs); }
        catch { results[index] = { kind: 'crash' }; }
      }
    };
    await Promise.all(Array.from({ length: Math.min(workerCount, ids.length) }, () => runWorker()));
    return Object.fromEntries(ids.map((fileId, index) => [fileId, results[index]!])) as Readonly<Record<string, SyntheticScanResult>>;
  };
  const durable = options.durability === undefined ? adapter : durableSyntheticAdapter({
    directory: options.durability.directory,
    runId,
    inputHash: options.durability.inputHash,
    initialTimeoutMs: options.timeoutMs,
    adapter,
  });
  const outcomes = await executeSyntheticBisection(selected.map((record) => record.fileId), options, durable);
  return materializeV103Scan(runId, records, outcomes);
}
