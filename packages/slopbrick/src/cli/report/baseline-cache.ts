// Baseline cache builder.
//
// Pure helper extracted from `cli/scan.ts` (was `buildBaselineCache`).
// Constructs the `BaselineCache` that the engine writes to disk and
// re-loads on subsequent runs to detect regressions.
//
// No I/O — takes the in-memory `ProjectReport` and returns a fresh
// `BaselineCache` object the caller can persist.

import { relative } from 'node:path';

import { VERSION, type ProjectReport, type BaselineCache } from '../../types';

export function buildBaselineCache(
  report: ProjectReport,
  configHash: string,
  gitHead: string,
  cwd: string,
): BaselineCache {
  const scores: BaselineCache['scores'] = {};
  for (const component of report.components) {
    scores[relative(cwd, component.filePath)] = {
      baselineScore: component.componentScore,
      componentCount: component.componentCount,
    };
  }
  return {
    version: VERSION,
    config_hash: configHash,
    git_head: gitHead,
    baseline_created: new Date().toISOString(),
    baseline_revision: 1,
    totalComponentCount: report.componentCount,
    scores,
  };
}
