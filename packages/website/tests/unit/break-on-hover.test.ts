/* ============================================================
   break-on-hover.ts — click on a .tool-card radiates 3 SVG
   cracks via the Web Animations API. Tests cover:
   - finds all .tool-card elements
   - click adds .is-broken, removes after the animation cycle
   - keyboard activation (Enter/Space) also triggers
   - debounced: a second click within 200ms is ignored
   - prefers-reduced-motion path (no .animate() calls, just class)
   - cleanup removes both click and keydown listeners
   ============================================================ */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { initBreakOnHover } from '../../src/scripts/break-on-hover';
import { stubMatchMedia } from './_helpers';

function buildToolCard(lineCount = 3) {
  const card = document.createElement('div');
  card.className = 'tool-card';
  card.setAttribute('tabindex', '0');
  card.setAttribute('role', 'button');

  const svgNS = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(svgNS, 'svg');
  svg.classList.add('tool-card__cracks');
  for (let i = 0; i < lineCount; i++) {
    const line = document.createElementNS(svgNS, 'line');
    line.classList.add('tool-card__crack');
    line.setAttribute('x1', `${10 + i}`);
    line.setAttribute('y1', `${20 + i}`);
    line.setAttribute('x2', `${10 + i}`);
    line.setAttribute('y2', `${20 + i}`);
    svg.appendChild(line);
  }
  card.appendChild(svg);
  return { card, svg };
}

function installNoopAnimate() {
  const animate = vi.fn().mockReturnValue({
    addEventListener: () => {},
    removeEventListener: () => {},
    cancel: () => {},
    finish: () => {},
  });
  (Element.prototype as unknown as { animate: typeof animate }).animate = animate;
  (SVGElement.prototype as unknown as { animate: typeof animate }).animate = animate;
  return animate;
}

beforeEach(() => {
  document.body.innerHTML = '';
  installNoopAnimate();
  vi.useFakeTimers();
  stubMatchMedia(false);
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('initBreakOnHover', () => {
  it('returns a no-op when no .tool-card exist', () => {
    const cleanup = initBreakOnHover();
    expect(typeof cleanup).toBe('function');
    cleanup();
  });

  it('attaches handlers to every .tool-card (click adds .is-broken)', () => {
    const a = buildToolCard().card;
    const b = buildToolCard().card;
    document.body.append(a, b);
    initBreakOnHover();

    a.click();
    b.click();
    expect(a.querySelector('.tool-card__cracks')!.classList.contains('is-broken')).toBe(true);
    expect(b.querySelector('.tool-card__cracks')!.classList.contains('is-broken')).toBe(true);
  });

  it('collapses all crack lines to zero length on init', () => {
    const { card } = buildToolCard(3);
    document.body.append(card);
    initBreakOnHover();
    for (const line of Array.from(card.querySelectorAll('.tool-card__crack'))) {
      expect(line.style.strokeDasharray).toBe('0');
      expect(line.style.strokeDashoffset).toBe('0');
    }
  });

  it('click adds .is-broken and removes it after the animation cycle', () => {
    const animate = installNoopAnimate();
    const { card, svg } = buildToolCard();
    document.body.append(card);
    initBreakOnHover();

    card.click();
    expect(svg.classList.contains('is-broken')).toBe(true);
    expect(animate).toHaveBeenCalled();

    // Source schedules nested setTimeouts: 1600ms outer, +320ms inner.
    vi.advanceTimersByTime(2000);
    expect(svg.classList.contains('is-broken')).toBe(false);
  });

  it('Enter and Space keys activate the break animation', () => {
    const animate = installNoopAnimate();
    const enter = buildToolCard();
    const space = buildToolCard();
    document.body.append(enter.card, space.card);
    initBreakOnHover();

    enter.card.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    space.card.dispatchEvent(new KeyboardEvent('keydown', { key: ' ', bubbles: true }));
    expect(enter.svg.classList.contains('is-broken')).toBe(true);
    expect(space.svg.classList.contains('is-broken')).toBe(true);
    expect(animate).toHaveBeenCalled();
  });

  it('debounces a second click within 200ms', () => {
    const animate = installNoopAnimate();
    const { card } = buildToolCard();
    document.body.append(card);
    initBreakOnHover();

    card.click();
    const callsAfterFirst = animate.mock.calls.length;
    card.click();
    expect(animate.mock.calls.length).toBe(callsAfterFirst);
  });

  it('reduced-motion skips animate() calls but still toggles .is-broken', () => {
    stubMatchMedia(true);
    const animate = installNoopAnimate();
    const { card, svg } = buildToolCard();
    document.body.append(card);
    initBreakOnHover();

    card.click();
    expect(svg.classList.contains('is-broken')).toBe(true);
    expect(animate).not.toHaveBeenCalled();

    vi.advanceTimersByTime(1600);
    expect(svg.classList.contains('is-broken')).toBe(false);
  });

  it('cleanup removes the click and keydown listeners', () => {
    const { card, svg } = buildToolCard();
    document.body.append(card);
    const cleanup = initBreakOnHover();
    cleanup();

    card.click();
    card.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    expect(svg.classList.contains('is-broken')).toBe(false);
  });

  it('skips .tool-card without a cracks SVG without throwing', () => {
    const bare = document.createElement('div');
    bare.className = 'tool-card';
    document.body.append(bare);
    expect(() => initBreakOnHover()).not.toThrow();
  });
});