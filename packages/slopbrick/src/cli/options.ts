// CLI option parsers for Commander. Each maps a raw string from the
// command line into a typed value, throwing InvalidArgumentError so
// Commander surfaces a clean usage error to the user.

import { InvalidArgumentError } from 'commander';

/** Parse `--threads <n>`: positive integer, otherwise rejected. */
export function parseThreads(value: string): number {
  const parsed = parseInt(value, 10);
  if (Number.isNaN(parsed) || parsed <= 0) {
    throw new InvalidArgumentError('must be a positive integer');
  }
  return parsed;
}

/** Collector for repeatable `--include <glob>` / `--exclude <glob>`. */
export function collectGlob(value: string, previous: string[] = []): string[] {
  return [...previous, value];
}

/** Parse `--trend [n]`: defaults to 20 if absent, otherwise positive integer. */
export function parseTrend(value: string | undefined): number {
  if (value === undefined) return 20;
  const parsed = parseInt(value, 10);
  if (Number.isNaN(parsed) || parsed <= 0) {
    throw new InvalidArgumentError('must be a positive integer');
  }
  return parsed;
}

/** Parse `--count <n>` and similar: positive integer, otherwise rejected. */
export function parseCount(value: string): number {
  const n = parseInt(value, 10);
  if (Number.isNaN(n) || n <= 0) throw new InvalidArgumentError('Count must be a positive integer');
  return n;
}

/**
 * Parse `--threshold <n>` for the `pr` subcommand: non-negative
 * integer (zero is allowed because the pr subcommand exposes
 * threshold 0 as a "fail on any issue" mode for tight CI gates).
 */
export function parseThreshold(value: string): number {
  const n = parseInt(value, 10);
  if (Number.isNaN(n) || n < 0 || !Number.isInteger(n)) {
    throw new InvalidArgumentError('Threshold must be a non-negative integer');
  }
  return n;
}