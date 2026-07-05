import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { TelemetryPayload } from '../engine/telemetry';
import type { ResearchMetrics } from '../types';

export interface FlywheelSummary {
  scanCount: number;
  firstRunAt: string | undefined;
  latestRunAt: string | undefined;
  averageSlopIndex: number;
  latestSlopIndex: number;
  averageAssemblyHealth: number;
  latestAssemblyHealth: number;
  topViolations: Array<{ ruleId: string; count: number }>;
  topFiles: Array<{ hash: string; averageScore: number; occurrences: number }>;
  research?: ResearchMetrics;
}

function average(values: number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((a, b) => a + b, 0) / values.length;
}

export function summarizeTelemetry(payloads: TelemetryPayload[]): FlywheelSummary {
  const sorted = [...payloads].sort(
    (a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime(),
  );

  const slopIndexes = sorted.map((p) => p.project.slopIndex);
  const assemblyHealths = sorted.map((p) => p.project.assemblyHealth);

  const violationCounts = new Map<string, number>();
  const fileScores = new Map<string, number[]>();
  const fileRuleIds = new Map<string, Set<string>>();

  for (const payload of sorted) {
    for (const violation of payload.violations) {
      violationCounts.set(violation.ruleId, (violationCounts.get(violation.ruleId) ?? 0) + violation.count);
    }

    for (const file of payload.files) {
      const existing = fileScores.get(file.hash);
      if (existing) {
        existing.push(file.score);
      } else {
        fileScores.set(file.hash, [file.score]);
      }

      const rules = fileRuleIds.get(file.hash) ?? new Set<string>();
      for (const ruleId of file.ruleIds) {
        rules.add(ruleId);
      }
      fileRuleIds.set(file.hash, rules);
    }
  }

  const topViolations = [...violationCounts.entries()]
    .map(([ruleId, count]) => ({ ruleId, count }))
    .sort((a, b) => b.count - a.count || a.ruleId.localeCompare(b.ruleId))
    .slice(0, 10);

  const topFiles = [...fileScores.entries()]
    .map(([hash, scores]) => ({
      hash,
      averageScore: average(scores),
      occurrences: scores.length,
    }))
    .sort((a, b) => b.averageScore - a.averageScore)
    .slice(0, 10);

  return {
    scanCount: sorted.length,
    firstRunAt: sorted[0]?.timestamp,
    latestRunAt: sorted[sorted.length - 1]?.timestamp,
    averageSlopIndex: average(slopIndexes),
    latestSlopIndex: slopIndexes[slopIndexes.length - 1] ?? 0,
    averageAssemblyHealth: average(assemblyHealths),
    latestAssemblyHealth: assemblyHealths[assemblyHealths.length - 1] ?? 0,
    topViolations,
    topFiles,
  };
}

/**
 * Load research/flywheel metrics from the flywheel directory. Tolerates
 * missing files (e.g. user hasn't run `research generate` yet) — returns
 * `undefined` when none of the expected artifacts are present.
 *
 * Expected layout (relative to `cwd`):
 *   .slopbrick/flywheel/analysis.json        (from `research analyze`)
 *   .slopbrick/flywheel/rule-candidates.json (from `research candidates`)
 */
export function loadResearchMetrics(cwd: string): ResearchMetrics | undefined {
  const flywheelDir = join(cwd, '.slopbrick', 'flywheel');
  const analysisPath = join(flywheelDir, 'analysis.json');
  const candidatesPath = join(flywheelDir, 'rule-candidates.json');

  const hasAnalysis = existsSync(analysisPath);
  const hasCandidates = existsSync(candidatesPath);
  if (!hasAnalysis && !hasCandidates) return undefined;

  // v0.42.0 (Tier-3 cleanup): the two try/catch blocks were
  // identical 8-line boilerplate. Replaced with safeReadJson
  // calls; both still silently tolerate corrupt JSON (pre-refactor
  // behavior).
  const generatedSampleCount = hasAnalysis
    ? safeReadJson(
        analysisPath,
        (parsed) => {
          const r = parsed as { summary?: { total?: number; coverage?: number } };
          return r.summary?.total ?? 0;
        },
        0,
      )
    : 0;
  const generatedRuleCoverage = hasAnalysis
    ? safeReadJson(
        analysisPath,
        (parsed) => {
          const r = parsed as { summary?: { total?: number; coverage?: number } };
          return r.summary?.coverage ?? 0;
        },
        0,
      )
    : 0;
  const candidateYield = hasCandidates
    ? safeReadJson(
        candidatesPath,
        (parsed) => {
          const r = parsed as { candidates?: unknown[] };
          return r.candidates?.length ?? 0;
        },
        0,
      )
    : 0;

  return {
    generatedSampleCount,
    generatedRuleCoverage,
    candidateYield,
    updatedAt: new Date().toISOString(),
  };
}

/**
 * Convenience: build a FlywheelSummary that includes research metrics when
 * available. The telemetry summary stays untouched — research is additive.
 */
export function summarizeTelemetryWithResearch(
  payloads: TelemetryPayload[],
  cwd: string,
): FlywheelSummary {
  const summary = summarizeTelemetry(payloads);
  const research = loadResearchMetrics(cwd);
  if (research) {
    summary.research = research;
  }
  return summary;
}

export function formatFlywheel(summary: FlywheelSummary, options: { json?: boolean } = {}): string {
  if (options.json) {
    return JSON.stringify(summary, null, 2);
  }

  const lines: string[] = [];
  lines.push(`Flywheel summary`);
  lines.push(`  Scans: ${summary.scanCount}`);
  if (summary.firstRunAt && summary.latestRunAt) {
    lines.push(`  Window: ${summary.firstRunAt} → ${summary.latestRunAt}`);
  }
  lines.push(`  Average slop index: ${summary.averageSlopIndex.toFixed(2)}`);
  lines.push(`  Latest slop index: ${summary.latestSlopIndex.toFixed(2)}`);
  lines.push(`  Average assembly health: ${summary.averageAssemblyHealth.toFixed(2)}`);
  lines.push(`  Latest assembly health: ${summary.latestAssemblyHealth.toFixed(2)}`);

  if (summary.topViolations.length > 0) {
    lines.push(`  Top violations:`);
    for (const { ruleId, count } of summary.topViolations) {
      lines.push(`    ${count}x ${ruleId}`);
    }
  }

  if (summary.topFiles.length > 0) {
    lines.push(`  Top files by average score:`);
    for (const { hash, averageScore, occurrences } of summary.topFiles) {
      lines.push(`    ${averageScore.toFixed(1)}  ${hash} (${occurrences} scan${occurrences === 1 ? '' : 's'})`);
    }
  }

  if (summary.research) {
    const r = summary.research;
    lines.push(`  Research pipeline:`);
    lines.push(`    Samples generated: ${r.generatedSampleCount}`);
    lines.push(`    AI-rule coverage: ${r.generatedRuleCoverage}%`);
    lines.push(`    Candidate rules yielded: ${r.candidateYield}`);
  }

  return lines.join('\n');
}

/**
 * v0.42.0 (Tier-3 cleanup): local helper to deduplicate the
 * "try read + parse JSON + ignore on error" pattern that appeared
 * twice in loadResearchMetrics. Originally the same 8-line block
 * was repeated for `.slopbrick/flywheel/analysis.json` and
 * `rule-candidates.json`; the dup/identical-block rule fired
 * 8 times during self-scan.
 *
 * Not exported — this is flywheel-internal. Live JSON-shape errors
 * (corrupted file, missing fields) are silently absorbed and the
 * caller's `default` is returned; that's the pre-refactor behavior
 * preserved by this extraction.
 */
function safeReadJson<T>(
  path: string,
  extract: (parsed: unknown) => T,
  fallback: T,
): T {
  try {
    const parsed = JSON.parse(readFileSync(path, 'utf8')) as unknown;
    return extract(parsed);
  } catch {
    // Pre-refactor: silent ignore on JSON parse / read errors.
    return fallback;
  }
}
