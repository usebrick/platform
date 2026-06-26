import { describe, expect, it, vi } from 'vitest';
import { createLogger, logger, setLoggerQuiet } from '../../src/engine/logger';

describe('createLogger', () => {
  it('emits info/warn/error when not quiet', () => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => {});
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});

    const instance = createLogger(false);
    instance.info('info msg');
    instance.warn('warn msg');
    instance.error('error msg');

    expect(log).toHaveBeenCalledWith('info msg');
    expect(warn).toHaveBeenCalledWith('warn msg');
    expect(error).toHaveBeenCalledWith('error msg');

    log.mockRestore();
    warn.mockRestore();
    error.mockRestore();
  });

  it('suppresses info/warn but not error when quiet', () => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => {});
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});

    const instance = createLogger(true);
    instance.info('info msg');
    instance.warn('warn msg');
    instance.error('error msg');

    expect(log).not.toHaveBeenCalled();
    expect(warn).not.toHaveBeenCalled();
    expect(error).toHaveBeenCalledWith('error msg');

    log.mockRestore();
    warn.mockRestore();
    error.mockRestore();
  });
});

describe('global logger', () => {
  it('can be switched to quiet mode', () => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => {});
    setLoggerQuiet(true);
    logger.info('quieted');
    expect(log).not.toHaveBeenCalled();
    setLoggerQuiet(false);
    log.mockRestore();
  });
});
