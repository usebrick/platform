/* ============================================================
   Copy install — click on any element with [data-copy] copies
   the install command to the clipboard. Used on the hero pill
   AND the CTA button. Shows a checkmark for 1.5s.
   ============================================================ */

export function initCopyInstall(): () => void {
  const triggers = document.querySelectorAll<HTMLElement>('[data-copy]');
  if (triggers.length === 0) return () => {};

  const cleanups: Array<() => void> = [];

  for (const el of triggers) {
    const onClick = async (e: MouseEvent) => {
      e.preventDefault();
      const cmd = el.dataset.copy || '';
      if (!cmd) return;

      try {
        if (navigator.clipboard?.writeText) {
          await navigator.clipboard.writeText(cmd);
        } else {
          // Fallback for older browsers (execCommand is deprecated but
          // still the only path without a secure-context clipboard API)
          const ta = document.createElement('textarea');
          ta.value = cmd;
          ta.style.position = 'fixed';
          ta.style.opacity = '0';
          document.body.appendChild(ta);
          ta.select();
          // The fallback is intentionally retained for non-secure/older
          // browsers where the async Clipboard API is unavailable.
          // Access by key so the intentional legacy fallback does not make
          // the website typecheck depend on the deprecated DOM declaration.
          const legacyDocument = document as unknown as Record<string, unknown>;
          const execCommand = legacyDocument['execCommand'];
          if (typeof execCommand === 'function') {
            execCommand.call(document, 'copy');
          }
          document.body.removeChild(ta);
        }

        el.classList.add('is-copied');
        setTimeout(() => el.classList.remove('is-copied'), 1500);
      } catch (err) {
        console.error('clipboard write failed:', err);
      }
    };

    el.addEventListener('click', onClick);
    cleanups.push(() => el.removeEventListener('click', onClick));
  }

  return () => cleanups.forEach((c) => c());
}
