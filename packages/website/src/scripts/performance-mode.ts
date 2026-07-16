/**
 * Pick a conservative rendering mode from browser hints.
 *
 * This is deliberately dependency-free. The site remains fully usable
 * without JavaScript; this only removes decorative work when the browser says
 * motion, data, or battery use should be reduced.
 */

export interface PerformanceModeHints {
  readonly reducedMotion?: boolean;
  readonly reducedData?: boolean;
  readonly saveData?: boolean;
  readonly effectiveType?: string;
}

export function shouldUseLowPowerMode(hints: PerformanceModeHints): boolean {
  return hints.reducedMotion === true
    || hints.reducedData === true
    || hints.saveData === true
    || hints.effectiveType === 'slow-2g'
    || hints.effectiveType === '2g';
}

interface ConnectionHints {
  readonly saveData?: boolean;
  readonly effectiveType?: string;
}

function readConnectionHints(): ConnectionHints | undefined {
  if (typeof navigator === 'undefined') return undefined;
  return (navigator as Navigator & { readonly connection?: ConnectionHints }).connection;
}

export function initPerformanceMode(): () => void {
  if (typeof document === 'undefined') return () => {};

  const root = document.documentElement;
  const previous = root.getAttribute('data-performance-mode');
  const matchMedia = typeof window !== 'undefined' && typeof window.matchMedia === 'function'
    ? window.matchMedia.bind(window)
    : () => ({ matches: false });
  const connection = readConnectionHints();
  const lowPower = shouldUseLowPowerMode({
    reducedMotion: matchMedia('(prefers-reduced-motion: reduce)').matches,
    reducedData: matchMedia('(prefers-reduced-data: reduce)').matches,
    saveData: connection?.saveData,
    effectiveType: connection?.effectiveType,
  });

  if (lowPower) root.setAttribute('data-performance-mode', 'low');
  else root.removeAttribute('data-performance-mode');

  return () => {
    if (previous === null) root.removeAttribute('data-performance-mode');
    else root.setAttribute('data-performance-mode', previous);
  };
}
