// @usebrick-dev/core — public API facade.
//
// Shared contracts every usebrick.dev tool depends on:
//   - Schema types + validators for .slop-audit/inventory.json
//     and .slop-audit/constitution.json
//   - Loaders/savers that gracefully return null on version mismatch
//   - Freshness check (mtime + hash) so tools can skip re-scans
//
// slop-audit (the scanner) writes these artifacts. Future usebrick.dev
// tools (stackpick, gir) read them. Both sides depend on this package
// for the contract.

export {
  STRUCTURE_SCHEMA_VERSION,
  type FileMtimeEntry,
  // validators (moved to ./validators in v0.17.4 R-H4 closeout;
  // re-exported here so existing imports of the form
  // `import { isInventoryFile } from '@usebrick/core'` keep working)
  isStructurePattern,
  isComponentFingerprint,
  isInventoryFile,
  isConstitutionFile,
  isHealthFile,
  isFileMtimeEntry,
} from './structure-types';

export {
  INVENTORY_FILENAME,
  CONSTITUTION_FILENAME,
  CACHE_FILENAME,
  HEALTH_FILENAME,
  inventoryPath,
  constitutionPath,
  cachePath,
  healthPath,
  loadInventory,
  saveInventory,
  loadConstitution,
  saveConstitution,
  loadHealth,
  saveHealth,
  readCache,
  writeCacheFromInventory,
  isInventoryFresh,
  invalidateFile,
  writeJsonAtomic,
} from './structure';

export { VERDICTS, isDefaultOff, type Verdict } from './verdicts';

export { signalStrengthSchema, type SignalStrengthEntry } from './signal-strength-schema';

// v0.15.0+: Types generated from schemas/v1/*.schema.json. These are
// the public API for the on-disk shapes. v0.17.4 (R-H4 closeout):
// also export the underlying `Pattern` and `Component` shapes from
// inventory, and the `Category` enum, so consumers can build
// InventoryFile / ConstitutionFile / HealthFile values without
// importing from `structure-types` (the hand-written duplicates were
// deleted).
export type {
  RepositoryStructureInventory,
  Pattern,
  Component,
  Category,
} from './generated/inventory';
export type { RepositoryStructureConstitution } from './generated/constitution';
export type { RepositoryStructureHealth } from './generated/health';
export type { RepositoryStructureStructureMarkdown } from './generated/structure';
