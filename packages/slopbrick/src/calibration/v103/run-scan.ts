import type { SelectionRecord } from './selection';
import type { ScannerInvoker } from './scanner-adapter';
import { scanSelectedV103 } from './selected-scanner';
import { executeSelectedV103 } from './execute-selected';
import { persistV103ScanArtifacts } from './persist-scan';

export async function runV103Scan(options: {
  readonly directory: string;
  readonly runId: string;
  readonly records: readonly SelectionRecord[];
  readonly checkoutMap: unknown;
  readonly chunkSize: number;
  readonly timeoutMs: number;
  readonly retryTimeoutMs: number;
  readonly includeRules: readonly string[];
  readonly excludeRules: readonly string[];
  readonly invoker: ScannerInvoker;
}) {
  const evidence = await executeSelectedV103(options.runId, options.records, {
    chunkSize: options.chunkSize, timeoutMs: options.timeoutMs, retryTimeoutMs: options.retryTimeoutMs,
    scan: (record, timeoutMs) => scanSelectedV103(record, options.checkoutMap, { timeoutMs, includeRules: options.includeRules, excludeRules: options.excludeRules, invoker: options.invoker }),
  });
  await persistV103ScanArtifacts(options.directory, evidence);
  return evidence;
}
