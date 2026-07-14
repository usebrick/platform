import { describe, expect, it } from 'vitest';

import { formatJson } from '../../src/report/json';
import { formatScoreExplanation } from '../../src/report/score-explanation';
import type { ProjectReport } from '../../src/types';

const report = {
  version: '0.44.0',
  generatedAt: '2026-07-10T00:00:00.000Z',
  aiSlopScore: 20,
  engineeringHygiene: 80,
  security: 90,
  repositoryHealth: 82,
  assemblyHealth: 80,
  totalScore: 20,
  categoryScores: { arch: 6, logic: 3, layout: 0, visual: 0, component: 0, test: 0, typo: 0, wcag: 0, perf: 0, security: 0, docs: 0, db: 0, ai: 0, context: 0, product: 0, i18n: 0 },
  boundaryScore: 80,
  contextScore: 90,
  visualScore: 95,
  p90Score: 0,
  peakScore: 0,
  componentCount: 1,
  fileCount: 1,
  components: [],
  issues: [],
  thresholds: { meanSlop: 30, p90Slop: 30, individualSlopThreshold: 60 },
  scoreBasis: { denominator: 1, analyzedFiles: 1, issueSet: 'effective', suppressedIssueCount: 2, parseErrorCount: 0 },
  scoreExplanation: {
    kind: 'deterministic-headline-score-explanation-v1',
    attribution: 'No per-rule or Bayesian attribution is claimed; this explains deterministic aggregate inputs only.',
    directions: { aiSlopScore: 'lower-is-better', engineeringHygiene: 'higher-is-better', security: 'higher-is-better', repositoryHealth: 'higher-is-better' },
    scoreBasis: { denominator: 1, analyzedFiles: 1, issueSet: 'effective', suppressedIssueCount: 2, parseErrorCount: 0 },
    categoryBurden: { direction: 'higher-is-worse', note: 'Category burden is a diagnostic over the effective finding set; it is not per-rule score attribution.' },
    aiSlopScore: { value: 20, buckets: [{ bucket: 'boundary', rawSlopAmount: 20, weight: 0.4, weightedAmount: 8 }, { bucket: 'context', rawSlopAmount: 20, weight: 0.35, weightedAmount: 7 }, { bucket: 'visual', rawSlopAmount: 20, weight: 0.25, weightedAmount: 5 }] },
    engineeringHygiene: { value: 80, categories: [{ category: 'arch', burden: 6, deduction: 1 }, { category: 'logic', burden: 3, deduction: 0.5 }, { category: 'layout', burden: 0, deduction: 0 }, { category: 'visual', burden: 0, deduction: 0 }, { category: 'component', burden: 0, deduction: 0 }, { category: 'test', burden: 0, deduction: 0 }] },
    security: { value: 90, findingCount: 1, formula: '100 / (1 + securityFindingCount / 5)' },
    repositoryHealth: { value: 82, inputs: [{ axis: 'aiSlopCleanliness', value: 80, weight: 0.4, weightedAmount: 32 }, { axis: 'engineeringHygiene', value: 80, weight: 0.3, weightedAmount: 24 }, { axis: 'security', value: 90, weight: 0.2, weightedAmount: 18 }, { axis: 'testQuality', value: 80, weight: 0.1, weightedAmount: 8 }] },
  },
} as ProjectReport;

describe('score explanation output', () => {
  it('renders only deterministic aggregate inputs and directions', () => {
    const output = formatScoreExplanation(report);
    expect(output).toContain('AI Slop Score: 20.0/100 (lower is better)');
    expect(output).toContain('boundary');
    expect(output).toContain('Repository Health: 82.0/100 (higher is better;');
    expect(output).toContain('1 successfully analysed file');
    expect(output).toContain('No per-rule or Bayesian attribution');
    expect(output).not.toContain('ruleId');
  });

  it('keeps the explanation out of ordinary JSON but includes it when explicitly requested', () => {
    expect(JSON.parse(formatJson(report))).not.toHaveProperty('scoreExplanation');
    expect(JSON.parse(formatJson(report, { includeScoreExplanation: true }))).toMatchObject({
      scoreExplanation: { kind: 'deterministic-headline-score-explanation-v1' },
    });
  });
});
