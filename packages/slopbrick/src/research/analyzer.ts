import { scanFile } from '../engine/worker';
import type { FileScanResult, Issue, ResolvedConfig } from '../types';
import type { GeneratedSample } from './generator';

export interface AnalysisResult {
  sample: GeneratedSample;
  issues: Issue[];
  ruleIds: string[];
  aiSpecificRuleIds: string[];
  covered: boolean;
  /**
   * Underlying scan result — kept so downstream pipelines (extractor, ML
   * feature extraction) can use the raw facts without re-scanning the file.
   */
  scan: FileScanResult;
}

export interface BatchAnalysis {
  samples: AnalysisResult[];
  summary: {
    total: number;
    covered: number;
    coverage: number;
    ruleFrequency: Record<string, number>;
    aiSpecificRuleFrequency: Record<string, number>;
  };
}

export async function analyzeSample(
  sample: GeneratedSample,
  config: ResolvedConfig,
): Promise<AnalysisResult> {
  const result = await scanFile(sample.filePath, config);
  const ruleIds = [...new Set(result.issues.map((issue) => issue.ruleId))];
  const aiSpecificRuleIds = [
    ...new Set(result.issues.filter((issue) => issue.aiSpecific).map((issue) => issue.ruleId)),
  ];
  return {
    sample,
    issues: result.issues,
    ruleIds,
    aiSpecificRuleIds,
    covered: aiSpecificRuleIds.length > 0,
    scan: result,
  };
}

export async function analyzeSamples(
  samples: GeneratedSample[],
  config: ResolvedConfig,
): Promise<BatchAnalysis> {
  const results = await Promise.all(samples.map((sample) => analyzeSample(sample, config)));

  const ruleFrequency: Record<string, number> = {};
  const aiSpecificRuleFrequency: Record<string, number> = {};

  for (const result of results) {
    for (const ruleId of result.ruleIds) {
      ruleFrequency[ruleId] = (ruleFrequency[ruleId] ?? 0) + 1;
    }
    for (const ruleId of result.aiSpecificRuleIds) {
      aiSpecificRuleFrequency[ruleId] = (aiSpecificRuleFrequency[ruleId] ?? 0) + 1;
    }
  }

  const total = results.length;
  const covered = results.filter((r) => r.covered).length;
  const coverage = total === 0 ? 0 : Math.round((covered / total) * 100);

  return {
    samples: results,
    summary: {
      total,
      covered,
      coverage,
      ruleFrequency,
      aiSpecificRuleFrequency,
    },
  };
}
