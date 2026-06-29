// Error formatting helpers shared across CLI commands.
//
// Centralizes the `err instanceof Error ? err.message : String(err)`
// pattern that appears in every catch block. Keeps error messages
// consistent and means there's a single place to add tracing later
// (e.g. error codes, telemetry tags).

/**
 * Stringify an unknown thrown value into a one-line message suitable
 * for `logger.error` / `logger.warn`. Never throws.
 *
 * - `Error` → its `.message`
 * - string → as-is
 * - anything else → `String(err)`
 */
export function formatErrorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

/**
 * Write a fatal error to stderr and exit with the given code.
 * Used for "this should never happen" cases (unknown --format,
 * unknown rule id) where the CLI cannot continue.
 */
export function fatal(message: string, exitCode: number = 2): never {
  process.stderr.write(`${message}\n`);
  process.exit(exitCode);
}
