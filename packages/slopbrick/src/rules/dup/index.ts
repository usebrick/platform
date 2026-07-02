// Barrel for the dup/* (duplication detector) rule family.
// v0.19: only `dup/identical-block` (Type-1 clone).
// v0.23: + `dup/near-duplicate` (Type-2 clone, MinHash + LSH).
// v0.27: + `dup/structural-clone` (Type-3 clone, AST isomorphism).

export { dupIdenticalBlockRule } from './identical-block';
export { default as dupIdenticalBlockRuleDefault } from './identical-block';
export { nearDuplicateRule, _resetNearDupCacheForTesting } from './near-duplicate';
export { default as nearDuplicateRuleDefault } from './near-duplicate';
