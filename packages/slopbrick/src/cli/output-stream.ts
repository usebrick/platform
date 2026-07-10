/**
 * Make Unix pipelines pleasant: a downstream consumer such as `head` may
 * close stdout before a report finishes writing. That is a successful
 * consumer decision, not a scanner failure. Other stream errors remain
 * visible rather than being silently converted into success.
 */
export function installBrokenPipeHandler(
  stream: Pick<NodeJS.EventEmitter, 'on'>,
  setExitCode: (code: number) => void = (code) => { process.exitCode = code; },
): void {
  stream.on('error', (error: NodeJS.ErrnoException) => {
    if (error.code === 'EPIPE') {
      setExitCode(0);
      return;
    }
    throw error;
  });
}
