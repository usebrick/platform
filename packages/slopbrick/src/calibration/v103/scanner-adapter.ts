export type ScanClass = { readonly kind: 'success'; readonly findingsCount: number } | { readonly kind: 'parse_failure' } | { readonly kind: 'timeout' } | { readonly kind: 'crash' };
export interface ScannerInvocation { readonly filePath: string; readonly resultPath: string; readonly timeoutMs: number; readonly includeRules: readonly string[]; readonly excludeRules: readonly string[]; }
export type ScannerInvoker = (input: ScannerInvocation) => Promise<{ readonly exitCode: number; readonly json?: unknown }>;

/** Classifies the existing scan-file-worker JSON contract without exposing local paths. */
export async function invokeV103Scanner(invoke: ScannerInvoker, options: Omit<ScannerInvocation, 'includeRules' | 'excludeRules'> & { readonly includeRules?: readonly string[]; readonly excludeRules?: readonly string[] }): Promise<ScanClass> {
  try {
    const response = await invoke({ ...options, includeRules: options.includeRules ?? [], excludeRules: options.excludeRules ?? [] });
    if (response.exitCode !== 0 || typeof response.json !== 'object' || response.json === null || Array.isArray(response.json)) return { kind: 'crash' };
    const json = response.json as Record<string, unknown>;
    if (json.ok !== true) return { kind: 'crash' };
    if (typeof json.parseError === 'string' && json.parseError.length > 0) return { kind: 'parse_failure' };
    if (!Array.isArray(json.issues)) return { kind: 'crash' };
    return { kind: 'success', findingsCount: json.issues.length };
  } catch (error) {
    return error instanceof Error && (error.name === 'TimeoutError' || (error as { code?: string }).code === 'ETIMEDOUT') ? { kind: 'timeout' } : { kind: 'crash' };
  }
}
