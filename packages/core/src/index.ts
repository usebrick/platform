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
  type StructureCategory,
  type StructurePattern,
  type ComponentFingerprint,
  type InventoryFile,
  type ConstitutionFile,
  type HealthFile,
  type FileMtimeEntry,
  // validators
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

// v0.15.0+: Types generated from schemas/v1/*.schema.json. The hand-written
// equivalents in './structure-types' are @deprecated. Consumers should import
// the generated types from '@usebrick/core' (re-exports below).
//
// Note: the generated names (RepositoryMemory*) are derived from the JSON
// Schema 'title' field. In a future v0.16.0 the schema titles will be
// updated to match the hand-written names (InventoryFile, etc.) so the
// public API names align with the generated names without aliases.
export type { RepositoryMemoryInventory } from './generated/inventory';
export type { RepositoryMemoryConstitution } from './generated/constitution';
export type { RepositoryMemoryHealth } from './generated/health';
