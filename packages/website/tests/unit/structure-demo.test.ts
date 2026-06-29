/* ============================================================
   structure-demo.ts — adds `.is-visible` to each `.sd-line`
   as it scrolls into view. Tests cover:
   - finds all .sd-line elements
   - IntersectionObserver fires .is-visible when line enters
   - lines are unobserved after becoming visible
   - no IntersectionObserver → reveals everything immediately
   - prefers-reduced-motion → reveals everything immediately
   - cleanup function disconnects the observer
   ============================================================ */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { initStructureDemo } from '../../src/scripts/structure-demo';
import { installMockIO, stubMatchMedia, uninstallMockIO } from './_helpers';

beforeEach(() => {
  document.body.innerHTML = '';
  stubMatchMedia(false);
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('initStructureDemo', () => {
  it('returns a no-op when no .sd-line exist', () => {
    const cleanup = initStructureDemo();
    expect(typeof cleanup).toBe('function');
    cleanup();
  });

  it('observes every .sd-line element', () => {
    const io = installMockIO();
    document.body.innerHTML = `
      <div class="sd-line">a</div>
      <div class="sd-line">b</div>
      <div class="sd-line">c</div>
    `;
    initStructureDemo();
    expect(io.observe).toHaveBeenCalledTimes(3);
  });

  it('adds .is-visible when a line enters the viewport', () => {
    const io = installMockIO();
    const line = document.createElement('div');
    line.className = 'sd-line';
    document.body.append(line);

    initStructureDemo();
    expect(line.classList.contains('is-visible')).toBe(false);

    io.trigger([line], true);
    expect(line.classList.contains('is-visible')).toBe(true);
  });

  it('unobserves the line after it becomes visible', () => {
    const io = installMockIO();
    const line = document.createElement('div');
    line.className = 'sd-line';
    document.body.append(line);

    initStructureDemo();
    io.trigger([line], true);
    expect(io.unobserve).toHaveBeenCalledWith(line);
  });

  it('does not add .is-visible when isIntersecting is false', () => {
    const io = installMockIO();
    const line = document.createElement('div');
    line.className = 'sd-line';
    document.body.append(line);

    initStructureDemo();
    io.trigger([line], false);
    expect(line.classList.contains('is-visible')).toBe(false);
    expect(io.unobserve).not.toHaveBeenCalled();
  });

  it('reveals all lines immediately when IntersectionObserver is unavailable', () => {
    uninstallMockIO();
    const a = document.createElement('div');
    a.className = 'sd-line';
    const b = document.createElement('div');
    b.className = 'sd-line';
    document.body.append(a, b);

    initStructureDemo();
    expect(a.classList.contains('is-visible')).toBe(true);
    expect(b.classList.contains('is-visible')).toBe(true);
  });

  it('reveals all lines immediately when prefers-reduced-motion: reduce', () => {
    stubMatchMedia(true);
    installMockIO(); // would create one if the early return didn't run

    const a = document.createElement('div');
    a.className = 'sd-line';
    const b = document.createElement('div');
    b.className = 'sd-line';
    document.body.append(a, b);

    initStructureDemo();
    expect(a.classList.contains('is-visible')).toBe(true);
    expect(b.classList.contains('is-visible')).toBe(true);
  });

  it('cleanup function disconnects the IntersectionObserver', () => {
    const io = installMockIO();
    document.body.innerHTML = `<div class="sd-line">x</div>`;
    const cleanup = initStructureDemo();
    expect(io.disconnect).not.toHaveBeenCalled();
    cleanup();
    expect(io.disconnect).toHaveBeenCalledTimes(1);
  });

  it('applies the documented rootMargin / threshold to the observer', () => {
    const io = installMockIO();
    document.body.innerHTML = `<div class="sd-line">x</div>`;
    initStructureDemo();
    expect(io.rootMargin.value).toBe('0px 0px -10% 0px');
    expect(io.threshold.value).toBe(0.1);
  });
});