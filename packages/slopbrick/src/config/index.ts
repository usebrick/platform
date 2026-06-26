// Public facade for slopbrick's config layer.
//
// The implementation lives under src/config/:
//   - defaults.ts — public types + DEFAULT_CONFIG + DEFAULT_SPACING_SCALE
//   - detect.ts   — framework / styling / UI-library / monorepo detection
//   - load.ts     — config file loading (resolveConfigPath, loadConfig)
//   - presets.ts  — per-framework rule overrides + applyFrameworkPreset
//
// This file exists to preserve the single-import public API
// (`from './config'`) that the rest of the codebase uses, while the
// internals are organized by concern.

export {
  DEFAULT_CONFIG,
  DEFAULT_SPACING_SCALE,
  DEFAULT_RADIUS_SCALE,
  DEFAULT_TYPOGRAPHY_SCALE,
  DEFAULT_RULE_CONFIG,
  type Framework,
  type StylingSolution,
  type UiLibrary,
  type Strictness,
  type WizardAnswers,
} from './defaults';

// Re-export `ResolvedConfig` so callers can keep using
// `import { ResolvedConfig } from '../config'` even though the type
// itself is defined in src/types.ts (alongside the rest of the
// domain model).
export type { ResolvedConfig } from '../types';

export { detectStack, detectMonorepoRoot, detectStylingSolution } from './detect';

export { resolveConfigPath, loadConfig } from './load';

export { applyFrameworkPreset } from './presets';

export { buildInitConfig } from './init';

export {
  detectConstitution,
  resolveConstitution,
  formatConstitution,
  matchForbidden,
  CONSTITUTION_SIGNALS,
  type Constitution,
} from './conventions';

// Config validation is a thin wrapper that's logically part of the
// config layer but lives next to its validator implementation.
export { ConfigValidationError, validateConfig } from './validation';
