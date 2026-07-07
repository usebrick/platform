/* ============================================================
   Counter — animate the calibration stats on first reveal.
   Counts from 0 to the target value over ~1.2s with an
   ease-out curve. Respects prefers-reduced-motion.
   ============================================================ */

interface StatEl extends HTMLElement {
  dataset: {
    target?: string;
    suffix?: string;
  };
}

export function initCounters(): () => void {
  const stats = document.querySelectorAll<StatEl>('.calibration__value[data-target]');
  if (stats.length === 0) return () => {};

  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  const animate = (el: StatEl) => {
    const target = parseInt(el.dataset.target || '0', 10);
    const suffix = el.dataset.suffix || '';
    if (Number.isNaN(target)) return;

    if (reduced) {
      el.textContent = `${target.toLocaleString()}${suffix}`;
      return;
    }

    const duration = 1200;
    const start = performance.now();
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / duration);
      // ease-out cubic
      const e = 1 - Math.pow(1 - t, 3);
      const value = t < 1 ? Math.floor(target * e) : target;
      el.textContent = `${value.toLocaleString()}${suffix}`;
      if (t < 1) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  };

  // v0.43.0: render the target value IMMEDIATELY (before any scroll)
  // so users who don't scroll to the section still see the right
  // numbers. The counter animation overlays this by counting from 0
  // to target when the element scrolls into view. Without this,
  // anyone taking a quick screenshot, screen-reader user, or
  // non-scrolling reader would see "0 LOW / 0 EXCELLENT / 0 EXCELLENT
  // / 0 NEEDS WORK" which reads as "the repo has nothing".
  for (const el of stats) {
    const target = parseInt(el.dataset.target || '0', 10);
    const suffix = el.dataset.suffix || '';
    if (!Number.isNaN(target)) {
      el.textContent = `${target.toLocaleString()}${suffix}`;
    }
  }

  if (typeof IntersectionObserver === 'undefined') {
    return () => {};
  }

  const io = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        if (entry.isIntersecting) {
          animate(entry.target as StatEl);
          io.unobserve(entry.target);
        }
      }
    },
    { threshold: 0.3 }
  );
  stats.forEach((el) => io.observe(el));

  return () => io.disconnect();
}
