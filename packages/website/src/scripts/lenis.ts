/* ============================================================
   Lenis — smooth scroll init.
   Loaded as an Astro <script> in Base.astro so it runs before
   any island hydrates. Respects prefers-reduced-motion.
   ============================================================ */

import Lenis from 'lenis';
import { gsap } from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';

export function initLenis(): () => void {
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (reduced) {
    document.documentElement.classList.add('lenis');
    return () => {};
  }

  const lenis = new Lenis({
    duration: 1.2,
    easing: (t: number) => Math.min(1, 1.001 - Math.pow(2, -10 * t)),
    smoothWheel: true,
  });

  // Hook into GSAP's ticker so ScrollTrigger stays in sync
  gsap.registerPlugin(ScrollTrigger);
  lenis.on('scroll', ScrollTrigger.update);
  gsap.ticker.add((time: number) => {
    lenis.raf(time * 1000);
  });
  gsap.ticker.lagSmoothing(0);

  document.documentElement.classList.add('lenis');

  return () => {
    lenis.destroy();
    document.documentElement.classList.remove('lenis');
  };
}
