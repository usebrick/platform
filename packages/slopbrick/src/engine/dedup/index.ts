// Barrel for the dedup/ engine module.
//
// Public API:
//   shingleSet(source)         — tokenize source into k-gram hashes
//   minHash(tokens)            — compute MinHash signature
//   minHashSimilarity(a, b)    — estimate Jaccard from two signatures
//   buildLshIndex(signatures)  — find candidate near-duplicate pairs
//
// Used by:
//   - src/rules/dup/near-duplicate.ts (v0.23.0, Type-2 clone detector)
//
// Algorithm references:
//   - MinHash: Broder (1997), Leskovec/Rajaraman/Ullman (2014) §3.4
//   - LSH:     Indyk-Motwani (1998), Leskovec/Rajaraman/Ullman §3.4.4
//
// The full clone taxonomy (v0.19 / v0.23 / v0.27):
//   - Type-1 (identical):  see rules/dup/identical-block.ts
//   - Type-2 (near-dup):   see rules/dup/near-duplicate.ts (v0.23)
//   - Type-3 (structural): see rules/dup/structural-clone.ts (v0.27, TBD)

export { shingleSet, shingleSetRaw, type TokenizeConfig } from './tokenize.js';
export { minHash, minHashSimilarity, hashToken, type MinHashConfig } from './minhash.js';
export { buildLshIndex, type LshConfig, type LshIndex, type Candidate } from './lsh.js';
