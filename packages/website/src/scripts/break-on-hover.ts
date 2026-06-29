/* ============================================================
   BreakOnHover — click on a tool brick radiates 3 SVG lines
   from the cursor, simulating a hairline crack spreading across
   the brick surface. Pure Web Animations API — no GSAP.
   Respects prefers-reduced-motion.

   Visual:
   1. Brick shakes (Web Animations API, transform)
   2. Cracks container fades in (opacity)
   3. Each line "draws" from the click point to a random target
      via stroke-dashoffset animation (standard CSS-animatable)
   4. After 1.6s, cracks fade out and lines reset
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

    // Pre-set each line to zero length (cracks hidden at rest)
    lines.forEach((line) => {
      line.setAttribute('x2', line.getAttribute('x1') || '0');
      line.setAttribute('y2', line.getAttribute('y1') || '0');
      line.style.strokeDasharray = '0';
      line.style.strokeDashoffset = '0';
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

      // 1. Shake the card
      const shake: Keyframe[] = [
        { transform: 'translate(0,0) rotate(0deg)' },
        {
          transform: `translate(${(Math.random() - 0.5) * 8}px, ${(Math.random() - 0.5) * 6}px) rotate(${(Math.random() - 0.5) * 1.5}deg)`,
        },
        { transform: 'translate(0,0) rotate(0deg)' },
      ];
      card.animate(shake, {
        duration: 800,
        easing: 'cubic-bezier(0.34, 1.56, 0.64, 1)',
      });

      // 2. Fade the cracks container in
      cracks.animate(
        [{ opacity: 0 }, { opacity: 1 }],
        { duration: 200, easing: 'cubic-bezier(0.16, 1, 0.3, 1)' },
      );

      // 3. For each line, set endpoints and animate stroke-dashoffset
      //    so the line "draws" from the click point toward a random
      //    target on the brick edge.
      const targets: Array<{ x: number; y: number }> = [];
      for (let i = 0; i < lines.length; i++) {
        targets.push({
          x: cx + (Math.random() - 0.5) * w,
          y: cy + (Math.random() - 0.5) * h,
        });
      }
      lines.forEach((line, i) => {
        const t = targets[i];
        if (!t) return;
        // Set the line endpoints
        line.setAttribute('x1', `${cx}`);
        line.setAttribute('y1', `${cy}`);
        line.setAttribute('x2', `${t.x}`);
        line.setAttribute('y2', `${t.y}`);
        // Compute path length for the dasharray animation
        const len = Math.hypot(t.x - cx, t.y - cy);
        line.style.strokeDasharray = `${len}`;
        line.style.strokeDashoffset = `${len}`;
        // Animate the line drawing itself
        line.animate(
          [{ strokeDashoffset: len }, { strokeDashoffset: 0 }],
          {
            duration: 600,
            delay: i * 40,
            easing: 'cubic-bezier(0.16, 1, 0.3, 1)',
            fill: 'forwards',
          },
        );
      });

      cracks.classList.add('is-broken');

      // 4. Reset after a beat
      setTimeout(() => {
        cracks.animate(
          [{ opacity: 1 }, { opacity: 0 }],
          { duration: 300, easing: 'cubic-bezier(0.4, 0, 1, 1)' },
        );
        lines.forEach((line) => {
          line.animate(
            [{ strokeDashoffset: 0 }, { strokeDashoffset: 0 }],
            { duration: 300, fill: 'forwards' },
          );
        });
        setTimeout(() => {
          cracks.classList.remove('is-broken');
          // Collapse the lines to zero length for the next click
          lines.forEach((line) => {
            const x1 = line.getAttribute('x1') || '0';
            const y1 = line.getAttribute('y1') || '0';
            line.setAttribute('x2', x1);
            line.setAttribute('y2', y1);
            line.style.strokeDasharray = '0';
            line.style.strokeDashoffset = '0';
          });
        }, 320);
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
