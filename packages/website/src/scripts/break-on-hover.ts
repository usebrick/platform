/* ============================================================
   BreakOnHover — click on a tool brick radiates 3 SVG lines
   from the cursor, simulating a hairline crack spreading across
   the brick surface. Pure Web Animations API + rAF — no GSAP.
   Respects prefers-reduced-motion.
   ============================================================ */

export function initBreakOnHover(): () => void {
  const cards = document.querySelectorAll<HTMLElement>('.tool-card');
  if (cards.length === 0) return () => {};

  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const cleanups: Array<() => void> = [];

  for (const card of cards) {
    const cracks = card.querySelector<SVGSVGElement>('.tool-card__cracks');
    const lines = card.querySelectorAll<SVGLineElement>('.tool-card__crack');
    if (!cracks || lines.length === 0) continue;

    // Pre-set each line to zero length
    lines.forEach((line) => {
      line.setAttribute('x2', line.getAttribute('x1') || '0');
      line.setAttribute('y2', line.getAttribute('y1') || '0');
    });

    let lastClickAt = 0;
    const onActivate = (e: MouseEvent | KeyboardEvent) => {
      if (Date.now() - lastClickAt < 200) return;
      lastClickAt = Date.now();

      if (reduced) {
        cracks.classList.add('is-broken');
        setTimeout(() => cracks.classList.remove('is-broken'), 1600);
        return;
      }

      const rect = card.getBoundingClientRect();
      // For keyboard activation, use the card center
      const cx =
        'clientX' in e && e.clientX
          ? e.clientX - rect.left
          : rect.width / 2;
      const cy =
        'clientY' in e && e.clientY
          ? e.clientY - rect.top
          : rect.height / 2;

      const w = rect.width;
      const h = rect.height;

      // Shake the card (cancel previous, then play new)
      const keyframes: Keyframe[] = [
        { transform: 'translate(0,0) rotate(0deg)' },
        {
          transform: `translate(${(Math.random() - 0.5) * 8}px, ${(Math.random() - 0.5) * 6}px) rotate(${(Math.random() - 0.5) * 1.5}deg)`,
        },
        { transform: 'translate(0,0) rotate(0deg)' },
      ];
      card.animate(keyframes, {
        duration: 800,
        easing: 'cubic-bezier(0.34, 1.56, 0.64, 1)',
      });

      // Radiate 3 lines from the click point toward the card edges
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
        line.animate(
          [
            { attr: { x2: cx, y2: cy } },
            { attr: { x2: t.x, y2: t.y } },
          ],
          { duration: 600, delay: i * 40, easing: 'cubic-bezier(0.16, 1, 0.3, 1)', fill: 'forwards' },
        );
      });

      cracks.classList.add('is-broken');

      // Reset after a beat
      setTimeout(() => {
        cracks.classList.remove('is-broken');
        lines.forEach((line) => {
          const x1 = line.getAttribute('x1') || '0';
          const y1 = line.getAttribute('y1') || '0';
          line.animate(
            [{ attr: { x2: x1, y2: y1 } }],
            { duration: 300, easing: 'cubic-bezier(0.4, 0, 1, 1)', fill: 'forwards' },
          );
        });
      }, 1600);
    };

    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        onActivate(e);
      }
    };
    card.addEventListener('click', onActivate);
    card.addEventListener('keydown', onKey);
    cleanups.push(() => {
      card.removeEventListener('click', onActivate);
      card.removeEventListener('keydown', onKey);
    });
  }

  return () => cleanups.forEach((c) => c());
}
