export interface Logger {
  info(message: string): void;
  warn(message: string): void;
  error(message: string): void;
}

export function createLogger(quiet = false): Logger {
  return {
    info(message: string) {
      if (!quiet) console.log(message);
    },
    warn(message: string) {
      if (!quiet) console.warn(message);
    },
    error(message: string) {
      // Errors are always emitted, even under --quiet.
      console.error(message);
    },
  };
}

export let logger = createLogger();

export function setLoggerQuiet(quiet: boolean): void {
  logger = createLogger(quiet);
}
