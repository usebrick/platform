// Barrel for the dup/* (duplication detector) rule family.
// v0.19: only `dup/identical-block` (Type-1 clone).
// v0.20: + `dup/near-duplicate` (Type-2 clone, token shingling + Jaccard).
// v0.21: + `dup/structural-clone` (Type-3 clone, AST isomorphism).

export { dupIdenticalBlockRule } from './identical-block';
export { default as dupIdenticalBlockRuleDefault } from './identical-block';
