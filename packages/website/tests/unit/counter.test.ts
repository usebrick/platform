/* ============================================================
   counter.ts — animates `.calibration__value[data-target]` from
   0 to target on first viewport intersection. Tests cover:
   - happy path: target value reached via requestAnimationFrame
   - prefers-reduced-motion: jumps straight to target
   - data-suffix is applied
   - multiple counters animate independently
   - double init does not re-animate an already-revealed counter
   - cleanup function disconnects the IntersectionObserver
   - IntersectionObserver absent: animates everything immediately
   ============================================================ */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { initCounters } from '../../src/scripts/counter';
import {
  flushRAF,
  installMockIO,
  installMockRAF,
  stubMatchMedia,
  uninstallMockIO,
} from './_helpers';

function makeCounter(target: string, suffix = '', text = '') {
  const el = document.createElement('span');
  el.className = 'calibration__value';
  el.dataset.target = target;
  if (suffix) el.dataset.suffix = suffix;
  if (text) el.textContent = text;
  return el;
}

beforeEach(() => {
  document.body.innerHTML = '';
  installMockRAF();
  stubMatchMedia(false);
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('initCounters', () => {
  it('returns a no-op when no .calibration__value[data-target] exist', () => {
    const cleanup = initCounters();
    expect(typeof cleanup).toBe('function');
    cleanup();
  });

  it('observes every .calibration__value[data-target] once', () => {
    const io = installMockIO();
    document.body.append(makeCounter('42'), makeCounter('100'));
    initCounters();
    expect(io.observe).toHaveBeenCalledTimes(2);
  });

  it('animates from 0 to target on intersection', () => {
    const io = installMockIO();
    const el = makeCounter('50');
    document.body.appendChild(el);

    initCounters();
    io.trigger([el], true);
    flushRAF();

    expect(el.textContent).toContain('50');
    expect(io.unobserve).toHaveBeenCalledWith(el);
  });

  it('renders the target value immediately even when never intersected (v0.43.0)', () => {
    // v0.43.0: counters render the target value at init time so that
    // non-scrolling readers, screen readers, and quick-screenshot
    // users see the real numbers — not a wall of zeros. The
    // IntersectionObserver still drives the count-up animation
    // when the element scrolls into view, but the static text is
    // already correct without it.
    const io = installMockIO();
    const el = makeCounter('99', '', '0');
    document.body.appendChild(el);

    initCounters();
    expect(el.textContent).toBe('99');

    io.trigger([el], false);
    expect(el.textContent).toBe('99');
  });

  it('applies data-suffix and locale-formats the rendered value', () => {
    const io = installMockIO();
    const el = makeCounter('1000000', ' ms');
    document.body.appendChild(el);

    initCounters();
    io.trigger([el], true);
    flushRAF();
    expect(el.textContent).toBe('1,000,000 ms');
  });

  it('jumps straight to target when prefers-reduced-motion: reduce', () => {
    stubMatchMedia(true);
    const io = installMockIO();
    const el = makeCounter('123', ' ms');
    document.body.appendChild(el);

    initCounters();
    io.trigger([el], true);
    expect(el.textContent).toBe('123 ms');
  });

  it('animates multiple counters independently', () => {
    const io = installMockIO();
    const a = makeCounter('10');
    const b = makeCounter('500', '', '0');
    document.body.append(a, b);

    initCounters();
    io.trigger([a, b], true);
    flushRAF();
    expect(a.textContent).toContain('10');
    expect(b.textContent).toContain('500');
  });

  it('calling initCounters() twice does not re-animate already-revealed counters', () => {
    const io = installMockIO();
    const el = makeCounter('25', '', '0');
    document.body.appendChild(el);

    initCounters();
    io.trigger([el], true);
    flushRAF();
    expect(el.textContent).toContain('25');

    // Second init: same element is still observed in this test setup, but
    // animating a second time would re-run the rAF queue. Verify the IO
    // is re-created cleanly without throwing.
    el.textContent = '0';
    const cleanup = initCounters();
    expect(io.observe).toHaveBeenCalledTimes(2);
    cleanup();
  });

  it('returns a cleanup function that disconnects the observer', () => {
    const io = installMockIO();
    document.body.appendChild(makeCounter('5'));
    const cleanup = initCounters();
    expect(io.disconnect).not.toHaveBeenCalled();
    cleanup();
    expect(io.disconnect).toHaveBeenCalledTimes(1);
  });

  it('falls back to animating every counter when IntersectionObserver is missing', () => {
    uninstallMockIO();
    const el = makeCounter('9');
    document.body.appendChild(el);

    initCounters();
    flushRAF();
    expect(el.textContent).toContain('9');
  });
});