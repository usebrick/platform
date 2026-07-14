import type { FileScanResult } from '../types';

/**
 * Whether a file produced a trustworthy scan result.
 *
 * Worker retries classify terminal failures with `failureKind`, while older
 * callers only populated `parseError`.  Score exposure and secondary
 * denominators must reject both representations; a result with a classified
 * failure is never an analysed file even when the legacy error field is
 * absent.
 */
export function isSuccessfullyAnalyzed(
  result: Pick<FileScanResult, 'parseError' | 'failureKind'>,
): boolean {
  return result.failureKind === undefined && result.parseError === undefined;
}

/** Count files that are safe to use as score exposure. */
export function countSuccessfullyAnalyzed(
  results: readonly Pick<FileScanResult, 'parseError' | 'failureKind'>[],
): number {
  return results.reduce(
    (count, result) => count + (isSuccessfullyAnalyzed(result) ? 1 : 0),
    0,
  );
}
