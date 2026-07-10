import { afterEach, describe, expect, it, vi } from 'vitest';
import { flushRAF, installMockRAF } from './_helpers';

afterEach(() => {
  vi.restoreAllMocks();
});

describe('requestAnimationFrame test helper', () => {
  it('advances from the performance clock epoch already observed by production code', () => {
    installMockRAF();
    vi.spyOn(performance, 'now').mockReturnValue(10_000);
    const animationStart = performance.now();
    let frameTime = Number.NEGATIVE_INFINITY;
    requestAnimationFrame((now) => {
      frameTime = now;
    });

    flushRAF();

    expect(frameTime).toBeGreaterThan(animationStart);
  });
});
