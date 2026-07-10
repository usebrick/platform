// v0.41.0 (Sprint 2, task 2.0): shared CLI helpers that centralize
// exit-code handling on top of Commander.js's `exitOverride()` and
// `program.error()` APIs.
//
// The architecture review (F3, F11) found that 59 of 75 command
// action callbacks called `process.exit(N)` inline. That makes the
// underlying pure functions (e.g. `runDrift`, `runPrScan`) awkward to
// integration-test — the test has to either spawn a subprocess or
// stub `process.exit`, neither of which is ergonomic.
//
// The fix:
//
//   1. `setExitOverride(program)` — call once at program setup.
//      Installs Commander's `exitOverride()` so any `CommanderError`
//      thrown by Commander itself (missing arg, unknown option) is
//      thrown back to us instead of calling `process.exit()`.
//   2. `dispatch(program, runFn)` — the top-level dispatcher. Runs
//      `runFn(program)` inside a try/catch, converts a thrown
//      `CommanderError` into a logged message + `process.exit(exitCode)`,
//      and lets any other error bubble to the existing outer catch in
//      `runCli` (which already exits 3).
//   3. `withExitCode(result, compute, message)` — for pure-function
//      callers that want to signal "non-zero exit because of the
//      result content" (e.g. drift violations, threshold breach)
//      without taking a dependency on `process.exit`. Throws a
//      `CommanderError` carrying the computed exit code; the
//      dispatcher catches it.
//
// Reference: [Commander.js README §"Override exit and output
// handling"](https://github.com/tj/commander.js#override-exit-and-output-handling)
// — "By default, Commander calls process.exit() when it detects
// errors... You can override this behaviour and optionally supply a
// callback..." This module is the canonical implementation of that
// pattern for slopbrick.
//
// Why a thin wrapper, not a bespoke dispatcher: Commander's
// `program.error({ exitCode, code, message })` already does exactly
// what we want (logs + throws `CommanderError`), and `exitOverride`
// already converts the throw into a callback. We just need a single
// place to install the override and a single place to catch the
// resulting `CommanderError`. That's what `dispatch` is.

import type { Command } from 'commander';
import { CommanderError } from 'commander';
import { logger } from '../../engine/logger';
import { ScanExitCode } from '../exit-codes';

/**
 * Install Commander's `exitOverride()` on the program so that errors
 * surfaced via `program.error()` (or thrown by Commander's own
 * argument-parsing logic) come back as `CommanderError` instances
 * instead of calling `process.exit()` directly. Pair with
 * `dispatch(program, runFn)` to handle those errors at the
 * runCli boundary.
 *
 * Idempotent: safe to call multiple times, but typically called once
 * at the top of `runCli`. The callback receives the error but does
 * nothing — `dispatch` catches the propagated error after
 * `parseAsync` resolves.
 */
export function setExitOverride(program: Command): void {
  program.exitOverride((err) => {
    // Commander uses 1 for usage/parser errors by default. The public CLI
    // reserves 1 for a completed policy breach or partial scan, so normalize
    // user-correctable invocation errors to the documented status 2.
    if (err.code !== 'commander.helpDisplayed' && err.code !== 'commander.help') {
      err.exitCode = ScanExitCode.usageOrConfig;
    }
    throw err;
  });
}

/**
 * Top-level dispatcher. Runs `runFn(program)` inside a try/catch
 * that converts any `CommanderError` (thrown by `withExitCode`, by
 * Commander's argument parsing, or by `program.error()`) into a
 * logged message and a `process.exit(commanderError.exitCode)`.
 *
 * Non-Commander errors propagate to the caller unchanged — the
 * existing outer try/catch in `runCli` already handles them with
 * exit code 3 (`Unexpected error`).
 *
 * Usage (in `program.ts`):
 *
 * ```ts
 * setExitOverride(program);
 * // ... register subcommands ...
 * await dispatch(program, async () => program.parseAsync(process.argv));
 * ```
 */
export async function dispatch(program: Command, runFn: () => Promise<void>): Promise<void> {
  try {
    await runFn();
  } catch (err) {
    if (err instanceof CommanderError) {
      // Commander's `outputError` already prints a formatted message
      // (with the program name, the error code, and the suggestion).
      // We re-emit through our own logger so the formatting matches
      // the rest of slopbrick's stderr, then exit with the suggested
      // code. `commander.helpDisplayed` / `commander.help` codes
      // mean Commander already printed help/version — those exit 0
      // and we don't add a redundant error line.
      if (err.code === 'slopbrick.exit') {
        logger.error(err.message);
      }
      // Commander sets exitCode=0 for help/version; honor it.
      // The explicit `return` makes the contract clear: once we've
      // decided to exit, no further code runs (matters when
      // `process.exit` is stubbed in tests).
      process.exit(err.exitCode);
      return;
    }
    throw err;
  }
}

/**
 * Compute an exit code from a pure-function result; if non-zero,
 * throw a `CommanderError` carrying that exit code so the dispatcher
 * catches it. The thrown error's `message` is what gets logged by
 * the dispatcher (after the standard `slopbrick: error: ` prefix).
 *
 * Design intent (F3): the calling pure function (e.g. `runDrift`)
 * stays `process.exit`-free, so integration tests can call it
 * directly and assert on the returned `DriftResult` without
 * spawning a subprocess.
 *
 * @param result - the pure-function return value (e.g. `DriftResult`)
 * @param compute - `(result) => number` returning the desired exit
 *                  code. Conventionally returns `0 | 1` for
 *                  success/violation, but any number is honored.
 * @param message - human-readable summary printed to stderr on
 *                  non-zero exit. Kept short — one line.
 */
export function withExitCode<T>(result: T, compute: (result: T) => number, message: string): void {
  const code = compute(result);
  if (code === 0) return;
  // Throw a CommanderError so the runCli-level `dispatch` catches it
  // and routes through process.exit(code). We use the `slopbrick.exit`
  // code namespace so future migrations to other Command instances
  // (MCP-style) can distinguish slopbrick-domain errors from
  // commander-domain errors (`commander.unknownOption`, etc.).
  throw new CommanderError(code, 'slopbrick.exit', message);
}
