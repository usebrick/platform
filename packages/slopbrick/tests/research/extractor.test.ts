import { describe, expect, it } from 'vitest';
import {
  cluster,
  extractAndCluster,
  extractFromAnalysis,
  extractFromScan,
  type Fingerprint,
  type FingerprintCluster,
} from '../../src/research/extractor';
import type { AnalysisResult } from '../../src/research/analyzer';
import type { FileScanResult } from '../../src/types';

function scanResult(overrides: Partial<FileScanResult> = {}): FileScanResult {
  return {
    filePath: '/samples/a.tsx',
    componentCount: 1,
    issues: [],
    gapValues: [],
    styleSources: [],
    elementTags: [],
    unmatchedStringLiterals: [],
    ...overrides,
  };
}

function analysis(
  covered: boolean,
  scan: FileScanResult,
  filePath = scan.filePath,
): AnalysisResult {
  return {
    sample: {
      filePath,
      framework: 'react',
      componentType: 'landing-page',
      provider: 'openai',
      timestamp: '2026-06-21T00:00:00Z',
    },
    issues: [],
    ruleIds: [],
    aiSpecificRuleIds: covered ? ['visual/ai-default-palette'] : [],
    covered,
    scan,
  };
}

describe('extractor', () => {
  describe('extractFromScan', () => {
    it('emits one fingerprint per element tag', () => {
      const result = scanResult({ elementTags: ['div', 'section', 'div', 'button'] });
      const fps = extractFromScan(result);
      const divs = fps.filter((f) => f.value === 'div');
      expect(divs).toHaveLength(2);
      expect(divs[0].kind).toBe('jsx-element');
      expect(divs[0].id).toBe('jsx-element:div');
    });

    it('emits gap-value fingerprints for raw spacing/sizing tokens', () => {
      const result = scanResult({ gapValues: ['w-[137px]', 'w-[137px]', 'mt-[42px]'] });
      const fps = extractFromScan(result);
      const ids = fps.map((f) => f.id).sort();
      expect(ids).toEqual([
        'gap-value:mt-[42px]',
        'gap-value:w-[137px]',
        'gap-value:w-[137px]',
      ]);
    });

    it('skips unmatched literals shorter than 4 chars', () => {
      const result = scanResult({
        unmatchedStringLiterals: ['hi', 'ok', 'lorem ipsum dolor', ''],
      });
      const fps = extractFromScan(result);
      expect(fps).toHaveLength(1);
      expect(fps[0].value).toBe('lorem ipsum dolor');
    });

    it('emits style-source fingerprints', () => {
      const result = scanResult({ styleSources: ['inline', 'inline', 'css-module'] });
      const fps = extractFromScan(result);
      const inline = fps.filter((f) => f.value === 'inline');
      expect(inline).toHaveLength(2);
    });

    it('ignores missing or empty fields gracefully', () => {
      const fps = extractFromScan(scanResult());
      expect(fps).toEqual([]);
    });
  });

  describe('extractFromAnalysis', () => {
    it('skips samples that were covered by AI-specific rules', () => {
      const scans = [
        analysis(true, scanResult({ filePath: '/a.tsx', elementTags: ['div'] })),
        analysis(false, scanResult({ filePath: '/b.tsx', elementTags: ['section'] })),
      ];
      const fps = extractFromAnalysis(scans);
      const values = fps.map((f) => f.value);
      expect(values).toEqual(['section']);
    });

    it('includes covered samples when includeCovered is true', () => {
      const scans = [
        analysis(true, scanResult({ filePath: '/a.tsx', elementTags: ['div'] })),
        analysis(false, scanResult({ filePath: '/b.tsx', elementTags: ['section'] })),
      ];
      const fps = extractFromAnalysis(scans, { includeCovered: true });
      const values = fps.map((f) => f.value).sort();
      expect(values).toEqual(['div', 'section']);
    });
  });

  describe('cluster', () => {
    it('groups identical fingerprints and counts them', () => {
      const fps: Fingerprint[] = [
        {
          id: 'jsx-element:div',
          kind: 'jsx-element',
          value: 'div',
          sample: { filePath: '/a.tsx', line: 0, column: 0 },
        },
        {
          id: 'jsx-element:div',
          kind: 'jsx-element',
          value: 'div',
          sample: { filePath: '/b.tsx', line: 0, column: 0 },
        },
        {
          id: 'jsx-element:span',
          kind: 'jsx-element',
          value: 'span',
          sample: { filePath: '/a.tsx', line: 0, column: 0 },
        },
      ];
      const clusters = cluster(fps);
      expect(clusters).toHaveLength(2);
      expect(clusters[0]).toMatchObject({ id: 'jsx-element:div', count: 2 });
      expect(clusters[0].samples.map((s) => s.filePath)).toEqual(['/a.tsx', '/b.tsx']);
      expect(clusters[1]).toMatchObject({ id: 'jsx-element:span', count: 1 });
    });

    it('sorts by descending count then by id', () => {
      const fps: Fingerprint[] = [
        {
          id: 'b',
          kind: 'jsx-element',
          value: 'b',
          sample: { filePath: '/a.tsx', line: 0, column: 0 },
        },
        {
          id: 'a',
          kind: 'jsx-element',
          value: 'a',
          sample: { filePath: '/a.tsx', line: 0, column: 0 },
        },
        {
          id: 'a',
          kind: 'jsx-element',
          value: 'a',
          sample: { filePath: '/b.tsx', line: 0, column: 0 },
        },
      ];
      const clusters: FingerprintCluster[] = cluster(fps);
      expect(clusters.map((c) => c.id)).toEqual(['a', 'b']);
    });
  });

  describe('extractAndCluster', () => {
    it('returns total fingerprint count plus filtered clusters', () => {
      const scans = [
        analysis(false, scanResult({ filePath: '/a.tsx', elementTags: ['div', 'div'] })),
        analysis(false, scanResult({ filePath: '/b.tsx', elementTags: ['div', 'section'] })),
      ];
      const result = extractAndCluster(scans, { minCount: 2 });
      expect(result.total).toBe(4);
      expect(result.clusters).toHaveLength(1);
      expect(result.clusters[0]).toMatchObject({ id: 'jsx-element:div', count: 3 });
    });

    it('respects minCount to drop singletons', () => {
      const scans = [
        analysis(false, scanResult({ filePath: '/a.tsx', elementTags: ['div'] })),
        analysis(false, scanResult({ filePath: '/b.tsx', elementTags: ['section'] })),
      ];
      const result = extractAndCluster(scans, { minCount: 2 });
      expect(result.total).toBe(2);
      expect(result.clusters).toEqual([]);
    });
  });
});
