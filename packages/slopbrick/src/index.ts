// Public API facade for slopbrick.
//
// Almost all of the implementation lives under src/cli/. This file is
// the public surface that library consumers (and our own tests) import
// from. It re-exports the type system, config helpers, and the CLI's
// public functions (scanProject, runCli, threshold/filter helpers,
// etc.) so that callers don't need to know about the internal cli/*
// module layout.
//
// The bin script (bin/slopbrick.js) imports { runCli } from here.

export * from './types';
export { loadConfig, DEFAULT_CONFIG } from './config';

// v0.15.0: re-export @usebrick/engine so existing slopbrick consumers
// (tests, the CLI's internal lazy imports, and downstream integrations
// that use the engine functions via `from 'slopbrick'`) keep working
// as the engine modules migrate out of `src/engine/`.
export * from '@usebrick/engine';

// Re-export the public CLI API. Library consumers who want to call
// scanProject() or read saved JSON reports use these.
export {
  scanProject,
  runCli,
  runInitWizard,
  type ScanProjectOptions,
} from './cli/program';

// Re-export threshold / filter / render helpers (consumed by tests
// and by external integrations building dashboards on top of the
// scanner).
export {
  thresholdExceeded,
  failedThresholdCount,
  failedThresholds,
  baselineStatusMessage,
  stagedGating,
  filterIssues,
  filterByDisabledDirectives,
  serializeConfig,
  readReportFile,
  formatReportFromFile,
  type ReportReadResult,
} from './cli/threshold';

export {
  colorForSlop,
  formatBadge,
  formatSparkline,
} from './cli/render';

// --- Symbiotic-project surface (v0.10.1+) ---------------------------------
//
// These primitives are the **stable** public surface for sibling tools
// (e.g. brick, stackpick, future Agent-first tooling) that read
// slopbrick's persisted artifacts (`.slopbrick/inventory.json`,
// `constitution.json`) or call its detection engines without wanting
// to bundle the full scanner.
//
// Anything exported here is API-stable per `STRUCTURE_SCHEMA_VERSION` and
// the engine function signatures. Internal modules under src/engine/
// may change; the re-exports below are the contract.
//
// The `.slopbrick/` memory schema + readers are owned by the
// `@usebrick/core` package (used to live in `src/engine/memory-types.ts`).
// slopbrick depends on `@usebrick/core` and re-exports its surface
// here so callers don't need a second import.
//
// v0.15.0 B.5: `findSimilarFunctions` and friends moved to
// `@usebrick/engine` (see packages/engine/src/find-similar.ts). They
// are still re-exported from slopbrick via the wildcard
// `export * from '@usebrick/engine'` at the top of this file.

// NOTE: `.slopbrick/` memory schema + readers are owned by the
// `@usebrick/core` workspace package. We deliberately do NOT re-export
// any of its surface here, because `@usebrick/core` is private (`"private":
// true` in its package.json) and not installable from npm. Re-exporting
// its names — values or types — would force every TypeScript consumer of
// slopbrick to depend on a package they cannot install.
//
// The runtime functions are still BUNDLED into dist/index.cjs (see
// tsup.config.ts `noExternal`), so end users calling `slopbrick` never
// need to know about @usebrick/core. Once @usebrick/core ships as a real
// published package (the AGENTS.md moat: "defer until schema is earned
// by ≥2 consumers like stackpick or gir"), we can re-export here.
