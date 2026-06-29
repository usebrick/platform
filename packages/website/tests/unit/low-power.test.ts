import { describe, expect, it, vi } from 'vitest';

describe('isLowPower', () => {
  it('returns true when prefers-reduced-motion is set', async () => {
    vi.stubGlobal('window', {
      matchMedia: (q: string) => ({ matches: q.includes('reduce') }),
      devicePixelRatio: 1,
    });
    vi.stubGlobal('navigator', { deviceMemory: 8, hardwareConcurrency: 8 });
    vi.stubGlobal('document', { createElement: () => ({ getContext: () => ({}) }) });
    const { isLowPower } = await import('../../src/scripts/low-power');
    expect(isLowPower()).toBe(true);
    vi.unstubAllGlobals();
  });

  it('returns true when deviceMemory < 4', async () => {
    vi.stubGlobal('window', {
      matchMedia: () => ({ matches: false }),
      devicePixelRatio: 1,
    });
    vi.stubGlobal('navigator', { deviceMemory: 2, hardwareConcurrency: 8 });
    vi.stubGlobal('document', { createElement: () => ({ getContext: () => ({}) }) });
    const { isLowPower } = await import('../../src/scripts/low-power');
    expect(isLowPower()).toBe(true);
    vi.unstubAllGlobals();
  });

  it('returns true when WebGL is unavailable', async () => {
    vi.stubGlobal('window', {
      matchMedia: () => ({ matches: false }),
      devicePixelRatio: 1,
    });
    vi.stubGlobal('navigator', { deviceMemory: 8, hardwareConcurrency: 8 });
    vi.stubGlobal('document', { createElement: () => ({ getContext: () => null }) });
    const { isLowPower } = await import('../../src/scripts/low-power');
    expect(isLowPower()).toBe(true);
    vi.unstubAllGlobals();
  });

  it('returns false on a high-power device with WebGL', async () => {
    vi.stubGlobal('window', {
      matchMedia: () => ({ matches: false }),
      devicePixelRatio: 1,
    });
    vi.stubGlobal('navigator', { deviceMemory: 8, hardwareConcurrency: 8 });
    vi.stubGlobal('document', { createElement: () => ({ getContext: () => ({}) }) });
    const { isLowPower } = await import('../../src/scripts/low-power');
    expect(isLowPower()).toBe(false);
    vi.unstubAllGlobals();
  });
});
