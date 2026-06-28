/* ============================================================
   BreakOnHover — clicks on a tool card radiate 3 SVG lines
   from the cursor, simulating a hairline crack spreading
   across the brick surface. Uses GSAP for the elastic-out
   shake on the card itself. Respects prefers-reduced-motion.
   ============================================================ */

import { gsap } from 'gsap';

export function initBreakOnHover(): () => void {
  const cards = document.querySelectorAll<HTMLElement>('.tool-card');
  if (cards.length === 0) return () => {};

  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  const cleanups: Array<() => void> = [];

  for (const card of cards) {
    const cracks = card.querySelector<SVGSVGElement>('.tool-card__cracks');
    const lines = card.querySelectorAll<SVGLineElement>('.tool-card__crack');
    if (!cracks || lines.length === 0) continue;

    // Pre-set each line to length 0
    lines.forEach((line) => {
      line.setAttribute('x2', line.getAttribute('x1') || '0');
      line.setAttribute('y2', line.getAttribute('y1') || '0');
    });

    let lastClickAt = 0;
    const onClick = (e: MouseEvent) => {
      if (Date.now() - lastClickAt < 200) return; // debounce
      lastClickAt = Date.now();

      if (reduced) {
        cracks.classList.add('is-broken');
        return;
      }

      const rect = card.getBoundingClientRect();
      const cx = e.clientX - rect.left;
      const cy = e.clientY - rect.top;

      // Shake the card
      gsap.fromTo(
        card,
        { x: 0, y: 0, rotation: 0 },
        {
          x: (Math.random() - 0.5) * 8,
          y: (Math.random() - 0.5) * 6,
          rotation: (Math.random() - 0.5) * 1.5,
          duration: 0.5,
          ease: 'elastic.out(1, 0.3)',
          onComplete: () => {
            gsap.to(card, { x: 0, y: 0, rotation: 0, duration: 0.4, ease: 'power2.out' });
          },
        }
      );

      // Radiate 3 lines from the click point to the card edges
      const w = rect.width;
      const h = rect.height;
      const targets = [
        { x: cx + (Math.random() - 0.5) * w, y: cy + (Math.random() - 0.5) * h },
        { x: cx + (Math.random() - 0.5) * w, y: cy + (Math.random() - 0.5) * h },
        { x: cx + (Math.random() - 0.5) * w, y: cy + (Math.random() - 0.5) * h },
      ];

      lines.forEach((line, i) => {
        const t = targets[i] || targets[0];
        line.setAttribute('x1', `${cx}`);
        line.setAttribute('y1', `${cy}`);
        line.setAttribute('x2', `${cx}`);
        line.setAttribute('y2', `${cy}`);
        gsap.to(line, {
          attr: { x2: t.x, y2: t.y },
          duration: 0.6,
          ease: 'power2.out',
          delay: i * 0.04,
        });
      });

      cracks.classList.add('is-broken');

      // Reset after a beat
      setTimeout(() => {
        cracks.classList.remove('is-broken');
        lines.forEach((line) => {
          gsap.to(line, {
            attr: { x2: line.getAttribute('x1') || '0', y2: line.getAttribute('y1') || '0' },
            duration: 0.3,
            ease: 'power2.in',
          });
        });
      }, 1600);
    };

    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        onClick(e as unknown as MouseEvent);
      }
    };
    card.addEventListener('click', onClick);
    card.addEventListener('keydown', onKey);
    cleanups.push(() => {
      card.removeEventListener('click', onClick);
      card.removeEventListener('keydown', onKey);
    });
  }

  return () => cleanups.forEach((c) => c());
}
