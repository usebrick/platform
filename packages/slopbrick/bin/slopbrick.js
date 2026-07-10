#!/usr/bin/env node
// Top-level error guards: converts unhandled exceptions into a
// human-readable message + a non-zero exit code, instead of the
// default Node "UnhandledPromiseRejectionWarning" + stack trace.
// Without this, a transitive module-throwing-on-load (e.g. a
// config importer with a syntax error) showed a stack trace and
// exited with code 1 + a useless warning, confusing new users.
(async () => {
  const start = performance.now();
  try {
    const { runCli, installBrokenPipeHandler, installProcessFaultHandlers } = await import('../dist/index.js');
    installBrokenPipeHandler(process.stdout);
    installBrokenPipeHandler(process.stderr);
    installProcessFaultHandlers(process);
    await runCli({ start });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    process.stderr.write(`slopbrick: unhandled error — ${msg}\n`);
    process.exit(3);
  }
})();
