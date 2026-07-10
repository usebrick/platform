/**
 * Stable scan/CI process-status contract.
 *
 * A per-file scanner failure is not a tool crash: it produces a partial scan
 * and therefore uses the policy/partial status (1). Status 3 is reserved for
 * failures which prevent the CLI itself from completing its work.
 */
export const ScanExitCode = {
  clean: 0,
  policyOrPartial: 1,
  usageOrConfig: 2,
  internal: 3,
} as const;

export type ScanExitCode = (typeof ScanExitCode)[keyof typeof ScanExitCode];

/** A user-correctable invocation error, distinct from an internal fault. */
export class CliUsageError extends Error {
  public override readonly name = 'CliUsageError';
}
