/* ============================================================
   counter.ts — animates `.calibration__value[data-target]` from
   0 to target on first viewport intersection. Tests cover:
   - happy path: target value reached via requestAnimationFrame
   - prefers-reduced-motion: jumps straight to target
   - data-suffix is applied
   - multiple counters animate independently
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
    document.body.innerHTML = `
      <span class="calibration__value" data-target="42">0</span>
      <span class="calibration__value" data-target="100">0</span>
    `;
    initCounters();
    expect(io.observe).toHaveBeenCalledTimes(2);
    flushRAF();
  });

  it('animates from 0 to target on intersection', () => {
    const io = installMockIO();
    const el = document.createElement('span');
    el.className = 'calibration__value';
    el.dataset.target = '50';
    document.body.appendChild(el);

    initCounters();
    io.trigger([el], true);
    flushRAF();

    expect(el.textContent).toContain('50');
    expect(io.unobserve).toHaveBeenCalledWith(el);
  });

  it('does not animate for non-intersecting entries', () => {
    const io = installMockIO();
    const el = document.createElement('span');
    el.className = 'calibration__value';
    el.dataset.target = '99';
    el.textContent = '0';
    document.body.appendChild(el);

    initCounters();
    io.trigger([el], false);
    expect(el.textContent).toBe('0');
  });

  it('applies data-suffix to the rendered value', () => {
    const io = installMockIO();
    const el = document.createElement('span');
    el.className = 'calibration__value';
    el.dataset.target = '7';
    el.dataset.suffix = '%';
    document.body.appendChild(el);

    initCounters();
    io.trigger([el], true);
    flushRAF();
    expect(el.textContent).toBe('7%');
  });

  it('jumps straight to target when prefers-reduced-motion: reduce', () => {
    stubMatchMedia(true);
    const io = installMockIO();
    const el = document.createElement('span');
    el.className = 'calibration__value';
    el.dataset.target = '123';
    el.dataset.suffix = ' ms';
    document.body.appendChild(el);

    initCounters();
    io.trigger([el], true);
    expect(el.textContent).toBe('123 ms');
  });

  it('formats large numbers with locale separators', () => {
    const io = installMockIO();
    const el = document.createElement('span');
    el.className = 'calibration__value';
    el.dataset.target = '1000000';
    document.body.appendChild(el);

    initCounters();
    io.trigger([el], true);
    flushRAF();
    expect(el.textContent).toContain('1,000,000');
  });

  it('animates multiple counters independently', () => {
    const io = installMockIO();
    const a = document.createElement('span');
    a.className = 'calibration__value';
    a.dataset.target = '10';
    const b = document.createElement('span');
    b.className = 'calibration__value';
    b.dataset.target = '500';
    b.textContent = '0';
    document.body.append(a, b);

    initCounters();
    io.trigger([a, b], true);
    flushRAF();
    expect(a.textContent).toContain('10');
    expect(b.textContent).toContain('500');
  });

  it('returns a cleanup function that disconnects the observer', () => {
    const io = installMockIO();
    document.body.innerHTML = `<span class="calibration__value" data-target="5">0</span>`;
    const cleanup = initCounters();
    expect(io.disconnect).not.toHaveBeenCalled();
    cleanup();
    expect(io.disconnect).toHaveBeenCalledTimes(1);
  });

  it('falls back to animating every counter when IntersectionObserver is missing', () => {
    uninstallMockIO();
    const el = document.createElement('span');
    el.className = 'calibration__value';
    el.dataset.target = '9';
    document.body.appendChild(el);

    initCounters();
    flushRAF();
    expect(el.textContent).toContain('9');
  });

  it('skips elements with non-numeric data-target', () => {
    const io = installMockIO();
    const el = document.createElement('span');
    el.className = 'calibration__value';
    el.dataset.target = 'not-a-number';
    el.textContent = 'untouched';
    document.body.appendChild(el);

    initCounters();
    io.trigger([el], true);
    expect(el.textContent).toBe('untouched');
  });
});