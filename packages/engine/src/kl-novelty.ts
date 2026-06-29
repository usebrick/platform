/**
 * v0.10: KL divergence pattern novelty (Kullback & Leibler 1951,
 * "On Information and Sufficiency," *Annals of Mathematical
 * Statistics* 22(1):79–86).
 *
 * Computes the Kullback–Leibler divergence of the project's pattern
 * distribution against a corpus baseline:
 *
 *   KL(P_project ‖ P_corpus) = Σ_x P_project(x) · log( P_project(x) / P_corpus(x) )
 *
 * Higher KL means the project uses patterns uncommon in the corpus
 * baseline = statistical surprise. KL is asymmetric — it measures
 * the surprise of P_project relative to P_corpus, not vice versa
 * (so this is NOT a distance in the metric sense).
 *
 * Convention: natural log (nats), matching the standard
 * information-theoretic definition. Bounded below by 0 by Gibbs'
 * inequality; equals 0 iff P_project and P_corpus agree on the
 * support of P_project.
 *
 * Smoothing for missing keys: any key present in
 * `projectFrequencies` but absent from `corpusFrequencies` is
 * treated as having probability `EPSILON` in P_corpus so the term
 * stays finite. Both inputs are treated as raw counts and normalized
 * internally — callers can pass either raw counts or pre-normalized
 * probabilities.
 */

export const KL_NOVELTY_EPSILON = 1e-12;

/**
 * Compute KL(P_project ‖ P_corpus) over a discrete vocabulary of
 * pattern identifiers (state libs, form libs, modal patterns, etc.).
 *
 * Returns 0 for empty project input. Returns the (large but finite)
 * smoothed value when the corpus baseline has no entries.
 */
export function computeKLNovelty(
  projectFrequencies: Map<string, number>,
  corpusFrequencies: Map<string, number>,
): number {
  // Normalize project counts to a probability distribution.
  let projectTotal = 0;
  for (const count of projectFrequencies.values()) projectTotal += count;
  if (projectTotal <= 0) return 0;

  // Normalize corpus counts the same way so callers can pass raw
  // frequencies without precomputing a distribution.
  let corpusTotal = 0;
  for (const count of corpusFrequencies.values()) corpusTotal += count;
  const corpusIsEmpty = corpusTotal <= 0;

  let kl = 0;
  for (const [key, count] of projectFrequencies) {
    if (count <= 0) continue;
    const pProject = count / projectTotal;
    const pCorpusRaw = corpusFrequencies.get(key) ?? 0;
    const pCorpus = pCorpusRaw > 0 && !corpusIsEmpty
      ? pCorpusRaw / corpusTotal
      : KL_NOVELTY_EPSILON;
    kl += pProject * Math.log(pProject / pCorpus);
  }
  return kl;
}
