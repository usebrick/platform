import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  initPerformanceMode,
  shouldUseLowPowerMode,
} from '../../src/scripts/performance-mode';

afterEach(() => {
  document.documentElement.removeAttribute('data-performance-mode');
  vi.restoreAllMocks();
});

describe('performance mode', () => {
  it('enables low power for reduced motion, reduced data, Save-Data, or 2G', () => {
    expect(shouldUseLowPowerMode({ reducedMotion: true })).toBe(true);
    expect(shouldUseLowPowerMode({ reducedData: true })).toBe(true);
    expect(shouldUseLowPowerMode({ saveData: true })).toBe(true);
    expect(shouldUseLowPowerMode({ effectiveType: '2g' })).toBe(true);
    expect(shouldUseLowPowerMode({ effectiveType: 'slow-2g' })).toBe(true);
    expect(shouldUseLowPowerMode({ effectiveType: '4g' })).toBe(false);
    expect(shouldUseLowPowerMode({})).toBe(false);
  });

  it('sets and restores the document mode from browser hints', () => {
    Object.defineProperty(window, 'matchMedia', {
      configurable: true,
      value: (query: string) => ({ matches: query.includes('reduced-data') }),
    });

    const cleanup = initPerformanceMode();
    expect(document.documentElement.dataset.performanceMode).toBe('low');
    cleanup();
    expect(document.documentElement.hasAttribute('data-performance-mode')).toBe(false);
  });
});
