/**
 * v0.10.1: `find_similar_function` engine.
 *
 * Given a function/component signature (name + parameter list + hooks
 * used), find the most similar existing implementations across the
 * codebase. Foundation for the GIR (Give-Implementation-Reference)
 * pattern in `slop_suggest` and the BRICK Platform.
 *
 * Algorithm (no LLMs, no embeddings — hash-based AST fingerprinting
 * per Chilowicz 2009, "Syntax Tree Fingerprinting for Code Clone
 * Detection"; also see Maurer 2017 for a modern take on the same
 * approach applied to JS/TS):
 *
 *   1. Walk the codebase and extract each function/component signature.
 *      Signature = (name, normalized param list, hooks used, props).
 *   2. Compute a deterministic fingerprint per signature:
 *      fingerprint = sha256(sorted(hooks) | sorted(props) | sorted(params))
 *   3. Given a query signature, compute Jaccard similarity to every
 *      extracted signature over the union of (hooks ∪ props ∪ params).
 *   4. Return top-k matches sorted by similarity desc.
 *
 * Why this matters: AI agents writing new code ask "does this pattern
 * already exist?" before inventing new ones. `find_similar_function`
 * is the deterministic, citation-backed answer — no LLM hallucination,
 * no embedding dependency, fast even on 100k+ files.
 */

import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import {
  extractSignatures,
  fingerprintSignature,
  signatureSimilarity,
  type ComponentSignature,
} from './signatures';

export {
  extractSignatures,
  fingerprintSignature,
  signatureSimilarity,
  type ComponentSignature,
} from './signatures';

/** A single result from `findSimilarFunctions`. */
export interface SimilarMatch {
  /** The matched signature. */
  signature: ComponentSignature;
  /** Jaccard similarity in [0, 1]. 1 = identical feature set, 0 = disjoint. */
  similarity: number;
  /** Stable fingerprint hash. Two identical signatures always match. */
  fingerprint: string;
}

/** Query for `findSimilarFunctions`. */
export interface FindSimilarQuery {
  /** Optional name filter (exact match). */
  name?: string;
  /** Optional hooks filter (e.g., ['useState', 'useEffect']). */
  hooks?: string[];
  /** Optional props filter. */
  props?: string[];
  /** Optional params filter. */
  params?: string[];
  /** Top-k results to return. Default 10. Capped at 50. */
  limit?: number;
  /** Workspace directory to search. */
  workspaceDir: string;
}

const DEFAULT_INCLUDE = ['**/*.{ts,tsx,js,jsx}'];
const DEFAULT_EXCLUDE = ['node_modules/**', 'dist/**', '.git/**'];

/**
 * Walk the workspace, extract signatures from every included file, and
 * return top-k matches sorted by Jaccard similarity desc.
 *
 * Pure-ish: the file walking uses async I/O but the similarity math is
 * synchronous (it's microseconds per signature, even on 10k files).
 */
export async function findSimilarFunctions(
  query: FindSimilarQuery,
  options: { cwd?: string; include?: string[]; exclude?: string[] } = {},
): Promise<SimilarMatch[]> {
  const workspaceDir = query.workspaceDir;
  const limit = Math.min(50, Math.max(1, query.limit ?? 10));
  const cwd = options.cwd ?? workspaceDir;

  // Walk the workspace.
  const { globby } = await import('globby');
  const rawFiles = await globby(options.include ?? DEFAULT_INCLUDE, {
    cwd: workspaceDir,
    gitignore: true,
    ignore: options.exclude ?? DEFAULT_EXCLUDE,
    absolute: true,
  });
  const files = rawFiles.filter((f): f is string => typeof f === 'string');

  // Extract signatures from each file in parallel.
  const sigArrays = await Promise.all(
    files.map(async (file) => {
      try {
        const source = await readFile(file, 'utf-8');
        return extractSignatures(source, file, workspaceDir);
      } catch {
        return [] as ComponentSignature[];
      }
    }),
  );
  const allSigs = sigArrays.flat();

  // Build the query signature.
  const querySig: ComponentSignature = {
    name: query.name ?? '<query>',
    file: '<query>',
    fileRel: '<query>',
    line: 0,
    params: unique(query.params ?? []),
    hooks: unique(query.hooks ?? []),
    props: unique(query.props ?? []),
  };

  // Score and rank.
  const matches: SimilarMatch[] = [];
  for (const sig of allSigs) {
    if (query.name && sig.name !== query.name) continue;
    const similarity = signatureSimilarity(querySig, sig);
    if (similarity > 0) {
      matches.push({ signature: sig, similarity, fingerprint: fingerprintSignature(sig) });
    }
  }
  matches.sort((a, b) => b.similarity - a.similarity);
  return matches.slice(0, limit);
}

// --- helpers ---------------------------------------------------------------

function unique<T>(arr: T[]): T[] {
  return Array.from(new Set(arr));
}
