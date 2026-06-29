/* ============================================================
   Reveal — IntersectionObserver-driven scroll reveals.
   Adds `.is-revealed` to elements with `.reveal-stagger` when
   they enter the viewport. Pair with CSS transitions defined
   in global.css. Respects prefers-reduced-motion.
   ============================================================ */

export function initReveal(): () => void {
  const targets = document.querySelectorAll<HTMLElement>('.reveal-stagger');
  if (targets.length === 0) return () => {};

  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (reduced) {
    targets.forEach((el) => el.classList.add('is-revealed'));
    return () => {};
  }

  // No IntersectionObserver? Reveal everything immediately.
  if (typeof IntersectionObserver === 'undefined') {
    targets.forEach((el) => el.classList.add('is-revealed'));
    return () => {};
  }

  const io = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        if (entry.isIntersecting) {
          entry.target.classList.add('is-revealed');
          io.unobserve(entry.target);
        }
      }
    },
    { rootMargin: '0px 0px -10% 0px', threshold: 0.05 }
  );

  targets.forEach((el) => io.observe(el));

  return () => io.disconnect();
}
