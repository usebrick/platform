// v0.41.0 (Sprint 2, task 2.0): tests for the exitOverride
// dispatcher in `src/cli/commands/_shared.ts`. The architectural
// intent is that pure-function callers (e.g. `runDrift`) can
// signal a non-zero exit code via a thrown `CommanderError`
// instead of an inline `process.exit(N)`. These tests pin that
// contract.

import { describe, it, expect } from 'vitest';
import { Command, CommanderError } from 'commander';
import { setExitOverride, dispatch, withExitCode } from '../../src/cli/commands/_shared';

describe('withExitCode', () => {
  it('returns silently when compute returns 0', () => {
    const result = { n: 0 };
    expect(() => withExitCode(result, (r) => (r.n > 0 ? 1 : 0), 'should not throw')).not.toThrow();
  });

  it('throws a CommanderError when compute returns non-zero', () => {
    const result = { n: 5 };
    expect(() => withExitCode(result, (r) => (r.n > 0 ? 1 : 0), '5 violations')).toThrow(CommanderError);
  });

  it('carries the computed exit code on the thrown error', () => {
    const result = { n: 5 };
    try {
      withExitCode(result, (r) => (r.n > 0 ? 2 : 0), '5 violations');
      throw new Error('expected to throw');
    } catch (err) {
      expect(err).toBeInstanceOf(CommanderError);
      const ce = err as CommanderError;
      expect(ce.exitCode).toBe(2);
      expect(ce.message).toBe('5 violations');
      // The `code` field uses the `slopbrick.exit` namespace to
      // distinguish slopbrick-domain exits from commander-domain
      // ones (e.g. `commander.unknownOption`).
      expect(ce.code).toBe('slopbrick.exit');
    }
  });

  it('does not throw when compute is a constant function returning 0', () => {
    expect(() => withExitCode({}, () => 0, 'no-op')).not.toThrow();
  });
});

describe('setExitOverride + dispatch', () => {
  it('installs exitOverride so program.error throws instead of calling process.exit', async () => {
    const program = new Command();
    setExitOverride(program);

    // program.error should now throw a CommanderError rather than
    // hard-exiting. We assert by NOT mocking process.exit — if the
    // override didn't fire, this test would terminate.
    expect(() => program.error('boom', { exitCode: 7 })).toThrow(CommanderError);
  });

  it('dispatch catches a thrown CommanderError and exits with its exitCode', async () => {
    const program = new Command();
    setExitOverride(program);

    // Mock process.exit so we can capture the code without
    // terminating the test runner.
    const exitCalls: number[] = [];
    const originalExit = process.exit;
    process.exit = ((code?: number) => {
      exitCalls.push(code ?? 0);
      // Returning undefined mimics Node's process.exit (it doesn't
      // actually return, but the mock needs to).
      return undefined as never;
    }) as typeof process.exit;

    try {
      await dispatch(program, async () => {
        throw new CommanderError(3, 'slopbrick.exit', 'test failure');
      });
    } finally {
      process.exit = originalExit;
    }

    expect(exitCalls).toEqual([3]);
  });

  it('dispatch re-throws non-Commander errors so the outer catch handles them', async () => {
    const program = new Command();
    setExitOverride(program);

    const sentinel = new Error('not a CommanderError');
    await expect(
      dispatch(program, async () => {
        throw sentinel;
      }),
    ).rejects.toBe(sentinel);
  });

  it('dispatch returns void when runFn resolves cleanly', async () => {
    const program = new Command();
    setExitOverride(program);
    await expect(
      dispatch(program, async () => {
        // no-op
      }),
    ).resolves.toBeUndefined();
  });

  it('end-to-end: parseAsync → withExitCode → dispatch routes exit code', async () => {
    // This is the drift-style integration: a subcommand's action
    // callback calls withExitCode, the thrown CommanderError
    // bubbles up through parseAsync, and dispatch catches it and
    // exits with the right code.
    const program = new Command();
    setExitOverride(program);
    program
      .command('fake-drift')
      .action(() => {
        withExitCode({ violations: 7 }, (r) => (r.violations > 0 ? 1 : 0), 'fake-drift: 7 violations');
      });

    const exitCalls: number[] = [];
    const originalExit = process.exit;
    process.exit = ((code?: number) => {
      exitCalls.push(code ?? 0);
      return undefined as never;
    }) as typeof process.exit;

    try {
      await dispatch(program, () => program.parseAsync(['node', 'slopbrick', 'fake-drift']));
    } finally {
      process.exit = originalExit;
    }

    expect(exitCalls).toEqual([1]);
  });
});