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
