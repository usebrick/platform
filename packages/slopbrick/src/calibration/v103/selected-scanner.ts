import type { SelectedResolution } from './resolver';
import { resolveSelectedRecord } from './resolver';
import { invokeV103Scanner, type ScanClass, type ScannerInvoker } from './scanner-adapter';

type Resolver = (record: SelectedResolution, checkoutMap: unknown) => Promise<{ normalizedPath: string; localPath: string; bytes: Buffer }>;

/** Executes a verified selection record while keeping the checkout path out of returned data. */
export async function scanSelectedV103(
  record: SelectedResolution,
  checkoutMap: unknown,
  options: { readonly timeoutMs: number; readonly includeRules: readonly string[]; readonly excludeRules: readonly string[]; readonly invoker: ScannerInvoker; readonly resolver?: Resolver },
): Promise<ScanClass> {
  const resolved = await (options.resolver ?? resolveSelectedRecord)(record, checkoutMap);
  return invokeV103Scanner(options.invoker, { filePath: resolved.localPath, resultPath: 'internal-result.json', timeoutMs: options.timeoutMs, includeRules: options.includeRules, excludeRules: options.excludeRules });
}
