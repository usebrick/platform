import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import type {
  AutoTunedRule,
  FlywheelOutput,
  FlywheelState,
  Issue,
  ResearchMetrics,
  ResolvedConfig,
  Rule,
  RuleSuggestion,
  Severity,
  SlopAuditRun,
} from '../types';

const FLYWHEEL_DIR = '.slopbrick/flywheel';
const STATE_FILE = 'auto-tuned.json';
const CONSECUTIVE_THRESHOLD = 3;

export const FLYWHEEL_VERSION = '2';

export function severityBump(severity: Severity): Severity {
  const order: Severity[] = ['low', 'medium', 'high'];
  const idx = order.indexOf(severity);
  return order[Math.min(idx + 1, order.length - 1)]!;
}

export function resolveEffectiveSeverity(
  override: ResolvedConfig['rules'][string],
  defaultSeverity: Severity,
): Severity {
  if (override === undefined || override === 'off' || override === 'auto') {
    return defaultSeverity;
  }
  return override;
}

function countConsecutiveTopOffenses(
  runs: SlopAuditRun[],
  ruleId: string,
): number {
  let count = 0;
  for (let i = runs.length - 1; i >= 0; i--) {
    if (runs[i]!.topOffenseIds.includes(ruleId)) {
      count++;
    } else {
      break;
    }
  }
  return count;
}

function countConsecutiveTopFileAppearances(
  currentHash: string,
  recentTopHashes: string[][],
): number {
  let consecutive = 1; // current run
  for (let i = recentTopHashes.length - 1; i >= 0; i--) {
    if (recentTopHashes[i]!.includes(currentHash)) {
      consecutive++;
    } else {
      break;
    }
  }
  return consecutive;
}

export function computeFlywheelOutput(
  runs: SlopAuditRun[],
  currentTopFiles: { filePath: string; hash: string }[],
  recentTopHashes: string[][],
  unmatchedStringLiterals: string[],
  config: ResolvedConfig,
  rules: Rule[],
): FlywheelOutput {
  const autoTuned: AutoTunedRule[] = [];
  const hotspotIssues: Issue[] = [];
  const suggestions: RuleSuggestion[] = [];
  const ruleById = new Map(rules.map((r) => [r.id, r]));

  if (runs.length >= CONSECUTIVE_THRESHOLD) {
    const allRuleIds = new Set(runs.slice(-CONSECUTIVE_THRESHOLD).flatMap((r) => r.topOffenseIds));
    for (const ruleId of allRuleIds) {
      if (countConsecutiveTopOffenses(runs, ruleId) >= CONSECUTIVE_THRESHOLD) {
        const rule = ruleById.get(ruleId);
        const currentSeverity = resolveEffectiveSeverity(
          config.rules[ruleId]!,
          rule?.severity ?? 'medium',
        );
        autoTuned.push({
          ruleId,
          severity: severityBump(currentSeverity),
          reason: `In top-3 offenses for ${CONSECUTIVE_THRESHOLD} consecutive scans`,
        });
      }
    }
  }

  if (currentTopFiles.length > 0 && runs.length >= CONSECUTIVE_THRESHOLD) {
    for (const file of currentTopFiles) {
      const consecutive = countConsecutiveTopFileAppearances(file.hash, recentTopHashes);
      if (consecutive >= CONSECUTIVE_THRESHOLD) {
        hotspotIssues.push({
          ruleId: 'component/chronic-offender',
          category: 'component',
          severity: 'low',
          aiSpecific: false,
          message: `File has been in the top slop files for ${consecutive} consecutive scans`,
          filePath: file.filePath,
          line: 1,
          column: 1,
          advice: 'Prioritize refactoring this file or add it to the baseline.',
        });
      }
    }
  }

  // Simple suggestion heuristic: repeated string literals that look like placeholder copy.
  const literalCounts = new Map<string, number>();
  for (const literal of unmatchedStringLiterals) {
    const normalized = literal.toLowerCase().trim();
    if (normalized.length < 10) continue;
    literalCounts.set(normalized, (literalCounts.get(normalized) ?? 0) + 1);
  }
  for (const [literal, count] of literalCounts) {
    if (count >= 2) {
      suggestions.push({
        pattern: literal,
        example: unmatchedStringLiterals.find((l) => l.toLowerCase().trim() === literal) ?? literal,
        count,
        suggestedRuleId: 'typo/placeholder-text',
      });
    }
  }

  return { autoTuned, hotspotIssues, suggestions };
}

export function migrateFlywheelState(state: Partial<FlywheelState>): FlywheelState {
  return {
    version: FLYWHEEL_VERSION,
    updatedAt: state.updatedAt ?? new Date().toISOString(),
    autoTuned: state.autoTuned ?? [],
    research: state.research,
  };
}

export function loadFlywheelState(cwd: string): FlywheelState {
  const path = join(cwd, FLYWHEEL_DIR, STATE_FILE);
  if (!existsSync(path)) {
    return migrateFlywheelState({});
  }
  try {
    const parsed = JSON.parse(readFileSync(path, 'utf-8')) as Partial<FlywheelState>;
    return migrateFlywheelState(parsed);
  } catch {
    return migrateFlywheelState({});
  }
}

/**
 * Read research/corpus-analysis artifacts from the flywheel directory and
 * build a ResearchMetrics snapshot. Returns undefined when nothing is on
 * disk so callers can distinguish "no research yet" from "research ran but
 * found 0".
 */
export function loadResearchMetricsFromDisk(cwd: string): ResearchMetrics | undefined {
  const flywheelDir = join(cwd, FLYWHEEL_DIR);
  const analysisPath = join(flywheelDir, 'analysis.json');
  const candidatesPath = join(flywheelDir, 'rule-candidates.json');

  const hasAnalysis = existsSync(analysisPath);
  const hasCandidates = existsSync(candidatesPath);
  if (!hasAnalysis && !hasCandidates) return undefined;

  let generatedSampleCount = 0;
  let generatedRuleCoverage = 0;
  let candidateYield = 0;

  if (hasAnalysis) {
    try {
      const raw = JSON.parse(readFileSync(analysisPath, 'utf8')) as {
        summary?: { total?: number; coverage?: number };
      };
      generatedSampleCount = raw.summary?.total ?? 0;
      generatedRuleCoverage = raw.summary?.coverage ?? 0;
    } catch {
      // Corrupt analysis.json — ignore; don't poison the rest.
    }
  }

  if (hasCandidates) {
    try {
      const raw = JSON.parse(readFileSync(candidatesPath, 'utf8')) as {
        candidates?: unknown[];
      };
      candidateYield = raw.candidates?.length ?? 0;
    } catch {
      // Ignore.
    }
  }

  return {
    generatedSampleCount,
    generatedRuleCoverage,
    candidateYield,
    updatedAt: new Date().toISOString(),
  };
}

export function saveFlywheelState(cwd: string, state: FlywheelState): void {
  const dir = join(cwd, FLYWHEEL_DIR);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, STATE_FILE), JSON.stringify(state, null, 2));
}

export function hashFile(filePath: string): string {
  return createHash('sha256').update(filePath).digest('hex').slice(0, 16);
}
