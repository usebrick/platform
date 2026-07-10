import { ScanExitCode } from './exit-codes';

type ProcessFaultListener = (reason: unknown) => void;

/** The deliberately small process boundary the executable needs. */
export interface ProcessFaultHost {
  on(event: 'unhandledRejection' | 'uncaughtException', listener: ProcessFaultListener): unknown;
  stderr: { write(message: string): unknown };
  exit(code: number): never;
}

function faultMessage(kind: 'unhandled rejection' | 'uncaught exception', reason: unknown): string {
  const message = reason instanceof Error ? reason.message : String(reason);
  return `slopbrick: ${kind} — ${message}\n`;
}

/**
 * Install the executable's last-resort process fault handlers.
 *
 * These are intentionally limited to Node's two fatal asynchronous fault
 * events; command and configuration errors remain the responsibility of the
 * CLI dispatcher and must not be swallowed here.
 */
export function installProcessFaultHandlers(host: ProcessFaultHost): void {
  host.on('unhandledRejection', (reason) => {
    host.stderr.write(faultMessage('unhandled rejection', reason));
    host.exit(ScanExitCode.internal);
  });
  host.on('uncaughtException', (error) => {
    host.stderr.write(faultMessage('uncaught exception', error));
    host.exit(ScanExitCode.internal);
  });
}
