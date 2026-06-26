// Sample component used to verify that `slopbrick` is installed and working.
//
// Run from the directory containing `slopbrick.config.mjs`:
//   `npx slopbrick scan examples/basic/sample-component.tsx`
//
// Expected output:
//   * 1-2 visual issues (the inline `style` and the magic spacing value)
//   * 0 wcag issues (this component is keyboard-accessible)
//   * The `perf/css-bloat` and `wcag/focus-appearance` rules report at
//     severity 'low' (per the basic example config) but do not block.

import React from 'react';

export function SampleButton({ onClick, children }: {
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      //  hardcoded color and magic spacing instead of design tokens.
      style={{ background: '#3b82f6', padding: '13px', borderRadius: '8px' }}
      onClick={onClick}
      type="button"
    >
      {children}
    </button>
  );
}