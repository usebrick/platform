import { describe, it, expect } from 'vitest';
import { formatPretty } from '../../src/report/pretty';
import { formatHtml } from '../../src/report/html';
import type { ProjectReport } from '../../src/types';

function makeReport(overrides: Partial<ProjectReport> = {}): ProjectReport {
  return {
    version: '0.6.0',
    generatedAt: '2026-06-22T00:00:00.000Z',
    aiQuality: 30, engineeringHygiene: 30, security: 30, repositoryHealth: 30,
    assemblyHealth: 70,
    totalScore: 0,
    categoryScores: { visual: 0, typo: 0, wcag: 0, layout: 0, component: 0, logic: 0, arch: 0, perf: 0, security: 0, test: 0, docs: 0, db: 0, ai: 0, context: 0, product: 0, i18n: 0 },
    boundaryScore: 0,
    contextScore: 0,
    visualScore: 0,
    subscores: {},
    p90Score: 0,
    peakScore: 0,
    componentCount: 0,
    fileCount: 0,
    components: [],
    issues: [],
    thresholds: { meanSlop: 15, p90Slop: 30, individualSlopThreshold: 60 },
    topOffenders: [
      { filePath: 'src/Card.tsx', adjustedScore: 87.5, issueCount: 12 },
      { filePath: 'src/Modal.tsx', adjustedScore: 62.3, issueCount: 8 },
      { filePath: 'src/Hero.tsx', adjustedScore: 41.0, issueCount: 5 },
    ],
    ...overrides,
  };
}

describe('topOffenders rendering', () => {
  it('formatPretty renders top 5 offenders with adjusted score + issue count', () => {
    const out = formatPretty(makeReport());
    expect(out).toContain('Top offending components (by adjusted score)');
    expect(out).toContain('src/Card.tsx');
    expect(out).toContain('src/Modal.tsx');
    expect(out).toContain('src/Hero.tsx');
    expect(out).toContain('87.5');
    expect(out).toContain('62.3');
    expect(out).toContain('41.0');
    expect(out).toContain('12 issues');
    expect(out).toContain('8 issues');
  });

  it('formatPretty pluralizes correctly (1 issue vs N issues)', () => {
    const out = formatPretty(
      makeReport({
        topOffenders: [{ filePath: 'src/X.tsx', adjustedScore: 10, issueCount: 1 }],
      }),
    );
    expect(out).toContain('1 issue ');
    expect(out).not.toContain('1 issues');
  });

  it('formatPretty omits section when topOffenders absent', () => {
    const out = formatPretty(makeReport({ topOffenders: undefined }));
    expect(out).not.toContain('Top offending components');
  });

  it('formatHtml renders top offenders in a dedicated section', () => {
    const out = formatHtml(makeReport());
    expect(out).toContain('top-offenders-section');
    expect(out).toContain('src/Card.tsx');
    expect(out).toContain('87.5');
    expect(out).toContain('12');
  });

  it('formatHtml omits top offenders section when absent', () => {
    const out = formatHtml(makeReport({ topOffenders: undefined }));
    expect(out).not.toContain('top-offenders-section');
  });
});