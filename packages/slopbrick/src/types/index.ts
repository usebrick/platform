/**
 * v0.18.4 (Phase B R-M2): types split — barrel.
 *
 * Re-exports every type from the focused modules so existing
 * `import { X } from '../types'` call-sites keep working unchanged.
 *
 * Consumers that want a smaller dependency surface can import directly
 * from the focused module, e.g. `import type { Issue } from '../types/scan'`.
 */

export * from './_header';
export * from './primitives';
export * from './scan';
export * from './config';
export * from './report';
export * from './project-report';
export * from './baseline';
