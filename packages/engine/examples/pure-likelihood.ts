import { computeLikelihoodRatios, bayesianPosterior } from '@usebrick/engine/pure';

/** Combine caller-supplied calibration evidence without loading files. */
export function likelihoodExample(): number {
  const ruleId = 'ai/example';
  const ratios = computeLikelihoodRatios([ruleId], {
    [ruleId]: {
      recall: 0.8,
      fpRate: 0.1,
      ratio: 8,
      precision: 0.8,
      lastCalibratedAt: '2026-07-10T00:00:00.000Z',
      verdict: 'USEFUL',
    },
  }, { nPositive: 100, nNegative: 100 });
  return bayesianPosterior([ruleId], ratios);
}
