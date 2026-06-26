import { describe, expect, it } from 'vitest';
import {
  clusterToCandidate,
  clustersToCandidates,
  type RuleCandidate,
} from '../../src/research/candidates';
import type { FingerprintCluster } from '../../src/research/extractor';

function cluster(overrides: Partial<FingerprintCluster> = {}): FingerprintCluster {
  return {
    id: 'gap-value:w-[137px]',
    kind: 'gap-value',
    value: 'w-[137px]',
    count: 7,
    samples: [{ filePath: '/a.tsx', line: 0, column: 0 }],
    ...overrides,
  };
}

describe('candidates', () => {
  describe('clusterToCandidate', () => {
    it('maps a high-frequency gap cluster to visual/high', () => {
      const candidate = clusterToCandidate(cluster({ count: 6 }));
      expect(candidate.category).toBe('visual');
      expect(candidate.severity).toBe('high');
      expect(candidate.frequency).toBe(6);
      expect(candidate.source).toBe('gap-value');
      expect(candidate.id.startsWith('candidate/gap-value/')).toBe(true);
    });

    it('demotes common jsx-element tags to low severity', () => {
      const candidate = clusterToCandidate(
        cluster({ id: 'jsx-element:div', kind: 'jsx-element', value: 'div', count: 50 }),
      );
      expect(candidate.severity).toBe('low');
    });

    it('keeps rarer jsx-element tags at medium', () => {
      const candidate = clusterToCandidate(
        cluster({ id: 'jsx-element:aside', kind: 'jsx-element', value: 'aside', count: 3 }),
      );
      expect(candidate.severity).toBe('medium');
    });

    it('classifies unmatched-string as typo category', () => {
      const candidate = clusterToCandidate(
        cluster({
          id: 'unmatched-string:coming soon',
          kind: 'unmatched-string',
          value: 'coming soon',
          count: 4,
        }),
      );
      expect(candidate.category).toBe('typo');
    });

    it('truncates long values in the description', () => {
      const long = 'x'.repeat(200);
      const candidate = clusterToCandidate(
        cluster({ kind: 'unmatched-string', value: long, count: 2 }),
      );
      expect(candidate.description).toContain('…');
      expect(candidate.description.length).toBeLessThan(long.length);
    });
  });

  describe('clustersToCandidates', () => {
    it('filters by minFrequency and sorts descending', () => {
      const candidates: RuleCandidate[] = clustersToCandidates(
        [
          cluster({ id: 'a', value: 'alpha', count: 1 }),
          cluster({ id: 'b', value: 'bravo', count: 5 }),
          cluster({ id: 'c', value: 'charlie', count: 3 }),
        ],
        { minFrequency: 3 },
      );
      expect(candidates.map((c) => c.id)).toEqual([
        expect.stringContaining('bravo'),
        expect.stringContaining('charlie'),
      ]);
      // Sorted by frequency desc; tie-break on id.
      const [first, second] = candidates;
      expect(first!.frequency).toBeGreaterThanOrEqual(second!.frequency);
    });

    it('returns an empty list when nothing meets the threshold', () => {
      const candidates = clustersToCandidates([cluster({ count: 1 })], { minFrequency: 5 });
      expect(candidates).toEqual([]);
    });
  });
});
