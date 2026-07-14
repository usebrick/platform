import type { SelectedResolution } from './resolver';
import { resolveSelectedRecord } from './resolver';
import { invokeV103Scanner, type ScanClass, type ScannerInvoker } from './scanner-adapter';

type Resolver = (record: SelectedResolution, checkoutMap: unknown) => Promise<{ normalizedPath: string; localPath: string; bytes: Buffer }>;

/** Executes a verified selection record while keeping the checkout path out of returned data. */
export async function scanSelectedV103(
  record: SelectedResolution,
  checkoutMap: unknown,
  options: { readonly timeoutMs: number; readonly includeRules: readonly string[]; readonly excludeRules: readonly string[]; readonly invoker: ScannerInvoker; readonly resolver?: Resolver; readonly maxFileBytes?: number },
): Promise<ScanClass> {
  const resolved = await (options.resolver ?? resolveSelectedRecord)(record, checkoutMap);
  if (resolved.normalizedPath !== record.normalizedPath) {
    throw new Error('Resolved selected record does not match the selection path');
  }
  if (options.maxFileBytes !== undefined && (!Number.isSafeInteger(options.maxFileBytes) || options.maxFileBytes < 0)) {
    throw new Error('maxFileBytes must be a non-negative safe integer');
  }
  if (options.maxFileBytes !== undefined && resolved.bytes.byteLength > options.maxFileBytes) {
    return { kind: 'excluded', exclusionReason: 'max_file_bytes' };
  }
  return invokeV103Scanner(options.invoker, { filePath: resolved.localPath, resultPath: 'internal-result.json', timeoutMs: options.timeoutMs, includeRules: options.includeRules, excludeRules: options.excludeRules });
}
