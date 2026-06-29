/* ============================================================
   copy-install.ts — click handler that copies the value of
   [data-copy] to the clipboard and toggles `.is-copied` for
   ~1.5s. Tests cover:
   - happy path: navigator.clipboard.writeText receives the value
   - .is-copied is added on click, removed after 1500ms
   - falls back to document.execCommand('copy') when clipboard missing
   - works on non-button elements (script doesn't restrict to <button>)
   - returns a cleanup function that removes click listeners
   ============================================================ */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { initCopyInstall } from '../../src/scripts/copy-install';

beforeEach(() => {
  document.body.innerHTML = '';
  Object.defineProperty(navigator, 'clipboard', {
    configurable: true,
    value: { writeText: vi.fn().mockResolvedValue(undefined) },
  });
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('initCopyInstall', () => {
  it('returns a no-op when no [data-copy] exist', () => {
    const cleanup = initCopyInstall();
    expect(typeof cleanup).toBe('function');
    cleanup();
  });

  it('copies the data-copy value via navigator.clipboard.writeText on click', async () => {
    const btn = document.createElement('button');
    btn.dataset.copy = 'pnpm add -g slopbrick';
    document.body.appendChild(btn);

    initCopyInstall();
    btn.click();
    await Promise.resolve();

    expect(navigator.clipboard.writeText).toHaveBeenCalledWith('pnpm add -g slopbrick');
    expect(btn.classList.contains('is-copied')).toBe(true);
  });

  it('removes .is-copied after 1500ms (not before)', async () => {
    const btn = document.createElement('button');
    btn.dataset.copy = 'npm i slopbrick';
    document.body.appendChild(btn);

    initCopyInstall();
    btn.click();
    await Promise.resolve();

    vi.advanceTimersByTime(1499);
    expect(btn.classList.contains('is-copied')).toBe(true);
    vi.advanceTimersByTime(1);
    expect(btn.classList.contains('is-copied')).toBe(false);
  });

  it('falls back to document.execCommand("copy") when clipboard is unavailable', async () => {
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: undefined });
    const execCommand = vi.fn();
    document.execCommand = execCommand;

    const div = document.createElement('div');
    div.dataset.copy = 'echo hi';
    document.body.appendChild(div);

    initCopyInstall();
    div.click();
    await Promise.resolve();

    expect(execCommand).toHaveBeenCalledWith('copy');
    expect(div.classList.contains('is-copied')).toBe(true);
  });

  it('works on a non-button element (the script does not gate on tagName)', async () => {
    const span = document.createElement('span');
    span.dataset.copy = 'curl install.sh';
    document.body.appendChild(span);

    initCopyInstall();
    span.click();
    await Promise.resolve();

    expect(navigator.clipboard.writeText).toHaveBeenCalledWith('curl install.sh');
    expect(span.classList.contains('is-copied')).toBe(true);
  });

  it('attaches the handler to every [data-copy] element', async () => {
    const a = document.createElement('button');
    a.dataset.copy = 'A';
    const b = document.createElement('a');
    b.dataset.copy = 'B';
    document.body.append(a, b);

    initCopyInstall();
    a.click();
    b.click();
    await Promise.resolve();

    expect(navigator.clipboard.writeText).toHaveBeenNthCalledWith(1, 'A');
    expect(navigator.clipboard.writeText).toHaveBeenNthCalledWith(2, 'B');
  });

  it('cleanup removes the click listener', async () => {
    const btn = document.createElement('button');
    btn.dataset.copy = 'x';
    document.body.appendChild(btn);

    const cleanup = initCopyInstall();
    cleanup();

    btn.click();
    await Promise.resolve();
    expect(navigator.clipboard.writeText).not.toHaveBeenCalled();
  });

  it('logs and survives a clipboard rejection', async () => {
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText: vi.fn().mockRejectedValue(new Error('denied')) },
    });

    const btn = document.createElement('button');
    btn.dataset.copy = 'x';
    document.body.appendChild(btn);

    initCopyInstall();
    btn.click();
    await vi.runAllTimersAsync();
    await Promise.resolve();

    expect(errSpy).toHaveBeenCalled();
    expect(btn.classList.contains('is-copied')).toBe(false);
  });
});