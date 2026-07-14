import type { SelectionRecord } from './selection';
import type { ScannerInvoker } from './scanner-adapter';
import { join } from 'node:path';
import { scanSelectedV103 } from './selected-scanner';
import { executeSelectedV103 } from './execute-selected';
import { persistV103ScanArtifacts } from './persist-scan';

export async function runV103Scan(options: {
  readonly directory: string;
  readonly runId: string;
  readonly records: readonly SelectionRecord[];
  readonly checkoutMap: unknown;
  /** Canonical hash of the immutable run declaration; enables safe attempt replay. */
  readonly inputHash?: string;
  readonly maxFileBytes?: number;
  /** Maximum number of selected files scanned concurrently inside a chunk. */
  readonly workerCount?: number;
  readonly chunkSize: number;
  readonly timeoutMs: number;
  readonly retryTimeoutMs: number;
  readonly includeRules: readonly string[];
  readonly excludeRules: readonly string[];
  readonly invoker: ScannerInvoker;
}) {
  const evidence = await executeSelectedV103(options.runId, options.records, {
    chunkSize: options.chunkSize, timeoutMs: options.timeoutMs, retryTimeoutMs: options.retryTimeoutMs,
    ...(options.inputHash === undefined ? {} : { durability: { directory: join(options.directory, 'chunks'), inputHash: options.inputHash } }),
    workerCount: options.workerCount,
    scan: (record, timeoutMs) => scanSelectedV103(record, options.checkoutMap, { timeoutMs, maxFileBytes: options.maxFileBytes, includeRules: options.includeRules, excludeRules: options.excludeRules, invoker: options.invoker }),
  });
  await persistV103ScanArtifacts(options.directory, evidence);
  return evidence;
}
