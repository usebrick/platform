// Barrel for the dup/* (duplication detector) rule family.
// v0.19: only `dup/identical-block` (Type-1 clone).
// v0.23: + `dup/near-duplicate` (Type-2 clone, MinHash + LSH).
// v0.24: + `dup/structural-clone` (Type-3 clone, identifier-canonical MinHash).

import { resetNearDuplicateCache } from './near-duplicate';
import { resetStructuralCloneCache } from './structural-clone';

export { dupIdenticalBlockRule } from './identical-block';
export { default as dupIdenticalBlockRuleDefault } from './identical-block';
export { nearDuplicateRule, _resetNearDupCacheForTesting } from './near-duplicate';
export { default as nearDuplicateRuleDefault } from './near-duplicate';
export { structuralCloneRule, _resetStructuralCloneCacheForTesting } from './structural-clone';
export { default as structuralCloneRuleDefault } from './structural-clone';

/** Clear per-process cross-file state at the boundary of every scan run. */
export function resetDuplicationRuleState(): void {
  // dup/identical-block is a pure post-scan coordinator and has no
  // process-scoped state to reset.  The remaining legacy duplication rules
  // still use their own run-bound caches until their coordinators land.
  resetNearDuplicateCache();
  resetStructuralCloneCache();
}
