import type { AnalysisResult } from './analyzer';
import type { FileScanResult } from '../types';

/**
 * A fingerprint is a normalized signature of a recurring structural or stylistic
 * pattern found in a generated sample. The extractor emits these for samples
 * with no AI-specific rule coverage so downstream pipelines (clustering,
 * candidate-rule generation) can spot what the existing rule set misses.
 *
 * Fingerprint ids are deterministic (`kind:normalized-value`) so identical
 * patterns across files cluster naturally.
 */
export interface Fingerprint {
  /** Stable identifier — e.g. `tailwind-class:text-red-500`. */
  id: string;
  kind:
    | 'tailwind-class'
    | 'ai-default-palette'
    | 'unmatched-string'
    | 'jsx-element'
    | 'gap-value'
    | 'style-source';
  /** Human-readable value (the class name, the literal string, etc.). */
  value: string;
  /** Where the pattern was observed. */
  sample: {
    filePath: string;
    line: number;
    column: number;
  };
}

export interface FingerprintCluster {
  id: string;
  kind: Fingerprint['kind'];
  value: string;
  count: number;
  samples: Fingerprint['sample'][];
}

export interface ExtractionResult {
  clusters: FingerprintCluster[];
  /** Total fingerprints observed before clustering — diagnostic. */
  total: number;
}

/**
 * Extract fingerprints from a single sample's scan result. Pulls from the
 * fields `FileScanResult` already exposes (`gapValues`, `styleSources`,
 * `elementTags`, `unmatchedStringLiterals`).
 */
export function extractFromScan(result: FileScanResult): Fingerprint[] {
  const out: Fingerprint[] = [];
  const filePath = result.filePath;

  for (const tag of result.elementTags ?? []) {
    const normalized = tag?.trim().toLowerCase();
    if (!normalized) continue;
    out.push({
      id: `jsx-element:${normalized}`,
      kind: 'jsx-element',
      value: normalized,
      sample: { filePath, line: 0, column: 0 },
    });
  }

  for (const gap of result.gapValues ?? []) {
    const normalized = gap?.trim().toLowerCase();
    if (!normalized) continue;
    out.push({
      id: `gap-value:${normalized}`,
      kind: 'gap-value',
      value: normalized,
      sample: { filePath, line: 0, column: 0 },
    });
  }

  for (const source of result.styleSources ?? []) {
    const normalized = source?.trim().toLowerCase();
    if (!normalized) continue;
    out.push({
      id: `style-source:${normalized}`,
      kind: 'style-source',
      value: normalized,
      sample: { filePath, line: 0, column: 0 },
    });
  }

  for (const literal of result.unmatchedStringLiterals ?? []) {
    const trimmed = literal?.trim();
    if (!trimmed || trimmed.length < 4) continue;
    out.push({
      id: `unmatched-string:${trimmed}`,
      kind: 'unmatched-string',
      value: trimmed,
      sample: { filePath, line: 0, column: 0 },
    });
  }

  return out;
}

/**
 * Extract fingerprints from a batch of analysis results. By default only
 * samples that were *not* covered by any AI-specific rule contribute — the
 * point of the extractor is to find what the existing rules miss. Pass
 * `includeCovered: true` to scan every sample (useful for diagnostics).
 */
export function extractFromAnalysis(
  analyses: AnalysisResult[],
  options: { includeCovered?: boolean } = {},
): Fingerprint[] {
  const out: Fingerprint[] = [];
  for (const analysis of analyses) {
    if (!options.includeCovered && analysis.covered) continue;
    out.push(...extractFromScan(analysis.scan));
  }
  return out;
}

/**
 * Group fingerprints by id. Sorted by descending frequency, ties broken by id.
 */
export function cluster(fingerprints: Fingerprint[]): FingerprintCluster[] {
  const groups = new Map<string, FingerprintCluster>();
  for (const fp of fingerprints) {
    const existing = groups.get(fp.id);
    if (existing) {
      existing.count += 1;
      existing.samples.push(fp.sample);
    } else {
      groups.set(fp.id, {
        id: fp.id,
        kind: fp.kind,
        value: fp.value,
        count: 1,
        samples: [fp.sample],
      });
    }
  }
  return [...groups.values()].sort(
    (a, b) => b.count - a.count || a.id.localeCompare(b.id),
  );
}

/**
 * Convenience: extract + cluster in one call. Filters clusters below
 * `minCount` (default 1).
 */
export function extractAndCluster(
  analyses: AnalysisResult[],
  options: { includeCovered?: boolean; minCount?: number } = {},
): ExtractionResult {
  const fingerprints = extractFromAnalysis(analyses, options);
  const all = cluster(fingerprints);
  const min = options.minCount ?? 1;
  return {
    clusters: all.filter((c) => c.count >= min),
    total: fingerprints.length,
  };
}
