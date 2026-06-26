import { existsSync } from 'node:fs';
import { readFileSync, writeFileSync } from 'node:fs';

export interface FocusRingFixResult {
  applied: boolean;
  reason?: string;
}

const ANCHOR_START = '/* @slopbrick:v1.0.0:fix:focus-ring */';
const CSS_BLOCK = `/* @slopbrick:v1.0.0:fix:focus-ring */
:focus-visible {
  outline: 2px solid currentColor;
  outline-offset: 2px;
}
/* @slopbrick:v1.0.0:fix:focus-ring-end */`;

export function applyFocusRingFix(targetFile: string): FocusRingFixResult {
  if (!existsSync(targetFile)) {
    return { applied: false, reason: 'missing-global-css-target' };
  }

  const content = readFileSync(targetFile, 'utf-8');
  if (content.includes(ANCHOR_START)) {
    return { applied: false, reason: 'already-present' };
  }

  const separator = content.endsWith('\n') ? '' : '\n';
  writeFileSync(targetFile, `${content}${separator}${CSS_BLOCK}\n`);
  return { applied: true };
}
