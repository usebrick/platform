/* ============================================================
   StructureDemo — fades in each `.sd-line` as it scrolls into
   view. Pure IntersectionObserver, no GSAP/ScrollTrigger needed.
   Initial state is set in CSS (opacity 0.18, slight x offset);
   this script adds `.is-visible` to each line as it enters.
   ============================================================ */

export function initStructureDemo(): () => void {
  const lines = document.querySelectorAll<HTMLElement>('.sd-line');
  if (lines.length === 0) return () => {};

  // No IO support? Reveal everything.
  if (typeof IntersectionObserver === 'undefined') {
    lines.forEach((el) => el.classList.add('is-visible'));
    return () => {};
  }

  // Reduced motion: reveal everything immediately.
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (reduced) {
    lines.forEach((el) => el.classList.add('is-visible'));
    return () => {};
  }

  const io = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        if (entry.isIntersecting) {
          entry.target.classList.add('is-visible');
          io.unobserve(entry.target);
        }
      }
    },
    { rootMargin: '0px 0px -10% 0px', threshold: 0.1 },
  );

  lines.forEach((el) => io.observe(el));

  return () => io.disconnect();
}
