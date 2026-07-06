/* ============================================================
   ScrollReveal — fade in sections as they enter the viewport.
   Pure IntersectionObserver, no GSAP. Default opacity 0.85, slight
   x offset; classes `.sr-visible` are added as the element scrolls
   into the lower 80% of the viewport. Honors prefers-reduced-motion.
   ============================================================ */

export function initScrollReveal(): () => void {
  const targets = document.querySelectorAll<HTMLElement>(
    '.section, .hero, .tools__brick, .tool-card, .compare__col, .cta',
  );
  if (targets.length === 0) return () => {};

  if (typeof IntersectionObserver === 'undefined') {
    targets.forEach((el) => el.classList.add('sr-visible'));
    return () => {};
  }

  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (reduced) {
    targets.forEach((el) => el.classList.add('sr-visible'));
    return () => {};
  }

  const io = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        if (entry.isIntersecting) {
          entry.target.classList.add('sr-visible');
          io.unobserve(entry.target);
        }
      }
    },
    { rootMargin: '0px 0px -8% 0px', threshold: 0.05 },
  );

  targets.forEach((el) => io.observe(el));
  return () => io.disconnect();
}
