/**
 * v0.14.5+: Returns true if the device is likely too low-power to render
 * the WebGL brick shader smoothly. Combines:
 *   - prefers-reduced-motion (user preference)
 *   - deviceMemory < 4 GB
 *   - hardwareConcurrency < 4
 *   - devicePixelRatio > 2 (high-DPI displays are GPU-hungry)
 *   - canvas.getContext('webgl') === null
 *
 * Conservative: returns true on any unknown signal. False positives mean
 * a static SVG hero; false negatives mean a janky WebGL hero. We
 * optimize for the former.
 */

// `navigator.deviceMemory` is part of the Device Memory API but is not
// included in TypeScript's lib.dom.d.ts. Augment the global Navigator
// interface locally so the implementation stays verbatim.
declare global {
  interface Navigator {
    /** [MDN](https://developer.mozilla.org/docs/Web/API/Navigator/deviceMemory) */
    readonly deviceMemory?: number;
  }
}

export function isLowPower(): boolean {
  if (typeof window === 'undefined') return true;
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return true;
  if (navigator.deviceMemory !== undefined && navigator.deviceMemory < 4) return true;
  if (navigator.hardwareConcurrency !== undefined && navigator.hardwareConcurrency < 4) return true;
  if (window.devicePixelRatio > 2) return true;
  const test = document.createElement('canvas');
  const gl = test.getContext('webgl') || test.getContext('experimental-webgl');
  if (!gl) return true;
  return false;
}
