/* ============================================================
   Shared test helpers for the unit-test suite. Centralises:
   - matchMedia stub (no reduced motion by default)
   - IntersectionObserver mock factory (records observe/unobserve/disconnect)
   - requestAnimationFrame queue + drain helper
   ============================================================ */

import { vi } from 'vitest';

export type IOCallback = (
  entries: Array<{ target: Element; isIntersecting: boolean }>,
) => void;

export interface MockIO {
  observe: ReturnType<typeof vi.fn>;
  unobserve: ReturnType<typeof vi.fn>;
  disconnect: ReturnType<typeof vi.fn>;
  rootMargin: { value: string };
  threshold: { value: number | number[] };
  trigger: (targets: Element[], intersecting: boolean) => void;
}

/** Install a fake IntersectionObserver that records its callback + options. */
export function installMockIO(): MockIO {
  let cb: IOCallback | null = null;
  const observe = vi.fn();
  const unobserve = vi.fn();
  const disconnect = vi.fn();
  const rootMargin = { value: '' };
  const threshold = { value: 0 as number | number[] };
  class FakeIO {
    constructor(
      callback: IOCallback,
      opts?: { rootMargin?: string; threshold?: number | number[] },
    ) {
      cb = callback;
      if (opts?.rootMargin) rootMargin.value = opts.rootMargin;
      if (typeof opts?.threshold === 'number') threshold.value = opts.threshold;
    }
    observe(el: Element) {
      observe(el);
    }
    unobserve(el: Element) {
      unobserve(el);
    }
    disconnect() {
      disconnect();
    }
  }
  (globalThis as unknown as { IntersectionObserver: typeof FakeIO }).IntersectionObserver = FakeIO;
  return {
    observe,
    unobserve,
    disconnect,
    rootMargin,
    threshold,
    trigger(targets, intersecting) {
      if (cb) cb(targets.map((target) => ({ target, isIntersecting: intersecting })));
    },
  };
}

/** Remove the (possibly-installed) IntersectionObserver global. */
export function uninstallMockIO(): void {
  delete (globalThis as unknown as { IntersectionObserver?: unknown }).IntersectionObserver;
}

/** Stub `window.matchMedia` for one test. */
export function stubMatchMedia(reduced = false): void {
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    value: (q: string) => ({
      matches: reduced,
      media: q,
      addEventListener: () => {},
      removeEventListener: () => {},
      addListener: () => {},
      removeListener: () => {},
      dispatchEvent: () => false,
    }),
  });
}

let rafQueue: FrameRequestCallback[] = [];

/** Install a queue-based rAF that the test can drain deterministically. */
export function installMockRAF(): void {
  rafQueue = [];
  globalThis.requestAnimationFrame = ((cb: FrameRequestCallback) => {
    rafQueue.push(cb);
    return rafQueue.length;
  }) as unknown as typeof requestAnimationFrame;
  globalThis.cancelAnimationFrame = (() => {}) as unknown as typeof cancelAnimationFrame;
}

/**
 * Drain the rAF queue, advancing `performance.now()` by `stepMs` each tick so
 * scripts that depend on elapsed time (e.g. counter.ts's 1200ms animation)
 * actually complete within the loop.
 */
export function flushRAF(stepMs = 100): void {
  let time = 0;
  const spy = vi.spyOn(performance, 'now').mockImplementation(() => (time += stepMs));
  try {
    for (let safety = 0; safety < 60; safety++) {
      if (rafQueue.length === 0) return;
      const queue = rafQueue.splice(0, rafQueue.length);
      for (const fn of queue) fn(performance.now());
    }
  } finally {
    spy.mockRestore();
  }
}