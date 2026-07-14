import { isV103RuleEvidenceList, type V103RuleEvidence } from './rule-evidence';

export type SyntheticScanResult =
  | { readonly kind: 'success'; readonly findingsCount: number; readonly ruleEvidence?: readonly V103RuleEvidence[] }
  | { readonly kind: 'excluded'; readonly exclusionReason: string }
  | { readonly kind: 'parse_failure' }
  | { readonly kind: 'timeout' }
  | { readonly kind: 'crash' };

export interface TerminalSyntheticOutcome {
  readonly fileId: string;
  readonly status: 'success_zero' | 'success_findings' | 'excluded' | 'parse_failure' | 'timeout' | 'scanner_failure';
  readonly findingsCount?: number;
  readonly exclusionReason?: string;
  readonly ruleEvidence?: readonly V103RuleEvidence[];
}

export type SyntheticChunkAdapter = (fileIds: readonly string[], timeoutMs: number) => Promise<Readonly<Record<string, SyntheticScanResult>>>;

/**
 * A durable-attempt artifact was present but could not be trusted for resume.
 *
 * Scanner failures are intentionally converted into terminal crash outcomes by
 * the bisection runner. Resume-artifact failures are different: retrying the
 * scanner would hide stale/corrupt input and could mutate a run that should
 * have failed closed. Durable adapters throw this marker so the runner can
 * preserve that distinction without changing generic adapter crash recovery.
 */
export class SyntheticResumeError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SyntheticResumeError';
  }
}

export function planV103Chunks(fileIds: readonly string[], chunkSize: number): readonly (readonly string[])[] {
  if (!Number.isSafeInteger(chunkSize) || chunkSize < 1) throw new Error('chunkSize must be a positive safe integer');
  if (new Set(fileIds).size !== fileIds.length || fileIds.some((id) => id.length === 0)) throw new Error('file IDs must be unique and nonempty');
  const chunks: string[][] = [];
  for (let index = 0; index < fileIds.length; index += chunkSize) chunks.push([...fileIds.slice(index, index + chunkSize)]);
  return chunks;
}

function terminal(fileId: string, result: SyntheticScanResult): TerminalSyntheticOutcome | undefined {
  if (result.kind === 'success') return result.findingsCount === 0
    ? { fileId, status: 'success_zero', ...(result.ruleEvidence === undefined ? {} : { ruleEvidence: result.ruleEvidence }) }
    : { fileId, status: 'success_findings', findingsCount: result.findingsCount, ...(result.ruleEvidence === undefined ? {} : { ruleEvidence: result.ruleEvidence }) };
  if (result.kind === 'excluded') return { fileId, status: 'excluded', exclusionReason: result.exclusionReason };
  if (result.kind === 'parse_failure') return { fileId, status: 'parse_failure' };
  return undefined;
}

function validResult(value: unknown): value is SyntheticScanResult {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false;
  const result = value as Record<string, unknown>;
  if (result.kind === 'success') return (Object.keys(result).length === 2 || Object.keys(result).length === 3) && Number.isSafeInteger(result.findingsCount) && (result.findingsCount as number) >= 0 && (result.ruleEvidence === undefined || isV103RuleEvidenceList(result.ruleEvidence));
  if (result.kind === 'excluded') return Object.keys(result).length === 2 && typeof result.exclusionReason === 'string' && result.exclusionReason.length > 0;
  return (result.kind === 'parse_failure' || result.kind === 'timeout' || result.kind === 'crash') && Object.keys(result).length === 1;
}

function validChunkResponse(value: unknown, ids: readonly string[]): value is Readonly<Record<string, SyntheticScanResult>> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false;
  const result = value as Record<string, unknown>;
  return Object.keys(result).length === ids.length && ids.every((id) => validResult(result[id])) && Object.keys(result).every((id) => ids.includes(id));
}

/** Pure recovery model: unstable chunk results are bisected; a singleton gets one longer retry. */
export async function executeSyntheticBisection(
  fileIds: readonly string[],
  options: { readonly chunkSize: number; readonly timeoutMs: number; readonly retryTimeoutMs: number },
  adapter: SyntheticChunkAdapter,
): Promise<readonly TerminalSyntheticOutcome[]> {
  if (!Number.isSafeInteger(options.timeoutMs) || options.timeoutMs < 1 || !Number.isSafeInteger(options.retryTimeoutMs) || options.retryTimeoutMs <= options.timeoutMs) throw new Error('retry timeout must be a larger positive safe integer');
  const outcomes = new Map<string, TerminalSyntheticOutcome>();
  const record = (outcome: TerminalSyntheticOutcome) => {
    if (outcomes.has(outcome.fileId)) throw new Error(`duplicate terminal outcome: ${outcome.fileId}`);
    outcomes.set(outcome.fileId, outcome);
  };
  const run = async (ids: readonly string[], timeoutMs: number, singletonRetry: boolean): Promise<void> => {
    let result: Readonly<Record<string, SyntheticScanResult>>;
    try {
      result = await adapter(ids, timeoutMs);
    } catch (error) {
      if (error instanceof SyntheticResumeError) throw error;
      result = Object.fromEntries(ids.map((id) => [id, { kind: 'crash' as const }]));
    }
    if (!validChunkResponse(result, ids)) result = Object.fromEntries(ids.map((id) => [id, { kind: 'crash' as const }]));
    const unstable: string[] = [];
    for (const id of ids) {
      const finished = terminal(id, result[id]!);
      if (finished) record(finished); else unstable.push(id);
    }
    if (unstable.length === 0) return;
    if (unstable.length > 1) {
      const midpoint = Math.ceil(unstable.length / 2);
      await run(unstable.slice(0, midpoint), options.timeoutMs, false);
      await run(unstable.slice(midpoint), options.timeoutMs, false);
      return;
    }
    const id = unstable[0]!;
    if (!singletonRetry) return run([id], options.retryTimeoutMs, true);
    record({ fileId: id, status: result[id]!.kind === 'timeout' ? 'timeout' : 'scanner_failure' });
  };
  for (const chunk of planV103Chunks(fileIds, options.chunkSize)) await run(chunk, options.timeoutMs, false);
  if (outcomes.size !== fileIds.length) throw new Error('missing terminal outcome');
  return fileIds.map((id) => outcomes.get(id)!);
}
