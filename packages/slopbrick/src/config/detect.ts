// Public facade for project-stack detection.
//
// Implementation lives under src/config/detect/:
//   - monorepo.ts — detectMonorepoRoot + workspace expansion helpers
//   - styling.ts  — detectStylingSolution
//   - stack.ts    — detectStack (framework + UI libraries + Tailwind)
//                   + detectUiLibraries helper
//
// This file exists so callers can keep using the single-import
// public API (`from '../config'`) while the internals are organized
// by concern.

export { detectMonorepoRoot } from './detect/monorepo';
export { detectStylingSolution } from './detect/styling';
export { detectStack } from './detect/stack';
export type { UiLibrary } from './detect/stack';