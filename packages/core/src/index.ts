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
  MEMORY_SCHEMA_VERSION,
  type MemoryCategory,
  type MemoryPattern,
  type ComponentFingerprint,
  type InventoryFile,
  type ConstitutionFile,
  type FileMtimeEntry,
  // validators
  isMemoryPattern,
  isComponentFingerprint,
  isInventoryFile,
  isConstitutionFile,
  isFileMtimeEntry,
} from './memory-types';

export {
  INVENTORY_FILENAME,
  CONSTITUTION_FILENAME,
  CACHE_FILENAME,
  inventoryPath,
  constitutionPath,
  cachePath,
  loadInventory,
  saveInventory,
  loadConstitution,
  saveConstitution,
  readCache,
  writeCacheFromInventory,
  isInventoryFresh,
  invalidateFile,
  writeJsonAtomic,
} from './memory';
