import type { Category } from '../types';
import type { FingerprintCluster } from './extractor';

/**
 * A human-reviewable proposal for a new detection rule. Generated from
 * recurring fingerprints found in low-coverage samples. Not auto-applied —
 * the flywheel emits these so a maintainer can decide whether the rule
 * actually represents slop or just looks that way.
 */
export interface RuleCandidate {
  id: string;
  category: Category;
  severity: 'low' | 'medium' | 'high';
  description: string;
  example: string;
  frequency: number;
  frameworks: string[];
  /** Source fingerprint kind — kept for traceability. */
  source: FingerprintCluster['kind'];
}

/**
 * Convert a cluster into a rule candidate. The mapping is deliberately simple
 * and biased towards conservative defaults:
 *
 * - `category` is inferred from fingerprint kind.
 * - `severity` defaults to `medium` — low for jsx-element tags that are
 *   extremely common (e.g. `div`).
 * - `id` is derived from the value to keep candidates stable across runs.
 * - `frameworks` is left empty here; the analyzer is expected to populate
 *   it from the samples that contributed to the cluster.
 */
export function clusterToCandidate(cluster: FingerprintCluster): RuleCandidate {
  const category = categoryForKind(cluster.kind);
  const severity = severityForCluster(cluster);
  const value = cluster.value;
  const suggestedId = `candidate/${cluster.kind}/${slugify(value)}`;

  return {
    id: suggestedId,
    category,
    severity,
    description: descriptionFor(cluster),
    example: value,
    frequency: cluster.count,
    frameworks: [],
    source: cluster.kind,
  };
}

/**
 * Convert a list of clusters to rule candidates, optionally enforcing a
 * minimum frequency threshold. Returns the candidates sorted by descending
 * frequency.
 */
export function clustersToCandidates(
  clusters: FingerprintCluster[],
  options: { minFrequency?: number } = {},
): RuleCandidate[] {
  const min = options.minFrequency ?? 1;
  return clusters
    .filter((c) => c.count >= min)
    .map(clusterToCandidate)
    .sort((a, b) => b.frequency - a.frequency || a.id.localeCompare(b.id));
}

// ---------- helpers ----------

function categoryForKind(kind: FingerprintCluster['kind']): Category {
  switch (kind) {
    case 'tailwind-class':
    case 'gap-value':
    case 'style-source':
    case 'ai-default-palette':
      return 'visual';
    case 'unmatched-string':
      return 'typo';
    case 'jsx-element':
      return 'layout';
    default:
      return 'visual';
  }
}

function severityForCluster(cluster: FingerprintCluster): RuleCandidate['severity'] {
  // Extremely common elements are noise; treat as low.
  const commonTags = new Set(['div', 'span', 'p', 'a', 'button']);
  if (cluster.kind === 'jsx-element' && commonTags.has(cluster.value)) {
    return 'low';
  }
  // High-frequency arbitrary values are a strong slop signal.
  if (cluster.kind === 'gap-value' && cluster.count >= 5) {
    return 'high';
  }
  return 'medium';
}

function descriptionFor(cluster: FingerprintCluster): string {
  switch (cluster.kind) {
    case 'tailwind-class':
      return `Recurring utility class "${cluster.value}" appeared ${cluster.count} time(s) in samples with no AI-specific rule coverage.`;
    case 'ai-default-palette':
      return `Inline style "${cluster.value}" appeared ${cluster.count} time(s).`;
    case 'gap-value':
      return `Arbitrary Tailwind value "${cluster.value}" appeared ${cluster.count} time(s).`;
    case 'unmatched-string':
      return `Hardcoded string "${truncate(cluster.value, 60)}" appeared ${cluster.count} time(s) without matching any rule.`;
    case 'style-source':
      return `Style source "${cluster.value}" appeared ${cluster.count} time(s).`;
    case 'jsx-element':
      return `Element <${cluster.value}> appeared ${cluster.count} time(s).`;
    default:
      return `Pattern "${cluster.value}" appeared ${cluster.count} time(s).`;
  }
}

function truncate(s: string, n: number): string {
  return s.length <= n ? s : `${s.slice(0, n - 1)}…`;
}

function slugify(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);
}
